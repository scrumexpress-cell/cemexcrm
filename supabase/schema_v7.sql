-- =====================================================
-- v7: Tareas, comentarios, shares públicos, push, geocercas,
--     búsqueda por proximidad y reasignación de vendedor.
-- =====================================================

-- ---------- Extensiones útiles
create extension if not exists pgcrypto;
create extension if not exists "uuid-ossp";

-- =====================================================
-- 1. TAREAS / RECORDATORIOS POR SITIO
-- =====================================================
do $$ begin
  create type public.tarea_tipo as enum (
    'llamada','visita','cotizacion','seguimiento','muestra','otro'
  );
exception when duplicate_object then null; end $$;

create table if not exists public.tareas (
  id uuid primary key default gen_random_uuid(),
  sitio_id uuid not null references public.sitios(id) on delete cascade,
  vendedor_id uuid references public.profiles(id) on delete set null,
  creada_por uuid references public.profiles(id) on delete set null,
  tipo public.tarea_tipo not null default 'seguimiento',
  titulo text not null,
  descripcion text,
  fecha_objetivo date not null,
  completada boolean not null default false,
  completada_en timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tareas_vendedor_fecha_idx
  on public.tareas (vendedor_id, fecha_objetivo)
  where completada = false;

create index if not exists tareas_sitio_idx
  on public.tareas (sitio_id);

alter table public.tareas enable row level security;

drop policy if exists "tareas_select" on public.tareas;
create policy "tareas_select" on public.tareas for select to authenticated
  using (
    vendedor_id = auth.uid()
    or creada_por = auth.uid()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('gerente','head')
    )
  );

drop policy if exists "tareas_insert" on public.tareas;
create policy "tareas_insert" on public.tareas for insert to authenticated
  with check (
    creada_por = auth.uid()
  );

drop policy if exists "tareas_update" on public.tareas;
create policy "tareas_update" on public.tareas for update to authenticated
  using (
    vendedor_id = auth.uid()
    or creada_por = auth.uid()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('gerente','head')
    )
  );

drop policy if exists "tareas_delete" on public.tareas;
create policy "tareas_delete" on public.tareas for delete to authenticated
  using (
    creada_por = auth.uid()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('gerente','head')
    )
  );

-- Función: marcar vencidas y generar alerta única por tarea
create or replace function public.tareas_vencidas_alerta()
returns void language plpgsql security definer set search_path = public as $$
declare
  t record;
begin
  for t in
    select id, sitio_id, vendedor_id, titulo, fecha_objetivo
      from public.tareas
     where completada = false
       and fecha_objetivo < current_date
       and vendedor_id is not null
  loop
    if not exists (
      select 1 from public.alertas
       where tipo = 'tarea_vencida'
         and usuario_id = t.vendedor_id
         and mensaje like '%' || t.id::text || '%'
    ) then
      insert into public.alertas(usuario_id, sitio_id, tipo, mensaje)
      values (
        t.vendedor_id,
        t.sitio_id,
        'tarea_vencida',
        'Tarea vencida: ' || t.titulo || ' (#' || t.id || ')'
      );
    end if;
  end loop;
end $$;

-- =====================================================
-- 2. COMENTARIOS POR SITIO (chat interno)
-- =====================================================
create table if not exists public.sitio_comentarios (
  id uuid primary key default gen_random_uuid(),
  sitio_id uuid not null references public.sitios(id) on delete cascade,
  autor_id uuid references public.profiles(id) on delete set null,
  mensaje text not null,
  mencion_a uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists sitio_comentarios_sitio_idx
  on public.sitio_comentarios (sitio_id, created_at desc);

alter table public.sitio_comentarios enable row level security;

drop policy if exists "comentarios_select" on public.sitio_comentarios;
create policy "comentarios_select" on public.sitio_comentarios for select to authenticated
  using (true);

drop policy if exists "comentarios_insert" on public.sitio_comentarios;
create policy "comentarios_insert" on public.sitio_comentarios for insert to authenticated
  with check (autor_id = auth.uid());

drop policy if exists "comentarios_delete" on public.sitio_comentarios;
create policy "comentarios_delete" on public.sitio_comentarios for delete to authenticated
  using (
    autor_id = auth.uid()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('gerente','head')
    )
  );

-- Notificación al mencionado
create or replace function public.comentario_notifica_mencion()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.mencion_a is not null and new.mencion_a <> coalesce(new.autor_id, '00000000-0000-0000-0000-000000000000'::uuid) then
    insert into public.alertas(usuario_id, sitio_id, tipo, mensaje)
    values (
      new.mencion_a,
      new.sitio_id,
      'mencion_comentario',
      'Te mencionaron en un comentario del sitio'
    );
  end if;
  return new;
end $$;

drop trigger if exists comentario_notifica_mencion_trg on public.sitio_comentarios;
create trigger comentario_notifica_mencion_trg
  after insert on public.sitio_comentarios
  for each row execute function public.comentario_notifica_mencion();

-- =====================================================
-- 3. SHARES PÚBLICOS DE SITIO (link read-only)
-- =====================================================
create table if not exists public.sitio_shares (
  id uuid primary key default gen_random_uuid(),
  sitio_id uuid not null references public.sitios(id) on delete cascade,
  token text not null unique default encode(gen_random_bytes(18), 'base64'),
  creado_por uuid references public.profiles(id) on delete set null,
  expira_en timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists sitio_shares_token_idx on public.sitio_shares (token);

alter table public.sitio_shares enable row level security;

drop policy if exists "shares_select_auth" on public.sitio_shares;
create policy "shares_select_auth" on public.sitio_shares for select to authenticated
  using (
    creado_por = auth.uid()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('gerente','head')
    )
  );

drop policy if exists "shares_insert" on public.sitio_shares;
create policy "shares_insert" on public.sitio_shares for insert to authenticated
  with check (creado_por = auth.uid());

drop policy if exists "shares_delete" on public.sitio_shares;
create policy "shares_delete" on public.sitio_shares for delete to authenticated
  using (
    creado_por = auth.uid()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('gerente','head')
    )
  );

-- RPC público para resolver un token a una vista mínima del sitio (sin RLS bypass directo)
create or replace function public.sitio_por_share(p_token text)
returns table (
  id uuid,
  nombre_referencia text,
  direccion text,
  estatus public.sitio_estatus,
  volumen_m3 numeric,
  lat double precision,
  lng double precision,
  etapa public.sitio_etapa,
  estatus_final public.sitio_estatus_final,
  created_at timestamptz
)
language plpgsql security definer set search_path = public as $$
begin
  return query
    select s.id, s.nombre_referencia, s.direccion, s.estatus, s.volumen_m3,
           s.lat, s.lng, s.etapa, s.estatus_final, s.created_at
      from public.sitio_shares sh
      join public.sitios s on s.id = sh.sitio_id
     where sh.token = p_token
       and (sh.expira_en is null or sh.expira_en > now())
     limit 1;
end $$;

grant execute on function public.sitio_por_share(text) to anon, authenticated;

-- =====================================================
-- 4. PUSH SUBSCRIPTIONS (Web Push)
-- =====================================================
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth_key text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  unique (usuario_id, endpoint)
);

alter table public.push_subscriptions enable row level security;

drop policy if exists "push_self" on public.push_subscriptions;
create policy "push_self" on public.push_subscriptions for all to authenticated
  using (usuario_id = auth.uid())
  with check (usuario_id = auth.uid());

-- =====================================================
-- 5. BÚSQUEDA POR PROXIMIDAD (RPC para duplicados)
-- =====================================================
create or replace function public.sitios_cercanos(
  p_lat double precision,
  p_lng double precision,
  p_radio_m integer default 300
)
returns table (
  id uuid,
  nombre_referencia text,
  direccion text,
  estatus public.sitio_estatus,
  volumen_m3 numeric,
  lat double precision,
  lng double precision,
  vendedor_id uuid,
  vendedor_nombre text,
  vendedor_email text,
  distancia_m double precision,
  created_at timestamptz
)
language plpgsql security definer set search_path = public as $$
declare
  r_earth constant double precision := 6371000;
  rad_lat double precision := radians(p_lat);
begin
  return query
    select s.id,
           s.nombre_referencia,
           s.direccion,
           s.estatus,
           s.volumen_m3,
           s.lat,
           s.lng,
           s.vendedor_id,
           p.nombre,
           p.email,
           (
             2 * r_earth * asin(sqrt(
               sin(radians(s.lat - p_lat)/2) ^ 2 +
               cos(rad_lat) * cos(radians(s.lat)) *
               sin(radians(s.lng - p_lng)/2) ^ 2
             ))
           ) as distancia,
           s.created_at
      from public.sitios s
      left join public.profiles p on p.id = s.vendedor_id
     where s.estatus_final is null
       and abs(s.lat - p_lat) < (p_radio_m::double precision / 111000)
       and abs(s.lng - p_lng) < (p_radio_m::double precision / (111000 * cos(rad_lat)))
       and (
         2 * r_earth * asin(sqrt(
           sin(radians(s.lat - p_lat)/2) ^ 2 +
           cos(rad_lat) * cos(radians(s.lat)) *
           sin(radians(s.lng - p_lng)/2) ^ 2
         ))
       ) <= p_radio_m
     order by distancia asc
     limit 20;
end $$;

grant execute on function public.sitios_cercanos(double precision, double precision, integer)
  to authenticated;

-- =====================================================
-- 6. REASIGNACIÓN DE VENDEDOR (gerente/head pueden cambiar vendedor_id)
-- =====================================================
-- La política base de sitios bloquea update si vendedor_id <> auth.uid()
-- Agregamos política específica que permita a gerente/head reasignar.
drop policy if exists "sitios_update_gerente" on public.sitios;
create policy "sitios_update_gerente" on public.sitios for update to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('gerente','head')
    )
  )
  with check (true);

-- Función helper: reasignar con log en audit
create or replace function public.reasignar_sitio(
  p_sitio_id uuid,
  p_nuevo_vendedor uuid,
  p_motivo text default null
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_rol public.app_role;
  v_anterior uuid;
begin
  select role into v_rol from public.profiles where id = auth.uid();
  if v_rol not in ('gerente','head') then
    raise exception 'Solo gerente o head pueden reasignar';
  end if;

  select vendedor_id into v_anterior from public.sitios where id = p_sitio_id;

  update public.sitios
     set vendedor_id = p_nuevo_vendedor,
         updated_at  = now()
   where id = p_sitio_id;

  -- alerta al nuevo dueño
  insert into public.alertas(usuario_id, sitio_id, tipo, mensaje)
  values (
    p_nuevo_vendedor,
    p_sitio_id,
    'reasignacion',
    coalesce('Sitio reasignado a ti. Motivo: ' || p_motivo, 'Sitio reasignado a ti')
  );

  -- alerta al anterior (si existía)
  if v_anterior is not null and v_anterior <> p_nuevo_vendedor then
    insert into public.alertas(usuario_id, sitio_id, tipo, mensaje)
    values (
      v_anterior,
      p_sitio_id,
      'reasignacion',
      coalesce('Tu sitio fue reasignado. Motivo: ' || p_motivo, 'Tu sitio fue reasignado')
    );
  end if;
end $$;

grant execute on function public.reasignar_sitio(uuid, uuid, text) to authenticated;
