'use client';

import { useMemo, useState } from 'react';
import { Guia } from '@/lib/types';
import { isEntregada, isAbiertaPorEstado, isCancelada, isEnRuta, colorEfectividad, calcularEfectividad, esRetornoAmplio, getExcepciones, topPorCampo, calcularResumenDevoluciones } from '@/lib/business-logic';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { exportToExcel, exportToPDF } from '@/lib/export';
import TopListPanel from '@/components/TopListPanel';
import { useSortableTable } from '@/lib/useSortableTable';
import SortableTh from '@/components/SortableTh';

interface FilaEfectividad {
  key: string;
  entregadas: number;
  devoluciones: number;
  abiertas: number;
  retornosAbiertos: number;
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
      const retornosAbiertos = lista.filter(
        (g) => g.es_devolucion && g.retorno_guia && (g.retorno_estado || '').toUpperCase() !== 'ENTREGADA'
      ).length;
      const efectividad = calcularEfectividad(entregadas, devoluciones, abiertas);
      return { key, entregadas, devoluciones, abiertas, retornosAbiertos, efectividad, total: lista.length };
    })
    .sort((a, b) => b.total - a.total);
}

type VistaEfectividad = 'cliente' | 'oficina' | 'entidad';

export default function EfectividadModule({ guias }: { guias: Guia[] }) {
  const [vista, setVista] = useState<VistaEfectividad>('oficina');

  const campoDeVista: Record<VistaEfectividad, keyof Guia> = {
    cliente: 'cliente',
    oficina: 'oficina_destino',
    entidad: 'entidad_destinatario',
  };

  const filas = useMemo(
    () => efectividadPorCampo(guias, campoDeVista[vista]),
    [guias, vista]
  );

  const top15 = filas.slice(0, 15).map((f) => ({ ...f, efNum: f.efectividad ?? 0 }));

  const { sorted, sortKey, sortDir, requestSort } = useSortableTable<FilaEfectividad>(filas, (f, key) => {
    switch (key) {
      case 'key':
        return f.key;
      case 'entregadas':
        return f.entregadas;
      case 'devoluciones':
        return f.devoluciones;
      case 'abiertas':
        return f.abiertas;
      case 'total':
        return f.total;
      case 'efectividad':
        return f.efectividad;
      default:
        return null;
    }
  });
  const etiqueta: Record<VistaEfectividad, string> = { cliente: 'Cliente', oficina: 'Oficina', entidad: 'Entidad' };
  const etiquetaPlural: Record<VistaEfectividad, string> = { cliente: 'Clientes', oficina: 'Oficinas', entidad: 'Entidades' };

  // Resumen de excepciones (mismo criterio que el módulo Excepciones:
  // excluye entregadas, devoluciones, canceladas, en ruta y predoc), para
  // dar contexto rápido de qué está pesando en la efectividad sin tener
  // que cambiar de pestaña.
  const guiasConExcepcion = useMemo(
    () =>
      guias.filter((g) => {
        if (g.es_predoc) return false;
        if (isCancelada(g.estado_guia) || isEnRuta(g.estado_guia)) return false;
        return getExcepciones(g).length > 0;
      }),
    [guias]
  );

  const [vistaResumenExc, setVistaResumenExc] = useState<'general' | 'oficina' | 'entidad' | 'ciudad'>('general');
  const [ubicacionResumenExc, setUbicacionResumenExc] = useState<string>('');

  const campoResumenExc: Record<'oficina' | 'entidad' | 'ciudad', keyof Guia> = {
    oficina: 'oficina_destino',
    entidad: 'entidad_destinatario',
    ciudad: 'ciudad_destinatario',
  };

  const ubicacionesResumenExc = useMemo(() => {
    if (vistaResumenExc === 'general') return [];
    const campo = campoResumenExc[vistaResumenExc];
    return topPorCampo(guiasConExcepcion, (g) => g[campo] as string | null, 9999);
  }, [guiasConExcepcion, vistaResumenExc]);

  const guiasParaResumenExc = useMemo(() => {
    if (vistaResumenExc === 'general' || !ubicacionResumenExc) return guiasConExcepcion;
    const campo = campoResumenExc[vistaResumenExc];
    return guiasConExcepcion.filter((g) => (g[campo] as string) === ubicacionResumenExc);
  }, [guiasConExcepcion, vistaResumenExc, ubicacionResumenExc]);

  const topExcepciones = useMemo(() => {
    const counts: Record<string, number> = {};
    guiasParaResumenExc.forEach((g) => {
      const excs = getExcepciones(g);
      const ultima = excs[excs.length - 1];
      if (ultima) counts[ultima] = (counts[ultima] || 0) + 1;
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);
  }, [guiasParaResumenExc]);

  // Resumen sencillo de devoluciones (Top 5 por oficina y por motivo,
  // agrupando cadenas como AUSENCIA/AUSENCIA 2/AUSENCIA 3), para
  // complementar el resumen de excepciones de arriba sin tener que
  // cambiar de módulo.
  const resumenDevoluciones = useMemo(() => calcularResumenDevoluciones(guias, 5), [guias]);

  return (
    <div className="p-5 space-y-4">
      <div className="bg-white rounded-lg border border-[var(--vg-border)] p-4">
        <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
          <div className="font-bold text-[12.5px]">Resumen de excepciones</div>
          <div className="flex items-center gap-2">
            <div className="flex gap-1 bg-[var(--vg-bg)] p-1 rounded-md">
              {(['general', 'oficina', 'entidad', 'ciudad'] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => {
                    setVistaResumenExc(v);
                    setUbicacionResumenExc('');
                  }}
                  className={`text-[11px] font-semibold px-2.5 py-1 rounded capitalize ${
                    vistaResumenExc === v ? 'bg-white shadow-sm text-[var(--vg-blue)]' : 'text-[var(--vg-text2)]'
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
            {vistaResumenExc !== 'general' && (
              <select
                value={ubicacionResumenExc}
                onChange={(e) => setUbicacionResumenExc(e.target.value)}
                className="text-[11.5px] border border-[var(--vg-border)] rounded-md px-2.5 py-1.5 bg-white"
              >
                <option value="">Todas ({guiasConExcepcion.length.toLocaleString('es-MX')})</option>
                {ubicacionesResumenExc.map(({ key, count }) => (
                  <option key={key} value={key}>
                    {key} ({count})
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>
        <div className="text-[10.5px] text-[var(--vg-text2)] mb-3">
          Top 8 excepciones que están pesando en la efectividad · {guiasParaResumenExc.length.toLocaleString('es-MX')} guías con excepción
        </div>
        <div className="flex flex-wrap gap-2">
          {topExcepciones.map(([exc, n]) => (
            <div
              key={exc}
              className="text-[11px] font-semibold text-[var(--vg-text2)] border border-[var(--vg-border)] rounded-full px-2.5 py-1"
            >
              {exc} <span className="font-bold text-[var(--vg-blue)]">{n}</span>
            </div>
          ))}
          {!topExcepciones.length && (
            <div className="text-[11px] text-[var(--vg-text3)]">Sin excepciones en este corte</div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <TopListPanel
          title="Resumen de Devoluciones — Top 5 por Oficina Destino"
          items={resumenDevoluciones.porOficina}
          total={resumenDevoluciones.total}
          accentColor="#DC2626"
        />
        <TopListPanel
          title="Resumen de Devoluciones — Top 5 Motivos"
          subtitle="Agrupa cadenas (AUSENCIA, AUSENCIA 2, AUSENCIA 3 = una sola categoría)"
          items={resumenDevoluciones.porMotivo}
          total={resumenDevoluciones.total}
          accentColor="#7C3AED"
        />
      </div>

      <div className="bg-white rounded-lg border border-[var(--vg-border)] p-4">
        <div className="font-bold text-[12.5px] mb-3">
          Efectividad — Top 15 {etiquetaPlural[vista]} por Volumen
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
            <div className="font-bold text-[13px]">Efectividad por {etiqueta[vista]}</div>
            <div className="text-[11px] text-[var(--vg-text2)]">
              Entregadas / (Entregadas + Devoluciones + Abiertas)
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex gap-1 bg-[var(--vg-bg)] p-1 rounded-md">
              <button
                onClick={() => setVista('cliente')}
                className={`text-[11.5px] font-semibold px-3 py-1 rounded ${
                  vista === 'cliente' ? 'bg-white shadow-sm text-[var(--vg-blue)]' : 'text-[var(--vg-text2)]'
                }`}
              >
                Cliente
              </button>
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
                    { header: etiqueta[vista], value: (f) => f.key },
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
                    { header: etiqueta[vista], value: (f) => f.key },
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
                <SortableTh label={etiqueta[vista]} sortKey="key" currentKey={sortKey} currentDir={sortDir} onSort={requestSort} />
                <SortableTh label="Entregadas" sortKey="entregadas" currentKey={sortKey} currentDir={sortDir} onSort={requestSort} />
                <SortableTh label="Devoluciones" sortKey="devoluciones" currentKey={sortKey} currentDir={sortDir} onSort={requestSort} />
                <SortableTh label="Abiertas" sortKey="abiertas" currentKey={sortKey} currentDir={sortDir} onSort={requestSort} />
                <SortableTh label="Total" sortKey="total" currentKey={sortKey} currentDir={sortDir} onSort={requestSort} />
                <SortableTh label="Efectividad" sortKey="efectividad" currentKey={sortKey} currentDir={sortDir} onSort={requestSort} />
              </tr>
            </thead>
            <tbody>
              {sorted.map((f) => (
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
