'use client';

import { useEffect, useRef, useState } from 'react';
import { formatearPeriodo, formatearDia } from '@/lib/business-logic';

interface FilterBarProps {
  clientes?: string[];
  oficinas: string[];
  entidades: string[];
  periodos: string[];
  dias?: string[];
  filtroClientes?: string[];
  filtroOficina: string;
  filtroEntidad: string;
  filtroPeriodos: string[];
  filtroDia?: string;
  onClientes?: (v: string[]) => void;
  onOficina: (v: string) => void;
  onEntidad: (v: string) => void;
  onPeriodos: (v: string[]) => void;
  onDia?: (v: string) => void;
  onLimpiar: () => void;
}

// Selector múltiple genérico: un botón que abre un panel con checkboxes.
// Vacío ([]) significa "todos" (todas las opciones), sea cliente o periodo.
export function SelectorMultiple({
  opciones,
  seleccionados,
  onChange,
  etiquetaTodos,
  formatearOpcion,
}: {
  opciones: string[];
  seleccionados: string[];
  onChange: (v: string[]) => void;
  etiquetaTodos: string;
  formatearOpcion?: (v: string) => string;
}) {
  const [abierto, setAbierto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const fmt = formatearOpcion || ((v: string) => v);

  useEffect(() => {
    function onClickFuera(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false);
    }
    document.addEventListener('mousedown', onClickFuera);
    return () => document.removeEventListener('mousedown', onClickFuera);
  }, []);

  function toggle(opcion: string) {
    if (seleccionados.includes(opcion)) onChange(seleccionados.filter((c) => c !== opcion));
    else onChange([...seleccionados, opcion]);
  }

  const etiqueta =
    seleccionados.length === 0
      ? etiquetaTodos
      : seleccionados.length === 1
        ? fmt(seleccionados[0])
        : `${seleccionados.length} seleccionados`;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setAbierto((a) => !a)}
        className="text-[12px] border border-[var(--vg-border)] rounded-md px-2.5 py-1.5 bg-white flex items-center gap-1.5 min-w-[160px] justify-between"
      >
        <span className="truncate">{etiqueta}</span>
        <span className="text-[var(--vg-text3)] text-[10px]">▼</span>
      </button>
      {abierto && (
        <div className="absolute z-20 mt-1 bg-white border border-[var(--vg-border)] rounded-md shadow-lg py-1 min-w-[220px] max-h-[280px] overflow-y-auto vg-scroll">
          <button
            onClick={() => onChange([])}
            className="w-full text-left px-3 py-1.5 text-[12px] font-semibold hover:bg-[var(--vg-bg)] border-b border-[var(--vg-border)]"
          >
            {seleccionados.length === 0 ? '✓ ' : ''}{etiquetaTodos}
          </button>
          {opciones.map((o) => (
            <label
              key={o}
              className="flex items-center gap-2 px-3 py-1.5 text-[12px] hover:bg-[var(--vg-bg)] cursor-pointer"
            >
              <input type="checkbox" checked={seleccionados.includes(o)} onChange={() => toggle(o)} />
              <span className="truncate">{fmt(o)}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

export default function FilterBar({
  clientes = [],
  oficinas,
  entidades,
  periodos,
  dias = [],
  filtroClientes = [],
  filtroOficina,
  filtroEntidad,
  filtroPeriodos,
  filtroDia = '',
  onClientes,
  onOficina,
  onEntidad,
  onPeriodos,
  onDia,
  onLimpiar,
}: FilterBarProps) {
  return (
    <div className="bg-white px-4 py-3 flex items-center gap-2.5 flex-wrap border-b border-[var(--vg-border)]">
      <span className="text-[12px] font-semibold text-[var(--vg-text2)]">🔍 Filtrar:</span>
      {periodos.length > 1 && (
        <SelectorMultiple
          opciones={periodos}
          seleccionados={filtroPeriodos}
          onChange={onPeriodos}
          etiquetaTodos="Todos los periodos"
          formatearOpcion={formatearPeriodo}
        />
      )}
      {dias.length > 1 && onDia && filtroPeriodos.length === 1 && (
        <select
          value={filtroDia}
          onChange={(e) => onDia(e.target.value)}
          className="text-[12px] border border-[var(--vg-border)] rounded-md px-2.5 py-1.5 bg-white"
        >
          <option value="">Todos los días</option>
          {dias.map((d) => (
            <option key={d} value={d}>
              Hasta {formatearDia(d)}
            </option>
          ))}
        </select>
      )}
      {clientes.length > 1 && onClientes && (
        <SelectorMultiple opciones={clientes} seleccionados={filtroClientes} onChange={onClientes} etiquetaTodos="Todos los clientes" />
      )}
      <select
        value={filtroOficina}
        onChange={(e) => onOficina(e.target.value)}
        className="text-[12px] border border-[var(--vg-border)] rounded-md px-2.5 py-1.5 bg-white"
      >
        <option value="">Todas las oficinas</option>
        {oficinas.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      <select
        value={filtroEntidad}
        onChange={(e) => onEntidad(e.target.value)}
        className="text-[12px] border border-[var(--vg-border)] rounded-md px-2.5 py-1.5 bg-white"
      >
        <option value="">Todas las entidades</option>
        {entidades.map((e) => (
          <option key={e} value={e}>
            {e}
          </option>
        ))}
      </select>
      {(filtroClientes.length > 0 || filtroOficina || filtroEntidad || filtroPeriodos.length > 0 || filtroDia) && (
        <button
          onClick={onLimpiar}
          className="text-[12px] font-semibold text-[var(--vg-text2)] border border-[var(--vg-border)] rounded-md px-2.5 py-1.5 hover:bg-[var(--vg-bg)]"
        >
          ✕ Limpiar
        </button>
      )}
    </div>
  );
}
