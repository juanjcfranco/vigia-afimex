'use client';

import { useEffect, useMemo, useState } from 'react';
import { Guia, Indemnizacion, EstadoIndemnizacion, ContactoOficina } from '@/lib/types';
import { useSortableTable } from '@/lib/useSortableTable';
import SortableTh from '@/components/SortableTh';
import IndemnizacionModal from '@/components/IndemnizacionModal';

const ESTADO_COLOR: Record<EstadoIndemnizacion, string> = {
  PENDIENTE: '#EA7C1A',
  APROBADA: '#1E3A8A',
  PAGADA: '#0B9B67',
  RECHAZADA: '#DC2626',
};

function EstadoBadge({ estado }: { estado: EstadoIndemnizacion }) {
  return (
    <span
      className="text-[10.5px] font-bold text-white rounded-full px-2 py-0.5"
      style={{ backgroundColor: ESTADO_COLOR[estado] }}
    >
      {estado}
    </span>
  );
}

export default function IndemnizacionesModule({ guias }: { guias: Guia[] }) {
  const [indemnizaciones, setIndemnizaciones] = useState<Indemnizacion[]>([]);
  const [contactos, setContactos] = useState<ContactoOficina[]>([]);
  const [cargando, setCargando] = useState(true);
  const [filtroEstado, setFiltroEstado] = useState<EstadoIndemnizacion | ''>('');
  const [seleccionadas, setSeleccionadas] = useState<Set<string>>(new Set());
  const [modalAbierto, setModalAbierto] = useState(false);
  const [casoEditando, setCasoEditando] = useState<Indemnizacion | null>(null);
  const [nuevoCaso, setNuevoCaso] = useState(false);

  const oficinas = useMemo(
    () => [...new Set(guias.map((g) => g.oficina_destino).filter(Boolean))].sort() as string[],
    [guias]
  );

  function cargar() {
    setCargando(true);
    fetch('/api/indemnizaciones')
      .then((r) => r.json())
      .then((j) => setIndemnizaciones(j.indemnizaciones || []))
      .finally(() => setCargando(false));
  }

  useEffect(cargar, []);

  useEffect(() => {
    fetch('/api/contactos')
      .then((r) => r.json())
      .then((j) => setContactos(j.contactos || []));
  }, []);

  const kpisPorEstado = useMemo(() => {
    const counts: Record<string, number> = {};
    indemnizaciones.forEach((i) => {
      counts[i.estado] = (counts[i.estado] || 0) + 1;
    });
    return counts;
  }, [indemnizaciones]);

  const montoTotalIndemnizado = useMemo(
    () => indemnizaciones.reduce((s, i) => s + (i.indemnizacion || 0), 0),
    [indemnizaciones]
  );
  const montoTotalCargoAfimex = useMemo(
    () => indemnizaciones.reduce((s, i) => s + (i.cargo_afimex || 0), 0),
    [indemnizaciones]
  );

  const filas = useMemo(() => {
    if (!filtroEstado) return indemnizaciones;
    return indemnizaciones.filter((i) => i.estado === filtroEstado);
  }, [indemnizaciones, filtroEstado]);

  const { sorted, sortKey, sortDir, requestSort } = useSortableTable<Indemnizacion>(filas, (i, key) => {
    switch (key) {
      case 'folio':
        return i.folio;
      case 'guias':
        return i.guias.join(', ');
      case 'cliente':
        return i.cliente;
      case 'oficina':
        return i.oficina;
      case 'tipo':
        return i.tipo_incidencia;
      case 'indemnizacion':
        return i.indemnizacion;
      case 'cargo':
        return i.cargo_afimex;
      case 'estado':
        return i.estado;
      case 'fecha':
        return i.fecha;
      default:
        return null;
    }
  });

  function toggleOne(id: string) {
    const next = new Set(seleccionadas);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSeleccionadas(next);
  }
  function toggleAll(checked: boolean) {
    setSeleccionadas(checked ? new Set(filas.map((i) => i.id)) : new Set());
  }

  const casosSeleccionados = useMemo(
    () => filas.filter((i) => seleccionadas.has(i.id)),
    [filas, seleccionadas]
  );

  // Guías vivas (de la carga actual) que corresponden al caso que se está
  // editando — se usan como respaldo para rellenar campos vacíos del caso.
  const guiasDelCasoEditando = useMemo(() => {
    if (!casoEditando) return [];
    const set = new Set(casoEditando.guias);
    return guias.filter((g) => set.has(g.guia));
  }, [casoEditando, guias]);

  function abrirIndemnizar() {
    if (casosSeleccionados.length === 1) {
      setCasoEditando(casosSeleccionados[0]);
      setNuevoCaso(false);
      setModalAbierto(true);
    }
  }

  function abrirNuevoCaso() {
    setCasoEditando(null);
    setNuevoCaso(true);
    setModalAbierto(true);
  }

  async function cambiarEstadoMasivo(nuevoEstado: EstadoIndemnizacion) {
    await Promise.all(
      casosSeleccionados.map((c) =>
        fetch(`/api/indemnizaciones?id=${c.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ estado: nuevoEstado }),
        })
      )
    );
    setSeleccionadas(new Set());
    cargar();
  }

  // Borrado permanente. La(s) guía(s) del caso nunca "desaparecieron" de
  // Abiertas (marcar solo pone una etiqueta, no oculta nada) — al borrar
  // el caso aquí, el badge de Indemnización en Abiertas desaparece solo,
  // porque se calcula en vivo contra esta misma tabla.
  async function eliminarSeleccionados() {
    const n = casosSeleccionados.length;
    if (!n) return;
    const confirmado = window.confirm(
      `¿Eliminar ${n} caso${n > 1 ? 's' : ''} de indemnización? Esta acción no se puede deshacer. Las guías afectadas dejarán de mostrar el badge de Indemnización en Abiertas.`
    );
    if (!confirmado) return;

    const ids = casosSeleccionados.map((c) => c.id).join(',');
    await fetch(`/api/indemnizaciones?ids=${encodeURIComponent(ids)}`, { method: 'DELETE' });
    setSeleccionadas(new Set());
    cargar();
  }

  return (
    <div className="p-5 space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <div className="bg-white rounded-lg border border-[var(--vg-border)] p-3">
          <div className="text-[10.5px] font-semibold text-[var(--vg-text2)] mb-1">Total Casos</div>
          <div className="text-xl font-bold">{indemnizaciones.length.toLocaleString('es-MX')}</div>
        </div>
        {(['PENDIENTE', 'APROBADA', 'PAGADA', 'RECHAZADA'] as EstadoIndemnizacion[]).map((e) => (
          <div key={e} className="bg-white rounded-lg border border-[var(--vg-border)] p-3">
            <div className="text-[10.5px] font-semibold text-[var(--vg-text2)] mb-1">{e.charAt(0) + e.slice(1).toLowerCase()}</div>
            <div className="text-xl font-bold" style={{ color: ESTADO_COLOR[e] }}>
              {(kpisPorEstado[e] || 0).toLocaleString('es-MX')}
            </div>
          </div>
        ))}
        <div className="bg-white rounded-lg border border-[var(--vg-border)] p-3">
          <div className="text-[10.5px] font-semibold text-[var(--vg-text2)] mb-1">Monto Total / Cargo AFIMEX</div>
          <div className="text-[13px] font-bold">
            ${montoTotalIndemnizado.toLocaleString('es-MX')} <span className="text-[var(--vg-red)]">/ ${montoTotalCargoAfimex.toLocaleString('es-MX')}</span>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-[var(--vg-border)] overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--vg-border)] flex items-center justify-between flex-wrap gap-2">
          <div>
            <div className="font-bold text-[13px]">Casos de Indemnización</div>
            <div className="text-[11px] text-[var(--vg-text2)]">
              Historial completo, independiente de la carga cargada · {filas.length.toLocaleString('es-MX')} casos
              {seleccionadas.size > 0 && ` · ${seleccionadas.size} seleccionados`}
            </div>
          </div>
          <button
            onClick={abrirNuevoCaso}
            className="text-[11.5px] font-semibold text-white bg-[var(--vg-blue)] rounded-md px-3 py-1.5"
          >
            + Nuevo Caso
          </button>
        </div>

        {seleccionadas.size > 0 && (
          <div className="px-4 py-2.5 border-b border-[var(--vg-border)] bg-[var(--vg-blue-light)] flex items-center gap-2 flex-wrap">
            <span className="text-[11.5px] font-bold text-[var(--vg-blue)]">{seleccionadas.size} seleccionado(s):</span>
            {casosSeleccionados.length === 1 && (
              <button
                onClick={abrirIndemnizar}
                className="text-[11.5px] font-semibold text-white bg-[var(--vg-blue)] rounded-md px-3 py-1"
              >
                💰 Indemnizar / Editar
              </button>
            )}
            <button
              onClick={() => cambiarEstadoMasivo('APROBADA')}
              className="text-[11.5px] font-semibold text-white rounded-md px-3 py-1"
              style={{ backgroundColor: ESTADO_COLOR.APROBADA }}
            >
              Marcar Aprobada
            </button>
            <button
              onClick={() => cambiarEstadoMasivo('PAGADA')}
              className="text-[11.5px] font-semibold text-white rounded-md px-3 py-1"
              style={{ backgroundColor: ESTADO_COLOR.PAGADA }}
            >
              Marcar Pagada
            </button>
            <button
              onClick={() => cambiarEstadoMasivo('RECHAZADA')}
              className="text-[11.5px] font-semibold text-white rounded-md px-3 py-1"
              style={{ backgroundColor: ESTADO_COLOR.RECHAZADA }}
            >
              Marcar Rechazada
            </button>
            <button
              onClick={eliminarSeleccionados}
              className="text-[11.5px] font-semibold text-white bg-[var(--vg-red)] rounded-md px-3 py-1"
            >
              🗑️ Eliminar
            </button>
            <button
              onClick={() => setSeleccionadas(new Set())}
              className="text-[11.5px] font-semibold text-[var(--vg-text2)] border border-[var(--vg-border)] rounded-md px-3 py-1 bg-white"
            >
              Quitar selección
            </button>
          </div>
        )}

        <div className="px-4 py-2.5 border-b border-[var(--vg-border)] flex items-center gap-2 flex-wrap overflow-x-auto vg-scroll">
          <span className="text-[11px] font-bold text-[var(--vg-text2)] whitespace-nowrap">Por estado:</span>
          <button
            onClick={() => setFiltroEstado('')}
            className={`text-[10.5px] font-semibold rounded-full px-2.5 py-1 whitespace-nowrap ${
              !filtroEstado ? 'bg-[var(--vg-blue)] text-white' : 'border border-[var(--vg-border)] text-[var(--vg-text2)] hover:bg-[var(--vg-bg)]'
            }`}
          >
            Todas <span className="font-bold">{indemnizaciones.length}</span>
          </button>
          {(['PENDIENTE', 'APROBADA', 'PAGADA', 'RECHAZADA'] as EstadoIndemnizacion[]).map((e) => (
            <button
              key={e}
              onClick={() => setFiltroEstado(e === filtroEstado ? '' : e)}
              className={`text-[10.5px] font-semibold rounded-full px-2.5 py-1 whitespace-nowrap ${
                filtroEstado === e ? 'text-white' : 'border border-[var(--vg-border)] text-[var(--vg-text2)] hover:bg-[var(--vg-bg)]'
              }`}
              style={filtroEstado === e ? { backgroundColor: ESTADO_COLOR[e] } : {}}
            >
              {e} <span className="font-bold">{kpisPorEstado[e] || 0}</span>
            </button>
          ))}
        </div>

        <div className="max-h-[600px] overflow-y-auto vg-scroll">
          <table className="vg-table">
            <thead>
              <tr>
                <th>
                  <input
                    type="checkbox"
                    checked={filas.length > 0 && seleccionadas.size === filas.length}
                    onChange={(e) => toggleAll(e.target.checked)}
                  />
                </th>
                <SortableTh label="Folio" sortKey="folio" currentKey={sortKey} currentDir={sortDir} onSort={requestSort} />
                <SortableTh label="Guía(s)" sortKey="guias" currentKey={sortKey} currentDir={sortDir} onSort={requestSort} />
                <SortableTh label="Cliente" sortKey="cliente" currentKey={sortKey} currentDir={sortDir} onSort={requestSort} />
                <SortableTh label="Oficina" sortKey="oficina" currentKey={sortKey} currentDir={sortDir} onSort={requestSort} />
                <SortableTh label="Tipo Incidencia" sortKey="tipo" currentKey={sortKey} currentDir={sortDir} onSort={requestSort} />
                <SortableTh label="Indemnización" sortKey="indemnizacion" currentKey={sortKey} currentDir={sortDir} onSort={requestSort} />
                <SortableTh label="Cargo AFIMEX" sortKey="cargo" currentKey={sortKey} currentDir={sortDir} onSort={requestSort} />
                <SortableTh label="Estado" sortKey="estado" currentKey={sortKey} currentDir={sortDir} onSort={requestSort} />
                <SortableTh label="Fecha" sortKey="fecha" currentKey={sortKey} currentDir={sortDir} onSort={requestSort} />
              </tr>
            </thead>
            <tbody>
              {cargando && (
                <tr>
                  <td colSpan={10} className="text-center text-[var(--vg-text3)] py-6">
                    Cargando casos...
                  </td>
                </tr>
              )}
              {!cargando &&
                sorted.map((i) => (
                  <tr key={i.id}>
                    <td>
                      <input type="checkbox" checked={seleccionadas.has(i.id)} onChange={() => toggleOne(i.id)} />
                    </td>
                    <td className="font-mono font-semibold">{i.folio}</td>
                    <td className="max-w-[180px] truncate" title={i.guias.join(', ')}>
                      {i.guias.join(', ')}
                    </td>
                    <td>{i.cliente || '—'}</td>
                    <td>{i.oficina || '—'}</td>
                    <td>{i.tipo_incidencia || '—'}</td>
                    <td className="font-semibold">${(i.indemnizacion || 0).toLocaleString('es-MX')}</td>
                    <td className="font-semibold text-[var(--vg-red)]">${(i.cargo_afimex || 0).toLocaleString('es-MX')}</td>
                    <td>
                      <EstadoBadge estado={i.estado} />
                    </td>
                    <td>{i.fecha || '—'}</td>
                  </tr>
                ))}
              {!cargando && !filas.length && (
                <tr>
                  <td colSpan={10} className="text-center text-[var(--vg-text3)] py-6">
                    No hay casos de indemnización con este filtro
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <IndemnizacionModal
        open={modalAbierto}
        onClose={() => {
          setModalAbierto(false);
          setCasoEditando(null);
        }}
        onGuardado={() => {
          setSeleccionadas(new Set());
          cargar();
        }}
        existente={nuevoCaso ? null : casoEditando}
        guiasPrecargadas={nuevoCaso ? [] : guiasDelCasoEditando}
        oficinas={oficinas}
        contactos={contactos}
      />
    </div>
  );
}
