'use client';

import { ACCION_COLORS } from '@/lib/types';

export default function AccionBadge({ accion }: { accion: string | null }) {
  if (!accion) return <span className="text-[var(--vg-text3)]">—</span>;
  const color = ACCION_COLORS[accion] || '#6B7280';
  return (
    <span
      className="inline-block text-[10.5px] font-bold text-white px-2 py-0.5 rounded-full"
      style={{ backgroundColor: color }}
    >
      {accion}
    </span>
  );
}
