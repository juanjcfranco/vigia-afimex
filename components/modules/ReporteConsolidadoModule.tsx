'use client';

import { Guia, AlertaGuiaEvento } from '@/lib/types';
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
  temporalidadPorCampo,
  tendenciaMensualPorCampo,
  efectividadTemporalidadPorRegionOficina,
  efectividadYTemporalidadPorCampo,
  calcularResumenExcepciones,
  calcularResumenDevoluciones,
  formatearPeriodo,
  accionEfectiva,
  diasEntreFechas,
  retornoEstaEntregado,
  calcularEtiquetaSeguimiento,
  calcularSemaforoGuia,
} from '@/lib/business-logic';
import { exportReporteConsolidadoPDF, exportReporteSimplificadoPDF, exportToExcel, ResumenAbiertasPorEstado } from '@/lib/export';

// Agrupa una lista de guías en la estructura pivotada Región → Oficina
// (filas) × Estado (columnas) — usado para las 2 tablas resumen del PDF
// (Guías Abiertas y Retornos Abiertos). Con Estado como columna en vez de
// fila, el reporte queda mucho más compacto (regiones + oficinas, no
// regiones × oficinas × estados). El detalle guía por guía (con Tipo/
// Acción) se exporta aparte a Excel, no en el PDF.
function agruparPorRegionOficinaEstado(lista: Guia[]): ResumenAbiertasPorEstado {
  const porRegion: Record<string, Record<string, Record<string, number>>> = {};
  const estadosSet = new Set<string>();

  lista.forEach((g) => {
    const region = obtenerRegion(g.oficina_destino);
    const oficina = g.oficina_destino || 'SIN OFICINA';
    const estado = g.estado_guia || 'SIN ESTADO';
    estadosSet.add(estado);
    if (!porRegion[region]) porRegion[region] = {};
    if (!porRegion[region][oficina]) porRegion[region][oficina] = {};
    porRegion[region][oficina][estado] = (porRegion[region][oficina][estado] || 0) + 1;
  });

  // Columnas ordenadas por su Ciclo (Entrada→Distribución→Recepción→
  // Ruta→Resguardo) y luego alfabético — mismo criterio de orden que ya
  // se usa en el panel "Guías Abiertas por Ciclo" de Efectividad.
  const estados = [...estadosSet].sort((a, b) => {
    const ca = ORDEN_CICLOS.indexOf(obtenerCiclo(a));
    const cb = ORDEN_CICLOS.indexOf(obtenerCiclo(b));
    if (ca !== cb) return ca - cb;
    return a.localeCompare(b);
  });

  const regiones = Object.entries(porRegion)
    .map(([region, oficinasObj]) => {
      const oficinas = Object.entries(oficinasObj)
        .map(([oficina, porEstado]) => ({
          oficina,
          total: Object.values(porEstado).reduce((s, v) => s + v, 0),
          porEstado,
        }))
        .sort((a, b) => b.total - a.total);
      const total = oficinas.reduce((s, o) => s + o.total, 0);
      return { region, total, oficinas };
    })
    .sort((a, b) => b.total - a.total);

  return { regiones, estados };
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

  // Reporte simplificado (1 página) — pensado para dirección: solo KPIs
  // principales + resumen de issues (guías críticas, pendientes de
  // cierre, top excepciones/devoluciones), sin los desgloses detallados
  // por región/oficina/cliente que sí trae el Reporte Ejecutivo Consolidado.
  function generarReporteSimplificado() {
    const ventana = window.open('', '_blank');
    if (!ventana) {
      alert('Tu navegador bloqueó la ventana de impresión. Habilita pop-ups para este sitio.');
      return;
    }
    ventana.document.write(
      '<html><body style="font-family:Arial,sans-serif;padding:60px;color:#1E3A8A;text-align:center;"><h2>Generando Resumen Ejecutivo…</h2></body></html>'
    );
    setTimeout(() => generarYEscribirReporteSimplificado(ventana), 0);
  }

  function generarYEscribirReporteSimplificado(ventana: Window) {
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

    const guiasOriginales = guias.filter(esGuiaOriginal);
    const entregadas = guiasOriginales.filter((g) => isEntregada(g.estado_guia)).length;
    const devoluciones = guiasOriginales.filter((g) => g.es_devolucion).length;
    const abiertasLista = guiasOriginales.filter((g) => isAbiertaPorEstado(g));
    const abiertas = abiertasLista.length;
    const efectividad = calcularEfectividad(entregadas, devoluciones, abiertas);
    const temporalidadGeneral = temporalidadPorCampo(guias, () => 'TOTAL')[0] ?? null;

    // Issues
    const guiasCriticas = abiertasLista.filter((g) => calcularSemaforoGuia(g.dias_sin_movimiento).nivel === 'ROJO').length;
    const pendientes30Mas = abiertasLista.filter((g) => (g.dias_sin_movimiento ?? 0) >= 30).length;
    const retornosAbiertosLista = guiasOriginales.filter((g) => g.es_devolucion && g.retorno_guia);
    const retornoPorGuia = new Map<string, Guia>();
    guias.forEach((g) => {
      if (g.es_retorno && g.guia) retornoPorGuia.set(g.guia, g);
    });
    const retornosAbiertos = retornosAbiertosLista.filter(
      (g) => !retornoEstaEntregado(g, g.retorno_guia ? retornoPorGuia.get(g.retorno_guia) : undefined)
    ).length;

    const resumenExc = calcularResumenExcepciones(guias, 5);
    const resumenDev = calcularResumenDevoluciones(guias, 5);

    exportReporteSimplificadoPDF(
      {
        cliente: clienteTexto,
        periodoTexto,
        totalGuias: guias.length,
        kpis: {
          totalProcesadas: guiasOriginales.length,
          entregadas,
          devoluciones,
          abiertas,
          efectividad,
          pctDentroDe15Dias: temporalidadGeneral?.pctVerde ?? null,
        },
        guiasCriticas,
        pendientes30Mas,
        retornosAbiertos,
        topExcepciones: resumenExc.porTipo,
        totalConExcepcion: resumenExc.total,
        topDevolucionesPorMotivo: resumenDev.porMotivo,
        totalDevoluciones: resumenDev.total,
      },
      ventana
    );
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

    // 1) KPIs de Resumen — misma definición EXACTA que ResumenModule.tsx
    // (antes usaba esRetornoAmplio() para "Guías de Retorno", que cuenta
    // algo distinto — TODAS las guías clasificadas como retorno de
    // cualquier forma, incluyendo "posible retorno de otro periodo" que
    // son filas físicas separadas — por eso podía superar Devoluciones,
    // cosa que no debería pasar nunca: Guías de Retorno es un
    // SUBCONJUNTO de Devoluciones, las que además tienen su retorno
    // referenciado).
    const guiasOriginales = guias.filter(esGuiaOriginal);
    const entregadas = guiasOriginales.filter((g) => isEntregada(g.estado_guia)).length;
    const devoluciones = guiasOriginales.filter((g) => g.es_devolucion).length;
    const abiertasLista = guiasOriginales.filter((g) => isAbiertaPorEstado(g));
    const abiertas = abiertasLista.length;
    const posibleRetornoOtroPeriodo = guias.filter((g) => g.es_posible_retorno_otro_periodo).length;
    const predoc = guias.filter((g) => g.es_predoc).length;
    const documentadas = guias.filter((g) => g.es_documentada).length;
    const canceladas = guias.filter(
      (g) => isCancelada(g.estado_guia) && !esRetornoAmplio(g) && !g.es_predoc && !g.es_documentada
    ).length;

    // Mapa guía→fila propia del retorno, construido del set COMPLETO (sin
    // filtro de oficina/entidad aplicado) — un retorno casi siempre vive
    // en una oficina distinta a la de la devolución original. Mismo
    // patrón que ResumenModule.tsx/DevolucionesModule.tsx.
    const retornoPorGuia = new Map<string, Guia>();
    guias.forEach((g) => {
      if (g.es_retorno && g.guia) retornoPorGuia.set(g.guia, g);
    });

    const devolucionesConRetorno = guiasOriginales.filter((g) => g.es_devolucion && g.retorno_guia);
    const guiasDeRetorno = devolucionesConRetorno.length;
    const retornosAbiertosCount = devolucionesConRetorno.filter(
      (g) => !retornoEstaEntregado(g, g.retorno_guia ? retornoPorGuia.get(g.retorno_guia) : undefined)
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

    // Subtabla de Guías Abiertas por Ciclo (etapa del pipeline), dentro
    // de la sección de Guías Abiertas — mismo orden Entrada→Distribución→
    // Recepción→Ruta→Resguardo que usan los demás módulos.
    const gruposCiclo: Record<string, number> = {};
    abiertasLista.forEach((g) => {
      const ciclo = obtenerCiclo(g.estado_guia);
      gruposCiclo[ciclo] = (gruposCiclo[ciclo] || 0) + 1;
    });
    const abiertasPorCiclo = ORDEN_CICLOS.filter((c) => gruposCiclo[c]).map((c) => ({ key: c, count: gruposCiclo[c] }));

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
        abiertasPorCiclo,
        totalAbiertas: abiertas,
        resumenRetornosAbiertos,
        topExcepciones: resumenExc.porTipo,
        totalConExcepcion: resumenExc.total,
      },
      ventana
    );
  }

  // Exportes de detalle completo (Excel) — con Tipo (Original/Retorno),
  // Acción, y Seguimiento (mismo criterio que en Abiertas: si hay alertas
  // registradas se muestra el conteo, si no, la descripción neutral del
  // nivel calculado); el PDF solo trae el resumen agrupado.
  async function construirSeguimientoPorGuia(): Promise<Map<string, { alertas: number; cerrado: boolean }>> {
    const res = await fetch('/api/alertas-guia');
    const json = await res.json();
    const eventos: AlertaGuiaEvento[] = json.eventos || [];
    const map = new Map<string, { alertas: number; cerrado: boolean }>();
    eventos.forEach((ev) => {
      const actual = map.get(ev.guia) || { alertas: 0, cerrado: false };
      if (ev.nivel === 'CERRADO') {
        actual.cerrado = true;
      } else {
        actual.alertas += 1;
        actual.cerrado = false;
      }
      map.set(ev.guia, actual);
    });
    return map;
  }

  async function exportarExcelGuiasAbiertas() {
    const abiertasLista = guias.filter((g) => esGuiaOriginal(g) && isAbiertaPorEstado(g));
    const seguimientoPorGuia = await construirSeguimientoPorGuia();
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
        {
          header: 'Seguimiento',
          value: (g: Guia) => {
            const seg = seguimientoPorGuia.get(g.guia) || { alertas: 0, cerrado: false };
            return calcularEtiquetaSeguimiento(g.dias_sin_movimiento, seg.alertas, seg.cerrado).texto;
          },
        },
        { header: 'Últ. Mov.', value: (g: Guia) => g.f_historia || '' },
        { header: 'Fecha Creación', value: (g: Guia) => g.f_documentacion || '' },
        { header: 'Doc→Plataforma (d)', value: (g: Guia) => diasEntreFechas(g.f_documentacion, g.fecha_plataforma) ?? '' },
        { header: 'Plataforma→1ra Ruta (d)', value: (g: Guia) => diasEntreFechas(g.fecha_plataforma, g.primera_ruta) ?? '' },
        { header: 'RecibOf→1ra Ruta (d)', value: (g: Guia) => diasEntreFechas(g.recibido_oficina, g.primera_ruta) ?? '' },
        { header: 'Plataforma→Confirmación (d)', value: (g: Guia) => diasEntreFechas(g.fecha_plataforma, g.f_confirmacion) ?? '' },
      ],
      'Guías Abiertas'
    );
  }

  async function exportarExcelRetornosAbiertos() {
    const retornosLista = guias.filter((g) => isAbiertaPorEstado(g) && esRetornoAmplio(g));
    const seguimientoPorGuia = await construirSeguimientoPorGuia();
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
        {
          header: 'Seguimiento',
          value: (g: Guia) => {
            const seg = seguimientoPorGuia.get(g.guia) || { alertas: 0, cerrado: false };
            return calcularEtiquetaSeguimiento(g.dias_sin_movimiento, seg.alertas, seg.cerrado).texto;
          },
        },
        { header: 'Últ. Mov.', value: (g: Guia) => g.f_historia || '' },
        { header: 'Fecha Creación', value: (g: Guia) => g.f_documentacion || '' },
        { header: 'Doc→Plataforma (d)', value: (g: Guia) => diasEntreFechas(g.f_documentacion, g.fecha_plataforma) ?? '' },
        { header: 'Plataforma→1ra Ruta (d)', value: (g: Guia) => diasEntreFechas(g.fecha_plataforma, g.primera_ruta) ?? '' },
        { header: 'RecibOf→1ra Ruta (d)', value: (g: Guia) => diasEntreFechas(g.recibido_oficina, g.primera_ruta) ?? '' },
        { header: 'Plataforma→Confirmación (d)', value: (g: Guia) => diasEntreFechas(g.fecha_plataforma, g.f_confirmacion) ?? '' },
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

      <div className="bg-white rounded-lg border border-[var(--vg-border)] p-6 text-center">
        <div className="text-[15px] font-bold text-[var(--vg-text)] mb-1">📄 Resumen Ejecutivo (1 página)</div>
        <div className="text-[12px] text-[var(--vg-text2)] max-w-xl mx-auto mb-5">
          Versión corta, pensada para dirección: solo los KPIs principales y un resumen de issues — guías en
          seguimiento crítico, pendientes de cierre (+30 días), retornos abiertos, y el Top de excepciones/
          devoluciones. Sin desgloses por región/oficina/cliente.
        </div>
        <button
          onClick={generarReporteSimplificado}
          className="text-[13px] font-semibold text-white bg-[#0891B2] rounded-md px-5 py-2.5 hover:opacity-90"
        >
          📄 Generar Resumen Ejecutivo (PDF)
        </button>
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
