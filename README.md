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
3b. Corre también, en orden, las migraciones `supabase_migracion_2` a `_5` si tu
   base ya existía de antes, y **`supabase_migracion_6_excepciones_nuevas.sql`**
   (agrega 15 excepciones reales que no estaban en el catálogo original:
   AREA REMOTA, COD ELEVADO, DESTINO INCORRECTO, EMERGENCIA, FALLA UNIDAD,
   HORARIO DE RUTA EXCEDIDO, MAL CLIMA, NO ORDENO PAQUETE, NO QUIERE PAQUETE,
   PAQUETE PERDIDO POR ROBO, PERDIDA DE CONEXIÓN, RECHAZO POR PEDIDO DUPLICADO,
   RECHAZO POR RETRASO EN ENTREGA, SIN ACCESO, VACACIONES).
3c. Si tu base ya existía de antes, corre también
   **`supabase_migracion_9_f_confirmacion.sql`** — agrega la columna
   `f_confirmacion` usada por el KPI "Tiempo Promedio de Entrega" del módulo
   Resumen.
4. Ve a **Project Settings → API** y copia:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public key` → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role key` → `SUPABASE_SERVICE_ROLE_KEY` (no la expongas nunca al cliente)
5. Define `VIGIA_AUTH_USER` y `VIGIA_AUTH_PASS` (ver sección "Acceso al panel"
   más abajo) — sin estas dos variables el sitio no carga, por seguridad.

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
Nombre_Recibio, F_Documentacion, F_Entrega, F_Confirmacion, FPE, Nombre_Destinatario,
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

## Acceso al panel (Basic Auth)

Todo el sitio — páginas y `/api/*` — está protegido por `middleware.ts` con
usuario y contraseña simples (`VIGIA_AUTH_USER` / `VIGIA_AUTH_PASS`). Es una
barrera mínima mientras no haya un login real con Supabase Auth: sin estas
dos variables configuradas, el sitio queda bloqueado por completo (falla
cerrado, no abierto).

- Agrégalas en `.env.local` para desarrollo local.
- Agrégalas también en Vercel → Settings → Environment Variables antes de
  desplegar, o el sitio en producción devolverá 401 en todo.
- El navegador pedirá usuario/contraseña con el diálogo nativo de Basic Auth
  la primera vez que se visite el sitio (o la API) desde cada dispositivo.
- Esto **no reemplaza** un sistema de permisos por usuario — todo el que
  tenga la contraseña tiene acceso total de lectura/escritura. Si más de una
  persona va a usar el panel con distintos niveles de acceso, el siguiente
  paso natural es Supabase Auth (ver "Próximos pasos sugeridos").

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

## Corrección aplicada (cruce de datos OPS ↔ catálogo)

Se validó `lib/business-logic.ts` contra un export real de OPS (`OPS_MERQ_010726.xlsx`,
10,648 guías, 95 columnas) y se corrigieron dos causas de datos cruzados:

1. **Columnas de retorno mal referenciadas**: el código buscaba `Estado Retorno` y
   `Entrega Retorno`; el export real trae `Estado retorno` (minúscula) y la fecha
   viene en `Ult Mov Retorno` (no existe columna `Entrega Retorno`). Corregido en
   `normalizarFila()`.
2. **Cruce de excepciones sensible a acentos**: `FALTA NUMERO`, `NUMERO INEXISTENTE`,
   `FUERA DE AREA DE SERVICIO` (sin acento, como llegan de OPS) no calzaban contra
   `FALTA NÚMERO`, `NÚMERO INEXISTENTE`, `FUERA DE ÁREA DE SERVICIO` del catálogo, y
   la guía caía en INVESTIGAR por default. Se agregó `normalizarClave()` (quita
   acentos, mayúsculas) usada tanto al construir el mapa del catálogo como al
   buscar la última excepción de cada guía.

Validado: con estos dos fixes + la migración 6, el 100% de las 47 excepciones
distintas presentes en los datos reales cruzan correctamente contra el catálogo.
