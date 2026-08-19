'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import { Guia } from '@/lib/types';
import { isEntregada, isAbiertaPorEstado, isCancelada, isEnRuta, colorEfectividad, calcularEfectividad, esRetornoAmplio, getExcepciones, topPorCampo, calcularResumenDevoluciones, calcularResumenExcepciones, formatearPeriodo, diasEntreFechas, obtenerRegion, obtenerCiclo, ORDEN_CICLOS, FilaTemporalidad, temporalidadPorCampo, efectividadTemporalidadPorRegionOficina, tendenciaMensualPorCampo } from '@/lib/business-logic';
import { BarChart, Bar, LineChart, Line, Legend, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { exportToExcel, exportToPDF, exportEfectividadPDF } from '@/lib/export';
import TopListPanel from '@/components/TopListPanel';
import { useSortableTable } from '@/lib/useSortableTable';
import SortableTh from '@/components/SortableTh';
import KpiCard from '@/components/KpiCard';

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
// Temporalidad por oficina/entidad/región/cliente: ver temporalidadPorCampo()
// y FilaTemporalidad en business-logic.ts (compartido con los PDFs).
// ============================================================

type VistaEfectividad = 'cliente' | 'oficina' | 'entidad' | 'region' | 'mes';

const COLORES_TENDENCIA_TABLA = ['#1E3A8A', '#0B9B67', '#DC2626', '#B45309', '#7C3AED', '#0891B2'];

// Tabla compacta debajo de cada gráfico de tendencia: cuando hay varias
// líneas muy juntas (ej. varias oficinas todas entre 90-96%), el gráfico
// solo no deja leer el valor exacto de cada mes — esta tabla sí.
function TablaTendenciaMini({ datos, series }: { datos: { mes: string; [k: string]: string | number | null }[]; series: string[] }) {
  if (datos.length < 2) return null;
  return (
    <div className="overflow-x-auto mt-2">
      <table className="vg-table text-[10.5px]">
        <thead>
          <tr>
            <th>{series.length > 1 ? 'Cliente / Oficina' : ''}</th>
            {datos.map((d) => (
              <th key={d.mes}>{formatearPeriodo(d.mes)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {series.map((s, i) => (
            <tr key={s}>
              <td className="font-semibold" style={series.length > 1 ? { color: COLORES_TENDENCIA_TABLA[i % COLORES_TENDENCIA_TABLA.length] } : undefined}>
                {s === 'TOTAL' ? 'Total' : s}
              </td>
              {datos.map((d) => (
                <td key={d.mes}>{d[s] !== null && d[s] !== undefined ? `${d[s]}%` : '—'}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function EfectividadModule({ guias }: { guias: Guia[] }) {
  const [vista, setVista] = useState<VistaEfectividad>('oficina');

  // Resumen general de temporalidad para el KPI del inicio del módulo —
  // misma función (temporalidadPorCampo) que usan las tablas por Cliente/
  // Oficina/Entidad/Región más abajo, agrupando todo en un solo total.
  const temporalidadResumenGeneral = useMemo(() => temporalidadPorCampo(guias, () => 'TOTAL')[0] ?? null, [guias]);
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

  // Drill-down Región → Oficinas: solo aplica cuando vistaTemporalidad
  // === 'region'. Cada región es expandible para revelar sus oficinas,
  // calculadas con la misma temporalidadPorCampo() (consistente con el
  // resto del panel).
  const [regionesExpandidas, setRegionesExpandidas] = useState<Set<string>>(new Set());
  function toggleRegionExpandida(key: string) {
    setRegionesExpandidas((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }
  const oficinasPorRegion = useMemo(() => {
    if (vistaTemporalidad !== 'region') return {};
    const map: Record<string, FilaTemporalidad[]> = {};
    filasTemporalidad.forEach((f) => {
      map[f.key] = temporalidadPorCampo(
        guias.filter((g) => obtenerRegion(g.oficina_destino) === f.key),
        'oficina_destino'
      );
    });
    return map;
  }, [guias, vistaTemporalidad, filasTemporalidad]);

  // ============================================================
  // Tendencias (líneas, no barras): Efectividad % y Temporalidad (% ≤15d)
  // mes a mes, con un mismo selector Total/Cliente/Oficina/Entidad para
  // ambas — solo aplica si el corte cubre más de un mes. El botón
  // "Cliente" solo se muestra si hay más de un cliente en el corte (ver
  // esMultiCliente más abajo) — con un solo cliente sería idéntico a Total.
  //
  // Además de "Total" (todos los meses disponibles), se puede elegir
  // manualmente CUÁLES meses comparar (chips togglables) — por ejemplo,
  // comparar solo mayo vs agosto sin junio/julio de por medio.
  // ============================================================
  const [vistaTendencia, setVistaTendencia] = useState<'total' | 'cliente' | 'oficina' | 'entidad'>('total');
  const campoTendencia: Record<'total' | 'cliente' | 'oficina' | 'entidad', keyof Guia | null> = {
    total: null,
    cliente: 'cliente',
    oficina: 'oficina_destino',
    entidad: 'entidad_destinatario',
  };

  const mesesDisponibles = useMemo(() => {
    const meses = new Set<string>();
    guias.forEach((g) => {
      if (esRetornoAmplio(g) || g.es_predoc || g.es_documentada) return;
      const mes = (g.f_documentacion || '').slice(0, 7);
      if (mes) meses.add(mes);
    });
    return [...meses].sort();
  }, [guias]);

  const [mesesSeleccionados, setMesesSeleccionados] = useState<string[]>([]);
  useEffect(() => {
    // Por default se seleccionan todos los meses disponibles — el usuario
    // puede deseleccionar los que no quiera comparar.
    setMesesSeleccionados(mesesDisponibles);
  }, [mesesDisponibles]);

  function toggleMesTendencia(mes: string) {
    setMesesSeleccionados((prev) => (prev.includes(mes) ? prev.filter((m) => m !== mes) : [...prev, mes].sort()));
  }

  const guiasParaTendencia = useMemo(
    () => guias.filter((g) => mesesSeleccionados.includes((g.f_documentacion || '').slice(0, 7))),
    [guias, mesesSeleccionados]
  );

  const tendenciaEfectividad = useMemo(
    () => tendenciaMensualPorCampo(guiasParaTendencia, campoTendencia[vistaTendencia], 'efectividad'),
    [guiasParaTendencia, vistaTendencia]
  );
  const tendenciaTemporalidad = useMemo(
    () => tendenciaMensualPorCampo(guiasParaTendencia, campoTendencia[vistaTendencia], 'temporalidad'),
    [guiasParaTendencia, vistaTendencia]
  );
  // La sección se muestra si HAY más de un mes disponible para elegir,
  // independientemente de cuántos estén seleccionados en este momento.
  const hayVariosMeses = mesesDisponibles.length > 1;
  const COLORES_TENDENCIA = ['#1E3A8A', '#0B9B67', '#DC2626', '#B45309', '#7C3AED', '#0891B2'];
  // Guías abiertas (en tránsito) agrupadas por Ciclo — ordenadas según el
  // pipeline operativo real (Entrada → Distribución → Recepción → Ruta →
  // Resguardo), no por volumen ni alfabético. Incluye desglose opcional
  // por Región dentro de cada ciclo (colapsable vía el mismo selector de
  // arriba no aplica aquí — usa su propio toggle simple).
  //
  // IMPORTANTE: excluye retornos (esRetornoAmplio) igual que el KPI
  // "Abiertas" del módulo Resumen (que usa guiasOriginales = esGuiaOriginal,
  // el cual también excluye retornos) — de lo contrario este total no
  // cuadra con el de Resumen.
  // '' = sin desglose, '__REGIONES__' = por región, o el nombre de una
  // región específica = drill-down a las oficinas de esa región.
  const [desgloseCiclo, setDesgloseCiclo] = useState('');
  const abiertasPorCiclo = useMemo(() => {
    const abiertas = guias.filter((g) => isAbiertaPorEstado(g) && !esRetornoAmplio(g));
    const grupos: Record<string, Guia[]> = {};
    abiertas.forEach((g) => {
      const ciclo = obtenerCiclo(g.estado_guia);
      if (!grupos[ciclo]) grupos[ciclo] = [];
      grupos[ciclo].push(g);
    });
    return ORDEN_CICLOS.filter((c) => grupos[c]?.length).map((ciclo) => {
      const lista = grupos[ciclo] || [];
      const porRegion: Record<string, number> = {};
      const porOficina: Record<string, number> = {};
      lista.forEach((g) => {
        const r = obtenerRegion(g.oficina_destino);
        porRegion[r] = (porRegion[r] || 0) + 1;
        if (desgloseCiclo && desgloseCiclo !== '__REGIONES__' && r === desgloseCiclo) {
          const of = g.oficina_destino || 'SIN OFICINA';
          porOficina[of] = (porOficina[of] || 0) + 1;
        }
      });
      return { ciclo, total: lista.length, porRegion, porOficina };
    });
  }, [guias, desgloseCiclo]);
  const totalAbiertasCiclo = abiertasPorCiclo.reduce((s, c) => s + c.total, 0);
  const regionesEnCiclos = useMemo(
    () => [...new Set(abiertasPorCiclo.flatMap((c) => Object.keys(c.porRegion)))].sort(),
    [abiertasPorCiclo]
  );
  const oficinasEnCiclos = useMemo(
    () => [...new Set(abiertasPorCiclo.flatMap((c) => Object.keys(c.porOficina)))].sort(),
    [abiertasPorCiclo]
  );
  // Columnas efectivamente mostradas según el nivel de desglose elegido.
  const columnasCiclo = desgloseCiclo === '__REGIONES__' ? regionesEnCiclos : desgloseCiclo ? oficinasEnCiclos : [];
  const valorColumnaCiclo = (fila: (typeof abiertasPorCiclo)[0], col: string) =>
    desgloseCiclo === '__REGIONES__' ? fila.porRegion[col] || 0 : fila.porOficina[col] || 0;

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
  // Si el filtro global cambia y deja de haber varios clientes mientras
  // "Cliente" estaba seleccionado en Tendencias, regresa a "Total" (el
  // botón ya no se muestra, pero el estado podría quedar obsoleto).
  useEffect(() => {
    if (!esMultiCliente && vistaTendencia === 'cliente') setVistaTendencia('total');
  }, [esMultiCliente, vistaTendencia]);

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

    // Predoc/Documentadas/Canceladas se cuentan directo de TODAS las
    // guías (no de `base`, que ya las excluye) — mismo criterio que usa
    // el módulo Resumen para su KPI de "Canceladas".
    const predocumentadas = guias.filter((g) => g.es_predoc).length;
    const documentadas = guias.filter((g) => g.es_documentada).length;
    const canceladas = guias.filter(
      (g) => isCancelada(g.estado_guia) && !esRetornoAmplio(g) && !g.es_predoc && !g.es_documentada
    ).length;

    exportEfectividadPDF({
      cliente: clienteTexto,
      periodoTexto,
      totalGuias: guias.length,
      entregadas: general.entregadas,
      devoluciones: general.devoluciones,
      abiertas: general.abiertas,
      predocumentadas,
      documentadas,
      canceladas,
      efectividadGeneral: general.efectividad,
      topExcepciones: excGeneral.porTipo,
      totalConExcepcion: excGeneral.total,
      devolucionesPorOficina: devGeneral.porOficina,
      devolucionesPorMotivo: devGeneral.porMotivo,
      totalDevoluciones: devGeneral.total,
      porEntidad: efectividadPorCampo(guias, 'entidad_destinatario').map((x) => ({ key: x.key, total: x.total, efectividad: x.efectividad })),
      porMes: efectividadPorMes(guias).map((x) => ({ key: x.key, total: x.total, efectividad: x.efectividad })),
      comparativoPlazaCliente: esMultiCliente ? { clientes: clientesDistintos, filas: plazaPorCliente.filas } : undefined,
      excepcionesPorCliente: esMultiCliente
        ? excepcionesPorCliente.map((c) => ({ cliente: c.cliente, items: c.resumen.porTipo, total: c.resumen.total }))
        : undefined,
      // Efectividad + Temporalidad combinadas en una sola tabla Región→
      // Oficina — reemplaza lo que antes eran 3 secciones separadas.
      regionOficina: efectividadTemporalidadPorRegionOficina(guias),
      // Temporalidad por Cliente — tabla independiente.
      temporalidadPorCliente: temporalidadPorCampo(guias, 'cliente'),
      // Resumen general de temporalidad para los KPIs del inicio.
      temporalidadGeneral: temporalidadResumenGeneral,
      tendencias: {
        efectividadTotal: tendenciaMensualPorCampo(guiasParaTendencia, null, 'efectividad'),
        efectividadCliente: esMultiCliente ? tendenciaMensualPorCampo(guiasParaTendencia, 'cliente', 'efectividad') : null,
        efectividadOficina: tendenciaMensualPorCampo(guiasParaTendencia, 'oficina_destino', 'efectividad'),
        efectividadEntidad: tendenciaMensualPorCampo(guiasParaTendencia, 'entidad_destinatario', 'efectividad'),
        temporalidadTotal: tendenciaMensualPorCampo(guiasParaTendencia, null, 'temporalidad'),
        temporalidadCliente: esMultiCliente ? tendenciaMensualPorCampo(guiasParaTendencia, 'cliente', 'temporalidad') : null,
        temporalidadOficina: tendenciaMensualPorCampo(guiasParaTendencia, 'oficina_destino', 'temporalidad'),
        temporalidadEntidad: tendenciaMensualPorCampo(guiasParaTendencia, 'entidad_destinatario', 'temporalidad'),
      },
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

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KpiCard
          title="% Dentro de 15 Días"
          value={temporalidadResumenGeneral?.pctVerde != null ? `${temporalidadResumenGeneral.pctVerde}%` : '—'}
          subtitle="Plataforma → entrega o retorno"
          accentColor={
            temporalidadResumenGeneral?.pctVerde == null
              ? '#94A3B8'
              : colorEfectividad(temporalidadResumenGeneral.pctVerde)
          }
        />
        <KpiCard
          title="Promedio Vida (Plataf. → Entrega/Retorno)"
          value={temporalidadResumenGeneral?.promedioVidaDias != null ? `${temporalidadResumenGeneral.promedioVidaDias}d` : '—'}
          subtitle="Entregadas: F_Confirmación · Devoluciones: entrega del retorno · Abiertas: hoy"
          accentColor="#0891B2"
        />
        <KpiCard
          title="Plataforma → Confirmación"
          value={temporalidadResumenGeneral?.plataformaConfirmacion != null ? `${temporalidadResumenGeneral.plataformaConfirmacion}d` : '—'}
          subtitle="Entregadas: F_Confirmación · Abiertas: hoy"
          accentColor="#7C3AED"
        />
        <KpiCard
          title="Plataforma → 1ra Ruta"
          value={temporalidadResumenGeneral?.plataformaRuta != null ? `${temporalidadResumenGeneral.plataformaRuta}d` : '—'}
          subtitle="Promedio"
          accentColor="#0B9B67"
        />
        <KpiCard
          title="Doc. → Plataforma"
          value={temporalidadResumenGeneral?.docPlataforma != null ? `${temporalidadResumenGeneral.docPlataforma}d` : '—'}
          subtitle="Promedio"
          accentColor="#1E3A8A"
        />
      </div>

      {hayVariosMeses && (
        <div className="bg-white rounded-lg border border-[var(--vg-border)] p-4">
          <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
            <div className="font-bold text-[12.5px]">Tendencias Mensuales</div>
            <div className="flex gap-1 bg-[var(--vg-bg)] p-1 rounded-md">
              <button
                onClick={() => setVistaTendencia('total')}
                className={`text-[11.5px] font-semibold px-3 py-1 rounded ${vistaTendencia === 'total' ? 'bg-white shadow-sm text-[var(--vg-blue)]' : 'text-[var(--vg-text2)]'}`}
              >
                Total
              </button>
              {esMultiCliente && (
                <button
                  onClick={() => setVistaTendencia('cliente')}
                  className={`text-[11.5px] font-semibold px-3 py-1 rounded ${vistaTendencia === 'cliente' ? 'bg-white shadow-sm text-[var(--vg-blue)]' : 'text-[var(--vg-text2)]'}`}
                >
                  Cliente
                </button>
              )}
              <button
                onClick={() => setVistaTendencia('oficina')}
                className={`text-[11.5px] font-semibold px-3 py-1 rounded ${vistaTendencia === 'oficina' ? 'bg-white shadow-sm text-[var(--vg-blue)]' : 'text-[var(--vg-text2)]'}`}
              >
                Oficina
              </button>
              <button
                onClick={() => setVistaTendencia('entidad')}
                className={`text-[11.5px] font-semibold px-3 py-1 rounded ${vistaTendencia === 'entidad' ? 'bg-white shadow-sm text-[var(--vg-blue)]' : 'text-[var(--vg-text2)]'}`}
              >
                Entidad
              </button>
            </div>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap mb-4 pb-3 border-b border-[var(--vg-border)]">
            <span className="text-[10.5px] font-semibold text-[var(--vg-text2)] mr-1">Comparar:</span>
            {mesesDisponibles.map((mes) => {
              const activo = mesesSeleccionados.includes(mes);
              return (
                <button
                  key={mes}
                  onClick={() => toggleMesTendencia(mes)}
                  className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${
                    activo
                      ? 'bg-[var(--vg-blue)] text-white border-[var(--vg-blue)]'
                      : 'bg-white text-[var(--vg-text3)] border-[var(--vg-border)]'
                  }`}
                >
                  {formatearPeriodo(mes)}
                </button>
              );
            })}
            {mesesSeleccionados.length !== mesesDisponibles.length && (
              <button
                onClick={() => setMesesSeleccionados(mesesDisponibles)}
                className="text-[10.5px] font-semibold text-[var(--vg-blue)] px-2 py-1"
              >
                Seleccionar todos
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div>
              <div className="text-[11.5px] font-semibold text-[var(--vg-text2)] mb-2">Efectividad %</div>
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={tendenciaEfectividad.datos} margin={{ bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="mes" tickFormatter={(v) => formatearPeriodo(String(v))} fontSize={10} />
                  <YAxis fontSize={11} domain={[0, 100]} />
                  <Tooltip labelFormatter={(v) => formatearPeriodo(String(v))} formatter={(v) => `${v}%`} />
                  {tendenciaEfectividad.series.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} />}
                  {tendenciaEfectividad.series.map((s, i) => (
                    <Line
                      key={s}
                      type="monotone"
                      dataKey={s}
                      name={s}
                      stroke={COLORES_TENDENCIA[i % COLORES_TENDENCIA.length]}
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      activeDot={{ r: 5 }}
                      connectNulls
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
              <TablaTendenciaMini datos={tendenciaEfectividad.datos} series={tendenciaEfectividad.series} />
            </div>
            <div>
              <div className="text-[11.5px] font-semibold text-[var(--vg-text2)] mb-2">Temporalidad — % Dentro de 15 Días</div>
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={tendenciaTemporalidad.datos} margin={{ bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="mes" tickFormatter={(v) => formatearPeriodo(String(v))} fontSize={10} />
                  <YAxis fontSize={11} domain={[0, 100]} />
                  <Tooltip labelFormatter={(v) => formatearPeriodo(String(v))} formatter={(v) => `${v}%`} />
                  {tendenciaTemporalidad.series.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} />}
                  {tendenciaTemporalidad.series.map((s, i) => (
                    <Line
                      key={s}
                      type="monotone"
                      dataKey={s}
                      name={s}
                      stroke={COLORES_TENDENCIA[i % COLORES_TENDENCIA.length]}
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      activeDot={{ r: 5 }}
                      connectNulls
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
              <TablaTendenciaMini datos={tendenciaTemporalidad.datos} series={tendenciaTemporalidad.series} />
            </div>
          </div>
          {vistaTendencia !== 'total' && (
            <div className="text-[10.5px] text-[var(--vg-text3)] mt-2">
              Top {tendenciaEfectividad.series.length} {vistaTendencia === 'cliente' ? 'clientes' : 'oficinas'} por volumen total del corte
            </div>
          )}
        </div>
      )}

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
              Días promedio por etapa · % dentro de 15 días desde Plataforma hasta entrega/devolución (abiertas se miden contra hoy)
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
              {temporalidadOrdenada.map((f) => {
                const expandible = vistaTemporalidad === 'region';
                const expandida = regionesExpandidas.has(f.key);
                return (
                <Fragment key={f.key}>
                  <tr>
                    <td className="font-medium">
                      {expandible && (
                        <button
                          onClick={() => toggleRegionExpandida(f.key)}
                          className="mr-1.5 text-[var(--vg-text2)] font-bold inline-block w-3"
                          aria-label="Expandir oficinas"
                        >
                          {expandida ? '▾' : '▸'}
                        </button>
                      )}
                      {f.key}
                    </td>
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
                  {expandible &&
                    expandida &&
                    (oficinasPorRegion[f.key] || []).map((of) => (
                      <tr key={`${f.key}__${of.key}`} className="bg-[var(--vg-bg)]">
                        <td className="pl-7 text-[11px] text-[var(--vg-text2)]">↳ {of.key}</td>
                        <td className="text-[11px]">{of.docPlataforma !== null ? `${of.docPlataforma}d` : '—'}</td>
                        <td className="text-[11px]">{of.plataformaRuta !== null ? `${of.plataformaRuta}d` : '—'}</td>
                        <td className="text-[11px]">{of.recibofRuta !== null ? `${of.recibofRuta}d` : '—'}</td>
                        <td className="text-[11px]">{of.plataformaConfirmacion !== null ? `${of.plataformaConfirmacion}d` : '—'}</td>
                        <td className="text-[11px]">
                          <span className="font-semibold" style={{ color: colorEfectividad(of.pctVerde) }}>
                            {of.pctVerde !== null ? `${of.pctVerde}%` : '—'}
                          </span>
                          <span className="text-[9.5px] text-[var(--vg-text3)]"> ({of.verde}/{of.verde + of.rojo})</span>
                        </td>
                        <td className="text-[11px]">{of.total.toLocaleString('es-MX')}</td>
                      </tr>
                    ))}
                </Fragment>
                );
              })}
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
          <select
            value={desgloseCiclo}
            onChange={(e) => setDesgloseCiclo(e.target.value)}
            className="text-[11.5px] font-semibold border border-[var(--vg-border)] rounded-md px-2.5 py-1.5 bg-white text-[var(--vg-text2)]"
          >
            <option value="">Sin desglose</option>
            <option value="__REGIONES__">Por Región</option>
            {regionesEnCiclos.map((r) => (
              <option key={r} value={r}>
                Oficinas de {r}
              </option>
            ))}
          </select>
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
                {columnasCiclo.map((col) => <th key={col}>{col}</th>)}
                <th>Total</th>
                <th>% del Total Abiertas</th>
              </tr>
            </thead>
            <tbody>
              {abiertasPorCiclo.map((c) => (
                <tr key={c.ciclo}>
                  <td className="font-medium">{c.ciclo}</td>
                  {columnasCiclo.map((col) => <td key={col}>{valorColumnaCiclo(c, col)}</td>)}
                  <td className="font-bold">{c.total.toLocaleString('es-MX')}</td>
                  <td>{totalAbiertasCiclo ? `${((c.total / totalAbiertasCiclo) * 100).toFixed(1)}%` : '—'}</td>
                </tr>
              ))}
              {!abiertasPorCiclo.length && (
                <tr>
                  <td colSpan={columnasCiclo.length + 3} className="text-center text-[var(--vg-text3)] py-6">
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
