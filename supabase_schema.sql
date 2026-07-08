-- ============================================================
-- VIGÍA — Schema de base de datos (Supabase / PostgreSQL)
-- Panel de Control Operativo AFIMEX
-- ============================================================

-- 1. CARGAS: cada vez que se sube un Excel queda registrado aquí
create table if not exists cargas (
  id uuid primary key default gen_random_uuid(),
  cliente text not null,
  nombre_archivo text,
  periodo text,                -- ej: '2026-05'
  total_guias integer default 0,
  creado_en timestamptz default now(),
  creado_por text
);

-- 2. GUIAS: tabla principal, una fila por guía (snapshot de la carga más reciente)
create table if not exists guias (
  id uuid primary key default gen_random_uuid(),
  carga_id uuid references cargas(id) on delete cascade,

  guia text not null,
  cliente text,
  descripcion text,

  of_origen text,
  oficina_destino text,
  entidad_destinatario text,
  ciudad_destinatario text,

  estado_guia text,
  tipo_entrega text,
  tipo_guia text,

  f_documentacion date,
  f_historia date,
  f_entrega date,
  f_confirmacion date,          -- fecha de confirmación de entrega (usada para el KPI de tiempo promedio)
  fpe date,                    -- fecha promesa de entrega

  nombre_recibio text,
  nombre_destinatario text,
  d_tipo_domicilio text,

  cod numeric,
  calificacion text,           -- CON CALIDAD / SIN CALIDAD / ABIERTA

  excepcion_1 text,
  excepcion_2 text,
  excepcion_3 text,
  excepcion_4 text,
  excepcion_5 text,

  -- Retorno: viene embebido en la misma fila de la guía en devolución
  -- (campo Retorno = numero de guia de retorno, Estado Retorno = su estado,
  -- Entrega Retorno = fecha en que se completo). Ademas, esa guia de retorno
  -- puede existir como SU PROPIA fila en el mismo archivo (es_retorno=true).
  retorno_guia text,
  retorno_estado text,
  retorno_f_entrega date,

  -- true si el numero de esta guia aparece en la columna "Retorno" de otra fila,
  -- es decir, esta fila ES una guia de retorno EXPLICITA (vinculada a una devolución)
  es_retorno boolean default false,

  -- true si Cliente_Paga == Nombre_Destinatario (mismo nombre en ambos campos).
  -- Indica que el paquete probablemente regresa al remitente, pero sin vinculo
  -- explicito a una guia de devolucion de este mismo archivo (puede ser el
  -- retorno de una guia documentada en un periodo/carga anterior).
  es_posible_retorno_otro_periodo boolean default false,

  -- Campos derivados (calculados al importar)
  es_devolucion boolean default false,
  es_predoc boolean default false,
  accion_recomendada text,     -- calculada con el catálogo de excepciones
  dias_sin_movimiento integer,

  creado_en timestamptz default now()
);

create index if not exists idx_guias_carga on guias(carga_id);
create index if not exists idx_guias_guia on guias(guia);
create index if not exists idx_guias_estado on guias(estado_guia);
create index if not exists idx_guias_oficina on guias(oficina_destino);
create index if not exists idx_guias_cliente on guias(cliente);

-- 3. CATALOGO DE EXCEPCIONES: editable desde la app
create table if not exists excepciones_catalogo (
  id uuid primary key default gen_random_uuid(),
  nombre text unique not null,
  accion text not null,        -- REPROGRAMAR / DEVOLVER / SOLICITAR INFORMACIÓN / etc.
  descripcion text,
  activo boolean default true,
  creado_en timestamptz default now()
);

-- 4. CONTACTOS: directorio por oficina para alertas
create table if not exists contactos_oficina (
  id uuid primary key default gen_random_uuid(),
  oficina text unique not null,
  email_to text,
  email_cc text,
  jefe text,
  jefe_oficina text,
  creado_en timestamptz default now()
);

-- 5. ALERTAS_LOG: historial de correos enviados
create table if not exists alertas_log (
  id uuid primary key default gen_random_uuid(),
  oficina text,
  guias_incluidas text[],      -- array de números de guía
  total_guias integer,
  enviado_a text,
  enviado_en timestamptz default now(),
  enviado_por text,
  estado text default 'enviado'  -- enviado / fallido
);

-- 6. ACCIONES_LOG: historial de acciones tomadas manualmente sobre una guía
create table if not exists acciones_log (
  id uuid primary key default gen_random_uuid(),
  guia text not null,
  accion text not null,
  nota text,
  realizado_por text,
  realizado_en timestamptz default now()
);

-- 7. CIERRES: reportes de cierre operativo guardados
create table if not exists cierres_operativos (
  id uuid primary key default gen_random_uuid(),
  carga_id uuid references cargas(id),
  cliente text,
  periodo text,
  resumen_json jsonb,           -- snapshot completo de KPIs al momento del cierre
  generado_en timestamptz default now(),
  generado_por text
);

-- ============================================================
-- RLS (Row Level Security) — habilitado, abierto por ahora
-- Ajustar políticas según autenticación que se implemente
-- ============================================================
alter table cargas enable row level security;
alter table guias enable row level security;
alter table excepciones_catalogo enable row level security;
alter table contactos_oficina enable row level security;
alter table alertas_log enable row level security;
alter table acciones_log enable row level security;
alter table cierres_operativos enable row level security;

create policy "allow_all_cargas" on cargas for all using (true) with check (true);
create policy "allow_all_guias" on guias for all using (true) with check (true);
create policy "allow_all_catalogo" on excepciones_catalogo for all using (true) with check (true);
create policy "allow_all_contactos" on contactos_oficina for all using (true) with check (true);
create policy "allow_all_alertas" on alertas_log for all using (true) with check (true);
create policy "allow_all_acciones" on acciones_log for all using (true) with check (true);
create policy "allow_all_cierres" on cierres_operativos for all using (true) with check (true);

-- ============================================================
-- SEED: catálogo de excepciones inicial (basado en catálogo AFIMEX + datos reales)
-- ============================================================
insert into excepciones_catalogo (nombre, accion, descripcion) values
('AUSENCIA', 'REPROGRAMAR', 'Destinatario ausente, primer intento'),
('AUSENCIA 2', 'REPROGRAMAR', 'Destinatario ausente, segundo intento'),
('AUSENCIA 3', 'DEVOLVER', 'Destinatario ausente, tercer intento'),
('CALLE INEXISTENTE', 'SOLICITAR INFORMACIÓN', 'Dirección con calle inexistente'),
('CERRADO', 'REPROGRAMAR', 'Domicilio cerrado, primer intento'),
('CERRADO 2', 'REPROGRAMAR', 'Domicilio cerrado, segundo intento'),
('CERRADO 3', 'DEVOLVER', 'Domicilio cerrado, tercer intento'),
('CIUDAD INCORRECTA', 'SOLICITAR INFORMACIÓN', 'Ciudad de destino incorrecta'),
('CIUDAD INCORRECTA (COBERTURA)', 'SOLICITAR INFORMACIÓN', 'Ciudad fuera de cobertura'),
('CLAUSURADO', 'SOLICITAR INFORMACIÓN', 'Domicilio clausurado'),
('CLIENTE SOLICITA CAMBIO A OCURRE', 'INFORMAR A CLIENTE', 'Cliente pide recoger en oficina'),
('CLIENTE SOLICITA FECHA FUTURA DE ENTREGA', 'REPROGRAMAR', 'Cliente pide reprogramar entrega'),
('CÓDIGO POSTAL INCORRECTO', 'SOLICITAR INFORMACIÓN', 'CP incorrecto'),
('CODIGO POSTAL INCORRECTO', 'SOLICITAR INFORMACIÓN', 'CP incorrecto'),
('DATOS INCOMPLETOS', 'SOLICITAR INFORMACIÓN', 'Faltan datos del destinatario'),
('DESCONOCIDO EN EL DOMICILIO', 'SOLICITAR INFORMACIÓN', 'Destinatario desconocido en domicilio'),
('DESTINATARIO FALLECIÓ', 'SOLICITAR INFORMACIÓN', 'Destinatario falleció'),
('DOMICILIO DESHABITADO', 'SOLICITAR INFORMACIÓN', 'Domicilio deshabitado'),
('ENTREGA COD FUTURA', 'REPROGRAMAR', 'COD programado a futuro'),
('ESTADO INCORRECTO', 'SOLICITAR INFORMACIÓN', 'Estado/entidad incorrecta'),
('EXCEDE PESO MAX', 'ALERTAR A OFICINA', 'Paquete excede peso máximo'),
('EXCEDE TAMAÑO MAX', 'ALERTAR A OFICINA', 'Paquete excede tamaño máximo'),
('FALTA CALLE', 'SOLICITAR INFORMACIÓN', 'Falta nombre de calle'),
('FALTA NOMBRE DE DESTINATARIO', 'SOLICITAR INFORMACIÓN', 'Falta nombre del destinatario'),
('FALTA NÚMERO', 'SOLICITAR INFORMACIÓN', 'Falta número exterior'),
('FALTA NUMERO', 'SOLICITAR INFORMACIÓN', 'Falta número exterior'),
('FALTA NÚMERO INTERIOR', 'SOLICITAR INFORMACIÓN', 'Falta número interior'),
('FUERA DE ÁREA DE SERVICIO', 'ALERTAR A OFICINA', 'Fuera de área de servicio'),
('FUERA DE AREA DE SERVICIO', 'ALERTAR A OFICINA', 'Fuera de área de servicio'),
('FUERA DE HORARIO DE RECIBO', 'REPROGRAMAR', 'Fuera de horario de recibo del cliente'),
('GUÍA DUPLICADA', 'ALERTAR A OFICINA', 'Guía duplicada en sistema'),
('MAL SORTEADO', 'ALERTAR A OFICINA', 'Paquete mal sorteado'),
('MUDANZA', 'SOLICITAR INFORMACIÓN', 'Destinatario se mudó'),
('NÚMERO INEXISTENTE', 'SOLICITAR INFORMACIÓN', 'Número de domicilio inexistente'),
('NUMERO INEXISTENTE', 'SOLICITAR INFORMACIÓN', 'Número de domicilio inexistente'),
('PENDIENTE DE RETORNO', 'ALERTAR A OFICINA', 'Pendiente de retorno a origen'),
('PERSONA NO AUTORIZADA PARA RECIBIR', 'REPROGRAMAR', 'Receptor no autorizado'),
('REMESA INCOMPLETA', 'ALERTAR A OFICINA', 'Remesa incompleta'),
('SE REPROGRAMA FECHA DE ENTREGA', 'REPROGRAMAR', 'Entrega reprogramada'),
('SIN DINERO', 'REPROGRAMAR', 'Cliente sin dinero, primer intento'),
('SIN DINERO 2', 'REPROGRAMAR', 'Cliente sin dinero, segundo intento'),
('SIN DINERO 3', 'DEVOLVER', 'Cliente sin dinero, tercer intento'),
('PAQUETE NO DESPACHADO', 'ALERTAR A OFICINA', 'Paquete no despachado por oficina'),
('COD RECHAZADO', 'DEVOLVER_COD', 'Cliente rechaza pago COD — requiere prueba de visita'),
('CLIENTE CANCELO', 'DEVOLVER_COD', 'Cliente cancela compra'),
-- Excepciones detectadas en datos reales, no en catálogo original
('PÉRDIDA DE CONEXIÓN', 'REPROGRAMAR', 'Pérdida de conexión del repartidor — revisar'),
('PERDIDA DE CONEXIÓN', 'REPROGRAMAR', 'Pérdida de conexión del repartidor — revisar'),
('PAQUETE PERDIDO', 'POSIBLE INDEMNIZACIÓN', 'Paquete reportado como perdido'),
('PAQUETE DAÑADO', 'POSIBLE INDEMNIZACIÓN', 'Paquete reportado como dañado'),
('PAQUETE DANADO', 'POSIBLE INDEMNIZACIÓN', 'Paquete reportado como dañado'),
('FALLA UNIDAD', 'ALERTAR A OFICINA', 'Falla mecánica de unidad de reparto'),
('COD ELEVADO', 'ALERTAR A OFICINA', 'Monto COD elevado requiere validación'),
('VACACIONES', 'REPROGRAMAR', 'Destinatario de vacaciones'),
('EMERGENCIA', 'REPROGRAMAR', 'Emergencia reportada por repartidor u oficina'),
('ÁREA REMOTA', 'ALERTAR A OFICINA', 'Domicilio en área remota'),
('AREA REMOTA', 'ALERTAR A OFICINA', 'Domicilio en área remota'),
('DESTINO INCORRECTO', 'SOLICITAR INFORMACIÓN', 'Destino incorrecto en guía'),
('HORARIO DE RUTA EXCEDIDO', 'REPROGRAMAR', 'Ruta excedió horario operativo'),
('NO ORDENO PAQUETE', 'DEVOLVER_COD', 'Destinatario niega haber ordenado'),
('RECHAZO POR RETRASO EN ENTREGA', 'DEVOLVER_COD', 'Cliente rechaza por retraso'),
('RECHAZO POR PEDIDO DUPLICADO', 'DEVOLVER_COD', 'Cliente rechaza por pedido duplicado'),
('SIN ACCESO', 'SOLICITAR INFORMACIÓN', 'Sin acceso al domicilio')
on conflict (nombre) do nothing;
