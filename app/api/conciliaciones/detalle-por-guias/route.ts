import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Detalle de conciliación para una lista EXACTA de guías (mismo patrón
// que resumen-por-guias) — usado por el Informe Logístico para mostrar
// cuáles guías puntuales quedan pendientes de conciliar.
//
// Pagina internamente contra la función RPC (que ahora acepta
// limit/offset — ver migración 25) hasta agotar todas las filas. Sin
// esto, con miles de guías, Supabase/PostgREST puede truncar la
// respuesta de una función RPC a un límite por defecto, recortando en
// silencio la lista (ordenada por guía) sin ningún aviso de error.
export async function POST(req: NextRequest) {
  const db = supabaseAdmin();
  const body = await req.json();
  const guias = Array.isArray(body?.guias) ? body.guias.filter((g: unknown) => typeof g === 'string' && g) : [];

  if (!guias.length) {
    return NextResponse.json({ filas: [] });
  }

  const PAGE_SIZE = 1000;
  let todas: unknown[] = [];
  let offset = 0;
  // Límite de seguridad: no más de 500 páginas (500,000 filas) para
  // evitar un bucle infinito ante una respuesta inesperada.
  for (let i = 0; i < 500; i++) {
    const { data, error } = await db.rpc('conciliacion_detalle_por_guias', {
      p_guias: guias,
      p_limit: PAGE_SIZE,
      p_offset: offset,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const lote = data || [];
    todas = todas.concat(lote);
    if (lote.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return NextResponse.json({ filas: todas });
}
