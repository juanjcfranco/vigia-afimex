-- ============================================================
-- MIGRACIÓN: corrige el modelo de datos de retorno/devolución
-- Ejecutar en el SQL Editor de Supabase DESPUÉS de supabase_schema.sql
-- Seguro de correr aunque ya tengas datos cargados (los retiene)
-- ============================================================

-- 1. Quitar columnas del modelo viejo (incorrecto) si existen
alter table guias drop column if exists es_retorno;
alter table guias drop column if exists guia_retorno_ref;

-- 2. Agregar columnas del modelo correcto:
--    el retorno viene embebido en la misma fila de la guía en devolución
alter table guias add column if not exists retorno_guia text;
alter table guias add column if not exists retorno_estado text;
alter table guias add column if not exists retorno_f_entrega date;

-- 3. Índice para acelerar búsquedas por número de guía de retorno
create index if not exists idx_guias_retorno_guia on guias(retorno_guia);

-- Después de correr esto, vuelve a cargar tu Excel desde la app
-- (Cargar Excel) para que las guías existentes tomen los nuevos campos.
-- Las cargas anteriores seguirán visibles en el Historial, solo sin
-- los datos de retorno hasta que las vuelvas a subir.
