import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { MapPin } from "lucide-react";
import { MapView } from "@/components/MapView";
import { Badge } from "@/components/ui/badge";
import {
  supabase,
  type SitioEstatus,
  type SitioEstatusFinal,
  type SitioEtapa,
} from "@/integrations/supabase/client";
import { ESTATUS_COLOR, ESTATUS_LABEL } from "@/lib/sitio-utils";
import { ETAPA_LABEL } from "@/components/EtapaStepper";

export const Route = createFileRoute("/s/$token")({
  component: SharedSitioPage,
});

interface PublicSitio {
  id: string;
  nombre_referencia: string | null;
  direccion: string | null;
  estatus: SitioEstatus;
  volumen_m3: number | null;
  lat: number;
  lng: number;
  etapa: SitioEtapa;
  estatus_final: SitioEstatusFinal | null;
  created_at: string;
}

function SharedSitioPage() {
  const { token } = Route.useParams();
  const [sitio, setSitio] = useState<PublicSitio | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    supabase
      .rpc("sitio_por_share", { p_token: token })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setError(error.message);
        } else if (!data || (Array.isArray(data) && data.length === 0)) {
          setError("Link inválido o expirado");
        } else {
          const row = Array.isArray(data) ? data[0] : data;
          setSitio(row as PublicSitio);
        }
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">
        Cargando...
      </div>
    );
  }
  if (error || !sitio) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 text-center">
        <div>
          <h1 className="text-lg font-semibold">Link no disponible</h1>
          <p className="text-sm text-muted-foreground mt-2">
            {error ?? "Este link no es válido o ha expirado."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="bg-primary text-primary-foreground px-4 py-3">
        <h1 className="font-semibold">CEMEX Sites — Vista compartida</h1>
        <p className="text-[11px] opacity-80">Solo lectura</p>
      </header>

      <div className="h-64 relative">
        <MapView
          sitios={[
            {
              id: sitio.id,
              lat: sitio.lat,
              lng: sitio.lng,
              nombre_referencia: sitio.nombre_referencia,
              direccion: sitio.direccion,
              estatus: sitio.estatus,
              volumen_m3: sitio.volumen_m3,
              vendedor_id: null,
              vendedor_demo_nombre: null,
              zona_id: null,
              fecha_cierre: null,
              estatus_final: sitio.estatus_final,
              motivo_cierre: null,
              competidor: null,
              notas: null,
              obra_id: null,
              licitante: null,
              etapa: sitio.etapa,
              created_at: sitio.created_at,
              updated_at: sitio.created_at,
              vendedor: null,
            },
          ]}
          center={[sitio.lng, sitio.lat]}
          zoom={15}
          className="absolute inset-0"
        />
      </div>

      <div className="flex-1 px-4 py-4 max-w-2xl w-full mx-auto space-y-3">
        <h2 className="text-xl font-bold">
          {sitio.nombre_referencia ?? "Sitio sin nombre"}
        </h2>
        <div className="flex flex-wrap gap-2">
          <Badge
            style={{ backgroundColor: ESTATUS_COLOR[sitio.estatus], color: "white" }}
          >
            {ESTATUS_LABEL[sitio.estatus]}
          </Badge>
          <Badge variant="outline">Etapa: {ETAPA_LABEL[sitio.etapa]}</Badge>
          {sitio.estatus_final && (
            <Badge variant="outline">Cerrado: {sitio.estatus_final}</Badge>
          )}
          {sitio.volumen_m3 != null && (
            <Badge variant="secondary">{sitio.volumen_m3.toLocaleString()} m³</Badge>
          )}
        </div>
        {sitio.direccion && (
          <div className="flex items-start gap-2 text-sm text-muted-foreground">
            <MapPin className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{sitio.direccion}</span>
          </div>
        )}
        <div className="text-xs text-muted-foreground">
          Coordenadas: {sitio.lat.toFixed(5)}, {sitio.lng.toFixed(5)}
        </div>
      </div>
    </div>
  );
}
