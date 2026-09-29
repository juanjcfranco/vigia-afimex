-- ============================================================
-- Migración 21: agrega filtro de `periodos` (mes, YYYY-MM sobre
-- f_documentacion) y `dia` (corte acumulado) a las 3 funciones de
-- conciliación — replica EXACTAMENTE la misma lógica de guiasFiltradas
-- en lib/useVigiaData.ts.
--
-- El filtro por carga_id NO bastaba: dentro de UNA misma carga puede
-- haber varios meses juntos (ej. un Excel con pestañas de Agosto y
-- Septiembre subido como una sola carga) — el selector de "Período" en
-- la barra superior de VIGIA filtra por MES (f_documentacion), no por
-- carga. Por eso el módulo de Conciliación no se movía al cambiar de
-- período: nunca miraba esa columna.
--
-- Como cambiar la lista de parámetros de una función siempre requiere
-- DROP primero (ver migración 20), se agregan TODOS los filtros de
-- "corte" que ya existen en la barra superior (período Y día) de una
-- sola vez, para no tener que repetir este mismo problema por cada
-- filtro que falte más adelante.
-- ============================================================

drop function if exists conciliacion_resumen(uuid);
drop function if exists conciliacion_detalle(text, text, integer, integer, integer, uuid);
drop function if exists conciliacion_opciones_filtro(uuid);

create or replace function conciliacion_resumen(
  p_carga_id uuid default null,
  p_periodos text[] default null,
  p_dia date default null
)
returns table (
  guias_con_cod bigint,
  cod_total numeric,
  guias_pagadas bigint,
  cod_pagado numeric,
  guias_pendientes bigint,
  cod_pendiente numeric,
  con_diferencia bigint
)
language sql
stable
set statement_timeout = '60s'
as $$
  with base as (
    select distinct on (g.guia)
      g.guia,
      g.cod,
      c.cod as cod_conciliado,
      (c.guia is not null) as pagado
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
      and (p_periodos is null or to_char(g.f_documentacion, 'YYYY-MM') = any(p_periodos))
      and (p_dia is null or g.f_documentacion <= p_dia)
    order by g.guia, g.id
  )
  select
    count(*) as guias_con_cod,
    coalesce(sum(cod), 0) as cod_total,
    count(*) filter (where pagado) as guias_pagadas,
    coalesce(sum(cod_conciliado) filter (where pagado), 0) as cod_pagado,
    count(*) filter (where not pagado) as guias_pendientes,
    coalesce(sum(cod) filter (where not pagado), 0) as cod_pendiente,
    count(*) filter (where pagado and round((cod - cod_conciliado)::numeric, 2) <> 0) as con_diferencia
  from base;
$$;

create or replace function conciliacion_detalle(
  p_cliente text default null,
  p_estatus text default null,
  p_semana integer default null,
  p_limit integer default 200,
  p_offset integer default 0,
  p_carga_id uuid default null,
  p_periodos text[] default null,
  p_dia date default null
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
      and (p_periodos is null or to_char(g.f_documentacion, 'YYYY-MM') = any(p_periodos))
      and (p_dia is null or g.f_documentacion <= p_dia)
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

create or replace function conciliacion_opciones_filtro(
  p_carga_id uuid default null,
  p_periodos text[] default null,
  p_dia date default null
)
returns table (clientes text[], semanas integer[])
language sql
stable
set statement_timeout = '60s'
as $$
  select
    (select array_agg(distinct g.cliente order by g.cliente)
     from guias g
     where g.estado_guia = 'ENTREGADA'
       and g.es_retorno = false
       and g.es_posible_retorno_otro_periodo = false
       and g.es_predoc = false
       and upper(coalesce(g.estado_guia,'')) <> 'DOCUMENTADA'
       and g.oficina_destino not in ('UPS CHIHUAHUA','QUIKEN','UPS SAN LUIS POTOSI','UPS MONTERREY','UPS DURANGO','UPS CIUDAD JUAREZ','UPS AGUASCALIENTES','QUERETARO','CALL CENTER','REEXPEDICIONES')
       and g.cod > 0
       and g.cliente is not null
       and (p_carga_id is null or g.carga_id = p_carga_id)
       and (p_periodos is null or to_char(g.f_documentacion, 'YYYY-MM') = any(p_periodos))
       and (p_dia is null or g.f_documentacion <= p_dia)) as clientes,
    (select array_agg(distinct c.semana_pago order by c.semana_pago)
     from conciliaciones c
     where c.semana_pago is not null) as semanas;
$$;
