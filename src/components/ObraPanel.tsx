import { useEffect, useState } from "react";
import { Loader2, Trophy, X, Link2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  type Obra,
  type Sitio,
} from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Props {
  sitio: Sitio;
  onChanged: () => void;
}

const ESTATUS_LABEL: Record<Obra["estatus"], string> = {
  abierta: "Abierta",
  ganada: "Ganada",
  perdida: "Perdida",
  cancelada: "Cancelada",
};

type Hermano = Sitio & {
  vendedor?: { nombre: string | null; email: string | null } | null;
};

export function ObraPanel({ sitio, onChanged }: Props) {
  const [obra, setObra] = useState<Obra | null>(null);
  const [hermanos, setHermanos] = useState<Hermano[]>([]);
  const [allObras, setAllObras] = useState<Obra[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<"none" | "new" | "link">("none");
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [linkObraId, setLinkObraId] = useState<string>("");
  const [closeMotivo, setCloseMotivo] = useState("");
  const [competidorGanador, setCompetidorGanador] = useState("");

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sitio.id, sitio.obra_id]);

  async function load() {
    setLoading(true);
    if (sitio.obra_id) {
      const [{ data: o }, { data: hs }] = await Promise.all([
        supabase.from("obras").select("*").eq("id", sitio.obra_id).maybeSingle(),
        supabase
          .from("sitios")
          .select("*, vendedor:vendedor_id(nombre,email)")
          .eq("obra_id", sitio.obra_id)
          .order("created_at", { ascending: false }),
      ]);
      setObra((o as Obra) ?? null);
      setHermanos((hs as unknown as Hermano[]) ?? []);
    } else {
      setObra(null);
      setHermanos([]);
      const { data } = await supabase
        .from("obras")
        .select("*")
        .eq("estatus", "abierta")
        .order("created_at", { ascending: false })
        .limit(50);
      setAllObras((data as Obra[]) ?? []);
    }
    setLoading(false);
  }

  async function createAndLink() {
    if (!newName.trim()) return toast.error("Pon un nombre a la licitación");
    setSaving(true);
    const { data: o, error } = await supabase
      .from("obras")
      .insert({
        nombre: newName.trim(),
        descripcion: newDesc.trim() || null,
      })
      .select()
      .single();
    if (error || !o) {
      setSaving(false);
      return toast.error(error?.message ?? "Error");
    }
    const { error: e2 } = await supabase
      .from("sitios")
      .update({ obra_id: o.id })
      .eq("id", sitio.id);
    setSaving(false);
    if (e2) return toast.error(e2.message);
    toast.success("Licitación creada y vinculada");
    setMode("none");
    setNewName("");
    setNewDesc("");
    onChanged();
  }

  async function linkExisting() {
    if (!linkObraId) return;
    setSaving(true);
    const { error } = await supabase
      .from("sitios")
      .update({ obra_id: linkObraId })
      .eq("id", sitio.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Vinculado a la licitación");
    setMode("none");
    onChanged();
  }

  async function unlink() {
    setSaving(true);
    const { error } = await supabase
      .from("sitios")
      .update({ obra_id: null })
      .eq("id", sitio.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Desvinculado");
    onChanged();
  }

  async function marcarGanador() {
    if (!obra) return;
    setSaving(true);
    const { error } = await supabase
      .from("obras")
      .update({
        estatus: "ganada",
        ganador_sitio_id: sitio.id,
        motivo_cierre: closeMotivo || null,
      })
      .eq("id", obra.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Licitación cerrada como ganada");
    onChanged();
  }

  async function cerrarPerdida() {
    if (!obra) return;
    setSaving(true);
    const { error } = await supabase
      .from("obras")
      .update({
        estatus: "perdida",
        motivo_cierre: closeMotivo || null,
        competidor_ganador: competidorGanador.trim() || null,
      })
      .eq("id", obra.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Licitación cerrada — ganador externo");
    onChanged();
  }

  if (loading) {
    return (
      <div className="text-xs text-muted-foreground py-4 flex items-center gap-2">
        <Loader2 className="h-3 w-3 animate-spin" /> Cargando licitación...
      </div>
    );
  }

  // Sin obra ligada
  if (!obra) {
    return (
      <div className="bg-card border rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Licitación</h3>
          <span className="text-xs text-muted-foreground">
            Sin agrupar
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          Si esta obra es una licitación con varios competidores o registros,
          agrúpalos para llevar un solo cierre con ganador.
        </p>

        {mode === "none" && (
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              className="flex-1"
              onClick={() => setMode("new")}
            >
              <Plus className="h-4 w-4 mr-1" /> Nueva licitación
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="flex-1"
              onClick={() => setMode("link")}
              disabled={allObras.length === 0}
            >
              <Link2 className="h-4 w-4 mr-1" /> Vincular existente
            </Button>
          </div>
        )}

        {mode === "new" && (
          <div className="space-y-2">
            <div>
              <Label className="text-xs">Nombre de la licitación</Label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Ej. Licitación Hospital Civil 2026"
                maxLength={120}
                className="h-10"
              />
            </div>
            <div>
              <Label className="text-xs">Descripción (opcional)</Label>
              <Textarea
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                rows={2}
                maxLength={500}
              />
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setMode("none")}
                disabled={saving}
              >
                Cancelar
              </Button>
              <Button
                size="sm"
                onClick={createAndLink}
                disabled={saving || !newName.trim()}
              >
                Crear y vincular
              </Button>
            </div>
          </div>
        )}

        {mode === "link" && (
          <div className="space-y-2">
            <Select value={linkObraId} onValueChange={setLinkObraId}>
              <SelectTrigger className="h-10">
                <SelectValue placeholder="Elige una licitación abierta" />
              </SelectTrigger>
              <SelectContent>
                {allObras.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setMode("none")}
                disabled={saving}
              >
                Cancelar
              </Button>
              <Button
                size="sm"
                onClick={linkExisting}
                disabled={saving || !linkObraId}
              >
                Vincular
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Con obra ligada
  const cerrada = obra.estatus !== "abierta";
  const esGanador = obra.ganador_sitio_id === sitio.id;

  return (
    <div className="bg-card border rounded-xl p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold flex items-center gap-2">
            Licitación: {obra.nombre}
            {esGanador && <Trophy className="h-4 w-4 text-amber-500" />}
          </h3>
          {obra.descripcion && (
            <p className="text-xs text-muted-foreground mt-0.5">
              {obra.descripcion}
            </p>
          )}
        </div>
        <Badge
          variant={cerrada ? "outline" : "secondary"}
          className={
            obra.estatus === "ganada"
              ? "bg-green-100 text-green-900 dark:bg-green-900/30 dark:text-green-300 border-green-300"
              : obra.estatus === "perdida"
                ? "bg-red-100 text-red-900 dark:bg-red-900/30 dark:text-red-300 border-red-300"
                : ""
          }
        >
          {ESTATUS_LABEL[obra.estatus]}
        </Badge>
      </div>

      <div>
        <div className="text-xs font-medium mb-1">
          Licitantes registrados ({hermanos.length})
        </div>
        <ul className="space-y-1">
          {hermanos.map((h) => {
            const isThis = h.id === sitio.id;
            const isWinner = obra.ganador_sitio_id === h.id;
            const vendedorNombre =
              h.vendedor_demo_nombre ?? h.vendedor?.nombre ?? h.vendedor?.email ?? "sin vendedor";
            return (
              <li
                key={h.id}
                className={`flex items-start justify-between gap-2 text-xs rounded-md px-2 py-1.5 ${
                  isThis ? "bg-muted font-medium" : ""
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 truncate">
                    {isWinner && (
                      <Trophy className="h-3 w-3 text-amber-500 shrink-0" />
                    )}
                    <span className="truncate">
                      {h.licitante ?? h.nombre_referencia ?? "Sin nombre"}
                    </span>
                    {isThis && (
                      <span className="text-[10px] text-muted-foreground shrink-0">
                        (este)
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-muted-foreground truncate">
                    Vendedor: {vendedorNombre}
                    {h.estatus_final && (
                      <span className="ml-1">· {h.estatus_final}</span>
                    )}
                  </div>
                </div>
                <span className="text-muted-foreground shrink-0">
                  {h.volumen_m3 ? `${h.volumen_m3.toLocaleString()} m³` : "—"}
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      {!cerrada && (
        <div className="space-y-3 pt-2 border-t">
          <div className="space-y-1.5">
            <Label className="text-xs">Motivo / contexto del cierre</Label>
            <Textarea
              value={closeMotivo}
              onChange={(e) => setCloseMotivo(e.target.value)}
              rows={2}
              maxLength={500}
              placeholder="Ej. Cliente final eligió por precio / plazo de entrega"
            />
          </div>

          <div className="rounded-md border p-2 space-y-2">
            <div className="text-xs font-semibold">Cierre de la licitación</div>

            <Button
              size="sm"
              onClick={marcarGanador}
              disabled={saving}
              className="w-full bg-green-600 hover:bg-green-700 text-white"
            >
              <Trophy className="h-4 w-4 mr-1" />
              Ganamos: este registro fue el ganador
            </Button>

            <div className="space-y-1.5">
              <Label className="text-[11px] text-muted-foreground">
                ¿Ganó un competidor externo? (opcional)
              </Label>
              <Input
                value={competidorGanador}
                onChange={(e) => setCompetidorGanador(e.target.value)}
                placeholder="Ej. Cementos Moctezuma"
                maxLength={120}
                className="h-9"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={cerrarPerdida}
                disabled={saving}
                className="w-full"
              >
                Cerrar como perdida (ganador externo)
              </Button>
              <p className="text-[10px] text-muted-foreground">
                Todos los licitantes vinculados quedarán como{" "}
                <strong>perdidos</strong> con el motivo y competidor capturados.
              </p>
            </div>
          </div>

          <Button
            size="sm"
            variant="ghost"
            onClick={unlink}
            disabled={saving}
            className="w-full text-xs text-muted-foreground"
          >
            <X className="h-3 w-3 mr-1" /> Desvincular este registro
          </Button>
        </div>
      )}

      {cerrada && (
        <div className="text-xs pt-2 border-t space-y-1">
          {obra.estatus === "ganada" && (
            <div className="text-green-700 dark:text-green-400 font-medium">
              <Trophy className="h-3 w-3 inline mr-1" />
              Ganador:{" "}
              {(() => {
                const w = hermanos.find(
                  (h) => h.id === obra.ganador_sitio_id,
                );
                if (!w) return "—";
                const v = w.vendedor_demo_nombre ?? w.vendedor?.nombre ?? w.vendedor?.email ?? "—";
                return `${w.licitante ?? w.nombre_referencia ?? "registro"} · vendedor ${v}`;
              })()}
            </div>
          )}
          {obra.estatus === "perdida" && obra.competidor_ganador && (
            <div className="text-red-700 dark:text-red-400 font-medium">
              Ganó externo: {obra.competidor_ganador}
            </div>
          )}
          {obra.motivo_cierre && (
            <div className="text-muted-foreground">
              <span className="font-medium text-foreground">Motivo: </span>
              {obra.motivo_cierre}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
