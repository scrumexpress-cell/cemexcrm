import { supabase, type SitioEstatus } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";

interface SeedInput {
  user: User;
  zonaId: string | null;
}

const SAMPLES: Array<{
  nombre: string;
  direccion: string;
  estatus: SitioEstatus;
  volumen: number;
  notas: string;
  lng: number;
  lat: number;
}> = [
  {
    nombre: "Torre Andares Plaza",
    direccion: "Blvd. Puerta de Hierro 5210, Zapopan",
    estatus: "en_proceso",
    volumen: 4500,
    notas: "Cliente solicitó cotización rápida",
    lng: -103.4189,
    lat: 20.7081,
  },
  {
    nombre: "Residencial Valle Real",
    direccion: "Av. Acueducto 6050, Zapopan",
    estatus: "prospecto",
    volumen: 1800,
    notas: "Primer contacto pendiente",
    lng: -103.4358,
    lat: 20.7203,
  },
  {
    nombre: "Centro Logístico CIVAC",
    direccion: "Periférico Sur 8500, Tlajomulco",
    estatus: "movimiento_de_tierra",
    volumen: 8200,
    notas: "Movimiento de tierra avanzado, urgente",
    lng: -103.4012,
    lat: 20.5634,
  },
  {
    nombre: "Plaza Comercial Tepeyac",
    direccion: "Av. Patria 2255, Guadalajara",
    estatus: "competidor_presente",
    volumen: 3200,
    notas: "Competencia ofrece precio menor",
    lng: -103.3712,
    lat: 20.6845,
  },
  {
    nombre: "Hospital Real San José",
    direccion: "Av. Lapizlazuli 3445, Zapopan",
    estatus: "en_proceso",
    volumen: 2700,
    notas: "Aprobación de obra esta semana",
    lng: -103.4067,
    lat: 20.7012,
  },
  {
    nombre: "Edificio Corporativo Américas",
    direccion: "Av. de las Américas 1500, Guadalajara",
    estatus: "prospecto",
    volumen: 950,
    notas: "Solicitan visita técnica",
    lng: -103.3789,
    lat: 20.6912,
  },
  {
    nombre: "Bodegas Industriales El Salto",
    direccion: "Carr. a El Salto Km 6, El Salto",
    estatus: "movimiento_de_tierra",
    volumen: 6500,
    notas: "Cimentación inicia próxima semana",
    lng: -103.1854,
    lat: 20.5267,
  },
  {
    nombre: "Conjunto Habitacional Solares",
    direccion: "Av. Solares 1200, Zapopan",
    estatus: "competidor_presente",
    volumen: 5400,
    notas: "Comparando con cementera local",
    lng: -103.4523,
    lat: 20.7398,
  },
  {
    nombre: "Vía Vallarta Tower",
    direccion: "Av. Vallarta 5500, Zapopan",
    estatus: "en_proceso",
    volumen: 3800,
    notas: "Negociación en última fase",
    lng: -103.4156,
    lat: 20.6789,
  },
  {
    nombre: "Centro Universitario CUCEI",
    direccion: "Blvd. Marcelino García Barragán 1421",
    estatus: "prospecto",
    volumen: 1200,
    notas: "Proyecto público, requiere licitación",
    lng: -103.3267,
    lat: 20.6534,
  },
];

export async function seedSampleSitios({ user, zonaId }: SeedInput) {
  const rows = SAMPLES.map((s) => ({
    lat: s.lat,
    lng: s.lng,
    nombre_referencia: s.nombre,
    direccion: s.direccion,
    estatus: s.estatus,
    volumen_m3: s.volumen,
    notas: s.notas,
    vendedor_id: user.id,
    zona_id: zonaId,
  }));

  const { data, error } = await supabase.from("sitios").insert(rows).select();
  if (error) throw error;
  return data;
}
