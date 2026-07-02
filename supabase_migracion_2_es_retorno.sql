-- ============================================================
-- MIGRACIÓN 2: agrega es_retorno (criterio correcto)
-- Ejecutar DESPUÉS de supabase_migracion_retornos.sql
--
-- Una guía es "de retorno" si su número aparece en la columna
-- "Retorno" de OTRA fila del mismo archivo. Esto se calcula en
-- el importador (lib/business-logic.ts) y se guarda aquí.
-- ============================================================

alter table guias add column if not exists es_retorno boolean default false;

create index if not exists idx_guias_es_retorno on guias(es_retorno);

-- Después de correr esto, vuelve a cargar tu Excel desde la app
-- para que las guías existentes se reclasifiquen correctamente
-- entre originales y retornos.
