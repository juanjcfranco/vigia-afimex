import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic'; // nunca cachear: debe reflejar SIEMPRE la carga_id actual

// Resumen de conciliación calculado directo en Postgres (función
// conciliacion_resumen(), ver supabase_migracion_21_conciliacion_periodo_dia.sql).
// Un solo viaje de ida y vuelta, sin importar cuántas guías haya —
// reemplaza el método anterior que paginaba miles de guías al navegador
// para sumarlas ahí. Se acota SIEMPRE a la carga activa + período(s) +
// día seleccionados en la barra superior — replica exactamente el mismo
// filtro que guiasFiltradas en lib/useVigiaData.ts.
export async function GET(req: NextRequest) {
  const db = supabaseAdmin();
  const { searchParams } = new URL(req.url);
  const cargaId = searchParams.get('carga_id') || null;
  const periodosParam = searchParams.get('periodos');
  const periodos = periodosParam ? periodosParam.split(',').filter(Boolean) : null;
  const dia = searchParams.get('dia') || null;
  const { data, error } = await db.rpc('conciliacion_resumen', {
    p_carga_id: cargaId,
    p_periodos: periodos,
    p_dia: dia,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const fila = Array.isArray(data) ? data[0] : data;
  return NextResponse.json({ resumen: fila });
}
