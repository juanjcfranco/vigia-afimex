'use client';

import { useEffect, useMemo, useState } from 'react';
import { Guia, ContactoOficina, AlertaGuiaEvento } from '@/lib/types';
import { isAbiertaPorEstado, topPorCampo, obtenerCiclo, obtenerRegion, ORDEN_CICLOS, esRetornoAmplio, ultimaExcepcion, accionEfectiva, calcularSemaforoGuia, calcularEtiquetaSeguimiento } from '@/lib/business-logic';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import BulkSearch from '@/components/BulkSearch';
import { SelectorMultiple } from '@/components/FilterBar';
import AlertaDiasBadge from '@/components/AlertaDiasBadge';
import AccionMasivaModal, { TipoAccionMasiva } from '@/components/AccionMasivaModal';
import AlertaSinMovimientoModal from '@/components/AlertaSinMovimientoModal';
import SemaforoAlertaModal from '@/components/SemaforoAlertaModal';
import { exportToExcel, exportToPDF } from '@/lib/export';
import { useSortableTable } from '@/lib/useSortableTable';
import SortableTh from '@/components/SortableTh';
import TemporalidadKpis from '@/components/TemporalidadKpis';
import { TemporalidadHeaders, TemporalidadCells, temporalidadColumnasExport, temporalidadSortValue } from '@/components/TemporalidadColumnas';

// Top N (oficina o entidad) para una lista ya filtrada (originales o
// retornos por separado) — hook independiente para no redefinir la
// función en cada render del componente.
function useResumenPorCampo(lista: Guia[], campo: (g: Guia) => string | null | undefined) {
  const datos = useMemo(() => topPorCampo(lista, campo, 10), [lista, campo]);
  const chart = useMemo(() => datos.map(({ key, count }) => ({ name: key, total: count })), [datos]);
  const orden = useSortableTable<{ key: string; count: number }>(datos, (item, key) => {
    if (key === 'nombre') return item.key;
    if (key === 'guias') return item.count;
    return null;
  });
  return { datos, chart, orden };
}

export default function AbiertasModule({ guias }: { guias: Guia[] }) {
  const [filtroEstado, setFiltroEstado] = useState('');
  const [bulkGuias, setBulkGuias] = useState<string[] | null>(null);
  const [seleccionadas, setSeleccionadas] = useState<Set<string>>(new Set());
  const [contactos, setContactos] = useState<ContactoOficina[]>([]);
  const [modalTipo, setModalTipo] = useState<TipoAccionMasiva | null>(null);
  const [modalAlertaDias, setModalAlertaDias] = useState(false);
  const [modalSemaforo, setModalSemaforo] = useState(false);
  const [guiasIndemnizadas, setGuiasIndemnizadas] = useState<Set<string>>(new Set());
  const [marcando, setMarcando] = useState(false);
  const [historialAlertas, setHistorialAlertas] = useState<AlertaGuiaEvento[]>([]);

  function recargarHistorialAlertas() {
    fetch('/api/alertas-guia')
      .then((r) => r.json())
      .then((j) => setHistorialAlertas(j.eventos || []));
  }

  async function cerrarCaso(guia: string) {
    if (!confirm(`¿Cerrar el caso de la guía ${guia}? Esto marca el historial de alertas como resuelto.`)) return;
    await fetch('/api/alertas-guia', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ guia, nivel: 'CERRADO' }),
    });
    recargarHistorialAlertas();
  }

  useEffect(() => {
    fetch('/api/contactos')
      .then((r) => r.json())
      .then((j) => setContactos(j.contactos || []));
    recargarHistorialAlertas();
  }, []);

  // Último evento registrado por guía (el arreglo viene ordenado
  // ascendente por creado_en, así que la última escritura al recorrerlo
  // gana — queda el evento más reciente de cada guía). Así, si una guía
  // reaparece en un corte nuevo, ya se sabe en qué nivel de alerta se
  // quedó, sin importar de qué carga venga ahora.
  // Por guía: cuántas alertas (no-cierre) tiene registradas, y si el
  // último evento fue un cierre de caso — el arreglo viene ordenado
  // ascendente por creado_en, así que recorrerlo en orden refleja la
  // secuencia real (si se reabre un caso con una alerta nueva DESPUÉS de
  // un cierre, vuelve a contar como abierto).
  const seguimientoPorGuia = useMemo(() => {
    const map = new Map<string, { alertas: number; cerrado: boolean }>();
    historialAlertas.forEach((ev) => {
      const actual = map.get(ev.guia) || { alertas: 0, cerrado: false };
      if (ev.nivel === 'CERRADO') {
        actual.cerrado = true;
      } else {
        actual.alertas += 1;
        actual.cerrado = false;
      }
      map.set(ev.guia, actual);
    });
    return map;
  }, [historialAlertas]);

  function cargarIndemnizadas() {
    fetch('/api/indemnizaciones')
      .then((r) => r.json())
      .then((j) => {
        const set = new Set<string>();
        (j.indemnizaciones || []).forEach((i: { guias: string[] }) => i.guias.forEach((g) => set.add(g)));
        setGuiasIndemnizadas(set);
      });
  }
  useEffect(cargarIndemnizadas, []);

  // Mismo criterio de elegibilidad que Acciones: no devoluciones, no entregadas,
  // no canceladas, no pre-documentadas (basado en estado puro, no Calificación)
  // + filtros locales de Región/Oficina/Tipo (independientes del filtro
  // global, para poder enfocar esta vista sin afectar el resto de módulos).
  const [filtroRegionLocal, setFiltroRegionLocal] = useState('');
  const [filtroOficinaLocal, setFiltroOficinaLocal] = useState('');
  const [filtroTipoLocal, setFiltroTipoLocal] = useState<'' | 'original' | 'retorno'>('');
  const [filtroCicloLocal, setFiltroCicloLocal] = useState<string[]>([]);

  const regionesDisponibles = useMemo(
    () => [...new Set(guias.map((g) => obtenerRegion(g.oficina_destino)))].sort(),
    [guias]
  );
  const oficinasDisponibles = useMemo(() => {
    const universo = filtroRegionLocal
      ? guias.filter((g) => obtenerRegion(g.oficina_destino) === filtroRegionLocal)
      : guias;
    return [...new Set(universo.map((g) => g.oficina_destino).filter(Boolean))].sort() as string[];
  }, [guias, filtroRegionLocal]);
  // Ciclos disponibles, en el orden real del pipeline (no alfabético) —
  // mismo criterio que ORDEN_CICLOS en el resto de la app.
  const ciclosDisponibles = useMemo(() => {
    const presentes = new Set(guias.map((g) => obtenerCiclo(g.estado_guia)));
    return ORDEN_CICLOS.filter((c) => presentes.has(c));
  }, [guias]);

  // Si cambia la región y la oficina elegida ya no pertenece a ella, se
  // limpia — evita quedar con una combinación imposible (0 resultados sin
  // que sea obvio por qué).
  useEffect(() => {
    if (filtroOficinaLocal && !oficinasDisponibles.includes(filtroOficinaLocal)) setFiltroOficinaLocal('');
  }, [oficinasDisponibles, filtroOficinaLocal]);

  const base = useMemo(
    () =>
      guias.filter((g) => {
        if (!isAbiertaPorEstado(g)) return false;
        if (filtroRegionLocal && obtenerRegion(g.oficina_destino) !== filtroRegionLocal) return false;
        if (filtroOficinaLocal && g.oficina_destino !== filtroOficinaLocal) return false;
        if (filtroTipoLocal === 'original' && esRetornoAmplio(g)) return false;
        if (filtroTipoLocal === 'retorno' && !esRetornoAmplio(g)) return false;
        if (filtroCicloLocal.length > 0 && !filtroCicloLocal.includes(obtenerCiclo(g.estado_guia))) return false;
        return true;
      }),
    [guias, filtroRegionLocal, filtroOficinaLocal, filtroTipoLocal, filtroCicloLocal]
  );

  // KPI por estado: conteo de guías abiertas por cada estado
  const kpisPorEstado = useMemo(() => {
    const counts: Record<string, number> = {};
    base.forEach((g) => {
      const e = g.estado_guia || 'SIN ESTADO';
      counts[e] = (counts[e] || 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [base]);

  // KPI Originales vs Retornos — "base" ya mezcla ambos tipos (igual que
  // la columna "Tipo" de la tabla); esto solo separa los conteos.
  // esRetornoAmplio() también trata como retorno cualquier oficina de
  // Región VIRTUAL (UPS *, QUIKEN, QUERETARO, CALL CENTER, REEXPEDICIONES).
  const listaOriginales = useMemo(
    () => base.filter((g) => !esRetornoAmplio(g)),
    [base]
  );
  const listaRetornos = useMemo(
    () => base.filter((g) => esRetornoAmplio(g)),
    [base]
  );
  const totalOriginales = listaOriginales.length;
  const totalRetornos = listaRetornos.length;

  // Resumen por oficina y por entidad, separado en Originales vs Retornos
  // (antes se mostraba todo mezclado en un solo gráfico).
  const oficinaOriginales = useResumenPorCampo(listaOriginales, (g) => g.oficina_destino);
  const oficinaRetornos = useResumenPorCampo(listaRetornos, (g) => g.oficina_destino);
  const entidadOriginales = useResumenPorCampo(listaOriginales, (g) => g.entidad_destinatario);
  const entidadRetornos = useResumenPorCampo(listaRetornos, (g) => g.entidad_destinatario);

  // Ciclo (etapa del pipeline: Entrada/Distribución/Recepción/Ruta/
  // Resguardo) y Región — sobre guías ORIGINALES únicamente (listaOriginales,
  // no `base`), igual que hace el KPI "Abiertas" del módulo Resumen (que usa
  // guiasOriginales = esGuiaOriginal, el cual excluye retornos). Si se
  // incluyeran retornos aquí, el total de este panel no cuadraría con el
  // de Resumen — mismo criterio ya corregido en Efectividad.
  const regionResumen = useResumenPorCampo(listaOriginales, (g) => obtenerRegion(g.oficina_destino));
  const abiertasPorCiclo = useMemo(() => {
    const grupos: Record<string, number> = {};
    listaOriginales.forEach((g) => {
      const ciclo = obtenerCiclo(g.estado_guia);
      grupos[ciclo] = (grupos[ciclo] || 0) + 1;
    });
    return ORDEN_CICLOS.filter((c) => grupos[c]).map((ciclo) => ({ name: ciclo, total: grupos[ciclo] }));
  }, [listaOriginales]);

  const filas = useMemo(() => {
    let f = base;
    if (filtroEstado) f = f.filter((g) => g.estado_guia === filtroEstado);
    if (bulkGuias && bulkGuias.length) {
      const set = new Set(bulkGuias.map((g) => g.toUpperCase()));
      f = f.filter((g) => set.has(g.guia.toUpperCase()));
    }
    return f.sort((a, b) => (b.dias_sin_movimiento || 0) - (a.dias_sin_movimiento || 0));
  }, [base, filtroEstado, bulkGuias]);

  function toggleAll(checked: boolean) {
    setSeleccionadas(checked ? new Set(filas.map((g) => g.guia)) : new Set());
  }
  function toggleOne(guia: string) {
    const next = new Set(seleccionadas);
    if (next.has(guia)) next.delete(guia);
    else next.add(guia);
    setSeleccionadas(next);
  }

  const guiasSeleccionadasObj = useMemo(
    () => filas.filter((g) => seleccionadas.has(g.guia)),
    [filas, seleccionadas]
  );

  // Crea UN caso de indemnización (folio nuevo) que cubre TODAS las guías
  // seleccionadas en este momento — igual que un robo o siniestro que
  // afecta varios paquetes juntos. Si se quieren casos separados, hay que
  // seleccionar y marcar de una en una. Los detalles (tipo de incidencia,
  // monto, etc.) se completan después en el módulo Indemnizaciones.
  async function marcarParaIndemnizacion() {
    if (!guiasSeleccionadasObj.length) return;
    setMarcando(true);
    try {
      const g0 = guiasSeleccionadasObj[0];
      const res = await fetch('/api/indemnizaciones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          guias: guiasSeleccionadasObj.map((g) => g.guia),
          cliente: g0.cliente || '',
          fecha: new Date().toISOString().slice(0, 10),
          fecha_mov: g0.f_historia || null,
          oficina: g0.oficina_destino || '',
          oficina_incidencia: g0.oficina_destino || '',
          estado: 'PENDIENTE',
        }),
      });
      if (!res.ok) {
        const j = await res.json();
        throw new Error(j.error || 'No se pudo marcar para indemnización');
      }
      cargarIndemnizadas();
      setSeleccionadas(new Set());
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al marcar para indemnización');
    } finally {
      setMarcando(false);
    }
  }

  const { sorted, sortKey, sortDir, requestSort } = useSortableTable<Guia>(filas, (g, key) => {
    switch (key) {
      case 'tipo':
        return esRetornoAmplio(g) ? 'Retorno' : 'Original';
      case 'guia':
        return g.guia;
      case 'cliente':
        return g.cliente;
      case 'estado':
        return g.estado_guia;
      case 'origen':
        return g.of_origen;
      case 'oficina':
        return g.oficina_destino;
      case 'entidad':
        return g.entidad_destinatario;
      case 'dias':
        return g.dias_sin_movimiento;
      case 'ultmov':
        return g.f_historia;
      case 'fechacreacion':
        return g.f_documentacion;
      case 'ciclo':
        return obtenerCiclo(g.estado_guia);
      case 'region':
        return obtenerRegion(g.oficina_destino);
      case 'ultimaexcepcion':
        return ultimaExcepcion(g).nombre;
      case 'fechaultimaexcepcion':
        return ultimaExcepcion(g).fecha;
      case 'accion':
        return accionEfectiva(g);
      default:
        return temporalidadSortValue(g, key);
    }
  });

  const columnasExport = [
    { header: 'Tipo', value: (g: Guia) => esRetornoAmplio(g) ? 'Retorno' : 'Original' },
    { header: 'Guía', value: (g: Guia) => g.guia },
    { header: 'Cliente', value: (g: Guia) => g.cliente || '' },
    { header: 'Estado', value: (g: Guia) => g.estado_guia || '' },
    { header: 'Origen', value: (g: Guia) => g.of_origen || '' },
    { header: 'Oficina Destino', value: (g: Guia) => g.oficina_destino || '' },
    { header: 'Entidad', value: (g: Guia) => g.entidad_destinatario || '' },
    { header: 'Región', value: (g: Guia) => obtenerRegion(g.oficina_destino) },
    { header: 'Ciclo', value: (g: Guia) => obtenerCiclo(g.estado_guia) },
    { header: 'Días sin Mov.', value: (g: Guia) => g.dias_sin_movimiento ?? '' },
    {
      header: 'Seguimiento',
      value: (g: Guia) => {
        const seg = seguimientoPorGuia.get(g.guia) || { alertas: 0, cerrado: false };
        return calcularEtiquetaSeguimiento(g.dias_sin_movimiento, seg.alertas, seg.cerrado).texto;
      },
    },
    { header: 'Últ. Mov.', value: (g: Guia) => g.f_historia || '' },
    { header: 'Última Excepción', value: (g: Guia) => ultimaExcepcion(g).nombre || '' },
    { header: 'Fecha Última Excepción', value: (g: Guia) => ultimaExcepcion(g).fecha || '' },
    { header: 'Acción a Seguir', value: (g: Guia) => accionEfectiva(g) || '' },
    { header: 'Fecha Creación', value: (g: Guia) => g.f_documentacion || '' },
    ...temporalidadColumnasExport(),
  ];

  return (
    <div className="p-5 space-y-4">
      <div className="bg-white border border-[var(--vg-border)] rounded-lg p-3 space-y-3">
        <div className="flex items-center gap-2.5 flex-wrap">
          <span className="text-[12px] font-semibold text-[var(--vg-text2)]">🔍 Filtrar esta vista:</span>
          <select
            value={filtroRegionLocal}
            onChange={(e) => setFiltroRegionLocal(e.target.value)}
            className="text-[12px] border border-[var(--vg-border)] rounded-md px-2.5 py-1.5 bg-white"
          >
            <option value="">Todas las regiones</option>
            {regionesDisponibles.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <select
            value={filtroOficinaLocal}
            onChange={(e) => setFiltroOficinaLocal(e.target.value)}
            className="text-[12px] border border-[var(--vg-border)] rounded-md px-2.5 py-1.5 bg-white"
          >
            <option value="">Todas las oficinas</option>
            {oficinasDisponibles.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
          <select
            value={filtroTipoLocal}
            onChange={(e) => setFiltroTipoLocal(e.target.value as '' | 'original' | 'retorno')}
            className="text-[12px] border border-[var(--vg-border)] rounded-md px-2.5 py-1.5 bg-white"
          >
            <option value="">Originales y Retornos</option>
            <option value="original">Solo Originales</option>
            <option value="retorno">Solo Retornos</option>
          </select>
          <SelectorMultiple
            opciones={ciclosDisponibles}
            seleccionados={filtroCicloLocal}
            onChange={setFiltroCicloLocal}
            etiquetaTodos="Todos los ciclos"
          />
          {(filtroRegionLocal || filtroOficinaLocal || filtroTipoLocal || filtroCicloLocal.length > 0 || filtroEstado || bulkGuias) && (
            <button
              onClick={() => {
                setFiltroRegionLocal('');
                setFiltroOficinaLocal('');
                setFiltroTipoLocal('');
                setFiltroCicloLocal([]);
                setFiltroEstado('');
                setBulkGuias(null);
              }}
              className="text-[12px] font-semibold text-[var(--vg-text2)] border border-[var(--vg-border)] rounded-md px-2.5 py-1.5 hover:bg-[var(--vg-bg)]"
            >
              ✕ Limpiar
            </button>
          )}
        </div>

        <BulkSearch onSearch={setBulkGuias} onClear={() => setBulkGuias(null)} activo={!!bulkGuias} />

        <div className="flex items-center gap-2 flex-wrap overflow-x-auto vg-scroll">
          <span className="text-[11px] font-bold text-[var(--vg-text2)] whitespace-nowrap">Por estado:</span>
          <button
            onClick={() => setFiltroEstado('')}
            className={`text-[10.5px] font-semibold rounded-full px-2.5 py-1 whitespace-nowrap ${
              !filtroEstado ? 'bg-[var(--vg-blue)] text-white' : 'border border-[var(--vg-border)] text-[var(--vg-text2)] hover:bg-[var(--vg-bg)]'
            }`}
          >
            Todos <span className="font-bold">{base.length}</span>
          </button>
          {kpisPorEstado.map(([estado, n]) => (
            <button
              key={estado}
              onClick={() => setFiltroEstado(estado === filtroEstado ? '' : estado)}
              className={`text-[10.5px] font-semibold rounded-full px-2.5 py-1 whitespace-nowrap ${
                filtroEstado === estado
                  ? 'bg-[var(--vg-blue)] text-white'
                  : 'border border-[var(--vg-border)] text-[var(--vg-text2)] hover:bg-[var(--vg-bg)]'
              }`}
            >
              {estado} <span className="font-bold">{n}</span>
            </button>
          ))}
        </div>
      </div>

      <TemporalidadKpis guias={listaOriginales} variante="abiertas" />

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-lg border border-[var(--vg-border)] p-3">
          <div className="text-[10.5px] font-semibold text-[var(--vg-text2)] mb-1">Originales</div>
          <div className="text-2xl font-bold text-[var(--vg-blue)]">{totalOriginales.toLocaleString('es-MX')}</div>
          <div className="text-[10.5px] text-[var(--vg-text3)]">
            {base.length ? ((totalOriginales / base.length) * 100).toFixed(1) : '0.0'}% del total abierto
          </div>
        </div>
        <div className="bg-white rounded-lg border border-[var(--vg-border)] p-3">
          <div className="text-[10.5px] font-semibold text-[var(--vg-text2)] mb-1">Retornos</div>
          <div className="text-2xl font-bold text-[var(--vg-purple)]">{totalRetornos.toLocaleString('es-MX')}</div>
          <div className="text-[10.5px] text-[var(--vg-text3)]">
            {base.length ? ((totalRetornos / base.length) * 100).toFixed(1) : '0.0'}% del total abierto
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-lg border border-[var(--vg-border)] p-4">
          <div className="font-bold text-[12.5px] mb-3">Por Ciclo (etapa del proceso) — Originales</div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={abiertasPorCiclo} margin={{ bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" fontSize={11} />
              <YAxis fontSize={11} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="total" fill="#1E3A8A" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <div className="overflow-x-auto vg-scroll mt-3 max-h-[180px]">
            <table className="vg-table">
              <thead>
                <tr>
                  <th>Ciclo</th>
                  <th>Guías</th>
                  <th>%</th>
                </tr>
              </thead>
              <tbody>
                {abiertasPorCiclo.map(({ name, total }) => (
                  <tr key={name}>
                    <td className="font-medium">{name}</td>
                    <td>{total.toLocaleString('es-MX')}</td>
                    <td>{base.length ? `${((total / base.length) * 100).toFixed(1)}%` : '—'}</td>
                  </tr>
                ))}
                {!abiertasPorCiclo.length && (
                  <tr>
                    <td colSpan={3} className="text-center text-[var(--vg-text3)] py-4">
                      Sin guías en este corte
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-[var(--vg-border)] p-4">
          <div className="font-bold text-[12.5px] mb-3">Por Región — Originales</div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={regionResumen.chart} layout="vertical" margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" fontSize={11} allowDecimals={false} />
              <YAxis type="category" dataKey="name" width={110} fontSize={10} />
              <Tooltip />
              <Bar dataKey="total" fill="#0B9B67" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <div className="overflow-x-auto vg-scroll mt-3 max-h-[180px]">
            <table className="vg-table">
              <thead>
                <tr>
                  <SortableTh label="Región" sortKey="nombre" currentKey={regionResumen.orden.sortKey} currentDir={regionResumen.orden.sortDir} onSort={regionResumen.orden.requestSort} />
                  <SortableTh label="Guías" sortKey="guias" currentKey={regionResumen.orden.sortKey} currentDir={regionResumen.orden.sortDir} onSort={regionResumen.orden.requestSort} />
                </tr>
              </thead>
              <tbody>
                {regionResumen.orden.sorted.map(({ key, count }) => (
                  <tr key={key}>
                    <td className="font-medium">{key}</td>
                    <td>{count.toLocaleString('es-MX')}</td>
                  </tr>
                ))}
                {!regionResumen.datos.length && (
                  <tr>
                    <td colSpan={2} className="text-center text-[var(--vg-text3)] py-4">
                      Sin guías en este corte
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {[
          { titulo: 'Por Oficina — Originales', col: 'Oficina', resumen: oficinaOriginales, color: '#1E3A8A' },
          { titulo: 'Por Oficina — Retornos', col: 'Oficina', resumen: oficinaRetornos, color: '#7C3AED' },
          { titulo: 'Por Entidad — Originales', col: 'Entidad', resumen: entidadOriginales, color: '#0891B2' },
          { titulo: 'Por Entidad — Retornos', col: 'Entidad', resumen: entidadRetornos, color: '#B45309' },
        ].map(({ titulo, col, resumen, color }) => (
          <div key={titulo} className="bg-white rounded-lg border border-[var(--vg-border)] p-4">
            <div className="font-bold text-[12.5px] mb-3">{titulo}</div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={resumen.chart} layout="vertical" margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" fontSize={11} allowDecimals={false} />
                <YAxis type="category" dataKey="name" width={120} fontSize={10} />
                <Tooltip />
                <Bar dataKey="total" fill={color} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
            <div className="overflow-x-auto vg-scroll mt-3 max-h-[220px]">
              <table className="vg-table">
                <thead>
                  <tr>
                    <SortableTh label={col} sortKey="nombre" currentKey={resumen.orden.sortKey} currentDir={resumen.orden.sortDir} onSort={resumen.orden.requestSort} />
                    <SortableTh label="Guías" sortKey="guias" currentKey={resumen.orden.sortKey} currentDir={resumen.orden.sortDir} onSort={resumen.orden.requestSort} />
                  </tr>
                </thead>
                <tbody>
                  {resumen.orden.sorted.map(({ key, count }) => (
                    <tr key={key}>
                      <td className="font-medium">{key}</td>
                      <td>{count.toLocaleString('es-MX')}</td>
                    </tr>
                  ))}
                  {!resumen.datos.length && (
                    <tr>
                      <td colSpan={2} className="text-center text-[var(--vg-text3)] py-4">
                        Sin guías en este corte
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-lg border border-[var(--vg-border)] overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--vg-border)] flex items-center justify-between flex-wrap gap-2">
          <div>
            <div className="font-bold text-[13px]">Guías Abiertas / En Tránsito</div>
            <div className="text-[11px] text-[var(--vg-text2)]">
              No entregada, devuelta, cancelada ni pre-documentada · {filas.length.toLocaleString('es-MX')} guías
              {seleccionadas.size > 0 && ` · ${seleccionadas.size} seleccionadas`}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => exportToExcel(filas, columnasExport, 'Abiertas')}
              className="text-[11px] font-semibold text-[var(--vg-text2)] border border-[var(--vg-border)] rounded-md px-2.5 py-1.5 bg-white"
            >
              ⬇ Excel
            </button>
            <button
              onClick={() => exportToPDF(filas, columnasExport, 'Abiertas')}
              className="text-[11px] font-semibold text-[var(--vg-text2)] border border-[var(--vg-border)] rounded-md px-2.5 py-1.5 bg-white"
            >
              🖨 PDF
            </button>
          </div>
        </div>

        {seleccionadas.size > 0 && (
          <div className="px-4 py-2.5 border-b border-[var(--vg-border)] bg-[var(--vg-blue-light)] flex items-center gap-2 flex-wrap">
            <span className="text-[11.5px] font-bold text-[var(--vg-blue)]">
              {seleccionadas.size} guía(s) seleccionadas:
            </span>
            <button
              onClick={() => setModalTipo('DEVOLVER')}
              className="text-[11.5px] font-semibold text-white bg-[#7F1D1D] rounded-md px-3 py-1"
            >
              ↩ Autorizar devolución
            </button>
            <button
              onClick={() => setModalTipo('REPROGRAMAR')}
              className="text-[11.5px] font-semibold text-white bg-[#1E3A8A] rounded-md px-3 py-1"
            >
              🔄 Reprogramar
            </button>
            <button
              onClick={() => setModalAlertaDias(true)}
              className="text-[11.5px] font-semibold text-white bg-[#EA7C1A] rounded-md px-3 py-1"
            >
              ⏰ Alerta sin movimiento
            </button>
            <button
              onClick={() => setModalSemaforo(true)}
              className="text-[11.5px] font-semibold text-white bg-[#7C3AED] rounded-md px-3 py-1"
            >
              🚦 Notificar Semáforo
            </button>
            <button
              onClick={marcarParaIndemnizacion}
              disabled={marcando}
              className="text-[11.5px] font-semibold text-white bg-[#B45309] rounded-md px-3 py-1 disabled:opacity-50"
            >
              🏷️ {marcando ? 'Marcando...' : 'Marcar para Indemnización'}
            </button>
            <button
              onClick={() => setSeleccionadas(new Set())}
              className="text-[11.5px] font-semibold text-[var(--vg-text2)] border border-[var(--vg-border)] rounded-md px-3 py-1 bg-white"
            >
              Quitar selección
            </button>
          </div>
        )}

        <div className="max-h-[600px] overflow-y-auto vg-scroll">
          <table className="vg-table">
            <thead>
              <tr>
                <th>
                  <input
                    type="checkbox"
                    checked={filas.length > 0 && seleccionadas.size === filas.length}
                    onChange={(e) => toggleAll(e.target.checked)}
                  />
                </th>
                <SortableTh label="Tipo" sortKey="tipo" currentKey={sortKey} currentDir={sortDir} onSort={requestSort} />
                <SortableTh label="Guía" sortKey="guia" currentKey={sortKey} currentDir={sortDir} onSort={requestSort} />
                <SortableTh label="Cliente" sortKey="cliente" currentKey={sortKey} currentDir={sortDir} onSort={requestSort} />
                <SortableTh label="Estado" sortKey="estado" currentKey={sortKey} currentDir={sortDir} onSort={requestSort} />
                <SortableTh label="Origen" sortKey="origen" currentKey={sortKey} currentDir={sortDir} onSort={requestSort} />
                <SortableTh label="Oficina Destino" sortKey="oficina" currentKey={sortKey} currentDir={sortDir} onSort={requestSort} />
                <SortableTh label="Entidad" sortKey="entidad" currentKey={sortKey} currentDir={sortDir} onSort={requestSort} />
                <SortableTh label="Región" sortKey="region" currentKey={sortKey} currentDir={sortDir} onSort={requestSort} />
                <SortableTh label="Ciclo" sortKey="ciclo" currentKey={sortKey} currentDir={sortDir} onSort={requestSort} />
                <SortableTh label="Días sin Mov." sortKey="dias" currentKey={sortKey} currentDir={sortDir} onSort={requestSort} />
                <th>Seguimiento</th>
                <SortableTh label="Últ. Mov." sortKey="ultmov" currentKey={sortKey} currentDir={sortDir} onSort={requestSort} />
                <SortableTh label="Última Excepción" sortKey="ultimaexcepcion" currentKey={sortKey} currentDir={sortDir} onSort={requestSort} />
                <SortableTh label="Fecha Últ. Excepción" sortKey="fechaultimaexcepcion" currentKey={sortKey} currentDir={sortDir} onSort={requestSort} />
                <SortableTh label="Acción a Seguir" sortKey="accion" currentKey={sortKey} currentDir={sortDir} onSort={requestSort} />
                <SortableTh label="Fecha Creación" sortKey="fechacreacion" currentKey={sortKey} currentDir={sortDir} onSort={requestSort} />
                <TemporalidadHeaders sortKey={sortKey} sortDir={sortDir} onSort={requestSort} />
              </tr>
            </thead>
            <tbody>
              {sorted.map((g) => {
                const esRetorno = esRetornoAmplio(g);
                const ultExc = ultimaExcepcion(g);
                return (
                <tr key={g.id}>
                  <td>
                    <input
                      type="checkbox"
                      checked={seleccionadas.has(g.guia)}
                      onChange={() => toggleOne(g.guia)}
                    />
                  </td>
                  <td>
                    {esRetorno ? (
                      <span className="text-[10px] font-bold text-white bg-[var(--vg-purple)] rounded-full px-1.5 py-0.5">
                        Retorno
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold text-white bg-[var(--vg-blue)] rounded-full px-1.5 py-0.5">
                        Original
                      </span>
                    )}
                    {guiasIndemnizadas.has(g.guia) && (
                      <span className="ml-1 text-[10px] font-bold text-white bg-[#B45309] rounded-full px-1.5 py-0.5">
                        🏷️ Indemnización
                      </span>
                    )}
                  </td>
                  <td className="font-mono font-semibold">{g.guia}</td>
                  <td>{g.cliente || '—'}</td>
                  <td>{g.estado_guia}</td>
                  <td>{g.of_origen || '—'}</td>
                  <td>{g.oficina_destino || '—'}</td>
                  <td>{g.entidad_destinatario || '—'}</td>
                  <td>{obtenerRegion(g.oficina_destino)}</td>
                  <td>{obtenerCiclo(g.estado_guia)}</td>
                  <td>
                    <div className="flex flex-col items-start gap-0.5">
                      <span className={g.dias_sin_movimiento && g.dias_sin_movimiento > 5 ? 'text-[var(--vg-red)] font-bold' : ''}>
                        {g.dias_sin_movimiento !== null ? `${g.dias_sin_movimiento}d` : '—'}
                      </span>
                      <AlertaDiasBadge dias={g.dias_sin_movimiento} />
                    </div>
                  </td>
                  <td>
                    {(() => {
                      const seg = seguimientoPorGuia.get(g.guia) || { alertas: 0, cerrado: false };
                      const etiqueta = calcularEtiquetaSeguimiento(g.dias_sin_movimiento, seg.alertas, seg.cerrado);
                      const semaforo = calcularSemaforoGuia(g.dias_sin_movimiento);
                      return (
                        <div className="flex items-center gap-1">
                          <span
                            title={
                              seg.alertas > 0 || seg.cerrado
                                ? 'Basado en alertas realmente registradas'
                                : `Sugerido según días sin movimiento (no cuenta como enviado): ${semaforo.accion} · Responsable: ${semaforo.responsable}`
                            }
                            className="inline-block text-[9.5px] font-bold text-white px-1.5 py-[2px] rounded whitespace-nowrap"
                            style={{ backgroundColor: etiqueta.color }}
                          >
                            {etiqueta.texto}
                          </span>
                          {seg.alertas > 0 && !seg.cerrado && (
                            <button
                              onClick={() => cerrarCaso(g.guia)}
                              className="text-[9.5px] font-semibold text-[var(--vg-text2)] border border-[var(--vg-border)] rounded px-1 py-0.5 hover:bg-[var(--vg-bg)]"
                              title="Cerrar caso"
                            >
                              ✕ Cerrar
                            </button>
                          )}
                        </div>
                      );
                    })()}
                  </td>
                  <td>{g.f_historia || '—'}</td>
                  <td>{ultExc.nombre || '—'}</td>
                  <td>{ultExc.fecha || '—'}</td>
                  <td>{accionEfectiva(g) || '—'}</td>
                  <td>{g.f_documentacion || '—'}</td>
                  <TemporalidadCells guia={g} />
                </tr>
                );
              })}
              {!filas.length && (
                <tr>
                  <td colSpan={24} className="text-center text-[var(--vg-text3)] py-6">
                    No hay guías abiertas con este filtro
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modalTipo && (
        <AccionMasivaModal
          open={!!modalTipo}
          onClose={() => setModalTipo(null)}
          tipo={modalTipo}
          guiasSeleccionadas={guiasSeleccionadasObj}
          contactos={contactos}
          onCompletado={() => setSeleccionadas(new Set())}
        />
      )}

      {modalAlertaDias && (
        <AlertaSinMovimientoModal
          open={modalAlertaDias}
          onClose={() => setModalAlertaDias(false)}
          guiasSeleccionadas={guiasSeleccionadasObj}
          contactos={contactos}
          onCompletado={() => setSeleccionadas(new Set())}
        />
      )}

      {modalSemaforo && (
        <SemaforoAlertaModal
          open={modalSemaforo}
          onClose={() => setModalSemaforo(false)}
          guiasSeleccionadas={guiasSeleccionadasObj}
          contactos={contactos}
          onCompletado={() => {
            setSeleccionadas(new Set());
            recargarHistorialAlertas();
          }}
        />
      )}
    </div>
  );
}
