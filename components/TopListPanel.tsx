'use client';

interface TopListPanelProps {
  title: string;
  subtitle?: string;
  items: Array<{ key: string; count: number }>;
  total: number;
  accentColor?: string;
  limite?: number; // cuántos renglones mostrar (por defecto, todos los que traiga `items`)
}

// Panel compacto de ranking ("Top N"), usado para los resúmenes de
// Excepciones y Devoluciones en varios módulos (Excepciones, Devoluciones,
// Resumen, Efectividad). Muestra cantidad y porcentaje sobre `total`.
export default function TopListPanel({ title, subtitle, items, total, accentColor = '#1E3A8A', limite }: TopListPanelProps) {
  const filas = limite ? items.slice(0, limite) : items;

  return (
    <div className="bg-white rounded-lg border border-[var(--vg-border)] p-4">
      <div className="font-bold text-[12.5px]">{title}</div>
      {subtitle && <div className="text-[10.5px] text-[var(--vg-text2)] mb-2">{subtitle}</div>}
      {!subtitle && <div className="mb-2" />}
      <div className="space-y-1.5">
        {filas.map(({ key, count }, i) => {
          const pct = total ? ((count / total) * 100).toFixed(1) : '0.0';
          return (
            <div key={key} className="flex items-center gap-2">
              <span className="text-[10.5px] font-semibold text-[var(--vg-text3)] w-4 shrink-0">{i + 1}</span>
              <span className="text-[11.5px] font-medium truncate flex-1" title={key}>
                {key}
              </span>
              <span className="text-[11.5px] font-bold shrink-0" style={{ color: accentColor }}>
                {count.toLocaleString('es-MX')}
              </span>
              <span className="text-[10px] text-[var(--vg-text3)] w-10 text-right shrink-0">{pct}%</span>
            </div>
          );
        })}
        {!filas.length && <div className="text-[11px] text-[var(--vg-text3)] py-2">Sin datos para este corte</div>}
      </div>
    </div>
  );
}
