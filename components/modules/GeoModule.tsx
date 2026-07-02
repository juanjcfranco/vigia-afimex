'use client';

import { useMemo, useState } from 'react';
import { Guia } from '@/lib/types';
import { isEntregada, isAbiertaPorEstado, colorEfectividad, calcularEfectividad, esRetornoAmplio } from '@/lib/business-logic';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import MexicoMap from '@/components/MexicoMap';

function resumenDe(lista: Guia[]) {
  const entregadas = lista.filter((g) => isEntregada(g.estado_guia)).length;
  const devoluciones = lista.filter((g) => g.es_devolucion).length;
  const abiertas = lista.filter((g) => isAbiertaPorEstado(g)).length;
  const efectividad = calcularEfectividad(entregadas, devoluciones, abiertas);
  return { total: lista.length, entregadas, devoluciones, abiertas, efectividad };
}

export default function GeoModule({ guias: guiasIn }: { guias: Guia[] }) {
  // Excluir guías de retorno de los agregados geográficos para no duplicar volumen
  const guias = useMemo(() => guiasIn.filter((g) => !esRetornoAmplio(g) && !g.es_predoc), [guiasIn]);
  const [entidadSel, setEntidadSel] = useState<string | null>(null);
  const [oficinaSel, setOficinaSel] = useState<string | null>(null);

  const porEntidad = useMemo(() => {
    const grupos: Record<string, Guia[]> = {};
    guias.forEach((g) => {
      const key = g.entidad_destinatario || 'SIN ENTIDAD';
      if (!grupos[key]) grupos[key] = [];
      grupos[key].push(g);
    });
    return Object.entries(grupos)
      .map(([entidad, lista]) => ({ entidad, ...resumenDe(lista) }))
      .sort((a, b) => b.total - a.total);
  }, [guias]);

  const oficinasDeEntidad = useMemo(() => {
    if (!entidadSel) return [];
    const lista = guias.filter((g) => g.entidad_destinatario === entidadSel);
    const grupos: Record<string, Guia[]> = {};
    lista.forEach((g) => {
      const key = g.oficina_destino || 'SIN OFICINA';
      if (!grupos[key]) grupos[key] = [];
      grupos[key].push(g);
    });
    return Object.entries(grupos)
      .map(([oficina, l]) => ({ oficina, ...resumenDe(l) }))
      .sort((a, b) => b.total - a.total);
  }, [guias, entidadSel]);

  const ciudadesDeOficina = useMemo(() => {
    if (!entidadSel || !oficinaSel) return [];
    const lista = guias.filter(
      (g) => g.entidad_destinatario === entidadSel && g.oficina_destino === oficinaSel
    );
    const grupos: Record<string, number> = {};
    lista.forEach((g) => {
      const c = g.ciudad_destinatario || 'SIN CIUDAD';
      grupos[c] = (grupos[c] || 0) + 1;
    });
    return Object.entries(grupos).sort((a, b) => b[1] - a[1]);
  }, [guias, entidadSel, oficinaSel]);

  const top12Entidades = useMemo(() => porEntidad.slice(0, 12), [porEntidad]);

  const datosMapa = useMemo(() => {
    const map: Record<string, { total: number; efectividad: number | null }> = {};
    porEntidad.forEach((e) => {
      map[e.entidad] = { total: e.total, efectividad: e.efectividad };
    });
    return map;
  }, [porEntidad]);

  const [metricaMapa, setMetricaMapa] = useState<'volumen' | 'efectividad'>('volumen');

  function seleccionarEntidad(entidad: string) {
    setEntidadSel(entidad === entidadSel ? null : entidad);
    setOficinaSel(null);
  }

  return (
    <div className="p-5 space-y-4">
      <div className="bg-white rounded-lg border border-[var(--vg-border)] p-4">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div className="font-bold text-[12.5px]">Mapa de México — {metricaMapa === 'volumen' ? 'Volumen por Entidad' : 'Efectividad por Entidad'}</div>
          <div className="flex gap-1 bg-[var(--vg-bg)] p-1 rounded-md">
            <button
              onClick={() => setMetricaMapa('volumen')}
              className={`text-[11.5px] font-semibold px-3 py-1 rounded ${metricaMapa === 'volumen' ? 'bg-white shadow-sm text-[var(--vg-blue)]' : 'text-[var(--vg-text2)]'}`}
            >
              Volumen
            </button>
            <button
              onClick={() => setMetricaMapa('efectividad')}
              className={`text-[11.5px] font-semibold px-3 py-1 rounded ${metricaMapa === 'efectividad' ? 'bg-white shadow-sm text-[var(--vg-blue)]' : 'text-[var(--vg-text2)]'}`}
            >
              Efectividad
            </button>
          </div>
        </div>
        <MexicoMap datosPorEntidad={datosMapa} metrica={metricaMapa} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-lg border border-[var(--vg-border)] p-4">
          <div className="font-bold text-[12.5px] mb-3">Efectividad por Entidad</div>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={top12Entidades} margin={{ bottom: 70 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="entidad" angle={-35} textAnchor="end" interval={0} fontSize={10} height={90} />
              <YAxis fontSize={11} unit="%" />
              <Tooltip formatter={(v) => `${v}%`} />
              <Bar dataKey="efectividad" radius={[4, 4, 0, 0]}>
                {top12Entidades.map((entry, i) => (
                  <Cell key={i} fill={colorEfectividad(entry.efectividad)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-lg border border-[var(--vg-border)] p-4">
          <div className="font-bold text-[12.5px] mb-3">Volumen por Entidad</div>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={top12Entidades} margin={{ bottom: 70 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="entidad" angle={-35} textAnchor="end" interval={0} fontSize={10} height={90} />
              <YAxis fontSize={11} />
              <Tooltip />
              <Bar dataKey="total" fill="#1E3A8A" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Nivel 1: Entidades */}
        <div className="bg-white rounded-lg border border-[var(--vg-border)] overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--vg-border)]">
            <div className="font-bold text-[13px]">1. Entidad</div>
            <div className="text-[11px] text-[var(--vg-text2)]">Clic para ver sus oficinas</div>
          </div>
          <div className="max-h-[500px] overflow-y-auto vg-scroll">
            <table className="vg-table">
              <thead>
                <tr>
                  <th>Entidad</th>
                  <th>Total</th>
                  <th>Efect.</th>
                </tr>
              </thead>
              <tbody>
                {porEntidad.map((e) => (
                  <tr
                    key={e.entidad}
                    onClick={() => seleccionarEntidad(e.entidad)}
                    className={`cursor-pointer ${entidadSel === e.entidad ? 'bg-[var(--vg-blue-light)]' : ''}`}
                  >
                    <td className="font-medium">{e.entidad}</td>
                    <td>{e.total}</td>
                    <td>
                      <span className="font-bold" style={{ color: colorEfectividad(e.efectividad) }}>
                        {e.efectividad !== null ? `${e.efectividad}%` : '—'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Nivel 2: Oficinas de la entidad seleccionada */}
        <div className="bg-white rounded-lg border border-[var(--vg-border)] overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--vg-border)]">
            <div className="font-bold text-[13px]">
              2. Oficina {entidadSel ? `en ${entidadSel}` : ''}
            </div>
            <div className="text-[11px] text-[var(--vg-text2)]">
              {entidadSel ? 'Clic para ver sus ciudades' : 'Selecciona una entidad primero'}
            </div>
          </div>
          <div className="max-h-[500px] overflow-y-auto vg-scroll">
            {entidadSel ? (
              <table className="vg-table">
                <thead>
                  <tr>
                    <th>Oficina</th>
                    <th>Total</th>
                    <th>Efect.</th>
                  </tr>
                </thead>
                <tbody>
                  {oficinasDeEntidad.map((o) => (
                    <tr
                      key={o.oficina}
                      onClick={() => setOficinaSel(o.oficina === oficinaSel ? null : o.oficina)}
                      className={`cursor-pointer ${oficinaSel === o.oficina ? 'bg-[var(--vg-blue-light)]' : ''}`}
                    >
                      <td className="font-medium">{o.oficina}</td>
                      <td>{o.total}</td>
                      <td>
                        <span className="font-bold" style={{ color: colorEfectividad(o.efectividad) }}>
                          {o.efectividad !== null ? `${o.efectividad}%` : '—'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="text-center text-[var(--vg-text3)] py-10 text-[12px] px-4">
                Selecciona una entidad en la tabla de la izquierda
              </div>
            )}
          </div>
        </div>

        {/* Nivel 3: Ciudades de la oficina seleccionada */}
        <div className="bg-white rounded-lg border border-[var(--vg-border)] overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--vg-border)]">
            <div className="font-bold text-[13px]">
              3. Ciudad {oficinaSel ? `en ${oficinaSel}` : ''}
            </div>
          </div>
          <div className="max-h-[500px] overflow-y-auto vg-scroll">
            {oficinaSel ? (
              <table className="vg-table">
                <thead>
                  <tr>
                    <th>Ciudad</th>
                    <th>Guías</th>
                  </tr>
                </thead>
                <tbody>
                  {ciudadesDeOficina.map(([ciudad, n]) => (
                    <tr key={ciudad}>
                      <td className="font-medium">{ciudad}</td>
                      <td>{n}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="text-center text-[var(--vg-text3)] py-10 text-[12px] px-4">
                Selecciona una oficina en la tabla del centro
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
