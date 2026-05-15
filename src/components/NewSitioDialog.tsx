import { useEffect, useState } from "react";
import { getMapboxToken } from "@/lib/mapbox-token";
import { Camera, Loader2, MapPin } from "lucide-react";
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
import { supabase, type SitioEstatus } from "@/integrations/supabase/client";
import { ESTATUS_LABEL, ESTATUS_OPTIONS } from "@/lib/sitio-utils";
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
  const [volumen, setVolumen] = useState("");
  const [notas, setNotas] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loadingAddr, setLoadingAddr] = useState(false);

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
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!coords || !user) return;
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
