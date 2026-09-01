-- ============================================================
-- Migración 14: crea la tabla `alertas_guia_historial`
--
-- Tabla persistente e INDEPENDIENTE de `guias`/`cargas` a propósito
-- (mismo patrón que `indemnizaciones` — ver migración 12): un registro
-- por CADA evento de alerta (1ª, 2ª, 3ª alerta, o cierre de caso),
-- identificado por número de guía (no por carga_id), para que el
-- seguimiento sobreviva aunque el Excel se vuelva a subir. La próxima
-- vez que una guía reaparezca en un nuevo corte, la app cruza su número
-- contra esta tabla y muestra en qué nivel de alerta se quedó.
--
-- Semáforo (definido en lib/business-logic.ts, calcularSemaforoGuia()):
--   Verde    1-2 días sin movimiento — Monitoreo normal
--   Amarillo 3 días   — 1ª alerta — Iniciar investigación
--   Naranja  4 días    — 2ª alerta — Solicitar evidencia fotográfica
--   Rojo     5+ días   — 3ª alerta — Cierre del caso y cobro
-- ============================================================

create table if not exists alertas_guia_historial (
  id uuid primary key default gen_random_uuid(),
  guia text not null,
  nivel text not null, -- AMARILLO | NARANJA | ROJO | CERRADO
  accion text,          -- texto de la acción tomada (de la tabla del semáforo)
  enviado_a text,        -- correo al que se notificó, si aplica
  registrado_por text,    -- quién marcó/envió esto (opcional, texto libre)
  creado_en timestamptz not null default now()
);

create index if not exists idx_alertas_guia_historial_guia on alertas_guia_historial(guia);
create index if not exists idx_alertas_guia_historial_creado on alertas_guia_historial(creado_en desc);

-- RLS habilitado pero abierto (allow_all) — mismo criterio que el resto
-- del esquema (ver supabase_schema.sql): la app siempre accede con la
-- service role key desde el servidor, que de por sí ignora RLS. Esto es
-- higiene/consistencia, no un requisito funcional.
alter table alertas_guia_historial enable row level security;
create policy "allow_all_alertas_guia_historial" on alertas_guia_historial for all using (true) with check (true);
