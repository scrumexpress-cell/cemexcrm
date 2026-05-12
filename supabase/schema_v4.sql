-- =========================================================
-- v4: Refuerzo de licitaciones
--   - sitios.licitante: cliente/licitante que representa este registro
--   - obras.competidor_ganador: si ganó un externo
--   - trigger actualizado para propagar también el ganador externo
-- =========================================================

alter table public.sitios
  add column if not exists licitante text;

alter table public.obras
  add column if not exists competidor_ganador text;

create or replace function public.cerrar_obra_propagar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  ganador_nombre text;
  ganador_vendedor text;
begin
  if new.estatus in ('ganada', 'perdida', 'cancelada')
     and (old.estatus is distinct from new.estatus) then

    if new.fecha_cierre is null then
      new.fecha_cierre := now();
    end if;

    -- GANADA por nosotros (uno de los registros internos)
    if new.estatus = 'ganada' and new.ganador_sitio_id is not null then
      select s.nombre_referencia, p.nombre
        into ganador_nombre, ganador_vendedor
        from public.sitios s
        left join public.profiles p on p.id = s.vendedor_id
       where s.id = new.ganador_sitio_id;

      update public.sitios
         set estatus_final = 'ganado',
             fecha_cierre  = coalesce(fecha_cierre, now()),
             motivo_cierre = coalesce(motivo_cierre, 'Licitación ganada: ' || new.nombre)
       where id = new.ganador_sitio_id;

      update public.sitios
         set estatus_final = 'perdido',
             fecha_cierre  = coalesce(fecha_cierre, now()),
             motivo_cierre = coalesce(
               motivo_cierre,
               'Licitación perdida — ganador interno: ' ||
               coalesce(ganador_nombre, 'otro registro') ||
               coalesce(' (vendedor: ' || ganador_vendedor || ')', '')
             )
       where obra_id = new.id
         and id <> new.ganador_sitio_id
         and estatus_final is null;
    end if;

    -- PERDIDA: ganó un competidor externo (o causa general)
    if new.estatus = 'perdida' then
      update public.sitios
         set estatus_final = 'perdido',
             competidor    = coalesce(competidor, new.competidor_ganador),
             fecha_cierre  = coalesce(fecha_cierre, now()),
             motivo_cierre = coalesce(
               motivo_cierre,
               coalesce(
                 nullif('Licitación perdida — ganador externo: ' ||
                        coalesce(new.competidor_ganador, ''), 'Licitación perdida — ganador externo: '),
                 coalesce(new.motivo_cierre, 'Licitación perdida: ' || new.nombre)
               )
             )
       where obra_id = new.id
         and estatus_final is null;
    end if;

    -- CANCELADA
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
