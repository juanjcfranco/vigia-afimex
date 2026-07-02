import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

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
  const limit = Number(searchParams.get('limit') || '20000');

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
    return query;
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

  const guias = allRows.slice(0, limit);
  return NextResponse.json({ guias, total: guias.length });
}
