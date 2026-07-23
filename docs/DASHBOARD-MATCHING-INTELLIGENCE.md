# Dashboard de inteligencia profesional

## Objetivo

Este cambio corrige el flujo del dashboard:

1. Lee el perfil autenticado.
2. Recupera oportunidades activas de los scrapers.
3. Calcula un ranking híbrido.
4. Prioriza habilidades faltantes.
5. Recomienda formación con Gemini.
6. Conserva el resultado en caché al navegar entre pantallas.

No se agregó ninguna tabla ni migración SQL.

## Problemas encontrados

- `match-batch` no estaba versionada en el repositorio.
- El embedding del perfil podía reutilizarse indefinidamente aunque el perfil
  hubiera cambiado.
- La búsqueda vectorial podía devolver datos parciales de las oportunidades.
- El análisis dependía demasiado de `tags`, aunque muchos scrapers entregan
  etiquetas vacías, genéricas o inconsistentes.
- La comparación exacta no entendía variantes como `Node`, `Node.js` y
  `NodeJS`.
- El dashboard ocultaba los errores y mostraba un estado vacío.
- Las brechas dependían de que ya existieran matches en el frontend.
- Los datos del perfil llegaban tarde a la llamada de cursos.
- Gemini utilizaba `gemini-2.0-flash-exp`, un modelo retirado.
- Cada montaje del dashboard repetía matching, embeddings y Gemini.

## Ranking híbrido

La Edge Function `match-batch` combina:

- Similitud semántica cuando el RPC vectorial está disponible.
- Cobertura de habilidades.
- Coincidencia entre título profesional, rubro y título de la oportunidad.
- Compatibilidad de seniority.
- Compatibilidad de ubicación y modalidad.
- Bonificación pequeña y explícita según la ruta profesional.

El ranking sigue funcionando si la búsqueda vectorial o el diccionario de
habilidades falla. Las oportunidades siempre se leen completas desde
`opportunities`; el resultado vectorial solamente aporta similitud.

Las habilidades se extraen desde:

- `tags` normalizados.
- Diccionario `skill_dictionary`.
- Un conjunto base de tecnologías y habilidades frecuentes.
- Título, rubro, tipo y descripción de la oportunidad.

## Brechas

Las brechas se calculan en el servidor con las diez oportunidades mejor
posicionadas. Se priorizan por frecuencia y por posición en el ranking.

La respuesta conserva los campos anteriores y agrega:

- `missingSkills`.
- `matchedSkills` y `missingSkills` por oportunidad.
- `titleScore`.
- `semanticScore`.
- `meta.activeOpportunities`.
- `meta.vectorCandidates`.
- `meta.generatedAt`.

## Cursos y Gemini

`gemini-courses` ahora:

- Exige una sesión válida.
- Usa `gemini-3.5-flash-lite`.
- Solicita salida JSON estructurada.
- Valida longitudes, plataformas y habilidades.
- Genera internamente URLs de búsqueda seguras.
- No acepta enlaces inventados por el modelo.
- Devuelve recomendaciones determinísticas si Gemini o la API key fallan.

Por eso la sección de cursos ya no debe quedar vacía por una caída del modelo.

## Caché

El dashboard usa `sessionStorage`, separado por usuario.

- Duración: 30 minutos.
- Se invalida si cambia título, habilidades, seniority, ubicación, ruta
  profesional o `updated_at`.
- Cambiar de pantalla y volver no repite el matching ni Gemini.
- El botón `Actualizar análisis` fuerza un cálculo nuevo.
- Al cerrar la pestaña se elimina naturalmente el caché.

No se almacenan tokens ni secretos en el caché.

## Archivos principales

- `supabase/functions/match-batch/index.ts`
- `netlify/functions/gemini-courses.ts`
- `src/hub/Dashboard.tsx`

## Despliegue

Edge Function:

```powershell
npx supabase functions deploy match-batch --project-ref rbrirxbjbmdxflzaxxzp --use-api
```

Frontend y función de Gemini:

```powershell
npm run build
```

Netlify los publica al fusionar la rama configurada como producción.

## Variables

En Netlify debe existir:

- `GEMINI_API_KEY`
- `SUPABASE_URL`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

No se debe colocar `GEMINI_API_KEY` en una variable pública `VITE_*`.

## Verificación manual

1. Iniciar sesión en `https://cvitae.lat/mi-carrera`.
2. Presionar `Actualizar análisis`.
3. Confirmar que aparezcan oportunidades.
4. Confirmar que aparezcan habilidades faltantes.
5. Confirmar que aparezcan cursos.
6. Entrar a otra pantalla y volver.
7. Confirmar que el contenido aparezca inmediatamente sin un nuevo loader.
8. Modificar una habilidad del perfil y volver al dashboard.
9. Confirmar que el caché se invalide y el ranking se calcule nuevamente.

## Estado de despliegue

- `match-batch` versión 10 fue desplegada y quedó `ACTIVE`.
- La protección JWT fue comprobada: una llamada sin autorización responde
  `401`.
- El frontend y `gemini-courses` deben pasar por Deploy Preview antes de
  fusionarse a producción.
