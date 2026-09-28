'use client';

import { useEffect, useMemo, useState } from 'react';
import { Guia, Conciliacion } from '@/lib/types';
import { useSortableTable } from '@/lib/useSortableTable';
import SortableTh from '@/components/SortableTh';
import ConciliacionModal from '@/components/ConciliacionModal';
import { exportToExcel, exportToPDF } from '@/lib/export';

interface FilaConciliacion {
  guia: string;
  cliente: string | null;
  oficinaDestino: string | null;
  estadoGuia: string | null;
  fConfirmacion: string | null;
  cod: number;
  pagado: boolean;
  codConciliado: number | null;
  semanaPago: number | null;
  fechaEntregaConciliada: string | null;
  cip: string | null;
  diferenciaMonto: number | null; // cod (VIGIA) - codConciliado, si ambos existen y no coinciden
}

function fmtMoney(v: number | null): string {
  if (v === null || v === undefined) return '—';
  return v.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
}

export default function ConciliacionModule({ guias }: { guias: Guia[] }) {
  const [conciliaciones, setConciliaciones] = useState<Conciliacion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [modalAbierto, setModalAbierto] = useState(false);
  const [filtroCliente, setFiltroCliente] = useState('');
  const [filtroEstado, setFiltroEstado] = useState<'' | 'PAGADA' | 'PENDIENTE' | 'DIFERENCIA'>('');
  const [filtroSemana, setFiltroSemana] = useState('');

  function cargar() {
    setCargando(true);
    fetch('/api/conciliaciones')
      .then((r) => r.json())
      .then((j) => setConciliaciones(j.conciliaciones || []))
      .finally(() => setCargando(false));
  }

  useEffect(cargar, []);

  const conciliacionPorGuia = useMemo(() => {
    const m = new Map<string, Conciliacion>();
    conciliaciones.forEach((c) => m.set(c.guia, c));
    return m;
  }, [conciliaciones]);

  // Universo de conciliación: cualquier guía con COD > 0. No se restringe
  // a un estado específico (ENTREGADA, etc.) porque el archivo de
  // conciliación puede referirse a guías que en VIGIA quedaron en otro
  // estado por captura tardía — mejor no ocultar un pago real.
  const filas: FilaConciliacion[] = useMemo(() => {
    return guias
      .filter((g) => g.cod !== null && g.cod > 0)
      .map((g) => {
        const c = conciliacionPorGuia.get(g.guia);
        const pagado = !!c;
        const diferenciaMonto = pagado && c!.cod !== null ? Number((g.cod! - c!.cod).toFixed(2)) : null;
        return {
          guia: g.guia,
          cliente: g.cliente,
          oficinaDestino: g.oficina_destino,
          estadoGuia: g.estado_guia,
          fConfirmacion: g.f_confirmacion,
          cod: g.cod as number,
          pagado,
          codConciliado: c?.cod ?? null,
          semanaPago: c?.semana_pago ?? null,
          fechaEntregaConciliada: c?.fecha_entrega ?? null,
          cip: c?.cip ?? null,
          diferenciaMonto,
        };
      });
  }, [guias, conciliacionPorGuia]);

  const clientes = useMemo(() => [...new Set(filas.map((f) => f.cliente).filter(Boolean))].sort() as string[], [filas]);
  const semanas = useMemo(
    () => [...new Set(conciliaciones.map((c) => c.semana_pago).filter((s): s is number => s !== null))].sort((a, b) => a - b),
    [conciliaciones]
  );

  const filasFiltradas = useMemo(() => {
    return filas.filter((f) => {
      if (filtroCliente && f.cliente !== filtroCliente) return false;
      if (filtroEstado === 'PAGADA' && !f.pagado) return false;
      if (filtroEstado === 'PENDIENTE' && f.pagado) return false;
      if (filtroEstado === 'DIFERENCIA' && (!f.pagado || !f.diferenciaMonto)) return false;
      if (filtroSemana && String(f.semanaPago ?? '') !== filtroSemana) return false;
      return true;
    });
  }, [filas, filtroCliente, filtroEstado, filtroSemana]);

  const { sorted, sortKey, sortDir, requestSort } = useSortableTable<FilaConciliacion>(filasFiltradas, (f, key) => {
    switch (key) {
      case 'guia':
        return f.guia;
      case 'cliente':
        return f.cliente;
      case 'oficina':
        return f.oficinaDestino;
      case 'cod':
        return f.cod;
      case 'estado':
        return f.pagado ? 'PAGADA' : 'PENDIENTE';
      case 'semana':
        return f.semanaPago;
      case 'diferencia':
        return f.diferenciaMonto;
      default:
        return null;
    }
  });

  const resumen = useMemo(() => {
    const totalCod = filasFiltradas.reduce((acc, f) => acc + f.cod, 0);
    const pagadas = filasFiltradas.filter((f) => f.pagado);
    const codPagado = pagadas.reduce((acc, f) => acc + (f.codConciliado ?? f.cod), 0);
    const codPendiente = totalCod - codPagado;
    const conDiferencia = pagadas.filter((f) => f.diferenciaMonto && Math.abs(f.diferenciaMonto) > 0.01);
    return {
      totalGuias: filasFiltradas.length,
      totalCod,
      guiasPagadas: pagadas.length,
      codPagado,
      guiasPendientes: filasFiltradas.length - pagadas.length,
      codPendiente,
      pctConciliadoMonto: totalCod > 0 ? Math.round((codPagado / totalCod) * 1000) / 10 : null,
      conDiferencia: conDiferencia.length,
    };
  }, [filasFiltradas]);

  const columnasExport = [
    { header: 'Guía', value: (f: FilaConciliacion) => f.guia },
    { header: 'Cliente', value: (f: FilaConciliacion) => f.cliente || '' },
    { header: 'Oficina Destino', value: (f: FilaConciliacion) => f.oficinaDestino || '' },
    { header: 'Estado', value: (f: FilaConciliacion) => f.estadoGuia || '' },
    { header: 'COD (VIGIA)', value: (f: FilaConciliacion) => f.cod },
    { header: 'Estatus Conciliación', value: (f: FilaConciliacion) => (f.pagado ? 'PAGADA' : 'PENDIENTE') },
    { header: 'COD Conciliado', value: (f: FilaConciliacion) => f.codConciliado ?? '' },
    { header: 'Diferencia', value: (f: FilaConciliacion) => f.diferenciaMonto ?? '' },
    { header: 'Semana Pago', value: (f: FilaConciliacion) => f.semanaPago ?? '' },
    { header: 'CIP', value: (f: FilaConciliacion) => f.cip || '' },
  ];

  if (cargando) {
    return <div className="p-5 text-[13px] text-[var(--vg-text2)]">Cargando conciliaciones...</div>;
  }

  return (
    <div className="p-5 space-y-4">
      {/* KPIs resumen */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <div className="bg-white rounded-lg border border-[var(--vg-border)] p-3">
          <div className="text-[10.5px] font-semibold text-[var(--vg-text2)] uppercase">Guías con COD</div>
          <div className="text-[18px] font-extrabold text-[var(--vg-blue)]">{resumen.totalGuias.toLocaleString('es-MX')}</div>
        </div>
        <div className="bg-white rounded-lg border border-[var(--vg-border)] p-3">
          <div className="text-[10.5px] font-semibold text-[var(--vg-text2)] uppercase">COD Total</div>
          <div className="text-[16px] font-extrabold text-[var(--vg-blue)]">{fmtMoney(resumen.totalCod)}</div>
        </div>
        <div className="bg-white rounded-lg border border-[var(--vg-border)] p-3">
          <div className="text-[10.5px] font-semibold text-[var(--vg-text2)] uppercase">Pagado</div>
          <div className="text-[16px] font-extrabold text-[#0B9B67]">{fmtMoney(resumen.codPagado)}</div>
          <div className="text-[10px] text-[var(--vg-text3)]">{resumen.guiasPagadas.toLocaleString('es-MX')} guía(s)</div>
        </div>
        <div className="bg-white rounded-lg border border-[var(--vg-border)] p-3">
          <div className="text-[10.5px] font-semibold text-[var(--vg-text2)] uppercase">Pendiente</div>
          <div className="text-[16px] font-extrabold text-[#DC2626]">{fmtMoney(resumen.codPendiente)}</div>
          <div className="text-[10px] text-[var(--vg-text3)]">{resumen.guiasPendientes.toLocaleString('es-MX')} guía(s)</div>
        </div>
        <div className="bg-white rounded-lg border border-[var(--vg-border)] p-3">
          <div className="text-[10.5px] font-semibold text-[var(--vg-text2)] uppercase">% Conciliado</div>
          <div
            className="text-[18px] font-extrabold"
            style={{ color: resumen.pctConciliadoMonto === null ? '#94A3B8' : resumen.pctConciliadoMonto >= 90 ? '#0B9B67' : resumen.pctConciliadoMonto >= 60 ? '#EA7C1A' : '#DC2626' }}
          >
            {resumen.pctConciliadoMonto !== null ? `${resumen.pctConciliadoMonto}%` : '—'}
          </div>
        </div>
        <div className="bg-white rounded-lg border border-[var(--vg-border)] p-3">
          <div className="text-[10.5px] font-semibold text-[var(--vg-text2)] uppercase">Con Diferencia</div>
          <div className="text-[18px] font-extrabold text-[#B45309]">{resumen.conDiferencia.toLocaleString('es-MX')}</div>
          <div className="text-[10px] text-[var(--vg-text3)]">monto pagado ≠ COD de VIGIA</div>
        </div>
      </div>

      {/* Filtros y acciones */}
      <div className="bg-white border border-[var(--vg-border)] rounded-lg p-3 space-y-3">
        <div className="flex items-center gap-2.5 flex-wrap">
          <span className="text-[12px] font-semibold text-[var(--vg-text2)]">🔍 Filtrar:</span>
          <select
            value={filtroCliente}
            onChange={(e) => setFiltroCliente(e.target.value)}
            className="text-[12px] border border-[var(--vg-border)] rounded-md px-2.5 py-1.5 bg-white"
          >
            <option value="">Todos los clientes</option>
            {clientes.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select
            value={filtroEstado}
            onChange={(e) => setFiltroEstado(e.target.value as typeof filtroEstado)}
            className="text-[12px] border border-[var(--vg-border)] rounded-md px-2.5 py-1.5 bg-white"
          >
            <option value="">Todos los estatus</option>
            <option value="PAGADA">Pagadas</option>
            <option value="PENDIENTE">Pendientes</option>
            <option value="DIFERENCIA">Con diferencia de monto</option>
          </select>
          {semanas.length > 0 && (
            <select
              value={filtroSemana}
              onChange={(e) => setFiltroSemana(e.target.value)}
              className="text-[12px] border border-[var(--vg-border)] rounded-md px-2.5 py-1.5 bg-white"
            >
              <option value="">Todas las semanas de pago</option>
              {semanas.map((s) => (
                <option key={s} value={s}>
                  Semana {s}
                </option>
              ))}
            </select>
          )}

          <div className="ml-auto flex gap-2">
            <button
              onClick={() => setModalAbierto(true)}
              className="text-[12px] font-bold text-white bg-[var(--vg-blue)] px-3 py-1.5 rounded-md"
            >
              💳 Cargar Conciliación
            </button>
            <button
              onClick={() => exportToExcel(sorted, columnasExport, 'Conciliacion')}
              className="text-[12px] font-semibold text-[var(--vg-text2)] border border-[var(--vg-border)] px-3 py-1.5 rounded-md hover:bg-[var(--vg-blue-light)]"
            >
              📊 Excel
            </button>
            <button
              onClick={() => exportToPDF(sorted, columnasExport, 'Conciliación de COD')}
              className="text-[12px] font-semibold text-[var(--vg-text2)] border border-[var(--vg-border)] px-3 py-1.5 rounded-md hover:bg-[var(--vg-blue-light)]"
            >
              📄 PDF
            </button>
          </div>
        </div>
      </div>

      {/* Tabla */}
      <div className="bg-white border border-[var(--vg-border)] rounded-lg overflow-x-auto vg-scroll">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="border-b border-[var(--vg-border)] bg-[var(--vg-blue-light)]">
              <SortableTh label="Guía" sortKey="guia" currentKey={sortKey} currentDir={sortDir} onSort={requestSort} />
              <SortableTh label="Cliente" sortKey="cliente" currentKey={sortKey} currentDir={sortDir} onSort={requestSort} />
              <SortableTh label="Oficina Destino" sortKey="oficina" currentKey={sortKey} currentDir={sortDir} onSort={requestSort} />
              <SortableTh label="COD (VIGIA)" sortKey="cod" currentKey={sortKey} currentDir={sortDir} onSort={requestSort} />
              <SortableTh label="Estatus" sortKey="estado" currentKey={sortKey} currentDir={sortDir} onSort={requestSort} />
              <th className="text-left px-3 py-2 font-semibold">COD Conciliado</th>
              <SortableTh label="Diferencia" sortKey="diferencia" currentKey={sortKey} currentDir={sortDir} onSort={requestSort} />
              <SortableTh label="Semana Pago" sortKey="semana" currentKey={sortKey} currentDir={sortDir} onSort={requestSort} />
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr>
                <td colSpan={8} className="text-center text-[var(--vg-text3)] py-6">
                  No hay guías con COD que coincidan con los filtros.
                </td>
              </tr>
            )}
            {sorted.map((f) => (
              <tr key={f.guia} className="border-b border-[var(--vg-border)] hover:bg-[var(--vg-blue-light)]">
                <td className="px-3 py-1.5 font-mono font-semibold">{f.guia}</td>
                <td className="px-3 py-1.5">{f.cliente || '—'}</td>
                <td className="px-3 py-1.5">{f.oficinaDestino || '—'}</td>
                <td className="px-3 py-1.5 text-right font-mono">{fmtMoney(f.cod)}</td>
                <td className="px-3 py-1.5">
                  <span
                    className="text-[10.5px] font-bold text-white rounded-full px-2 py-0.5"
                    style={{ backgroundColor: f.pagado ? '#0B9B67' : '#DC2626' }}
                  >
                    {f.pagado ? 'PAGADA' : 'PENDIENTE'}
                  </span>
                </td>
                <td className="px-3 py-1.5 text-right font-mono">{f.pagado ? fmtMoney(f.codConciliado) : '—'}</td>
                <td className="px-3 py-1.5 text-right font-mono" style={{ color: f.diferenciaMonto && Math.abs(f.diferenciaMonto) > 0.01 ? '#B45309' : undefined }}>
                  {f.pagado ? fmtMoney(f.diferenciaMonto) : '—'}
                </td>
                <td className="px-3 py-1.5">{f.semanaPago ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ConciliacionModal open={modalAbierto} onClose={() => setModalAbierto(false)} onSubido={() => { setModalAbierto(false); cargar(); }} />
    </div>
  );
}
