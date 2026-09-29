-- ============================================================
-- MIGRACIÓN 6: agrega excepciones que aparecen en la operación real
-- (OPS_MERQ) pero no estaban en el catálogo original.
--
-- Se detectaron comparando el catálogo oficial (Catalogo_Excepciones_
-- AFIMEX.xlsx, 42 excepciones) contra los valores reales de
-- Excepcion_1..5 en un corte de 10,648 guías (47 excepciones distintas).
--
-- Las acciones abajo son una propuesta razonable basada en el patrón
-- de excepciones similares ya existentes en tu catálogo. Ajústalas
-- libremente desde el módulo de Excepciones en la app — no hace falta
-- volver a tocar código ni esta migración.
--
-- Nota: "PAQUETE PERDIDO POR ROBO" ya se resuelve automáticamente a
-- POSIBLE INDEMNIZACIÓN por la Regla 0 (cualquier excepción que
-- contenga "ROBO"), así que aquí solo se agrega para que tenga
-- descripción y aparezca correctamente listada en el catálogo.
--
-- Ejecutar en el SQL Editor de Supabase. Es seguro de correr aunque
-- ya hayas cargado datos (on conflict do nothing).
-- ============================================================

insert into excepciones_catalogo (nombre, accion, descripcion) values
('AREA REMOTA', 'SOLICITAR INFORMACIÓN', 'El destino se encuentra en zona remota fuera de cobertura estándar'),
('COD ELEVADO', 'SOLICITAR INFORMACIÓN', 'El monto del COD excede el límite operativo; requiere autorización'),
('DESTINO INCORRECTO', 'SOLICITAR INFORMACIÓN', 'La guía fue enviada a una oficina o ciudad destino incorrecta'),
('EMERGENCIA', 'REPROGRAMAR', 'Contingencia operativa impide la entrega; se reprograma'),
('FALLA UNIDAD', 'REPROGRAMAR', 'Falla mecánica de la unidad de reparto; se reprograma'),
('HORARIO DE RUTA EXCEDIDO', 'REPROGRAMAR', 'La ruta excedió su horario y la guía no alcanzó a entregarse'),
('MAL CLIMA', 'REPROGRAMAR', 'Condiciones climáticas impidieron la entrega'),
('NO ORDENO PAQUETE', 'DEVOLVER', 'El destinatario indica que no realizó el pedido'),
('NO QUIERE PAQUETE', 'DEVOLVER', 'El destinatario rechaza recibir el paquete'),
('PAQUETE PERDIDO POR ROBO', 'POSIBLE INDEMNIZACIÓN', 'Paquete extraviado por robo (se resuelve automático vía Regla 0)'),
('PERDIDA DE CONEXIÓN', 'REPROGRAMAR', 'Se perdió el rastreo/escaneo temporal de la guía en ruta'),
('RECHAZO POR PEDIDO DUPLICADO', 'DEVOLVER', 'El destinatario ya recibió un pedido duplicado y rechaza este'),
('RECHAZO POR RETRASO EN ENTREGA', 'DEVOLVER', 'El destinatario rechaza el paquete por demora excesiva'),
('SIN ACCESO', 'SOLICITAR INFORMACIÓN', 'Vialidad o acceso al domicilio bloqueado/no disponible'),
('VACACIONES', 'REPROGRAMAR', 'El destinatario está de vacaciones; se reprograma la entrega')
on conflict (nombre) do nothing;
