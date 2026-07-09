'use client';

import { useMemo } from 'react';
import { Guia } from '@/lib/types';
import { isEntregada, isAbiertaPorEstado, isCancelada, colorEfectividad, calcularEfectividad, getExcepciones, calcularTiempoPromedioEntrega, calcularResumenExcepciones, calcularResumenDevoluciones, retornoEstaEntregado } from '@/lib/business-logic';
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
    const guiasOriginales = guias.filter((g) => !g.es_retorno && !g.es_posible_retorno_otro_periodo && !g.es_predoc);

    // Las predoc se cuentan directo desde todas las guías (no desde originales, ya las excluimos)
    const predoc = guias.filter((g) => g.es_predoc).length;

    const entregadas = guiasOriginales.filter((g) => isEntregada(g.estado_guia)).length;
    const devoluciones = guiasOriginales.filter((g) => g.es_devolucion).length;
    const abiertas = guiasOriginales.filter((g) => isAbiertaPorEstado(g)).length;
    // Las canceladas SÍ forman parte de "guías procesadas" (guiasOriginales
    // no las excluye), pero no caen en entregadas, devoluciones ni abiertas
    // (isAbiertaPorEstado las excluye explícitamente). Sin este bucket, la
    // suma de los otros tres no cuadra contra el total — antes el cuadre
    // sumaba "+ predoc" por error, cuando predoc ni siquiera es parte de
    // guiasOriginales (se excluye desde el filtro de arriba).
    const canceladas = guiasOriginales.filter((g) => isCancelada(g.estado_guia)).length;

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

    // "Total sin duplicadas": originales (ya sin predoc) + posible retorno + predoc
    // Para que el cuadre de filas sea transparente
    const totalSinDuplicadas = guiasOriginales.length + posibleRetornoOtroPeriodo.length + predoc;

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
      efectividad,
      tiempoEntrega,
    };
  }, [guias, retornoPorGuia]);

  const estados = useMemo(() => {
    const counts: Record<string, number> = {};
    guias
      .filter((g) => !g.es_predoc)
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

  const totalSinPredoc = useMemo(() => guias.filter((g) => !g.es_predoc).length, [guias]);
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

  return (
    <div className="p-5 space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-11 gap-3">
        <KpiCard
          title="Guías Procesadas"
          value={kpis.totalOriginales.toLocaleString('es-MX')}
          subtitle="Entregadas + devoluciones + abiertas + canceladas (no incluye predoc ni retornos) — métrica principal de volumen"
          accentColor="#0F172A"
        />
        <KpiCard
          title="Total (sin duplicadas)"
          value={kpis.totalSinDuplicadas.toLocaleString('es-MX')}
          subtitle="Guías procesadas + posible retorno otro periodo"
          accentColor="#1E3A8A"
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
      </div>

      <div className="bg-white rounded-lg border border-[var(--vg-border)] px-4 py-2.5 text-[11.5px] text-[var(--vg-text2)] flex flex-wrap gap-x-6 gap-y-1">
        <span>
          <strong className="text-[var(--vg-text)]">Cuadre (Guías Procesadas):</strong> {kpis.entregadas.toLocaleString('es-MX')}{' '}
          entregadas + {kpis.devoluciones.toLocaleString('es-MX')} devoluciones + {kpis.abiertas.toLocaleString('es-MX')}{' '}
          abiertas + {kpis.canceladas.toLocaleString('es-MX')} canceladas = {kpis.totalOriginales.toLocaleString('es-MX')}
          {' '}(predoc se cuenta aparte, no forma parte de este total)
        </span>
        <span>
          <strong className="text-[var(--vg-text)]">Efectividad:</strong> {kpis.entregadas.toLocaleString('es-MX')} entregadas /
          ({kpis.entregadas.toLocaleString('es-MX')} + {kpis.devoluciones.toLocaleString('es-MX')} devoluciones +{' '}
          {kpis.abiertas.toLocaleString('es-MX')} abiertas) · Retornos abiertos ({kpis.retornosAbiertos.toLocaleString('es-MX')}) se muestran aparte, sin afectar este %
        </span>
        <span>
          <strong className="text-[var(--vg-text)]">Total sin duplicadas:</strong> {kpis.totalOriginales.toLocaleString('es-MX')}{' '}
          procesadas + {kpis.totalPosibleRetornoOtroPeriodo.toLocaleString('es-MX')} posible retorno otro periodo ={' '}
          {kpis.totalSinDuplicadas.toLocaleString('es-MX')}
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
          <div className="font-bold text-[12.5px] mb-3">Estados de Guías (sin pre-doc.)</div>
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
              >
                {estadosChartData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
              <Legend
                layout="vertical"
                align="right"
                verticalAlign="middle"
                wrapperStyle={{ fontSize: 11, lineHeight: '20px' }}
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
        <div className="bg-white rounded-lg border border-[var(--vg-border)] overflow-hidden">
          <div className="px-4 py-2.5 font-bold text-[12.5px] border-b border-[var(--vg-border)]">
            Estados de Guías (sin pre-doc.)
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
