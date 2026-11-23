# CVitae B2B — Manual del sistema

Fecha: 2026-11-23  
Sesión: B2B Reingeniería completa

---

## Arquitectura general

CVitae tiene dos lados:

| Lado | Entrada | Propósito |
|------|---------|-----------|
| B2C (candidatos) | Registro con Supabase Auth | CV, matching, alertas, oportunidades |
| B2B (empresas) | Token manual `REC-XXXXX-2026` | Vacantes, análisis masivo, banco, legajos |

Los dos lados **NO comparten auth**. Un recruiter nunca ve datos de otro. El aislamiento es por `token_id` (UUID de `recruiter_tokens`).

---

## Tabla central: `recruiter_tokens`

Columnas clave:
- `id` UUID PK
- `access_token` TEXT — código `REC-XXXXXX-2026`, único, emitido manualmente por admin
- `email`, `company_name` — datos básicos
- `token_balance` INT — créditos disponibles
- `plan`, `plan_type`, `plan_expires_at` — datos comerciales
- `ruc`, `contact_name`, `contact_phone`, `beta_discount`, `notes` — datos comerciales
- `is_active`, `verification_status` — control de acceso
- `last_used_at` — trazabilidad

**Regla**: 1 crédito = 1 CV analizado. Los créditos se descuentan en `analyze-cv-candidate`. La función `validate-recruiter-token` solo los Lee; no los modifica directamente.

---

## Flujo de acceso B2B

```
Empresa interesada
  → Formulario en cvitae.lat/#empresas-contacto (submit-b2b-lead)
  → Admin recibe email con resumen + features de CVitae
  → Admin crea token con generate-token (incluye ruc, plan, créditos, beta_discount)
  → Token enviado por WhatsApp/email a empresa
  → Empresa entra con token en cvitae.lat/empresas
```

**Admin**: accede por `/admin` con contraseña ADMIN_PASSWORD. Puede:
- Ver todos los tokens con alertas `creditos_bajos`, `plan_por_vencer`, `plan_vencido`
- `recharge_credits(token_id, amount)` — suma créditos
- `update_token(token_id, {plan, notes, ...})` — actualiza datos

---

## Función: submit-b2b-lead

**Ruta**: `POST /.netlify/functions/submit-b2b-lead`

**Campos**:
- `name`, `email`, `company` — requeridos
- `phone`, `country`, `processes_per_month` — opcionales, van al email y a `notes`
- `message` — opcional

**Comportamiento**:
1. Guarda en `b2b_prospects` (upsert por `contact_email`)
2. Envía email a `contacto@cvitae.lat` con subject: `[Lead B2B] NombreEmpresa — País — X procesos/mes`
3. Email incluye resumen de features de CVitae B2B

---

## Función: generate-token

**Ruta**: `POST /.netlify/functions/generate-token`

**Autenticación**: campo `password` = `ADMIN_PASSWORD`

**Campos nuevos** (Nov-2026):
- `ruc`, `contact_name`, `contact_phone`, `plan`, `plan_expires_at`, `beta_discount`, `notes`

**Formato del token**: `REC-XXXXXX-YYYY` (6 chars random + año)

---

## Función: validate-recruiter-token (acciones)

**Ruta**: `POST /.netlify/functions/validate-recruiter-token`

Todas las acciones requieren `{ token: "REC-...", action: "..." }`.

### Acciones existentes
| Action | Descripción |
|--------|-------------|
| *(sin action)* | Valida token, devuelve `{ valid, balance, company_name, token_id, plan, plan_expires_at }` |
| `get_history` | Historial de análisis del token |
| `toggle_star` | Marca/desmarca análisis como favorito |
| `get_applicants` | Postulantes de una vacante |
| `get_vacancies` | Vacantes del token |
| `close_vacancy` | Cierra una vacante |
| `request_credits` | Solicitud de créditos (envía email, no suma directamente) |
| `update_application_status` | Cambia estado de postulante |
| `get_dashboard_stats` | KPIs del panel |

### Acciones nuevas (Nov-2026)
| Action | Parámetros extra | Descripción |
|--------|-----------------|-------------|
| `get_candidate_bank` | `vacancy_id?` | Todos los CVs analizados del token (200 máx) |
| `search_candidate_bank` | `query` | Búsqueda ILIKE en nombre, puesto, fortalezas, brechas |
| `create_employee_file` | `employee_name*`, `employee_email`, `employee_phone`, `position`, `hire_date`, `application_id`, `notes` | Crea legajo |
| `get_employee_files` | — | Lista legajos del token |
| `update_employee_file` | `file_id*`, + campos | Actualiza legajo |
| `add_employee_document` | `file_id*`, `file_url*`, `doc_type`, `custom_label`, `file_name`, `file_size_kb`, `notes` | Adjunta documento |
| `get_employee_documents` | `file_id*` | Lista documentos de un legajo |
| `add_employee_alert` | `file_id*`, `alert_date*`, `title*`, `notes` | Crea recordatorio |
| `get_employee_alerts` | `file_id*`, `upcoming_only?` | Lista alertas de un legajo |
| `mark_alert_done` | `alert_id*` | Marca alerta como cumplida |

---

## Tablas nuevas (SQL Nov-2026)

### employee_files
Legajo de un empleado. Vinculado al token (empresa) y opcionalmente a una `vacancy_application`.

| Columna | Tipo | Notas |
|---------|------|-------|
| `id` | UUID PK | |
| `token_id` | UUID FK → recruiter_tokens | Empresa propietaria |
| `application_id` | UUID FK → vacancy_applications? | Prellenado desde postulante |
| `employee_name` | TEXT NOT NULL | |
| `position`, `hire_date` | TEXT/DATE | |
| `status` | TEXT DEFAULT 'active' | active / inactive |
| `created_at`, `updated_at` | TIMESTAMPTZ | |

### employee_documents
Documentos adjuntos al legajo. Los archivos van a Supabase Storage bucket `employee-documents` (Private).

| Columna | Tipo | Notas |
|---------|------|-------|
| `employee_file_id` | UUID FK → employee_files | |
| `doc_type` | TEXT DEFAULT 'otro' | contrato / ci / ips / mtess / otro |
| `file_url` | TEXT | URL del storage |
| `uploaded_at` | TIMESTAMPTZ | |

### employee_alerts
Recordatorios de compliance por empleado.

| Columna | Tipo | Notas |
|---------|------|-------|
| `employee_file_id` | UUID FK → employee_files | |
| `alert_date` | DATE NOT NULL | Fecha del vencimiento / recordatorio |
| `title` | TEXT NOT NULL | "IPS REI", "MTESS REOP", "Vencimiento contrato" |
| `is_done` | BOOLEAN DEFAULT FALSE | Marcar como cumplido |

---

## Columnas nuevas en recruiter_tokens (SQL Nov-2026)

```sql
ruc TEXT
contact_name TEXT
contact_phone TEXT
plan TEXT DEFAULT 'trial'
plan_expires_at TIMESTAMPTZ
beta_discount TEXT
notes TEXT
last_used_at TIMESTAMPTZ
```

---

## Reglas de costo IA

| Operación | IA | Regla |
|-----------|-----|-------|
| Análisis individual de CV | Bedrock | Siempre 1 crédito |
| Análisis masivo (batch) | Bedrock | 1 crédito por CV |
| Comparación de finalistas | Bedrock | No consume crédito adicional |
| Búsqueda en banco | SQL ILIKE | 0 créditos |
| Matching pre-vacante (banco) | SQL ILIKE | 0 créditos |
| Cross-llamado search | SQL ILIKE | 0 créditos |

---

## Panel B2B (/empresas) — Tabs

| Tab | Descripción |
|-----|-------------|
| Analizar CV | Análisis individual, drag & drop |
| Historial | Todos los análisis, estrellas, comparación |
| Vacantes | CRUD de vacantes, gestión de postulantes |
| Banco | Búsqueda cross-llamado de CVs analizados |
| Legajos | Legajos digitales de empleados |

Los KPI cards son clickeables y navegan al tab correspondiente.

---

## LandingPage — Estructura (Nov-2026)

```
Hero (B2B-first: "Contratá mejor. Más rápido. Con IA.")
B2BFeatures (6 features grid)
B2BPricing (4 planes: Trial / Starter / Pro / Scale)
B2BContactForm (formulario inline → submit-b2b-lead)
CandidatosDivider (separador claro "Para candidatos")
Analizador (demo B2C, gratis)
ComoFunciona (B2C)
RegistroBlock (B2C)
IATech (B2C)
StatsBar (B2C)
Pricing (B2C)
```

Título SEO: "CVitae | Software de RRHH con IA para Paraguay y LATAM"

---

## SEO — VacantePage

Cada vacante en `/vacante/:slug` incluye:
- `<script type="application/ld+json">` con schema `JobPosting` de Schema.org
- `title`, `description`, `hiringOrganization`, `jobLocation`, `employmentType`, `directApply: true`
- Indexable (se quitó el `noindex,nofollow` anterior)
