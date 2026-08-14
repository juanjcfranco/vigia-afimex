'use client';

import * as XLSX from 'xlsx';
import { LOGO_AFIMEX_BASE64 } from './logo-base64';
import { Indemnizacion } from './types';
import mexicoMapData from './mexico-map-data.json';
import { FilaTemporalidad, FilaRegionOficina, FilaEfectividadTemporalidad } from './business-logic';

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

export function exportInformeLogisticoPDF(data: InformeLogisticoData) {
  const fecha = new Date().toLocaleString('es-MX');
  const win = window.open('', '_blank');
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
  entregadas: number;
  devoluciones: number;
  abiertas: number;
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
}

export function exportEfectividadPDF(data: EfectividadExportData) {
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
        .seccion { border: 1px solid #E2E8F0; border-radius: 8px; padding: 12px 14px; margin-bottom: 14px; page-break-inside: avoid; }
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
        @media print {
          body { padding: 10mm; }
          @page { size: landscape; margin: 10mm; }
          .seccion { break-inside: avoid; }
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
