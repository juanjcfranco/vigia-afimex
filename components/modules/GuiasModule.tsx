'use client';

import { useMemo, useState } from 'react';
import { Guia } from '@/lib/types';
import AccionBadge from '@/components/AccionBadge';
import BulkSearch from '@/components/BulkSearch';
import { exportToExcel, exportToPDF } from '@/lib/export';

const PAGE_SIZE = 200;

export default function GuiasModule({ guias }: { guias: Guia[] }) {
  const [busqueda, setBusqueda] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('');
  const [bulkGuias, setBulkGuias] = useState<string[] | null>(null);
  const [pagina, setPagina] = useState(1);

  const estados = useMemo(() => [...new Set(guias.map((g) => g.estado_guia).filter(Boolean))] as string[], [guias]);

  const filasCompletas = useMemo(() => {
    let f = guias;
    if (busqueda.trim()) {
      const q = busqueda.trim().toUpperCase();
      f = f.filter((g) => g.guia.toUpperCase().includes(q));
    }
    if (filtroEstado) f = f.filter((g) => g.estado_guia === filtroEstado);
    if (bulkGuias && bulkGuias.length) {
      const set = new Set(bulkGuias.map((g) => g.toUpperCase()));
      f = f.filter((g) => set.has(g.guia.toUpperCase()));
    }
    return f;
  }, [guias, busqueda, filtroEstado, bulkGuias]);

  const totalPaginas = Math.max(1, Math.ceil(filasCompletas.length / PAGE_SIZE));
  const paginaSegura = Math.min(pagina, totalPaginas);
  const filas = useMemo(
    () => filasCompletas.slice((paginaSegura - 1) * PAGE_SIZE, paginaSegura * PAGE_SIZE),
    [filasCompletas, paginaSegura]
  );

  const columnasExport = [
    { header: 'Guía', value: (g: Guia) => g.guia },
    { header: 'Estado', value: (g: Guia) => g.estado_guia || '' },
    { header: 'Oficina', value: (g: Guia) => g.oficina_destino || '' },
    { header: 'Entidad', value: (g: Guia) => g.entidad_destinatario || '' },
    { header: 'Ciudad', value: (g: Guia) => g.ciudad_destinatario || '' },
    { header: 'Calificación', value: (g: Guia) => g.calificacion || '' },
    { header: 'COD', value: (g: Guia) => g.cod || 0 },
    { header: 'Acción', value: (g: Guia) => g.accion_recomendada || '' },
    { header: 'F. Documentación', value: (g: Guia) => g.f_documentacion || '' },
  ];

  return (
    <div className="p-5">
      <div className="bg-white rounded-lg border border-[var(--vg-border)] overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--vg-border)] flex items-center gap-2 flex-wrap">
          <div className="font-bold text-[13px] mr-3">Consulta de Guías</div>
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar guía..."
            className="text-[12px] border border-[var(--vg-border)] rounded-md px-2.5 py-1.5 flex-1 min-w-[160px]"
          />
          <select
            value={filtroEstado}
            onChange={(e) => setFiltroEstado(e.target.value)}
            className="text-[12px] border border-[var(--vg-border)] rounded-md px-2.5 py-1.5"
          >
            <option value="">Todos los estados</option>
            {estados.map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </select>
          <button
            onClick={() => exportToExcel(filasCompletas, columnasExport, 'Guias')}
            className="text-[11px] font-semibold text-[var(--vg-text2)] border border-[var(--vg-border)] rounded-md px-2.5 py-1.5 bg-white"
          >
            ⬇ Excel
          </button>
          <button
            onClick={() => exportToPDF(filasCompletas, columnasExport, 'Guias')}
            className="text-[11px] font-semibold text-[var(--vg-text2)] border border-[var(--vg-border)] rounded-md px-2.5 py-1.5 bg-white"
          >
            🖨 PDF
          </button>
        </div>

        <BulkSearch onSearch={setBulkGuias} onClear={() => setBulkGuias(null)} activo={!!bulkGuias} />

        <div className="px-4 py-2 text-[11px] text-[var(--vg-text2)] border-b border-[var(--vg-border)] flex items-center justify-between flex-wrap gap-2">
          <span>{filasCompletas.length.toLocaleString('es-MX')} resultados</span>
          {totalPaginas > 1 && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPagina((p) => Math.max(1, p - 1))}
                disabled={paginaSegura === 1}
                className="px-2 py-0.5 border border-[var(--vg-border)] rounded disabled:opacity-40 font-semibold"
              >
                ← Anterior
              </button>
              <span>
                Página {paginaSegura} de {totalPaginas}
              </span>
              <button
                onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
                disabled={paginaSegura === totalPaginas}
                className="px-2 py-0.5 border border-[var(--vg-border)] rounded disabled:opacity-40 font-semibold"
              >
                Siguiente →
              </button>
            </div>
          )}
        </div>

        <div className="max-h-[600px] overflow-y-auto vg-scroll">
          <table className="vg-table">
            <thead>
              <tr>
                <th>Guía</th>
                <th>Estado</th>
                <th>Oficina</th>
                <th>Entidad</th>
                <th>Ciudad</th>
                <th>Calificación</th>
                <th>COD</th>
                <th>Acción</th>
                <th>F. Documentación</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((g) => (
                <tr key={g.id}>
                  <td className="font-mono font-semibold">{g.guia}</td>
                  <td>{g.estado_guia}</td>
                  <td>{g.oficina_destino}</td>
                  <td>{g.entidad_destinatario}</td>
                  <td>{g.ciudad_destinatario}</td>
                  <td>{g.calificacion || '—'}</td>
                  <td>{g.cod ? `$${g.cod.toLocaleString('es-MX')}` : '—'}</td>
                  <td>
                    <AccionBadge accion={g.accion_recomendada} />
                  </td>
                  <td>{g.f_documentacion || '—'}</td>
                </tr>
              ))}
              {!filas.length && (
                <tr>
                  <td colSpan={9} className="text-center text-[var(--vg-text3)] py-6">
                    No se encontraron guías
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
