# CVitae — auditoría funcional y handoff

Fecha de corte: 23 de julio de 2026.

## Estado de referencia

- Rama productiva: `feature/aws-migration`.
- Commit del rediseño, monitoreo y RLS: `9e6f4be8`.
- Rama de correcciones funcionales: `fix/critical-flows-and-dependencies`.
- Proyecto Supabase vinculado: `rbrirxbjbmdxflzaxxzp`.
- Producción: `https://cvitae.lat`.

## Cambios de plataforma ya desplegados

- Navegación móvil pública.
- Jerarquía y recorrido comercial de la home.
- Estados de carga, error, vacío y reintento en oportunidades.
- Experiencia pública coherente en `/mi-carrera`.
- Mejor presentación de `/empresas`.
- Prerender semántico de la home.
- Monitoreo de 49 scrapers desde el administrador.
- Migraciones `202607230001_scraper_monitoring.sql` y
  `202607230002_security_hardening.sql` aplicadas.
- Operaciones sensibles del administrador movidas a la Function protegida
  `admin-data`.

Más detalles: `docs/PLATFORM-POLISH.md`.

## Fallos funcionales encontrados después del despliegue

### Analizador público

El endpoint `/.netlify/functions/analyze-cv-public` devolvía HTTP 500 con texto
de CV válido. La causa era un ID incompleto de AWS Bedrock:

- Incorrecto: `us.anthropic.claude-haiku-4-5-20251001`
- Correcto: `us.anthropic.claude-haiku-4-5-20251001-v1:0`

El mismo ID incorrecto se usaba en el modo `extract` de
`analyze-cv-candidate`.

### Extracción de PDF

`extract-pdf-text` intentaba procesar cualquier Base64 como PDF y devolvía
detalles internos del parser. Ahora valida método, tamaño, firma `%PDF-`,
cantidad mínima de texto y devuelve mensajes seguros.

### Portal de empresas

- El panel guardaba la sesión en `sessionStorage` como
  `cvitae_recruiter_session`.
- El análisis masivo buscaba otra clave en `localStorage`, por lo que redirigía
  incorrectamente a `/empresas`.
- El lote no enviaba el token al análisis ni al resumen comparativo.
- La comparación histórica no restringía los IDs al propietario del token.
- El guardado podía presentarse como exitoso aunque Supabase fallara.
- El descuento de créditos no estaba protegido frente a escrituras
  concurrentes.

## Correcciones preparadas

- ID oficial de Haiku 4.5 corregido en ambas Functions.
- Sesión empresarial unificada en `sessionStorage`.
- Token obligatorio y validado para análisis y comparaciones empresariales.
- Comparaciones históricas filtradas por `token_id`.
- Análisis de IA del lote en paralelo y guardado secuencial.
- Reserva optimista de crédito antes del insert; si el insert falla, se
  repone el crédito.
- Errores HTTP comprobados antes de mostrar éxito.

## Dependencias y vulnerabilidades

Situación inicial:

- `jspdf 2.5.x`: vulnerabilidades críticas, altas y moderadas.
- `@anthropic-ai/sdk 0.80.x`: dos vulnerabilidades moderadas.

Resolución:

- `@anthropic-ai/sdk` eliminado porque no era utilizado. CVitae invoca Bedrock
  mediante `@aws-sdk/client-bedrock-runtime`.
- `jspdf` actualizado a `4.2.1`.
- El lector antiguo `pdf-parse 1.1.4` fue reemplazado por
  `pdfjs-dist 5.4.296`; el parser anterior no podía leer algunos PDFs modernos
  generados por jsPDF 4.
- Tanto el analizador como `submit-lead` usan la extracción compartida de
  `netlify/functions/lib/pdf.ts`, para conservar el texto en postulaciones.
- `pnpm-lock.yaml` sincronizado porque Netlify usa pnpm.
- `npm audit --omit=dev`: cero vulnerabilidades.

## Comandos de verificación

```powershell
pnpm install
pnpm run test:critical
npm run build
npx netlify functions:build --src netlify/functions
npm audit --omit=dev
```

El build de Functions genera `.zip` y `manifest.json` dentro de
`netlify/functions`; son artefactos locales y no deben incluirse en commits.

## Prueba posterior al despliegue

1. Subir un PDF con texto a la home y ejecutar el analizador.
2. Confirmar score, fortalezas, mejoras y recomendación.
3. Entrar a `/empresas` con un token real.
4. Abrir `/empresas/masivo` y confirmar que conserva la sesión.
5. Analizar dos CV ficticios y comprobar el descuento de dos créditos.
6. Confirmar que ambos aparecen en Historial.
7. Crear una vacante de prueba, abrir su URL y enviar una postulación ficticia.
8. Confirmar que solo la empresa propietaria ve el postulante.
9. Revisar el administrador y el reporte de scrapers.

No colocar tokens, contraseñas, claves de AWS, `service_role` ni datos reales de
candidatos en este documento o en issues.

## Riesgos y pendientes

- El repositorio no tiene `tsconfig.json`; Vite transpila el frontend y Netlify
  empaqueta las Functions, pero falta un typecheck global reproducible.
- La limitación del analizador público está en memoria y no es un rate limit
  distribuido. Es suficiente para lanzamiento, no para abuso sostenido.
- Las pruebas autenticadas completas requieren un token empresarial real y
  deben ejecutarse sin compartirlo por chat.
- `emailjs-com` y Recharts 2 están obsoletos, pero no presentan vulnerabilidades
  reportadas por npm. Su migración debe hacerse por separado.
