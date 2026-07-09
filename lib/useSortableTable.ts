'use client';

import { useMemo, useState } from 'react';

export type SortDir = 'asc' | 'desc';

// Hook genérico para hacer ordenable cualquier tabla. `getValue(item, key)`
// debe devolver el valor crudo (string, number, o null) de la columna
// `key` para ese renglón — la comparación se encarga de tratar números y
// texto por separado, y manda los valores null/vacíos al final sin
// importar la dirección del orden.
export function useSortableTable<T>(
  data: T[],
  getValue: (item: T, key: string) => string | number | null | undefined,
  defaultKey: string | null = null,
  defaultDir: SortDir = 'asc'
) {
  const [sortKey, setSortKey] = useState<string | null>(defaultKey);
  const [sortDir, setSortDir] = useState<SortDir>(defaultDir);

  const sorted = useMemo(() => {
    if (!sortKey) return data;
    const copia = [...data];
    copia.sort((a, b) => {
      const va = getValue(a, sortKey);
      const vb = getValue(b, sortKey);
      const vacioA = va === null || va === undefined || va === '';
      const vacioB = vb === null || vb === undefined || vb === '';
      if (vacioA && vacioB) return 0;
      if (vacioA) return 1; // vacíos siempre al final, sin importar la dirección
      if (vacioB) return -1;

      if (typeof va === 'number' && typeof vb === 'number') {
        return sortDir === 'asc' ? va - vb : vb - va;
      }
      const sa = String(va).toLowerCase();
      const sb = String(vb).toLowerCase();
      if (sa < sb) return sortDir === 'asc' ? -1 : 1;
      if (sa > sb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return copia;
  }, [data, sortKey, sortDir, getValue]);

  function requestSort(key: string) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  return { sorted, sortKey, sortDir, requestSort };
}
