# Activación segura de AdSense en CVitae

El código deja inventario preparado, pero `VITE_GOOGLE_ADSENSE_READY=false` impide cargar AdSense hasta completar este protocolo.

## Ubicaciones permitidas

- Una unidad al final del catálogo público de empleos.
- Una unidad al final del catálogo público de becas y programas.
- Una unidad después del contenido y las acciones del artículo de blog.

No habilitar anuncios dentro de Mi Carrera, perfil, matching, CV, ATS, reescritura, aprendizaje, postulaciones, configuración ni páginas B2B.

## Activación manual, en orden

1. Conseguir la aprobación del dominio `cvitae.lat` en Google AdSense.
2. En AdSense → Privacidad y mensajes, configurar la CMP certificada de Google y el mensaje aplicable al EEE, Reino Unido y Suiza. El aviso propio de CVitae no reemplaza este requisito TCF.
3. Crear tres unidades display responsivas: empleos, oportunidades y blog.
4. Copiar en Netlify `VITE_GOOGLE_ADSENSE_CLIENT` y los tres identificadores `VITE_ADSENSE_SLOT_*`.
5. Publicar en `/ads.txt` exactamente la línea entregada por la cuenta de AdSense; no inventar el publisher ID.
6. Confirmar que `VITE_ADSENSE_PREVIEW=false`.
7. Cambiar `VITE_GOOGLE_ADSENSE_READY=true` y desplegar una vista previa de Netlify.
8. En un navegador limpio, verificar que Analytics y AdSense no se solicitan antes del consentimiento.
9. Rechazar opcionales y confirmar que perfil, CV, matching y postulaciones siguen funcionando.
10. Aceptar publicidad y comprobar una sola unidad por página pública, correctamente marcada y separada de navegación o botones.

## Criterio de salida

- CMP certificada activa donde Google la exige.
- Ninguna petición publicitaria previa al consentimiento correspondiente.
- Cero anuncios en flujos privados o B2B.
- Una unidad como máximo en cada página pública habilitada.
- `ads.txt` reconocido por AdSense.
