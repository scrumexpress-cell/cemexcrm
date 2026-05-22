import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ObraPanel } from "@/components/ObraPanel";
import { EtapaStepper } from "@/components/EtapaStepper";
import { SitioTareas } from "@/components/SitioTareas";
import { SitioComentarios } from "@/components/SitioComentarios";
import { SitioAcciones } from "@/components/SitioAcciones";
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


function sitioDisplayName(sitio: Sitio): string {
  const nombre = sitio.nombre_referencia?.trim();
  if (nombre) return nombre;
  const direccion = sitio.direccion?.split(",")[0]?.trim();
  if (direccion && !/^ninguno$/i.test(direccion)) return `Obra ${direccion}`;
  return `Lead ${sitio.lat.toFixed(4)}, ${sitio.lng.toFixed(4)}`;
}

function SitioDetailPage() {
  const { sitioId } = Route.useParams();
  const navigate = useNavigate();
  
  const [sitio, setSitio] = useState<Sitio | null>(null);
  const [fotos, setFotos] = useState<(Foto & { url: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // edit fields
  const [nombre, setNombre] = useState("");
  const [licitante, setLicitante] = useState("");
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
    const [{ data: s, error: sErr }, { data: fs }] = await Promise.all([
      supabase.from("sitios").select("*").eq("id", sitioId).maybeSingle(),
      supabase.from("fotos").select("*").eq("sitio_id", sitioId),
    ]);
    if (sErr) {
      toast.error(`No se pudo cargar el sitio: ${sErr.message}`);
    }
    if (s) {
      const sitio = s as Sitio;
      setSitio(sitio);
      setNombre(sitio.nombre_referencia ?? "");
      setLicitante(sitio.licitante ?? "");
      setDireccion(sitio.direccion ?? "");
      setEstatus(sitio.estatus);
      setVolumen(sitio.volumen_m3?.toString() ?? "");
    } else {
      setSitio(null);
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
    if (!nombre.trim()) {
      toast.error("Ponle nombre al lead");
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("sitios")
      .update({
        nombre_referencia: nombre.trim(),
        licitante: licitante.trim() || null,
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
        className="mb-3 -ml-2 text-muted-foreground"
      >
        <ArrowLeft className="h-4 w-4 mr-1" /> Mapa
      </Button>

      {/* Hero del lead */}
      <div className="bg-card border rounded-2xl p-4 mb-3 shadow-sm">
        <div className="flex items-start gap-3">
          <div
            className="h-12 w-12 rounded-xl flex items-center justify-center text-white shrink-0 shadow-sm text-base font-bold"
            style={{ backgroundColor: ESTATUS_COLOR[sitio.estatus] }}
          >
            {sitioDisplayName(sitio).charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold leading-tight truncate">
              {sitioDisplayName(sitio)}
            </h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {sitio.estatus_final ? (
                <Badge
                  className="text-xs px-2.5 py-0.5"
                  style={{
                    backgroundColor:
                      sitio.estatus_final === "ganado"
                        ? "#10B981"
                        : sitio.estatus_final === "perdido"
                          ? "#E1251B"
                          : "#6B7280",
                    color: "white",
                  }}
                >
                  Cerrado: {FINAL_OPTIONS.find((o) => o.value === sitio.estatus_final)?.label ?? sitio.estatus_final}
                </Badge>
              ) : (
                <Badge
                  className="text-xs px-2.5 py-0.5"
                  style={{
                    backgroundColor: ESTATUS_COLOR[sitio.estatus],
                    color: "white",
                  }}
                >
                  {ESTATUS_LABEL[sitio.estatus]}
                </Badge>
              )}
              {sitio.volumen_m3 != null && (
                <Badge variant="outline" className="text-xs px-2 py-0.5 tabular-nums">
                  {sitio.volumen_m3.toLocaleString()} m³
                </Badge>
              )}
              <span className="text-[11px] text-muted-foreground tabular-nums ml-auto">
                {sitio.lat.toFixed(4)}, {sitio.lng.toFixed(4)}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="mb-4">
        <EtapaStepper etapa={sitio.etapa} />
      </div>


      <div className="space-y-4 bg-card border rounded-xl p-4">
        <div className="space-y-2">
          <Label>Nombre / referencia de la obra</Label>
          <Input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder={sitioDisplayName(sitio)}
            required
            className="h-12"
          />
        </div>
        <div className="space-y-2">
          <Label>Licitante / cliente que atiendo</Label>
          <Input
            value={licitante}
            onChange={(e) => setLicitante(e.target.value)}
            placeholder="Ej. Constructora ABC (en licitaciones)"
            maxLength={120}
            className="h-12"
          />
          <p className="text-[11px] text-muted-foreground">
            Si la obra es licitación, escribe aquí qué empresa/licitante
            atiendes. La obra se agrupa abajo en "Licitación".
          </p>
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

      <div className="mt-4">
        <SitioAcciones
          sitioId={sitio.id}
          vendedorId={sitio.vendedor_id}
          nombre={sitio.nombre_referencia}
          onReassigned={() => void load()}
        />
      </div>

      <div className="mt-6">
        <SitioTareas
          sitioId={sitio.id}
          vendedorId={sitio.vendedor_id}
          disabled={!!sitio.estatus_final}
        />
      </div>


      <div className="mt-6">
        <ObraPanel sitio={sitio} onChanged={() => void load()} />
      </div>

      <div className="mt-6">
        <SitioComentarios sitioId={sitio.id} vendedorId={sitio.vendedor_id} />
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
