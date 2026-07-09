'use client';

import { useEffect, useMemo, useState } from 'react';
import { Guia, TarifaCliente } from '@/lib/types';
import { calcularItemsFacturables } from '@/lib/business-logic';
import KpiCard from '@/components/KpiCard';
import TarifasModal from '@/components/TarifasModal';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { exportToExcel, exportToPDF } from '@/lib/export';
import { ItemFacturable } from '@/lib/business-logic';
import { useSortableTable } from '@/lib/useSortableTable';
import SortableTh from '@/components/SortableTh';

const TARIFAS_DEFAULT: TarifaCliente = {
  id: '',
  cliente: '',
  tarifa_entrega_original: 100,
  tarifa_devolucion: 40,
  tarifa_retorno_entregado: 100,
  tarifa_posible_retorno: 40,
  actualizado_en: '',
};

type Vista = 'oficina' | 'entidad' | 'mes';

export default function FacturacionModule({ guias }: { guias: Guia[] }) {
  const [vista, setVista] = useState<Vista>('oficina');
  const [tarifasModal, setTarifasModal] = useState(false);
  const [tarifas, setTarifas] = useState<TarifaCliente>(TARIFAS_DEFAULT);
  const [estadoTarifas, setEstadoTarifas] = useState<'idle' | 'cargando' | 'ok' | 'error' | 'sin_datos'>('idle');

  // Detectar cliente de las guías y cargar sus tarifas
  const cargarTarifas = () => {
    const cliente = guias[0]?.cliente;
    if (!cliente) return;
    setEstadoTarifas('cargando');
    fetch(`/api/tarifas?cliente=${encodeURIComponent(cliente)}`)
      .then((r) => r.json())
      .then((j) => {
        if (j.error) {
          console.error('Error al cargar tarifas:', j.error);
          setEstadoTarifas('error');
          return;
        }
        if (j.tarifas && j.tarifas.length) {
          setTarifas(j.tarifas[0]);
          setEstadoTarifas('ok');
        } else {
          setTarifas({ ...TARIFAS_DEFAULT, cliente });
          setEstadoTarifas('sin_datos');
        }
        setTimeout(() => setEstadoTarifas('idle'), 2500);
      })
      .catch((err) => {
        console.error('Error de red al cargar tarifas:', err);
        setEstadoTarifas('error');
      });
  };

  useEffect(cargarTarifas, [guias]);

  const items = useMemo(() => calcularItemsFacturables(guias, tarifas), [guias, tarifas]);

  const totales = useMemo(() => {
    const entregas = items.filter((i) => i.tipo === 'ENTREGA_ORIGINAL');
    const devoluciones = items.filter((i) => i.tipo === 'DEVOLUCION');
    const posibleRetorno = items.filter((i) => i.tipo === 'POSIBLE_RETORNO_OTRO_PERIODO');
    const retornosEntregados = items.filter((i) => i.tipo === 'RETORNO_ENTREGADO');
    const montoEntregas = entregas.reduce((s, i) => s + i.tarifa, 0);
    const montoDevoluciones = devoluciones.reduce((s, i) => s + i.tarifa, 0);
    const montoPosibleRetorno = posibleRetorno.reduce((s, i) => s + i.tarifa, 0);
    const montoRetornosEntregados = retornosEntregados.reduce((s, i) => s + i.tarifa, 0);
    return {
      totalGuiasFacturables: items.length,
      entregas: entregas.length,
      devoluciones: devoluciones.length,
      posibleRetorno: posibleRetorno.length,
      retornosEntregados: retornosEntregados.length,
      montoEntregas,
      montoDevoluciones,
      montoPosibleRetorno,
      montoRetornosEntregados,
      montoTotal: montoEntregas + montoDevoluciones + montoPosibleRetorno + montoRetornosEntregados,
    };
  }, [items]);

  const campoDeVista = (item: ItemFacturable): string => {
    if (vista === 'oficina') return item.oficina;
    if (vista === 'entidad') return item.entidad;
    return item.mes || 'SIN FECHA';
  };

  const desglose = useMemo(() => {
    const grupos: Record<
      string,
      {
        entregas: number;
        devoluciones: number;
        posibleRetorno: number;
        retornosEntregados: number;
        montoEntregas: number;
        montoDevoluciones: number;
        montoPosibleRetorno: number;
        montoRetornosEntregados: number;
      }
    > = {};
    items.forEach((item) => {
      const key = campoDeVista(item);
      if (!grupos[key])
        grupos[key] = {
          entregas: 0,
          devoluciones: 0,
          posibleRetorno: 0,
          retornosEntregados: 0,
          montoEntregas: 0,
          montoDevoluciones: 0,
          montoPosibleRetorno: 0,
          montoRetornosEntregados: 0,
        };
      if (item.tipo === 'ENTREGA_ORIGINAL') {
        grupos[key].entregas += 1;
        grupos[key].montoEntregas += item.tarifa;
      } else if (item.tipo === 'DEVOLUCION') {
        grupos[key].devoluciones += 1;
        grupos[key].montoDevoluciones += item.tarifa;
      } else if (item.tipo === 'POSIBLE_RETORNO_OTRO_PERIODO') {
        grupos[key].posibleRetorno += 1;
        grupos[key].montoPosibleRetorno += item.tarifa;
      } else {
        grupos[key].retornosEntregados += 1;
        grupos[key].montoRetornosEntregados += item.tarifa;
      }
    });
    return Object.entries(grupos)
      .map(([key, d]) => ({
        key,
        ...d,
        total: d.entregas + d.devoluciones + d.posibleRetorno + d.retornosEntregados,
        montoTotal: d.montoEntregas + d.montoDevoluciones + d.montoPosibleRetorno + d.montoRetornosEntregados,
      }))
      .sort((a, b) => (vista === 'mes' ? a.key.localeCompare(b.key) : b.montoTotal - a.montoTotal));
  }, [items, vista]);

  const top15 = useMemo(() => (vista === 'mes' ? desglose : desglose.slice(0, 15)), [desglose, vista]);

  const { sorted, sortKey, sortDir, requestSort } = useSortableTable<(typeof desglose)[0]>(desglose, (d, key) => {
    switch (key) {
      case 'key':
        return d.key;
      case 'entregas':
        return d.entregas;
      case 'montoEntregas':
        return d.montoEntregas;
      case 'devoluciones':
        return d.devoluciones;
      case 'montoDevoluciones':
        return d.montoDevoluciones;
      case 'posibleRetorno':
        return d.posibleRetorno;
      case 'montoPosibleRetorno':
        return d.montoPosibleRetorno;
      case 'retornosEntregados':
        return d.retornosEntregados;
      case 'montoRetornosEntregados':
        return d.montoRetornosEntregados;
      case 'total':
        return d.total;
      case 'montoTotal':
        return d.montoTotal;
      default:
        return null;
    }
  });

  const columnasExport = [
    { header: vista === 'oficina' ? 'Oficina' : vista === 'entidad' ? 'Entidad' : 'Mes', value: (f: (typeof desglose)[0]) => f.key },
    { header: 'Entregas Originales', value: (f: (typeof desglose)[0]) => f.entregas },
    { header: 'Monto Entregas', value: (f: (typeof desglose)[0]) => f.montoEntregas },
    { header: 'Devoluciones', value: (f: (typeof desglose)[0]) => f.devoluciones },
    { header: 'Monto Devoluciones', value: (f: (typeof desglose)[0]) => f.montoDevoluciones },
    { header: 'Posible Retorno Otro Periodo', value: (f: (typeof desglose)[0]) => f.posibleRetorno },
    { header: 'Monto Posible Retorno', value: (f: (typeof desglose)[0]) => f.montoPosibleRetorno },
    { header: 'Retornos Generados', value: (f: (typeof desglose)[0]) => f.retornosEntregados },
    { header: 'Monto Retornos Generados', value: (f: (typeof desglose)[0]) => f.montoRetornosEntregados },
    { header: 'Total Guías', value: (f: (typeof desglose)[0]) => f.total },
    { header: 'Monto Total', value: (f: (typeof desglose)[0]) => f.montoTotal },
  ];

  return (
    <div className="p-5 space-y-5">
      <div className="flex items-center justify-between mb-1">
        <div className="text-[11px] text-[var(--vg-text2)]">
          Tarifas activas para <strong className="text-[var(--vg-text)]">{tarifas.cliente || guias[0]?.cliente || '—'}</strong>:
          Entrega ${tarifas.tarifa_entrega_original} · Devolución ${tarifas.tarifa_devolucion} · Retorno entregado ${tarifas.tarifa_retorno_entregado} · Posible retorno ${tarifas.tarifa_posible_retorno}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setTarifasModal(true)}
            className="text-[11px] font-semibold text-[var(--vg-blue)] border border-[var(--vg-blue)]/30 rounded-md px-2.5 py-1.5 hover:bg-[var(--vg-blue-light)]"
          >
            ⚙️ Configurar tarifas
          </button>
          <button
            onClick={cargarTarifas}
            title="Vuelve a pedir la tarifa guardada para este cliente"
            className="text-[11px] font-semibold text-[var(--vg-text2)] border border-[var(--vg-border)] rounded-md px-2.5 py-1.5 hover:bg-[var(--vg-bg)]"
          >
            {estadoTarifas === 'cargando' && '⏳ Actualizando...'}
            {estadoTarifas === 'ok' && '✅ Actualizado'}
            {estadoTarifas === 'error' && '⚠️ Error, ver consola'}
            {estadoTarifas === 'sin_datos' && 'ℹ️ Sin tarifa guardada (default)'}
            {estadoTarifas === 'idle' && '🔄 Actualizar tarifas'}
          </button>
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          title="Guías Facturables"
          value={totales.totalGuiasFacturables.toLocaleString('es-MX')}
          subtitle="Entregas + devoluciones + posible retorno + retornos entregados"
          accentColor="#1E3A8A"
        />
        <KpiCard
          title="Entregas Originales"
          value={totales.entregas.toLocaleString('es-MX')}
          subtitle={`$${tarifas.tarifa_entrega_original} c/u`}
          accentColor="#0B9B67"
        />
        <KpiCard
          title="Devoluciones"
          value={totales.devoluciones.toLocaleString('es-MX')}
          subtitle={`$${tarifas.tarifa_devolucion} c/u · autorizadas`}
          accentColor="#DC2626"
        />
        <KpiCard
          title="Posible Retorno (otro periodo)"
          value={totales.posibleRetorno.toLocaleString('es-MX')}
          subtitle={`$${tarifas.tarifa_posible_retorno} c/u`}
          accentColor="#B45309"
        />
        <KpiCard
          title="Retornos Generados"
          value={totales.retornosEntregados.toLocaleString('es-MX')}
          subtitle={`$${tarifas.tarifa_retorno_entregado} c/u · paquete de regreso recibido`}
          accentColor="#7C3AED"
        />
        <KpiCard
          title="Monto Entregas"
          value={`$${totales.montoEntregas.toLocaleString('es-MX')}`}
          subtitle="Entregas originales"
          accentColor="#0B9B67"
        />
        <KpiCard
          title="Monto Devoluciones + Retornos"
          value={`$${(totales.montoDevoluciones + totales.montoRetornosEntregados).toLocaleString('es-MX')}`}
          subtitle="Devolución + retorno entregado"
          accentColor="#DC2626"
        />
        <KpiCard
          title="Monto Total"
          value={`$${totales.montoTotal.toLocaleString('es-MX')}`}
          subtitle="Facturación total del corte"
          accentColor="#7C3AED"
        />
      </div>

      <div className="bg-white rounded-lg border border-[var(--vg-border)] p-4">
        <div className="font-bold text-[12.5px] mb-3">
          Monto Facturable por {vista === 'oficina' ? 'Oficina (Top 15)' : vista === 'entidad' ? 'Entidad (Top 15)' : 'Mes'}
        </div>
        <ResponsiveContainer width="100%" height={320}>
          {vista === 'mes' ? (
            <LineChart data={top15} margin={{ bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="key" fontSize={11} />
              <YAxis fontSize={11} />
              <Tooltip formatter={(v) => `$${Number(v).toLocaleString('es-MX')}`} />
              <Legend />
              <Line type="monotone" dataKey="montoEntregas" name="Entregas" stroke="#0B9B67" strokeWidth={2} />
              <Line type="monotone" dataKey="montoDevoluciones" name="Devoluciones" stroke="#DC2626" strokeWidth={2} />
              <Line type="monotone" dataKey="montoPosibleRetorno" name="Posible retorno" stroke="#B45309" strokeWidth={2} />
              <Line type="monotone" dataKey="montoRetornosEntregados" name="Retornos entregados" stroke="#7C3AED" strokeWidth={2} />
            </LineChart>
          ) : (
            <BarChart data={top15} margin={{ bottom: 90 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="key" angle={-40} textAnchor="end" interval={0} fontSize={10} height={100} />
              <YAxis fontSize={11} />
              <Tooltip formatter={(v) => `$${Number(v).toLocaleString('es-MX')}`} />
              <Legend />
              <Bar dataKey="montoEntregas" name="Entregas" stackId="a" fill="#0B9B67" />
              <Bar dataKey="montoDevoluciones" name="Devoluciones" stackId="a" fill="#DC2626" />
              <Bar dataKey="montoPosibleRetorno" name="Posible retorno" stackId="a" fill="#B45309" />
              <Bar dataKey="montoRetornosEntregados" name="Retornos entregados" stackId="a" fill="#7C3AED" />
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>

      <div className="bg-white rounded-lg border border-[var(--vg-border)] overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--vg-border)] flex items-center justify-between flex-wrap gap-2">
          <div className="font-bold text-[13px]">Desglose de Facturación</div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex gap-1 bg-[var(--vg-bg)] p-1 rounded-md">
              <button
                onClick={() => setVista('oficina')}
                className={`text-[11.5px] font-semibold px-3 py-1 rounded ${vista === 'oficina' ? 'bg-white shadow-sm text-[var(--vg-blue)]' : 'text-[var(--vg-text2)]'}`}
              >
                Oficina
              </button>
              <button
                onClick={() => setVista('entidad')}
                className={`text-[11.5px] font-semibold px-3 py-1 rounded ${vista === 'entidad' ? 'bg-white shadow-sm text-[var(--vg-blue)]' : 'text-[var(--vg-text2)]'}`}
              >
                Entidad
              </button>
              <button
                onClick={() => setVista('mes')}
                className={`text-[11.5px] font-semibold px-3 py-1 rounded ${vista === 'mes' ? 'bg-white shadow-sm text-[var(--vg-blue)]' : 'text-[var(--vg-text2)]'}`}
              >
                Mes
              </button>
            </div>
            <button
              onClick={() => exportToExcel(desglose, columnasExport, `Facturacion_${vista}`)}
              className="text-[11px] font-semibold text-[var(--vg-text2)] border border-[var(--vg-border)] rounded-md px-2.5 py-1.5 bg-white"
            >
              ⬇ Excel
            </button>
            <button
              onClick={() => exportToPDF(desglose, columnasExport, `Facturación por ${vista}`)}
              className="text-[11px] font-semibold text-[var(--vg-text2)] border border-[var(--vg-border)] rounded-md px-2.5 py-1.5 bg-white"
            >
              🖨 PDF
            </button>
          </div>
        </div>
        <div className="max-h-[500px] overflow-y-auto vg-scroll">
          <table className="vg-table">
            <thead>
              <tr>
                <SortableTh label={vista === 'oficina' ? 'Oficina' : vista === 'entidad' ? 'Entidad' : 'Mes'} sortKey="key" currentKey={sortKey} currentDir={sortDir} onSort={requestSort} />
                <SortableTh label="Entregas" sortKey="entregas" currentKey={sortKey} currentDir={sortDir} onSort={requestSort} />
                <SortableTh label="Monto Entregas" sortKey="montoEntregas" currentKey={sortKey} currentDir={sortDir} onSort={requestSort} />
                <SortableTh label="Devoluciones" sortKey="devoluciones" currentKey={sortKey} currentDir={sortDir} onSort={requestSort} />
                <SortableTh label="Monto Devoluciones" sortKey="montoDevoluciones" currentKey={sortKey} currentDir={sortDir} onSort={requestSort} />
                <SortableTh label="Posible Retorno" sortKey="posibleRetorno" currentKey={sortKey} currentDir={sortDir} onSort={requestSort} />
                <SortableTh label="Monto Posible Retorno" sortKey="montoPosibleRetorno" currentKey={sortKey} currentDir={sortDir} onSort={requestSort} />
                <SortableTh label="Retornos Generados" sortKey="retornosEntregados" currentKey={sortKey} currentDir={sortDir} onSort={requestSort} />
                <SortableTh label="Monto Retornos Generados" sortKey="montoRetornosEntregados" currentKey={sortKey} currentDir={sortDir} onSort={requestSort} />
                <SortableTh label="Total Guías" sortKey="total" currentKey={sortKey} currentDir={sortDir} onSort={requestSort} />
                <SortableTh label="Monto Total" sortKey="montoTotal" currentKey={sortKey} currentDir={sortDir} onSort={requestSort} />
              </tr>
            </thead>
            <tbody>
              {sorted.map((d) => (
                <tr key={d.key}>
                  <td className="font-medium">{d.key}</td>
                  <td>{d.entregas}</td>
                  <td>${d.montoEntregas.toLocaleString('es-MX')}</td>
                  <td>{d.devoluciones}</td>
                  <td>${d.montoDevoluciones.toLocaleString('es-MX')}</td>
                  <td>{d.posibleRetorno}</td>
                  <td>${d.montoPosibleRetorno.toLocaleString('es-MX')}</td>
                  <td>{d.retornosEntregados}</td>
                  <td>${d.montoRetornosEntregados.toLocaleString('es-MX')}</td>
                  <td>{d.total}</td>
                  <td className="font-bold">${d.montoTotal.toLocaleString('es-MX')}</td>
                </tr>
              ))}
              {!desglose.length && (
                <tr>
                  <td colSpan={11} className="text-center text-[var(--vg-text3)] py-6">
                    No hay guías facturables en este corte
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <TarifasModal open={tarifasModal} onClose={() => { setTarifasModal(false); cargarTarifas(); }} />
    </div>
  );
}
