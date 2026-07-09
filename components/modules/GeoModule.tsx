'use client';

import { useMemo, useState } from 'react';
import { Guia } from '@/lib/types';
import { isEntregada, isAbiertaPorEstado, colorEfectividad, calcularEfectividad, esRetornoAmplio, calcularResumenExcepciones } from '@/lib/business-logic';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import MexicoMap from '@/components/MexicoMap';
import TopListPanel from '@/components/TopListPanel';
import { useSortableTable } from '@/lib/useSortableTable';
import SortableTh from '@/components/SortableTh';

function resumenDe(lista: Guia[]) {
  const entregadas = lista.filter((g) => isEntregada(g.estado_guia)).length;
  const devoluciones = lista.filter((g) => g.es_devolucion).length;
  const abiertas = lista.filter((g) => isAbiertaPorEstado(g)).length;
  const retornosAbiertos = lista.filter(
    (g) => g.es_devolucion && g.retorno_guia && (g.retorno_estado || '').toUpperCase() !== 'ENTREGADA'
  ).length;
  const efectividad = calcularEfectividad(entregadas, devoluciones, abiertas);
  return { total: lista.length, entregadas, devoluciones, abiertas, retornosAbiertos, efectividad };
}

export default function GeoModule({ guias: guiasIn }: { guias: Guia[] }) {
  // Excluir guías de retorno de los agregados geográficos para no duplicar volumen
  const guias = useMemo(() => guiasIn.filter((g) => !esRetornoAmplio(g) && !g.es_predoc), [guiasIn]);
  const [entidadSel, setEntidadSel] = useState<string | null>(null);
  const [oficinaSel, setOficinaSel] = useState<string | null>(null);
  const [ciudadSel, setCiudadSel] = useState<string | null>(null);

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
    const grupos: Record<string, Guia[]> = {};
    lista.forEach((g) => {
      const c = g.ciudad_destinatario || 'SIN CIUDAD';
      if (!grupos[c]) grupos[c] = [];
      grupos[c].push(g);
    });
    return Object.entries(grupos)
      .map(([ciudad, l]) => ({ ciudad, ...resumenDe(l) }))
      .sort((a, b) => b.total - a.total);
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
    setCiudadSel(null);
  }

  function seleccionarOficina(oficina: string) {
    setOficinaSel(oficina === oficinaSel ? null : oficina);
    setCiudadSel(null);
  }

  function seleccionarCiudad(ciudad: string) {
    setCiudadSel(ciudad === ciudadSel ? null : ciudad);
  }

  // Guías del nivel actualmente seleccionado (el más profundo: ciudad >
  // oficina > entidad > nacional si no hay nada seleccionado), y su
  // resumen — esto es lo que alimenta el panel de "Resumen del nivel
  // seleccionado" más abajo, con efectividad, devoluciones, top
  // excepciones y volumen actualizándose juntos según en qué nivel estés.
  const guiasNivelActual = useMemo(() => {
    if (entidadSel && oficinaSel && ciudadSel) {
      return guias.filter(
        (g) =>
          g.entidad_destinatario === entidadSel &&
          g.oficina_destino === oficinaSel &&
          (g.ciudad_destinatario || 'SIN CIUDAD') === ciudadSel
      );
    }
    if (entidadSel && oficinaSel) {
      return guias.filter((g) => g.entidad_destinatario === entidadSel && g.oficina_destino === oficinaSel);
    }
    if (entidadSel) {
      return guias.filter((g) => g.entidad_destinatario === entidadSel);
    }
    return guias;
  }, [guias, entidadSel, oficinaSel, ciudadSel]);

  const resumenNivelActual = useMemo(() => resumenDe(guiasNivelActual), [guiasNivelActual]);
  const topExcNivelActual = useMemo(
    () => calcularResumenExcepciones(guiasNivelActual, 5),
    [guiasNivelActual]
  );

  const tituloNivelActual = ciudadSel || oficinaSel || entidadSel || 'Nacional (todas las entidades)';
  const subtituloNivelActual = ciudadSel
    ? `${oficinaSel} · ${entidadSel}`
    : oficinaSel
      ? entidadSel || ''
      : entidadSel
        ? 'Entidad completa'
        : 'Todas las oficinas y entidades en este corte';

  const entidadOrden = useSortableTable<(typeof porEntidad)[0]>(porEntidad, (e, key) => {
    if (key === 'entidad') return e.entidad;
    if (key === 'total') return e.total;
    if (key === 'efectividad') return e.efectividad;
    return null;
  });

  const oficinaOrden = useSortableTable<(typeof oficinasDeEntidad)[0]>(oficinasDeEntidad, (o, key) => {
    if (key === 'oficina') return o.oficina;
    if (key === 'total') return o.total;
    if (key === 'efectividad') return o.efectividad;
    return null;
  });

  const ciudadOrden = useSortableTable<(typeof ciudadesDeOficina)[0]>(ciudadesDeOficina, (c, key) => {
    if (key === 'ciudad') return c.ciudad;
    if (key === 'total') return c.total;
    if (key === 'efectividad') return c.efectividad;
    return null;
  });

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
        <MexicoMap
          datosPorEntidad={datosMapa}
          metrica={metricaMapa}
          entidadSeleccionada={entidadSel}
          onSeleccionar={seleccionarEntidad}
        />
      </div>

      <div className="bg-white rounded-lg border border-[var(--vg-border)] p-4">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div>
            <div className="font-bold text-[13px]">📍 {tituloNivelActual}</div>
            <div className="text-[11px] text-[var(--vg-text2)]">{subtituloNivelActual}</div>
          </div>
          {(entidadSel || oficinaSel || ciudadSel) && (
            <button
              onClick={() => {
                setEntidadSel(null);
                setOficinaSel(null);
                setCiudadSel(null);
              }}
              className="text-[11px] font-semibold text-[var(--vg-text2)] border border-[var(--vg-border)] rounded-md px-2.5 py-1 hover:bg-[var(--vg-bg)]"
            >
              ✕ Volver a Nacional
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <div className="bg-[var(--vg-bg)] rounded-md p-3">
            <div className="text-[10.5px] text-[var(--vg-text2)] font-semibold mb-0.5">Volumen</div>
            <div className="text-xl font-bold">{resumenNivelActual.total.toLocaleString('es-MX')}</div>
          </div>
          <div className="bg-[var(--vg-bg)] rounded-md p-3">
            <div className="text-[10.5px] text-[var(--vg-text2)] font-semibold mb-0.5">Efectividad</div>
            <div className="text-xl font-bold" style={{ color: colorEfectividad(resumenNivelActual.efectividad) }}>
              {resumenNivelActual.efectividad !== null ? `${resumenNivelActual.efectividad}%` : '—'}
            </div>
          </div>
          <div className="bg-[var(--vg-bg)] rounded-md p-3">
            <div className="text-[10.5px] text-[var(--vg-text2)] font-semibold mb-0.5">Devoluciones</div>
            <div className="text-xl font-bold text-[var(--vg-red)]">
              {resumenNivelActual.devoluciones.toLocaleString('es-MX')}
              {resumenNivelActual.total > 0 && (
                <span className="text-[11px] font-medium text-[var(--vg-text3)] ml-1">
                  ({((resumenNivelActual.devoluciones / resumenNivelActual.total) * 100).toFixed(1)}%)
                </span>
              )}
            </div>
          </div>
          <div className="bg-[var(--vg-bg)] rounded-md p-3">
            <div className="text-[10.5px] text-[var(--vg-text2)] font-semibold mb-0.5">Abiertas</div>
            <div className="text-xl font-bold text-[var(--vg-amber)]">{resumenNivelActual.abiertas.toLocaleString('es-MX')}</div>
          </div>
        </div>

        <TopListPanel
          title="Top 5 Excepciones en este nivel"
          subtitle="Agrupa cadenas (AUSENCIA, AUSENCIA 2, AUSENCIA 3 = una sola categoría)"
          items={topExcNivelActual.porTipo}
          total={topExcNivelActual.total}
          accentColor="#7C3AED"
        />
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
            <div className="text-[11px] text-[var(--vg-text2)]">Clic aquí (o en el mapa) para ver sus oficinas</div>
          </div>
          <div className="max-h-[500px] overflow-y-auto vg-scroll">
            <table className="vg-table">
              <thead>
                <tr>
                  <SortableTh label="Entidad" sortKey="entidad" currentKey={entidadOrden.sortKey} currentDir={entidadOrden.sortDir} onSort={entidadOrden.requestSort} />
                  <SortableTh label="Total" sortKey="total" currentKey={entidadOrden.sortKey} currentDir={entidadOrden.sortDir} onSort={entidadOrden.requestSort} />
                  <SortableTh label="Efect." sortKey="efectividad" currentKey={entidadOrden.sortKey} currentDir={entidadOrden.sortDir} onSort={entidadOrden.requestSort} />
                </tr>
              </thead>
              <tbody>
                {entidadOrden.sorted.map((e) => (
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
                    <SortableTh label="Oficina" sortKey="oficina" currentKey={oficinaOrden.sortKey} currentDir={oficinaOrden.sortDir} onSort={oficinaOrden.requestSort} />
                    <SortableTh label="Total" sortKey="total" currentKey={oficinaOrden.sortKey} currentDir={oficinaOrden.sortDir} onSort={oficinaOrden.requestSort} />
                    <SortableTh label="Efect." sortKey="efectividad" currentKey={oficinaOrden.sortKey} currentDir={oficinaOrden.sortDir} onSort={oficinaOrden.requestSort} />
                  </tr>
                </thead>
                <tbody>
                  {oficinaOrden.sorted.map((o) => (
                    <tr
                      key={o.oficina}
                      onClick={() => seleccionarOficina(o.oficina)}
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
            <div className="text-[11px] text-[var(--vg-text2)]">
              {oficinaSel ? 'Clic para ver el resumen de esa ciudad' : ''}
            </div>
          </div>
          <div className="max-h-[500px] overflow-y-auto vg-scroll">
            {oficinaSel ? (
              <table className="vg-table">
                <thead>
                  <tr>
                    <SortableTh label="Ciudad" sortKey="ciudad" currentKey={ciudadOrden.sortKey} currentDir={ciudadOrden.sortDir} onSort={ciudadOrden.requestSort} />
                    <SortableTh label="Guías" sortKey="total" currentKey={ciudadOrden.sortKey} currentDir={ciudadOrden.sortDir} onSort={ciudadOrden.requestSort} />
                    <SortableTh label="Efect." sortKey="efectividad" currentKey={ciudadOrden.sortKey} currentDir={ciudadOrden.sortDir} onSort={ciudadOrden.requestSort} />
                  </tr>
                </thead>
                <tbody>
                  {ciudadOrden.sorted.map((c) => (
                    <tr
                      key={c.ciudad}
                      onClick={() => seleccionarCiudad(c.ciudad)}
                      className={`cursor-pointer ${ciudadSel === c.ciudad ? 'bg-[var(--vg-blue-light)]' : ''}`}
                    >
                      <td className="font-medium">{c.ciudad}</td>
                      <td>{c.total}</td>
                      <td>
                        <span className="font-bold" style={{ color: colorEfectividad(c.efectividad) }}>
                          {c.efectividad !== null ? `${c.efectividad}%` : '—'}
                        </span>
                      </td>
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
