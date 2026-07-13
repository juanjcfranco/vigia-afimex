'use client';

import { useEffect, useMemo, useState } from 'react';
import { Guia, ContactoOficina, ACCION_COLORS } from '@/lib/types';
import { isAbierta, accionEfectiva } from '@/lib/business-logic';
import AlertaPreviewModal from '@/components/AlertaPreviewModal';
import { useSortableTable } from '@/lib/useSortableTable';
import SortableTh from '@/components/SortableTh';

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

  return (
    <div className="p-5 space-y-4">
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
    </div>
  );
}
