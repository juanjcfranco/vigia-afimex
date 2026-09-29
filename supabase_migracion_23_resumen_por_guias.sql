-- ============================================================
-- Migración 23: `conciliacion_resumen_por_guias(p_guias text[])`
--
-- Reemplaza (para el Informe Logístico específicamente) el enfoque de
-- reconstruir cada filtro (período, cliente, oficina, entidad...) en SQL
-- por separado — eso ya causó 2 rondas de desfase (primero faltó
-- período/día, ahora falta cliente). En vez de perseguir cada filtro
-- nuevo, esta función recibe DIRECTO la lista de números de guía que el
-- navegador ya calculó con TODA la lógica de negocio existente
-- (esGuiaOriginal, isEntregada, cod>0, y CUALQUIER filtro de la barra
-- superior — cliente, oficina, entidad, período, día — todo ya resuelto
-- del lado de React) y simplemente las cruza contra `conciliaciones`.
-- No hay reglas de negocio que reimplementar ni que se puedan desfasar.
-- ============================================================

create or replace function conciliacion_resumen_por_guias(p_guias text[])
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
    where g.guia = any(p_guias)
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
