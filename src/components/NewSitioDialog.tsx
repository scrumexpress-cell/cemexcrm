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
  type Profile,
  type SitioCercano,
  type SitioEstatus,
  type TareaTipo,
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

function dedupeSitiosCercanos(items: SitioCercano[]): SitioCercano[] {
  const seen = new Set<string>();
  const unique: SitioCercano[] = [];

  for (const item of items) {
    const nombre = (
      item.nombre_referencia?.trim() ||
      item.direccion?.split(",")[0]?.trim() ||
      "lead"
    )
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ");
    const key = `${nombre}|${item.lat.toFixed(4)}|${item.lng.toFixed(4)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
  }

  return unique;
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

  // Tarea inicial (obligatoria)
  const TAREA_TIPOS: { value: TareaTipo; label: string }[] = [
    { value: "llamada", label: "Llamada" },
    { value: "visita", label: "Visita" },
    { value: "cotizacion", label: "Cotización" },
    { value: "seguimiento", label: "Seguimiento" },
    { value: "muestra", label: "Muestra" },
    { value: "otro", label: "Otro" },
  ];
  const [tareaTipo, setTareaTipo] = useState<TareaTipo>("visita");
  const [tareaTitulo, setTareaTitulo] = useState("");
  const [tareaFecha, setTareaFecha] = useState(() => {
    const t = new Date();
    t.setDate(t.getDate() + 1);
    return t.toISOString().slice(0, 10);
  });
  const [tareaAsignado, setTareaAsignado] = useState<string>("");
  const [asignables, setAsignables] = useState<Profile[]>([]);

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
          setCercanos(dedupeSitiosCercanos((data as SitioCercano[]) ?? []));
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

  // Cargar usuarios asignables y default = logueado
  useEffect(() => {
    if (!open || !user) return;
    setTareaAsignado((prev) => prev || user.id);
    void supabase
      .from("profiles")
      .select("*")
      .in("role", ["vendedor", "gerente", "head"])
      .order("nombre", { ascending: true })
      .then(({ data }) => {
        setAsignables((data as Profile[]) ?? []);
      });
  }, [open, user?.id]);

  function reset() {
    setNombre("");
    setDireccion("");
    setEstatus("prospecto");
    setRangoVolumen("bajo");
    setNotas("");
    setPhoto(null);
    setCercanos([]);
    setTareaTipo("visita");
    setTareaTitulo("");
    const t = new Date();
    t.setDate(t.getDate() + 1);
    setTareaFecha(t.toISOString().slice(0, 10));
    setTareaAsignado(user?.id ?? "");
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!coords || !user) return;
    if (!nombre.trim()) {
      toast.error("Ponle nombre al lead");
      return;
    }
    if (!tareaTitulo.trim()) {
      toast.error("Pon un título a la tarea inicial");
      return;
    }
    if (!tareaFecha) {
      toast.error("Elige la fecha de la tarea inicial");
      return;
    }
    if (!tareaAsignado) {
      toast.error("Elige a quién se le asigna la tarea inicial");
      return;
    }
    setSubmitting(true);

    const payload = {
      lat: coords.lat,
      lng: coords.lng,
      nombre_referencia: nombre.trim(),
      direccion: direccion || null,
      estatus,
      volumen_m3: rangoVolumen === "alto" ? 5000 : rangoVolumen === "medio" ? 1000 : 100,
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

    // Tarea inicial obligatoria
    const { error: tareaErr } = await supabase.from("tareas").insert({
      sitio_id: sitio.id,
      vendedor_id: tareaAsignado,
      creada_por: user.id,
      tipo: tareaTipo,
      titulo: tareaTitulo.trim(),
      fecha_objetivo: tareaFecha,
    });
    if (tareaErr) {
      toast.error(`Sitio creado, pero falló la tarea: ${tareaErr.message}`);
    }

    setSubmitting(false);
    toast.success("Sitio y tarea inicial creados");
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
                          {c.nombre_referencia?.trim() || c.direccion?.split(",")[0]?.trim() || "Lead cercano"}
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
              required
              className="h-10"
            />
          </div>

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
            <Label>Volumen estimado</Label>
            <div className="grid gap-2">
              {([
                { value: "bajo", label: "0 – 500 m³", hint: "Sin alerta", tone: "text-muted-foreground" },
                { value: "medio", label: "500 – 3,500 m³", hint: "🟡 Alerta al jefe de ventas", tone: "text-yellow-600" },
                { value: "alto", label: "3,500 m³ en adelante", hint: "🔴 Oportunidad estratégica — alerta a Mauricio", tone: "text-red-600" },
              ] as const).map((opt) => (
                <label
                  key={opt.value}
                  className={`flex items-start gap-2 rounded-lg border p-2.5 cursor-pointer transition ${
                    rangoVolumen === opt.value ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                  }`}
                >
                  <input
                    type="radio"
                    name="rangoVolumen"
                    value={opt.value}
                    checked={rangoVolumen === opt.value}
                    onChange={() => setRangoVolumen(opt.value)}
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <div className="text-sm font-medium">{opt.label}</div>
                    <div className={`text-xs ${opt.tone}`}>{opt.hint}</div>
                  </div>
                </label>
              ))}
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

          <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-3">
            <div className="text-sm font-semibold">Tarea inicial</div>
            <p className="text-[11px] text-muted-foreground -mt-2">
              Define el siguiente paso para no perder esta oportunidad.
            </p>

            <div className="space-y-1.5">
              <Label>Título</Label>
              <Input
                value={tareaTitulo}
                onChange={(e) => setTareaTitulo(e.target.value)}
                placeholder="Ej. Visitar obra y validar volumen"
                className="h-10"
                maxLength={120}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Tipo</Label>
                <Select value={tareaTipo} onValueChange={(v) => setTareaTipo(v as TareaTipo)}>
                  <SelectTrigger className="h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TAREA_TIPOS.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Fecha</Label>
                <Input
                  type="date"
                  value={tareaFecha}
                  onChange={(e) => setTareaFecha(e.target.value)}
                  className="h-10"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Asignar a</Label>
              <Select value={tareaAsignado} onValueChange={setTareaAsignado}>
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="Elige a un responsable" />
                </SelectTrigger>
                <SelectContent>
                  {user && !asignables.some((a) => a.id === user.id) && (
                    <SelectItem value={user.id}>
                      {profile?.nombre ?? profile?.email ?? "Yo"} (yo)
                    </SelectItem>
                  )}
                  {asignables.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {(p.nombre ?? p.email ?? "Sin nombre")}
                      {p.id === user?.id ? " (yo)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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
