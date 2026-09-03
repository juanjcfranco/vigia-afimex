'use client';

import { useMemo, useState } from 'react';
import { Guia } from '@/lib/types';
import { esRetornoAmplio, ultimaExcepcion } from '@/lib/business-logic';
import AccionBadge from '@/components/AccionBadge';
import BulkSearch from '@/components/BulkSearch';
import { exportToExcel, exportToPDF } from '@/lib/export';
import { useSortableTable } from '@/lib/useSortableTable';
import SortableTh from '@/components/SortableTh';
import TemporalidadKpis from '@/components/TemporalidadKpis';
import { TemporalidadHeaders, TemporalidadCells, temporalidadColumnasExport, temporalidadSortValue } from '@/components/TemporalidadColumnas';

const PAGE_SIZE = 200;

export default function GuiasModule({ guias }: { guias: Guia[] }) {
  const [busqueda, setBusqueda] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('');
  const [bulkGuias, setBulkGuias] = useState<string[] | null>(null);
  const [pagina, setPagina] = useState(1);

  // Vínculo Devolución ↔ Retorno: para una fila que ES un retorno
  // (es_retorno), encontrar qué devolución la referencia como "su"
  // retorno (búsqueda inversa) para mostrar la guía original vinculada.
  const originalPorRetorno = useMemo(() => {
    const map = new Map<string, string>(); // guia del retorno -> guia de la devolución que lo referencia
    guias.forEach((g) => {
      if (g.es_devolucion && g.retorno_guia) map.set(g.retorno_guia, g.guia);
    });
    return map;
  }, [guias]);

  // Guía completa por número — para poder ir de "guía original" (un
  // string) a su fila completa, y así sacar sus excepciones al exportar.
  const guiaPorNumero = useMemo(() => {
    const map = new Map<string, Guia>();
    guias.forEach((g) => map.set(g.guia, g));
    return map;
  }, [guias]);

  // Guía vinculada: "Retorno: X" si esta fila es una devolución con
  // retorno referenciado; "Original: X" si esta fila ES el retorno de
  // alguna devolución; "—" si no aplica ninguno de los dos casos.
  function guiaVinculada(g: Guia): string {
    if (g.es_devolucion && g.retorno_guia) return `Retorno: ${g.retorno_guia}`;
    const original = originalPorRetorno.get(g.guia);
    if (original) return `Original: ${original}`;
    return '';
  }

  // SOLO para exportar (Excel/PDF): si la fila es un retorno, sus propias
  // excepciones normalmente vienen vacías (un retorno es un envío nuevo,
  // no hereda las excepciones de la guía original automáticamente) — así
  // que se sustituyen por las de la guía ORIGINAL vinculada, para que el
  // motivo de la devolución quede visible también en la fila del retorno.
  // En pantalla NO se aplica esta sustitución — ahí cada fila muestra
  // siempre sus propios datos.
  function filaParaExcepcionesExport(g: Guia): Guia {
    if (g.es_retorno) {
      const original = originalPorRetorno.get(g.guia);
      const filaOriginal = original ? guiaPorNumero.get(original) : undefined;
      if (filaOriginal) return filaOriginal;
    }
    return g;
  }

  // Todas las excepciones de la guía (hasta 5), con su fecha cada una —
  // en un solo texto separado por "; " para no necesitar 10 columnas.
  function todasLasExcepcionesTexto(g: Guia): string {
    const pares: Array<[string | null, string | null]> = [
      [g.excepcion_1, g.f_excepcion_1],
      [g.excepcion_2, g.f_excepcion_2],
      [g.excepcion_3, g.f_excepcion_3],
      [g.excepcion_4, g.f_excepcion_4],
      [g.excepcion_5, g.f_excepcion_5],
    ];
    return pares
      .filter(([nombre]) => (nombre || '').trim())
      .map(([nombre, fecha]) => `${(nombre || '').trim()}${fecha ? ` (${fecha})` : ''}`)
      .join('; ');
  }

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

  const { sorted: filasOrdenadas, sortKey, sortDir, requestSort: requestSortBase } = useSortableTable<Guia>(
    filasCompletas,
    (g, key) => {
      switch (key) {
        case 'guia':
          return g.guia;
        case 'tipo':
          return esRetornoAmplio(g) ? 'Retorno' : 'Original';
        case 'estado':
          return g.estado_guia;
        case 'oficina':
          return g.oficina_destino;
        case 'entidad':
          return g.entidad_destinatario;
        case 'ciudad':
          return g.ciudad_destinatario;
        case 'calificacion':
          return g.calificacion;
        case 'cod':
          return g.cod;
        case 'accion':
          return g.accion_recomendada;
        case 'recibidopor':
          return g.nombre_recibio;
        case 'vinculada':
          return guiaVinculada(g);
        case 'ultimaexcepcion':
          return ultimaExcepcion(g).nombre;
        case 'fechaultimaexcepcion':
          return ultimaExcepcion(g).fecha;
        case 'fentrega':
          return g.f_confirmacion;
        case 'fdoc':
          return g.f_documentacion;
        default:
          return temporalidadSortValue(g, key);
      }
    }
  );
  // Al cambiar de columna de orden, regresa a la página 1 — si no, el
  // usuario podría quedar viendo una página que ya no tiene sentido tras
  // reordenar todos los resultados.
  function requestSort(key: string) {
    requestSortBase(key);
    setPagina(1);
  }

  const totalPaginas = Math.max(1, Math.ceil(filasCompletas.length / PAGE_SIZE));
  const paginaSegura = Math.min(pagina, totalPaginas);
  const filas = useMemo(
    () => filasOrdenadas.slice((paginaSegura - 1) * PAGE_SIZE, paginaSegura * PAGE_SIZE),
    [filasOrdenadas, paginaSegura]
  );

  const columnasExport = [
    { header: 'Guía', value: (g: Guia) => g.guia },
    { header: 'Tipo', value: (g: Guia) => (esRetornoAmplio(g) ? 'Retorno' : 'Original') },
    { header: 'Estado', value: (g: Guia) => g.estado_guia || '' },
    { header: 'Oficina', value: (g: Guia) => g.oficina_destino || '' },
    { header: 'Entidad', value: (g: Guia) => g.entidad_destinatario || '' },
    { header: 'Ciudad', value: (g: Guia) => g.ciudad_destinatario || '' },
    { header: 'Calificación', value: (g: Guia) => g.calificacion || '' },
    { header: 'COD', value: (g: Guia) => g.cod || 0 },
    { header: 'Acción', value: (g: Guia) => g.accion_recomendada || '' },
    { header: 'Recibido por', value: (g: Guia) => g.nombre_recibio || '' },
    { header: 'Guía Vinculada', value: (g: Guia) => guiaVinculada(g) },
    { header: 'Última Excepción', value: (g: Guia) => ultimaExcepcion(filaParaExcepcionesExport(g)).nombre || '' },
    { header: 'Fecha Última Excepción', value: (g: Guia) => ultimaExcepcion(filaParaExcepcionesExport(g)).fecha || '' },
    { header: 'Todas las Excepciones', value: (g: Guia) => todasLasExcepcionesTexto(filaParaExcepcionesExport(g)) },
    { header: 'Fecha de Entrega', value: (g: Guia) => g.f_confirmacion || '' },
    { header: 'F. Documentación', value: (g: Guia) => g.f_documentacion || '' },
    ...temporalidadColumnasExport(),
  ];

  return (
    <div className="p-5 space-y-4">
      <TemporalidadKpis guias={filasCompletas} />
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
                <SortableTh label="Guía" sortKey="guia" currentKey={sortKey} currentDir={sortDir} onSort={requestSort} />
                <SortableTh label="Tipo" sortKey="tipo" currentKey={sortKey} currentDir={sortDir} onSort={requestSort} />
                <SortableTh label="Estado" sortKey="estado" currentKey={sortKey} currentDir={sortDir} onSort={requestSort} />
                <SortableTh label="Oficina" sortKey="oficina" currentKey={sortKey} currentDir={sortDir} onSort={requestSort} />
                <SortableTh label="Entidad" sortKey="entidad" currentKey={sortKey} currentDir={sortDir} onSort={requestSort} />
                <SortableTh label="Ciudad" sortKey="ciudad" currentKey={sortKey} currentDir={sortDir} onSort={requestSort} />
                <SortableTh label="Calificación" sortKey="calificacion" currentKey={sortKey} currentDir={sortDir} onSort={requestSort} />
                <SortableTh label="COD" sortKey="cod" currentKey={sortKey} currentDir={sortDir} onSort={requestSort} />
                <SortableTh label="Acción" sortKey="accion" currentKey={sortKey} currentDir={sortDir} onSort={requestSort} />
                <SortableTh label="Recibido por" sortKey="recibidopor" currentKey={sortKey} currentDir={sortDir} onSort={requestSort} />
                <SortableTh label="Guía Vinculada" sortKey="vinculada" currentKey={sortKey} currentDir={sortDir} onSort={requestSort} />
                <SortableTh label="Última Excepción" sortKey="ultimaexcepcion" currentKey={sortKey} currentDir={sortDir} onSort={requestSort} />
                <SortableTh label="Fecha Últ. Excepción" sortKey="fechaultimaexcepcion" currentKey={sortKey} currentDir={sortDir} onSort={requestSort} />
                <th>Todas las Excepciones</th>
                <SortableTh label="Fecha de Entrega" sortKey="fentrega" currentKey={sortKey} currentDir={sortDir} onSort={requestSort} />
                <SortableTh label="F. Documentación" sortKey="fdoc" currentKey={sortKey} currentDir={sortDir} onSort={requestSort} />
                <TemporalidadHeaders sortKey={sortKey} sortDir={sortDir} onSort={requestSort} />
              </tr>
            </thead>
            <tbody>
              {filas.map((g) => (
                <tr key={g.id}>
                  <td className="font-mono font-semibold">{g.guia}</td>
                  <td>
                    {esRetornoAmplio(g) ? (
                      <span className="text-[10px] font-bold text-white bg-[var(--vg-purple)] rounded-full px-1.5 py-0.5">
                        Retorno
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold text-white bg-[var(--vg-blue)] rounded-full px-1.5 py-0.5">
                        Original
                      </span>
                    )}
                  </td>
                  <td>{g.estado_guia}</td>
                  <td>{g.oficina_destino}</td>
                  <td>{g.entidad_destinatario}</td>
                  <td>{g.ciudad_destinatario}</td>
                  <td>{g.calificacion || '—'}</td>
                  <td>{g.cod ? `$${g.cod.toLocaleString('es-MX')}` : '—'}</td>
                  <td>
                    <AccionBadge accion={g.accion_recomendada} />
                  </td>
                  <td>{g.nombre_recibio || '—'}</td>
                  <td>{guiaVinculada(g) || '—'}</td>
                  <td>{ultimaExcepcion(g).nombre || '—'}</td>
                  <td>{ultimaExcepcion(g).fecha || '—'}</td>
                  <td className="text-[11px] max-w-[280px]">{todasLasExcepcionesTexto(g) || '—'}</td>
                  <td>{g.f_confirmacion || '—'}</td>
                  <td>{g.f_documentacion || '—'}</td>
                  <TemporalidadCells guia={g} />
                </tr>
              ))}
              {!filas.length && (
                <tr>
                  <td colSpan={23} className="text-center text-[var(--vg-text3)] py-6">
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
