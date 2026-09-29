import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';

// Resumen de conciliación calculado directo en Postgres (función
// conciliacion_resumen(), ver supabase_migracion_16_conciliacion_rpc.sql).
// Un solo viaje de ida y vuelta, sin importar cuántas guías haya —
// reemplaza el método anterior que paginaba miles de guías al navegador
// para sumarlas ahí.
export async function GET() {
  const db = supabaseAdmin();
  const { data, error } = await db.rpc('conciliacion_resumen');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const fila = Array.isArray(data) ? data[0] : data;
  return NextResponse.json({ resumen: fila });
}
