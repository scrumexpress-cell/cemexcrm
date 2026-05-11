# CEMEX Sites — Tablero de Prospección

App mobile-first para que el equipo de ventas (Jalisco) registre sitios de construcción en campo.

## Setup Supabase (UNA sola vez)

1. Entra al proyecto Supabase: https://supabase.com/dashboard/project/midcykbksonquxljwekb
2. Abre **SQL Editor** y ejecuta el contenido de `supabase/schema.sql`.
3. Ve a **Authentication → Users** y crea 3 usuarios:
   - `vendedor@cemex-demo.mx` — pwd: `Demo1234!`
   - `gerente@cemex-demo.mx` — pwd: `Demo1234!`
   - `head@cemex-demo.mx` — pwd: `Demo1234!`
4. Vuelve al SQL Editor y vuelve a correr el bloque final del `schema.sql` (el `do $$ ... $$` que asigna roles y siembra sitios). Ya con los usuarios existentes, las asignaciones se aplican.
5. En **Authentication → URL Configuration** agrega tu URL de preview a *Redirect URLs* (opcional para magic links; no necesario para email/password).

## Mapbox

La primera vez que entres al mapa te pedirá pegar tu **token público de Mapbox** (`pk.eyJ...`). Se guarda en `localStorage` del navegador. Obtén uno gratis en https://account.mapbox.com/access-tokens/.

## Flujo MVP

Login → Mapa con pins (color por estatus) → botón **+** → captura GPS + foto → guarda → aparece pin → tap pin → detalle/edición/cierre.

## Roles

| Rol | Ve |
|---|---|
| `vendedor` | sus sitios + sin asignar de su zona |
| `gerente` | todos los de su zona |
| `head` | todos |

## Próxima iteración (no incluido todavía)

- Bitácora de interacciones por sitio
- Alertas por volumen (500–1k → gerente, 5k+ → head) y por inactividad
- Dashboards por rol
- Cron de auto-inactivación a 45 días
- Audit log con triggers
- Export a Excel
