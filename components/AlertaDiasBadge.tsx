'use client';

import { nivelAlertaPorDias } from '@/lib/business-logic';

const ETIQUETAS_CORTAS: Record<string, string> = {
  alerta: 'Sin movimiento',
  investigacion: 'Investigar',
  critico: 'Crítico',
};

export default function AlertaDiasBadge({ dias }: { dias: number | null }) {
  const alerta = nivelAlertaPorDias(dias);
  if (!alerta.etiqueta) return null;

  return (
    <span
      title={alerta.etiqueta}
      className="inline-block text-[9px] font-bold text-white px-1.5 py-[1px] rounded leading-tight whitespace-nowrap"
      style={{ backgroundColor: alerta.color }}
    >
      {ETIQUETAS_CORTAS[alerta.nivel] || alerta.etiqueta}
    </span>
  );
}
