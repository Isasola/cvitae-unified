# Revisión progresiva de postulaciones B2B

## Qué resuelve

El enlace de una vacante continúa recibiendo postulaciones sin depender de cuántos CV ya fueron analizados. El análisis empresarial trabaja sobre una cola privada y toma la siguiente tanda pendiente de hasta 30 CV.

Cada tanda usa la misma rúbrica de ajuste al puesto y legibilidad ATS. Al cerrarse:

- conserva todos los perfiles con ajuste fuerte (`fit_score >= 75`);
- conserva los diez mejores perfiles restantes de la tanda;
- vuelve a ordenar esos perfiles contra los conservados de tandas anteriores;
- mantiene como destacados a todos los perfiles fuertes, aunque sean muchos;
- deja todos los demás CV disponibles para revisión manual;
- nunca cambia por sí solo el estado humano del postulante.

El resultado es triage para entrevistas, no una decisión de contratación.

## Persistencia y privacidad

- La postulación y el PDF quedan asociados a `vacancy_applications` y a la vacante de la empresa.
- El PDF permanece en el bucket privado `candidate-cvs`.
- El panel sólo recibe una URL firmada después de validar que la vacante pertenece al token empresarial.
- Las URL firmadas vencen a los 10 minutos.
- El listado está paginado; no se trunca en 100 postulantes.

## Idempotencia, concurrencia y créditos

`claim_vacancy_review_batch` bloquea la vacante, reclama hasta 30 pendientes y reserva exactamente esos créditos dentro de la misma transacción. `FOR UPDATE SKIP LOCKED` evita que dos operaciones tomen el mismo CV.

`settle_vacancy_review_batch` persiste el resultado, recalcula el ranking y devuelve créditos por análisis fallidos. `refund_vacancy_review_batch` libera la tanda y devuelve toda la reserva si falla la operación completa. Un `operation_id` no puede generar dos débitos.

## Criterio humano

`progressive_shortlist`, `triage_tier` y `selection_reason` sólo ordenan la revisión. El único campo que representa la decisión empresarial es `recruiter_action`, y estas funciones no lo modifican. La empresa debe revisar evidencia, entrevistar y registrar su decisión.

## Activación final

1. Aplicar `202608130012_progressive_vacancy_review.sql` antes de desplegar las funciones y el frontend relacionados.
2. Ejecutar `scripts/verify-progressive-vacancy-review-database.sql` contra staging.
3. Probar una vacante de staging con 65 PDFs: deben procesarse 30, 30 y 5.
4. Repetir el mismo `operation_id`: no debe cambiar el saldo ni duplicar el análisis.
5. Abrir dos solicitudes simultáneas: cada candidato debe pertenecer a una sola tanda.
6. Confirmar que candidatos fuertes de las tres tandas aparecen destacados y que ninguno cambia a descartado automáticamente.
7. Revisar descarga del PDF con una empresa propietaria y con otra no propietaria.
