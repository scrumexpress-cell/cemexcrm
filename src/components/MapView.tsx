import { useEffect, useMemo, useRef, useState } from "react";
import mapboxgl, { type Map as MapboxMap, type Marker, type Popup } from "mapbox-gl";
import { renderToStaticMarkup } from "react-dom/server";
import { getMapboxToken } from "@/lib/mapbox-token";
import { ESTATUS_COLOR, ESTATUS_LABEL, ESTATUS_ICON } from "@/lib/sitio-utils";
import { PLANTAS_CEMEX } from "@/lib/cemex-plantas";
import { Factory, Box, Flame, Clock } from "lucide-react";
import type { Sitio } from "@/integrations/supabase/client";

export type MapSitio = Sitio & {
  vendedor?: { nombre: string | null; email: string | null } | null;
};

interface Props {
  sitios: MapSitio[];
  onPinClick?: (sitio: MapSitio) => void;
  onMapClick?: (lng: number, lat: number) => void;
  center?: [number, number];
  zoom?: number;
  className?: string;
  draggableMarker?: { lng: number; lat: number };
  onMarkerDrag?: (lng: number, lat: number) => void;
  currentUserId?: string | null;
}

const GDL: [number, number] = [-103.3496, 20.6597];

type StyleKey = "streets" | "satellite" | "dark";
const STYLES: Record<StyleKey, string> = {
  streets: "mapbox://styles/mapbox/streets-v12",
  satellite: "mapbox://styles/mapbox/satellite-streets-v12",
  dark: "mapbox://styles/mapbox/dark-v11",
};

export function MapView({
  sitios,
  onPinClick,
  onMapClick,
  center = GDL,
  zoom = 11,
  className,
  draggableMarker,
  onMarkerDrag,
  currentUserId,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const plantMarkersRef = useRef<Marker[]>([]);
  const draggableMarkerRef = useRef<Marker | null>(null);
  const popupRef = useRef<Popup | null>(null);
  const onMapClickRef = useRef(onMapClick);
  const onPinClickRef = useRef(onPinClick);
  const onMarkerDragRef = useRef(onMarkerDrag);

  const [token, setToken] = useState<string | null>(null);
  const [tokenMissing, setTokenMissing] = useState(false);
  const [styleKey, setStyleKey] = useState<StyleKey>("streets");
  const [is3D, setIs3D] = useState(false);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [showIsochrones, setShowIsochrones] = useState(false);
  const [styleLoaded, setStyleLoaded] = useState(0);

  // Keep callback refs up to date without re-creating map
  useEffect(() => {
    onMapClickRef.current = onMapClick;
    onPinClickRef.current = onPinClick;
    onMarkerDragRef.current = onMarkerDrag;
  });

  useEffect(() => {
    const saved = getMapboxToken();
    setToken(saved);
    setTokenMissing(!saved);
  }, []);

  // Initialize map once
  useEffect(() => {
    if (!token || !containerRef.current || mapRef.current) return;
    mapboxgl.accessToken = token;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: STYLES[styleKey],
      center,
      zoom,
      attributionControl: false,
    });
    map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), "top-right");
    map.touchZoomRotate.enable();
    map.touchPitch.enable();

    map.on("style.load", () => {
      setStyleLoaded((v) => v + 1);
    });

    // Silenciar advertencias de íconos faltantes en el sprite del estilo
    map.on("styleimagemissing", (e) => {
      const id = (e as unknown as { id: string }).id;
      if (!map.hasImage(id)) {
        const empty = { width: 1, height: 1, data: new Uint8Array(4) };
        try {
          map.addImage(id, empty as unknown as ImageData);
        } catch {
          /* noop */
        }
      }
    });

    // Forzar resize después de montar (el contenedor flex puede tener 0px al inicio)
    const ro = new ResizeObserver(() => {
      map.resize();
    });
    if (containerRef.current) ro.observe(containerRef.current);
    setTimeout(() => map.resize(), 0);
    setTimeout(() => map.resize(), 200);

    map.on("click", (e) => {
      // Ignore clicks on markers (handled separately)
      const target = e.originalEvent.target as HTMLElement | null;
      if (target?.closest(".mapboxgl-marker")) return;
      onMapClickRef.current?.(e.lngLat.lng, e.lngLat.lat);
    });

    mapRef.current = map;
    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Style change
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.setStyle(STYLES[styleKey]);
  }, [styleKey]);

  // Apply 3D terrain + buildings on style load
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleLoaded) return;

    if (is3D) {
      if (!map.getSource("mapbox-dem")) {
        map.addSource("mapbox-dem", {
          type: "raster-dem",
          url: "mapbox://mapbox.mapbox-terrain-dem-v1",
          tileSize: 512,
          maxzoom: 14,
        });
      }
      map.setTerrain({ source: "mapbox-dem", exaggeration: 1.5 });
      map.easeTo({ pitch: 60, bearing: -20, duration: 800 });

      // 3D buildings layer (only on streets/dark styles)
      if (styleKey !== "satellite" && !map.getLayer("3d-buildings")) {
        const layers = map.getStyle().layers;
        const labelLayer = layers?.find(
          (l) => l.type === "symbol" && (l.layout as Record<string, unknown> | undefined)?.["text-field"],
        );
        try {
          map.addLayer(
            {
              id: "3d-buildings",
              source: "composite",
              "source-layer": "building",
              filter: ["==", "extrude", "true"],
              type: "fill-extrusion",
              minzoom: 14,
              paint: {
                "fill-extrusion-color": "#aaa",
                "fill-extrusion-height": [
                  "interpolate", ["linear"], ["zoom"],
                  14, 0, 15.05, ["get", "height"],
                ],
                "fill-extrusion-base": [
                  "interpolate", ["linear"], ["zoom"],
                  14, 0, 15.05, ["get", "min_height"],
                ],
                "fill-extrusion-opacity": 0.7,
              },
            },
            labelLayer?.id,
          );
        } catch {
          // some styles don't expose composite source
        }
      }
    } else {
      map.setTerrain(null);
      map.easeTo({ pitch: 0, bearing: 0, duration: 600 });
      if (map.getLayer("3d-buildings")) map.removeLayer("3d-buildings");
    }
  }, [is3D, styleLoaded, styleKey]);

  // Render sitio markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    // Clear previous
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    sitios.forEach((s) => {
      const isMine = currentUserId != null && s.vendedor_id === currentUserId;
      const color = ESTATUS_COLOR[s.estatus] ?? "#888";
      const Icon = ESTATUS_ICON[s.estatus];
      const iconHtml = renderToStaticMarkup(
        <Icon
          color="white"
          size={isMine ? 14 : 12}
          strokeWidth={2.5}
        />,
      );

      const el = document.createElement("button");
      el.type = "button";
      el.setAttribute("aria-label", s.nombre_referencia ?? "Sitio");
      el.style.cssText = `
        width:${isMine ? 28 : 24}px;
        height:${isMine ? 28 : 24}px;
        border-radius:9999px;
        background:${color};
        border:${isMine ? "3px solid hsl(var(--accent, 38 92% 50%))" : "2px solid white"};
        box-shadow:0 2px 6px rgba(0,0,0,0.3);
        display:flex;align-items:center;justify-content:center;
        cursor:pointer;padding:0;
        ${isMine ? "outline: 2px solid rgba(245,158,11,0.4); outline-offset: 1px;" : ""}
      `;
      el.innerHTML = iconHtml;
      el.addEventListener("click", (ev) => {
        ev.stopPropagation();
        onPinClickRef.current?.(s);
      });

      // Hover popup
      el.addEventListener("mouseenter", () => {
        if (popupRef.current) popupRef.current.remove();
        const popup = new mapboxgl.Popup({
          closeButton: false,
          closeOnClick: false,
          offset: 16,
          className: "cemex-popup",
        })
          .setLngLat([s.lng, s.lat])
          .setHTML(buildPopupHTML(s, isMine))
          .addTo(map);
        popupRef.current = popup;
      });
      el.addEventListener("mouseleave", () => {
        if (popupRef.current) {
          popupRef.current.remove();
          popupRef.current = null;
        }
      });

      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([s.lng, s.lat])
        .addTo(map);
      markersRef.current.push(marker);
    });
  }, [sitios, currentUserId, styleLoaded]);

  // Plant markers (always visible)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    plantMarkersRef.current.forEach((m) => m.remove());
    plantMarkersRef.current = [];

    PLANTAS_CEMEX.forEach((p) => {
      const el = document.createElement("div");
      el.style.cssText = `
        width:32px;height:32px;border-radius:8px;
        background:#1F2A93;border:2px solid white;
        box-shadow:0 3px 8px rgba(0,0,0,0.4);
        display:flex;align-items:center;justify-content:center;
        cursor:pointer;
      `;
      el.innerHTML = renderToStaticMarkup(
        <Factory color="white" size={18} strokeWidth={2.5} />,
      );
      el.title = p.nombre;
      el.addEventListener("click", (ev) => {
        ev.stopPropagation();
        new mapboxgl.Popup({ offset: 18 })
          .setLngLat([p.lng, p.lat])
          .setHTML(
            `<div style="padding:4px 6px;font-weight:600;font-size:13px">${p.nombre}</div>
             <div style="padding:0 6px 4px;font-size:11px;color:#666">Planta CEMEX</div>`,
          )
          .addTo(map);
      });
      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([p.lng, p.lat])
        .addTo(map);
      plantMarkersRef.current.push(marker);
    });
  }, [styleLoaded]);

  // Heatmap layer
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleLoaded) return;
    const SOURCE = "sitios-heat";
    const LAYER = "sitios-heat-layer";

    const features = sitios.map((s) => ({
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: [s.lng, s.lat] },
      properties: { volumen: s.volumen_m3 ?? 100 },
    }));

    if (map.getLayer(LAYER)) map.removeLayer(LAYER);
    if (map.getSource(SOURCE)) map.removeSource(SOURCE);

    if (showHeatmap && features.length > 0) {
      map.addSource(SOURCE, {
        type: "geojson",
        data: { type: "FeatureCollection", features },
      });
      map.addLayer({
        id: LAYER,
        type: "heatmap",
        source: SOURCE,
        maxzoom: 16,
        paint: {
          "heatmap-weight": [
            "interpolate", ["linear"], ["get", "volumen"],
            0, 0.1, 5000, 1,
          ],
          "heatmap-intensity": [
            "interpolate", ["linear"], ["zoom"],
            0, 1, 16, 3,
          ],
          "heatmap-color": [
            "interpolate", ["linear"], ["heatmap-density"],
            0, "rgba(31,42,147,0)",
            0.2, "rgba(31,42,147,0.4)",
            0.5, "rgba(225,37,27,0.6)",
            0.8, "rgba(245,158,11,0.8)",
            1, "rgba(255,255,0,0.9)",
          ],
          "heatmap-radius": [
            "interpolate", ["linear"], ["zoom"],
            0, 4, 16, 60,
          ],
          "heatmap-opacity": 0.75,
        },
      });
    }
  }, [showHeatmap, sitios, styleLoaded]);

  // Isochrones from CEMEX plants (15/30/45 min driving)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleLoaded || !token) return;

    const SOURCE = "isochrones";
    const FILL = "isochrones-fill";
    const LINE = "isochrones-line";

    if (map.getLayer(FILL)) map.removeLayer(FILL);
    if (map.getLayer(LINE)) map.removeLayer(LINE);
    if (map.getSource(SOURCE)) map.removeSource(SOURCE);

    if (!showIsochrones) return;

    let cancelled = false;
    (async () => {
      try {
        const all: GeoJSON.Feature[] = [];
        for (const p of PLANTAS_CEMEX) {
          const url = `https://api.mapbox.com/isochrone/v1/mapbox/driving/${p.lng},${p.lat}?contours_minutes=15,30,45&polygons=true&access_token=${token}`;
          const res = await fetch(url);
          if (!res.ok) continue;
          const data = await res.json();
          (data.features as GeoJSON.Feature[] | undefined)?.forEach((f) => {
            f.properties = { ...f.properties, plantaId: p.id, plantaNombre: p.nombre };
            all.push(f);
          });
        }
        if (cancelled || !mapRef.current) return;
        // Sort largest first so smaller isochrones render on top
        all.sort((a, b) => {
          const am = (a.properties as { contour?: number } | null)?.contour ?? 0;
          const bm = (b.properties as { contour?: number } | null)?.contour ?? 0;
          return bm - am;
        });

        if (map.getLayer(FILL)) map.removeLayer(FILL);
        if (map.getLayer(LINE)) map.removeLayer(LINE);
        if (map.getSource(SOURCE)) map.removeSource(SOURCE);

        map.addSource(SOURCE, {
          type: "geojson",
          data: { type: "FeatureCollection", features: all },
        });
        map.addLayer({
          id: FILL,
          type: "fill",
          source: SOURCE,
          paint: {
            "fill-color": [
              "match", ["get", "contour"],
              15, "#10B981",
              30, "#F59E0B",
              45, "#E1251B",
              "#999",
            ],
            "fill-opacity": 0.18,
          },
        });
        map.addLayer({
          id: LINE,
          type: "line",
          source: SOURCE,
          paint: {
            "line-color": [
              "match", ["get", "contour"],
              15, "#10B981",
              30, "#F59E0B",
              45, "#E1251B",
              "#999",
            ],
            "line-width": 1.5,
            "line-opacity": 0.7,
          },
        });
      } catch {
        // silently ignore
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [showIsochrones, styleLoaded, token]);

  // Draggable marker
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!draggableMarker) {
      draggableMarkerRef.current?.remove();
      draggableMarkerRef.current = null;
      return;
    }
    if (!draggableMarkerRef.current) {
      const el = document.createElement("div");
      el.style.cssText = `
        width:24px;height:24px;border-radius:9999px;
        background:hsl(var(--primary, 232 65% 35%));
        border:3px solid hsl(var(--accent, 38 92% 50%));
        box-shadow:0 4px 10px rgba(0,0,0,0.4);
        cursor:grab;
      `;
      const m = new mapboxgl.Marker({ element: el, draggable: true })
        .setLngLat([draggableMarker.lng, draggableMarker.lat])
        .addTo(map);
      m.on("dragend", () => {
        const ll = m.getLngLat();
        onMarkerDragRef.current?.(ll.lng, ll.lat);
      });
      draggableMarkerRef.current = m;
    } else {
      draggableMarkerRef.current.setLngLat([draggableMarker.lng, draggableMarker.lat]);
    }
  }, [draggableMarker?.lng, draggableMarker?.lat]);

  const legend = useMemo(() => {
    if (!showIsochrones) return null;
    return (
      <div className="absolute bottom-3 left-3 z-10 bg-card/95 backdrop-blur border rounded-lg px-3 py-2 shadow-lg text-xs space-y-1">
        <div className="font-semibold flex items-center gap-1">
          <Clock className="h-3 w-3" /> Tiempo desde planta
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-sm" style={{ background: "#10B981" }} /> 15 min
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-sm" style={{ background: "#F59E0B" }} /> 30 min
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-sm" style={{ background: "#E1251B" }} /> 45 min
        </div>
      </div>
    );
  }, [showIsochrones]);

  if (tokenMissing) {
    return <MapboxTokenPrompt onSaved={() => setTokenMissing(false)} />;
  }

  return (
    <div className={["relative h-full min-h-[320px] w-full overflow-hidden", className].filter(Boolean).join(" ")}>
      <div ref={containerRef} className="absolute inset-0" />

      {/* Style switcher + 3D toggle */}
      <div className="absolute top-3 left-3 z-10 flex flex-col gap-2">
        <div className="bg-card border rounded-lg shadow-lg p-1 flex gap-0.5">
          {(["streets", "satellite", "dark"] as StyleKey[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setStyleKey(k)}
              className={`px-2.5 py-1 text-xs font-medium rounded transition ${
                styleKey === k ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-muted"
              }`}
            >
              {k === "streets" ? "Calles" : k === "satellite" ? "Satélite" : "Oscuro"}
            </button>
          ))}
        </div>
        <div className="bg-card border rounded-lg shadow-lg p-1 flex gap-0.5">
          <ToggleBtn active={is3D} onClick={() => setIs3D((v) => !v)} icon={<Box className="h-3.5 w-3.5" />} label="3D" />
          <ToggleBtn active={showHeatmap} onClick={() => setShowHeatmap((v) => !v)} icon={<Flame className="h-3.5 w-3.5" />} label="Calor" />
          <ToggleBtn active={showIsochrones} onClick={() => setShowIsochrones((v) => !v)} icon={<Clock className="h-3.5 w-3.5" />} label="Tiempo" />
        </div>
      </div>

      {legend}
    </div>
  );
}

function ToggleBtn({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-2 py-1 text-xs font-medium rounded transition flex items-center gap-1 ${
        active ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-muted"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function buildPopupHTML(s: MapSitio, isMine: boolean): string {
  const color = ESTATUS_COLOR[s.estatus] ?? "#888";
  const label = ESTATUS_LABEL[s.estatus];
  const ejecutivo = isMine ? "Tú" : (s.vendedor?.nombre ?? s.vendedor?.email ?? "Sin asignar");
  return `
    <div style="padding:6px 8px;font-size:12px;max-width:240px">
      <div style="display:flex;justify-content:space-between;gap:8px;align-items:start;margin-bottom:4px">
        <strong style="font-size:13px">${escapeHtml(s.nombre_referencia ?? "Sitio sin nombre")}</strong>
        <span style="background:${color};color:white;font-size:10px;padding:2px 6px;border-radius:4px;white-space:nowrap">${label}</span>
      </div>
      <div style="color:#666"><b style="color:#222">Ejecutivo:</b> ${escapeHtml(ejecutivo)}</div>
      ${s.volumen_m3 != null ? `<div><b>Volumen:</b> ${s.volumen_m3.toLocaleString()} m³</div>` : ""}
      ${s.direccion ? `<div><b>Dirección:</b> ${escapeHtml(s.direccion)}</div>` : ""}
      ${s.competidor ? `<div><b>Competidor:</b> ${escapeHtml(s.competidor)}</div>` : ""}
    </div>
  `;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c,
  );
}

function MapboxTokenPrompt({ onSaved }: { onSaved: () => void }) {
  const [token, setToken] = useState("");
  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-card border rounded-xl p-6 shadow-sm">
        <h2 className="font-semibold mb-2">Configura Mapbox</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Pega tu token público de Mapbox. Se guarda solo en este dispositivo.
          Obtén uno gratis en{" "}
          <a
            href="https://account.mapbox.com/access-tokens/"
            target="_blank"
            rel="noreferrer"
            className="text-primary underline"
          >
            mapbox.com
          </a>
          .
        </p>
        <input
          className="w-full h-12 px-3 rounded-md border bg-background text-sm"
          placeholder="pk.eyJ..."
          value={token}
          onChange={(e) => setToken(e.target.value)}
        />
        <button
          className="mt-3 w-full h-12 rounded-md bg-primary text-primary-foreground font-medium"
          onClick={() => {
            if (!token.startsWith("pk.")) return;
            window.localStorage.setItem("cemex_mapbox_token", token);
            onSaved();
            window.location.reload();
          }}
        >
          Guardar y continuar
        </button>
      </div>
    </div>
  );
}
