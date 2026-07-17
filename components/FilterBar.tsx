'use client';

import { useEffect, useRef, useState } from 'react';
import { formatearPeriodo } from '@/lib/business-logic';

interface FilterBarProps {
  clientes?: string[];
  oficinas: string[];
  entidades: string[];
  periodos: string[];
  filtroClientes?: string[];
  filtroOficina: string;
  filtroEntidad: string;
  filtroPeriodo: string;
  onClientes?: (v: string[]) => void;
  onOficina: (v: string) => void;
  onEntidad: (v: string) => void;
  onPeriodo: (v: string) => void;
  onLimpiar: () => void;
}

// Selector múltiple de cliente: un botón que abre un panel con checkboxes.
// Vacío ('' / []) significa "todos los clientes", igual que antes.
function SelectorClientes({
  clientes,
  seleccionados,
  onChange,
}: {
  clientes: string[];
  seleccionados: string[];
  onChange: (v: string[]) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickFuera(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false);
    }
    document.addEventListener('mousedown', onClickFuera);
    return () => document.removeEventListener('mousedown', onClickFuera);
  }, []);

  function toggle(cliente: string) {
    if (seleccionados.includes(cliente)) onChange(seleccionados.filter((c) => c !== cliente));
    else onChange([...seleccionados, cliente]);
  }

  const etiqueta =
    seleccionados.length === 0
      ? 'Todos los clientes'
      : seleccionados.length === 1
        ? seleccionados[0]
        : `${seleccionados.length} clientes seleccionados`;

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
            {seleccionados.length === 0 ? '✓ ' : ''}Todos los clientes
          </button>
          {clientes.map((c) => (
            <label
              key={c}
              className="flex items-center gap-2 px-3 py-1.5 text-[12px] hover:bg-[var(--vg-bg)] cursor-pointer"
            >
              <input type="checkbox" checked={seleccionados.includes(c)} onChange={() => toggle(c)} />
              <span className="truncate">{c}</span>
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
  filtroClientes = [],
  filtroOficina,
  filtroEntidad,
  filtroPeriodo,
  onClientes,
  onOficina,
  onEntidad,
  onPeriodo,
  onLimpiar,
}: FilterBarProps) {
  return (
    <div className="bg-white px-4 py-3 flex items-center gap-2.5 flex-wrap border-b border-[var(--vg-border)]">
      <span className="text-[12px] font-semibold text-[var(--vg-text2)]">🔍 Filtrar:</span>
      {periodos.length > 1 && (
        <select
          value={filtroPeriodo}
          onChange={(e) => onPeriodo(e.target.value)}
          className="text-[12px] border border-[var(--vg-border)] rounded-md px-2.5 py-1.5 bg-white"
        >
          <option value="">Todos los periodos</option>
          {periodos.map((p) => (
            <option key={p} value={p}>
              {formatearPeriodo(p)}
            </option>
          ))}
        </select>
      )}
      {clientes.length > 1 && onClientes && (
        <SelectorClientes clientes={clientes} seleccionados={filtroClientes} onChange={onClientes} />
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
      {(filtroClientes.length > 0 || filtroOficina || filtroEntidad || filtroPeriodo) && (
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
