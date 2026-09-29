-- ============================================================
-- Migración 12: crea la tabla `indemnizaciones`
--
-- Tabla persistente e INDEPENDIENTE de `guias`/`cargas` a propósito: se
-- identifica por número de guía (columna `guias`, array), no por
-- carga_id, para que un caso de indemnización sobreviva aunque el Excel
-- se vuelva a subir — la próxima vez que cargues un archivo, el panel
-- cruza cada guía contra esta tabla por número y marca las que ya tienen
-- un caso registrado, sin importar de qué carga vengan.
-- ============================================================

create table if not exists indemnizaciones (
  id uuid primary key default gen_random_uuid(),
  folio text unique not null,
  guias text[] not null,
  cliente text,
  fecha date,
  fecha_mov date,
  oficina text,
  tipo_destino text,
  oficina_incidencia text,
  importe numeric default 0,
  tipo_incidencia text,
  scan_loc text,
  scan_dt timestamptz,
  scan_user text,
  scan_estatus text,
  investigacion text,
  indemnizacion numeric default 0,
  recuperable numeric default 0,
  cargo_afimex numeric default 0,
  tipo_indemnizacion text,
  estado text default 'PENDIENTE',
  pay_ref text,
  creado_por text,
  creado_en timestamptz default now(),
  actualizado_en timestamptz default now()
);

create index if not exists idx_indemnizaciones_guias on indemnizaciones using gin (guias);

alter table indemnizaciones enable row level security;

create policy "allow_all_indemnizaciones" on indemnizaciones for all using (true) with check (true);
