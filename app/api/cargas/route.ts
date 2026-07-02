import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { supabaseAdmin } from '@/lib/supabase';
import { normalizarFila, FilaExcelCruda, construirSetDeRetornos } from '@/lib/business-logic';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const periodo = (formData.get('periodo') as string) || null;
    const cliente = (formData.get('cliente') as string) || null;

    if (!file) {
      return NextResponse.json({ error: 'No se recibió ningún archivo' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows: FilaExcelCruda[] = XLSX.utils.sheet_to_json(ws, { defval: '' });

    if (!rows.length) {
      return NextResponse.json({ error: 'El archivo no contiene filas' }, { status: 400 });
    }

    const db = supabaseAdmin();

    // 1. Cargar catálogo de excepciones para calcular acciones
    const { data: catalogo, error: catError } = await db
      .from('excepciones_catalogo')
      .select('nombre, accion')
      .eq('activo', true);

    if (catError) throw catError;

    const catalogoMap: Record<string, string> = {};
    (catalogo || []).forEach((c) => {
      catalogoMap[c.nombre.toUpperCase()] = c.accion;
    });

    // 2. Determinar cliente: del form o detectado en los datos
    const clienteDetectado =
      cliente || String(rows[0]?.Cliente_Paga ?? '').trim() || 'SIN CLIENTE';

    // 2b. Determinar periodo: si no se especificó manualmente, se deriva
    // automáticamente del mes más frecuente en F_Documentacion (YYYY-MM)
    let periodoFinal = periodo;
    if (!periodoFinal) {
      const conteoMeses: Record<string, number> = {};
      rows.forEach((r) => {
        const raw = String(r.F_Documentacion ?? '').trim();
        if (!raw) return;
        // Formato esperado DD-MM-YYYY (MX) o YYYY-MM-DD (ISO)
        let mes: string | null = null;
        if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
          mes = raw.slice(0, 7);
        } else {
          const m = raw.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
          if (m) {
            const [, , mm, yyyy] = m;
            mes = `${yyyy}-${mm.padStart(2, '0')}`;
          }
        }
        if (mes) conteoMeses[mes] = (conteoMeses[mes] || 0) + 1;
      });
      const mesesOrdenados = Object.entries(conteoMeses).sort((a, b) => b[1] - a[1]);
      periodoFinal = mesesOrdenados[0]?.[0] || null;
    }

    // 3. Crear registro de carga
    const { data: cargaData, error: cargaError } = await db
      .from('cargas')
      .insert({
        cliente: clienteDetectado,
        nombre_archivo: file.name,
        periodo: periodoFinal,
        total_guias: rows.length,
      })
      .select()
      .single();

    if (cargaError) throw cargaError;
    const cargaId = cargaData.id;

    // 4. Normalizar todas las filas
    // Primero: identificar qué números de guía son "guías de retorno"
    // (su número aparece en la columna Retorno de otra fila)
    const retornoNumSet = construirSetDeRetornos(rows);

    const guiasNormalizadas = rows
      .map((r) => normalizarFila(r, catalogoMap, retornoNumSet))
      .filter((g) => g.guia); // descarta filas sin número de guía

    // 5. Insertar en lotes de 500 (límite práctico de Supabase)
    const BATCH = 500;
    let insertadas = 0;
    for (let i = 0; i < guiasNormalizadas.length; i += BATCH) {
      const lote = guiasNormalizadas.slice(i, i + BATCH).map((g) => ({
        ...g,
        carga_id: cargaId,
      }));
      const { error: insertError } = await db.from('guias').insert(lote);
      if (insertError) throw insertError;
      insertadas += lote.length;
    }

    return NextResponse.json({
      ok: true,
      carga_id: cargaId,
      cliente: clienteDetectado,
      total_filas: rows.length,
      guias_insertadas: insertadas,
    });
  } catch (err: unknown) {
    console.error('Error importando Excel:', err);
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
