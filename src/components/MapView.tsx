import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { getMapboxToken } from "@/lib/mapbox-token";
import { ESTATUS_COLOR } from "@/lib/sitio-utils";
import type { Sitio } from "@/integrations/supabase/client";

interface Props {
  sitios: Sitio[];
  onPinClick?: (sitio: Sitio) => void;
  onMapClick?: (lng: number, lat: number) => void;
  center?: [number, number];
  zoom?: number;
  className?: string;
  draggableMarker?: { lng: number; lat: number };
  onMarkerDrag?: (lng: number, lat: number) => void;
}

const GDL: [number, number] = [-103.3496, 20.6597];

export function MapView({
  sitios,
  onPinClick,
  onMapClick,
  center = GDL,
  zoom = 11,
  className,
  draggableMarker,
  onMarkerDrag,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const draggableRef = useRef<mapboxgl.Marker | null>(null);
  const [tokenMissing, setTokenMissing] = useState(false);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const token = getMapboxToken();
    if (!token) {
      setTokenMissing(true);
      return;
    }
    mapboxgl.accessToken = token;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/streets-v12",
      center,
      zoom,
    });
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
    map.addControl(
      new mapboxgl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: false,
      }),
      "top-right",
    );
    if (onMapClick) {
      map.on("click", (e) => onMapClick(e.lngLat.lng, e.lngLat.lat));
    }
    map.once("load", () => map.resize());
    const resizeObserver = new ResizeObserver(() => map.resize());
    resizeObserver.observe(containerRef.current);
    mapRef.current = map;
    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync site pins
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];
    sitios.forEach((s) => {
      const el = document.createElement("div");
      el.style.cssText = `width:18px;height:18px;border-radius:50%;background:${ESTATUS_COLOR[s.estatus] ?? "#888"};border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,.4);cursor:pointer;`;
      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([s.lng, s.lat])
        .addTo(map);
      el.addEventListener("click", (ev) => {
        ev.stopPropagation();
        onPinClick?.(s);
      });
      markersRef.current.push(marker);
    });
  }, [sitios, onPinClick]);

  // Draggable marker
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !draggableMarker) return;
    if (draggableRef.current) {
      draggableRef.current.setLngLat([draggableMarker.lng, draggableMarker.lat]);
      return;
    }
    const el = document.createElement("div");
    el.style.cssText =
      "width:24px;height:24px;border-radius:50%;background:#003C71;border:3px solid #FFB81C;box-shadow:0 2px 8px rgba(0,0,0,.5);";
    const marker = new mapboxgl.Marker({ element: el, draggable: true })
      .setLngLat([draggableMarker.lng, draggableMarker.lat])
      .addTo(map);
    marker.on("dragend", () => {
      const ll = marker.getLngLat();
      onMarkerDrag?.(ll.lng, ll.lat);
    });
    draggableRef.current = marker;
    map.flyTo({ center: [draggableMarker.lng, draggableMarker.lat], zoom: 15 });
  }, [draggableMarker, onMarkerDrag]);

  if (tokenMissing) {
    return <MapboxTokenPrompt onSaved={() => setTokenMissing(false)} />;
  }
  return <div ref={containerRef} className={className ?? "h-full min-h-[320px] w-full"} />;
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
