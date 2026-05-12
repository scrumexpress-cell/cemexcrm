import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Download, BarChart3 } from "lucide-react";
import { supabase, type Sitio } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { ESTATUS_LABEL, ESTATUS_COLOR } from "@/lib/sitio-utils";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
});

interface SitioConProfile extends Sitio {
  profiles?: { nombre: string | null; email: string | null } | null;
  zona?: { nombre: string | null } | null;
}

function DashboardPage() {
  const { profile } = useAuth();
  const [sitios, setSitios] = useState<SitioConProfile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("sitios")
      .select("*, profiles:vendedor_id(nombre,email), zona:zona_id(nombre)")
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    else setSitios((data as SitioConProfile[]) ?? []);
    setLoading(false);
  }

  const stats = useMemo(() => {
    const abiertos = sitios.filter((s) => !s.estatus_final);
    const cerrados = sitios.filter((s) => s.estatus_final);
    const ganados = cerrados.filter((s) => s.estatus_final === "ganado");
    const perdidos = cerrados.filter((s) => s.estatus_final === "perdido");
    const totalM3Abierto = abiertos.reduce(
      (a, s) => a + (Number(s.volumen_m3) || 0),
      0,
    );
    const totalM3Ganado = ganados.reduce(
      (a, s) => a + (Number(s.volumen_m3) || 0),
      0,
    );
    const winRate =
      cerrados.length > 0
        ? Math.round((ganados.length / cerrados.length) * 100)
        : 0;
    const porEstatus: Record<string, number> = {};
    abiertos.forEach((s) => {
      porEstatus[s.estatus] = (porEstatus[s.estatus] ?? 0) + 1;
    });
    return {
      total: sitios.length,
      abiertos: abiertos.length,
      cerrados: cerrados.length,
      ganados: ganados.length,
      perdidos: perdidos.length,
      totalM3Abierto,
      totalM3Ganado,
      winRate,
      porEstatus,
    };
  }, [sitios]);

  // Ranking por vendedor (gerente / head)
  const ranking = useMemo(() => {
    const map = new Map<
      string,
      { nombre: string; abiertos: number; ganados: number; m3: number }
    >();
    sitios.forEach((s) => {
      const key = s.vendedor_id ?? "sin-asignar";
      const nombre = s.profiles?.nombre ?? s.profiles?.email ?? "Sin asignar";
      const cur = map.get(key) ?? { nombre, abiertos: 0, ganados: 0, m3: 0 };
      if (!s.estatus_final) cur.abiertos += 1;
      if (s.estatus_final === "ganado") {
        cur.ganados += 1;
        cur.m3 += Number(s.volumen_m3) || 0;
      }
      map.set(key, cur);
    });
    return [...map.values()].sort((a, b) => b.m3 - a.m3 || b.ganados - a.ganados);
  }, [sitios]);

  // Breakdown por zona (head)
  const porZona = useMemo(() => {
    const map = new Map<
      string,
      { nombre: string; abiertos: number; ganados: number; m3Abierto: number; m3Ganado: number }
    >();
    sitios.forEach((s) => {
      const key = s.zona_id ?? "sin-zona";
      const nombre = s.zona?.nombre ?? "Sin zona";
      const cur =
        map.get(key) ?? { nombre, abiertos: 0, ganados: 0, m3Abierto: 0, m3Ganado: 0 };
      if (!s.estatus_final) {
        cur.abiertos += 1;
        cur.m3Abierto += Number(s.volumen_m3) || 0;
      }
      if (s.estatus_final === "ganado") {
        cur.ganados += 1;
        cur.m3Ganado += Number(s.volumen_m3) || 0;
      }
      map.set(key, cur);
    });
    return [...map.values()].sort((a, b) => b.m3Abierto - a.m3Abierto);
  }, [sitios]);

  function exportCsv() {
    const headers = [
      "id",
      "nombre",
      "direccion",
      "estatus",
      "estatus_final",
      "volumen_m3",
      "vendedor",
      "lat",
      "lng",
      "created_at",
      "fecha_cierre",
      "motivo_cierre",
      "competidor",
    ];
    const rows = sitios.map((s) => [
      s.id,
      s.nombre_referencia ?? "",
      s.direccion ?? "",
      s.estatus,
      s.estatus_final ?? "",
      s.volumen_m3 ?? "",
      s.profiles?.nombre ?? s.profiles?.email ?? "",
      s.lat,
      s.lng,
      s.created_at,
      s.fecha_cierre ?? "",
      s.motivo_cierre ?? "",
      s.competidor ?? "",
    ]);
    const csv = [headers, ...rows]
      .map((r) =>
        r
          .map((v) => {
            const str = String(v ?? "");
            return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
          })
          .join(","),
      )
      .join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cemex-sitios-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const isVendedor = profile?.role === "vendedor";
  const isHead = profile?.role === "head";

  return (
    <div className="flex-1 px-4 py-4 max-w-3xl w-full mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-bold flex items-center gap-2">
          <BarChart3 className="h-5 w-5" /> Tablero
        </h1>
        <Button size="sm" variant="outline" onClick={exportCsv} disabled={loading}>
          <Download className="h-4 w-4 mr-1" /> CSV
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Cargando...</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <Stat label="Sitios abiertos" value={stats.abiertos} />
            <Stat label="m³ en pipeline" value={stats.totalM3Abierto.toLocaleString()} />
            <Stat label="Ganados" value={stats.ganados} accent />
            <Stat label="m³ ganados" value={stats.totalM3Ganado.toLocaleString()} accent />
            <Stat label="Perdidos" value={stats.perdidos} />
            <Stat label="Win rate" value={`${stats.winRate}%`} />
          </div>

          <div className="bg-card border rounded-xl p-4 mb-4">
            <h2 className="font-semibold mb-3 text-sm">Pipeline por estatus</h2>
            <div className="space-y-2">
              {Object.entries(ESTATUS_LABEL).map(([k, label]) => {
                const n = stats.porEstatus[k] ?? 0;
                const pct =
                  stats.abiertos > 0 ? (n / stats.abiertos) * 100 : 0;
                return (
                  <div key={k}>
                    <div className="flex justify-between text-xs mb-1">
                      <span>{label}</span>
                      <span className="font-medium">{n}</span>
                    </div>
                    <div className="h-2 rounded bg-muted overflow-hidden">
                      <div
                        style={{
                          width: `${pct}%`,
                          backgroundColor:
                            ESTATUS_COLOR[k as keyof typeof ESTATUS_COLOR],
                        }}
                        className="h-full transition-all"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {!isVendedor && (
            <div className="bg-card border rounded-xl p-4">
              <h2 className="font-semibold mb-3 text-sm">Ranking por vendedor</h2>
              <div className="overflow-x-auto -mx-4 px-4">
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted-foreground">
                    <tr className="border-b">
                      <th className="text-left py-2">Vendedor</th>
                      <th className="text-right py-2">Abiertos</th>
                      <th className="text-right py-2">Ganados</th>
                      <th className="text-right py-2">m³ ganados</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ranking.map((r, i) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className="py-2 truncate max-w-[160px]">{r.nombre}</td>
                        <td className="text-right tabular-nums">{r.abiertos}</td>
                        <td className="text-right tabular-nums">{r.ganados}</td>
                        <td className="text-right tabular-nums font-medium">
                          {r.m3.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-3 ${
        accent ? "bg-primary text-primary-foreground" : "bg-card"
      }`}
    >
      <div className={`text-[11px] uppercase tracking-wide ${accent ? "opacity-80" : "text-muted-foreground"}`}>
        {label}
      </div>
      <div className="text-2xl font-bold tabular-nums mt-1">{value}</div>
    </div>
  );
}
