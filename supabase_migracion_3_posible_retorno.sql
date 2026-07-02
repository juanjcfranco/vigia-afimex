-- ============================================================
-- MIGRACIÓN 3: agrega es_posible_retorno_otro_periodo
-- Ejecutar DESPUÉS de supabase_migracion_2_es_retorno.sql
--
-- Una guía es "posible retorno de otro periodo" cuando Cliente_Paga
-- es igual a Nombre_Destinatario (el remitente y el destinatario son
-- el mismo nombre), pero su número NO aparece en la columna Retorno
-- de ninguna otra fila de este archivo. Esto sugiere que es el
-- retorno de una guía documentada en una carga/periodo anterior,
-- que no está visible en este corte.
-- ============================================================

alter table guias add column if not exists es_posible_retorno_otro_periodo boolean default false;

create index if not exists idx_guias_posible_retorno on guias(es_posible_retorno_otro_periodo);

-- Después de correr esto, vuelve a cargar tu Excel desde la app
-- para que las guías existentes se reclasifiquen correctamente.
