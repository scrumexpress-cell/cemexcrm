import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { getMapboxToken } from "@/lib/mapbox-token";
import { AlertTriangle, Camera, Factory, Loader2, MapPin } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
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
import {
  supabase,
  type SitioCercano,
  type SitioEstatus,
} from "@/integrations/supabase/client";
import { ESTATUS_LABEL, ESTATUS_OPTIONS } from "@/lib/sitio-utils";
import { plantaMasCercana } from "@/lib/geo";
import { enqueueSitio } from "@/lib/offline-queue";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";

interface Props {
  open: boolean;
  coords: { lng: number; lat: number } | null;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

export function NewSitioDialog({ open, coords, onOpenChange, onCreated }: Props) {
  const { profile, user } = useAuth();
  const [nombre, setNombre] = useState("");
  const [direccion, setDireccion] = useState("");
  const [estatus, setEstatus] = useState<SitioEstatus>("prospecto");
  const [rangoVolumen, setRangoVolumen] = useState<"bajo" | "medio" | "alto">("bajo");
  const [notas, setNotas] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loadingAddr, setLoadingAddr] = useState(false);
  const [cercanos, setCercanos] = useState<SitioCercano[]>([]);
  const [checkingDup, setCheckingDup] = useState(false);

  // Planta CEMEX más cercana (geocerca automática)
  const plantaCercana = coords ? plantaMasCercana(coords) : null;

  // Detección de duplicados por proximidad (300 m)
  useEffect(() => {
    if (!open || !coords) {
      setCercanos([]);
      return;
    }
    let cancelled = false;
    setCheckingDup(true);
    supabase
      .rpc("sitios_cercanos", {
        p_lat: coords.lat,
        p_lng: coords.lng,
        p_radio_m: 300,
      })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setCercanos([]);
        } else {
          setCercanos((data as SitioCercano[]) ?? []);
        }
      })
      .then(() => {
        if (!cancelled) setCheckingDup(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, coords?.lat, coords?.lng]);

  // Geocodificación inversa: al abrir el diálogo con coords, jala la dirección
  useEffect(() => {
    if (!open || !coords) return;
    const token = getMapboxToken();
    if (!token) return;
    let cancelled = false;
    setLoadingAddr(true);
    fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${coords.lng},${coords.lat}.json?language=es&limit=1&access_token=${token}`,
    )
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const place = data?.features?.[0]?.place_name as string | undefined;
        if (place) setDireccion((prev) => (prev ? prev : place));
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoadingAddr(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, coords?.lat, coords?.lng]);

  function reset() {
    setNombre("");
    setDireccion("");
    setEstatus("prospecto");
    setVolumen("");
    setNotas("");
    setPhoto(null);
    setCercanos([]);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!coords || !user) return;
    setSubmitting(true);

    const payload = {
      lat: coords.lat,
      lng: coords.lng,
      nombre_referencia: nombre || null,
      direccion: direccion || null,
      estatus,
      volumen_m3: volumen ? Number(volumen) : null,
      vendedor_id: user.id,
      zona_id: profile?.zona_id ?? null,
      notas: notas || null,
    };

    // Modo offline: encolar para sincronizar después
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      await enqueueSitio(payload);
      setSubmitting(false);
      toast.success("Sin conexión: el sitio se guardó local y se sincronizará después");
      reset();
      onCreated();
      return;
    }

    const { data: sitio, error } = await supabase
      .from("sitios")
      .insert(payload)
      .select()
      .single();

    if (error || !sitio) {
      // si falla por red, encolar como fallback
      if (error && /network|fetch/i.test(error.message)) {
        await enqueueSitio(payload);
        setSubmitting(false);
        toast.success("Sin conexión: guardado local, se sincronizará");
        reset();
        onCreated();
        return;
      }
      setSubmitting(false);
      toast.error(`Error al crear sitio: ${error?.message ?? "desconocido"}`);
      return;
    }

    if (photo) {
      const path = `${sitio.id}/${Date.now()}-${photo.name.replace(/[^\w.-]/g, "_")}`;
      const { error: upErr } = await supabase.storage
        .from("sitio-fotos")
        .upload(path, photo, { contentType: photo.type });
      if (!upErr) {
        await supabase
          .from("fotos")
          .insert({ sitio_id: sitio.id, storage_path: path });
      }
    }

    setSubmitting(false);
    toast.success("Sitio creado");
    reset();
    onCreated();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nuevo sitio</DialogTitle>
          <DialogDescription className="flex items-center gap-1 text-xs">
            <MapPin className="h-3 w-3" />
            {coords
              ? `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`
              : "Sin ubicación"}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-3">
          {checkingDup && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Buscando obras cercanas...
            </div>
          )}
          {cercanos.length > 0 && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/20 p-2.5 text-xs space-y-1.5">
              <div className="flex items-center gap-1.5 font-medium text-amber-800 dark:text-amber-300">
                <AlertTriangle className="h-3.5 w-3.5" />
                {cercanos.length === 1
                  ? "Posible duplicado"
                  : `${cercanos.length} obras cercanas`}
              </div>
              <p className="text-amber-700 dark:text-amber-400">
                Verifica que no sea la misma obra antes de registrar.
              </p>
              <ul className="space-y-1 mt-1">
                {cercanos.slice(0, 3).map((c) => (
                  <li key={c.id}>
                    <Link
                      to="/sitios/$sitioId"
                      params={{ sitioId: c.id }}
                      onClick={() => onOpenChange(false)}
                      className="block rounded border bg-card px-2 py-1 hover:bg-muted/50"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium truncate">
                          {c.nombre_referencia ?? "Sin nombre"}
                        </span>
                        <span className="text-[10px] tabular-nums text-muted-foreground shrink-0">
                          {Math.round(c.distancia_m)} m
                        </span>
                      </div>
                      <div className="text-[10px] text-muted-foreground truncate">
                        {c.vendedor_id === user?.id
                          ? "Tú"
                          : (c.vendedor_nombre ?? c.vendedor_email ?? "Otro vendedor")}
                        {c.volumen_m3 != null && ` · ${c.volumen_m3} m³`}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {plantaCercana && plantaCercana.distancia <= 30000 && (
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Factory className="h-3 w-3" />
              Planta más cercana:{" "}
              <span className="font-medium text-foreground">
                {plantaCercana.planta.nombre}
              </span>{" "}
              ({(plantaCercana.distancia / 1000).toFixed(1)} km)
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Nombre / referencia</Label>
            <Input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej. Obra Av. Lázaro Cárdenas"
              className="h-10"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Estatus</Label>
              <Select value={estatus} onValueChange={(v) => setEstatus(v as SitioEstatus)}>
                <SelectTrigger className="h-10">
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
            <div className="space-y-1.5">
              <Label>Volumen (m³)</Label>
              <Input
                type="number"
                inputMode="numeric"
                value={volumen}
                onChange={(e) => setVolumen(e.target.value)}
                placeholder="1500"
                className="h-10"
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
          </div>

          <div className="space-y-1.5">
            <Label className="flex items-center gap-2">
              Dirección
              {loadingAddr && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
            </Label>
            <Input
              value={direccion}
              onChange={(e) => setDireccion(e.target.value)}
              placeholder={loadingAddr ? "Obteniendo dirección..." : ""}
              className="h-10"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Notas</Label>
            <Textarea
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              rows={2}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Foto</Label>
            <label className="flex items-center justify-center gap-2 h-16 border-2 border-dashed rounded-lg cursor-pointer text-xs text-muted-foreground hover:bg-muted/50">
              <Camera className="h-4 w-4" />
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

          <DialogFooter className="gap-2 sm:gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={submitting || !coords}>
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" /> Guardando
                </>
              ) : (
                "Guardar"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
