import { useEffect, useState } from "react";
import { CheckCircle2, Circle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
  type Tarea,
  type TareaTipo,
} from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";

interface Props {
  sitioId: string;
  vendedorId: string | null;
  disabled?: boolean;
}

const TAREA_TIPOS: { value: TareaTipo; label: string }[] = [
  { value: "llamada", label: "Llamada" },
  { value: "visita", label: "Visita" },
  { value: "cotizacion", label: "Cotización" },
  { value: "seguimiento", label: "Seguimiento" },
  { value: "muestra", label: "Muestra" },
  { value: "otro", label: "Otro" },
];

export function SitioTareas({ sitioId, vendedorId, disabled }: Props) {
  const { user, profile } = useAuth();
  const [tareas, setTareas] = useState<Tarea[]>([]);
  const [asignables, setAsignables] = useState<Profile[]>([]);

  // Inline form (mismo formato que la tarea inicial)
  const [titulo, setTitulo] = useState("");
  const [tipo, setTipo] = useState<TareaTipo>("visita");
  const [fecha, setFecha] = useState(() => {
    const t = new Date();
    t.setDate(t.getDate() + 1);
    return t.toISOString().slice(0, 10);
  });
  const [asignado, setAsignado] = useState<string>("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sitioId]);

  useEffect(() => {
    if (!user) return;
    setAsignado((prev) => prev || vendedorId || user.id);
    void supabase
      .from("profiles")
      .select("*")
      .in("role", ["vendedor", "gerente", "head"])
      .order("nombre", { ascending: true })
      .then(({ data }) => {
        setAsignables((data as Profile[]) ?? []);
      });
  }, [user?.id, vendedorId]);

  async function load() {
    const { data } = await supabase
      .from("tareas")
      .select("*")
      .eq("sitio_id", sitioId)
      .order("completada", { ascending: true })
      .order("fecha_objetivo", { ascending: true });
    setTareas((data as Tarea[]) ?? []);
  }

  async function toggle(t: Tarea) {
    const { error } = await supabase
      .from("tareas")
      .update({
        completada: !t.completada,
        completada_en: !t.completada ? new Date().toISOString() : null,
      })
      .eq("id", t.id);
    if (error) toast.error(error.message);
    else void load();
  }

  async function remove(id: string) {
    const { error } = await supabase.from("tareas").delete().eq("id", id);
    if (error) toast.error(error.message);
    else void load();
  }

  async function crear() {
    if (!user) return;
    if (!titulo.trim()) {
      toast.error("Pon un título a la tarea");
      return;
    }
    if (!fecha) {
      toast.error("Elige una fecha");
      return;
    }
    if (!asignado) {
      toast.error("Elige a quién se le asigna");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("tareas").insert({
      sitio_id: sitioId,
      vendedor_id: asignado,
      creada_por: user.id,
      tipo,
      titulo: titulo.trim(),
      fecha_objetivo: fecha,
    });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Tarea creada");
    setTitulo("");
    setTipo("visita");
    const t = new Date();
    t.setDate(t.getDate() + 1);
    setFecha(t.toISOString().slice(0, 10));
    void load();
  }

  const puedeCrear =
    !!user &&
    !disabled &&
    (user.id === vendedorId || profile?.role === "gerente" || profile?.role === "head");

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div>
      <h3 className="font-semibold mb-2">Tareas de seguimiento</h3>

      {puedeCrear && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-3 mb-3">
          <div className="text-sm font-semibold">Nueva tarea</div>
          <p className="text-[11px] text-muted-foreground -mt-2">
            Define el siguiente paso para no perder esta oportunidad.
          </p>

          <div className="space-y-1.5">
            <Label>Título</Label>
            <Input
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ej. Visitar obra y validar volumen"
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
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                className="h-10"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Asignar a</Label>
            <Select value={asignado} onValueChange={setAsignado}>
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
                    {p.nombre ?? p.email ?? "Sin nombre"}
                    {p.id === user?.id ? " (yo)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button onClick={crear} disabled={saving} className="w-full h-11">
            {saving ? "Guardando..." : "Agregar tarea"}
          </Button>
        </div>
      )}

      {tareas.length === 0 ? (
        <p className="text-xs text-muted-foreground">Aún no hay tareas.</p>
      ) : (
        <ul className="space-y-2">
          {tareas.map((t) => {
            const vencida = !t.completada && t.fecha_objetivo < today;
            const responsable =
              asignables.find((a) => a.id === t.vendedor_id)?.nombre ??
              asignables.find((a) => a.id === t.vendedor_id)?.email;
            return (
              <li
                key={t.id}
                className={`flex items-start gap-2 rounded-lg border bg-card p-2.5 ${
                  vencida ? "border-red-300 bg-red-50/30 dark:bg-red-950/10" : ""
                }`}
              >
                <button
                  type="button"
                  onClick={() => toggle(t)}
                  aria-label="toggle"
                  className="mt-0.5"
                >
                  {t.completada ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                  ) : (
                    <Circle className="h-5 w-5 text-muted-foreground" />
                  )}
                </button>
                <div className="flex-1 min-w-0">
                  <div
                    className={`text-sm font-medium ${
                      t.completada ? "line-through text-muted-foreground" : ""
                    }`}
                  >
                    {t.titulo}
                  </div>
                  {t.descripcion && (
                    <p className="text-[12px] text-muted-foreground line-clamp-2">
                      {t.descripcion}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-1.5 mt-1 items-center">
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                      {TAREA_TIPOS.find((x) => x.value === t.tipo)?.label ?? t.tipo}
                    </Badge>
                    <span
                      className={`text-[10px] tabular-nums ${
                        vencida ? "text-red-600 font-medium" : "text-muted-foreground"
                      }`}
                    >
                      {new Date(t.fecha_objetivo + "T00:00:00").toLocaleDateString(
                        "es-MX",
                        { day: "2-digit", month: "short", year: "2-digit" },
                      )}
                      {vencida && " · vencida"}
                    </span>
                    {responsable && (
                      <span className="text-[10px] text-muted-foreground">
                        · {responsable}
                      </span>
                    )}
                  </div>
                </div>
                {(user?.id === t.creada_por || profile?.role !== "vendedor") && (
                  <button
                    type="button"
                    onClick={() => remove(t.id)}
                    aria-label="Eliminar"
                    className="text-muted-foreground hover:text-red-600 mt-0.5"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
