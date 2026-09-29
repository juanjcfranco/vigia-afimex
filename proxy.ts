import { NextRequest, NextResponse } from 'next/server';

// ============================================================
// Basic Auth para todo el sitio (páginas + /api/*).
//
// Protege el panel completo con un usuario/contraseña compartidos,
// definidos en las variables de entorno VIGIA_AUTH_USER y
// VIGIA_AUTH_PASS. Es una barrera simple mientras no exista un login
// real con Supabase Auth — evita que cualquiera con la URL pueda leer
// o modificar los datos.
//
// Si las variables de entorno no están configuradas, el middleware
// bloquea todo por defecto (falla cerrado, no abierto) para no dejar
// el sitio expuesto por un despliegue mal configurado.
// ============================================================

function noAutorizado() {
  return new NextResponse('Autenticación requerida.', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="VIGIA", charset="UTF-8"' },
  });
}

export function proxy(req: NextRequest) {
  const user = process.env.VIGIA_AUTH_USER;
  const pass = process.env.VIGIA_AUTH_PASS;

  if (!user || !pass) {
    console.error(
      'VIGIA_AUTH_USER / VIGIA_AUTH_PASS no están configuradas: bloqueando acceso por seguridad.'
    );
    return noAutorizado();
  }

  const header = req.headers.get('authorization');
  if (!header || !header.startsWith('Basic ')) {
    return noAutorizado();
  }

  const credenciales = Buffer.from(header.slice(6), 'base64').toString('utf-8');
  const idx = credenciales.indexOf(':');
  const usuarioRecibido = idx >= 0 ? credenciales.slice(0, idx) : credenciales;
  const passRecibido = idx >= 0 ? credenciales.slice(idx + 1) : '';

  if (usuarioRecibido !== user || passRecibido !== pass) {
    return noAutorizado();
  }

  return NextResponse.next();
}

// Aplica a todo excepto assets estáticos de Next (_next/*) y archivos
// públicos comunes, para no bloquear el propio bundle de la app.
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
