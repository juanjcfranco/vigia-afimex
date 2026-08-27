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
  ORDEN_CICLOS,
  topPorCampo,
  temporalidadPorCampo,
  tendenciaMensualPorCampo,
  efectividadTemporalidadPorRegionOficina,
  efectividadYTemporalidadPorCampo,
  calcularResumenExcepciones,
  diasEntreFechas,
  formatearPeriodo,
} from '@/lib/business-logic';
import { exportReporteConsolidadoPDF, FilaDetalleGuiaAbierta } from '@/lib/export';

// Convierte una guía abierta (Guia completa) a la fila plana que usa la
// tabla de detalle del PDF — se calcula aquí (no en export.ts) para que
// ese archivo no necesite importar toda la lógica de negocio, solo datos
// ya resueltos.
function aFilaDetalle(g: Guia): FilaDetalleGuiaAbierta {
  return {
    guia: g.guia || '',
    cliente: g.cliente || '',
    estado: g.estado_guia || '',
    oficina: g.oficina_destino || '',
    entidad: g.entidad_destinatario || '',
    region: obtenerRegion(g.oficina_destino),
    ciclo: obtenerCiclo(g.estado_guia),
    diasSinMovimiento: g.dias_sin_movimiento ?? null,
    ultimoMovimiento: g.f_historia || null,
    fechaCreacion: g.f_documentacion || null,
    docPlataforma: diasEntreFechas(g.f_documentacion, g.fecha_plataforma),
    plataformaRuta: diasEntreFechas(g.fecha_plataforma, g.primera_ruta),
    recibofRuta: diasEntreFechas(g.recibido_oficina, g.primera_ruta),
    plataformaConfirmacion: diasEntreFechas(g.fecha_plataforma, g.f_confirmacion),
  };
}

export default function ReporteConsolidadoModule({ guias }: { guias: Guia[] }) {
  function generarReporte() {
    // Igual que en Resumen/Efectividad: abre la ventana INMEDIATAMENTE
    // (debe ser síncrono con el clic para que el navegador no la bloquee
    // como pop-up) con un mensaje de carga, y difiere el cálculo pesado
    // (este reporte junta 9 secciones distintas) a la siguiente tarea.
    const ventana = window.open('', '_blank');
    if (!ventana) {
      alert('Tu navegador bloqueó la ventana de impresión. Habilita pop-ups para este sitio.');
      return;
    }
    ventana.document.write(
      '<html><body style="font-family:Arial,sans-serif;padding:60px;color:#1E3A8A;text-align:center;"><h2>Generando Reporte Ejecutivo Consolidado…</h2><p style="color:#64748B;">Junta 9 secciones distintas — puede tardar unos segundos.</p></body></html>'
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

    // ============================================================
    // 1) KPIs de Resumen — misma definición que useVigiaData.ts/kpis
    // ============================================================
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
    const retornosAbiertos = devolucionesConRetorno.filter(
      (g) => (g.retorno_estado || '').toUpperCase() !== 'ENTREGADA'
    ).length;
    const efectividad = calcularEfectividad(entregadas, devoluciones, abiertas);

    // ============================================================
    // 2) KPIs de Temporalidad (resumen general)
    // ============================================================
    const temporalidadGeneral = temporalidadPorCampo(guias, () => 'TOTAL')[0] ?? null;

    // ============================================================
    // 3) Tendencias (Total)
    // ============================================================
    const tendenciaVolumen = tendenciaMensualPorCampo(guias, null, 'volumen');
    const tendenciaEfectividad = tendenciaMensualPorCampo(guias, null, 'efectividad');
    const tendenciaTemporalidad = tendenciaMensualPorCampo(guias, null, 'temporalidad');

    // ============================================================
    // 4) Efectividad + Temporalidad por Región → Oficina
    // ============================================================
    const regionOficina = efectividadTemporalidadPorRegionOficina(guias);

    // ============================================================
    // 5) Efectividad + Temporalidad por Cliente
    // ============================================================
    const porCliente = efectividadYTemporalidadPorCampo(guias, 'cliente');

    // ============================================================
    // 6) Abiertas por Oficina / Ciclo (sobre guías originales abiertas,
    // mismo criterio que AbiertasModule)
    // ============================================================
    const abiertasPorOficina = topPorCampo(abiertasLista, (g) => g.oficina_destino, 10);
    const gruposCiclo: Record<string, number> = {};
    abiertasLista.forEach((g) => {
      const ciclo = obtenerCiclo(g.estado_guia);
      gruposCiclo[ciclo] = (gruposCiclo[ciclo] || 0) + 1;
    });
    const abiertasPorCiclo = ORDEN_CICLOS.filter((c) => gruposCiclo[c]).map((c) => ({ key: c, count: gruposCiclo[c] }));

    // ============================================================
    // 7) y 8) Tablas de detalle completo
    // ============================================================
    const guiasAbiertasDetalle = abiertasLista.map(aFilaDetalle);
    const retornosAbiertosLista = guias.filter((g) => isAbiertaPorEstado(g) && esRetornoAmplio(g));
    const retornosAbiertosDetalle = retornosAbiertosLista.map(aFilaDetalle);

    // ============================================================
    // 9) Top Excepciones
    // ============================================================
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
          retornosAbiertos,
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
        abiertasPorOficina,
        abiertasPorCiclo,
        totalAbiertas: abiertas,
        guiasAbiertas: guiasAbiertasDetalle,
        retornosAbiertos: retornosAbiertosDetalle,
        topExcepciones: resumenExc.porTipo,
        totalConExcepcion: resumenExc.total,
      },
      ventana
    );
  }

  return (
    <div className="p-5 space-y-4">
      <div className="bg-white rounded-lg border border-[var(--vg-border)] p-6 text-center">
        <div className="text-[15px] font-bold text-[var(--vg-text)] mb-1">📋 Reporte Ejecutivo Consolidado</div>
        <div className="text-[12px] text-[var(--vg-text2)] max-w-xl mx-auto mb-5">
          Junta en un solo PDF: KPIs de Resumen, KPIs de Temporalidad, tendencias mensuales (Volumen/Efectividad/
          Temporalidad), la tabla de Efectividad + Temporalidad por Región→Oficina y por Cliente, Abiertas por
          Oficina/Ciclo, el detalle completo de Guías Abiertas y Retornos Abiertos, y el Top de Excepciones.
        </div>
        <button
          onClick={generarReporte}
          className="text-[13px] font-semibold text-white bg-[var(--vg-blue)] rounded-md px-5 py-2.5 hover:opacity-90"
        >
          📄 Generar Reporte Ejecutivo Consolidado (PDF)
        </button>
        <div className="text-[10.5px] text-[var(--vg-text3)] mt-3">
          Respeta los filtros globales (Periodo, Cliente, Oficina, Entidad) que tengas activos arriba.
        </div>
      </div>
    </div>
  );
}
