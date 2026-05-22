import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Plus, X, Check, Crosshair, Sparkles, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { MapView } from "@/components/MapView";
import { NewSitioDialog } from "@/components/NewSitioDialog";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { resetAndSeedAll } from "@/lib/seed-sitios";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase, type Sitio } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AlertTriangle, MapPin } from "lucide-react";

type SitioConVendedor = Sitio & {
  vendedor: { nombre: string | null; email: string | null } | null;
};

function leadDisplayName(s: Pick<Sitio, "nombre_referencia" | "direccion" | "lat" | "lng">): string {
  const nombre = s.nombre_referencia?.trim();
  if (nombre) return nombre;
  const direccion = s.direccion?.split(",")[0]?.trim();
  if (direccion && !/^ninguno$/i.test(direccion)) return `Obra ${direccion}`;
  return `Lead ${s.lat.toFixed(4)}, ${s.lng.toFixed(4)}`;
}

// Approx. meters between two coords (haversine)
function distMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
import { ESTATUS_COLOR, ESTATUS_LABEL, ESTATUS_OPTIONS } from "@/lib/sitio-utils";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/map")({
  component: MapPage,
});

function MapPage() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [sitios, setSitios] = useState<SitioConVendedor[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterEstatus, setFilterEstatus] = useState<string>("all");
  const [filterVolumen, setFilterVolumen] = useState<string>("all");
  const [filterOwner, setFilterOwner] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<SitioConVendedor | null>(null);
  const [placing, setPlacing] = useState(false);
  const [placeCoords, setPlaceCoords] = useState<{ lng: number; lat: number } | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dupDialogOpen, setDupDialogOpen] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [initialView, setInitialView] = useState<{ center: [number, number]; zoom: number } | null>(
    { center: [-103.3496, 20.6597], zoom: 15 },
  );

  const locateUser = (showErrors = false) => {
    if (!navigator.geolocation) {
      if (showErrors) toast.error("Tu navegador no soporta geolocalización");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setInitialView({
          center: [pos.coords.longitude, pos.coords.latitude],
          zoom: 15,
        });
        if (showErrors) toast.success("Ubicación encontrada");
      },
      (err) => {
        if (showErrors) {
          toast.error(
            err.code === err.PERMISSION_DENIED
              ? "Permiso de ubicación denegado. Actívalo en los ajustes del navegador."
              : `No se pudo obtener ubicación: ${err.message}`,
          );
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  };

  useEffect(() => {
    locateUser(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSeed() {
    if (!user) return;
    setSeeding(true);
    try {
      await resetAndSeedAll(user, profile?.zona_id ?? null);
      toast.success("Datos de ejemplo recargados");
      await load();
    } catch (e) {
      toast.error(`Error al sembrar: ${(e as Error).message}`);
    } finally {
      setSeeding(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("sitios")
      .select("*, vendedor:vendedor_id(nombre,email)")
      .is("estatus_final", null)
      .order("created_at", { ascending: false });
    if (error) {
      toast.error(`Error al cargar sitios: ${error.message}`);
    } else {
      setSitios((data as unknown as SitioConVendedor[]) ?? []);
    }
    setLoading(false);
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sitios.filter((s) => {
      if (filterEstatus !== "all" && s.estatus !== filterEstatus) return false;
      if (filterOwner === "mine" && s.vendedor_id !== user?.id) return false;
      if (filterOwner === "others" && s.vendedor_id === user?.id) return false;
      if (filterVolumen !== "all") {
        const v = s.volumen_m3 ?? 0;
        if (filterVolumen === "bajo" && !(v < 500)) return false;
        if (filterVolumen === "medio" && !(v >= 500 && v < 3500)) return false;
        if (filterVolumen === "alto" && !(v >= 3500)) return false;
      }
      if (q) {
        const hay = `${leadDisplayName(s)} ${s.direccion ?? ""} ${
          s.licitante ?? ""
        } ${s.vendedor?.nombre ?? ""} ${s.vendedor?.email ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [sitios, filterEstatus, filterVolumen, filterOwner, user?.id, search]);

  // Sitios existentes dentro de un radio (anti-duplicados)
  const PROXIMITY_RADIUS_M = 150;
  const nearbyMatches = useMemo(() => {
    if (!placeCoords) return [];
    const raw = sitios
      .map((s) => ({ sitio: s, d: distMeters(placeCoords, { lat: s.lat, lng: s.lng }) }))
      .filter((x) => x.d <= PROXIMITY_RADIUS_M)
      .sort((a, b) => a.d - b.d);
    // Dedupe: misma ubicación (~5 m) + mismo nombre cuentan como un solo lead
    const seen = new Set<string>();
    const unique: typeof raw = [];
    for (const item of raw) {
      const key = `${leadDisplayName(item.sitio).toLowerCase()}|${item.sitio.lat.toFixed(4)}|${item.sitio.lng.toFixed(4)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(item);
    }
    return unique;
  }, [placeCoords, sitios]);
  const nearbyExisting = nearbyMatches[0] ?? null;

  function startPlacing() {
    setSelected(null);
    setPlaceCoords(null);
    setPlacing(true);

    if (navigator.geolocation && navigator.permissions?.query) {
      navigator.permissions
        .query({ name: "geolocation" as PermissionName })
        .then((status) => {
          if (status.state === "granted") {
            navigator.geolocation.getCurrentPosition(
              (pos) =>
                setPlaceCoords({
                  lng: pos.coords.longitude,
                  lat: pos.coords.latitude,
                }),
              () => {},
              { enableHighAccuracy: true, timeout: 8000 },
            );
          }
        })
        .catch(() => {});
    }
  }

  function cancelPlacing() {
    setPlacing(false);
    setPlaceCoords(null);
  }

  function confirmPlacing() {
    if (!placeCoords) {
      toast.error("Toca el mapa para fijar la ubicación");
      return;
    }
    if (nearbyMatches.length > 0) {
      setDupDialogOpen(true);
      return;
    }
    setDialogOpen(true);
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col relative overflow-hidden">
      <div className="px-3 py-2 border-b bg-card space-y-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre, dirección, licitante o vendedor..."
            className="h-9 pl-8"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto">
          <Select value={filterEstatus} onValueChange={setFilterEstatus}>
            <SelectTrigger className="h-9 w-[160px] shrink-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los estatus</SelectItem>
              {ESTATUS_OPTIONS.map((e) => (
                <SelectItem key={e} value={e}>
                  {ESTATUS_LABEL[e]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterVolumen} onValueChange={setFilterVolumen}>
            <SelectTrigger className="h-9 w-[150px] shrink-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todo volumen</SelectItem>
              <SelectItem value="bajo">0 – 500 m³</SelectItem>
              <SelectItem value="medio">500 – 3,500 m³</SelectItem>
              <SelectItem value="alto">3,500 m³ en adelante</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterOwner} onValueChange={setFilterOwner}>
            <SelectTrigger className="h-9 w-[150px] shrink-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los dueños</SelectItem>
              <SelectItem value="mine">Solo míos</SelectItem>
              <SelectItem value="others">De otros</SelectItem>
            </SelectContent>
          </Select>
          {!loading && sitios.length === 0 && (
            <Button
              size="sm"
              variant="outline"
              className="h-9 shrink-0"
              onClick={handleSeed}
              disabled={seeding}
            >
              <Sparkles className="h-4 w-4 mr-1" />
              {seeding ? "Cargando..." : "Recargar demo"}
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            className="h-9 shrink-0"
            onClick={() => locateUser(true)}
            aria-label="Mi ubicación"
          >
            <Crosshair className="h-4 w-4 mr-1" />
            Ubicarme
          </Button>
          <div className="ml-auto shrink-0 self-center text-xs text-muted-foreground">
            {loading ? "..." : `${filtered.length} sitios`}
          </div>
        </div>
        {placing && (
          <div className="grid grid-cols-[1fr_48px_1fr] gap-2">
            <Button variant="secondary" className="h-10 min-w-0" onClick={cancelPlacing}>
              <X className="h-4 w-4 mr-1" /> Cancelar
            </Button>
            <Button
              variant="outline"
              className="h-10 w-12 shrink-0 bg-card p-0"
              onClick={() => {
                if (!navigator.geolocation) return;
                navigator.geolocation.getCurrentPosition(
                  (pos) =>
                    setPlaceCoords({
                      lng: pos.coords.longitude,
                      lat: pos.coords.latitude,
                    }),
                  (err) => toast.error(`GPS: ${err.message}`),
                  { enableHighAccuracy: true, timeout: 10000 },
                );
              }}
              aria-label="Usar mi ubicación"
            >
              <Crosshair className="h-4 w-4" />
            </Button>
            <Button
              className="h-10 min-w-0"
              onClick={confirmPlacing}
              disabled={!placeCoords}
            >
              <Check className="h-4 w-4 mr-1" /> Continuar
            </Button>
          </div>
        )}
        {placing && nearbyExisting && (
          <div className="text-[11px] text-amber-700 dark:text-amber-400 font-medium flex items-center justify-between gap-2">
            <span>
              ⚠ Sitio a {Math.round(nearbyExisting.d)} m de{" "}
              {nearbyExisting.sitio.vendedor_id === user?.id
                ? "ti"
                : (nearbyExisting.sitio.vendedor?.nombre ??
                  nearbyExisting.sitio.vendedor?.email ??
                  "otro vendedor")}
            </span>
            <button
              type="button"
              className="underline shrink-0"
              onClick={() => {
                setSelected(nearbyExisting.sitio);
                cancelPlacing();
              }}
            >
              Ver
            </button>
          </div>
        )}
      </div>

      <div className="flex-1 min-h-0 relative overflow-hidden">
        <MapView
          sitios={filtered}
          currentUserId={user?.id ?? null}
          center={initialView?.center}
          zoom={initialView?.zoom}
          onPinClick={(s) => {
            // Si está en modo "colocar pin", cancelarlo y abrir el lead
            if (placing) {
              setPlacing(false);
              setPlaceCoords(null);
            }
            void navigate({ to: "/sitios/$sitioId", params: { sitioId: s.id } });
          }}
          onMapClick={(lng, lat) => {
            if (placing) {
              setPlaceCoords({ lng, lat });
            } else {
              setSelected(null);
              setPlaceCoords({ lng, lat });
              setPlacing(true);
            }
          }}
          draggableMarker={placing && placeCoords ? placeCoords : undefined}
          onMarkerDrag={(lng, lat) => setPlaceCoords({ lng, lat })}
          className="absolute inset-0 h-full w-full"
        />

        {!placing && (
          <button
            onClick={startPlacing}
            className="absolute bottom-[calc(5rem_+_env(safe-area-inset-bottom))] right-4 z-40 h-16 w-16 rounded-full bg-accent text-accent-foreground shadow-2xl flex items-center justify-center active:scale-95 transition-transform sm:bottom-4"
            aria-label="Nuevo sitio"
          >
            <Plus className="h-8 w-8" strokeWidth={2.5} />
          </button>
        )}
      </div>

      {selected && !placing && (
        <div className="absolute bottom-[calc(5rem_+_env(safe-area-inset-bottom))] right-4 left-4 sm:bottom-4 sm:left-auto sm:w-[340px] z-40 max-h-[45vh] overflow-y-auto bg-card border rounded-2xl shadow-2xl p-4 animate-in slide-in-from-bottom">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold truncate">
                {leadDisplayName(selected)}
              </h3>
              <p className="text-xs text-muted-foreground truncate">
                {selected.direccion ?? `${selected.lat.toFixed(5)}, ${selected.lng.toFixed(5)}`}
              </p>
            </div>
            <Button size="icon" variant="ghost" onClick={() => setSelected(null)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex flex-wrap gap-2 mb-3">
            <Badge
              style={{
                backgroundColor: ESTATUS_COLOR[selected.estatus],
                color: "white",
              }}
            >
              {ESTATUS_LABEL[selected.estatus]}
            </Badge>
            {selected.volumen_m3 != null && (
              <Badge variant="outline">{selected.volumen_m3.toLocaleString()} m³</Badge>
            )}
            {selected.vendedor_id === user?.id ? (
              <Badge className="bg-accent text-accent-foreground">Tú llevas este lead</Badge>
            ) : (
              <Badge variant="secondary">
                Asignado a{" "}
                {selected.vendedor?.nombre ?? selected.vendedor?.email ?? "otro vendedor"}
              </Badge>
            )}
          </div>
          {selected.vendedor_id !== user?.id && (
            <p className="text-xs text-muted-foreground mb-3">
              Solo el vendedor asignado puede dar seguimiento a esta oportunidad.
            </p>
          )}
          <Link
            to="/sitios/$sitioId"
            params={{ sitioId: selected.id }}
            className="block w-full text-center h-12 leading-[3rem] rounded-md bg-primary text-primary-foreground font-medium"
          >
            Ver detalle
          </Link>
        </div>
      )}

      <NewSitioDialog
        open={dialogOpen}
        coords={placeCoords}
        onOpenChange={setDialogOpen}
        onCreated={() => {
          setDialogOpen(false);
          setPlacing(false);
          setPlaceCoords(null);
          void load();
        }}
      />

      <Dialog open={dupDialogOpen} onOpenChange={setDupDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Posible duplicado
            </DialogTitle>
            <DialogDescription>
              Encontramos {nearbyMatches.length}{" "}
              {nearbyMatches.length === 1 ? "oportunidad" : "oportunidades"} a menos de{" "}
              {PROXIMITY_RADIUS_M} m. Verifica que no sea el mismo lead antes de registrar uno
              nuevo.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 max-h-64 overflow-y-auto">
            {nearbyMatches.map(({ sitio, d }) => {
              const mine = sitio.vendedor_id === user?.id;
              return (
                <button
                  key={sitio.id}
                  type="button"
                  onClick={() => {
                    setDupDialogOpen(false);
                    cancelPlacing();
                    void navigate({
                      to: "/sitios/$sitioId",
                      params: { sitioId: sitio.id },
                    });
                  }}
                  className="w-full text-left p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="font-medium text-sm truncate">
                      {leadDisplayName(sitio)}
                    </div>
                    <Badge
                      variant="outline"
                      className="shrink-0 text-[10px]"
                      style={{ borderColor: ESTATUS_COLOR[sitio.estatus] }}
                    >
                      {ESTATUS_LABEL[sitio.estatus]}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <MapPin className="h-3 w-3" />
                    <span>{Math.round(d)} m</span>
                    <span>·</span>
                    <span className="truncate">
                      {mine
                        ? "Tú"
                        : (sitio.vendedor?.nombre ?? sitio.vendedor?.email ?? "Otro vendedor")}
                    </span>
                    {sitio.volumen_m3 != null && (
                      <>
                        <span>·</span>
                        <span>{sitio.volumen_m3} m³</span>
                      </>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setDupDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => {
                setDupDialogOpen(false);
                setDialogOpen(true);
              }}
            >
              Crear de todos modos
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
