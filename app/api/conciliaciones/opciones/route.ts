import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic'; // nunca cachear: debe reflejar SIEMPRE la carga_id actual

// Opciones para los <select> de filtro (clientes, semanas de pago),
// calculadas en Postgres — evita traer el detalle completo solo para
// armar los dropdowns. Se acota a la carga activa, igual que el resumen
// y el detalle.
export async function GET(req: NextRequest) {
  const db = supabaseAdmin();
  const { searchParams } = new URL(req.url);
  const cargaId = searchParams.get('carga_id') || null;
  const periodosParam = searchParams.get('periodos');
  const periodos = periodosParam ? periodosParam.split(',').filter(Boolean) : null;
  const dia = searchParams.get('dia') || null;
  const { data, error } = await db.rpc('conciliacion_opciones_filtro', {
    p_carga_id: cargaId,
    p_periodos: periodos,
    p_dia: dia,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const fila = Array.isArray(data) ? data[0] : data;
  return NextResponse.json({
    clientes: fila?.clientes || [],
    semanas: fila?.semanas || [],
  });
}
