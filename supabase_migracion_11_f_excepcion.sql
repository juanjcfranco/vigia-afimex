-- ============================================================
-- Migración 11: agrega f_excepcion_1..5 (fecha de cada excepción)
--
-- Usadas para calcular la "Última Excepción" (nombre + fecha) que se
-- muestra como columna nueva en el módulo Acciones — la excepción vigente
-- de la cadena (Excepcion_1..5), junto con la fecha en que se registró
-- (F_Excepcion_1..5 en el Excel).
-- ============================================================

alter table guias add column if not exists f_excepcion_1 date;
alter table guias add column if not exists f_excepcion_2 date;
alter table guias add column if not exists f_excepcion_3 date;
alter table guias add column if not exists f_excepcion_4 date;
alter table guias add column if not exists f_excepcion_5 date;
