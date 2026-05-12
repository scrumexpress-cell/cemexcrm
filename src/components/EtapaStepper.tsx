import type { SitioEtapa } from "@/integrations/supabase/client";

const STEPS: { value: SitioEtapa; label: string }[] = [
  { value: "deteccion", label: "Detección" },
  { value: "registro_inicial", label: "Registro" },
  { value: "info_completa", label: "Info completa" },
  { value: "en_seguimiento", label: "Seguimiento" },
  { value: "cerrado", label: "Cierre" },
];

export const ETAPA_LABEL: Record<SitioEtapa, string> = Object.fromEntries(
  STEPS.map((s) => [s.value, s.label])
) as Record<SitioEtapa, string>;

export function EtapaStepper({ etapa }: { etapa: SitioEtapa }) {
  const idx = STEPS.findIndex((s) => s.value === etapa);
  return (
    <div className="bg-card border rounded-xl p-3">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">
        Etapa del pipeline
      </div>
      <div className="flex items-center gap-1">
        {STEPS.map((s, i) => {
          const done = i < idx;
          const active = i === idx;
          return (
            <div key={s.value} className="flex-1 flex items-center gap-1 min-w-0">
              <div
                className={`h-2 flex-1 rounded-full ${
                  done || active ? "bg-primary" : "bg-muted"
                }`}
              />
              {i === STEPS.length - 1 && (
                <div className={`h-2 w-2 rounded-full ${active ? "bg-primary" : "bg-muted"}`} />
              )}
            </div>
          );
        })}
      </div>
      <div className="flex justify-between mt-2 gap-1">
        {STEPS.map((s, i) => (
          <span
            key={s.value}
            className={`text-[10px] flex-1 text-center ${
              i === idx ? "font-semibold text-foreground" : "text-muted-foreground"
            }`}
          >
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}
