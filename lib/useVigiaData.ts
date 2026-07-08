'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Guia, Carga } from './types';
import { isEntregada, isAbiertaPorEstado, calcularEfectividad } from './business-logic';

export function useVigiaData() {
  const [cargas, setCargas] = useState<Carga[]>([]);
  const [cargaActivaId, setCargaActivaId] = useState<string | null>(null);
  const [guias, setGuias] = useState<Guia[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filtros globales (compartidos entre módulos)
  const [filtroCliente, setFiltroCliente] = useState<string>('');
  const [filtroOficina, setFiltroOficina] = useState<string>('');
  const [filtroEntidad, setFiltroEntidad] = useState<string>('');
  const [filtroPeriodo, setFiltroPeriodo] = useState<string>('');

  const cargarListaCargas = useCallback(async (autoSwitchToLatest = false) => {
    try {
      const res = await fetch('/api/cargas');
      const json = await res.json();
      if (json.cargas) {
        setCargas(json.cargas);
        if (!cargaActivaId && json.cargas.length) {
          // Primera carga: selecciona la más reciente automáticamente
          setCargaActivaId(json.cargas[0].id);
        } else if (autoSwitchToLatest && json.cargas.length) {
          // Después de subir un nuevo Excel: cambia a la carga recién creada
          setCargaActivaId(json.cargas[0].id);
        }
      }
    } catch {
      setError('No se pudo cargar la lista de cargas');
    }
  }, [cargaActivaId]);

  const cargarGuias = useCallback(async (cargaId: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/guias?carga_id=${cargaId}`);
      const json = await res.json();
      if (json.guias) setGuias(json.guias);
      else setError(json.error || 'Error desconocido');
    } catch {
      setError('No se pudieron cargar las guías');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    cargarListaCargas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (cargaActivaId) cargarGuias(cargaActivaId);
  }, [cargaActivaId, cargarGuias]);

  const guiasFiltradas = useMemo(() => {
    return guias.filter((g) => {
      if (filtroCliente && g.cliente !== filtroCliente) return false;
      if (filtroOficina && g.oficina_destino !== filtroOficina) return false;
      if (filtroEntidad && g.entidad_destinatario !== filtroEntidad) return false;
      if (filtroPeriodo) {
        const mes = (g.f_documentacion || '').slice(0, 7);
        if (mes !== filtroPeriodo) return false;
      }
      return true;
    });
  }, [guias, filtroCliente, filtroOficina, filtroEntidad, filtroPeriodo]);

  const clientes = useMemo(
    () => [...new Set(guias.map((g) => g.cliente).filter(Boolean))].sort() as string[],
    [guias]
  );
  const oficinas = useMemo(
    () => [...new Set(guias.map((g) => g.oficina_destino).filter(Boolean))].sort() as string[],
    [guias]
  );
  const entidades = useMemo(
    () => [...new Set(guias.map((g) => g.entidad_destinatario).filter(Boolean))].sort() as string[],
    [guias]
  );
  // Periodos (mes) detectados a partir de F_Documentacion de cada guía,
  // para permitir filtrar el corte por mes cuando mezcla varios periodos.
  const periodos = useMemo(
    () =>
      [...new Set(guias.map((g) => (g.f_documentacion || '').slice(0, 7)).filter(Boolean))].sort() as string[],
    [guias]
  );

  const kpis = useMemo(() => {
    const total = guiasFiltradas.length;
    const guiasRetorno = guiasFiltradas.filter((g) => g.es_retorno || g.es_posible_retorno_otro_periodo);
    const guiasOriginales = guiasFiltradas.filter((g) => !g.es_retorno && !g.es_posible_retorno_otro_periodo && !g.es_predoc);
    const entregadas = guiasOriginales.filter((g) => isEntregada(g.estado_guia)).length;
    const devoluciones = guiasOriginales.filter((g) => g.es_devolucion).length;
    const abiertas = guiasOriginales.filter((g) => isAbiertaPorEstado(g)).length;
    const predoc = guiasFiltradas.filter((g) => g.es_predoc).length;
    const retornosEntregados = guiasRetorno.filter((g) => isEntregada(g.estado_guia)).length;

    // Retornos abiertos: devoluciones con guía de retorno referenciada cuyo
    // retorno_estado todavía no es ENTREGADA. No cuentan como "guías
    // abiertas" (esas son solo guías originales en tránsito), pero sí
    // entran al cálculo de efectividad como pendiente/no efectivo.
    const devolucionesConRetorno = guiasOriginales.filter((g) => g.es_devolucion && g.retorno_guia);
    const retornosAbiertos = devolucionesConRetorno.filter(
      (g) => (g.retorno_estado || '').toUpperCase() !== 'ENTREGADA'
    ).length;

    // Misma fórmula que ResumenModule: Entregadas / (Entregadas + Devoluciones + Abiertas + Retornos Abiertos)
    const efectividad = calcularEfectividad(entregadas, devoluciones, abiertas);

    return {
      total,
      totalOriginales: guiasOriginales.length,
      totalRetornos: guiasRetorno.length,
      retornosEntregados,
      retornosAbiertos,
      entregadas,
      devoluciones,
      abiertas,
      predoc,
      efectividad,
    };
  }, [guiasFiltradas]);

  const eliminarCarga = useCallback(
    async (id: string) => {
      const res = await fetch(`/api/cargas?id=${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'No se pudo eliminar la carga');
      // Si borramos la carga activa, limpia la selección para que se
      // reasigne a la carga más reciente que quede.
      if (id === cargaActivaId) setCargaActivaId(null);
      await cargarListaCargas(true);
    },
    [cargaActivaId, cargarListaCargas]
  );

  const cargaActiva = cargas.find((c) => c.id === cargaActivaId) || null;

  return {
    cargas,
    cargaActiva,
    cargaActivaId,
    setCargaActivaId,
    eliminarCarga,
    guias,
    guiasFiltradas,
    loading,
    error,
    filtroCliente,
    setFiltroCliente,
    filtroOficina,
    setFiltroOficina,
    filtroEntidad,
    setFiltroEntidad,
    filtroPeriodo,
    setFiltroPeriodo,
    clientes,
    oficinas,
    entidades,
    periodos,
    kpis,
    recargar: () => {
      // autoSwitchToLatest=true: después de subir un Excel, cambia automáticamente
      // a la nueva carga sin necesidad de hacer refresh manual de la página
      cargarListaCargas(true);
    },
  };
}
