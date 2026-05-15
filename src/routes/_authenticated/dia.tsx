import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Sun,
  CheckCircle2,
  Circle,
  Clock,
  AlertTriangle,
  Plus,
  MapPin,
  Flame,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  supabase,
  type Sitio,
  type Tarea,
} from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { ESTATUS_COLOR, ESTATUS_LABEL } from "@/lib/sitio-utils";
import { TareaDialog } from "@/components/TareaDialog";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/dia")({
  component: MiDiaPage,
});

interface SitioConUltima extends Sitio {
  ultima_interaccion?: string | null;
}

function MiDiaPage() {
  const { user, profile } = useAuth();
  const [tareas, setTareas] = useState<Tarea[]>([]);
  const [sitios, setSitios] = useState<SitioConUltima[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewTarea, setShowNewTarea] = useState(false);

  useEffect(() => {
    if (!user) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  async function load() {
    if (!user) return;
    setLoading(true);
    const [resTar, resSit, resInts] = await Promise.all([
      supabase
        .from("tareas")
        .select("*")
        .eq("vendedor_id", user.id)
        .eq("completada", false)
        .order("fecha_objetivo", { ascending: true }),
      supabase
        .from("sitios")
        .select("*")
        .eq("vendedor_id", user.id)
        .is("estatus_final", null),
      supabase
        .from("interacciones")
        .select("sitio_id, fecha")
        .order("fecha", { ascending: false }),
    ]);
    setTareas((resTar.data as Tarea[]) ?? []);
    const lastMap: Record<string, string> = {};
    (resInts.data ?? []).forEach((i) => {
      const sid = i.sitio_id as string;
      if (!lastMap[sid]) lastMap[sid] = i.fecha as string;
    });
    const enriched = ((resSit.data as Sitio[]) ?? []).map((s) => ({
      ...s,
      ultima_interaccion: lastMap[s.id] ?? null,
    }));
    setSitios(enriched);
    setLoading(false);
  }

  async function toggleTarea(t: Tarea) {
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

  const today = new Date().toISOString().slice(0, 10);

  const { vencidas, hoy, proximas } = useMemo(() => {
    const v: Tarea[] = [];
    const h: Tarea[] = [];
    const p: Tarea[] = [];
    for (const t of tareas) {
      if (t.fecha_objetivo < today) v.push(t);
      else if (t.fecha_objetivo === today) h.push(t);
      else p.push(t);
    }
    return { vencidas: v, hoy: h, proximas: p.slice(0, 5) };
  }, [tareas, today]);

  function diasDesde(iso: string | null | undefined): number | null {
    if (!iso) return null;
    return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  }

  const sitiosSinSeguimiento = useMemo(() => {
    return sitios
      .map((s) => {
        const base = s.ultima_interaccion ?? s.created_at;
        return { ...s, dias: Math.floor((Date.now() - new Date(base).getTime()) / 86400000) };
      })
      .filter((s) => s.dias >= 7)
      .sort((a, b) => b.dias - a.dias)
      .slice(0, 8);
  }, [sitios]);

  const sitiosPriorizados = useMemo(() => {
    return sitios
      .filter((s) => (s.volumen_m3 ?? 0) >= 500)
      .sort((a, b) => (b.volumen_m3 ?? 0) - (a.volumen_m3 ?? 0))
      .slice(0, 5);
  }, [sitios]);

  return (
    <div className="flex-1 px-4 py-4 max-w-2xl w-full mx-auto pb-24">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-lg font-bold flex items-center gap-2">
          <Sun className="h-5 w-5 text-amber-500" />
          Mi día
        </h1>
        <Button size="sm" onClick={() => setShowNewTarea(true)} className="h-9">
          <Plus className="h-4 w-4 mr-1" /> Nueva tarea
        </Button>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Hola{profile?.nombre ? `, ${profile.nombre.split(" ")[0]}` : ""}. Aquí
        está tu trabajo de hoy.
      </p>

      {loading ? (
        <p className="text-sm text-muted-foreground">Cargando...</p>
      ) : (
        <div className="space-y-5">
          {vencidas.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold flex items-center gap-1.5 mb-2 text-red-700">
                <AlertTriangle className="h-4 w-4" /> Vencidas ({vencidas.length})
              </h2>
              <ul className="space-y-2">
                {vencidas.map((t) => (
                  <TareaCard
                    key={t.id}
                    tarea={t}
                    tone="red"
                    onToggle={() => void toggleTarea(t)}
                  />
                ))}
              </ul>
            </section>
          )}

          <section>
            <h2 className="text-sm font-semibold flex items-center gap-1.5 mb-2">
              <Clock className="h-4 w-4" /> Hoy ({hoy.length})
            </h2>
            {hoy.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Sin tareas para hoy. Buen momento para visitar obras.
              </p>
            ) : (
              <ul className="space-y-2">
                {hoy.map((t) => (
                  <TareaCard
                    key={t.id}
                    tarea={t}
                    tone="amber"
                    onToggle={() => void toggleTarea(t)}
                  />
                ))}
              </ul>
            )}
          </section>

          {proximas.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold mb-2">Próximas</h2>
              <ul className="space-y-2">
                {proximas.map((t) => (
                  <TareaCard key={t.id} tarea={t} onToggle={() => void toggleTarea(t)} />
                ))}
              </ul>
            </section>
          )}

          {sitiosPriorizados.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                <Flame className="h-4 w-4 text-orange-500" />
                Sitios prioritarios (mayor volumen)
              </h2>
              <ul className="space-y-2">
                {sitiosPriorizados.map((s) => (
                  <SitioMini key={s.id} sitio={s} />
                ))}
              </ul>
            </section>
          )}

          {sitiosSinSeguimiento.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold mb-2 flex items-center gap-1.5 text-amber-700">
                <AlertTriangle className="h-4 w-4" /> Sin seguimiento ≥7 días
              </h2>
              <ul className="space-y-2">
                {sitiosSinSeguimiento.map((s) => (
                  <SitioMini
                    key={s.id}
                    sitio={s}
                    badge={`${s.dias}d sin actividad`}
                  />
                ))}
              </ul>
            </section>
          )}
        </div>
      )}

      <TareaDialog
        open={showNewTarea}
        onOpenChange={setShowNewTarea}
        defaultVendedorId={user?.id ?? null}
        onCreated={() => {
          setShowNewTarea(false);
          void load();
        }}
      />
    </div>
  );
}

function TareaCard({
  tarea,
  tone = "muted",
  onToggle,
}: {
  tarea: Tarea;
  tone?: "red" | "amber" | "muted";
  onToggle: () => void;
}) {
  const toneClass =
    tone === "red"
      ? "border-red-300 bg-red-50/40 dark:bg-red-950/10"
      : tone === "amber"
        ? "border-amber-300 bg-amber-50/40 dark:bg-amber-950/10"
        : "";
  return (
    <li
      className={`flex items-start gap-2 rounded-lg border bg-card p-3 ${toneClass}`}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-label={tarea.completada ? "Marcar pendiente" : "Marcar completada"}
        className="mt-0.5"
      >
        {tarea.completada ? (
          <CheckCircle2 className="h-5 w-5 text-emerald-600" />
        ) : (
          <Circle className="h-5 w-5 text-muted-foreground" />
        )}
      </button>
      <div className="flex-1 min-w-0">
        <Link
          to="/sitios/$sitioId"
          params={{ sitioId: tarea.sitio_id }}
          className="font-medium text-sm hover:underline truncate block"
        >
          {tarea.titulo}
        </Link>
        {tarea.descripcion && (
          <p className="text-[12px] text-muted-foreground line-clamp-2">
            {tarea.descripcion}
          </p>
        )}
        <div className="flex flex-wrap gap-1.5 mt-1">
          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
            {tarea.tipo}
          </Badge>
          <span className="text-[10px] text-muted-foreground tabular-nums">
            {new Date(tarea.fecha_objetivo + "T00:00:00").toLocaleDateString("es-MX", {
              day: "2-digit",
              month: "short",
            })}
          </span>
        </div>
      </div>
    </li>
  );
}

function SitioMini({ sitio, badge }: { sitio: Sitio; badge?: string }) {
  return (
    <li>
      <Link
        to="/sitios/$sitioId"
        params={{ sitioId: sitio.id }}
        className="flex items-center gap-2 rounded-lg border bg-card p-2.5 hover:shadow-sm"
      >
        <div
          className="h-8 w-8 rounded-md flex items-center justify-center text-white shrink-0"
          style={{ backgroundColor: ESTATUS_COLOR[sitio.estatus] }}
        >
          <MapPin className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm truncate">
            {sitio.nombre_referencia ?? "Sin nombre"}
          </div>
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <span>{ESTATUS_LABEL[sitio.estatus]}</span>
            {sitio.volumen_m3 != null && (
              <>
                <span>·</span>
                <span className="tabular-nums">{sitio.volumen_m3} m³</span>
              </>
            )}
          </div>
        </div>
        {badge && (
          <Badge variant="outline" className="text-[10px] shrink-0">
            {badge}
          </Badge>
        )}
      </Link>
    </li>
  );
}
