-- =====================================================================
-- CEMEX Sites — Schema MVP (núcleo)
-- Ejecutar UNA SOLA VEZ en SQL Editor del proyecto Supabase.
-- =====================================================================

-- ---------- Enums
do $$ begin
  create type public.app_role as enum ('vendedor','gerente','head');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.sitio_estatus as enum (
    'prospecto','competidor_presente','en_proceso','movimiento_de_tierra'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.sitio_estatus_final as enum (
    'ganado','perdido','pospuesto','inactivo'
  );
exception when duplicate_object then null; end $$;

-- ---------- Tablas
create table if not exists public.zonas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nombre text,
  email text,
  role public.app_role not null default 'vendedor',
  zona_id uuid references public.zonas(id),
  manager_id uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.sitios (
  id uuid primary key default gen_random_uuid(),
  lat double precision not null,
  lng double precision not null,
  nombre_referencia text,
  direccion text,
  estatus public.sitio_estatus not null default 'prospecto',
  volumen_m3 numeric,
  notas text,
  vendedor_id uuid references public.profiles(id),
  zona_id uuid references public.zonas(id),
  fecha_cierre timestamptz,
  estatus_final public.sitio_estatus_final,
  motivo_cierre text,
  competidor text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists sitios_vendedor_idx on public.sitios(vendedor_id);
create index if not exists sitios_zona_idx on public.sitios(zona_id);

create table if not exists public.fotos (
  id uuid primary key default gen_random_uuid(),
  sitio_id uuid not null references public.sitios(id) on delete cascade,
  storage_path text not null,
  created_at timestamptz not null default now()
);

-- Tablas placeholder para iteración 2
create table if not exists public.interacciones (
  id uuid primary key default gen_random_uuid(),
  sitio_id uuid not null references public.sitios(id) on delete cascade,
  vendedor_id uuid references public.profiles(id),
  tipo text not null,
  resultado text,
  notas text,
  fecha timestamptz not null default now()
);

create table if not exists public.alertas (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.profiles(id) on delete cascade,
  sitio_id uuid references public.sitios(id) on delete cascade,
  tipo text not null,
  mensaje text,
  leida boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  tabla text not null,
  fila_id uuid,
  accion text not null,
  payload jsonb,
  actor_id uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

-- ---------- Function: has_role (SECURITY DEFINER, evita recursión RLS)
create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles where id = _user_id and role = _role
  )
$$;

create or replace function public.my_zona()
returns uuid
language sql stable security definer set search_path = public as $$
  select zona_id from public.profiles where id = auth.uid()
$$;

-- ---------- Trigger: auto-crear profile al registrarse
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, nombre, role)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'nombre', new.email), 'vendedor')
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- ---------- updated_at trigger
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists sitios_updated_at on public.sitios;
create trigger sitios_updated_at before update on public.sitios
for each row execute function public.set_updated_at();

-- ---------- RLS
alter table public.zonas        enable row level security;
alter table public.profiles     enable row level security;
alter table public.sitios       enable row level security;
alter table public.fotos        enable row level security;
alter table public.interacciones enable row level security;
alter table public.alertas      enable row level security;
alter table public.audit_log    enable row level security;

-- zonas: lectura para todos los autenticados
drop policy if exists "zonas_read" on public.zonas;
create policy "zonas_read" on public.zonas for select to authenticated using (true);

-- profiles
drop policy if exists "profiles_self_read" on public.profiles;
create policy "profiles_self_read" on public.profiles for select to authenticated
  using (id = auth.uid() or public.has_role(auth.uid(),'gerente') or public.has_role(auth.uid(),'head'));
drop policy if exists "profiles_self_update" on public.profiles;
create policy "profiles_self_update" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- sitios
drop policy if exists "sitios_select" on public.sitios;
create policy "sitios_select" on public.sitios for select to authenticated using (
  public.has_role(auth.uid(),'head')
  or (public.has_role(auth.uid(),'gerente') and zona_id = public.my_zona())
  or vendedor_id = auth.uid()
  or (vendedor_id is null and zona_id = public.my_zona())
);
drop policy if exists "sitios_insert" on public.sitios;
create policy "sitios_insert" on public.sitios for insert to authenticated
  with check (vendedor_id = auth.uid() or public.has_role(auth.uid(),'gerente') or public.has_role(auth.uid(),'head'));
drop policy if exists "sitios_update" on public.sitios;
create policy "sitios_update" on public.sitios for update to authenticated using (
  public.has_role(auth.uid(),'head')
  or (public.has_role(auth.uid(),'gerente') and zona_id = public.my_zona())
  or vendedor_id = auth.uid()
);

-- fotos: heredan visibilidad del sitio
drop policy if exists "fotos_select" on public.fotos;
create policy "fotos_select" on public.fotos for select to authenticated using (
  exists (select 1 from public.sitios s where s.id = sitio_id)
);
drop policy if exists "fotos_insert" on public.fotos;
create policy "fotos_insert" on public.fotos for insert to authenticated with check (true);

-- interacciones / alertas / audit_log: básicas (refinar en it. 2)
drop policy if exists "interacciones_all" on public.interacciones;
create policy "interacciones_all" on public.interacciones for all to authenticated
  using (true) with check (true);
drop policy if exists "alertas_self" on public.alertas;
create policy "alertas_self" on public.alertas for all to authenticated
  using (usuario_id = auth.uid()) with check (true);
drop policy if exists "audit_read" on public.audit_log;
create policy "audit_read" on public.audit_log for select to authenticated
  using (public.has_role(auth.uid(),'gerente') or public.has_role(auth.uid(),'head'));

-- ---------- Storage bucket
insert into storage.buckets (id, name, public)
values ('sitio-fotos','sitio-fotos', true)
on conflict (id) do nothing;

drop policy if exists "sitio_fotos_read" on storage.objects;
create policy "sitio_fotos_read" on storage.objects for select to public
  using (bucket_id = 'sitio-fotos');
drop policy if exists "sitio_fotos_upload" on storage.objects;
create policy "sitio_fotos_upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'sitio-fotos');
drop policy if exists "sitio_fotos_delete" on storage.objects;
create policy "sitio_fotos_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'sitio-fotos');

-- ---------- Seed: zona
insert into public.zonas (nombre)
values ('Jalisco — Guadalajara Metro')
on conflict (nombre) do nothing;

-- =====================================================================
-- USUARIOS DEMO
-- ---------------------------------------------------------------------
-- Crea estos 3 usuarios desde Authentication > Users en el dashboard:
--   1) vendedor@cemex-demo.mx     (password: Demo1234!)
--   2) gerente@cemex-demo.mx      (password: Demo1234!)
--   3) head@cemex-demo.mx         (password: Demo1234!)
--
-- Después corre el siguiente bloque para asignar roles + zona y sembrar
-- 5 sitios de ejemplo:
-- =====================================================================

do $$
declare
  z uuid;
  v uuid; g uuid; h uuid;
begin
  select id into z from public.zonas where nombre = 'Jalisco — Guadalajara Metro';
  select id into v from auth.users where email = 'vendedor@cemex-demo.mx';
  select id into g from auth.users where email = 'gerente@cemex-demo.mx';
  select id into h from auth.users where email = 'head@cemex-demo.mx';

  if v is not null then
    update public.profiles set role='vendedor', zona_id=z, manager_id=g, nombre='Vendedor Demo' where id=v;
  end if;
  if g is not null then
    update public.profiles set role='gerente',  zona_id=z, nombre='Gerente Demo' where id=g;
  end if;
  if h is not null then
    update public.profiles set role='head', nombre='Head Demo' where id=h;
  end if;

  if v is not null then
    insert into public.sitios (lat,lng,nombre_referencia,direccion,estatus,volumen_m3,vendedor_id,zona_id) values
      (20.6736,-103.3440,'Obra Av. Vallarta','Av. Vallarta 3000','prospecto',300,v,z),
      (20.6595,-103.3580,'Plaza Andares Anexo','Zapopan','en_proceso',1500,v,z),
      (20.7100,-103.3900,'Fracc. Real San Javier','Zapopan Norte','movimiento_de_tierra',5200,v,z),
      (20.6300,-103.3100,'Ampliación Tlaquepaque','Tlaquepaque centro','competidor_presente',800,v,z),
      (20.6800,-103.4200,'Centro Comercial Periférico','Periférico Pte','prospecto',250,v,z)
    on conflict do nothing;
  end if;
end $$;
