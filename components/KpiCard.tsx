'use client';

interface KpiCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  accentColor: string;
}

export default function KpiCard({ title, value, subtitle, accentColor }: KpiCardProps) {
  return (
    <div
      className="bg-white rounded-lg p-4 border-t-4 shadow-sm"
      style={{ borderTopColor: accentColor }}
    >
      <div className="text-[11px] font-bold text-[var(--vg-text2)] tracking-wide uppercase">{title}</div>
      <div className="text-3xl font-extrabold mt-1.5" style={{ color: accentColor }}>
        {value}
      </div>
      {subtitle && <div className="text-[11px] text-[var(--vg-text3)] mt-1">{subtitle}</div>}
    </div>
  );
}
