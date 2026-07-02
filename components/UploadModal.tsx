'use client';

import { useState, useRef } from 'react';

interface UploadModalProps {
  open: boolean;
  onClose: () => void;
  onUploaded: () => void;
}

export default function UploadModal({ open, onClose, onUploaded }: UploadModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [periodo, setPeriodo] = useState('');
  const [cliente, setCliente] = useState('');
  const [loading, setLoading] = useState(false);
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
      const fd = new FormData();
      fd.append('file', file);
      if (periodo) fd.append('periodo', periodo);
      if (cliente) fd.append('cliente', cliente);

      const res = await fetch('/api/cargas', { method: 'POST', body: fd });
      const json = await res.json();

      if (!res.ok) {
        setError(json.error || 'Error al cargar el archivo');
      } else {
        setResultado(`✅ ${json.guias_insertadas} guías importadas (${json.cliente})`);
        onUploaded();
      }
    } catch {
      setError('No se pudo conectar con el servidor');
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setFile(null);
    setPeriodo('');
    setCliente('');
    setResultado(null);
    setError(null);
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
          F_Documentacion · Excepcion_1–5
        </div>

        {error && <div className="text-[12px] text-[var(--vg-red)] mb-3 font-semibold">{error}</div>}
        {resultado && <div className="text-[12px] text-[var(--vg-green)] mb-3 font-semibold">{resultado}</div>}

        <div className="flex justify-end gap-2">
          <button
            onClick={reset}
            className="text-[12px] font-semibold text-[var(--vg-text2)] border border-[var(--vg-border)] rounded-md px-3 py-1.5"
          >
            Cerrar
          </button>
          <button
            onClick={subir}
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
