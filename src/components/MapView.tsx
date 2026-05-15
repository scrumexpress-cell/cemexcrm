import { useEffect, useMemo, useRef, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { getMapboxToken } from "@/lib/mapbox-token";
import { ESTATUS_COLOR, ESTATUS_LABEL, ESTATUS_ICON } from "@/lib/sitio-utils";
import { PLANTAS_CEMEX } from "@/lib/cemex-plantas";
import { Factory, Flame, Map as MapIcon, MapPin, Mountain, Navigation } from "lucide-react";
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
const TILE_SIZE = 512;
const MIN_ZOOM = 3;
const MAX_ZOOM = 18;

type StyleKey = "streets" | "satellite" | "outdoors" | "dark";

const STYLE_IDS: Record<StyleKey, string> = {
  streets: "mapbox/streets-v12",
  satellite: "mapbox/satellite-streets-v12",
  outdoors: "mapbox/outdoors-v12",
  dark: "mapbox/dark-v11",
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function lngLatToWorld(lng: number, lat: number, z: number) {
  const scale = TILE_SIZE * 2 ** z;
  const x = ((lng + 180) / 360) * scale;
  const safeLat = clamp(lat, -85.05112878, 85.05112878);
  const sin = Math.sin((safeLat * Math.PI) / 180);
  const y = (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale;
  return { x, y };
}

function worldToLngLat(x: number, y: number, z: number) {
  const scale = TILE_SIZE * 2 ** z;
  const lng = (x / scale) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * y) / scale;
  const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  return { lng, lat };
}

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
  const token = getMapboxToken();
  const containerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    centerX: number;
    centerY: number;
    moved: boolean;
  } | null>(null);
  const dragMarkerRef = useRef(false);
  const pinchRef = useRef<{ distance: number; zoom: number } | null>(null);

  const [styleKey, setStyleKey] = useState<StyleKey>("streets");
  const [view, setView] = useState(() => ({ lng: center[0], lat: center[1], zoom }));
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [showHeat, setShowHeat] = useState(false);
  const [showPlants, setShowPlants] = useState(true);

  useEffect(() => {
    if (!containerRef.current) return;
    const update = () => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) setSize({ width: rect.width, height: rect.height });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!draggableMarker) return;
    setView((v) => ({ ...v, lng: draggableMarker.lng, lat: draggableMarker.lat }));
  }, [draggableMarker]);

  const z = Math.round(clamp(view.zoom, MIN_ZOOM, MAX_ZOOM));
  const centerWorld = lngLatToWorld(view.lng, view.lat, z);

  const tiles = useMemo(() => {
    if (!size.width || !size.height || !token) return [];
    const startX = Math.floor((centerWorld.x - size.width / 2) / TILE_SIZE);
    const endX = Math.floor((centerWorld.x + size.width / 2) / TILE_SIZE);
    const startY = Math.floor((centerWorld.y - size.height / 2) / TILE_SIZE);
    const endY = Math.floor((centerWorld.y + size.height / 2) / TILE_SIZE);
    const max = 2 ** z;
    const out: Array<{
      key: string;
      x: number;
      y: number;
      left: number;
      top: number;
      url: string;
    }> = [];

    for (let x = startX; x <= endX; x++) {
      for (let y = startY; y <= endY; y++) {
        if (y < 0 || y >= max) continue;
        const wrappedX = ((x % max) + max) % max;
        out.push({
          key: `${z}-${x}-${y}`,
          x: wrappedX,
          y,
          left: x * TILE_SIZE - centerWorld.x + size.width / 2,
          top: y * TILE_SIZE - centerWorld.y + size.height / 2,
          url: `https://api.mapbox.com/styles/v1/${STYLE_IDS[styleKey]}/tiles/512/${z}/${wrappedX}/${y}@2x?access_token=${token}`,
        });
      }
    }
    return out;
  }, [centerWorld.x, centerWorld.y, size.height, size.width, styleKey, token, z]);

  const allMarkers = useMemo(() => {
    const siteMarkers = sitios.map((s) => ({
      type: "sitio" as const,
      data: s,
      lng: s.lng,
      lat: s.lat,
    }));
    const plantMarkers = showPlants
      ? PLANTAS_CEMEX.map((p) => ({ type: "planta" as const, data: p, lng: p.lng, lat: p.lat }))
      : [];
    return [...siteMarkers, ...plantMarkers];
  }, [showPlants, sitios]);

  function clientToLngLat(clientX: number, clientY: number) {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const worldX = centerWorld.x + (clientX - rect.left - rect.width / 2);
    const worldY = centerWorld.y + (clientY - rect.top - rect.height / 2);
    return worldToLngLat(worldX, worldY, z);
  }

  function zoomAt(nextZoom: number, clientX?: number, clientY?: number) {
    setView((prev) => {
      const next = clamp(nextZoom, MIN_ZOOM, MAX_ZOOM);
      if (next === Math.round(prev.zoom)) return prev;
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect || clientX == null || clientY == null) return { ...prev, zoom: next };

      const beforeCenter = lngLatToWorld(prev.lng, prev.lat, Math.round(prev.zoom));
      const focusWorldBefore = {
        x: beforeCenter.x + (clientX - rect.left - rect.width / 2),
        y: beforeCenter.y + (clientY - rect.top - rect.height / 2),
      };
      const focusLngLat = worldToLngLat(
        focusWorldBefore.x,
        focusWorldBefore.y,
        Math.round(prev.zoom),
      );
      const focusWorldAfter = lngLatToWorld(focusLngLat.lng, focusLngLat.lat, next);
      const nextCenterWorld = {
        x: focusWorldAfter.x - (clientX - rect.left - rect.width / 2),
        y: focusWorldAfter.y - (clientY - rect.top - rect.height / 2),
      };
      const nextCenter = worldToLngLat(nextCenterWorld.x, nextCenterWorld.y, next);
      return { lng: nextCenter.lng, lat: nextCenter.lat, zoom: next };
    });
  }

  if (!token) {
    return <MapboxTokenPrompt />;
  }

  return (
    <div
      ref={containerRef}
      className={[
        "relative h-full min-h-[320px] w-full overflow-hidden bg-muted select-none",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      style={{ touchAction: "none" }}
      onWheel={(e) => {
        e.preventDefault();
        zoomAt(view.zoom + (e.deltaY > 0 ? -1 : 1), e.clientX, e.clientY);
      }}
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).closest("[data-map-control],[data-map-marker]")) return;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        const world = lngLatToWorld(view.lng, view.lat, z);
        draggingRef.current = {
          pointerId: e.pointerId,
          startX: e.clientX,
          startY: e.clientY,
          centerX: world.x,
          centerY: world.y,
          moved: false,
        };
      }}
      onPointerMove={(e) => {
        const drag = draggingRef.current;
        if (!drag || drag.pointerId !== e.pointerId) return;
        const dx = e.clientX - drag.startX;
        const dy = e.clientY - drag.startY;
        if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
        const next = worldToLngLat(drag.centerX - dx, drag.centerY - dy, z);
        setView((v) => ({ ...v, lng: next.lng, lat: next.lat }));
      }}
      onPointerUp={(e) => {
        const drag = draggingRef.current;
        draggingRef.current = null;
        if (drag?.pointerId !== e.pointerId) return;
        if (!drag.moved) {
          const ll = clientToLngLat(e.clientX, e.clientY);
          if (ll) onMapClick?.(ll.lng, ll.lat);
        }
      }}
      onTouchStart={(e) => {
        if (e.touches.length === 2) {
          const [a, b] = Array.from(e.touches);
          pinchRef.current = {
            distance: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
            zoom: view.zoom,
          };
        }
      }}
      onTouchMove={(e) => {
        if (e.touches.length !== 2 || !pinchRef.current) return;
        const [a, b] = Array.from(e.touches);
        const distance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
        if (!pinchRef.current.distance) return;
        const delta = Math.log2(distance / pinchRef.current.distance);
        zoomAt(
          Math.round(pinchRef.current.zoom + delta),
          (a.clientX + b.clientX) / 2,
          (a.clientY + b.clientY) / 2,
        );
      }}
      onTouchEnd={() => {
        pinchRef.current = null;
      }}
    >
      <div className="absolute inset-0">
        {tiles.map((t) => (
          <img
            key={t.key}
            src={t.url}
            alt=""
            draggable={false}
            className="absolute max-w-none"
            style={{ width: TILE_SIZE, height: TILE_SIZE, left: t.left, top: t.top }}
          />
        ))}
      </div>

      {showHeat &&
        sitios.map((s) => (
          <HeatSpot key={`heat-${s.id}`} sitio={s} view={view} size={size} zoom={z} />
        ))}

      {allMarkers.map((m) => {
        const pos = markerPosition(m.lng, m.lat, centerWorld, size, z);
        if (!pos) return null;
        if (m.type === "planta") {
          return (
            <button
              key={`plant-${m.data.id}`}
              type="button"
              data-map-marker
              className="absolute z-10 flex h-8 w-8 items-center justify-center rounded-md border-2 border-card bg-primary text-primary-foreground shadow-lg"
              style={{ left: pos.x, top: pos.y, transform: "translate(-50%, -50%)" }}
              title={m.data.nombre}
              onClick={(e) => e.stopPropagation()}
            >
              <Factory className="h-4 w-4" />
            </button>
          );
        }

        const sitio = m.data;
        const isMine = currentUserId != null && sitio.vendedor_id === currentUserId;
        const Icon = ESTATUS_ICON[sitio.estatus];
        return (
          <button
            key={sitio.id}
            type="button"
            data-map-marker
            aria-label={sitio.nombre_referencia ?? "Sitio"}
            title={`${sitio.nombre_referencia ?? "Sitio sin nombre"} · ${ESTATUS_LABEL[sitio.estatus]}`}
            className="absolute z-20 flex items-center justify-center rounded-full border-2 border-card shadow-lg transition-transform active:scale-90"
            style={{
              left: pos.x,
              top: pos.y,
              width: isMine ? 30 : 26,
              height: isMine ? 30 : 26,
              transform: "translate(-50%, -50%)",
              backgroundColor: ESTATUS_COLOR[sitio.estatus],
              outline: isMine
                ? "2px solid color-mix(in oklab, var(--accent) 70%, transparent)"
                : undefined,
              outlineOffset: 2,
            }}
            onClick={(e) => {
              e.stopPropagation();
              onPinClick?.(sitio);
            }}
          >
            <span
              dangerouslySetInnerHTML={{
                __html: renderToStaticMarkup(<Icon color="white" size={14} strokeWidth={2.5} />),
              }}
            />
          </button>
        );
      })}

      {draggableMarker && (
        <DraggablePoint
          point={draggableMarker}
          centerWorld={centerWorld}
          size={size}
          zoom={z}
          onDragStart={() => {
            dragMarkerRef.current = true;
          }}
          onDrag={(lng, lat) => {
            setView((v) => ({ ...v, lng, lat }));
            onMarkerDrag?.(lng, lat);
          }}
          onDragEnd={() => {
            dragMarkerRef.current = false;
          }}
        />
      )}

      <div data-map-control className="absolute left-3 top-3 z-30 flex flex-col gap-2">
        <div className="flex rounded-lg border bg-card p-1 shadow-lg">
          {(["streets", "satellite", "outdoors", "dark"] as StyleKey[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setStyleKey(k)}
              className={`rounded px-2 py-1 text-xs font-medium transition ${
                styleKey === k
                  ? "bg-primary text-primary-foreground"
                  : "text-foreground hover:bg-muted"
              }`}
            >
              {k === "streets"
                ? "Calles"
                : k === "satellite"
                  ? "Satélite"
                  : k === "outdoors"
                    ? "Relieve"
                    : "Oscuro"}
            </button>
          ))}
        </div>
        <div className="flex rounded-lg border bg-card p-1 shadow-lg">
          <ToggleBtn
            active={showPlants}
            onClick={() => setShowPlants((v) => !v)}
            icon={<Factory className="h-3.5 w-3.5" />}
            label="Plantas"
          />
          <ToggleBtn
            active={showHeat}
            onClick={() => setShowHeat((v) => !v)}
            icon={<Flame className="h-3.5 w-3.5" />}
            label="Calor"
          />
        </div>
      </div>

      <div
        data-map-control
        className="absolute right-3 top-3 z-30 overflow-hidden rounded-lg border bg-card shadow-lg"
      >
        <button
          type="button"
          className="flex h-9 w-9 items-center justify-center hover:bg-muted"
          onClick={() => zoomAt(view.zoom + 1)}
          aria-label="Acercar"
        >
          +
        </button>
        <div className="h-px bg-border" />
        <button
          type="button"
          className="flex h-9 w-9 items-center justify-center hover:bg-muted"
          onClick={() => zoomAt(view.zoom - 1)}
          aria-label="Alejar"
        >
          −
        </button>
      </div>

      <div className="pointer-events-none absolute bottom-3 left-3 z-30 rounded-lg border bg-card/95 px-3 py-2 text-xs text-muted-foreground shadow-lg backdrop-blur">
        <div className="flex items-center gap-1 font-medium text-foreground">
          <MapIcon className="h-3.5 w-3.5" /> Mapa seguro
        </div>
        <div className="mt-0.5 flex items-center gap-1">
          <Navigation className="h-3 w-3" /> Arrastra, pellizca o toca para crear
        </div>
      </div>
    </div>
  );
}

function markerPosition(
  lng: number,
  lat: number,
  centerWorld: { x: number; y: number },
  size: { width: number; height: number },
  zoom: number,
) {
  if (!size.width || !size.height) return null;
  const world = lngLatToWorld(lng, lat, zoom);
  return {
    x: world.x - centerWorld.x + size.width / 2,
    y: world.y - centerWorld.y + size.height / 2,
  };
}

function HeatSpot({
  sitio,
  view,
  size,
  zoom,
}: {
  sitio: MapSitio;
  view: { lng: number; lat: number };
  size: { width: number; height: number };
  zoom: number;
}) {
  const centerWorld = lngLatToWorld(view.lng, view.lat, zoom);
  const pos = markerPosition(sitio.lng, sitio.lat, centerWorld, size, zoom);
  if (!pos) return null;
  const radius = clamp((sitio.volumen_m3 ?? 300) / 90, 28, 110);
  return (
    <div
      className="pointer-events-none absolute z-10 rounded-full blur-xl"
      style={{
        left: pos.x,
        top: pos.y,
        width: radius,
        height: radius,
        transform: "translate(-50%, -50%)",
        background: "color-mix(in oklab, var(--accent) 42%, transparent)",
      }}
    />
  );
}

function DraggablePoint({
  point,
  centerWorld,
  size,
  zoom,
  onDragStart,
  onDrag,
  onDragEnd,
}: {
  point: { lng: number; lat: number };
  centerWorld: { x: number; y: number };
  size: { width: number; height: number };
  zoom: number;
  onDragStart: () => void;
  onDrag: (lng: number, lat: number) => void;
  onDragEnd: () => void;
}) {
  const pos = markerPosition(point.lng, point.lat, centerWorld, size, zoom);
  if (!pos) return null;
  return (
    <button
      type="button"
      data-map-marker
      className="absolute z-30 active:scale-95 drop-shadow-[0_4px_8px_rgba(0,0,0,0.4)]"
      style={{ left: pos.x, top: pos.y, transform: "translate(-50%, -100%)", touchAction: "none" }}
      aria-label="Nueva oportunidad"
      onPointerDown={(e) => {
        e.stopPropagation();
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        onDragStart();
      }}
      onPointerMove={(e) => {
        if (e.buttons !== 1 && e.pointerType !== "touch") return;
        const parent = (
          e.currentTarget.parentElement as HTMLElement | null
        )?.getBoundingClientRect();
        if (!parent) return;
        const worldX = centerWorld.x + (e.clientX - parent.left - parent.width / 2);
        const worldY = centerWorld.y + (e.clientY - parent.top - parent.height / 2);
        const next = worldToLngLat(worldX, worldY, zoom);
        onDrag(next.lng, next.lat);
      }}
      onPointerUp={(e) => {
        e.stopPropagation();
        onDragEnd();
      }}
    >
      <MapPin className="h-10 w-10 fill-primary text-primary-foreground stroke-[2.5]" />
    </button>
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
      className={`flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition ${
        active ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-muted"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function MapboxTokenPrompt() {
  return (
    <div className="flex h-full min-h-[320px] items-center justify-center bg-muted p-6">
      <div className="max-w-sm rounded-lg border bg-card p-4 text-center shadow-sm">
        <Mountain className="mx-auto mb-2 h-8 w-8 text-primary" />
        <h2 className="font-semibold">Mapa no disponible</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Falta configurar el token público de Mapbox.
        </p>
      </div>
    </div>
  );
}
