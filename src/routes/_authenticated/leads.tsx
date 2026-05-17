import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Briefcase, Flame, MapPin, AlertTriangle, Search, SlidersHorizontal, X, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

function getEtapa(s: SitioConProfile): SitioEtapa {
  if (s.etapa && ETAPAS.includes(s.etapa)) return s.etapa;
  if (s.estatus_final) return "cerrado";
  if (s.estatus === "prospecto") return "registro_inicial";
  if (s.estatus === "movimiento_de_tierra") return "info_completa";
  return "en_seguimiento";
}

function LeadsPage() {
  const { profile } = useAuth();
  const [sitios, setSitios] = useState<SitioConProfile[]>([]);
  const [lastInteraction, setLastInteraction] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [filterEstatus, setFilterEstatus] = useState("all");
  const [filterPrioridad, setFilterPrioridad] = useState("todos");
  const [filterSeguimiento, setFilterSeguimiento] = useState("todos");
  const [search, setSearch] = useState("");
  const [mobileEtapa, setMobileEtapa] = useState<SitioEtapa>("registro_inicial");
  const [filtersOpen, setFiltersOpen] = useState(false);

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
    const q = search.trim().toLowerCase();
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
      if (q) {
        const hay = `${s.nombre_referencia ?? ""} ${s.direccion ?? ""} ${
          s.licitante ?? ""
        } ${s.notas ?? ""} ${s.profiles?.nombre ?? ""} ${
          s.profiles?.email ?? ""
        }`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sitios, filterEstatus, filterPrioridad, filterSeguimiento, lastInteraction, search]);

  const porEtapa = useMemo(() => {
    const map: Record<SitioEtapa, SitioConProfile[]> = {
      deteccion: [],
      registro_inicial: [],
      info_completa: [],
      en_seguimiento: [],
      cerrado: [],
    };
    for (const s of filtered) map[getEtapa(s)].push(s);
    return map;
  }, [filtered]);

  const totalM3 = filtered.reduce((a, s) => a + (s.volumen_m3 ?? 0), 0);

  return (
    <div className="flex-1 flex flex-col px-3 sm:px-4 py-3 sm:py-4 w-full min-h-0">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-base sm:text-lg font-bold flex items-center gap-2">
          <Briefcase className="h-5 w-5" /> Pipeline
        </h1>
        <div className="text-[11px] sm:text-xs text-muted-foreground tabular-nums">
          {filtered.length} · {totalM3.toLocaleString()} m³
        </div>
      </div>
      <p className="hidden sm:block text-xs text-muted-foreground mb-3">
        Vista Kanban por etapa.{" "}
        {profile?.role === "gerente" ? "Tu zona." : "Todas las zonas."}
      </p>

      <div className="flex gap-2 mb-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar lead..."
            className="h-9 pl-8"
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-9 sm:hidden shrink-0 gap-1.5"
          onClick={() => setFiltersOpen((v) => !v)}
        >
          <SlidersHorizontal className="h-4 w-4" />
          {(filterPrioridad !== "todos" || filterEstatus !== "all" || filterSeguimiento !== "todos") && (
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
          )}
        </Button>
      </div>

      <div className={`${filtersOpen ? "flex" : "hidden"} sm:flex flex-wrap sm:flex-nowrap gap-2 mb-3 sm:overflow-x-auto`}>
        <Select value={filterPrioridad} onValueChange={setFilterPrioridad}>
          <SelectTrigger className="h-9 flex-1 sm:flex-none sm:w-[180px] min-w-[140px] shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos los leads</SelectItem>
            <SelectItem value="importantes">≥ 1,000 m³ (importantes)</SelectItem>
            <SelectItem value="criticos">≥ 5,000 m³ (críticos)</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterEstatus} onValueChange={setFilterEstatus}>
          <SelectTrigger className="h-9 flex-1 sm:flex-none sm:w-[180px] min-w-[140px] shrink-0">
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
          <SelectTrigger className="h-9 flex-1 sm:flex-none sm:w-[200px] min-w-[140px] shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todo el seguimiento</SelectItem>
            <SelectItem value="stale7">Sin seguimiento ≥ 7 días</SelectItem>
            <SelectItem value="stale14">Sin seguimiento ≥ 14 días</SelectItem>
            <SelectItem value="stale30">Sin seguimiento ≥ 30 días</SelectItem>
          </SelectContent>
        </Select>
        {(filterPrioridad !== "todos" || filterEstatus !== "all" || filterSeguimiento !== "todos") && (
          <Button
            variant="ghost"
            size="sm"
            className="h-9 sm:hidden gap-1"
            onClick={() => {
              setFilterPrioridad("todos");
              setFilterEstatus("all");
              setFilterSeguimiento("todos");
            }}
          >
            <X className="h-3.5 w-3.5" /> Limpiar
          </Button>
        )}
      </div>

      {/* Mobile etapa selector: prev/next + dropdown, sin scroll horizontal */}
      <div className="md:hidden mb-2">
        {(() => {
          const idx = ETAPAS.indexOf(mobileEtapa);
          const goPrev = () => setMobileEtapa(ETAPAS[(idx - 1 + ETAPAS.length) % ETAPAS.length]);
          const goNext = () => setMobileEtapa(ETAPAS[(idx + 1) % ETAPAS.length]);
          const currentCount = porEtapa[mobileEtapa].length;
          return (
            <>
              <div className={`flex items-stretch gap-1.5 rounded-xl border border-t-[3px] bg-background ${ETAPA_ACCENT[mobileEtapa]}`}>
                <button
                  onClick={goPrev}
                  className="px-2 flex items-center justify-center text-muted-foreground hover:text-foreground"
                  aria-label="Etapa anterior"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <Select value={mobileEtapa} onValueChange={(v) => setMobileEtapa(v as SitioEtapa)}>
                  <SelectTrigger className="flex-1 border-0 shadow-none focus:ring-0 h-10 px-1 text-sm font-semibold">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ETAPAS.map((etapa) => (
                      <SelectItem key={etapa} value={etapa}>
                        <span className="flex items-center gap-2">
                          <span>{ETAPA_LABEL[etapa]}</span>
                          <span className="text-[10px] tabular-nums text-muted-foreground">
                            ({porEtapa[etapa].length})
                          </span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex items-center pr-2">
                  <span className="text-[11px] font-bold tabular-nums bg-muted rounded-full px-2 py-0.5">
                    {currentCount}
                  </span>
                </div>
                <button
                  onClick={goNext}
                  className="px-2 flex items-center justify-center text-muted-foreground hover:text-foreground"
                  aria-label="Etapa siguiente"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-1.5 flex items-center justify-center gap-1">
                {ETAPAS.map((etapa, i) => (
                  <button
                    key={etapa}
                    onClick={() => setMobileEtapa(etapa)}
                    aria-label={ETAPA_LABEL[etapa]}
                    className={`h-1.5 rounded-full transition-all ${
                      i === idx ? "w-6 bg-foreground" : "w-1.5 bg-muted-foreground/30"
                    }`}
                  />
                ))}
              </div>
            </>
          );
        })()}
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Cargando...</p>
      ) : (
        <>
          {/* Mobile: single column list of selected etapa */}
          <div className="md:hidden flex-1 min-h-0 overflow-y-auto -mx-1 px-1 pb-2 space-y-2">
            {(() => {
              const items = porEtapa[mobileEtapa];
              const sumaM3 = items.reduce((a, s) => a + (s.volumen_m3 ?? 0), 0);
              return (
                <>
                  <div className="text-[11px] text-muted-foreground tabular-nums px-1">
                    {items.length} leads · {sumaM3.toLocaleString()} m³
                  </div>
                  {items.length === 0 ? (
                    <div className="text-sm text-muted-foreground text-center py-12 border border-dashed rounded-xl">
                      Sin leads en esta etapa
                    </div>
                  ) : (
                    items.map((s) => renderCard(s, diasSinSeguimiento(s), true))
                  )}
                </>
              );
            })()}
          </div>

          {/* Desktop: horizontal kanban */}
          <div className="hidden md:block flex-1 min-h-0 overflow-x-auto">
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
                        <div className="text-sm font-semibold">{ETAPA_LABEL[etapa]}</div>
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
                        items.map((s) => renderCard(s, diasSinSeguimiento(s), false))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function renderCard(s: SitioConProfile, dias: number, mobile: boolean) {
  const v = s.volumen_m3 ?? 0;
  const critico = v >= 5000;
  return (
    <Link
      key={s.id}
      to="/sitios/$sitioId"
      params={{ sitioId: s.id }}
      className={`block bg-card border rounded-xl hover:shadow-md active:scale-[0.99] transition ${
        mobile ? "p-3 shadow-sm" : "p-2.5"
      }`}
    >
      <div className="flex items-start gap-2.5">
        <div
          className={`rounded-md flex items-center justify-center text-white shrink-0 ${
            mobile ? "h-10 w-10" : "h-8 w-8"
          }`}
          style={{ backgroundColor: ESTATUS_COLOR[s.estatus] }}
        >
          {critico ? (
            <Flame className={mobile ? "h-5 w-5" : "h-4 w-4"} />
          ) : (
            <MapPin className={mobile ? "h-5 w-5" : "h-4 w-4"} />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h3 className={`font-semibold truncate ${mobile ? "text-[15px]" : "text-sm"}`}>
              {s.nombre_referencia ?? "Sitio sin nombre"}
            </h3>
            <span className={`font-bold tabular-nums shrink-0 ${mobile ? "text-sm" : "text-xs"}`}>
              {v.toLocaleString()} m³
            </span>
          </div>
          <p className={`text-muted-foreground truncate ${mobile ? "text-xs mt-0.5" : "text-[11px]"}`}>
            {s.direccion ?? `${s.lat.toFixed(3)}, ${s.lng.toFixed(3)}`}
          </p>
          <div className={`flex flex-wrap gap-1 items-center ${mobile ? "mt-2" : "mt-1.5"}`}>
            <Badge
              style={{ backgroundColor: ESTATUS_COLOR[s.estatus], color: "white" }}
              className={mobile ? "text-[10px] px-2 py-0.5" : "text-[9px] px-1.5 py-0"}
            >
              {ESTATUS_LABEL[s.estatus]}
            </Badge>
            {s.estatus_final && (
              <Badge variant="outline" className={mobile ? "text-[10px] px-2 py-0.5" : "text-[9px] px-1.5 py-0"}>
                {s.estatus_final}
              </Badge>
            )}
            {!s.estatus_final && dias >= 7 && (
              <Badge
                variant="outline"
                className={`gap-0.5 ${
                  dias >= 30
                    ? "bg-red-100 text-red-700 border-red-200"
                    : dias >= 14
                    ? "bg-amber-100 text-amber-700 border-amber-200"
                    : "bg-muted text-muted-foreground"
                } ${mobile ? "text-[10px] px-2 py-0.5" : "text-[9px] px-1.5 py-0"}`}
              >
                <AlertTriangle className="h-2.5 w-2.5" /> {dias}d
              </Badge>
            )}
            <span
              className={`text-muted-foreground ml-auto truncate ${
                mobile ? "text-[11px] max-w-[140px]" : "text-[10px] max-w-[100px]"
              }`}
            >
              {s.profiles?.nombre ?? s.profiles?.email ?? "Sin asignar"}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
