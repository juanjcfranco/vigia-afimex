import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const db = supabaseAdmin();
  const { searchParams } = new URL(req.url);
  const guia = searchParams.get('guia');

  let query = db.from('acciones_log').select('*').order('realizado_en', { ascending: false });
  if (guia) query = query.eq('guia', guia);

  const { data, error } = await query.limit(500);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ acciones: data });
}

export async function POST(req: NextRequest) {
  const db = supabaseAdmin();
  const body = await req.json();
  const { guia, accion, nota, realizado_por } = body;

  if (!guia || !accion) {
    return NextResponse.json({ error: 'guia y accion son requeridos' }, { status: 400 });
  }

  const { data, error } = await db
    .from('acciones_log')
    .insert({ guia, accion, nota, realizado_por })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ accion: data });
}
