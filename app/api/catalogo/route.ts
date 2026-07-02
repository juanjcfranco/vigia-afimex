import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET() {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from('excepciones_catalogo')
    .select('*')
    .order('nombre', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ catalogo: data });
}

export async function POST(req: NextRequest) {
  const db = supabaseAdmin();
  const body = await req.json();

  const { nombre, accion, descripcion } = body;
  if (!nombre || !accion) {
    return NextResponse.json({ error: 'nombre y accion son requeridos' }, { status: 400 });
  }

  const { data, error } = await db
    .from('excepciones_catalogo')
    .upsert({ nombre: nombre.toUpperCase().trim(), accion, descripcion }, { onConflict: 'nombre' })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ excepcion: data });
}

export async function PATCH(req: NextRequest) {
  const db = supabaseAdmin();
  const body = await req.json();
  const { id, accion, descripcion, activo } = body;

  if (!id) return NextResponse.json({ error: 'id es requerido' }, { status: 400 });

  const updates: Record<string, unknown> = {};
  if (accion !== undefined) updates.accion = accion;
  if (descripcion !== undefined) updates.descripcion = descripcion;
  if (activo !== undefined) updates.activo = activo;

  const { data, error } = await db
    .from('excepciones_catalogo')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ excepcion: data });
}
