'use client';

import Image from 'next/image';
import { Carga } from '@/lib/types';
import { formatearPeriodo } from '@/lib/business-logic';

interface HeaderProps {
  cargaActiva: Carga | null;
  periodos: string[];
  totalGuias: number;
  efectividad: number | null;
  onAbrirCierre: () => void;
  onAbrirCarga: () => void;
  onAbrirContactos: () => void;
}

function formatearRangoPeriodos(periodos: string[], fallback: string | null): string {
  if (!periodos.length) return formatearPeriodo(fallback);
  const sorted = [...periodos].sort();
  if (sorted.length === 1) return formatearPeriodo(sorted[0]);
  return `${formatearPeriodo(sorted[0])} – ${formatearPeriodo(sorted[sorted.length - 1])}`;
}

export default function Header({ cargaActiva, periodos, totalGuias, efectividad, onAbrirCierre, onAbrirCarga, onAbrirContactos }: HeaderProps) {
  return (
    <header className="bg-[var(--vg-blue)] text-white px-5 py-3 flex items-center justify-between flex-wrap gap-3">
      <div className="flex items-center gap-3">
        <div className="bg-white rounded-md px-2 py-1.5 flex items-center">
          <Image src="/logo-afimex.png" alt="AFIMEX" width={90} height={28} priority />
        </div>
        <div className="flex flex-col leading-tight">
          <span className="font-bold text-lg tracking-tight">VIGÍA</span>
          <span className="text-[11px] text-blue-200">Panel de Control Operativo</span>
        </div>
        {cargaActiva && (
          <div className="ml-4 pl-4 border-l border-blue-400/40 text-[12px] text-blue-100">
            <div className="font-semibold text-white">{cargaActiva.cliente}</div>
            <div>{formatearRangoPeriodos(periodos, cargaActiva.periodo)} · {cargaActiva.nombre_archivo}</div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={onAbrirContactos}
          className="bg-white/10 hover:bg-white/20 text-white text-[12px] font-semibold px-3 py-1.5 rounded-md transition"
        >
          📋 Contactos
        </button>
        <button
          onClick={onAbrirCarga}
          className="bg-white/10 hover:bg-white/20 text-white text-[12px] font-semibold px-3 py-1.5 rounded-md transition"
        >
          ⬆ Cargar Excel
        </button>
        <button
          onClick={onAbrirCierre}
          className="bg-orange-500 hover:bg-orange-600 text-white text-[12px] font-semibold px-3 py-1.5 rounded-md transition"
        >
          📋 Reporte de Cierre
        </button>
        <div className="bg-white/15 text-white text-[12px] font-semibold px-3 py-1.5 rounded-full">
          {totalGuias.toLocaleString('es-MX')} guías · {efectividad !== null ? `${efectividad}%` : '—'} efectividad
        </div>
      </div>
    </header>
  );
}
