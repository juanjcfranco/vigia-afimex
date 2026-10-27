import { Guia } from '@/lib/types';
import { esRetornoAmplio } from '@/lib/business-logic';

// Números de guía que cuentan como "del período" para ligar INDEMNIZACIONES
// (Informe Logístico). Una indemnización pertenece al período de la guía
// ORIGINAL — no al mes en que se creó el caso ni al mes en que se documentó
// el retorno. Por eso:
//  - SÍ cuentan: las guías no-retorno del período y el folio de RETORNO
//    ligado a cada una (`retorno_guia`), aunque el retorno se haya
//    documentado en otro mes — una indemnización puede estar registrada
//    contra el folio del retorno y debe caer en el mes de su original.
//  - NO cuentan: las filas de retorno que solo están en el período porque
//    ahí se documentaron (su original es de otro mes; ya se contará en el
//    período de esa original).
export function guiasDelPeriodoParaIndemnizaciones(
  guias: Pick<Guia, 'guia' | 'retorno_guia' | 'es_retorno' | 'es_posible_retorno_otro_periodo' | 'oficina_destino'>[]
): Set<string> {
  const numeros = new Set<string>();
  guias.forEach((g) => {
    if (esRetornoAmplio(g)) return;
    numeros.add(g.guia);
    if (g.retorno_guia) numeros.add(g.retorno_guia);
  });
  return numeros;
}
