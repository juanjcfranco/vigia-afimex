import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';
export const maxDuration = 60;

// ============================================================
// Inserta un bloque de guías YA NORMALIZADAS (calculadas en el navegador
// con normalizarFila(), ver lib/business-logic.ts) para una carga que ya
// existe. El cliente (UploadModal.tsx) llama a este endpoint varias veces
// en bloques pequeños en vez de mandar el Excel completo de un jalón,
// para no toparse con el límite de 4.5 MB por solicitud de los
// Serverless Functions de Vercel.
//
// No recalcula nada de negocio aquí (acción recomendada, es_retorno,
// etc.) — eso ya viene resuelto en cada objeto del arreglo `guias`,
// exactamente igual que si se hubiera hecho en el servidor, porque
// normalizarFila() es la misma función compartida en ambos lados.
// ============================================================
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { carga_id, guias } = body as { carga_id?: string; guias?: Record<string, unknown>[] };

    if (!carga_id) {
      return NextResponse.json({ error: 'Falta carga_id' }, { status: 400 });
    }
    if (!Array.isArray(guias) || !guias.length) {
      return NextResponse.json({ error: 'El bloque de guías está vacío' }, { status: 400 });
    }

    const db = supabaseAdmin();

    // Inserta en sub-lotes de 500 (límite práctico de Supabase para un
    // solo insert), aunque el cliente ya debería mandar bloques de este
    // tamaño o menores — esto es una segunda capa de seguridad.
    const BATCH = 500;
    let insertadas = 0;
    for (let i = 0; i < guias.length; i += BATCH) {
      const lote = guias.slice(i, i + BATCH).map((g) => ({ ...g, carga_id }));
      const { error: insertError } = await db.from('guias').insert(lote);
      if (insertError) throw insertError;
      insertadas += lote.length;
    }

    return NextResponse.json({ ok: true, insertadas });
  } catch (err: unknown) {
    console.error('Error insertando bloque de guías:', err);
    const message = err instanceof Error ? err.message : 'Error desconocido';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
