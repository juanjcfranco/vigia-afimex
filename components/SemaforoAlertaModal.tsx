'use client';

import { useState, useMemo } from 'react';
import { Guia, ContactoOficina, AlertaGuiaEvento } from '@/lib/types';
import { calcularSemaforoGuia, nivelPorSecuenciaAlertas, INFO_NIVEL_ALERTA, buildMailtoUrl } from '@/lib/business-logic';

interface SemaforoAlertaModalProps {
  open: boolean;
  onClose: () => void;
  guiasSeleccionadas: Guia[];
  contactos: ContactoOficina[];
  // Historial YA registrado (alertas_guia_historial) — necesario para
  // saber cuántas alertas lleva cada guía y así registrar la SIGUIENTE
  // con el nivel correcto (1ª/2ª/3ª), no con el color calculado de hoy.
  historialAlertas: AlertaGuiaEvento[];
  onCompletado: () => void;
}

// Envía una alerta por correo (por oficina, igual que AlertaSinMovimientoModal)
// y registra CADA guía en el historial persistente (alertas_guia_historial).
//
// IMPORTANTE: el NIVEL que se registra/envía (1ª/2ª/3ª alerta) depende de
// cuántas alertas YA tiene esa guía en su historial — NO del color del
// semáforo calculado por días sin movimiento. El color de hoy solo decide
// SI la guía necesita atención (no se registra nada si está en Verde),
// pero no determina si "ya tuvo una alerta previa" — eso solo lo sabe el
// historial real.
export default function SemaforoAlertaModal({
  open,
  onClose,
  guiasSeleccionadas,
  contactos,
  historialAlertas,
  onCompletado,
}: SemaforoAlertaModalProps) {
  const [oficinasEnviadas, setOficinasEnviadas] = useState<Set<string>>(new Set());
  const [registrado, setRegistrado] = useState(false);
  const [enviando, setEnviando] = useState(false);

  // Cuántas alertas (no-cierre) tiene YA cada guía en su historial —
  // determina si la que se está a punto de registrar es la 1ª, 2ª o 3ª.
  const alertasPreviasPorGuia = useMemo(() => {
    const map = new Map<string, number>();
    historialAlertas.forEach((ev) => {
      if (ev.nivel !== 'CERRADO') map.set(ev.guia, (map.get(ev.guia) || 0) + 1);
    });
    return map;
  }, [historialAlertas]);

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

    const lineas = lista.map((g, i) => {
      // Nivel de esta notificación = secuencia real (historial), no el
      // color calculado por días — ver comentario arriba del componente.
      const alertasPrevias = alertasPreviasPorGuia.get(g.guia) || 0;
      const nivelSecuencia = nivelPorSecuenciaAlertas(alertasPrevias);
      const info = INFO_NIVEL_ALERTA[nivelSecuencia];
      return `${i + 1}. Guía: ${g.guia} | Desc: ${g.descripcion || '—'} | Estado: ${g.estado_guia || '—'} | Destino: ${
        g.oficina_destino || '—'
      } | Días sin mov: ${g.dias_sin_movimiento ?? '—'} | Nivel: ${nivelSecuencia} (${info.etiquetaAlerta}) | Acción: ${
        info.accion
      } | Responsable: ${info.responsable}`;
    });

    const cuerpoTexto = [
      'Estimado equipo,',
      '',
      `Las siguientes guías en la Oficina ${oficina} requieren la acción indicada según su nivel de alerta.`,
      '',
      ...lineas,
      '',
      'Por favor dar seguimiento según la acción y responsable indicados para cada guía.',
      '',
      `Generado el ${fechaGenerado} · VIGÍA Dashboard — AFIMEX`,
    ].join('\n');

    const asuntoTexto = `[AFIMEX] [${cliente}] Alerta de guías sin movimiento — ${lista.length} guía${lista.length === 1 ? '' : 's'} · Oficina ${oficina}`;

    const mailto = buildMailtoUrl(para, { cc, subject: asuntoTexto, body: cuerpoTexto });
    const link = document.createElement('a');
    link.href = mailto;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setOficinasEnviadas((prev) => new Set(prev).add(oficina));
  }

  async function registrar() {
    setEnviando(true);
    try {
      await Promise.all(
        guiasSeleccionadas.map((g) => {
          // El color de HOY solo decide si vale la pena registrar algo
          // (Verde = recién creada, 0-2 días, no necesita alerta) — pero
          // el NIVEL que se guarda (1ª/2ª/3ª) viene de la secuencia real
          // registrada, no de este color.
          if (calcularSemaforoGuia(g.dias_sin_movimiento).nivel === 'VERDE') return Promise.resolve();

          const oficina = g.oficina_destino || 'SIN OFICINA';
          const contacto = contactoDe(oficina);
          const alertasPrevias = alertasPreviasPorGuia.get(g.guia) || 0;
          const nivelSecuencia = nivelPorSecuenciaAlertas(alertasPrevias);
          const info = INFO_NIVEL_ALERTA[nivelSecuencia];

          return fetch('/api/alertas-guia', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              guia: g.guia,
              nivel: nivelSecuencia,
              accion: info.accion,
              enviado_a: contacto?.email_to || null,
            }),
          });
        })
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
          <h2 className="font-bold text-lg">🚦 Notificar Semáforo de Escalamiento</h2>
          <button onClick={cerrar} className="text-[var(--vg-text2)] text-xl leading-none">
            ✕
          </button>
        </div>
        <p className="text-[12px] text-[var(--vg-text2)] mb-4">
          {guiasSeleccionadas.length} guía(s) seleccionada(s) · {porOficina.length} oficina(s)
        </p>

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
                          className="text-[11px] font-semibold text-white rounded-md px-2.5 py-1 disabled:opacity-30 bg-[#7C3AED]"
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
            ✅ Alertas registradas en el historial (por guía)
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
              onClick={registrar}
              disabled={enviando || registrado}
              className="text-[12px] font-semibold text-white rounded-md px-3 py-1.5 disabled:opacity-50 bg-[#7C3AED]"
            >
              {enviando ? 'Registrando...' : registrado ? 'Registrado' : 'Registrar alerta'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
