-- ============================================================
-- Migración 20: agrega `f_confirmacion` (fecha real de entrega/
-- confirmación de la guía en VIGIA) a conciliacion_detalle().
--
-- Se agrega al FINAL de la lista de columnas de retorno — Postgres
-- permite esto con CREATE OR REPLACE sin necesitar DROP, siempre que las
-- columnas existentes no cambien de nombre/tipo/orden.
-- ============================================================

-- IMPORTANTE: Postgres no permite cambiar las columnas de retorno de una
-- función RETURNS TABLE con CREATE OR REPLACE, ni siquiera agregando una
-- columna al final — hay que borrarla primero.
drop function if exists conciliacion_detalle(text, text, integer, integer, integer, uuid);

create or replace function conciliacion_detalle(
  p_cliente text default null,
  p_estatus text default null,
  p_semana integer default null,
  p_limit integer default 200,
  p_offset integer default 0,
  p_carga_id uuid default null
)
returns table (
  guia text,
  cliente text,
  oficina_destino text,
  estado_guia text,
  cod numeric,
  cod_conciliado numeric,
  semana_pago integer,
  fecha_entrega_conciliada date,
  cip text,
  pagado boolean,
  diferencia numeric,
  f_confirmacion date,
  total_filas bigint
)
language sql
stable
set statement_timeout = '60s'
as $$
  with base as (
    select distinct on (g.guia)
      g.guia,
      g.cliente,
      g.oficina_destino,
      g.estado_guia,
      g.cod,
      c.cod as cod_conciliado,
      c.semana_pago,
      c.fecha_entrega as fecha_entrega_conciliada,
      c.cip,
      (c.guia is not null) as pagado,
      case when c.guia is not null then round((g.cod - c.cod)::numeric, 2) else null end as diferencia,
      g.f_confirmacion
    from guias g
    left join conciliaciones c on c.guia = g.guia
    where g.estado_guia = 'ENTREGADA'
      and g.es_retorno = false
      and g.es_posible_retorno_otro_periodo = false
      and g.es_predoc = false
      and upper(coalesce(g.estado_guia,'')) <> 'DOCUMENTADA'
      and g.oficina_destino not in ('UPS CHIHUAHUA','QUIKEN','UPS SAN LUIS POTOSI','UPS MONTERREY','UPS DURANGO','UPS CIUDAD JUAREZ','UPS AGUASCALIENTES','QUERETARO','CALL CENTER','REEXPEDICIONES')
      and g.cod > 0
      and (p_carga_id is null or g.carga_id = p_carga_id)
    order by g.guia, g.id
  ),
  filtrado as (
    select * from base
    where (p_cliente is null or cliente = p_cliente)
      and (p_semana is null or semana_pago = p_semana)
      and (
        p_estatus is null
        or (p_estatus = 'PAGADA' and pagado)
        or (p_estatus = 'PENDIENTE' and not pagado)
        or (p_estatus = 'DIFERENCIA' and pagado and diferencia is not null and diferencia <> 0)
      )
  )
  select f.*, (select count(*) from filtrado) as total_filas
  from filtrado f
  order by f.guia
  limit p_limit offset p_offset;
$$;
