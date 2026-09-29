import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic'; // nunca cachear: debe reflejar SIEMPRE la carga_id actual

// Resumen de conciliación calculado directo en Postgres (función
// conciliacion_resumen(), ver supabase_migracion_19_conciliacion_carga_id.sql).
// Un solo viaje de ida y vuelta, sin importar cuántas guías haya —
// reemplaza el método anterior que paginaba miles de guías al navegador
// para sumarlas ahí. Se acota SIEMPRE a la carga activa (carga_id) — el
// usuario confirmó que no quiere el acumulado histórico de todas las
// cargas, solo el período que tiene cargado en Historial.
export async function GET(req: NextRequest) {
  const db = supabaseAdmin();
  const { searchParams } = new URL(req.url);
  const cargaId = searchParams.get('carga_id') || null;
  const { data, error } = await db.rpc('conciliacion_resumen', { p_carga_id: cargaId });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const fila = Array.isArray(data) ? data[0] : data;
  return NextResponse.json({ resumen: fila });
}
