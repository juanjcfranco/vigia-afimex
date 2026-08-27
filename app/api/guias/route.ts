import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';
export const maxDuration = 60;

const PAGE_SIZE_MAX = 1000; // límite duro de PostgREST por respuesta

// ============================================================
// IMPORTANTE (cambio de diseño): este endpoint ahora devuelve UNA sola
// página por llamada (máx. 1000 filas), en vez de intentar juntar TODO
// el corte en una sola respuesta gigante. Antes, para cortes grandes
// (80,000+ filas mezclando varios clientes/meses), una sola llamada podía
// tardar más de 60 segundos — y en el plan Hobby de Vercel ese límite es
// FIJO, no se puede subir con maxDuration (a diferencia de Pro, que sí
// permite hasta 300s). La solución real: en vez de que el SERVIDOR
// intente hacerlo todo en una llamada, el NAVEGADOR pide varias páginas
// pequeñas en paralelo (ver cargarGuias() en lib/useVigiaData.ts) — cada
// llamada individual a este endpoint queda rápida y muy por debajo de
// los 60s, sin importar qué tan grande sea el corte completo.
//
// Parámetros de paginación: `offset` (default 0) y `limit` (default 1000,
// tope 1000 por ser el límite de PostgREST).
// ============================================================
export async function GET(req: NextRequest) {
  const db = supabaseAdmin();
  const { searchParams } = new URL(req.url);

  const cargaId = searchParams.get('carga_id');
  const oficina = searchParams.get('oficina');
  const entidad = searchParams.get('entidad');
  const cliente = searchParams.get('cliente');
  const estado = searchParams.get('estado');
  const guiasParam = searchParams.get('guias'); // búsqueda masiva: lista separada por comas

  const offset = Math.max(0, Number(searchParams.get('offset') || '0') || 0);
  const limitParam = searchParams.get('limit');
  const limit = limitParam ? Math.min(Number(limitParam) || PAGE_SIZE_MAX, PAGE_SIZE_MAX) : PAGE_SIZE_MAX;

  let query = db.from('guias').select('*');
  if (cargaId) query = query.eq('carga_id', cargaId);
  if (oficina) query = query.eq('oficina_destino', oficina);
  if (entidad) query = query.eq('entidad_destinatario', entidad);
  if (cliente) query = query.eq('cliente', cliente);
  if (estado) query = query.eq('estado_guia', estado);
  if (guiasParam) {
    const lista = guiasParam
      .split(/[\s,;\n]+/)
      .map((g) => g.trim())
      .filter(Boolean);
    if (lista.length) query = query.in('guia', lista);
  }

  // IMPORTANTE: sin un orden explícito y estable, Postgres no garantiza
  // qué filas caen en cada página de .range(). `id` es único por fila,
  // así que ordenar por ahí hace que cada página traiga siempre las
  // mismas filas (necesario para que el navegador pueda pedir offsets
  // específicos sin riesgo de filas duplicadas o saltadas entre páginas).
  query = query.order('id', { ascending: true }).range(offset, offset + limit - 1);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ guias: data || [], count: (data || []).length });
}
