'use client';

import { useMemo } from 'react';
import { Guia } from '@/lib/types';
import { isEntregada, isAbiertaPorEstado, colorEfectividad, calcularEfectividad, getExcepciones, esRetornoAmplio, calcularTiempoPromedioEntrega } from '@/lib/business-logic';
import KpiCard from '@/components/KpiCard';
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

const ESTADO_COLORS: Record<string, string> = {
  ENTREGADA: '#0B9B67',
  'ENTREGADA (RETORNO)': '#7C3AED',
  DEVOLUCION: '#DC2626',
  'EN RUTA': '#1E3A8A',
  'EN ALMACEN': '#EA7C1A',
  'LISTO PARA ENTREGAR': '#7C3AED',
  EMBARCADA: '#0891B2',
  TRANSBORDADA: '#64748B',
};
const PALETTE = ['#1E3A8A', '#0B9B67', '#EA7C1A', '#DC2626', '#7C3AED', '#0891B2', '#64748B', '#B45309', '#14532D', '#831843'];

export default function ResumenModule({ guias }: { guias: Guia[] }) {
  const kpis = useMemo(() => {
    const totalFilas = guias.length;

    // "Guías de retorno": guías devueltas que ya tienen su número de retorno
    // referenciado en la columna Retorno (1 por cada devolución)
    const devolucionesConRetorno = guias.filter((g) => g.es_devolucion && g.retorno_guia);
    const guiasRetornoEntregadas = devolucionesConRetorno.filter(
      (g) => (g.retorno_estado || '').toUpperCase() === 'ENTREGADA'
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
      predoc,
      efectividad,
      tiempoEntrega,
    };
  }, [guias]);

  const estados = useMemo(() => {
    const counts: Record<string, number> = {};
    guias
      .filter((g) => !g.es_predoc)
      .forEach((g) => {
        let e = g.estado_guia || 'SIN ESTADO';
        // Distinguir entregas de guías originales vs entregas de retornos
        if (e === 'ENTREGADA' && esRetornoAmplio(g)) e = 'ENTREGADA (RETORNO)';
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

  const estadosChartData = useMemo(
    () => estados.map(([name, value]) => ({ name, value, color: ESTADO_COLORS[name] || '#94A3B8' })),
    [estados]
  );

  const oficinasChartData = useMemo(
    () => topOficinas.map(([name, total]) => ({ name, total })),
    [topOficinas]
  );

  return (
    <div className="p-5 space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-10 gap-3">
        <KpiCard
          title="Total (sin duplicadas)"
          value={kpis.totalSinDuplicadas.toLocaleString('es-MX')}
          subtitle="Guías originales + posible retorno otro periodo"
          accentColor="#1E3A8A"
        />
        <KpiCard
          title="Guías Originales"
          value={kpis.totalOriginales.toLocaleString('es-MX')}
          subtitle="Entregadas + devoluciones + abiertas + predoc"
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
          subtitle="Guías originales en proceso (no incluye retornos)"
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
              ? `Mediana: ${kpis.tiempoEntrega.medianaDias} días · Doc. → Entrega · n=${kpis.tiempoEntrega.muestras.toLocaleString('es-MX')}`
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
          <strong className="text-[var(--vg-text)]">Cuadre (Guías Originales):</strong> {kpis.entregadas.toLocaleString('es-MX')}{' '}
          entregadas + {kpis.devoluciones.toLocaleString('es-MX')} devoluciones + {kpis.abiertas.toLocaleString('es-MX')}{' '}
          abiertas + {kpis.predoc.toLocaleString('es-MX')} predoc = {kpis.totalOriginales.toLocaleString('es-MX')}
        </span>
        <span>
          <strong className="text-[var(--vg-text)]">Efectividad:</strong> {kpis.entregadas.toLocaleString('es-MX')} entregadas /
          ({kpis.entregadas.toLocaleString('es-MX')} + {kpis.devoluciones.toLocaleString('es-MX')} devoluciones +{' '}
          {kpis.abiertas.toLocaleString('es-MX')} abiertas) · Retornos abiertos ({kpis.retornosAbiertos.toLocaleString('es-MX')}) se muestran aparte, sin afectar este %
        </span>
        <span>
          <strong className="text-[var(--vg-text)]">Total sin duplicadas:</strong> {kpis.totalOriginales.toLocaleString('es-MX')}{' '}
          originales + {kpis.totalPosibleRetornoOtroPeriodo.toLocaleString('es-MX')} posible retorno otro periodo ={' '}
          {kpis.totalSinDuplicadas.toLocaleString('es-MX')}
        </span>
        <span>
          <strong className="text-[var(--vg-text)]">Filas en el archivo:</strong> {kpis.totalSinDuplicadas.toLocaleString('es-MX')}{' '}
          + {kpis.guiasRetornoConFilaPropia.toLocaleString('es-MX')} retorno (fila propia, duplicada) ={' '}
          {kpis.totalFilas.toLocaleString('es-MX')} filas
        </span>
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
                <th>Estado</th>
                <th>Guías</th>
                <th>%</th>
              </tr>
            </thead>
            <tbody>
              {estados.map(([estado, n]) => (
                <tr key={estado}>
                  <td className="font-medium">{estado}</td>
                  <td>{n.toLocaleString('es-MX')}</td>
                  <td>{((n / (guias.filter((g) => !g.es_predoc).length || 1)) * 100).toFixed(1)}%</td>
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
                <th>Oficina</th>
                <th>Guías</th>
              </tr>
            </thead>
            <tbody>
              {topOficinas.map(([oficina, n]) => (
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
