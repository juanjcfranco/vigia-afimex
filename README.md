# VIGÍA — Panel de Control Operativo (AFIMEX)

Reconstrucción de VIGÍA en Next.js + Supabase. Reemplaza el dashboard HTML por una
app web con base de datos en la nube, historial de cargas y persistencia real.

## Qué incluye

- **10 módulos** equivalentes al HTML original: Resumen, Efectividad, Excepciones,
  Acciones, Devoluciones, Geográfico, Abiertas, Pre-Documentadas, Alertas, Guías —
  más un módulo nuevo de **Historial** de cargas.
- **Importador de Excel** que normaliza cada fila, calcula la acción recomendada
  según el catálogo de excepciones, y guarda todo en Supabase.
- **Catálogo de excepciones editable** (42+ excepciones, incluidas las que no
  estaban en el catálogo original pero aparecen en los datos reales: PÉRDIDA DE
  CONEXIÓN, PAQUETE PERDIDO, COD ELEVADO, etc.)
- **Directorio de contactos por oficina** para alertas (reemplaza el `CORREOS_OFICINAS`
  hardcodeado del HTML).
- **Reporte de cierre** guardable, con historial de reportes generados.
- Cada carga de Excel queda registrada como un "corte" independiente — puedes
  comparar meses y nunca pierdes datos anteriores.

## 1. Configurar Supabase (5 minutos)

1. Crea una cuenta gratis en supabase.com y un nuevo proyecto.
2. Ve a **SQL Editor** → pega el contenido completo de `supabase_schema.sql` → Run.
   Esto crea las 7 tablas y precarga el catálogo de excepciones.
3. En el mismo SQL Editor, abre una nueva consulta, pega el contenido completo de
   `supabase_seed_contactos.sql` → Run. Esto precarga el directorio de las 58
   oficinas AFIMEX (correos, jefes) que tenías hardcodeado en el HTML original.
4. Ve a **Project Settings → API** y copia:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public key` → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role key` → `SUPABASE_SERVICE_ROLE_KEY` (no la expongas nunca al cliente)

## 2. Configurar el proyecto localmente

```bash
cp .env.example .env.local
# pega tus 3 valores de Supabase en .env.local

npm install
npm run dev
```

Abre http://localhost:3000

## 3. Cargar tu primer Excel

Clic en "Cargar Excel" → sube tu reporte AFIMEX. Columnas esperadas (igual que tu
sistema actual): Guia, Cliente_Paga, Descripcion, Oficina_Origen, Estado_Guia,
Oficina_Destino, Estado_Destinatario, Ciudad_Destinatario, F_Historia,
Nombre_Recibio, F_Documentacion, F_Entrega, FPE, Nombre_Destinatario,
D_Tipo_Domicilio, COD, Calificacion, Tipo_Entrega, Tipo_Guia, Excepcion_1...5,
Retorno.

Cada carga se guarda como un registro independiente, nada se sobreescribe.

## 4. Deploy en Vercel (gratis)

```bash
npm install -g vercel
vercel
```

O conecta el repo de GitHub directo en vercel.com/new y agrega las mismas 3
variables de entorno en Settings -> Environment Variables.

## Estructura del proyecto

```
app/
  page.tsx                 -> pagina principal, arma los modulos
  api/
    cargas/route.ts        -> importa Excel, lista historial de cargas
    guias/route.ts         -> consulta de guias con filtros
    catalogo/route.ts      -> CRUD del catalogo de excepciones
    contactos/route.ts     -> CRUD de contactos por oficina
    alertas/route.ts       -> historial de alertas enviadas
    acciones/route.ts      -> historial de acciones manuales
    cierres/route.ts       -> reportes de cierre guardados

components/
  modules/                 -> un componente por cada tab/modulo
  Header, Tabs, FilterBar, BulkSearch, AccionBadge, UploadModal, CierreModal

lib/
  business-logic.ts        -> reglas de excepciones, calculo de accion, parsing Excel
  useVigiaData.ts           -> hook central de estado (carga activa, filtros, KPIs)
  types.ts                  -> tipos TypeScript del modelo de datos
  supabase.ts                -> clientes Supabase (publico + admin)

supabase_schema.sql         -> schema completo + seed del catalogo de excepciones
```

## Reglas de negocio (lib/business-logic.ts)

La funcion calcularAccion() replica la logica del HTML original:

1. Cualquier excepcion que contenga "ROBO" -> POSIBLE INDEMNIZACIÓN
2. COD RECHAZADO en la cadena -> DEVOLVER_COD
3. CLIENTE CANCELO -> DEVOLVER_COD
4. Si una excepcion "base" (ej. AUSENCIA) se repite 3+ veces -> DEVOLVER
5. Si no, se usa la accion del catalogo segun la ultima excepcion de la cadena
6. Si la ultima excepcion no esta en catalogo -> INVESTIGAR

Editar el catalogo desde el modulo de excepciones (o directamente en la tabla
excepciones_catalogo) cambia automaticamente las acciones calculadas en la
siguiente carga.

## Proximos pasos sugeridos

- Autenticacion (Supabase Auth) si mas de una persona va a usar el panel
- Exportar a Excel desde cada modulo (con la libreria xlsx ya instalada)
- Comparativa entre dos cargas (mes actual vs mes anterior) en el modulo de Resumen
- Envio automatico de alertas por correo via un servicio (Resend/SendGrid) en vez
  de mailto:, para no depender del cliente de correo del usuario
