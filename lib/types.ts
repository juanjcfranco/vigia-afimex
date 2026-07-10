export interface Guia {
  id: string;
  carga_id: string;
  guia: string;
  cliente: string | null;
  descripcion: string | null;

  of_origen: string | null;
  oficina_destino: string | null;
  entidad_destinatario: string | null;
  ciudad_destinatario: string | null;

  estado_guia: string | null;
  tipo_entrega: string | null;
  tipo_guia: string | null;

  f_documentacion: string | null;
  f_historia: string | null;
  f_entrega: string | null;
  f_confirmacion: string | null;
  fpe: string | null;

  nombre_recibio: string | null;
  nombre_destinatario: string | null;
  d_tipo_domicilio: string | null;

  cod: number | null;
  calificacion: string | null;

  excepcion_1: string | null;
  excepcion_2: string | null;
  excepcion_3: string | null;
  excepcion_4: string | null;
  excepcion_5: string | null;
  f_excepcion_1: string | null;
  f_excepcion_2: string | null;
  f_excepcion_3: string | null;
  f_excepcion_4: string | null;
  f_excepcion_5: string | null;

  retorno_guia: string | null;
  retorno_estado: string | null;
  retorno_f_entrega: string | null;
  es_retorno: boolean;
  es_posible_retorno_otro_periodo: boolean;

  es_devolucion: boolean;
  es_predoc: boolean;
  es_documentada: boolean;
  accion_recomendada: string | null;
  dias_sin_movimiento: number | null;

  creado_en: string;
}

export interface Carga {
  id: string;
  cliente: string;
  nombre_archivo: string | null;
  periodo: string | null;
  total_guias: number;
  creado_en: string;
  creado_por: string | null;
}

export interface ExcepcionCatalogo {
  id: string;
  nombre: string;
  accion: string;
  descripcion: string | null;
  activo: boolean;
}

export interface ContactoOficina {
  id: string;
  oficina: string;
  email_to: string | null;
  email_cc: string | null;
  jefe: string | null;
  jefe_oficina: string | null;
}

export interface TarifaCliente {
  id: string;
  cliente: string;
  tarifa_entrega_original: number;
  tarifa_devolucion: number;
  tarifa_retorno_entregado: number;
  tarifa_posible_retorno: number;
  actualizado_en: string;
}

export interface CierreOperativo {
  id: string;
  carga_id: string | null;
  cliente: string | null;
  periodo: string | null;
  resumen_json: Record<string, unknown> | null;
  generado_en: string;
  generado_por: string | null;
}

export interface GuiaDetalleAcuse {
  guia: string;
  f_historia: string | null;
}

export interface AlertaLog {
  id: string;
  oficina: string;
  guias_incluidas: string[];
  guias_detalle: GuiaDetalleAcuse[] | null;
  total_guias: number;
  enviado_a: string | null;
  enviado_en: string;
  enviado_por: string | null;
  estado: string;
  cliente: string | null;
  tipo_solicitud: string | null;
}

export interface AccionLog {
  id: string;
  guia: string;
  accion: string;
  nota: string | null;
  realizado_por: string | null;
  realizado_en: string;
}

export type AccionTipo =
  | 'REPROGRAMAR'
  | 'DEVOLVER'
  | 'DEVOLVER_COD'
  | 'SOLICITAR INFORMACIÓN'
  | 'ALERTAR A OFICINA'
  | 'INFORMAR A CLIENTE'
  | 'POSIBLE INDEMNIZACIÓN'
  | 'ESTADO CRÍTICO'
  | 'INVESTIGAR'
  | '';

export const ACCION_COLORS: Record<string, string> = {
  'ESTADO CRÍTICO': '#DC2626',
  'INVESTIGAR': '#4C1D95',
  'ALERTAR A OFICINA': '#831843',
  'DEVOLVER': '#7F1D1D',
  'DEVOLVER_COD': '#7F1D1D',
  'SOLICITAR INFORMACIÓN': '#78350F',
  'REPROGRAMAR': '#1E3A8A',
  'INFORMAR A CLIENTE': '#14532D',
  'POSIBLE INDEMNIZACIÓN': '#B45309',
};
