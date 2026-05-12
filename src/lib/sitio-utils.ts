import type { SitioEstatus } from "@/integrations/supabase/client";
import { Target, Swords, HardHat, Mountain, type LucideIcon } from "lucide-react";

export const ESTATUS_LABEL: Record<SitioEstatus, string> = {
  prospecto: "Prospecto",
  competidor_presente: "Competidor presente",
  en_proceso: "En proceso",
  movimiento_de_tierra: "Movimiento de tierra",
};

export const ESTATUS_COLOR: Record<SitioEstatus, string> = {
  prospecto: "#1F2A93", // CEMEX blue
  competidor_presente: "#E1251B", // CEMEX red
  en_proceso: "#10B981", // green (functional)
  movimiento_de_tierra: "#F59E0B", // amber (functional)
};

export const ESTATUS_ICON: Record<SitioEstatus, LucideIcon> = {
  prospecto: Target,
  competidor_presente: Swords,
  en_proceso: HardHat,
  movimiento_de_tierra: Mountain,
};

export const ESTATUS_OPTIONS: SitioEstatus[] = [
  "prospecto",
  "competidor_presente",
  "en_proceso",
  "movimiento_de_tierra",
];

