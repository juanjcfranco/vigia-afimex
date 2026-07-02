'use client';

export const TABS = [
  { id: 'resumen', label: '📊 Resumen' },
  { id: 'efectividad', label: '🎯 Efectividad' },
  { id: 'excepciones', label: '🔗 Excepciones' },
  { id: 'acciones', label: '⚡ Acciones' },
  { id: 'devoluciones', label: '↩ Devoluciones' },
  { id: 'geo', label: '🗺 Geográfico' },
  { id: 'facturacion', label: '💵 Facturación' },
  { id: 'abiertas', label: '📂 Abiertas' },
  { id: 'predoc', label: '🔵 Pre-Documentadas' },
  { id: 'alertas', label: '📧 Alertas' },
  { id: 'guias', label: '🔍 Guías' },
  { id: 'historial', label: '🕘 Historial' },
] as const;

export type TabId = (typeof TABS)[number]['id'];

interface TabsProps {
  active: TabId;
  onChange: (id: TabId) => void;
}

export default function Tabs({ active, onChange }: TabsProps) {
  return (
    <nav className="bg-white border-b-2 border-[var(--vg-border)] px-2 flex flex-wrap sticky top-0 z-20 overflow-x-auto vg-scroll">
      {TABS.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={`px-3 py-2.5 text-[11.5px] font-semibold whitespace-nowrap border-b-[3px] transition-colors ${
            active === t.id
              ? 'text-[var(--vg-blue)] border-[var(--vg-blue)]'
              : 'text-[var(--vg-text2)] border-transparent hover:text-[var(--vg-blue)] hover:bg-[var(--vg-blue-light)]'
          }`}
        >
          {t.label}
        </button>
      ))}
    </nav>
  );
}
