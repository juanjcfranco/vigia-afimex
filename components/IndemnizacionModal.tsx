'use client';

import { useEffect, useMemo, useState } from 'react';
import { Guia, Indemnizacion, EstadoIndemnizacion } from '@/lib/types';

interface IndemnizacionModalProps {
  open: boolean;
  onClose: () => void;
  onGuardado: () => void;
  // Para crear un caso nuevo: las guías ya seleccionadas (datos vivos, de
  // la carga actual) para precargar el formulario.
  guiasPrecargadas?: Guia[];
  // Para editar un caso ya existente: el registro guardado en la base.
  existente?: Indemnizacion | null;
  oficinas: string[];
}

const TIPOS_INCIDENCIA = [
  'Robo',
  'Extravío',
  'Daño parcial',
  'Daño total',
  'Demora',
  'Entrega incorrecta',
  'Guía sin movimiento',
  'Paquete abierto',
  'Otra',
];

const ESTATUS_ESCANEO = [
  'Documentada',
  'Embarcada',
  'Transbordada',
  'Desembarcada',
  'En almacén',
  'Listo para entregar',
  'En ruta',
  'Entregada',
  'Rezago',
  'Cancelada',
  'Devolución',
  'Recolectada',
  'Plataforma',
  'Excepción',
  'Mostrador',
  'En contenedor',
];

const ESTADOS: { value: EstadoIndemnizacion; label: string; color: string }[] = [
  { value: 'PENDIENTE', label: 'Pendiente', color: '#EA7C1A' },
  { value: 'APROBADA', label: 'Aprobada', color: '#1E3A8A' },
  { value: 'PAGADA', label: 'Pagada', color: '#0B9B67' },
  { value: 'RECHAZADA', label: 'Rechazada', color: '#DC2626' },
];

function Chip({ activo, color, onClick, children }: { activo: boolean; color: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-[11px] font-semibold rounded-full px-2.5 py-1 border transition-colors"
      style={
        activo
          ? { backgroundColor: color, borderColor: color, color: 'white' }
          : { backgroundColor: 'white', borderColor: 'var(--vg-border)', color: 'var(--vg-text2)' }
      }
    >
      {children}
    </button>
  );
}

function colorTipoIncidencia(tipo: string): string {
  if (['Robo', 'Extravío', 'Guía sin movimiento'].includes(tipo)) return '#DC2626';
  if (['Daño parcial', 'Daño total', 'Paquete abierto'].includes(tipo)) return '#EA7C1A';
  return '#1E3A8A';
}

export default function IndemnizacionModal({
  open,
  onClose,
  onGuardado,
  guiasPrecargadas = [],
  existente = null,
  oficinas,
}: IndemnizacionModalProps) {
  const [guiasTexto, setGuiasTexto] = useState('');
  const [cliente, setCliente] = useState('');
  const [fecha, setFecha] = useState('');
  const [fechaMov, setFechaMov] = useState('');
  const [oficina, setOficina] = useState('');
  const [tipoDestino, setTipoDestino] = useState('');
  const [oficinaIncidencia, setOficinaIncidencia] = useState('');
  const [importe, setImporte] = useState('');
  const [tipoIncidencia, setTipoIncidencia] = useState('');
  const [scanLoc, setScanLoc] = useState('');
  const [scanDt, setScanDt] = useState('');
  const [scanUser, setScanUser] = useState('');
  const [scanEstatus, setScanEstatus] = useState('');
  const [investigacion, setInvestigacion] = useState('');
  const [indemnizacionMonto, setIndemnizacionMonto] = useState('');
  const [recuperable, setRecuperable] = useState('');
  const [tipoIndemnizacion, setTipoIndemnizacion] = useState('');
  const [estado, setEstado] = useState<EstadoIndemnizacion>('PENDIENTE');
  const [payRef, setPayRef] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Precarga: combina el registro guardado (si existe) con los datos vivos
  // de la guía (si están disponibles) — el registro guardado manda, pero
  // si algún campo llegó vacío (ej. un caso creado "ligero" desde
  // Abiertas, solo con la etiqueta puesta) se rellena con el dato vivo de
  // la guía para no forzar a recapturar algo que ya sabemos.
  useEffect(() => {
    if (!open) return;
    const g0 = guiasPrecargadas[0];

    if (existente) {
      setGuiasTexto(existente.guias.join(', '));
      setCliente(existente.cliente || g0?.cliente || '');
      setFecha(existente.fecha || new Date().toISOString().slice(0, 10));
      setFechaMov(existente.fecha_mov || g0?.f_historia || '');
      setOficina(existente.oficina || g0?.oficina_destino || '');
      setTipoDestino(existente.tipo_destino || '');
      setOficinaIncidencia(existente.oficina_incidencia || g0?.oficina_destino || '');
      setImporte(existente.importe ? String(existente.importe) : '');
      setTipoIncidencia(existente.tipo_incidencia || '');
      setScanLoc(existente.scan_loc || '');
      setScanDt(existente.scan_dt ? existente.scan_dt.slice(0, 16) : '');
      setScanUser(existente.scan_user || '');
      const estadoGuiaExist = (g0?.estado_guia || '').toUpperCase().trim();
      const matchExist = ESTATUS_ESCANEO.find((e) => e.toUpperCase() === estadoGuiaExist);
      setScanEstatus(existente.scan_estatus || matchExist || '');
      setInvestigacion(existente.investigacion || '');
      setIndemnizacionMonto(existente.indemnizacion ? String(existente.indemnizacion) : '');
      setRecuperable(existente.recuperable ? String(existente.recuperable) : '');
      setTipoIndemnizacion(existente.tipo_indemnizacion || '');
      setEstado(existente.estado || 'PENDIENTE');
      setPayRef(existente.pay_ref || '');
    } else {
      setGuiasTexto(guiasPrecargadas.map((g) => g.guia).join(', '));
      setCliente(g0?.cliente || '');
      setFecha(new Date().toISOString().slice(0, 10));
      setFechaMov(g0?.f_historia || '');
      setOficina(g0?.oficina_destino || '');
      setTipoDestino('');
      setOficinaIncidencia(g0?.oficina_destino || '');
      setImporte('');
      setTipoIncidencia('');
      setScanLoc('');
      setScanDt('');
      setScanUser('');
      // Intenta precargar el estatus si el estado de la guía calza con
      // alguno de los chips (comparación insensible a mayúsculas/acentos).
      const estadoGuia = (g0?.estado_guia || '').toUpperCase().trim();
      const match = ESTATUS_ESCANEO.find((e) => e.toUpperCase() === estadoGuia);
      setScanEstatus(match || '');
      setInvestigacion('');
      setIndemnizacionMonto('');
      setRecuperable('');
      setTipoIndemnizacion('');
      setEstado('PENDIENTE');
      setPayRef('');
    }
    setError(null);
  }, [open, existente, guiasPrecargadas]);

  const cargoAfimex = useMemo(() => {
    const ind = parseFloat(indemnizacionMonto) || 0;
    const rec = parseFloat(recuperable) || 0;
    return Math.max(0, ind - rec);
  }, [indemnizacionMonto, recuperable]);

  if (!open) return null;

  async function guardar() {
    const guiasArr = guiasTexto
      .split(/[,\n]/)
      .map((g) => g.trim())
      .filter(Boolean);

    if (!guiasArr.length) {
      setError('Agrega al menos un número de guía.');
      return;
    }

    setGuardando(true);
    setError(null);
    try {
      const payload = {
        guias: guiasArr,
        cliente,
        fecha: fecha || null,
        fecha_mov: fechaMov || null,
        oficina,
        tipo_destino: tipoDestino,
        oficina_incidencia: oficinaIncidencia,
        importe: parseFloat(importe) || 0,
        tipo_incidencia: tipoIncidencia,
        scan_loc: scanLoc,
        scan_dt: scanDt ? new Date(scanDt).toISOString() : null,
        scan_user: scanUser,
        scan_estatus: scanEstatus,
        investigacion,
        indemnizacion: parseFloat(indemnizacionMonto) || 0,
        recuperable: parseFloat(recuperable) || 0,
        tipo_indemnizacion: tipoIndemnizacion,
        estado,
        pay_ref: payRef,
      };

      const res = existente
        ? await fetch(`/api/indemnizaciones?id=${existente.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
        : await fetch('/api/indemnizaciones', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'No se pudo guardar la indemnización');

      onGuardado();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto vg-scroll p-6">
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-bold text-lg">
            💰 {existente ? `Editar caso ${existente.folio}` : 'Nuevo caso de indemnización'}
          </h2>
          <button onClick={onClose} className="text-[var(--vg-text2)] text-xl leading-none">
            ✕
          </button>
        </div>
        <p className="text-[12px] text-[var(--vg-text2)] mb-4">
          {existente ? 'Los cambios se guardan sobre este mismo caso.' : 'Se creará un folio nuevo al guardar.'}
        </p>

        {/* Datos del envío */}
        <div className="border border-[var(--vg-border)] rounded-lg p-3 mb-3">
          <div className="font-bold text-[11.5px] text-[var(--vg-text2)] mb-2 uppercase tracking-wide">Datos del envío</div>
          <div className="mb-3">
            <label className="text-[11px] font-semibold text-[var(--vg-text2)] block mb-1">
              Número(s) de guía <span className="font-normal text-[var(--vg-text3)]">— separadas por coma</span>
            </label>
            <textarea
              value={guiasTexto}
              onChange={(e) => setGuiasTexto(e.target.value)}
              rows={2}
              className="w-full text-[12px] font-mono border border-[var(--vg-border)] rounded-md p-2"
              placeholder="Ej. 46156379, 46189251"
            />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="text-[11px] font-semibold text-[var(--vg-text2)] block mb-1">Cliente</label>
              <input
                value={cliente}
                onChange={(e) => setCliente(e.target.value)}
                className="w-full text-[12px] border border-[var(--vg-border)] rounded-md px-2.5 py-1.5"
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-[var(--vg-text2)] block mb-1">Destino (oficina)</label>
              <select
                value={oficina}
                onChange={(e) => setOficina(e.target.value)}
                className="w-full text-[12px] border border-[var(--vg-border)] rounded-md px-2.5 py-1.5 bg-white"
              >
                <option value="">Seleccionar...</option>
                {oficinas.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[11px] font-semibold text-[var(--vg-text2)] block mb-1">Tipo</label>
              <select
                value={tipoDestino}
                onChange={(e) => setTipoDestino(e.target.value)}
                className="w-full text-[12px] border border-[var(--vg-border)] rounded-md px-2.5 py-1.5 bg-white"
              >
                <option value="">Seleccionar...</option>
                <option>Oficina</option>
                <option>Concesionario</option>
              </select>
            </div>
            <div>
              <label className="text-[11px] font-semibold text-[var(--vg-text2)] block mb-1">Oficina de incidencia</label>
              <select
                value={oficinaIncidencia}
                onChange={(e) => setOficinaIncidencia(e.target.value)}
                className="w-full text-[12px] border border-[var(--vg-border)] rounded-md px-2.5 py-1.5 bg-white"
              >
                <option value="">Seleccionar...</option>
                {oficinas.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
            <div>
              <label className="text-[11px] font-semibold text-[var(--vg-text2)] block mb-1">Fecha de registro</label>
              <input
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                className="w-full text-[12px] border border-[var(--vg-border)] rounded-md px-2.5 py-1.5"
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-[var(--vg-text2)] block mb-1">Fecha último movimiento</label>
              <input
                type="date"
                value={fechaMov}
                onChange={(e) => setFechaMov(e.target.value)}
                className="w-full text-[12px] border border-[var(--vg-border)] rounded-md px-2.5 py-1.5"
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-[var(--vg-text2)] block mb-1">Importe declarado (MXN)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={importe}
                onChange={(e) => setImporte(e.target.value)}
                placeholder="0.00"
                className="w-full text-[12px] border border-[var(--vg-border)] rounded-md px-2.5 py-1.5"
              />
            </div>
          </div>
        </div>

        {/* Tipo de incidencia */}
        <div className="border border-[var(--vg-border)] rounded-lg p-3 mb-3">
          <div className="font-bold text-[11.5px] text-[var(--vg-text2)] mb-2 uppercase tracking-wide">Tipo de incidencia</div>
          <div className="flex flex-wrap gap-2">
            {TIPOS_INCIDENCIA.map((t) => (
              <Chip key={t} activo={tipoIncidencia === t} color={colorTipoIncidencia(t)} onClick={() => setTipoIncidencia(t === tipoIncidencia ? '' : t)}>
                {t}
              </Chip>
            ))}
          </div>
        </div>

        {/* Último escaneo */}
        <div className="border border-[var(--vg-border)] rounded-lg p-3 mb-3">
          <div className="font-bold text-[11.5px] text-[var(--vg-text2)] mb-2 uppercase tracking-wide">Último escaneo</div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
            <div>
              <label className="text-[11px] font-semibold text-[var(--vg-text2)] block mb-1">Ubicación del escaneo</label>
              <input
                value={scanLoc}
                onChange={(e) => setScanLoc(e.target.value)}
                placeholder="Ej. CEDIS Monterrey — Plataforma 3"
                className="w-full text-[12px] border border-[var(--vg-border)] rounded-md px-2.5 py-1.5"
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-[var(--vg-text2)] block mb-1">Fecha y hora del escaneo</label>
              <input
                type="datetime-local"
                value={scanDt}
                onChange={(e) => setScanDt(e.target.value)}
                className="w-full text-[12px] border border-[var(--vg-border)] rounded-md px-2.5 py-1.5"
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-[var(--vg-text2)] block mb-1">Usuario último escaneo</label>
              <input
                value={scanUser}
                onChange={(e) => setScanUser(e.target.value)}
                placeholder="Nombre o clave de usuario"
                className="w-full text-[12px] border border-[var(--vg-border)] rounded-md px-2.5 py-1.5"
              />
            </div>
          </div>
          <label className="text-[11px] font-semibold text-[var(--vg-text2)] block mb-1">Estatus registrado</label>
          <div className="flex flex-wrap gap-2">
            {ESTATUS_ESCANEO.map((e) => (
              <Chip key={e} activo={scanEstatus === e} color="#1E3A8A" onClick={() => setScanEstatus(e === scanEstatus ? '' : e)}>
                {e}
              </Chip>
            ))}
          </div>
        </div>

        {/* Investigación */}
        <div className="border border-[var(--vg-border)] rounded-lg p-3 mb-3">
          <div className="font-bold text-[11.5px] text-[var(--vg-text2)] mb-2 uppercase tracking-wide">Investigación</div>
          <textarea
            value={investigacion}
            onChange={(e) => setInvestigacion(e.target.value)}
            rows={3}
            placeholder="Describe las acciones realizadas, personas contactadas, hallazgos, seguimiento..."
            className="w-full text-[12px] border border-[var(--vg-border)] rounded-md p-2"
          />
        </div>

        {/* Resolución económica */}
        <div className="border border-[var(--vg-border)] rounded-lg p-3 mb-3">
          <div className="font-bold text-[11.5px] text-[var(--vg-text2)] mb-2 uppercase tracking-wide">Resolución económica</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="text-[11px] font-semibold text-[var(--vg-text2)] block mb-1">Indemnización (MXN)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={indemnizacionMonto}
                onChange={(e) => setIndemnizacionMonto(e.target.value)}
                placeholder="0.00"
                className="w-full text-[12px] border border-[var(--vg-border)] rounded-md px-2.5 py-1.5"
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-[var(--vg-text2)] block mb-1">Importe recuperable (MXN)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={recuperable}
                onChange={(e) => setRecuperable(e.target.value)}
                placeholder="0.00"
                className="w-full text-[12px] border border-[var(--vg-border)] rounded-md px-2.5 py-1.5"
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-[var(--vg-text2)] block mb-1">Tipo de indemnización</label>
              <select
                value={tipoIndemnizacion}
                onChange={(e) => setTipoIndemnizacion(e.target.value)}
                className="w-full text-[12px] border border-[var(--vg-border)] rounded-md px-2.5 py-1.5 bg-white"
              >
                <option value="">Seleccionar...</option>
                <option>Pago</option>
                <option>Nota de crédito</option>
              </select>
            </div>
            <div>
              <label className="text-[11px] font-semibold text-[var(--vg-text2)] block mb-1">Cargo a AFIMEX</label>
              <input
                type="text"
                readOnly
                value={cargoAfimex.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                className="w-full text-[12px] font-semibold border border-[var(--vg-border)] rounded-md px-2.5 py-1.5 bg-[var(--vg-bg)] text-[var(--vg-red)] cursor-default"
              />
            </div>
          </div>
        </div>

        {/* Estatus del caso */}
        <div className="border border-[var(--vg-border)] rounded-lg p-3 mb-4">
          <div className="font-bold text-[11.5px] text-[var(--vg-text2)] mb-2 uppercase tracking-wide">Estatus del caso</div>
          <div className="flex flex-wrap gap-2 mb-3">
            {ESTADOS.map((e) => (
              <Chip key={e.value} activo={estado === e.value} color={e.color} onClick={() => setEstado(e.value)}>
                {e.label}
              </Chip>
            ))}
          </div>
          {estado === 'PAGADA' && (
            <div>
              <label className="text-[11px] font-semibold text-[var(--vg-text2)] block mb-1">Folio / Referencia de pago</label>
              <input
                value={payRef}
                onChange={(e) => setPayRef(e.target.value)}
                placeholder="Referencia bancaria o folio de nota de crédito"
                className="w-full text-[12px] border border-[var(--vg-border)] rounded-md px-2.5 py-1.5"
              />
            </div>
          )}
        </div>

        {error && <div className="text-[12px] text-[var(--vg-red)] font-semibold mb-3">{error}</div>}

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="text-[12px] font-semibold text-[var(--vg-text2)] border border-[var(--vg-border)] rounded-md px-3 py-1.5"
          >
            Cancelar
          </button>
          <button
            onClick={guardar}
            disabled={guardando}
            className="text-[12px] font-semibold text-white bg-[var(--vg-blue)] rounded-md px-3 py-1.5 disabled:opacity-50"
          >
            {guardando ? 'Guardando...' : existente ? 'Guardar cambios' : 'Registrar indemnización'}
          </button>
        </div>
      </div>
    </div>
  );
}
