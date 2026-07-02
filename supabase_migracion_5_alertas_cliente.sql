-- MIGRACIÓN 5: Agregar columna cliente a alertas_log
alter table alertas_log add column if not exists cliente text;
