import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Resumen de conciliación para una lista EXACTA de guías (ya filtradas
// del lado de React con toda la lógica de negocio — cliente, oficina,
// entidad, período, día, esGuiaOriginal, isEntregada, cod>0). POST porque
// la lista puede ser larga (miles de guías) y no cabe cómodamente en una
// query string. Usado por el Informe Logístico, que necesita respetar
// TODOS los filtros activos, no solo carga_id/período/día.
export async function POST(req: NextRequest) {
  const db = supabaseAdmin();
  const body = await req.json();
  const guias = Array.isArray(body?.guias) ? body.guias.filter((g: unknown) => typeof g === 'string' && g) : [];

  if (!guias.length) {
    return NextResponse.json({
      resumen: { guias_con_cod: 0, cod_total: 0, guias_pagadas: 0, cod_pagado: 0, guias_pendientes: 0, cod_pendiente: 0, con_diferencia: 0 },
    });
  }

  const { data, error } = await db.rpc('conciliacion_resumen_por_guias', { p_guias: guias });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const fila = Array.isArray(data) ? data[0] : data;
  return NextResponse.json({ resumen: fila });
}
