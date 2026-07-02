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
  total_guias: number;
  enviado_a: string | null;
  enviado_en: string;
  estado: string;
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
    const filasGuias = a.guias_incluidas
      .map((g, i) => `<tr>
        <td style="padding:4px 8px;border:1px solid #E2E8F0;color:#64748B">${i + 1}</td>
        <td style="padding:4px 8px;border:1px solid #E2E8F0;font-family:monospace;font-weight:600">${escapeHtml(g)}</td>
        <td style="padding:4px 8px;border:1px solid #E2E8F0">${escapeHtml(a.oficina)}</td>
        <td style="padding:4px 8px;border:1px solid #E2E8F0">${escapeHtml(a.enviado_a || '—')}</td>
        <td style="padding:4px 8px;border:1px solid #E2E8F0">${escapeHtml(fechaEnvio)}</td>
      </tr>`)
      .join('');
    return `
      <div style="margin-bottom:20px;padding:12px;border:1px solid #E2E8F0;border-radius:8px;page-break-inside:avoid">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <div>
            <span style="font-weight:800;font-size:13px">${idx + 1}. ${escapeHtml(a.oficina)}</span>
            <span style="margin-left:10px;font-size:11px;color:#64748B">${a.total_guias} guía(s)</span>
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
            <th style="background:#F8FAFC;border:1px solid #E2E8F0;padding:4px 8px;text-align:left;color:#94A3B8">Enviado a</th>
            <th style="background:#F8FAFC;border:1px solid #E2E8F0;padding:4px 8px;text-align:left;color:#94A3B8">Fecha</th>
          </tr></thead>
          <tbody>${filasGuias}</tbody>
        </table>
      </div>`;
  }).join('');

  const totalGuias = alertas.reduce((s, a) => s + a.total_guias, 0);

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
      <div style="display:flex;align-items:center;justify-content:space-between;border-bottom:3px solid #1E3A8A;padding-bottom:14px;margin-bottom:20px;">
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
  total_guias: number;
  enviado_a: string | null;
  enviado_en: string;
  estado: string;
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

  const filasGuias = alerta.guias_incluidas
    .map(
      (g, i) => `<tr>
        <td style="padding:5px 10px;border:1px solid #E2E8F0;color:#64748B">${i + 1}</td>
        <td style="padding:5px 10px;border:1px solid #E2E8F0;font-family:monospace;font-weight:600">${escapeHtml(g)}</td>
        <td style="padding:5px 10px;border:1px solid #E2E8F0">${escapeHtml(alerta.oficina)}</td>
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
        <div class="seccion-titulo">COD Entregado vs COD en Devolución</div>
        <div class="kpi-grid" style="grid-template-columns: repeat(3, 1fr);">${kpiCards(data.cod)}</div>
      </div>

      ${rankingHtml}

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
