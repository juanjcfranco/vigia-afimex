'use client';

import { useEffect, useMemo, useState } from 'react';
import { Guia, ContactoOficina } from '@/lib/types';
import { isAbiertaPorEstado, topPorCampo } from '@/lib/business-logic';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import BulkSearch from '@/components/BulkSearch';
import AlertaDiasBadge from '@/components/AlertaDiasBadge';
import AccionMasivaModal, { TipoAccionMasiva } from '@/components/AccionMasivaModal';
import AlertaSinMovimientoModal from '@/components/AlertaSinMovimientoModal';
import { exportToExcel, exportToPDF } from '@/lib/export';
import { useSortableTable } from '@/lib/useSortableTable';
import SortableTh from '@/components/SortableTh';

export default function AbiertasModule({ guias }: { guias: Guia[] }) {
  const [filtroEstado, setFiltroEstado] = useState('');
  const [bulkGuias, setBulkGuias] = useState<string[] | null>(null);
  const [seleccionadas, setSeleccionadas] = useState<Set<string>>(new Set());
  const [contactos, setContactos] = useState<ContactoOficina[]>([]);
  const [modalTipo, setModalTipo] = useState<TipoAccionMasiva | null>(null);
  const [modalAlertaDias, setModalAlertaDias] = useState(false);

  useEffect(() => {
    fetch('/api/contactos')
      .then((r) => r.json())
      .then((j) => setContactos(j.contactos || []));
  }, []);

  // Mismo criterio de elegibilidad que Acciones: no devoluciones, no entregadas,
  // no canceladas, no pre-documentadas (basado en estado puro, no Calificación)
  const base = useMemo(() => guias.filter((g) => isAbiertaPorEstado(g)), [guias]);

  const estados = useMemo(
    () => [...new Set(base.map((g) => g.estado_guia).filter(Boolean))] as string[],
    [base]
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
  const totalOriginales = useMemo(
    () => base.filter((g) => !g.es_retorno && !g.es_posible_retorno_otro_periodo).length,
    [base]
  );
  const totalRetornos = useMemo(
    () => base.filter((g) => g.es_retorno || g.es_posible_retorno_otro_periodo).length,
    [base]
  );

  // Resumen por oficina (top 10), para saber dónde se concentran las
  // guías abiertas — incluye tanto originales como retornos, igual que
  // la tabla principal.
  const porOficina = useMemo(() => topPorCampo(base, (g) => g.oficina_destino, 10), [base]);
  const porOficinaChart = useMemo(
    () => porOficina.map(({ key, count }) => ({ name: key, total: count })),
    [porOficina]
  );
  const porOficinaOrden = useSortableTable<{ key: string; count: number }>(porOficina, (item, key) => {
    if (key === 'oficina') return item.key;
    if (key === 'guias') return item.count;
    return null;
  });

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

  const { sorted, sortKey, sortDir, requestSort } = useSortableTable<Guia>(filas, (g, key) => {
    switch (key) {
      case 'tipo':
        return g.es_retorno || g.es_posible_retorno_otro_periodo ? 'Retorno' : 'Original';
      case 'guia':
        return g.guia;
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
      default:
        return null;
    }
  });

  const columnasExport = [
    { header: 'Tipo', value: (g: Guia) => (g.es_retorno || g.es_posible_retorno_otro_periodo) ? 'Retorno' : 'Original' },
    { header: 'Guía', value: (g: Guia) => g.guia },
    { header: 'Estado', value: (g: Guia) => g.estado_guia || '' },
    { header: 'Origen', value: (g: Guia) => g.of_origen || '' },
    { header: 'Oficina Destino', value: (g: Guia) => g.oficina_destino || '' },
    { header: 'Entidad', value: (g: Guia) => g.entidad_destinatario || '' },
    { header: 'Días sin Mov.', value: (g: Guia) => g.dias_sin_movimiento ?? '' },
    { header: 'Últ. Mov.', value: (g: Guia) => g.f_historia || '' },
    { header: 'Fecha Creación', value: (g: Guia) => g.f_documentacion || '' },
  ];

  return (
    <div className="p-5 space-y-4">
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

      <div className="bg-white rounded-lg border border-[var(--vg-border)] p-4">
        <div className="font-bold text-[12.5px] mb-3">Resumen por Oficina</div>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={porOficinaChart} layout="vertical" margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" fontSize={11} />
            <YAxis type="category" dataKey="name" width={130} fontSize={10} />
            <Tooltip />
            <Bar dataKey="total" fill="#1E3A8A" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
        <div className="overflow-x-auto vg-scroll mt-3">
          <table className="vg-table">
            <thead>
              <tr>
                <SortableTh label="Oficina" sortKey="oficina" currentKey={porOficinaOrden.sortKey} currentDir={porOficinaOrden.sortDir} onSort={porOficinaOrden.requestSort} />
                <SortableTh label="Guías Abiertas" sortKey="guias" currentKey={porOficinaOrden.sortKey} currentDir={porOficinaOrden.sortDir} onSort={porOficinaOrden.requestSort} />
              </tr>
            </thead>
            <tbody>
              {porOficinaOrden.sorted.map(({ key, count }) => (
                <tr key={key}>
                  <td className="font-medium">{key}</td>
                  <td>{count.toLocaleString('es-MX')}</td>
                </tr>
              ))}
              {!porOficina.length && (
                <tr>
                  <td colSpan={2} className="text-center text-[var(--vg-text3)] py-4">
                    Sin guías abiertas en este corte
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
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
            <select
              value={filtroEstado}
              onChange={(e) => setFiltroEstado(e.target.value)}
              className="text-[12px] border border-[var(--vg-border)] rounded-md px-2.5 py-1.5"
            >
              <option value="">Todos los estados</option>
              {estados.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </select>
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
              onClick={() => setSeleccionadas(new Set())}
              className="text-[11.5px] font-semibold text-[var(--vg-text2)] border border-[var(--vg-border)] rounded-md px-3 py-1 bg-white"
            >
              Quitar selección
            </button>
          </div>
        )}

        <BulkSearch onSearch={setBulkGuias} onClear={() => setBulkGuias(null)} activo={!!bulkGuias} />

        <div className="px-4 py-2.5 border-b border-[var(--vg-border)] flex items-center gap-2 flex-wrap overflow-x-auto vg-scroll">
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
                <SortableTh label="Estado" sortKey="estado" currentKey={sortKey} currentDir={sortDir} onSort={requestSort} />
                <SortableTh label="Origen" sortKey="origen" currentKey={sortKey} currentDir={sortDir} onSort={requestSort} />
                <SortableTh label="Oficina Destino" sortKey="oficina" currentKey={sortKey} currentDir={sortDir} onSort={requestSort} />
                <SortableTh label="Entidad" sortKey="entidad" currentKey={sortKey} currentDir={sortDir} onSort={requestSort} />
                <SortableTh label="Días sin Mov." sortKey="dias" currentKey={sortKey} currentDir={sortDir} onSort={requestSort} />
                <SortableTh label="Últ. Mov." sortKey="ultmov" currentKey={sortKey} currentDir={sortDir} onSort={requestSort} />
                <SortableTh label="Fecha Creación" sortKey="fechacreacion" currentKey={sortKey} currentDir={sortDir} onSort={requestSort} />
              </tr>
            </thead>
            <tbody>
              {sorted.map((g) => {
                const esRetorno = g.es_retorno || g.es_posible_retorno_otro_periodo;
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
                  </td>
                  <td className="font-mono font-semibold">{g.guia}</td>
                  <td>{g.estado_guia}</td>
                  <td>{g.of_origen || '—'}</td>
                  <td>{g.oficina_destino || '—'}</td>
                  <td>{g.entidad_destinatario || '—'}</td>
                  <td>
                    <div className="flex flex-col items-start gap-0.5">
                      <span className={g.dias_sin_movimiento && g.dias_sin_movimiento > 5 ? 'text-[var(--vg-red)] font-bold' : ''}>
                        {g.dias_sin_movimiento !== null ? `${g.dias_sin_movimiento}d` : '—'}
                      </span>
                      <AlertaDiasBadge dias={g.dias_sin_movimiento} />
                    </div>
                  </td>
                  <td>{g.f_historia || '—'}</td>
                  <td>{g.f_documentacion || '—'}</td>
                </tr>
                );
              })}
              {!filas.length && (
                <tr>
                  <td colSpan={10} className="text-center text-[var(--vg-text3)] py-6">
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
    </div>
  );
}
