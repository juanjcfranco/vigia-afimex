'use client';

import { useMemo, useState } from 'react';
import { Guia } from '@/lib/types';
import { formatearDia, topPorCampo, isCancelada, esRetornoAmplio } from '@/lib/business-logic';
import {
  BarChart,
  Bar,
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
  // decenas de series; el resto cae en 'Otras'.
  const seriesTop = useMemo(() => {
    if (vista === 'total') return [];
    return topPorCampo(guiasConFecha, (g) => campoParaVista(vista, g), TOP_N).map((t) => t.key);
  }, [guiasConFecha, vista]);

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
          <BarChart data={datosPorDia} margin={{ bottom: 40 }}>
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
            {vista !== 'total' && <Legend />}
            {vista === 'total' ? (
              <Bar dataKey="total" name="Guías" fill="#1E3A8A" radius={[3, 3, 0, 0]} />
            ) : (
              columnasSerie.map((s, i) => (
                <Bar
                  key={s}
                  dataKey={s}
                  name={s}
                  stackId="a"
                  fill={s === 'Otras' ? COLOR_OTRAS : s === 'Sin dato' ? COLOR_SIN_DATO : COLORES[i % COLORES.length]}
                />
              ))
            )}
          </BarChart>
        </ResponsiveContainer>
      </div>

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
