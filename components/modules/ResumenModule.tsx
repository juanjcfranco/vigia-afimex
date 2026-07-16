'use client';

import { useMemo } from 'react';
import { Guia } from '@/lib/types';
import { isEntregada, isAbiertaPorEstado, isCancelada, esGuiaOriginal, colorEfectividad, calcularEfectividad, getExcepciones, calcularTiempoPromedioEntrega, calcularResumenExcepciones, calcularResumenDevoluciones, retornoEstaEntregado, formatearPeriodo, topPorCampo, categoriaExcepcion } from '@/lib/business-logic';
import { exportInformeLogisticoPDF } from '@/lib/export';
import TopListPanel from '@/components/TopListPanel';
import KpiCard from '@/components/KpiCard';
import { useSortableTable } from '@/lib/useSortableTable';
import SortableTh from '@/components/SortableTh';
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

const ESTADO_COLORS: Record<string, string> = {
  ENTREGADA: '#0B9B67',
  DEVOLUCION: '#DC2626',
  'EN RUTA': '#1E3A8A',
  'EN ALMACEN': '#EA7C1A',
  'LISTO PARA ENTREGAR': '#831843',
  EMBARCADA: '#0891B2',
  TRANSBORDADA: '#64748B',
};
// Color fijo para CUALQUIER estado marcado como retorno o posible retorno
// de otro periodo, sin importar cuál sea el estado bruto — así toda la
// familia "es un retorno" se reconoce de un vistazo en el pie, en vez de
// mezclarse con los envíos originales bajo el mismo color de su estado.
const COLOR_RETORNO = '#7C3AED';
const COLOR_POSIBLE_RETORNO = '#B45309';
const PALETTE = ['#1E3A8A', '#0B9B67', '#EA7C1A', '#DC2626', '#7C3AED', '#0891B2', '#64748B', '#B45309', '#14532D', '#831843'];

function colorParaEstado(nombre: string): string {
  if (ESTADO_COLORS[nombre]) return ESTADO_COLORS[nombre];
  if (nombre.endsWith('(RETORNO)')) return COLOR_RETORNO;
  if (nombre.endsWith('(POSIBLE RETORNO OTRO PERIODO)')) return COLOR_POSIBLE_RETORNO;
  return '#94A3B8';
}

export default function ResumenModule({ guias, guiasTodas }: { guias: Guia[]; guiasTodas?: Guia[] }) {
  // Mapa de guía → fila física del retorno, construido con el set COMPLETO
  // (sin el filtro de oficina/entidad/etc. aplicado), no con `guias` ya
  // filtradas — igual que en el módulo Devoluciones. El retorno de una
  // devolución casi siempre está en una oficina distinta a la de la
  // devolución, así que filtrar por oficina puede hacer que esa fila se
  // caiga del set aunque la devolución sí esté visible.
  const retornoPorGuia = useMemo(() => {
    const map = new Map<string, Guia>();
    (guiasTodas ?? guias).forEach((g) => {
      if (g.es_retorno) map.set(g.guia, g);
    });
    return map;
  }, [guiasTodas, guias]);

  const kpis = useMemo(() => {
    const totalFilas = guias.length;

    // "Guías de retorno": guías devueltas que ya tienen su número de retorno
    // referenciado en la columna Retorno (1 por cada devolución)
    const devolucionesConRetorno = guias.filter((g) => g.es_devolucion && g.retorno_guia);
    // Prioriza el estado real de la fila física del retorno (si existe en
    // este corte) sobre el campo embebido retorno_estado, que puede venir
    // desactualizado — ver retornoEstaEntregado() en business-logic.ts.
    // Esto es lo que hace que este número cuadre con "ENTREGADA (RETORNO)"
    // en la tabla de Estados de Guías más abajo.
    const guiasRetornoEntregadas = devolucionesConRetorno.filter((g) =>
      retornoEstaEntregado(g, g.retorno_guia ? retornoPorGuia.get(g.retorno_guia) : undefined)
    ).length;

    // De esas, cuántas además tienen su propia fila física en este archivo
    // (es_retorno=true). Son informativas, no se suman aparte del total.
    const guiasRetornoConFilaPropia = guias.filter((g) => g.es_retorno).length;

    // "Posible retorno de otro periodo": guías cuyo Cliente_Paga = Nombre_Destinatario,
    // SIN vínculo explícito en este archivo (es un concepto separado, no se suma al anterior)
    const posibleRetornoOtroPeriodo = guias.filter((g) => g.es_posible_retorno_otro_periodo);
    const posibleRetornoEntregados = posibleRetornoOtroPeriodo.filter((g) => isEntregada(g.estado_guia)).length;

    // Guías originales (= TOTAL del panel): excluye las que son retorno explícito
    // por fila propia (es_retorno) y las de posible retorno de otro periodo.
    // Las devoluciones SÍ son guías originales (la devolución es el evento;
    // su retorno físico, si existe, es la fila duplicada que se excluye aquí).
    const guiasOriginales = guias.filter(esGuiaOriginal);

    // Las predoc, documentadas y canceladas se cuentan directo desde todas
    // las guías (no desde originales, ya las excluimos) — las tres están
    // fuera de los indicadores principales: predoc y documentadas porque
    // ninguna ha iniciado su movimiento real, y canceladas porque no
    // representan operación efectiva ni pendiente.
    const predoc = guias.filter((g) => g.es_predoc).length;
    const documentadas = guias.filter((g) => g.es_documentada).length;
    const canceladas = guias.filter(
      (g) =>
        isCancelada(g.estado_guia) &&
        !g.es_retorno &&
        !g.es_posible_retorno_otro_periodo &&
        !g.es_predoc &&
        !g.es_documentada
    ).length;

    const entregadas = guiasOriginales.filter((g) => isEntregada(g.estado_guia)).length;
    const devoluciones = guiasOriginales.filter((g) => g.es_devolucion).length;
    const abiertas = guiasOriginales.filter((g) => isAbiertaPorEstado(g)).length;

    // "Retornos abiertos": devoluciones cuyo paquete de retorno TODAVÍA no
    // llega (retorno_estado distinto de ENTREGADA). No son "guías abiertas"
    // (esas son guías originales en tránsito) — son un bucket aparte, pero
    // sí cuentan como pendiente/no efectivo para el cálculo de efectividad.
    // (Es el mismo número que guiasRetornoPendientes, calculado aquí antes
    // para poder usarlo en calcularEfectividad.)
    const retornosAbiertos = devolucionesConRetorno.length - guiasRetornoEntregadas;

    const efectividad = calcularEfectividad(entregadas, devoluciones, abiertas);

    // Tiempo promedio (y mediana) de entrega, en días, desde F_Documentacion
    // hasta F_Entrega — solo guías entregadas que no son retorno.
    const tiempoEntrega = calcularTiempoPromedioEntrega(guias);

    // "Total sin duplicadas": originales (ya sin predoc/documentada/
    // canceladas) + posible retorno + predoc + documentadas + canceladas.
    // Para que el cuadre de filas sea transparente.
    const totalSinDuplicadas =
      guiasOriginales.length + posibleRetornoOtroPeriodo.length + predoc + documentadas + canceladas;

    return {
      totalFilas,
      totalSinDuplicadas,
      totalOriginales: guiasOriginales.length,
      guiasRetornoConFilaPropia,
      totalGuiasRetorno: devolucionesConRetorno.length,
      guiasRetornoEntregadas,
      guiasRetornoPendientes: retornosAbiertos,
      retornosAbiertos,
      totalPosibleRetornoOtroPeriodo: posibleRetornoOtroPeriodo.length,
      posibleRetornoEntregados,
      entregadas,
      devoluciones,
      abiertas,
      canceladas,
      predoc,
      documentadas,
      efectividad,
      tiempoEntrega,
    };
  }, [guias, retornoPorGuia]);

  const estados = useMemo(() => {
    const counts: Record<string, number> = {};
    guias
      .filter((g) => !g.es_predoc && !g.es_documentada)
      .forEach((g) => {
        let e = g.estado_guia || 'SIN ESTADO';
        // Separa SIEMPRE los retornos del estado bruto, sin importar cuál
        // sea (antes solo se hacía para ENTREGADA). Sin esto, un estado
        // como "LISTO PARA ENTREGAR" mezclaba envíos originales con guías
        // de retorno en tránsito de regreso — dos cosas muy distintas que
        // se confundían en una sola cifra.
        if (g.es_retorno) e = `${e} (RETORNO)`;
        else if (g.es_posible_retorno_otro_periodo) e = `${e} (POSIBLE RETORNO OTRO PERIODO)`;
        counts[e] = (counts[e] || 0) + 1;
      });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [guias]);

  const topOficinas = useMemo(() => {
    const counts: Record<string, number> = {};
    guias.forEach((g) => {
      const o = g.oficina_destino || 'SIN OFICINA';
      counts[o] = (counts[o] || 0) + 1;
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
  }, [guias]);

  const topExcepciones = useMemo(() => {
    const counts: Record<string, number> = {};
    guias.forEach((g) => {
      getExcepciones(g).forEach((e) => {
        counts[e] = (counts[e] || 0) + 1;
      });
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([name, total]) => ({ name, total }));
  }, [guias]);

  // Resumen sencillo de excepciones y devoluciones (Top 5, agrupando
  // cadenas como AUSENCIA/AUSENCIA 2/AUSENCIA 3 en una sola categoría) —
  // misma lógica que el módulo Excepciones y Devoluciones, en versión
  // reducida para una lectura rápida desde Resumen.
  const resumenExcepciones = useMemo(() => calcularResumenExcepciones(guias, 5), [guias]);
  const resumenDevoluciones = useMemo(() => calcularResumenDevoluciones(guias, 5), [guias]);

  const estadosChartData = useMemo(
    () => estados.map(([name, value]) => ({ name, value, color: colorParaEstado(name) })),
    [estados]
  );

  const oficinasChartData = useMemo(
    () => topOficinas.map(([name, total]) => ({ name, total })),
    [topOficinas]
  );

  const totalSinPredoc = useMemo(() => guias.filter((g) => !g.es_predoc && !g.es_documentada).length, [guias]);
  const estadosOrden = useSortableTable<[string, number]>(estados, (item, key) => {
    if (key === 'estado') return item[0];
    if (key === 'guias') return item[1];
    if (key === 'pct') return totalSinPredoc ? item[1] / totalSinPredoc : 0;
    return null;
  });
  const topOficinasOrden = useSortableTable<[string, number]>(topOficinas, (item, key) => {
    if (key === 'oficina') return item[0];
    if (key === 'guias') return item[1];
    return null;
  });

  // Guías abiertas (originales, en tránsito) por entidad y por oficina —
  // el badge del KPI "Abiertas" ya muestra el total; esto desglosa dónde
  // se concentran, para poder priorizar.
  const guiasAbiertasLista = useMemo(
    () => guias.filter((g) => esGuiaOriginal(g) && isAbiertaPorEstado(g)),
    [guias]
  );
  const abiertasPorEntidad = useMemo(
    () => topPorCampo(guiasAbiertasLista, (g) => g.entidad_destinatario, 10),
    [guiasAbiertasLista]
  );
  const abiertasPorOficina = useMemo(
    () => topPorCampo(guiasAbiertasLista, (g) => g.oficina_destino, 10),
    [guiasAbiertasLista]
  );
  const abiertasPorEntidadChart = useMemo(
    () => abiertasPorEntidad.map(({ key, count }) => ({ name: key, total: count })),
    [abiertasPorEntidad]
  );
  const abiertasPorOficinaChart = useMemo(
    () => abiertasPorOficina.map(({ key, count }) => ({ name: key, total: count })),
    [abiertasPorOficina]
  );
  const abiertasEntidadOrden = useSortableTable<{ key: string; count: number }>(abiertasPorEntidad, (item, key) => {
    if (key === 'entidad') return item.key;
    if (key === 'guias') return item.count;
    return null;
  });
  const abiertasOficinaOrden = useSortableTable<{ key: string; count: number }>(abiertasPorOficina, (item, key) => {
    if (key === 'oficina') return item.key;
    if (key === 'guias') return item.count;
    return null;
  });

  function generarInformeLogistico() {
    // Para el informe usamos un top 10 (más completo que el resumen de
    // 5 que se ve en pantalla), calculado fresco aquí mismo con las
    // mismas funciones compartidas del resto del sistema.
    const excepcionesInforme = calcularResumenExcepciones(guias, 10);
    const devolucionesInforme = calcularResumenDevoluciones(guias, 10);

    // Separar el Top de excepciones por a quién es atribuible — ver
    // categoriaExcepcion() en business-logic.ts para la clasificación
    // propuesta (revisable/ajustable).
    const excepcionesTodas = calcularResumenExcepciones(guias, 1000).porTipo;
    const excepcionesCliente = excepcionesTodas.filter((e) => categoriaExcepcion(e.key) === 'cliente').slice(0, 10);
    const excepcionesOperacion = excepcionesTodas
      .filter((e) => categoriaExcepcion(e.key) === 'operacion')
      .slice(0, 10);
    const totalExcepcionesCliente = excepcionesTodas
      .filter((e) => categoriaExcepcion(e.key) === 'cliente')
      .reduce((s, e) => s + e.count, 0);
    const totalExcepcionesOperacion = excepcionesTodas
      .filter((e) => categoriaExcepcion(e.key) === 'operacion')
      .reduce((s, e) => s + e.count, 0);

    // Temporalidad de guías abiertas: mismos rangos que ya usa el sistema
    // para las alertas de días sin movimiento (nivelAlertaPorDias), para
    // que el informe no invente un corte nuevo distinto al que ya se ve
    // en pantalla en otros módulos.
    const guiasAbiertas = guias.filter((g) => esGuiaOriginal(g) && isAbiertaPorEstado(g));
    const temporalidadAbiertas = { menos3: 0, entre4y7: 0, entre8y14: 0, mas15: 0 };
    guiasAbiertas.forEach((g) => {
      const d = g.dias_sin_movimiento;
      if (d === null || d === undefined) return;
      if (d < 3) temporalidadAbiertas.menos3++;
      else if (d <= 7) temporalidadAbiertas.entre4y7++;
      else if (d <= 14) temporalidadAbiertas.entre8y14++;
      else temporalidadAbiertas.mas15++;
    });

    // Cierre operativo: guías abiertas con 30+ días sin movimiento — el
    // corte que pidió el cliente para su "cierre operativo".
    const pendientes30Mas = guiasAbiertas.filter((g) => (g.dias_sin_movimiento ?? 0) >= 30);
    const cierre30PorOficina = topPorCampo(pendientes30Mas, (g) => g.oficina_destino, 10);

    // Efectividad por Entidad (no por oficina): el cliente pidió ver la
    // efectividad específicamente a este nivel de detalle.
    const gruposEntidad: Record<string, Guia[]> = {};
    guias.filter(esGuiaOriginal).forEach((g) => {
      const key = g.entidad_destinatario || 'SIN DATO';
      if (!gruposEntidad[key]) gruposEntidad[key] = [];
      gruposEntidad[key].push(g);
    });
    const efectividadPorEntidadInforme = Object.entries(gruposEntidad)
      .map(([key, lista]) => {
        const entregadasN = lista.filter((g) => isEntregada(g.estado_guia)).length;
        const devolucionesN = lista.filter((g) => g.es_devolucion).length;
        const abiertasN = lista.filter((g) => isAbiertaPorEstado(g)).length;
        return {
          key,
          efectividad: calcularEfectividad(entregadasN, devolucionesN, abiertasN),
          total: lista.length,
        };
      })
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);

    // Resumen geográfico (versión resumida del módulo Geográfico): top
    // entidades y ciudades por volumen, para dar contexto de dónde se
    // concentra la operación sin tener que abrir ese módulo aparte.
    const guiasParaGeo = guias.filter(esGuiaOriginal);
    const topEntidadesVolumen = topPorCampo(guiasParaGeo, (g) => g.entidad_destinatario, 5);
    const topCiudades = topPorCampo(guiasParaGeo, (g) => g.ciudad_destinatario, 5);

    const clientesDistintos = [...new Set(guias.map((g) => g.cliente).filter(Boolean))] as string[];
    const cliente =
      clientesDistintos.length === 1
        ? clientesDistintos[0]
        : clientesDistintos.length > 1
          ? `Varios clientes (${clientesDistintos.length})`
          : 'Sin cliente';

    const mesesDoc = guias
      .map((g) => g.f_documentacion)
      .filter((f): f is string => !!f)
      .sort();
    const periodoTexto = mesesDoc.length
      ? (() => {
          const min = mesesDoc[0].slice(0, 7);
          const max = mesesDoc[mesesDoc.length - 1].slice(0, 7);
          return min === max ? formatearPeriodo(min) : `${formatearPeriodo(min)} – ${formatearPeriodo(max)}`;
        })()
      : 'Periodo no disponible';

    exportInformeLogisticoPDF({
      cliente,
      periodoTexto,
      kpis: {
        totalProcesadas: kpis.totalOriginales,
        entregadas: kpis.entregadas,
        devoluciones: kpis.devoluciones,
        abiertas: kpis.abiertas,
        canceladas: kpis.canceladas,
        efectividad: kpis.efectividad,
        tiempoPromedioEntregaDias: kpis.tiempoEntrega.promedioDias,
        retornosAbiertos: kpis.retornosAbiertos,
      },
      topExcepciones: excepcionesInforme.porTipo,
      totalConExcepcion: excepcionesInforme.total,
      topOficinas: topOficinas.map(([key, count]) => ({ key, count })),
      totalGuias: guias.length,
      topDevolucionesPorOficina: devolucionesInforme.porOficina,
      topDevolucionesPorMotivo: devolucionesInforme.porMotivo,
      totalDevoluciones: devolucionesInforme.total,
      temporalidadAbiertas,
      totalAbiertas: guiasAbiertas.length,
      pendientes30Mas: pendientes30Mas.length,
      cierre30PorOficina,
      efectividadPorEntidad: efectividadPorEntidadInforme,
      topEntidadesVolumen,
      topCiudades,
      excepcionesCliente,
      totalExcepcionesCliente,
      excepcionesOperacion,
      totalExcepcionesOperacion,
    });
  }

  return (
    <div className="p-5 space-y-5">
      <div className="flex justify-end">
        <button
          onClick={generarInformeLogistico}
          className="text-[12px] font-semibold text-white bg-[var(--vg-blue)] rounded-md px-3 py-1.5 hover:opacity-90"
        >
          📄 Generar Informe Logístico
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-12 gap-3">
        <KpiCard
          title="Guías Procesadas"
          value={kpis.totalOriginales.toLocaleString('es-MX')}
          subtitle="Entregadas + devoluciones + abiertas (no incluye predoc, documentadas, canceladas ni retornos) — métrica principal de volumen"
          accentColor="#0F172A"
        />
        <KpiCard
          title="Entregadas"
          value={kpis.entregadas.toLocaleString('es-MX')}
          subtitle="Efectivas (no incluye retornos)"
          accentColor="#0B9B67"
        />
        <KpiCard
          title="Devoluciones"
          value={kpis.devoluciones.toLocaleString('es-MX')}
          subtitle="Guías marcadas DEVOLUCION"
          accentColor="#DC2626"
        />
        <KpiCard
          title="Guías de Retorno"
          value={kpis.totalGuiasRetorno.toLocaleString('es-MX')}
          subtitle={`Referenciadas por devolución · Entregados: ${kpis.guiasRetornoEntregadas} · Abiertos: ${kpis.retornosAbiertos}`}
          accentColor="#7C3AED"
        />
        <KpiCard
          title="Posible Retorno (otro periodo)"
          value={kpis.totalPosibleRetornoOtroPeriodo.toLocaleString('es-MX')}
          subtitle={`Mismo cliente=destinatario, sin vínculo en este corte · Entregados: ${kpis.posibleRetornoEntregados}`}
          accentColor="#B45309"
        />
        <KpiCard
          title="Abiertas"
          value={kpis.abiertas.toLocaleString('es-MX')}
          subtitle="Guías procesadas en proceso (no incluye retornos)"
          accentColor="#EA7C1A"
        />
        <KpiCard
          title="Retornos Abiertos"
          value={kpis.retornosAbiertos.toLocaleString('es-MX')}
          subtitle="Devoluciones cuyo paquete de retorno aún no llega"
          accentColor="#9333EA"
        />
        <KpiCard
          title="Efectividad"
          value={kpis.efectividad !== null ? `${kpis.efectividad}%` : '—'}
          subtitle="Ent. / (Ent.+Dev.+Ab.)"
          accentColor={colorEfectividad(kpis.efectividad)}
        />
        <KpiCard
          title="Tiempo Prom. de Entrega"
          value={kpis.tiempoEntrega.promedioDias !== null ? `${kpis.tiempoEntrega.promedioDias} días` : '—'}
          subtitle={
            kpis.tiempoEntrega.muestras
              ? `Mediana: ${kpis.tiempoEntrega.medianaDias} días · Entregadas: ${kpis.tiempoEntrega.muestrasEntregadas.toLocaleString('es-MX')} · Abiertas (a hoy): ${kpis.tiempoEntrega.muestrasAbiertas.toLocaleString('es-MX')}`
              : 'Sin datos suficientes'
          }
          accentColor="#0891B2"
        />
        <KpiCard
          title="Pre-Documentadas"
          value={kpis.predoc.toLocaleString('es-MX')}
          subtitle="Fuera de indicadores"
          accentColor="#14532D"
        />
        <KpiCard
          title="Documentadas"
          value={kpis.documentadas.toLocaleString('es-MX')}
          subtitle="Fuera de indicadores (aún no inicia movimiento)"
          accentColor="#0891B2"
        />
        <KpiCard
          title="Canceladas"
          value={kpis.canceladas.toLocaleString('es-MX')}
          subtitle="Fuera de indicadores"
          accentColor="#64748B"
        />
      </div>

      <div className="bg-white rounded-lg border border-[var(--vg-border)] px-4 py-2.5 text-[11.5px] text-[var(--vg-text2)] flex flex-wrap gap-x-6 gap-y-1">
        <span>
          <strong className="text-[var(--vg-text)]">Cuadre (Guías Procesadas):</strong> {kpis.entregadas.toLocaleString('es-MX')}{' '}
          entregadas + {kpis.devoluciones.toLocaleString('es-MX')} devoluciones + {kpis.abiertas.toLocaleString('es-MX')}{' '}
          abiertas = {kpis.totalOriginales.toLocaleString('es-MX')}
          {' '}(predoc, documentadas y canceladas se cuentan aparte, no forman parte de este total)
        </span>
        <span>
          <strong className="text-[var(--vg-text)]">Efectividad:</strong> {kpis.entregadas.toLocaleString('es-MX')} entregadas /
          ({kpis.entregadas.toLocaleString('es-MX')} + {kpis.devoluciones.toLocaleString('es-MX')} devoluciones +{' '}
          {kpis.abiertas.toLocaleString('es-MX')} abiertas) · Retornos abiertos ({kpis.retornosAbiertos.toLocaleString('es-MX')}) se muestran aparte, sin afectar este %
        </span>
        <span>
          <strong className="text-[var(--vg-text)]">Total sin duplicadas:</strong> {kpis.totalOriginales.toLocaleString('es-MX')}{' '}
          procesadas + {kpis.totalPosibleRetornoOtroPeriodo.toLocaleString('es-MX')} posible retorno otro periodo +{' '}
          {kpis.predoc.toLocaleString('es-MX')} predoc + {kpis.documentadas.toLocaleString('es-MX')} documentadas +{' '}
          {kpis.canceladas.toLocaleString('es-MX')} canceladas = {kpis.totalSinDuplicadas.toLocaleString('es-MX')}
        </span>
        <span>
          <strong className="text-[var(--vg-text)]">Filas en el archivo:</strong> {kpis.totalSinDuplicadas.toLocaleString('es-MX')}{' '}
          + {kpis.guiasRetornoConFilaPropia.toLocaleString('es-MX')} retorno (fila propia, duplicada) ={' '}
          {kpis.totalFilas.toLocaleString('es-MX')} filas
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <TopListPanel
          title="Resumen de Excepciones — Top 5 por Tipo"
          subtitle="Agrupa cadenas (AUSENCIA, AUSENCIA 2, AUSENCIA 3 = una sola categoría)"
          items={resumenExcepciones.porTipo}
          total={resumenExcepciones.total}
          accentColor="#7C3AED"
        />
        <TopListPanel
          title="Resumen de Devoluciones — Top 5 por Oficina Destino"
          items={resumenDevoluciones.porOficina}
          total={resumenDevoluciones.total}
          accentColor="#DC2626"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-lg border border-[var(--vg-border)] p-4">
          <div className="font-bold text-[12.5px] mb-3">Estados de Guías (sin pre-doc. ni documentada)</div>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={estadosChartData}
                dataKey="value"
                nameKey="name"
                cx="38%"
                cy="50%"
                outerRadius={85}
                labelLine={false}
                label={({ percent }) => `${((percent ?? 0) * 100).toFixed(1)}%`}
              >
                {estadosChartData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value, name) => {
                  const v = typeof value === 'number' ? value : Number(value) || 0;
                  const pct = totalSinPredoc ? ((v / totalSinPredoc) * 100).toFixed(1) : '0.0';
                  return [`${v.toLocaleString('es-MX')} (${pct}%)`, name];
                }}
              />
              <Legend
                layout="vertical"
                align="right"
                verticalAlign="middle"
                wrapperStyle={{ fontSize: 11, lineHeight: '20px' }}
                formatter={(value: string) => {
                  const item = estadosChartData.find((e) => e.name === value);
                  const pct = item && totalSinPredoc ? ((item.value / totalSinPredoc) * 100).toFixed(1) : '0.0';
                  return `${value} (${pct}%)`;
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-lg border border-[var(--vg-border)] p-4">
          <div className="font-bold text-[12.5px] mb-3">Top 10 Oficinas por Volumen</div>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={oficinasChartData} layout="vertical" margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" fontSize={11} />
              <YAxis type="category" dataKey="name" width={115} fontSize={10} />
              <Tooltip />
              <Bar dataKey="total" fill="#1E3A8A" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-lg border border-[var(--vg-border)] p-4 lg:col-span-2">
          <div className="font-bold text-[12.5px] mb-3">Top 12 Excepciones más Frecuentes</div>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={topExcepciones} margin={{ bottom: 90, left: 10, right: 20, top: 5 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" angle={-40} textAnchor="end" interval={0} fontSize={10} height={110} />
              <YAxis fontSize={11} />
              <Tooltip />
              <Bar dataKey="total" radius={[4, 4, 0, 0]}>
                {topExcepciones.map((_, i) => (
                  <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-lg border border-[var(--vg-border)] p-4">
          <div className="font-bold text-[12.5px] mb-3">Guías Abiertas por Entidad</div>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={abiertasPorEntidadChart} layout="vertical" margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" fontSize={11} />
              <YAxis type="category" dataKey="name" width={115} fontSize={10} />
              <Tooltip />
              <Bar dataKey="total" fill="#EA7C1A" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <div className="overflow-x-auto vg-scroll mt-3">
            <table className="vg-table">
              <thead>
                <tr>
                  <SortableTh label="Entidad" sortKey="entidad" currentKey={abiertasEntidadOrden.sortKey} currentDir={abiertasEntidadOrden.sortDir} onSort={abiertasEntidadOrden.requestSort} />
                  <SortableTh label="Guías Abiertas" sortKey="guias" currentKey={abiertasEntidadOrden.sortKey} currentDir={abiertasEntidadOrden.sortDir} onSort={abiertasEntidadOrden.requestSort} />
                </tr>
              </thead>
              <tbody>
                {abiertasEntidadOrden.sorted.map(({ key, count }) => (
                  <tr key={key}>
                    <td className="font-medium">{key}</td>
                    <td>{count.toLocaleString('es-MX')}</td>
                  </tr>
                ))}
                {!abiertasPorEntidad.length && (
                  <tr>
                    <td colSpan={2} className="text-center text-[var(--vg-text3)] py-4">
                      Sin guías abiertas en este corte
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-[var(--vg-border)] p-4">
          <div className="font-bold text-[12.5px] mb-3">Guías Abiertas por Oficina</div>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={abiertasPorOficinaChart} layout="vertical" margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" fontSize={11} />
              <YAxis type="category" dataKey="name" width={115} fontSize={10} />
              <Tooltip />
              <Bar dataKey="total" fill="#7C3AED" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <div className="overflow-x-auto vg-scroll mt-3">
            <table className="vg-table">
              <thead>
                <tr>
                  <SortableTh label="Oficina" sortKey="oficina" currentKey={abiertasOficinaOrden.sortKey} currentDir={abiertasOficinaOrden.sortDir} onSort={abiertasOficinaOrden.requestSort} />
                  <SortableTh label="Guías Abiertas" sortKey="guias" currentKey={abiertasOficinaOrden.sortKey} currentDir={abiertasOficinaOrden.sortDir} onSort={abiertasOficinaOrden.requestSort} />
                </tr>
              </thead>
              <tbody>
                {abiertasOficinaOrden.sorted.map(({ key, count }) => (
                  <tr key={key}>
                    <td className="font-medium">{key}</td>
                    <td>{count.toLocaleString('es-MX')}</td>
                  </tr>
                ))}
                {!abiertasPorOficina.length && (
                  <tr>
                    <td colSpan={2} className="text-center text-[var(--vg-text3)] py-4">
                      Sin guías abiertas en este corte
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-lg border border-[var(--vg-border)] overflow-hidden">
          <div className="px-4 py-2.5 font-bold text-[12.5px] border-b border-[var(--vg-border)]">
            Estados de Guías (sin pre-doc. ni documentada)
          </div>
          <table className="vg-table">
            <thead>
              <tr>
                <SortableTh label="Estado" sortKey="estado" currentKey={estadosOrden.sortKey} currentDir={estadosOrden.sortDir} onSort={estadosOrden.requestSort} />
                <SortableTh label="Guías" sortKey="guias" currentKey={estadosOrden.sortKey} currentDir={estadosOrden.sortDir} onSort={estadosOrden.requestSort} />
                <SortableTh label="%" sortKey="pct" currentKey={estadosOrden.sortKey} currentDir={estadosOrden.sortDir} onSort={estadosOrden.requestSort} />
              </tr>
            </thead>
            <tbody>
              {estadosOrden.sorted.map(([estado, n]) => (
                <tr key={estado}>
                  <td className="font-medium">{estado}</td>
                  <td>{n.toLocaleString('es-MX')}</td>
                  <td>{((n / (totalSinPredoc || 1)) * 100).toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="bg-white rounded-lg border border-[var(--vg-border)] overflow-hidden">
          <div className="px-4 py-2.5 font-bold text-[12.5px] border-b border-[var(--vg-border)]">
            Top 10 Oficinas por Volumen
          </div>
          <table className="vg-table">
            <thead>
              <tr>
                <SortableTh label="Oficina" sortKey="oficina" currentKey={topOficinasOrden.sortKey} currentDir={topOficinasOrden.sortDir} onSort={topOficinasOrden.requestSort} />
                <SortableTh label="Guías" sortKey="guias" currentKey={topOficinasOrden.sortKey} currentDir={topOficinasOrden.sortDir} onSort={topOficinasOrden.requestSort} />
              </tr>
            </thead>
            <tbody>
              {topOficinasOrden.sorted.map(([oficina, n]) => (
                <tr key={oficina}>
                  <td className="font-medium">{oficina}</td>
                  <td>{n.toLocaleString('es-MX')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
