-- ============================================================
-- Migración 25: agrega paginación (`p_limit`/`p_offset`) a
-- `conciliacion_detalle_por_guias`.
--
-- Sin paginación explícita, las funciones RPC de Supabase/PostgREST
-- pueden truncar la respuesta a un límite de filas por defecto — con
-- miles de guías, esto recortaba en silencio la lista de pendientes
-- (ordenada por número de guía), mostrando solo un puñado en vez de
-- todas las reales. Se agrega limit/offset explícitos para que el
-- navegador pueda paginar hasta traer TODAS las filas.
-- ============================================================

drop function if exists conciliacion_detalle_por_guias(text[]);

create or replace function conciliacion_detalle_por_guias(
  p_guias text[],
  p_limit integer default 1000,
  p_offset integer default 0
)
returns table (
  guia text,
  cliente text,
  oficina_destino text,
  cod numeric,
  cod_conciliado numeric,
  pagado boolean,
  semana_pago integer
)
language sql
stable
set statement_timeout = '60s'
as $$
  select distinct on (g.guia)
    g.guia,
    g.cliente,
    g.oficina_destino,
    g.cod,
    c.cod as cod_conciliado,
    (c.guia is not null) as pagado,
    c.semana_pago
  from guias g
  left join conciliaciones c on c.guia = g.guia
  where g.guia = any(p_guias)
    and g.cod > 0
  order by g.guia, g.id
  limit p_limit offset p_offset;
$$;
