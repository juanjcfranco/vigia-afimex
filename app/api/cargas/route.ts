import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';
export const maxDuration = 60;

// ============================================================
// Crea el registro de la carga (metadatos únicamente).
//
// El Excel ya NO se sube aquí como archivo binario: se lee y normaliza
// en el navegador (ver UploadModal.tsx) y las guías normalizadas se
// mandan aparte, en bloques, a POST /api/cargas/guias. Esto es necesario
// porque los Serverless Functions de Vercel tienen un límite fijo de
// 4.5 MB por solicitud — un Excel real de varios clientes juntos supera
// eso fácilmente, y mandarlo completo de un jalón hacía que la subida
// fallara en producción (aunque funcionara en local, donde ese límite
// no existe).
// ============================================================
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { nombre_archivo, cliente, periodo, total_filas, forzar } = body as {
      nombre_archivo?: string;
      cliente?: string;
      periodo?: string | null;
      total_filas?: number;
      forzar?: boolean;
    };

    if (!nombre_archivo) {
      return NextResponse.json({ error: 'Falta nombre_archivo' }, { status: 400 });
    }

    const db = supabaseAdmin();

    // Candado anti-duplicados: si el mismo archivo (mismo nombre y mismo
    // número de filas) ya se cargó en los últimos 30 minutos, se avisa en
    // vez de crear otra carga en silencio. Evita el problema de subir el
    // mismo Excel varias veces mientras se hacen pruebas y terminar con
    // guías duplicadas. Para forzar la carga de todos modos (ej. sí es
    // una corrección real), el cliente puede mandar forzar=true.
    if (!forzar) {
      const haceTreintaMin = new Date(Date.now() - 30 * 60 * 1000).toISOString();
      const { data: reciente } = await db
        .from('cargas')
        .select('id, creado_en, total_guias')
        .eq('nombre_archivo', nombre_archivo)
        .gte('creado_en', haceTreintaMin)
        .order('creado_en', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (reciente) {
        return NextResponse.json(
          {
            error: 'archivo_duplicado',
            message: `Este archivo (${nombre_archivo}) ya se cargó hace poco (${new Date(
              reciente.creado_en
            ).toLocaleTimeString('es-MX')}, ${reciente.total_guias} guías). ` +
              `Si de verdad quieres cargarlo de nuevo, confirma para forzar la carga.`,
            carga_previa_id: reciente.id,
          },
          { status: 409 }
        );
      }
    }

    const { data: cargaData, error: cargaError } = await db
      .from('cargas')
      .insert({
        cliente: cliente || 'SIN CLIENTE',
        nombre_archivo,
        periodo: periodo || null,
        total_guias: total_filas || 0,
      })
      .select()
      .single();

    if (cargaError) throw cargaError;

    return NextResponse.json({ ok: true, carga_id: cargaData.id });
  } catch (err: unknown) {
    console.error('Error creando carga:', err);
    const message = err instanceof Error ? err.message : 'Error desconocido';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from('cargas')
    .select('*')
    .order('creado_en', { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ cargas: data });
}

// Borra una carga y todas sus guías asociadas.
// Uso: DELETE /api/cargas?id=<carga_id>
export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'Falta el parámetro id' }, { status: 400 });
  }

  const db = supabaseAdmin();

  // Primero las guías (dependen de carga_id), luego la carga.
  const { error: errGuias } = await db.from('guias').delete().eq('carga_id', id);
  if (errGuias) return NextResponse.json({ error: errGuias.message }, { status: 500 });

  const { error: errCarga } = await db.from('cargas').delete().eq('id', id);
  if (errCarga) return NextResponse.json({ error: errCarga.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
