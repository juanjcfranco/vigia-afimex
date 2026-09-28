-- ============================================================
-- Migración 13: crea la tabla `conciliaciones`
--
-- Tabla persistente e INDEPENDIENTE de `guias`/`cargas` a propósito, mismo
-- criterio que `indemnizaciones` (ver migración 12): se identifica por
-- número de guía, no por carga_id, para que una conciliación sobreviva
-- aunque el Excel de guías se vuelva a subir.
--
-- Presencia en esta tabla = guía pagada/conciliada por completo (el
-- usuario confirmó que no maneja pagos parciales: si la guía no está
-- aquí, su COD sigue pendiente). El archivo de conciliación se puede
-- subir cuando sea necesario (no hay cadencia fija) — por eso el cruce
-- es por UPSERT en `guia` (on conflict do update), nunca un reemplazo
-- total de la tabla, para poder acumular conciliaciones de distintas
-- fechas/semanas sin duplicar ni perder registros previos.
-- ============================================================

create table if not exists conciliaciones (
  id uuid primary key default gen_random_uuid(),
  guia text unique not null,
  cliente text,
  oficina_destino text,
  fecha_entrega date,
  guia_cliente text,
  cip text,
  cod numeric default 0,
  semana_pago integer,
  creado_por text,
  creado_en timestamptz default now(),
  actualizado_en timestamptz default now()
);

create index if not exists idx_conciliaciones_guia on conciliaciones (guia);
create index if not exists idx_conciliaciones_cliente on conciliaciones (cliente);
create index if not exists idx_conciliaciones_semana on conciliaciones (semana_pago);

alter table conciliaciones enable row level security;

create policy "allow_all_conciliaciones" on conciliaciones for all using (true) with check (true);
