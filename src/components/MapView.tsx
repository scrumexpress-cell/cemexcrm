import { useEffect, useMemo, useRef, useState } from "react";
import { getMapboxToken } from "@/lib/mapbox-token";
import { ESTATUS_COLOR, ESTATUS_LABEL, ESTATUS_ICON } from "@/lib/sitio-utils";
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
  currentUserId,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ x: number; y: number; center: [number, number]; moved: boolean } | null>(null);
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchRef = useRef<{
    initialDist: number;
    initialZoom: number;
    initialCenter: [number, number];
    midClient: { x: number; y: number };
  } | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [tokenMissing, setTokenMissing] = useState(false);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [viewCenter, setViewCenter] = useState<[number, number]>(center);
  const [viewZoom, setViewZoom] = useState(Math.round(zoom));
  const [hoveredId, setHoveredId] = useState<string | null>(null);

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
    const tileZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.round(viewZoom)));
    const scale = 2 ** (viewZoom - tileZoom);
    // Compute tile-world coords for current view center at tileZoom
    const tileCenterWorld = lngLatToWorld(viewCenter[0], viewCenter[1], tileZoom);
    // Visible world extent in tile-zoom pixels
    const visHalfW = halfW / scale;
    const visHalfH = halfH / scale;
    const startX = Math.floor((tileCenterWorld.x - visHalfW) / TILE_SIZE);
    const endX = Math.floor((tileCenterWorld.x + visHalfW) / TILE_SIZE);
    const startY = Math.floor((tileCenterWorld.y - visHalfH) / TILE_SIZE);
    const endY = Math.floor((tileCenterWorld.y + visHalfH) / TILE_SIZE);
    const maxTile = 2 ** tileZoom;
    const result: Array<{ key: string; url: string; left: number; top: number; scale: number }> = [];

    for (let x = startX; x <= endX; x += 1) {
      for (let y = startY; y <= endY; y += 1) {
        if (y < 0 || y >= maxTile) continue;
        const wrappedX = ((x % maxTile) + maxTile) % maxTile;
        const tileLeftWorld = x * TILE_SIZE - tileCenterWorld.x;
        const tileTopWorld = y * TILE_SIZE - tileCenterWorld.y;
        result.push({
          key: `${tileZoom}-${x}-${y}`,
          url: `https://api.mapbox.com/styles/v1/mapbox/streets-v12/tiles/${TILE_SIZE}/${tileZoom}/${wrappedX}/${y}@2x?access_token=${token}`,
          left: tileLeftWorld * scale + halfW,
          top: tileTopWorld * scale + halfH,
          scale,
        });
      }
    }
    return result;
  }, [size.height, size.width, token, viewZoom, viewCenter]);

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
        pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (pointersRef.current.size === 2) {
          const pts = Array.from(pointersRef.current.values());
          const dx = pts[0].x - pts[1].x;
          const dy = pts[0].y - pts[1].y;
          pinchRef.current = {
            initialDist: Math.hypot(dx, dy) || 1,
            initialZoom: viewZoom,
            initialCenter: viewCenter,
            midClient: { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 },
          };
          dragRef.current = null;
        } else {
          dragRef.current = { x: event.clientX, y: event.clientY, center: viewCenter, moved: false };
        }
      }}
      onPointerMove={(event) => {
        if (!pointersRef.current.has(event.pointerId)) return;
        pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

        if (pointersRef.current.size >= 2 && pinchRef.current) {
          const pts = Array.from(pointersRef.current.values()).slice(0, 2);
          const dx = pts[0].x - pts[1].x;
          const dy = pts[0].y - pts[1].y;
          const dist = Math.hypot(dx, dy) || 1;
          const ratio = dist / pinchRef.current.initialDist;
          const newZoom = Math.max(
            MIN_ZOOM,
            Math.min(MAX_ZOOM, pinchRef.current.initialZoom + Math.log2(ratio)),
          );
          // Keep midpoint anchored: shift center based on midpoint movement plus zoom delta around midpoint
          const rect = containerRef.current?.getBoundingClientRect();
          if (rect) {
            const initMid = pinchRef.current.midClient;
            const midX = (pts[0].x + pts[1].x) / 2;
            const midY = (pts[0].y + pts[1].y) / 2;
            // World coords of midpoint at new zoom, anchored to initial center at initial zoom
            const initCenterWorldNew = lngLatToWorld(
              pinchRef.current.initialCenter[0],
              pinchRef.current.initialCenter[1],
              newZoom,
            );
            const midOffsetX = initMid.x - rect.left - rect.width / 2;
            const midOffsetY = initMid.y - rect.top - rect.height / 2;
            const midWorldX = initCenterWorldNew.x + midOffsetX;
            const midWorldY = initCenterWorldNew.y + midOffsetY;
            // We want midWorld to project to current midpoint -> new center
            const newCenterX = midWorldX - (midX - rect.left - rect.width / 2);
            const newCenterY = midWorldY - (midY - rect.top - rect.height / 2);
            const next = worldToLngLat(newCenterX, newCenterY, newZoom);
            setViewZoom(newZoom);
            setViewCenter([next.lng, next.lat]);
          } else {
            setViewZoom(newZoom);
          }
          return;
        }

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
        pointersRef.current.delete(event.pointerId);
        const wasPinching = pinchRef.current != null;
        if (pointersRef.current.size < 2) pinchRef.current = null;
        const drag = dragRef.current;
        dragRef.current = null;
        if (!wasPinching && !drag?.moved) {
          const next = pointToLngLat(event.clientX, event.clientY);
          onMapClick?.(next.lng, next.lat);
        }
      }}
      onPointerCancel={(event) => {
        pointersRef.current.delete(event.pointerId);
        if (pointersRef.current.size < 2) pinchRef.current = null;
        dragRef.current = null;
      }}
      onWheel={(event) => {
        if (!event.deltaY) return;
        const rect = containerRef.current?.getBoundingClientRect();
        const delta = -event.deltaY * 0.002;
        const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, viewZoom + delta));
        if (rect) {
          const offsetX = event.clientX - rect.left - rect.width / 2;
          const offsetY = event.clientY - rect.top - rect.height / 2;
          const centerWorldNew = lngLatToWorld(viewCenter[0], viewCenter[1], newZoom);
          const pointWorldX = centerWorldNew.x + offsetX;
          const pointWorldY = centerWorldNew.y + offsetY;
          // Keep cursor point stationary
          const ratio = 2 ** (newZoom - viewZoom);
          const newCenterX = pointWorldX - offsetX * ratio / ratio; // simplifies; keep anchored
          // Actually simpler: re-anchor by translating center so cursor stays
          const next = worldToLngLat(pointWorldX - offsetX, pointWorldY - offsetY, newZoom);
          setViewZoom(newZoom);
          setViewCenter([next.lng, next.lat]);
          void newCenterX;
        } else {
          setViewZoom(newZoom);
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
        const isMine =
          currentUserId != null && sitio.vendedor_id === currentUserId;
        const isHovered = hoveredId === sitio.id;
        return (
          <div
            key={sitio.id}
            className="absolute"
            style={{ left: position.left, top: position.top }}
          >
            {(() => {
              const Icon = ESTATUS_ICON[sitio.estatus];
              return (
                <button
                  type="button"
                  aria-label={sitio.nombre_referencia ?? "Sitio"}
                  className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full shadow-md transition-transform flex items-center justify-center text-white ${
                    isMine
                      ? "h-7 w-7 border-[3px] border-accent ring-2 ring-accent/40"
                      : "h-6 w-6 border-2 border-card opacity-95"
                  } ${isHovered ? "scale-125 z-10" : ""}`}
                  style={{
                    backgroundColor: ESTATUS_COLOR[sitio.estatus] ?? "#888",
                  }}
                  onPointerDown={(event) => event.stopPropagation()}
                  onPointerEnter={() => setHoveredId(sitio.id)}
                  onPointerLeave={() =>
                    setHoveredId((id) => (id === sitio.id ? null : id))
                  }
                  onClick={() => onPinClick?.(sitio)}
                >
                  <Icon className={isMine ? "h-3.5 w-3.5" : "h-3 w-3"} strokeWidth={2.5} />
                </button>
              );
            })()}
            {isHovered && (
              <div
                className="absolute z-20 -translate-x-1/2 pointer-events-none"
                style={{ left: 0, top: 16 }}
              >
                <div className="w-64 rounded-lg border bg-popover text-popover-foreground shadow-xl p-3 text-xs space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-semibold text-sm leading-tight">
                      {sitio.nombre_referencia ?? "Sitio sin nombre"}
                    </div>
                    <span
                      className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold text-white"
                      style={{
                        backgroundColor: ESTATUS_COLOR[sitio.estatus] ?? "#888",
                      }}
                    >
                      {ESTATUS_LABEL[sitio.estatus]}
                    </span>
                  </div>
                  <div className="text-muted-foreground">
                    <span className="font-medium text-foreground">
                      Ejecutivo:{" "}
                    </span>
                    {isMine
                      ? "Tú"
                      : (sitio.vendedor?.nombre ??
                        sitio.vendedor?.email ??
                        "Sin asignar")}
                  </div>
                  {sitio.volumen_m3 != null && (
                    <div>
                      <span className="font-medium">Volumen: </span>
                      {sitio.volumen_m3.toLocaleString()} m³
                    </div>
                  )}
                  {sitio.direccion && (
                    <div>
                      <span className="font-medium">Dirección: </span>
                      {sitio.direccion}
                    </div>
                  )}
                  {sitio.competidor && (
                    <div>
                      <span className="font-medium">Competidor: </span>
                      {sitio.competidor}
                    </div>
                  )}
                  {sitio.notas && (
                    <div className="text-muted-foreground line-clamp-3 whitespace-pre-wrap">
                      <span className="font-medium text-foreground">
                        Notas:{" "}
                      </span>
                      {sitio.notas}
                    </div>
                  )}
                  <div className="text-[10px] text-muted-foreground pt-0.5">
                    {sitio.lat.toFixed(5)}, {sitio.lng.toFixed(5)}
                  </div>
                </div>
              </div>
            )}
          </div>
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