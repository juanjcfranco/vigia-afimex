'use client';

import { useEffect, useMemo, useState } from 'react';
import { Guia, ContactoOficina, ACCION_COLORS, AlertaGuiaEvento } from '@/lib/types';
import { isAbierta, isAbiertaPorEstado, accionEfectiva, calcularSemaforoGuia } from '@/lib/business-logic';
import AlertaPreviewModal from '@/components/AlertaPreviewModal';
import SemaforoAlertaModal from '@/components/SemaforoAlertaModal';
import { useSortableTable } from '@/lib/useSortableTable';
import SortableTh from '@/components/SortableTh';

const COLOR_NIVEL: Record<string, string> = { AMARILLO: '#EAB308', NARANJA: '#EA7C1A', ROJO: '#DC2626', CERRADO: '#64748B' };

const ACCIONES_RAPIDAS = [
  'ESTADO CRÍTICO',
  'INVESTIGAR',
  'ALERTAR A OFICINA',
  'DEVOLVER',
  'SOLICITAR INFORMACIÓN',
  'REPROGRAMAR',
  'POSIBLE INDEMNIZACIÓN',
];

export default function AlertasModule({ guias }: { guias: Guia[] }) {
  const [contactos, setContactos] = useState<ContactoOficina[]>([]);
  const [mostrarContactos, setMostrarContactos] = useState(false);
  const [nuevoContacto, setNuevoContacto] = useState({ oficina: '', email_to: '', email_cc: '', jefe: '', jefe_oficina: '' });
  const [mensaje, setMensaje] = useState<string | null>(null);

  // Modal de previsualización / envío masivo
  const [modalAbierto, setModalAbierto] = useState(false);
  const [modalTitulo, setModalTitulo] = useState('');
  const [modalGuias, setModalGuias] = useState<Guia[]>([]);

  // Semáforo de escalamiento — historial persistente por guía (ver
  // supabase_migracion_14_alertas_guia.sql), independiente de guías/cargas.
  const [modalSemaforo, setModalSemaforo] = useState(false);
  const [modalSemaforoGuias, setModalSemaforoGuias] = useState<Guia[]>([]);
  const [historialAlertas, setHistorialAlertas] = useState<AlertaGuiaEvento[]>([]);

  function recargarHistorialAlertas() {
    fetch('/api/alertas-guia')
      .then((r) => r.json())
      .then((j) => setHistorialAlertas(j.eventos || []));
  }

  useEffect(() => {
    recargarHistorialAlertas();
  }, []);

  // Guías abiertas agrupadas por nivel de semáforo (solo las que ya están
  // en algún nivel de alerta — Amarillo/Naranja/Rojo, no Verde). Usa
  // isAbiertaPorEstado (no isAbierta): esta última puede clasificar como
  // "abierta" una guía en DEVOLUCION si su campo Calificación del Excel
  // dice "ABIERTA" (dato manual que puede no reflejar el estado real) —
  // el semáforo de escalamiento debe basarse solo en el estado real de la
  // guía, nunca incluir devoluciones ya resueltas.
  const guiasPorNivelSemaforo = useMemo(() => {
    const grupos: Record<string, Guia[]> = { AMARILLO: [], NARANJA: [], ROJO: [] };
    guias.forEach((g) => {
      if (!isAbiertaPorEstado(g)) return;
      const semaforo = calcularSemaforoGuia(g.dias_sin_movimiento);
      if (semaforo.nivel !== 'VERDE') grupos[semaforo.nivel].push(g);
    });
    return grupos;
  }, [guias]);

  function abrirSemaforoPorNivel(nivel: string) {
    const lista = guiasPorNivelSemaforo[nivel] || [];
    if (!lista.length) {
      setMensaje(`Sin guías en nivel ${nivel}.`);
      return;
    }
    setModalSemaforoGuias(lista);
    setModalSemaforo(true);
  }

  // Historial agrupado por guía, en orden cronológico — para mostrar la
  // secuencia "Alerta 1 (acción) → Alerta 2 (acción) → ... → Cerrar caso"
  // tal cual, sin importar de qué carga venga la guía ahora.
  const historialPorGuia = useMemo(() => {
    const grupos: Record<string, AlertaGuiaEvento[]> = {};
    historialAlertas.forEach((ev) => {
      if (!grupos[ev.guia]) grupos[ev.guia] = [];
      grupos[ev.guia].push(ev);
    });
    return Object.entries(grupos).sort(
      (a, b) => new Date(b[1][b[1].length - 1].creado_en).getTime() - new Date(a[1][a[1].length - 1].creado_en).getTime()
    );
  }, [historialAlertas]);

  // Datos de trazabilidad de cada guía (si sigue presente en el corte
  // actual) para enriquecer la tabla de historial — si la guía ya no
  // está en la carga activa (se reemplazó por un corte más nuevo), se
  // muestra "—" en vez de fallar.
  const datosGuiaPorNumero = useMemo(() => {
    const map = new Map<string, Guia>();
    guias.forEach((g) => map.set(g.guia, g));
    return map;
  }, [guias]);

  useEffect(() => {
    fetch('/api/contactos')
      .then((r) => r.json())
      .then((j) => setContactos(j.contactos || []));
  }, []);

  const guiasConAccion = useMemo(() => {
    return guias.filter((g) => {
      if (g.es_predoc || g.es_documentada || g.es_devolucion) return false;
      if (g.estado_guia === 'ENTREGADA') return false;
      // Con excepción y acción del catálogo, o sin excepción pero con
      // suficientes días sin movimiento como para necesitar atención de
      // todos modos — ver accionEfectiva() en business-logic.ts. Así una
      // guía varada que nunca recibió una excepción también puede
      // alertarse, no solo las que sí tienen una registrada.
      return isAbierta(g) && !!accionEfectiva(g);
    });
  }, [guias]);

  const porOficina = useMemo(() => {
    const grupos: Record<string, Guia[]> = {};
    guiasConAccion.forEach((g) => {
      const of = g.oficina_destino || 'SIN OFICINA';
      if (!grupos[of]) grupos[of] = [];
      grupos[of].push(g);
    });
    return Object.entries(grupos).sort((a, b) => b[1].length - a[1].length);
  }, [guiasConAccion]);

  const conteoPorAccion = useMemo(() => {
    const counts: Record<string, number> = {};
    guiasConAccion.forEach((g) => {
      const a = accionEfectiva(g);
      if (a) counts[a] = (counts[a] || 0) + 1;
    });
    return counts;
  }, [guiasConAccion]);

  async function guardarContacto() {
    if (!nuevoContacto.oficina) return;
    const res = await fetch('/api/contactos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(nuevoContacto),
    });
    const json = await res.json();
    if (json.contacto) {
      setContactos((prev) => {
        const sinDup = prev.filter((c) => c.oficina !== json.contacto.oficina);
        return [...sinDup, json.contacto].sort((a, b) => a.oficina.localeCompare(b.oficina));
      });
      setNuevoContacto({ oficina: '', email_to: '', email_cc: '', jefe: '', jefe_oficina: '' });
      setMensaje(`✅ Contacto guardado para ${json.contacto.oficina}`);
    }
  }

  function abrirAlertaGeneral() {
    if (!guiasConAccion.length) {
      setMensaje('Sin guías elegibles para alerta.');
      return;
    }
    setModalTitulo('Alerta general — Acciones a seguir');
    setModalGuias(guiasConAccion);
    setModalAbierto(true);
  }

  function abrirAlertaPorAccion(accion: string) {
    const lista = guiasConAccion.filter((g) => accionEfectiva(g) === accion);
    if (!lista.length) {
      setMensaje(`Sin guías con acción "${accion}".`);
      return;
    }
    setModalTitulo(`Alerta — ${accion}`);
    setModalGuias(lista);
    setModalAbierto(true);
  }

  const porOficinaModal = useMemo(() => {
    const grupos: Record<string, Guia[]> = {};
    modalGuias.forEach((g) => {
      const of = g.oficina_destino || 'SIN OFICINA';
      if (!grupos[of]) grupos[of] = [];
      grupos[of].push(g);
    });
    return Object.entries(grupos).sort((a, b) => a[0].localeCompare(b[0]));
  }, [modalGuias]);

  const contactosOrden = useSortableTable<ContactoOficina>(contactos, (c, key) => {
    switch (key) {
      case 'oficina':
        return c.oficina;
      case 'to':
        return c.email_to;
      case 'cc':
        return c.email_cc;
      case 'jefe':
        return c.jefe;
      default:
        return null;
    }
  });

  const porOficinaOrden = useSortableTable<[string, Guia[]]>(porOficina, (item, key) => {
    const [oficina, lista] = item;
    if (key === 'oficina') return oficina;
    if (key === 'guias') return lista.length;
    if (key === 'contacto') {
      const c = contactos.find((c) => c.oficina === oficina);
      return c ? c.email_to : null;
    }
    return null;
  });

  async function cerrarCaso(guia: string) {
    if (!confirm(`¿Cerrar el caso de la guía ${guia}?`)) return;
    await fetch('/api/alertas-guia', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ guia, nivel: 'CERRADO' }),
    });
    recargarHistorialAlertas();
  }

  // Borra el historial COMPLETO de la guía (todos sus eventos) — distinto
  // de "Cerrar caso", que solo agrega un evento sin borrar nada. Útil si
  // se registró una alerta por error o se quiere reiniciar el seguimiento.
  async function borrarAlerta(guia: string) {
    if (!confirm(`¿Borrar todo el historial de alertas de la guía ${guia}? Esta acción no se puede deshacer.`)) return;
    try {
      const res = await fetch(`/api/alertas-guia?guia=${encodeURIComponent(guia)}`, { method: 'DELETE' });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(`No se pudo borrar: ${j.error || `Error ${res.status}`}`);
        return;
      }
    } catch {
      alert('No se pudo borrar: error de red al contactar el servidor.');
      return;
    }
    recargarHistorialAlertas();
  }

  return (
    <div className="p-5 space-y-4">
      <div className="bg-white rounded-lg border border-[var(--vg-border)] overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--vg-border)] flex items-center justify-between flex-wrap gap-2">
          <div>
            <div className="font-bold text-[13px]">🚦 Semáforo de Escalamiento — Guías Abiertas</div>
            <div className="text-[11px] text-[var(--vg-text2)]">
              Verde 1-2d (monitoreo) · Amarillo 3d (1ª alerta) · Naranja 4d (2ª alerta) · Rojo 5+d (3ª alerta, cierre de caso)
            </div>
          </div>
        </div>
        <div className="px-4 py-2.5 flex items-center gap-2 flex-wrap">
          <button
            onClick={() => abrirSemaforoPorNivel('AMARILLO')}
            className="text-[11px] font-bold text-white rounded-md px-2.5 py-1"
            style={{ backgroundColor: COLOR_NIVEL.AMARILLO }}
          >
            🟡 Amarillo — 1ª alerta ({guiasPorNivelSemaforo.AMARILLO.length})
          </button>
          <button
            onClick={() => abrirSemaforoPorNivel('NARANJA')}
            className="text-[11px] font-bold text-white rounded-md px-2.5 py-1"
            style={{ backgroundColor: COLOR_NIVEL.NARANJA }}
          >
            🟠 Naranja — 2ª alerta ({guiasPorNivelSemaforo.NARANJA.length})
          </button>
          <button
            onClick={() => abrirSemaforoPorNivel('ROJO')}
            className="text-[11px] font-bold text-white rounded-md px-2.5 py-1"
            style={{ backgroundColor: COLOR_NIVEL.ROJO }}
          >
            🔴 Rojo — 3ª alerta ({guiasPorNivelSemaforo.ROJO.length})
          </button>
        </div>

        <div className="px-4 pb-4">
          <div className="font-bold text-[12px] mb-2">Historial de Alertas por Guía ({historialPorGuia.length})</div>
          <div className="max-h-[400px] overflow-auto vg-scroll border border-[var(--vg-border)] rounded-md">
            <table className="vg-table">
              <thead>
                <tr>
                  <th>Guía</th>
                  <th>Cliente</th>
                  <th>Oficina Origen</th>
                  <th>Oficina Destino</th>
                  <th>Fecha Creación</th>
                  <th>Últ. Movimiento</th>
                  <th>Secuencia</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {historialPorGuia.map(([guia, eventos]) => {
                  const cerrado = eventos[eventos.length - 1].nivel === 'CERRADO';
                  const datosGuia = datosGuiaPorNumero.get(guia);
                  return (
                    <tr key={guia}>
                      <td className="font-mono font-semibold">{guia}</td>
                      <td>{datosGuia?.cliente || '—'}</td>
                      <td>{datosGuia?.of_origen || '—'}</td>
                      <td>{datosGuia?.oficina_destino || '—'}</td>
                      <td>{datosGuia?.f_documentacion || '—'}</td>
                      <td>{datosGuia?.f_historia || '—'}</td>
                      <td className="text-[11px]">
                        {eventos.map((ev, i) => (
                          <span key={ev.id}>
                            <span
                              className="inline-block text-[9.5px] font-bold text-white rounded px-1.5 py-[1px] mr-0.5"
                              style={{ backgroundColor: COLOR_NIVEL[ev.nivel] || '#6B7280' }}
                              title={ev.accion || ''}
                            >
                              {ev.nivel}
                            </span>
                            {i < eventos.length - 1 && <span className="text-[var(--vg-text3)] mx-0.5">→</span>}
                          </span>
                        ))}
                      </td>
                      <td className="whitespace-nowrap">
                        {!cerrado && (
                          <button
                            onClick={() => cerrarCaso(guia)}
                            className="text-[10px] font-semibold text-[var(--vg-text2)] border border-[var(--vg-border)] rounded px-1.5 py-0.5 hover:bg-[var(--vg-bg)] mr-1"
                          >
                            ✕ Cerrar
                          </button>
                        )}
                        <button
                          onClick={() => borrarAlerta(guia)}
                          className="text-[10px] font-semibold text-[var(--vg-red)] border border-[var(--vg-border)] rounded px-1.5 py-0.5 hover:bg-red-50"
                          title="Borra todo el historial de esta guía (no se puede deshacer)"
                        >
                          🗑 Borrar
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {!historialPorGuia.length && (
                  <tr>
                    <td colSpan={8} className="text-center text-[var(--vg-text3)] py-4">
                      Aún no hay alertas registradas
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-[var(--vg-border)] overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--vg-border)] flex items-center justify-between flex-wrap gap-2">
          <div>
            <div className="font-bold text-[13px]">Envío de Alertas por Correo</div>
            <div className="text-[11px] text-[var(--vg-text2)]">
              Un correo por oficina · incluye todas las acciones activas · {guiasConAccion.length.toLocaleString('es-MX')} guías con acción
            </div>
          </div>
          <button
            onClick={() => setMostrarContactos(!mostrarContactos)}
            className="text-[11.5px] font-semibold text-[var(--vg-blue)] border border-[var(--vg-blue)] rounded-md px-3 py-1.5"
          >
            📋 Gestionar contactos
          </button>
        </div>

        {/* Barra de alertas rápidas por tipo de acción */}
        <div className="px-4 py-2.5 border-b border-[var(--vg-border)] flex items-center gap-2 flex-wrap">
          <span className="text-[11px] font-bold text-[var(--vg-text2)]">📧 Alertas por acción:</span>
          <button
            onClick={abrirAlertaGeneral}
            className="text-[11px] font-bold text-white bg-[#0B1D3A] rounded-md px-2.5 py-1"
          >
            📢 Alerta general ({guiasConAccion.length})
          </button>
          {ACCIONES_RAPIDAS.map((accion) => {
            const n = conteoPorAccion[accion] || 0;
            if (!n) return null;
            return (
              <button
                key={accion}
                onClick={() => abrirAlertaPorAccion(accion)}
                style={{ backgroundColor: ACCION_COLORS[accion] || '#6B7280' }}
                className="text-[11px] font-semibold text-white rounded-md px-2.5 py-1"
              >
                {accion} ({n})
              </button>
            );
          })}
        </div>

        {mostrarContactos && (
          <div className="p-4 border-b border-[var(--vg-border)] bg-[var(--vg-bg)]">
            <div className="font-bold text-[12px] mb-2">
              Directorio de Contactos por Oficina · {contactos.length} oficinas
            </div>
            <div className="grid grid-cols-5 gap-2 mb-3">
              <input
                placeholder="Oficina"
                value={nuevoContacto.oficina}
                onChange={(e) => setNuevoContacto({ ...nuevoContacto, oficina: e.target.value.toUpperCase() })}
                className="text-[12px] border border-[var(--vg-border)] rounded-md px-2 py-1.5"
              />
              <input
                placeholder="Email (to)"
                value={nuevoContacto.email_to}
                onChange={(e) => setNuevoContacto({ ...nuevoContacto, email_to: e.target.value })}
                className="text-[12px] border border-[var(--vg-border)] rounded-md px-2 py-1.5"
              />
              <input
                placeholder="Email (cc)"
                value={nuevoContacto.email_cc}
                onChange={(e) => setNuevoContacto({ ...nuevoContacto, email_cc: e.target.value })}
                className="text-[12px] border border-[var(--vg-border)] rounded-md px-2 py-1.5"
              />
              <input
                placeholder="Jefe"
                value={nuevoContacto.jefe}
                onChange={(e) => setNuevoContacto({ ...nuevoContacto, jefe: e.target.value })}
                className="text-[12px] border border-[var(--vg-border)] rounded-md px-2 py-1.5"
              />
              <button
                onClick={guardarContacto}
                className="text-[12px] font-semibold text-white bg-[var(--vg-blue)] rounded-md px-2 py-1.5"
              >
                + Agregar / Actualizar
              </button>
            </div>
            <div className="max-h-[300px] overflow-y-auto vg-scroll">
              <table className="vg-table">
                <thead>
                  <tr>
                    <SortableTh label="Oficina" sortKey="oficina" currentKey={contactosOrden.sortKey} currentDir={contactosOrden.sortDir} onSort={contactosOrden.requestSort} />
                    <SortableTh label="To" sortKey="to" currentKey={contactosOrden.sortKey} currentDir={contactosOrden.sortDir} onSort={contactosOrden.requestSort} />
                    <SortableTh label="CC" sortKey="cc" currentKey={contactosOrden.sortKey} currentDir={contactosOrden.sortDir} onSort={contactosOrden.requestSort} />
                    <SortableTh label="Jefe" sortKey="jefe" currentKey={contactosOrden.sortKey} currentDir={contactosOrden.sortDir} onSort={contactosOrden.requestSort} />
                  </tr>
                </thead>
                <tbody>
                  {contactosOrden.sorted.map((c) => (
                    <tr key={c.id}>
                      <td className="font-medium">{c.oficina}</td>
                      <td>{c.email_to}</td>
                      <td>{c.email_cc}</td>
                      <td>{c.jefe}</td>
                    </tr>
                  ))}
                  {!contactos.length && (
                    <tr>
                      <td colSpan={4} className="text-center text-[var(--vg-text3)] py-4">
                        No hay contactos cargados. Corre <code>supabase_seed_contactos.sql</code> en Supabase para
                        precargar el directorio AFIMEX, o agrégalos aquí manualmente.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {mensaje && (
          <div className="px-4 py-2 text-[12px] text-[var(--vg-text2)] font-semibold flex justify-between items-center">
            <span>{mensaje}</span>
            <button onClick={() => setMensaje(null)} className="text-[var(--vg-text3)]">
              ✕
            </button>
          </div>
        )}

        <div className="max-h-[560px] overflow-y-auto vg-scroll">
          <table className="vg-table">
            <thead>
              <tr>
                <SortableTh label="Oficina" sortKey="oficina" currentKey={porOficinaOrden.sortKey} currentDir={porOficinaOrden.sortDir} onSort={porOficinaOrden.requestSort} />
                <SortableTh label="Guías con Acción" sortKey="guias" currentKey={porOficinaOrden.sortKey} currentDir={porOficinaOrden.sortDir} onSort={porOficinaOrden.requestSort} />
                <SortableTh label="Contacto" sortKey="contacto" currentKey={porOficinaOrden.sortKey} currentDir={porOficinaOrden.sortDir} onSort={porOficinaOrden.requestSort} />
                <th></th>
              </tr>
            </thead>
            <tbody>
              {porOficinaOrden.sorted.map(([oficina, lista]) => {
                const contacto = contactos.find((c) => c.oficina === oficina);
                return (
                  <tr key={oficina}>
                    <td className="font-medium">{oficina}</td>
                    <td>{lista.length}</td>
                    <td>{contacto ? contacto.email_to : <span className="text-[var(--vg-red)]">Sin contacto</span>}</td>
                    <td>
                      <button
                        onClick={() => {
                          setModalTitulo(`Alerta — ${oficina}`);
                          setModalGuias(lista);
                          setModalAbierto(true);
                        }}
                        className="text-[11px] font-semibold text-white bg-[var(--vg-blue)] rounded-md px-2.5 py-1"
                      >
                        📧 Enviar alerta
                      </button>
                    </td>
                  </tr>
                );
              })}
              {!porOficina.length && (
                <tr>
                  <td colSpan={4} className="text-center text-[var(--vg-text3)] py-6">
                    No hay guías que requieran alerta en este momento
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <AlertaPreviewModal
        open={modalAbierto}
        onClose={() => setModalAbierto(false)}
        titulo={modalTitulo}
        porOficina={porOficinaModal}
        contactos={contactos}
        onEnviado={() => setMensaje('✅ Proceso de envío completado')}
      />

      {modalSemaforo && (
        <SemaforoAlertaModal
          open={modalSemaforo}
          onClose={() => setModalSemaforo(false)}
          guiasSeleccionadas={modalSemaforoGuias}
          contactos={contactos}
          onCompletado={() => {
            recargarHistorialAlertas();
            setMensaje('✅ Alertas de semáforo registradas');
          }}
        />
      )}
    </div>
  );
}
