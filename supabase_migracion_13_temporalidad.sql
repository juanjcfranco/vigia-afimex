-- ============================================================
-- Migración 13: agrega 3 fechas nuevas del proceso interno de Afimex,
-- usadas para medir temporalidad (ver calcularTemporalidad() en
-- lib/business-logic.ts):
--
--   fecha_plataforma  — fecha en que Afimex recibe la guía
--   primera_ruta      — primera salida a ruta de última milla (sin
--                        contar transbordos)
--   recibido_oficina  — fecha en que la oficina destino recibe la guía
-- ============================================================

alter table guias add column if not exists fecha_plataforma date;
alter table guias add column if not exists primera_ruta date;
alter table guias add column if not exists recibido_oficina date;
