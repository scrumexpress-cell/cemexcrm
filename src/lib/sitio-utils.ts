import type { SitioEstatus } from "@/integrations/supabase/client";

export const ESTATUS_LABEL: Record<SitioEstatus, string> = {
  prospecto: "Prospecto",
  competidor_presente: "Competidor presente",
  en_proceso: "En proceso",
  movimiento_de_tierra: "Movimiento de tierra",
};

export const ESTATUS_COLOR: Record<SitioEstatus, string> = {
  prospecto: "#3B82F6", // blue
  competidor_presente: "#EF4444", // red
  en_proceso: "#10B981", // green
  movimiento_de_tierra: "#FFB81C", // CEMEX yellow
};

export const ESTATUS_OPTIONS: SitioEstatus[] = [
  "prospecto",
  "competidor_presente",
  "en_proceso",
  "movimiento_de_tierra",
];
