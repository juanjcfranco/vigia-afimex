'use client';

import { useState, useMemo, useRef } from 'react';
import { Guia, ContactoOficina, AlertaGuiaEvento } from '@/lib/types';
import { calcularSemaforoGuia, nivelPorSecuenciaAlertas, INFO_NIVEL_ALERTA, textoResponsablePorCiclo, buildMailtoUrl } from '@/lib/business-logic';

// Texto de acción SIMPLIFICADO para el cuerpo del correo — INFO_NIVEL_ALERTA.accion
// trae el detalle completo (usado en tooltips/badges dentro de la app), pero en el
// correo basta con la instrucción corta; el destinatario no necesita el detalle
// operativo interno (ej. "ubicar última plaza/circuito que escaneó la guía").
const ACCION_CORREO: Record<'AMARILLO' | 'NARANJA' | 'ROJO', string> = {
  AMARILLO: 'Iniciar investigación inmediata: Primera Alerta',
  NARANJA: 'Segunda alerta: Guía en riesgo, posible cobro al responsable',
  ROJO: 'Tercera y última alerta: Seguimiento crítico: 24 horas para dar respuesta, de no recibirla la guía pasará a cobro del responsable',
};

interface SemaforoAlertaModalProps {
  open: boolean;
  onClose: () => void;
  guiasSeleccionadas: Guia[];
  contactos: ContactoOficina[];
  // Historial YA registrado (alertas_guia_historial) — necesario para
  // saber cuántas alertas lleva cada guía y así registrar la SIGUIENTE
  // con el nivel correcto (1ª/2ª/3ª), no con el color calculado de hoy.
  historialAlertas: AlertaGuiaEvento[];
  // Se llama tras CADA registro exitoso (p. ej. al enviar el correo de una
  // oficina) — solo para refrescar el historial. NO debe limpiar la
  // selección de guías del padre: las demás oficinas del modal todavía
  // dependen de ella.
  onRegistrado?: () => void;
  // Se llama UNA sola vez cuando el usuario termina (presiona "Registrar
  // alerta", o cierra el modal habiendo registrado algo) — aquí el padre
  // sí puede limpiar su selección.
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
  onRegistrado,
  onCompletado,
}: SemaforoAlertaModalProps) {
  const [oficinasEnviadas, setOficinasEnviadas] = useState<Set<string>>(new Set());
  const [registrado, setRegistrado] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [errorRegistro, setErrorRegistro] = useState<string | null>(null);
  // Guías ya registradas en el historial durante ESTA sesión del modal —
  // evita registrar dos veces la misma guía (si se envía el correo de su
  // oficina y luego también se presiona "Registrar alerta"), lo que
  // inflaría la secuencia 1ª→2ª→3ª sin que haya habido una alerta real
  // nueva. Es un ref (no estado) para que el dedupe sea inmediato; el
  // contador de abajo solo fuerza el re-render.
  const registradasRef = useRef<Set<string>>(new Set());
  const [registradasCount, setRegistradasCount] = useState(0);
  const completadoNotificadoRef = useRef(false);

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
    guiasSeleccionadas
      // Verde = 0-2 días, monitoreo normal, no requiere alerta — nunca
      // debe aparecer en el correo (ver también el mismo filtro en
      // registrar(), que ya excluía Verde del historial pero no del
      // cuerpo del correo).
      .filter((g) => calcularSemaforoGuia(g.dias_sin_movimiento).nivel !== 'VERDE')
      .forEach((g) => {
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

    // Se arma por partes (en vez de toLocaleString completo) para
    // controlar exactamente las comas: "viernes, 02/10/2026, 05:09 p.m."
    const ahora = new Date();
    const diaSemana = new Intl.DateTimeFormat('es-MX', { weekday: 'long' }).format(ahora);
    const fechaCorta = new Intl.DateTimeFormat('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(ahora);
    const horaFormateada = new Intl.DateTimeFormat('es-MX', { hour: '2-digit', minute: '2-digit', hour12: true }).format(ahora);
    const fechaGenerado = `${diaSemana}, ${fechaCorta}, ${horaFormateada}`;

    const lineas = lista.map((g, i) => {
      // Nivel de esta notificación = secuencia real (historial), no el
      // color calculado por días — ver comentario arriba del componente.
      const alertasPrevias = alertasPreviasPorGuia.get(g.guia) || 0;
      const nivelSecuencia = nivelPorSecuenciaAlertas(alertasPrevias);
      // El responsable ya no es fijo por nivel de alerta — depende de en
      // qué ciclo del pipeline está la guía AHORA (origen/CEDIS/destino,
      // y si esa plaza es Oficina o Concesionario). Ver
      // textoResponsablePorCiclo() en business-logic.ts.
      return `${i + 1}. Guía: ${g.guia} | Cliente: ${g.cliente || '—'} | Desc: ${g.descripcion || '—'} | Estado: ${
        g.estado_guia || '—'
      } | Destino: ${g.oficina_destino || '—'} | Días sin mov: ${
        g.dias_sin_movimiento ?? '—'
      } | ${ACCION_CORREO[nivelSecuencia]} | Responsable: ${textoResponsablePorCiclo(g)}`;
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
      `Generado el ${fechaGenerado} · VIGÍA Panel de Control Operativo — AFIMEX`,
    ].join('\n');

    const asuntoTexto = `[AFIMEX] Alerta de guías sin movimiento — ${lista.length} guía${lista.length === 1 ? '' : 's'} · Oficina ${oficina}`;

    const mailto = buildMailtoUrl(para, { cc, subject: asuntoTexto, body: cuerpoTexto });
    const link = document.createElement('a');
    link.href = mailto;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setOficinasEnviadas((prev) => new Set(prev).add(oficina));
    // Enviar la alerta ES el evento que se rastrea — se registra en el
    // historial al momento, sin depender de un segundo botón aparte (antes,
    // si solo se enviaban los correos y se cerraba el modal, no quedaba
    // NADA guardado).
    void registrarYAvisar(lista);
  }

  // Registra en el historial (alertas_guia_historial) las guías dadas, salvo
  // las que están en Verde o ya se registraron en esta sesión. Devuelve la
  // lista de errores (vacía = todo bien).
  async function registrarGuias(lista: Guia[]): Promise<string[]> {
    const resultados = await Promise.all(
      lista.map(async (g) => {
        // El color de HOY solo decide si vale la pena registrar algo
        // (Verde = recién creada, 0-2 días, no necesita alerta) — pero
        // el NIVEL que se guarda (1ª/2ª/3ª) viene de la secuencia real
        // registrada, no de este color.
        if (calcularSemaforoGuia(g.dias_sin_movimiento).nivel === 'VERDE') return null;
        if (registradasRef.current.has(g.guia)) return null;
        // Se marca ANTES del fetch para que un doble clic rápido no cuele
        // dos registros; si falla, se des-marca para poder reintentar.
        registradasRef.current.add(g.guia);

        const oficina = g.oficina_destino || 'SIN OFICINA';
        const contacto = contactoDe(oficina);
        const alertasPrevias = alertasPreviasPorGuia.get(g.guia) || 0;
        const nivelSecuencia = nivelPorSecuenciaAlertas(alertasPrevias);
        const info = INFO_NIVEL_ALERTA[nivelSecuencia];

        try {
          const res = await fetch('/api/alertas-guia', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              guia: g.guia,
              nivel: nivelSecuencia,
              accion: info.accion,
              enviado_a: contacto?.email_to || null,
            }),
          });
          // fetch() NO lanza excepción si el servidor responde con error
          // (400/500) — solo si falla la red. Sin este chequeo, un error
          // real de Supabase pasaba inadvertido y se mostraba "Registrado"
          // aunque NADA se hubiera guardado.
          if (!res.ok) {
            registradasRef.current.delete(g.guia);
            const j = await res.json().catch(() => ({}));
            return `Guía ${g.guia}: ${j.error || `HTTP ${res.status}`}`;
          }
          return null;
        } catch (e) {
          registradasRef.current.delete(g.guia);
          return `Guía ${g.guia}: error de red — ${e instanceof Error ? e.message : 'desconocido'}`;
        }
      })
    );
    setRegistradasCount(registradasRef.current.size);
    return resultados.filter((r): r is string => r !== null);
  }

  async function registrarYAvisar(lista: Guia[]): Promise<boolean> {
    setErrorRegistro(null);
    const errores = await registrarGuias(lista);
    if (errores.length) {
      setErrorRegistro(`${errores.length} guía(s) NO se guardaron. Primer error: ${errores[0]}`);
      return false;
    }
    onRegistrado?.();
    return true;
  }

  function notificarCompletadoUnaVez() {
    if (completadoNotificadoRef.current) return;
    completadoNotificadoRef.current = true;
    onCompletado();
  }

  async function registrar() {
    setEnviando(true);
    try {
      const ok = await registrarYAvisar(guiasSeleccionadas);
      setRegistrado(ok);
      if (ok) notificarCompletadoUnaVez();
    } finally {
      setEnviando(false);
    }
  }

  function cerrar() {
    // Si se registró algo (p. ej. solo se enviaron correos por oficina), el
    // padre debe enterarse al cerrar para limpiar su selección.
    if (registradasRef.current.size > 0) notificarCompletadoUnaVez();
    completadoNotificadoRef.current = false;
    setOficinasEnviadas(new Set());
    setRegistrado(false);
    setErrorRegistro(null);
    registradasRef.current = new Set();
    setRegistradasCount(0);
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

        {registradasCount > 0 && (
          <div className="text-[12px] text-[var(--vg-green)] font-semibold mb-3">
            ✅ {registradasCount} alerta(s) registradas en el historial (por guía)
          </div>
        )}
        {errorRegistro && (
          <div className="text-[12px] text-[#DC2626] font-semibold mb-3 bg-[#FEF2F2] rounded-md px-3 py-2">
            ⚠️ {errorRegistro}
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
