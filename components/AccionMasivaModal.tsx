'use client';

import { useState, useMemo } from 'react';
import { Guia, ContactoOficina } from '@/lib/types';
import { buildMailtoUrl } from '@/lib/business-logic';

export type TipoAccionMasiva = 'REPROGRAMAR' | 'DEVOLVER';

interface AccionMasivaModalProps {
  open: boolean;
  onClose: () => void;
  tipo: TipoAccionMasiva;
  guiasSeleccionadas: Guia[];
  contactos: ContactoOficina[];
  onCompletado: () => void;
}

const CONFIG: Record<TipoAccionMasiva, { titulo: string; verbo: string; color: string; emoji: string }> = {
  REPROGRAMAR: { titulo: 'Reprogramar guías', verbo: 'Reprogramación', color: '#1E3A8A', emoji: '🔄' },
  DEVOLVER: { titulo: 'Devolver guías', verbo: 'Devolución', color: '#7F1D1D', emoji: '↩' },
};

export default function AccionMasivaModal({
  open,
  onClose,
  tipo,
  guiasSeleccionadas,
  contactos,
  onCompletado,
}: AccionMasivaModalProps) {
  const [nota, setNota] = useState('');
  const [fechaReprogramada, setFechaReprogramada] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [oficinasEnviadas, setOficinasEnviadas] = useState<Set<string>>(new Set());
  const [registrado, setRegistrado] = useState(false);

  const cfg = CONFIG[tipo];

  const porOficina = useMemo(() => {
    const grupos: Record<string, Guia[]> = {};
    guiasSeleccionadas.forEach((g) => {
      const of = g.oficina_destino || 'SIN OFICINA';
      if (!grupos[of]) grupos[of] = [];
      grupos[of].push(g);
    });
    return Object.entries(grupos).sort((a, b) => a[0].localeCompare(b[0]));
  }, [guiasSeleccionadas]);

  if (!open) return null;

  function contactoDe(oficina: string) {
    return contactos.find((c) => c.oficina === oficina);
  }

  function enviarCorreoOficina(oficina: string, lista: Guia[]) {
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
        } | Últ. Mov: ${g.f_historia || '—'}${
          tipo === 'REPROGRAMAR' && fechaReprogramada ? ` | Nueva fecha: ${fechaReprogramada}` : ''
        }`
    );

    const introTexto =
      tipo === 'DEVOLVER'
        ? `Se han autorizado las siguientes devoluciones en la Oficina ${oficina}. Por favor generar la guía de retorno correspondiente a la brevedad.`
        : `Se solicita la reprogramación de las siguientes guías en la Oficina ${oficina}. Por favor confirmar la nueva fecha de entrega a la brevedad.`;

    const cierreTexto =
      tipo === 'DEVOLVER'
        ? 'Por favor confirmar la recepción y el número de guía de retorno generada.'
        : 'Por favor confirmar la recepción y la nueva fecha de entrega programada.\n\nNota: Si alguna guía tiene como excepción "COD Rechazado" o "Cliente Canceló" y se cuenta con prueba, pueden proceder con la devolución.';

    const cuerpoTexto = [
      'Estimado equipo,',
      '',
      introTexto,
      '',
      ...lineas,
      '',
      nota ? `Nota: ${nota}` : '',
      nota ? '' : '',
      cierreTexto,
      '',
      `Generado el ${fechaGenerado} · VIGÍA Dashboard — AFIMEX`,
    ]
      .filter((l, i, arr) => l !== '' || arr[i - 1] !== '')
      .join('\n');

    const asuntoTexto = tipo === 'DEVOLVER'
      ? `[AFIMEX] [${cliente}] Devolución Autorizada — ${lista.length} guía${lista.length === 1 ? '' : 's'} · Oficina ${oficina}`
      : `[AFIMEX] [${cliente}] Solicitud de Reprogramación — ${lista.length} guía${lista.length === 1 ? '' : 's'} · Oficina ${oficina}`;

    const mailto = buildMailtoUrl(para, { cc, subject: asuntoTexto, body: cuerpoTexto });
    const link = document.createElement('a');
    link.href = mailto;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setOficinasEnviadas((prev) => new Set(prev).add(oficina));

    // Registrar el envío en el historial de correos (igual que los demás modales)
    fetch('/api/alertas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        oficina,
        guias_incluidas: lista.map((g) => g.guia),
              cliente: lista[0]?.cliente || '',
              tipo_solicitud: tipo === 'REPROGRAMAR' ? 'Reprogramación' : 'Devolución',
        total_guias: lista.length,
        enviado_a: para,
      }),
    }).catch(() => {});
  }

  async function registrarAcciones() {
    setEnviando(true);
    try {
      await Promise.all(
        guiasSeleccionadas.map((g) =>
          fetch('/api/acciones', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              guia: g.guia,
              accion: tipo,
              nota: [nota, fechaReprogramada ? `Nueva fecha: ${fechaReprogramada}` : ''].filter(Boolean).join(' · '),
            }),
          })
        )
      );
      setRegistrado(true);
      onCompletado();
    } finally {
      setEnviando(false);
    }
  }

  function cerrar() {
    setNota('');
    setFechaReprogramada('');
    setOficinasEnviadas(new Set());
    setRegistrado(false);
    onClose();
  }

  const conCorreo = porOficina.filter(([of]) => contactoDe(of)?.email_to);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-2xl w-full max-h-[88vh] overflow-y-auto vg-scroll p-6">
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-bold text-lg">
            {cfg.emoji} {cfg.titulo}
          </h2>
          <button onClick={cerrar} className="text-[var(--vg-text2)] text-xl leading-none">
            ✕
          </button>
        </div>
        <p className="text-[12px] text-[var(--vg-text2)] mb-4">
          {guiasSeleccionadas.length} guía(s) seleccionada(s) · {porOficina.length} oficina(s)
        </p>

        {tipo === 'REPROGRAMAR' && (
          <div className="mb-3">
            <label className="text-[11px] font-semibold text-[var(--vg-text2)] block mb-1">
              Nueva fecha de entrega (opcional)
            </label>
            <input
              type="date"
              value={fechaReprogramada}
              onChange={(e) => setFechaReprogramada(e.target.value)}
              className="text-[12px] border border-[var(--vg-border)] rounded-md px-2.5 py-1.5"
            />
          </div>
        )}

        <div className="mb-4">
          <label className="text-[11px] font-semibold text-[var(--vg-text2)] block mb-1">Nota (opcional)</label>
          <textarea
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            rows={2}
            placeholder={tipo === 'DEVOLVER' ? 'Motivo de la devolución...' : 'Motivo de la reprogramación...'}
            className="w-full text-[12px] border border-[var(--vg-border)] rounded-md p-2"
          />
        </div>

        <div className="border border-[var(--vg-border)] rounded-lg overflow-hidden mb-4">
          <table className="vg-table">
            <thead>
              <tr>
                <th>Oficina</th>
                <th>Guías</th>
                <th>Correo</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {porOficina.map(([oficina, lista]) => {
                const contacto = contactoDe(oficina);
                const enviado = oficinasEnviadas.has(oficina);
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
                    <td>
                      {enviado ? (
                        <span className="text-[var(--vg-green)] font-bold text-[11px]">✅ Enviado</span>
                      ) : (
                        <button
                          disabled={!contacto?.email_to}
                          onClick={() => enviarCorreoOficina(oficina, lista)}
                          className="text-[11px] font-semibold text-white rounded-md px-2.5 py-1 disabled:opacity-30"
                          style={{ backgroundColor: cfg.color }}
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

        {registrado && (
          <div className="text-[12px] text-[var(--vg-green)] font-semibold mb-3">
            ✅ {guiasSeleccionadas.length} guía(s) registradas como {tipo === 'REPROGRAMAR' ? 'reprogramadas' : 'devueltas'}
          </div>
        )}

        <div className="flex justify-between items-center">
          <span className="text-[11px] text-[var(--vg-text2)]">
            {oficinasEnviadas.size} de {conCorreo.length} oficinas con correo enviadas
          </span>
          <div className="flex gap-2">
            <button
              onClick={cerrar}
              className="text-[12px] font-semibold text-[var(--vg-text2)] border border-[var(--vg-border)] rounded-md px-3 py-1.5"
            >
              Cerrar
            </button>
            <button
              onClick={registrarAcciones}
              disabled={enviando || registrado}
              className="text-[12px] font-semibold text-white rounded-md px-3 py-1.5 disabled:opacity-50"
              style={{ backgroundColor: cfg.color }}
            >
              {enviando ? 'Registrando...' : registrado ? 'Registrado' : `Registrar ${cfg.verbo.toLowerCase()}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
