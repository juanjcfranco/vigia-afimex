-- ============================================================
-- Migración 9: agrega F_Confirmacion (fecha de confirmación de entrega)
-- Usada para el KPI "Tiempo Promedio de Entrega" en el módulo Resumen:
-- días transcurridos entre F_Documentacion y F_Confirmacion, solo para
-- guías entregadas que no son retorno.
-- ============================================================

alter table guias add column if not exists f_confirmacion date;
