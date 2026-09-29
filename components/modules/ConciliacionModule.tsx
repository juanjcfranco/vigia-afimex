'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import SortableTh from '@/components/SortableTh';
import ConciliacionModal from '@/components/ConciliacionModal';
import { exportToExcel, exportToPDF } from '@/lib/export';

// ============================================================
// Este módulo YA NO acumula guías en el navegador para cruzarlas y
// sumarlas ahí. Antes se pedían TODAS las guías Entregadas originales
// paginando de 1000 en 1000 (decenas de páginas seguidas para bases
// grandes) y recién con todo en memoria se cruzaba contra
// `conciliaciones` y se sumaba — bastaba que UNA sola petición fallara
// (timeout, límite transitorio de Supabase/Vercel) para que el resumen
// saliera incompleto, con un total distinto cada vez que se reintentaba.
//
// Ahora el cruce y la suma se hacen DIRECTO en Postgres, vía las
// funciones conciliacion_resumen() / conciliacion_detalle() /
// conciliacion_opciones_filtro() (ver
// supabase_migracion_16_conciliacion_rpc.sql). El navegador solo pide:
// - El resumen ya calculado (una petición, un resultado, sin importar
//   si hay 15,000 o 150,000 guías).
// - La página de la tabla que se está viendo (nunca todo el universo).
// - Las opciones de los filtros (clientes/semanas), ya calculadas.
// ============================================================

interface ResumenConciliacion {
  guias_con_cod: number;
  cod_total: number;
  guias_pagadas: number;
  cod_pagado: number;
  guias_pendientes: number;
  cod_pendiente: number;
  con_diferencia: number;
}

interface FilaDetalle {
  guia: string;
  cliente: string | null;
  oficina_destino: string | null;
  estado_guia: string | null;
  cod: number;
  cod_conciliado: number | null;
  semana_pago: number | null;
  fecha_entrega_conciliada: string | null;
  cip: string | null;
  pagado: boolean;
  diferencia: number | null;
  f_confirmacion: string | null;
}

function fmtMoney(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—';
  return v.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
}

const PAGE_SIZE = 200;

export default function ConciliacionModule({
  cargaId,
  periodos,
  dia,
}: {
  cargaId: string | null;
  periodos: string[];
  dia: string | null;
}) {
  const [resumen, setResumen] = useState<ResumenConciliacion | null>(null);
  const [errorResumen, setErrorResumen] = useState<string | null>(null);

  const [filas, setFilas] = useState<FilaDetalle[]>([]);
  const [totalFilas, setTotalFilas] = useState(0);
  const [pagina, setPagina] = useState(0);
  const [cargandoDetalle, setCargandoDetalle] = useState(true);
  const [errorDetalle, setErrorDetalle] = useState<string | null>(null);

  const [clientes, setClientes] = useState<string[]>([]);
  const [semanas, setSemanas] = useState<number[]>([]);

  const [modalAbierto, setModalAbierto] = useState(false);
  const [filtroCliente, setFiltroCliente] = useState('');
  const [filtroEstado, setFiltroEstado] = useState<'' | 'PAGADA' | 'PENDIENTE' | 'DIFERENCIA'>('');
  const [filtroSemana, setFiltroSemana] = useState('');
  const [filtroGuia, setFiltroGuia] = useState('');
  const [filtroGuiaDebounced, setFiltroGuiaDebounced] = useState('');

  // Debounce de 400ms para no disparar una petición por cada tecla
  // mientras se escribe el número de guía a buscar.
  useEffect(() => {
    const t = setTimeout(() => setFiltroGuiaDebounced(filtroGuia.trim()), 400);
    return () => clearTimeout(t);
  }, [filtroGuia]);
  const [exportando, setExportando] = useState(false);

  const periodosParam = periodos.join(',');

  const cargarResumen = useCallback(() => {
    setErrorResumen(null);
    const params = new URLSearchParams();
    if (cargaId) params.set('carga_id', cargaId);
    if (periodosParam) params.set('periodos', periodosParam);
    if (dia) params.set('dia', dia);
    // El endpoint espera "clientes" (plural, array) — ver p_clientes en
    // conciliacion_resumen(). filtroCliente aquí es un solo valor (select
    // simple, no multi-select), se manda como lista de 1 elemento.
    if (filtroCliente) params.set('clientes', filtroCliente);
    fetch(`/api/conciliaciones/resumen?${params.toString()}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => {
        if (j.error) throw new Error(j.error);
        setResumen(j.resumen);
      })
      .catch((e) => setErrorResumen(e instanceof Error ? e.message : 'Error al cargar el resumen'));
  }, [cargaId, periodosParam, dia, filtroCliente]);

  const cargarOpciones = useCallback(() => {
    const params = new URLSearchParams();
    if (cargaId) params.set('carga_id', cargaId);
    if (periodosParam) params.set('periodos', periodosParam);
    if (dia) params.set('dia', dia);
    fetch(`/api/conciliaciones/opciones?${params.toString()}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => {
        setClientes(j.clientes || []);
        setSemanas(j.semanas || []);
      })
      .catch(() => {});
  }, [cargaId, periodosParam, dia]);

  const cargarDetalle = useCallback(() => {
    setCargandoDetalle(true);
    setErrorDetalle(null);
    const params = new URLSearchParams();
    if (cargaId) params.set('carga_id', cargaId);
    if (periodosParam) params.set('periodos', periodosParam);
    if (dia) params.set('dia', dia);
    if (filtroCliente) params.set('cliente', filtroCliente);
    if (filtroEstado) params.set('estatus', filtroEstado);
    if (filtroSemana) params.set('semana', filtroSemana);
    if (filtroGuiaDebounced) params.set('guia', filtroGuiaDebounced);
    params.set('limit', String(PAGE_SIZE));
    params.set('offset', String(pagina * PAGE_SIZE));
    fetch(`/api/conciliaciones/detalle?${params.toString()}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => {
        if (j.error) throw new Error(j.error);
        setFilas(j.filas || []);
        setTotalFilas(j.total || 0);
      })
      .catch((e) => setErrorDetalle(e instanceof Error ? e.message : 'Error al cargar el detalle'))
      .finally(() => setCargandoDetalle(false));
  }, [cargaId, periodosParam, dia, filtroCliente, filtroEstado, filtroSemana, filtroGuiaDebounced, pagina]);

  useEffect(cargarResumen, [cargarResumen]);
  useEffect(cargarOpciones, [cargarOpciones]);
  useEffect(cargarDetalle, [cargarDetalle]);

  // Cambiar cualquier filtro regresa a la primera página.
  useEffect(() => {
    setPagina(0);
  }, [filtroCliente, filtroEstado, filtroSemana, filtroGuiaDebounced]);

  function recargarTodo() {
    cargarResumen();
    cargarOpciones();
    cargarDetalle();
  }

  const columnasExport = [
    { header: 'Guía', value: (f: FilaDetalle) => f.guia },
    { header: 'Cliente', value: (f: FilaDetalle) => f.cliente || '' },
    { header: 'Oficina Destino', value: (f: FilaDetalle) => f.oficina_destino || '' },
    { header: 'Estado', value: (f: FilaDetalle) => f.estado_guia || '' },
    { header: 'F_Confirmacion', value: (f: FilaDetalle) => f.f_confirmacion || '' },
    { header: 'COD (VIGIA)', value: (f: FilaDetalle) => f.cod },
    { header: 'Estatus Conciliación', value: (f: FilaDetalle) => (f.pagado ? 'PAGADA' : 'PENDIENTE') },
    { header: 'COD Conciliado', value: (f: FilaDetalle) => f.cod_conciliado ?? '' },
    { header: 'Diferencia', value: (f: FilaDetalle) => f.diferencia ?? '' },
    { header: 'Semana Pago', value: (f: FilaDetalle) => f.semana_pago ?? '' },
    { header: 'CIP', value: (f: FilaDetalle) => f.cip || '' },
  ];

  // Exportar trae TODAS las filas que cumplen el filtro actual (no solo
  // la página visible), pidiendo de 1000 en 1000 — muchas menos páginas
  // que antes porque ya viene filtrado y deduplicado desde el servidor,
  // y solo se usa cuando el usuario pide exportar (no en cada carga de
  // pantalla).
  async function exportar(formato: 'excel' | 'pdf') {
    setExportando(true);
    try {
      let todas: FilaDetalle[] = [];
      let offset = 0;
      const LIMIT_EXPORT = 1000;
      // Límite de seguridad: no más de 200 páginas (200,000 filas) para
      // evitar un bucle infinito ante una respuesta inesperada.
      for (let i = 0; i < 200; i++) {
        const params = new URLSearchParams();
        if (cargaId) params.set('carga_id', cargaId);
        if (periodosParam) params.set('periodos', periodosParam);
        if (dia) params.set('dia', dia);
        if (filtroCliente) params.set('cliente', filtroCliente);
        if (filtroEstado) params.set('estatus', filtroEstado);
        if (filtroSemana) params.set('semana', filtroSemana);
        if (filtroGuiaDebounced) params.set('guia', filtroGuiaDebounced);
        params.set('limit', String(LIMIT_EXPORT));
        params.set('offset', String(offset));
        const res = await fetch(`/api/conciliaciones/detalle?${params.toString()}`, { cache: 'no-store' });
        const json = await res.json();
        if (json.error) throw new Error(json.error);
        const lote: FilaDetalle[] = json.filas || [];
        todas = todas.concat(lote);
        if (lote.length < LIMIT_EXPORT) break;
        offset += LIMIT_EXPORT;
      }
      if (formato === 'excel') exportToExcel(todas, columnasExport, 'Conciliacion');
      else exportToPDF(todas, columnasExport, 'Conciliación de COD');
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error al exportar');
    } finally {
      setExportando(false);
    }
  }

  const totalPaginas = Math.max(1, Math.ceil(totalFilas / PAGE_SIZE));

  return (
    <div className="p-5 space-y-4">
      {/* KPIs resumen — calculados en Postgres, una sola peticion */}
      {errorResumen ? (
        <div className="bg-[#FEF2F2] border border-[#FCA5A5] rounded-lg p-3 text-[12.5px] text-[#DC2626] flex items-center justify-between">
          <span>⚠️ No se pudo cargar el resumen: {errorResumen}</span>
          <button onClick={cargarResumen} className="text-[12px] font-bold text-white bg-[#DC2626] px-3 py-1 rounded-md">
            Reintentar
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <div className="bg-white rounded-lg border border-[var(--vg-border)] p-3">
            <div className="text-[10.5px] font-semibold text-[var(--vg-text2)] uppercase">Guías con COD</div>
            <div className="text-[18px] font-extrabold text-[var(--vg-blue)]">
              {resumen ? resumen.guias_con_cod.toLocaleString('es-MX') : '…'}
            </div>
          </div>
          <div className="bg-white rounded-lg border border-[var(--vg-border)] p-3">
            <div className="text-[10.5px] font-semibold text-[var(--vg-text2)] uppercase">COD Total</div>
            <div className="text-[16px] font-extrabold text-[var(--vg-blue)]">{resumen ? fmtMoney(resumen.cod_total) : '…'}</div>
          </div>
          <div className="bg-white rounded-lg border border-[var(--vg-border)] p-3">
            <div className="text-[10.5px] font-semibold text-[var(--vg-text2)] uppercase">Pagado</div>
            <div className="text-[16px] font-extrabold text-[#0B9B67]">{resumen ? fmtMoney(resumen.cod_pagado) : '…'}</div>
            <div className="text-[10px] text-[var(--vg-text3)]">
              {resumen ? resumen.guias_pagadas.toLocaleString('es-MX') : '…'} guía(s)
            </div>
          </div>
          <div className="bg-white rounded-lg border border-[var(--vg-border)] p-3">
            <div className="text-[10.5px] font-semibold text-[var(--vg-text2)] uppercase">Pendiente</div>
            <div className="text-[16px] font-extrabold text-[#DC2626]">{resumen ? fmtMoney(resumen.cod_pendiente) : '…'}</div>
            <div className="text-[10px] text-[var(--vg-text3)]">
              {resumen ? resumen.guias_pendientes.toLocaleString('es-MX') : '…'} guía(s)
            </div>
          </div>
          <div className="bg-white rounded-lg border border-[var(--vg-border)] p-3">
            <div className="text-[10.5px] font-semibold text-[var(--vg-text2)] uppercase">% Conciliado</div>
            <div
              className="text-[18px] font-extrabold"
              style={{
                color:
                  !resumen || resumen.cod_total <= 0
                    ? '#94A3B8'
                    : resumen.cod_pagado / resumen.cod_total >= 0.9
                      ? '#0B9B67'
                      : resumen.cod_pagado / resumen.cod_total >= 0.6
                        ? '#EA7C1A'
                        : '#DC2626',
              }}
            >
              {resumen && resumen.cod_total > 0 ? `${Math.round((resumen.cod_pagado / resumen.cod_total) * 1000) / 10}%` : '—'}
            </div>
          </div>
          <div className="bg-white rounded-lg border border-[var(--vg-border)] p-3">
            <div className="text-[10.5px] font-semibold text-[var(--vg-text2)] uppercase">Con Diferencia</div>
            <div className="text-[18px] font-extrabold text-[#B45309]">
              {resumen ? resumen.con_diferencia.toLocaleString('es-MX') : '…'}
            </div>
            <div className="text-[10px] text-[var(--vg-text3)]">monto pagado ≠ COD de VIGIA</div>
          </div>
        </div>
      )}

      {/* Filtros y acciones */}
      <div className="bg-white border border-[var(--vg-border)] rounded-lg p-3 space-y-3">
        <div className="flex items-center gap-2.5 flex-wrap">
          <span className="text-[12px] font-semibold text-[var(--vg-text2)]">🔍 Filtrar:</span>
          <input
            type="text"
            value={filtroGuia}
            onChange={(e) => setFiltroGuia(e.target.value)}
            placeholder="Buscar guía..."
            className="text-[12px] border border-[var(--vg-border)] rounded-md px-2.5 py-1.5 bg-white w-[150px]"
          />
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
              onClick={() => exportar('excel')}
              disabled={exportando}
              className="text-[12px] font-semibold text-[var(--vg-text2)] border border-[var(--vg-border)] px-3 py-1.5 rounded-md hover:bg-[var(--vg-blue-light)] disabled:opacity-40"
            >
              {exportando ? 'Exportando...' : '📊 Excel'}
            </button>
            <button
              onClick={() => exportar('pdf')}
              disabled={exportando}
              className="text-[12px] font-semibold text-[var(--vg-text2)] border border-[var(--vg-border)] px-3 py-1.5 rounded-md hover:bg-[var(--vg-blue-light)] disabled:opacity-40"
            >
              {exportando ? 'Exportando...' : '📄 PDF'}
            </button>
          </div>
        </div>
      </div>

      {/* Tabla — solo la pagina actual, nunca todo el universo */}
      <div className="bg-white border border-[var(--vg-border)] rounded-lg overflow-x-auto vg-scroll">
        {errorDetalle ? (
          <div className="p-4 text-[12.5px] text-[#DC2626] flex items-center justify-between">
            <span>⚠️ No se pudo cargar el detalle: {errorDetalle}</span>
            <button onClick={cargarDetalle} className="text-[12px] font-bold text-white bg-[#DC2626] px-3 py-1 rounded-md">
              Reintentar
            </button>
          </div>
        ) : (
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-[var(--vg-border)] bg-[var(--vg-blue-light)]">
                <th className="text-left px-3 py-2 font-semibold">Guía</th>
                <th className="text-left px-3 py-2 font-semibold">Cliente</th>
                <th className="text-left px-3 py-2 font-semibold">Oficina Destino</th>
                <th className="text-left px-3 py-2 font-semibold">F_Confirmación</th>
                <th className="text-left px-3 py-2 font-semibold">COD (VIGIA)</th>
                <th className="text-left px-3 py-2 font-semibold">Estatus</th>
                <th className="text-left px-3 py-2 font-semibold">COD Conciliado</th>
                <th className="text-left px-3 py-2 font-semibold">Diferencia</th>
                <th className="text-left px-3 py-2 font-semibold">Semana Pago</th>
              </tr>
            </thead>
            <tbody>
              {cargandoDetalle && (
                <tr>
                  <td colSpan={9} className="text-center text-[var(--vg-text3)] py-6">
                    Cargando...
                  </td>
                </tr>
              )}
              {!cargandoDetalle && filas.length === 0 && (
                <tr>
                  <td colSpan={9} className="text-center text-[var(--vg-text3)] py-6">
                    No hay guías con COD que coincidan con los filtros.
                  </td>
                </tr>
              )}
              {!cargandoDetalle &&
                filas.map((f) => (
                  <tr key={f.guia} className="border-b border-[var(--vg-border)] hover:bg-[var(--vg-blue-light)]">
                    <td className="px-3 py-1.5 font-mono font-semibold">{f.guia}</td>
                    <td className="px-3 py-1.5">{f.cliente || '—'}</td>
                    <td className="px-3 py-1.5">{f.oficina_destino || '—'}</td>
                    <td className="px-3 py-1.5">{f.f_confirmacion || '—'}</td>
                    <td className="px-3 py-1.5 text-right font-mono">{fmtMoney(f.cod)}</td>
                    <td className="px-3 py-1.5">
                      <span
                        className="text-[10.5px] font-bold text-white rounded-full px-2 py-0.5"
                        style={{ backgroundColor: f.pagado ? '#0B9B67' : '#DC2626' }}
                      >
                        {f.pagado ? 'PAGADA' : 'PENDIENTE'}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono">{f.pagado ? fmtMoney(f.cod_conciliado) : '—'}</td>
                    <td
                      className="px-3 py-1.5 text-right font-mono"
                      style={{ color: f.diferencia && Math.abs(f.diferencia) > 0.01 ? '#B45309' : undefined }}
                    >
                      {f.pagado ? fmtMoney(f.diferencia) : '—'}
                    </td>
                    <td className="px-3 py-1.5">{f.semana_pago ?? '—'}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Paginación */}
      {totalFilas > PAGE_SIZE && (
        <div className="flex items-center justify-between text-[12px] text-[var(--vg-text2)]">
          <span>
            Mostrando {pagina * PAGE_SIZE + 1}–{Math.min((pagina + 1) * PAGE_SIZE, totalFilas)} de{' '}
            {totalFilas.toLocaleString('es-MX')}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPagina((p) => Math.max(0, p - 1))}
              disabled={pagina === 0}
              className="px-3 py-1 border border-[var(--vg-border)] rounded-md disabled:opacity-40"
            >
              ← Anterior
            </button>
            <span className="px-2 py-1">
              Página {pagina + 1} de {totalPaginas}
            </span>
            <button
              onClick={() => setPagina((p) => Math.min(totalPaginas - 1, p + 1))}
              disabled={pagina >= totalPaginas - 1}
              className="px-3 py-1 border border-[var(--vg-border)] rounded-md disabled:opacity-40"
            >
              Siguiente →
            </button>
          </div>
        </div>
      )}

      <ConciliacionModal open={modalAbierto} onClose={() => setModalAbierto(false)} onSubido={() => { setModalAbierto(false); recargarTodo(); }} />
    </div>
  );
}
