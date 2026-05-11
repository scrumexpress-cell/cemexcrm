-- =====================================================================
-- CEMEX Sites — Iteración 2 (alertas, audit, cron, RLS refinada)
-- Ejecutar UNA VEZ después de schema.sql
-- =====================================================================

-- ---------- RLS interacciones (refinada por visibilidad del sitio)
drop policy if exists "interacciones_all" on public.interacciones;
drop policy if exists "interacciones_select" on public.interacciones;
create policy "interacciones_select" on public.interacciones for select to authenticated using (
  exists (
    select 1 from public.sitios s where s.id = sitio_id and (
      public.has_role(auth.uid(),'head')
      or (public.has_role(auth.uid(),'gerente') and s.zona_id = public.my_zona())
      or s.vendedor_id = auth.uid()
    )
  )
);
drop policy if exists "interacciones_insert" on public.interacciones;
create policy "interacciones_insert" on public.interacciones for insert to authenticated
  with check (vendedor_id = auth.uid());

-- ---------- Audit log: triggers genéricos
create or replace function public.audit_row()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_log(tabla, fila_id, accion, payload, actor_id)
  values (
    tg_table_name,
    coalesce((new).id, (old).id),
    tg_op,
    case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end,
    auth.uid()
  );
  return coalesce(new, old);
end $$;

drop trigger if exists audit_sitios on public.sitios;
create trigger audit_sitios after insert or update or delete on public.sitios
for each row execute function public.audit_row();

drop trigger if exists audit_interacciones on public.interacciones;
create trigger audit_interacciones after insert or update or delete on public.interacciones
for each row execute function public.audit_row();

-- ---------- Alertas: trigger por volumen alto al crear/actualizar sitio
create or replace function public.alerta_volumen()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  m uuid;
begin
  if new.volumen_m3 is not null and new.volumen_m3 >= 1000
     and (tg_op = 'INSERT' or coalesce(old.volumen_m3,0) < 1000) then
    -- alertar al vendedor
    if new.vendedor_id is not null then
      insert into public.alertas(usuario_id, sitio_id, tipo, mensaje)
      values (new.vendedor_id, new.id, 'volumen_alto',
        'Sitio ' || coalesce(new.nombre_referencia,'sin nombre') || ' con volumen ' || new.volumen_m3 || ' m³');
    end if;
    -- alertar al gerente de la zona
    select id into m from public.profiles where role='gerente' and zona_id = new.zona_id limit 1;
    if m is not null then
      insert into public.alertas(usuario_id, sitio_id, tipo, mensaje)
      values (m, new.id, 'volumen_alto',
        'Sitio ' || coalesce(new.nombre_referencia,'sin nombre') || ' (' || new.volumen_m3 || ' m³) requiere atención');
    end if;
  end if;
  return new;
end $$;

drop trigger if exists alerta_volumen_trg on public.sitios;
create trigger alerta_volumen_trg after insert or update of volumen_m3 on public.sitios
for each row execute function public.alerta_volumen();

-- ---------- Auto-inactivación + alerta inactividad
create or replace function public.auto_inactivar_sitios()
returns void language plpgsql security definer set search_path = public as $$
declare
  r record;
  ult timestamptz;
begin
  for r in
    select s.* from public.sitios s
    where s.estatus_final is null
  loop
    select max(fecha) into ult from public.interacciones where sitio_id = r.id;
    ult := coalesce(ult, r.created_at);
    -- 14 días sin interacción → alerta de inactividad
    if ult < now() - interval '14 days' and r.vendedor_id is not null then
      if not exists (
        select 1 from public.alertas
        where sitio_id = r.id and tipo = 'inactividad'
        and created_at > now() - interval '14 days'
      ) then
        insert into public.alertas(usuario_id, sitio_id, tipo, mensaje)
        values (r.vendedor_id, r.id, 'inactividad',
          'Sitio ' || coalesce(r.nombre_referencia,'sin nombre') || ' sin contacto en 14+ días');
      end if;
    end if;
    -- 30 días → marcar inactivo
    if ult < now() - interval '30 days' then
      update public.sitios
      set estatus_final = 'inactivo',
          motivo_cierre = 'Auto-inactivado por 30 días sin contacto',
          fecha_cierre = now()
      where id = r.id;
    end if;
  end loop;
end $$;

-- ---------- pg_cron diario 09:00 UTC (≈03:00 CDMX)
create extension if not exists pg_cron;
do $$ begin
  perform cron.unschedule('cemex-auto-inactivar');
exception when others then null; end $$;
select cron.schedule('cemex-auto-inactivar', '0 9 * * *', $$select public.auto_inactivar_sitios()$$);
