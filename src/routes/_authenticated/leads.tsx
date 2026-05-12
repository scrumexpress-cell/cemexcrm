import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Briefcase, Flame, MapPin, AlertTriangle } from "lucide-react";
import {
  supabase,
  type Sitio,
  type SitioEtapa,
} from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ESTATUS_COLOR, ESTATUS_LABEL, ESTATUS_OPTIONS } from "@/lib/sitio-utils";
import { ETAPA_LABEL } from "@/components/EtapaStepper";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/leads")({
  component: LeadsPage,
});

interface SitioConProfile extends Sitio {
  profiles?: { nombre: string | null; email: string | null } | null;
}

const ETAPAS: SitioEtapa[] = [
  "deteccion",
  "registro_inicial",
  "info_completa",
  "en_seguimiento",
  "cerrado",
];

const ETAPA_ACCENT: Record<SitioEtapa, string> = {
  deteccion: "border-t-slate-400",
  registro_inicial: "border-t-blue-500",
  info_completa: "border-t-indigo-500",
  en_seguimiento: "border-t-amber-500",
  cerrado: "border-t-emerald-600",
};

function LeadsPage() {
  const { profile } = useAuth();
  const [sitios, setSitios] = useState<SitioConProfile[]>([]);
  const [lastInteraction, setLastInteraction] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [filterEstatus, setFilterEstatus] = useState("all");
  const [filterPrioridad, setFilterPrioridad] = useState("todos");
  const [filterSeguimiento, setFilterSeguimiento] = useState("todos");

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    const [resSitios, resInts] = await Promise.all([
      supabase
        .from("sitios")
        .select("*, profiles:vendedor_id(nombre,email)")
        .order("volumen_m3", { ascending: false, nullsFirst: false }),
      supabase
        .from("interacciones")
        .select("sitio_id, fecha")
        .order("fecha", { ascending: false }),
    ]);
    if (resSitios.error) toast.error(resSitios.error.message);
    else setSitios((resSitios.data as SitioConProfile[]) ?? []);
    const lastMap: Record<string, string> = {};
    (resInts.data ?? []).forEach((i) => {
      const sid = i.sitio_id as string;
      if (!lastMap[sid]) lastMap[sid] = i.fecha as string;
    });
    setLastInteraction(lastMap);
    setLoading(false);
  }

  function diasSinSeguimiento(s: SitioConProfile): number {
    const last = lastInteraction[s.id] ?? s.created_at;
    return Math.floor((Date.now() - new Date(last).getTime()) / 86400000);
  }

  const filtered = useMemo(() => {
    return sitios.filter((s) => {
      if (filterEstatus !== "all" && s.estatus !== filterEstatus) return false;
      const v = s.volumen_m3 ?? 0;
      if (filterPrioridad === "importantes" && v < 1000) return false;
      if (filterPrioridad === "criticos" && v < 5000) return false;
      if (filterSeguimiento !== "todos") {
        if (s.estatus_final) return false;
        const d = diasSinSeguimiento(s);
        if (filterSeguimiento === "stale7" && d < 7) return false;
        if (filterSeguimiento === "stale14" && d < 14) return false;
        if (filterSeguimiento === "stale30" && d < 30) return false;
      }
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sitios, filterEstatus, filterPrioridad, filterSeguimiento, lastInteraction]);

  const porEtapa = useMemo(() => {
    const map: Record<SitioEtapa, SitioConProfile[]> = {
      deteccion: [],
      registro_inicial: [],
      info_completa: [],
      en_seguimiento: [],
      cerrado: [],
    };
    for (const s of filtered) map[s.etapa]?.push(s);
    return map;
  }, [filtered]);

  const totalM3 = filtered.reduce((a, s) => a + (s.volumen_m3 ?? 0), 0);

  return (
    <div className="flex-1 flex flex-col px-4 py-4 w-full min-h-0">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-lg font-bold flex items-center gap-2">
          <Briefcase className="h-5 w-5" /> Pipeline de oportunidades
        </h1>
        <div className="text-xs text-muted-foreground">
          {filtered.length} leads · {totalM3.toLocaleString()} m³
        </div>
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        Vista Kanban por etapa.{" "}
        {profile?.role === "gerente" ? "Tu zona." : "Todas las zonas."}
      </p>

      <div className="flex gap-2 mb-3 overflow-x-auto">
        <Select value={filterPrioridad} onValueChange={setFilterPrioridad}>
          <SelectTrigger className="h-9 w-[180px] shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos los leads</SelectItem>
            <SelectItem value="importantes">≥ 1,000 m³ (importantes)</SelectItem>
            <SelectItem value="criticos">≥ 5,000 m³ (críticos)</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterEstatus} onValueChange={setFilterEstatus}>
          <SelectTrigger className="h-9 w-[180px] shrink-0">
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
        <Select value={filterSeguimiento} onValueChange={setFilterSeguimiento}>
          <SelectTrigger className="h-9 w-[200px] shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todo el seguimiento</SelectItem>
            <SelectItem value="stale7">Sin seguimiento ≥ 7 días</SelectItem>
            <SelectItem value="stale14">Sin seguimiento ≥ 14 días</SelectItem>
            <SelectItem value="stale30">Sin seguimiento ≥ 30 días</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Cargando...</p>
      ) : (
        <div className="flex-1 min-h-0 overflow-x-auto">
          <div className="grid grid-flow-col auto-cols-[minmax(260px,1fr)] gap-3 h-full pb-2">
            {ETAPAS.map((etapa) => {
              const items = porEtapa[etapa];
              const sumaM3 = items.reduce((a, s) => a + (s.volumen_m3 ?? 0), 0);
              return (
                <div
                  key={etapa}
                  className={`flex flex-col bg-muted/40 rounded-xl border border-t-4 ${ETAPA_ACCENT[etapa]} min-h-0`}
                >
                  <div className="px-3 pt-3 pb-2 flex items-center justify-between">
                    <div>
                      <div className="text-sm font-semibold">
                        {ETAPA_LABEL[etapa]}
                      </div>
                      <div className="text-[10px] text-muted-foreground tabular-nums">
                        {items.length} · {sumaM3.toLocaleString()} m³
                      </div>
                    </div>
                    <span className="text-xs font-bold tabular-nums bg-background border rounded-full px-2 py-0.5">
                      {items.length}
                    </span>
                  </div>
                  <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-2">
                    {items.length === 0 ? (
                      <div className="text-[11px] text-muted-foreground text-center py-6">
                        Sin leads
                      </div>
                    ) : (
                      items.map((s) => {
                        const v = s.volumen_m3 ?? 0;
                        const critico = v >= 5000;
                        return (
                          <Link
                            key={s.id}
                            to="/sitios/$sitioId"
                            params={{ sitioId: s.id }}
                            className="block bg-card border rounded-lg p-2.5 hover:shadow-md transition"
                          >
                            <div className="flex items-start gap-2">
                              <div
                                className="h-8 w-8 rounded-md flex items-center justify-center text-white shrink-0"
                                style={{ backgroundColor: ESTATUS_COLOR[s.estatus] }}
                              >
                                {critico ? (
                                  <Flame className="h-4 w-4" />
                                ) : (
                                  <MapPin className="h-4 w-4" />
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-1">
                                  <h3 className="font-semibold text-sm truncate">
                                    {s.nombre_referencia ?? "Sitio sin nombre"}
                                  </h3>
                                  <span className="font-bold tabular-nums text-xs shrink-0">
                                    {v.toLocaleString()}
                                  </span>
                                </div>
                                <p className="text-[11px] text-muted-foreground truncate">
                                  {s.direccion ??
                                    `${s.lat.toFixed(3)}, ${s.lng.toFixed(3)}`}
                                </p>
                                <div className="flex flex-wrap gap-1 mt-1.5 items-center">
                                  <Badge
                                    style={{
                                      backgroundColor: ESTATUS_COLOR[s.estatus],
                                      color: "white",
                                    }}
                                    className="text-[9px] px-1.5 py-0"
                                  >
                                    {ESTATUS_LABEL[s.estatus]}
                                  </Badge>
                                  {s.estatus_final && (
                                    <Badge variant="outline" className="text-[9px] px-1.5 py-0">
                                      {s.estatus_final}
                                    </Badge>
                                  )}
                                  <span className="text-[10px] text-muted-foreground ml-auto truncate max-w-[100px]">
                                    {s.profiles?.nombre ?? s.profiles?.email ?? "Sin asignar"}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </Link>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
