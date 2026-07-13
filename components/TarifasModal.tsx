'use client';

import { useEffect, useState } from 'react';
import { TarifaCliente } from '@/lib/types';

const CLIENTES_HABITUALES = ['MERQ', 'MENVELO', 'SARTEN FLAVOR', 'KIKI LOGISTICS MX', 'YEGO'];

interface TarifasModalProps {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

const CAMPOS: { key: keyof TarifaCliente; label: string; color: string }[] = [
  { key: 'tarifa_entrega_original', label: 'Entrega Original ($)', color: '#0B9B67' },
  { key: 'tarifa_devolucion', label: 'Devolución ($)', color: '#DC2626' },
  { key: 'tarifa_retorno_entregado', label: 'Retorno Entregado ($)', color: '#7C3AED' },
  { key: 'tarifa_posible_retorno', label: 'Posible Retorno ($)', color: '#B45309' },
];

export default function TarifasModal({ open, onClose, onSaved }: TarifasModalProps) {
  const [tarifas, setTarifas] = useState<Record<string, TarifaCliente>>({});
  const [loading, setLoading] = useState(false);
  const [guardando, setGuardando] = useState<string | null>(null);
  const [guardado, setGuardado] = useState<string | null>(null);
  const [nuevoCliente, setNuevoCliente] = useState('');

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch('/api/tarifas')
      .then((r) => r.json())
      .then((j) => {
        const map: Record<string, TarifaCliente> = {};
        (j.tarifas || []).forEach((t: TarifaCliente) => {
          map[t.cliente] = t;
        });
        setTarifas(map);
      })
      .finally(() => setLoading(false));
  }, [open]);

  const getTarifa = (cliente: string): TarifaCliente =>
    tarifas[cliente] || {
      id: '',
      cliente,
      tarifa_entrega_original: 100,
      tarifa_devolucion: 40,
      tarifa_retorno_entregado: 100,
      tarifa_posible_retorno: 40,
      actualizado_en: '',
    };

  function actualizar(cliente: string, campo: keyof TarifaCliente, valor: number) {
    setTarifas((prev) => ({
      ...prev,
      [cliente]: { ...getTarifa(cliente), [campo]: valor },
    }));
  }

  async function guardar(cliente: string) {
    setGuardando(cliente);
    const t = getTarifa(cliente);
    await fetch('/api/tarifas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(t),
    });
    setGuardando(null);
    setGuardado(cliente);
    setTimeout(() => setGuardado(null), 2000);
    // Avisa al módulo que abrió el modal (Facturación, Cierre) para que
    // vuelva a pedir la tarifa guardada y se refleje de inmediato, sin
    // tener que volver a cargar el Excel ni reabrir la pantalla.
    onSaved?.();
  }

  function agregarCliente() {
    const nombre = nuevoCliente.trim().toUpperCase();
    if (!nombre || tarifas[nombre]) return;
    setTarifas((prev) => ({ ...prev, [nombre]: getTarifa(nombre) }));
    setNuevoCliente('');
  }

  const clientes = [...new Set([...CLIENTES_HABITUALES, ...Object.keys(tarifas)])].sort();

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto vg-scroll p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-bold text-lg">⚙️ Tarifas por Cliente</h2>
            <p className="text-[12px] text-[var(--vg-text2)]">
              Configura los montos a facturar por tipo de guía para cada cliente
            </p>
          </div>
          <button onClick={onClose} className="text-[var(--vg-text2)] text-xl leading-none">
            ✕
          </button>
        </div>

        {loading ? (
          <div className="text-center py-8 text-[var(--vg-text3)]">Cargando tarifas...</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="vg-table w-full">
                <thead>
                  <tr>
                    <th className="text-left">Cliente</th>
                    {CAMPOS.map((c) => (
                      <th key={c.key} style={{ color: c.color }}>
                        {c.label}
                      </th>
                    ))}
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {clientes.map((cliente) => {
                    const t = getTarifa(cliente);
                    const esFav = CLIENTES_HABITUALES.includes(cliente);
                    return (
                      <tr key={cliente}>
                        <td>
                          <span className="font-semibold">{cliente}</span>
                          {esFav && (
                            <span className="ml-1.5 text-[9px] font-bold text-white bg-[var(--vg-blue)] rounded-full px-1.5 py-0.5">
                              habitual
                            </span>
                          )}
                        </td>
                        {CAMPOS.map((campo) => (
                          <td key={campo.key}>
                            <div className="flex items-center gap-0.5">
                              <span className="text-[11px] text-[var(--vg-text2)]">$</span>
                              <input
                                type="number"
                                min={0}
                                step={0.01}
                                value={t[campo.key] as number}
                                onChange={(e) =>
                                  actualizar(cliente, campo.key, parseFloat(e.target.value) || 0)
                                }
                                className="w-20 text-[12px] border border-[var(--vg-border)] rounded px-1.5 py-0.5 text-right"
                                style={{ borderColor: campo.color + '44' }}
                              />
                            </div>
                          </td>
                        ))}
                        <td>
                          {guardado === cliente ? (
                            <span className="text-[var(--vg-green)] font-bold text-[11px]">✅ Guardado</span>
                          ) : (
                            <button
                              onClick={() => guardar(cliente)}
                              disabled={guardando === cliente}
                              className="text-[11px] font-semibold text-white bg-[var(--vg-blue)] rounded-md px-2.5 py-1 disabled:opacity-50"
                            >
                              {guardando === cliente ? '...' : 'Guardar'}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex items-center gap-2">
              <input
                value={nuevoCliente}
                onChange={(e) => setNuevoCliente(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === 'Enter' && agregarCliente()}
                placeholder="Agregar cliente nuevo..."
                className="text-[12px] border border-[var(--vg-border)] rounded-md px-2.5 py-1.5 flex-1"
              />
              <button
                onClick={agregarCliente}
                className="text-[12px] font-semibold text-white bg-[var(--vg-blue)] rounded-md px-3 py-1.5"
              >
                + Agregar
              </button>
            </div>

            <p className="mt-2 text-[11px] text-[var(--vg-text3)]">
              Los cambios se guardan de inmediato y se aplican en tiempo real en Facturación y en el Reporte de Cierre — no hace falta volver a cargar el Excel.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
