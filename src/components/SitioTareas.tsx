import { useEffect, useState } from "react";
import { CheckCircle2, Circle, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase, type Tarea } from "@/integrations/supabase/client";
import { TareaDialog } from "@/components/TareaDialog";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";

interface Props {
  sitioId: string;
  vendedorId: string | null;
}

export function SitioTareas({ sitioId, vendedorId }: Props) {
  const { user, profile } = useAuth();
  const [tareas, setTareas] = useState<Tarea[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sitioId]);

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

  const puedeCrear =
    !!user &&
    (user.id === vendedorId || profile?.role === "gerente" || profile?.role === "head");

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold">Tareas pendientes</h3>
        {puedeCrear && (
          <Button size="sm" variant="outline" className="h-8" onClick={() => setOpen(true)}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Nueva
          </Button>
        )}
      </div>
      {tareas.length === 0 ? (
        <p className="text-xs text-muted-foreground">Aún no hay tareas.</p>
      ) : (
        <ul className="space-y-2">
          {tareas.map((t) => {
            const vencida = !t.completada && t.fecha_objetivo < today;
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
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                      {t.tipo}
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

      <TareaDialog
        open={open}
        onOpenChange={setOpen}
        sitioId={sitioId}
        defaultVendedorId={vendedorId}
        onCreated={() => {
          setOpen(false);
          void load();
        }}
      />
    </div>
  );
}
