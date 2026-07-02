import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const db = supabaseAdmin();
  const { searchParams } = new URL(req.url);
  const cargaId = searchParams.get('carga_id');

  let query = db.from('cierres_operativos').select('*').order('generado_en', { ascending: false });
  if (cargaId) query = query.eq('carga_id', cargaId);

  const { data, error } = await query.limit(50);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ cierres: data });
}

export async function POST(req: NextRequest) {
  const db = supabaseAdmin();
  const body = await req.json();
  const { carga_id, cliente, periodo, resumen_json, generado_por } = body;

  const { data, error } = await db
    .from('cierres_operativos')
    .insert({ carga_id, cliente, periodo, resumen_json, generado_por })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ cierre: data });
}
