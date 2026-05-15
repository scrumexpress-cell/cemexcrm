import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
  type Sitio,
  type TareaTipo,
} from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";

const TIPOS: { value: TareaTipo; label: string }[] = [
  { value: "llamada", label: "Llamada" },
  { value: "visita", label: "Visita" },
  { value: "cotizacion", label: "Cotización" },
  { value: "seguimiento", label: "Seguimiento" },
  { value: "muestra", label: "Muestra" },
  { value: "otro", label: "Otro" },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
  // Si viene preconfigurado para un sitio:
  sitioId?: string;
  defaultVendedorId?: string | null;
}

export function TareaDialog({
  open,
  onOpenChange,
  onCreated,
  sitioId,
  defaultVendedorId,
}: Props) {
  const { user } = useAuth();
  const [tipo, setTipo] = useState<TareaTipo>("seguimiento");
  const [titulo, setTitulo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [fecha, setFecha] = useState(() => {
    const t = new Date();
    t.setDate(t.getDate() + 1);
    return t.toISOString().slice(0, 10);
  });
  const [sitioElegido, setSitioElegido] = useState<string | null>(sitioId ?? null);
  const [misSitios, setMisSitios] = useState<Sitio[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (sitioId) {
      setSitioElegido(sitioId);
      return;
    }
    if (!user) return;
    // cargar lista de sitios del vendedor para elegir
    void supabase
      .from("sitios")
      .select("*")
      .eq("vendedor_id", user.id)
      .is("estatus_final", null)
      .order("created_at", { ascending: false })
      .limit(50)
      .then(({ data }) => {
        setMisSitios((data as Sitio[]) ?? []);
      });
  }, [open, sitioId, user?.id]);

  function reset() {
    setTipo("seguimiento");
    setTitulo("");
    setDescripcion("");
    const t = new Date();
    t.setDate(t.getDate() + 1);
    setFecha(t.toISOString().slice(0, 10));
    if (!sitioId) setSitioElegido(null);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    const sid = sitioElegido ?? sitioId;
    if (!sid) {
      toast.error("Elige un sitio para la tarea");
      return;
    }
    if (!titulo.trim()) {
      toast.error("Pon un título a la tarea");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("tareas").insert({
      sitio_id: sid,
      vendedor_id: defaultVendedorId ?? user.id,
      creada_por: user.id,
      tipo,
      titulo: titulo.trim(),
      descripcion: descripcion.trim() || null,
      fecha_objetivo: fecha,
    });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Tarea creada");
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nueva tarea</DialogTitle>
          <DialogDescription className="text-xs">
            Te recordaremos antes de que se venza.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-3">
          {!sitioId && (
            <div className="space-y-1.5">
              <Label>Sitio</Label>
              <Select
                value={sitioElegido ?? ""}
                onValueChange={(v) => setSitioElegido(v)}
              >
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="Elige un sitio" />
                </SelectTrigger>
                <SelectContent>
                  {misSitios.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.nombre_referencia ?? "Sin nombre"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Título</Label>
            <Input
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ej. Llamar al ingeniero Pérez"
              className="h-10"
              maxLength={120}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select value={tipo} onValueChange={(v) => setTipo(v as TareaTipo)}>
                <SelectTrigger className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIPOS.map((t) => (
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
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                className="h-10"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Notas (opcional)</Label>
            <Textarea
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              rows={2}
            />
          </div>

          <DialogFooter className="gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              className="flex-1 h-11"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={saving} className="flex-1 h-11">
              {saving ? "Guardando..." : "Crear tarea"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
