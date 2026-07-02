'use client';

import { useMemo } from 'react';
import { Guia } from '@/lib/types';
import { exportToExcel, exportToPDF } from '@/lib/export';

export default function PredocModule({ guias }: { guias: Guia[] }) {
  const filas = useMemo(() => guias.filter((g) => g.es_predoc), [guias]);

  const columnasExport = [
    { header: 'Guía', value: (g: Guia) => g.guia },
    { header: 'Cliente', value: (g: Guia) => g.cliente || '' },
    { header: 'Oficina Origen', value: (g: Guia) => g.of_origen || '' },
    { header: 'Oficina Destino', value: (g: Guia) => g.oficina_destino || '' },
    { header: 'Entidad', value: (g: Guia) => g.entidad_destinatario || '' },
    { header: 'Fecha Documentación', value: (g: Guia) => g.f_documentacion || '' },
  ];

  return (
    <div className="p-5">
      <div className="bg-white rounded-lg border border-[var(--vg-border)] overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--vg-border)] flex items-center justify-between flex-wrap gap-2">
          <div>
            <div className="font-bold text-[13px]">Guías Pre-Documentadas</div>
            <div className="text-[11px] text-[var(--vg-text2)]">
              Aún no recibidas en AFIMEX · no incluidas en indicadores · {filas.length.toLocaleString('es-MX')} guías
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => exportToExcel(filas, columnasExport, 'Pre-Documentadas')}
              className="text-[11px] font-semibold text-[var(--vg-text2)] border border-[var(--vg-border)] rounded-md px-2.5 py-1.5 bg-white"
            >
              ⬇ Excel
            </button>
            <button
              onClick={() => exportToPDF(filas, columnasExport, 'Pre-Documentadas')}
              className="text-[11px] font-semibold text-[var(--vg-text2)] border border-[var(--vg-border)] rounded-md px-2.5 py-1.5 bg-white"
            >
              🖨 PDF
            </button>
          </div>
        </div>
        <div className="max-h-[600px] overflow-y-auto vg-scroll">
          <table className="vg-table">
            <thead>
              <tr>
                <th>Guía</th>
                <th>Cliente</th>
                <th>Oficina Origen</th>
                <th>Oficina Destino</th>
                <th>Entidad</th>
                <th>Fecha Documentación</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((g) => (
                <tr key={g.id}>
                  <td className="font-mono font-semibold">{g.guia}</td>
                  <td>{g.cliente}</td>
                  <td>{g.of_origen}</td>
                  <td>{g.oficina_destino}</td>
                  <td>{g.entidad_destinatario}</td>
                  <td>{g.f_documentacion || '—'}</td>
                </tr>
              ))}
              {!filas.length && (
                <tr>
                  <td colSpan={6} className="text-center text-[var(--vg-text3)] py-6">
                    No hay guías pre-documentadas
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
