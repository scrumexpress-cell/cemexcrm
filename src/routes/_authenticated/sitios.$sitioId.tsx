import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Camera } from "lucide-react";
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
  type Sitio,
  type SitioEstatus,
  type SitioEstatusFinal,
  type Foto,
} from "@/integrations/supabase/client";
import {
  ESTATUS_COLOR,
  ESTATUS_LABEL,
  ESTATUS_OPTIONS,
} from "@/lib/sitio-utils";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/sitios/$sitioId")({
  component: SitioDetailPage,
});

const FINAL_OPTIONS: { value: SitioEstatusFinal; label: string }[] = [
  { value: "ganado", label: "Ganado" },
  { value: "perdido", label: "Perdido" },
  { value: "pospuesto", label: "Pospuesto" },
  { value: "inactivo", label: "Inactivo" },
];

function SitioDetailPage() {
  const { sitioId } = Route.useParams();
  const navigate = useNavigate();
  const [sitio, setSitio] = useState<Sitio | null>(null);
  const [fotos, setFotos] = useState<(Foto & { url: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // edit fields
  const [nombre, setNombre] = useState("");
  const [direccion, setDireccion] = useState("");
  const [estatus, setEstatus] = useState<SitioEstatus>("prospecto");
  const [volumen, setVolumen] = useState("");

  // closure
  const [showClose, setShowClose] = useState(false);
  const [estatusFinal, setEstatusFinal] = useState<SitioEstatusFinal>("ganado");
  const [motivo, setMotivo] = useState("");
  const [competidor, setCompetidor] = useState("");

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sitioId]);

  async function load() {
    setLoading(true);
    const [{ data: s }, { data: fs }] = await Promise.all([
      supabase.from("sitios").select("*").eq("id", sitioId).maybeSingle(),
      supabase.from("fotos").select("*").eq("sitio_id", sitioId),
    ]);
    if (s) {
      const sitio = s as Sitio;
      setSitio(sitio);
      setNombre(sitio.nombre_referencia ?? "");
      setDireccion(sitio.direccion ?? "");
      setEstatus(sitio.estatus);
      setVolumen(sitio.volumen_m3?.toString() ?? "");
    }
    if (fs) {
      const withUrls = (fs as Foto[]).map((f) => ({
        ...f,
        url: supabase.storage.from("sitio-fotos").getPublicUrl(f.storage_path)
          .data.publicUrl,
      }));
      setFotos(withUrls);
    }
    setLoading(false);
  }

  async function saveEdits() {
    if (!sitio) return;
    setSaving(true);
    const { error } = await supabase
      .from("sitios")
      .update({
        nombre_referencia: nombre || null,
        direccion: direccion || null,
        estatus,
        volumen_m3: volumen ? Number(volumen) : null,
      })
      .eq("id", sitio.id);
    setSaving(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Cambios guardados");
      void load();
    }
  }

  async function uploadPhoto(file: File) {
    if (!sitio) return;
    const path = `${sitio.id}/${Date.now()}-${file.name.replace(/[^\w.-]/g, "_")}`;
    const { error: upErr } = await supabase.storage
      .from("sitio-fotos")
      .upload(path, file, { contentType: file.type });
    if (upErr) {
      toast.error(upErr.message);
      return;
    }
    await supabase.from("fotos").insert({ sitio_id: sitio.id, storage_path: path });
    toast.success("Foto subida");
    void load();
  }

  async function closeSitio() {
    if (!sitio) return;
    setSaving(true);
    const { error } = await supabase
      .from("sitios")
      .update({
        estatus_final: estatusFinal,
        motivo_cierre: motivo || null,
        competidor: competidor || null,
        fecha_cierre: new Date().toISOString(),
      })
      .eq("id", sitio.id);
    setSaving(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Sitio cerrado");
      navigate({ to: "/map" });
    }
  }

  if (loading) {
    return (
      <div className="p-6 text-sm text-muted-foreground">Cargando...</div>
    );
  }
  if (!sitio) {
    return <div className="p-6">Sitio no encontrado.</div>;
  }

  return (
    <div className="flex-1 px-4 py-4 max-w-2xl w-full mx-auto">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => navigate({ to: "/map" })}
        className="mb-3 -ml-2"
      >
        <ArrowLeft className="h-4 w-4 mr-1" /> Mapa
      </Button>

      <div className="flex flex-wrap gap-2 mb-4">
        <Badge
          style={{
            backgroundColor: ESTATUS_COLOR[sitio.estatus],
            color: "white",
          }}
        >
          {ESTATUS_LABEL[sitio.estatus]}
        </Badge>
        {sitio.estatus_final && (
          <Badge variant="outline">Cerrado: {sitio.estatus_final}</Badge>
        )}
        <Badge variant="secondary">
          {sitio.lat.toFixed(5)}, {sitio.lng.toFixed(5)}
        </Badge>
      </div>

      <div className="space-y-4 bg-card border rounded-xl p-4">
        <div className="space-y-2">
          <Label>Nombre / referencia</Label>
          <Input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            className="h-12"
          />
        </div>
        <div className="space-y-2">
          <Label>Estatus</Label>
          <Select value={estatus} onValueChange={(v) => setEstatus(v as SitioEstatus)}>
            <SelectTrigger className="h-12">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ESTATUS_OPTIONS.map((e) => (
                <SelectItem key={e} value={e}>
                  {ESTATUS_LABEL[e]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Volumen (m³)</Label>
          <Input
            type="number"
            value={volumen}
            onChange={(e) => setVolumen(e.target.value)}
            className="h-12"
          />
        </div>
        <div className="space-y-2">
          <Label>Dirección</Label>
          <Input
            value={direccion}
            onChange={(e) => setDireccion(e.target.value)}
            className="h-12"
          />
        </div>
        <Button
          onClick={saveEdits}
          disabled={saving || !!sitio.estatus_final}
          className="w-full h-12"
        >
          Guardar cambios
        </Button>
      </div>

      <div className="mt-6">
        <h3 className="font-semibold mb-2">Fotos</h3>
        <div className="grid grid-cols-3 gap-2 mb-3">
          {fotos.map((f) => (
            <a key={f.id} href={f.url} target="_blank" rel="noreferrer">
              <img
                src={f.url}
                alt="Foto del sitio"
                className="w-full aspect-square object-cover rounded-md border"
              />
            </a>
          ))}
        </div>
        {!sitio.estatus_final && (
          <label className="flex items-center justify-center gap-2 h-16 border-2 border-dashed rounded-lg cursor-pointer text-sm text-muted-foreground hover:bg-muted/50">
            <Camera className="h-4 w-4" /> Agregar foto
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void uploadPhoto(f);
              }}
            />
          </label>
        )}
      </div>

      {!sitio.estatus_final && (
        <div className="mt-6">
          {!showClose ? (
            <Button
              variant="outline"
              onClick={() => setShowClose(true)}
              className="w-full h-12"
            >
              Cerrar oportunidad
            </Button>
          ) : (
            <div className="bg-card border rounded-xl p-4 space-y-4">
              <h3 className="font-semibold">Cierre de oportunidad</h3>
              <Select
                value={estatusFinal}
                onValueChange={(v) => setEstatusFinal(v as SitioEstatusFinal)}
              >
                <SelectTrigger className="h-12">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FINAL_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="space-y-2">
                <Label>Motivo</Label>
                <Textarea
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  rows={2}
                />
              </div>
              <div className="space-y-2">
                <Label>Competidor (si aplica)</Label>
                <Input
                  value={competidor}
                  onChange={(e) => setCompetidor(e.target.value)}
                  className="h-12"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1 h-12"
                  onClick={() => setShowClose(false)}
                >
                  Cancelar
                </Button>
                <Button
                  className="flex-1 h-12"
                  onClick={closeSitio}
                  disabled={saving}
                >
                  Confirmar cierre
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
