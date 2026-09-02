import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// ============================================================
// Historial de alertas por guía — independiente de guias/cargas (ver
// supabase_migracion_14_alertas_guia.sql). GET: trae los eventos
// registrados (opcionalmente filtrados a una lista de números de guía).
// POST: registra un evento nuevo (1ª/2ª/3ª alerta, o cierre de caso).
// ============================================================

export async function GET(req: NextRequest) {
  const db = supabaseAdmin();
  const { searchParams } = new URL(req.url);
  const guiasParam = searchParams.get('guias');

  let query = db.from('alertas_guia_historial').select('*').order('creado_en', { ascending: true });
  if (guiasParam) {
    const lista = guiasParam
      .split(',')
      .map((g) => g.trim())
      .filter(Boolean);
    if (lista.length) query = query.in('guia', lista);
  }

  const { data, error } = await query.limit(5000);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ eventos: data || [] });
}

export async function POST(req: NextRequest) {
  const db = supabaseAdmin();
  const body = await req.json();
  const { guia, nivel, accion, enviado_a, registrado_por } = body;

  if (!guia || !nivel) {
    return NextResponse.json({ error: 'guia y nivel son requeridos' }, { status: 400 });
  }

  const { data, error } = await db
    .from('alertas_guia_historial')
    .insert({ guia, nivel, accion: accion || null, enviado_a: enviado_a || null, registrado_por: registrado_por || null })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ evento: data });
}

// Borra el historial completo de una guía (todos sus eventos) — a
// diferencia de "Cerrar caso" (que AGREGA un evento CERRADO sin borrar
// nada), esto elimina el registro por completo, por si se cargó una
// alerta por error o se quiere reiniciar el seguimiento de esa guía.
export async function DELETE(req: NextRequest) {
  const db = supabaseAdmin();
  const { searchParams } = new URL(req.url);
  const guia = searchParams.get('guia');

  if (!guia) {
    return NextResponse.json({ error: 'guia es requerido' }, { status: 400 });
  }

  const { error } = await db.from('alertas_guia_historial').delete().eq('guia', guia);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
