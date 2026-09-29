import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';

// Opciones para los <select> de filtro (clientes, semanas de pago),
// calculadas en Postgres — evita traer el detalle completo solo para
// armar los dropdowns.
export async function GET() {
  const db = supabaseAdmin();
  const { data, error } = await db.rpc('conciliacion_opciones_filtro');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const fila = Array.isArray(data) ? data[0] : data;
  return NextResponse.json({
    clientes: fila?.clientes || [],
    semanas: fila?.semanas || [],
  });
}
