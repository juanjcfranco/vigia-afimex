import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const db = supabaseAdmin();
  const { searchParams } = new URL(req.url);
  const oficina = searchParams.get('oficina');

  let query = db.from('alertas_log').select('*').order('enviado_en', { ascending: false });
  if (oficina) query = query.eq('oficina', oficina);

  const { data, error } = await query.limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ alertas: data });
}

export async function POST(req: NextRequest) {
  const db = supabaseAdmin();
  const body = await req.json();
  const { oficina, guias_incluidas, total_guias, enviado_a, enviado_por, cliente, tipo_solicitud } = body;

  if (!oficina) return NextResponse.json({ error: 'oficina es requerida' }, { status: 400 });

  const { data, error } = await db
    .from('alertas_log')
    .insert({ oficina, guias_incluidas, total_guias, enviado_a, enviado_por, cliente, tipo_solicitud })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ alerta: data });
}
