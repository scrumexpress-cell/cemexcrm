import { useEffect, useMemo, useRef, useState } from "react";
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
const TILE_SIZE = 512;
const MIN_ZOOM = 3;
const MAX_ZOOM = 17;

function lngLatToWorld(lng: number, lat: number, zoom: number) {
  const scale = TILE_SIZE * 2 ** zoom;
  const clampedLat = Math.max(Math.min(lat, 85.05112878), -85.05112878);
  const sin = Math.sin((clampedLat * Math.PI) / 180);
  return {
    x: ((lng + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale,
  };
}

function worldToLngLat(x: number, y: number, zoom: number) {
  const scale = TILE_SIZE * 2 ** zoom;
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
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ x: number; y: number; center: [number, number]; moved: boolean } | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [tokenMissing, setTokenMissing] = useState(false);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [viewCenter, setViewCenter] = useState<[number, number]>(center);
  const [viewZoom, setViewZoom] = useState(Math.round(zoom));

  useEffect(() => {
    const savedToken = getMapboxToken();
    setToken(savedToken);
    setTokenMissing(!savedToken);
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setSize({ width: el.clientWidth, height: el.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (draggableMarker) setViewCenter([draggableMarker.lng, draggableMarker.lat]);
  }, [draggableMarker?.lat, draggableMarker?.lng]);

  const centerWorld = useMemo(
    () => lngLatToWorld(viewCenter[0], viewCenter[1], viewZoom),
    [viewCenter, viewZoom],
  );

  const tiles = useMemo(() => {
    if (!size.width || !size.height || !token) return [];
    const halfW = size.width / 2;
    const halfH = size.height / 2;
    const startX = Math.floor((centerWorld.x - halfW) / TILE_SIZE);
    const endX = Math.floor((centerWorld.x + halfW) / TILE_SIZE);
    const startY = Math.floor((centerWorld.y - halfH) / TILE_SIZE);
    const endY = Math.floor((centerWorld.y + halfH) / TILE_SIZE);
    const maxTile = 2 ** viewZoom;
    const result: Array<{ key: string; url: string; left: number; top: number }> = [];

    for (let x = startX; x <= endX; x += 1) {
      for (let y = startY; y <= endY; y += 1) {
        if (y < 0 || y >= maxTile) continue;
        const wrappedX = ((x % maxTile) + maxTile) % maxTile;
        result.push({
          key: `${viewZoom}-${x}-${y}`,
          url: `https://api.mapbox.com/styles/v1/mapbox/streets-v12/tiles/${TILE_SIZE}/${viewZoom}/${wrappedX}/${y}@2x?access_token=${token}`,
          left: x * TILE_SIZE - centerWorld.x + halfW,
          top: y * TILE_SIZE - centerWorld.y + halfH,
        });
      }
    }
    return result;
  }, [centerWorld.x, centerWorld.y, size.height, size.width, token, viewZoom]);

  function pointToLngLat(clientX: number, clientY: number) {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { lng: viewCenter[0], lat: viewCenter[1] };
    return worldToLngLat(
      centerWorld.x + clientX - rect.left - rect.width / 2,
      centerWorld.y + clientY - rect.top - rect.height / 2,
      viewZoom,
    );
  }

  function markerPosition(lng: number, lat: number) {
    const world = lngLatToWorld(lng, lat, viewZoom);
    return {
      left: world.x - centerWorld.x + size.width / 2,
      top: world.y - centerWorld.y + size.height / 2,
    };
  }

  if (tokenMissing) {
    return <MapboxTokenPrompt onSaved={() => setTokenMissing(false)} />;
  }

  return (
    <div
      ref={containerRef}
      className={["relative h-full min-h-[320px] w-full overflow-hidden bg-muted touch-none", className]
        .filter(Boolean)
        .join(" ")}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        dragRef.current = { x: event.clientX, y: event.clientY, center: viewCenter, moved: false };
      }}
      onPointerMove={(event) => {
        const drag = dragRef.current;
        if (!drag) return;
        const dx = event.clientX - drag.x;
        const dy = event.clientY - drag.y;
        if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
        const start = lngLatToWorld(drag.center[0], drag.center[1], viewZoom);
        const next = worldToLngLat(start.x - dx, start.y - dy, viewZoom);
        setViewCenter([next.lng, next.lat]);
      }}
      onPointerUp={(event) => {
        const drag = dragRef.current;
        dragRef.current = null;
        if (!drag?.moved) {
          const next = pointToLngLat(event.clientX, event.clientY);
          onMapClick?.(next.lng, next.lat);
        }
      }}
    >
      {tiles.map((tile) => (
        <img
          key={tile.key}
          src={tile.url}
          alt=""
          draggable={false}
          className="pointer-events-none absolute h-[512px] w-[512px] select-none"
          style={{ transform: `translate3d(${tile.left}px, ${tile.top}px, 0)` }}
        />
      ))}

      {sitios.map((sitio) => {
        const position = markerPosition(sitio.lng, sitio.lat);
        return (
          <button
            key={sitio.id}
            type="button"
            aria-label={sitio.nombre_referencia ?? "Sitio"}
            className="absolute h-[18px] w-[18px] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card shadow-md"
            style={{
              left: position.left,
              top: position.top,
              backgroundColor: ESTATUS_COLOR[sitio.estatus] ?? "#888",
            }}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => onPinClick?.(sitio)}
          />
        );
      })}

      {draggableMarker ? (
        <DraggableMapMarker
          position={markerPosition(draggableMarker.lng, draggableMarker.lat)}
          onDragEnd={(clientX, clientY) => {
            const next = pointToLngLat(clientX, clientY);
            onMarkerDrag?.(next.lng, next.lat);
          }}
        />
      ) : null}

      <div className="absolute right-3 top-3 flex flex-col overflow-hidden rounded-md border bg-card shadow-sm">
        <button
          type="button"
          className="h-9 w-9 border-b text-lg font-semibold text-foreground"
          onClick={() => setViewZoom((current) => Math.min(MAX_ZOOM, current + 1))}
          aria-label="Acercar"
        >
          +
        </button>
        <button
          type="button"
          className="h-9 w-9 text-lg font-semibold text-foreground"
          onClick={() => setViewZoom((current) => Math.max(MIN_ZOOM, current - 1))}
          aria-label="Alejar"
        >
          −
        </button>
      </div>
    </div>
  );
}

function DraggableMapMarker({
  position,
  onDragEnd,
}: {
  position: { left: number; top: number };
  onDragEnd: (clientX: number, clientY: number) => void;
}) {
  const [dragPosition, setDragPosition] = useState(position);

  useEffect(() => setDragPosition(position), [position.left, position.top]);

  return (
    <button
      type="button"
      aria-label="Ubicación seleccionada"
      className="absolute h-6 w-6 -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full border-[3px] border-accent bg-primary shadow-lg active:cursor-grabbing"
      style={{ left: dragPosition.left, top: dragPosition.top }}
      onPointerDown={(event) => {
        event.stopPropagation();
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
        const parent = event.currentTarget.parentElement?.getBoundingClientRect();
        if (!parent) return;
        setDragPosition({ left: event.clientX - parent.left, top: event.clientY - parent.top });
      }}
      onPointerUp={(event) => {
        event.stopPropagation();
        onDragEnd(event.clientX, event.clientY);
      }}
    />
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