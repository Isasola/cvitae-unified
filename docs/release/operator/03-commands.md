# Operator commands — review only; none were run

Estos comandos no son una autorización. Ejecutarlos sólo después de la revisión y la autorización nueva del usuario. Confirmar un commit aprobado antes de verificar/pushear; el checkout actual está dirty y no tiene commit de release.

1. Inspección local del diff:

   ```powershell
   git status --short --branch
   git diff --check
   git diff --stat
   git diff -- . ':!generated/public-seo-inventory.json' ':!generated/source-distribution-policy-snapshot.json'
   ```

2. Tras el commit que el usuario haya aprobado, confirmar el remoto y fast-forward:

   ```powershell
   git fetch origin feature/aws-migration
   git rev-parse HEAD
   git rev-parse FETCH_HEAD
   git merge-base --is-ancestor FETCH_HEAD HEAD
   ```

   Si falla `merge-base`, detenerse; no rebasear, resetear ni forzar sin nueva decisión.

3. Un único push, sólo después de confirmación explícita:

   ```powershell
   git push origin HEAD:refs/heads/feature/aws-migration
   ```

4. Confirmar el despliegue únicamente tras confirmar que `feature/aws-migration` está enlazada al deploy branch en Netlify. No usar `netlify deploy` por cada lote.

5. Antes de las migraciones, ejecutar el SQL READ ONLY en `01_READ_ONLY_PREFLIGHT.sql`. Revisar y aplicar únicamente, en este orden y con aprobación separada, `supabase/migrations/202610140001_paraguayconcursa_source_operation.sql` y luego `supabase/migrations/202610140002_explicit_seo_permission_universe.sql`. No usar un `supabase migration up` genérico mientras existan migrations ajenas/R3 pendientes. El rollback 140002 aborta de forma segura si encuentra filas reconciliadas o denegaciones oficiales; no garantiza reversión de datos.

6. No hacer canario hasta confirmar permiso/acceso, control `collection_enabled=false`, budgets y source identity. El canario debe ser por una sola fuente y un presupuesto pequeño; revisar receipts, `opportunities`, lineage/observations y Universe por lectura antes de habilitar una fuente recurrente.

7. Las variables `CVITAE_LATAM_SCRAPERS_ENABLED` y `CVITAE_LATAM_PARAGUAYCONCURSA_CERTIFIED` no deben habilitarse en conjunto hasta la aprobación de fuente y canario. Nunca activar `CVITAE_PROD_RELEASE_VALIDATED` para liberar sólo LATAM. `CVITAE_BLOG_DRAFTS_ENABLED` es independiente y sólo permite borradores pendientes de aprobación.
