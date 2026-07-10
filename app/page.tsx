'use client';

import { useState } from 'react';
import { useVigiaData } from '@/lib/useVigiaData';
import Header from '@/components/Header';
import Tabs, { TabId } from '@/components/Tabs';
import FilterBar from '@/components/FilterBar';
import UploadModal from '@/components/UploadModal';
import CierreModal from '@/components/CierreModal';
import GestorContactos from '@/components/GestorContactos';

import ResumenModule from '@/components/modules/ResumenModule';
import EfectividadModule from '@/components/modules/EfectividadModule';
import ExcepcionesModule from '@/components/modules/ExcepcionesModule';
import AccionesModule from '@/components/modules/AccionesModule';
import DevolucionesModule from '@/components/modules/DevolucionesModule';
import GeoModule from '@/components/modules/GeoModule';
import FacturacionModule from '@/components/modules/FacturacionModule';
import AbiertasModule from '@/components/modules/AbiertasModule';
import PredocModule from '@/components/modules/PredocModule';
import AlertasModule from '@/components/modules/AlertasModule';
import GuiasModule from '@/components/modules/GuiasModule';
import HistorialModule from '@/components/modules/HistorialModule';

export default function Home() {
  const {
    cargas,
    cargaActiva,
    cargaActivaId,
    setCargaActivaId,
    guiasFiltradas,
    loading,
    error,
    filtroCliente,
    setFiltroCliente,
    filtroOficina,
    setFiltroOficina,
    filtroEntidad,
    setFiltroEntidad,
    filtroPeriodo,
    setFiltroPeriodo,
    clientes,
    oficinas,
    entidades,
    periodos,
    kpis,
    recargar,
  } = useVigiaData();

  const [tab, setTab] = useState<TabId>('resumen');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [cierreOpen, setCierreOpen] = useState(false);
  const [contactosOpen, setContactosOpen] = useState(false);

  const sinDatos = !loading && !cargaActivaId;

  return (
    <div className="min-h-screen">
      <Header
        cargaActiva={cargaActiva}
        periodos={periodos}
        totalGuias={kpis.total}
        efectividad={kpis.efectividad}
        onAbrirCierre={() => setCierreOpen(true)}
        onAbrirCarga={() => setUploadOpen(true)}
        onAbrirContactos={() => setContactosOpen(true)}
      />
      <Tabs active={tab} onChange={setTab} />

      {tab !== 'historial' && tab !== 'alertas' && (
        <FilterBar
          clientes={clientes}
          oficinas={oficinas}
          entidades={entidades}
          periodos={periodos}
          filtroCliente={filtroCliente}
          filtroOficina={filtroOficina}
          filtroEntidad={filtroEntidad}
          filtroPeriodo={filtroPeriodo}
          onCliente={setFiltroCliente}
          onOficina={setFiltroOficina}
          onEntidad={setFiltroEntidad}
          onPeriodo={setFiltroPeriodo}
          onLimpiar={() => {
            setFiltroCliente('');
            setFiltroOficina('');
            setFiltroEntidad('');
            setFiltroPeriodo('');
          }}
        />
      )}

      {loading && (
        <div className="p-10 text-center text-[var(--vg-text2)] text-[13px]">Cargando guías...</div>
      )}

      {error && <div className="p-5 text-[var(--vg-red)] text-[13px] font-semibold">{error}</div>}

      {sinDatos && (
        <div className="p-16 text-center">
          <div className="text-4xl mb-3">📂</div>
          <div className="font-bold text-lg mb-1">No hay datos cargados</div>
          <p className="text-[13px] text-[var(--vg-text2)] mb-4">
            Sube tu primer reporte Excel para empezar a monitorear la operación.
          </p>
          <button
            onClick={() => setUploadOpen(true)}
            className="text-[13px] font-semibold text-white bg-[var(--vg-blue)] rounded-md px-4 py-2"
          >
            ⬆ Cargar Excel
          </button>
        </div>
      )}

      {!loading && !sinDatos && (
        <>
          {tab === 'resumen' && <ResumenModule guias={guiasFiltradas} />}
          {tab === 'efectividad' && <EfectividadModule guias={guiasFiltradas} />}
          {tab === 'excepciones' && <ExcepcionesModule guias={guiasFiltradas} />}
          {tab === 'acciones' && <AccionesModule guias={guiasFiltradas} />}
          {tab === 'devoluciones' && <DevolucionesModule guias={guiasFiltradas} />}
          {tab === 'geo' && <GeoModule guias={guiasFiltradas} />}
          {tab === 'facturacion' && <FacturacionModule guias={guiasFiltradas} />}
          {tab === 'abiertas' && <AbiertasModule guias={guiasFiltradas} />}
          {tab === 'predoc' && <PredocModule guias={guiasFiltradas} />}
          {tab === 'alertas' && <AlertasModule guias={guiasFiltradas} />}
          {tab === 'guias' && <GuiasModule guias={guiasFiltradas} />}
          {tab === 'historial' && (
            <HistorialModule cargas={cargas} cargaActivaId={cargaActivaId} onSeleccionar={setCargaActivaId} />
          )}
        </>
      )}

      <UploadModal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onUploaded={() => {
          recargar();
          setUploadOpen(false);
        }}
      />
      <CierreModal open={cierreOpen} onClose={() => setCierreOpen(false)} guias={guiasFiltradas} cargaActiva={cargaActiva} />
      <GestorContactos open={contactosOpen} onClose={() => setContactosOpen(false)} />
    </div>
  );
}
