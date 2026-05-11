# CEMEX Sites — Tablero de Prospección

App mobile-first para que el equipo de ventas (Jalisco) registre sitios de construcción en campo.

## Setup Supabase (UNA sola vez)

1. Entra al proyecto Supabase: https://supabase.com/dashboard/project/midcykbksonquxljwekb
2. Abre **SQL Editor** y ejecuta el contenido de `supabase/schema.sql`.
3. Ve a **Authentication → Users** y crea 3 usuarios:
   - `vendedor@cemex-demo.mx` — pwd: `Demo1234!`
   - `gerente@cemex-demo.mx` — pwd: `Demo1234!`
   - `head@cemex-demo.mx` — pwd: `Demo1234!`
4. Vuelve al SQL Editor y vuelve a correr el bloque final del `schema.sql` (el `do $$ ... $$` que asigna roles y siembra sitios).
5. Ejecuta `supabase/schema_v2.sql` para activar **bitácora con RLS**, **alertas por volumen**, **audit log** y **cron de auto-inactivación**.

## Mapbox

La primera vez que entres al mapa te pedirá pegar tu **token público de Mapbox** (`pk.eyJ...`). Se guarda en `localStorage`. Obtén uno gratis en https://account.mapbox.com/access-tokens/.

## Funcionalidad

- **Mapa** con pins por estatus + filtros (estatus, volumen).
- **Crear sitio** con GPS + foto + ajuste manual del pin.
- **Detalle** del sitio: editar, fotos, **bitácora** (llamada/visita/WhatsApp/cotización/muestra) y cierre (ganado / perdido / pospuesto / inactivo).
- **Alertas** en tiempo real:
  - Volumen ≥ 1,000 m³ → notifica al vendedor y al gerente de la zona.
  - Inactividad ≥ 14 días sin interacción → alerta al vendedor.
  - Inactividad ≥ 30 días → auto-marca como `inactivo` (cron diario 09:00 UTC).
- **Tablero** con KPIs (pipeline, ganados, win rate), barra de pipeline por estatus, ranking por vendedor (gerente/head) y export **CSV**.
- **Audit log** con triggers en `sitios` e `interacciones` (visible para gerente/head).

## Roles

| Rol | Ve |
|---|---|
| `vendedor` | sus sitios + sin asignar de su zona; sus alertas; tablero personal |
| `gerente` | todos los de su zona; ranking de su equipo |
| `head` | todos los sitios y todos los vendedores |

