'use client';

import { useMemo, useState } from 'react';
import { Guia } from '@/lib/types';
import { getExcepciones, isCancelada, isEnRuta, topPorCampo, calcularResumenExcepciones } from '@/lib/business-logic';
import TopListPanel from '@/components/TopListPanel';
import { useSortableTable } from '@/lib/useSortableTable';
import SortableTh from '@/components/SortableTh';
import AccionBadge from '@/components/AccionBadge';
import AlertaDiasBadge from '@/components/AlertaDiasBadge';
import BulkSearch from '@/components/BulkSearch';
import { exportToExcel, exportToPDF } from '@/lib/export';

type VistaTop = 'cliente' | 'oficina' | 'entidad' | 'ciudad';

export default function ExcepcionesModule({ guias }: { guias: Guia[] }) {
  const [bulkGuias, setBulkGuias] = useState<string[] | null>(null);
  const [filtroExcepcion, setFiltroExcepcion] = useState('');
  const [vistaTop, setVistaTop] = useState<VistaTop>('oficina');
  const [ubicacionRanking, setUbicacionRanking] = useState<string>('');

  const base = useMemo(() => {
    return guias.filter((g) => {
      if (g.es_predoc) return false;
      if (isCancelada(g.estado_guia)) return false;
      if (isEnRuta(g.estado_guia)) return false;
      return getExcepciones(g).length > 0;
    });
  }, [guias]);

  const filas = useMemo(() => {
    let f = base;
    if (bulkGuias && bulkGuias.length) {
      const set = new Set(bulkGuias.map((g) => g.toUpperCase()));
      f = f.filter((g) => set.has(g.guia.toUpperCase()));
    }
    if (filtroExcepcion) {
      f = f.filter((g) => {
        const excs = getExcepciones(g);
        return excs[excs.length - 1] === filtroExcepcion;
      });
    }
    return f.sort((a, b) => (b.dias_sin_movimiento || 0) - (a.dias_sin_movimiento || 0));
  }, [base, bulkGuias, filtroExcepcion]);

  // Ranking general de excepciones: cuenta la ÚLTIMA excepción de la cadena
  // de cada guía (la vigente / más reciente), no todas las ocurrencias de
  // Exc.1-5. Esta es la fuente tanto de los "pills" de filtro rápido como
  // de la tabla de "Ranking general" más abajo.
  const kpisPorExcepcion = useMemo(() => {
    const counts: Record<string, number> = {};
    base.forEach((g) => {
      const excs = getExcepciones(g);
      const ultima = excs[excs.length - 1];
      if (ultima) counts[ultima] = (counts[ultima] || 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [base]);

  // Cuántas guías acumularon 1, 2, 3, 4 o 5 excepciones en su cadena
  // (Exc.1 a Exc.5). Útil para ver cuántos casos escalaron varias veces
  // antes de resolverse.
  const conteoPorCantidadExcepciones = useMemo(() => {
    const conteo: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    base.forEach((g) => {
      const n = getExcepciones(g).length;
      if (n >= 1 && n <= 5) conteo[n] += 1;
    });
    return conteo;
  }, [base]);

  // KPI de excepciones: por tipo (agrupando cadenas AUSENCIA/AUSENCIA 2/
  // AUSENCIA 3 en una sola categoría "AUSENCIA"), por oficina destino y
  // por entidad. Esta agrupación es EXCLUSIVA de este KPI — el resto del
  // módulo (tabla, filtro, ranking general) sigue mostrando cada variante
  // de la cadena por separado.
  const kpiExcepciones = useMemo(() => calcularResumenExcepciones(base, 10), [base]);

  const campoDeVistaTop: Record<VistaTop, keyof Guia> = {
    cliente: 'cliente',
    oficina: 'oficina_destino',
    entidad: 'entidad_destinatario',
    ciudad: 'ciudad_destinatario',
  };
  const topUbicaciones = useMemo(
    () => topPorCampo(base, (g) => g[campoDeVistaTop[vistaTop]] as string | null, 10),
    [base, vistaTop]
  );
  // Top 5 excepciones dentro de cada ubicación del top (no solo la #1)
  const top5ExcepcionesPorUbicacion = useMemo(() => {
    const campo = campoDeVistaTop[vistaTop];
    const map: Record<string, Array<[string, number]>> = {};
    topUbicaciones.forEach(({ key }) => {
      const counts: Record<string, number> = {};
      base
        .filter((g) => (g[campo] as string) === key)
        .forEach((g) => {
          const excs = getExcepciones(g);
          const ultima = excs[excs.length - 1];
          if (ultima) counts[ultima] = (counts[ultima] || 0) + 1;
        });
      map[key] = Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);
    });
    return map;
  }, [base, topUbicaciones, vistaTop]);

  // Ranking general de excepciones, desglosado por cliente/oficina/entidad/
  // ciudad (según la pestaña activa): para cada ubicación, el ranking
  // COMPLETO de tipos de excepción (no solo el top 5), usado en la tabla
  // de abajo.
  const rankingGeneralPorUbicacion = useMemo(() => {
    const campo = campoDeVistaTop[vistaTop];
    const map: Record<string, Array<[string, number]>> = {};
    base.forEach((g) => {
      const key = (g[campo] as string) || 'SIN DATO';
      const excs = getExcepciones(g);
      const ultima = excs[excs.length - 1];
      if (!ultima) return;
      if (!map[key]) map[key] = [];
    });
    Object.keys(map).forEach((key) => {
      const counts: Record<string, number> = {};
      base
        .filter((g) => ((g[campo] as string) || 'SIN DATO') === key)
        .forEach((g) => {
          const excs = getExcepciones(g);
          const ultima = excs[excs.length - 1];
          if (ultima) counts[ultima] = (counts[ultima] || 0) + 1;
        });
      map[key] = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    });
    return map;
  }, [base, vistaTop]);

  const { sorted, sortKey, sortDir, requestSort } = useSortableTable<Guia>(filas, (g, key) => {
    switch (key) {
      case 'guia':
        return g.guia;
      case 'oficina':
        return g.oficina_destino;
      case 'entidad':
        return g.entidad_destinatario;
      case 'estado':
        return g.estado_guia;
      case 'dias':
        return g.dias_sin_movimiento;
      case 'ultmov':
        return g.f_historia;
      case 'accion':
        return g.accion_recomendada;
      case 'exc1':
        return g.excepcion_1;
      case 'exc2':
        return g.excepcion_2;
      case 'exc3':
        return g.excepcion_3;
      case 'exc4':
        return g.excepcion_4;
      case 'exc5':
        return g.excepcion_5;
      case 'cod':
        return g.cod;
      default:
        return null;
    }
  });

  // Orden para la tabla de "Ranking general de excepciones" (arreglo de
  // tuplas [nombre, cantidad], no de objetos Guia).
  const rankingActual = ubicacionRanking ? rankingGeneralPorUbicacion[ubicacionRanking] || [] : kpisPorExcepcion;
  const rankingOrden = useSortableTable<[string, number]>(rankingActual, (item, key) => {
    if (key === 'excepcion') return item[0];
    if (key === 'guias') return item[1];
    return null;
  });

  const columnasExport = [
    { header: 'Guía', value: (g: Guia) => g.guia },
    { header: 'Oficina', value: (g: Guia) => g.oficina_destino || '' },
    { header: 'Entidad', value: (g: Guia) => g.entidad_destinatario || '' },
    { header: 'Estado', value: (g: Guia) => g.estado_guia || '' },
    { header: 'Exc.1', value: (g: Guia) => g.excepcion_1 || '' },
    { header: 'Exc.2', value: (g: Guia) => g.excepcion_2 || '' },
    { header: 'Exc.3', value: (g: Guia) => g.excepcion_3 || '' },
    { header: 'Exc.4', value: (g: Guia) => g.excepcion_4 || '' },
    { header: 'Exc.5', value: (g: Guia) => g.excepcion_5 || '' },
    { header: 'Acción', value: (g: Guia) => g.accion_recomendada || '' },
    { header: 'Últ. Mov.', value: (g: Guia) => g.f_historia || '' },
    { header: 'Días sin Mov.', value: (g: Guia) => g.dias_sin_movimiento ?? '' },
    { header: 'COD', value: (g: Guia) => g.cod || 0 },
  ];

  return (
    <div className="p-5">
      <div className="bg-white rounded-lg border border-[var(--vg-border)] overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--vg-border)] flex items-center justify-between flex-wrap gap-2">
          <div>
            <div className="font-bold text-[13px]">Cadena de Excepciones</div>
            <div className="text-[11px] text-[var(--vg-text2)]">
              Incluye entregadas, devoluciones y guías en proceso con excepción · excluye canceladas, en ruta y pre-documentadas · {filas.length.toLocaleString('es-MX')} guías
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => exportToExcel(filas, columnasExport, 'Excepciones')}
              className="text-[11px] font-semibold text-[var(--vg-text2)] border border-[var(--vg-border)] rounded-md px-2.5 py-1.5 bg-white"
            >
              ⬇ Excel
            </button>
            <button
              onClick={() => exportToPDF(filas, columnasExport, 'Excepciones')}
              className="text-[11px] font-semibold text-[var(--vg-text2)] border border-[var(--vg-border)] rounded-md px-2.5 py-1.5 bg-white"
            >
              🖨 PDF
            </button>
          </div>
        </div>

        <div className="px-4 py-3 border-b border-[var(--vg-border)] bg-[var(--vg-bg)]">
          <div className="font-bold text-[12.5px] mb-0.5">KPI de Excepciones</div>
          <div className="text-[10.5px] text-[var(--vg-text2)] mb-2">
            Top 10 por tipo (agrupa cadenas: AUSENCIA, AUSENCIA 2, AUSENCIA 3 cuentan como una sola categoría "AUSENCIA" —
            solo aquí, el resto del módulo sigue mostrando cada variante por separado), oficina destino y entidad
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <TopListPanel
              title="Top 10 por Tipo"
              items={kpiExcepciones.porTipo}
              total={kpiExcepciones.total}
              accentColor="#7C3AED"
            />
            <TopListPanel
              title="Top 10 por Oficina Destino"
              items={kpiExcepciones.porOficina}
              total={kpiExcepciones.total}
              accentColor="#1E3A8A"
            />
            <TopListPanel
              title="Top 10 por Entidad"
              items={kpiExcepciones.porEntidad}
              total={kpiExcepciones.total}
              accentColor="#EA7C1A"
            />
          </div>
        </div>

        <BulkSearch onSearch={setBulkGuias} onClear={() => setBulkGuias(null)} activo={!!bulkGuias} />

        <div className="px-4 py-3 border-b border-[var(--vg-border)]">
          <div className="font-bold text-[12.5px] mb-2">Guías por cantidad de excepciones</div>
          <div className="grid grid-cols-5 gap-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <div key={n} className="border border-[var(--vg-border)] rounded-md px-2.5 py-2 text-center">
                <div className="text-[18px] font-bold text-[var(--vg-blue)]">{conteoPorCantidadExcepciones[n]}</div>
                <div className="text-[10.5px] text-[var(--vg-text2)]">
                  {n} excepci{n === 1 ? 'ón' : 'ones'}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="px-4 py-3 border-b border-[var(--vg-border)]">
          <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
            <div>
              <div className="font-bold text-[12.5px]">Top 5 excepciones con más incidencia</div>
              <div className="text-[10.5px] text-[var(--vg-text2)]">Top 10 ubicaciones por volumen, con sus 5 excepciones más frecuentes</div>
            </div>
            <div className="flex gap-1 bg-[var(--vg-bg)] p-1 rounded-md">
              {(['cliente', 'oficina', 'entidad', 'ciudad'] as VistaTop[]).map((v) => (
                <button
                  key={v}
                  onClick={() => {
                    setVistaTop(v);
                    setUbicacionRanking('');
                  }}
                  className={`text-[11px] font-semibold px-2.5 py-1 rounded capitalize ${
                    vistaTop === v ? 'bg-white shadow-sm text-[var(--vg-blue)]' : 'text-[var(--vg-text2)]'
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-2">
            {topUbicaciones.map(({ key, count }, i) => (
              <div key={key} className="border border-[var(--vg-border)] rounded-md px-2.5 py-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] font-semibold text-[var(--vg-text2)]">#{i + 1}</span>
                  <span className="text-[15px] font-bold text-[var(--vg-blue)]">{count}</span>
                </div>
                <div className="text-[12px] font-bold truncate mb-1" title={key}>
                  {key}
                </div>
                <div className="space-y-0.5">
                  {(top5ExcepcionesPorUbicacion[key] || []).map(([exc, n]) => (
                    <div key={exc} className="flex items-center justify-between text-[10.5px] text-[var(--vg-text2)]">
                      <span className="truncate" title={exc}>{exc}</span>
                      <span className="font-semibold text-[var(--vg-text)] shrink-0 ml-1">{n}</span>
                    </div>
                  ))}
                  {!(top5ExcepcionesPorUbicacion[key] || []).length && (
                    <div className="text-[10.5px] text-[var(--vg-text3)]">—</div>
                  )}
                </div>
              </div>
            ))}
            {!topUbicaciones.length && (
              <div className="text-[11px] text-[var(--vg-text3)] py-2">Sin datos para este corte</div>
            )}
          </div>
        </div>

        <div className="px-4 py-3 border-b border-[var(--vg-border)]">
          <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
            <div>
              <div className="font-bold text-[12.5px]">Ranking general de excepciones</div>
              <div className="text-[10.5px] text-[var(--vg-text2)]">
                Todos los tipos de excepción, ordenados por frecuencia — general o desglosado por {vistaTop}
              </div>
            </div>
            <select
              value={ubicacionRanking}
              onChange={(e) => setUbicacionRanking(e.target.value)}
              className="text-[11.5px] border border-[var(--vg-border)] rounded-md px-2.5 py-1.5 bg-white"
            >
              <option value="">General (todas las {vistaTop === 'ciudad' ? 'ciudades' : vistaTop === 'entidad' ? 'entidades' : vistaTop === 'cliente' ? 'clientes' : 'oficinas'})</option>
              {Object.keys(rankingGeneralPorUbicacion)
                .sort((a, b) => (rankingGeneralPorUbicacion[b].reduce((s, [, n]) => s + n, 0)) - (rankingGeneralPorUbicacion[a].reduce((s, [, n]) => s + n, 0)))
                .map((key) => (
                  <option key={key} value={key}>
                    {key}
                  </option>
                ))}
            </select>
          </div>
          <div className="max-h-[280px] overflow-y-auto vg-scroll border border-[var(--vg-border)] rounded-md">
            <table className="vg-table">
              <thead>
                <tr>
                  <th>#</th>
                  <SortableTh label="Excepción" sortKey="excepcion" currentKey={rankingOrden.sortKey} currentDir={rankingOrden.sortDir} onSort={rankingOrden.requestSort} />
                  <SortableTh label="Guías" sortKey="guias" currentKey={rankingOrden.sortKey} currentDir={rankingOrden.sortDir} onSort={rankingOrden.requestSort} />
                  <th>% del total</th>
                </tr>
              </thead>
              <tbody>
                {rankingOrden.sorted.map(
                  ([exc, n], i) => {
                    const totalRef = ubicacionRanking
                      ? (rankingGeneralPorUbicacion[ubicacionRanking] || []).reduce((s, [, c]) => s + c, 0)
                      : base.length;
                    const pct = totalRef ? ((n / totalRef) * 100).toFixed(1) : '0.0';
                    return (
                      <tr key={exc}>
                        <td className="text-[var(--vg-text2)]">{i + 1}</td>
                        <td className="font-semibold">{exc}</td>
                        <td className="font-bold text-[var(--vg-blue)]">{n}</td>
                        <td>{pct}%</td>
                      </tr>
                    );
                  }
                )}
                {!rankingActual.length && (
                  <tr>
                    <td colSpan={4} className="text-center text-[var(--vg-text3)] py-4">
                      Sin datos
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {kpisPorExcepcion.length > 0 && (
          <div className="px-4 py-3 border-b border-[var(--vg-border)] bg-[#FFF7ED]">
            <div className="text-[10.5px] font-semibold text-[#B45309] uppercase tracking-wide">
              🏆 Excepción que más se repite
            </div>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="text-[18px] font-bold text-[var(--vg-text)]">{kpisPorExcepcion[0][0]}</span>
              <span className="text-[13px] font-bold text-[#B45309]">
                {kpisPorExcepcion[0][1].toLocaleString('es-MX')} guías
              </span>
              <span className="text-[11px] text-[var(--vg-text2)]">
                ({((kpisPorExcepcion[0][1] / base.length) * 100).toFixed(1)}% del total)
              </span>
            </div>
          </div>
        )}

        <div className="px-4 py-2.5 border-b border-[var(--vg-border)] flex items-center gap-2">
          <span className="text-[11px] font-bold text-[var(--vg-text2)] whitespace-nowrap">Filtrar por excepción:</span>
          <select
            value={filtroExcepcion}
            onChange={(e) => setFiltroExcepcion(e.target.value)}
            className="text-[11.5px] border border-[var(--vg-border)] rounded-md px-2.5 py-1.5 bg-white min-w-[260px]"
          >
            <option value="">Todas las excepciones ({base.length.toLocaleString('es-MX')})</option>
            {kpisPorExcepcion.map(([exc, n]) => (
              <option key={exc} value={exc}>
                {exc} — {n}
              </option>
            ))}
          </select>
          {filtroExcepcion && (
            <button
              onClick={() => setFiltroExcepcion('')}
              className="text-[10.5px] font-semibold text-white bg-[var(--vg-text2)] rounded-full px-2.5 py-1 whitespace-nowrap"
            >
              ✕ Limpiar
            </button>
          )}
        </div>

        <div className="max-h-[600px] overflow-y-auto vg-scroll">
          <table className="vg-table">
            <thead>
              <tr>
                <SortableTh label="Guía" sortKey="guia" currentKey={sortKey} currentDir={sortDir} onSort={requestSort} />
                <SortableTh label="Oficina" sortKey="oficina" currentKey={sortKey} currentDir={sortDir} onSort={requestSort} />
                <SortableTh label="Entidad" sortKey="entidad" currentKey={sortKey} currentDir={sortDir} onSort={requestSort} />
                <SortableTh label="Estado" sortKey="estado" currentKey={sortKey} currentDir={sortDir} onSort={requestSort} />
                <SortableTh label="Días sin Mov." sortKey="dias" currentKey={sortKey} currentDir={sortDir} onSort={requestSort} />
                <SortableTh label="Últ. Mov." sortKey="ultmov" currentKey={sortKey} currentDir={sortDir} onSort={requestSort} />
                <SortableTh label="Acción" sortKey="accion" currentKey={sortKey} currentDir={sortDir} onSort={requestSort} />
                <SortableTh label="Exc.1" sortKey="exc1" currentKey={sortKey} currentDir={sortDir} onSort={requestSort} />
                <SortableTh label="Exc.2" sortKey="exc2" currentKey={sortKey} currentDir={sortDir} onSort={requestSort} />
                <SortableTh label="Exc.3" sortKey="exc3" currentKey={sortKey} currentDir={sortDir} onSort={requestSort} />
                <SortableTh label="Exc.4" sortKey="exc4" currentKey={sortKey} currentDir={sortDir} onSort={requestSort} />
                <SortableTh label="Exc.5" sortKey="exc5" currentKey={sortKey} currentDir={sortDir} onSort={requestSort} />
                <SortableTh label="COD" sortKey="cod" currentKey={sortKey} currentDir={sortDir} onSort={requestSort} />
              </tr>
            </thead>
            <tbody>
              {sorted.map((g) => (
                <tr key={g.id}>
                  <td className="font-mono font-semibold">{g.guia}</td>
                  <td>{g.oficina_destino}</td>
                  <td>{g.entidad_destinatario}</td>
                  <td>{g.estado_guia}</td>
                  <td>
                    <div className="flex flex-col items-start gap-0.5">
                      <span
                        className={
                          g.dias_sin_movimiento && g.dias_sin_movimiento > 5 ? 'text-[var(--vg-red)] font-bold' : ''
                        }
                      >
                        {g.dias_sin_movimiento !== null ? `${g.dias_sin_movimiento}d` : '—'}
                      </span>
                      <AlertaDiasBadge dias={g.dias_sin_movimiento} />
                    </div>
                  </td>
                  <td>{g.f_historia || '—'}</td>
                  <td>
                    <AccionBadge accion={g.accion_recomendada} />
                  </td>
                  <td>{g.excepcion_1 || '—'}</td>
                  <td>{g.excepcion_2 || '—'}</td>
                  <td>{g.excepcion_3 || '—'}</td>
                  <td>{g.excepcion_4 || '—'}</td>
                  <td>{g.excepcion_5 || '—'}</td>
                  <td>{g.cod ? `$${g.cod.toLocaleString('es-MX')}` : '—'}</td>
                </tr>
              ))}
              {!filas.length && (
                <tr>
                  <td colSpan={13} className="text-center text-[var(--vg-text3)] py-6">
                    No hay guías que coincidan con el filtro
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
