import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Bell, CheckCheck } from "lucide-react";
import { supabase, type Alerta } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/alertas")({
  component: AlertasPage,
});

const TIPO_LABEL: Record<string, string> = {
  volumen_alto: "Volumen alto",
  inactividad: "Inactividad",
};

function AlertasPage() {
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("alertas")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) toast.error(error.message);
    else setAlertas((data as Alerta[]) ?? []);
    setLoading(false);
  }

  async function markRead(id: string) {
    const { error } = await supabase
      .from("alertas")
      .update({ leida: true })
      .eq("id", id);
    if (error) return toast.error(error.message);
    setAlertas((prev) =>
      prev.map((a) => (a.id === id ? { ...a, leida: true } : a)),
    );
  }

  async function markAllRead() {
    const { error } = await supabase
      .from("alertas")
      .update({ leida: true })
      .eq("leida", false);
    if (error) return toast.error(error.message);
    void load();
    toast.success("Todas marcadas como leídas");
  }

  return (
    <div className="flex-1 px-4 py-4 max-w-2xl w-full mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-bold flex items-center gap-2">
          <Bell className="h-5 w-5" /> Alertas
        </h1>
        {alertas.some((a) => !a.leida) && (
          <Button size="sm" variant="outline" onClick={markAllRead}>
            <CheckCheck className="h-4 w-4 mr-1" /> Marcar todas
          </Button>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Cargando...</p>
      ) : alertas.length === 0 ? (
        <div className="text-center py-16 text-sm text-muted-foreground">
          No tienes alertas.
        </div>
      ) : (
        <ul className="space-y-2">
          {alertas.map((a) => (
            <li
              key={a.id}
              className={`bg-card border rounded-xl p-3 flex gap-3 ${
                a.leida ? "opacity-60" : ""
              }`}
            >
              <div
                className={`h-2 w-2 rounded-full mt-2 shrink-0 ${
                  a.leida ? "bg-muted" : "bg-accent"
                }`}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] uppercase tracking-wide bg-muted px-1.5 py-0.5 rounded font-semibold">
                    {TIPO_LABEL[a.tipo] ?? a.tipo}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {new Date(a.created_at).toLocaleString("es-MX", {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                <p className="text-sm">{a.mensaje}</p>
                <div className="mt-2 flex gap-3">
                  {a.sitio_id && (
                    <Link
                      to="/sitios/$sitioId"
                      params={{ sitioId: a.sitio_id }}
                      className="text-xs text-primary font-medium"
                    >
                      Ver sitio →
                    </Link>
                  )}
                  {!a.leida && (
                    <button
                      onClick={() => void markRead(a.id)}
                      className="text-xs text-muted-foreground"
                    >
                      Marcar leída
                    </button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
