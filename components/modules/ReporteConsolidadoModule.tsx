'use client';

import { Guia } from '@/lib/types';
import {
  isEntregada,
  isCancelada,
  isAbiertaPorEstado,
  esGuiaOriginal,
  esRetornoAmplio,
  calcularEfectividad,
  obtenerRegion,
  obtenerCiclo,
  temporalidadPorCampo,
  tendenciaMensualPorCampo,
  efectividadTemporalidadPorRegionOficina,
  efectividadYTemporalidadPorCampo,
  calcularResumenExcepciones,
  formatearPeriodo,
  accionEfectiva,
} from '@/lib/business-logic';
import { exportReporteConsolidadoPDF, exportToExcel, FilaResumenAbiertas } from '@/lib/export';

// Agrupa una lista de guías por Región → Oficina → Estado, contando
// cuántas caen en cada combinación — usado para las 2 tablas resumen del
// PDF (Guías Abiertas y Retornos Abiertos). El detalle guía por guía
// (con Tipo/Acción) se exporta aparte a Excel, no en el PDF.
function agruparPorRegionOficinaEstado(lista: Guia[]): FilaResumenAbiertas[] {
  const grupos: Record<string, FilaResumenAbiertas> = {};
  lista.forEach((g) => {
    const region = obtenerRegion(g.oficina_destino);
    const oficina = g.oficina_destino || 'SIN OFICINA';
    const estado = g.estado_guia || 'SIN ESTADO';
    const key = `${region}|${oficina}|${estado}`;
    if (!grupos[key]) grupos[key] = { region, oficina, estado, cantidad: 0 };
    grupos[key].cantidad++;
  });
  return Object.values(grupos).sort((a, b) => {
    if (a.region !== b.region) return a.region.localeCompare(b.region);
    if (a.oficina !== b.oficina) return b.cantidad - a.cantidad || a.oficina.localeCompare(b.oficina);
    return b.cantidad - a.cantidad;
  });
}

export default function ReporteConsolidadoModule({
  guias,
  guiasTendencias,
}: {
  guias: Guia[];
  // Para las tendencias mensuales: respeta Cliente/Oficina/Entidad pero
  // NO Periodo/Día — igual que en EfectividadModule — para que las
  // gráficas de tendencia sigan mostrando la comparación entre meses
  // aunque el filtro global esté acotado a un mes específico (si no,
  // solo habría 1 punto y el gráfico no se dibuja).
  guiasTendencias?: Guia[];
}) {
  const guiasBaseTendencias = guiasTendencias ?? guias;

  function generarReporte() {
    // Abre la ventana INMEDIATAMENTE (debe ser síncrono con el clic para
    // que el navegador no la bloquee como pop-up) con un mensaje de
    // carga, y difiere el cálculo pesado a la siguiente tarea.
    const ventana = window.open('', '_blank');
    if (!ventana) {
      alert('Tu navegador bloqueó la ventana de impresión. Habilita pop-ups para este sitio.');
      return;
    }
    ventana.document.write(
      '<html><body style="font-family:Arial,sans-serif;padding:60px;color:#1E3A8A;text-align:center;"><h2>Generando Reporte Ejecutivo Consolidado…</h2><p style="color:#64748B;">Junta varias secciones — puede tardar unos segundos.</p></body></html>'
    );
    setTimeout(() => generarYEscribirReporte(ventana), 0);
  }

  function generarYEscribirReporte(ventana: Window) {
    const clientesDistintos = [...new Set(guias.map((g) => g.cliente).filter(Boolean))] as string[];
    const clienteTexto =
      clientesDistintos.length === 1
        ? clientesDistintos[0]
        : clientesDistintos.length > 1
          ? `Varios clientes (${clientesDistintos.length})`
          : 'Sin cliente';

    const mesesDoc = guias
      .map((g) => g.f_documentacion)
      .filter((f): f is string => !!f)
      .sort();
    const periodoTexto =
      mesesDoc.length > 0
        ? (() => {
            const primero = mesesDoc[0].slice(0, 7);
            const ultimo = mesesDoc[mesesDoc.length - 1].slice(0, 7);
            return primero === ultimo ? formatearPeriodo(primero) : `${formatearPeriodo(primero)} — ${formatearPeriodo(ultimo)}`;
          })()
        : 'Sin fecha';

    // 1) KPIs de Resumen — misma definición que useVigiaData.ts/kpis
    const guiasOriginales = guias.filter(esGuiaOriginal);
    const entregadas = guiasOriginales.filter((g) => isEntregada(g.estado_guia)).length;
    const devoluciones = guiasOriginales.filter((g) => g.es_devolucion).length;
    const abiertasLista = guiasOriginales.filter((g) => isAbiertaPorEstado(g));
    const abiertas = abiertasLista.length;
    const guiasDeRetorno = guias.filter((g) => esRetornoAmplio(g)).length;
    const posibleRetornoOtroPeriodo = guias.filter((g) => g.es_posible_retorno_otro_periodo).length;
    const predoc = guias.filter((g) => g.es_predoc).length;
    const documentadas = guias.filter((g) => g.es_documentada).length;
    const canceladas = guias.filter(
      (g) => isCancelada(g.estado_guia) && !esRetornoAmplio(g) && !g.es_predoc && !g.es_documentada
    ).length;
    const devolucionesConRetorno = guiasOriginales.filter((g) => g.es_devolucion && g.retorno_guia);
    const retornosAbiertosCount = devolucionesConRetorno.filter(
      (g) => (g.retorno_estado || '').toUpperCase() !== 'ENTREGADA'
    ).length;
    const efectividad = calcularEfectividad(entregadas, devoluciones, abiertas);

    // 2) KPIs de Temporalidad (resumen general del corte actual)
    const temporalidadGeneral = temporalidadPorCampo(guias, () => 'TOTAL')[0] ?? null;

    // 3) Tendencias (Total) — sobre guiasBaseTendencias (sin filtro de Periodo)
    const tendenciaVolumen = tendenciaMensualPorCampo(guiasBaseTendencias, null, 'volumen');
    const tendenciaEfectividad = tendenciaMensualPorCampo(guiasBaseTendencias, null, 'efectividad');
    const tendenciaTemporalidad = tendenciaMensualPorCampo(guiasBaseTendencias, null, 'temporalidad');

    // 4) Efectividad + Temporalidad por Región → Oficina
    const regionOficina = efectividadTemporalidadPorRegionOficina(guias);

    // 5) Efectividad + Temporalidad por Cliente
    const porCliente = efectividadYTemporalidadPorCampo(guias, 'cliente');

    // 6) y 7) Resumen de Guías Abiertas / Retornos Abiertos, por Región/Oficina/Estado
    const retornosAbiertosLista = guias.filter((g) => isAbiertaPorEstado(g) && esRetornoAmplio(g));
    const resumenGuiasAbiertas = agruparPorRegionOficinaEstado(abiertasLista);
    const resumenRetornosAbiertos = agruparPorRegionOficinaEstado(retornosAbiertosLista);

    // 8) Top Excepciones
    const resumenExc = calcularResumenExcepciones(guias, 10);

    exportReporteConsolidadoPDF(
      {
        cliente: clienteTexto,
        periodoTexto,
        totalGuias: guias.length,
        kpisResumen: {
          totalProcesadas: guiasOriginales.length,
          entregadas,
          devoluciones,
          guiasDeRetorno,
          posibleRetornoOtroPeriodo,
          abiertas,
          retornosAbiertos: retornosAbiertosCount,
          efectividad,
          predoc,
          documentadas,
          canceladas,
        },
        temporalidadGeneral,
        tendenciaVolumen,
        tendenciaEfectividad,
        tendenciaTemporalidad,
        regionOficina,
        porCliente,
        resumenGuiasAbiertas,
        resumenRetornosAbiertos,
        topExcepciones: resumenExc.porTipo,
        totalConExcepcion: resumenExc.total,
      },
      ventana
    );
  }

  // Exportes de detalle completo (Excel) — con Tipo (Original/Retorno) y
  // Acción, tal como se piden; el PDF solo trae el resumen agrupado.
  function exportarExcelGuiasAbiertas() {
    const abiertasLista = guias.filter((g) => esGuiaOriginal(g) && isAbiertaPorEstado(g));
    exportToExcel(
      abiertasLista,
      [
        { header: 'Guía', value: (g: Guia) => g.guia || '' },
        { header: 'Cliente', value: (g: Guia) => g.cliente || '' },
        { header: 'Tipo', value: () => 'Original' },
        { header: 'Estado', value: (g: Guia) => g.estado_guia || '' },
        { header: 'Oficina Destino', value: (g: Guia) => g.oficina_destino || '' },
        { header: 'Entidad', value: (g: Guia) => g.entidad_destinatario || '' },
        { header: 'Región', value: (g: Guia) => obtenerRegion(g.oficina_destino) },
        { header: 'Ciclo', value: (g: Guia) => obtenerCiclo(g.estado_guia) },
        { header: 'Acción', value: (g: Guia) => accionEfectiva(g) || '' },
        { header: 'Días sin Mov.', value: (g: Guia) => g.dias_sin_movimiento ?? '' },
        { header: 'Últ. Mov.', value: (g: Guia) => g.f_historia || '' },
        { header: 'Fecha Creación', value: (g: Guia) => g.f_documentacion || '' },
      ],
      'Guías Abiertas'
    );
  }

  function exportarExcelRetornosAbiertos() {
    const retornosLista = guias.filter((g) => isAbiertaPorEstado(g) && esRetornoAmplio(g));
    exportToExcel(
      retornosLista,
      [
        { header: 'Guía', value: (g: Guia) => g.guia || '' },
        { header: 'Cliente', value: (g: Guia) => g.cliente || '' },
        { header: 'Tipo', value: () => 'Retorno' },
        { header: 'Estado', value: (g: Guia) => g.estado_guia || '' },
        { header: 'Oficina Destino', value: (g: Guia) => g.oficina_destino || '' },
        { header: 'Entidad', value: (g: Guia) => g.entidad_destinatario || '' },
        { header: 'Región', value: (g: Guia) => obtenerRegion(g.oficina_destino) },
        { header: 'Ciclo', value: (g: Guia) => obtenerCiclo(g.estado_guia) },
        { header: 'Acción', value: (g: Guia) => accionEfectiva(g) || '' },
        { header: 'Días sin Mov.', value: (g: Guia) => g.dias_sin_movimiento ?? '' },
        { header: 'Últ. Mov.', value: (g: Guia) => g.f_historia || '' },
        { header: 'Fecha Creación', value: (g: Guia) => g.f_documentacion || '' },
      ],
      'Retornos Abiertos'
    );
  }

  return (
    <div className="p-5 space-y-4">
      <div className="bg-white rounded-lg border border-[var(--vg-border)] p-6 text-center">
        <div className="text-[15px] font-bold text-[var(--vg-text)] mb-1">📋 Reporte Ejecutivo Consolidado</div>
        <div className="text-[12px] text-[var(--vg-text2)] max-w-xl mx-auto mb-5">
          Junta en un solo PDF: KPIs de Resumen, KPIs de Temporalidad, tendencias mensuales (Volumen/Efectividad/
          Temporalidad — siempre visibles, sin importar el filtro de Periodo), Efectividad + Temporalidad por
          Región→Oficina y por Cliente, el resumen de Guías Abiertas y Retornos Abiertos por Región/Oficina/Estado,
          y el Top de Excepciones.
        </div>
        <button
          onClick={generarReporte}
          className="text-[13px] font-semibold text-white bg-[var(--vg-blue)] rounded-md px-5 py-2.5 hover:opacity-90"
        >
          📄 Generar Reporte Ejecutivo Consolidado (PDF)
        </button>
        <div className="text-[10.5px] text-[var(--vg-text3)] mt-3">
          Respeta los filtros globales (Cliente, Oficina, Entidad) que tengas activos arriba.
        </div>
      </div>

      <div className="bg-white rounded-lg border border-[var(--vg-border)] p-5">
        <div className="text-[13px] font-bold mb-1">Detalle completo (Excel)</div>
        <div className="text-[11.5px] text-[var(--vg-text2)] mb-3">
          El PDF solo trae el resumen agrupado por Región/Oficina/Estado — para el listado guía por guía (con
          Tipo y Acción), descarga aquí:
        </div>
        <div className="flex gap-2.5 flex-wrap">
          <button
            onClick={exportarExcelGuiasAbiertas}
            className="text-[12px] font-semibold text-[var(--vg-text2)] border border-[var(--vg-border)] rounded-md px-3 py-1.5 hover:bg-[var(--vg-bg)]"
          >
            ⬇ Excel — Guías Abiertas
          </button>
          <button
            onClick={exportarExcelRetornosAbiertos}
            className="text-[12px] font-semibold text-[var(--vg-text2)] border border-[var(--vg-border)] rounded-md px-3 py-1.5 hover:bg-[var(--vg-bg)]"
          >
            ⬇ Excel — Retornos Abiertos
          </button>
        </div>
      </div>
    </div>
  );
}
