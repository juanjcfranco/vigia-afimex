'use client';

import { Fragment, useEffect, useState } from 'react';
import { Carga, CierreOperativo, AlertaLog } from '@/lib/types';
import { formatearPeriodo } from '@/lib/business-logic';
import { exportAcusePDF, exportAcuseConcentradoPDF } from '@/lib/export';

interface HistorialModuleProps {
  cargas: Carga[];
  cargaActivaId: string | null;
  onSeleccionar: (id: string) => void;
}

type SubTab = 'cargas' | 'cierres' | 'correos';

export default function HistorialModule({ cargas, cargaActivaId, onSeleccionar }: HistorialModuleProps) {
  const [subTab, setSubTab] = useState<SubTab>('cargas');
  const [cierres, setCierres] = useState<CierreOperativo[]>([]);
  const [alertas, setAlertas] = useState<AlertaLog[]>([]);
  const [loadingCierres, setLoadingCierres] = useState(false);
  const [loadingAlertas, setLoadingAlertas] = useState(false);
  const [cierreExpandido, setCierreExpandido] = useState<string | null>(null);
  const [seleccionAlerta, setSeleccionAlerta] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (subTab === 'cierres' && !cierres.length) {
      setLoadingCierres(true);
      fetch('/api/cierres')
        .then((r) => r.json())
        .then((j) => setCierres(j.cierres || []))
        .finally(() => setLoadingCierres(false));
    }
    if (subTab === 'correos' && !alertas.length) {
      setLoadingAlertas(true);
      fetch('/api/alertas')
        .then((r) => r.json())
        .then((j) => setAlertas(j.alertas || []))
        .finally(() => setLoadingAlertas(false));
    }
  }, [subTab, cierres.length, alertas.length]);

  return (
    <div className="p-5">
      <div className="bg-white rounded-lg border border-[var(--vg-border)] overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--vg-border)] flex items-center gap-1">
          <button
            onClick={() => setSubTab('cargas')}
            className={`text-[12px] font-semibold px-3 py-1.5 rounded-md ${
              subTab === 'cargas' ? 'bg-[var(--vg-blue)] text-white' : 'text-[var(--vg-text2)] hover:bg-[var(--vg-bg)]'
            }`}
          >
            📂 Cargas
          </button>
          <button
            onClick={() => setSubTab('cierres')}
            className={`text-[12px] font-semibold px-3 py-1.5 rounded-md ${
              subTab === 'cierres' ? 'bg-[var(--vg-blue)] text-white' : 'text-[var(--vg-text2)] hover:bg-[var(--vg-bg)]'
            }`}
          >
            📋 Cierres
          </button>
          <button
            onClick={() => setSubTab('correos')}
            className={`text-[12px] font-semibold px-3 py-1.5 rounded-md ${
              subTab === 'correos' ? 'bg-[var(--vg-blue)] text-white' : 'text-[var(--vg-text2)] hover:bg-[var(--vg-bg)]'
            }`}
          >
            📧 Correos Enviados
          </button>
        </div>

        {subTab === 'cargas' && (
          <>
            <div className="px-4 py-2.5 text-[11px] text-[var(--vg-text2)] border-b border-[var(--vg-border)]">
              Cada Excel importado queda guardado como un corte independiente. Selecciona uno para verlo.
            </div>
            <table className="vg-table">
              <thead>
                <tr>
                  <th></th>
                  <th>Cliente</th>
                  <th>Periodo</th>
                  <th>Archivo</th>
                  <th>Total Guías</th>
                  <th>Fecha de Carga</th>
                </tr>
              </thead>
              <tbody>
                {cargas.map((c) => (
                  <tr
                    key={c.id}
                    onClick={() => onSeleccionar(c.id)}
                    className={`cursor-pointer ${c.id === cargaActivaId ? 'bg-[var(--vg-blue-light)]' : ''}`}
                  >
                    <td>{c.id === cargaActivaId ? '🟢' : ''}</td>
                    <td className="font-medium">{c.cliente}</td>
                    <td>{formatearPeriodo(c.periodo)}</td>
                    <td>{c.nombre_archivo}</td>
                    <td>{c.total_guias.toLocaleString('es-MX')}</td>
                    <td>{new Date(c.creado_en).toLocaleString('es-MX')}</td>
                  </tr>
                ))}
                {!cargas.length && (
                  <tr>
                    <td colSpan={6} className="text-center text-[var(--vg-text3)] py-8">
                      No hay cargas registradas todavía. Usa &quot;⬆ Cargar Excel&quot; para empezar.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </>
        )}

        {subTab === 'cierres' && (
          <>
            <div className="px-4 py-2.5 text-[11px] text-[var(--vg-text2)] border-b border-[var(--vg-border)]">
              Cada vez que guardas un Reporte de Cierre queda registrado aquí permanentemente. Clic en una fila para ver el detalle.
            </div>
            {loadingCierres ? (
              <div className="text-center text-[var(--vg-text3)] py-8 text-[12px]">Cargando cierres...</div>
            ) : (
              <table className="vg-table">
                <thead>
                  <tr>
                    <th></th>
                    <th>Cliente</th>
                    <th>Periodo</th>
                    <th>Generado</th>
                  </tr>
                </thead>
                <tbody>
                  {cierres.map((c) => {
                    const r = (c.resumen_json || {}) as Record<string, unknown>;
                    const expandido = cierreExpandido === c.id;
                    return (
                      <Fragment key={c.id}>
                        <tr
                          onClick={() => setCierreExpandido(expandido ? null : c.id)}
                          className="cursor-pointer"
                        >
                          <td>{expandido ? '▼' : '▶'}</td>
                          <td className="font-medium">{c.cliente || '—'}</td>
                          <td>{formatearPeriodo(c.periodo)}</td>
                          <td>{new Date(c.generado_en).toLocaleString('es-MX')}</td>
                        </tr>
                        {expandido && (
                          <tr>
                            <td colSpan={4} className="bg-[var(--vg-bg)] p-4">
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[12px]">
                                <div>
                                  <div className="text-[var(--vg-text2)] font-semibold">Total Originales</div>
                                  <div className="font-bold text-base">{String(r.totalOriginales ?? '—')}</div>
                                </div>
                                <div>
                                  <div className="text-[var(--vg-text2)] font-semibold">Entregadas</div>
                                  <div className="font-bold text-base text-[var(--vg-green)]">{String(r.entregadas ?? '—')}</div>
                                </div>
                                <div>
                                  <div className="text-[var(--vg-text2)] font-semibold">Devoluciones</div>
                                  <div className="font-bold text-base text-[var(--vg-red)]">{String(r.devoluciones ?? '—')}</div>
                                </div>
                                <div>
                                  <div className="text-[var(--vg-text2)] font-semibold">Efectividad</div>
                                  <div className="font-bold text-base">
                                    {r.efectividad !== undefined && r.efectividad !== null ? `${r.efectividad}%` : '—'}
                                  </div>
                                </div>
                                <div>
                                  <div className="text-[var(--vg-text2)] font-semibold">COD Entregado</div>
                                  <div className="font-bold text-base">
                                    ${Number(r.codEntregado ?? 0).toLocaleString('es-MX')}
                                  </div>
                                </div>
                                <div>
                                  <div className="text-[var(--vg-text2)] font-semibold">COD Devolución</div>
                                  <div className="font-bold text-base">
                                    ${Number(r.codDevolucion ?? 0).toLocaleString('es-MX')}
                                  </div>
                                </div>
                                <div>
                                  <div className="text-[var(--vg-text2)] font-semibold">Facturación Total</div>
                                  <div className="font-bold text-base text-[var(--vg-blue)]">
                                    ${Number(r.montoTotalFacturacion ?? 0).toLocaleString('es-MX')}
                                  </div>
                                </div>
                                <div>
                                  <div className="text-[var(--vg-text2)] font-semibold">Guías Abiertas</div>
                                  <div className="font-bold text-base text-[var(--vg-amber)]">{String(r.abiertas ?? '—')}</div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                  {!cierres.length && (
                    <tr>
                      <td colSpan={4} className="text-center text-[var(--vg-text3)] py-8">
                        No hay cierres guardados todavía. Usa &quot;Guardar cierre&quot; dentro del Reporte de Cierre Operativo.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </>
        )}

        {subTab === 'correos' && (
          <>
            <div className="px-4 py-2.5 text-[11px] text-[var(--vg-text2)] border-b border-[var(--vg-border)] flex items-center justify-between gap-2 flex-wrap">
              <span>Cada alerta o correo enviado desde los módulos de Acciones, Abiertas y Alertas queda registrado aquí.</span>
              {seleccionAlerta.size > 0 && (
                <button
                  onClick={() => {
                    const seleccionadas = alertas.filter((a) => seleccionAlerta.has(a.id));
                    exportAcuseConcentradoPDF(seleccionadas);
                  }}
                  className="text-[11px] font-semibold text-white bg-[var(--vg-blue)] rounded-md px-3 py-1"
                >
                  🖨 Acuse concentrado ({seleccionAlerta.size})
                </button>
              )}
            </div>
            {loadingAlertas ? (
              <div className="text-center text-[var(--vg-text3)] py-8 text-[12px]">Cargando correos...</div>
            ) : (
              <table className="vg-table">
                <thead>
                  <tr>
                    <th>
                      <input
                        type="checkbox"
                        checked={alertas.length > 0 && seleccionAlerta.size === alertas.length}
                        onChange={(e) =>
                          setSeleccionAlerta(e.target.checked ? new Set(alertas.map((a) => a.id)) : new Set())
                        }
                      />
                    </th>
                    <th>Cliente</th>
                    <th>Tipo</th>
                    <th>Oficina</th>
                    <th>Guías Incluidas</th>
                    <th>Total</th>
                    <th>Enviado A</th>
                    <th>Fecha de Envío</th>
                    <th>Estado</th>
                    <th>Acuse</th>
                  </tr>
                </thead>
                <tbody>
                  {alertas.map((a) => (
                    <tr key={a.id} className={seleccionAlerta.has(a.id) ? 'bg-[var(--vg-blue-light)]' : ''}>
                      <td>
                        <input
                          type="checkbox"
                          checked={seleccionAlerta.has(a.id)}
                          onChange={() => {
                            const next = new Set(seleccionAlerta);
                            if (next.has(a.id)) next.delete(a.id);
                            else next.add(a.id);
                            setSeleccionAlerta(next);
                          }}
                        />
                      </td>
                      <td className="font-medium">{a.cliente || '—'}</td>
                      <td>
                        {a.tipo_solicitud ? (
                          <span className="text-[10px] font-bold text-white bg-[var(--vg-blue)] rounded-full px-2 py-0.5">
                            {a.tipo_solicitud}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="font-medium">{a.oficina}</td>
                      <td className="max-w-[240px] truncate" title={(a.guias_incluidas || []).join(', ')}>
                        {(a.guias_incluidas || []).slice(0, 5).join(', ')}
                        {(a.guias_incluidas || []).length > 5 ? ` +${a.guias_incluidas.length - 5} más` : ''}
                      </td>
                      <td>{a.total_guias}</td>
                      <td>{a.enviado_a || '—'}</td>
                      <td>{new Date(a.enviado_en).toLocaleString('es-MX')}</td>
                      <td>
                        <span className={`text-[10.5px] font-bold px-2 py-0.5 rounded-full text-white ${a.estado === 'enviado' ? 'bg-[var(--vg-green)]' : 'bg-[var(--vg-red)]'}`}>
                          {a.estado}
                        </span>
                      </td>
                      <td>
                        <button
                          onClick={() => exportAcusePDF(a)}
                          className="text-[10.5px] font-semibold text-[var(--vg-blue)] border border-[var(--vg-blue)]/30 rounded-md px-2 py-0.5 hover:bg-[var(--vg-blue-light)]"
                        >
                          🖨 Acuse PDF
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!alertas.length && (
                    <tr>
                      <td colSpan={8} className="text-center text-[var(--vg-text3)] py-8">
                        No se han enviado correos todavía.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </>
        )}
      </div>
    </div>
  );
}
