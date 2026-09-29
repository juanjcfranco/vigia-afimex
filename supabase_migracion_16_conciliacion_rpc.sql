-- ============================================================
-- Migración 16: función RPC `conciliacion_resumen()` y
-- `conciliacion_detalle(...)`.
--
-- Reemplaza el método anterior (el navegador pedía TODAS las guías
-- Entregadas paginando de 1000 en 1000, las acumulaba en memoria, y
-- recién ahí cruzaba contra `conciliaciones` y sumaba) por hacer el
-- cruce y la suma DIRECTO en Postgres. Con decenas de miles de guías,
-- el método anterior implicaba docenas de peticiones seguidas — bastaba
-- que UNA fallara (timeout, límite transitorio) para que el resumen
-- saliera incompleto sin aviso claro. Una sola función SQL evita todo
-- eso: un solo viaje de ida y vuelta, sin importar cuántas guías haya.
--
-- El criterio de "guía original entregada con COD" es el mismo que
-- esGuiaOriginal() + isEntregada() en business-logic.ts. Se deduplica
-- por número de guía (distinct on) porque una misma guía puede haber
-- quedado repetida en varias cargas (Excel subido más de una vez).
-- ============================================================

create or replace function conciliacion_resumen()
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
      and g.cod > 0
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

-- Detalle paginado y filtrable para la tabla del módulo — mismo cruce,
-- pero devuelve filas individuales (con paginación real vía limit/offset
-- resueltos en el servidor, no acumulando en el navegador).
create or replace function conciliacion_detalle(
  p_cliente text default null,
  p_estatus text default null, -- 'PAGADA' | 'PENDIENTE' | 'DIFERENCIA' | null (todas)
  p_semana integer default null,
  p_limit integer default 200,
  p_offset integer default 0
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
  total_filas bigint
)
language sql
stable
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
      case when c.guia is not null then round((g.cod - c.cod)::numeric, 2) else null end as diferencia
    from guias g
    left join conciliaciones c on c.guia = g.guia
    where g.estado_guia = 'ENTREGADA'
      and g.es_retorno = false
      and g.es_posible_retorno_otro_periodo = false
      and g.es_predoc = false
      and upper(coalesce(g.estado_guia,'')) <> 'DOCUMENTADA'
      and g.cod > 0
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

-- Opciones para los filtros del módulo (clientes y semanas de pago) sin
-- tener que traer el detalle completo solo para armar los <select>.
create or replace function conciliacion_opciones_filtro()
returns table (clientes text[], semanas integer[])
language sql
stable
as $$
  select
    (select array_agg(distinct g.cliente order by g.cliente)
     from guias g
     where g.estado_guia = 'ENTREGADA'
       and g.es_retorno = false
       and g.es_posible_retorno_otro_periodo = false
       and g.es_predoc = false
       and upper(coalesce(g.estado_guia,'')) <> 'DOCUMENTADA'
       and g.cod > 0
       and g.cliente is not null) as clientes,
    (select array_agg(distinct c.semana_pago order by c.semana_pago)
     from conciliaciones c
     where c.semana_pago is not null) as semanas;
$$;
