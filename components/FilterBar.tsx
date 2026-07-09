'use client';

import { formatearPeriodo } from '@/lib/business-logic';

interface FilterBarProps {
  clientes?: string[];
  oficinas: string[];
  entidades: string[];
  periodos: string[];
  filtroCliente?: string;
  filtroOficina: string;
  filtroEntidad: string;
  filtroPeriodo: string;
  onCliente?: (v: string) => void;
  onOficina: (v: string) => void;
  onEntidad: (v: string) => void;
  onPeriodo: (v: string) => void;
  onLimpiar: () => void;
}

export default function FilterBar({
  clientes = [],
  oficinas,
  entidades,
  periodos,
  filtroCliente = '',
  filtroOficina,
  filtroEntidad,
  filtroPeriodo,
  onCliente,
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
      {clientes.length > 1 && onCliente && (
        <select
          value={filtroCliente}
          onChange={(e) => onCliente(e.target.value)}
          className="text-[12px] border border-[var(--vg-border)] rounded-md px-2.5 py-1.5 bg-white"
        >
          <option value="">Todos los clientes</option>
          {clientes.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
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
      {(filtroCliente || filtroOficina || filtroEntidad || filtroPeriodo) && (
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
