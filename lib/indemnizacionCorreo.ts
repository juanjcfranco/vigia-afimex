import { Indemnizacion, ContactoOficina } from '@/lib/types';
import { buildMailtoUrl } from '@/lib/business-logic';
import { exportIndemnizacionPDF } from '@/lib/export';

// Arma el correo con el resumen de la incidencia y abre el PDF aparte — un
// mailto NO puede traer un adjunto automático, así que el PDF se abre en
// otra pestaña para que el usuario le dé "Guardar como PDF" y lo arrastre
// al correo. Se comparte entre el modal del caso y los botones de cada fila
// de la tabla para que el texto del correo sea SIEMPRE el mismo.
// Usa el caso YA GUARDADO, no lo que esté a medio editar en un formulario.
export function enviarIndemnizacionPorCorreo(caso: Indemnizacion, contactos: ContactoOficina[]) {
    const contacto = contactos.find(
      (c) => c.oficina === caso.oficina || c.oficina === caso.oficina_incidencia
    );
    const para = contacto?.email_to || '';
    const cc = contacto?.email_cc || '';

    const asunto = `Solicitud de autorización de indemnización — ${caso.folio} — ${caso.cliente || ''}`;

    const cuerpo = [
      'Estimado equipo,',
      '',
      'Te comparto el siguiente caso de incidencia para tu revisión y autorización de la indemnización correspondiente:',
      '',
      'RESUMEN DE INCIDENCIA',
      '----------------------------------------',
      `Folio:                    ${caso.folio}`,
      `Cliente:                  ${caso.cliente || '—'}`,
      `Guía(s):                  ${caso.guias.join(', ')}`,
      `Destino:                  ${caso.oficina || '—'}${caso.tipo_destino ? ` (${caso.tipo_destino})` : ''}`,
      `Oficina de incidencia:    ${caso.oficina_incidencia || '—'}`,
      `Fecha de registro:        ${caso.fecha || '—'}`,
      `Fecha último movimiento:  ${caso.fecha_mov || '—'}`,
      '',
      'INCIDENCIA',
      '----------------------------------------',
      `Tipo:                     ${caso.tipo_incidencia || '—'}`,
      `Último escaneo:           ${caso.scan_estatus || '—'}`,
      `Ubicación escaneo:        ${caso.scan_loc || '—'}`,
      `Usuario escaneo:          ${caso.scan_user || '—'}`,
      '',
      'INVESTIGACIÓN',
      '----------------------------------------',
      caso.investigacion || 'Sin detalle registrado.',
      '',
      'RESOLUCIÓN ECONÓMICA',
      '----------------------------------------',
      `Importe declarado:        $${(caso.importe || 0).toLocaleString('es-MX')}`,
      `Indemnización:            $${(caso.indemnizacion || 0).toLocaleString('es-MX')}`,
      `Importe recuperable:      $${(caso.recuperable || 0).toLocaleString('es-MX')}`,
      `Cargo a Afimex:           $${(caso.cargo_afimex || 0).toLocaleString('es-MX')}`,
      `Tipo de indemnización:    ${caso.tipo_indemnizacion || '—'}`,
      '',
      'Se adjunta el formato de incidencia en PDF con toda la documentación del caso (se abrió en otra pestaña — guárdalo y arrástralo aquí).',
      '',
      'Quedo en espera de tu autorización para proceder.',
      '',
      'Saludos,',
    ].join('\n');

    const mailto = buildMailtoUrl(para, { cc, subject: asunto, body: cuerpo });
    const link = document.createElement('a');
    link.href = mailto;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    exportIndemnizacionPDF(caso);
}
