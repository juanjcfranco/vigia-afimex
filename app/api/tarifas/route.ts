import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const cliente = searchParams.get('cliente')?.trim();

  // ilike en vez de eq: si el nombre del cliente en el Excel no coincide
  // exactamente en mayúsculas/espacios con lo guardado en tarifas_cliente,
  // un eq() estricto no encuentra nada y el módulo se queda en los
  // valores por default sin avisar. ilike es insensible a mayúsculas.
  const { data, error } = cliente
    ? await db.from('tarifas_cliente').select('*').ilike('cliente', cliente).order('cliente')
    : await db.from('tarifas_cliente').select('*').order('cliente');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ tarifas: data });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { tarifa_entrega_original, tarifa_devolucion, tarifa_retorno_entregado, tarifa_posible_retorno } = body;
  const cliente = (body.cliente || '').trim();
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
