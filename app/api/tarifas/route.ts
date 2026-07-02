import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const cliente = searchParams.get('cliente');

  const { data, error } = cliente
    ? await db.from('tarifas_cliente').select('*').eq('cliente', cliente).order('cliente')
    : await db.from('tarifas_cliente').select('*').order('cliente');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ tarifas: data });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { cliente, tarifa_entrega_original, tarifa_devolucion, tarifa_retorno_entregado, tarifa_posible_retorno } = body;
  if (!cliente) return NextResponse.json({ error: 'Cliente requerido' }, { status: 400 });

  const { data, error } = await db
    .from('tarifas_cliente')
    .upsert({
      cliente,
      tarifa_entrega_original,
      tarifa_devolucion,
      tarifa_retorno_entregado,
      tarifa_posible_retorno,
      actualizado_en: new Date().toISOString(),
    }, { onConflict: 'cliente' })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ tarifa: data });
}
