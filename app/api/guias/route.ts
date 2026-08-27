import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';
export const maxDuration = 60;

const SUPABASE_PAGE_SIZE = 1000; // límite duro de PostgREST por respuesta
// Cuántas páginas se piden en paralelo a la vez. Antes se pedía 1 página
// a la vez en serie (while loop) — con cortes grandes (varios clientes o
// meses mezclados, 15,000-20,000+ guías) eso significaba 15-20+
// round-trips secuenciales a Supabase, y si la suma pasaba de 60s Vercel
// cortaba la función con un 504. Pedir varias páginas a la vez reduce el
// tiempo total de ~(N × tiempo_por_página) a ~(N/CONCURRENCIA ×
// tiempo_por_página). El límite de 5 es para no saturar el pool de
// conexiones de Supabase (que también puede fallar si se piden demasiadas
// consultas simultáneas).
const CONCURRENCIA_PAGINAS = 5;

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

  // Aplica los mismos filtros a cualquier query base (se usa para cada
  // página de datos, así todas ven exactamente el mismo universo de filas).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function aplicarFiltros(query: any) {
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

  // IMPORTANTE: sin un orden explícito y estable, Postgres no garantiza
  // qué filas caen en cada página de .range(). Con más de 1000 guías (el
  // límite duro de PostgREST) eso provoca que la misma fila aparezca en
  // dos páginas distintas -> guías duplicadas en el frontend -> error de
  // "key" repetida en React. `id` es único por fila, así que ordenar por
  // ahí hace que cada página traiga siempre las mismas filas.
  function pedirPagina(i: number) {
    const from = i * SUPABASE_PAGE_SIZE;
    const to = from + SUPABASE_PAGE_SIZE - 1;
    return aplicarFiltros(db.from('guias').select('*'))
      .order('id', { ascending: true })
      .range(from, to);
  }

  // Pide páginas en OLEADAS de tamaño creciente (sin pedir antes un
  // conteo exacto — ese conteo puede ser lento en tablas grandes, y peor:
  // justo después de subir una carga nueva, las estadísticas internas de
  // Postgres para un conteo ESTIMADO todavía pueden estar desactualizadas
  // y devolver un número erróneo). Se pide una oleada de páginas en
  // paralelo; si alguna página de esa oleada regresa MENOS de 1000 filas,
  // ya se encontró el final y no hace falta seguir. Si todas las páginas
  // de la oleada vienen llenas, se pide la siguiente oleada.
  const allRows: Record<string, unknown>[] = [];
  let siguienteIndice = 0;
  let seAcabaron = false;

  while (!seAcabaron && allRows.length < limit) {
    const oleada = await Promise.all(
      Array.from({ length: CONCURRENCIA_PAGINAS }, (_, k) => pedirPagina(siguienteIndice + k))
    );
    siguienteIndice += CONCURRENCIA_PAGINAS;

    for (const { data, error } of oleada) {
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      if (!data || data.length === 0) {
        seAcabaron = true;
        break;
      }
      allRows.push(...data);
      if (data.length < SUPABASE_PAGE_SIZE) {
        seAcabaron = true;
        break;
      }
    }
  }

  // Deduplicación defensiva: si por cualquier motivo (reintento de una
  // inserción, etc.) quedó una fila física repetida con el mismo id,
  // no se manda dos veces al frontend.
  const vistos = new Set<string>();
  const guias = allRows
    .filter((g) => {
      const id = g.id as string;
      if (vistos.has(id)) return false;
      vistos.add(id);
      return true;
    })
    .slice(0, limit);
  return NextResponse.json({ guias, total: guias.length });
}
