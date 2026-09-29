import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';

// Detalle paginado y filtrable de conciliación, calculado directo en
// Postgres (función conciliacion_detalle(), ver
// supabase_migracion_16_conciliacion_rpc.sql). El servidor resuelve el
// cruce, el filtro y la paginación — el navegador solo pide la página que
// se está mostrando, nunca acumula todo el universo de guías.
export async function GET(req: NextRequest) {
  const db = supabaseAdmin();
  const { searchParams } = new URL(req.url);
  const cliente = searchParams.get('cliente') || null;
  const estatus = searchParams.get('estatus') || null; // PAGADA | PENDIENTE | DIFERENCIA
  const semanaParam = searchParams.get('semana');
  const semana = semanaParam ? Number(semanaParam) : null;
  const limit = Math.min(Number(searchParams.get('limit') || '200') || 200, 1000);
  const offset = Math.max(0, Number(searchParams.get('offset') || '0') || 0);

  const { data, error } = await db.rpc('conciliacion_detalle', {
    p_cliente: cliente,
    p_estatus: estatus,
    p_semana: semana,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const filas = data || [];
  const total = filas.length > 0 ? Number(filas[0].total_filas) : 0;
  return NextResponse.json({ filas, total });
}
