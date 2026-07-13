-- ============================================================
-- MIGRACIÓN 4: Tabla de tarifas por cliente
-- Ejecutar en Supabase SQL Editor
-- ============================================================
create table if not exists tarifas_cliente (
  id uuid default gen_random_uuid() primary key,
  cliente text not null unique,
  tarifa_entrega_original numeric(10,2) not null default 100,
  tarifa_devolucion numeric(10,2) not null default 40,
  tarifa_retorno_entregado numeric(10,2) not null default 100,
  tarifa_posible_retorno numeric(10,2) not null default 40,
  actualizado_en timestamptz default now()
);

-- Datos iniciales para los clientes habituales
insert into tarifas_cliente (cliente, tarifa_entrega_original, tarifa_devolucion, tarifa_retorno_entregado, tarifa_posible_retorno)
values
  ('MERQ',                100, 40, 100, 40),
  ('MENVELO',             100, 40, 100, 40),
  ('SARTEN FLAVOR',       100, 40, 100, 40),
  ('KIKI LOGISTICS MX',   100, 40, 100, 40),
  ('YEGO',                100, 40, 100, 40)
on conflict (cliente) do nothing;

-- RLS: igual que el resto de las tablas de VIGIA (habilitado, con política
-- abierta). La app siempre accede con la service role key desde el
-- servidor, que de por sí ignora RLS — esto es higiene/consistencia con
-- el resto del esquema, no un requisito funcional.
alter table tarifas_cliente enable row level security;
create policy "allow_all_tarifas" on tarifas_cliente for all using (true) with check (true);
