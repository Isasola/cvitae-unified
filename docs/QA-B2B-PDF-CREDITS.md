# QA reproducible de B2B, PDFs y créditos

Este protocolo usa únicamente CVs ficticios. No ejecutar contra producción hasta aplicar la migración del ledger en staging y crear una empresa de prueba verificada con saldo controlado.

## Preparación

```powershell
npm.cmd run qa:b2b-fixtures
npm.cmd run test:critical
```

Los archivos se generan en `tmp/b2b-pdf-fixtures/`. El lote `cv-01` a `cv-30` contiene información inventada; los cuatro archivos `caso-*` cubren errores de lectura, formato y tamaño.

## Matriz de salida

| ID | Escenario | Resultado obligatorio |
|---|---|---|
| B2B-01 | 2 PDFs válidos, saldo exacto 2 | 2 resultados guardados, saldo 0, 2 débitos |
| B2B-02 | 30 PDFs válidos, saldo 30 | máximo 3 análisis concurrentes, 30 resultados, saldo 0 |
| B2B-03 | 31 PDFs | el frontend bloquea el lote antes de analizar |
| B2B-04 | saldo menor al tamaño del lote | no inicia ningún análisis ni crea débitos |
| B2B-05 | mismo archivo seleccionado dos veces | el duplicado no se agrega |
| B2B-06 | PDF sin texto suficiente | ese archivo falla y no consume crédito |
| B2B-07 | PDF corrupto | ese archivo falla y no consume crédito |
| B2B-08 | `.doc` o tipo no admitido | rechazo antes de enviar al backend |
| B2B-09 | archivo mayor a 4 MB | rechazo antes de enviar al backend y respuesta 413 si se manipula el request |
| B2B-10 | mismo `operation_id` reenviado tras éxito | mismo resultado, un análisis, un débito |
| B2B-11 | dos requests simultáneos con el mismo `operation_id` | una reserva; el segundo ve operación en curso o resultado final |
| B2B-12 | dos requests distintos con un solo crédito | solo uno reserva; saldo nunca negativo |
| B2B-13 | Bedrock falla después de reservar | operación `refunded`, débito + reembolso, saldo original |
| B2B-14 | persistencia falla después de Bedrock | operación auditable y reembolso; no queda análisis huérfano |
| B2B-15 | resumen comparativo falla | se conservan resultados individuales y ranking local |
| B2B-16 | un CV falla dentro de un lote | se muestran éxitos y fallo por archivo; no se ocultan resultados parciales |
| B2B-17 | refresh o cierre durante operación | el `operation_id` permite conocer si está reservada, completada o reembolsada |
| B2B-18 | saldo mostrado después del lote | coincide con el servidor y se actualiza en la sesión del navegador |
| B2B-19 | lote por vacante reenviado con el mismo `operation_id` | un lote, un conjunto de débitos y el mismo resultado |
| B2B-20 | 10 CVs reservados y 3 fallan al guardar | 7 cobrados, 3 reembolsados en una liquidación atómica |
| B2B-21 | cliente antiguo intenta `save_analysis` | respuesta 410; no altera saldo ni crea análisis fuera del ledger |

## Alertas B2C de match muy alto

- El plan Pro (`is_subscribed`) y el consentimiento de correo (`match_alerts_enabled`) son campos separados.
- El umbral inicial es 85 y puede configurarse por perfil entre 70 y 99.
- La clave única `user_id + opportunity_id` impide repetir una oportunidad al mismo participante.
- Cada correo usa también `Idempotency-Key` en Resend y deja estado `pending/processing/sent/failed/suppressed`, intentos, error e ID del proveedor.
- Sólo entran oportunidades activas, verificadas, `alerts_eligible`, no archivadas y no eliminadas.

## Reconciliación

Para cada empresa y período:

```text
saldo final = saldo inicial + créditos + reembolsos + ajustes - débitos
```

No aprobar la salida si existe una operación `reserved` antigua, un análisis sin operación, un débito sin operación o una diferencia entre el saldo y el ledger. Una operación cuyo proveedor pudo responder pero cuyo estado no se pudo confirmar debe pasar a revisión; no se debe repetir automáticamente con otro identificador.

## Criterio de salida

- 0 saldos negativos.
- 0 débitos duplicados por `operation_id`.
- 0 créditos consumidos por PDFs que fallan antes de producir y guardar un resultado.
- 100 % de B2B-01 a B2B-21 con evidencia en staging.
- Logs suficientes para reconstruir `recruiter_token_id`, `operation_id`, estado, saldo anterior/posterior y error, sin registrar el CV completo.
