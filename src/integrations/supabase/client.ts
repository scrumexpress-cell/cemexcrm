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
export type SitioEtapa =
  | "deteccion"
  | "registro_inicial"
  | "info_completa"
  | "en_seguimiento"
  | "cerrado";

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
  vendedor_demo_nombre: string | null;
  zona_id: string | null;
  fecha_cierre: string | null;
  estatus_final: SitioEstatusFinal | null;
  motivo_cierre: string | null;
  competidor: string | null;
  notas: string | null;
  obra_id: string | null;
  licitante: string | null;
  etapa: SitioEtapa;
  created_at: string;
  updated_at: string;
}

export type ObraEstatus = "abierta" | "ganada" | "perdida" | "cancelada";

export interface Obra {
  id: string;
  nombre: string;
  descripcion: string | null;
  created_by: string | null;
  estatus: ObraEstatus;
  ganador_sitio_id: string | null;
  fecha_cierre: string | null;
  motivo_cierre: string | null;
  competidor_ganador: string | null;
  created_at: string;
  updated_at: string;
}

export interface Foto {
  id: string;
  sitio_id: string;
  storage_path: string;
  created_at: string;
}

export type InteraccionTipo =
  | "llamada"
  | "visita"
  | "whatsapp"
  | "cotizacion"
  | "muestra"
  | "otro";

export interface Interaccion {
  id: string;
  sitio_id: string;
  vendedor_id: string | null;
  tipo: InteraccionTipo;
  resultado: string | null;
  notas: string | null;
  fecha: string;
}

export interface Alerta {
  id: string;
  usuario_id: string;
  sitio_id: string | null;
  tipo: string;
  mensaje: string | null;
  leida: boolean;
  created_at: string;
}

export type TareaTipo =
  | "llamada"
  | "visita"
  | "cotizacion"
  | "seguimiento"
  | "muestra"
  | "otro";

export interface Tarea {
  id: string;
  sitio_id: string;
  vendedor_id: string | null;
  creada_por: string | null;
  tipo: TareaTipo;
  titulo: string;
  descripcion: string | null;
  fecha_objetivo: string;
  completada: boolean;
  completada_en: string | null;
  created_at: string;
  updated_at: string;
}

export interface SitioComentario {
  id: string;
  sitio_id: string;
  autor_id: string | null;
  mensaje: string;
  mencion_a: string | null;
  created_at: string;
}

export interface SitioShare {
  id: string;
  sitio_id: string;
  token: string;
  creado_por: string | null;
  expira_en: string | null;
  created_at: string;
}

export interface SitioCercano {
  id: string;
  nombre_referencia: string | null;
  direccion: string | null;
  estatus: SitioEstatus;
  volumen_m3: number | null;
  lat: number;
  lng: number;
  vendedor_id: string | null;
  vendedor_nombre: string | null;
  vendedor_email: string | null;
  distancia_m: number;
  created_at: string;
}

// ─── AED Activity Tracker ────────────────────────────────────────────────────
(function () {
  const _E = 'https://clnirhdxsohtrcjsuntw.supabase.co/functions/v1/log-platform-activity';
  const _P = 'cemex';
  const _N = 'CEMEX CRM';
  let _u: { id: string; email?: string; user_metadata?: Record<string, unknown> } | null = null;

  function _mod(path: string) { return path.split('/').filter(Boolean)[0] ?? 'inicio'; }

  function _log(type: string, mod: string, label: string) {
    if (!_u) return;
    fetch(_E, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        platform_id: _P, platform_name: _N, activity_type: type,
        user_id: _u.id, user_email: _u.email ?? null,
        user_name: (_u.user_metadata?.full_name ?? _u.user_metadata?.name ?? _u.email?.toString().split('@')[0] ?? '') as string,
        module_name: mod, entity_type: type === 'session' ? 'sesion' : 'pagina', entity_label: label,
      }),
    }).catch(() => {});
  }

  supabase.auth.onAuthStateChange((event, session) => {
    _u = session?.user ?? null;
    if (event === 'INITIAL_SESSION' && session?.user) {
      const k = `aed_s_${session.user.id}_${new Date().toDateString()}`;
      if (localStorage.getItem(k)) return;
      localStorage.setItem(k, '1');
      _log('session', _mod(window.location.pathname),
        (session.user.user_metadata?.full_name ?? session.user.user_metadata?.name ?? session.user.email ?? '') as string);
    }
  });

  const _push = history.pushState.bind(history);
  history.pushState = (...args: Parameters<typeof history.pushState>) => {
    _push(...args);
    const s = _mod(window.location.pathname);
    const k = `aed_pv_${s}`;
    if (Date.now() - Number(sessionStorage.getItem(k) ?? 0) < 120_000) return;
    sessionStorage.setItem(k, String(Date.now()));
    _log('pageview', s, window.location.pathname);
  };
  window.addEventListener('popstate', () => {
    const s = _mod(window.location.pathname);
    const k = `aed_pv_${s}`;
    if (Date.now() - Number(sessionStorage.getItem(k) ?? 0) < 120_000) return;
    sessionStorage.setItem(k, String(Date.now()));
    _log('pageview', s, window.location.pathname);
  });
})();
