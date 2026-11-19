# Plan de prueba integral antes de la beta gratuita

Este plan se ejecuta después del commit candidato y en un solo deploy controlado. No habilitar cron ni publicar todas las fuentes hasta aprobar los bloques 1 a 10.

## 1. Infraestructura y migraciones

1. Confirmar backup reciente de Supabase y anotar el commit desplegado.
2. Ejecutar las migraciones pendientes en orden y comprobar que ninguna falla.
3. Confirmar las tablas y columnas nuevas de oportunidades, controles, ejecuciones, moderación y revisión de reclutadores.
4. Confirmar que los registros públicos anteriores conservan slug y URL.
5. Verificar que una oportunidad archivada, eliminada o en revisión no sea pública.

Resultado esperado: migraciones completas, datos anteriores intactos y posibilidad clara de rollback.

## 2. Centro de control del admin

6. Abrir el resumen y comparar totales del admin con consultas directas a Supabase.
7. Verificar estados separados: saludable, degradado, improductivo, roto, pausado y sin ejecutar.
8. Comprobar encontrados, válidos, únicos, insertados, actualizados, duplicados, rechazados, duración y último error.
9. Cambiar un scraper de pausado a recolección habilitada y revertirlo.
10. Probar límites por ejecución, países permitidos, revisión obligatoria y autopausa.
11. Confirmar que ningún toggle publica registros pendientes de revisión.

Resultado esperado: el admin muestra datos reales y cada control puede aplicarse y revertirse.

## 3. Moderación de oportunidades

12. Insertar una oportunidad de prueba Tier A en revisión.
13. Editar título, organización, ubicación, tipo, URL y nota de revisión.
14. Aprobar sólo catálogo; comprobar que matching, alertas y SEO permanezcan apagados.
15. Habilitar después matching, alertas y SEO por separado.
16. Intentar aprobar una Tier B sin fuente original verificada; debe bloquearse.
17. Verificar su fuente original y aprobarla.
18. Solicitar eliminación: debe ocultarse y quedar pendiente, no borrarse físicamente.
19. Restaurarla, archivarla y restaurarla nuevamente.
20. Aprobar el borrado lógico y confirmar que conserva auditoría.

Resultado esperado: ninguna oportunidad sucia se publica y todas las acciones son reversibles o auditables.

## 4. Scrapers prioritarios

21. Ejecutar MEF/INAPP con límite bajo y revisión obligatoria.
22. Comparar manualmente una muestra con título, oferente, financiación, modalidad, elegibilidad, deadline y URL oficial.
23. Ejecutar FIUNA con límite bajo y revisión obligatoria.
24. Comprobar antigüedad, empresa, contacto y vigencia de una muestra.
25. Confirmar que FIUNA no se autoaprueba por ser intermediaria.
26. Forzar una ejecución fallida de prueba y comprobar telemetría y autopausa sin detener los demás scrapers.
27. Ejecutar un scraper con cero resultados legítimos y distinguirlo de una falla técnica.

Resultado esperado: métricas completas, cero autopublicación y causas de descarte entendibles.

## 5. Catálogos públicos

28. Abrir `/empleos`: sólo debe mostrar jobs, internships y consultorías vigentes verificadas.
29. Abrir `/oportunidades`: sólo debe mostrar becas, financiación, programas y experiencias vigentes verificadas.
30. Probar búsqueda, filtros, estados vacíos y navegación al detalle.
31. Confirmar que una oportunidad archivada, vencida, eliminada o pendiente devuelve estado no disponible.
32. Abrir enlaces de postulación y comprobar que conducen al destino correcto.
33. Probar ambos catálogos en móvil, tablet y escritorio.

Resultado esperado: categorías limpias, detalles correctos y ninguna URL rota o registro oculto expuesto.

## 6. B2C y matching

34. Registrar un usuario nuevo y completar la guía inicial.
35. Crear perfil con habilidades, ubicación, seniority e intereses.
36. Subir un PDF válido, uno inválido y uno escaneado.
37. Generar CV Vivo y comprobar edición, persistencia y descarga.
38. Ejecutar matching y verificar slug, orden, explicación, habilidades coincidentes y faltantes.
39. Confirmar que no recomienda vencidas, archivadas, eliminadas, licitaciones ni oportunidades sin permiso de matching.
40. Cambiar el perfil y comprobar que las recomendaciones cambian coherentemente.
41. Verificar alertas y preferencias; desactivar una categoría y comprobar que se respeta.

Resultado esperado: recomendaciones explicables y relevantes, sin oportunidades inelegibles.

## 7. B2B

42. Solicitar verificación como empresa nueva y comprobar que queda pendiente.
43. Intentar usar funciones protegidas antes de aprobarla; debe bloquearse.
44. Aprobarla desde admin y validar el código de acceso.
45. Crear una vacante con requisitos y preguntas de prefiltro.
46. Abrir su link público y postular como candidato con CV y respuestas.
47. Confirmar consentimiento, almacenamiento y asociación a la vacante correcta.
48. Analizar candidatos en masa y revisar ranking, evidencia y explicación.
49. Comparar candidatos y confirmar que no inventa datos ausentes.
50. Probar búsqueda, filtros, shortlist, rechazo y reversión donde corresponda.
51. Revocar acceso de empresa y confirmar bloqueo inmediato.

Resultado esperado: aislamiento por reclutador, autorización estricta y decisiones asistidas pero auditables.

## 8. IA, límites y resiliencia

52. Confirmar los modelos Bedrock configurados; no debe quedar referencia a Claude Opus 4.1.
53. Probar respuestas válidas, timeout, cuota agotada y respuesta malformada.
54. Verificar mensaje útil al usuario y que no se expongan secretos ni prompts internos.
55. Comprobar límite gratuito por usuario/correo y comportamiento al alcanzar capacidad beta.
56. Confirmar que un reintento no duplica análisis, postulaciones ni consumo registrado.

Resultado esperado: degradación controlada, límites aplicados del lado servidor y ausencia de duplicados.

## 9. SEO, Analytics y contenido

57. Generar sitemap con variables reales y comprobar empleos/oportunidades verificadas con SEO habilitado.
58. Confirmar exclusión de pendientes, vencidas, archivadas y eliminadas.
59. Validar canonical, título, descripción, Open Graph y datos estructurados de una página de cada tipo.
60. Revisar robots.txt y Search Console sin errores de indexación nuevos.
61. Verificar eventos de catálogo, detalle, postulación, registro, análisis y matching en Analytics.
62. Confirmar que búsquedas y tendencias sólo generen borradores de blog sujetos a aprobación.

Resultado esperado: indexación selectiva, medición confiable y cero contenido automático sin control.

## 10. UX, accesibilidad y salida

63. Recorrer landing, registro, dashboard, CV, empleos, oportunidades, admin y B2B con teclado.
64. Comprobar foco visible, etiquetas, contraste, errores de formulario y estados de carga.
65. Revisar anchos móviles comunes y que ningún fondo decorativo interfiera con textos.
66. Medir Lighthouse móvil en landing, `/empleos` y `/oportunidades`.
67. Revisar consola del navegador y logs de funciones sin errores inesperados.
68. Ejecutar `npm.cmd run test:critical`, tests de scrapers, build y `git diff --check` sobre el commit exacto.
69. Mantener cron y fuentes nuevas pausados durante una observación inicial.
70. Registrar cada defecto con severidad, evidencia, responsable y decisión de lanzamiento.

Resultado esperado: cero defectos bloqueantes o críticos. Los defectos menores aceptados deben quedar documentados.

## Puerta final de beta

La beta gratuita puede abrirse sólo cuando:

- los 70 controles estén aprobados o exista una excepción explícita documentada;
- las fuentes activas tengan muestras verificadas y telemetría saludable;
- B2C y B2B no presenten fugas de autorización o datos;
- exista límite de capacidad y aviso claro para los primeros usuarios;
- haya monitoreo, rollback y una persona responsable de responder alertas.
