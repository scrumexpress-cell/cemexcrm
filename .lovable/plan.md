# CEMEX Sites — Plan de MVP (Núcleo)

## Alcance de esta iteración

1. **Login** email/password contra el Supabase externo provisto.
2. **Crear/editar sitios** con GPS automático, ajuste manual en mapa, fotos en Storage, campos básicos.
3. **Mapa principal** con pins por estatus, drawer de detalle y filtros.
4. **Seed**: zona Jalisco + 3 usuarios demo (vendedor/gerente/head) + ~5 sitios.

Bitácora completa, alertas, dashboards por rol, audit_log y cron de inactividad → **iteración 2**.

## Stack (ajuste)

El proyecto está sobre **TanStack Start + React 19 + Vite + Tailwind v4** (no Vite plano como pedía el prompt). Mantenemos eso — es funcionalmente equivalente y ya está cableado. Mapas con **Mapbox GL JS**.

## Backend — Supabase externo

Usaré la URL y anon key del prompt. Crearé un cliente browser y, como las migraciones deben correrse en *tu* proyecto Supabase (no tengo acceso directo a ese proyecto desde Lovable), entregaré **un archivo `supabase/schema.sql`** que tú ejecutarás una vez en el SQL Editor del dashboard. Incluirá: tablas, RLS, triggers, bucket de Storage y seed.

### Esquema (núcleo)

```
zonas(id, nombre)
profiles(id=auth.users.id, nombre, email, role[vendedor|gerente|head], zona_id, manager_id)
sitios(id, lat, lng, nombre_referencia, direccion, estatus, volumen_m3,
       vendedor_id, zona_id, fecha_cierre, estatus_final, motivo_cierre,
       competidor, created_at, updated_at)
fotos(id, sitio_id, storage_path, created_at)
```

Tablas placeholder (`interacciones`, `alertas`, `audit_log`) las creo vacías con RLS lista para la iteración 2.

### RLS

- `has_role(uid, role)` SECURITY DEFINER sobre `profiles` para evitar recursión.
- `vendedor`: ve sitios donde `vendedor_id = auth.uid()` o `vendedor_id IS NULL AND zona_id = mi_zona`.
- `gerente`: ve sitios de su `zona_id`.
- `head`: ve todo.
- INSERT: cualquier autenticado puede crear; `vendedor_id` se setea a `auth.uid()` por default.

### Storage

Bucket público `sitio-fotos` con policy de upload sólo autenticados, lectura pública (para mostrar en el mapa sin firmar URLs).

### Trigger profiles

`on_auth_user_created` → inserta fila en `profiles` con role `vendedor` por defecto.

### Seed

- 1 zona "Jalisco — Guadalajara Metro".
- 3 usuarios demo (los creas con `supabase.auth.admin` o desde Authentication UI; el SQL incluirá los UPSERT a `profiles` con sus roles una vez que existan los UUID — te dejo instrucciones claras).
- 5 sitios de ejemplo en coordenadas reales de GDL con distintos estatus/volúmenes.

## Frontend — Rutas (TanStack)

```
src/routes/
  __root.tsx              (ya existe; añado AuthProvider + Toaster)
  index.tsx               (redirige a /map si auth, a /login si no)
  login.tsx               (form email/password)
  _authenticated.tsx      (guard: redirect /login si no hay sesión)
  _authenticated/map.tsx              (mapa Mapbox + filtros + FAB "+")
  _authenticated/sitios.$sitioId.tsx  (detalle + edición + fotos)
  _authenticated/sitios.nuevo.tsx     (alta rápida con GPS+foto)
```

## Componentes clave

- `<MapView>` — Mapbox GL JS, pins coloreados por estatus, click → drawer con resumen y CTA "Ver detalle".
- `<SiteForm>` — captura GPS (`navigator.geolocation`), mini-mapa para ajustar pin, inputs grandes (≥44px), uploader de fotos múltiples a Storage.
- `<FilterBar>` — estatus, volumen (range), fecha último contacto (placeholder hasta tener interacciones), vendedor (sólo gerente/head).
- `<RoleGate>` — helper para mostrar/ocultar UI por rol.

## Estilo

Tokens en `src/styles.css` (oklch):
- `--primary` = azul CEMEX `#003C71`
- `--accent` = amarillo `#FFB81C` (alertas/CTAs secundarios)
- neutrales grises industriales
- Font: Inter (via `<link>` en `__root`)
- Botones grandes (h-12), tarjetas con sombra sutil, mobile-first.

## Secrets

- **Mapbox public token**: lo pediré con `add_secret` como `VITE_MAPBOX_TOKEN` (es publishable, va al bundle).
- Supabase URL y anon key del prompt → en código (son públicos).

## Detalles técnicos relevantes

- Cliente Supabase browser: `@/integrations/supabase/client.ts` con `createClient` y `persistSession: true`.
- Auth state: hook `useAuth()` con `onAuthStateChange` (subscribe ANTES de `getSession()`).
- `_authenticated` route con `beforeLoad` que valida sesión en `supabase.auth.getUser()` y redirige a `/login` si falta.
- GPS: `navigator.geolocation.getCurrentPosition` con timeout 10s y fallback a click manual en mapa.
- Fotos: redimensionado client-side a max 1600px antes de subir (canvas) para ahorrar ancho de banda en campo.

## Entregables al final de esta iteración

1. App corriendo en preview con login funcional.
2. Flujo: login → mapa → "+" → captura GPS+foto → guarda → aparece pin → click pin → detalle/edición.
3. Archivo `supabase/schema.sql` listo para copiar/pegar en el SQL Editor de tu proyecto, con instrucciones paso a paso para crear los 3 usuarios demo.
4. README con credenciales demo y siguiente pasos hacia iteración 2.

## Lo que NO incluye esta iteración

- Bitácora de interacciones
- Tabla y bandeja de alertas + triggers de volumen/inactividad
- Dashboards por rol
- Cron de auto-inactivación a 45 días
- Audit log
- Exportar a Excel
- Heatmap por volumen

¿Procedo con la implementación?
