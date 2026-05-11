import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://midcykbksonquxljwekb.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1pZGN5a2Jrc29ucXV4bGp3ZWtiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1MjQyNjMsImV4cCI6MjA5NDEwMDI2M30.4FAtBv9wtkmOu9XEOPKo5NMvIoizv6xRq4KQ0LW1ma4";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: typeof window !== "undefined" ? window.localStorage : undefined,
  },
});

export type Role = "vendedor" | "gerente" | "head";
export type SitioEstatus =
  | "prospecto"
  | "competidor_presente"
  | "en_proceso"
  | "movimiento_de_tierra";
export type SitioEstatusFinal = "ganado" | "perdido" | "pospuesto" | "inactivo";

export interface Profile {
  id: string;
  nombre: string | null;
  email: string | null;
  role: Role;
  zona_id: string | null;
  manager_id: string | null;
}

export interface Sitio {
  id: string;
  lat: number;
  lng: number;
  nombre_referencia: string | null;
  direccion: string | null;
  estatus: SitioEstatus;
  volumen_m3: number | null;
  vendedor_id: string | null;
  zona_id: string | null;
  fecha_cierre: string | null;
  estatus_final: SitioEstatusFinal | null;
  motivo_cierre: string | null;
  competidor: string | null;
  created_at: string;
  updated_at: string;
}

export interface Foto {
  id: string;
  sitio_id: string;
  storage_path: string;
  created_at: string;
}
