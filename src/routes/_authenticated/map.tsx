import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Plus, X, Check, Crosshair, Sparkles } from "lucide-react";
import { MapView } from "@/components/MapView";
import { NewSitioDialog } from "@/components/NewSitioDialog";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { seedSampleSitios } from "@/lib/seed-sitios";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase, type Sitio } from "@/integrations/supabase/client";

type SitioConVendedor = Sitio & {
  vendedor: { nombre: string | null; email: string | null } | null;
};

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
import {
  ESTATUS_COLOR,
  ESTATUS_LABEL,
  ESTATUS_OPTIONS,
} from "@/lib/sitio-utils";
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
  const [selected, setSelected] = useState<SitioConVendedor | null>(null);
  const [placing, setPlacing] = useState(false);
  const [placeCoords, setPlaceCoords] = useState<{ lng: number; lat: number } | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [seeding, setSeeding] = useState(false);

  async function handleSeed() {
    if (!user) return;
    setSeeding(true);
    try {
      await seedSampleSitios({ user, zonaId: profile?.zona_id ?? null });
      toast.success("10 sitios de ejemplo cargados");
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
    return sitios.filter((s) => {
      if (filterEstatus !== "all" && s.estatus !== filterEstatus) return false;
      if (filterOwner === "mine" && s.vendedor_id !== user?.id) return false;
      if (filterOwner === "others" && s.vendedor_id === user?.id) return false;
      if (filterVolumen !== "all") {
        const v = s.volumen_m3 ?? 0;
        if (filterVolumen === "0-499" && !(v < 500)) return false;
        if (filterVolumen === "500-999" && !(v >= 500 && v < 1000)) return false;
        if (filterVolumen === "1000-4999" && !(v >= 1000 && v < 5000))
          return false;
        if (filterVolumen === "5000+" && !(v >= 5000)) return false;
      }
      return true;
    });
  }, [sitios, filterEstatus, filterVolumen, filterOwner, user?.id]);

  // Sitios existentes dentro de un radio (anti-duplicados)
  const PROXIMITY_RADIUS_M = 100;
  const nearbyMatches = useMemo(() => {
    if (!placeCoords) return [];
    return sitios
      .map((s) => ({ sitio: s, d: distMeters(placeCoords, { lat: s.lat, lng: s.lng }) }))
      .filter((x) => x.d <= PROXIMITY_RADIUS_M)
      .sort((a, b) => a.d - b.d);
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
    setDialogOpen(true);
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col relative">
      <div className="px-3 py-2 border-b bg-card flex gap-2 overflow-x-auto">
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
            <SelectItem value="0-499">&lt; 500 m³</SelectItem>
            <SelectItem value="500-999">500 – 999 m³</SelectItem>
            <SelectItem value="1000-4999">1,000 – 4,999 m³</SelectItem>
            <SelectItem value="5000+">5,000+ m³</SelectItem>
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
            {seeding ? "Cargando..." : "10 ejemplos"}
          </Button>
        )}
        <div className="ml-auto shrink-0 self-center text-xs text-muted-foreground">
          {loading ? "..." : `${filtered.length} sitios`}
        </div>
      </div>

      <div className="flex-1 min-h-[360px] relative overflow-hidden">
        <MapView
          sitios={placing ? [] : filtered}
          currentUserId={user?.id ?? null}
          onPinClick={(s) => {
            if (placing) return;
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

        {placing && (
          <div className="absolute top-3 left-3 right-20 z-10 bg-card/95 backdrop-blur border rounded-lg px-3 py-2 shadow-lg text-sm space-y-1">
            <div className="font-medium">Ubica el nuevo sitio</div>
            <div className="text-xs text-muted-foreground">
              Toca el mapa o arrastra el pin azul para fijar el punto.
            </div>
            {nearbyExisting && (
              <div className="text-xs text-amber-700 dark:text-amber-400 font-medium space-y-1 pt-1">
                <div>
                  ⚠ Hay un sitio a {Math.round(nearbyExisting.d)} m de{" "}
                  {nearbyExisting.sitio.vendedor_id === user?.id
                    ? "ti"
                    : (nearbyExisting.sitio.vendedor?.nombre ??
                      nearbyExisting.sitio.vendedor?.email ??
                      "otro vendedor")}
                  . Verifica que no sea el mismo lead.
                </div>
                <button
                  type="button"
                  className="underline font-semibold"
                  onClick={() => {
                    setSelected(nearbyExisting.sitio);
                    cancelPlacing();
                  }}
                >
                  Ver sitio existente
                </button>
              </div>
            )}
          </div>
        )}

        {!placing && (
          <button
            onClick={startPlacing}
            className="absolute bottom-6 right-6 h-16 w-16 rounded-full bg-accent text-accent-foreground shadow-2xl flex items-center justify-center active:scale-95 transition-transform"
            aria-label="Nuevo sitio"
          >
            <Plus className="h-8 w-8" strokeWidth={2.5} />
          </button>
        )}

        {placing && (
          <div className="absolute bottom-6 inset-x-4 z-10 flex gap-2">
            <Button
              variant="secondary"
              className="flex-1 h-12 shadow-lg"
              onClick={cancelPlacing}
            >
              <X className="h-4 w-4 mr-1" /> Cancelar
            </Button>
            <Button
              variant="outline"
              className="h-12 shadow-lg bg-card"
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
              className="flex-1 h-12 shadow-lg"
              onClick={confirmPlacing}
              disabled={!placeCoords}
            >
              <Check className="h-4 w-4 mr-1" /> Continuar
            </Button>
          </div>
        )}
      </div>

      {selected && !placing && (
        <div className="absolute inset-x-0 bottom-0 z-20 bg-card border-t rounded-t-2xl shadow-2xl p-4 pb-6 animate-in slide-in-from-bottom">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold truncate">
                {selected.nombre_referencia ?? "Sitio sin nombre"}
              </h3>
              <p className="text-xs text-muted-foreground truncate">
                {selected.direccion ?? `${selected.lat.toFixed(5)}, ${selected.lng.toFixed(5)}`}
              </p>
            </div>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setSelected(null)}
            >
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
              <Badge variant="outline">
                {selected.volumen_m3.toLocaleString()} m³
              </Badge>
            )}
            {selected.vendedor_id === user?.id ? (
              <Badge className="bg-accent text-accent-foreground">
                Tú llevas este lead
              </Badge>
            ) : (
              <Badge variant="secondary">
                Asignado a{" "}
                {selected.vendedor?.nombre ??
                  selected.vendedor?.email ??
                  "otro vendedor"}
              </Badge>
            )}
          </div>
          {selected.vendedor_id !== user?.id && (
            <p className="text-xs text-muted-foreground mb-3">
              Solo el vendedor asignado puede dar seguimiento a esta
              oportunidad.
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
    </div>
  );
}
