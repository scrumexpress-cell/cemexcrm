import type { SitioEtapa } from "@/integrations/supabase/client";
import {
  Radar,
  ClipboardList,
  FileCheck2,
  Handshake,
  Flag,
  type LucideIcon,
} from "lucide-react";

const STEPS: { value: SitioEtapa; label: string; icon: LucideIcon }[] = [
  { value: "deteccion", label: "Detección", icon: Radar },
  { value: "registro_inicial", label: "Registro", icon: ClipboardList },
  { value: "info_completa", label: "Info completa", icon: FileCheck2 },
  { value: "en_seguimiento", label: "Seguimiento", icon: Handshake },
  { value: "cerrado", label: "Cierre", icon: Flag },
];

export const ETAPA_LABEL: Record<SitioEtapa, string> = Object.fromEntries(
  STEPS.map((s) => [s.value, s.label])
) as Record<SitioEtapa, string>;

export const ETAPA_ICON: Record<SitioEtapa, LucideIcon> = Object.fromEntries(
  STEPS.map((s) => [s.value, s.icon])
) as Record<SitioEtapa, LucideIcon>;

export function EtapaStepper({ etapa }: { etapa: SitioEtapa }) {
  const idx = STEPS.findIndex((s) => s.value === etapa);
  return (
    <div className="bg-card border rounded-xl p-3">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-3">
        Etapa del pipeline
      </div>
      <div className="flex items-start gap-1">
        {STEPS.map((s, i) => {
          const done = i < idx;
          const active = i === idx;
          const reached = done || active;
          const Icon = s.icon;
          return (
            <div key={s.value} className="flex-1 flex flex-col items-center min-w-0">
              <div className="flex items-center w-full">
                <div
                  className={`h-0.5 flex-1 ${
                    i === 0 ? "opacity-0" : done ? "bg-primary" : "bg-muted"
                  }`}
                />
                <div
                  className={`relative shrink-0 h-9 w-9 rounded-full flex items-center justify-center border-2 ${
                    reached
                      ? "bg-primary border-primary text-primary-foreground"
                      : "bg-background border-muted text-muted-foreground"
                  }`}
                >
                  <Icon className="h-4 w-4" strokeWidth={2} />
                  <span
                    className={`absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full text-[10px] font-bold flex items-center justify-center border ${
                      reached
                        ? "bg-background text-primary border-primary"
                        : "bg-muted text-muted-foreground border-muted"
                    }`}
                  >
                    {i + 1}
                  </span>
                </div>
                <div
                  className={`h-0.5 flex-1 ${
                    i === STEPS.length - 1
                      ? "opacity-0"
                      : i < idx
                        ? "bg-primary"
                        : "bg-muted"
                  }`}
                />
              </div>
              <span
                className={`mt-1.5 text-[10px] text-center leading-tight ${
                  active
                    ? "font-semibold text-foreground"
                    : reached
                      ? "text-foreground/70"
                      : "text-muted-foreground"
                }`}
              >
                {s.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
