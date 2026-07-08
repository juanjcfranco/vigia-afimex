import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';
export const maxDuration = 60;

const SUPABASE_PAGE_SIZE = 1000; // límite duro de PostgREST por respuesta

export async function GET(req: NextRequest) {
  const db = supabaseAdmin();
  const { searchParams } = new URL(req.url);

  const cargaId = searchParams.get('carga_id');
  const oficina = searchParams.get('oficina');
  const entidad = searchParams.get('entidad');
  const cliente = searchParams.get('cliente');
  const estado = searchParams.get('estado');
  const guiasParam = searchParams.get('guias'); // búsqueda masiva: lista separada por comas
  // Sin parámetro `limit`, no hay tope: se pagina hasta traer todas las filas
  // (una carga puede fácilmente superar las 20,000 guías si mezcla varios
  // clientes o periodos grandes). Si algún caller sí quiere acotar, puede
  // mandar ?limit=N explícitamente.
  const limitParam = searchParams.get('limit');
  const limit = limitParam ? Number(limitParam) : Infinity;

  function buildQuery() {
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
    // qué filas caen en cada página de .range(). Con más de 1000 guías
    // (el límite duro de PostgREST) eso provoca que la misma fila aparezca
    // en dos páginas distintas -> guías duplicadas en el frontend -> error
    // de "key" repetida en React. `id` es único por fila, así que ordenar
    // por ahí hace que cada página traiga siempre las mismas filas.
    return query.order('id', { ascending: true });
  }

  // Supabase/PostgREST nunca devuelve más de 1000 filas por llamada,
  // sin importar el .limit() pedido. Hay que paginar en el servidor
  // con .range() hasta juntar todo lo solicitado.
  const allRows: Record<string, unknown>[] = [];
  let from = 0;

  while (allRows.length < limit) {
    const to = from + SUPABASE_PAGE_SIZE - 1;
    const { data, error } = await buildQuery().range(from, to);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data || data.length === 0) break;

    allRows.push(...data);
    if (data.length < SUPABASE_PAGE_SIZE) break; // última página
    from += SUPABASE_PAGE_SIZE;
  }

  // Deduplicación defensiva: si por cualquier motivo (reintento de una
  // inserción, etc.) quedó una fila física repetida con el mismo id,
  // no se manda dos veces al frontend.
  const vistos = new Set<string>();
  const guias = allRows.filter((g) => {
    const id = g.id as string;
    if (vistos.has(id)) return false;
    vistos.add(id);
    return true;
  }).slice(0, limit);
  return NextResponse.json({ guias, total: guias.length });
}
