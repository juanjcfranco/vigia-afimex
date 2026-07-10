'use client';

import { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import {
  normalizarFila,
  construirSetDeRetornos,
  construirSetDeClientesConPatronDominante,
  detectarClienteYPeriodo,
  normalizarClave,
  FilaExcelCruda,
} from '@/lib/business-logic';

interface UploadModalProps {
  open: boolean;
  onClose: () => void;
  onUploaded: () => void;
}

// Tamaño de cada bloque de guías que se manda al servidor. Se eligió
// conservador (muy por debajo del límite de 4.5 MB por solicitud que
// imponen los Serverless Functions de Vercel) para dejar margen incluso
// con filas de texto largo (descripciones, nombres, ciudades).
const TAMANO_BLOQUE = 2000;

export default function UploadModal({ open, onClose, onUploaded }: UploadModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [periodo, setPeriodo] = useState('');
  const [cliente, setCliente] = useState('');
  const [loading, setLoading] = useState(false);
  const [etapa, setEtapa] = useState<string | null>(null);
  const [progreso, setProgreso] = useState<{ enviadas: number; total: number } | null>(null);
  const [resultado, setResultado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [duplicadoDetectado, setDuplicadoDetectado] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  async function subir(forzar = false) {
    if (!file) return;
    setLoading(true);
    setError(null);
    if (!forzar) setDuplicadoDetectado(null);
    setResultado(null);
    setProgreso(null);

    let cargaId: string | null = null;

    try {
      // 1. Leer y parsear el Excel EN EL NAVEGADOR. El archivo nunca se
      // manda completo al servidor — solo los datos ya normalizados, en
      // bloques pequeños (ver TAMANO_BLOQUE más abajo). Esto evita el
      // límite de 4.5 MB por solicitud de los Serverless Functions de
      // Vercel, que hacía fallar la carga de Excels grandes en producción
      // (aunque funcionaran en local, donde ese límite no existe).
      setEtapa('Leyendo archivo...');
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows: FilaExcelCruda[] = XLSX.utils.sheet_to_json(ws, { defval: '' });

      if (!rows.length) {
        setError('El archivo no contiene filas');
        return;
      }

      // 2. Catálogo de excepciones activo, para calcular la acción
      // recomendada de cada guía (antes se hacía en el servidor; ahora
      // se hace aquí porque el Excel ya no viaja al servidor).
      setEtapa('Cargando catálogo de excepciones...');
      const catRes = await fetch('/api/catalogo');
      const catJson = await catRes.json();
      if (!catRes.ok) throw new Error(catJson.error || 'No se pudo cargar el catálogo');

      const catalogoMap: Record<string, string> = {};
      (catJson.catalogo || [])
        .filter((c: { activo: boolean }) => c.activo)
        .forEach((c: { nombre: string; accion: string }) => {
          catalogoMap[normalizarClave(c.nombre)] = c.accion;
        });

      // 3. Normalizar todas las filas (misma lógica que antes corría en
      // el servidor — normalizarFila() es la misma función compartida).
      setEtapa('Procesando filas...');
      const retornoNumSet = construirSetDeRetornos(rows);
      // Clientes donde "Cliente_Paga == Nombre_Destinatario" es su forma
      // normal de operar (ej. paqueterías que entregan a sus propias
      // agencias), no evidencia de retorno — ver la función para el detalle.
      const clientesConPatronDominante = construirSetDeClientesConPatronDominante(rows);
      const guiasNormalizadas = rows
        .map((r) => normalizarFila(r, catalogoMap, retornoNumSet, clientesConPatronDominante))
        .filter((g) => g.guia); // descarta filas sin número de guía

      const { cliente: clienteDetectado, periodo: periodoDetectado } = detectarClienteYPeriodo(
        rows,
        cliente || null,
        periodo || null
      );

      // 4. Crear el registro de la carga (solo metadatos).
      setEtapa('Creando carga...');
      const cargaRes = await fetch('/api/cargas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre_archivo: file.name,
          cliente: clienteDetectado,
          periodo: periodoDetectado,
          total_filas: rows.length,
          forzar,
        }),
      });
      const cargaJson = await cargaRes.json();

      if (!cargaRes.ok) {
        if (cargaJson.error === 'archivo_duplicado') {
          setDuplicadoDetectado(cargaJson.message);
          return;
        }
        throw new Error(cargaJson.error || 'No se pudo crear la carga');
      }
      cargaId = cargaJson.carga_id;

      // 5. Subir las guías normalizadas en bloques pequeños.
      let insertadas = 0;
      for (let i = 0; i < guiasNormalizadas.length; i += TAMANO_BLOQUE) {
        const bloque = guiasNormalizadas.slice(i, i + TAMANO_BLOQUE);
        setEtapa('Subiendo guías...');
        setProgreso({ enviadas: i, total: guiasNormalizadas.length });

        const res = await fetch('/api/cargas/guias', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ carga_id: cargaId, guias: bloque }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Error al subir un bloque de guías');
        insertadas += json.insertadas;
      }

      setProgreso({ enviadas: insertadas, total: guiasNormalizadas.length });
      setResultado(`✅ ${insertadas.toLocaleString('es-MX')} guías importadas (${clienteDetectado})`);
      onUploaded();
    } catch (err) {
      // Si ya se había creado la carga pero un bloque de guías falló a
      // medio camino, se borra para no dejar una carga a medias (con
      // menos guías de las que dice su total) — así el usuario puede
      // reintentar limpio en vez de terminar con datos inconsistentes.
      if (cargaId) {
        try {
          await fetch(`/api/cargas?id=${cargaId}`, { method: 'DELETE' });
        } catch {
          // Si ni siquiera el rollback funciona, no hay más que hacer
          // desde aquí — el mensaje de error ya le indica al usuario que
          // vuelva a intentar.
        }
      }
      const message = err instanceof Error ? err.message : 'No se pudo conectar con el servidor';
      setError(message);
    } finally {
      setLoading(false);
      setEtapa(null);
    }
  }

  function reset() {
    setFile(null);
    setPeriodo('');
    setCliente('');
    setResultado(null);
    setError(null);
    setProgreso(null);
    setEtapa(null);
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-md w-full p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-lg">📂 Cargar nuevo reporte Excel</h2>
          <button onClick={reset} className="text-[var(--vg-text2)] text-xl leading-none">
            ✕
          </button>
        </div>

        <div
          onClick={() => inputRef.current?.click()}
          className="border-2 border-dashed border-[var(--vg-border)] rounded-lg p-6 text-center cursor-pointer hover:border-[var(--vg-blue)] transition mb-4"
        >
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
          {file ? (
            <div className="text-[13px] font-semibold text-[var(--vg-blue)]">{file.name}</div>
          ) : (
            <div className="text-[13px] text-[var(--vg-text2)]">
              Haz clic o arrastra tu archivo Excel aquí
              <div className="text-[11px] text-[var(--vg-text3)] mt-1">Formatos: .xlsx · .xls</div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className="text-[11px] font-semibold text-[var(--vg-text2)] block mb-1">
              Periodo (opcional)
            </label>
            <input
              value={periodo}
              onChange={(e) => setPeriodo(e.target.value)}
              placeholder="Se detecta de F_Documentacion"
              className="w-full text-[12px] border border-[var(--vg-border)] rounded-md px-2.5 py-1.5"
            />
          </div>
          <div>
            <label className="text-[11px] font-semibold text-[var(--vg-text2)] block mb-1">
              Cliente (opcional)
            </label>
            <input
              value={cliente}
              onChange={(e) => setCliente(e.target.value)}
              placeholder="Se detecta del archivo"
              className="w-full text-[12px] border border-[var(--vg-border)] rounded-md px-2.5 py-1.5"
            />
          </div>
        </div>

        <div className="bg-[var(--vg-blue-light)] border border-blue-200 rounded-md p-3 text-[11px] text-[var(--vg-text2)] mb-4">
          Columnas esperadas: Guia · Cliente_Paga · Descripcion · Oficina_Origen · Estado_Guia ·
          Oficina_Destino · Estado_Destinatario · Ciudad_Destinatario · F_Historia · Nombre_Recibio ·
          F_Documentacion · F_Confirmacion · Excepcion_1–5
        </div>

        {loading && (
          <div className="text-[12px] text-[var(--vg-text2)] mb-3">
            <div className="font-semibold mb-1">{etapa}</div>
            {progreso && progreso.total > 0 && (
              <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-[var(--vg-blue)] h-2 rounded-full transition-all"
                  style={{ width: `${Math.min(100, (progreso.enviadas / progreso.total) * 100)}%` }}
                />
              </div>
            )}
            {progreso && progreso.total > 0 && (
              <div className="text-[11px] text-[var(--vg-text3)] mt-1">
                {progreso.enviadas.toLocaleString('es-MX')} / {progreso.total.toLocaleString('es-MX')} guías
              </div>
            )}
          </div>
        )}

        {error && <div className="text-[12px] text-[var(--vg-red)] mb-3 font-semibold">{error}</div>}
        {resultado && <div className="text-[12px] text-[var(--vg-green)] mb-3 font-semibold">{resultado}</div>}
        {duplicadoDetectado && (
          <div className="bg-amber-50 border border-amber-300 rounded-md p-3 text-[12px] text-amber-900 mb-3">
            <div className="font-semibold mb-2">⚠️ Posible carga duplicada</div>
            <div className="mb-2">{duplicadoDetectado}</div>
            <button
              onClick={() => subir(true)}
              disabled={loading}
              className="text-[11px] font-semibold text-white bg-amber-600 rounded-md px-2.5 py-1 disabled:opacity-50"
            >
              Cargar de todos modos
            </button>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button
            onClick={reset}
            className="text-[12px] font-semibold text-[var(--vg-text2)] border border-[var(--vg-border)] rounded-md px-3 py-1.5"
          >
            Cerrar
          </button>
          <button
            onClick={() => subir()}
            disabled={!file || loading}
            className="text-[12px] font-semibold text-white bg-[var(--vg-blue)] rounded-md px-3 py-1.5 disabled:opacity-50"
          >
            {loading ? 'Importando...' : 'Importar'}
          </button>
        </div>
      </div>
    </div>
  );
}
