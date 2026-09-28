-- ============================================================
-- Migración 15: agrega la columna cp_destinatario a `guias`.
--
-- Se lee de la columna CP_Destino del Excel (no CP_Destinatario, que
-- también existe en el export pero no es la fuente preferida —
-- confirmado por el usuario, sep-2026). Usada para el Top 5 Ciudades —
-- Días para Entregar del Informe Logístico (ver
-- topCiudadesPorDiasEntrega() en lib/business-logic.ts).
-- ============================================================

alter table guias add column if not exists cp_destinatario text;
