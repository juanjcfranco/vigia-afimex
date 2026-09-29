-- ============================================================
-- Migración 24: `conciliacion_detalle_por_guias(p_guias text[])`.
--
-- Mismo patrón que conciliacion_resumen_por_guias (migración 23): recibe
-- la lista exacta de guías ya filtrada del lado de React, sin reimplementar
-- ningún criterio de negocio — pero aquí devuelve el DETALLE fila por
-- fila (no solo el agregado), para poder mostrar cuáles guías puntuales
-- siguen pendientes de conciliar en el Informe Logístico.
-- ============================================================

create or replace function conciliacion_detalle_por_guias(p_guias text[])
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
  order by g.guia, g.id;
$$;
