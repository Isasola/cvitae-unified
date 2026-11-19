# Staging local de CVitae

Este entorno es aislado: usa una base Supabase local, almacenamiento local y una
bandeja de correo que no entrega mensajes a destinatarios reales.

## Requisitos

- Docker Desktop iniciado.
- Node.js y dependencias del proyecto instaladas.
- Supabase CLI disponible mediante `npx`.
- Netlify CLI disponible como `netlify.cmd`.

## Iniciar

```powershell
npm.cmd run staging:local
```

El comando levanta Supabase, obtiene sus credenciales locales únicamente para el
proceso actual y después inicia Netlify Dev.

Para mantenerse dentro de la memoria disponible en Docker Desktop, el entorno
local desactiva Realtime, Supabase Analytics y los buckets vectoriales
experimentales. El `pgvector` de Postgres que usa el matching continúa activo.

- Aplicación: `http://127.0.0.1:8888`
- Supabase Studio: `http://127.0.0.1:54323`
- Correos locales: `http://127.0.0.1:54324`

No copies credenciales de producción a este entorno. Las funciones que consumen
proveedores externos permanecerán fuera de las pruebas locales hasta incorporar
sus dobles de prueba y límites en las tareas de seguridad correspondientes.

## Estado y detención

```powershell
npm.cmd run staging:status
npm.cmd run staging:stop
```

Detener conserva los volúmenes locales. La reconstrucción completa del esquema y
los datos ficticios se valida con `supabase db reset` en la tarea 2.

## Regla de seguridad

Nunca probar CVs reales en staging. Solo se usarán los PDFs ficticios generados
por `npm.cmd run qa:b2b-fixtures`.
