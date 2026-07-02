'use client';

import { useMemo, useState } from 'react';
import { Guia } from '@/lib/types';
import KpiCard from '@/components/KpiCard';
import BulkSearch from '@/components/BulkSearch';
import { exportToExcel, exportToPDF } from '@/lib/export';

export default function DevolucionesModule({ guias }: { guias: Guia[] }) {
  const [filtroEstado, setFiltroEstado] = useState<'' | 'completado' | 'pendiente'>('');
  const [bulkGuias, setBulkGuias] = useState<string[] | null>(null);

  const devoluciones = useMemo(() => guias.filter((g) => g.es_devolucion), [guias]);

  const retornoPorGuia = useMemo(() => {
    const map = new Map<string, Guia>();
    guias.forEach((g) => {
      if (g.es_retorno) map.set(g.guia, g);
    });
    return map;
  }, [guias]);

  // KPIs consistentes con Resumen y Facturación: "Retornos" = 1 por cada
  // devolución (referenciado vía columna Retorno), no las filas físicas que
  // existan en este corte. Completado/Pendiente se basa en retorno_estado,
  // el campo embebido en la propia guía devuelta.
  const kpis = useMemo(() => {
    const totalRetornos = devoluciones.filter((g) => g.retorno_guia).length;
    const retornosEntregados = devoluciones.filter(
      (g) => g.retorno_guia && (g.retorno_estado || '').toUpperCase() === 'ENTREGADA'
    ).length;
    return {
      totalDevueltas: devoluciones.length,
      totalRetornos,
      retornosEntregados,
      retornosPendientes: totalRetornos - retornosEntregados,
    };
  }, [devoluciones]);

  const filasConRetorno = useMemo(() => {
    return devoluciones.map((dev) => {
      const retornoFila = dev.retorno_guia ? retornoPorGuia.get(dev.retorno_guia) : undefined;
      const completado = (dev.retorno_estado || '').toUpperCase() === 'ENTREGADA';
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
                <th>Guía Original</th>
                <th>Descripción</th>
                <th>Oficina Destino</th>
                <th>Estado</th>
                <th>Últ. Mov. Original</th>
                <th>COD</th>
                <th>Guía Retorno</th>
                <th>Oficina Retorno</th>
                <th>Estado Retorno</th>
                <th>Últ. Mov. Retorno</th>
                <th>Estatus</th>
              </tr>
            </thead>
            <tbody>
              {filas.map(({ dev, retornoFila, completado }) => (
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
