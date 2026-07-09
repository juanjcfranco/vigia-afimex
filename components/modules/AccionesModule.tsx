'use client';

import { useEffect, useMemo, useState } from 'react';
import { Guia, ContactoOficina, ACCION_COLORS } from '@/lib/types';
import { isEntregada, isCancelada, isEnRuta, nivelAlertaPorDias, accionEfectiva } from '@/lib/business-logic';
import AccionBadge from '@/components/AccionBadge';
import AlertaDiasBadge from '@/components/AlertaDiasBadge';
import BulkSearch from '@/components/BulkSearch';
import AccionMasivaModal, { TipoAccionMasiva } from '@/components/AccionMasivaModal';
import AlertaSinMovimientoModal from '@/components/AlertaSinMovimientoModal';
import AlertaCriticaModal from '@/components/AlertaCriticaModal';
import { exportToExcel, exportToPDF } from '@/lib/export';
import { useSortableTable } from '@/lib/useSortableTable';
import SortableTh from '@/components/SortableTh';

export default function AccionesModule({ guias }: { guias: Guia[] }) {
  const [filtroAccion, setFiltroAccion] = useState('');
  const [bulkGuias, setBulkGuias] = useState<string[] | null>(null);
  const [seleccionadas, setSeleccionadas] = useState<Set<string>>(new Set());
  const [contactos, setContactos] = useState<ContactoOficina[]>([]);
  const [modalTipo, setModalTipo] = useState<TipoAccionMasiva | null>(null);
  const [modalAlertaDias, setModalAlertaDias] = useState(false);
  const [modalCritico, setModalCritico] = useState(false);

  useEffect(() => {
    fetch('/api/contactos')
      .then((r) => r.json())
      .then((j) => setContactos(j.contactos || []));
  }, []);

  const base = useMemo(() => {
    return guias.filter((g) => {
      if (g.es_predoc) return false;
      if (g.es_devolucion) return false;
      if (isEntregada(g.estado_guia)) return false;
      if (isCancelada(g.estado_guia)) return false;
      if (isEnRuta(g.estado_guia)) return false;
      // Con excepción y acción del catálogo, o sin excepción pero con
      // suficientes días sin movimiento como para necesitar atención de
      // todos modos (ver accionEfectiva en business-logic.ts).
      return !!accionEfectiva(g);
    });
  }, [guias]);

  const acciones = useMemo(
    () => [...new Set(base.map((g) => accionEfectiva(g)).filter(Boolean))] as string[],
    [base]
  );

  const kpisPorAccion = useMemo(() => {
    const counts: Record<string, number> = {};
    base.forEach((g) => {
      const a = accionEfectiva(g);
      if (a) counts[a] = (counts[a] || 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [base]);

  // Guías en estado crítico (14+ días sin movimiento)
  const guiasCriticas = useMemo(
    () => base.filter((g) => nivelAlertaPorDias(g.dias_sin_movimiento).nivel === 'critico'),
    [base]
  );

  const filas = useMemo(() => {
    let f = base;
    if (filtroAccion) f = f.filter((g) => accionEfectiva(g) === filtroAccion);
    if (bulkGuias && bulkGuias.length) {
      const set = new Set(bulkGuias.map((g) => g.toUpperCase()));
      f = f.filter((g) => set.has(g.guia.toUpperCase()));
    }
    return f.sort((a, b) => (b.dias_sin_movimiento || 0) - (a.dias_sin_movimiento || 0));
  }, [base, filtroAccion, bulkGuias]);

  // "DEVOLVER" no es elegible para reprogramar
  const puedeReprogramar = (g: Guia) => g.accion_recomendada !== 'DEVOLVER' && g.accion_recomendada !== 'DEVOLVER_COD';

  function toggleAll(checked: boolean) {
    setSeleccionadas(checked ? new Set(filas.map((g) => g.guia)) : new Set());
  }
  function toggleOne(guia: string, accion: string | null) {
    const next = new Set(seleccionadas);
    if (next.has(guia)) next.delete(guia);
    else next.add(guia);
    setSeleccionadas(next);
  }

  const guiasSeleccionadasObj = useMemo(
    () => filas.filter((g) => seleccionadas.has(g.guia)),
    [filas, seleccionadas]
  );

  // Para Reprogramar: solo las que NO son DEVOLVER
  const guiasParaReprogramar = useMemo(
    () => guiasSeleccionadasObj.filter(puedeReprogramar),
    [guiasSeleccionadasObj]
  );

  const { sorted, sortKey, sortDir, requestSort } = useSortableTable<Guia>(filas, (g, key) => {
    switch (key) {
      case 'guia':
        return g.guia;
      case 'estado':
        return g.estado_guia;
      case 'oficina':
        return g.oficina_destino;
      case 'entidad':
        return g.entidad_destinatario;
      case 'dias':
        return g.dias_sin_movimiento;
      case 'ultmov':
        return g.f_historia;
      case 'accion':
        return accionEfectiva(g);
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
      default:
        return null;
    }
  });

  const columnasExport = [
    { header: 'Guía', value: (g: Guia) => g.guia },
    { header: 'Estado', value: (g: Guia) => g.estado_guia || '' },
    { header: 'Oficina', value: (g: Guia) => g.oficina_destino || '' },
    { header: 'Entidad', value: (g: Guia) => g.entidad_destinatario || '' },
    { header: 'Días sin Mov.', value: (g: Guia) => g.dias_sin_movimiento ?? '' },
    { header: 'Últ. Mov.', value: (g: Guia) => g.f_historia || '' },
    { header: 'Acción', value: (g: Guia) => accionEfectiva(g) },
    { header: 'Exc.1', value: (g: Guia) => g.excepcion_1 || '' },
    { header: 'Exc.2', value: (g: Guia) => g.excepcion_2 || '' },
    { header: 'Exc.3', value: (g: Guia) => g.excepcion_3 || '' },
    { header: 'Exc.4', value: (g: Guia) => g.excepcion_4 || '' },
    { header: 'Exc.5', value: (g: Guia) => g.excepcion_5 || '' },
  ];

  return (
    <div className="p-5">
      <div className="bg-white rounded-lg border border-[var(--vg-border)] overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--vg-border)] flex items-center justify-between flex-wrap gap-2">
          <div>
            <div className="font-bold text-[13px]">Acciones a Seguir</div>
            <div className="text-[11px] text-[var(--vg-text2)]">
              Excluye devoluciones, entregadas, canceladas, en ruta y pre-documentadas ·{' '}
              {filas.length.toLocaleString('es-MX')} guías
              {seleccionadas.size > 0 && ` · ${seleccionadas.size} seleccionadas`}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Botón Estado Crítico siempre visible si hay guías críticas */}
            {guiasCriticas.length > 0 && (
              <button
                onClick={() => setModalCritico(true)}
                className="text-[11.5px] font-bold text-white bg-[#DC2626] rounded-md px-3 py-1.5 animate-pulse"
              >
                🚨 Estado Crítico ({guiasCriticas.length})
              </button>
            )}
            <select
              value={filtroAccion}
              onChange={(e) => setFiltroAccion(e.target.value)}
              className="text-[12px] border border-[var(--vg-border)] rounded-md px-2.5 py-1.5"
            >
              <option value="">Todas las acciones</option>
              {acciones.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
            <button
              onClick={() => exportToExcel(filas, columnasExport, 'Acciones')}
              className="text-[11px] font-semibold text-[var(--vg-text2)] border border-[var(--vg-border)] rounded-md px-2.5 py-1.5 bg-white"
            >
              ⬇ Excel
            </button>
            <button
              onClick={() => exportToPDF(filas, columnasExport, 'Acciones')}
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
            {/* Reprogramar: solo si hay al menos 1 guía elegible (no DEVOLVER) */}
            {guiasParaReprogramar.length > 0 && (
              <button
                onClick={() => setModalTipo('REPROGRAMAR')}
                className="text-[11.5px] font-semibold text-white bg-[#1E3A8A] rounded-md px-3 py-1"
              >
                🔄 Reprogramar ({guiasParaReprogramar.length})
              </button>
            )}
            <button
              onClick={() => setModalTipo('DEVOLVER')}
              className="text-[11.5px] font-semibold text-white bg-[#7F1D1D] rounded-md px-3 py-1"
            >
              ↩ Devolver
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
          <span className="text-[11px] font-bold text-[var(--vg-text2)] whitespace-nowrap">Por acción:</span>
          <button
            onClick={() => setFiltroAccion('')}
            className={`text-[10.5px] font-semibold rounded-full px-2.5 py-1 whitespace-nowrap ${
              !filtroAccion ? 'bg-[var(--vg-blue)] text-white' : 'border border-[var(--vg-border)] text-[var(--vg-text2)] hover:bg-[var(--vg-bg)]'
            }`}
          >
            Todas <span className="font-bold">{base.length}</span>
          </button>
          {kpisPorAccion.map(([accion, n]) => {
            const color = ACCION_COLORS[accion] || '#6B7280';
            const activo = filtroAccion === accion;
            return (
              <button
                key={accion}
                onClick={() => setFiltroAccion(accion === filtroAccion ? '' : accion)}
                className="text-[10.5px] font-bold rounded-full px-2.5 py-1 whitespace-nowrap text-white"
                style={{ backgroundColor: color, opacity: activo || !filtroAccion ? 1 : 0.4 }}
              >
                {accion} {n}
              </button>
            );
          })}
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
                <SortableTh label="Guía" sortKey="guia" currentKey={sortKey} currentDir={sortDir} onSort={requestSort} />
                <SortableTh label="Estado" sortKey="estado" currentKey={sortKey} currentDir={sortDir} onSort={requestSort} />
                <SortableTh label="Oficina" sortKey="oficina" currentKey={sortKey} currentDir={sortDir} onSort={requestSort} />
                <SortableTh label="Entidad" sortKey="entidad" currentKey={sortKey} currentDir={sortDir} onSort={requestSort} />
                <SortableTh label="Días sin Mov." sortKey="dias" currentKey={sortKey} currentDir={sortDir} onSort={requestSort} />
                <SortableTh label="Últ. Mov." sortKey="ultmov" currentKey={sortKey} currentDir={sortDir} onSort={requestSort} />
                <SortableTh label="Acción" sortKey="accion" currentKey={sortKey} currentDir={sortDir} onSort={requestSort} />
                <SortableTh label="Exc.1" sortKey="exc1" currentKey={sortKey} currentDir={sortDir} onSort={requestSort} />
                <SortableTh label="Exc.2" sortKey="exc2" currentKey={sortKey} currentDir={sortDir} onSort={requestSort} />
                <SortableTh label="Exc.3" sortKey="exc3" currentKey={sortKey} currentDir={sortDir} onSort={requestSort} />
                <SortableTh label="Exc.4" sortKey="exc4" currentKey={sortKey} currentDir={sortDir} onSort={requestSort} />
                <SortableTh label="Exc.5" sortKey="exc5" currentKey={sortKey} currentDir={sortDir} onSort={requestSort} />
              </tr>
            </thead>
            <tbody>
              {sorted.map((g) => {
                const esDevolver = g.accion_recomendada === 'DEVOLVER' || g.accion_recomendada === 'DEVOLVER_COD';
                return (
                  <tr key={g.id} className={esDevolver ? 'opacity-80' : ''}>
                    <td>
                      <input
                        type="checkbox"
                        checked={seleccionadas.has(g.guia)}
                        onChange={() => toggleOne(g.guia, g.accion_recomendada)}
                      />
                    </td>
                    <td className="font-mono font-semibold">{g.guia}</td>
                    <td>{g.estado_guia}</td>
                    <td>{g.oficina_destino}</td>
                    <td>{g.entidad_destinatario}</td>
                    <td>
                      <div className="flex flex-col items-start gap-0.5">
                        <span className={g.dias_sin_movimiento && g.dias_sin_movimiento > 5 ? 'text-[var(--vg-red)] font-bold' : ''}>
                          {g.dias_sin_movimiento !== null ? `${g.dias_sin_movimiento}d` : '—'}
                        </span>
                        <AlertaDiasBadge dias={g.dias_sin_movimiento} />
                      </div>
                    </td>
                    <td>{g.f_historia || '—'}</td>
                    <td>
                      <AccionBadge accion={accionEfectiva(g)} />
                      {esDevolver && (
                        <div className="text-[9px] text-[var(--vg-text3)] mt-0.5">No reprogramable</div>
                      )}
                    </td>
                    <td>{g.excepcion_1 || '—'}</td>
                    <td>{g.excepcion_2 || '—'}</td>
                    <td>{g.excepcion_3 || '—'}</td>
                    <td>{g.excepcion_4 || '—'}</td>
                    <td>{g.excepcion_5 || '—'}</td>
                  </tr>
                );
              })}
              {!filas.length && (
                <tr>
                  <td colSpan={13} className="text-center text-[var(--vg-text3)] py-6">
                    No hay guías que requieran acción con este filtro
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
          guiasSeleccionadas={modalTipo === 'REPROGRAMAR' ? guiasParaReprogramar : guiasSeleccionadasObj}
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

      {modalCritico && (
        <AlertaCriticaModal
          open={modalCritico}
          onClose={() => setModalCritico(false)}
          guias={guiasCriticas}
          contactos={contactos}
          onCompletado={() => setModalCritico(false)}
        />
      )}
    </div>
  );
}
