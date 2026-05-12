-- =========================================================
-- v3: Obras (licitaciones) — agrupador de sitios + ganador
-- =========================================================

create table if not exists public.obras (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  descripcion text,
  created_by uuid references public.profiles(id) on delete set null,
  estatus text not null default 'abierta'
    check (estatus in ('abierta', 'ganada', 'perdida', 'cancelada')),
  ganador_sitio_id uuid,
  fecha_cierre timestamptz,
  motivo_cierre text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.sitios
  add column if not exists obra_id uuid references public.obras(id) on delete set null;

create index if not exists sitios_obra_idx on public.sitios(obra_id);

-- FK ganador_sitio_id sólo después de existir la columna
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'obras_ganador_sitio_fk'
  ) then
    alter table public.obras
      add constraint obras_ganador_sitio_fk
      foreign key (ganador_sitio_id) references public.sitios(id) on delete set null;
  end if;
end $$;

-- Trigger updated_at
drop trigger if exists obras_updated_at on public.obras;
create trigger obras_updated_at before update on public.obras
  for each row execute function public.set_updated_at();

-- =========================================================
-- RLS
-- =========================================================
alter table public.obras enable row level security;

drop policy if exists "obras_select" on public.obras;
create policy "obras_select" on public.obras
  for select to authenticated using (true);

drop policy if exists "obras_insert" on public.obras;
create policy "obras_insert" on public.obras
  for insert to authenticated with check (auth.uid() is not null);

drop policy if exists "obras_update" on public.obras;
create policy "obras_update" on public.obras
  for update to authenticated using (true);

-- =========================================================
-- Cierre de licitación: cuando obra pasa a 'ganada' o 'perdida',
-- propaga el resultado a los sitios hijos.
-- =========================================================
create or replace function public.cerrar_obra_propagar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.estatus in ('ganada', 'perdida', 'cancelada')
     and (old.estatus is distinct from new.estatus) then

    if new.fecha_cierre is null then
      new.fecha_cierre := now();
    end if;

    -- Marcar ganador
    if new.estatus = 'ganada' and new.ganador_sitio_id is not null then
      update public.sitios
         set estatus_final = 'ganado',
             fecha_cierre  = coalesce(fecha_cierre, now()),
             motivo_cierre = coalesce(motivo_cierre, 'Licitación ganada: ' || new.nombre)
       where id = new.ganador_sitio_id;

      -- Los demás de la obra → perdidos
      update public.sitios
         set estatus_final = 'perdido',
             fecha_cierre  = coalesce(fecha_cierre, now()),
             motivo_cierre = coalesce(
               motivo_cierre,
               'Licitación perdida — ganador interno: ' ||
               coalesce((select nombre_referencia from public.sitios where id = new.ganador_sitio_id), 'otro registro')
             )
       where obra_id = new.id
         and id <> new.ganador_sitio_id
         and estatus_final is null;
    end if;

    if new.estatus = 'perdida' then
      update public.sitios
         set estatus_final = 'perdido',
             fecha_cierre  = coalesce(fecha_cierre, now()),
             motivo_cierre = coalesce(motivo_cierre, coalesce(new.motivo_cierre, 'Licitación perdida: ' || new.nombre))
       where obra_id = new.id
         and estatus_final is null;
    end if;

    if new.estatus = 'cancelada' then
      update public.sitios
         set estatus_final = 'inactivo',
             fecha_cierre  = coalesce(fecha_cierre, now()),
             motivo_cierre = coalesce(motivo_cierre, coalesce(new.motivo_cierre, 'Licitación cancelada: ' || new.nombre))
       where obra_id = new.id
         and estatus_final is null;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists obras_cierre_trg on public.obras;
create trigger obras_cierre_trg
  before update on public.obras
  for each row execute function public.cerrar_obra_propagar();
