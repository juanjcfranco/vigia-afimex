'use client';

import { useState, useMemo } from 'react';
import { Guia, ContactoOficina } from '@/lib/types';
import { buildMailtoUrl } from '@/lib/business-logic';

interface AlertaCriticaModalProps {
  open: boolean;
  onClose: () => void;
  guias: Guia[];
  contactos: ContactoOficina[];
  onCompletado: () => void;
}

export default function AlertaCriticaModal({
  open,
  onClose,
  guias,
  contactos,
  onCompletado,
}: AlertaCriticaModalProps) {
  const [oficinasEnviadas, setOficinasEnviadas] = useState<Set<string>>(new Set());
  const [registrado, setRegistrado] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const porOficina = useMemo(() => {
    const grupos: Record<string, Guia[]> = {};
    guias.forEach((g) => {
      const of = g.oficina_destino || 'SIN OFICINA';
      if (!grupos[of]) grupos[of] = [];
      grupos[of].push(g);
    });
    return Object.entries(grupos).sort((a, b) => a[0].localeCompare(b[0]));
  }, [guias]);

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
        } | Últ. Mov: ${g.f_historia || '—'} | Días sin movimiento: ${g.dias_sin_movimiento ?? '—'}`
    );

    const cuerpoTexto = [
      'Estimado equipo,',
      '',
      `Se han detectado guías en ESTADO CRÍTICO en la Oficina ${oficina}. Se requiere acción inmediata.`,
      '',
      `La oficina contará con un máximo de 3 días para localizar el paquete o compartir al responsable de la pérdida.`,
      '',
      ...lineas,
      '',
      'Por favor confirmar la recepción y reportar el estatus de cada guía a la brevedad.',
      '',
      `Generado el ${fechaGenerado} · VIGÍA Dashboard — AFIMEX`,
    ].join('\n');

    const asuntoTexto = `[AFIMEX] [${cliente}] 🚨 Estado Crítico — ${lista.length} guía${lista.length === 1 ? '' : 's'} · Oficina ${oficina}`;

    const mailto = buildMailtoUrl(para, { cc, subject: asuntoTexto, body: cuerpoTexto });
    const link = document.createElement('a');
    link.href = mailto;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setOficinasEnviadas((prev) => new Set(prev).add(oficina));

    // Registrar en historial
    fetch('/api/alertas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        oficina,
        guias_incluidas: lista.map((g) => g.guia),
              cliente: lista[0]?.cliente || '',
              tipo_solicitud: 'Estado Crítico',
        total_guias: lista.length,
        enviado_a: para,
      }),
    }).catch(() => {});
  }

  async function registrar() {
    setEnviando(true);
    try {
      await Promise.all(
        guias.map((g) =>
          fetch('/api/acciones', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              guia: g.guia,
              accion: 'ESTADO_CRITICO',
              nota: `${g.dias_sin_movimiento}d sin movimiento`,
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
    setOficinasEnviadas(new Set());
    setRegistrado(false);
    onClose();
  }

  const conCorreo = porOficina.filter(([of]) => contactoDe(of)?.email_to);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-2xl w-full max-h-[88vh] overflow-y-auto vg-scroll p-6">
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-bold text-lg text-[var(--vg-red)]">🚨 Estado Crítico</h2>
          <button onClick={cerrar} className="text-[var(--vg-text2)] text-xl leading-none">✕</button>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 mb-4 text-[12px] text-[var(--vg-red)]">
          <strong>{guias.length} guía(s)</strong> con 14+ días sin movimiento detectadas en {porOficina.length} oficina(s).
          El correo informará que la oficina cuenta con <strong>máximo 3 días</strong> para localizar el paquete o
          identificar al responsable.
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
                      <span className="bg-red-50 text-[var(--vg-red)] rounded-full px-2 py-0.5 font-bold text-[11px]">
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
                          className="text-[11px] font-semibold text-white rounded-md px-2.5 py-1 disabled:opacity-30 bg-[var(--vg-red)]"
                        >
                          Enviar alerta
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
            ✅ Alertas críticas registradas en el historial
          </div>
        )}

        <div className="flex justify-between items-center">
          <span className="text-[11px] text-[var(--vg-text2)]">
            {oficinasEnviadas.size} de {conCorreo.length} oficinas notificadas
          </span>
          <div className="flex gap-2">
            <button
              onClick={cerrar}
              className="text-[12px] font-semibold text-[var(--vg-text2)] border border-[var(--vg-border)] rounded-md px-3 py-1.5"
            >
              Cerrar
            </button>
            <button
              onClick={registrar}
              disabled={enviando || registrado}
              className="text-[12px] font-semibold text-white rounded-md px-3 py-1.5 disabled:opacity-50 bg-[var(--vg-red)]"
            >
              {enviando ? 'Registrando...' : registrado ? 'Registrado' : 'Registrar en historial'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
