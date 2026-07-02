import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET() {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from('contactos_oficina')
    .select('*')
    .order('oficina', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ contactos: data });
}

export async function POST(req: NextRequest) {
  const db = supabaseAdmin();
  const body = await req.json();
  const { oficina, email_to, email_cc, jefe, jefe_oficina } = body;

  if (!oficina) return NextResponse.json({ error: 'oficina es requerida' }, { status: 400 });

  const { data, error } = await db
    .from('contactos_oficina')
    .upsert(
      { oficina: oficina.toUpperCase().trim(), email_to, email_cc, jefe, jefe_oficina },
      { onConflict: 'oficina' }
    )
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ contacto: data });
}

export async function DELETE(req: NextRequest) {
  const db = supabaseAdmin();
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id es requerido' }, { status: 400 });

  const { error } = await db.from('contactos_oficina').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
