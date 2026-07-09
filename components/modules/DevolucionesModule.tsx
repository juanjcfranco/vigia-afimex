'use client';

import { useMemo, useState } from 'react';
import { Guia } from '@/lib/types';
import KpiCard from '@/components/KpiCard';
import BulkSearch from '@/components/BulkSearch';
import { exportToExcel, exportToPDF } from '@/lib/export';
import { getExcepciones, topPorCampo, calcularResumenDevoluciones, retornoEstaEntregado } from '@/lib/business-logic';
import TopListPanel from '@/components/TopListPanel';
import { useSortableTable } from '@/lib/useSortableTable';
import SortableTh from '@/components/SortableTh';

type VistaTop = 'oficina' | 'entidad' | 'ciudad';

export default function DevolucionesModule({ guias, guiasTodas }: { guias: Guia[]; guiasTodas?: Guia[] }) {
  const [filtroEstado, setFiltroEstado] = useState<'' | 'completado' | 'pendiente'>('');
  const [bulkGuias, setBulkGuias] = useState<string[] | null>(null);
  const [vistaTop, setVistaTop] = useState<VistaTop>('oficina');

  const devoluciones = useMemo(() => guias.filter((g) => g.es_devolucion), [guias]);

  // IMPORTANTE: el mapa de retornos se construye con el set COMPLETO de
  // guías (sin el filtro de oficina/entidad/etc. aplicado), no con `guias`
  // (ya filtradas). El retorno de una devolución casi siempre está en una
  // oficina distinta a la de la devolución (ej. devolución en CHIHUAHUA,
  // retorno en SAN LUIS POTOSI) — si se filtra por oficina, esa fila del
  // retorno se cae del set y el cruce sale vacío aunque la devolución sí
  // esté visible. Se usa `guiasTodas` (fallback a `guias` si no se pasó)
  // exclusivamente para este cruce.
  const retornoPorGuia = useMemo(() => {
    const map = new Map<string, Guia>();
    (guiasTodas ?? guias).forEach((g) => {
      if (g.es_retorno) map.set(g.guia, g);
    });
    return map;
  }, [guiasTodas, guias]);

  // KPIs consistentes con Resumen y Facturación: "Retornos" = 1 por cada
  // devolución (referenciado vía columna Retorno), no las filas físicas que
  // existan en este corte. Completado/Pendiente prioriza el estado real de
  // la fila física del retorno (si existe en este corte) sobre el campo
  // embebido retorno_estado — ver retornoEstaEntregado() en business-logic.ts.
  const kpis = useMemo(() => {
    const totalRetornos = devoluciones.filter((g) => g.retorno_guia).length;
    const retornosEntregados = devoluciones.filter(
      (g) => g.retorno_guia && retornoEstaEntregado(g, retornoPorGuia.get(g.retorno_guia))
    ).length;
    return {
      totalDevueltas: devoluciones.length,
      totalRetornos,
      retornosEntregados,
      retornosPendientes: totalRetornos - retornosEntregados,
    };
  }, [devoluciones, retornoPorGuia]);

  const filasConRetorno = useMemo(() => {
    return devoluciones.map((dev) => {
      const retornoFila = dev.retorno_guia ? retornoPorGuia.get(dev.retorno_guia) : undefined;
      const completado = retornoEstaEntregado(dev, retornoFila);
      return { dev, retornoFila, completado };
    });
  }, [devoluciones, retornoPorGuia]);

  const filas = useMemo(() => {
    let f = filasConRetorno;
    if (filtroEstado === 'completado') f = f.filter((x) => x.completado);
    if (filtroEstado === 'pendiente') f = f.filter((x) => !x.completado);
    if (bulkGuias && bulkGuias.length) {
      const set = new Set(bulkGuias.map((g) => g.toUpperCase()));
      f = f.filter(
        (x) =>
          set.has(x.dev.guia.toUpperCase()) ||
          (x.dev.retorno_guia && set.has(x.dev.retorno_guia.toUpperCase()))
      );
    }
    return f;
  }, [filasConRetorno, filtroEstado, bulkGuias]);

  const totalCOD = useMemo(() => filas.reduce((sum, x) => sum + (x.dev.cod || 0), 0), [filas]);

  const { sorted, sortKey, sortDir, requestSort } = useSortableTable<(typeof filas)[0]>(filas, (x, key) => {
    switch (key) {
      case 'guia':
        return x.dev.guia;
      case 'descripcion':
        return x.dev.descripcion;
      case 'oficina':
        return x.dev.oficina_destino;
      case 'ultmov':
        return x.dev.f_historia;
      case 'cod':
        return x.dev.cod;
      case 'retorno':
        return x.dev.retorno_guia;
      case 'oficina_retorno':
        return x.retornoFila?.oficina_destino;
      case 'estado_retorno':
        return x.dev.retorno_estado;
      case 'ultmov_retorno':
        return x.retornoFila?.f_historia;
      case 'estatus':
        return x.completado ? 1 : 0;
      default:
        return null;
    }
  });

  // Resumen KPI de devoluciones: por oficina destino, entidad y motivo
  // (última excepción de la cadena, agrupando AUSENCIA/AUSENCIA 2/
  // AUSENCIA 3 en una sola categoría — igual que en el módulo Excepciones).
  const kpiDevoluciones = useMemo(() => calcularResumenDevoluciones(devoluciones, 10), [devoluciones]);

  const campoDeVistaTop: Record<VistaTop, keyof Guia> = {
    oficina: 'oficina_destino',
    entidad: 'entidad_destinatario',
    ciudad: 'ciudad_destinatario',
  };
  const topUbicaciones = useMemo(
    () => topPorCampo(devoluciones, (g) => g[campoDeVistaTop[vistaTop]] as string | null, 10),
    [devoluciones, vistaTop]
  );
  // Excepción principal (la que causó la devolución con más frecuencia) por ubicación del top
  const excepcionPrincipalPorUbicacion = useMemo(() => {
    const campo = campoDeVistaTop[vistaTop];
    const map: Record<string, string> = {};
    topUbicaciones.forEach(({ key }) => {
      const counts: Record<string, number> = {};
      devoluciones
        .filter((g) => (g[campo] as string) === key)
        .forEach((g) => {
          const excs = getExcepciones(g);
          const ultima = excs[excs.length - 1];
          if (ultima) counts[ultima] = (counts[ultima] || 0) + 1;
        });
      const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
      map[key] = top ? `${top[0]} (${top[1]})` : '—';
    });
    return map;
  }, [devoluciones, topUbicaciones, vistaTop]);

  const columnasExport = [
    { header: 'Guía Original', value: (x: (typeof filas)[0]) => x.dev.guia },
    { header: 'Descripción', value: (x: (typeof filas)[0]) => x.dev.descripcion || '' },
    { header: 'Oficina Destino', value: (x: (typeof filas)[0]) => x.dev.oficina_destino || '' },
    { header: 'Estado', value: (x: (typeof filas)[0]) => x.dev.estado_guia || '' },
    { header: 'Últ. Mov. Original', value: (x: (typeof filas)[0]) => x.dev.f_historia || '' },
    { header: 'COD', value: (x: (typeof filas)[0]) => x.dev.cod || 0 },
    { header: 'Guía Retorno', value: (x: (typeof filas)[0]) => x.dev.retorno_guia || '' },
    { header: 'Oficina Retorno', value: (x: (typeof filas)[0]) => x.retornoFila?.oficina_destino || '' },
    { header: 'Estado Retorno', value: (x: (typeof filas)[0]) => x.dev.retorno_estado || '' },
    { header: 'Últ. Mov. Retorno', value: (x: (typeof filas)[0]) => x.retornoFila?.f_historia || '' },
    { header: 'Estatus', value: (x: (typeof filas)[0]) => (x.completado ? 'Completado' : 'Pendiente') },
  ];

  return (
    <div className="p-5 space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          title="Guías Devueltas"
          value={kpis.totalDevueltas.toLocaleString('es-MX')}
          subtitle="Estado_Guia = DEVOLUCION"
          accentColor="#DC2626"
        />
        <KpiCard
          title="Retornos"
          value={kpis.totalRetornos.toLocaleString('es-MX')}
          subtitle="Explícitos + de otro periodo"
          accentColor="#7C3AED"
        />
        <KpiCard
          title="Retornos Completados"
          value={kpis.retornosEntregados.toLocaleString('es-MX')}
          subtitle="Ya entregados en almacén"
          accentColor="#0B9B67"
        />
        <KpiCard
          title="Retornos Pendientes"
          value={kpis.retornosPendientes.toLocaleString('es-MX')}
          subtitle="Aún no llegan"
          accentColor="#EA7C1A"
        />
      </div>

      <div className="bg-white rounded-lg border border-[var(--vg-border)] p-4">
        <div className="font-bold text-[12.5px] mb-0.5">KPI de Devoluciones</div>
        <div className="text-[10.5px] text-[var(--vg-text2)] mb-2">
          Top 10 por oficina destino, entidad y motivo (última excepción de la cadena, agrupando variantes como
          AUSENCIA / AUSENCIA 2 / AUSENCIA 3 en una sola categoría)
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <TopListPanel
            title="Top 10 por Oficina Destino"
            items={kpiDevoluciones.porOficina}
            total={kpiDevoluciones.total}
            accentColor="#DC2626"
          />
          <TopListPanel
            title="Top 10 por Entidad"
            items={kpiDevoluciones.porEntidad}
            total={kpiDevoluciones.total}
            accentColor="#EA7C1A"
          />
          <TopListPanel
            title="Top 10 Motivos"
            items={kpiDevoluciones.porMotivo}
            total={kpiDevoluciones.total}
            accentColor="#7C3AED"
          />
        </div>
      </div>

      <div className="bg-white rounded-lg border border-[var(--vg-border)] p-4">
        <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
          <div className="font-bold text-[12.5px]">Top con más devoluciones</div>
          <div className="flex gap-1 bg-[var(--vg-bg)] p-1 rounded-md">
            {(['oficina', 'entidad', 'ciudad'] as VistaTop[]).map((v) => (
              <button
                key={v}
                onClick={() => setVistaTop(v)}
                className={`text-[11px] font-semibold px-2.5 py-1 rounded capitalize ${
                  vistaTop === v ? 'bg-white shadow-sm text-[var(--vg-blue)]' : 'text-[var(--vg-text2)]'
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-2">
          {topUbicaciones.map(({ key, count }, i) => (
            <div key={key} className="border border-[var(--vg-border)] rounded-md px-2.5 py-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-[var(--vg-text2)]">#{i + 1}</span>
                <span className="text-[15px] font-bold text-[var(--vg-red)]">{count}</span>
              </div>
              <div className="text-[12px] font-bold truncate" title={key}>
                {key}
              </div>
              <div className="text-[10.5px] text-[var(--vg-text3)] truncate" title={excepcionPrincipalPorUbicacion[key]}>
                Excepción: {excepcionPrincipalPorUbicacion[key]}
              </div>
            </div>
          ))}
          {!topUbicaciones.length && (
            <div className="text-[11px] text-[var(--vg-text3)] py-2">Sin datos para este corte</div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-lg border border-[var(--vg-border)] overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--vg-border)] flex items-center justify-between flex-wrap gap-2">
          <div>
            <div className="font-bold text-[13px]">Devoluciones</div>
            <div className="text-[11px] text-[var(--vg-text2)]">
              Guía devuelta + guía de retorno asociada · {filas.length.toLocaleString('es-MX')} guías · COD total: $
              {totalCOD.toLocaleString('es-MX')}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex gap-1 bg-[var(--vg-bg)] p-1 rounded-md">
              <button
                onClick={() => setFiltroEstado('')}
                className={`text-[11.5px] font-semibold px-3 py-1 rounded ${filtroEstado === '' ? 'bg-white shadow-sm text-[var(--vg-blue)]' : 'text-[var(--vg-text2)]'}`}
              >
                Todas
              </button>
              <button
                onClick={() => setFiltroEstado('completado')}
                className={`text-[11.5px] font-semibold px-3 py-1 rounded ${filtroEstado === 'completado' ? 'bg-white shadow-sm text-[var(--vg-green)]' : 'text-[var(--vg-text2)]'}`}
              >
                ✅ Retorno completado
              </button>
              <button
                onClick={() => setFiltroEstado('pendiente')}
                className={`text-[11.5px] font-semibold px-3 py-1 rounded ${filtroEstado === 'pendiente' ? 'bg-white shadow-sm text-[var(--vg-amber)]' : 'text-[var(--vg-text2)]'}`}
              >
                ⏳ Retorno pendiente
              </button>
            </div>
            <button
              onClick={() => exportToExcel(filas, columnasExport, 'Devoluciones')}
              className="text-[11px] font-semibold text-[var(--vg-text2)] border border-[var(--vg-border)] rounded-md px-2.5 py-1.5 bg-white"
            >
              ⬇ Excel
            </button>
            <button
              onClick={() => exportToPDF(filas, columnasExport, 'Devoluciones')}
              className="text-[11px] font-semibold text-[var(--vg-text2)] border border-[var(--vg-border)] rounded-md px-2.5 py-1.5 bg-white"
            >
              🖨 PDF
            </button>
          </div>
        </div>

        <BulkSearch onSearch={setBulkGuias} onClear={() => setBulkGuias(null)} activo={!!bulkGuias} />

        <div className="max-h-[600px] overflow-y-auto vg-scroll">
          <table className="vg-table">
            <thead>
              <tr>
                <SortableTh label="Guía Original" sortKey="guia" currentKey={sortKey} currentDir={sortDir} onSort={requestSort} />
                <SortableTh label="Descripción" sortKey="descripcion" currentKey={sortKey} currentDir={sortDir} onSort={requestSort} />
                <SortableTh label="Oficina Destino" sortKey="oficina" currentKey={sortKey} currentDir={sortDir} onSort={requestSort} />
                <th>Estado</th>
                <SortableTh label="Últ. Mov. Original" sortKey="ultmov" currentKey={sortKey} currentDir={sortDir} onSort={requestSort} />
                <SortableTh label="COD" sortKey="cod" currentKey={sortKey} currentDir={sortDir} onSort={requestSort} />
                <SortableTh label="Guía Retorno" sortKey="retorno" currentKey={sortKey} currentDir={sortDir} onSort={requestSort} />
                <SortableTh label="Oficina Retorno" sortKey="oficina_retorno" currentKey={sortKey} currentDir={sortDir} onSort={requestSort} />
                <SortableTh label="Estado Retorno" sortKey="estado_retorno" currentKey={sortKey} currentDir={sortDir} onSort={requestSort} />
                <SortableTh label="Últ. Mov. Retorno" sortKey="ultmov_retorno" currentKey={sortKey} currentDir={sortDir} onSort={requestSort} />
                <SortableTh label="Estatus" sortKey="estatus" currentKey={sortKey} currentDir={sortDir} onSort={requestSort} />
              </tr>
            </thead>
            <tbody>
              {sorted.map(({ dev, retornoFila, completado }) => (
                <tr key={dev.id}>
                  <td className="font-mono font-semibold">{dev.guia}</td>
                  <td className="max-w-[160px] truncate" title={dev.descripcion || ''}>
                    {dev.descripcion || '—'}
                  </td>
                  <td>{dev.oficina_destino || '—'}</td>
                  <td>
                    <span className="text-[10.5px] font-bold text-white bg-[var(--vg-red)] rounded-full px-2 py-0.5">
                      DEVOLUCION
                    </span>
                  </td>
                  <td>{dev.f_historia || '—'}</td>
                  <td>{dev.cod ? `$${dev.cod.toLocaleString('es-MX')}` : '—'}</td>
                  <td className="font-mono">{dev.retorno_guia || '—'}</td>
                  <td>{retornoFila?.oficina_destino || '—'}</td>
                  <td>{dev.retorno_estado || '—'}</td>
                  <td>{retornoFila?.f_historia || '—'}</td>
                  <td>
                    {completado ? (
                      <span className="text-[var(--vg-green)] font-bold">✅ Entregado</span>
                    ) : (
                      <span className="text-[var(--vg-amber)] font-bold">⏳ Pendiente</span>
                    )}
                  </td>
                </tr>
              ))}
              {!filas.length && (
                <tr>
                  <td colSpan={11} className="text-center text-[var(--vg-text3)] py-6">
                    No hay devoluciones que coincidan con el filtro
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
