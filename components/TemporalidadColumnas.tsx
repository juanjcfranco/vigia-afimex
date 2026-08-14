'use client';

import { Guia } from '@/lib/types';
import { calcularTemporalidad } from '@/lib/business-logic';
import SortableTh from '@/components/SortableTh';
import { SortDir } from '@/lib/useSortableTable';

// ============================================================
// Set compartido de las 7 columnas de temporalidad (3 fechas crudas +
// 4 cálculos de días), reutilizado en Abiertas / Guías / Devoluciones /
// Excepciones / Acciones para no duplicar el marcado 5 veces.
// ============================================================

// Claves de sort que maneja este set — cada módulo debe delegar a
// temporalidadSortValue() en el 'default' de su propio switch de sort.
export const TEMPORALIDAD_SORT_KEYS = [
  'fechaPlataforma',
  'primeraRuta',
  'recibidoOficina',
  'diasDocPlataforma',
  'diasPlataformaRuta',
  'diasRecibofRuta',
  'diasRecibofConfirmacion',
] as const;

export function temporalidadSortValue(g: Guia, key: string): string | number | null {
  if (key === 'fechaPlataforma') return g.fecha_plataforma;
  if (key === 'primeraRuta') return g.primera_ruta;
  if (key === 'recibidoOficina') return g.recibido_oficina;
  const t = calcularTemporalidad(g);
  if (key === 'diasDocPlataforma') return t.docVsPlataforma;
  if (key === 'diasPlataformaRuta') return t.plataformaVsPrimeraRuta;
  if (key === 'diasRecibofRuta') return t.recibidoOfVsPrimeraRuta;
  if (key === 'diasRecibofConfirmacion') return t.recibidoOfVsConfirmacion;
  return null;
}

interface TemporalidadHeadersProps {
  sortKey: string | null;
  sortDir: SortDir;
  onSort: (key: string) => void;
}

export function TemporalidadHeaders({ sortKey, sortDir, onSort }: TemporalidadHeadersProps) {
  return (
    <>
      <SortableTh label="Fecha Plataforma" sortKey="fechaPlataforma" currentKey={sortKey} currentDir={sortDir} onSort={onSort} />
      <SortableTh label="Primera Ruta" sortKey="primeraRuta" currentKey={sortKey} currentDir={sortDir} onSort={onSort} />
      <SortableTh label="Recibido Oficina" sortKey="recibidoOficina" currentKey={sortKey} currentDir={sortDir} onSort={onSort} />
      <SortableTh label="Doc→Plataf. (d)" sortKey="diasDocPlataforma" currentKey={sortKey} currentDir={sortDir} onSort={onSort} />
      <SortableTh label="Plataf.→1ra Ruta (d)" sortKey="diasPlataformaRuta" currentKey={sortKey} currentDir={sortDir} onSort={onSort} />
      <SortableTh label="RecibOf→1ra Ruta (d)" sortKey="diasRecibofRuta" currentKey={sortKey} currentDir={sortDir} onSort={onSort} />
      <SortableTh label="RecibOf→Confirm. (d)" sortKey="diasRecibofConfirmacion" currentKey={sortKey} currentDir={sortDir} onSort={onSort} />
    </>
  );
}

export function TemporalidadCells({ guia }: { guia: Guia }) {
  const t = calcularTemporalidad(guia);
  const fmt = (n: number | null) => (n !== null ? `${n}d` : '—');
  return (
    <>
      <td>{guia.fecha_plataforma || '—'}</td>
      <td>{guia.primera_ruta || '—'}</td>
      <td>{guia.recibido_oficina || '—'}</td>
      <td>{fmt(t.docVsPlataforma)}</td>
      <td>{fmt(t.plataformaVsPrimeraRuta)}</td>
      <td>{fmt(t.recibidoOfVsPrimeraRuta)}</td>
      <td>{fmt(t.recibidoOfVsConfirmacion)}</td>
    </>
  );
}

// Columnas para exportToExcel/exportToPDF — se hace spread en el arreglo
// columnasExport ya existente de cada módulo.
export function temporalidadColumnasExport(): { header: string; value: (g: Guia) => string | number }[] {
  return [
    { header: 'Fecha Plataforma', value: (g: Guia) => g.fecha_plataforma || '' },
    { header: 'Primera Ruta', value: (g: Guia) => g.primera_ruta || '' },
    { header: 'Recibido Oficina', value: (g: Guia) => g.recibido_oficina || '' },
    { header: 'Doc→Plataforma (d)', value: (g: Guia) => calcularTemporalidad(g).docVsPlataforma ?? '' },
    { header: 'Plataforma→1ra Ruta (d)', value: (g: Guia) => calcularTemporalidad(g).plataformaVsPrimeraRuta ?? '' },
    { header: 'RecibOf→1ra Ruta (d)', value: (g: Guia) => calcularTemporalidad(g).recibidoOfVsPrimeraRuta ?? '' },
    { header: 'RecibOf→Confirmación (d)', value: (g: Guia) => calcularTemporalidad(g).recibidoOfVsConfirmacion ?? '' },
  ];
}
