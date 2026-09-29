import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Detalle de conciliación para una lista EXACTA de guías (mismo patrón
// que resumen-por-guias) — usado por el Informe Logístico para mostrar
// cuáles guías puntuales quedan pendientes de conciliar.
export async function POST(req: NextRequest) {
  const db = supabaseAdmin();
  const body = await req.json();
  const guias = Array.isArray(body?.guias) ? body.guias.filter((g: unknown) => typeof g === 'string' && g) : [];

  if (!guias.length) {
    return NextResponse.json({ filas: [] });
  }

  const { data, error } = await db.rpc('conciliacion_detalle_por_guias', { p_guias: guias });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ filas: data || [] });
}
