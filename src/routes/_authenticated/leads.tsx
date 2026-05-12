import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Briefcase, Flame, MapPin } from "lucide-react";
import { supabase, type Sitio } from "@/integrations/supabase/client";
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
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/leads")({
  component: LeadsPage,
});

interface SitioConProfile extends Sitio {
  profiles?: { nombre: string | null; email: string | null } | null;
}

function LeadsPage() {
  const { profile } = useAuth();
  const [sitios, setSitios] = useState<SitioConProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterEstatus, setFilterEstatus] = useState("all");
  const [filterPrioridad, setFilterPrioridad] = useState("importantes");

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("sitios")
      .select("*, profiles:vendedor_id(nombre,email)")
      .is("estatus_final", null)
      .order("volumen_m3", { ascending: false, nullsFirst: false });
    if (error) toast.error(error.message);
    else setSitios((data as SitioConProfile[]) ?? []);
    setLoading(false);
  }

  const filtered = useMemo(() => {
    return sitios.filter((s) => {
      if (filterEstatus !== "all" && s.estatus !== filterEstatus) return false;
      const v = s.volumen_m3 ?? 0;
      if (filterPrioridad === "importantes" && v < 1000) return false;
      if (filterPrioridad === "criticos" && v < 5000) return false;
      return true;
    });
  }, [sitios, filterEstatus, filterPrioridad]);

  const totalM3 = filtered.reduce((a, s) => a + (s.volumen_m3 ?? 0), 0);

  return (
    <div className="flex-1 px-4 py-4 max-w-3xl w-full mx-auto overflow-auto">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-lg font-bold flex items-center gap-2">
          <Briefcase className="h-5 w-5" /> Gestión de leads
        </h1>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Priorizados por volumen estimado.{" "}
        {profile?.role === "gerente" ? "Tu zona." : "Todas las zonas."}
      </p>

      <div className="flex gap-2 mb-3 overflow-x-auto">
        <Select value={filterPrioridad} onValueChange={setFilterPrioridad}>
          <SelectTrigger className="h-9 w-[170px] shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos los leads</SelectItem>
            <SelectItem value="importantes">≥ 1,000 m³ (importantes)</SelectItem>
            <SelectItem value="criticos">≥ 5,000 m³ (críticos)</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterEstatus} onValueChange={setFilterEstatus}>
          <SelectTrigger className="h-9 w-[160px] shrink-0">
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
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="rounded-xl border bg-card p-3">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Leads visibles
          </div>
          <div className="text-2xl font-bold tabular-nums mt-1">
            {filtered.length}
          </div>
        </div>
        <div className="rounded-xl border bg-primary text-primary-foreground p-3">
          <div className="text-[11px] uppercase tracking-wide opacity-80">
            m³ en pipeline
          </div>
          <div className="text-2xl font-bold tabular-nums mt-1">
            {totalM3.toLocaleString()}
          </div>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Cargando...</p>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-sm text-muted-foreground">
          Sin leads para los filtros seleccionados.
        </div>
      ) : (
        <ul className="space-y-2">
          {filtered.map((s) => {
            const v = s.volumen_m3 ?? 0;
            const critico = v >= 5000;
            return (
              <li key={s.id}>
                <Link
                  to="/sitios/$sitioId"
                  params={{ sitioId: s.id }}
                  className="block bg-card border rounded-xl p-3 hover:bg-muted/40 transition"
                >
                  <div className="flex items-start gap-3">
                    <div
                      className="h-10 w-10 rounded-lg flex items-center justify-center text-white shrink-0"
                      style={{ backgroundColor: ESTATUS_COLOR[s.estatus] }}
                    >
                      {critico ? (
                        <Flame className="h-5 w-5" />
                      ) : (
                        <MapPin className="h-5 w-5" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="font-semibold truncate">
                          {s.nombre_referencia ?? "Sitio sin nombre"}
                        </h3>
                        <span className="font-bold tabular-nums text-sm shrink-0">
                          {v.toLocaleString()} m³
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        {s.direccion ??
                          `${s.lat.toFixed(4)}, ${s.lng.toFixed(4)}`}
                      </p>
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        <Badge
                          style={{
                            backgroundColor: ESTATUS_COLOR[s.estatus],
                            color: "white",
                          }}
                          className="text-[10px]"
                        >
                          {ESTATUS_LABEL[s.estatus]}
                        </Badge>
                        {critico && (
                          <Badge variant="outline" className="text-[10px] border-accent text-accent">
                            Crítico
                          </Badge>
                        )}
                        <span className="text-[11px] text-muted-foreground self-center ml-auto">
                          {s.profiles?.nombre ?? s.profiles?.email ?? "Sin asignar"}
                        </span>
                      </div>
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
