import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Camera, Crosshair, Loader2 } from "lucide-react";
import { MapView } from "@/components/MapView";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase, type SitioEstatus } from "@/integrations/supabase/client";
import { ESTATUS_LABEL, ESTATUS_OPTIONS } from "@/lib/sitio-utils";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/sitios/nuevo")({
  component: NuevoSitioPage,
});

function NuevoSitioPage() {
  const navigate = useNavigate();
  const { profile, user } = useAuth();
  const [coords, setCoords] = useState<{ lng: number; lat: number } | null>(
    null,
  );
  const [gpsLoading, setGpsLoading] = useState(false);
  const [nombre, setNombre] = useState("");
  const [direccion, setDireccion] = useState("");
  const [estatus, setEstatus] = useState<SitioEstatus>("prospecto");
  const [volumen, setVolumen] = useState<string>("");
  const [notas, setNotas] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    // Solo intentar GPS automáticamente si el permiso ya fue concedido
    if (!navigator.geolocation) return;
    if (navigator.permissions?.query) {
      navigator.permissions
        .query({ name: "geolocation" as PermissionName })
        .then((status) => {
          if (status.state === "granted") captureGps();
          else if (status.state === "prompt") captureGps();
          else {
            // denied: mostrar mapa con ubicación por defecto, sin error
            setCoords({ lng: -99.1332, lat: 19.4326 });
            toast.info("Toca el mapa o arrastra el pin para fijar la ubicación", { duration: 5000 });
          }
        })
        .catch(() => captureGps());
    } else {
      captureGps();
    }
  }, []);

  function captureGps() {
    if (!navigator.geolocation) {
      toast.error("Tu dispositivo no soporta GPS");
      return;
    }
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lng: pos.coords.longitude, lat: pos.coords.latitude });
        setGpsLoading(false);
        toast.success("Ubicación capturada");
      },
      (err) => {
        setGpsLoading(false);
        if (err.code === err.PERMISSION_DENIED) {
          toast.error(
            "Permiso de ubicación denegado. Habilítalo en los ajustes del navegador o toca el mapa para fijar la ubicación manualmente.",
            { duration: 6000 },
          );
          // Centrar mapa en una ubicación por defecto (CDMX) para permitir tap manual
          setCoords((c) => c ?? { lng: -99.1332, lat: 19.4326 });
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          toast.error("Ubicación no disponible. Toca el mapa para fijarla manualmente.");
          setCoords((c) => c ?? { lng: -99.1332, lat: 19.4326 });
        } else if (err.code === err.TIMEOUT) {
          toast.error("Tiempo agotado al obtener GPS. Inténtalo de nuevo.");
        } else {
          toast.error(`No se pudo capturar GPS: ${err.message}`);
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!coords) {
      toast.error("Necesitas una ubicación (GPS o tap en mapa)");
      return;
    }
    if (!user) return;
    setSubmitting(true);

    const { data: sitio, error } = await supabase
      .from("sitios")
      .insert({
        lat: coords.lat,
        lng: coords.lng,
        nombre_referencia: nombre || null,
        direccion: direccion || null,
        estatus,
        volumen_m3: volumen ? Number(volumen) : null,
        vendedor_id: user.id,
        zona_id: profile?.zona_id ?? null,
        notas: notas || null,
      })
      .select()
      .single();

    if (error || !sitio) {
      setSubmitting(false);
      toast.error(`Error al crear sitio: ${error?.message ?? "desconocido"}`);
      return;
    }

    if (photo) {
      const path = `${sitio.id}/${Date.now()}-${photo.name.replace(/[^\w.-]/g, "_")}`;
      const { error: upErr } = await supabase.storage
        .from("sitio-fotos")
        .upload(path, photo, { contentType: photo.type });
      if (upErr) {
        toast.error(`Sitio creado, pero foto falló: ${upErr.message}`);
      } else {
        await supabase
          .from("fotos")
          .insert({ sitio_id: sitio.id, storage_path: path });
      }
    }

    toast.success("Sitio creado");
    navigate({ to: "/map" });
  }

  return (
    <div className="flex-1 flex flex-col">
      <div className="h-64 relative bg-muted">
        {coords ? (
          <MapView
            sitios={[]}
            draggableMarker={coords}
            onMarkerDrag={(lng, lat) => setCoords({ lng, lat })}
            onMapClick={(lng, lat) => setCoords({ lng, lat })}
            className="absolute inset-0"
          />
        ) : (
          <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
            {gpsLoading ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Buscando ubicación...
              </span>
            ) : (
              "Sin ubicación"
            )}
          </div>
        )}
        <Button
          size="sm"
          variant="secondary"
          onClick={captureGps}
          disabled={gpsLoading}
          className="absolute top-3 left-3 z-10 shadow"
        >
          <Crosshair className="h-4 w-4 mr-1" /> GPS
        </Button>
      </div>

      <form onSubmit={onSubmit} className="flex-1 px-4 py-4 space-y-4">
        <div className="space-y-2">
          <Label>Nombre / referencia</Label>
          <Input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Ej. Obra Av. Lázaro Cárdenas"
            className="h-12"
          />
        </div>

        <div className="space-y-2">
          <Label>Estatus</Label>
          <Select value={estatus} onValueChange={(v) => setEstatus(v as SitioEstatus)}>
            <SelectTrigger className="h-12">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ESTATUS_OPTIONS.map((e) => (
                <SelectItem key={e} value={e}>
                  {ESTATUS_LABEL[e]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Volumen estimado (m³)</Label>
          <Input
            type="number"
            inputMode="numeric"
            value={volumen}
            onChange={(e) => setVolumen(e.target.value)}
            placeholder="Ej. 1500"
            className="h-12"
          />
          {volumen && Number(volumen) >= 5000 && (
            <p className="text-xs text-red-600 font-medium">
              🔴 Volumen alto — se notificará a gerente y head
            </p>
          )}
          {volumen && Number(volumen) >= 500 && Number(volumen) < 5000 && (
            <p className="text-xs text-yellow-600 font-medium">
              🟡 Volumen medio — se notificará al gerente
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label>Dirección (opcional)</Label>
          <Input
            value={direccion}
            onChange={(e) => setDireccion(e.target.value)}
            className="h-12"
          />
        </div>

        <div className="space-y-2">
          <Label>Notas</Label>
          <Textarea
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            rows={3}
          />
        </div>

        <div className="space-y-2">
          <Label>Foto</Label>
          <label className="flex items-center justify-center gap-2 h-24 border-2 border-dashed rounded-lg cursor-pointer text-sm text-muted-foreground hover:bg-muted/50">
            <Camera className="h-5 w-5" />
            {photo ? photo.name : "Tomar / subir foto"}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
            />
          </label>
        </div>

        <div className="flex gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            className="flex-1 h-12"
            onClick={() => navigate({ to: "/map" })}
          >
            Cancelar
          </Button>
          <Button
            type="submit"
            disabled={submitting || !coords}
            className="flex-1 h-12"
          >
            {submitting ? "Guardando..." : "Guardar"}
          </Button>
        </div>
      </form>
    </div>
  );
}
