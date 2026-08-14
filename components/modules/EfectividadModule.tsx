'use client';

import { useMemo, useState } from 'react';
import { Guia } from '@/lib/types';
import { isEntregada, isAbiertaPorEstado, isCancelada, isEnRuta, colorEfectividad, calcularEfectividad, esRetornoAmplio, getExcepciones, topPorCampo, calcularResumenDevoluciones, calcularResumenExcepciones, formatearPeriodo, diasEntreFechas, obtenerRegion, obtenerCiclo, ORDEN_CICLOS } from '@/lib/business-logic';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { exportToExcel, exportToPDF, exportEfectividadPDF } from '@/lib/export';
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

// Estadísticas de efectividad para una lista arbitraria de guías (ya sin
// retornos/predoc/documentada) — pieza compartida entre el desglose por
// campo (cliente/oficina/entidad) y la comparativa plaza×cliente.
function statsDe(lista: Guia[]) {
  const entregadas = lista.filter((g) => isEntregada(g.estado_guia)).length;
  const devoluciones = lista.filter((g) => g.es_devolucion).length;
  const abiertas = lista.filter((g) => isAbiertaPorEstado(g)).length;
  const retornosAbiertos = lista.filter(
    (g) => g.es_devolucion && g.retorno_guia && (g.retorno_estado || '').toUpperCase() !== 'ENTREGADA'
  ).length;
  const efectividad = calcularEfectividad(entregadas, devoluciones, abiertas);
  return { entregadas, devoluciones, abiertas, retornosAbiertos, efectividad, total: lista.length };
}

function efectividadPorCampo(guiasIn: Guia[], campo: keyof Guia | ((g: Guia) => string | null)) {
  // Excluir guías de retorno (explícitas o de otro periodo): ya están
  // contabilizadas como parte de la devolución original.
  const guias = guiasIn.filter((g) => !esRetornoAmplio(g) && !g.es_predoc && !g.es_documentada);
  const grupos: Record<string, Guia[]> = {};
  guias.forEach((g) => {
    const key = (typeof campo === 'function' ? campo(g) : (g[campo] as string)) || 'SIN DATO';
    if (!grupos[key]) grupos[key] = [];
    grupos[key].push(g);
  });

  return Object.entries(grupos)
    .map(([key, lista]) => ({ key, ...statsDe(lista) }))
    .sort((a, b) => b.total - a.total);
}

// Igual que efectividadPorCampo, pero agrupando por mes (YYYY-MM) de
// F_Documentacion en vez de un campo directo de la guía — para ver la
// tendencia de efectividad a lo largo del tiempo cuando el corte cubre
// varios periodos. Se ordena cronológicamente (no por volumen), porque
// para una serie de tiempo el orden natural importa más que el tamaño.
function efectividadPorMes(guiasIn: Guia[]) {
  const guias = guiasIn.filter((g) => !esRetornoAmplio(g) && !g.es_predoc && !g.es_documentada);
  const grupos: Record<string, Guia[]> = {};
  guias.forEach((g) => {
    const key = (g.f_documentacion || '').slice(0, 7) || 'SIN FECHA';
    if (!grupos[key]) grupos[key] = [];
    grupos[key].push(g);
  });

  return Object.entries(grupos)
    .sort((a, b) => a[0].localeCompare(b[0])) // orden cronológico real (YYYY-MM), antes de formatear
    .map(([key, lista]) => ({ key: key === 'SIN FECHA' ? key : formatearPeriodo(key), ...statsDe(lista) }));
}

// ============================================================
// Temporalidad por oficina/entidad: mismos 4 promedios de días del
// módulo Resumen (Doc→Plataforma, Plataforma→1ra Ruta, RecibidoOficina→
// 1ra Ruta, Plataforma→Confirmación) y el mismo semáforo de "vida de la
// guía" (máximo 15 días desde Plataforma hasta que se resuelve, ya sea
// entregada o devuelta), pero desglosados por grupo en vez de un solo
// total — para ver qué oficina/entidad concentra los tiempos más largos.
// ============================================================
interface FilaTemporalidad {
  key: string;
  docPlataforma: number | null;
  nDocPlataforma: number;
  plataformaRuta: number | null;
  nPlataformaRuta: number;
  recibofRuta: number | null;
  nRecibofRuta: number;
  plataformaConfirmacion: number | null;
  nPlataformaConfirmacion: number;
  verde: number;
  rojo: number;
  ambar: number;
  sinDato: number;
  pctVerde: number | null;
  total: number;
}

function temporalidadDe(lista: Guia[]): Omit<FilaTemporalidad, 'key'> {
  const acc = {
    docPlataforma: [] as number[],
    plataformaRuta: [] as number[],
    recibofRuta: [] as number[],
    plataformaConfirmacion: [] as number[],
  };
  let verde = 0;
  let rojo = 0;
  let ambar = 0;
  let sinDato = 0;
  const hoyIso = new Date().toISOString().slice(0, 10);

  lista.forEach((g) => {
    const a = diasEntreFechas(g.f_documentacion, g.fecha_plataforma);
    if (a !== null) acc.docPlataforma.push(a);
    const b = diasEntreFechas(g.fecha_plataforma, g.primera_ruta);
    if (b !== null) acc.plataformaRuta.push(b);
    const c = diasEntreFechas(g.recibido_oficina, g.primera_ruta);
    if (c !== null) acc.recibofRuta.push(c);
    const d = diasEntreFechas(g.fecha_plataforma, g.f_confirmacion);
    if (d !== null) acc.plataformaConfirmacion.push(d);

    if (isEntregada(g.estado_guia)) {
      const vida = diasEntreFechas(g.fecha_plataforma, g.f_confirmacion);
      if (vida === null) sinDato++;
      else if (vida <= 15) verde++;
      else rojo++;
    } else if (g.es_devolucion) {
      const referencia = g.f_entrega || g.f_historia;
      const vida = diasEntreFechas(g.fecha_plataforma, referencia);
      if (vida === null) sinDato++;
      else if (vida <= 15) verde++;
      else rojo++;
    } else if (g.fecha_plataforma) {
      const enCurso = diasEntreFechas(g.fecha_plataforma, hoyIso);
      if (enCurso !== null && enCurso > 15) ambar++;
    }
  });

  const promedio = (arr: number[]): number | null =>
    arr.length ? Number((arr.reduce((s, v) => s + v, 0) / arr.length).toFixed(1)) : null;
  const totalResueltas = verde + rojo;

  return {
    docPlataforma: promedio(acc.docPlataforma),
    nDocPlataforma: acc.docPlataforma.length,
    plataformaRuta: promedio(acc.plataformaRuta),
    nPlataformaRuta: acc.plataformaRuta.length,
    recibofRuta: promedio(acc.recibofRuta),
    nRecibofRuta: acc.recibofRuta.length,
    plataformaConfirmacion: promedio(acc.plataformaConfirmacion),
    nPlataformaConfirmacion: acc.plataformaConfirmacion.length,
    verde,
    rojo,
    ambar,
    sinDato,
    pctVerde: totalResueltas ? Number(((verde / totalResueltas) * 100).toFixed(1)) : null,
    total: lista.length,
  };
}

// Mismo filtro base que efectividadPorCampo (sin retornos/predoc/documentada)
// para que ambas tablas describan el mismo universo de guías.
function temporalidadPorCampo(guiasIn: Guia[], campo: keyof Guia | ((g: Guia) => string | null)): FilaTemporalidad[] {
  const guias = guiasIn.filter((g) => !esRetornoAmplio(g) && !g.es_predoc && !g.es_documentada);
  const grupos: Record<string, Guia[]> = {};
  guias.forEach((g) => {
    const key = (typeof campo === 'function' ? campo(g) : (g[campo] as string)) || 'SIN DATO';
    if (!grupos[key]) grupos[key] = [];
    grupos[key].push(g);
  });
  return Object.entries(grupos)
    .map(([key, lista]) => ({ key, ...temporalidadDe(lista) }))
    .sort((a, b) => b.total - a.total);
}

type VistaEfectividad = 'cliente' | 'oficina' | 'entidad' | 'region' | 'mes';

export default function EfectividadModule({ guias }: { guias: Guia[] }) {
  const [vista, setVista] = useState<VistaEfectividad>('oficina');
  const [vistaTemporalidad, setVistaTemporalidad] = useState<'cliente' | 'oficina' | 'entidad' | 'region'>('oficina');

  const campoTemporalidad: Record<'cliente' | 'oficina' | 'entidad' | 'region', keyof Guia | ((g: Guia) => string | null)> = {
    cliente: 'cliente',
    oficina: 'oficina_destino',
    entidad: 'entidad_destinatario',
    region: (g: Guia) => obtenerRegion(g.oficina_destino),
  };
  const filasTemporalidad = useMemo(
    () => temporalidadPorCampo(guias, campoTemporalidad[vistaTemporalidad]),
    [guias, vistaTemporalidad]
  );
  const top15Temporalidad = filasTemporalidad.slice(0, 15).map((f) => ({ ...f, pctNum: f.pctVerde ?? 0 }));
  const {
    sorted: temporalidadOrdenada,
    sortKey: sortKeyTemp,
    sortDir: sortDirTemp,
    requestSort: requestSortTemp,
  } = useSortableTable<FilaTemporalidad>(filasTemporalidad, (f, key) => {
    switch (key) {
      case 'key':
        return f.key;
      case 'docPlataforma':
        return f.docPlataforma;
      case 'plataformaRuta':
        return f.plataformaRuta;
      case 'recibofRuta':
        return f.recibofRuta;
      case 'plataformaConfirmacion':
        return f.plataformaConfirmacion;
      case 'pctVerde':
        return f.pctVerde;
      case 'total':
        return f.total;
      default:
        return null;
    }
  });
  const etiquetaTemporalidad: Record<'cliente' | 'oficina' | 'entidad' | 'region', string> = {
    cliente: 'Cliente',
    oficina: 'Oficina',
    entidad: 'Entidad',
    region: 'Región',
  };

  // Guías abiertas (en tránsito) agrupadas por Ciclo — ordenadas según el
  // pipeline operativo real (Entrada → Distribución → Recepción → Ruta →
  // Resguardo), no por volumen ni alfabético. Incluye desglose opcional
  // por Región dentro de cada ciclo (colapsable vía el mismo selector de
  // arriba no aplica aquí — usa su propio toggle simple).
  const [verCicloPorRegion, setVerCicloPorRegion] = useState(false);
  const abiertasPorCiclo = useMemo(() => {
    const abiertas = guias.filter((g) => isAbiertaPorEstado(g));
    const grupos: Record<string, Guia[]> = {};
    abiertas.forEach((g) => {
      const ciclo = obtenerCiclo(g.estado_guia);
      if (!grupos[ciclo]) grupos[ciclo] = [];
      grupos[ciclo].push(g);
    });
    return ORDEN_CICLOS.filter((c) => grupos[c]?.length).map((ciclo) => {
      const lista = grupos[ciclo] || [];
      const porRegion: Record<string, number> = {};
      lista.forEach((g) => {
        const r = obtenerRegion(g.oficina_destino);
        porRegion[r] = (porRegion[r] || 0) + 1;
      });
      return { ciclo, total: lista.length, porRegion };
    });
  }, [guias]);
  const totalAbiertasCiclo = abiertasPorCiclo.reduce((s, c) => s + c.total, 0);
  const regionesEnCiclos = useMemo(
    () => [...new Set(abiertasPorCiclo.flatMap((c) => Object.keys(c.porRegion)))].sort(),
    [abiertasPorCiclo]
  );

  const campoDeVista: Record<VistaEfectividad, keyof Guia | ((g: Guia) => string | null)> = {
    cliente: 'cliente',
    oficina: 'oficina_destino',
    entidad: 'entidad_destinatario',
    region: (g: Guia) => obtenerRegion(g.oficina_destino),
    mes: 'f_documentacion', // no se usa directamente: 'mes' se agrupa aparte con efectividadPorMes
  };

  const filas = useMemo(
    () => (vista === 'mes' ? efectividadPorMes(guias) : efectividadPorCampo(guias, campoDeVista[vista])),
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
  const etiqueta: Record<VistaEfectividad, string> = { cliente: 'Cliente', oficina: 'Oficina', entidad: 'Entidad', region: 'Región', mes: 'Mes' };
  const etiquetaPlural: Record<VistaEfectividad, string> = { cliente: 'Clientes', oficina: 'Oficinas', entidad: 'Entidades', region: 'Regiones', mes: 'Meses' };

  // Resumen de excepciones (mismo criterio que el módulo Excepciones:
  // excluye entregadas, devoluciones, canceladas, en ruta y predoc), para
  // dar contexto rápido de qué está pesando en la efectividad sin tener
  // que cambiar de pestaña.
  const guiasConExcepcion = useMemo(
    () =>
      guias.filter((g) => {
        if (g.es_predoc || g.es_documentada) return false;
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

  // ============================================================
  // Comparativo por Cliente — solo tiene sentido mostrarlo cuando el
  // corte trae más de un cliente mezclado. "Cliente" ya es una vista
  // seleccionable del toggle de arriba (cubre volumen y efectividad por
  // cliente); esto complementa con dos cosas que ese toggle no puede
  // mostrar a la vez: efectividad cruzada por plaza×cliente, y el top 3
  // de excepciones de cada cliente lado a lado.
  // ============================================================
  const clientesDistintos = useMemo(
    () => [...new Set(guias.map((g) => g.cliente).filter(Boolean))] as string[],
    [guias]
  );
  const esMultiCliente = clientesDistintos.length > 1;

  // Plaza = entidad (mismo nivel de detalle que "Efectividad por Entidad"
  // en el módulo Geográfico). Se toman las top 8 entidades por volumen
  // total (todos los clientes juntos) para no saturar la tabla.
  const plazaPorCliente = useMemo(() => {
    if (!esMultiCliente) return { plazas: [] as string[], filas: [] as Array<{ plaza: string; porCliente: Record<string, { efectividad: number | null; total: number }> }> };
    const base = guias.filter((g) => !esRetornoAmplio(g) && !g.es_predoc && !g.es_documentada);
    const plazas = efectividadPorCampo(base, 'entidad_destinatario')
      .slice(0, 8)
      .map((p) => p.key);

    const filas = plazas.map((plaza) => {
      const porCliente: Record<string, { efectividad: number | null; total: number }> = {};
      clientesDistintos.forEach((cliente) => {
        const subset = base.filter((g) => g.entidad_destinatario === plaza && g.cliente === cliente);
        const stats = statsDe(subset);
        porCliente[cliente] = { efectividad: stats.efectividad, total: stats.total };
      });
      return { plaza, porCliente };
    });

    return { plazas, filas };
  }, [guias, esMultiCliente, clientesDistintos]);

  const excepcionesPorCliente = useMemo(() => {
    if (!esMultiCliente) return [];
    return clientesDistintos.map((cliente) => ({
      cliente,
      resumen: calcularResumenExcepciones(
        guias.filter((g) => g.cliente === cliente),
        3
      ),
    }));
  }, [guias, esMultiCliente, clientesDistintos]);

  function generarReporteEfectividad() {
    const base = guias.filter((g) => !esRetornoAmplio(g) && !g.es_predoc && !g.es_documentada);
    const general = statsDe(base);

    const clientesDistintosReporte = [...new Set(guias.map((g) => g.cliente).filter(Boolean))] as string[];
    const clienteTexto =
      clientesDistintosReporte.length === 1
        ? clientesDistintosReporte[0]
        : clientesDistintosReporte.length > 1
          ? `Varios clientes (${clientesDistintosReporte.length})`
          : 'Sin cliente';

    const mesesDoc = guias
      .map((g) => g.f_documentacion)
      .filter((f): f is string => !!f)
      .sort();
    const periodoTexto = mesesDoc.length
      ? mesesDoc[0].slice(0, 7) === mesesDoc[mesesDoc.length - 1].slice(0, 7)
        ? formatearPeriodo(mesesDoc[0].slice(0, 7))
        : `${formatearPeriodo(mesesDoc[0].slice(0, 7))} – ${formatearPeriodo(mesesDoc[mesesDoc.length - 1].slice(0, 7))}`
      : 'Periodo no disponible';

    // Top excepciones y devoluciones a nivel general (no depende del
    // filtro de "Resumen de excepciones" en pantalla, para que el PDF
    // siempre sea el mismo sin importar qué estuviera seleccionado ahí).
    const excGeneral = calcularResumenExcepciones(guias, 10);
    const devGeneral = calcularResumenDevoluciones(guias, 10);

    exportEfectividadPDF({
      cliente: clienteTexto,
      periodoTexto,
      totalGuias: guias.length,
      entregadas: general.entregadas,
      devoluciones: general.devoluciones,
      abiertas: general.abiertas,
      efectividadGeneral: general.efectividad,
      topExcepciones: excGeneral.porTipo,
      totalConExcepcion: excGeneral.total,
      devolucionesPorOficina: devGeneral.porOficina,
      devolucionesPorMotivo: devGeneral.porMotivo,
      totalDevoluciones: devGeneral.total,
      porCliente: efectividadPorCampo(guias, 'cliente').map((x) => ({ key: x.key, total: x.total, efectividad: x.efectividad })),
      porOficina: efectividadPorCampo(guias, 'oficina_destino').map((x) => ({ key: x.key, total: x.total, efectividad: x.efectividad })),
      porEntidad: efectividadPorCampo(guias, 'entidad_destinatario').map((x) => ({ key: x.key, total: x.total, efectividad: x.efectividad })),
      porMes: efectividadPorMes(guias).map((x) => ({ key: x.key, total: x.total, efectividad: x.efectividad })),
      comparativoPlazaCliente: esMultiCliente ? { clientes: clientesDistintos, filas: plazaPorCliente.filas } : undefined,
      excepcionesPorCliente: esMultiCliente
        ? excepcionesPorCliente.map((c) => ({ cliente: c.cliente, items: c.resumen.porTipo, total: c.resumen.total }))
        : undefined,
    });
  }

  return (
    <div className="p-5 space-y-4">
      <div className="flex justify-end">
        <button
          onClick={generarReporteEfectividad}
          className="text-[12px] font-semibold text-white bg-[var(--vg-blue)] rounded-md px-3 py-1.5 hover:opacity-90"
        >
          📄 Exportar Reporte de Efectividad (PDF)
        </button>
      </div>

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

      {esMultiCliente && (
        <div className="bg-white rounded-lg border border-[var(--vg-border)] p-4">
          <div className="font-bold text-[13px] mb-0.5">🔀 Comparativo por Cliente</div>
          <div className="text-[11px] text-[var(--vg-text2)] mb-3">
            Este corte trae {clientesDistintos.length} clientes distintos — usa "Cliente" en el toggle de arriba
            para ver volumen y efectividad de cada uno; aquí se comparan directamente entre sí.
          </div>

          <div className="font-semibold text-[12px] mb-2">Efectividad por Plaza (Entidad) — comparado entre clientes</div>
          <div className="overflow-x-auto vg-scroll mb-5">
            <table className="vg-table">
              <thead>
                <tr>
                  <th>Entidad</th>
                  {clientesDistintos.map((c) => (
                    <th key={c}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {plazaPorCliente.filas.map(({ plaza, porCliente }) => (
                  <tr key={plaza}>
                    <td className="font-medium">{plaza}</td>
                    {clientesDistintos.map((c) => {
                      const d = porCliente[c];
                      return (
                        <td key={c}>
                          {d && d.total > 0 ? (
                            <span>
                              <span className="font-bold" style={{ color: colorEfectividad(d.efectividad) }}>
                                {d.efectividad !== null ? `${d.efectividad}%` : '—'}
                              </span>
                              <span className="text-[10px] text-[var(--vg-text3)]"> ({d.total})</span>
                            </span>
                          ) : (
                            <span className="text-[var(--vg-text3)]">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="font-semibold text-[12px] mb-2">Top 3 Excepciones por Cliente</div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {excepcionesPorCliente.map(({ cliente, resumen }) => (
              <TopListPanel
                key={cliente}
                title={cliente}
                items={resumen.porTipo}
                total={resumen.total}
                accentColor="#7C3AED"
              />
            ))}
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg border border-[var(--vg-border)] p-4">
        <div className="font-bold text-[12.5px] mb-3">
          Efectividad — {vista === 'mes' ? 'Tendencia Mensual' : `Top 15 ${etiquetaPlural[vista]} por Volumen`}
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

      <div className="bg-white rounded-lg border border-[var(--vg-border)] p-4">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
          <div>
            <div className="font-bold text-[12.5px]">Temporalidad por {etiquetaTemporalidad[vistaTemporalidad]}</div>
            <div className="text-[11px] text-[var(--vg-text2)]">
              Días promedio por etapa · % dentro de 15 días desde Plataforma hasta entrega o devolución
            </div>
          </div>
          <div className="flex gap-1 bg-[var(--vg-bg)] p-1 rounded-md">
            <button
              onClick={() => setVistaTemporalidad('cliente')}
              className={`text-[11.5px] font-semibold px-3 py-1 rounded ${
                vistaTemporalidad === 'cliente' ? 'bg-white shadow-sm text-[var(--vg-blue)]' : 'text-[var(--vg-text2)]'
              }`}
            >
              Cliente
            </button>
            <button
              onClick={() => setVistaTemporalidad('oficina')}
              className={`text-[11.5px] font-semibold px-3 py-1 rounded ${
                vistaTemporalidad === 'oficina' ? 'bg-white shadow-sm text-[var(--vg-blue)]' : 'text-[var(--vg-text2)]'
              }`}
            >
              Oficina
            </button>
            <button
              onClick={() => setVistaTemporalidad('entidad')}
              className={`text-[11.5px] font-semibold px-3 py-1 rounded ${
                vistaTemporalidad === 'entidad' ? 'bg-white shadow-sm text-[var(--vg-blue)]' : 'text-[var(--vg-text2)]'
              }`}
            >
              Entidad
            </button>
            <button
              onClick={() => setVistaTemporalidad('region')}
              className={`text-[11.5px] font-semibold px-3 py-1 rounded ${
                vistaTemporalidad === 'region' ? 'bg-white shadow-sm text-[var(--vg-blue)]' : 'text-[var(--vg-text2)]'
              }`}
            >
              Región
            </button>
          </div>
        </div>

        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={top15Temporalidad} margin={{ bottom: 80 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="key" angle={-40} textAnchor="end" interval={0} fontSize={10} height={100} />
            <YAxis fontSize={11} unit="%" />
            <Tooltip formatter={(v) => `${v}%`} labelFormatter={(v) => `${v} — % dentro de 15 días`} />
            <Bar dataKey="pctNum" radius={[4, 4, 0, 0]}>
              {top15Temporalidad.map((entry, i) => (
                <Cell key={i} fill={colorEfectividad(entry.pctVerde)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>

        <div className="max-h-[420px] overflow-y-auto vg-scroll mt-3">
          <table className="vg-table">
            <thead>
              <tr>
                <SortableTh label={etiquetaTemporalidad[vistaTemporalidad]} sortKey="key" currentKey={sortKeyTemp} currentDir={sortDirTemp} onSort={requestSortTemp} />
                <SortableTh label="Doc→Plataf. (d)" sortKey="docPlataforma" currentKey={sortKeyTemp} currentDir={sortDirTemp} onSort={requestSortTemp} />
                <SortableTh label="Plataf.→1ra Ruta (d)" sortKey="plataformaRuta" currentKey={sortKeyTemp} currentDir={sortDirTemp} onSort={requestSortTemp} />
                <SortableTh label="RecibOf→1ra Ruta (d)" sortKey="recibofRuta" currentKey={sortKeyTemp} currentDir={sortDirTemp} onSort={requestSortTemp} />
                <SortableTh label="Plataf.→Confirm. (d)" sortKey="plataformaConfirmacion" currentKey={sortKeyTemp} currentDir={sortDirTemp} onSort={requestSortTemp} />
                <SortableTh label="% ≤15d" sortKey="pctVerde" currentKey={sortKeyTemp} currentDir={sortDirTemp} onSort={requestSortTemp} />
                <SortableTh label="Total" sortKey="total" currentKey={sortKeyTemp} currentDir={sortDirTemp} onSort={requestSortTemp} />
              </tr>
            </thead>
            <tbody>
              {temporalidadOrdenada.map((f) => (
                <tr key={f.key}>
                  <td className="font-medium">{f.key}</td>
                  <td>{f.docPlataforma !== null ? `${f.docPlataforma}d` : '—'}</td>
                  <td>{f.plataformaRuta !== null ? `${f.plataformaRuta}d` : '—'}</td>
                  <td>{f.recibofRuta !== null ? `${f.recibofRuta}d` : '—'}</td>
                  <td>{f.plataformaConfirmacion !== null ? `${f.plataformaConfirmacion}d` : '—'}</td>
                  <td>
                    <span className="font-bold" style={{ color: colorEfectividad(f.pctVerde) }}>
                      {f.pctVerde !== null ? `${f.pctVerde}%` : '—'}
                    </span>
                    <span className="text-[10px] text-[var(--vg-text3)]"> ({f.verde}/{f.verde + f.rojo})</span>
                  </td>
                  <td>{f.total.toLocaleString('es-MX')}</td>
                </tr>
              ))}
              {!filasTemporalidad.length && (
                <tr>
                  <td colSpan={7} className="text-center text-[var(--vg-text3)] py-6">
                    Sin datos para este corte
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-[var(--vg-border)] p-4">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
          <div>
            <div className="font-bold text-[12.5px]">Guías Abiertas por Ciclo</div>
            <div className="text-[11px] text-[var(--vg-text2)]">
              En qué etapa del proceso están las {totalAbiertasCiclo.toLocaleString('es-MX')} guías abiertas actuales
            </div>
          </div>
          <button
            onClick={() => setVerCicloPorRegion((v) => !v)}
            className={`text-[11.5px] font-semibold px-3 py-1.5 rounded-md border border-[var(--vg-border)] ${
              verCicloPorRegion ? 'bg-[var(--vg-blue)] text-white border-[var(--vg-blue)]' : 'bg-white text-[var(--vg-text2)]'
            }`}
          >
            Desglosar por Región
          </button>
        </div>

        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={abiertasPorCiclo} margin={{ bottom: 10 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="ciclo" fontSize={11} />
            <YAxis fontSize={11} />
            <Tooltip />
            <Bar dataKey="total" name="Guías Abiertas" fill="#1E3A8A" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>

        <div className="mt-3 overflow-x-auto vg-scroll">
          <table className="vg-table">
            <thead>
              <tr>
                <th>Ciclo</th>
                {verCicloPorRegion && regionesEnCiclos.map((r) => <th key={r}>{r}</th>)}
                <th>Total</th>
                <th>% del Total Abiertas</th>
              </tr>
            </thead>
            <tbody>
              {abiertasPorCiclo.map((c) => (
                <tr key={c.ciclo}>
                  <td className="font-medium">{c.ciclo}</td>
                  {verCicloPorRegion && regionesEnCiclos.map((r) => <td key={r}>{c.porRegion[r] || 0}</td>)}
                  <td className="font-bold">{c.total.toLocaleString('es-MX')}</td>
                  <td>{totalAbiertasCiclo ? `${((c.total / totalAbiertasCiclo) * 100).toFixed(1)}%` : '—'}</td>
                </tr>
              ))}
              {!abiertasPorCiclo.length && (
                <tr>
                  <td colSpan={(verCicloPorRegion ? regionesEnCiclos.length : 0) + 3} className="text-center text-[var(--vg-text3)] py-6">
                    No hay guías abiertas en este corte
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
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
              <button
                onClick={() => setVista('region')}
                className={`text-[11.5px] font-semibold px-3 py-1 rounded ${
                  vista === 'region' ? 'bg-white shadow-sm text-[var(--vg-blue)]' : 'text-[var(--vg-text2)]'
                }`}
              >
                Región
              </button>
              <button
                onClick={() => setVista('mes')}
                className={`text-[11.5px] font-semibold px-3 py-1 rounded ${
                  vista === 'mes' ? 'bg-white shadow-sm text-[var(--vg-blue)]' : 'text-[var(--vg-text2)]'
                }`}
              >
                Mes
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
