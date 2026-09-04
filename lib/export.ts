'use client';

import * as XLSX from 'xlsx';
import { LOGO_AFIMEX_BASE64 } from './logo-base64';
import { Indemnizacion, Guia } from './types';
import mexicoMapData from './mexico-map-data.json';
import { FilaTemporalidad, FilaRegionOficina, FilaEfectividadTemporalidad, PuntoTendencia } from './business-logic';

export interface ColumnaExport<T> {
  header: string;
  value: (row: T) => string | number;
}

// ============================================================
// Exporta un arreglo de filas a un archivo .xlsx descargable
// ============================================================
export function exportToExcel<T>(rows: T[], columnas: ColumnaExport<T>[], nombreHoja: string) {
  const data = rows.map((row) => {
    const obj: Record<string, string | number> = {};
    columnas.forEach((col) => {
      obj[col.header] = col.value(row);
    });
    return obj;
  });

  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, nombreHoja.slice(0, 31)); // límite de 31 chars en nombre de hoja

  const fecha = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `VIGIA_${nombreHoja.replace(/\s+/g, '_')}_${fecha}.xlsx`);
}

// ============================================================
// Exporta a PDF abriendo una ventana de impresión con tabla formateada.
// Usar window.print() es más confiable en el navegador que generar
// PDF binario desde el cliente, y permite "Guardar como PDF" nativo.
// ============================================================
export function exportToPDF<T>(rows: T[], columnas: ColumnaExport<T>[], titulo: string) {
  const fecha = new Date().toLocaleString('es-MX');
  const win = window.open('', '_blank');
  if (!win) {
    alert('Tu navegador bloqueó la ventana de impresión. Habilita pop-ups para este sitio.');
    return;
  }

  const filasHtml = rows
    .map((row) => {
      const celdas = columnas.map((col) => `<td>${escapeHtml(String(col.value(row)))}</td>`).join('');
      return `<tr>${celdas}</tr>`;
    })
    .join('');

  const headerHtml = columnas.map((col) => `<th>${escapeHtml(col.header)}</th>`).join('');

  win.document.write(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="utf-8" />
      <title>VIGIA - ${escapeHtml(titulo)}</title>
      <style>
        * { box-sizing: border-box; }
        body { font-family: Arial, Helvetica, sans-serif; padding: 24px; color: #1E293B; }
        .header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; border-bottom: 2px solid #1E3A8A; padding-bottom: 12px; }
        .header h1 { font-size: 16px; color: #1E3A8A; margin: 0; }
        .header .meta { font-size: 11px; color: #64748B; text-align: right; }
        table { border-collapse: collapse; width: 100%; font-size: 10px; }
        th { background: #F8FAFC; border: 1px solid #E2E8F0; padding: 6px 8px; text-align: left; font-weight: 700; color: #64748B; }
        td { border: 1px solid #E2E8F0; padding: 5px 8px; }
        tr:nth-child(even) { background: #FAFBFC; }
        .footer { margin-top: 12px; font-size: 10px; color: #94A3B8; text-align: right; }
        @media print {
          body { padding: 8px; }
          @page { size: landscape; margin: 12mm; }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>VIGÍA — ${escapeHtml(titulo)}</h1>
        <div class="meta">Generado: ${escapeHtml(fecha)}<br/>${rows.length.toLocaleString('es-MX')} registros</div>
      </div>
      <table>
        <thead><tr>${headerHtml}</tr></thead>
        <tbody>${filasHtml}</tbody>
      </table>
      <div class="footer">VIGÍA — Panel de Control Operativo · AFIMEX</div>
      <script>
        window.onload = function() { window.print(); };
      </script>
    </body>
    </html>
  `);
  win.document.close();
}

// ============================================================
// Acuse concentrado: agrupa múltiples correos/alertas en un PDF
// ============================================================
export function exportAcuseConcentradoPDF(alertas: Array<{
  oficina: string;
  guias_incluidas: string[];
  guias_detalle?: Array<{ guia: string; f_historia: string | null }> | null;
  total_guias: number;
  enviado_a: string | null;
  enviado_en: string;
  estado: string;
  cliente?: string | null;
  tipo_solicitud?: string | null;
}>) {
  const win = window.open('', '_blank');
  if (!win) {
    alert('Tu navegador bloqueó la ventana de impresión. Habilita pop-ups para este sitio.');
    return;
  }

  const fechaGenerado = new Date().toLocaleString('es-MX', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  const seccionesHtml = alertas.map((a, idx) => {
    const fechaEnvio = new Date(a.enviado_en).toLocaleString('es-MX', {
      weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
    // guias_detalle trae el snapshot enriquecido (cliente ya es el mismo
    // para todo el bloque, así que se muestra una vez en el encabezado).
    // Si es un registro viejo sin guias_detalle, cae a solo el número.
    const detalle: Array<{ guia: string; f_historia: string | null }> =
      a.guias_detalle && a.guias_detalle.length
        ? a.guias_detalle
        : a.guias_incluidas.map((g) => ({ guia: g, f_historia: null }));
    const filasGuias = detalle
      .map((g, i) => `<tr>
        <td style="padding:4px 8px;border:1px solid #E2E8F0;color:#64748B">${i + 1}</td>
        <td style="padding:4px 8px;border:1px solid #E2E8F0;font-family:monospace;font-weight:600">${escapeHtml(g.guia)}</td>
        <td style="padding:4px 8px;border:1px solid #E2E8F0">${escapeHtml(a.oficina)}</td>
        <td style="padding:4px 8px;border:1px solid #E2E8F0">${escapeHtml(g.f_historia || '—')}</td>
      </tr>`)
      .join('');
    return `
      <div style="margin-bottom:20px;padding:12px;border:1px solid #E2E8F0;border-radius:8px;page-break-inside:avoid">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <div>
            <span style="font-weight:800;font-size:13px">${idx + 1}. ${escapeHtml(a.oficina)}</span>
            <span style="margin-left:10px;font-size:11px;color:#64748B">${a.total_guias} guía(s)</span>
            ${a.cliente ? `<span style="margin-left:8px;font-size:11px;color:#64748B">· Cliente: <strong>${escapeHtml(a.cliente)}</strong></span>` : ''}
            ${a.tipo_solicitud ? `<span style="margin-left:8px;background:#1E3A8A;color:white;font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px">${escapeHtml(a.tipo_solicitud)}</span>` : ''}
          </div>
          <div style="font-size:11px;color:#64748B">${escapeHtml(fechaEnvio)}</div>
        </div>
        <div style="font-size:11px;color:#64748B;margin-bottom:8px">Enviado a: <strong>${escapeHtml(a.enviado_a || '—')}</strong></div>
        <table style="border-collapse:collapse;width:100%;font-size:11px">
          <thead><tr>
            <th style="background:#F8FAFC;border:1px solid #E2E8F0;padding:4px 8px;text-align:left;color:#94A3B8">#</th>
            <th style="background:#F8FAFC;border:1px solid #E2E8F0;padding:4px 8px;text-align:left;color:#94A3B8">Guía</th>
            <th style="background:#F8FAFC;border:1px solid #E2E8F0;padding:4px 8px;text-align:left;color:#94A3B8">Oficina</th>
            <th style="background:#F8FAFC;border:1px solid #E2E8F0;padding:4px 8px;text-align:left;color:#94A3B8">Últ. Mov.</th>
          </tr></thead>
          <tbody>${filasGuias}</tbody>
        </table>
      </div>`;
  }).join('');

  const totalGuias = alertas.reduce((s, a) => s + a.total_guias, 0);

  // Resumen por tipo de notificación (Reprogramación, Devolución, Alerta
  // sin movimiento, Estado Crítico, etc.) — cuenta notificaciones, no
  // guías, y se ordena de mayor a menor para que lo más frecuente quede
  // primero.
  const conteoPorTipo: Record<string, number> = {};
  alertas.forEach((a) => {
    const tipo = a.tipo_solicitud || 'Sin tipo especificado';
    conteoPorTipo[tipo] = (conteoPorTipo[tipo] || 0) + 1;
  });
  const resumenTiposHtml = Object.entries(conteoPorTipo)
    .sort((a, b) => b[1] - a[1])
    .map(
      ([tipo, n]) =>
        `<span style="display:inline-flex;align-items:center;gap:5px;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:20px;padding:4px 12px;font-size:11.5px;font-weight:600;margin:3px 4px 3px 0;">
          ${escapeHtml(tipo)}
          <span style="background:#1E3A8A;color:white;font-weight:800;font-size:10.5px;border-radius:10px;padding:1px 7px;">${n}</span>
        </span>`
    )
    .join('');

  win.document.write(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="utf-8"/>
      <title>Acuse Concentrado — ${alertas.length} notificaciones</title>
      <style>
        * { box-sizing:border-box; }
        body { font-family:Arial,Helvetica,sans-serif; padding:28px; color:#1E293B; max-width:900px; margin:0 auto; }
        @media print { body { padding:10px; } @page { size:portrait; margin:12mm; } }
      </style>
    </head>
    <body>
      <div style="display:flex;align-items:center;justify-content:space-between;border-bottom:3px solid #1E3A8A;padding-bottom:14px;margin-bottom:14px;">
        <div style="display:flex;align-items:center;gap:14px;">
          <img src="${LOGO_AFIMEX_BASE64}" alt="AFIMEX" style="height:38px"/>
          <div>
            <div style="font-size:18px;font-weight:800;color:#1E3A8A">VIGÍA — Acuse Concentrado de Envíos</div>
            <div style="font-size:12px;color:#64748B">Comprobante de notificaciones operativas</div>
          </div>
        </div>
        <div style="font-size:11px;color:#94A3B8;text-align:right">
          Generado: ${escapeHtml(fechaGenerado)}<br/>
          <strong style="color:#1E3A8A">${alertas.length}</strong> notificaciones · <strong style="color:#1E3A8A">${totalGuias}</strong> guías
        </div>
      </div>
      <div style="margin-bottom:20px;">
        <div style="font-size:11px;font-weight:700;color:#94A3B8;text-transform:uppercase;margin-bottom:6px;">Resumen por Tipo de Notificación</div>
        ${resumenTiposHtml}
      </div>
      ${seccionesHtml}
      <div style="margin-top:20px;text-align:center;font-size:10px;color:#94A3B8;border-top:1px solid #E2E8F0;padding-top:10px;">
        VIGÍA — Panel de Control Operativo · AFIMEX
      </div>
      <script>window.onload = function() { window.print(); };</script>
    </body>
    </html>
  `);
  win.document.close();
}

// ============================================================
// Acuse de envío de correo de alerta
// ============================================================
// ============================================================
// PDF de resumen de un caso de indemnización — pensado para adjuntar
// manualmente al correo de autorización (ver enviarPorCorreo en el
// modal: un mailto no puede traer adjuntos automáticos, así que este PDF
// se abre aparte para que el usuario le dé "Guardar como PDF" y lo
// arrastre al correo que se acaba de abrir).
// ============================================================
export function exportIndemnizacionPDF(caso: Indemnizacion) {
  const win = window.open('', '_blank');
  if (!win) {
    alert('Tu navegador bloqueó la ventana de impresión. Habilita pop-ups para este sitio.');
    return;
  }

  const fechaGenerado = new Date().toLocaleString('es-MX', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const monto = (n: number | null) => `$${(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;

  const dato = (label: string, value: string) => `
    <div class="dato">
      <div class="dato-label">${escapeHtml(label)}</div>
      <div class="dato-valor">${escapeHtml(value || '—')}</div>
    </div>`;

  win.document.write(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="utf-8"/>
      <title>Indemnización ${escapeHtml(caso.folio)}</title>
      <style>
        * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; color-adjust: exact; }
        body { font-family: Arial, Helvetica, sans-serif; padding: 28px; color: #1E293B; max-width: 820px; margin: 0 auto; }
        .header { display: flex; align-items: center; justify-content: space-between; border-bottom: 3px solid #1E3A8A; padding-bottom: 14px; margin-bottom: 16px; }
        .header h1 { font-size: 18px; color: #1E3A8A; margin: 0 0 4px 0; }
        .header .subtitulo { font-size: 12px; color: #64748B; }
        .header .meta { font-size: 11px; color: #94A3B8; text-align: right; }
        .estado-badge { display: inline-block; color: white; font-weight: 800; font-size: 12px; border-radius: 20px; padding: 3px 14px; }
        .fila { display: grid; gap: 12px; margin-bottom: 12px; }
        .fila-2 { grid-template-columns: 1fr 2.2fr; }
        .fila-2b { grid-template-columns: 1fr 1fr; }
        .card { border: 1px solid #E2E8F0; border-radius: 10px; padding: 14px; background: #fff; }
        .card-label { font-size: 10px; font-weight: 800; color: #94A3B8; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px; }
        .guia-num { font-size: 20px; font-weight: 800; color: #1E3A8A; }
        .datos-grid { display: flex; flex-wrap: wrap; gap: 10px 20px; }
        .datos-grid .dato { flex: 1 1 40%; min-width: 130px; }
        .dato-label { font-size: 9.5px; font-weight: 700; color: #94A3B8; text-transform: uppercase; margin-bottom: 1px; }
        .dato-valor { font-size: 12.5px; font-weight: 700; }
        .chip { display: inline-block; font-size: 11.5px; font-weight: 700; padding: 3px 12px; border-radius: 20px; border: 1.5px solid #1E3A8A; color: #1E3A8A; }
        .chip-estatus { display: inline-block; font-size: 11px; font-weight: 800; padding: 2px 10px; border-radius: 20px; background: #EA7C1A; color: white; }
        .investigacion-box { font-size: 12px; white-space: pre-wrap; line-height: 1.5; }
        .econ-grid { display: flex; gap: 8px; margin-bottom: 0; }
        .econ-box { flex: 1; min-width: 0; border: 1.5px solid; border-radius: 8px; padding: 8px 6px; text-align: center; }
        .econ-label { font-size: 9.5px; font-weight: 700; text-transform: uppercase; margin-bottom: 4px; color: #64748B; }
        .econ-valor { font-size: 15px; font-weight: 800; }
        .firmas { display: flex; gap: 20px; margin-top: 30px; text-align: center; }
        .firma-linea { flex: 1; border-top: 1.5px solid #1E293B; padding-top: 6px; font-size: 11px; }
        .firma-nombre { font-weight: 700; }
        .firma-cargo { color: #64748B; font-size: 10px; }
        .footer { margin-top: 20px; font-size: 10px; color: #94A3B8; display: flex; justify-content: space-between; border-top: 1px solid #E2E8F0; padding-top: 8px; }
        @media print { body { padding: 10mm; } @page { size: portrait; margin: 12mm; } }
      </style>
    </head>
    <body>
      <div class="header">
        <div style="display:flex;align-items:center;gap:14px;">
          <img src="${LOGO_AFIMEX_BASE64}" alt="AFIMEX" style="height:36px"/>
          <div>
            <h1>Caso de Indemnización — ${escapeHtml(caso.folio)}</h1>
            <div class="subtitulo">Resumen de incidencia · VIGÍA</div>
          </div>
        </div>
        <div class="meta">
          Generado: ${escapeHtml(fechaGenerado)}<br/>
          <span class="estado-badge" style="background:${
            { PENDIENTE: '#EA7C1A', APROBADA: '#1E3A8A', PAGADA: '#0B9B67', RECHAZADA: '#DC2626' }[caso.estado]
          }">${escapeHtml(caso.estado)}</span>
        </div>
      </div>

      <div class="fila fila-2">
        <div class="card">
          <div class="card-label">Guía(s)</div>
          <div class="guia-num">${escapeHtml(caso.guias.join(', '))}</div>
        </div>
        <div class="card">
          <div class="card-label">Datos del Envío</div>
          <div class="datos-grid">
            ${dato('Cliente', caso.cliente || '')}
            ${dato('Destino', caso.oficina || '')}
            ${dato('Tipo', caso.tipo_destino || '')}
            ${dato('Of. Incidencia', caso.oficina_incidencia || '')}
            ${dato('Fecha registro', caso.fecha || '')}
            ${dato('Último movimiento', caso.fecha_mov || '')}
            ${dato('Importe declarado', monto(caso.importe))}
          </div>
        </div>
      </div>

      <div class="fila fila-2b">
        <div class="card">
          <div class="card-label">Tipo de Incidencia</div>
          <span class="chip">${escapeHtml(caso.tipo_incidencia || 'Sin especificar')}</span>
        </div>
        <div class="card">
          <div class="card-label">Último Escaneo</div>
          <div class="datos-grid">
            ${dato('Ubicación', caso.scan_loc || '')}
            ${dato('Fecha y hora', caso.scan_dt ? new Date(caso.scan_dt).toLocaleString('es-MX') : '—')}
            ${dato('Usuario', caso.scan_user || '')}
            <div class="dato">
              <div class="dato-label">Estatus</div>
              <span class="chip-estatus">${escapeHtml(caso.scan_estatus || 'Sin dato')}</span>
            </div>
          </div>
        </div>
      </div>

      <div class="card" style="margin-bottom:12px;">
        <div class="card-label">Investigación</div>
        <div class="investigacion-box">${escapeHtml(caso.investigacion || 'Sin detalle registrado.')}</div>
      </div>

      <div class="card" style="margin-bottom:12px;">
        <div class="card-label">Resolución Económica</div>
        <div class="econ-grid">
          <div class="econ-box" style="border-color:#0B9B67;">
            <div class="econ-label">Indemnización</div>
            <div class="econ-valor" style="color:#0B9B67;">${monto(caso.indemnizacion)}</div>
          </div>
          <div class="econ-box" style="border-color:#1E3A8A;">
            <div class="econ-label">Importe Recuperable</div>
            <div class="econ-valor" style="color:#1E3A8A;">${caso.recuperable ? monto(caso.recuperable) : '—'}</div>
          </div>
          <div class="econ-box" style="border-color:#DC2626;">
            <div class="econ-label">Cargo a AFIMEX</div>
            <div class="econ-valor" style="color:#DC2626;">${monto(caso.cargo_afimex)}</div>
          </div>
          <div class="econ-box" style="border-color:#E2E8F0;">
            <div class="econ-label">Tipo de Indemnización</div>
            <div class="econ-valor" style="font-size:12px;">${escapeHtml(caso.tipo_indemnizacion || '—')}</div>
          </div>
          <div class="econ-box" style="border-color:#E2E8F0;">
            <div class="econ-label">Tipo de Pago</div>
            <div class="econ-valor" style="font-size:12px;">${escapeHtml(caso.tipo_indemnizacion || '—')}</div>
          </div>
          <div class="econ-box" style="border-color:#E2E8F0;">
            <div class="econ-label">Folio / Referencia</div>
            <div class="econ-valor" style="font-size:12px;">${escapeHtml(caso.pay_ref || '—')}</div>
          </div>
        </div>
      </div>

      <div class="firmas">
        <div class="firma-linea">
          <div class="firma-nombre">${escapeHtml(caso.creado_por || 'Elaboró')}</div>
          <div class="firma-cargo">KAM Cuentas Especiales</div>
        </div>
        <div class="firma-linea">
          <div class="firma-nombre">&nbsp;</div>
          <div class="firma-cargo">Autorizó</div>
        </div>
        <div class="firma-linea">
          <div class="firma-nombre">&nbsp;</div>
          <div class="firma-cargo">Enterado</div>
        </div>
      </div>

      <div class="footer">
        <span>AFIMEX Paquetería y Logística — ${escapeHtml(fechaGenerado)}</span>
        <span style="font-weight:700;">${escapeHtml(caso.folio)}</span>
      </div>

      <script>
        window.onload = function() { window.print(); };
      </script>
    </body>
    </html>
  `);
  win.document.close();
}

export function exportAcusePDF(alerta: {
  oficina: string;
  guias_incluidas: string[];
  guias_detalle?: Array<{ guia: string; f_historia: string | null }> | null;
  total_guias: number;
  enviado_a: string | null;
  enviado_en: string;
  estado: string;
  cliente?: string | null;
  tipo_solicitud?: string | null;
}) {
  const win = window.open('', '_blank');
  if (!win) {
    alert('Tu navegador bloqueó la ventana de impresión. Habilita pop-ups para este sitio.');
    return;
  }

  const fechaEnvio = new Date(alerta.enviado_en).toLocaleString('es-MX', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const fechaGenerado = new Date().toLocaleString('es-MX', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const detalle: Array<{ guia: string; f_historia: string | null }> =
    alerta.guias_detalle && alerta.guias_detalle.length
      ? alerta.guias_detalle
      : alerta.guias_incluidas.map((g) => ({ guia: g, f_historia: null }));

  const filasGuias = detalle
    .map(
      (g, i) => `<tr>
        <td style="padding:5px 10px;border:1px solid #E2E8F0;color:#64748B">${i + 1}</td>
        <td style="padding:5px 10px;border:1px solid #E2E8F0;font-family:monospace;font-weight:600">${escapeHtml(g.guia)}</td>
        <td style="padding:5px 10px;border:1px solid #E2E8F0">${escapeHtml(alerta.oficina)}</td>
        <td style="padding:5px 10px;border:1px solid #E2E8F0">${escapeHtml(g.f_historia || '—')}</td>
      </tr>`
    )
    .join('');

  win.document.write(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="utf-8"/>
      <title>Acuse de Envío — ${escapeHtml(alerta.oficina)}</title>
      <style>
        * { box-sizing: border-box; }
        body { font-family: Arial, Helvetica, sans-serif; padding: 32px; color: #1E293B; max-width: 800px; margin: 0 auto; }
        .header { display: flex; align-items: center; justify-content: space-between; border-bottom: 3px solid #1E3A8A; padding-bottom: 14px; margin-bottom: 24px; }
        .header-left { display: flex; align-items: center; gap: 14px; }
        .header-left img { height: 38px; }
        .title { font-size: 18px; font-weight: 800; color: #1E3A8A; }
        .subtitle { font-size: 12px; color: #64748B; margin-top: 2px; }
        .meta { font-size: 11px; color: #94A3B8; text-align: right; }
        .badge { display:inline-block; background:#0B9B67; color:white; font-size:11px; font-weight:700; padding:3px 10px; border-radius:20px; }
        .info-grid { display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:24px; }
        .info-card { background:#F8FAFC; border-radius:8px; padding:12px 16px; }
        .info-label { font-size:10px; font-weight:700; color:#94A3B8; text-transform:uppercase; margin-bottom:4px; }
        .info-value { font-size:14px; font-weight:700; color:#1E293B; }
        .section-title { font-size:13px; font-weight:800; color:#1E293B; border-left:4px solid #1E3A8A; padding-left:8px; margin-bottom:10px; }
        table { border-collapse:collapse; width:100%; font-size:12px; }
        th { background:#F8FAFC; border:1px solid #E2E8F0; padding:7px 10px; text-align:left; font-weight:700; color:#64748B; }
        tr:nth-child(even) td { background:#FAFBFC; }
        .footer { margin-top:24px; text-align:center; font-size:10px; color:#94A3B8; border-top:1px solid #E2E8F0; padding-top:12px; }
        @media print { body { padding:12px; } @page { size:portrait; margin:12mm; } }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="header-left">
          <img src="${LOGO_AFIMEX_BASE64}" alt="AFIMEX"/>
          <div>
            <div class="title">VIGÍA — Acuse de Envío</div>
            <div class="subtitle">Comprobante de notificación operativa</div>
          </div>
        </div>
        <div class="meta">
          Generado: ${escapeHtml(fechaGenerado)}<br/>
          <span class="badge">✓ ${escapeHtml(alerta.estado.toUpperCase())}</span>
        </div>
      </div>

      <div class="info-grid">
        <div class="info-card">
          <div class="info-label">Tipo de Notificación</div>
          <div class="info-value" style="color:#1E3A8A">${escapeHtml(alerta.tipo_solicitud || '—')}</div>
        </div>
        <div class="info-card">
          <div class="info-label">Cliente</div>
          <div class="info-value">${escapeHtml(alerta.cliente || '—')}</div>
        </div>
        <div class="info-card">
          <div class="info-label">Oficina Destino</div>
          <div class="info-value">${escapeHtml(alerta.oficina)}</div>
        </div>
        <div class="info-card">
          <div class="info-label">Enviado A</div>
          <div class="info-value">${escapeHtml(alerta.enviado_a || '—')}</div>
        </div>
        <div class="info-card">
          <div class="info-label">Fecha y Hora de Envío</div>
          <div class="info-value">${escapeHtml(fechaEnvio)}</div>
        </div>
        <div class="info-card">
          <div class="info-label">Total de Guías Notificadas</div>
          <div class="info-value" style="color:#1E3A8A">${alerta.total_guias}</div>
        </div>
      </div>

      <div class="section-title">Guías Incluidas en la Notificación</div>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Número de Guía</th>
            <th>Oficina Destino</th>
            <th>Últ. Mov.</th>
          </tr>
        </thead>
        <tbody>
          ${filasGuias}
        </tbody>
      </table>

      <div class="footer">
        Este acuse confirma que la notificación fue enviada a ${escapeHtml(alerta.enviado_a || '—')} el ${escapeHtml(fechaEnvio)}<br/>
        VIGÍA — Panel de Control Operativo · AFIMEX
      </div>

      <script>window.onload = function() { window.print(); };</script>
    </body>
    </html>
  `);
  win.document.close();
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ============================================================
// Exportación dedicada del Reporte de Cierre Operativo.
// Replica visualmente la estructura del modal (tarjetas KPI,
// secciones, tablas) en vez de una tabla genérica, e incluye
// el logo de AFIMEX y el periodo del corte.
// ============================================================
export interface CierreExportData {
  cliente: string;
  periodo: string;
  nombreArchivo?: string;
  kpis: { label: string; value: string; color: string; detail?: string }[];
  cod: { label: string; value: string; color: string; detail?: string }[];
  rankingExcepciones: [string, number][];
  efectividadPorEntidad: { key: string; total: number; efectividad: number | null }[];
  efectividadPorOficina: { key: string; total: number; efectividad: number | null }[];
  abiertasOriginales: number;
  abiertasRetornos: number;
  abiertasPorOficina: { key: string; count: number }[];
  abiertasPorEstado: [string, number][];
  alertas?: { label: string; value: string; color: string; detail?: string }[];
  guiasPorCantidadExcepciones?: [string, number][];
}

export function exportCierrePDF(data: CierreExportData) {
  const win = window.open('', '_blank');
  if (!win) {
    alert('Tu navegador bloqueó la ventana de impresión. Habilita pop-ups para este sitio.');
    return;
  }

  const fechaGenerado = new Date().toLocaleString('es-MX', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const kpiCards = (items: { label: string; value: string; color: string; detail?: string }[]) =>
    items
      .map(
        (k) => `
        <div class="kpi-card" style="border-top-color:${k.color}">
          <div class="kpi-label">${escapeHtml(k.label)}</div>
          <div class="kpi-value" style="color:${k.color}">${escapeHtml(k.value)}</div>
          ${k.detail ? `<div class="kpi-detail">${escapeHtml(k.detail)}</div>` : ''}
        </div>`
      )
      .join('');

  const tablaSimple = (titulo: string, headers: string[], rows: string[][]) => `
    <div class="seccion">
      <div class="seccion-titulo">${escapeHtml(titulo)}</div>
      <table>
        <thead><tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>
        <tbody>
          ${rows.map((r) => `<tr>${r.map((c) => `<td>${escapeHtml(c)}</td>`).join('')}</tr>`).join('')}
        </tbody>
      </table>
    </div>`;

  const rankingHtml = `
    <div class="seccion">
      <div class="seccion-titulo">Ranking de Excepciones</div>
      ${barraHtml(
        data.rankingExcepciones.map(([key, count]) => ({ key, count })),
        data.rankingExcepciones.reduce((s, [, n]) => s + n, 0),
        '#7C3AED'
      )}
    </div>`;

  // Gráfico (barras de %) + tabla completa, para Entidad y Oficina. Ya
  // vienen ordenadas de mayor a menor efectividad desde CierreModal.
  const efectEntidadChartHtml = `
    <div class="seccion">
      <div class="seccion-titulo">Efectividad por Entidad</div>
      ${barraEfectividadHtml(data.efectividadPorEntidad.slice(0, 15))}
    </div>`;

  const efectOficinaChartHtml = `
    <div class="seccion">
      <div class="seccion-titulo">Efectividad por Oficina</div>
      ${barraEfectividadHtml(data.efectividadPorOficina.slice(0, 15))}
    </div>`;

  const efectEntidadHtml = tablaSimple(
    `Efectividad por Entidad — Todas (${data.efectividadPorEntidad.length})`,
    ['Entidad', 'Total', 'Efectividad'],
    data.efectividadPorEntidad.map((e) => [e.key, String(e.total), e.efectividad !== null ? `${e.efectividad}%` : '—'])
  );

  const efectOficinaHtml = tablaSimple(
    `Efectividad por Oficina — Todas (${data.efectividadPorOficina.length})`,
    ['Oficina', 'Total', 'Efectividad'],
    data.efectividadPorOficina.map((o) => [o.key, String(o.total), o.efectividad !== null ? `${o.efectividad}%` : '—'])
  );

  const abiertasHtml = tablaSimple(
    'Resumen de Guías Abiertas',
    ['Estado', 'Guías'],
    data.abiertasPorEstado.map(([estado, n]) => [estado, String(n)])
  );

  const abiertasOriginalesRetornosHtml = `
    <div class="seccion">
      <div class="seccion-titulo">Guías Abiertas — Originales vs Retornos</div>
      <div class="kpi-grid" style="grid-template-columns: repeat(2, 1fr);">
        ${kpiCards([
          { label: 'Originales', value: data.abiertasOriginales.toLocaleString('es-MX'), color: '#1E3A8A' },
          { label: 'Retornos', value: data.abiertasRetornos.toLocaleString('es-MX'), color: '#7C3AED' },
        ])}
      </div>
    </div>`;

  const abiertasPorOficinaHtml = `
    <div class="seccion">
      <div class="seccion-titulo">Guías Abiertas por Oficina</div>
      ${barraHtml(
        data.abiertasPorOficina,
        data.abiertasOriginales + data.abiertasRetornos,
        '#1E3A8A'
      )}
    </div>`;

  const abiertasChartHtml = `
    <div class="seccion">
      <div class="seccion-titulo">Guías Abiertas por Estado</div>
      ${barraHtml(
        data.abiertasPorEstado.map(([key, count]) => ({ key, count })),
        data.abiertasPorEstado.reduce((s, [, n]) => s + n, 0),
        '#EA7C1A'
      )}
    </div>`;

  const excPorCantidadHtml = data.guiasPorCantidadExcepciones
    ? tablaSimple(
        'Guías por Cantidad de Excepciones',
        ['Cantidad de excepciones', 'Guías'],
        data.guiasPorCantidadExcepciones.map(([n, c]) => [`${n} excepción${n === '1' ? '' : 'es'}`, String(c)])
      )
    : '';

  const alertasHtml =
    data.alertas && data.alertas.length
      ? `
    <div class="seccion">
      <div class="seccion-titulo">Alertas — Guías Abiertas por Nivel de Riesgo</div>
      <div class="kpi-grid" style="grid-template-columns: repeat(3, 1fr);">${kpiCards(data.alertas)}</div>
    </div>`
      : '';

  win.document.write(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="utf-8" />
      <title>VIGIA - Reporte de Cierre Operativo</title>
      <style>
        * { box-sizing: border-box; }
        body { font-family: Arial, Helvetica, sans-serif; padding: 24px; color: #1E293B; }
        .header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 18px; border-bottom: 3px solid #1E3A8A; padding-bottom: 14px; }
        .header-left { display: flex; align-items: center; gap: 14px; }
        .header-left img { height: 38px; }
        .header-title { font-size: 18px; font-weight: 800; color: #1E3A8A; margin: 0; }
        .header-subtitle { font-size: 12px; color: #64748B; margin-top: 2px; }
        .header-meta { font-size: 11px; color: #94A3B8; text-align: right; }
        .periodo-banner { background: #EFF6FF; border: 1px solid #BFDBFE; border-radius: 8px; padding: 10px 14px; margin-bottom: 18px; font-size: 13px; }
        .periodo-banner strong { color: #1E3A8A; }
        .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 18px; }
        .kpi-card { background: #F8FAFC; border-top: 3px solid #1E3A8A; border-radius: 8px; padding: 10px; text-align: center; }
        .kpi-label { font-size: 9.5px; font-weight: 700; color: #64748B; text-transform: uppercase; }
        .kpi-value { font-size: 18px; font-weight: 800; margin-top: 3px; }
        .kpi-detail { font-size: 8.5px; color: #94A3B8; margin-top: 3px; line-height: 1.3; }
        .seccion { margin-bottom: 18px; }
        .seccion-titulo { font-size: 13px; font-weight: 800; color: #1E293B; margin-bottom: 8px; border-left: 4px solid #1E3A8A; padding-left: 8px; }
        table { border-collapse: collapse; width: 100%; font-size: 10px; }
        th { background: #F8FAFC; border: 1px solid #E2E8F0; padding: 5px 7px; text-align: left; font-weight: 700; color: #64748B; }
        td { border: 1px solid #E2E8F0; padding: 4px 7px; }
        tr:nth-child(even) { background: #FAFBFC; }
        .seccion table tbody tr { page-break-inside: avoid; }
        .dos-columnas { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        .footer { margin-top: 16px; font-size: 10px; color: #94A3B8; text-align: center; border-top: 1px solid #E2E8F0; padding-top: 10px; }
        .barra-fila { display: flex; align-items: center; gap: 8px; margin-bottom: 7px; }
        .barra-label { font-size: 11px; font-weight: 600; width: 34%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .barra-track { flex: 1; background: #F1F5F9; border-radius: 4px; height: 10px; overflow: hidden; }
        .barra-fill { height: 100%; border-radius: 4px; }
        .barra-valor { font-size: 10.5px; font-weight: 700; width: 22%; text-align: right; white-space: nowrap; }
        .barra-pct { font-weight: 500; color: #94A3B8; }
        .sin-datos { font-size: 11px; color: #94A3B8; padding: 8px 0; }
        * { -webkit-print-color-adjust: exact; print-color-adjust: exact; color-adjust: exact; }
        @media print {
          body { padding: 10px; }
          .seccion { page-break-inside: avoid; }
          @page { size: portrait; margin: 12mm; }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="header-left">
          <img src="${LOGO_AFIMEX_BASE64}" alt="AFIMEX" />
          <div>
            <p class="header-title">VIGÍA — Reporte de Cierre Operativo</p>
            <p class="header-subtitle">${escapeHtml(data.cliente)}</p>
          </div>
        </div>
        <div class="header-meta">Generado: ${escapeHtml(fechaGenerado)}</div>
      </div>

      <div class="periodo-banner">
        <strong>Periodo del corte:</strong> ${escapeHtml(data.periodo || 'No especificado')}
        ${data.nombreArchivo ? ` &nbsp;·&nbsp; <strong>Archivo:</strong> ${escapeHtml(data.nombreArchivo)}` : ''}
      </div>

      <div class="seccion">
        <div class="seccion-titulo">Indicadores Generales</div>
        <div class="kpi-grid">${kpiCards(data.kpis)}</div>
      </div>

      <div class="seccion">
        <div class="seccion-titulo">COD Entregado vs COD en Devolución / Retorno</div>
        <div class="kpi-grid" style="grid-template-columns: repeat(${data.cod.length}, 1fr);">${kpiCards(data.cod)}</div>
      </div>

      ${alertasHtml}

      ${rankingHtml}

      ${excPorCantidadHtml}

      <div class="dos-columnas">
        ${efectEntidadChartHtml}
        ${efectOficinaChartHtml}
      </div>

      <div class="dos-columnas">
        ${efectEntidadHtml}
        ${efectOficinaHtml}
      </div>

      ${abiertasChartHtml}

      ${abiertasHtml}

      ${abiertasOriginalesRetornosHtml}

      ${abiertasPorOficinaHtml}

      <div class="footer">VIGÍA — Panel de Control Operativo · AFIMEX</div>

      <script>
        window.onload = function() { window.print(); };
      </script>
    </body>
    </html>
  `);
  win.document.close();
}

// ============================================================
// Informe Logístico: un resumen visual de una sola página con los
// indicadores clave del corte actual — pensado para compartir con
// clientes o gerencia, no para el detalle operativo día a día que ya
// cubren los demás módulos. Usa el mismo mecanismo de "ventana nueva +
// window.print()" que el resto de las exportaciones, para que el usuario
// lo pueda guardar como PDF o imprimir directamente desde el navegador.
// ============================================================
export interface InformeLogisticoData {
  cliente: string;
  periodoTexto: string;
  kpis: {
    totalProcesadas: number;
    entregadas: number;
    devoluciones: number;
    abiertas: number;
    canceladas: number;
    efectividad: number | null;
    tiempoPromedioEntregaDias: number | null;
    retornosAbiertos: number;
  };
  topExcepciones: Array<{ key: string; count: number }>;
  totalConExcepcion: number;
  topOficinas: Array<{ key: string; count: number }>;
  totalGuias: number;
  topDevolucionesPorOficina: Array<{ key: string; count: number }>;
  topDevolucionesPorMotivo: Array<{ key: string; count: number }>;
  totalDevoluciones: number;
  // Fase 1 — temporalidad de abiertas, cierre 30+, efectividad por entidad
  temporalidadAbiertas: { menos3: number; entre4y7: number; entre8y14: number; mas15: number };
  totalAbiertas: number;
  pendientes30Mas: number;
  cierre30PorOficina: Array<{ key: string; count: number }>;
  efectividadPorEntidad: Array<{ key: string; efectividad: number | null; total: number }>;
  // Resumen geográfico (versión resumida del módulo Geográfico)
  topEntidadesVolumen: Array<{ key: string; count: number }>;
  topCiudades: Array<{ key: string; count: number }>;
  datosPorEntidadMapa: Record<string, { total: number; efectividad: number | null }>;
  // Guías abiertas por estado (todas, sin tope)
  abiertasPorEstado: Array<{ key: string; count: number }>;
  // Guías abiertas por entidad (todas, sin tope)
  abiertasPorEntidad: Array<{ key: string; count: number }>;
  // Excepciones separadas por a quién son atribuibles
  excepcionesCliente: Array<{ key: string; count: number }>;
  totalExcepcionesCliente: number;
  excepcionesOperacion: Array<{ key: string; count: number }>;
  totalExcepcionesOperacion: number;
  // Temporalidad por Región (agregado ago-2026) — nivel región únicamente
  // para no hacer el informe demasiado extenso.
  temporalidadPorRegion: FilaTemporalidad[];
  // Temporalidad por Cliente — tabla independiente.
  temporalidadPorCliente: FilaTemporalidad[];
  // Resumen general de temporalidad, para los KPIs del inicio.
  temporalidadGeneral: Omit<FilaTemporalidad, 'key'> | null;
}

function colorEfectividadInforme(valor: number | null): string {
  if (valor === null) return '#94A3B8';
  if (valor >= 70) return '#0B9B67';
  if (valor >= 50) return '#EA7C1A';
  return '#DC2626';
}

function barraHtml(items: Array<{ key: string; count: number }>, total: number, color: string): string {
  if (!items.length) {
    return `<div class="sin-datos">Sin datos para este corte</div>`;
  }
  const max = Math.max(...items.map((i) => i.count), 1);
  return items
    .map(({ key, count }) => {
      const pct = total ? ((count / total) * 100).toFixed(1) : '0.0';
      const anchoBarra = Math.max(2, (count / max) * 100);
      return `
        <div class="barra-fila">
          <div class="barra-label" title="${escapeHtml(key)}">${escapeHtml(key)}</div>
          <div class="barra-track">
            <div class="barra-fill" style="width:${anchoBarra}%; background:${color};"></div>
          </div>
          <div class="barra-valor">${count.toLocaleString('es-MX')} <span class="barra-pct">(${pct}%)</span></div>
        </div>`;
    })
    .join('');
}

function barraEfectividadHtml(items: Array<{ key: string; efectividad: number | null; total: number }>): string {
  if (!items.length) return `<div class="sin-datos">Sin datos para este corte</div>`;
  return items
    .map(({ key, efectividad, total }) => {
      const pct = efectividad ?? 0;
      const color = colorEfectividadInforme(efectividad);
      return `
        <div class="barra-fila">
          <div class="barra-label" title="${escapeHtml(key)}">${escapeHtml(key)}</div>
          <div class="barra-track">
            <div class="barra-fill" style="width:${Math.max(2, pct)}%; background:${color};"></div>
          </div>
          <div class="barra-valor">${efectividad !== null ? `${efectividad}%` : '—'} <span class="barra-pct">(${total.toLocaleString('es-MX')})</span></div>
        </div>`;
    })
    .join('');
}

// ============================================================
// Tabla de Temporalidad (Doc→Plataforma, Plataforma→1ra Ruta,
// RecibidoOficina→1ra Ruta, Plataforma→Confirmación, y % dentro de 15
// días) para un desglose por grupo (región, oficina, etc.) — reutilizada
// en el Informe Logístico y el Reporte de Efectividad. Se mantiene al
// nivel de Región (no por oficina) para no hacer el PDF demasiado
// extenso — ver nota sobre desplegables en PDF más abajo.
// ============================================================
function bloqueTemporalidadHtml(titulo: string, subtitulo: string, lista: FilaTemporalidad[], etiquetaColumna = 'Región'): string {
  if (!lista.length) {
    return `
    <div class="seccion">
      <div class="seccion-titulo">${escapeHtml(titulo)}</div>
      <div class="sin-datos">Sin datos de temporalidad para este corte</div>
    </div>`;
  }
  const fmtDias = (n: number | null) => (n !== null ? `${n}d` : '—');
  return `
    <div class="seccion">
      <div class="seccion-titulo">${escapeHtml(titulo)}</div>
      <div class="aclaracion">${escapeHtml(subtitulo)}</div>
      <table>
        <thead>
          <tr>
            <th>${escapeHtml(etiquetaColumna)}</th>
            <th>Doc→Plataf.</th>
            <th>Plataf.→1ra Ruta</th>
            <th>RecibOf→1ra Ruta</th>
            <th>Plataf.→Confirm.</th>
            <th>% ≤15d</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          ${lista
            .map((f) => {
              const color = f.pctVerde === null ? '#94A3B8' : f.pctVerde >= 70 ? '#0B9B67' : f.pctVerde >= 50 ? '#EA7C1A' : '#DC2626';
              return `
            <tr>
              <td class="celda-fuerte">${escapeHtml(f.key)}</td>
              <td>${fmtDias(f.docPlataforma)}</td>
              <td>${fmtDias(f.plataformaRuta)}</td>
              <td>${fmtDias(f.recibofRuta)}</td>
              <td>${fmtDias(f.plataformaConfirmacion)}</td>
              <td><span style="font-weight:800;color:${color};">${f.pctVerde !== null ? `${f.pctVerde}%` : '—'}</span> <span class="celda-vol">(${f.verde}/${f.verde + f.rojo})</span></td>
              <td>${f.total.toLocaleString('es-MX')}</td>
            </tr>`;
            })
            .join('')}
        </tbody>
      </table>
    </div>`;
}

// ============================================================
// Tabla única: Efectividad + Temporalidad por Región → Oficina. Cada
// región es una fila resaltada, seguida de sus oficinas indentadas —
// consolida lo que antes eran listas separadas (Efectividad por Oficina,
// Efectividad por Región, Temporalidad por Oficina) en una sola tabla
// compacta, evitando repetir la misma jerarquía tres veces.
// ============================================================
function bloqueRegionOficinaHtml(data: FilaRegionOficina[]): string {
  if (!data.length) {
    return `
    <div class="seccion">
      <div class="seccion-titulo">Efectividad y Temporalidad — Región → Oficina</div>
      <div class="sin-datos">Sin datos para este corte</div>
    </div>`;
  }
  const fmtDias = (n: number | null) => (n !== null ? `${n}d` : '—');
  const filaEfectividad = (f: FilaEfectividadTemporalidad) => {
    const color = colorEfectividadInforme(f.efectividad);
    return `<span style="font-weight:800;color:${color};">${f.efectividad !== null ? `${f.efectividad}%` : '—'}</span>`;
  };
  const filaPct15 = (f: FilaEfectividadTemporalidad) => {
    const color = f.pctVerde === null ? '#94A3B8' : f.pctVerde >= 70 ? '#0B9B67' : f.pctVerde >= 50 ? '#EA7C1A' : '#DC2626';
    return `<span style="font-weight:800;color:${color};">${f.pctVerde !== null ? `${f.pctVerde}%` : '—'}</span>`;
  };

  const filasHtml = data
    .map((r) => {
      const filaRegion = `
        <tr class="fila-region">
          <td class="celda-fuerte">${escapeHtml(r.key)}</td>
          <td>${r.total.toLocaleString('es-MX')}</td>
          <td>${filaEfectividad(r)}</td>
          <td>${fmtDias(r.docPlataforma)}</td>
          <td>${fmtDias(r.plataformaRuta)}</td>
          <td>${fmtDias(r.recibofRuta)}</td>
          <td>${fmtDias(r.plataformaConfirmacion)}</td>
          <td>${filaPct15(r)}</td>
        </tr>`;
      const filasOficina = r.oficinas
        .map(
          (of) => `
        <tr class="fila-oficina">
          <td>↳ ${escapeHtml(of.key)}</td>
          <td>${of.total.toLocaleString('es-MX')}</td>
          <td>${filaEfectividad(of)}</td>
          <td>${fmtDias(of.docPlataforma)}</td>
          <td>${fmtDias(of.plataformaRuta)}</td>
          <td>${fmtDias(of.recibofRuta)}</td>
          <td>${fmtDias(of.plataformaConfirmacion)}</td>
          <td>${filaPct15(of)}</td>
        </tr>`
        )
        .join('');
      return filaRegion + filasOficina;
    })
    .join('');

  return `
    <div class="seccion">
      <div class="seccion-titulo">Efectividad y Temporalidad — Región → Oficina</div>
      <div class="aclaracion">% ≤15d: dentro de 15 días desde Plataforma hasta entrega/devolución (abiertas se miden contra hoy)</div>
      <table class="tabla-region-oficina">
        <thead>
          <tr>
            <th>Región / Oficina</th>
            <th>Total</th>
            <th>Efect.</th>
            <th>Doc→Plataf.</th>
            <th>Plataf.→1ra Ruta</th>
            <th>RecibOf→1ra Ruta</th>
            <th>Plataf.→Confirm.</th>
            <th>% ≤15d</th>
          </tr>
        </thead>
        <tbody>${filasHtml}</tbody>
      </table>
    </div>`;
}

// ============================================================
// Donut chart en SVG puro (funciona en print-to-PDF, a diferencia de
// canvas/JS-driven charts). Usado para mostrar la composición Entregadas
// / Devoluciones / Abiertas con variedad visual además de barras.
// ============================================================
function donutChartHtml(
  segmentos: Array<{ label: string; valor: number; color: string }>,
  centro: { valor: string; subtitulo: string }
): string {
  const total = segmentos.reduce((s, x) => s + x.valor, 0);
  const r = 42;
  const cx = 50;
  const cy = 50;
  const circunferencia = 2 * Math.PI * r;
  let acumulado = 0;
  const arcos = total
    ? segmentos
        .filter((s) => s.valor > 0)
        .map((s) => {
          const frac = s.valor / total;
          const largo = frac * circunferencia;
          const dasharray = `${largo} ${circunferencia - largo}`;
          const offset = -acumulado * circunferencia;
          acumulado += frac;
          return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${s.color}" stroke-width="16" stroke-dasharray="${dasharray}" stroke-dashoffset="${offset}" transform="rotate(-90 ${cx} ${cy})" />`;
        })
        .join('')
    : `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#E2E8F0" stroke-width="16" />`;

  const leyenda = segmentos
    .map(
      (s) => `
      <div class="donut-leyenda-item">
        <span class="donut-dot" style="background:${s.color};"></span>
        <span class="donut-leyenda-label">${escapeHtml(s.label)}</span>
        <span class="donut-leyenda-valor">${s.valor.toLocaleString('es-MX')}${total ? ` (${((s.valor / total) * 100).toFixed(1)}%)` : ''}</span>
      </div>`
    )
    .join('');

  return `
    <div class="donut-wrap">
      <div class="donut-svg-wrap">
        <svg viewBox="0 0 100 100" class="donut-svg">
          ${arcos}
          <text x="50" y="47" text-anchor="middle" font-size="16" font-weight="800" fill="#1E293B">${escapeHtml(centro.valor)}</text>
          <text x="50" y="60" text-anchor="middle" font-size="6.5" fill="#64748B">${escapeHtml(centro.subtitulo)}</text>
        </svg>
      </div>
      <div class="donut-leyenda">${leyenda}</div>
    </div>`;
}

// ============================================================
// Line chart (sparkline) en SVG puro, para tendencias mensuales — más
// compacto y más adecuado para series de tiempo que una barra por mes.
// ============================================================
function lineChartHtml(puntos: Array<{ label: string; valor: number }>): string {
  if (puntos.length < 2) return `<div class="sin-datos">Se necesita más de un mes para mostrar tendencia</div>`;
  const w = 600;
  const h = 160;
  const padX = 30;
  const padY = 20;
  const max = 100;
  const min = 0;
  const stepX = (w - padX * 2) / (puntos.length - 1);
  const coords = puntos.map((p, i) => {
    const x = padX + i * stepX;
    const y = padY + (1 - (p.valor - min) / (max - min || 1)) * (h - padY * 2);
    return { x, y, valor: p.valor, label: p.label };
  });
  const polyline = coords.map((c) => `${c.x},${c.y}`).join(' ');
  const puntosHtml = coords
    .map(
      (c) => `
      <circle cx="${c.x}" cy="${c.y}" r="3.5" fill="${colorEfectividadInforme(c.valor)}" />
      <text x="${c.x}" y="${c.y - 8}" text-anchor="middle" font-size="9" font-weight="700" fill="#1E293B">${c.valor}%</text>
      <text x="${c.x}" y="${h - 4}" text-anchor="middle" font-size="8.5" fill="#64748B">${escapeHtml(c.label)}</text>`
    )
    .join('');

  return `
    <svg viewBox="0 0 ${w} ${h}" style="width:100%; height:${h}px;">
      <line x1="${padX}" y1="${padY}" x2="${padX}" y2="${h - padY}" stroke="#E2E8F0" />
      <line x1="${padX}" y1="${h - padY}" x2="${w - padX}" y2="${h - padY}" stroke="#E2E8F0" />
      <polyline points="${polyline}" fill="none" stroke="#1E3A8A" stroke-width="2" />
      ${puntosHtml}
    </svg>`;
}

const COLORES_TENDENCIA_PDF = ['#1E3A8A', '#0B9B67', '#DC2626', '#B45309', '#7C3AED', '#0891B2'];

// ============================================================
// Línea múltiple (una serie por cliente/oficina/etc.) en SVG puro — igual
// que lineChartHtml, pero soporta varias líneas con leyenda. Usada para
// las tendencias mensuales de Efectividad y Temporalidad por Cliente/
// Oficina en el Reporte de Efectividad.
// ============================================================
function multiLineChartHtml(datos: PuntoTendencia[], series: string[], opciones: { autoEscala?: boolean } = {}): string {
  if (datos.length < 2) return `<div class="sin-datos">Se necesita más de un mes para mostrar tendencia</div>`;
  const w = 600;
  const h = 190;
  const padX = 32;
  const padY = 18;
  let max = 100;
  const min = 0;
  if (opciones.autoEscala) {
    const valores: number[] = [];
    datos.forEach((d) => series.forEach((s) => {
      const v = d[s];
      if (v !== null && v !== undefined) valores.push(Number(v));
    }));
    // 15% de margen arriba del valor más alto, para que la línea no
    // quede pegada al borde superior del gráfico.
    max = valores.length ? Math.max(...valores) * 1.15 : 1;
  }
  const stepX = (w - padX * 2) / (datos.length - 1);
  const xFor = (i: number) => padX + i * stepX;
  const yFor = (v: number) => padY + (1 - (v - min) / (max - min || 1)) * (h - padY * 2 - 14);

  const lineasHtml = series
    .map((serie, si) => {
      const color = COLORES_TENDENCIA_PDF[si % COLORES_TENDENCIA_PDF.length];
      const puntos = datos
        .map((d, i) => {
          const v = d[serie];
          if (v === null || v === undefined) return null;
          return { x: xFor(i), y: yFor(Number(v)) };
        })
        .filter((p): p is { x: number; y: number } => p !== null);
      if (!puntos.length) return '';
      const polyline = puntos.map((p) => `${p.x},${p.y}`).join(' ');
      const dots = puntos.map((p) => `<circle cx="${p.x}" cy="${p.y}" r="3" fill="${color}" />`).join('');
      return `<polyline points="${polyline}" fill="none" stroke="${color}" stroke-width="2" />${dots}`;
    })
    .join('');

  const etiquetaMes = (mes: string) => {
    const [anio, m] = mes.split('-');
    return anio && m ? `${m}/${anio.slice(2)}` : mes;
  };
  const etiquetasX = datos
    .map(
      (d, i) =>
        `<text x="${xFor(i)}" y="${h - 4}" text-anchor="middle" font-size="8.5" fill="#64748B">${escapeHtml(etiquetaMes(String(d.mes)))}</text>`
    )
    .join('');

  const leyenda =
    series.length > 1
      ? `<div class="donut-leyenda" style="flex-direction:row;flex-wrap:wrap;gap:10px;margin-top:4px;">
          ${series
            .map(
              (s, i) => `
            <div class="donut-leyenda-item" style="font-size:10px;">
              <span class="donut-dot" style="background:${COLORES_TENDENCIA_PDF[i % COLORES_TENDENCIA_PDF.length]};width:8px;height:8px;"></span>
              <span class="donut-leyenda-label">${escapeHtml(s)}</span>
            </div>`
            )
            .join('')}
        </div>`
      : '';

  return `
    <svg viewBox="0 0 ${w} ${h}" style="width:100%; height:${h}px;">
      <line x1="${padX}" y1="${padY}" x2="${padX}" y2="${h - padY}" stroke="#E2E8F0" />
      <line x1="${padX}" y1="${h - padY}" x2="${w - padX}" y2="${h - padY}" stroke="#E2E8F0" />
      ${lineasHtml}
      ${etiquetasX}
    </svg>
    ${leyenda}`;
}

// ============================================================
// Tabla de datos para una tendencia mensual — filas = series (o "Total"),
// columnas = meses. Complementa multiLineChartHtml(): cuando hay varias
// líneas muy juntas (ej. varias oficinas todas entre 90-96%), el gráfico
// solo, solo, no deja leer el valor exacto — la tabla sí.
// ============================================================
function tablaTendenciaHtml(datos: PuntoTendencia[], series: string[], sufijo = '%'): string {
  if (datos.length < 2) return '';
  const etiquetaMes = (mes: string) => {
    const [anio, m] = mes.split('-');
    return anio && m ? `${m}/${anio.slice(2)}` : mes;
  };
  return `
    <table style="margin-top:8px;">
      <thead>
        <tr>
          <th>${series.length > 1 ? 'Cliente / Oficina' : ''}</th>
          ${datos.map((d) => `<th>${escapeHtml(etiquetaMes(String(d.mes)))}</th>`).join('')}
        </tr>
      </thead>
      <tbody>
        ${series
          .map((s, i) => {
            const color = COLORES_TENDENCIA_PDF[i % COLORES_TENDENCIA_PDF.length];
            return `
          <tr>
            <td class="celda-fuerte" style="${series.length > 1 ? `color:${color};` : ''}">${escapeHtml(s === 'TOTAL' ? 'Total' : s)}</td>
            ${datos
              .map((d) => {
                const v = d[s];
                return `<td>${v !== null && v !== undefined ? `${v}${sufijo}` : '—'}</td>`;
              })
              .join('')}
          </tr>`;
          })
          .join('')}
      </tbody>
    </table>`;
}

// `ventanaExistente`: si ya se abrió una ventana antes de calcular los
// datos (para que el clic responda de inmediato con un "Generando…" en
// vez de congelar la pantalla mientras se hace todo el cálculo pesado),
// se reutiliza esa ventana en vez de abrir una nueva.
export function exportInformeLogisticoPDF(data: InformeLogisticoData, ventanaExistente?: Window | null) {
  const fecha = new Date().toLocaleString('es-MX');
  const win = ventanaExistente ?? window.open('', '_blank');
  if (!win) {
    alert('Tu navegador bloqueó la ventana de impresión. Habilita pop-ups para este sitio.');
    return;
  }

  const k = data.kpis;
  const kpiCards = [
    { label: 'Guías Procesadas', value: k.totalProcesadas.toLocaleString('es-MX'), color: '#0F172A' },
    { label: 'Entregadas', value: k.entregadas.toLocaleString('es-MX'), color: '#0B9B67' },
    { label: 'Devoluciones', value: k.devoluciones.toLocaleString('es-MX'), color: '#DC2626' },
    { label: 'Abiertas', value: k.abiertas.toLocaleString('es-MX'), color: '#EA7C1A' },
    {
      label: 'Efectividad',
      value: k.efectividad !== null ? `${k.efectividad}%` : '—',
      color: colorEfectividadInforme(k.efectividad),
    },
    {
      label: 'Tiempo Prom. de Entrega',
      value: k.tiempoPromedioEntregaDias !== null ? `${k.tiempoPromedioEntregaDias} días` : '—',
      color: '#0891B2',
    },
    { label: 'Retornos Abiertos', value: k.retornosAbiertos.toLocaleString('es-MX'), color: '#7C3AED' },
    { label: 'Canceladas', value: k.canceladas.toLocaleString('es-MX'), color: '#64748B' },
    ...(data.temporalidadGeneral
      ? [
          {
            label: 'Plataforma→Confirmación',
            value: data.temporalidadGeneral.plataformaConfirmacion !== null ? `${data.temporalidadGeneral.plataformaConfirmacion}d` : '—',
            color: '#7C3AED',
          },
          {
            label: '% Dentro de 15 Días',
            value: data.temporalidadGeneral.pctVerde !== null ? `${data.temporalidadGeneral.pctVerde}%` : '—',
            color: colorEfectividadInforme(data.temporalidadGeneral.pctVerde),
          },
          {
            label: 'Promedio Vida (Plataf.→Entrega/Retorno)',
            value: data.temporalidadGeneral.promedioVidaDias !== null ? `${data.temporalidadGeneral.promedioVidaDias}d` : '—',
            color: '#0891B2',
          },
        ]
      : []),
  ]
    .map(
      (c) => `
      <div class="kpi-card">
        <div class="kpi-label">${escapeHtml(c.label)}</div>
        <div class="kpi-value" style="color:${c.color};">${c.value}</div>
      </div>`
    )
    .join('');

  // Si la ventana ya tenía un placeholder de "Generando…" escrito (ver
  // ResumenModule.tsx), hay que reabrir el documento explícitamente antes
  // de escribir — de lo contrario, document.write() se ANEXA al contenido
  // existente en vez de remplazarlo.
  win.document.open();
  win.document.write(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="utf-8" />
      <title>VIGIA - Informe Logístico</title>
      <style>
        * { box-sizing: border-box; }
        body { font-family: Arial, Helvetica, sans-serif; padding: 28px; color: #1E293B; }
        .header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; border-bottom: 3px solid #1E3A8A; padding-bottom: 14px; }
        .header h1 { font-size: 20px; color: #1E3A8A; margin: 0 0 4px 0; }
        .header .subtitulo { font-size: 13px; color: #64748B; }
        .header .meta { font-size: 11px; color: #64748B; text-align: right; }
        .kpi-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; margin-bottom: 22px; }
        .kpi-card { border: 1px solid #E2E8F0; border-radius: 8px; padding: 12px; background: #F8FAFC; }
        .kpi-label { font-size: 10.5px; font-weight: 700; color: #64748B; margin-bottom: 4px; text-transform: uppercase; }
        .kpi-value { font-size: 22px; font-weight: 800; }
        .secciones { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; margin-bottom: 18px; }
        .mapa-card { border: 1px solid #E2E8F0; border-radius: 8px; padding: 12px; }
        .mapa-titulo { font-size: 12px; font-weight: 800; margin-bottom: 6px; color: #1E293B; }
        .leyenda { display: flex; align-items: center; gap: 10px; margin-top: 6px; font-size: 10px; color: #64748B; flex-wrap: wrap; }
        .leyenda .punto { width: 10px; height: 10px; border-radius: 50%; display: inline-block; margin-right: 3px; }
        .seccion { border: 1px solid #E2E8F0; border-radius: 8px; padding: 14px; }
        .seccion-titulo { font-size: 13px; font-weight: 800; margin-bottom: 10px; color: #1E293B; }
        .barra-fila { display: flex; align-items: center; gap: 8px; margin-bottom: 7px; }
        .barra-label { font-size: 11px; font-weight: 600; width: 34%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .barra-track { flex: 1; background: #F1F5F9; border-radius: 4px; height: 10px; overflow: hidden; }
        .barra-fill { height: 100%; border-radius: 4px; }
        .barra-valor { font-size: 10.5px; font-weight: 700; width: 22%; text-align: right; white-space: nowrap; }
        .barra-pct { font-weight: 500; color: #94A3B8; }
        .sin-datos { font-size: 11px; color: #94A3B8; padding: 8px 0; }
        .footer { margin-top: 16px; font-size: 10px; color: #94A3B8; text-align: right; }
        * { -webkit-print-color-adjust: exact; print-color-adjust: exact; color-adjust: exact; }
        @media print {
          body { padding: 10mm; }
          @page { size: portrait; margin: 12mm; }
          .secciones { break-inside: avoid; }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <div>
          <h1>VIGÍA — Informe Logístico</h1>
          <div class="subtitulo">${escapeHtml(data.cliente)} · ${escapeHtml(data.periodoTexto)}</div>
        </div>
        <div class="meta">Generado: ${escapeHtml(fecha)}<br/>${data.totalGuias.toLocaleString('es-MX')} guías en este corte</div>
      </div>

      <div class="kpi-grid">${kpiCards}</div>

      <div class="secciones">
        <div class="seccion" style="grid-column: span 2;">
          <div class="seccion-titulo">Efectividad por Entidad</div>
          ${barraEfectividadHtml(data.efectividadPorEntidad)}
        </div>
      </div>

      <div class="secciones">
        <div class="seccion" style="grid-column: span 2;">
          <div class="seccion-titulo">Cierre Operativo — Pendientes +30 días</div>
          <div style="font-size:30px;font-weight:800;color:#DC2626;margin-bottom:8px;">
            ${data.pendientes30Mas.toLocaleString('es-MX')}
            <span style="font-size:12px;font-weight:600;color:#94A3B8;"> guías sin movimiento hace 30+ días</span>
          </div>
          ${barraHtml(data.cierre30PorOficina, data.pendientes30Mas, '#DC2626')}
        </div>
      </div>

      ${bloqueTemporalidadHtml(
        'Temporalidad por Región',
        'Días promedio por etapa · % dentro de 15 días desde Plataforma hasta entrega/devolución (abiertas se miden contra hoy)',
        data.temporalidadPorRegion
      )}
      ${bloqueTemporalidadHtml(
        'Temporalidad por Cliente',
        'Días promedio por etapa · % dentro de 15 días desde Plataforma hasta entrega/devolución (abiertas se miden contra hoy)',
        data.temporalidadPorCliente,
        'Cliente'
      )}

      <div class="secciones">
        <div class="seccion">
          <div class="seccion-titulo">Excepciones Atribuibles al Cliente</div>
          <div style="font-size:10px;color:#94A3B8;margin-bottom:8px;">Decisiones o circunstancias del destinatario</div>
          ${barraHtml(data.excepcionesCliente, data.totalExcepcionesCliente, '#B45309')}
        </div>
        <div class="seccion">
          <div class="seccion-titulo">Excepciones Atribuibles a la Operación</div>
          <div style="font-size:10px;color:#94A3B8;margin-bottom:8px;">Datos, ruta, unidad u otro factor operativo</div>
          ${barraHtml(data.excepcionesOperacion, data.totalExcepcionesOperacion, '#7C3AED')}
        </div>
      </div>

      <div class="secciones">
        <div class="seccion">
          <div class="seccion-titulo">Devoluciones — Top Motivo</div>
          ${barraHtml(data.topDevolucionesPorMotivo, data.totalDevoluciones, '#EA7C1A')}
        </div>
        <div class="seccion">
          <div class="seccion-titulo">Devoluciones — Top Oficina Destino</div>
          ${barraHtml(data.topDevolucionesPorOficina, data.totalDevoluciones, '#DC2626')}
        </div>
      </div>

      <div class="seccion">
        <div class="seccion-titulo">Guías Abiertas por Estado <span style="font-weight:500;color:#94A3B8;font-size:11px;">(${data.abiertasPorEstado.length.toLocaleString('es-MX')})</span></div>
        ${barraHtml(data.abiertasPorEstado, data.totalAbiertas, '#EA7C1A')}
      </div>

      <div class="seccion">
        <div class="seccion-titulo">Guías Abiertas por Entidad <span style="font-weight:500;color:#94A3B8;font-size:11px;">(${data.abiertasPorEntidad.length.toLocaleString('es-MX')})</span></div>
        ${barraHtml(data.abiertasPorEntidad, data.totalAbiertas, '#1E3A8A')}
      </div>

      <div class="seccion">
        <div class="seccion-titulo">Temporalidad de Guías Abiertas (días sin movimiento)</div>
        ${barraHtml(
          [
            { key: 'Menos de 3 días', count: data.temporalidadAbiertas.menos3 },
            { key: '4 a 7 días', count: data.temporalidadAbiertas.entre4y7 },
            { key: '8 a 14 días', count: data.temporalidadAbiertas.entre8y14 },
            { key: '15+ días', count: data.temporalidadAbiertas.mas15 },
          ],
          data.totalAbiertas,
          '#EA7C1A'
        )}
      </div>

      <div class="seccion">
        <div class="seccion-titulo">Top Oficinas por Volumen</div>
        ${barraHtml(data.topOficinas, data.totalGuias, '#1E3A8A')}
      </div>

      <div class="seccion-titulo" style="font-size:15px;margin:20px 0 10px;border-top:2px solid #1E3A8A;padding-top:16px;">📍 Resumen Geográfico</div>

      <div class="secciones">
        <div class="mapa-card">
          <div class="mapa-titulo">Mapa de México — % del Volumen por Entidad</div>
          ${construirMapaSvg(data.datosPorEntidadMapa, 'volumen', data.totalGuias)}
          <div class="leyenda">
            <span>Menor volumen</span>
            <div style="flex:1;height:8px;border-radius:4px;background:linear-gradient(to right,#EFF6FF,#1E3A8A);"></div>
            <span>Mayor volumen</span>
          </div>
        </div>
        <div class="mapa-card">
          <div class="mapa-titulo">Mapa de México — % de Efectividad por Entidad</div>
          ${construirMapaSvg(data.datosPorEntidadMapa, 'efectividad', data.totalGuias)}
          <div class="leyenda">
            <span><span class="punto" style="background:#0B9B67;"></span>≥70%</span>
            <span><span class="punto" style="background:#EA7C1A;"></span>50-69%</span>
            <span><span class="punto" style="background:#DC2626;"></span>&lt;50%</span>
          </div>
        </div>
      </div>

      <div class="secciones">
        <div class="seccion">
          <div class="seccion-titulo">Top 5 Entidades por Volumen</div>
          ${barraHtml(data.topEntidadesVolumen, data.totalGuias, '#1E3A8A')}
        </div>
        <div class="seccion">
          <div class="seccion-titulo">Top 5 Ciudades por Volumen</div>
          ${barraHtml(data.topCiudades, data.totalGuias, '#0891B2')}
        </div>
      </div>

      <div class="footer">VIGÍA — Panel de Control Operativo · AFIMEX</div>

      <script>
        window.onload = function() { window.print(); };
      </script>
    </body>
    </html>
  `);
  win.document.close();
}


// ============================================================
// Reporte Geográfico completo: mapas (volumen y efectividad), top
// excepciones nacional, y las tablas COMPLETAS (no solo top 10/12) por
// Entidad, Oficina y Ciudad — pensado para compartir o archivar, ya que
// el módulo en pantalla solo muestra un nivel a la vez (drill-down).
// ============================================================
function colorVolumenMapaExport(valor: number, max: number): string {
  if (max <= 0 || valor <= 0) return '#F1F5F9';
  const intensidad = Math.min(1, valor / max);
  const r = Math.round(239 - intensidad * (239 - 30));
  const g = Math.round(246 - intensidad * (246 - 58));
  const b = Math.round(255 - intensidad * (255 - 138));
  return `rgb(${r},${g},${b})`;
}

function colorEfectividadMapaExport(valor: number | null): string {
  if (valor === null) return '#F1F5F9';
  if (valor >= 70) return '#0B9B67';
  if (valor >= 50) return '#EA7C1A';
  return '#DC2626';
}

// Centro aproximado de un estado (centro de su caja delimitadora), para
// poder poner la etiqueta de porcentaje encima. No es el centroide exacto
// del polígono, pero es una aproximación suficientemente buena para un
// mapa de este tamaño — evita tener que traer coordenadas de etiqueta
// hechas a mano para los 32 estados.
function centroDePath(path: string): { x: number; y: number } {
  const nums = (path.match(/-?\d+\.?\d*/g) || []).map(Number);
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < nums.length - 1; i += 2) {
    xs.push(nums[i]);
    ys.push(nums[i + 1]);
  }
  if (!xs.length) return { x: 0, y: 0 };
  return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
}

function construirMapaSvg(
  datosPorEntidad: Record<string, { total: number; efectividad: number | null }>,
  metrica: 'volumen' | 'efectividad',
  totalNacional: number
): string {
  const maxVolumen = Math.max(1, ...Object.values(datosPorEntidad).map((d) => d.total));
  const partes = mexicoMapData.states
    .map((state) => {
      const datos = datosPorEntidad[state.name];
      const fill = !datos
        ? '#F1F5F9'
        : metrica === 'volumen'
          ? colorVolumenMapaExport(datos.total, maxVolumen)
          : colorEfectividadMapaExport(datos.efectividad);
      const pathHtml = `<path d="${state.path}" fill="${fill}" stroke="#fff" stroke-width="1"/>`;

      // Etiqueta de porcentaje: % del volumen nacional en el mapa de
      // volumen, o el % de efectividad directo en el mapa de efectividad.
      // Solo se dibuja si el estado sí tiene datos y no es despreciable,
      // para no saturar el mapa con "0.0%" en estados sin nada.
      if (!datos || datos.total <= 0) return pathHtml;
      const pct = metrica === 'volumen' ? (totalNacional ? (datos.total / totalNacional) * 100 : 0) : datos.efectividad;
      if (pct === null) return pathHtml;
      const { x, y } = centroDePath(state.path);
      const texto = `${pct.toFixed(1)}%`;
      const labelHtml = `<text x="${x}" y="${y}" font-size="9" font-weight="700" fill="#fff" stroke="#0F172A" stroke-width="2.2" paint-order="stroke" text-anchor="middle" dominant-baseline="middle">${texto}</text>`;
      return pathHtml + labelHtml;
    })
    .join('');
  return `<svg viewBox="${mexicoMapData.viewBox}" style="width:100%;height:auto;max-height:340px;display:block;">${partes}</svg>`;
}

export interface GeograficoExportData {
  cliente: string;
  periodoTexto: string;
  totalGuias: number;
  efectividadNacional: number | null;
  datosPorEntidad: Record<string, { total: number; efectividad: number | null }>;
  porEntidad: Array<{ entidad: string; total: number; efectividad: number | null }>;
  porOficina: Array<{ oficina: string; total: number; efectividad: number | null }>;
  porCiudad: Array<{ ciudad: string; total: number; efectividad: number | null }>;
  topExcepciones: Array<{ key: string; count: number }>;
  totalConExcepcion: number;
}

export function exportGeograficoPDF(data: GeograficoExportData) {
  const win = window.open('', '_blank');
  if (!win) {
    alert('Tu navegador bloqueó la ventana de impresión. Habilita pop-ups para este sitio.');
    return;
  }

  const fechaGenerado = new Date().toLocaleString('es-MX', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  // Ordena por % de efectividad de mayor a menor (los que no tienen dato
  // quedan al final, sin importar el orden) — para que cada gráfico se
  // lea de mejor a peor desempeño.
  function ordenarPorEfectividad<T extends { efectividad: number | null }>(lista: T[]): T[] {
    return [...lista].sort((a, b) => {
      if (a.efectividad === null && b.efectividad === null) return 0;
      if (a.efectividad === null) return 1;
      if (b.efectividad === null) return -1;
      return b.efectividad - a.efectividad;
    });
  }

  win.document.write(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="utf-8"/>
      <title>VIGIA - Reporte Geográfico</title>
      <style>
        * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; color-adjust: exact; }
        body { font-family: Arial, Helvetica, sans-serif; padding: 22px; color: #1E293B; }
        .header { display: flex; align-items: center; justify-content: space-between; border-bottom: 3px solid #1E3A8A; padding-bottom: 12px; margin-bottom: 14px; }
        .header h1 { font-size: 20px; color: #1E3A8A; margin: 0 0 4px 0; }
        .header .subtitulo { font-size: 13px; color: #64748B; }
        .header .meta { font-size: 11px; color: #64748B; text-align: right; }
        .kpi-grid { display: flex; gap: 10px; margin-bottom: 16px; flex-wrap: wrap; }
        .kpi-card { flex: 1; min-width: 110px; border: 1px solid #E2E8F0; border-radius: 8px; padding: 10px 12px; background: #F8FAFC; }
        .kpi-label { font-size: 10px; font-weight: 700; color: #64748B; margin-bottom: 4px; text-transform: uppercase; }
        .kpi-value { font-size: 20px; font-weight: 800; }
        .mapas { display: flex; gap: 16px; margin-bottom: 14px; }
        .mapa-card { flex: 1; min-width: 0; border: 1px solid #E2E8F0; border-radius: 8px; padding: 12px; }
        .mapa-titulo { font-size: 12px; font-weight: 800; margin-bottom: 6px; color: #1E293B; }
        .leyenda { display: flex; align-items: center; gap: 10px; margin-top: 6px; font-size: 10px; color: #64748B; flex-wrap: wrap; }
        .leyenda .punto { width: 10px; height: 10px; border-radius: 50%; display: inline-block; margin-right: 3px; }
        .dos-columnas { display: flex; gap: 14px; margin-bottom: 14px; }
        .dos-columnas > .seccion { flex: 1; min-width: 0; margin-bottom: 0; }
        .seccion { border: 1px solid #E2E8F0; border-radius: 8px; padding: 12px 14px; margin-bottom: 14px; page-break-inside: avoid; }
        .seccion-titulo { font-size: 13px; font-weight: 800; margin-bottom: 8px; color: #1E293B; }
        .aclaracion { font-size: 10.5px; color: #94A3B8; font-style: italic; margin: -4px 0 8px; }
        .conteo { font-weight: 500; color: #94A3B8; font-size: 11px; }
        table { width: 100%; border-collapse: collapse; font-size: 11.5px; }
        th { text-align: left; padding: 5px 8px; background: #F8FAFC; border-bottom: 2px solid #E2E8F0; color: #64748B; font-size: 10.5px; text-transform: uppercase; }
        td { padding: 4px 8px; border-bottom: 1px solid #F1F5F9; }
        .barra-fila { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
        .barra-label { font-size: 11px; font-weight: 600; width: 34%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .barra-track { flex: 1; background: #F1F5F9; border-radius: 4px; height: 10px; overflow: hidden; }
        .barra-fill { height: 100%; border-radius: 4px; }
        .barra-valor { font-size: 10.5px; font-weight: 700; width: 22%; text-align: right; white-space: nowrap; }
        .barra-pct { font-weight: 500; color: #94A3B8; }
        .sin-datos { font-size: 11px; color: #94A3B8; padding: 8px 0; }
        .footer { margin-top: 12px; font-size: 10px; color: #94A3B8; text-align: right; }
        @media print {
          body { padding: 10mm; }
          @page { size: portrait; margin: 10mm; }
          .seccion, .mapa-card { break-inside: avoid; }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <div>
          <h1>VIGÍA — Reporte Geográfico</h1>
          <div class="subtitulo">${escapeHtml(data.cliente)} · ${escapeHtml(data.periodoTexto)}</div>
        </div>
        <div class="meta">Generado: ${escapeHtml(fechaGenerado)}<br/>${data.totalGuias.toLocaleString('es-MX')} guías en este corte</div>
      </div>

      <div class="kpi-grid">
        <div class="kpi-card">
          <div class="kpi-label">Total de Guías</div>
          <div class="kpi-value" style="color:#0F172A;">${data.totalGuias.toLocaleString('es-MX')}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Efectividad Nacional</div>
          <div class="kpi-value" style="color:${
            data.efectividadNacional === null
              ? '#94A3B8'
              : data.efectividadNacional >= 70
                ? '#0B9B67'
                : data.efectividadNacional >= 50
                  ? '#EA7C1A'
                  : '#DC2626'
          };">${data.efectividadNacional !== null ? `${data.efectividadNacional}%` : '—'}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Entidades</div>
          <div class="kpi-value" style="color:#1E3A8A;">${data.porEntidad.length.toLocaleString('es-MX')}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Oficinas</div>
          <div class="kpi-value" style="color:#1E3A8A;">${data.porOficina.length.toLocaleString('es-MX')}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Ciudades</div>
          <div class="kpi-value" style="color:#1E3A8A;">${data.porCiudad.length.toLocaleString('es-MX')}</div>
        </div>
      </div>

      <div class="mapas">
        <div class="mapa-card">
          <div class="mapa-titulo">Mapa de México — % del Volumen por Entidad</div>
          ${construirMapaSvg(data.datosPorEntidad, 'volumen', data.totalGuias)}
          <div class="leyenda">
            <span>Menor volumen</span>
            <div style="flex:1;height:8px;border-radius:4px;background:linear-gradient(to right,#EFF6FF,#1E3A8A);"></div>
            <span>Mayor volumen</span>
          </div>
        </div>
        <div class="mapa-card">
          <div class="mapa-titulo">Mapa de México — % de Efectividad por Entidad</div>
          ${construirMapaSvg(data.datosPorEntidad, 'efectividad', data.totalGuias)}
          <div class="leyenda">
            <span><span class="punto" style="background:#0B9B67;"></span>≥70%</span>
            <span><span class="punto" style="background:#EA7C1A;"></span>50-69%</span>
            <span><span class="punto" style="background:#DC2626;"></span>&lt;50%</span>
          </div>
        </div>
      </div>

      <div class="seccion">
        <div class="seccion-titulo">Por Entidad — Volumen y Efectividad <span class="conteo">(${data.porEntidad.length.toLocaleString('es-MX')})</span></div>
        <div class="aclaracion">El % es la efectividad · el número entre paréntesis es el volumen (guías)</div>
        ${barraEfectividadHtml(ordenarPorEfectividad(data.porEntidad).map((e) => ({ key: e.entidad, efectividad: e.efectividad, total: e.total })))}
      </div>

      <div class="seccion">
        <div class="seccion-titulo">Por Oficina — Volumen y Efectividad <span class="conteo">(${data.porOficina.length.toLocaleString('es-MX')})</span></div>
        <div class="aclaracion">El % es la efectividad · el número entre paréntesis es el volumen (guías)</div>
        ${barraEfectividadHtml(ordenarPorEfectividad(data.porOficina).map((o) => ({ key: o.oficina, efectividad: o.efectividad, total: o.total })))}
      </div>

      <div class="seccion">
        <div class="seccion-titulo">Por Ciudad — Volumen y Efectividad <span class="conteo">(${data.porCiudad.length.toLocaleString('es-MX')})</span></div>
        <div class="aclaracion">El % es la efectividad · el número entre paréntesis es el volumen (guías)</div>
        ${barraEfectividadHtml(ordenarPorEfectividad(data.porCiudad).map((c) => ({ key: c.ciudad, efectividad: c.efectividad, total: c.total })))}
      </div>

      <div class="seccion">
        <div class="seccion-titulo">Top Excepciones (Nacional)</div>
        ${barraHtml(data.topExcepciones, data.totalConExcepcion, '#7C3AED')}
      </div>

      <div class="footer">VIGÍA — Panel de Control Operativo · AFIMEX</div>

      <script>
        window.onload = function() { window.print(); };
      </script>
    </body>
    </html>
  `);
  win.document.close();
}

// ============================================================
// Reporte completo del módulo Efectividad: resumen general, top
// excepciones y devoluciones, y la efectividad completa (no solo top 15)
// por Cliente, Oficina, Entidad y Mes — más el comparativo por cliente
// (plaza×cliente y top excepciones) cuando el corte trae más de uno.
// ============================================================
export interface EfectividadExportData {
  cliente: string;
  periodoTexto: string;
  totalGuias: number;
  totalProcesadas: number;
  entregadas: number;
  devoluciones: number;
  abiertas: number;
  predocumentadas: number;
  documentadas: number;
  canceladas: number;
  efectividadGeneral: number | null;
  topExcepciones: Array<{ key: string; count: number }>;
  totalConExcepcion: number;
  devolucionesPorOficina: Array<{ key: string; count: number }>;
  devolucionesPorMotivo: Array<{ key: string; count: number }>;
  totalDevoluciones: number;
  porEntidad: Array<{ key: string; total: number; efectividad: number | null }>;
  porMes: Array<{ key: string; total: number; efectividad: number | null }>;
  comparativoPlazaCliente?: {
    clientes: string[];
    filas: Array<{ plaza: string; porCliente: Record<string, { efectividad: number | null; total: number }> }>;
  };
  excepcionesPorCliente?: Array<{ cliente: string; items: Array<{ key: string; count: number }>; total: number }>;
  // Efectividad + Temporalidad combinadas en UNA tabla jerárquica Región→
  // Oficina (agregado ago-2026) — reemplaza lo que antes eran 3 secciones
  // separadas (Efectividad por Oficina, Efectividad por Región,
  // Temporalidad por Oficina), evitando repetir la misma jerarquía tres
  // veces y haciendo el reporte mucho más compacto.
  regionOficina: FilaRegionOficina[];
  // Temporalidad por Cliente — tabla independiente (mismas 4 columnas de
  // días + %≤15d, pero agrupado por cliente en vez de región/oficina).
  temporalidadPorCliente: FilaTemporalidad[];
  // Resumen de temporalidad a nivel general, para los KPIs del inicio.
  temporalidadGeneral: Omit<FilaTemporalidad, 'key'> | null;
  // Tendencias mensuales (líneas, no barras) — Efectividad % y
  // Temporalidad % ≤15d, cada una Total / por Cliente (solo si hay más de
  // un cliente en el corte) / por Oficina / por Entidad. Solo se muestran
  // si el corte cubre más de un mes.
  tendencias: {
    volumenTotal: { datos: PuntoTendencia[]; series: string[] };
    volumenCliente: { datos: PuntoTendencia[]; series: string[] } | null;
    volumenOficina: { datos: PuntoTendencia[]; series: string[] };
    volumenEntidad: { datos: PuntoTendencia[]; series: string[] };
    efectividadTotal: { datos: PuntoTendencia[]; series: string[] };
    efectividadCliente: { datos: PuntoTendencia[]; series: string[] } | null;
    efectividadOficina: { datos: PuntoTendencia[]; series: string[] };
    efectividadEntidad: { datos: PuntoTendencia[]; series: string[] };
    temporalidadTotal: { datos: PuntoTendencia[]; series: string[] };
    temporalidadCliente: { datos: PuntoTendencia[]; series: string[] } | null;
    temporalidadOficina: { datos: PuntoTendencia[]; series: string[] };
    temporalidadEntidad: { datos: PuntoTendencia[]; series: string[] };
  };
}

// `ventanaExistente`: mismo propósito que en exportInformeLogisticoPDF —
// reutiliza una ventana ya abierta para que el clic responda de inmediato.
export function exportEfectividadPDF(data: EfectividadExportData, ventanaExistente?: Window | null) {
  const win = ventanaExistente ?? window.open('', '_blank');
  if (!win) {
    alert('Tu navegador bloqueó la ventana de impresión. Habilita pop-ups para este sitio.');
    return;
  }

  const fechaGenerado = new Date().toLocaleString('es-MX', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  function ordenarPorEfectividadEf<T extends { efectividad: number | null }>(lista: T[]): T[] {
    return [...lista].sort((a, b) => {
      if (a.efectividad === null && b.efectividad === null) return 0;
      if (a.efectividad === null) return 1;
      if (b.efectividad === null) return -1;
      return b.efectividad - a.efectividad;
    });
  }

  const tablaEfectividadHtml = (
    titulo: string,
    lista: Array<{ key: string; total: number; efectividad: number | null }>
  ) => `
    <div class="seccion">
      <div class="seccion-titulo">${escapeHtml(titulo)} <span class="conteo">(${lista.length.toLocaleString('es-MX')})</span></div>
      <table>
        <thead>
          <tr><th>${escapeHtml(titulo.replace('Efectividad por ', ''))}</th><th>Total</th><th>Efectividad</th></tr>
        </thead>
        <tbody>
          ${ordenarPorEfectividadEf(lista)
            .map((x) => {
              const color = colorEfectividadInforme(x.efectividad);
              return `<tr><td class="celda-fuerte">${escapeHtml(x.key)}</td><td>${x.total.toLocaleString('es-MX')}</td><td><span style="font-weight:800;color:${color};">${x.efectividad !== null ? `${x.efectividad}%` : '—'}</span></td></tr>`;
            })
            .join('')}
        </tbody>
      </table>
    </div>`;

  const bloqueMesHtml =
    data.porMes.length > 1
      ? `
    <div class="seccion">
      <div class="seccion-titulo">Efectividad por Mes — Tendencia</div>
      <div class="aclaracion">Orden cronológico</div>
      ${lineChartHtml(data.porMes.map((x) => ({ label: x.key, valor: x.efectividad ?? 0 })))}
    </div>`
      : '';

  const comparativoHtml = data.comparativoPlazaCliente
    ? `
    <div class="seccion">
      <div class="seccion-titulo">🔀 Comparativo por Cliente — Efectividad por Plaza (Entidad)</div>
      <table>
        <thead>
          <tr>
            <th>Entidad</th>
            ${data.comparativoPlazaCliente.clientes.map((c) => `<th>${escapeHtml(c)}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${data.comparativoPlazaCliente.filas
            .map(
              (fila) => `
            <tr>
              <td class="celda-fuerte">${escapeHtml(fila.plaza)}</td>
              ${data.comparativoPlazaCliente!.clientes
                .map((c) => {
                  const d = fila.porCliente[c];
                  if (!d || d.total <= 0) return `<td class="celda-vacia">—</td>`;
                  const color =
                    d.efectividad === null ? '#94A3B8' : d.efectividad >= 70 ? '#0B9B67' : d.efectividad >= 50 ? '#EA7C1A' : '#DC2626';
                  return `<td><span style="font-weight:800;color:${color};">${d.efectividad !== null ? `${d.efectividad}%` : '—'}</span> <span class="celda-vol">(${d.total})</span></td>`;
                })
                .join('')}
            </tr>`
            )
            .join('')}
        </tbody>
      </table>
    </div>`
    : '';

  const excPorClienteHtml =
    data.excepcionesPorCliente && data.excepcionesPorCliente.length
      ? `
    <div class="seccion">
      <div class="seccion-titulo">Top 3 Excepciones por Cliente</div>
      <div class="cols-excepciones">
        ${data.excepcionesPorCliente
          .map(
            (c) => `
          <div class="mini-card">
            <div class="mini-card-titulo">${escapeHtml(c.cliente)}</div>
            ${barraHtml(c.items, c.total, '#7C3AED')}
          </div>`
          )
          .join('')}
      </div>
    </div>`
      : '';

  // Mismo motivo que en exportInformeLogisticoPDF: si la ventana ya
  // tenía un placeholder de "Generando…", hay que reabrir el documento
  // antes de escribir para remplazarlo en vez de anexarse después.
  win.document.open();
  win.document.write(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="utf-8"/>
      <title>VIGIA - Reporte de Efectividad</title>
      <style>
        * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; color-adjust: exact; }
        body { font-family: Arial, Helvetica, sans-serif; padding: 22px; color: #1E293B; }
        .header { display: flex; align-items: center; justify-content: space-between; border-bottom: 3px solid #1E3A8A; padding-bottom: 12px; margin-bottom: 14px; }
        .header h1 { font-size: 20px; color: #1E3A8A; margin: 0 0 4px 0; }
        .header .subtitulo { font-size: 13px; color: #64748B; }
        .header .meta { font-size: 11px; color: #64748B; text-align: right; }
        .kpi-grid { display: flex; gap: 10px; margin-bottom: 16px; flex-wrap: wrap; }
        .kpi-card { flex: 1; min-width: 110px; border: 1px solid #E2E8F0; border-radius: 8px; padding: 10px 12px; background: #F8FAFC; }
        .kpi-label { font-size: 10px; font-weight: 700; color: #64748B; margin-bottom: 4px; text-transform: uppercase; }
        .kpi-value { font-size: 20px; font-weight: 800; }
        .seccion { border: 1px solid #E2E8F0; border-radius: 8px; padding: 12px 14px; margin-bottom: 14px; }
        .seccion-titulo { font-size: 13px; font-weight: 800; margin-bottom: 8px; color: #1E293B; }
        .aclaracion { font-size: 10.5px; color: #94A3B8; font-style: italic; margin: -4px 0 8px; }
        .conteo { font-weight: 500; color: #94A3B8; font-size: 11px; }
        .dos-columnas { display: flex; gap: 14px; margin-bottom: 14px; }
        .dos-columnas > .seccion { flex: 1; min-width: 0; margin-bottom: 0; }
        table { width: 100%; border-collapse: collapse; font-size: 11px; }
        th { text-align: left; padding: 5px 8px; background: #F8FAFC; border-bottom: 2px solid #E2E8F0; color: #64748B; font-size: 10px; text-transform: uppercase; }
        td { padding: 4px 8px; border-bottom: 1px solid #F1F5F9; }
        .celda-fuerte { font-weight: 700; }
        .celda-vacia { color: #CBD5E1; }
        .celda-vol { font-size: 9.5px; color: #94A3B8; }
        .cols-excepciones { display: flex; gap: 10px; flex-wrap: wrap; }
        .mini-card { flex: 1; min-width: 180px; border: 1px solid #E2E8F0; border-radius: 6px; padding: 8px 10px; }
        .mini-card-titulo { font-size: 11px; font-weight: 800; margin-bottom: 6px; }
        .barra-fila { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
        .barra-label { font-size: 11px; font-weight: 600; width: 34%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .barra-track { flex: 1; background: #F1F5F9; border-radius: 4px; height: 10px; overflow: hidden; }
        .barra-fill { height: 100%; border-radius: 4px; }
        .barra-valor { font-size: 10.5px; font-weight: 700; width: 22%; text-align: right; white-space: nowrap; }
        .barra-pct { font-weight: 500; color: #94A3B8; }
        .sin-datos { font-size: 11px; color: #94A3B8; padding: 8px 0; }
        .footer { margin-top: 12px; font-size: 10px; color: #94A3B8; text-align: right; }
        .donut-wrap { display: flex; align-items: center; gap: 18px; }
        .donut-svg-wrap { width: 130px; flex-shrink: 0; }
        .donut-svg { width: 100%; height: auto; }
        .donut-leyenda { display: flex; flex-direction: column; gap: 6px; flex: 1; }
        .donut-leyenda-item { display: flex; align-items: center; gap: 6px; font-size: 11.5px; }
        .donut-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
        .donut-leyenda-label { font-weight: 700; flex: 1; }
        .donut-leyenda-valor { color: #64748B; font-size: 11px; }
        .tabla-region-oficina th { position: sticky; top: 0; }
        .fila-region td { background: #F1F5F9; font-weight: 700; border-top: 2px solid #E2E8F0; }
        .fila-oficina td { font-size: 10.5px; color: #475569; padding-left: 16px; }
        /* Evita cortar filas/tarjetas individuales a la mitad, pero SIN
           forzar que el bloque .seccion completo (que puede ser alto,
           como la tabla Región→Oficina o las tendencias) salte entero a
           la siguiente página — eso es lo que dejaba huecos en blanco. */
        .seccion table tr, .kpi-card, .donut-wrap, .barra-fila { break-inside: avoid; page-break-inside: avoid; }
        @media print {
          body { padding: 10mm; }
          @page { size: landscape; margin: 10mm; }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <div>
          <h1>VIGÍA — Reporte de Efectividad</h1>
          <div class="subtitulo">${escapeHtml(data.cliente)} · ${escapeHtml(data.periodoTexto)}</div>
        </div>
        <div class="meta">Generado: ${escapeHtml(fechaGenerado)}<br/>${data.totalGuias.toLocaleString('es-MX')} guías en este corte</div>
      </div>

      <div class="kpi-grid">
        <div class="kpi-card">
          <div class="kpi-label">Guías Procesadas</div>
          <div class="kpi-value" style="color:#1E3A8A;">${data.totalProcesadas.toLocaleString('es-MX')}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Entregadas</div>
          <div class="kpi-value" style="color:#0B9B67;">${data.entregadas.toLocaleString('es-MX')}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Devoluciones</div>
          <div class="kpi-value" style="color:#DC2626;">${data.devoluciones.toLocaleString('es-MX')}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Abiertas</div>
          <div class="kpi-value" style="color:#EA7C1A;">${data.abiertas.toLocaleString('es-MX')}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Pre-Documentadas</div>
          <div class="kpi-value" style="color:#0891B2;">${data.predocumentadas.toLocaleString('es-MX')}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Documentadas</div>
          <div class="kpi-value" style="color:#0891B2;">${data.documentadas.toLocaleString('es-MX')}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Canceladas</div>
          <div class="kpi-value" style="color:#64748B;">${data.canceladas.toLocaleString('es-MX')}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Efectividad General</div>
          <div class="kpi-value" style="color:${
            data.efectividadGeneral === null
              ? '#94A3B8'
              : data.efectividadGeneral >= 70
                ? '#0B9B67'
                : data.efectividadGeneral >= 50
                  ? '#EA7C1A'
                  : '#DC2626'
          };">${data.efectividadGeneral !== null ? `${data.efectividadGeneral}%` : '—'}</div>
        </div>
        ${
          data.temporalidadGeneral
            ? `
        <div class="kpi-card">
          <div class="kpi-label">Doc→Plataforma</div>
          <div class="kpi-value" style="color:#1E3A8A;">${data.temporalidadGeneral.docPlataforma !== null ? `${data.temporalidadGeneral.docPlataforma}d` : '—'}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Plataforma→1ra Ruta</div>
          <div class="kpi-value" style="color:#0B9B67;">${data.temporalidadGeneral.plataformaRuta !== null ? `${data.temporalidadGeneral.plataformaRuta}d` : '—'}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">RecibOf→1ra Ruta</div>
          <div class="kpi-value" style="color:#B45309;">${data.temporalidadGeneral.recibofRuta !== null ? `${data.temporalidadGeneral.recibofRuta}d` : '—'}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Plataforma→Confirmación</div>
          <div class="kpi-value" style="color:#7C3AED;">${data.temporalidadGeneral.plataformaConfirmacion !== null ? `${data.temporalidadGeneral.plataformaConfirmacion}d` : '—'}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">% Dentro de 15 Días</div>
          <div class="kpi-value" style="color:${
            data.temporalidadGeneral.pctVerde === null
              ? '#94A3B8'
              : data.temporalidadGeneral.pctVerde >= 70
                ? '#0B9B67'
                : data.temporalidadGeneral.pctVerde >= 50
                  ? '#EA7C1A'
                  : '#DC2626'
          };">${data.temporalidadGeneral.pctVerde !== null ? `${data.temporalidadGeneral.pctVerde}%` : '—'}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Promedio Vida (Plataf.→Entrega/Retorno)</div>
          <div class="kpi-value" style="color:#0891B2;">${data.temporalidadGeneral.promedioVidaDias !== null ? `${data.temporalidadGeneral.promedioVidaDias}d` : '—'}</div>
        </div>`
            : ''
        }
      </div>

      <div class="seccion">
        <div class="seccion-titulo">Composición del Corte</div>
        ${donutChartHtml(
          [
            { label: 'Entregadas', valor: data.entregadas, color: '#0B9B67' },
            { label: 'Devoluciones', valor: data.devoluciones, color: '#DC2626' },
            { label: 'Abiertas', valor: data.abiertas, color: '#EA7C1A' },
          ],
          {
            valor: data.efectividadGeneral !== null ? `${data.efectividadGeneral}%` : '—',
            subtitulo: 'Efectividad',
          }
        )}
      </div>

      <div class="seccion">
        <div class="seccion-titulo">Tendencia Mensual — Volumen (Guías Procesadas)</div>
        <div class="dos-columnas" style="margin-top:8px;">
          <div>
            <div class="aclaracion">Total</div>
            ${multiLineChartHtml(data.tendencias.volumenTotal.datos, data.tendencias.volumenTotal.series, { autoEscala: true })}
            ${tablaTendenciaHtml(data.tendencias.volumenTotal.datos, data.tendencias.volumenTotal.series, '')}
          </div>
          <div>
            <div class="aclaracion">Por Oficina (Top ${data.tendencias.volumenOficina.series.length})</div>
            ${multiLineChartHtml(data.tendencias.volumenOficina.datos, data.tendencias.volumenOficina.series, { autoEscala: true })}
            ${tablaTendenciaHtml(data.tendencias.volumenOficina.datos, data.tendencias.volumenOficina.series, '')}
          </div>
        </div>
        <div class="dos-columnas" style="margin-top:10px;">
          <div>
            <div class="aclaracion">Por Entidad (Top ${data.tendencias.volumenEntidad.series.length})</div>
            ${multiLineChartHtml(data.tendencias.volumenEntidad.datos, data.tendencias.volumenEntidad.series, { autoEscala: true })}
            ${tablaTendenciaHtml(data.tendencias.volumenEntidad.datos, data.tendencias.volumenEntidad.series, '')}
          </div>
          ${
            data.tendencias.volumenCliente
              ? `
          <div>
            <div class="aclaracion">Por Cliente (Top ${data.tendencias.volumenCliente.series.length})</div>
            ${multiLineChartHtml(data.tendencias.volumenCliente.datos, data.tendencias.volumenCliente.series, { autoEscala: true })}
            ${tablaTendenciaHtml(data.tendencias.volumenCliente.datos, data.tendencias.volumenCliente.series, '')}
          </div>`
              : ''
          }
        </div>
      </div>

      <div class="seccion">
        <div class="seccion-titulo">Tendencia Mensual — Efectividad %</div>
        <div class="dos-columnas" style="margin-top:8px;">
          <div>
            <div class="aclaracion">Total</div>
            ${multiLineChartHtml(data.tendencias.efectividadTotal.datos, data.tendencias.efectividadTotal.series)}
            ${tablaTendenciaHtml(data.tendencias.efectividadTotal.datos, data.tendencias.efectividadTotal.series)}
          </div>
          <div>
            <div class="aclaracion">Por Oficina (Top ${data.tendencias.efectividadOficina.series.length})</div>
            ${multiLineChartHtml(data.tendencias.efectividadOficina.datos, data.tendencias.efectividadOficina.series)}
            ${tablaTendenciaHtml(data.tendencias.efectividadOficina.datos, data.tendencias.efectividadOficina.series)}
          </div>
        </div>
        <div class="dos-columnas" style="margin-top:10px;">
          <div>
            <div class="aclaracion">Por Entidad (Top ${data.tendencias.efectividadEntidad.series.length})</div>
            ${multiLineChartHtml(data.tendencias.efectividadEntidad.datos, data.tendencias.efectividadEntidad.series)}
            ${tablaTendenciaHtml(data.tendencias.efectividadEntidad.datos, data.tendencias.efectividadEntidad.series)}
          </div>
          ${
            data.tendencias.efectividadCliente
              ? `
          <div>
            <div class="aclaracion">Por Cliente (Top ${data.tendencias.efectividadCliente.series.length})</div>
            ${multiLineChartHtml(data.tendencias.efectividadCliente.datos, data.tendencias.efectividadCliente.series)}
            ${tablaTendenciaHtml(data.tendencias.efectividadCliente.datos, data.tendencias.efectividadCliente.series)}
          </div>`
              : ''
          }
        </div>
      </div>

      <div class="seccion">
        <div class="seccion-titulo">Tendencia Mensual — Temporalidad (% Dentro de 15 Días)</div>
        <div class="dos-columnas" style="margin-top:8px;">
          <div>
            <div class="aclaracion">Total</div>
            ${multiLineChartHtml(data.tendencias.temporalidadTotal.datos, data.tendencias.temporalidadTotal.series)}
            ${tablaTendenciaHtml(data.tendencias.temporalidadTotal.datos, data.tendencias.temporalidadTotal.series)}
          </div>
          <div>
            <div class="aclaracion">Por Oficina (Top ${data.tendencias.temporalidadOficina.series.length})</div>
            ${multiLineChartHtml(data.tendencias.temporalidadOficina.datos, data.tendencias.temporalidadOficina.series)}
            ${tablaTendenciaHtml(data.tendencias.temporalidadOficina.datos, data.tendencias.temporalidadOficina.series)}
          </div>
        </div>
        <div class="dos-columnas" style="margin-top:10px;">
          <div>
            <div class="aclaracion">Por Entidad (Top ${data.tendencias.temporalidadEntidad.series.length})</div>
            ${multiLineChartHtml(data.tendencias.temporalidadEntidad.datos, data.tendencias.temporalidadEntidad.series)}
            ${tablaTendenciaHtml(data.tendencias.temporalidadEntidad.datos, data.tendencias.temporalidadEntidad.series)}
          </div>
          ${
            data.tendencias.temporalidadCliente
              ? `
          <div>
            <div class="aclaracion">Por Cliente (Top ${data.tendencias.temporalidadCliente.series.length})</div>
            ${multiLineChartHtml(data.tendencias.temporalidadCliente.datos, data.tendencias.temporalidadCliente.series)}
            ${tablaTendenciaHtml(data.tendencias.temporalidadCliente.datos, data.tendencias.temporalidadCliente.series)}
          </div>`
              : ''
          }
        </div>
      </div>

      ${bloqueRegionOficinaHtml(data.regionOficina)}
      ${bloqueTemporalidadHtml(
        'Temporalidad por Cliente',
        'Días promedio por etapa · % dentro de 15 días desde Plataforma hasta entrega/devolución (abiertas se miden contra hoy)',
        data.temporalidadPorCliente,
        'Cliente'
      )}
      ${tablaEfectividadHtml('Efectividad por Entidad', data.porEntidad)}
      ${bloqueMesHtml}

      ${comparativoHtml}
      ${excPorClienteHtml}

      <div class="dos-columnas">
        <div class="seccion">
          <div class="seccion-titulo">Top Excepciones</div>
          ${barraHtml(data.topExcepciones, data.totalConExcepcion, '#7C3AED')}
        </div>
        <div class="seccion">
          <div class="seccion-titulo">Devoluciones — Top Motivo</div>
          ${barraHtml(data.devolucionesPorMotivo, data.totalDevoluciones, '#EA7C1A')}
        </div>
      </div>

      <div class="seccion">
        <div class="seccion-titulo">Devoluciones — Top Oficina Destino</div>
        ${barraHtml(data.devolucionesPorOficina, data.totalDevoluciones, '#DC2626')}
      </div>

      <div class="footer">VIGÍA — Panel de Control Operativo · AFIMEX</div>

      <script>
        window.onload = function() { window.print(); };
      </script>
    </body>
    </html>
  `);
  win.document.close();
}

// ============================================================
// REPORTE EJECUTIVO CONSOLIDADO (agregado ago-2026): combina en un solo
// PDF piezas de Resumen, Efectividad, Abiertas y Excepciones que antes
// solo vivían repartidas en sus módulos/reportes individuales — pensado
// para una vista integral de un vistazo, sin tener que abrir cada módulo
// por separado. Reutiliza las mismas funciones/estilos ya usados en el
// Informe Logístico y el Reporte de Efectividad.
// ============================================================

// Resumen de Guías Abiertas / Retornos Abiertos pivotado: filas = Región
// → Oficina (jerárquico, igual que bloqueRegionOficinaHtml), columnas =
// Estado de Guía. Reemplaza la versión plana (una fila por combinación
// única de región+oficina+estado, que con muchas oficinas/estados podía
// ser larguísima) — al usar Estado como columna en vez de fila, el
// número de FILAS baja a (regiones + oficinas), sin perder ningún dato.
export interface FilaOficinaPorEstado {
  oficina: string;
  total: number;
  porEstado: Record<string, number>;
}
export interface FilaRegionPorEstado {
  region: string;
  total: number;
  oficinas: FilaOficinaPorEstado[];
}
export interface ResumenAbiertasPorEstado {
  regiones: FilaRegionPorEstado[];
  estados: string[]; // columnas, en el orden en que deben mostrarse
}

export interface ReporteConsolidadoData {
  cliente: string;
  periodoTexto: string;
  totalGuias: number;

  // 1) KPIs del módulo Resumen
  kpisResumen: {
    totalProcesadas: number;
    entregadas: number;
    devoluciones: number;
    guiasDeRetorno: number;
    posibleRetornoOtroPeriodo: number;
    abiertas: number;
    retornosAbiertos: number;
    efectividad: number | null;
    predoc: number;
    documentadas: number;
    canceladas: number;
  };

  // 2) KPIs de Temporalidad (resumen general del corte)
  temporalidadGeneral: Omit<FilaTemporalidad, 'key'> | null;

  // 3) Tendencias mensuales (Total) — Volumen, Efectividad, Temporalidad
  tendenciaVolumen: { datos: PuntoTendencia[]; series: string[] };
  tendenciaEfectividad: { datos: PuntoTendencia[]; series: string[] };
  tendenciaTemporalidad: { datos: PuntoTendencia[]; series: string[] };

  // 4) Efectividad + Temporalidad por Región → Oficina
  regionOficina: FilaRegionOficina[];

  // 5) Efectividad + Temporalidad por Cliente
  porCliente: FilaEfectividadTemporalidad[];

  // 6) Resumen de Guías Abiertas (Región → Oficina, columnas = Estado) +
  // subtabla por Ciclo (etapa del pipeline)
  resumenGuiasAbiertas: ResumenAbiertasPorEstado;
  abiertasPorCiclo: Array<{ key: string; count: number }>;
  totalAbiertas: number;

  // 7) Resumen de Retornos Abiertos (Región → Oficina, columnas = Estado)
  resumenRetornosAbiertos: ResumenAbiertasPorEstado;

  // 8) KPIs de Excepciones (Top)
  topExcepciones: Array<{ key: string; count: number }>;
  totalConExcepcion: number;
}

// Tabla plana Efectividad + Temporalidad por Cliente (sin jerarquía,
// a diferencia de bloqueRegionOficinaHtml que sí tiene Región→Oficina).
function bloqueEfectividadTemporalidadPlanoHtml(
  titulo: string,
  lista: FilaEfectividadTemporalidad[],
  etiquetaColumna: string
): string {
  if (!lista.length) {
    return `
    <div class="seccion">
      <div class="seccion-titulo">${escapeHtml(titulo)}</div>
      <div class="sin-datos">Sin datos para este corte</div>
    </div>`;
  }
  const fmtDias = (n: number | null) => (n !== null ? `${n}d` : '—');
  const filaEfectividad = (f: FilaEfectividadTemporalidad) => {
    const color = colorEfectividadInforme(f.efectividad);
    return `<span style="font-weight:800;color:${color};">${f.efectividad !== null ? `${f.efectividad}%` : '—'}</span>`;
  };
  const filaPct15 = (f: FilaEfectividadTemporalidad) => {
    const color = f.pctVerde === null ? '#94A3B8' : f.pctVerde >= 70 ? '#0B9B67' : f.pctVerde >= 50 ? '#EA7C1A' : '#DC2626';
    return `<span style="font-weight:800;color:${color};">${f.pctVerde !== null ? `${f.pctVerde}%` : '—'}</span>`;
  };
  const filas = lista
    .map(
      (f) => `
    <tr>
      <td class="celda-fuerte">${escapeHtml(f.key)}</td>
      <td>${f.total.toLocaleString('es-MX')}</td>
      <td>${filaEfectividad(f)}</td>
      <td>${fmtDias(f.docPlataforma)}</td>
      <td>${fmtDias(f.plataformaRuta)}</td>
      <td>${fmtDias(f.recibofRuta)}</td>
      <td>${fmtDias(f.plataformaConfirmacion)}</td>
      <td>${filaPct15(f)}</td>
    </tr>`
    )
    .join('');
  return `
    <div class="seccion">
      <div class="seccion-titulo">${escapeHtml(titulo)}</div>
      <div class="aclaracion">% ≤15d: dentro de 15 días desde Plataforma hasta entrega/devolución (abiertas se miden contra hoy)</div>
      <table>
        <thead>
          <tr>
            <th>${escapeHtml(etiquetaColumna)}</th>
            <th>Total</th>
            <th>Efect.</th>
            <th>Doc→Plataf.</th>
            <th>Plataf.→1ra Ruta</th>
            <th>RecibOf→1ra Ruta</th>
            <th>Plataf.→Confirm.</th>
            <th>% ≤15d</th>
          </tr>
        </thead>
        <tbody>${filas}</tbody>
      </table>
    </div>`;
}

// Tabla pivotada Región → Oficina (filas, jerárquico) × Estado (columnas)
// — mismo estilo visual que bloqueRegionOficinaHtml, para que se vea
// consistente con el resto del reporte.
function tablaResumenAbiertasHtml(titulo: string, data: ResumenAbiertasPorEstado): string {
  if (!data.regiones.length) {
    return `
    <div class="seccion">
      <div class="seccion-titulo">${escapeHtml(titulo)} <span class="conteo">(0)</span></div>
      <div class="sin-datos">Sin guías para este corte</div>
    </div>`;
  }
  const totalGuias = data.regiones.reduce((s, r) => s + r.total, 0);
  const filasHtml = data.regiones
    .map((r) => {
      const filaRegion = `
        <tr class="fila-region">
          <td class="celda-fuerte">${escapeHtml(r.region)}</td>
          ${data.estados.map(() => '<td></td>').join('')}
          <td class="celda-fuerte">${r.total.toLocaleString('es-MX')}</td>
        </tr>`;
      const filasOficina = r.oficinas
        .map(
          (o) => `
        <tr class="fila-oficina">
          <td>↳ ${escapeHtml(o.oficina)}</td>
          ${data.estados.map((e) => `<td>${(o.porEstado[e] || 0).toLocaleString('es-MX')}</td>`).join('')}
          <td style="font-weight:700;">${o.total.toLocaleString('es-MX')}</td>
        </tr>`
        )
        .join('');
      return filaRegion + filasOficina;
    })
    .join('');

  return `
    <div class="seccion">
      <div class="seccion-titulo">${escapeHtml(titulo)} <span class="conteo">(${totalGuias.toLocaleString('es-MX')} guías)</span></div>
      <table class="tabla-region-oficina">
        <thead>
          <tr>
            <th>Región / Oficina</th>
            ${data.estados.map((e) => `<th>${escapeHtml(e)}</th>`).join('')}
            <th>Total</th>
          </tr>
        </thead>
        <tbody>${filasHtml}</tbody>
      </table>
    </div>`;
}

export function exportReporteConsolidadoPDF(data: ReporteConsolidadoData, ventanaExistente?: Window | null) {
  const win = ventanaExistente ?? window.open('', '_blank');
  if (!win) {
    alert('Tu navegador bloqueó la ventana de impresión. Habilita pop-ups para este sitio.');
    return;
  }

  const fechaGenerado = new Date().toLocaleString('es-MX', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const k = data.kpisResumen;
  const kpiCardsResumen = [
    { label: 'Guías Procesadas', value: k.totalProcesadas.toLocaleString('es-MX'), color: '#1E3A8A' },
    { label: 'Entregadas', value: k.entregadas.toLocaleString('es-MX'), color: '#0B9B67' },
    { label: 'Devoluciones', value: k.devoluciones.toLocaleString('es-MX'), color: '#DC2626' },
    { label: 'Guías de Retorno', value: k.guiasDeRetorno.toLocaleString('es-MX'), color: '#7C3AED' },
    { label: 'Posible Retorno (Otro Periodo)', value: k.posibleRetornoOtroPeriodo.toLocaleString('es-MX'), color: '#B45309' },
    { label: 'Abiertas', value: k.abiertas.toLocaleString('es-MX'), color: '#EA7C1A' },
    { label: 'Retornos Abiertos', value: k.retornosAbiertos.toLocaleString('es-MX'), color: '#7C3AED' },
    {
      label: 'Efectividad',
      value: k.efectividad !== null ? `${k.efectividad}%` : '—',
      color: k.efectividad === null ? '#94A3B8' : k.efectividad >= 70 ? '#0B9B67' : k.efectividad >= 50 ? '#EA7C1A' : '#DC2626',
    },
    { label: 'Pre-Documentadas', value: k.predoc.toLocaleString('es-MX'), color: '#0891B2' },
    { label: 'Documentadas', value: k.documentadas.toLocaleString('es-MX'), color: '#0891B2' },
    { label: 'Canceladas', value: k.canceladas.toLocaleString('es-MX'), color: '#64748B' },
  ]
    .map(
      (c) => `
      <div class="kpi-card">
        <div class="kpi-label">${escapeHtml(c.label)}</div>
        <div class="kpi-value" style="color:${c.color};">${c.value}</div>
      </div>`
    )
    .join('');

  const t = data.temporalidadGeneral;
  const kpiCardsTemporalidad = t
    ? [
        { label: 'Doc→Plataforma', value: t.docPlataforma !== null ? `${t.docPlataforma}d` : '—', color: '#1E3A8A' },
        { label: 'Plataforma→1ra Ruta', value: t.plataformaRuta !== null ? `${t.plataformaRuta}d` : '—', color: '#0B9B67' },
        { label: 'RecibOf→1ra Ruta', value: t.recibofRuta !== null ? `${t.recibofRuta}d` : '—', color: '#B45309' },
        { label: 'Plataforma→Confirmación', value: t.plataformaConfirmacion !== null ? `${t.plataformaConfirmacion}d` : '—', color: '#7C3AED' },
        {
          label: '% Dentro de 15 Días',
          value: t.pctVerde !== null ? `${t.pctVerde}%` : '—',
          color: t.pctVerde === null ? '#94A3B8' : t.pctVerde >= 70 ? '#0B9B67' : t.pctVerde >= 50 ? '#EA7C1A' : '#DC2626',
        },
        { label: 'Promedio Vida (Plataf.→Entrega/Retorno)', value: t.promedioVidaDias !== null ? `${t.promedioVidaDias}d` : '—', color: '#0891B2' },
      ]
        .map(
          (c) => `
      <div class="kpi-card">
        <div class="kpi-label">${escapeHtml(c.label)}</div>
        <div class="kpi-value" style="color:${c.color};">${c.value}</div>
      </div>`
        )
        .join('')
    : '<div class="sin-datos">Sin datos de temporalidad para este corte</div>';

  // Mismo motivo que en los otros reportes: si la ventana ya tenía un
  // placeholder de "Generando…", hay que reabrir el documento antes de
  // escribir para remplazarlo en vez de anexarse después.
  win.document.open();
  win.document.write(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="utf-8"/>
      <title>VIGIA - Reporte Ejecutivo Consolidado</title>
      <style>
        * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; color-adjust: exact; }
        body { font-family: Arial, Helvetica, sans-serif; padding: 22px; color: #1E293B; }
        .header { display: flex; align-items: center; justify-content: space-between; border-bottom: 3px solid #1E3A8A; padding-bottom: 12px; margin-bottom: 14px; }
        .header h1 { font-size: 20px; color: #1E3A8A; margin: 0 0 4px 0; }
        .header .subtitulo { font-size: 13px; color: #64748B; }
        .header .meta { font-size: 11px; color: #64748B; text-align: right; }
        .kpi-grid { display: flex; gap: 10px; margin-bottom: 16px; flex-wrap: wrap; }
        .kpi-card { flex: 1; min-width: 110px; border: 1px solid #E2E8F0; border-radius: 8px; padding: 10px 12px; background: #F8FAFC; }
        .kpi-label { font-size: 10px; font-weight: 700; color: #64748B; margin-bottom: 4px; text-transform: uppercase; }
        .kpi-value { font-size: 20px; font-weight: 800; }
        .seccion { border: 1px solid #E2E8F0; border-radius: 8px; padding: 12px 14px; margin-bottom: 14px; }
        .seccion-titulo { font-size: 15px; font-weight: 800; margin: 18px 0 8px; color: #1E3A8A; border-top: 2px solid #E2E8F0; padding-top: 14px; }
        .seccion .seccion-titulo:first-child, .seccion > .seccion-titulo:first-of-type { border-top: none; padding-top: 0; margin-top: 0; font-size: 13px; color: #1E293B; }
        .aclaracion { font-size: 10.5px; color: #94A3B8; font-style: italic; margin: -4px 0 8px; }
        .conteo { font-weight: 500; color: #94A3B8; font-size: 11px; }
        .dos-columnas { display: flex; gap: 14px; margin-bottom: 14px; }
        .dos-columnas > .seccion { flex: 1; min-width: 0; margin-bottom: 0; }
        .tres-columnas { display: flex; gap: 14px; margin-bottom: 14px; }
        .tres-columnas > .seccion { flex: 1; min-width: 0; margin-bottom: 0; }
        table { width: 100%; border-collapse: collapse; font-size: 11px; }
        th { text-align: left; padding: 5px 8px; background: #F8FAFC; border-bottom: 2px solid #E2E8F0; color: #64748B; font-size: 10px; text-transform: uppercase; position: sticky; top: 0; }
        td { padding: 4px 8px; border-bottom: 1px solid #F1F5F9; }
        .celda-fuerte { font-weight: 700; }
        .celda-vacia { color: #CBD5E1; }
        .celda-vol { font-size: 9.5px; color: #94A3B8; }
        .barra-fila { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
        .barra-label { font-size: 11px; font-weight: 600; width: 34%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .barra-track { flex: 1; background: #F1F5F9; border-radius: 4px; height: 10px; overflow: hidden; }
        .barra-fill { height: 100%; border-radius: 4px; }
        .barra-valor { font-size: 10.5px; font-weight: 700; width: 22%; text-align: right; white-space: nowrap; }
        .barra-pct { font-weight: 500; color: #94A3B8; }
        .sin-datos { font-size: 11px; color: #94A3B8; padding: 8px 0; }
        .footer { margin-top: 12px; font-size: 10px; color: #94A3B8; text-align: right; }
        .donut-wrap { display: flex; align-items: center; gap: 18px; }
        .donut-leyenda { display: flex; flex-direction: column; gap: 6px; flex: 1; }
        .donut-leyenda-item { display: flex; align-items: center; gap: 6px; font-size: 11.5px; }
        .donut-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
        .donut-leyenda-label { font-weight: 700; flex: 1; }
        .donut-leyenda-valor { color: #64748B; font-size: 11px; }
        .tabla-region-oficina th { position: sticky; top: 0; }
        .fila-region td { background: #F1F5F9; font-weight: 700; border-top: 2px solid #E2E8F0; }
        .fila-oficina td { font-size: 10.5px; color: #475569; padding-left: 16px; }
        .seccion table tr, .kpi-card, .donut-wrap, .barra-fila { break-inside: avoid; page-break-inside: avoid; }
        @media print {
          body { padding: 10mm; }
          @page { size: landscape; margin: 10mm; }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <div>
          <h1>VIGÍA — Reporte Ejecutivo Consolidado</h1>
          <div class="subtitulo">${escapeHtml(data.cliente)} · ${escapeHtml(data.periodoTexto)}</div>
        </div>
        <div class="meta">Generado: ${escapeHtml(fechaGenerado)}<br/>${data.totalGuias.toLocaleString('es-MX')} guías en este corte</div>
      </div>

      <div class="seccion-titulo" style="margin-top:0;border-top:none;padding-top:0;">1. KPIs — Resumen</div>
      <div class="kpi-grid">${kpiCardsResumen}</div>

      <div class="seccion-titulo">2. KPIs — Temporalidad</div>
      <div class="kpi-grid">${kpiCardsTemporalidad}</div>

      <div class="seccion-titulo">3. Tendencias Mensuales (Total)</div>
      <div class="tres-columnas">
        <div class="seccion">
          <div class="seccion-titulo" style="margin:0;border:none;padding:0;font-size:12px;">Volumen (Guías Procesadas)</div>
          ${multiLineChartHtml(data.tendenciaVolumen.datos, data.tendenciaVolumen.series, { autoEscala: true })}
          ${tablaTendenciaHtml(data.tendenciaVolumen.datos, data.tendenciaVolumen.series, '')}
        </div>
        <div class="seccion">
          <div class="seccion-titulo" style="margin:0;border:none;padding:0;font-size:12px;">Efectividad %</div>
          ${multiLineChartHtml(data.tendenciaEfectividad.datos, data.tendenciaEfectividad.series)}
          ${tablaTendenciaHtml(data.tendenciaEfectividad.datos, data.tendenciaEfectividad.series)}
        </div>
        <div class="seccion">
          <div class="seccion-titulo" style="margin:0;border:none;padding:0;font-size:12px;">Temporalidad — % ≤15 Días</div>
          ${multiLineChartHtml(data.tendenciaTemporalidad.datos, data.tendenciaTemporalidad.series)}
          ${tablaTendenciaHtml(data.tendenciaTemporalidad.datos, data.tendenciaTemporalidad.series)}
        </div>
      </div>

      <div class="seccion-titulo">4. Efectividad y Temporalidad — Región → Oficina</div>
      ${bloqueRegionOficinaHtml(data.regionOficina)}

      <div class="seccion-titulo">5. Efectividad y Temporalidad — Por Cliente</div>
      ${bloqueEfectividadTemporalidadPlanoHtml('Por Cliente', data.porCliente, 'Cliente')}

      <div class="seccion-titulo">6. Resumen de Guías Abiertas</div>
      ${tablaResumenAbiertasHtml('Guías Abiertas — Región / Oficina / Estado', data.resumenGuiasAbiertas)}
      <div class="seccion">
        <div class="seccion-titulo" style="margin:0;border:none;padding:0;font-size:12px;">Guías Abiertas por Ciclo (etapa del proceso)</div>
        ${barraHtml(data.abiertasPorCiclo, data.totalAbiertas, '#1E3A8A')}
      </div>

      <div class="seccion-titulo">7. Resumen de Retornos Abiertos</div>
      ${tablaResumenAbiertasHtml('Retornos Abiertos — Región / Oficina / Estado', data.resumenRetornosAbiertos)}

      <div class="seccion-titulo">8. Excepciones — Top</div>
      <div class="seccion">
        ${barraHtml(data.topExcepciones, data.totalConExcepcion, '#7C3AED')}
      </div>

      <div class="footer">VIGÍA — Panel de Control Operativo · AFIMEX</div>

      <script>
        window.onload = function() { window.print(); };
      </script>
    </body>
    </html>
  `);
  win.document.close();
}

// ============================================================
// REPORTE SIMPLIFICADO PARA DIRECCIÓN (rediseñado ago-2026): no es solo
// un resumen de conteos — busca responder "¿dónde está el problema y
// cómo va la tendencia?", con datos ya cruzados (oficinas por
// efectividad+volumen, excepciones por cliente, comparativo mes a mes) y
// un resumen de hallazgos generado a partir de esos mismos datos. Sigue
// siendo compacto (1-2 páginas) — el detalle completo por región/
// oficina/cliente vive en el Reporte Ejecutivo Consolidado.
// ============================================================
export interface FilaOficinaAtencion {
  oficina: string;
  total: number;
  efectividad: number | null;
}

export interface FilaOficinaCritica {
  oficina: string;
  abiertas: number;
  criticas: number; // en seguimiento ROJO (5+ días sin movimiento)
  promedioDias: number | null;
}

export interface FilaComparativoMes {
  mes: string; // 'YYYY-MM'
  efectividad: number | null;
}

export interface FilaExcepcionPorCliente {
  cliente: string;
  excepcion: string;
  cantidad: number;
  totalConExcepcion: number;
}

export interface FilaParetoOficina {
  oficina: string;
  valor: number;
  pctDelTotal: number;
  pctAcumulado: number;
}

export interface ResumenPareto {
  filas: FilaParetoOficina[]; // solo las oficinas dentro del 80% acumulado
  totalOficinas: number; // total de oficinas con datos, para sacar el %
  pctOficinas: number; // qué % de oficinas representa ese 80%
}

export interface FilaComparativoRegion {
  region: string;
  total: number;
  efectividad: number | null;
  pctDentroDe15Dias: number | null;
}

export interface FilaComparativoMetrica {
  mes: string;
  valor: number | null;
}

// Matriz compacta para comparativos por cliente: filas = cliente,
// columnas = mes (mismo orden para todas las filas) — así se ve todo en
// una sola tabla en vez de una tabla separada por cliente.
export interface ComparativoPorCliente {
  meses: string[]; // 'YYYY-MM', en orden
  filas: Array<{ cliente: string; valores: Array<number | null> }>; // valores[i] corresponde a meses[i]
}

export interface FilaAbiertasPorOficina {
  oficina: string;
  region: string;
  total: number;
  cicloDominante: string;
  cantidadEnCiclo: number;
}

// Retornos abiertos en seguimiento crítico (Rojo, 5+ días), por Oficina
// o Concesionario (con Región para distinguirlos) — incluye el Ciclo
// (etapa del pipeline) donde se concentran, distinto de "Oficinas
// Críticas" (que es sobre guías ORIGINALES, no retornos).
export interface FilaRetornoCritico {
  oficina: string;
  region: string;
  retornosAbiertos: number;
  criticos: number; // en seguimiento ROJO (5+ días)
  cicloDominante: string;
}

export interface ReporteSimplificadoData {
  cliente: string;
  periodoTexto: string;
  totalGuias: number;

  kpis: {
    totalProcesadas: number;
    entregadas: number;
    devoluciones: number;
    abiertas: number;
    efectividad: number | null;
    pctDentroDe15Dias: number | null;
  };

  // Oficinas que requieren atención: ranking por volumen × (100-efectividad),
  // para priorizar las que más pesan, no solo las de peor %. Mínimo 5.
  oficinasAtencion: FilaOficinaAtencion[];
  // Igual, pero acotado a la Región CONCESIONARIOS específicamente.
  concesionariosAtencion: FilaOficinaAtencion[];

  // Oficinas críticas por guías abiertas: más guías en seguimiento
  // crítico (Rojo, 5+ días sin movimiento).
  oficinasCriticas: FilaOficinaCritica[];
  // Igual, pero acotado a la Región CONCESIONARIOS específicamente.
  concesionariosCriticos: FilaOficinaCritica[];

  // Top oficinas/concesionarios por VOLUMEN de guías abiertas (no solo
  // las críticas), con el Ciclo (etapa del pipeline) donde se concentran.
  topAbiertasPorOficina: FilaAbiertasPorOficina[];

  // Retornos abiertos en seguimiento crítico (Rojo), por Oficina/
  // Concesionario y su Ciclo dominante — distinto de oficinasCriticas
  // (que es sobre guías originales).
  retornosCriticosPorOficina: FilaRetornoCritico[];

  // Comparativo mes a mes (Total, período completo del corte, sin
  // importar el filtro de Periodo activo).
  comparativoVolumen: FilaComparativoMetrica[];
  comparativoEfectividad: FilaComparativoMes[];
  comparativoTemporalidad: FilaComparativoMetrica[];

  // Mismos 3 comparativos, desglosados por Cliente (null si el corte
  // tiene un solo cliente — sería idéntico al Total).
  comparativoVolumenPorCliente: ComparativoPorCliente | null;
  comparativoEfectividadPorCliente: ComparativoPorCliente | null;
  comparativoTemporalidadPorCliente: ComparativoPorCliente | null;

  // Comparativo general por Región — efectividad y temporalidad juntas.
  comparativoRegion: FilaComparativoRegion[];

  // Regla 80/20: qué oficinas concentran el 80% del volumen total, y
  // qué oficinas concentran el 80% de las guías "no efectivas"
  // (devoluciones + abiertas) — para ver si el problema está repartido
  // parejo o concentrado en pocos lugares.
  paretoVolumen: ResumenPareto;
  paretoNoEfectivas: ResumenPareto;

  // Top excepción de cada cliente (no el top general — el principal
  // problema DE CADA cliente, para ver si distintos clientes tienen
  // distintos tipos de problema).
  topExcepcionesPorCliente: FilaExcepcionPorCliente[];

  // Hallazgos / desviaciones generados automáticamente a partir de los
  // datos de arriba — frases breves, no un análisis exhaustivo.
  hallazgos: string[];

  retornosAbiertos: number;
  pendientes30Mas: number;
}

function colorEfectividadSimplificado(valor: number | null): string {
  if (valor === null) return '#94A3B8';
  if (valor >= 70) return '#0B9B67';
  if (valor >= 50) return '#EA7C1A';
  return '#DC2626';
}

export function exportReporteSimplificadoPDF(data: ReporteSimplificadoData, ventanaExistente?: Window | null) {
  const win = ventanaExistente ?? window.open('', '_blank');
  if (!win) {
    alert('Tu navegador bloqueó la ventana de impresión. Habilita pop-ups para este sitio.');
    return;
  }

  const fechaGenerado = new Date().toLocaleString('es-MX', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const k = data.kpis;
  const kpiCards = [
    { label: 'Guías Procesadas', value: k.totalProcesadas.toLocaleString('es-MX'), color: '#1E3A8A' },
    { label: 'Entregadas', value: k.entregadas.toLocaleString('es-MX'), color: '#0B9B67' },
    { label: 'Devoluciones', value: k.devoluciones.toLocaleString('es-MX'), color: '#DC2626' },
    { label: 'Abiertas', value: k.abiertas.toLocaleString('es-MX'), color: '#EA7C1A' },
    { label: 'Efectividad', value: k.efectividad !== null ? `${k.efectividad}%` : '—', color: colorEfectividadSimplificado(k.efectividad) },
    {
      label: '% Dentro de 15 Días',
      value: k.pctDentroDe15Dias !== null ? `${k.pctDentroDe15Dias}%` : '—',
      color: colorEfectividadSimplificado(k.pctDentroDe15Dias),
    },
  ]
    .map(
      (c) => `
      <div class="kpi-card">
        <div class="kpi-label">${escapeHtml(c.label)}</div>
        <div class="kpi-value" style="color:${c.color};">${c.value}</div>
      </div>`
    )
    .join('');

  const etiquetaMes = (mes: string) => {
    const [anio, m] = mes.split('-');
    return anio && m ? `${m}/${anio.slice(2)}` : mes;
  };

  const tablaAtencionHtml = (lista: FilaOficinaAtencion[], vacioTexto: string) =>
    lista.length
      ? `
    <table>
      <thead><tr><th>Oficina</th><th>Volumen</th><th>Efectividad</th></tr></thead>
      <tbody>
        ${lista
          .map(
            (o) => `
          <tr>
            <td class="celda-fuerte">${escapeHtml(o.oficina)}</td>
            <td>${o.total.toLocaleString('es-MX')}</td>
            <td><span style="font-weight:800;color:${colorEfectividadSimplificado(o.efectividad)};">${
              o.efectividad !== null ? `${o.efectividad}%` : '—'
            }</span></td>
          </tr>`
          )
          .join('')}
      </tbody>
    </table>`
      : `<div class="sin-datos">${escapeHtml(vacioTexto)}</div>`;

  const tablaOficinasAtencion = tablaAtencionHtml(data.oficinasAtencion, 'Sin datos suficientes para este corte');
  const tablaConcesionariosAtencion = tablaAtencionHtml(data.concesionariosAtencion, 'Sin oficinas de Concesionarios en este corte');

  const tablaOficinasCriticasHtml = (lista: FilaOficinaCritica[]) =>
    lista.length
      ? `
    <table>
      <thead><tr><th>Oficina</th><th>Abiertas</th><th>Críticas (5+d)</th><th>Prom. Días</th></tr></thead>
      <tbody>
        ${lista
          .map(
            (o) => `
          <tr>
            <td class="celda-fuerte">${escapeHtml(o.oficina)}</td>
            <td>${o.abiertas.toLocaleString('es-MX')}</td>
            <td><span style="font-weight:800;color:#DC2626;">${o.criticas.toLocaleString('es-MX')}</span></td>
            <td>${o.promedioDias !== null ? `${o.promedioDias}d` : '—'}</td>
          </tr>`
          )
          .join('')}
      </tbody>
    </table>`
      : '<div class="sin-datos">Sin guías en seguimiento crítico</div>';
  const tablaOficinasCriticas = tablaOficinasCriticasHtml(data.oficinasCriticas);
  const tablaConcesionariosCriticos = tablaOficinasCriticasHtml(data.concesionariosCriticos);

  const tablaTopAbiertasPorOficina = data.topAbiertasPorOficina.length
    ? `
    <table>
      <thead><tr><th>Oficina</th><th>Región</th><th>Abiertas</th><th>Ciclo Dominante</th></tr></thead>
      <tbody>
        ${data.topAbiertasPorOficina
          .map(
            (o) => `
          <tr>
            <td class="celda-fuerte">${escapeHtml(o.oficina)}</td>
            <td>${escapeHtml(o.region)}</td>
            <td>${o.total.toLocaleString('es-MX')}</td>
            <td>${escapeHtml(o.cicloDominante)} <span style="color:#94A3B8;">(${o.cantidadEnCiclo.toLocaleString('es-MX')})</span></td>
          </tr>`
          )
          .join('')}
      </tbody>
    </table>`
    : '<div class="sin-datos">Sin guías abiertas en este corte</div>';

  const tablaRetornosCriticosPorOficina = data.retornosCriticosPorOficina.length
    ? `
    <table>
      <thead><tr><th>Oficina</th><th>Región</th><th>Retornos Abiertos</th><th>Críticos (5+d)</th><th>Ciclo Dominante</th></tr></thead>
      <tbody>
        ${data.retornosCriticosPorOficina
          .map(
            (o) => `
          <tr>
            <td class="celda-fuerte">${escapeHtml(o.oficina)}</td>
            <td>${escapeHtml(o.region)}</td>
            <td>${o.retornosAbiertos.toLocaleString('es-MX')}</td>
            <td><span style="font-weight:800;color:#DC2626;">${o.criticos.toLocaleString('es-MX')}</span></td>
            <td>${escapeHtml(o.cicloDominante)}</td>
          </tr>`
          )
          .join('')}
      </tbody>
    </table>`
    : '<div class="sin-datos">Sin retornos en seguimiento crítico</div>';

  const tablaComparativo = data.comparativoEfectividad.length
    ? `
    <table>
      <thead><tr><th>Mes</th><th>Efectividad</th><th>vs. Mes Anterior</th></tr></thead>
      <tbody>
        ${data.comparativoEfectividad
          .map((f, i) => {
            const anterior = i > 0 ? data.comparativoEfectividad[i - 1].efectividad : null;
            const delta = f.efectividad !== null && anterior !== null ? Number((f.efectividad - anterior).toFixed(1)) : null;
            const deltaTxt =
              delta === null ? '—' : delta === 0 ? 'Sin cambio' : `${delta > 0 ? '▲' : '▼'} ${Math.abs(delta)} pts`;
            const deltaColor = delta === null ? '#94A3B8' : delta > 0 ? '#0B9B67' : delta < 0 ? '#DC2626' : '#94A3B8';
            return `
          <tr>
            <td class="celda-fuerte">${escapeHtml(etiquetaMes(f.mes))}</td>
            <td><span style="font-weight:800;color:${colorEfectividadSimplificado(f.efectividad)};">${
              f.efectividad !== null ? `${f.efectividad}%` : '—'
            }</span></td>
            <td style="color:${deltaColor};font-weight:700;">${deltaTxt}</td>
          </tr>`;
          })
          .join('')}
      </tbody>
    </table>`
    : '<div class="sin-datos">Se necesita más de un mes para comparar</div>';

  const tablaComparativoTemporalidad = data.comparativoTemporalidad.length
    ? `
    <table>
      <thead><tr><th>Mes</th><th>% Dentro de 15 Días</th><th>vs. Mes Anterior</th></tr></thead>
      <tbody>
        ${data.comparativoTemporalidad
          .map((f, i) => {
            const anterior = i > 0 ? data.comparativoTemporalidad[i - 1].valor : null;
            const delta = f.valor !== null && anterior !== null ? Number((f.valor - anterior).toFixed(1)) : null;
            const deltaTxt =
              delta === null ? '—' : delta === 0 ? 'Sin cambio' : `${delta > 0 ? '▲' : '▼'} ${Math.abs(delta)} pts`;
            const deltaColor = delta === null ? '#94A3B8' : delta > 0 ? '#0B9B67' : delta < 0 ? '#DC2626' : '#94A3B8';
            return `
          <tr>
            <td class="celda-fuerte">${escapeHtml(etiquetaMes(f.mes))}</td>
            <td><span style="font-weight:800;color:${colorEfectividadSimplificado(f.valor)};">${
              f.valor !== null ? `${f.valor}%` : '—'
            }</span></td>
            <td style="color:${deltaColor};font-weight:700;">${deltaTxt}</td>
          </tr>`;
          })
          .join('')}
      </tbody>
    </table>`
    : '<div class="sin-datos">Se necesita más de un mes para comparar</div>';

  const tablaComparativoVolumen = data.comparativoVolumen.length
    ? `
    <table>
      <thead><tr><th>Mes</th><th>Guías Procesadas</th><th>vs. Mes Anterior</th></tr></thead>
      <tbody>
        ${data.comparativoVolumen
          .map((f, i) => {
            const anterior = i > 0 ? data.comparativoVolumen[i - 1].valor : null;
            const delta = f.valor !== null && anterior !== null ? f.valor - anterior : null;
            const deltaTxt = delta === null ? '—' : delta === 0 ? 'Sin cambio' : `${delta > 0 ? '▲' : '▼'} ${Math.abs(delta).toLocaleString('es-MX')}`;
            const deltaColor = delta === null ? '#94A3B8' : delta > 0 ? '#0B9B67' : delta < 0 ? '#DC2626' : '#94A3B8';
            return `
          <tr>
            <td class="celda-fuerte">${escapeHtml(etiquetaMes(f.mes))}</td>
            <td style="font-weight:800;">${f.valor !== null ? f.valor.toLocaleString('es-MX') : '—'}</td>
            <td style="color:${deltaColor};font-weight:700;">${deltaTxt}</td>
          </tr>`;
          })
          .join('')}
      </tbody>
    </table>`
    : '<div class="sin-datos">Se necesita más de un mes para comparar</div>';

  // Matriz compacta filas=cliente / columnas=mes, reusada para los 3
  // comparativos por cliente (Volumen, Efectividad, Temporalidad).
  const tablaComparativoPorClienteHtml = (comp: ComparativoPorCliente | null, sufijo: string, esVolumen = false) => {
    if (!comp || !comp.filas.length) return '';
    const filasHtml = comp.filas
      .map(
        (f) => `
      <tr>
        <td class="celda-fuerte">${escapeHtml(f.cliente)}</td>
        ${f.valores
          .map((v) => {
            if (v === null) return '<td>—</td>';
            const texto = esVolumen ? v.toLocaleString('es-MX') : `${v}${sufijo}`;
            const color = esVolumen ? '#1E293B' : colorEfectividadSimplificado(v);
            return `<td style="font-weight:700;color:${color};">${texto}</td>`;
          })
          .join('')}
      </tr>`
      )
      .join('');
    return `
      <table>
        <thead>
          <tr>
            <th>Cliente</th>
            ${comp.meses.map((m) => `<th>${escapeHtml(etiquetaMes(m))}</th>`).join('')}
          </tr>
        </thead>
        <tbody>${filasHtml}</tbody>
      </table>`;
  };
  const tablaVolumenPorCliente = tablaComparativoPorClienteHtml(data.comparativoVolumenPorCliente, '', true);
  const tablaEfectividadPorCliente = tablaComparativoPorClienteHtml(data.comparativoEfectividadPorCliente, '%');
  const tablaTemporalidadPorCliente = tablaComparativoPorClienteHtml(data.comparativoTemporalidadPorCliente, '%');

  const MAX_FILAS_PARETO_TABLA = 6; // el conteo real (headline) usa resumen.filas.length completo
  const tablaParetoHtml = (resumen: ResumenPareto, etiquetaValor: string, colorBarra: string) => {
    if (!resumen.filas.length) return '<div class="sin-datos">Sin datos suficientes para este corte</div>';
    const visibles = resumen.filas.slice(0, MAX_FILAS_PARETO_TABLA);
    const filas = visibles
      .map(
        (f) => `
      <tr>
        <td class="celda-fuerte">${escapeHtml(f.oficina)}</td>
        <td>${f.valor.toLocaleString('es-MX')}</td>
        <td>${f.pctDelTotal}%</td>
        <td style="font-weight:800;">${f.pctAcumulado}%</td>
      </tr>`
      )
      .join('');
    const restantes = resumen.filas.length - visibles.length;
    return `
      <div style="font-size:11px;font-weight:700;color:${colorBarra};margin-bottom:6px;">
        ${resumen.filas.length} de ${resumen.totalOficinas} oficinas (${resumen.pctOficinas}%) concentran el 80% de ${etiquetaValor}
      </div>
      <table>
        <thead><tr><th>Oficina</th><th>${etiquetaValor === 'volumen' ? 'Volumen' : 'No Efectivas'}</th><th>% del Total</th><th>% Acumulado</th></tr></thead>
        <tbody>${filas}</tbody>
      </table>
      ${restantes > 0 ? `<div style="font-size:9.5px;color:#94A3B8;margin-top:4px;">+ ${restantes} oficina(s) más hasta completar el 80%</div>` : ''}`;
  };
  const tablaParetoVolumen = tablaParetoHtml(data.paretoVolumen, 'volumen', '#1E3A8A');
  const tablaParetoNoEfectivas = tablaParetoHtml(data.paretoNoEfectivas, 'no efectivas', '#DC2626');

  const tablaComparativoRegion = data.comparativoRegion.length
    ? `
    <table>
      <thead><tr><th>Región</th><th>Volumen</th><th>Efectividad</th><th>% ≤15 Días</th></tr></thead>
      <tbody>
        ${data.comparativoRegion
          .map(
            (r) => `
          <tr>
            <td class="celda-fuerte">${escapeHtml(r.region)}</td>
            <td>${r.total.toLocaleString('es-MX')}</td>
            <td><span style="font-weight:800;color:${colorEfectividadSimplificado(r.efectividad)};">${
              r.efectividad !== null ? `${r.efectividad}%` : '—'
            }</span></td>
            <td><span style="font-weight:800;color:${colorEfectividadSimplificado(r.pctDentroDe15Dias)};">${
              r.pctDentroDe15Dias !== null ? `${r.pctDentroDe15Dias}%` : '—'
            }</span></td>
          </tr>`
          )
          .join('')}
      </tbody>
    </table>`
    : '<div class="sin-datos">Sin datos por región para este corte</div>';

  const tablaExcPorCliente = data.topExcepcionesPorCliente.length
    ? `
    <table>
      <thead><tr><th>Cliente</th><th>Excepción Principal</th><th>Cantidad</th></tr></thead>
      <tbody>
        ${data.topExcepcionesPorCliente
          .map(
            (f) => `
          <tr>
            <td class="celda-fuerte">${escapeHtml(f.cliente)}</td>
            <td>${escapeHtml(f.excepcion)}</td>
            <td>${f.cantidad.toLocaleString('es-MX')}</td>
          </tr>`
          )
          .join('')}
      </tbody>
    </table>`
    : '<div class="sin-datos">Sin excepciones registradas</div>';

  const listaHallazgos = data.hallazgos.length
    ? `<ul class="hallazgos-lista">${data.hallazgos.map((h) => `<li>${escapeHtml(h)}</li>`).join('')}</ul>`
    : '<div class="sin-datos">Sin hallazgos relevantes detectados en este corte</div>';

  win.document.open();
  win.document.write(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="utf-8"/>
      <title>VIGIA - Resumen Ejecutivo</title>
      <style>
        * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; color-adjust: exact; }
        body { font-family: Arial, Helvetica, sans-serif; padding: 16px; color: #1E293B; }
        .header { display: flex; align-items: center; justify-content: space-between; border-bottom: 3px solid #1E3A8A; padding-bottom: 8px; margin-bottom: 10px; }
        .header h1 { font-size: 19px; color: #1E3A8A; margin: 0 0 2px 0; }
        .header .subtitulo { font-size: 12px; color: #64748B; }
        .header .meta { font-size: 10px; color: #64748B; text-align: right; }
        .kpi-grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 8px; margin-bottom: 10px; }
        .kpi-card { border: 1px solid #E2E8F0; border-radius: 6px; padding: 7px 6px; background: #F8FAFC; text-align: center; }
        .kpi-label { font-size: 8px; font-weight: 700; color: #64748B; margin-bottom: 2px; text-transform: uppercase; }
        .kpi-value { font-size: 15px; font-weight: 800; }
        .seccion-titulo { font-size: 12px; font-weight: 800; margin: 9px 0 5px; color: #1E3A8A; }
        .dos-columnas { display: flex; gap: 10px; margin-bottom: 3px; }
        .seccion { flex: 1; border: 1px solid #E2E8F0; border-radius: 6px; padding: 8px 10px; }
        table { width: 100%; border-collapse: collapse; font-size: 9.5px; }
        th { text-align: left; padding: 3px 5px; background: #F8FAFC; border-bottom: 2px solid #E2E8F0; color: #64748B; font-size: 8px; text-transform: uppercase; }
        td { padding: 2.5px 5px; border-bottom: 1px solid #F1F5F9; }
        .celda-fuerte { font-weight: 700; }
        .sin-datos { font-size: 9.5px; color: #94A3B8; padding: 4px 0; }
        .hallazgos-box { border: 2px solid #1E3A8A; border-radius: 6px; padding: 9px 12px; margin-top: 2px; background: #F8FAFC; }
        .hallazgos-lista { margin: 0; padding-left: 16px; font-size: 10.5px; line-height: 1.5; }
        .hallazgos-lista li { margin-bottom: 2px; }
        .footer { margin-top: 10px; font-size: 9px; color: #94A3B8; text-align: right; }
        @media print {
          body { padding: 8mm; }
          @page { size: portrait; margin: 8mm; }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <div>
          <h1>VIGÍA — Resumen Ejecutivo</h1>
          <div class="subtitulo">${escapeHtml(data.cliente)} · ${escapeHtml(data.periodoTexto)}</div>
        </div>
        <div class="meta">Generado: ${escapeHtml(fechaGenerado)}<br/>${data.totalGuias.toLocaleString('es-MX')} guías en este corte</div>
      </div>

      <div class="kpi-grid">${kpiCards}</div>

      <div class="hallazgos-box">
        <div class="seccion-titulo" style="margin-top:0;">🔎 Principales Hallazgos / Tendencias</div>
        ${listaHallazgos}
      </div>

      <div class="dos-columnas">
        <div class="seccion">
          <div class="seccion-titulo" style="margin-top:0;">Oficinas que Requieren Atención</div>
          <div style="font-size:10px;color:#94A3B8;margin-bottom:6px;">Volumen × (100-Efectividad) — priorizadas por impacto</div>
          ${tablaOficinasAtencion}
        </div>
        <div class="seccion">
          <div class="seccion-titulo" style="margin-top:0;">Concesionarios que Requieren Atención</div>
          <div style="font-size:10px;color:#94A3B8;margin-bottom:6px;">Región CONCESIONARIOS — mismo criterio</div>
          ${tablaConcesionariosAtencion}
        </div>
      </div>

      <div class="dos-columnas">
        <div class="seccion">
          <div class="seccion-titulo" style="margin-top:0;">Oficinas Críticas — Guías Abiertas</div>
          <div style="font-size:10px;color:#94A3B8;margin-bottom:6px;">Más guías en seguimiento crítico (5+ días)</div>
          ${tablaOficinasCriticas}
        </div>
        <div class="seccion">
          <div class="seccion-titulo" style="margin-top:0;">Concesionarios Críticos — Guías Abiertas</div>
          <div style="font-size:10px;color:#94A3B8;margin-bottom:6px;">Región CONCESIONARIOS — mismo criterio</div>
          ${tablaConcesionariosCriticos}
        </div>
      </div>

      <div class="dos-columnas">
        <div class="seccion">
          <div class="seccion-titulo" style="margin-top:0;">Top Oficinas/Concesionarios — Guías Abiertas por Ciclo</div>
          <div style="font-size:10px;color:#94A3B8;margin-bottom:6px;">Por volumen total, con la etapa del proceso donde se concentran</div>
          ${tablaTopAbiertasPorOficina}
        </div>
        <div class="seccion">
          <div class="seccion-titulo" style="margin-top:0;">Retornos Críticos — por Oficina/Concesionario y Ciclo</div>
          <div style="font-size:10px;color:#94A3B8;margin-bottom:6px;">Retornos en seguimiento crítico (5+ días)</div>
          ${tablaRetornosCriticosPorOficina}
        </div>
      </div>

      <!-- Sin salto de página forzado: con los límites de filas reducidos
           (5 por tabla, 6 meses, 6 oficinas en Pareto), el contenido cabe
           en 1-2 páginas de forma natural. -->

      <div class="seccion-titulo" style="margin-top:0;">Comparativo General por Región</div>
      <div class="seccion" style="margin-bottom:14px;">
        ${tablaComparativoRegion}
      </div>

      <div class="seccion-titulo">Concentración 80/20 — ¿Dónde Pesa el Volumen y los Problemas?</div>
      <div class="dos-columnas">
        <div class="seccion">
          <div class="seccion-titulo" style="margin-top:0;">Volumen</div>
          ${tablaParetoVolumen}
        </div>
        <div class="seccion">
          <div class="seccion-titulo" style="margin-top:0;">Guías No Efectivas (Dev. + Abiertas)</div>
          ${tablaParetoNoEfectivas}
        </div>
      </div>

      <div class="dos-columnas">
        <div class="seccion">
          <div class="seccion-titulo" style="margin-top:0;">Comparativo de Volumen</div>
          ${tablaComparativoVolumen}
        </div>
        <div class="seccion">
          <div class="seccion-titulo" style="margin-top:0;">Comparativo de Efectividad</div>
          ${tablaComparativo}
        </div>
      </div>

      <div class="dos-columnas">
        <div class="seccion">
          <div class="seccion-titulo" style="margin-top:0;">Comparativo de Temporalidad (% ≤15 Días)</div>
          ${tablaComparativoTemporalidad}
        </div>
        <div class="seccion">
          <div class="seccion-titulo" style="margin-top:0;">Top Excepciones por Cliente</div>
          ${tablaExcPorCliente}
        </div>
      </div>

      ${
        tablaVolumenPorCliente || tablaEfectividadPorCliente || tablaTemporalidadPorCliente
          ? `
      <div class="seccion-titulo">Comparativo Mensual por Cliente</div>
      ${tablaVolumenPorCliente ? `<div class="seccion" style="margin-bottom:10px;"><div class="seccion-titulo" style="margin-top:0;font-size:11px;">Volumen</div>${tablaVolumenPorCliente}</div>` : ''}
      ${tablaEfectividadPorCliente ? `<div class="seccion" style="margin-bottom:10px;"><div class="seccion-titulo" style="margin-top:0;font-size:11px;">Efectividad</div>${tablaEfectividadPorCliente}</div>` : ''}
      ${tablaTemporalidadPorCliente ? `<div class="seccion"><div class="seccion-titulo" style="margin-top:0;font-size:11px;">Temporalidad (% ≤15 Días)</div>${tablaTemporalidadPorCliente}</div>` : ''}
      `
          : ''
      }

      <div class="footer">VIGÍA — Panel de Control Operativo · AFIMEX</div>

      <script>
        window.onload = function() { window.print(); };
      </script>
    </body>
    </html>
  `);
  win.document.close();
}
