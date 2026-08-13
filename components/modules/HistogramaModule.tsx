'use client';

import { useMemo, useState } from 'react';
import { Guia } from '@/lib/types';
import { formatearDia, formatearPeriodo, topPorCampo, isCancelada, esRetornoAmplio } from '@/lib/business-logic';
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { exportToExcel, exportToPDF } from '@/lib/export';
import { useSortableTable } from '@/lib/useSortableTable';
import SortableTh from '@/components/SortableTh';
import KpiCard from '@/components/KpiCard';

type Vista = 'total' | 'oficina' | 'entidad';

const TOP_N = 8;
const COLORES = [
  '#1E3A8A', '#0B9B67', '#DC2626', '#B45309',
  '#7C3AED', '#0891B2', '#BE185D', '#4D7C0F',
];
const COLOR_OTRAS = '#94A3B8';
const COLOR_SIN_DATO = '#CBD5E1';

// Devuelve el campo relevante de la guía según la vista de desglose elegida.
// 'total' no desglosa (retorna null), por lo que todas las guías caen en
// una sola serie.
function campoParaVista(vista: Vista, g: Guia): string | null | undefined {
  if (vista === 'oficina') return g.oficina_destino;
  if (vista === 'entidad') return g.entidad_destinatario;
  return null;
}

// Formato compacto dd/mm para el eje X (formatearDia es demasiado largo
// para mostrarse rotado en 30+ barras).
function formatearFechaCorta(yyyyMmDd: string): string {
  const partes = yyyyMmDd.split('-');
  if (partes.length !== 3) return yyyyMmDd;
  return `${partes[2]}/${partes[1]}`;
}

function colorDeSerie(serie: string, i: number): string {
  if (serie === 'Otras') return COLOR_OTRAS;
  if (serie === 'Sin dato') return COLOR_SIN_DATO;
  return COLORES[i % COLORES.length];
}

export default function HistogramaModule({ guias }: { guias: Guia[] }) {
  const [vista, setVista] = useState<Vista>('total');

  // Guías originales asignadas por el cliente: con F_Documentacion válida,
  // excluyendo canceladas, pre-documentadas y retornos (explícitos o
  // posible retorno de otro periodo) — estas últimas no son asignación
  // nueva del cliente, sino el regreso de una guía ya asignada antes.
  const guiasConFecha = useMemo(
    () =>
      guias.filter(
        (g) => !!g.f_documentacion && !g.es_predoc && !isCancelada(g.estado_guia) && !esRetornoAmplio(g)
      ),
    [guias]
  );

  // Top N categorías (oficina o entidad) para no saturar el gráfico con
  // decenas de series; el resto cae en 'Otras'. Se calcula una sola vez
  // sobre todo el corte para que la misma categoría tenga el mismo color
  // y significado tanto en la vista diaria como en la mensual.
  const seriesTop = useMemo(() => {
    if (vista === 'total') return [];
    return topPorCampo(guiasConFecha, (g) => campoParaVista(vista, g), TOP_N).map((t) => t.key);
  }, [guiasConFecha, vista]);

  // ============================================================
  // Vista diaria
  // ============================================================
  const datosPorDia = useMemo(() => {
    const grupos: Record<string, Record<string, number>> = {};
    guiasConFecha.forEach((g) => {
      const fecha = g.f_documentacion as string;
      if (!grupos[fecha]) grupos[fecha] = {};
      if (vista === 'total') {
        grupos[fecha].total = (grupos[fecha].total || 0) + 1;
      } else {
        const valor = (campoParaVista(vista, g) || '').trim();
        const key = !valor ? 'Sin dato' : seriesTop.includes(valor) ? valor : 'Otras';
        grupos[fecha][key] = (grupos[fecha][key] || 0) + 1;
      }
    });
    return Object.entries(grupos)
      .map(([fecha, valores]) => ({
        fecha,
        ...valores,
        total: Object.values(valores).reduce((s, v) => s + v, 0),
      }))
      .sort((a, b) => a.fecha.localeCompare(b.fecha));
  }, [guiasConFecha, vista, seriesTop]);

  const hayOtras = useMemo(() => datosPorDia.some((d) => 'Otras' in d), [datosPorDia]);
  const haySinDato = useMemo(() => datosPorDia.some((d) => 'Sin dato' in d), [datosPorDia]);

  const columnasSerie = useMemo(() => {
    if (vista === 'total') return [];
    return [...seriesTop, ...(hayOtras ? ['Otras'] : []), ...(haySinDato ? ['Sin dato'] : [])];
  }, [vista, seriesTop, hayOtras, haySinDato]);

  const kpis = useMemo(() => {
    const dias = datosPorDia.length;
    const total = guiasConFecha.length;
    const promedio = dias ? total / dias : 0;
    const pico = datosPorDia.reduce(
      (max, d) => (d.total > (max?.total || 0) ? d : max),
      null as (typeof datosPorDia)[0] | null
    );
    const fechas = datosPorDia.map((d) => d.fecha);
    return {
      total,
      dias,
      promedio,
      pico,
      desde: fechas[0] || null,
      hasta: fechas[fechas.length - 1] || null,
    };
  }, [datosPorDia, guiasConFecha]);

  const { sorted, sortKey, sortDir, requestSort } = useSortableTable<(typeof datosPorDia)[0]>(
    datosPorDia,
    (d, key) => (key === 'fecha' ? d.fecha : ((d as unknown as Record<string, number>)[key] ?? 0)),
    'fecha',
    'asc'
  );

  const columnasExport = [
    { header: 'Fecha', value: (d: (typeof datosPorDia)[0]) => formatearDia(d.fecha) },
    ...columnasSerie.map((s) => ({
      header: s,
      value: (d: (typeof datosPorDia)[0]) => (d as unknown as Record<string, number>)[s] || 0,
    })),
    { header: 'Total', value: (d: (typeof datosPorDia)[0]) => d.total },
  ];

  // ============================================================
  // Comparativo mensual — solo tiene sentido si el corte actual
  // (después de filtros globales) abarca más de un periodo.
  // ============================================================
  const datosPorMes = useMemo(() => {
    const grupos: Record<string, Record<string, number>> = {};
    guiasConFecha.forEach((g) => {
      const mes = (g.f_documentacion as string).slice(0, 7);
      if (!grupos[mes]) grupos[mes] = {};
      if (vista === 'total') {
        grupos[mes].total = (grupos[mes].total || 0) + 1;
      } else {
        const valor = (campoParaVista(vista, g) || '').trim();
        const key = !valor ? 'Sin dato' : seriesTop.includes(valor) ? valor : 'Otras';
        grupos[mes][key] = (grupos[mes][key] || 0) + 1;
      }
    });
    return Object.entries(grupos)
      .map(([mes, valores]) => ({
        mes,
        ...valores,
        total: Object.values(valores).reduce((s, v) => s + v, 0),
      }))
      .sort((a, b) => a.mes.localeCompare(b.mes));
  }, [guiasConFecha, vista, seriesTop]);

  const hayMasDeUnPeriodo = datosPorMes.length > 1;

  return (
    <div className="p-4 space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          title="Guías Asignadas"
          value={kpis.total.toLocaleString('es-MX')}
          subtitle={`Originales · excluye canceladas, predoc y retornos · ${kpis.dias} día(s)`}
          accentColor="#1E3A8A"
        />
        <KpiCard
          title="Promedio Diario"
          value={kpis.promedio.toLocaleString('es-MX', { maximumFractionDigits: 1 })}
          subtitle="Guías por día"
          accentColor="#0B9B67"
        />
        <KpiCard
          title="Día Pico"
          value={kpis.pico ? kpis.pico.total.toLocaleString('es-MX') : '—'}
          subtitle={kpis.pico ? formatearDia(kpis.pico.fecha) : 'Sin datos'}
          accentColor="#B45309"
        />
        <KpiCard
          title="Rango de Fechas"
          value={kpis.desde && kpis.hasta ? `${formatearFechaCorta(kpis.desde)} – ${formatearFechaCorta(kpis.hasta)}` : '—'}
          subtitle="Primer y último día del corte"
          accentColor="#7C3AED"
        />
      </div>

      <div className="bg-white rounded-lg border border-[var(--vg-border)] p-4">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
          <div className="font-bold text-[12.5px]">
            Guías Asignadas por Día
            {vista !== 'total' && ` — Desglose por ${vista === 'oficina' ? 'Oficina Destino (Top 8)' : 'Entidad (Top 8)'}`}
          </div>
          <div className="flex gap-1 bg-[var(--vg-bg)] p-1 rounded-md">
            <button
              onClick={() => setVista('total')}
              className={`text-[11.5px] font-semibold px-3 py-1 rounded ${vista === 'total' ? 'bg-white shadow-sm text-[var(--vg-blue)]' : 'text-[var(--vg-text2)]'}`}
            >
              Total
            </button>
            <button
              onClick={() => setVista('oficina')}
              className={`text-[11.5px] font-semibold px-3 py-1 rounded ${vista === 'oficina' ? 'bg-white shadow-sm text-[var(--vg-blue)]' : 'text-[var(--vg-text2)]'}`}
            >
              Por Oficina
            </button>
            <button
              onClick={() => setVista('entidad')}
              className={`text-[11.5px] font-semibold px-3 py-1 rounded ${vista === 'entidad' ? 'bg-white shadow-sm text-[var(--vg-blue)]' : 'text-[var(--vg-text2)]'}`}
            >
              Por Entidad
            </button>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={360}>
          {vista === 'total' ? (
            <AreaChart data={datosPorDia} margin={{ bottom: 40 }}>
              <defs>
                <linearGradient id="gradienteTotalDia" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#1E3A8A" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#1E3A8A" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="fecha"
                tickFormatter={formatearFechaCorta}
                angle={-40}
                textAnchor="end"
                interval={0}
                fontSize={10}
                height={50}
              />
              <YAxis fontSize={11} />
              <Tooltip labelFormatter={(v) => formatearDia(String(v))} />
              <Area
                type="monotone"
                dataKey="total"
                name="Guías"
                stroke="#1E3A8A"
                strokeWidth={2.5}
                fill="url(#gradienteTotalDia)"
                dot={{ r: 3, fill: '#1E3A8A', strokeWidth: 0 }}
                activeDot={{ r: 5 }}
              />
            </AreaChart>
          ) : (
            // Líneas en vez de barras apiladas: con muchos días en el eje X,
            // apilar barras vuelve ilegible la comparación entre categorías.
            // Una línea por categoría deja ver la tendencia de cada una por
            // separado sin que se mezclen los colores.
            <LineChart data={datosPorDia} margin={{ bottom: 40 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="fecha"
                tickFormatter={formatearFechaCorta}
                angle={-40}
                textAnchor="end"
                interval={0}
                fontSize={10}
                height={50}
              />
              <YAxis fontSize={11} />
              <Tooltip labelFormatter={(v) => formatearDia(String(v))} />
              <Legend />
              {columnasSerie.map((s, i) => (
                <Line
                  key={s}
                  type="monotone"
                  dataKey={s}
                  name={s}
                  stroke={colorDeSerie(s, i)}
                  strokeWidth={2}
                  dot={{ r: 2 }}
                  activeDot={{ r: 5 }}
                  connectNulls
                />
              ))}
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>

      {hayMasDeUnPeriodo && (
        <div className="bg-white rounded-lg border border-[var(--vg-border)] p-4">
          <div className="font-bold text-[12.5px] mb-3">
            Comparativo Mensual
            {vista !== 'total' && ` — Desglose por ${vista === 'oficina' ? 'Oficina Destino (Top 8)' : 'Entidad (Top 8)'}`}
          </div>
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={datosPorMes} margin={{ bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="mes" tickFormatter={(v) => formatearPeriodo(String(v))} fontSize={11} />
              <YAxis fontSize={11} />
              <Tooltip labelFormatter={(v) => formatearPeriodo(String(v))} />
              {vista !== 'total' && <Legend />}
              {vista === 'total' ? (
                <Line
                  type="monotone"
                  dataKey="total"
                  name="Guías"
                  stroke="#1E3A8A"
                  strokeWidth={2.5}
                  dot={{ r: 5, fill: '#1E3A8A', strokeWidth: 0 }}
                  activeDot={{ r: 7 }}
                />
              ) : (
                // Mismo tratamiento que el desglose diario: una línea por
                // categoría, en vez de barras, para mantener consistencia
                // visual entre ambos gráficos.
                columnasSerie.map((s, i) => (
                  <Line
                    key={s}
                    type="monotone"
                    dataKey={s}
                    name={s}
                    stroke={colorDeSerie(s, i)}
                    strokeWidth={2}
                    dot={{ r: 4 }}
                    activeDot={{ r: 6 }}
                    connectNulls
                  />
                ))
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="bg-white rounded-lg border border-[var(--vg-border)] overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--vg-border)] flex items-center justify-between flex-wrap gap-2">
          <div className="font-bold text-[13px]">Detalle por Día</div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => exportToExcel(datosPorDia, columnasExport, `Histograma_${vista}`)}
              className="text-[11px] font-semibold text-[var(--vg-text2)] border border-[var(--vg-border)] rounded-md px-2.5 py-1.5 bg-white"
            >
              ⬇ Excel
            </button>
            <button
              onClick={() => exportToPDF(datosPorDia, columnasExport, `Guías Asignadas por Día`)}
              className="text-[11px] font-semibold text-[var(--vg-text2)] border border-[var(--vg-border)] rounded-md px-2.5 py-1.5 bg-white"
            >
              🖨 PDF
            </button>
          </div>
        </div>
        <div className="max-h-[420px] overflow-y-auto vg-scroll">
          <table className="vg-table">
            <thead>
              <tr>
                <SortableTh label="Fecha" sortKey="fecha" currentKey={sortKey} currentDir={sortDir} onSort={requestSort} />
                {columnasSerie.map((s) => (
                  <SortableTh key={s} label={s} sortKey={s} currentKey={sortKey} currentDir={sortDir} onSort={requestSort} />
                ))}
                <SortableTh label="Total" sortKey="total" currentKey={sortKey} currentDir={sortDir} onSort={requestSort} />
              </tr>
            </thead>
            <tbody>
              {sorted.map((d) => (
                <tr key={d.fecha}>
                  <td className="font-medium">{formatearDia(d.fecha)}</td>
                  {columnasSerie.map((s) => (
                    <td key={s}>{(d as unknown as Record<string, number>)[s] || 0}</td>
                  ))}
                  <td className="font-bold">{d.total}</td>
                </tr>
              ))}
              {!sorted.length && (
                <tr>
                  <td colSpan={columnasSerie.length + 2} className="text-center text-[var(--vg-text3)] py-6">
                    No hay guías asignadas (originales) en este corte
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
