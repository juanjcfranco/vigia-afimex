'use client';

import { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { campoInsensible, parseFechaExcel, FilaExcelCruda } from '@/lib/business-logic';

interface ConciliacionModalProps {
  open: boolean;
  onClose: () => void;
  onSubido: () => void;
}

// El "layout" de referencia trae estas columnas: CLIENTE, GUIA, OF DESTINO,
// FECHA ENTREGA, GUIA CLIENTE, CIP, COD, SEMANA PAGO. Presencia de una
// guía en el archivo = pagada por completo (no hay pagos parciales).
function limpiarTexto(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  // Algunos exports traen caracteres invisibles pegados (ej. zero-width
  // space) al copiar/pegar de otros sistemas — se limpian aquí.
  const s = String(v).replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
  return s || null;
}

function parseNumero(v: unknown): number {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return v;
  const limpio = String(v).replace(/[^0-9.-]/g, '');
  const n = parseFloat(limpio);
  return isNaN(n) ? 0 : n;
}

function parseEntero(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = parseInt(String(v).replace(/[^0-9-]/g, ''), 10);
  return isNaN(n) ? null : n;
}

export default function ConciliacionModal({ open, onClose, onSubido }: ConciliacionModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [etapa, setEtapa] = useState<string | null>(null);
  const [resultado, setResultado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  async function subir() {
    if (!file) return;
    setLoading(true);
    setError(null);
    setResultado(null);

    try {
      setEtapa('Leyendo archivo...');
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows: FilaExcelCruda[] = XLSX.utils.sheet_to_json(ws, { defval: '' });

      if (!rows.length) {
        setError('El archivo no contiene filas');
        return;
      }

      setEtapa('Normalizando filas...');
      const filas = rows
        .map((r) => {
          const guiaRaw = campoInsensible(r, 'GUIA', 'Guía', 'Guia');
          const guia = guiaRaw !== undefined && guiaRaw !== '' ? String(guiaRaw).trim().replace(/\.0$/, '') : '';
          if (!guia) return null;
          return {
            guia,
            cliente: limpiarTexto(campoInsensible(r, 'CLIENTE', 'Cliente')),
            oficina_destino: limpiarTexto(campoInsensible(r, 'OF DESTINO', 'Oficina Destino', 'OFICINA DESTINO')),
            fecha_entrega: parseFechaExcel(campoInsensible(r, 'FECHA ENTREGA', 'Fecha Entrega')),
            guia_cliente: limpiarTexto(campoInsensible(r, 'GUIA CLIENTE', 'Guía Cliente')),
            cip: limpiarTexto(campoInsensible(r, 'CIP')),
            cod: parseNumero(campoInsensible(r, 'COD')),
            semana_pago: parseEntero(campoInsensible(r, 'SEMANA PAGO', 'Semana Pago')),
          };
        })
        .filter((f): f is NonNullable<typeof f> => f !== null);

      if (!filas.length) {
        setError('Ninguna fila trae un número de guía válido en la columna GUIA');
        return;
      }

      setEtapa(`Subiendo ${filas.length.toLocaleString('es-MX')} registro(s)...`);
      const res = await fetch('/api/conciliaciones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filas }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Error al subir la conciliación');

      const omitidas = rows.length - filas.length;
      setResultado(
        `✅ ${json.procesadas.toLocaleString('es-MX')} guía(s) conciliada(s) correctamente.` +
          (omitidas > 0 ? ` ${omitidas} fila(s) se omitieron por no traer número de guía.` : '')
      );
      setFile(null);
      if (inputRef.current) inputRef.current.value = '';
      onSubido();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error inesperado al procesar el archivo');
    } finally {
      setLoading(false);
      setEtapa(null);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-bold">💳 Cargar Conciliación de COD</h2>
          <button onClick={onClose} className="text-[var(--vg-text3)] hover:text-[var(--vg-text1)] text-[18px] leading-none">
            ×
          </button>
        </div>

        <p className="text-[11.5px] text-[var(--vg-text2)]">
          Sube el archivo con las guías ya pagadas (columnas esperadas: CLIENTE, GUIA, OF DESTINO, FECHA ENTREGA, GUIA
          CLIENTE, CIP, COD, SEMANA PAGO). Cada guía que aparezca aquí se marca como <b>pagada</b> — las que no
          aparezcan siguen <b>pendientes</b>. Puedes subir un archivo nuevo cuando sea necesario: las guías ya
          conciliadas antes no se duplican ni se pierden.
        </p>

        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls,.xlsb,.csv"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          className="w-full text-[12px] border border-[var(--vg-border)] rounded-md px-2.5 py-2"
        />

        {etapa && <div className="text-[12px] text-[var(--vg-blue)] font-semibold">{etapa}</div>}
        {resultado && <div className="text-[12px] text-[#0B9B67] font-semibold bg-[#F0FDF4] rounded-md px-2.5 py-2">{resultado}</div>}
        {error && <div className="text-[12px] text-[#DC2626] font-semibold bg-[#FEF2F2] rounded-md px-2.5 py-2">{error}</div>}

        <div className="flex justify-end gap-2 pt-1">
          <button
            onClick={onClose}
            className="text-[12px] font-semibold text-[var(--vg-text2)] px-3 py-1.5 rounded-md hover:bg-[var(--vg-blue-light)]"
          >
            Cerrar
          </button>
          <button
            onClick={subir}
            disabled={!file || loading}
            className="text-[12px] font-bold text-white bg-[var(--vg-blue)] px-3.5 py-1.5 rounded-md disabled:opacity-40"
          >
            {loading ? 'Subiendo...' : 'Subir Conciliación'}
          </button>
        </div>
      </div>
    </div>
  );
}
