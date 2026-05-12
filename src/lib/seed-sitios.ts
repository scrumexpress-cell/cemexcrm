import {
  supabase,
  type SitioEstatus,
  type SitioEstatusFinal,
  type InteraccionTipo,
} from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";

interface SeedInput {
  user: User;
  zonaId: string | null;
}

type Sample = {
  nombre: string;
  direccion: string;
  estatus: SitioEstatus;
  volumen: number;
  notas: string;
  lng: number;
  lat: number;
  estatus_final?: SitioEstatusFinal;
  motivo_cierre?: string;
  competidor?: string;
};

// 50 oportunidades alrededor de Guadalajara, Zapopan, Tlaquepaque, Tonalá,
// Tlajomulco, El Salto y zonas conurbadas. Mezcla de estatus activos y cerrados.
const SAMPLES: Sample[] = [
  // ---- Zapopan / Andares / Puerta de Hierro ----
  { nombre: "Torre Andares Plaza", direccion: "Blvd. Puerta de Hierro 5210, Zapopan", estatus: "en_proceso", volumen: 4500, notas: "Cliente solicitó cotización rápida", lng: -103.4189, lat: 20.7081 },
  { nombre: "Residencial Valle Real", direccion: "Av. Acueducto 6050, Zapopan", estatus: "prospecto", volumen: 1800, notas: "Primer contacto pendiente", lng: -103.4358, lat: 20.7203 },
  { nombre: "Hospital Real San José", direccion: "Av. Lapizlazuli 3445, Zapopan", estatus: "en_proceso", volumen: 2700, notas: "Aprobación de obra esta semana", lng: -103.4067, lat: 20.7012 },
  { nombre: "Conjunto Habitacional Solares", direccion: "Av. Solares 1200, Zapopan", estatus: "competidor_presente", volumen: 5400, notas: "Comparando con cementera local", lng: -103.4523, lat: 20.7398, competidor: "Cruz Azul" },
  { nombre: "Vía Vallarta Tower", direccion: "Av. Vallarta 5500, Zapopan", estatus: "en_proceso", volumen: 3800, notas: "Negociación en última fase", lng: -103.4156, lat: 20.6789 },
  { nombre: "Midtown Andares", direccion: "Blvd. Puerta de Hierro 5153, Zapopan", estatus: "movimiento_de_tierra", volumen: 9200, notas: "Excavación profunda en curso", lng: -103.4201, lat: 20.7099, estatus_final: "ganado", motivo_cierre: "Pedido firmado por 9,200 m³" },
  { nombre: "Torre Acueducto Skyview", direccion: "Av. Acueducto 1234, Zapopan", estatus: "en_proceso", volumen: 6700, notas: "Esperando visita de obra", lng: -103.4302, lat: 20.7165 },
  { nombre: "Plaza Punto Sao Paulo", direccion: "Av. Vallarta 6503, Zapopan", estatus: "competidor_presente", volumen: 2100, notas: "Comparativa de precios", lng: -103.4267, lat: 20.6755, competidor: "Holcim" },
  { nombre: "Residencial Bosque Real", direccion: "Camino al ITESO 8500, Zapopan", estatus: "prospecto", volumen: 1450, notas: "Contacto vía referido", lng: -103.4612, lat: 20.7089 },
  { nombre: "Cube Corporate Tower", direccion: "Av. Patria 888, Zapopan", estatus: "movimiento_de_tierra", volumen: 7800, notas: "Cimentación iniciando", lng: -103.4023, lat: 20.6987, estatus_final: "ganado", motivo_cierre: "Contrato cerrado" },

  // ---- Guadalajara centro / Providencia / Americana ----
  { nombre: "Plaza Comercial Tepeyac", direccion: "Av. Patria 2255, Guadalajara", estatus: "competidor_presente", volumen: 3200, notas: "Competencia ofrece precio menor", lng: -103.3712, lat: 20.6845, competidor: "Moctezuma" },
  { nombre: "Edificio Corporativo Américas", direccion: "Av. de las Américas 1500, Guadalajara", estatus: "prospecto", volumen: 950, notas: "Solicitan visita técnica", lng: -103.3789, lat: 20.6912 },
  { nombre: "Torre Providencia One", direccion: "Av. Pablo Neruda 3265, Guadalajara", estatus: "en_proceso", volumen: 5600, notas: "Cotización entregada", lng: -103.3854, lat: 20.7012 },
  { nombre: "Centro Cultural Chapultepec", direccion: "Av. Chapultepec 480, Guadalajara", estatus: "prospecto", volumen: 800, notas: "Proyecto en planeación", lng: -103.3678, lat: 20.6712, estatus_final: "pospuesto", motivo_cierre: "Proyecto pospuesto a 2027" },
  { nombre: "Edificio Mítikah GDL", direccion: "Av. López Mateos Sur 2000, Guadalajara", estatus: "movimiento_de_tierra", volumen: 11500, notas: "Obra de gran escala", lng: -103.4012, lat: 20.6534, estatus_final: "ganado", motivo_cierre: "Contrato anual 11,500 m³" },
  { nombre: "Torre Americana Living", direccion: "Av. Américas 600, Guadalajara", estatus: "competidor_presente", volumen: 4200, notas: "Cliente evaluando 3 proveedores", lng: -103.3812, lat: 20.6856, estatus_final: "perdido", motivo_cierre: "Perdido por precio", competidor: "Holcim" },
  { nombre: "Hospital Civil Nuevo", direccion: "Calle Hospital 278, Guadalajara", estatus: "en_proceso", volumen: 6800, notas: "Licitación pública en curso", lng: -103.3489, lat: 20.6823 },
  { nombre: "Mercado Corona Renovación", direccion: "Av. Hidalgo 100, Guadalajara", estatus: "prospecto", volumen: 1100, notas: "Proyecto municipal", lng: -103.3501, lat: 20.6776 },
  { nombre: "Torre Ejecutiva Federalismo", direccion: "Av. Federalismo 1845, Guadalajara", estatus: "en_proceso", volumen: 3400, notas: "Visita programada", lng: -103.3645, lat: 20.6912 },
  { nombre: "Conjunto Av. Hidalgo Lofts", direccion: "Av. Hidalgo 2150, Guadalajara", estatus: "competidor_presente", volumen: 2300, notas: "Cliente regateando", lng: -103.3778, lat: 20.6798, estatus_final: "perdido", motivo_cierre: "Cliente eligió competidor", competidor: "Cemex regional" },

  // ---- Tlaquepaque / Tonalá ----
  { nombre: "Centro Comercial Tonalá Plaza", direccion: "Av. Tonaltecas 350, Tonalá", estatus: "prospecto", volumen: 2200, notas: "Lead frío", lng: -103.2412, lat: 20.6234 },
  { nombre: "Parque Industrial Tonalá Norte", direccion: "Carr. a Zapotlanejo Km 8, Tonalá", estatus: "movimiento_de_tierra", volumen: 8800, notas: "Naves industriales", lng: -103.2089, lat: 20.6512, estatus_final: "ganado", motivo_cierre: "Pedido confirmado" },
  { nombre: "Residencial San Pedrito", direccion: "Av. San Pedrito 450, Tlaquepaque", estatus: "en_proceso", volumen: 1900, notas: "Proyecto residencial", lng: -103.3134, lat: 20.6398 },
  { nombre: "Plaza Tlaquepaque Centro", direccion: "Independencia 174, Tlaquepaque", estatus: "competidor_presente", volumen: 1600, notas: "Comparativa con Holcim", lng: -103.3134, lat: 20.6412, competidor: "Holcim" },
  { nombre: "Hospital Tlaquepaque IMSS", direccion: "Av. Niños Héroes, Tlaquepaque", estatus: "prospecto", volumen: 4100, notas: "Licitación próxima", lng: -103.3201, lat: 20.6356 },
  { nombre: "Centro Logístico Tonalá Sur", direccion: "Periférico Oriente 4500, Tonalá", estatus: "en_proceso", volumen: 5300, notas: "Cliente interesado", lng: -103.2456, lat: 20.6089, estatus_final: "ganado", motivo_cierre: "Cierre exitoso" },
  { nombre: "Bodega Mayorista Tlaquepaque", direccion: "Av. Río Nilo 8200, Tlaquepaque", estatus: "movimiento_de_tierra", volumen: 6200, notas: "Obra avanzada", lng: -103.2845, lat: 20.6478 },

  // ---- Tlajomulco ----
  { nombre: "Centro Logístico CIVAC", direccion: "Periférico Sur 8500, Tlajomulco", estatus: "movimiento_de_tierra", volumen: 8200, notas: "Movimiento de tierra avanzado", lng: -103.4012, lat: 20.5634 },
  { nombre: "Conjunto Habitacional Cajititlán", direccion: "Carr. Cajititlán Km 4, Tlajomulco", estatus: "prospecto", volumen: 3700, notas: "1,200 viviendas planeadas", lng: -103.3267, lat: 20.4923 },
  { nombre: "Parque Industrial Bugambilias", direccion: "Av. Adolf Horn 8500, Tlajomulco", estatus: "en_proceso", volumen: 9100, notas: "Naves logísticas", lng: -103.4456, lat: 20.5234, estatus_final: "ganado", motivo_cierre: "Contrato a 18 meses" },
  { nombre: "Residencial Hacienda Real", direccion: "Av. de la Cima 1450, Tlajomulco", estatus: "competidor_presente", volumen: 2800, notas: "Cliente con proveedor actual", lng: -103.4634, lat: 20.5489, estatus_final: "perdido", motivo_cierre: "Perdido por relación previa", competidor: "Cementos Fortaleza" },
  { nombre: "Centro Educativo Lomas Altas", direccion: "Av. Lomas Altas 200, Tlajomulco", estatus: "prospecto", volumen: 1300, notas: "Escuela privada", lng: -103.4378, lat: 20.5612 },
  { nombre: "Plaza San Agustín", direccion: "Av. López Mateos Sur 7500, Tlajomulco", estatus: "en_proceso", volumen: 4400, notas: "Centro comercial", lng: -103.4123, lat: 20.5567 },

  // ---- El Salto / Juanacatlán ----
  { nombre: "Bodegas Industriales El Salto", direccion: "Carr. a El Salto Km 6, El Salto", estatus: "movimiento_de_tierra", volumen: 6500, notas: "Cimentación inicia próxima semana", lng: -103.1854, lat: 20.5267 },
  { nombre: "Planta Manufactura El Salto", direccion: "Av. Industria Maquiladora 100, El Salto", estatus: "en_proceso", volumen: 7400, notas: "Expansión de planta", lng: -103.1723, lat: 20.5189, estatus_final: "ganado", motivo_cierre: "Pedido recurrente" },
  { nombre: "Centro Distribución FedEx", direccion: "Carr. Chapala Km 12, El Salto", estatus: "prospecto", volumen: 5800, notas: "Logística en evaluación", lng: -103.2012, lat: 20.5034 },
  { nombre: "Conjunto Habitacional Juanacatlán", direccion: "Av. Hidalgo 50, Juanacatlán", estatus: "competidor_presente", volumen: 2400, notas: "Negociación abierta", lng: -103.1634, lat: 20.5089, competidor: "Holcim" },

  // ---- Sur / López Mateos / Santa Anita ----
  { nombre: "Vía 040 López Mateos", direccion: "Av. López Mateos Sur 4900, Zapopan", estatus: "en_proceso", volumen: 5200, notas: "Torre de oficinas", lng: -103.4089, lat: 20.6534 },
  { nombre: "Santa Anita Country Club", direccion: "Carr. a Morelia Km 5, Tlajomulco", estatus: "prospecto", volumen: 3100, notas: "Renovación de club", lng: -103.4567, lat: 20.5723 },
  { nombre: "Residencial Pontevedra", direccion: "Av. Adolf Horn 2300, Tlajomulco", estatus: "movimiento_de_tierra", volumen: 4800, notas: "Etapa 2 iniciando", lng: -103.4378, lat: 20.5856, estatus_final: "ganado", motivo_cierre: "Repetición de cliente" },
  { nombre: "Plaza López Mateos Sur", direccion: "Av. López Mateos Sur 5800, Tlajomulco", estatus: "competidor_presente", volumen: 1700, notas: "Proyecto pequeño", lng: -103.4145, lat: 20.6012, estatus_final: "perdido", motivo_cierre: "Volumen no rentable", competidor: "Local" },

  // ---- Universidad / CUCEI ----
  { nombre: "Centro Universitario CUCEI", direccion: "Blvd. Marcelino García Barragán 1421", estatus: "prospecto", volumen: 1200, notas: "Proyecto público, requiere licitación", lng: -103.3267, lat: 20.6534 },
  { nombre: "Residencias Universitarias UDG", direccion: "Av. Juárez 976, Guadalajara", estatus: "en_proceso", volumen: 2900, notas: "Proyecto universitario", lng: -103.3478, lat: 20.6789 },
  { nombre: "Biblioteca Central UDG", direccion: "Periférico Norte 799, Zapopan", estatus: "competidor_presente", volumen: 1500, notas: "Comparativa de proveedores", lng: -103.3823, lat: 20.7234, estatus_final: "pospuesto", motivo_cierre: "Presupuesto pospuesto" },

  // ---- Norte / Belenes / Periférico ----
  { nombre: "Plaza Belenes", direccion: "Periférico Norte 4180, Zapopan", estatus: "en_proceso", volumen: 3600, notas: "Centro comercial nuevo", lng: -103.3923, lat: 20.7345 },
  { nombre: "Torre Médica Belenes", direccion: "Av. Periférico Norte 4200, Zapopan", estatus: "movimiento_de_tierra", volumen: 5900, notas: "Hospital privado", lng: -103.3956, lat: 20.7378, estatus_final: "ganado", motivo_cierre: "Contrato firmado" },
  { nombre: "Residencial Parques del Auditorio", direccion: "Av. Patria 1900, Zapopan", estatus: "prospecto", volumen: 2000, notas: "Lead reciente", lng: -103.4078, lat: 20.7045 },
  { nombre: "Centro Empresarial Periférico", direccion: "Periférico Norte 5500, Zapopan", estatus: "competidor_presente", volumen: 4600, notas: "Decisión próxima semana", lng: -103.4123, lat: 20.7423, competidor: "Moctezuma" },
  { nombre: "Estadio Akron Renovación", direccion: "Av. Vallarta 5500, Zapopan", estatus: "en_proceso", volumen: 7200, notas: "Renovación de gradas", lng: -103.4623, lat: 20.6823, estatus_final: "ganado", motivo_cierre: "Adjudicación directa" },
];

// Distribuye fechas a lo largo de los últimos 10 meses con más densidad
// en meses recientes (curva creciente para mostrar tendencia ejecutiva).
function distributedCreatedAt(idx: number, total: number): Date {
  const monthsBack = Math.floor(((total - idx) / total) * 9 + Math.random() * 1.5);
  const d = new Date();
  d.setMonth(d.getMonth() - monthsBack);
  d.setDate(1 + Math.floor(Math.random() * 27));
  d.setHours(Math.floor(Math.random() * 23), Math.floor(Math.random() * 59));
  return d;
}

// Cierres distribuidos en últimos 6 meses con tendencia positiva.
function distributedCloseAt(createdAt: Date): Date {
  const now = new Date();
  const minMonths = Math.max(0, Math.floor((now.getTime() - createdAt.getTime()) / (30 * 86400000)));
  const monthsBack = Math.floor(Math.random() * Math.min(6, minMonths + 1));
  const d = new Date();
  d.setMonth(d.getMonth() - monthsBack);
  d.setDate(1 + Math.floor(Math.random() * 27));
  return d;
}

const TIPOS: InteraccionTipo[] = ["llamada", "visita", "whatsapp", "cotizacion", "muestra"];
const RESULTADOS = [
  "Cliente interesado, pide propuesta formal",
  "Re-agendar visita la próxima semana",
  "Compartió plano de obra",
  "Pidió ajuste de precio",
  "Comparando con competencia",
  "Aprobado por dirección de obra",
  "Sin respuesta",
  "Confirma volumen estimado",
];

export async function seedSampleSitios({ user, zonaId }: SeedInput) {
  const total = SAMPLES.length;
  const rows = SAMPLES.map((s, i) => {
    const created = distributedCreatedAt(i, total);
    const closed = s.estatus_final ? distributedCloseAt(created) : null;
    return {
      lat: s.lat,
      lng: s.lng,
      nombre_referencia: s.nombre,
      direccion: s.direccion,
      estatus: s.estatus,
      volumen_m3: s.volumen,
      notas: s.notas,
      vendedor_id: user.id,
      zona_id: zonaId,
      competidor: s.competidor ?? null,
      estatus_final: s.estatus_final ?? null,
      motivo_cierre: s.motivo_cierre ?? null,
      fecha_cierre: closed ? closed.toISOString() : null,
      created_at: created.toISOString(),
      updated_at: (closed ?? created).toISOString(),
    };
  });

  const { data, error } = await supabase.from("sitios").insert(rows).select("id, created_at, fecha_cierre");
  if (error) throw error;

  // Sembrar interacciones distribuidas entre created_at y fecha_cierre (o ahora).
  const interacciones: Array<{
    sitio_id: string;
    vendedor_id: string;
    tipo: InteraccionTipo;
    resultado: string;
    notas: string | null;
    fecha: string;
  }> = [];
  (data ?? []).forEach((row) => {
    const start = new Date(row.created_at).getTime();
    const end = row.fecha_cierre ? new Date(row.fecha_cierre).getTime() : Date.now();
    const span = Math.max(86400000, end - start);
    const n = 1 + Math.floor(Math.random() * 4);
    for (let k = 0; k < n; k++) {
      const t = start + Math.random() * span;
      interacciones.push({
        sitio_id: row.id,
        vendedor_id: user.id,
        tipo: TIPOS[Math.floor(Math.random() * TIPOS.length)],
        resultado: RESULTADOS[Math.floor(Math.random() * RESULTADOS.length)],
        notas: null,
        fecha: new Date(t).toISOString(),
      });
    }
  });
  if (interacciones.length > 0) {
    const { error: iErr } = await supabase.from("interacciones").insert(interacciones);
    if (iErr) console.warn("interacciones seed:", iErr.message);
  }

  return data;
}

/**
 * Re-distribuye fechas e inserta interacciones en sitios ya existentes del usuario,
 * para que las gráficas mes-a-mes tengan datos significativos sin duplicar registros.
 */
export async function enrichExistingDemoData(user: User) {
  const { data: existing, error } = await supabase
    .from("sitios")
    .select("id, estatus_final, created_at")
    .eq("vendedor_id", user.id);
  if (error) throw error;
  if (!existing || existing.length === 0) return { updated: 0, interacciones: 0 };

  const total = existing.length;
  let updated = 0;
  for (let i = 0; i < total; i++) {
    const s = existing[i];
    const created = distributedCreatedAt(i, total);
    const closed = s.estatus_final ? distributedCloseAt(created) : null;
    const { error: uErr } = await supabase
      .from("sitios")
      .update({
        created_at: created.toISOString(),
        fecha_cierre: closed ? closed.toISOString() : null,
        updated_at: (closed ?? created).toISOString(),
      })
      .eq("id", s.id);
    if (!uErr) updated += 1;
  }

  // Limpia interacciones previas del usuario y resiembra
  const ids = existing.map((s) => s.id);
  await supabase.from("interacciones").delete().in("sitio_id", ids);

  const { data: refreshed } = await supabase
    .from("sitios")
    .select("id, created_at, fecha_cierre")
    .in("id", ids);

  const interacciones: Array<{
    sitio_id: string;
    vendedor_id: string;
    tipo: InteraccionTipo;
    resultado: string;
    notas: string | null;
    fecha: string;
  }> = [];
  (refreshed ?? []).forEach((row) => {
    const start = new Date(row.created_at).getTime();
    const end = row.fecha_cierre ? new Date(row.fecha_cierre).getTime() : Date.now();
    const span = Math.max(86400000, end - start);
    const n = 1 + Math.floor(Math.random() * 4);
    for (let k = 0; k < n; k++) {
      const t = start + Math.random() * span;
      interacciones.push({
        sitio_id: row.id,
        vendedor_id: user.id,
        tipo: TIPOS[Math.floor(Math.random() * TIPOS.length)],
        resultado: RESULTADOS[Math.floor(Math.random() * RESULTADOS.length)],
        notas: null,
        fecha: new Date(t).toISOString(),
      });
    }
  });
  if (interacciones.length > 0) {
    await supabase.from("interacciones").insert(interacciones);
  }
  return { updated, interacciones: interacciones.length };
}
