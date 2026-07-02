'use client';

import { useMemo, useState } from 'react';
import { Guia } from '@/lib/types';
import { getExcepciones, isEntregada, isCancelada, isEnRuta } from '@/lib/business-logic';
import AccionBadge from '@/components/AccionBadge';
import AlertaDiasBadge from '@/components/AlertaDiasBadge';
import BulkSearch from '@/components/BulkSearch';
import { exportToExcel, exportToPDF } from '@/lib/export';

export default function ExcepcionesModule({ guias }: { guias: Guia[] }) {
  const [bulkGuias, setBulkGuias] = useState<string[] | null>(null);
  const [filtroExcepcion, setFiltroExcepcion] = useState('');

  const base = useMemo(() => {
    return guias.filter((g) => {
      if (g.es_predoc) return false;
      if (g.es_devolucion) return false;
      if (isEntregada(g.estado_guia)) return false;
      if (isCancelada(g.estado_guia)) return false;
      if (isEnRuta(g.estado_guia)) return false;
      return getExcepciones(g).length > 0;
    });
  }, [guias]);

  const filas = useMemo(() => {
    let f = base;
    if (bulkGuias && bulkGuias.length) {
      const set = new Set(bulkGuias.map((g) => g.toUpperCase()));
      f = f.filter((g) => set.has(g.guia.toUpperCase()));
    }
    if (filtroExcepcion) {
      f = f.filter((g) => {
        const excs = getExcepciones(g);
        return excs[excs.length - 1] === filtroExcepcion;
      });
    }
    return f.sort((a, b) => (b.dias_sin_movimiento || 0) - (a.dias_sin_movimiento || 0));
  }, [base, bulkGuias, filtroExcepcion]);

  // KPI por excepción: cuenta la ÚLTIMA excepción de la cadena de cada guía
  // (la vigente / más reciente), no todas las ocurrencias de Exc.1-5
  const kpisPorExcepcion = useMemo(() => {
    const counts: Record<string, number> = {};
    base.forEach((g) => {
      const excs = getExcepciones(g);
      const ultima = excs[excs.length - 1];
      if (ultima) counts[ultima] = (counts[ultima] || 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [base]);

  const columnasExport = [
    { header: 'Guía', value: (g: Guia) => g.guia },
    { header: 'Oficina', value: (g: Guia) => g.oficina_destino || '' },
    { header: 'Entidad', value: (g: Guia) => g.entidad_destinatario || '' },
    { header: 'Estado', value: (g: Guia) => g.estado_guia || '' },
    { header: 'Exc.1', value: (g: Guia) => g.excepcion_1 || '' },
    { header: 'Exc.2', value: (g: Guia) => g.excepcion_2 || '' },
    { header: 'Exc.3', value: (g: Guia) => g.excepcion_3 || '' },
    { header: 'Exc.4', value: (g: Guia) => g.excepcion_4 || '' },
    { header: 'Exc.5', value: (g: Guia) => g.excepcion_5 || '' },
    { header: 'Acción', value: (g: Guia) => g.accion_recomendada || '' },
    { header: 'Últ. Mov.', value: (g: Guia) => g.f_historia || '' },
    { header: 'Días sin Mov.', value: (g: Guia) => g.dias_sin_movimiento ?? '' },
    { header: 'COD', value: (g: Guia) => g.cod || 0 },
  ];

  return (
    <div className="p-5">
      <div className="bg-white rounded-lg border border-[var(--vg-border)] overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--vg-border)] flex items-center justify-between flex-wrap gap-2">
          <div>
            <div className="font-bold text-[13px]">Cadena de Excepciones</div>
            <div className="text-[11px] text-[var(--vg-text2)]">
              Excluye entregadas, devoluciones, canceladas, en ruta y pre-documentadas · {filas.length.toLocaleString('es-MX')} guías
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => exportToExcel(filas, columnasExport, 'Excepciones')}
              className="text-[11px] font-semibold text-[var(--vg-text2)] border border-[var(--vg-border)] rounded-md px-2.5 py-1.5 bg-white"
            >
              ⬇ Excel
            </button>
            <button
              onClick={() => exportToPDF(filas, columnasExport, 'Excepciones')}
              className="text-[11px] font-semibold text-[var(--vg-text2)] border border-[var(--vg-border)] rounded-md px-2.5 py-1.5 bg-white"
            >
              🖨 PDF
            </button>
          </div>
        </div>

        <BulkSearch onSearch={setBulkGuias} onClear={() => setBulkGuias(null)} activo={!!bulkGuias} />

        <div className="px-4 py-2.5 border-b border-[var(--vg-border)] flex items-center gap-2 flex-wrap overflow-x-auto vg-scroll">
          <span className="text-[11px] font-bold text-[var(--vg-text2)] whitespace-nowrap">Por excepción:</span>
          {filtroExcepcion && (
            <button
              onClick={() => setFiltroExcepcion('')}
              className="text-[10.5px] font-semibold text-white bg-[var(--vg-text2)] rounded-full px-2.5 py-1 whitespace-nowrap"
            >
              ✕ {filtroExcepcion}
            </button>
          )}
          {!filtroExcepcion &&
            kpisPorExcepcion.map(([exc, n]) => (
              <button
                key={exc}
                onClick={() => setFiltroExcepcion(exc)}
                className="text-[10.5px] font-semibold text-[var(--vg-text2)] border border-[var(--vg-border)] rounded-full px-2.5 py-1 whitespace-nowrap hover:bg-[var(--vg-bg)]"
              >
                {exc} <span className="font-bold text-[var(--vg-blue)]">{n}</span>
              </button>
            ))}
        </div>

        <div className="max-h-[600px] overflow-y-auto vg-scroll">
          <table className="vg-table">
            <thead>
              <tr>
                <th>Guía</th>
                <th>Oficina</th>
                <th>Entidad</th>
                <th>Estado</th>
                <th>Días sin Mov.</th>
                <th>Últ. Mov.</th>
                <th>Acción</th>
                <th>Exc.1</th>
                <th>Exc.2</th>
                <th>Exc.3</th>
                <th>Exc.4</th>
                <th>Exc.5</th>
                <th>COD</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((g) => (
                <tr key={g.id}>
                  <td className="font-mono font-semibold">{g.guia}</td>
                  <td>{g.oficina_destino}</td>
                  <td>{g.entidad_destinatario}</td>
                  <td>{g.estado_guia}</td>
                  <td>
                    <div className="flex flex-col items-start gap-0.5">
                      <span
                        className={
                          g.dias_sin_movimiento && g.dias_sin_movimiento > 5 ? 'text-[var(--vg-red)] font-bold' : ''
                        }
                      >
                        {g.dias_sin_movimiento !== null ? `${g.dias_sin_movimiento}d` : '—'}
                      </span>
                      <AlertaDiasBadge dias={g.dias_sin_movimiento} />
                    </div>
                  </td>
                  <td>{g.f_historia || '—'}</td>
                  <td>
                    <AccionBadge accion={g.accion_recomendada} />
                  </td>
                  <td>{g.excepcion_1 || '—'}</td>
                  <td>{g.excepcion_2 || '—'}</td>
                  <td>{g.excepcion_3 || '—'}</td>
                  <td>{g.excepcion_4 || '—'}</td>
                  <td>{g.excepcion_5 || '—'}</td>
                  <td>{g.cod ? `$${g.cod.toLocaleString('es-MX')}` : '—'}</td>
                </tr>
              ))}
              {!filas.length && (
                <tr>
                  <td colSpan={13} className="text-center text-[var(--vg-text3)] py-6">
                    No hay guías que coincidan con el filtro
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
