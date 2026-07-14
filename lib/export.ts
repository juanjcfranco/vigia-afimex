'use client';

import * as XLSX from 'xlsx';
import { LOGO_AFIMEX_BASE64 } from './logo-base64';

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
  topLowEntidad?: {
    top: { key: string; efectividad: number | null } | null;
    low: { key: string; efectividad: number | null } | null;
  };
  topLowOficina?: {
    top: { key: string; efectividad: number | null } | null;
    low: { key: string; efectividad: number | null } | null;
  };
  facturacion: { label: string; value: string; color: string; detail?: string }[];
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

  const rankingHtml = tablaSimple(
    'Ranking de Excepciones',
    ['Excepción', 'Guías'],
    data.rankingExcepciones.map(([exc, n]) => [exc, String(n)])
  );

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

  const topLowCard = (label: string, item: { key: string; efectividad: number | null } | null, emoji: string) => `
    <div class="kpi-card" style="border-top-color:#1E3A8A">
      <div class="kpi-label">${emoji} ${escapeHtml(label)}</div>
      <div style="font-size:11px;font-weight:700;margin-top:4px;">${item ? escapeHtml(item.key) : '—'}</div>
      <div class="kpi-value" style="font-size:15px;">${item && item.efectividad !== null ? `${item.efectividad}%` : '—'}</div>
    </div>`;

  const topLowHtml =
    data.topLowEntidad && data.topLowOficina
      ? `
    <div class="seccion">
      <div class="seccion-titulo">Mejor y Peor Desempeño</div>
      <div class="kpi-grid">
        ${topLowCard('Mejor Entidad', data.topLowEntidad.top, '🏆')}
        ${topLowCard('Peor Entidad', data.topLowEntidad.low, '⚠️')}
        ${topLowCard('Mejor Oficina', data.topLowOficina.top, '🏆')}
        ${topLowCard('Peor Oficina', data.topLowOficina.low, '⚠️')}
      </div>
    </div>`
      : '';

  const abiertasHtml = tablaSimple(
    'Resumen de Guías Abiertas',
    ['Estado', 'Guías'],
    data.abiertasPorEstado.map(([estado, n]) => [estado, String(n)])
  );

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

      ${topLowHtml}

      <div class="dos-columnas">
        ${efectEntidadHtml}
        ${efectOficinaHtml}
      </div>

      <div class="seccion">
        <div class="seccion-titulo">Facturación</div>
        <div class="kpi-grid">${kpiCards(data.facturacion)}</div>
      </div>

      ${abiertasHtml}

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
        .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 22px; }
        .kpi-card { border: 1px solid #E2E8F0; border-radius: 8px; padding: 12px; background: #F8FAFC; }
        .kpi-label { font-size: 10.5px; font-weight: 700; color: #64748B; margin-bottom: 4px; text-transform: uppercase; }
        .kpi-value { font-size: 22px; font-weight: 800; }
        .secciones { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; margin-bottom: 18px; }
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
        <div class="seccion">
          <div class="seccion-titulo">Top Excepciones</div>
          ${barraHtml(data.topExcepciones, data.totalConExcepcion, '#7C3AED')}
        </div>
        <div class="seccion">
          <div class="seccion-titulo">Top Oficinas por Volumen</div>
          ${barraHtml(data.topOficinas, data.totalGuias, '#1E3A8A')}
        </div>
      </div>

      <div class="secciones">
        <div class="seccion">
          <div class="seccion-titulo">Devoluciones — Top Oficina Destino</div>
          ${barraHtml(data.topDevolucionesPorOficina, data.totalDevoluciones, '#DC2626')}
        </div>
        <div class="seccion">
          <div class="seccion-titulo">Devoluciones — Top Motivo</div>
          ${barraHtml(data.topDevolucionesPorMotivo, data.totalDevoluciones, '#EA7C1A')}
        </div>
      </div>

      <div class="secciones">
        <div class="seccion">
          <div class="seccion-titulo">Temporalidad de Guías Abiertas</div>
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
          <div class="seccion-titulo">Cierre Operativo — Pendientes +30 días</div>
          <div style="font-size:30px;font-weight:800;color:#DC2626;margin-bottom:8px;">
            ${data.pendientes30Mas.toLocaleString('es-MX')}
            <span style="font-size:12px;font-weight:600;color:#94A3B8;"> guías sin movimiento hace 30+ días</span>
          </div>
          ${barraHtml(data.cierre30PorOficina, data.pendientes30Mas, '#DC2626')}
        </div>
      </div>

      <div class="secciones">
        <div class="seccion" style="grid-column: span 2;">
          <div class="seccion-titulo">Efectividad por Entidad</div>
          ${barraEfectividadHtml(data.efectividadPorEntidad)}
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

