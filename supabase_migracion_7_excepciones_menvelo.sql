-- ============================================================
-- MIGRACIÓN 7: excepciones nuevas detectadas en el reporte MENVELO
-- (REPORTE_OPERACIONES_MENVELO_020726.xlsx, 12,493 guías)
-- ============================================================

insert into excepciones_catalogo (nombre, accion, descripcion) values
('PAQUETE DAÑADO', 'SOLICITAR INFORMACIÓN', 'El paquete presenta daño físico; se evalúa antes de reprogramar o devolver'),
('PAQUETE DANADO', 'SOLICITAR INFORMACIÓN', 'Variante sin acento de "PAQUETE DAÑADO" tal como llega de algunos exports de OPS'),
('PAQUETE PERDIDO', 'POSIBLE INDEMNIZACIÓN', 'Paquete extraviado (sin causa de robo especificada)')
on conflict (nombre) do nothing;
