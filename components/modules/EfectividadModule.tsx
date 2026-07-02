'use client';

import { useMemo, useState } from 'react';
import { Guia } from '@/lib/types';
import { isEntregada, isAbiertaPorEstado, colorEfectividad, calcularEfectividad, esRetornoAmplio } from '@/lib/business-logic';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { exportToExcel, exportToPDF } from '@/lib/export';

interface FilaEfectividad {
  key: string;
  entregadas: number;
  devoluciones: number;
  abiertas: number;
  efectividad: number | null;
  total: number;
}

function efectividadPorCampo(guiasIn: Guia[], campo: keyof Guia) {
  // Excluir guías de retorno (explícitas o de otro periodo): ya están
  // contabilizadas como parte de la devolución original.
  const guias = guiasIn.filter((g) => !esRetornoAmplio(g) && !g.es_predoc);
  const grupos: Record<string, Guia[]> = {};
  guias.forEach((g) => {
    const key = (g[campo] as string) || 'SIN DATO';
    if (!grupos[key]) grupos[key] = [];
    grupos[key].push(g);
  });

  return Object.entries(grupos)
    .map(([key, lista]) => {
      const entregadas = lista.filter((g) => isEntregada(g.estado_guia)).length;
      const devoluciones = lista.filter((g) => g.es_devolucion).length;
      const abiertas = lista.filter((g) => isAbiertaPorEstado(g)).length;
      const efectividad = calcularEfectividad(entregadas, devoluciones, abiertas);
      return { key, entregadas, devoluciones, abiertas, efectividad, total: lista.length };
    })
    .sort((a, b) => b.total - a.total);
}

export default function EfectividadModule({ guias }: { guias: Guia[] }) {
  const [vista, setVista] = useState<'oficina' | 'entidad'>('oficina');

  const filas = useMemo(
    () => efectividadPorCampo(guias, vista === 'oficina' ? 'oficina_destino' : 'entidad_destinatario'),
    [guias, vista]
  );

  const top15 = filas.slice(0, 15).map((f) => ({ ...f, efNum: f.efectividad ?? 0 }));

  return (
    <div className="p-5 space-y-4">
      <div className="bg-white rounded-lg border border-[var(--vg-border)] p-4">
        <div className="font-bold text-[12.5px] mb-3">
          Efectividad — Top 15 {vista === 'oficina' ? 'Oficinas' : 'Entidades'} por Volumen
        </div>
        <ResponsiveContainer width="100%" height={360}>
          <BarChart data={top15} margin={{ bottom: 80 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="key" angle={-40} textAnchor="end" interval={0} fontSize={10} height={100} />
            <YAxis fontSize={11} unit="%" />
            <Tooltip formatter={(v) => `${v}%`} />
            <Bar dataKey="efNum" radius={[4, 4, 0, 0]}>
              {top15.map((entry, i) => (
                <Cell key={i} fill={colorEfectividad(entry.efectividad)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-white rounded-lg border border-[var(--vg-border)] overflow-hidden">
        <div className="px-4 py-3 flex items-center justify-between border-b border-[var(--vg-border)] flex-wrap gap-2">
          <div>
            <div className="font-bold text-[13px]">Efectividad por {vista === 'oficina' ? 'Oficina' : 'Entidad'}</div>
            <div className="text-[11px] text-[var(--vg-text2)]">
              Entregadas / (Entregadas + Devoluciones + Abiertas)
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex gap-1 bg-[var(--vg-bg)] p-1 rounded-md">
              <button
                onClick={() => setVista('oficina')}
                className={`text-[11.5px] font-semibold px-3 py-1 rounded ${
                  vista === 'oficina' ? 'bg-white shadow-sm text-[var(--vg-blue)]' : 'text-[var(--vg-text2)]'
                }`}
              >
                Oficina
              </button>
              <button
                onClick={() => setVista('entidad')}
                className={`text-[11.5px] font-semibold px-3 py-1 rounded ${
                  vista === 'entidad' ? 'bg-white shadow-sm text-[var(--vg-blue)]' : 'text-[var(--vg-text2)]'
                }`}
              >
                Entidad
              </button>
            </div>
            <button
              onClick={() =>
                exportToExcel<FilaEfectividad>(
                  filas,
                  [
                    { header: vista === 'oficina' ? 'Oficina' : 'Entidad', value: (f) => f.key },
                    { header: 'Entregadas', value: (f) => f.entregadas },
                    { header: 'Devoluciones', value: (f) => f.devoluciones },
                    { header: 'Abiertas', value: (f) => f.abiertas },
                    { header: 'Total', value: (f) => f.total },
                    { header: 'Efectividad %', value: (f) => f.efectividad ?? '' },
                  ],
                  `Efectividad_${vista}`
                )
              }
              className="text-[11px] font-semibold text-[var(--vg-text2)] border border-[var(--vg-border)] rounded-md px-2.5 py-1.5 bg-white"
            >
              ⬇ Excel
            </button>
            <button
              onClick={() =>
                exportToPDF<FilaEfectividad>(
                  filas,
                  [
                    { header: vista === 'oficina' ? 'Oficina' : 'Entidad', value: (f) => f.key },
                    { header: 'Entregadas', value: (f) => f.entregadas },
                    { header: 'Devoluciones', value: (f) => f.devoluciones },
                    { header: 'Abiertas', value: (f) => f.abiertas },
                    { header: 'Total', value: (f) => f.total },
                    { header: 'Efectividad %', value: (f) => f.efectividad ?? '' },
                  ],
                  `Efectividad por ${vista}`
                )
              }
              className="text-[11px] font-semibold text-[var(--vg-text2)] border border-[var(--vg-border)] rounded-md px-2.5 py-1.5 bg-white"
            >
              🖨 PDF
            </button>
          </div>
        </div>
        <div className="max-h-[600px] overflow-y-auto vg-scroll">
          <table className="vg-table">
            <thead>
              <tr>
                <th>{vista === 'oficina' ? 'Oficina' : 'Entidad'}</th>
                <th>Entregadas</th>
                <th>Devoluciones</th>
                <th>Abiertas</th>
                <th>Total</th>
                <th>Efectividad</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.key}>
                  <td className="font-medium">{f.key}</td>
                  <td className="text-[var(--vg-green)] font-semibold">{f.entregadas}</td>
                  <td className="text-[var(--vg-red)] font-semibold">{f.devoluciones}</td>
                  <td className="text-[var(--vg-amber)] font-semibold">{f.abiertas}</td>
                  <td>{f.total}</td>
                  <td>
                    <span className="font-bold" style={{ color: colorEfectividad(f.efectividad) }}>
                      {f.efectividad !== null ? `${f.efectividad}%` : '—'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
