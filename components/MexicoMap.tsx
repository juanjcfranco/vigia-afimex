'use client';

import { useMemo, useState } from 'react';
import mexicoData from '@/lib/mexico-map-data.json';

interface MexicoMapProps {
  datosPorEntidad: Record<string, { total: number; efectividad: number | null }>;
  metrica: 'volumen' | 'efectividad';
  entidadSeleccionada?: string | null;
  onSeleccionar?: (entidad: string) => void;
}

function colorVolumen(valor: number, max: number): string {
  if (max <= 0 || valor <= 0) return '#F1F5F9';
  const intensidad = Math.min(1, valor / max);
  // Escala de azules: claro -> oscuro
  const r = Math.round(239 - intensidad * (239 - 30));
  const g = Math.round(246 - intensidad * (246 - 58));
  const b = Math.round(255 - intensidad * (255 - 138));
  return `rgb(${r},${g},${b})`;
}

function colorEfectividadMapa(valor: number | null): string {
  if (valor === null) return '#F1F5F9';
  if (valor >= 70) return '#0B9B67';
  if (valor >= 50) return '#EA7C1A';
  return '#DC2626';
}

export default function MexicoMap({ datosPorEntidad, metrica, entidadSeleccionada, onSeleccionar }: MexicoMapProps) {
  const [hoverEntidad, setHoverEntidad] = useState<string | null>(null);

  const maxVolumen = useMemo(() => {
    return Math.max(1, ...Object.values(datosPorEntidad).map((d) => d.total));
  }, [datosPorEntidad]);

  const entidadHover = hoverEntidad ? datosPorEntidad[hoverEntidad] : null;

  return (
    <div className="relative">
      <svg viewBox={mexicoData.viewBox} className="w-full h-auto" style={{ maxHeight: 420 }}>
        {mexicoData.states.map((state) => {
          const datos = datosPorEntidad[state.name];
          const seleccionada = entidadSeleccionada === state.name;
          const fill = !datos
            ? '#F1F5F9'
            : metrica === 'volumen'
              ? colorVolumen(datos.total, maxVolumen)
              : colorEfectividadMapa(datos.efectividad);

          return (
            <path
              key={state.name}
              d={state.path}
              fill={fill}
              stroke={seleccionada ? 'var(--vg-blue)' : '#fff'}
              strokeWidth={seleccionada ? 2.5 : 1}
              onMouseEnter={() => setHoverEntidad(state.name)}
              onMouseLeave={() => setHoverEntidad(null)}
              onClick={() => onSeleccionar?.(state.name)}
              style={{ cursor: onSeleccionar ? 'pointer' : datos ? 'pointer' : 'default', transition: 'opacity 0.15s' }}
              opacity={hoverEntidad && hoverEntidad !== state.name ? 0.6 : 1}
            />
          );
        })}
      </svg>

      {hoverEntidad && entidadHover && (
        <div className="absolute top-2 left-2 bg-white border border-[var(--vg-border)] rounded-lg shadow-md px-3 py-2 text-[12px] pointer-events-none">
          <div className="font-bold">{hoverEntidad}</div>
          <div className="text-[var(--vg-text2)]">{entidadHover.total.toLocaleString('es-MX')} guías</div>
          {entidadHover.efectividad !== null && (
            <div className="text-[var(--vg-text2)]">Efectividad: {entidadHover.efectividad}%</div>
          )}
          {onSeleccionar && <div className="text-[var(--vg-blue)] font-semibold mt-1">Clic para ver detalle →</div>}
        </div>
      )}

      {metrica === 'volumen' ? (
        <div className="flex items-center gap-2 mt-2 text-[10px] text-[var(--vg-text2)]">
          <span>Menor volumen</span>
          <div className="flex-1 h-2 rounded-full" style={{ background: 'linear-gradient(to right, #EFF6FF, #1E3A8A)' }} />
          <span>Mayor volumen</span>
        </div>
      ) : (
        <div className="flex items-center gap-3 mt-2 text-[10px] text-[var(--vg-text2)]">
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: '#0B9B67' }} /> ≥70%
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: '#EA7C1A' }} /> 50-69%
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: '#DC2626' }} /> &lt;50%
          </span>
        </div>
      )}
    </div>
  );
}
