import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';

// ============================================================
// Conciliaciones — tabla persistente e independiente de `guias`/`cargas`
// a propósito (ver comentario en supabase_migracion_13). Se identifica
// por número de guía, no por carga, para sobrevivir a que se vuelva a
// subir el Excel de guías. Presencia en esta tabla = guía pagada por
// completo (no se manejan pagos parciales).
// ============================================================

export async function GET(req: NextRequest) {
  const db = supabaseAdmin();
  const { searchParams } = new URL(req.url);
  const guia = searchParams.get('guia');
  const cliente = searchParams.get('cliente');
  const semanaPago = searchParams.get('semana_pago');

  let query = db.from('conciliaciones').select('*').order('creado_en', { ascending: false });
  if (guia) query = query.eq('guia', guia);
  if (cliente) query = query.eq('cliente', cliente);
  if (semanaPago) query = query.eq('semana_pago', Number(semanaPago));

  const { data, error } = await query.limit(20000);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ conciliaciones: data });
}

interface FilaConciliacionEntrante {
  guia: string;
  cliente?: string | null;
  oficina_destino?: string | null;
  fecha_entrega?: string | null; // ISO (YYYY-MM-DD), ya convertida en el cliente
  guia_cliente?: string | null;
  cip?: string | null;
  cod?: number | null;
  semana_pago?: number | null;
}

// Carga masiva: recibe un arreglo (el archivo completo de conciliación ya
// parseado del lado del cliente) y hace UPSERT por `guia` — nunca borra ni
// reemplaza filas existentes que no vengan en este lote, para poder subir
// el archivo "cuando sea necesario" sin perder conciliaciones anteriores.
export async function POST(req: NextRequest) {
  const db = supabaseAdmin();
  const body = await req.json();
  const { filas, creado_por } = body as { filas: FilaConciliacionEntrante[]; creado_por?: string };

  if (!Array.isArray(filas) || !filas.length) {
    return NextResponse.json({ error: 'Se requiere al menos una fila con guia' }, { status: 400 });
  }

  const filasValidas = filas.filter((f) => f && f.guia && String(f.guia).trim());
  if (!filasValidas.length) {
    return NextResponse.json({ error: 'Ninguna fila trae un número de guía válido' }, { status: 400 });
  }

  const registros = filasValidas.map((f) => ({
    guia: String(f.guia).trim(),
    cliente: f.cliente || null,
    oficina_destino: f.oficina_destino || null,
    fecha_entrega: f.fecha_entrega || null,
    guia_cliente: f.guia_cliente || null,
    cip: f.cip || null,
    cod: Number(f.cod) || 0,
    semana_pago: f.semana_pago != null ? Number(f.semana_pago) : null,
    creado_por: creado_por || null,
    actualizado_en: new Date().toISOString(),
  }));

  // Supabase/Postgres exige lotes razonables para upsert; 500 es un margen
  // seguro para archivos grandes sin acercarse a límites de payload.
  const TAMANO_LOTE = 500;
  let totalProcesadas = 0;
  for (let i = 0; i < registros.length; i += TAMANO_LOTE) {
    const lote = registros.slice(i, i + TAMANO_LOTE);
    const { error } = await db.from('conciliaciones').upsert(lote, { onConflict: 'guia' });
    if (error) {
      return NextResponse.json(
        { error: error.message, procesadasAntesDelError: totalProcesadas },
        { status: 500 }
      );
    }
    totalProcesadas += lote.length;
  }

  return NextResponse.json({ ok: true, procesadas: totalProcesadas, omitidas: filas.length - filasValidas.length });
}

// Elimina uno o más registros de conciliación (por si se subió algo por
// error). No afecta las guías en sí — solo su estado de conciliación
// vuelve a "pendiente" la próxima vez que se consulte.
export async function DELETE(req: NextRequest) {
  const db = supabaseAdmin();
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  const ids = searchParams.get('ids');
  const guia = searchParams.get('guia');

  if (!id && !ids && !guia) {
    return NextResponse.json({ error: 'Falta id, ids o guia' }, { status: 400 });
  }

  if (guia) {
    const { error } = await db.from('conciliaciones').delete().eq('guia', guia);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  const listaIds = ids ? ids.split(',').map((s) => s.trim()).filter(Boolean) : [id as string];
  const { error } = await db.from('conciliaciones').delete().in('id', listaIds);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, eliminados: listaIds.length });
}
