'use client';

import { useMemo } from 'react';
import { Guia } from '@/lib/types';
import { calcularPromedioTemporalidad } from '@/lib/business-logic';
import KpiCard from '@/components/KpiCard';

// Fila de 4 KpiCards con el promedio de días de cada etapa de
// temporalidad, reutilizada en Abiertas / Guías / Devoluciones /
// Excepciones / Acciones para no duplicar el cálculo en cada módulo.
export default function TemporalidadKpis({ guias }: { guias: Guia[] }) {
  const prom = useMemo(() => calcularPromedioTemporalidad(guias), [guias]);

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <KpiCard
        title="Doc. → Plataforma"
        value={prom.docVsPlataforma !== null ? `${prom.docVsPlataforma}d` : '—'}
        subtitle={`Promedio · ${prom.muestras.docVsPlataforma} guía(s) con dato`}
        accentColor="#1E3A8A"
      />
      <KpiCard
        title="Plataforma → 1ra Ruta"
        value={prom.plataformaVsPrimeraRuta !== null ? `${prom.plataformaVsPrimeraRuta}d` : '—'}
        subtitle={`Promedio · ${prom.muestras.plataformaVsPrimeraRuta} guía(s) con dato`}
        accentColor="#0B9B67"
      />
      <KpiCard
        title="Recib. Oficina → 1ra Ruta"
        value={prom.recibidoOfVsPrimeraRuta !== null ? `${prom.recibidoOfVsPrimeraRuta}d` : '—'}
        subtitle={`Promedio · ${prom.muestras.recibidoOfVsPrimeraRuta} guía(s) con dato`}
        accentColor="#B45309"
      />
      <KpiCard
        title="Recib. Oficina → Confirmación"
        value={prom.recibidoOfVsConfirmacion !== null ? `${prom.recibidoOfVsConfirmacion}d` : '—'}
        subtitle={`Promedio · ${prom.muestras.recibidoOfVsConfirmacion} guía(s) con dato`}
        accentColor="#7C3AED"
      />
    </div>
  );
}
