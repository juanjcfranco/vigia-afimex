import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// ============================================================
// Historial de alertas por guía — independiente de guias/cargas (ver
// supabase_migracion_14_alertas_guia.sql). GET: trae los eventos
// registrados (opcionalmente filtrados a una lista de números de guía).
// POST: registra un evento nuevo (1ª/2ª/3ª alerta, o cierre de caso).
// ============================================================

// Supabase/PostgREST devuelve como MÁXIMO 1,000 filas por consulta, sin
// importar el .limit() que se pida (el tope lo fija el proyecto). Con el
// historial ordenado de la más antigua a la más reciente, una consulta sola
// devolvía únicamente las primeras 1,000 — y cuando el 05/10 acumuló 1,377
// registros, las alertas posteriores (06/10, 09/10...) dejaron de aparecer
// aunque SÍ estaban guardadas. Por eso se lee por páginas con .range()
// hasta agotar la tabla, con un orden estable (creado_en + id) para que
// ninguna fila se repita ni se salte entre página y página.
const TAMANO_PAGINA = 1000;
const MAX_PAGINAS = 200; // tope de seguridad: 200,000 eventos
const TAMANO_BLOQUE_GUIAS = 200; // para ?guias=: URLs cortas

async function leerEventos(db: ReturnType<typeof supabaseAdmin>, guias?: string[]) {
  const eventos: Record<string, unknown>[] = [];
  for (let i = 0; i < MAX_PAGINAS; i++) {
    let q = db
      .from('alertas_guia_historial')
      .select('*')
      .order('creado_en', { ascending: true })
      .order('id', { ascending: true })
      .range(i * TAMANO_PAGINA, i * TAMANO_PAGINA + TAMANO_PAGINA - 1);
    if (guias) q = q.in('guia', guias);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    const lote = (data || []) as Record<string, unknown>[];
    eventos.push(...lote);
    if (lote.length < TAMANO_PAGINA) break;
  }
  return eventos;
}

export async function GET(req: NextRequest) {
  const db = supabaseAdmin();
  const { searchParams } = new URL(req.url);
  const guiasParam = searchParams.get('guias');

  try {
    const lista = guiasParam
      ? guiasParam
          .split(',')
          .map((g) => g.trim())
          .filter(Boolean)
      : [];

    let eventos: Record<string, unknown>[];
    if (lista.length) {
      // Una lista larga de guías en un solo .in() vuelve la URL demasiado
      // larga y falla — se parte en bloques y se unen los resultados.
      eventos = [];
      for (let i = 0; i < lista.length; i += TAMANO_BLOQUE_GUIAS) {
        eventos.push(...(await leerEventos(db, lista.slice(i, i + TAMANO_BLOQUE_GUIAS))));
      }
      eventos.sort((a, b) =>
        String(a.creado_en) === String(b.creado_en)
          ? String(a.id).localeCompare(String(b.id))
          : String(a.creado_en).localeCompare(String(b.creado_en))
      );
    } else {
      eventos = await leerEventos(db);
    }
    // Siempre en orden cronológico ascendente: AlertasModule y
    // AbiertasModule recorren el arreglo en ese orden para reconstruir la
    // secuencia 1ª → 2ª → 3ª → cierre de cada guía.
    return NextResponse.json({ eventos });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error al leer el historial' }, { status: 500 });
  }
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
  // Borrado masivo: requiere el flag explícito `todo=1` además de omitir
  // `guia` — así una llamada que simplemente olvida mandar `guia` por
  // error (bug de cliente) nunca borra todo por accidente; hace falta
  // pedirlo a propósito.
  const todo = searchParams.get('todo') === '1';

  if (todo) {
    // delete sin where real borraría nada en Postgres por seguridad —
    // se usa un filtro siempre-verdadero (creado_en no nulo) para que
    // cuente como un delete masivo explícito.
    const { error } = await db.from('alertas_guia_historial').delete().not('id', 'is', null);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, todo: true });
  }

  if (!guia) {
    return NextResponse.json({ error: 'guia es requerido (o manda todo=1 para borrar todo)' }, { status: 400 });
  }

  const { error } = await db.from('alertas_guia_historial').delete().eq('guia', guia);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
