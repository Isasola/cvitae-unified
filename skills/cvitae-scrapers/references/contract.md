# Contrato de oportunidades CVitae

## Campos mínimos

- `title`: cargo u oportunidad concreta.
- `organization`: entidad verificable o marcada para revisión.
- `application_url`: URL HTTPS directa y funcional.
- `source`: identificador estable registrado en políticas.
- `opportunity_type`: uno de `job`, `internship`, `consultancy`, `scholarship`, `fellowship`, `grant`, `seed_capital`, `accelerator`, `incubator`, `startup_competition`, `research_funding`, `training`, `exchange_program`, `volunteering` o `tender`.
- `location` y `country_code`: coherentes; remoto debe explicitar alcance.
- `eligible_countries`/`eligible_regions`: demostrar elegibilidad; “internacional” por sí solo no alcanza.
- `source_authority`: `original`, `aggregator` o `discovery`; Tier B/C exige `original_source_url` verificada antes de distribuir.
- Fecha de cierre o publicación cuando exista.

## Filtros de ingreso

Rechazar o revisar si falta título/URL, está vencida, es contenido editorial, proviene de país no permitido, duplica otra oportunidad, contiene redirecciones dudosas o no permite verificar postulación.

## Estados

- `pending`/`in_review`: almacenado sin distribución.
- `verified`: puede habilitar funciones según flags.
- `quarantined`: fuente o registro sospechoso.
- `rejected`: no cumple y se conserva para auditoría.
- eliminación solicitada: pendiente y oculto hasta corregir o confirmar borrado lógico.

## Métricas mínimas

Registrar encontrados, válidos, insertados, actualizados, duplicados, descartados por país/vigencia/datos, duración, error y última ejecución. Mostrar datos reales, no estimaciones.
