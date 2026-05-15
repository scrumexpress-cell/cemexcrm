-- =====================================================
-- v6: Alertas por volumen con umbrales corregidos
-- =====================================================
-- Reglas:
--   0    - 499  m³  -> sin alerta
--   500  - 4999 m³  -> alerta al gerente de la zona (medio)
--   5000+ m³        -> alerta al gerente de la zona y al head (alto)
-- El vendedor ya no recibe alerta automática (el sitio es suyo).

create or replace function public.alerta_volumen()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  m uuid;
  h uuid;
  nivel text;
  umbral_anterior numeric;
begin
  if new.volumen_m3 is null then
    return new;
  end if;

  umbral_anterior := coalesce(old.volumen_m3, 0);

  -- Determinar el nivel actual y disparar solo cuando se cruza el umbral
  if new.volumen_m3 >= 5000
     and (tg_op = 'INSERT' or umbral_anterior < 5000) then
    nivel := 'alto';
  elsif new.volumen_m3 >= 500 and new.volumen_m3 < 5000
     and (tg_op = 'INSERT' or umbral_anterior < 500) then
    nivel := 'medio';
  else
    return new;
  end if;

  -- Gerente de la zona: aplica en nivel medio y alto
  select id into m
    from public.profiles
   where role = 'gerente'
     and zona_id = new.zona_id
   limit 1;

  if m is not null then
    insert into public.alertas(usuario_id, sitio_id, tipo, mensaje)
    values (
      m,
      new.id,
      case when nivel = 'alto' then 'volumen_alto' else 'volumen_medio' end,
      'Sitio ' || coalesce(new.nombre_referencia, 'sin nombre') ||
        ' (' || new.volumen_m3 || ' m³) requiere atención'
    );
  end if;

  -- Head: solo en nivel alto (>= 5000)
  if nivel = 'alto' then
    for h in
      select id from public.profiles where role = 'head'
    loop
      insert into public.alertas(usuario_id, sitio_id, tipo, mensaje)
      values (
        h,
        new.id,
        'volumen_alto',
        'Sitio ' || coalesce(new.nombre_referencia, 'sin nombre') ||
          ' con volumen ' || new.volumen_m3 || ' m³ — requiere escalamiento'
      );
    end loop;
  end if;

  return new;
end
$$;

drop trigger if exists alerta_volumen_trg on public.sitios;
create trigger alerta_volumen_trg
  after insert or update of volumen_m3 on public.sitios
  for each row execute function public.alerta_volumen();
