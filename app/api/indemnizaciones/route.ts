import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';

// ============================================================
// Indemnizaciones — tabla persistente e independiente de `guias`/`cargas`
// a propósito (ver comentario en supabase_migracion_12). Se identifica
// por número de guía, no por carga, para sobrevivir a que se vuelva a
// subir el Excel.
// ============================================================

export async function GET(req: NextRequest) {
  const db = supabaseAdmin();
  const { searchParams } = new URL(req.url);
  const guia = searchParams.get('guia');
  const estado = searchParams.get('estado');

  let query = db.from('indemnizaciones').select('*').order('creado_en', { ascending: false });
  if (guia) query = query.contains('guias', [guia]);
  if (estado) query = query.eq('estado', estado);

  const { data, error } = await query.limit(1000);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ indemnizaciones: data });
}

// Genera el siguiente folio secuencial (IND-000001, IND-000002, ...)
// buscando el número más alto ya usado. No es 100% a prueba de carreras
// (dos creaciones simultáneas podrían, en teoría, calzar el mismo
// número), pero es consistente con el resto de la app y el volumen de
// uso de esta herramienta interna no lo justifica.
async function siguienteFolio(db: ReturnType<typeof supabaseAdmin>): Promise<string> {
  const { data } = await db
    .from('indemnizaciones')
    .select('folio')
    .order('folio', { ascending: false })
    .limit(1);

  const ultimo = data && data.length ? data[0].folio : null;
  const ultimoNum = ultimo ? parseInt(ultimo.replace(/\D/g, ''), 10) || 0 : 0;
  return `IND-${String(ultimoNum + 1).padStart(6, '0')}`;
}

export async function POST(req: NextRequest) {
  const db = supabaseAdmin();
  const body = await req.json();
  const {
    guias,
    cliente,
    fecha,
    fecha_mov,
    oficina,
    tipo_destino,
    oficina_incidencia,
    importe,
    tipo_incidencia,
    scan_loc,
    scan_dt,
    scan_user,
    scan_estatus,
    investigacion,
    indemnizacion,
    recuperable,
    tipo_indemnizacion,
    estado,
    pay_ref,
    creado_por,
  } = body as Record<string, unknown>;

  if (!Array.isArray(guias) || !guias.length) {
    return NextResponse.json({ error: 'Se requiere al menos una guía' }, { status: 400 });
  }

  const folio = await siguienteFolio(db);
  const indemnizacionNum = Number(indemnizacion) || 0;
  const recuperableNum = Number(recuperable) || 0;
  const cargoAfimex = Math.max(0, indemnizacionNum - recuperableNum);

  const { data, error } = await db
    .from('indemnizaciones')
    .insert({
      folio,
      guias,
      cliente: cliente || null,
      fecha: fecha || null,
      fecha_mov: fecha_mov || null,
      oficina: oficina || null,
      tipo_destino: tipo_destino || null,
      oficina_incidencia: oficina_incidencia || null,
      importe: Number(importe) || 0,
      tipo_incidencia: tipo_incidencia || null,
      scan_loc: scan_loc || null,
      scan_dt: scan_dt || null,
      scan_user: scan_user || null,
      scan_estatus: scan_estatus || null,
      investigacion: investigacion || null,
      indemnizacion: indemnizacionNum,
      recuperable: recuperableNum,
      cargo_afimex: cargoAfimex,
      tipo_indemnizacion: tipo_indemnizacion || null,
      estado: estado || 'PENDIENTE',
      pay_ref: pay_ref || null,
      creado_por: creado_por || null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ indemnizacion: data });
}

export async function PATCH(req: NextRequest) {
  const db = supabaseAdmin();
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Falta id' }, { status: 400 });

  const body = await req.json();
  const camposPermitidos = [
    'guias',
    'cliente',
    'fecha',
    'fecha_mov',
    'oficina',
    'tipo_destino',
    'oficina_incidencia',
    'importe',
    'tipo_incidencia',
    'scan_loc',
    'scan_dt',
    'scan_user',
    'scan_estatus',
    'investigacion',
    'indemnizacion',
    'recuperable',
    'tipo_indemnizacion',
    'estado',
    'pay_ref',
  ];

  const actualizacion: Record<string, unknown> = { actualizado_en: new Date().toISOString() };
  for (const campo of camposPermitidos) {
    if (campo in body) actualizacion[campo] = body[campo];
  }

  // Si se actualiza indemnización o recuperable, recalcular cargo_afimex
  // para que nunca quede desalineado del resto de los montos.
  if ('indemnizacion' in actualizacion || 'recuperable' in actualizacion) {
    const { data: actual } = await db.from('indemnizaciones').select('indemnizacion, recuperable').eq('id', id).single();
    const indemnizacionNum = Number('indemnizacion' in actualizacion ? actualizacion.indemnizacion : actual?.indemnizacion) || 0;
    const recuperableNum = Number('recuperable' in actualizacion ? actualizacion.recuperable : actual?.recuperable) || 0;
    actualizacion.cargo_afimex = Math.max(0, indemnizacionNum - recuperableNum);
  }

  const { data, error } = await db.from('indemnizaciones').update(actualizacion).eq('id', id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ indemnizacion: data });
}

// Elimina uno o más casos. Borrado permanente — la guía simplemente deja
// de tener un caso asociado (nunca "desapareció" de Abiertas: el badge de
// Indemnización se calcula en vivo contra esta tabla, así que al borrar
// el caso, el badge desaparece solo la próxima vez que se consulte).
export async function DELETE(req: NextRequest) {
  const db = supabaseAdmin();
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  const ids = searchParams.get('ids'); // lista separada por comas, para borrar varios de un jalón

  if (!id && !ids) return NextResponse.json({ error: 'Falta id o ids' }, { status: 400 });

  const listaIds = ids ? ids.split(',').map((s) => s.trim()).filter(Boolean) : [id as string];

  const { error } = await db.from('indemnizaciones').delete().in('id', listaIds);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, eliminados: listaIds.length });
}
