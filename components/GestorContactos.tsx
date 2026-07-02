'use client';

import { useEffect, useState } from 'react';
import { ContactoOficina } from '@/lib/types';

interface GestorContactosProps {
  open: boolean;
  onClose: () => void;
}

const VACIO: Partial<ContactoOficina> = {
  oficina: '',
  email_to: '',
  email_cc: '',
  jefe_oficina: '',
};

export default function GestorContactos({ open, onClose }: GestorContactosProps) {
  const [contactos, setContactos] = useState<ContactoOficina[]>([]);
  const [loading, setLoading] = useState(false);
  const [editando, setEditando] = useState<Record<string, Partial<ContactoOficina>>>({});
  const [guardando, setGuardando] = useState<Set<string>>(new Set());
  const [guardado, setGuardado] = useState<Set<string>>(new Set());
  const [nuevoForm, setNuevoForm] = useState<typeof VACIO>({ ...VACIO });
  const [agregando, setAgregando] = useState(false);
  const [busqueda, setBusqueda] = useState('');

  useEffect(() => {
    if (!open) return;
    cargar();
  }, [open]);

  async function cargar() {
    setLoading(true);
    const r = await fetch('/api/contactos');
    const j = await r.json();
    setContactos(j.contactos || []);
    setLoading(false);
  }

  function startEdit(c: ContactoOficina) {
    setEditando((prev) => ({
      ...prev,
      [c.id]: { oficina: c.oficina, email_to: c.email_to || '', email_cc: c.email_cc || '', jefe_oficina: c.jefe_oficina || '' },
    }));
  }

  function cancelEdit(id: string) {
    setEditando((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  async function guardar(id: string) {
    const datos = editando[id];
    if (!datos) return;
    setGuardando((prev) => new Set(prev).add(id));
    await fetch('/api/contactos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(datos),
    });
    setGuardando((prev) => {
      const s = new Set(prev); s.delete(id); return s;
    });
    setGuardado((prev) => new Set(prev).add(id));
    setTimeout(() => setGuardado((prev) => { const s = new Set(prev); s.delete(id); return s; }), 2000);
    cancelEdit(id);
    cargar();
  }

  async function eliminar(id: string) {
    if (!confirm('¿Eliminar este contacto?')) return;
    await fetch(`/api/contactos?id=${id}`, { method: 'DELETE' });
    cargar();
  }

  async function agregarNuevo() {
    if (!nuevoForm.oficina) return;
    setAgregando(true);
    await fetch('/api/contactos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(nuevoForm),
    });
    setNuevoForm({ ...VACIO });
    setAgregando(false);
    cargar();
  }

  const filtrados = contactos.filter((c) =>
    !busqueda || c.oficina.toLowerCase().includes(busqueda.toLowerCase())
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto vg-scroll p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-bold text-lg">📋 Gestor de Contactos de Oficinas</h2>
            <p className="text-[12px] text-[var(--vg-text2)]">
              {contactos.length} oficinas registradas · Edita directamente en la tabla
            </p>
          </div>
          <button onClick={onClose} className="text-[var(--vg-text2)] text-xl leading-none">✕</button>
        </div>

        <div className="flex items-center gap-2 mb-3">
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar oficina..."
            className="text-[12px] border border-[var(--vg-border)] rounded-md px-2.5 py-1.5 flex-1"
          />
          <span className="text-[11px] text-[var(--vg-text2)]">{filtrados.length} resultados</span>
        </div>

        {loading ? (
          <div className="text-center py-8 text-[var(--vg-text3)]">Cargando...</div>
        ) : (
          <div className="border border-[var(--vg-border)] rounded-lg overflow-hidden mb-4">
            <table className="vg-table">
              <thead>
                <tr>
                  <th>Oficina</th>
                  <th>Email principal</th>
                  <th>Email CC</th>
                  <th>Responsable</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((c) => {
                  const enEdicion = !!editando[c.id];
                  const vals = editando[c.id] || {};
                  return (
                    <tr key={c.id}>
                      <td className="font-semibold">
                        {enEdicion ? (
                          <input
                            value={vals.oficina || ''}
                            onChange={(e) => setEditando((p) => ({ ...p, [c.id]: { ...p[c.id], oficina: e.target.value.toUpperCase() } }))}
                            className="w-full text-[11px] border border-[var(--vg-border)] rounded px-1.5 py-0.5"
                          />
                        ) : c.oficina}
                      </td>
                      <td>
                        {enEdicion ? (
                          <input
                            value={vals.email_to || ''}
                            onChange={(e) => setEditando((p) => ({ ...p, [c.id]: { ...p[c.id], email_to: e.target.value } }))}
                            className="w-full text-[11px] border border-[var(--vg-border)] rounded px-1.5 py-0.5"
                            placeholder="correo@dominio.com"
                          />
                        ) : <span className="text-[11px]">{c.email_to || '—'}</span>}
                      </td>
                      <td>
                        {enEdicion ? (
                          <input
                            value={vals.email_cc || ''}
                            onChange={(e) => setEditando((p) => ({ ...p, [c.id]: { ...p[c.id], email_cc: e.target.value } }))}
                            className="w-full text-[11px] border border-[var(--vg-border)] rounded px-1.5 py-0.5"
                            placeholder="cc@dominio.com"
                          />
                        ) : <span className="text-[11px]">{c.email_cc || '—'}</span>}
                      </td>
                      <td>
                        {enEdicion ? (
                          <input
                            value={vals.jefe_oficina || ''}
                            onChange={(e) => setEditando((p) => ({ ...p, [c.id]: { ...p[c.id], jefe_oficina: e.target.value } }))}
                            className="w-full text-[11px] border border-[var(--vg-border)] rounded px-1.5 py-0.5"
                            placeholder="Nombre responsable"
                          />
                        ) : <span className="text-[11px]">{c.jefe_oficina || '—'}</span>}
                      </td>
                      <td>
                        <div className="flex gap-1 items-center">
                          {guardado.has(c.id) ? (
                            <span className="text-[var(--vg-green)] text-[11px] font-bold">✅</span>
                          ) : enEdicion ? (
                            <>
                              <button
                                onClick={() => guardar(c.id)}
                                disabled={guardando.has(c.id)}
                                className="text-[10.5px] font-bold text-white bg-[var(--vg-blue)] rounded px-2 py-0.5 disabled:opacity-50"
                              >
                                {guardando.has(c.id) ? '...' : 'Guardar'}
                              </button>
                              <button
                                onClick={() => cancelEdit(c.id)}
                                className="text-[10.5px] text-[var(--vg-text2)] border border-[var(--vg-border)] rounded px-2 py-0.5"
                              >
                                Cancelar
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={() => startEdit(c)}
                                className="text-[10.5px] font-semibold text-[var(--vg-blue)] border border-[var(--vg-blue)]/30 rounded px-2 py-0.5"
                              >
                                ✏️ Editar
                              </button>
                              <button
                                onClick={() => eliminar(c.id)}
                                className="text-[10.5px] text-[var(--vg-red)] border border-red-200 rounded px-2 py-0.5"
                              >
                                🗑
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Formulario de nueva oficina */}
        <div className="border border-[var(--vg-border)] rounded-lg p-3">
          <div className="font-semibold text-[12px] mb-2">+ Agregar nueva oficina</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <input
              value={nuevoForm.oficina || ''}
              onChange={(e) => setNuevoForm((p) => ({ ...p, oficina: e.target.value.toUpperCase() }))}
              placeholder="NOMBRE OFICINA"
              className="text-[11px] border border-[var(--vg-border)] rounded px-2 py-1.5"
            />
            <input
              value={nuevoForm.email_to || ''}
              onChange={(e) => setNuevoForm((p) => ({ ...p, email_to: e.target.value }))}
              placeholder="correo@dominio.com"
              className="text-[11px] border border-[var(--vg-border)] rounded px-2 py-1.5"
            />
            <input
              value={nuevoForm.email_cc || ''}
              onChange={(e) => setNuevoForm((p) => ({ ...p, email_cc: e.target.value }))}
              placeholder="cc@dominio.com (opcional)"
              className="text-[11px] border border-[var(--vg-border)] rounded px-2 py-1.5"
            />
            <input
              value={nuevoForm.jefe_oficina || ''}
              onChange={(e) => setNuevoForm((p) => ({ ...p, jefe_oficina: e.target.value }))}
              placeholder="Responsable (opcional)"
              className="text-[11px] border border-[var(--vg-border)] rounded px-2 py-1.5"
            />
          </div>
          <button
            onClick={agregarNuevo}
            disabled={!nuevoForm.oficina || agregando}
            className="mt-2 text-[12px] font-semibold text-white bg-[var(--vg-blue)] rounded-md px-3 py-1.5 disabled:opacity-40"
          >
            {agregando ? 'Agregando...' : 'Agregar'}
          </button>
        </div>
      </div>
    </div>
  );
}
