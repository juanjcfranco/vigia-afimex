'use client';

import { SortDir } from '@/lib/useSortableTable';

interface SortableThProps {
  label: string;
  sortKey: string;
  currentKey: string | null;
  currentDir: SortDir;
  onSort: (key: string) => void;
  className?: string;
}

// Encabezado de columna clickeable para tablas ordenables. Se usa en
// lugar de un <th> plano dentro de <thead><tr>.
export default function SortableTh({ label, sortKey, currentKey, currentDir, onSort, className }: SortableThProps) {
  const activo = currentKey === sortKey;
  return (
    <th
      onClick={() => onSort(sortKey)}
      className={`cursor-pointer select-none hover:bg-black/5 transition-colors ${className || ''}`}
      title="Ordenar"
    >
      <span className="inline-flex items-center gap-1 whitespace-nowrap">
        {label}
        <span className={activo ? 'text-[var(--vg-blue)]' : 'text-[var(--vg-text3)] opacity-40'} style={{ fontSize: 9 }}>
          {activo ? (currentDir === 'asc' ? '▲' : '▼') : '⇅'}
        </span>
      </span>
    </th>
  );
}
