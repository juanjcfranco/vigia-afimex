'use client';

import { useState } from 'react';

interface BulkSearchProps {
  onSearch: (guias: string[]) => void;
  onClear: () => void;
  activo: boolean;
}

export default function BulkSearch({ onSearch, onClear, activo }: BulkSearchProps) {
  const [expandido, setExpandido] = useState(false);
  const [texto, setTexto] = useState('');

  function aplicar() {
    const lista = texto
      .split(/[\s,;\n]+/)
      .map((g) => g.trim())
      .filter(Boolean);
    if (lista.length) onSearch(lista);
  }

  function limpiar() {
    setTexto('');
    onClear();
  }

  return (
    <div className="px-4 py-2.5 border-t border-[var(--vg-border)] bg-white">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-[11px] font-bold text-[var(--vg-text2)]">📋 Búsqueda masiva</span>
        <button
          onClick={() => setExpandido(!expandido)}
          className="text-[11px] font-semibold text-[var(--vg-text2)] border border-[var(--vg-border)] rounded px-2 py-1 hover:bg-[var(--vg-bg)]"
        >
          {expandido ? 'Contraer' : 'Expandir'}
        </button>
        {expandido && (
          <>
            <button
              onClick={aplicar}
              className="text-[11px] font-semibold text-white bg-[var(--vg-blue)] rounded px-2 py-1"
            >
              🔍 Consultar
            </button>
            {activo && (
              <button
                onClick={limpiar}
                className="text-[11px] font-semibold text-[var(--vg-text2)] border border-[var(--vg-border)] rounded px-2 py-1"
              >
                ✕ Quitar
              </button>
            )}
          </>
        )}
      </div>
      {expandido && (
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={3}
          placeholder="Pega guías separadas por coma, espacio o salto de línea..."
          className="w-full text-[12px] border border-[var(--vg-border)] rounded-md p-2 font-mono"
        />
      )}
    </div>
  );
}
