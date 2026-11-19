# CVitae Admin — brief operativo

El `Brief del día` no es un tablero de vanidad. Su objetivo es contestar, en este orden:

1. qué requiere una decisión;
2. qué automatización falló realmente;
3. qué ingresó y qué fue verificado;
4. cómo crecen usuarios y catálogo;
5. qué tráfico y búsquedas están produciendo resultados.

## Semántica de scrapers

- **Crítico:** el proceso falló o excedió el tiempo máximo.
- **Todo rechazado:** encontró registros, pero ninguno superó la política de ingreso.
- **Revisar:** terminó con errores parciales o advertencias.
- **Sin novedades:** ejecutó correctamente, pero no encontró resultados o todo lo encontrado ya existía.
- **Sin métrica:** el script ejecutó, pero todavía no emite contadores estructurados.
- **OK:** insertó o actualizó información sin errores detectados.

La fecha de `último aporte` de una fuente no representa la salud del scraper. Una fuente oficial puede no publicar nada durante semanas y continuar funcionando correctamente. La salud técnica se obtiene exclusivamente de `scraper_runs`.

Los contadores de hoy usan `America/Asuncion`. No se debe reemplazar esa zona IANA por un offset UTC fijo.

## Google Analytics y Search Console

Variables privadas requeridas en Netlify:

```text
GA4_PROPERTY_ID
SEARCH_CONSOLE_SITE_URL=sc-domain:cvitae.lat
GOOGLE_SERVICE_ACCOUNT_JSON
```

Procedimiento manual:

1. Crear o seleccionar una cuenta de servicio en Google Cloud.
2. Habilitar Google Analytics Data API y Search Console API.
3. Añadir el `client_email` como lector de la propiedad GA4.
4. Añadir el mismo correo como usuario de la propiedad Search Console.
5. Guardar el JSON completo como variable privada; nunca usar una variable `VITE_*`.
6. Desplegar y abrir `Admin → Brief del día → Actualizar brief`.
7. Confirmar que GA4 y Search Console figuren como configurados y que no haya errores OAuth.

El informe compara los 28 días cerrados más recientes contra los 28 anteriores. Search Console usa datos finalizados y puede omitir días sin datos. Las consultas y páginas superiores son muestras priorizadas por clics, no una exportación completa.

## Privacidad y acceso

- Todas las lecturas pasan por `admin-data`, protegido por `ADMIN_PASSWORD`.
- Las tablas de telemetría y reportes permanecen cerradas para `anon` y `authenticated`.
- La cuenta de servicio de Google sólo necesita permisos de lectura.
- El navegador nunca recibe claves privadas ni `service_role`.

## Verificación posterior al despliegue

1. Aplicar `202608130011_admin_operations_brief.sql`.
2. Abrir el brief y comprobar que la serie contiene 14 días calendario.
3. Comparar `usuarios hoy` con una consulta directa excluyendo `is_test=true`.
4. Ejecutar un scraper controlado con cero resultados y comprobar que aparece como `sin novedades`, no como fallo.
5. Ejecutar o inspeccionar una ejecución fallida y comprobar que aparece primero como crítica.
6. Confirmar que `nuevas hoy` coincide con oportunidades creadas desde medianoche de Paraguay.
7. Verificar que un error de Google se muestre como error y no como métrica cero.
8. Confirmar que los enlaces de GitHub Actions sólo aparecen dentro del Admin.

## Frecuencia y costes

- El informe de Google se conserva en memoria durante cinco minutos cuando funciona y un minuto cuando contiene errores.
- Cambiar de pestaña no vuelve a cargar todo el Admin.
- `Actualizar brief` refresca de forma conjunta base, Google, scrapers, colas y reportes.
