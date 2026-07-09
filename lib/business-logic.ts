import { Guia } from './types';

// ============================================================
// Helper de codificación segura para mailto: links.
// URLSearchParams codifica espacios como '+', pero los clientes
// de correo (mailto:) requieren '%20'. Esta función corrige eso.
// ============================================================
export function buildMailtoUrl(to: string, params: { cc?: string; subject: string; body: string }): string {
  const encode = (s: string) => encodeURIComponent(s).replace(/%20/g, '%20');
  const parts: string[] = [];
  if (params.cc) parts.push(`cc=${encode(params.cc)}`);
  parts.push(`subject=${encode(params.subject)}`);
  parts.push(`body=${encode(params.body)}`);
  return `mailto:${to}?${parts.join('&')}`;
}

// ============================================================
// Helpers de clasificación de guías
// ============================================================

export function isDevolucion(estado: string | null): boolean {
  return (estado || '').toUpperCase().trim() === 'DEVOLUCION';
}

export function isEntregada(estado: string | null): boolean {
  return (estado || '').toUpperCase().trim() === 'ENTREGADA';
}

export function isPredoc(estado: string | null): boolean {
  return (estado || '').toUpperCase().trim().startsWith('PRE-DOC');
}

export function isCancelada(estado: string | null): boolean {
  const e = (estado || '').toUpperCase().trim();
  return e === 'CANCELADA' || e === 'CANCELADO' || e === 'CANCELADA POR CLIENTE';
}

export function isEnRuta(estado: string | null): boolean {
  return (estado || '').toUpperCase().trim() === 'EN RUTA';
}

// Usado SOLO para el módulo "Resumen" (mantiene el criterio de Calificación
// cuando existe, como respaldo, porque ahí se reporta el indicador oficial)
export function isAbierta(g: Pick<Guia, 'estado_guia' | 'calificacion' | 'es_predoc' | 'es_devolucion'>): boolean {
  if (g.calificacion) return g.calificacion.toUpperCase().trim() === 'ABIERTA';
  return !g.es_predoc && !g.es_devolucion && !isEntregada(g.estado_guia);
}

// Usado en el módulo "Guías Abiertas / En Tránsito": se basa PURAMENTE en el
// estado de la guía, ignorando Calificación. Es "abierta" cualquier guía que
// no esté entregada, devuelta, cancelada o pre-documentada.
export function isAbiertaPorEstado(g: Pick<Guia, 'estado_guia' | 'es_predoc' | 'es_devolucion'>): boolean {
  if (g.es_predoc || g.es_devolucion) return false;
  if (isEntregada(g.estado_guia)) return false;
  if (isCancelada(g.estado_guia)) return false;
  return true;
}

// Una guía cuenta como "entrega efectiva" solo si está ENTREGADA y NO es,
// de ninguna forma, un retorno: ni explícito (es_retorno) ni un posible
// retorno de otro periodo (mismo Cliente_Paga y Nombre_Destinatario).
export function esEntregaEfectiva(
  g: Pick<Guia, 'estado_guia' | 'es_predoc' | 'es_retorno' | 'es_posible_retorno_otro_periodo'>
): boolean {
  if (g.es_predoc || g.es_retorno || g.es_posible_retorno_otro_periodo) return false;
  return isEntregada(g.estado_guia);
}

// Una guía es "retorno" en sentido amplio (para conteos de retorno) si es
// explícitamente un retorno O un posible retorno de otro periodo.
export function esRetornoAmplio(g: Pick<Guia, 'es_retorno' | 'es_posible_retorno_otro_periodo'>): boolean {
  return g.es_retorno || g.es_posible_retorno_otro_periodo;
}

// ============================================================
// Formatea un periodo YYYY-MM a texto legible ("Mayo 2026")
// ============================================================
const MESES_ES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

export function formatearPeriodo(yyyyMm: string | null | undefined): string {
  if (!yyyyMm) return 'No especificado';
  const [anio, mes] = yyyyMm.split('-');
  const idx = parseInt(mes, 10) - 1;
  if (idx < 0 || idx > 11 || !anio) return yyyyMm;
  const nombre = MESES_ES[idx];
  return `${nombre.charAt(0).toUpperCase()}${nombre.slice(1)} ${anio}`;
}

// ============================================================
// Facturación: tarifas por tipo de guía
// ============================================================
export const TARIFA_ENTREGA_ORIGINAL = 100; // guía original entregada
export const TARIFA_RETORNO_ENTREGADO = 40; // guía de retorno entregada

export interface ItemFacturable {
  guia: string;
  tipo: 'ENTREGA_ORIGINAL' | 'DEVOLUCION' | 'POSIBLE_RETORNO_OTRO_PERIODO' | 'RETORNO_ENTREGADO';
  tarifa: number;
  oficina: string;
  entidad: string;
  mes: string; // YYYY-MM
  fecha: string | null;
}

// Determina qué guías son facturables y a qué tarifa.
// - ENTREGA_ORIGINAL ($100): guía original entregada, no devolución, no retorno
// - DEVOLUCION ($40): toda guía marcada como DEVOLUCION se factura al autorizarse,
//   sin importar si el retorno físico ya llegó o sigue pendiente
// - POSIBLE_RETORNO_OTRO_PERIODO ($40): guías con mismo Cliente_Paga=Nombre_Destinatario
//   sin vínculo explícito en este corte; KPI separado, no se duplica con DEVOLUCION
// - RETORNO_ENTREGADO ($100): se cobra en cuanto el retorno queda GENERADO
//   (la guía de devolución trae un número de guía de retorno asignado,
//   campo `retorno_guia`) — no se espera a que el paquete llegue
//   físicamente de vuelta (`retorno_estado = ENTREGADA`). El nombre interno
//   del tipo se mantiene por compatibilidad, pero en la UI se muestra como
//   "Retornos Generados".
export function calcularItemsFacturables(guias: Guia[], tarifas?: { tarifa_entrega_original: number; tarifa_devolucion: number; tarifa_retorno_entregado: number; tarifa_posible_retorno: number }): ItemFacturable[] {
  const T_ENTREGA = tarifas?.tarifa_entrega_original ?? TARIFA_ENTREGA_ORIGINAL;
  const T_DEV = tarifas?.tarifa_devolucion ?? TARIFA_RETORNO_ENTREGADO;
  const T_RETORNO = tarifas?.tarifa_retorno_entregado ?? TARIFA_ENTREGA_ORIGINAL;
  const T_POSIBLE = tarifas?.tarifa_posible_retorno ?? TARIFA_RETORNO_ENTREGADO;

  const items: ItemFacturable[] = [];

  guias.forEach((g) => {
    if (g.es_devolucion) {
      const fecha = g.f_historia;
      items.push({
        guia: g.guia,
        tipo: 'DEVOLUCION',
        tarifa: T_DEV,
        oficina: g.oficina_destino || 'SIN OFICINA',
        entidad: g.entidad_destinatario || 'SIN ENTIDAD',
        mes: (fecha || '').slice(0, 7),
        fecha,
      });

      // Se factura el retorno en cuanto SE GENERA (queda asignado un número
      // de guía de retorno), no cuando el paquete físicamente llega de
      // vuelta. `retorno_guia` se asigna al momento de la devolución, así
      // que la fecha de facturación es la misma que la de la devolución.
      if (g.retorno_guia) {
        items.push({
          guia: g.guia,
          tipo: 'RETORNO_ENTREGADO',
          tarifa: T_RETORNO,
          oficina: g.oficina_destino || 'SIN OFICINA',
          entidad: g.entidad_destinatario || 'SIN ENTIDAD',
          mes: (fecha || '').slice(0, 7),
          fecha,
        });
      }
    } else if (g.es_posible_retorno_otro_periodo) {
      const fecha = g.f_entrega || g.f_historia;
      items.push({
        guia: g.guia,
        tipo: 'POSIBLE_RETORNO_OTRO_PERIODO',
        tarifa: T_POSIBLE,
        oficina: g.oficina_destino || 'SIN OFICINA',
        entidad: g.entidad_destinatario || 'SIN ENTIDAD',
        mes: (fecha || '').slice(0, 7),
        fecha,
      });
    } else if (!g.es_predoc && !g.es_retorno && isEntregada(g.estado_guia)) {
      const fecha = g.f_entrega || g.f_historia;
      items.push({
        guia: g.guia,
        tipo: 'ENTREGA_ORIGINAL',
        tarifa: T_ENTREGA,
        oficina: g.oficina_destino || 'SIN OFICINA',
        entidad: g.entidad_destinatario || 'SIN ENTIDAD',
        mes: (fecha || '').slice(0, 7),
        fecha,
      });
    }
  });

  return items;
}

// ============================================================
// Nivel de alerta según días sin movimiento (basado en F_Historia)
// ============================================================
export interface NivelAlerta {
  nivel: 'normal' | 'alerta' | 'investigacion' | 'critico';
  etiqueta: string;
  color: string;
}

export function nivelAlertaPorDias(dias: number | null): NivelAlerta {
  if (dias === null) return { nivel: 'normal', etiqueta: '', color: '#94A3B8' };
  if (dias >= 14) return { nivel: 'critico', etiqueta: 'Estado crítico: se requiere acción inmediata', color: '#DC2626' };
  if (dias >= 7) return { nivel: 'investigacion', etiqueta: 'Iniciar investigación inmediata', color: '#7C3AED' };
  if (dias >= 3) return { nivel: 'alerta', etiqueta: 'Alerta de guía sin movimiento', color: '#EA7C1A' };
  return { nivel: 'normal', etiqueta: '', color: '#94A3B8' };
}

// ============================================================
// Extrae las excepciones no vacías de una guía, en orden
// ============================================================
export function getExcepciones(g: Pick<Guia, 'excepcion_1' | 'excepcion_2' | 'excepcion_3' | 'excepcion_4' | 'excepcion_5'>): string[] {
  return [g.excepcion_1, g.excepcion_2, g.excepcion_3, g.excepcion_4, g.excepcion_5]
    .map((e) => (e || '').trim())
    .filter(Boolean);
}

// Quita el sufijo numérico (" 2", " 3") para agrupar por excepción "base".
// Exportada porque se reutiliza en el KPI de excepciones (y en el de
// motivos de devolución) para agrupar cadenas como AUSENCIA / AUSENCIA 2 /
// AUSENCIA 3 en una sola categoría "AUSENCIA".
export function baseExcepcion(e: string): string {
  return e.replace(/\s+\d+$/, '').trim().toUpperCase();
}

// Top N valores de un campo (oficina, entidad, ciudad, etc.) por cantidad
// de guías, útil para rankings tipo "top oficinas con más excepciones".
export function topPorCampo<T>(
  lista: T[],
  obtenerValor: (item: T) => string | null | undefined,
  top: number = 10
): Array<{ key: string; count: number }> {
  const conteo: Record<string, number> = {};
  lista.forEach((item) => {
    const v = (obtenerValor(item) || '').trim();
    if (!v) return;
    conteo[v] = (conteo[v] || 0) + 1;
  });
  return Object.entries(conteo)
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, top);
}

// Cuenta, agrupando por baseExcepcion(), la ÚLTIMA excepción de la cadena
// de cada guía (la vigente). Es la pieza compartida detrás del "Top 10 por
// Tipo" del módulo Excepciones y del "Top 10 Motivos" de Devoluciones —
// en ambos casos AUSENCIA / AUSENCIA 2 / AUSENCIA 3 cuentan como una sola
// categoría "AUSENCIA".
function topTiposAgrupados<T extends Pick<Guia, 'excepcion_1' | 'excepcion_2' | 'excepcion_3' | 'excepcion_4' | 'excepcion_5'>>(
  lista: T[],
  top: number = 10
): Array<{ key: string; count: number }> {
  const conteo: Record<string, number> = {};
  lista.forEach((g) => {
    const excs = getExcepciones(g);
    const ultima = excs[excs.length - 1];
    if (!ultima) return;
    const base = baseExcepcion(ultima);
    conteo[base] = (conteo[base] || 0) + 1;
  });
  return Object.entries(conteo)
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, top);
}

// ============================================================
// KPI de Excepciones — usado en el módulo Excepciones, y en versión
// resumida en Resumen y Efectividad.
//
// La agrupación por "tipo" (AUSENCIA, AUSENCIA 2, AUSENCIA 3 → AUSENCIA)
// aplica SOLO a este cálculo — el resto del módulo Excepciones (tabla,
// filtro, ranking general por ubicación) sigue mostrando cada variante
// de la cadena por separado, sin agrupar.
// ============================================================
export interface ResumenExcepciones {
  total: number; // guías consideradas (excluye predoc, canceladas, en ruta; requiere al menos 1 excepción)
  porTipo: Array<{ key: string; count: number }>; // agrupado por baseExcepcion — esta ES el "Top 10 de excepciones"
  porOficina: Array<{ key: string; count: number }>;
  porEntidad: Array<{ key: string; count: number }>;
}

export function calcularResumenExcepciones(
  guias: Pick<
    Guia,
    | 'estado_guia'
    | 'es_predoc'
    | 'oficina_destino'
    | 'entidad_destinatario'
    | 'excepcion_1'
    | 'excepcion_2'
    | 'excepcion_3'
    | 'excepcion_4'
    | 'excepcion_5'
  >[],
  top: number = 10
): ResumenExcepciones {
  const relevantes = guias.filter(
    (g) => !g.es_predoc && !isCancelada(g.estado_guia) && !isEnRuta(g.estado_guia) && getExcepciones(g).length > 0
  );

  return {
    total: relevantes.length,
    porTipo: topTiposAgrupados(relevantes, top),
    porOficina: topPorCampo(relevantes, (g) => g.oficina_destino, top),
    porEntidad: topPorCampo(relevantes, (g) => g.entidad_destinatario, top),
  };
}

// ============================================================
// Resumen de Devoluciones — mismo espíritu que ResumenExcepciones, para
// el módulo Devoluciones y sus versiones resumidas en Resumen y
// Efectividad. "porMotivo" agrupa la última excepción de la cadena igual
// que en excepciones (AUSENCIA / AUSENCIA 2 / AUSENCIA 3 → AUSENCIA).
// ============================================================
export interface ResumenDevoluciones {
  total: number;
  porOficina: Array<{ key: string; count: number }>;
  porEntidad: Array<{ key: string; count: number }>;
  porMotivo: Array<{ key: string; count: number }>;
}

export function calcularResumenDevoluciones(
  guias: Pick<
    Guia,
    | 'es_devolucion'
    | 'oficina_destino'
    | 'entidad_destinatario'
    | 'excepcion_1'
    | 'excepcion_2'
    | 'excepcion_3'
    | 'excepcion_4'
    | 'excepcion_5'
  >[],
  top: number = 10
): ResumenDevoluciones {
  const devoluciones = guias.filter((g) => g.es_devolucion);

  return {
    total: devoluciones.length,
    porOficina: topPorCampo(devoluciones, (g) => g.oficina_destino, top),
    porEntidad: topPorCampo(devoluciones, (g) => g.entidad_destinatario, top),
    porMotivo: topTiposAgrupados(devoluciones, top),
  };
}

// ============================================================
// REGLA DE ACCIÓN — replica la lógica getAccion() del HTML original
// ============================================================

// Normaliza un nombre de excepción para comparar: quita acentos, mayúsculas,
// colapsa espacios. Los exports de OPS a veces vienen sin acentos
// (ej. "FALTA NUMERO" en vez de "FALTA NÚMERO") y sin esto el cruce contra
// el catálogo fallaba silenciosamente y la guía caía en INVESTIGAR.
export function normalizarClave(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim()
    .replace(/\s+/g, ' ');
}

// Lee un campo de la fila cruda probando varios nombres posibles de columna,
// sin importar mayúsculas/minúsculas ni espacios extra. Necesario porque el
// export de OPS no es consistente entre clientes/cortes: a veces la columna
// se llama "Estado Retorno", a veces "Estado retorno", etc.
export function campoInsensible(r: FilaExcelCruda, ...candidatos: string[]): unknown {
  for (const c of candidatos) {
    if (r[c] !== undefined && r[c] !== null && r[c] !== '') return r[c];
  }
  // Si ninguno calzó exacto, busca entre las claves reales de la fila
  // comparando de forma normalizada (sin acentos, mayúsculas, espacios).
  const objetivos = candidatos.map((c) => normalizarClave(c));
  for (const key of Object.keys(r)) {
    if (objetivos.includes(normalizarClave(key))) {
      const v = r[key];
      if (v !== undefined && v !== null && v !== '') return v;
    }
  }
  return undefined;
}

export function calcularAccion(
  g: Pick<Guia, 'excepcion_1' | 'excepcion_2' | 'excepcion_3' | 'excepcion_4' | 'excepcion_5'>,
  catalogoMap: Record<string, string>
): string {
  const excs = getExcepciones(g);
  if (!excs.length) return '';

  const upper = excs.map((e) => e.toUpperCase());

  // REGLA 0: cualquier excepción de robo → POSIBLE INDEMNIZACIÓN
  if (upper.some((e) => e.includes('ROBO'))) return 'POSIBLE INDEMNIZACIÓN';

  // REGLA 0b: COD RECHAZADO en la cadena → DEVOLVER_COD
  if (upper.some((e) => e.includes('COD RECHAZADO'))) return 'DEVOLVER_COD';

  // REGLA 0c: CLIENTE CANCELO → DEVOLVER_COD
  if (upper.some((e) => e === 'CLIENTE CANCELO')) return 'DEVOLVER_COD';

  // REGLA 1: contar ocurrencias por excepción "base" — 3+ veces → DEVOLVER
  const counts: Record<string, number> = {};
  excs.forEach((e) => {
    const base = baseExcepcion(e);
    counts[base] = (counts[base] || 0) + 1;
  });
  const baseConTresOMas = Object.entries(counts).find(([, n]) => n >= 3);
  if (baseConTresOMas) return 'DEVOLVER';

  // REGLA 2: usar el catálogo según la ÚLTIMA excepción de la cadena
  // (normalizado: el export de OPS a veces pierde acentos, ej. "FALTA NUMERO")
  const ultima = excs[excs.length - 1];
  const accionCatalogo = catalogoMap[normalizarClave(ultima)];
  if (accionCatalogo) return accionCatalogo;

  // REGLA 3: si la última excepción no está en catálogo, marcar para investigar
  return 'INVESTIGAR';
}

// ============================================================
// Días sin movimiento — calculado contra hoy
// ============================================================
export function calcularDiasSinMovimiento(fechaUltimoMovimiento: string | null): number | null {
  if (!fechaUltimoMovimiento) return null;
  const fecha = new Date(fechaUltimoMovimiento);
  if (isNaN(fecha.getTime())) return null;
  const hoy = new Date();
  const diffMs = hoy.getTime() - fecha.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

// ============================================================
// Tiempo promedio de entrega: días entre F_Documentacion y F_Entrega
// ============================================================

// Diferencia en días entre dos fechas 'YYYY-MM-DD'. Devuelve null si
// falta alguna fecha, si alguna es inválida, o si la fecha de entrega
// es anterior a la de documentación (dato sucio: se descarta en vez de
// contarlo como negativo, para no distorsionar el promedio).
export function diasEntreFechas(inicio: string | null, fin: string | null): number | null {
  if (!inicio || !fin) return null;
  const dIni = new Date(inicio);
  const dFin = new Date(fin);
  if (isNaN(dIni.getTime()) || isNaN(dFin.getTime())) return null;
  const dias = Math.round((dFin.getTime() - dIni.getTime()) / (1000 * 60 * 60 * 24));
  return dias >= 0 ? dias : null;
}

export interface TiempoPromedioEntrega {
  promedioDias: number | null;
  medianaDias: number | null;
  muestras: number; // total de guías usadas en el cálculo (entregadas + abiertas)
  muestrasEntregadas: number;
  muestrasAbiertas: number;
}

// Calcula el tiempo promedio (y mediana) de entrega, en días, desde
// F_Documentacion. Incluye DOS grupos de guías (ninguna de las dos es
// retorno ni predoc, en ningún caso):
//
// 1. Entregadas: días hasta F_Confirmacion (tiempo real ya conocido).
// 2. Abiertas: guías que no son entregadas, ni devolución, ni canceladas
//    — siguen en tránsito. Para estas se usa la fecha de HOY en vez de
//    una fecha de confirmación que todavía no existe. Si se excluyeran
//    del cálculo, el KPI solo reflejaría qué tan rápido se entrega lo
//    que YA se entregó, sin castigar lo que lleva mucho tiempo atorado
//    sin resolverse — que es justo lo que este indicador debe capturar.
//
// La mediana se incluye junto al promedio porque unos pocos casos
// extremos (guías con fechas mal capturadas, o abiertas desde hace
// meses) pueden inflar el promedio; la mediana da un segundo dato más
// robusto.
export function calcularTiempoPromedioEntrega(
  guias: Pick<
    Guia,
    | 'estado_guia'
    | 'es_predoc'
    | 'es_retorno'
    | 'es_posible_retorno_otro_periodo'
    | 'es_devolucion'
    | 'f_documentacion'
    | 'f_confirmacion'
  >[]
): TiempoPromedioEntrega {
  const hoyIso = new Date().toISOString().slice(0, 10);
  const diasEntregadas: number[] = [];
  const diasAbiertas: number[] = [];

  guias.forEach((g) => {
    // Ninguna guía de retorno (explícita o posible de otro periodo) ni
    // pre-documentada entra a este cálculo, en ningún grupo.
    if (g.es_predoc || g.es_retorno || g.es_posible_retorno_otro_periodo) return;

    if (isEntregada(g.estado_guia)) {
      const dias = diasEntreFechas(g.f_documentacion, g.f_confirmacion);
      if (dias !== null) diasEntregadas.push(dias);
      return;
    }

    // No entregada: devoluciones y canceladas quedan fuera del cálculo
    // (no son "tiempo de entrega" en tránsito, son otro desenlace).
    if (g.es_devolucion || isCancelada(g.estado_guia)) return;

    // El resto son guías abiertas: se mide contra hoy.
    const dias = diasEntreFechas(g.f_documentacion, hoyIso);
    if (dias !== null) diasAbiertas.push(dias);
  });

  const todos = [...diasEntregadas, ...diasAbiertas];
  if (!todos.length) {
    return { promedioDias: null, medianaDias: null, muestras: 0, muestrasEntregadas: 0, muestrasAbiertas: 0 };
  }

  const promedio = todos.reduce((a, b) => a + b, 0) / todos.length;

  const ordenados = [...todos].sort((a, b) => a - b);
  const mitad = Math.floor(ordenados.length / 2);
  const mediana =
    ordenados.length % 2 !== 0 ? ordenados[mitad] : (ordenados[mitad - 1] + ordenados[mitad]) / 2;

  return {
    promedioDias: Number(promedio.toFixed(1)),
    medianaDias: Number(mediana.toFixed(1)),
    muestras: todos.length,
    muestrasEntregadas: diasEntregadas.length,
    muestrasAbiertas: diasAbiertas.length,
  };
}

// ============================================================
// Efectividad: Entregadas / (Entregadas + Devoluciones + Abiertas)
// ============================================================
export function calcularEfectividad(entregadas: number, devoluciones: number, abiertas: number): number | null {
  const total = entregadas + devoluciones + abiertas;
  if (total <= 0) return null;
  return Number(((entregadas / total) * 100).toFixed(1));
}

export function colorEfectividad(pct: number | null): string {
  if (pct === null) return '#9CA3AF';
  if (pct >= 70) return '#0B9B67';
  if (pct >= 50) return '#EA7C1A';
  return '#DC2626';
}

// ============================================================
// Parsing del Excel a filas normalizadas (usado en /api/cargas/import)
// ============================================================
export interface FilaExcelCruda {
  Guia?: string | number;
  Cliente_Paga?: string;
  Descripcion?: string;
  Oficina_Origen?: string;
  Estado_Guia?: string;
  Oficina_Destino?: string;
  Estado_Destinatario?: string;
  Ciudad_Destinatario?: string;
  F_Historia?: string;
  F_Documentacion?: string;
  F_Entrega?: string;
  F_Confirmacion?: string;
  FPE?: string;
  Nombre_Recibio?: string;
  Nombre_Destinatario?: string;
  D_Tipo_Domicilio?: string;
  COD?: number | string;
  Calificacion?: string;
  Tipo_Entrega?: string;
  Tipo_Guia?: string;
  Excepcion_1?: string;
  Excepcion_2?: string;
  Excepcion_3?: string;
  Excepcion_4?: string;
  Excepcion_5?: string;
  Retorno?: string | number;
  // Nombres reales de columna en el export OPS (verificado contra
  // OPS_MERQ_010726.xlsx): "Estado retorno" en minúscula, y NO existe
  // "Entrega Retorno" — la fecha viene en "Ult Mov Retorno".
  'Estado retorno'?: string;
  'Ult Mov Retorno'?: string;
  [key: string]: unknown;
}

export function parseFechaExcel(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;

  // Date object (SheetJS con dateNF)
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return null;
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, '0');
    const d = String(v.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // Número serial de Excel (días desde 1900-01-01, con el bug del año bisiesto de 1900)
  if (typeof v === 'number' && v > 40000 && v < 60000) {
    // Convertir serial a fecha usando la misma referencia que Excel
    const msPerDay = 86400000;
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const d = new Date(excelEpoch.getTime() + v * msPerDay);
    if (isNaN(d.getTime())) return null;
    const y = d.getUTCFullYear();
    const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
    const da = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${mo}-${da}`;
  }

  if (typeof v === 'string') {
    const s = v.trim();
    if (!s) return null;
    // ISO ya válido
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    // DD-MM-YYYY (formato MX)
    const m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
    if (m) {
      const [, dd, mm, yy] = m;
      return `${yy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
    }
    return null;
  }
  return null;
}

// ============================================================
// Construye el conjunto de números de guía que son "guías de retorno":
// aquellos que aparecen en la columna Retorno de una fila que SÍ es una
// devolución real (Estado_Guia = DEVOLUCION). Debe correrse sobre TODAS
// las filas antes de normalizar individualmente.
//
// IMPORTANTE: antes esto se construía a partir de la columna Retorno de
// CUALQUIER fila, sin verificar que esa fila fuera una devolución. Si el
// export de OPS trae esa columna con datos residuales en filas que no son
// devoluciones, guías que no son retornos de nada quedaban marcadas como
// es_retorno=true — eso inflaba el conteo de "ENTREGADA (RETORNO)" en el
// módulo Resumen muy por encima del número real de devoluciones con
// retorno entregado. Restringir a filas con Estado_Guia=DEVOLUCION corrige
// esa causa raíz.
// ============================================================
export function construirSetDeRetornos(rows: FilaExcelCruda[]): Set<string> {
  const set = new Set<string>();
  rows.forEach((r) => {
    const estado = String(r.Estado_Guia ?? '').trim();
    if (!isDevolucion(estado)) return;
    const ret = r.Retorno;
    if (ret !== undefined && ret !== '') {
      // Los números pueden venir como float (123.0) desde Excel; normalizamos
      const num = String(ret).trim().replace(/\.0$/, '');
      if (num) set.add(num);
    }
  });
  return set;
}

// ============================================================
// Determina si el retorno de una devolución ya fue entregado.
//
// Prioriza el estado de la FILA FÍSICA del retorno cuando existe en el
// mismo corte (más confiable: es el estatus real y más reciente de esa
// guía en concreto), y solo si esa fila no existe en este corte cae al
// campo `retorno_estado` EMBEBIDO en la guía devuelta — que puede venir
// desactualizado respecto al estatus real más reciente, y es la única
// fuente disponible cuando el retorno físico aún no aparece documentado
// en este archivo.
// ============================================================
export function retornoEstaEntregado(
  devolucion: Pick<Guia, 'retorno_guia' | 'retorno_estado'>,
  filaRetornoPropia: Pick<Guia, 'estado_guia'> | undefined
): boolean {
  if (filaRetornoPropia) return isEntregada(filaRetornoPropia.estado_guia);
  return (devolucion.retorno_estado || '').toUpperCase() === 'ENTREGADA';
}

// ============================================================
// Detecta el cliente y el periodo (mes) de una carga a partir de las
// filas crudas del Excel, cuando no se especificaron manualmente. Vive
// aquí (no en la ruta de la API) porque desde que el Excel se procesa en
// el navegador (para no toparse con el límite de tamaño de payload de
// Vercel), esta lógica corre en el cliente antes de crear la carga.
// ============================================================
export interface DeteccionCarga {
  cliente: string;
  periodo: string | null;
}

export function detectarClienteYPeriodo(
  rows: FilaExcelCruda[],
  clienteManual: string | null,
  periodoManual: string | null
): DeteccionCarga {
  // Cliente: si el archivo trae varios clientes distintos mezclados
  // (Cliente_Paga no es uniforme), no lo etiquetamos con el de la primera
  // fila nada más (sería engañoso en Historial) — se marca como
  // "VARIOS (N)". El dato real de cada guía sigue siendo correcto por
  // fila (columna `cliente` en la tabla `guias`), esto solo afecta la
  // etiqueta de la carga.
  const clientesDistintos = new Set(
    rows.map((r) => String(r.Cliente_Paga ?? '').trim()).filter(Boolean)
  );
  const cliente =
    clienteManual ||
    (clientesDistintos.size > 1
      ? `VARIOS (${clientesDistintos.size})`
      : String(rows[0]?.Cliente_Paga ?? '').trim() || 'SIN CLIENTE');

  // Periodo: si no se especificó manualmente, se deriva automáticamente
  // del mes más frecuente en F_Documentacion (YYYY-MM). Usa parseFechaExcel
  // para soportar fechas como objeto Date, número serial de Excel, o texto
  // en formato MX/ISO — no solo texto ya formateado.
  let periodo = periodoManual;
  if (!periodo) {
    const conteoMeses: Record<string, number> = {};
    rows.forEach((r) => {
      const iso = parseFechaExcel(r.F_Documentacion);
      if (!iso) return;
      const mes = iso.slice(0, 7);
      conteoMeses[mes] = (conteoMeses[mes] || 0) + 1;
    });
    const mesesOrdenados = Object.entries(conteoMeses).sort((a, b) => b[1] - a[1]);
    periodo = mesesOrdenados[0]?.[0] || null;
  }

  return { cliente, periodo };
}

// Convierte el valor crudo de la columna COD a número, sin importar el
// formato con el que venga (algunos exports de OPS traen solo el número,
// otros vienen como texto con prefijo/formato de moneda, ej. "COD$790.00").
// Number() sobre ese texto da NaN, lo que hacía que todos los totales de
// COD salieran en $0.
export function parseCOD(raw: unknown): number | null {
  if (raw === undefined || raw === null || raw === '') return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  const limpio = String(raw).replace(/[^0-9.-]/g, '');
  if (!limpio) return null;
  const n = Number(limpio);
  return Number.isFinite(n) ? n : null;
}

export function normalizarFila(
  r: FilaExcelCruda,
  catalogoMap: Record<string, string>,
  retornoNumSet: Set<string>
) {
  const guia = String(r.Guia ?? '').trim();
  const nombreRecibio = String(r.Nombre_Recibio ?? '').trim();
  const nombreDestinatario = String(r.Nombre_Destinatario ?? '').trim();
  const clientePaga = String(r.Cliente_Paga ?? '').trim();
  const estado = String(r.Estado_Guia ?? '').trim();

  const esDevolucion = isDevolucion(estado);
  const esPredoc = isPredoc(estado);
  // Esta fila ES una guía de retorno EXPLÍCITA si su propio número de guía
  // aparece en la columna Retorno de alguna otra fila del archivo.
  const esRetorno = retornoNumSet.has(guia);

  // Posible retorno de otro periodo: Cliente_Paga == Nombre_Destinatario
  // (el remitente y el destinatario son el mismo nombre), pero SIN vínculo
  // explícito en este archivo. No se cuenta dos veces con es_retorno.
  const mismoNombreClienteDestinatario =
    !!clientePaga && !!nombreDestinatario && clientePaga.toUpperCase() === nombreDestinatario.toUpperCase();
  const esPosibleRetornoOtroPeriodo = mismoNombreClienteDestinatario && !esRetorno;

  const excepciones = {
    excepcion_1: String(r.Excepcion_1 ?? '').trim() || null,
    excepcion_2: String(r.Excepcion_2 ?? '').trim() || null,
    excepcion_3: String(r.Excepcion_3 ?? '').trim() || null,
    excepcion_4: String(r.Excepcion_4 ?? '').trim() || null,
    excepcion_5: String(r.Excepcion_5 ?? '').trim() || null,
  };

  const accion = calcularAccion(excepciones, catalogoMap);
  const fHistoria = parseFechaExcel(r.F_Historia);
  const dias = calcularDiasSinMovimiento(fHistoria);

  // El campo Retorno (en la guía original/devolución) es la referencia
  // al número de guía de retorno asociado, no una guía separada en sí.
  const retornoGuiaRaw = r.Retorno;
  const retornoGuia =
    retornoGuiaRaw !== undefined && retornoGuiaRaw !== ''
      ? String(retornoGuiaRaw).trim().replace(/\.0$/, '')
      : null;

  return {
    guia,
    cliente: String(r.Cliente_Paga ?? '').trim() || null,
    descripcion: String(r.Descripcion ?? '').trim() || null,
    of_origen: String(r.Oficina_Origen ?? '').trim() || null,
    oficina_destino: String(r.Oficina_Destino ?? '').trim() || null,
    entidad_destinatario: String(r.Estado_Destinatario ?? '').trim() || null,
    ciudad_destinatario: String(r.Ciudad_Destinatario ?? '').trim() || null,
    estado_guia: estado || null,
    tipo_entrega: String(r.Tipo_Entrega ?? '').trim() || null,
    tipo_guia: String(r.Tipo_Guia ?? '').trim() || null,
    f_documentacion: parseFechaExcel(r.F_Documentacion),
    f_historia: fHistoria,
    f_entrega: parseFechaExcel(r.F_Entrega),
    // El export de OPS puede traer esta columna como "F_Confirmacion" o
    // "F_Confirmación" (con acento) según el corte — campoInsensible cubre
    // ambas variantes igual que se hace con "Estado retorno".
    f_confirmacion: parseFechaExcel(campoInsensible(r, 'F_Confirmacion', 'F_Confirmación')),
    fpe: parseFechaExcel(r.FPE),
    nombre_recibio: nombreRecibio || null,
    nombre_destinatario: nombreDestinatario || null,
    d_tipo_domicilio: String(r.D_Tipo_Domicilio ?? '').trim() || null,
    cod: parseCOD(r.COD),
    calificacion: String(r.Calificacion ?? '').trim().toUpperCase() || null,
    ...excepciones,
    retorno_guia: retornoGuia,
    retorno_estado: String(campoInsensible(r, 'Estado retorno', 'Estado Retorno') ?? '').trim() || null,
    // La fecha de entrega del retorno viene de la columna "Ult Mov Retorno"
    // (el export real no trae ninguna columna "Entrega Retorno")
    retorno_f_entrega: parseFechaExcel(campoInsensible(r, 'Ult Mov Retorno', 'Ult mov retorno')),
    es_retorno: esRetorno,
    es_posible_retorno_otro_periodo: esPosibleRetornoOtroPeriodo,
    es_devolucion: esDevolucion,
    es_predoc: esPredoc,
    accion_recomendada: accion || null,
    dias_sin_movimiento: dias,
  };
}
