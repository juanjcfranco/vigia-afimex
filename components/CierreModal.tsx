'use client';

import { useMemo } from 'react';
import { Guia, Carga } from '@/lib/types';
import {
  isEntregada,
  isAbiertaPorEstado,
  isCancelada,
  esGuiaOriginal,
  calcularEfectividad,
  colorEfectividad,
  getExcepciones,
  formatearPeriodo,
  topPorCampo,
} from '@/lib/business-logic';
import { exportCierrePDF } from '@/lib/export';

interface CierreModalProps {
  open: boolean;
  onClose: () => void;
  guias: Guia[];
  cargaActiva: Carga | null;
}

function resumenDe(lista: Guia[]) {
  const entregadas = lista.filter((g) => isEntregada(g.estado_guia) && !g.es_predoc && !g.es_documentada).length;
  const devoluciones = lista.filter((g) => g.es_devolucion).length;
  const abiertas = lista.filter((g) => isAbiertaPorEstado(g)).length;
  const retornosAbiertos = lista.filter(
    (g) => g.es_devolucion && g.retorno_guia && (g.retorno_estado || '').toUpperCase() !== 'ENTREGADA'
  ).length;
  const efectividad = calcularEfectividad(entregadas, devoluciones, abiertas);
  return { total: lista.length, entregadas, devoluciones, abiertas, retornosAbiertos, efectividad };
}

export default function CierreModal({ open, onClose, guias, cargaActiva }: CierreModalProps) {
  const resumen = useMemo(() => {
    // KPIs idénticos al módulo Resumen
    const devolucionesConRetorno = guias.filter((g) => g.es_devolucion && g.retorno_guia);
    const guiasRetornoEntregadas = devolucionesConRetorno.filter(
      (g) => (g.retorno_estado || '').toUpperCase() === 'ENTREGADA'
    ).length;
    const posibleRetornoOtroPeriodo = guias.filter((g) => g.es_posible_retorno_otro_periodo);
    const guiasOriginales = guias.filter(esGuiaOriginal);

    const entregadas = guiasOriginales.filter((g) => isEntregada(g.estado_guia)).length;
    const devoluciones = guiasOriginales.filter((g) => g.es_devolucion).length;
    const predoc = guias.filter((g) => g.es_predoc).length;
    const documentadas = guias.filter((g) => g.es_documentada).length;
    const canceladas = guias.filter(
      (g) =>
        isCancelada(g.estado_guia) &&
        !g.es_retorno &&
        !g.es_posible_retorno_otro_periodo &&
        !g.es_predoc &&
        !g.es_documentada
    ).length;
    const abiertas = guiasOriginales.filter((g) => isAbiertaPorEstado(g)).length;
    const retornosAbiertos = devolucionesConRetorno.length - guiasRetornoEntregadas;
    const efectividad = calcularEfectividad(entregadas, devoluciones, abiertas);

    const totalSinDuplicadas =
      guiasOriginales.length + posibleRetornoOtroPeriodo.length + predoc + documentadas + canceladas;

    // COD entregado vs COD en devolución
    const codEntregado = guiasOriginales
      .filter((g) => isEntregada(g.estado_guia))
      .reduce((s, g) => s + (g.cod || 0), 0);
    const codDevolucion = guiasOriginales.filter((g) => g.es_devolucion).reduce((s, g) => s + (g.cod || 0), 0);
    const codAbiertas = guiasOriginales.filter((g) => isAbiertaPorEstado(g)).reduce((s, g) => s + (g.cod || 0), 0);

    // Ranking de excepciones (última excepción vigente de cada guía con excepciones)
    const conteoExcepciones: Record<string, number> = {};
    guias.forEach((g) => {
      const excs = getExcepciones(g);
      const ultima = excs[excs.length - 1];
      if (ultima) conteoExcepciones[ultima] = (conteoExcepciones[ultima] || 0) + 1;
    });
    const rankingExcepciones = Object.entries(conteoExcepciones)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    // Efectividad completa por entidad y por oficina — ordenadas de mayor
    // a menor efectividad (antes se ordenaba por volumen). Los grupos sin
    // dato de efectividad (null) quedan al final, sin importar el orden.
    function porCampo(campo: keyof Guia) {
      const grupos: Record<string, Guia[]> = {};
      guiasOriginales.forEach((g) => {
        const key = (g[campo] as string) || 'SIN DATO';
        if (!grupos[key]) grupos[key] = [];
        grupos[key].push(g);
      });
      return Object.entries(grupos)
        .map(([key, lista]) => ({ key, ...resumenDe(lista) }))
        .sort((a, b) => {
          if (a.efectividad === null && b.efectividad === null) return 0;
          if (a.efectividad === null) return 1;
          if (b.efectividad === null) return -1;
          return b.efectividad - a.efectividad;
        });
    }
    const efectividadPorEntidad = porCampo('entidad_destinatario');
    const efectividadPorOficina = porCampo('oficina_destino');

    // Resumen de guías abiertas por estado
    const abiertasGuias = guiasOriginales.filter((g) => isAbiertaPorEstado(g));
    const abiertasPorEstado: Record<string, number> = {};
    abiertasGuias.forEach((g) => {
      const e = g.estado_guia || 'SIN ESTADO';
      abiertasPorEstado[e] = (abiertasPorEstado[e] || 0) + 1;
    });

    // Abiertas — Originales vs Retornos, y por oficina. A diferencia de
    // `abiertas`/`abiertasGuias` de arriba (que solo cuentan guías
    // ORIGINALES abiertas, para no inflar la efectividad), aquí se usa el
    // mismo criterio que el módulo Abiertas: TODAS las guías en tránsito,
    // sean originales o retornos, porque el objetivo de este resumen es
    // "dónde están las guías paradas ahora mismo", no el cálculo de
    // efectividad.
    const todasAbiertas = guias.filter((g) => isAbiertaPorEstado(g));
    const abiertasOriginales = todasAbiertas.filter(
      (g) => !g.es_retorno && !g.es_posible_retorno_otro_periodo
    ).length;
    const abiertasRetornos = todasAbiertas.filter(
      (g) => g.es_retorno || g.es_posible_retorno_otro_periodo
    ).length;
    const abiertasPorOficina = topPorCampo(todasAbiertas, (g) => g.oficina_destino, 10);

    // Alertas por nivel de días sin movimiento (mismos umbrales que el
    // módulo de Alertas: 3+ alerta, 7+ investigación, 14+ crítico)
    let alertaNivel = 0;
    let investigacionNivel = 0;
    let criticoNivel = 0;
    abiertasGuias.forEach((g) => {
      const d = g.dias_sin_movimiento ?? 0;
      if (d >= 14) criticoNivel++;
      else if (d >= 7) investigacionNivel++;
      else if (d >= 3) alertaNivel++;
    });

    // COD en retornos pendientes: dinero en devoluciones cuyo paquete de
    // retorno todavía no llega físicamente (retorno_estado != ENTREGADA)
    const codRetornosPendientes = devolucionesConRetorno
      .filter((g) => (g.retorno_estado || '').toUpperCase() !== 'ENTREGADA')
      .reduce((s, g) => s + (g.cod || 0), 0);

    // Guías por cantidad de excepciones acumuladas (1 a 5)
    const guiasPorCantidadExcepciones: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    guias.forEach((g) => {
      const n = getExcepciones(g).length;
      if (n >= 1 && n <= 5) guiasPorCantidadExcepciones[n] += 1;
    });

    return {
      total: guias.length,
      totalSinDuplicadas,
      totalOriginales: guiasOriginales.length,
      totalGuiasRetorno: devolucionesConRetorno.length,
      guiasRetornoEntregadas,
      totalPosibleRetornoOtroPeriodo: posibleRetornoOtroPeriodo.length,
      entregadas,
      devoluciones,
      abiertas,
      retornosAbiertos,
      predoc,
      documentadas,
      canceladas,
      efectividad,
      codEntregado,
      codDevolucion,
      codAbiertas,
      codRetornosPendientes,
      alertaNivel,
      investigacionNivel,
      criticoNivel,
      guiasPorCantidadExcepciones,
      rankingExcepciones,
      efectividadPorEntidad,
      efectividadPorOficina,
      abiertasOriginales,
      abiertasRetornos,
      abiertasPorOficina,
      abiertasPorEstado: Object.entries(abiertasPorEstado).sort((a, b) => b[1] - a[1]),
    };
  }, [guias]);

  async function guardarCierre() {
    await fetch('/api/cierres', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        carga_id: cargaActiva?.id || null,
        cliente: cargaActiva?.cliente || null,
        periodo: cargaActiva?.periodo || null,
        resumen_json: resumen,
      }),
    });
    onClose();
  }

  function exportarPDF() {
    exportCierrePDF({
      cliente: cargaActiva?.cliente || 'Sin cliente',
      periodo: formatearPeriodo(cargaActiva?.periodo || null),
      nombreArchivo: cargaActiva?.nombre_archivo || undefined,
      kpis: [
        {
          label: 'Total (sin dup.)',
          value: resumen.totalSinDuplicadas.toLocaleString('es-MX'),
          color: '#1E3A8A',
          detail: 'Originales + posible retorno + predoc + documentadas + canceladas',
        },
        {
          label: 'Guías Originales',
          value: resumen.totalOriginales.toLocaleString('es-MX'),
          color: '#0F172A',
          detail: `${resumen.entregadas.toLocaleString()} entregadas · ${resumen.devoluciones.toLocaleString()} devoluciones · ${resumen.abiertas.toLocaleString()} abiertas`,
        },
        {
          label: 'Entregadas',
          value: resumen.entregadas.toLocaleString('es-MX'),
          color: '#0B9B67',
          detail: 'Guías originales con Estado = ENTREGADA',
        },
        {
          label: 'Devoluciones',
          value: resumen.devoluciones.toLocaleString('es-MX'),
          color: '#DC2626',
          detail: 'Guías originales con Estado = DEVOLUCION',
        },
        {
          label: 'Guías de Retorno',
          value: `${resumen.guiasRetornoEntregadas} / ${resumen.totalGuiasRetorno.toLocaleString('es-MX')}`,
          color: '#7C3AED',
          detail: `Entregados / Total referenciados · ${resumen.totalGuiasRetorno - resumen.guiasRetornoEntregadas} pendiente${(resumen.totalGuiasRetorno - resumen.guiasRetornoEntregadas) !== 1 ? 's' : ''}`,
        },
        {
          label: 'Posible Retorno (otro periodo)',
          value: resumen.totalPosibleRetornoOtroPeriodo.toLocaleString('es-MX'),
          color: '#B45309',
          detail: 'Cliente_Paga = Nombre_Destinatario, sin vínculo en este corte',
        },
        {
          label: 'Abiertas',
          value: resumen.abiertas.toLocaleString('es-MX'),
          color: '#EA7C1A',
          detail: 'En tránsito, no entregadas ni devueltas',
        },
        {
          label: 'Efectividad',
          value: resumen.efectividad !== null ? `${resumen.efectividad}%` : '—',
          color: colorEfectividad(resumen.efectividad),
          detail: `${resumen.entregadas.toLocaleString()} / (${resumen.entregadas.toLocaleString()} + ${resumen.devoluciones.toLocaleString()} + ${resumen.abiertas.toLocaleString()})`,
        },
      ],
      cod: [
        { label: 'COD Entregado', value: `$${resumen.codEntregado.toLocaleString('es-MX')}`, color: '#0B9B67', detail: 'COD cobrado en entregas originales' },
        { label: 'COD en Devolución', value: `$${resumen.codDevolucion.toLocaleString('es-MX')}`, color: '#DC2626', detail: 'COD en riesgo por guías devueltas' },
        { label: 'COD en Riesgo (abiertas)', value: `$${resumen.codAbiertas.toLocaleString('es-MX')}`, color: '#EA7C1A', detail: 'COD pendiente de guías aún en tránsito' },
        { label: 'COD en Retornos Pendientes', value: `$${resumen.codRetornosPendientes.toLocaleString('es-MX')}`, color: '#7C3AED', detail: 'COD de devoluciones cuyo paquete de retorno aún no llega' },
      ],
      alertas: [
        { label: 'Alerta (3-6 días)', value: String(resumen.alertaNivel), color: '#EA7C1A', detail: 'Guías abiertas sin movimiento' },
        { label: 'Investigación (7-13 días)', value: String(resumen.investigacionNivel), color: '#7C3AED', detail: 'Requiere investigación inmediata' },
        { label: 'Crítico (14+ días)', value: String(resumen.criticoNivel), color: '#DC2626', detail: 'Requiere acción inmediata' },
      ],
      guiasPorCantidadExcepciones: Object.entries(resumen.guiasPorCantidadExcepciones) as [string, number][],
      rankingExcepciones: resumen.rankingExcepciones,
      efectividadPorEntidad: resumen.efectividadPorEntidad,
      efectividadPorOficina: resumen.efectividadPorOficina,
      abiertasOriginales: resumen.abiertasOriginales,
      abiertasRetornos: resumen.abiertasRetornos,
      abiertasPorOficina: resumen.abiertasPorOficina,
      abiertasPorEstado: resumen.abiertasPorEstado,
    });
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto vg-scroll p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-bold text-lg">📋 Reporte de Cierre Operativo</h2>
            <p className="text-[12px] text-[var(--vg-text2)]">
              {cargaActiva?.cliente} · {formatearPeriodo(cargaActiva?.periodo || null)}
            </p>
          </div>
          <button onClick={onClose} className="text-[var(--vg-text2)] text-xl leading-none">
            ✕
          </button>
        </div>

        {/* KPIs principales — idénticos al Resumen */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 mb-5">
          <div className="bg-[var(--vg-bg)] rounded-lg p-2.5 text-center">
            <div className="text-[10px] text-[var(--vg-text2)] font-semibold">Total (sin dup.)</div>
            <div className="text-xl font-extrabold">{resumen.totalSinDuplicadas.toLocaleString('es-MX')}</div>
            <div className="text-[9px] text-[var(--vg-text3)] mt-0.5">Originales + posible retorno + predoc + documentadas + canceladas</div>
          </div>
          <div className="bg-[var(--vg-bg)] rounded-lg p-2.5 text-center">
            <div className="text-[10px] text-[var(--vg-text2)] font-semibold">Guías Originales</div>
            <div className="text-xl font-extrabold">{resumen.totalOriginales.toLocaleString('es-MX')}</div>
            <div className="text-[9px] text-[var(--vg-text3)] mt-0.5">
              {resumen.entregadas.toLocaleString()} entregadas · {resumen.devoluciones.toLocaleString()} devoluciones · {resumen.abiertas.toLocaleString()} abiertas
            </div>
          </div>
          <div className="bg-[var(--vg-bg)] rounded-lg p-2.5 text-center">
            <div className="text-[10px] text-[var(--vg-text2)] font-semibold">Entregadas</div>
            <div className="text-xl font-extrabold text-[var(--vg-green)]">{resumen.entregadas.toLocaleString('es-MX')}</div>
            <div className="text-[9px] text-[var(--vg-text3)] mt-0.5">Guías originales con Estado = ENTREGADA</div>
          </div>
          <div className="bg-[var(--vg-bg)] rounded-lg p-2.5 text-center">
            <div className="text-[10px] text-[var(--vg-text2)] font-semibold">Devoluciones</div>
            <div className="text-xl font-extrabold text-[var(--vg-red)]">{resumen.devoluciones.toLocaleString('es-MX')}</div>
            <div className="text-[9px] text-[var(--vg-text3)] mt-0.5">Guías originales con Estado = DEVOLUCION</div>
          </div>
          <div className="bg-[var(--vg-bg)] rounded-lg p-2.5 text-center">
            <div className="text-[10px] text-[var(--vg-text2)] font-semibold">Guías de Retorno</div>
            <div className="text-xl font-extrabold text-[var(--vg-purple)]">
              {resumen.guiasRetornoEntregadas} / {resumen.totalGuiasRetorno.toLocaleString('es-MX')}
            </div>
            <div className="text-[9px] text-[var(--vg-text3)] mt-0.5">
              Entregados / Total referenciados · {resumen.totalGuiasRetorno - resumen.guiasRetornoEntregadas} pendiente{(resumen.totalGuiasRetorno - resumen.guiasRetornoEntregadas) !== 1 ? 's' : ''}
            </div>
          </div>
          <div className="bg-[var(--vg-bg)] rounded-lg p-2.5 text-center">
            <div className="text-[10px] text-[var(--vg-text2)] font-semibold">Posible Retorno (otro periodo)</div>
            <div className="text-xl font-extrabold" style={{ color: '#B45309' }}>
              {resumen.totalPosibleRetornoOtroPeriodo.toLocaleString('es-MX')}
            </div>
            <div className="text-[9px] text-[var(--vg-text3)] mt-0.5">Cliente_Paga = Nombre_Destinatario, sin vínculo en este corte</div>
          </div>
          <div className="bg-[var(--vg-bg)] rounded-lg p-2.5 text-center">
            <div className="text-[10px] text-[var(--vg-text2)] font-semibold">Abiertas</div>
            <div className="text-xl font-extrabold text-[var(--vg-amber)]">{resumen.abiertas.toLocaleString('es-MX')}</div>
            <div className="text-[9px] text-[var(--vg-text3)] mt-0.5">En tránsito, no entregadas ni devueltas</div>
          </div>
          <div className="bg-[var(--vg-bg)] rounded-lg p-2.5 text-center">
            <div className="text-[10px] text-[var(--vg-text2)] font-semibold">Efectividad</div>
            <div className="text-xl font-extrabold" style={{ color: colorEfectividad(resumen.efectividad) }}>
              {resumen.efectividad !== null ? `${resumen.efectividad}%` : '—'}
            </div>
            <div className="text-[9px] text-[var(--vg-text3)] mt-0.5">
              {resumen.entregadas.toLocaleString()} / ({resumen.entregadas.toLocaleString()} + {resumen.devoluciones.toLocaleString()} + {resumen.abiertas.toLocaleString()})
            </div>
          </div>
        </div>

        {/* COD entregado vs devolución */}
        <div className="mb-5">
          <div className="font-bold text-[12.5px] mb-2">COD Entregado vs COD en Devolución / Retorno</div>
          <div className="grid grid-cols-4 gap-2.5">
            <div className="bg-white border border-[var(--vg-border)] rounded-lg p-3 text-center">
              <div className="text-[10px] text-[var(--vg-text2)] font-semibold">COD Entregado</div>
              <div className="text-lg font-extrabold text-[var(--vg-green)]">${resumen.codEntregado.toLocaleString('es-MX')}</div>
            </div>
            <div className="bg-white border border-[var(--vg-border)] rounded-lg p-3 text-center">
              <div className="text-[10px] text-[var(--vg-text2)] font-semibold">COD en Devolución</div>
              <div className="text-lg font-extrabold text-[var(--vg-red)]">${resumen.codDevolucion.toLocaleString('es-MX')}</div>
            </div>
            <div className="bg-white border border-[var(--vg-border)] rounded-lg p-3 text-center">
              <div className="text-[10px] text-[var(--vg-text2)] font-semibold">COD en Riesgo (abiertas)</div>
              <div className="text-lg font-extrabold text-[var(--vg-amber)]">${resumen.codAbiertas.toLocaleString('es-MX')}</div>
            </div>
            <div className="bg-white border border-[var(--vg-border)] rounded-lg p-3 text-center">
              <div className="text-[10px] text-[var(--vg-text2)] font-semibold">COD en Retornos Pendientes</div>
              <div className="text-lg font-extrabold" style={{ color: '#7C3AED' }}>${resumen.codRetornosPendientes.toLocaleString('es-MX')}</div>
            </div>
          </div>
        </div>

        {/* Alertas por nivel de riesgo */}
        <div className="mb-5">
          <div className="font-bold text-[12.5px] mb-2">Alertas — Guías Abiertas por Nivel de Riesgo</div>
          <div className="grid grid-cols-3 gap-2.5">
            <div className="bg-white border border-[var(--vg-border)] rounded-lg p-3 text-center">
              <div className="text-[10px] text-[var(--vg-text2)] font-semibold">Alerta (3-6 días)</div>
              <div className="text-lg font-extrabold text-[var(--vg-amber)]">{resumen.alertaNivel}</div>
            </div>
            <div className="bg-white border border-[var(--vg-border)] rounded-lg p-3 text-center">
              <div className="text-[10px] text-[var(--vg-text2)] font-semibold">Investigación (7-13 días)</div>
              <div className="text-lg font-extrabold" style={{ color: '#7C3AED' }}>{resumen.investigacionNivel}</div>
            </div>
            <div className="bg-white border border-[var(--vg-border)] rounded-lg p-3 text-center">
              <div className="text-[10px] text-[var(--vg-text2)] font-semibold">Crítico (14+ días)</div>
              <div className="text-lg font-extrabold text-[var(--vg-red)]">{resumen.criticoNivel}</div>
            </div>
          </div>
        </div>

        {/* Guías por cantidad de excepciones */}
        <div className="mb-5">
          <div className="font-bold text-[12.5px] mb-2">Guías por Cantidad de Excepciones</div>
          <div className="grid grid-cols-5 gap-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <div key={n} className="bg-white border border-[var(--vg-border)] rounded-lg p-2.5 text-center">
                <div className="text-[16px] font-extrabold text-[var(--vg-blue)]">{resumen.guiasPorCantidadExcepciones[n]}</div>
                <div className="text-[9.5px] text-[var(--vg-text2)]">{n} excepci{n === 1 ? 'ón' : 'ones'}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Ranking de excepciones */}
        <div className="mb-5">
          <div className="font-bold text-[12.5px] mb-2">Ranking de Excepciones</div>
          <div className="border border-[var(--vg-border)] rounded-lg overflow-hidden">
            <table className="vg-table">
              <thead>
                <tr>
                  <th>Excepción</th>
                  <th>Guías</th>
                </tr>
              </thead>
              <tbody>
                {resumen.rankingExcepciones.map(([exc, n]) => (
                  <tr key={exc}>
                    <td className="font-medium">{exc}</td>
                    <td className="font-bold">{n}</td>
                  </tr>
                ))}
                {!resumen.rankingExcepciones.length && (
                  <tr>
                    <td colSpan={2} className="text-center text-[var(--vg-text3)] py-3">
                      Sin excepciones registradas
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Efectividad por entidad y oficina — completa, ordenada de mayor a menor */}
        <div className="mb-5">
          <div className="font-bold text-[12.5px] mb-2">Efectividad por Entidad y Oficina</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div className="text-[11.5px] font-bold text-[var(--vg-text2)] mb-1.5">
                Todas las Entidades ({resumen.efectividadPorEntidad.length})
              </div>
              <div className="border border-[var(--vg-border)] rounded-lg overflow-hidden">
                <div className="max-h-[280px] overflow-y-auto vg-scroll">
                  <table className="vg-table">
                    <thead>
                      <tr>
                        <th>Entidad</th>
                        <th>Total</th>
                        <th>Efect.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {resumen.efectividadPorEntidad.map((e) => (
                        <tr key={e.key}>
                          <td className="font-medium">{e.key}</td>
                          <td>{e.total}</td>
                          <td className="font-bold" style={{ color: colorEfectividad(e.efectividad) }}>
                            {e.efectividad !== null ? `${e.efectividad}%` : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
            <div>
              <div className="text-[11.5px] font-bold text-[var(--vg-text2)] mb-1.5">
                Todas las Oficinas ({resumen.efectividadPorOficina.length})
              </div>
              <div className="border border-[var(--vg-border)] rounded-lg overflow-hidden">
                <div className="max-h-[280px] overflow-y-auto vg-scroll">
                  <table className="vg-table">
                    <thead>
                      <tr>
                        <th>Oficina</th>
                        <th>Total</th>
                        <th>Efect.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {resumen.efectividadPorOficina.map((o) => (
                        <tr key={o.key}>
                          <td className="font-medium">{o.key}</td>
                          <td>{o.total}</td>
                          <td className="font-bold" style={{ color: colorEfectividad(o.efectividad) }}>
                            {o.efectividad !== null ? `${o.efectividad}%` : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Abiertas: Originales vs Retornos, y por oficina */}
        <div className="mb-5">
          <div className="font-bold text-[12.5px] mb-2">Guías Abiertas — Originales vs Retornos</div>
          <div className="grid grid-cols-2 gap-2.5 mb-3">
            <div className="bg-white border border-[var(--vg-border)] rounded-lg p-3 text-center">
              <div className="text-[10px] text-[var(--vg-text2)] font-semibold">Originales</div>
              <div className="text-lg font-extrabold text-[var(--vg-blue)]">{resumen.abiertasOriginales.toLocaleString('es-MX')}</div>
            </div>
            <div className="bg-white border border-[var(--vg-border)] rounded-lg p-3 text-center">
              <div className="text-[10px] text-[var(--vg-text2)] font-semibold">Retornos</div>
              <div className="text-lg font-extrabold text-[var(--vg-purple)]">{resumen.abiertasRetornos.toLocaleString('es-MX')}</div>
            </div>
          </div>
          <div className="text-[11.5px] font-bold text-[var(--vg-text2)] mb-1.5">Por Oficina</div>
          <div className="border border-[var(--vg-border)] rounded-lg overflow-hidden">
            <table className="vg-table">
              <thead>
                <tr>
                  <th>Oficina</th>
                  <th>Guías Abiertas</th>
                </tr>
              </thead>
              <tbody>
                {resumen.abiertasPorOficina.map(({ key, count }) => (
                  <tr key={key}>
                    <td className="font-medium">{key}</td>
                    <td className="font-bold">{count}</td>
                  </tr>
                ))}
                {!resumen.abiertasPorOficina.length && (
                  <tr>
                    <td colSpan={2} className="text-center text-[var(--vg-text3)] py-3">
                      Sin guías abiertas en este corte
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Resumen de guías abiertas */}
        <div className="mb-2">
          <div className="font-bold text-[12.5px] mb-2">Resumen de Guías Abiertas ({resumen.abiertas})</div>
          <div className="border border-[var(--vg-border)] rounded-lg overflow-hidden">
            <table className="vg-table">
              <thead>
                <tr>
                  <th>Estado</th>
                  <th>Guías</th>
                </tr>
              </thead>
              <tbody>
                {resumen.abiertasPorEstado.map(([estado, n]) => (
                  <tr key={estado}>
                    <td className="font-medium">{estado}</td>
                    <td className="font-bold">{n}</td>
                  </tr>
                ))}
                {!resumen.abiertasPorEstado.length && (
                  <tr>
                    <td colSpan={2} className="text-center text-[var(--vg-text3)] py-3">
                      No hay guías abiertas en este corte
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <button
            onClick={exportarPDF}
            className="text-[12px] font-semibold text-[var(--vg-text2)] border border-[var(--vg-border)] rounded-md px-3 py-1.5"
          >
            🖨 PDF
          </button>
          <button
            onClick={guardarCierre}
            className="text-[12px] font-semibold text-white bg-[var(--vg-blue)] rounded-md px-3 py-1.5"
          >
            Guardar cierre
          </button>
        </div>
      </div>
    </div>
  );
}
