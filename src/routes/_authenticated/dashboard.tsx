import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Download,
  TrendingUp,
  TrendingDown,
  Minus,
  Target,
  DollarSign,
  Activity,
  Trophy,
} from "lucide-react";
import { resetAndSeedAll } from "@/lib/seed-sitios";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  Bar,
  LineChart,
  Line,
  Legend,
} from "recharts";
import { supabase, type Sitio } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { ESTATUS_LABEL, ESTATUS_COLOR } from "@/lib/sitio-utils";
import { ETAPA_LABEL } from "@/components/EtapaStepper";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
});

interface SitioConProfile extends Sitio {
  profiles?: { nombre: string | null; email: string | null } | null;
  zona?: { nombre: string | null } | null;
}

// Supuesto de precio por m³ de concreto (MXN). Editable por el ejecutivo.
const PRECIO_DEFAULT = 2400;

type MonthKey = string; // YYYY-MM

function monthKey(d: Date): MonthKey {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function monthLabel(k: MonthKey) {
  const [y, m] = k.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("es-MX", {
    month: "short",
    year: "2-digit",
  });
}
function lastNMonths(n: number): MonthKey[] {
  const out: MonthKey[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(monthKey(d));
  }
  return out;
}
const MXN = (n: number) =>
  n >= 1_000_000
    ? `$${(n / 1_000_000).toFixed(2)}M`
    : n >= 1_000
      ? `$${(n / 1_000).toFixed(0)}K`
      : `$${Math.round(n)}`;

function etapaFallback(s: SitioConProfile) {
  if (s.etapa) return s.etapa;
  if (s.estatus_final) return "cerrado";
  if (s.estatus === "prospecto") return "registro_inicial";
  if (s.volumen_m3) return "en_seguimiento";
  return "deteccion";
}

function DashboardPage() {
  const { profile, user } = useAuth();
  const seedAttempted = useRef(false);
  const [sitios, setSitios] = useState<SitioConProfile[]>([]);
  const [obras, setObras] = useState<Array<{ id: string; nombre: string; estatus: string; ganador_sitio_id: string | null; competidor_ganador: string | null }>>([]);
  const [loading, setLoading] = useState(true);
  const [precio, setPrecio] = useState(PRECIO_DEFAULT);
  const [horizonte, setHorizonte] = useState<"6" | "12">("6");

  useEffect(() => {
    if (!user) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  async function load() {
    setLoading(true);
    const [resS, resO] = await Promise.all([
      supabase
        .from("sitios")
        .select("*, profiles:vendedor_id(nombre,email), zona:zona_id(nombre)")
        .order("created_at", { ascending: false }),
      supabase
        .from("obras")
        .select("id, nombre, estatus, ganador_sitio_id, competidor_ganador"),
    ]);
    if (resS.error) toast.error(resS.error.message);
    const loadedSitios = resS.error ? [] : ((resS.data as SitioConProfile[]) ?? []);
    setSitios(loadedSitios);
    if (!resO.error) setObras((resO.data as typeof obras) ?? []);
    else setObras([]);
    setLoading(false);

    const hasClosed = loadedSitios.some((s) => !!s.estatus_final);
    if (!resS.error && (loadedSitios.length < 20 || !hasClosed) && user && !seedAttempted.current) {
      seedAttempted.current = true;
      try {
        const seeded = await resetAndSeedAll(user, profile?.zona_id ?? null);
        if (seeded.sitios > 0) await load();
      } catch (e) {
        toast.error((e as Error).message);
      }
    }
  }

  const meses = useMemo(() => lastNMonths(Number(horizonte)), [horizonte]);

  // Serie mensual: ganados (cerrados como ganado), perdidos, nuevos creados
  const serieMes = useMemo(() => {
    const base = new Map<
      MonthKey,
      { mes: MonthKey; nuevos: number; ganados: number; perdidos: number; m3Ganado: number; ingreso: number }
    >();
    meses.forEach((m) =>
      base.set(m, { mes: m, nuevos: 0, ganados: 0, perdidos: 0, m3Ganado: 0, ingreso: 0 }),
    );
    sitios.forEach((s) => {
      const created = monthKey(new Date(s.created_at));
      if (base.has(created)) base.get(created)!.nuevos += 1;
      if (s.fecha_cierre && s.estatus_final) {
        const mc = monthKey(new Date(s.fecha_cierre));
        if (base.has(mc)) {
          const row = base.get(mc)!;
          if (s.estatus_final === "ganado") {
            row.ganados += 1;
            const m3 = Number(s.volumen_m3) || 0;
            row.m3Ganado += m3;
            row.ingreso += m3 * precio;
          } else if (s.estatus_final === "perdido") row.perdidos += 1;
        }
      }
    });
    return [...base.values()].map((r) => ({ ...r, label: monthLabel(r.mes) }));
  }, [sitios, meses, precio]);

  // Comparativo mes actual vs anterior
  const comparativo = useMemo(() => {
    const cur = serieMes[serieMes.length - 1];
    const prev = serieMes[serieMes.length - 2];
    const delta = (a: number, b: number) =>
      b === 0 ? (a > 0 ? 100 : 0) : ((a - b) / b) * 100;
    return {
      cur,
      prev,
      ingresoDelta: cur && prev ? delta(cur.ingreso, prev.ingreso) : 0,
      m3Delta: cur && prev ? delta(cur.m3Ganado, prev.m3Ganado) : 0,
      ganadosDelta: cur && prev ? delta(cur.ganados, prev.ganados) : 0,
      nuevosDelta: cur && prev ? delta(cur.nuevos, prev.nuevos) : 0,
    };
  }, [serieMes]);

  // KPIs globales y proyección PnL
  const kpis = useMemo(() => {
    const abiertos = sitios.filter((s) => !s.estatus_final);
    const cerrados = sitios.filter((s) => s.estatus_final);
    const ganados = cerrados.filter((s) => s.estatus_final === "ganado");
    const m3Pipeline = abiertos.reduce((a, s) => a + (Number(s.volumen_m3) || 0), 0);
    const m3GanadoTotal = ganados.reduce((a, s) => a + (Number(s.volumen_m3) || 0), 0);
    const winRate = cerrados.length > 0 ? (ganados.length / cerrados.length) * 100 : 0;
    const ingresoPipeline = m3Pipeline * precio;
    const ingresoEsperado = ingresoPipeline * (winRate / 100);
    const ingresoYTD = ganados
      .filter((s) => s.fecha_cierre && new Date(s.fecha_cierre).getFullYear() === new Date().getFullYear())
      .reduce((a, s) => a + (Number(s.volumen_m3) || 0) * precio, 0);
    return {
      abiertos: abiertos.length,
      cerrados: cerrados.length,
      ganados: ganados.length,
      m3Pipeline,
      m3GanadoTotal,
      winRate,
      ingresoPipeline,
      ingresoEsperado,
      ingresoYTD,
    };
  }, [sitios, precio]);

  // Embudo por etapa
  const embudo = useMemo(() => {
    const counts: Record<string, { etapa: string; n: number; m3: number }> = {};
    Object.entries(ETAPA_LABEL).forEach(([k, label]) => {
      counts[k] = { etapa: label, n: 0, m3: 0 };
    });
    sitios.forEach((s) => {
      const row = counts[etapaFallback(s)];
      if (row) {
        row.n += 1;
        row.m3 += Number(s.volumen_m3) || 0;
      }
    });
    return Object.values(counts);
  }, [sitios]);

  // Win-rate trend mensual
  const winTrend = useMemo(() => {
    return serieMes.map((m) => {
      const total = m.ganados + m.perdidos;
      return { label: m.label, winRate: total > 0 ? (m.ganados / total) * 100 : null };
    });
  }, [serieMes]);

  // Top vendedores por ingreso ganado
  const topVendedores = useMemo(() => {
    const map = new Map<string, { nombre: string; ingreso: number; ganados: number }>();
    sitios.forEach((s) => {
      if (s.estatus_final !== "ganado") return;
      const key = s.vendedor_id ?? "sin";
      const nombre = s.profiles?.nombre ?? s.profiles?.email ?? "Sin asignar";
      const cur = map.get(key) ?? { nombre, ingreso: 0, ganados: 0 };
      cur.ingreso += (Number(s.volumen_m3) || 0) * precio;
      cur.ganados += 1;
      map.set(key, cur);
    });
    return [...map.values()].sort((a, b) => b.ingreso - a.ingreso).slice(0, 5);
  }, [sitios, precio]);

  // Licitaciones: obras con 2+ sitios (varios licitantes)
  const licitaciones = useMemo(() => {
    const sitiosPorObra = new Map<string, SitioConProfile[]>();
    sitios.forEach((s) => {
      if (!s.obra_id) return;
      const arr = sitiosPorObra.get(s.obra_id) ?? [];
      arr.push(s);
      sitiosPorObra.set(s.obra_id, arr);
    });
    return obras
      .map((o) => {
        const items = sitiosPorObra.get(o.id) ?? [];
        if (items.length < 2) return null;
        const m3 = items.reduce((a, s) => a + (Number(s.volumen_m3) || 0), 0);
        const ganador = items.find((s) => s.id === o.ganador_sitio_id) ?? null;
        return { obra: o, items, m3, ganador };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => b.m3 - a.m3);
  }, [obras, sitios]);

  function exportCsv() {
    const headers = ["mes", "nuevos", "ganados", "perdidos", "m3_ganado", "ingreso_mxn"];
    const rows = serieMes.map((r) => [
      r.mes,
      r.nuevos,
      r.ganados,
      r.perdidos,
      r.m3Ganado,
      Math.round(r.ingreso),
    ]);
    const csv = [headers, ...rows].map((r) => r.join(",")).join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cemex-pnl-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex-1 px-3 sm:px-6 py-4 sm:py-6 max-w-7xl w-full mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-1">
        <div>
          <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            Tablero ejecutivo
          </div>
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">Pipeline &amp; PnL</h1>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-muted-foreground">Precio m³</span>
            <input
              type="number"
              inputMode="numeric"
              value={precio}
              onChange={(e) => setPrecio(Number(e.target.value) || 0)}
              className="w-20 sm:w-24 h-9 px-2 rounded-md border bg-background text-sm tabular-nums"
            />
            <span className="text-muted-foreground">MXN</span>
          </div>
          <Select value={horizonte} onValueChange={(v) => setHorizonte(v as "6" | "12")}>
            <SelectTrigger className="h-9 w-[110px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="6">Últimos 6 m</SelectItem>
              <SelectItem value="12">Últimos 12 m</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" onClick={exportCsv} disabled={loading} className="h-9">
            <Download className="h-4 w-4 mr-1" /> CSV
          </Button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground mb-4 sm:mb-6">
        {profile?.role === "head" ? "Visión global" : "Tu zona"} · datos en MXN sobre supuesto de
        ${precio.toLocaleString()}/m³
      </p>


      {loading ? (
        <p className="text-sm text-muted-foreground">Cargando...</p>
      ) : (
        <>
          {/* KPI strip */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <Kpi
              icon={DollarSign}
              label="Ingreso este mes"
              value={MXN(comparativo.cur?.ingreso ?? 0)}
              delta={comparativo.ingresoDelta}
              sub={`vs ${MXN(comparativo.prev?.ingreso ?? 0)} mes anterior`}
              primary
            />
            <Kpi
              icon={Activity}
              label="Pipeline ponderado"
              value={MXN(kpis.ingresoEsperado)}
              sub={`${MXN(kpis.ingresoPipeline)} bruto · win ${kpis.winRate.toFixed(0)}%`}
            />
            <Kpi
              icon={Target}
              label="m³ ganados mes"
              value={(comparativo.cur?.m3Ganado ?? 0).toLocaleString()}
              delta={comparativo.m3Delta}
              sub={`${comparativo.cur?.ganados ?? 0} oportunidades`}
            />
            <Kpi
              icon={Trophy}
              label="Ingreso YTD"
              value={MXN(kpis.ingresoYTD)}
              sub={`${kpis.ganados} ganados acumulados`}
            />
          </div>

          {/* Revenue trend hero */}
          <div className="bg-card border rounded-2xl p-4 sm:p-5 mb-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="font-semibold text-sm">Ingreso ganado por mes</h2>
                <p className="text-[11px] text-muted-foreground">
                  Cierres reales × precio m³
                </p>
              </div>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={serieMes} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gIng" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    stroke="var(--muted-foreground)"
                    tickFormatter={(v) => MXN(Number(v))}
                    width={60}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "var(--card)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    formatter={(v: number) => MXN(v)}
                  />
                  <Area
                    type="monotone"
                    dataKey="ingreso"
                    stroke="var(--primary)"
                    strokeWidth={2}
                    fill="url(#gIng)"
                    name="Ingreso"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
            {/* Ganados vs Perdidos */}
            <div className="bg-card border rounded-2xl p-4 sm:p-5">
              <h2 className="font-semibold text-sm mb-1">Ganados vs perdidos</h2>
              <p className="text-[11px] text-muted-foreground mb-3">
                Volumen de cierres mensuales
              </p>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={serieMes} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
                    <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                    <YAxis tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                    <Tooltip
                      contentStyle={{
                        background: "var(--card)",
                        border: "1px solid var(--border)",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="ganados" fill="var(--primary)" radius={[4, 4, 0, 0]} name="Ganados" />
                    <Bar dataKey="perdidos" fill="#E1251B" radius={[4, 4, 0, 0]} name="Perdidos" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Win rate trend */}
            <div className="bg-card border rounded-2xl p-4 sm:p-5">
              <h2 className="font-semibold text-sm mb-1">Tendencia de win rate</h2>
              <p className="text-[11px] text-muted-foreground mb-3">
                % de oportunidades cerradas como ganadas
              </p>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={winTrend} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
                    <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      stroke="var(--muted-foreground)"
                      domain={[0, 100]}
                      tickFormatter={(v) => `${v}%`}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "var(--card)",
                        border: "1px solid var(--border)",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                      formatter={(v: number) => `${(v ?? 0).toFixed(1)}%`}
                    />
                    <Line
                      type="monotone"
                      dataKey="winRate"
                      stroke="var(--primary)"
                      strokeWidth={2.5}
                      dot={{ r: 3 }}
                      connectNulls
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
            {/* Embudo */}
            <div className="bg-card border rounded-2xl p-4 sm:p-5">
              <h2 className="font-semibold text-sm mb-1">Embudo por etapa</h2>
              <p className="text-[11px] text-muted-foreground mb-3">
                Donde se concentra el volumen
              </p>
              <div className="space-y-2.5">
                {(() => {
                  const max = Math.max(1, ...embudo.map((e) => e.n));
                  return embudo.map((e) => (
                    <div key={e.etapa}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="font-medium">{e.etapa}</span>
                        <span className="tabular-nums text-muted-foreground">
                          {e.n} · {e.m3.toLocaleString()} m³
                        </span>
                      </div>
                      <div className="h-2.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full transition-all"
                          style={{ width: `${(e.n / max) * 100}%` }}
                        />
                      </div>
                    </div>
                  ));
                })()}
              </div>
            </div>

            {/* Pipeline por estatus de obra */}
            <div className="bg-card border rounded-2xl p-4 sm:p-5">
              <h2 className="font-semibold text-sm mb-1">Mix de pipeline</h2>
              <p className="text-[11px] text-muted-foreground mb-3">
                Estatus actual de las obras abiertas
              </p>
              <div className="space-y-2.5">
                {(() => {
                  const abiertos = sitios.filter((s) => !s.estatus_final);
                  return Object.entries(ESTATUS_LABEL).map(([k, label]) => {
                    const items = abiertos.filter((s) => s.estatus === k);
                    const m3 = items.reduce((a, s) => a + (Number(s.volumen_m3) || 0), 0);
                    const pct = abiertos.length > 0 ? (items.length / abiertos.length) * 100 : 0;
                    return (
                      <div key={k}>
                        <div className="flex justify-between text-xs mb-1">
                          <span>{label}</span>
                          <span className="tabular-nums text-muted-foreground">
                            {items.length} · {MXN(m3 * precio)}
                          </span>
                        </div>
                        <div className="h-2.5 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${pct}%`,
                              backgroundColor: ESTATUS_COLOR[k as keyof typeof ESTATUS_COLOR],
                            }}
                          />
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          </div>

          {/* Top performers */}
          {topVendedores.length > 0 && (
            <div className="bg-card border rounded-2xl p-4 sm:p-5">
              <h2 className="font-semibold text-sm mb-3">Top vendedores por ingreso ganado</h2>
              <div className="space-y-2">
                {topVendedores.map((v, i) => {
                  const max = topVendedores[0].ingreso || 1;
                  return (
                    <div key={i} className="grid grid-cols-[20px_1fr_auto] items-center gap-3">
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <div className="min-w-0">
                        <div className="flex justify-between text-xs mb-1">
                          <span className="font-medium truncate">{v.nombre}</span>
                          <span className="text-muted-foreground tabular-nums ml-2">
                            {v.ganados} ganados
                          </span>
                        </div>
                        <div className="h-2 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full bg-primary rounded-full"
                            style={{ width: `${(v.ingreso / max) * 100}%` }}
                          />
                        </div>
                      </div>
                      <span className="text-sm font-semibold tabular-nums">{MXN(v.ingreso)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {licitaciones.length > 0 && (
            <div className="bg-card border rounded-2xl p-4 sm:p-5 mt-4">
              <h2 className="font-semibold text-sm mb-1">Licitaciones activas</h2>
              <p className="text-[11px] text-muted-foreground mb-4">
                Obras con varios licitantes — quién atendió y resultado final
              </p>
              <div className="space-y-4">
                {licitaciones.map(({ obra, items, m3, ganador }) => {
                  const estatusTone =
                    obra.estatus === "ganada"
                      ? "bg-emerald-100 text-emerald-700 border-emerald-200"
                      : obra.estatus === "perdida"
                        ? "bg-red-100 text-red-700 border-red-200"
                        : obra.estatus === "cancelada"
                          ? "bg-muted text-muted-foreground"
                          : "bg-amber-100 text-amber-700 border-amber-200";
                  return (
                    <div key={obra.id} className="border rounded-xl p-3">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <div className="min-w-0">
                          <div className="font-semibold text-sm truncate">{obra.nombre}</div>
                          <div className="text-[11px] text-muted-foreground">
                            {items.length} licitantes · {m3.toLocaleString()} m³ · proyecta {MXN(m3 * precio)}
                          </div>
                        </div>
                        <span className={`text-[10px] px-2 py-0.5 rounded-md border uppercase tracking-wide ${estatusTone}`}>
                          {obra.estatus}
                        </span>
                      </div>
                      <div className="overflow-x-auto -mx-3 px-3">
                        <table className="w-full text-xs">
                          <thead className="text-[10px] uppercase tracking-wide text-muted-foreground">
                            <tr className="border-b">
                              <th className="text-left py-1.5">Licitante</th>
                              <th className="text-left py-1.5">Vendedor</th>
                              <th className="text-right py-1.5">m³</th>
                              <th className="text-left py-1.5 pl-2">Resultado</th>
                            </tr>
                          </thead>
                          <tbody>
                            {items.map((s) => {
                              const esGanador = ganador?.id === s.id;
                              return (
                                <tr key={s.id} className={`border-b last:border-0 ${esGanador ? "bg-emerald-50" : ""}`}>
                                  <td className="py-1.5 truncate max-w-[160px]">
                                    {s.licitante ?? s.nombre_referencia ?? "—"}
                                  </td>
                                  <td className="py-1.5 truncate max-w-[140px] text-muted-foreground">
                                    {s.profiles?.nombre ?? s.profiles?.email ?? "Sin asignar"}
                                  </td>
                                  <td className="py-1.5 text-right tabular-nums">
                                    {(Number(s.volumen_m3) || 0).toLocaleString()}
                                  </td>
                                  <td className="py-1.5 pl-2">
                                    {esGanador ? (
                                      <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
                                        <Trophy className="h-3 w-3" /> Ganó
                                      </span>
                                    ) : s.estatus_final ? (
                                      <span className="text-muted-foreground capitalize">{s.estatus_final}</span>
                                    ) : (
                                      <span className="text-muted-foreground">en curso</span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      {obra.estatus !== "abierta" && obra.competidor_ganador && !ganador && (
                        <p className="text-[11px] text-muted-foreground mt-2">
                          Ganada por competidor: <span className="font-medium">{obra.competidor_ganador}</span>
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  delta,
  sub,
  primary,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  delta?: number;
  sub?: string;
  primary?: boolean;
}) {
  const dir =
    delta === undefined || !isFinite(delta)
      ? "flat"
      : delta > 0.5
        ? "up"
        : delta < -0.5
          ? "down"
          : "flat";
  const TrendIcon = dir === "up" ? TrendingUp : dir === "down" ? TrendingDown : Minus;
  return (
    <div
      className={`rounded-2xl border p-4 ${
        primary ? "bg-primary text-primary-foreground border-primary" : "bg-card"
      }`}
    >
      <div className="flex items-center justify-between">
        <div
          className={`text-[10px] uppercase tracking-[0.15em] ${
            primary ? "opacity-80" : "text-muted-foreground"
          }`}
        >
          {label}
        </div>
        <Icon className={`h-4 w-4 ${primary ? "opacity-80" : "text-muted-foreground"}`} />
      </div>
      <div className="text-2xl font-semibold tabular-nums mt-2 tracking-tight">{value}</div>
      <div className="flex items-center gap-1.5 mt-1">
        {delta !== undefined && (
          <span
            className={`inline-flex items-center gap-0.5 text-[11px] font-medium px-1.5 py-0.5 rounded-md ${
              primary
                ? "bg-primary-foreground/15"
                : dir === "up"
                  ? "bg-emerald-100 text-emerald-700"
                  : dir === "down"
                    ? "bg-red-100 text-red-700"
                    : "bg-muted text-muted-foreground"
            }`}
          >
            <TrendIcon className="h-3 w-3" />
            {isFinite(delta) ? `${delta > 0 ? "+" : ""}${delta.toFixed(1)}%` : "—"}
          </span>
        )}
        {sub && (
          <span className={`text-[11px] ${primary ? "opacity-80" : "text-muted-foreground"}`}>
            {sub}
          </span>
        )}
      </div>
    </div>
  );
}
