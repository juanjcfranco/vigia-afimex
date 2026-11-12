'use client';

import { useMemo, useState } from 'react';
import { Guia } from '@/lib/types';
import { formatearDia, formatearPeriodo, topPorCampo, isCancelada, esRetornoAmplio, esGuiaOriginal, obtenerRegion } from '@/lib/business-logic';
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
  BarChart,
  Bar,
  LabelList,
  Cell,
} from 'recharts';
import { exportToExcel, exportToPDF } from '@/lib/export';
import { useSortableTable } from '@/lib/useSortableTable';
import SortableTh from '@/components/SortableTh';
import KpiCard from '@/components/KpiCard';

type Vista = 'total' | 'oficina' | 'entidad' | 'cliente';
// Fecha con la que se ubica cada guía en el eje X: cuándo la recibió Afimex
// en plataforma, o cuándo la documentó el cliente (comportamiento anterior).
type BaseFecha = 'plataforma' | 'documentacion';
// Comparativo: todas las series en una sola gráfica. Separado: una gráfica
// por serie, cada una con su propia escala (aplica a cliente/oficina/entidad).
type ModoDesglose = 'comparativo' | 'separado';
// Guías: conteos. Porcentaje: cada serie como % del volumen total de ese día/mes.
type Unidad = 'guias' | 'pct';

const TOP_N = 8;
const TOP_CLIENTES = 12;
// Cuántas oficinas dibujar en la gráfica (el resto se agrupa en 'Otras').
// El ranking completo de volumen por oficina está en su propia tabla.
const OPCIONES_TOP_OFICINAS = [8, 15, 30];
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
  if (vista === 'cliente') return g.cliente;
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
  const [base, setBase] = useState<BaseFecha>('plataforma');
  const [modoDesglose, setModoDesglose] = useState<ModoDesglose>('comparativo');
  const [topOficinas, setTopOficinas] = useState<number>(TOP_N);
  const [unidad, setUnidad] = useState<Unidad>('guias');

  // Fecha de cada guía según la base elegida. Devuelve siempre 'YYYY-MM-DD'
  // (las guías ya se filtran abajo para garantizar que existe).
  const fechaDe = (g: Guia): string => ((base === 'plataforma' ? g.fecha_plataforma : g.f_documentacion) as string);

  // Plataforma (por defecto): guías ORIGINALES (esGuiaOriginal: sin retornos,
  // posibles retornos, pre-documentadas, documentadas ni canceladas — la
  // misma definición del resto de la app) con Fecha Plataforma, es decir,
  // el volumen que Afimex realmente recibió cada día.
  // Documentación: comportamiento anterior — guías asignadas por el cliente,
  // con F_Documentacion válida, sin canceladas, pre-documentadas ni retornos.
  const guiasConFecha = useMemo(
    () =>
      base === 'plataforma'
        ? guias.filter((g) => !!g.fecha_plataforma && esGuiaOriginal(g))
        : guias.filter(
            (g) => !!g.f_documentacion && !g.es_predoc && !isCancelada(g.estado_guia) && !esRetornoAmplio(g)
          ),
    [guias, base]
  );

  // Top N categorías (oficina o entidad) para no saturar el gráfico con
  // decenas de series; el resto cae en 'Otras'. Se calcula una sola vez
  // sobre todo el corte para que la misma categoría tenga el mismo color
  // y significado tanto en la vista diaria como en la mensual.
  const seriesTop = useMemo(() => {
    if (vista === 'total') return [];
    const n = vista === 'cliente' ? TOP_CLIENTES : vista === 'oficina' ? topOficinas : TOP_N;
    return topPorCampo(guiasConFecha, (g) => campoParaVista(vista, g), n).map((t) => t.key);
  }, [guiasConFecha, vista, topOficinas]);

  // ============================================================
  // Vista diaria
  // ============================================================
  const datosPorDia = useMemo(() => {
    const grupos: Record<string, Record<string, number>> = {};
    guiasConFecha.forEach((g) => {
      const fecha = fechaDe(g);
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
  }, [guiasConFecha, vista, seriesTop, base]);

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
      const mes = fechaDe(g).slice(0, 7);
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
  }, [guiasConFecha, vista, seriesTop, base]);

  const hayMasDeUnPeriodo = datosPorMes.length > 1;

  // ---- Unidad % -------------------------------------------------------
  // En modo % cada serie (cliente/oficina/entidad) se expresa como parte del
  // volumen TOTAL de ese día (o mes): cada día suma 100%. `total` (conteo de
  // guías) se conserva en la fila para poder mostrarlo en el tooltip.
  const enPct = unidad === 'pct' && vista !== 'total';
  const aPorcentaje = (filas: Array<Record<string, unknown> & { total: number }>) =>
    filas.map((r) => {
      const o: Record<string, unknown> = { ...r };
      columnasSerie.forEach((c) => {
        o[c] = r.total ? (((r[c] as number) || 0) / r.total) * 100 : 0;
      });
      return o;
    });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const datosGrafica: any[] = useMemo(
    () => (enPct ? aPorcentaje(datosPorDia as never) : datosPorDia),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [enPct, datosPorDia, columnasSerie]
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const datosMesGrafica: any[] = useMemo(
    () => (enPct ? aPorcentaje(datosPorMes as never) : datosPorMes),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [enPct, datosPorMes, columnasSerie]
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tooltipPct = ((v: any, name: any, item: any) => {
    const total = item?.payload?.total || 0;
    return [`${Number(v).toFixed(1)}% (${Math.round((Number(v) / 100) * total).toLocaleString('es-MX')} guías)`, name];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;
  const formatoPct = (v: number | string) => `${v}%`;

  // Ranking de volumen HACIA cada oficina destino (todas, no solo el Top N
  // de la gráfica): mismas guías que el resto del histograma (originales,
  // con la fecha base elegida), de mayor a menor volumen.
  const rankingOficinas = useMemo(() => {
    const conteo: Record<string, number> = {};
    guiasConFecha.forEach((g) => {
      const k = (g.oficina_destino || '').trim() || 'Sin dato';
      conteo[k] = (conteo[k] || 0) + 1;
    });
    const total = guiasConFecha.length;
    return Object.entries(conteo)
      .map(([oficina, guias]) => ({
        oficina,
        region: oficina === 'Sin dato' ? '—' : obtenerRegion(oficina),
        guias,
        pct: total ? (guias / total) * 100 : 0,
      }))
      .sort((a, b) => b.guias - a.guias || a.oficina.localeCompare(b.oficina));
  }, [guiasConFecha]);
  const maxOficina = rankingOficinas[0]?.guias || 1;
  // Participación (% del volumen) de las Top N oficinas, el resto sumado en
  // 'Otras' — misma regla y mismos colores que las series de la gráfica.
  const participacionOficinas = useMemo(() => {
    const top = rankingOficinas.slice(0, topOficinas);
    const resto = rankingOficinas.slice(topOficinas);
    const filas = top.map((r, i) => ({
      oficina: r.oficina,
      guias: r.guias,
      pct: r.pct,
      etiqueta: `${r.pct.toFixed(1)}%`,
      color: r.oficina === 'Sin dato' ? COLOR_SIN_DATO : colorDeSerie(r.oficina, i),
    }));
    if (resto.length) {
      const guiasResto = resto.reduce((sum, r) => sum + r.guias, 0);
      const pctResto = resto.reduce((sum, r) => sum + r.pct, 0);
      filas.push({
        oficina: `Otras (${resto.length})`,
        guias: guiasResto,
        pct: pctResto,
        etiqueta: `${pctResto.toFixed(1)}%`,
        color: COLOR_OTRAS,
      });
    }
    return filas;
  }, [rankingOficinas, topOficinas]);
  const columnasRanking = [
    { header: 'Oficina Destino', value: (r: (typeof rankingOficinas)[0]) => r.oficina },
    { header: 'Región', value: (r: (typeof rankingOficinas)[0]) => r.region },
    { header: 'Guías', value: (r: (typeof rankingOficinas)[0]) => r.guias },
    { header: '% del total', value: (r: (typeof rankingOficinas)[0]) => `${r.pct.toFixed(1)}%` },
  ];

  const etiquetaDesglose =
    vista === 'oficina'
      ? `Oficina Destino (Top ${topOficinas})`
      : vista === 'entidad'
        ? 'Entidad (Top 8)'
        : `Cliente${columnasSerie.includes('Otras') ? ` (Top ${TOP_CLIENTES})` : ''}`;
  const tituloBase = base === 'plataforma' ? 'Guías por Día — Fecha Plataforma' : 'Guías Asignadas por Día — Fecha Documentación';

  return (
    <div className="p-4 space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          title={base === 'plataforma' ? 'Guías Recibidas' : 'Guías Asignadas'}
          value={kpis.total.toLocaleString('es-MX')}
          subtitle={
            base === 'plataforma'
              ? `Originales · por Fecha Plataforma · sin retornos, predoc, documentadas ni canceladas · ${kpis.dias} día(s)`
              : `Originales · por Fecha Documentación · excluye canceladas, predoc y retornos · ${kpis.dias} día(s)`
          }
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
            {tituloBase}
            {vista !== 'total' && ` — Desglose por ${etiquetaDesglose}`}
            {enPct && ' — % del volumen de cada día'}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
          <div className="flex gap-1 bg-[var(--vg-bg)] p-1 rounded-md" title="Fecha con la que se ubica cada guía en el gráfico">
            <button
              onClick={() => setBase('plataforma')}
              className={`text-[11.5px] font-semibold px-3 py-1 rounded ${base === 'plataforma' ? 'bg-white shadow-sm text-[var(--vg-blue)]' : 'text-[var(--vg-text2)]'}`}
            >
              Fecha Plataforma
            </button>
            <button
              onClick={() => setBase('documentacion')}
              className={`text-[11.5px] font-semibold px-3 py-1 rounded ${base === 'documentacion' ? 'bg-white shadow-sm text-[var(--vg-blue)]' : 'text-[var(--vg-text2)]'}`}
            >
              Fecha Documentación
            </button>
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
            <button
              onClick={() => setVista('cliente')}
              className={`text-[11.5px] font-semibold px-3 py-1 rounded ${vista === 'cliente' ? 'bg-white shadow-sm text-[var(--vg-blue)]' : 'text-[var(--vg-text2)]'}`}
            >
              Por Cliente
            </button>
          </div>
          {vista === 'oficina' && (
            <div className="flex items-center gap-1 bg-[var(--vg-bg)] p-1 rounded-md" title="Cuántas oficinas dibujar; el resto se agrupa en 'Otras'">
              <span className="text-[11px] text-[var(--vg-text2)] px-2">Mostrar Top</span>
              {OPCIONES_TOP_OFICINAS.map((n) => (
                <button
                  key={n}
                  onClick={() => setTopOficinas(n)}
                  className={`text-[11.5px] font-semibold px-2.5 py-1 rounded ${topOficinas === n ? 'bg-white shadow-sm text-[var(--vg-blue)]' : 'text-[var(--vg-text2)]'}`}
                >
                  {n}
                </button>
              ))}
            </div>
          )}
          {vista !== 'total' && (
            <div className="flex gap-1 bg-[var(--vg-bg)] p-1 rounded-md">
              <button
                onClick={() => setModoDesglose('comparativo')}
                className={`text-[11.5px] font-semibold px-3 py-1 rounded ${modoDesglose === 'comparativo' ? 'bg-white shadow-sm text-[var(--vg-blue)]' : 'text-[var(--vg-text2)]'}`}
                title="Todas las series en una sola gráfica para compararlas"
              >
                Comparativo
              </button>
              <button
                onClick={() => setModoDesglose('separado')}
                className={`text-[11.5px] font-semibold px-3 py-1 rounded ${modoDesglose === 'separado' ? 'bg-white shadow-sm text-[var(--vg-blue)]' : 'text-[var(--vg-text2)]'}`}
                title="Una gráfica por serie, cada una con su propia escala"
              >
                Separado
              </button>
            </div>
          )}
          {vista !== 'total' && (
            <div className="flex gap-1 bg-[var(--vg-bg)] p-1 rounded-md" title="Ver el volumen en guías o como % del total de cada día">
              <button
                onClick={() => setUnidad('guias')}
                className={`text-[11.5px] font-semibold px-3 py-1 rounded ${unidad === 'guias' ? 'bg-white shadow-sm text-[var(--vg-blue)]' : 'text-[var(--vg-text2)]'}`}
              >
                Guías
              </button>
              <button
                onClick={() => setUnidad('pct')}
                className={`text-[11.5px] font-semibold px-3 py-1 rounded ${unidad === 'pct' ? 'bg-white shadow-sm text-[var(--vg-blue)]' : 'text-[var(--vg-text2)]'}`}
              >
                % del volumen
              </button>
            </div>
          )}
          </div>
        </div>
        {vista !== 'total' && modoDesglose === 'separado' ? (
          // Una gráfica por serie (cliente/oficina/entidad) con su PROPIA escala
          // vertical: en el comparativo las chicas se aplastan junto a las grandes.
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4" data-testid="series-separadas">
            {columnasSerie.map((s, i) => {
              const color = colorDeSerie(s, i);
              const totalSerie = datosPorDia.reduce((sum, d) => sum + ((d as unknown as Record<string, number>)[s] || 0), 0);
              const datosSerie = datosGrafica.map((d) => ({ fecha: d.fecha as string, valor: (d[s] as number) || 0 }));
              const pctSerie = kpis.total ? (totalSerie / kpis.total) * 100 : 0;
              return (
                <div key={s} className="border border-[var(--vg-border)] rounded-md p-3">
                  <div className="flex items-baseline justify-between mb-1">
                    <div className="font-bold text-[12px]" style={{ color }}>
                      {s}
                    </div>
                    <div className="text-[11px] text-[var(--vg-text2)]">{totalSerie.toLocaleString('es-MX')} guías · {pctSerie.toFixed(1)}% del total</div>
                  </div>
                  <ResponsiveContainer width="100%" height={180}>
                    <AreaChart data={datosSerie} margin={{ left: -10, right: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="fecha" tickFormatter={formatearFechaCorta} fontSize={9} interval="preserveStartEnd" />
                      <YAxis fontSize={10} allowDecimals={enPct} tickFormatter={enPct ? formatoPct : undefined} />
                      <Tooltip
                        labelFormatter={(v) => formatearDia(String(v))}
                        formatter={enPct ? tooltipPct : undefined}
                      />
                      <Area
                        type="monotone"
                        dataKey="valor"
                        name={s}
                        stroke={color}
                        strokeWidth={2}
                        fill={color}
                        fillOpacity={0.15}
                        dot={{ r: 2, fill: color, strokeWidth: 0 }}
                        activeDot={{ r: 4 }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              );
            })}
          </div>
        ) : (
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
          ) : enPct ? (
            // % del volumen: área apilada al 100% — cada día suma 100% y se ve
            // cómo se reparte entre las series (y cómo cambia ese reparto).
            <AreaChart data={datosGrafica} margin={{ bottom: 40 }}>
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
              <YAxis fontSize={11} domain={[0, 100]} tickFormatter={formatoPct} />
              <Tooltip labelFormatter={(v) => formatearDia(String(v))} formatter={tooltipPct} />
              <Legend />
              {columnasSerie.map((s, i) => (
                <Area
                  key={s}
                  type="monotone"
                  dataKey={s}
                  name={s}
                  stackId="pct"
                  stroke={colorDeSerie(s, i)}
                  fill={colorDeSerie(s, i)}
                  fillOpacity={0.8}
                  strokeWidth={1}
                />
              ))}
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
        )}
      </div>

      {vista === 'oficina' && (
        <div className="bg-white rounded-lg border border-[var(--vg-border)] overflow-hidden" data-testid="ranking-oficinas">
          <div className="px-4 py-3 border-b border-[var(--vg-border)] flex items-center justify-between flex-wrap gap-2">
            <div>
              <div className="font-bold text-[13px]">Volumen hacia Oficinas Destino</div>
              <div className="text-[11px] text-[var(--vg-text2)]">
                {rankingOficinas.length.toLocaleString('es-MX')} oficina(s) · {kpis.total.toLocaleString('es-MX')} guías originales ·{' '}
                {base === 'plataforma' ? 'por Fecha Plataforma' : 'por Fecha Documentación'}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => exportToExcel(rankingOficinas, columnasRanking, `Volumen_Oficinas_${base}`)}
                className="text-[11px] font-semibold text-[var(--vg-text2)] border border-[var(--vg-border)] rounded-md px-2.5 py-1.5 bg-white"
              >
                ⬇ Excel
              </button>
              <button
                onClick={() => exportToPDF(rankingOficinas, columnasRanking, 'Volumen hacia Oficinas Destino')}
                className="text-[11px] font-semibold text-[var(--vg-text2)] border border-[var(--vg-border)] rounded-md px-2.5 py-1.5 bg-white"
              >
                🖨 PDF
              </button>
            </div>
          </div>
          <div className="px-4 pt-3" data-testid="participacion-oficinas">
            <div className="font-bold text-[12px]">Participación en el volumen — % por oficina</div>
            <div className="text-[11px] text-[var(--vg-text2)] mb-2">
              Top {topOficinas} oficinas; el resto se suma en «Otras». Cambia el Top arriba.
            </div>
            <ResponsiveContainer width="100%" height={Math.max(160, participacionOficinas.length * 26 + 30)}>
              <BarChart data={participacionOficinas} layout="vertical" margin={{ left: 10, right: 56 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" domain={[0, 'auto']} tickFormatter={formatoPct} fontSize={10} />
                <YAxis type="category" dataKey="oficina" width={140} fontSize={10} interval={0} />
                <Tooltip
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  formatter={((v: any, _n: any, item: any) => [
                    `${Number(v).toFixed(1)}% (${(item?.payload?.guias ?? 0).toLocaleString('es-MX')} guías)`,
                    '% del volumen',
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  ]) as any}
                />
                <Bar dataKey="pct" name="% del volumen">
                  {participacionOficinas.map((r) => (
                    <Cell key={r.oficina} fill={r.color} />
                  ))}
                  <LabelList dataKey="etiqueta" position="right" fontSize={10} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="max-h-[420px] overflow-y-auto vg-scroll">
            <table className="vg-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Oficina Destino</th>
                  <th>Región</th>
                  <th>Guías</th>
                  <th>% del total</th>
                  <th style={{ width: '32%' }}>Volumen</th>
                </tr>
              </thead>
              <tbody>
                {rankingOficinas.map((r, i) => (
                  <tr key={r.oficina}>
                    <td>{i + 1}</td>
                    <td className="font-medium">{r.oficina}</td>
                    <td>{r.region}</td>
                    <td className="font-bold">{r.guias.toLocaleString('es-MX')}</td>
                    <td>{r.pct.toFixed(1)}%</td>
                    <td>
                      <div style={{ background: '#E2E8F0', borderRadius: 3, height: 8 }}>
                        <div style={{ width: `${(r.guias / maxOficina) * 100}%`, background: '#1E3A8A', height: 8, borderRadius: 3 }} />
                      </div>
                    </td>
                  </tr>
                ))}
                {!rankingOficinas.length && (
                  <tr>
                    <td colSpan={6} className="text-center text-[var(--vg-text3)] py-6">
                      No hay guías originales con esa fecha en este corte
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {hayMasDeUnPeriodo && (
        <div className="bg-white rounded-lg border border-[var(--vg-border)] p-4">
          <div className="font-bold text-[12.5px] mb-3">
            Comparativo Mensual
            {vista !== 'total' && ` — Desglose por ${etiquetaDesglose}`}
          </div>
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={datosMesGrafica} margin={{ bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="mes" tickFormatter={(v) => formatearPeriodo(String(v))} fontSize={11} />
              <YAxis fontSize={11} domain={enPct ? [0, 100] : undefined} tickFormatter={enPct ? formatoPct : undefined} />
              <Tooltip labelFormatter={(v) => formatearPeriodo(String(v))} formatter={enPct ? tooltipPct : undefined} />
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
              onClick={() => exportToExcel(datosPorDia, columnasExport, `Histograma_${vista}_${base}`)}
              className="text-[11px] font-semibold text-[var(--vg-text2)] border border-[var(--vg-border)] rounded-md px-2.5 py-1.5 bg-white"
            >
              ⬇ Excel
            </button>
            <button
              onClick={() => exportToPDF(datosPorDia, columnasExport, tituloBase)}
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
                    No hay guías originales con esa fecha en este corte
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
