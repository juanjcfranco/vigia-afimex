'use client';

import { useState } from 'react';
import { Guia, ContactoOficina } from '@/lib/types';
import { getExcepciones, buildMailtoUrl } from '@/lib/business-logic';

interface AlertaPreviewModalProps {
  open: boolean;
  onClose: () => void;
  titulo: string;
  porOficina: [string, Guia[]][];
  contactos: ContactoOficina[];
  onEnviado: () => void;
}

export default function AlertaPreviewModal({
  open,
  onClose,
  titulo,
  porOficina,
  contactos,
  onEnviado,
}: AlertaPreviewModalProps) {
  const [enviadas, setEnviadas] = useState<Set<string>>(new Set());
  const [enviandoTodo, setEnviandoTodo] = useState(false);

  if (!open) return null;

  function contactoDe(oficina: string) {
    return contactos.find((c) => c.oficina === oficina);
  }

  async function enviarUna(oficina: string, lista: Guia[]) {
    const contacto = contactoDe(oficina);
    const para = contacto?.email_to || '';
    if (!para) return;
    const cc = contacto?.email_cc || '';
    const cliente = lista[0]?.cliente || '';

    const fechaGenerado = new Date().toLocaleString('es-MX', {
      weekday: 'long',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    const lineas = lista.map(
      (g, i) =>
        `${i + 1}. Guía: ${g.guia} | Desc: ${g.descripcion || '—'} | Estado: ${g.estado_guia || '—'} | Destino: ${
          g.oficina_destino || '—'
        } | Últ. Mov: ${g.f_historia || '—'} | Acción: ${g.accion_recomendada || '—'} | Última excepción: ${
          getExcepciones(g).slice(-1)[0] || '—'
        }`
    );

    const cuerpoTexto = [
      'Estimado equipo,',
      '',
      `Las siguientes guías en la Oficina ${oficina} requieren atención según ${titulo}.`,
      '',
      ...lineas,
      '',
      'Por favor verificar el estatus de cada guía y dar seguimiento a la brevedad.',
      '',
      `Generado el ${fechaGenerado} · VIGÍA Dashboard — AFIMEX`,
    ].join('\n');

    const asuntoTexto = `[AFIMEX] [${cliente}] ${titulo} — ${lista.length} guía${lista.length === 1 ? '' : 's'} · Oficina ${oficina}`;

    const mailto = buildMailtoUrl(para, { cc, subject: asuntoTexto, body: cuerpoTexto });

    // No usar un target compartido como '_blank' repetido: el navegador/cliente
    // de correo puede reusar la misma ventana y bloquear el segundo mailto.
    // Crear y hacer clic en un link temporal evita ese bloqueo.
    const link = document.createElement('a');
    link.href = mailto;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    await fetch('/api/alertas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        oficina,
        guias_incluidas: lista.map((g) => g.guia),
        total_guias: lista.length,
        enviado_a: para,
      }),
    });

    setEnviadas((prev) => new Set(prev).add(oficina));
  }

  async function enviarTodas() {
    setEnviandoTodo(true);
    for (const [oficina, lista] of porOficina) {
      const contacto = contactoDe(oficina);
      if (contacto?.email_to && !enviadas.has(oficina)) {
        await enviarUna(oficina, lista);
        // pequeña pausa para que el navegador no bloquee múltiples ventanas mailto seguidas
        await new Promise((r) => setTimeout(r, 400));
      }
    }
    setEnviandoTodo(false);
    onEnviado();
  }

  const conCorreo = porOficina.filter(([of]) => contactoDe(of)?.email_to);
  const sinCorreo = porOficina.filter(([of]) => !contactoDe(of)?.email_to);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-2xl w-full max-h-[88vh] overflow-y-auto vg-scroll p-6">
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-bold text-lg">📢 {titulo}</h2>
          <button onClick={onClose} className="text-[var(--vg-text2)] text-xl leading-none">
            ✕
          </button>
        </div>
        <p className="text-[12px] text-[var(--vg-text2)] mb-4">
          {porOficina.length} oficinas · {porOficina.reduce((s, [, l]) => s + l.length, 0)} guías totales
          {sinCorreo.length > 0 && ` · ${sinCorreo.length} sin correo configurado`}
        </p>

        <div className="border border-[var(--vg-border)] rounded-lg overflow-hidden mb-4">
          <table className="vg-table">
            <thead>
              <tr>
                <th>Oficina</th>
                <th>Guías</th>
                <th>Correo</th>
                <th>Vista previa</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {[...conCorreo, ...sinCorreo].map(([oficina, lista]) => {
                const contacto = contactoDe(oficina);
                const enviado = enviadas.has(oficina);
                const muestra = lista
                  .slice(0, 4)
                  .map((g) => g.guia)
                  .join(', ');
                return (
                  <tr key={oficina}>
                    <td className="font-medium">{oficina}</td>
                    <td>
                      <span className="bg-[var(--vg-blue-light)] text-[var(--vg-blue)] rounded-full px-2 py-0.5 font-bold">
                        {lista.length}
                      </span>
                    </td>
                    <td>
                      {contacto?.email_to ? (
                        <span className="text-[11px]">{contacto.email_to}</span>
                      ) : (
                        <span className="text-[var(--vg-red)] text-[11px] font-semibold">Sin correo</span>
                      )}
                    </td>
                    <td className="text-[10.5px] text-[var(--vg-text3)]">
                      {muestra}
                      {lista.length > 4 ? ' +más' : ''}
                    </td>
                    <td>
                      {enviado ? (
                        <span className="text-[var(--vg-green)] font-bold text-[11px]">✅ Enviado</span>
                      ) : (
                        <button
                          disabled={!contacto?.email_to}
                          onClick={() => enviarUna(oficina, lista)}
                          className="text-[11px] font-semibold text-white bg-[var(--vg-blue)] rounded-md px-2.5 py-1 disabled:opacity-30"
                        >
                          Enviar
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex justify-between items-center">
          <span className="text-[11px] text-[var(--vg-text2)]">
            {enviadas.size} de {conCorreo.length} oficinas con correo enviadas
          </span>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="text-[12px] font-semibold text-[var(--vg-text2)] border border-[var(--vg-border)] rounded-md px-3 py-1.5"
            >
              Cerrar
            </button>
            <button
              onClick={enviarTodas}
              disabled={enviandoTodo || conCorreo.length === 0}
              className="text-[12px] font-semibold text-white bg-[#0B1D3A] rounded-md px-3 py-1.5 disabled:opacity-50"
            >
              {enviandoTodo ? 'Enviando...' : `📢 Enviar todas (${conCorreo.length - enviadas.size} pendientes)`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
