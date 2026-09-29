-- ============================================================
-- MIGRACIÓN 8: completar alertas_log
--
-- 1. `tipo_solicitud` — el código (AlertaSinMovimientoModal,
--    AlertaCriticaModal, AccionMasivaModal) ya manda este campo al guardar
--    una alerta, pero la columna nunca se creó en la base. Sin ella, el
--    INSERT falla en silencio (o con error) cada vez que se registra un
--    envío — es decir, el guardado de acuses probablemente no estaba
--    funcionando en absoluto hasta correr esto.
--
-- 2. `guias_detalle` (jsonb) — antes solo se guardaba el número de guía
--    (`guias_incluidas text[]`). Para poder mostrar en el Acuse el cliente
--    y la fecha de último movimiento (F_Historia) de cada guía, se guarda
--    ahora un snapshot por guía: [{ "guia": "...", "f_historia": "..." }].
--    `guias_incluidas` se mantiene por compatibilidad con registros viejos.
-- ============================================================

alter table alertas_log add column if not exists tipo_solicitud text;
alter table alertas_log add column if not exists guias_detalle jsonb;
