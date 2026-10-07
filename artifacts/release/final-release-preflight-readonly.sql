-- One metadata-only result. Paste once; no RPC, inventory scan or operational work.
-- Unknown/missing/unsupported catalog facts fail closed. History absence != not applied.
-- Only optional migration history is read dynamically; fixed SELECT text, guarded access.
-- PostgreSQL 15+ required by security_invoker views. pg_trgm must be in extensions.
-- Index builds in pending migrations are synchronous; authorization/IO budget still required.
WITH manifest AS (
  SELECT $manifest${
  "migrations": [
    {
      "version": "202610030001",
      "name": "pipeline_trace_contract_v2",
      "sha256": "b7b647864b6a3818f96b4103e06b99d77eb2d25118db6a1719885c9898363be7"
    },
    {
      "version": "202610030002",
      "name": "opportunity_universe_seo_permission",
      "sha256": "f4f67041c67b9f23fd86f165c8c4a7aecb929ac8e99111975fb7a8007d3c3048"
    },
    {
      "version": "202610040001",
      "name": "source_switch_wiring",
      "sha256": "3055782d986c1043697adb5b7ca70376efef94ab41d3bf9b3fd0644a82e59b0c"
    },
    {
      "version": "202610040002",
      "name": "public_catalog_coverage",
      "sha256": "865e368098e929d4cec06c3504344ef10d5f5f4e214c881fd6039f03c232772f"
    },
    {
      "version": "202610050001",
      "name": "bounded_alert_progress",
      "sha256": "abbe29082ef6eec5fd394484f2680a656c745602aa83dbcebacf0da544700de6"
    }
  ],
  "relations": [
    {
      "name": "opportunities",
      "columns": [
        {
          "name": "id",
          "type": "text",
          "provided_by": null
        },
        {
          "name": "source",
          "type": "text",
          "provided_by": null
        },
        {
          "name": "title",
          "type": "text",
          "provided_by": null
        },
        {
          "name": "organization",
          "type": "text",
          "provided_by": null
        },
        {
          "name": "location",
          "type": "text",
          "provided_by": null
        },
        {
          "name": "rubro",
          "type": "text",
          "provided_by": null
        },
        {
          "name": "opportunity_type",
          "type": "text",
          "provided_by": null
        },
        {
          "name": "opportunity_kind",
          "type": "text",
          "provided_by": null
        },
        {
          "name": "deadline",
          "type": "text",
          "provided_by": null
        },
        {
          "name": "factory_status",
          "type": "text",
          "provided_by": null
        },
        {
          "name": "content_fingerprint",
          "type": "text",
          "provided_by": null
        },
        {
          "name": "semantic_fingerprint",
          "type": "text",
          "provided_by": null
        },
        {
          "name": "embedding_model",
          "type": "text",
          "provided_by": null
        },
        {
          "name": "verification_status",
          "type": "text",
          "provided_by": null
        },
        {
          "name": "created_at",
          "type": "timestamptz",
          "provided_by": null
        },
        {
          "name": "updated_at",
          "type": "timestamptz",
          "provided_by": null
        },
        {
          "name": "deleted_at",
          "type": "timestamptz",
          "provided_by": null
        },
        {
          "name": "archived_at",
          "type": "timestamptz",
          "provided_by": null
        },
        {
          "name": "embedding",
          "type": "public.vector",
          "provided_by": null
        }
      ],
      "provided_by": null
    },
    {
      "name": "opportunity_ingestion_events",
      "columns": [
        {
          "name": "id",
          "type": "uuid",
          "provided_by": null
        },
        {
          "name": "scraper_run_id",
          "type": "uuid",
          "provided_by": null
        },
        {
          "name": "opportunity_id",
          "type": "text",
          "provided_by": null
        },
        {
          "name": "emitted_source",
          "type": "text",
          "provided_by": null
        },
        {
          "name": "canonical_source",
          "type": "text",
          "provided_by": null
        },
        {
          "name": "producer_id",
          "type": "text",
          "provided_by": null
        },
        {
          "name": "adapter_id",
          "type": "text",
          "provided_by": null
        },
        {
          "name": "cleaner_id",
          "type": "text",
          "provided_by": null
        },
        {
          "name": "normalizer_version",
          "type": "text",
          "provided_by": null
        },
        {
          "name": "run_id",
          "type": "text",
          "provided_by": null
        },
        {
          "name": "scan_request_id",
          "type": "text",
          "provided_by": null
        },
        {
          "name": "outcome",
          "type": "text",
          "provided_by": null
        },
        {
          "name": "trace_state",
          "type": "text",
          "provided_by": null
        },
        {
          "name": "reason",
          "type": "text",
          "provided_by": null
        },
        {
          "name": "normalized_fields",
          "type": "text[]",
          "provided_by": null
        },
        {
          "name": "received_at",
          "type": "timestamptz",
          "provided_by": null
        },
        {
          "name": "trace_contract_version",
          "type": "text",
          "provided_by": "202610030001"
        },
        {
          "name": "trace_reason",
          "type": "text",
          "provided_by": "202610030001"
        },
        {
          "name": "identity_factual",
          "type": "boolean",
          "provided_by": "202610030001"
        }
      ],
      "provided_by": null
    },
    {
      "name": "opportunity_source_observations",
      "columns": [
        {
          "name": "id",
          "type": "uuid",
          "provided_by": null
        },
        {
          "name": "opportunity_id",
          "type": "text",
          "provided_by": null
        },
        {
          "name": "source",
          "type": "text",
          "provided_by": null
        },
        {
          "name": "identity_status",
          "type": "text",
          "provided_by": null
        },
        {
          "name": "identity_method",
          "type": "text",
          "provided_by": null
        },
        {
          "name": "identity_reason",
          "type": "text",
          "provided_by": null
        },
        {
          "name": "run_id",
          "type": "text",
          "provided_by": null
        },
        {
          "name": "http_status",
          "type": "integer",
          "provided_by": null
        },
        {
          "name": "observed_at",
          "type": "timestamptz",
          "provided_by": null
        },
        {
          "name": "evidence",
          "type": "jsonb",
          "provided_by": null
        }
      ],
      "provided_by": null
    },
    {
      "name": "opportunity_factory_snapshots",
      "columns": [
        {
          "name": "opportunity_id",
          "type": "text",
          "provided_by": null
        },
        {
          "name": "status",
          "type": "text",
          "provided_by": null
        },
        {
          "name": "pipeline_version",
          "type": "text",
          "provided_by": null
        },
        {
          "name": "rules_version",
          "type": "text",
          "provided_by": null
        },
        {
          "name": "content_fingerprint",
          "type": "text",
          "provided_by": null
        },
        {
          "name": "semantic_fingerprint",
          "type": "text",
          "provided_by": null
        },
        {
          "name": "embedding_status",
          "type": "text",
          "provided_by": null
        },
        {
          "name": "embedding_model",
          "type": "text",
          "provided_by": null
        },
        {
          "name": "stamps",
          "type": "jsonb",
          "provided_by": null
        },
        {
          "name": "evidence",
          "type": "jsonb",
          "provided_by": null
        },
        {
          "name": "checked_at",
          "type": "timestamptz",
          "provided_by": null
        }
      ],
      "provided_by": null
    },
    {
      "name": "opportunity_universe_state",
      "columns": [
        {
          "name": "opportunity_id",
          "type": "text",
          "provided_by": null
        },
        {
          "name": "lifecycle_state",
          "type": "text",
          "provided_by": null
        },
        {
          "name": "lifecycle_reason",
          "type": "text",
          "provided_by": null
        },
        {
          "name": "catalog_row_state",
          "type": "text",
          "provided_by": null
        },
        {
          "name": "catalog_state",
          "type": "text",
          "provided_by": null
        },
        {
          "name": "matching_row_state",
          "type": "text",
          "provided_by": null
        },
        {
          "name": "matching_row_reason",
          "type": "text",
          "provided_by": null
        },
        {
          "name": "source_matching_state",
          "type": "text",
          "provided_by": null
        },
        {
          "name": "source_matching_reason",
          "type": "text",
          "provided_by": null
        },
        {
          "name": "source_matching_operational_state",
          "type": "text",
          "provided_by": null
        },
        {
          "name": "source_matching_operational_reason",
          "type": "text",
          "provided_by": null
        },
        {
          "name": "source_operational_state",
          "type": "text",
          "provided_by": null
        },
        {
          "name": "source_operational_reason",
          "type": "text",
          "provided_by": null
        },
        {
          "name": "final_matching_state",
          "type": "text",
          "provided_by": null
        },
        {
          "name": "alerts_row_state",
          "type": "text",
          "provided_by": null
        },
        {
          "name": "alerts_state",
          "type": "text",
          "provided_by": null
        },
        {
          "name": "seo_row_state",
          "type": "text",
          "provided_by": null
        },
        {
          "name": "seo_row_reason",
          "type": "text",
          "provided_by": null
        },
        {
          "name": "seo_effective_reason",
          "type": "text",
          "provided_by": null
        },
        {
          "name": "seo_state",
          "type": "text",
          "provided_by": null
        },
        {
          "name": "unresolved_dimensions",
          "type": "text[]",
          "provided_by": null
        },
        {
          "name": "source_permission_unknown_dimensions",
          "type": "text[]",
          "provided_by": null
        },
        {
          "name": "provenance",
          "type": "jsonb",
          "provided_by": null
        },
        {
          "name": "evaluated_at",
          "type": "timestamptz",
          "provided_by": null
        },
        {
          "name": "next_lifecycle_check_at",
          "type": "timestamptz",
          "provided_by": "202610040001"
        }
      ],
      "provided_by": null
    },
    {
      "name": "opportunity_source_consumer_permissions",
      "columns": [
        {
          "name": "canonical_source",
          "type": "text",
          "provided_by": null
        },
        {
          "name": "consumer",
          "type": "text",
          "provided_by": null
        },
        {
          "name": "permission_state",
          "type": "text",
          "provided_by": null
        },
        {
          "name": "reason",
          "type": "text",
          "provided_by": null
        },
        {
          "name": "provenance",
          "type": "text",
          "provided_by": null
        },
        {
          "name": "evidence_type",
          "type": "text",
          "provided_by": null
        },
        {
          "name": "evidence_reference",
          "type": "text",
          "provided_by": null
        }
      ],
      "provided_by": null
    },
    {
      "name": "opportunity_source_identity_aliases",
      "columns": [
        {
          "name": "canonical_source",
          "type": "text",
          "provided_by": null
        },
        {
          "name": "emitted_source",
          "type": "text",
          "provided_by": null
        }
      ],
      "provided_by": null
    },
    {
      "name": "opportunity_sources",
      "columns": [
        {
          "name": "source",
          "type": "text",
          "provided_by": null
        },
        {
          "name": "display_name",
          "type": "text",
          "provided_by": null
        },
        {
          "name": "trust_level",
          "type": "text",
          "provided_by": null
        },
        {
          "name": "source_tier",
          "type": "text",
          "provided_by": null
        },
        {
          "name": "notes",
          "type": "text",
          "provided_by": null
        },
        {
          "name": "updated_by",
          "type": "text",
          "provided_by": null
        },
        {
          "name": "registry_adapter_version",
          "type": "text",
          "provided_by": null
        },
        {
          "name": "registry_policy_hash",
          "type": "text",
          "provided_by": null
        },
        {
          "name": "auto_verify",
          "type": "boolean",
          "provided_by": null
        },
        {
          "name": "is_enabled",
          "type": "boolean",
          "provided_by": null
        },
        {
          "name": "catalog_enabled",
          "type": "boolean",
          "provided_by": null
        },
        {
          "name": "matching_enabled",
          "type": "boolean",
          "provided_by": null
        },
        {
          "name": "alerts_enabled",
          "type": "boolean",
          "provided_by": null
        },
        {
          "name": "seo_enabled",
          "type": "boolean",
          "provided_by": null
        },
        {
          "name": "registry_certified",
          "type": "boolean",
          "provided_by": null
        },
        {
          "name": "web_catalog_allowed",
          "type": "boolean",
          "provided_by": null
        },
        {
          "name": "search_engine_indexing_allowed",
          "type": "boolean",
          "provided_by": null
        },
        {
          "name": "google_jobs_distribution_allowed",
          "type": "boolean",
          "provided_by": null
        },
        {
          "name": "third_party_job_distribution_allowed",
          "type": "boolean",
          "provided_by": null
        },
        {
          "name": "source_attribution_required",
          "type": "boolean",
          "provided_by": null
        },
        {
          "name": "allowed_country_codes",
          "type": "text[]",
          "provided_by": null
        },
        {
          "name": "allowed_opportunity_types",
          "type": "text[]",
          "provided_by": null
        },
        {
          "name": "max_items_per_day",
          "type": "integer",
          "provided_by": null
        },
        {
          "name": "retention_days",
          "type": "integer",
          "provided_by": null
        },
        {
          "name": "verification_criteria",
          "type": "jsonb",
          "provided_by": null
        },
        {
          "name": "updated_at",
          "type": "timestamptz",
          "provided_by": null
        },
        {
          "name": "registry_synced_at",
          "type": "timestamptz",
          "provided_by": null
        }
      ],
      "provided_by": null
    },
    {
      "name": "admin_policy_events",
      "columns": [
        {
          "name": "id",
          "type": "uuid",
          "provided_by": null
        },
        {
          "name": "entity_type",
          "type": "text",
          "provided_by": null
        },
        {
          "name": "entity_key",
          "type": "text",
          "provided_by": null
        },
        {
          "name": "actor",
          "type": "text",
          "provided_by": null
        },
        {
          "name": "before_state",
          "type": "jsonb",
          "provided_by": null
        },
        {
          "name": "after_state",
          "type": "jsonb",
          "provided_by": null
        },
        {
          "name": "impacted_rows",
          "type": "integer",
          "provided_by": null
        },
        {
          "name": "created_at",
          "type": "timestamptz",
          "provided_by": null
        }
      ],
      "provided_by": null
    },
    {
      "name": "opportunity_universe_dirty_sources",
      "columns": [
        {
          "name": "canonical_source",
          "type": "text",
          "provided_by": null
        },
        {
          "name": "reason",
          "type": "text",
          "provided_by": null
        },
        {
          "name": "queued_at",
          "type": "timestamptz",
          "provided_by": null
        },
        {
          "name": "cursor_id",
          "type": "text",
          "provided_by": "202610040001"
        }
      ],
      "provided_by": null
    },
    {
      "name": "matching_retrieval_scheduler_state",
      "columns": [
        {
          "name": "singleton",
          "type": "boolean",
          "provided_by": null
        },
        {
          "name": "alert_profile_cursor",
          "type": "uuid",
          "provided_by": "202610050001"
        }
      ],
      "provided_by": null
    },
    {
      "name": "matching_retrieval_candidates",
      "columns": [
        {
          "name": "user_id",
          "type": "uuid",
          "provided_by": null
        },
        {
          "name": "opportunity_id",
          "type": "text",
          "provided_by": null
        },
        {
          "name": "candidate_class",
          "type": "text",
          "provided_by": null
        },
        {
          "name": "evaluated_at",
          "type": "timestamptz",
          "provided_by": null
        }
      ],
      "provided_by": null
    },
    {
      "name": "scraper_runs",
      "columns": [
        {
          "name": "scraper_id",
          "type": "text",
          "provided_by": null
        },
        {
          "name": "extraction_metrics",
          "type": "jsonb",
          "provided_by": null
        },
        {
          "name": "started_at",
          "type": "timestamptz",
          "provided_by": null
        },
        {
          "name": "finished_at",
          "type": "timestamptz",
          "provided_by": null
        }
      ],
      "provided_by": null
    },
    {
      "name": "opportunity_enrichment_events",
      "columns": [
        {
          "name": "opportunity_id",
          "type": "text",
          "provided_by": null
        },
        {
          "name": "created_at",
          "type": "timestamptz",
          "provided_by": null
        }
      ],
      "provided_by": null
    },
    {
      "name": "user_master_profiles",
      "columns": [
        {
          "name": "id",
          "type": "uuid",
          "provided_by": null
        },
        {
          "name": "user_id",
          "type": "uuid",
          "provided_by": null
        },
        {
          "name": "email",
          "type": "text",
          "provided_by": null
        },
        {
          "name": "full_name",
          "type": "text",
          "provided_by": null
        },
        {
          "name": "professional_title",
          "type": "text",
          "provided_by": null
        },
        {
          "name": "summary",
          "type": "text",
          "provided_by": null
        },
        {
          "name": "cv_text",
          "type": "text",
          "provided_by": null
        },
        {
          "name": "profile_data",
          "type": "jsonb",
          "provided_by": null
        },
        {
          "name": "match_alerts_enabled",
          "type": "boolean",
          "provided_by": null
        },
        {
          "name": "is_test",
          "type": "boolean",
          "provided_by": null
        },
        {
          "name": "match_alert_threshold",
          "type": null,
          "provided_by": null
        }
      ],
      "provided_by": null
    },
    {
      "name": "match_alert_scan_progress",
      "columns": [
        {
          "name": "profile_id",
          "type": "uuid",
          "provided_by": "202610050001"
        },
        {
          "name": "lease_token",
          "type": "uuid",
          "provided_by": "202610050001"
        },
        {
          "name": "checkpoint",
          "type": "jsonb",
          "provided_by": "202610050001"
        },
        {
          "name": "lease_until",
          "type": "timestamptz",
          "provided_by": "202610050001"
        },
        {
          "name": "updated_at",
          "type": "timestamptz",
          "provided_by": "202610050001"
        }
      ],
      "provided_by": "202610050001"
    }
  ],
  "functions": [
    {
      "schema": "public",
      "name": "admin_opportunity_pipeline_ledger",
      "input_names": [],
      "input_types": [],
      "result": "jsonb",
      "setof": false,
      "outputs": [],
      "defaults": 0,
      "action": "REPLACE_OR_NEW",
      "provided_by": "202610030001"
    },
    {
      "schema": "public",
      "name": "opportunity_universe_decision",
      "input_names": [
        "p_row",
        "p_observation",
        "p_source_policy",
        "p_prior_state"
      ],
      "input_types": [
        "jsonb",
        "jsonb",
        "jsonb",
        "jsonb"
      ],
      "result": "jsonb",
      "setof": false,
      "outputs": [],
      "defaults": 1,
      "action": "REPLACE_OR_NEW",
      "provided_by": "202610040001"
    },
    {
      "schema": "public",
      "name": "stored_opportunity_source_policy",
      "input_names": [
        "p_raw_source"
      ],
      "input_types": [
        "text"
      ],
      "result": "jsonb",
      "setof": false,
      "outputs": [],
      "defaults": 0,
      "action": "REPLACE_OR_NEW",
      "provided_by": "202610040001"
    },
    {
      "schema": "public",
      "name": "canonical_opportunity_source_policy",
      "input_names": [
        "p_raw_source"
      ],
      "input_types": [
        "text"
      ],
      "result": "jsonb",
      "setof": false,
      "outputs": [],
      "defaults": 0,
      "action": "REPLACE_OR_NEW",
      "provided_by": "202610040001"
    },
    {
      "schema": "public",
      "name": "admin_update_source_policy_atomic",
      "input_names": [
        "p_source",
        "p_changes",
        "p_expected_updated_at",
        "p_actor"
      ],
      "input_types": [
        "text",
        "jsonb",
        "timestamptz",
        "text"
      ],
      "result": "jsonb",
      "setof": false,
      "outputs": [],
      "defaults": 2,
      "action": "REPLACE_OR_NEW",
      "provided_by": "202610040001"
    },
    {
      "schema": "public",
      "name": "get_source_distribution_policy",
      "input_names": [],
      "input_types": [],
      "result": "record",
      "setof": true,
      "outputs": [
        {
          "name": "source",
          "type": "text"
        },
        {
          "name": "is_enabled",
          "type": "boolean"
        },
        {
          "name": "catalog_enabled",
          "type": "boolean"
        },
        {
          "name": "matching_enabled",
          "type": "boolean"
        },
        {
          "name": "alerts_enabled",
          "type": "boolean"
        },
        {
          "name": "seo_enabled",
          "type": "boolean"
        },
        {
          "name": "registry_certified",
          "type": "boolean"
        },
        {
          "name": "registry_adapter_version",
          "type": "text"
        },
        {
          "name": "registry_policy_hash",
          "type": "text"
        },
        {
          "name": "registry_synced_at",
          "type": "timestamptz"
        },
        {
          "name": "web_catalog_allowed",
          "type": "boolean"
        },
        {
          "name": "search_engine_indexing_allowed",
          "type": "boolean"
        },
        {
          "name": "google_jobs_distribution_allowed",
          "type": "boolean"
        },
        {
          "name": "third_party_job_distribution_allowed",
          "type": "boolean"
        },
        {
          "name": "source_attribution_required",
          "type": "boolean"
        },
        {
          "name": "consumer_switch_overrides",
          "type": "jsonb"
        }
      ],
      "defaults": 0,
      "action": "DROP_RECREATE",
      "provided_by": "202610040001"
    },
    {
      "schema": "public",
      "name": "opportunity_source_policy_refresh_universe",
      "input_names": [],
      "input_types": [],
      "result": "trigger",
      "setof": false,
      "outputs": [],
      "defaults": 0,
      "action": "REPLACE_OR_NEW",
      "provided_by": "202610040001"
    },
    {
      "schema": "public",
      "name": "refresh_dirty_opportunity_universe_sources",
      "input_names": [
        "p_limit"
      ],
      "input_types": [
        "integer"
      ],
      "result": "jsonb",
      "setof": false,
      "outputs": [],
      "defaults": 1,
      "action": "REPLACE_OR_NEW",
      "provided_by": "202610040001"
    },
    {
      "schema": "public",
      "name": "opportunity_permission_refresh_universe",
      "input_names": [],
      "input_types": [],
      "result": "trigger",
      "setof": false,
      "outputs": [],
      "defaults": 0,
      "action": "REPLACE_OR_NEW",
      "provided_by": "202610040001"
    },
    {
      "schema": "public",
      "name": "opportunity_universe_schedule_deadline",
      "input_names": [],
      "input_types": [],
      "result": "trigger",
      "setof": false,
      "outputs": [],
      "defaults": 0,
      "action": "REPLACE_OR_NEW",
      "provided_by": "202610040001"
    },
    {
      "schema": "public",
      "name": "refresh_due_opportunity_universe",
      "input_names": [
        "p_limit"
      ],
      "input_types": [
        "integer"
      ],
      "result": "integer",
      "setof": false,
      "outputs": [],
      "defaults": 1,
      "action": "REPLACE_OR_NEW",
      "provided_by": "202610040001"
    },
    {
      "schema": "public",
      "name": "get_opportunity_universe_row",
      "input_names": [
        "p_opportunity_id"
      ],
      "input_types": [
        "text"
      ],
      "result": "jsonb",
      "setof": false,
      "outputs": [],
      "defaults": 0,
      "action": "REPLACE_OR_NEW",
      "provided_by": "202610040001"
    },
    {
      "schema": "public",
      "name": "apply_opportunity_source_trust",
      "input_names": [],
      "input_types": [],
      "result": "trigger",
      "setof": false,
      "outputs": [],
      "defaults": 0,
      "action": "REPLACE_OR_NEW",
      "provided_by": "202610040001"
    },
    {
      "schema": "public",
      "name": "catalog_search_text",
      "input_names": [
        "p_title",
        "p_org",
        "p_location",
        "p_area",
        "p_type",
        "p_kind"
      ],
      "input_types": [
        "text",
        "text",
        "text",
        "text",
        "text",
        "text"
      ],
      "result": "text",
      "setof": false,
      "outputs": [],
      "defaults": 0,
      "action": "REPLACE_OR_NEW",
      "provided_by": "202610040002"
    },
    {
      "schema": "public",
      "name": "search_public_opportunities",
      "input_names": [
        "p_query",
        "p_area",
        "p_types",
        "p_mode",
        "p_after_updated_at",
        "p_after_id",
        "p_limit"
      ],
      "input_types": [
        "text",
        "text",
        "text[]",
        "text",
        "timestamptz",
        "text",
        "integer"
      ],
      "result": "public.opportunities",
      "setof": true,
      "outputs": [],
      "defaults": 7,
      "action": "REPLACE_OR_NEW",
      "provided_by": "202610040002"
    },
    {
      "schema": "public",
      "name": "claim_match_alert_scan",
      "input_names": [],
      "input_types": [],
      "result": "jsonb",
      "setof": false,
      "outputs": [],
      "defaults": 0,
      "action": "REPLACE_OR_NEW",
      "provided_by": "202610050001"
    },
    {
      "schema": "public",
      "name": "save_match_alert_scan",
      "input_names": [
        "p_profile_id",
        "p_lease_token",
        "p_checkpoint",
        "p_release"
      ],
      "input_types": [
        "uuid",
        "uuid",
        "jsonb",
        "boolean"
      ],
      "result": "boolean",
      "setof": false,
      "outputs": [],
      "defaults": 1,
      "action": "REPLACE_OR_NEW",
      "provided_by": "202610050001"
    },
    {
      "schema": "public",
      "name": "latest_maintenance_enrichments",
      "input_names": [
        "p_opportunity_ids"
      ],
      "input_types": [
        "text[]"
      ],
      "result": "record",
      "setof": true,
      "outputs": [
        {
          "name": "opportunity_id",
          "type": "text"
        },
        {
          "name": "created_at",
          "type": "timestamptz"
        }
      ],
      "defaults": 0,
      "action": "REPLACE_OR_NEW",
      "provided_by": "202610050001"
    },
    {
      "schema": "public",
      "name": "opportunity_requirements_text",
      "input_names": [],
      "input_types": [
        "jsonb"
      ],
      "result": "text",
      "setof": false,
      "outputs": [],
      "defaults": null,
      "min_defaults": 0,
      "action": "REQUIRED_EXISTING",
      "provided_by": null
    },
    {
      "schema": "public",
      "name": "opportunity_deadline_state",
      "input_names": [],
      "input_types": [
        "text"
      ],
      "result": "text",
      "setof": false,
      "outputs": [],
      "defaults": null,
      "min_defaults": 0,
      "action": "REQUIRED_EXISTING",
      "provided_by": null
    },
    {
      "schema": "public",
      "name": "refresh_opportunity_universe",
      "input_names": [],
      "input_types": [
        "text",
        "boolean"
      ],
      "result": "jsonb",
      "setof": false,
      "outputs": [],
      "defaults": null,
      "min_defaults": 1,
      "action": "REQUIRED_EXISTING",
      "provided_by": null
    },
    {
      "schema": "public",
      "name": "vector_dims",
      "input_names": [],
      "input_types": [
        "public.vector"
      ],
      "result": "integer",
      "setof": false,
      "outputs": [],
      "defaults": null,
      "min_defaults": 0,
      "action": "REQUIRED_EXISTING",
      "provided_by": null
    },
    {
      "schema": "auth",
      "name": "role",
      "input_names": [],
      "input_types": [],
      "result": "text",
      "setof": false,
      "outputs": [],
      "defaults": null,
      "min_defaults": 0,
      "action": "REQUIRED_EXISTING",
      "provided_by": null
    },
    {
      "schema": "pg_catalog",
      "name": "gen_random_uuid",
      "input_names": [],
      "input_types": [],
      "result": "uuid",
      "setof": false,
      "outputs": [],
      "defaults": null,
      "min_defaults": 0,
      "action": "REQUIRED_EXISTING",
      "provided_by": null
    }
  ],
  "function_fingerprints": [
    {
      "migration": "202610030001",
      "name": "public.admin_opportunity_pipeline_ledger",
      "body_md5": "517adec8dbef4f3b29806eca945ce51d"
    },
    {
      "migration": "202610030002",
      "name": "public.opportunity_universe_decision",
      "body_md5": "9c2b8a8f22e0ba3100e89e871812c618"
    },
    {
      "migration": "202610040001",
      "name": "public.stored_opportunity_source_policy",
      "body_md5": "53526055c44bbb70a0f5d3ac873a64e1"
    },
    {
      "migration": "202610040001",
      "name": "public.canonical_opportunity_source_policy",
      "body_md5": "7f52e45c93bafdc467d2a4ce13dede9d"
    },
    {
      "migration": "202610040001",
      "name": "public.admin_update_source_policy_atomic",
      "body_md5": "0af2c9b96ecb61368d2a42ceda9ff908"
    },
    {
      "migration": "202610040001",
      "name": "public.get_source_distribution_policy",
      "body_md5": "645545197318c563f2d794784f08fe6f"
    },
    {
      "migration": "202610040001",
      "name": "public.opportunity_source_policy_refresh_universe",
      "body_md5": "bfea13990ae8a958b69317319d010492"
    },
    {
      "migration": "202610040001",
      "name": "public.refresh_dirty_opportunity_universe_sources",
      "body_md5": "e124f74cbe83bf72d6ff60c8379de0be"
    },
    {
      "migration": "202610040001",
      "name": "public.opportunity_permission_refresh_universe",
      "body_md5": "a83b87e8a67c64545631dda7f75c1892"
    },
    {
      "migration": "202610040001",
      "name": "public.opportunity_universe_decision",
      "body_md5": "e332ff16fe93f33d20cc2ce8db8900db"
    },
    {
      "migration": "202610040001",
      "name": "public.opportunity_universe_schedule_deadline",
      "body_md5": "172bfa8a69ea9d561e692471b12a99e8"
    },
    {
      "migration": "202610040001",
      "name": "public.refresh_due_opportunity_universe",
      "body_md5": "68a10c8087ac4b4446cef0cd5821e21a"
    },
    {
      "migration": "202610040001",
      "name": "public.get_opportunity_universe_row",
      "body_md5": "f4300673224b2b0bfc02b7eeda23688d"
    },
    {
      "migration": "202610040001",
      "name": "public.apply_opportunity_source_trust",
      "body_md5": "4a47ecd3c19ae16e1d5746160dd82fdb"
    },
    {
      "migration": "202610040002",
      "name": "public.catalog_search_text",
      "body_md5": "b0085494827c0efecddd9081aa4d3422"
    },
    {
      "migration": "202610040002",
      "name": "public.search_public_opportunities",
      "body_md5": "d142c17d446f50d91cf822ef62cea00f"
    },
    {
      "migration": "202610050001",
      "name": "public.claim_match_alert_scan",
      "body_md5": "4c852832c2185e33870099a58998756d"
    },
    {
      "migration": "202610050001",
      "name": "public.save_match_alert_scan",
      "body_md5": "8634524736a5be19e8c6ac3bbc65a42f"
    },
    {
      "migration": "202610050001",
      "name": "public.latest_maintenance_enrichments",
      "body_md5": "456ec5d21c7aa8465f184a3c67603226"
    }
  ],
  "views": [
    {
      "name": "opportunity_pipeline_status",
      "star": false,
      "columns": [
        {
          "ordinal": 1,
          "name": "opportunity_id",
          "type": null,
          "source_relation": "opportunities",
          "source_column": "id"
        },
        {
          "ordinal": 2,
          "name": "canonical_source",
          "type": "text",
          "source_relation": null,
          "source_column": null
        },
        {
          "ordinal": 3,
          "name": "emitted_source",
          "type": null,
          "source_relation": "opportunity_ingestion_events",
          "source_column": "emitted_source"
        },
        {
          "ordinal": 4,
          "name": "producer",
          "type": null,
          "source_relation": "opportunity_ingestion_events",
          "source_column": "producer_id"
        },
        {
          "ordinal": 5,
          "name": "adapter_id",
          "type": null,
          "source_relation": "opportunity_ingestion_events",
          "source_column": "adapter_id"
        },
        {
          "ordinal": 6,
          "name": "cleaner_id",
          "type": null,
          "source_relation": "opportunity_ingestion_events",
          "source_column": "cleaner_id"
        },
        {
          "ordinal": 7,
          "name": "normalizer_version",
          "type": null,
          "source_relation": "opportunity_ingestion_events",
          "source_column": "normalizer_version"
        },
        {
          "ordinal": 8,
          "name": "normalized_fields",
          "type": null,
          "source_relation": "opportunity_ingestion_events",
          "source_column": "normalized_fields"
        },
        {
          "ordinal": 9,
          "name": "adapter_lineage_state",
          "type": "text",
          "source_relation": null,
          "source_column": null
        },
        {
          "ordinal": 10,
          "name": "run_id",
          "type": null,
          "source_relation": "opportunity_ingestion_events",
          "source_column": "run_id"
        },
        {
          "ordinal": 11,
          "name": "latest_scraper_run_id",
          "type": null,
          "source_relation": "opportunity_ingestion_events",
          "source_column": "scraper_run_id"
        },
        {
          "ordinal": 12,
          "name": "scan_request_id",
          "type": null,
          "source_relation": "opportunity_ingestion_events",
          "source_column": "scan_request_id"
        },
        {
          "ordinal": 13,
          "name": "ingestion_received_at",
          "type": null,
          "source_relation": "opportunity_ingestion_events",
          "source_column": "received_at"
        },
        {
          "ordinal": 14,
          "name": "created_at",
          "type": null,
          "source_relation": "opportunities",
          "source_column": "created_at"
        },
        {
          "ordinal": 15,
          "name": "updated_at",
          "type": null,
          "source_relation": "opportunities",
          "source_column": "updated_at"
        },
        {
          "ordinal": 16,
          "name": "ingestion_state",
          "type": "text",
          "source_relation": null,
          "source_column": null
        },
        {
          "ordinal": 17,
          "name": "ingestion_reason",
          "type": "text",
          "source_relation": null,
          "source_column": null
        },
        {
          "ordinal": 18,
          "name": "provenance_certainty",
          "type": "text",
          "source_relation": null,
          "source_column": null
        },
        {
          "ordinal": 19,
          "name": "normalized_fields_snapshot",
          "type": "jsonb",
          "source_relation": null,
          "source_column": null
        },
        {
          "ordinal": 20,
          "name": "factory_status",
          "type": "text",
          "source_relation": null,
          "source_column": null
        },
        {
          "ordinal": 21,
          "name": "factory_pipeline_version",
          "type": null,
          "source_relation": "opportunity_factory_snapshots",
          "source_column": "pipeline_version"
        },
        {
          "ordinal": 22,
          "name": "factory_rules_version",
          "type": null,
          "source_relation": "opportunity_factory_snapshots",
          "source_column": "rules_version"
        },
        {
          "ordinal": 23,
          "name": "factory_stamps",
          "type": "jsonb",
          "source_relation": null,
          "source_column": null
        },
        {
          "ordinal": 24,
          "name": "factory_evidence",
          "type": "jsonb",
          "source_relation": null,
          "source_column": null
        },
        {
          "ordinal": 25,
          "name": "factory_reason",
          "type": "text",
          "source_relation": null,
          "source_column": null
        },
        {
          "ordinal": 26,
          "name": "content_fingerprint",
          "type": "text",
          "source_relation": null,
          "source_column": null
        },
        {
          "ordinal": 27,
          "name": "semantic_fingerprint",
          "type": "text",
          "source_relation": null,
          "source_column": null
        },
        {
          "ordinal": 28,
          "name": "embedding_status",
          "type": "text",
          "source_relation": null,
          "source_column": null
        },
        {
          "ordinal": 29,
          "name": "embedding_model",
          "type": "text",
          "source_relation": null,
          "source_column": null
        },
        {
          "ordinal": 30,
          "name": "embedding_dimension",
          "type": "integer",
          "source_relation": null,
          "source_column": null
        },
        {
          "ordinal": 31,
          "name": "observation_state",
          "type": "text",
          "source_relation": null,
          "source_column": null
        },
        {
          "ordinal": 32,
          "name": "latest_observation_id",
          "type": null,
          "source_relation": "opportunity_source_observations",
          "source_column": "id"
        },
        {
          "ordinal": 33,
          "name": "latest_observation_at",
          "type": null,
          "source_relation": "opportunity_source_observations",
          "source_column": "observed_at"
        },
        {
          "ordinal": 34,
          "name": "identity_status",
          "type": "text",
          "source_relation": null,
          "source_column": null
        },
        {
          "ordinal": 35,
          "name": "http_status",
          "type": null,
          "source_relation": "opportunity_source_observations",
          "source_column": "http_status"
        },
        {
          "ordinal": 36,
          "name": "observation_reason",
          "type": "text",
          "source_relation": null,
          "source_column": null
        },
        {
          "ordinal": 37,
          "name": "verification_status",
          "type": null,
          "source_relation": "opportunities",
          "source_column": "verification_status"
        },
        {
          "ordinal": 38,
          "name": "verification_reason",
          "type": "text",
          "source_relation": null,
          "source_column": null
        },
        {
          "ordinal": 39,
          "name": "lifecycle_state",
          "type": "text",
          "source_relation": null,
          "source_column": null
        },
        {
          "ordinal": 40,
          "name": "lifecycle_reason",
          "type": "text",
          "source_relation": null,
          "source_column": null
        },
        {
          "ordinal": 41,
          "name": "source_operational_state",
          "type": "text",
          "source_relation": null,
          "source_column": null
        },
        {
          "ordinal": 42,
          "name": "source_operational_reason",
          "type": "text",
          "source_relation": null,
          "source_column": null
        },
        {
          "ordinal": 43,
          "name": "universe_provenance",
          "type": "jsonb",
          "source_relation": null,
          "source_column": null
        },
        {
          "ordinal": 44,
          "name": "source_permission_states",
          "type": "jsonb",
          "source_relation": null,
          "source_column": null
        },
        {
          "ordinal": 45,
          "name": "consumer_switch_states",
          "type": "jsonb",
          "source_relation": null,
          "source_column": null
        },
        {
          "ordinal": 46,
          "name": "catalog_row_state",
          "type": "text",
          "source_relation": null,
          "source_column": null
        },
        {
          "ordinal": 47,
          "name": "catalog_state",
          "type": "text",
          "source_relation": null,
          "source_column": null
        },
        {
          "ordinal": 48,
          "name": "catalog_reason",
          "type": "text",
          "source_relation": null,
          "source_column": null
        },
        {
          "ordinal": 49,
          "name": "matching_row_state",
          "type": "text",
          "source_relation": null,
          "source_column": null
        },
        {
          "ordinal": 50,
          "name": "matching_row_reason",
          "type": "text",
          "source_relation": null,
          "source_column": null
        },
        {
          "ordinal": 51,
          "name": "source_matching_state",
          "type": "text",
          "source_relation": null,
          "source_column": null
        },
        {
          "ordinal": 52,
          "name": "source_matching_operational_state",
          "type": "text",
          "source_relation": null,
          "source_column": null
        },
        {
          "ordinal": 53,
          "name": "final_matching_state",
          "type": "text",
          "source_relation": null,
          "source_column": null
        },
        {
          "ordinal": 54,
          "name": "matching_reason",
          "type": "text",
          "source_relation": null,
          "source_column": null
        },
        {
          "ordinal": 55,
          "name": "alerts_row_state",
          "type": "text",
          "source_relation": null,
          "source_column": null
        },
        {
          "ordinal": 56,
          "name": "alerts_state",
          "type": "text",
          "source_relation": null,
          "source_column": null
        },
        {
          "ordinal": 57,
          "name": "alerts_reason",
          "type": "text",
          "source_relation": null,
          "source_column": null
        },
        {
          "ordinal": 58,
          "name": "seo_row_state",
          "type": "text",
          "source_relation": null,
          "source_column": null
        },
        {
          "ordinal": 59,
          "name": "seo_row_reason",
          "type": "text",
          "source_relation": null,
          "source_column": null
        },
        {
          "ordinal": 60,
          "name": "seo_state",
          "type": "text",
          "source_relation": null,
          "source_column": null
        },
        {
          "ordinal": 61,
          "name": "seo_reason",
          "type": "text",
          "source_relation": null,
          "source_column": null
        },
        {
          "ordinal": 62,
          "name": "unresolved_dimensions",
          "type": "text[]",
          "source_relation": null,
          "source_column": null
        },
        {
          "ordinal": 63,
          "name": "permission_unknown_dimensions",
          "type": "text[]",
          "source_relation": null,
          "source_column": null
        },
        {
          "ordinal": 64,
          "name": "factory_age",
          "type": "interval",
          "source_relation": null,
          "source_column": null
        },
        {
          "ordinal": 65,
          "name": "factory_sla_state",
          "type": "text",
          "source_relation": null,
          "source_column": null
        },
        {
          "ordinal": 66,
          "name": "pipeline_health",
          "type": "text",
          "source_relation": null,
          "source_column": null
        },
        {
          "ordinal": 67,
          "name": "blocking_phases",
          "type": "text[]",
          "source_relation": null,
          "source_column": null
        },
        {
          "ordinal": 68,
          "name": "next_action",
          "type": "text",
          "source_relation": null,
          "source_column": null
        },
        {
          "ordinal": 69,
          "name": "next_action_reason",
          "type": "text",
          "source_relation": null,
          "source_column": null
        },
        {
          "ordinal": 70,
          "name": "next_actions",
          "type": "jsonb",
          "source_relation": null,
          "source_column": null
        },
        {
          "ordinal": 71,
          "name": "routing_updated_at",
          "type": null,
          "source_relation": "opportunity_universe_state",
          "source_column": "evaluated_at"
        },
        {
          "ordinal": 72,
          "name": "observation_evidence",
          "type": null,
          "source_relation": "opportunity_source_observations",
          "source_column": "evidence"
        },
        {
          "ordinal": 73,
          "name": "ingestion_outcome",
          "type": null,
          "source_relation": "opportunity_ingestion_events",
          "source_column": "outcome"
        },
        {
          "ordinal": 74,
          "name": "ingestion_trace_contract_version",
          "type": null,
          "source_relation": "opportunity_ingestion_events",
          "source_column": "trace_contract_version"
        },
        {
          "ordinal": 75,
          "name": "ingestion_outcome_reason",
          "type": null,
          "source_relation": "opportunity_ingestion_events",
          "source_column": "reason"
        }
      ],
      "provided_by": "202610030001"
    },
    {
      "name": "opportunity_final_matching_universe",
      "star": true,
      "columns": [
        {
          "ordinal": 1,
          "name": "universe_lifecycle_state",
          "type": null,
          "source_relation": "opportunity_universe_state",
          "source_column": "lifecycle_state"
        },
        {
          "ordinal": 2,
          "name": "universe_matching_row_state",
          "type": null,
          "source_relation": "opportunity_universe_state",
          "source_column": "matching_row_state"
        },
        {
          "ordinal": 3,
          "name": "universe_source_matching_state",
          "type": null,
          "source_relation": "opportunity_universe_state",
          "source_column": "source_matching_state"
        },
        {
          "ordinal": 4,
          "name": "universe_final_matching_state",
          "type": null,
          "source_relation": "opportunity_universe_state",
          "source_column": "final_matching_state"
        },
        {
          "ordinal": 5,
          "name": "universe_alerts_state",
          "type": null,
          "source_relation": "opportunity_universe_state",
          "source_column": "alerts_state"
        }
      ],
      "provided_by": "202610040001"
    },
    {
      "name": "opportunity_catalog_universe",
      "star": true,
      "columns": [
        {
          "ordinal": 1,
          "name": "universe_lifecycle_state",
          "type": null,
          "source_relation": "opportunity_universe_state",
          "source_column": "lifecycle_state"
        },
        {
          "ordinal": 2,
          "name": "universe_catalog_state",
          "type": null,
          "source_relation": "opportunity_universe_state",
          "source_column": "catalog_state"
        }
      ],
      "provided_by": "202610040001"
    },
    {
      "name": "opportunity_alert_universe",
      "star": true,
      "columns": [
        {
          "ordinal": 1,
          "name": "universe_lifecycle_state",
          "type": null,
          "source_relation": "opportunity_universe_state",
          "source_column": "lifecycle_state"
        },
        {
          "ordinal": 2,
          "name": "universe_alerts_state",
          "type": null,
          "source_relation": "opportunity_universe_state",
          "source_column": "alerts_state"
        },
        {
          "ordinal": 3,
          "name": "universe_final_matching_state",
          "type": null,
          "source_relation": "opportunity_universe_state",
          "source_column": "final_matching_state"
        }
      ],
      "provided_by": "202610040001"
    },
    {
      "name": "opportunity_seo_universe",
      "star": true,
      "columns": [
        {
          "ordinal": 1,
          "name": "universe_lifecycle_state",
          "type": null,
          "source_relation": "opportunity_universe_state",
          "source_column": "lifecycle_state"
        },
        {
          "ordinal": 2,
          "name": "universe_seo_state",
          "type": null,
          "source_relation": "opportunity_universe_state",
          "source_column": "seo_state"
        }
      ],
      "provided_by": "202610040001"
    }
  ],
  "indexes": [
    {
      "name": "admin_policy_events_source_lookup_idx",
      "relation": "admin_policy_events",
      "definition": "(entity_type,entity_key,created_at desc,id desc)",
      "provided_by": "202610040001"
    },
    {
      "name": "opportunities_universe_source_cursor_idx",
      "relation": "opportunities",
      "definition": "(lower(source),(id::text))",
      "provided_by": "202610040001"
    },
    {
      "name": "opportunities_catalog_order_idx",
      "relation": "opportunities",
      "definition": "(updated_at desc,id)",
      "provided_by": "202610040001"
    },
    {
      "name": "opportunity_universe_next_lifecycle_check_idx",
      "relation": "opportunity_universe_state",
      "definition": "(next_lifecycle_check_at,opportunity_id) where next_lifecycle_check_at is not null",
      "provided_by": "202610040001"
    },
    {
      "name": "opportunities_catalog_search_idx",
      "relation": "opportunities",
      "definition": "using gin (public.catalog_search_text(title,organization,location,rubro,opportunity_type,opportunity_kind) extensions.gin_trgm_ops)",
      "provided_by": "202610040002"
    },
    {
      "name": "opportunities_catalog_area_idx",
      "relation": "opportunities",
      "definition": "(rubro,updated_at desc,id)",
      "provided_by": "202610040002"
    },
    {
      "name": "user_master_profiles_alert_walk_idx",
      "relation": "user_master_profiles",
      "definition": "(id) where match_alerts_enabled and email is not null and user_id is not null and (is_test is null or is_test=false)",
      "provided_by": "202610050001"
    },
    {
      "name": "scraper_runs_maintenance_progress_idx",
      "relation": "scraper_runs",
      "definition": "(scraper_id, (extraction_metrics->>'maintenance_lane'),(extraction_metrics->'maintenance_progress'->>'opportunity_id'), started_at desc,finished_at desc)",
      "provided_by": "202610050001"
    },
    {
      "name": "matching_retrieval_candidates_alert_cursor_idx",
      "relation": "matching_retrieval_candidates",
      "definition": "(user_id,evaluated_at,opportunity_id) where candidate_class='MATCH'",
      "provided_by": "202610050001"
    },
    {
      "name": "opportunities_maintenance_cursor_idx",
      "relation": "opportunities",
      "definition": "(source,id) where deleted_at is null and archived_at is null",
      "provided_by": "202610050001"
    },
    {
      "name": "opportunity_enrichment_events_opportunity_created_idx",
      "relation": "opportunity_enrichment_events",
      "definition": "(opportunity_id, created_at DESC)",
      "provided_by": null
    }
  ],
  "keys": [
    {
      "relation": "opportunities",
      "columns": [
        "id"
      ]
    },
    {
      "relation": "opportunity_source_identity_aliases",
      "columns": [
        "emitted_source"
      ]
    },
    {
      "relation": "opportunity_source_consumer_permissions",
      "columns": [
        "canonical_source",
        "consumer"
      ]
    },
    {
      "relation": "opportunity_universe_dirty_sources",
      "columns": [
        "canonical_source"
      ]
    },
    {
      "relation": "matching_retrieval_scheduler_state",
      "columns": [
        "singleton"
      ]
    },
    {
      "relation": "user_master_profiles",
      "columns": [
        "id"
      ]
    },
    {
      "relation": "match_alert_scan_progress",
      "columns": [
        "profile_id"
      ]
    }
  ],
  "roles": [
    "anon",
    "authenticated",
    "service_role"
  ],
  "types": [
    "public.vector"
  ],
  "runtime_relations": [
    "opportunities",
    "opportunity_source_observations",
    "opportunity_universe_state",
    "opportunity_source_identity_aliases",
    "opportunity_source_consumer_permissions",
    "opportunity_sources",
    "matching_retrieval_scheduler_state",
    "matching_retrieval_candidates",
    "scraper_runs",
    "opportunity_enrichment_events",
    "user_master_profiles",
    "opportunity_catalog_universe",
    "opportunity_final_matching_universe",
    "opportunity_alert_universe",
    "opportunity_seo_universe",
    "match_alert_scan_progress"
  ],
  "runtime_functions": [
    "public.get_source_distribution_policy",
    "public.search_public_opportunities",
    "public.claim_match_alert_scan",
    "public.save_match_alert_scan",
    "public.latest_maintenance_enrichments",
    "public.get_opportunity_universe_row",
    "public.refresh_due_opportunity_universe",
    "public.refresh_dirty_opportunity_universe_sources"
  ],
  "required_triggers": [
    {
      "relation": "opportunities",
      "name": "opportunities_refresh_universe",
      "function": "opportunity_universe_after_write"
    },
    {
      "relation": "opportunity_source_observations",
      "name": "opportunity_observation_refresh_universe",
      "function": "opportunity_observation_refresh_universe"
    },
    {
      "relation": "opportunity_sources",
      "name": "opportunity_sources_refresh_universe",
      "function": "opportunity_source_policy_refresh_universe"
    },
    {
      "relation": "opportunity_source_consumer_permissions",
      "name": "opportunity_permissions_refresh_universe",
      "function": "opportunity_permission_refresh_universe"
    }
  ]
}$manifest$::jsonb AS j
), operator_context AS (
  SELECT current_user AS operator, current_database() AS database,
    current_setting('server_version_num')::integer AS version_num,
    version() AS postgres_version,
    (SELECT rolsuper FROM pg_catalog.pg_roles WHERE rolname=current_user) AS superuser,
    (SELECT oid FROM pg_catalog.pg_roles WHERE rolname='service_role') AS service_oid
), relations AS (
  SELECT r.*, to_regclass('public.'||r.name) AS oid
  FROM manifest, jsonb_to_recordset(j->'relations') AS r(name text, columns jsonb, provided_by text)
), columns_expected AS (
  SELECT r.name AS relation, r.oid, r.provided_by AS table_provided_by, c.*
  FROM relations r, jsonb_to_recordset(r.columns) AS c(name text, type text, provided_by text)
), column_checks AS (
  SELECT e.relation,e.name,e.type AS expected_type,e.provided_by,
    format_type(a.atttypid,a.atttypmod) AS actual_type,
    a.attnotnull AS actual_not_null,pg_get_expr(ad.adbin,ad.adrelid) AS actual_default,
    CASE WHEN a.attname IS NULL AND coalesce(e.provided_by,e.table_provided_by) IS NOT NULL THEN 'PLANNED_ADD'
      WHEN a.attname IS NULL THEN 'BLOCKER_MISSING_COLUMN'
      WHEN e.type IS NOT NULL AND (to_regtype(e.type) IS NULL OR a.atttypid<>to_regtype(e.type)::oid) THEN 'BLOCKER_COLUMN_TYPE'
      ELSE 'PASS' END AS status
  FROM columns_expected e LEFT JOIN pg_catalog.pg_attribute a
    ON a.attrelid=e.oid AND a.attname=e.name AND a.attnum>0 AND NOT a.attisdropped
    LEFT JOIN pg_catalog.pg_attrdef ad ON ad.adrelid=a.attrelid AND ad.adnum=a.attnum
), relation_checks AS (
  SELECT r.name,r.provided_by,c.relkind,c.relrowsecurity,c.relforcerowsecurity,
    pg_get_userbyid(c.relowner) AS owner,
    CASE WHEN r.oid IS NULL AND r.provided_by IS NOT NULL THEN 'PLANNED_ADD'
      WHEN r.oid IS NULL THEN 'BLOCKER_MISSING_RELATION'
      WHEN c.relkind NOT IN ('r','p') THEN 'BLOCKER_RELATION_KIND'
      ELSE 'PASS' END AS status
  FROM relations r LEFT JOIN pg_catalog.pg_class c ON c.oid=r.oid
), function_expected AS (
  SELECT f.*, (SELECT array_agg(to_regtype(t)::oid ORDER BY ord) FROM jsonb_array_elements_text(f.input_types) WITH ORDINALITY a(t,ord)) AS arg_oids,
    to_regtype(f.result)::oid AS result_oid
  FROM manifest,jsonb_to_recordset(j->'functions') AS f(schema text,name text,input_names jsonb,input_types jsonb,result text,setof boolean,outputs jsonb,defaults integer,min_defaults integer,action text,provided_by text)
), function_checks AS (
  SELECT f.schema||'.'||f.name AS name,f.input_names,f.input_types,f.result AS expected_result,f.setof AS expected_setof,f.action,f.provided_by,
    p.oid,pg_get_function_identity_arguments(p.oid) AS identity_arguments,pg_get_function_result(p.oid) AS result_type,
    pg_get_userbyid(p.proowner) AS owner,p.prosecdef AS security_definer,p.provolatile,p.proconfig,
    CASE WHEN p.oid IS NULL AND EXISTS(SELECT 1 FROM pg_catalog.pg_proc other JOIN pg_catalog.pg_namespace ns ON ns.oid=other.pronamespace WHERE ns.nspname=f.schema AND other.proname=f.name)
        THEN 'BLOCKER_ARGUMENT_SIGNATURE'
      WHEN p.oid IS NULL AND f.action='REQUIRED_EXISTING' THEN 'BLOCKER_MISSING_FUNCTION'
      WHEN p.oid IS NULL AND f.action='DROP_RECREATE' THEN 'BLOCKER_DROP_TARGET_MISSING'
      WHEN p.oid IS NULL THEN 'PLANNED_ADD'
      WHEN p.prokind<>'f' THEN 'BLOCKER_FUNCTION_KIND'
      WHEN f.action='DROP_RECREATE' THEN 'DROP_RECREATE_DEPENDENCIES_MUST_BE_EMPTY'
      WHEN p.pronargdefaults<coalesce(f.min_defaults,0) THEN 'BLOCKER_REQUIRED_ARGUMENT_DEFAULT'
      WHEN f.defaults IS NOT NULL AND p.pronargdefaults>f.defaults THEN 'BLOCKER_REMOVING_ARGUMENT_DEFAULT'
      WHEN p.prorettype IS DISTINCT FROM f.result_oid OR p.proretset<>f.setof THEN 'BLOCKER_RETURN_SIGNATURE'
      WHEN EXISTS(SELECT 1 FROM jsonb_array_elements_text(f.input_names) WITH ORDINALITY nn(n,ord)
        WHERE p.proargnames[ord::integer] IS NOT NULL AND p.proargnames[ord::integer]<>'' AND p.proargnames[ord::integer]<>nn.n) THEN 'BLOCKER_INPUT_ARGUMENT_NAME'
      WHEN jsonb_array_length(f.outputs)>0 AND
        (SELECT coalesce(jsonb_agg(jsonb_build_object('name',p.proargnames[g.i],'oid',p.proallargtypes[g.i]) ORDER BY g.i),'[]'::jsonb)
          FROM generate_subscripts(p.proallargtypes,1) g(i) WHERE p.proargmodes[g.i] IN ('o','b','t'))
        IS DISTINCT FROM (SELECT jsonb_agg(jsonb_build_object('name',oo->>'name','oid',to_regtype(oo->>'type')::oid) ORDER BY ord)
          FROM jsonb_array_elements(f.outputs) WITH ORDINALITY z(oo,ord)) THEN 'BLOCKER_OUT_SIGNATURE'
      ELSE 'PASS' END AS status
  FROM function_expected f LEFT JOIN pg_catalog.pg_namespace ns ON ns.nspname=f.schema
    LEFT JOIN pg_catalog.pg_proc p ON p.pronamespace=ns.oid AND p.proname=f.name
    AND (SELECT coalesce(array_agg(x ORDER BY ord),ARRAY[]::oid[]) FROM unnest(p.proargtypes::oid[]) WITH ORDINALITY a(x,ord))=coalesce(f.arg_oids,ARRAY[]::oid[])
), function_fingerprints AS (
  SELECT e.migration,e.name,e.body_md5,md5(replace(p.prosrc,chr(13)||chr(10),chr(10))) AS current_body_md5,
    CASE WHEN p.oid IS NULL THEN 'NOT_AVAILABLE'
      WHEN md5(replace(p.prosrc,chr(13)||chr(10),chr(10)))=e.body_md5 THEN 'EXACT_BODY_MATCH'
      ELSE 'DIFFERENT_BODY_OR_SUPERSEDED' END AS status
  FROM manifest,jsonb_to_recordset(j->'function_fingerprints') e(migration text,name text,body_md5 text)
    LEFT JOIN function_checks fc ON fc.name=e.name LEFT JOIN pg_catalog.pg_proc p ON p.oid=fc.oid
), view_expected AS (
  SELECT v.*,to_regclass('public.'||v.name) AS oid
  FROM manifest,jsonb_to_recordset(j->'views') AS v(name text,star boolean,columns jsonb,provided_by text)
), view_columns AS (
  SELECT v.name,a.attnum::integer AS ordinal,a.attname AS column_name,a.atttypid AS type_oid,a.atttypmod AS typmod
  FROM view_expected v JOIN pg_catalog.pg_attribute a ON a.attrelid=to_regclass('public.opportunities') AND a.attnum>0 AND NOT a.attisdropped WHERE v.star
  UNION ALL
  SELECT v.name, cc.ordinal+CASE WHEN v.star THEN (SELECT coalesce(max(attnum),0) FROM pg_catalog.pg_attribute WHERE attrelid=to_regclass('public.opportunities') AND attnum>0 AND NOT attisdropped) ELSE 0 END,
    cc.name,coalesce(to_regtype(cc.type)::oid,a.atttypid),CASE WHEN cc.type IS NULL THEN a.atttypmod ELSE -1 END
  FROM view_expected v CROSS JOIN LATERAL jsonb_to_recordset(v.columns) cc(ordinal integer,name text,type text,source_relation text,source_column text)
    LEFT JOIN pg_catalog.pg_attribute a ON a.attrelid=to_regclass('public.'||cc.source_relation) AND a.attname=cc.source_column AND a.attnum>0 AND NOT a.attisdropped
), view_checks AS (
  SELECT v.name,v.provided_by,c.relkind,c.reloptions,pg_get_userbyid(c.relowner) AS owner,
    CASE WHEN v.oid IS NULL THEN 'PLANNED_ADD' WHEN c.relkind<>'v' THEN 'BLOCKER_VIEW_KIND'
      WHEN EXISTS(SELECT 1 FROM pg_catalog.pg_attribute a LEFT JOIN view_columns e ON e.name=v.name AND e.ordinal=a.attnum
        WHERE a.attrelid=v.oid AND a.attnum>0 AND NOT a.attisdropped
        AND (e.column_name IS NULL OR a.attname<>e.column_name OR a.atttypid IS DISTINCT FROM e.type_oid OR a.atttypmod IS DISTINCT FROM e.typmod)) THEN 'BLOCKER_VIEW_PREFIX_OR_TYPE'
      ELSE 'PASS' END AS status,
    (SELECT coalesce(jsonb_agg(jsonb_build_object('ordinal',a.attnum,'actual',a.attname,'expected',e.column_name,
      'actual_type',format_type(a.atttypid,a.atttypmod),'expected_type',format_type(e.type_oid,e.typmod)) ORDER BY a.attnum),'[]'::jsonb)
      FROM pg_catalog.pg_attribute a LEFT JOIN view_columns e ON e.name=v.name AND e.ordinal=a.attnum
      WHERE a.attrelid=v.oid AND a.attnum>0 AND NOT a.attisdropped AND
        (e.column_name IS NULL OR a.attname<>e.column_name OR a.atttypid IS DISTINCT FROM e.type_oid OR a.atttypmod IS DISTINCT FROM e.typmod)) AS mismatches
  FROM view_expected v LEFT JOIN pg_catalog.pg_class c ON c.oid=v.oid
), dependencies AS (
  SELECT f.name,f.action,d.deptype,pg_describe_object(d.classid,d.objid,d.objsubid) AS dependent,
    CASE WHEN f.action='DROP_RECREATE' AND d.deptype='n' THEN 'BLOCKER_DROP_DEPENDENCY' ELSE 'INFORMATION' END AS status
  FROM function_checks f JOIN pg_catalog.pg_depend d ON d.refclassid='pg_proc'::regclass AND d.refobjid=f.oid
    WHERE d.deptype IN ('n','a','i')
  UNION ALL
  SELECT v.name,'REPLACE_VIEW',d.deptype,pg_describe_object(d.classid,d.objid,d.objsubid),'INFORMATION'
  FROM view_expected v JOIN pg_catalog.pg_depend d ON d.refclassid='pg_class'::regclass AND d.refobjid=v.oid
    WHERE d.deptype='n' AND NOT (d.classid='pg_rewrite'::regclass AND d.objid IN (SELECT oid FROM pg_catalog.pg_rewrite WHERE ev_class=v.oid))
), index_checks AS (
  SELECT e.name,e.relation,e.definition AS expected_definition,e.provided_by,
    pg_get_indexdef(i.indexrelid) AS actual_definition,i.indisvalid,i.indisready,i.indisunique,
    CASE WHEN c.oid IS NULL AND e.provided_by IS NOT NULL THEN 'PLANNED_BUILD_FULL_TABLE_INDEX_SCAN'
      WHEN c.oid IS NULL THEN 'BLOCKER_MISSING_LOOKUP_INDEX'
      WHEN i.indexrelid IS NULL OR i.indrelid IS DISTINCT FROM to_regclass('public.'||e.relation) OR NOT i.indisvalid OR NOT i.indisready THEN 'BLOCKER_INDEX_OBJECT'
      WHEN regexp_replace(lower(regexp_replace(pg_get_indexdef(i.indexrelid),'^.* USING ','using ','i')), '[[:space:]()]|public\.|extensions\.|::text', '', 'g')
        <> regexp_replace(lower(CASE WHEN e.definition ~* '^using ' THEN e.definition ELSE 'using btree '||e.definition END), '[[:space:]()]|public\.|extensions\.|::text', '', 'g') THEN 'BLOCKER_INDEX_DEFINITION'
      WHEN e.name='opportunities_catalog_search_idx' AND NOT EXISTS(SELECT 1 FROM unnest(i.indclass::oid[]) op(oid)
        JOIN pg_catalog.pg_opclass oc ON oc.oid=op.oid JOIN pg_catalog.pg_namespace ns ON ns.oid=oc.opcnamespace WHERE oc.opcname='gin_trgm_ops' AND ns.nspname='extensions') THEN 'BLOCKER_INDEX_OPCLASS_SCHEMA'
      ELSE 'PASS' END AS status
  FROM manifest,jsonb_to_recordset(j->'indexes') e(name text,relation text,definition text,provided_by text)
    LEFT JOIN pg_catalog.pg_class c ON c.oid=to_regclass('public.'||e.name)
    LEFT JOIN pg_catalog.pg_index i ON i.indexrelid=c.oid
), key_checks AS (
  SELECT k.relation,k.columns,
    CASE WHEN to_regclass('public.'||k.relation) IS NULL AND k.relation='match_alert_scan_progress' THEN 'PLANNED_ADD'
      WHEN EXISTS(SELECT 1 FROM pg_catalog.pg_index i WHERE i.indrelid=to_regclass('public.'||k.relation) AND i.indisunique AND i.indisvalid AND i.indimmediate AND i.indpred IS NULL AND i.indexprs IS NULL
        AND (SELECT jsonb_agg(a.attname ORDER BY z.ord) FROM unnest(i.indkey::smallint[]) WITH ORDINALITY z(num,ord)
          JOIN pg_catalog.pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=z.num WHERE z.ord<=i.indnkeyatts)=k.columns) THEN 'PASS'
      ELSE 'BLOCKER_UNIQUE_KEY' END AS status
  FROM manifest,jsonb_to_recordset(j->'keys') k(relation text,columns jsonb)
), progress_fk_check AS (
  SELECT 'match_alert_scan_progress.profile_id' AS name,
    CASE WHEN to_regclass('public.match_alert_scan_progress') IS NULL THEN 'PLANNED_ADD'
      WHEN EXISTS(SELECT 1 FROM pg_catalog.pg_constraint c
        WHERE c.conrelid=to_regclass('public.match_alert_scan_progress') AND c.contype='f'
        AND c.confrelid=to_regclass('public.user_master_profiles') AND c.convalidated
        AND c.conkey=ARRAY[(SELECT attnum FROM pg_catalog.pg_attribute WHERE attrelid=c.conrelid AND attname='profile_id' AND NOT attisdropped)]::smallint[]
        AND c.confkey=ARRAY[(SELECT attnum FROM pg_catalog.pg_attribute WHERE attrelid=c.confrelid AND attname='id' AND NOT attisdropped)]::smallint[])
      THEN 'PASS' ELSE 'BLOCKER_PROGRESS_PROFILE_FK' END AS status
), role_checks AS (
  SELECT rr.name,r.oid,r.rolbypassrls,r.rolsuper,CASE WHEN r.oid IS NULL THEN 'BLOCKER_MISSING_ROLE' ELSE 'PASS' END AS status
  FROM manifest,jsonb_array_elements_text(j->'roles') rr(name) LEFT JOIN pg_catalog.pg_roles r ON r.rolname=rr.name
), relation_privileges AS (
  SELECT x.name,c.relrowsecurity,c.relforcerowsecurity,
    CASE WHEN c.oid IS NULL OR o.service_oid IS NULL THEN NULL ELSE has_schema_privilege(o.service_oid,c.relnamespace,'USAGE') END AS schema_usage,
    CASE WHEN c.oid IS NULL OR o.service_oid IS NULL THEN NULL ELSE has_table_privilege(o.service_oid,c.oid,'SELECT') END AS service_select,
    CASE WHEN c.oid IS NULL OR o.service_oid IS NULL THEN NULL ELSE has_table_privilege(o.service_oid,c.oid,'INSERT,UPDATE,DELETE') END AS service_any_write,
    CASE WHEN c.oid IS NULL THEN 'PLANNED_OBJECT_OR_MISSING_PREREQUISITE'
      WHEN o.service_oid IS NULL THEN 'BLOCKER_SERVICE_ROLE_MISSING'
      WHEN x.name='match_alert_scan_progress' THEN 'EXPLICIT_GRANTS_IN_202610050001'
      WHEN NOT has_schema_privilege(o.service_oid,c.relnamespace,'USAGE') OR NOT has_table_privilege(o.service_oid,c.oid,'SELECT') THEN 'BLOCKER_RUNTIME_SELECT'
      WHEN c.relrowsecurity AND NOT (SELECT rolbypassrls OR rolsuper FROM pg_catalog.pg_roles WHERE oid=o.service_oid) THEN 'RLS_POLICY_REVIEW_REQUIRED'
      ELSE 'PASS' END AS status
  FROM manifest,jsonb_array_elements_text(j->'runtime_relations') x(name)
    CROSS JOIN operator_context o LEFT JOIN pg_catalog.pg_class c ON c.oid=to_regclass('public.'||x.name)
), function_privileges AS (
  SELECT f.name,f.identity_arguments,f.owner,f.security_definer,
    CASE WHEN f.oid IS NULL OR o.service_oid IS NULL THEN NULL ELSE has_function_privilege(o.service_oid,f.oid,'EXECUTE') END AS service_execute,
    CASE WHEN f.oid IS NULL THEN 'PLANNED_OBJECT_OR_MISSING_PREREQUISITE'
      WHEN o.service_oid IS NULL THEN 'BLOCKER_SERVICE_ROLE_MISSING'
      WHEN f.action='REQUIRED_EXISTING' AND NOT has_function_privilege(o.service_oid,f.oid,'EXECUTE') THEN 'BLOCKER_RUNTIME_EXECUTE'
      WHEN f.action<>'REQUIRED_EXISTING' THEN 'REPLACEMENT_GRANTS_REVIEW_REQUIRED'
      ELSE 'PASS' END AS status
  FROM function_checks f CROSS JOIN operator_context o
), ownership AS (
  SELECT f.name,'FUNCTION' AS kind,f.owner,
    CASE WHEN o.superuser OR pg_has_role(current_user,f.owner,'USAGE') THEN 'PASS' ELSE 'BLOCKER_REPLACE_OWNERSHIP' END AS status
  FROM function_checks f CROSS JOIN operator_context o WHERE f.oid IS NOT NULL AND f.action<>'REQUIRED_EXISTING'
  UNION ALL
  SELECT v.name,'VIEW',v.owner,CASE WHEN o.superuser OR pg_has_role(current_user,v.owner,'USAGE') THEN 'PASS' ELSE 'BLOCKER_REPLACE_OWNERSHIP' END
  FROM view_checks v CROSS JOIN operator_context o WHERE v.owner IS NOT NULL
  UNION ALL
  SELECT r.name,'TABLE',r.owner,CASE WHEN o.superuser OR pg_has_role(current_user,r.owner,'USAGE') THEN 'PASS' ELSE 'BLOCKER_TABLE_OWNERSHIP' END
  FROM relation_checks r CROSS JOIN operator_context o WHERE r.owner IS NOT NULL
), extension_check AS (
  SELECT e.extname,e.extversion,n.nspname AS schema,
    CASE WHEN e.oid IS NULL AND to_regnamespace('extensions') IS NULL THEN 'BLOCKER_EXTENSIONS_SCHEMA_MISSING'
      WHEN e.oid IS NULL AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_available_extensions WHERE name='pg_trgm') THEN 'BLOCKER_EXTENSION_NOT_INSTALLABLE'
      WHEN e.oid IS NULL THEN 'NOT_INSTALLED_PLANNED_IN_EXTENSIONS'
      WHEN n.nspname<>'extensions' THEN 'BLOCKER_PG_TRGM_WRONG_SCHEMA'
      WHEN NOT EXISTS(SELECT 1 FROM pg_catalog.pg_opclass oc JOIN pg_catalog.pg_am am ON am.oid=oc.opcmethod WHERE oc.opcnamespace=n.oid AND oc.opcname='gin_trgm_ops' AND am.amname='gin') THEN 'BLOCKER_GIN_TRGM_OPCLASS'
      ELSE 'PASS' END AS status
  FROM (SELECT 1) seed LEFT JOIN pg_catalog.pg_extension e ON e.extname='pg_trgm' LEFT JOIN pg_catalog.pg_namespace n ON n.oid=e.extnamespace
), history_guard AS (
  SELECT c.oid,c.relkind,
    CASE WHEN c.oid IS NULL THEN false WHEN c.relkind NOT IN ('r','p') THEN false
      WHEN NOT has_schema_privilege(c.relnamespace,'USAGE') OR NOT has_table_privilege(c.oid,'SELECT') THEN false
      WHEN c.relrowsecurity AND NOT (o.superuser OR (SELECT rolbypassrls FROM pg_catalog.pg_roles WHERE rolname=current_user)) THEN false
      WHEN NOT EXISTS(SELECT 1 FROM pg_catalog.pg_attribute a WHERE a.attrelid=c.oid AND a.attname='version' AND a.attnum>0 AND NOT a.attisdropped) THEN false
      ELSE true END AS available
  FROM operator_context o LEFT JOIN pg_catalog.pg_class c ON c.oid=to_regclass('supabase_migrations.schema_migrations')
), history_xml AS (
  SELECT available,query_to_xml(CASE WHEN available THEN
    $history$SELECT coalesce(jsonb_agg(jsonb_build_object('version',to_jsonb(m)->>'version','name',to_jsonb(m)->>'name')),'[]'::jsonb) AS payload
      FROM supabase_migrations.schema_migrations m
      WHERE to_jsonb(m)->>'version' IN ('202610030001','202610030002','202610040001','202610040002','202610050001')$history$
    ELSE $unavailable$SELECT '[]'::jsonb AS payload$unavailable$ END,false,false,'') AS payload
  FROM history_guard
), history AS (
  SELECT available,coalesce(((xpath('/table/row/payload/text()',payload))[1]::text)::jsonb,'[]'::jsonb) AS rows FROM history_xml
), migration_checks AS (
  SELECT m.*,h.available AS history_available,
    CASE WHEN NOT h.available THEN 'NOT_AVAILABLE'
      WHEN EXISTS(SELECT 1 FROM jsonb_array_elements(h.rows) z WHERE z->>'version'=m.version) THEN 'RECORDED'
      ELSE 'NOT_RECORDED_NOT_PROOF_OF_UNAPPLIED' END AS status,
    (SELECT coalesce(jsonb_agg(z),'[]'::jsonb) FROM jsonb_array_elements(h.rows) z WHERE z->>'version'=m.version) AS history_rows
  FROM manifest,jsonb_to_recordset(j->'migrations') m(version text,name text,sha256 text) CROSS JOIN history h
), trigger_checks AS (
  SELECT ns.nspname||'.'||c.relname AS relation,t.tgname,t.tgenabled,p.proname AS function,
    pg_get_triggerdef(t.oid) AS definition
  FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid
    JOIN pg_catalog.pg_namespace ns ON ns.oid=c.relnamespace JOIN pg_catalog.pg_proc p ON p.oid=t.tgfoid
  WHERE ns.nspname='public' AND NOT t.tgisinternal AND p.proname IN ('opportunity_source_policy_refresh_universe','opportunity_permission_refresh_universe','opportunity_universe_schedule_deadline','opportunity_universe_after_write','opportunity_observation_refresh_universe')
), required_trigger_checks AS (
  SELECT e.relation,e.name,e.function,t.tgenabled,
    CASE WHEN t.oid IS NULL THEN 'BLOCKER_FUTURE_TRIGGER_MISSING'
      WHEN p.proname<>e.function OR pn.nspname<>'public' THEN 'BLOCKER_FUTURE_TRIGGER_FUNCTION'
      WHEN t.tgenabled NOT IN ('O','A') THEN 'BLOCKER_FUTURE_TRIGGER_DISABLED'
      ELSE 'PASS' END AS status
  FROM manifest,jsonb_to_recordset(j->'required_triggers') e(relation text,name text,function text)
    LEFT JOIN pg_catalog.pg_trigger t ON t.tgrelid=to_regclass('public.'||e.relation) AND t.tgname=e.name AND NOT t.tgisinternal
    LEFT JOIN pg_catalog.pg_proc p ON p.oid=t.tgfoid LEFT JOIN pg_catalog.pg_namespace pn ON pn.oid=p.pronamespace
), constraint_metadata AS (
  SELECT r.name AS relation,c.conname,c.contype,c.convalidated,pg_get_constraintdef(c.oid) AS definition
  FROM relations r JOIN pg_catalog.pg_constraint c ON c.conrelid=r.oid
), schema_privileges AS (
  SELECT x.name,n.oid IS NOT NULL AS available,
    CASE WHEN n.oid IS NULL THEN NULL ELSE has_schema_privilege(n.oid,'CREATE') END AS operator_create,
    CASE WHEN n.oid IS NULL OR o.service_oid IS NULL THEN NULL ELSE has_schema_privilege(o.service_oid,n.oid,'USAGE') END AS service_usage,
    CASE WHEN n.oid IS NULL THEN 'BLOCKER_SCHEMA_MISSING'
      WHEN x.name IN ('public','extensions') AND NOT has_schema_privilege(n.oid,'CREATE') THEN 'BLOCKER_SCHEMA_CREATE'
      WHEN o.service_oid IS NULL OR NOT has_schema_privilege(o.service_oid,n.oid,'USAGE') THEN 'BLOCKER_SERVICE_SCHEMA_USAGE'
      ELSE 'PASS' END AS status
  FROM (VALUES('public'),('extensions'),('auth')) x(name) CROSS JOIN operator_context o LEFT JOIN pg_catalog.pg_namespace n ON n.nspname=x.name
), all_checks AS (
  SELECT 'relation' AS kind,name AS object,status FROM relation_checks UNION ALL
  SELECT 'column',relation||'.'||name,status FROM column_checks UNION ALL
  SELECT 'function',name,status FROM function_checks UNION ALL
  SELECT 'view',name,status FROM view_checks UNION ALL
  SELECT 'index',name,status FROM index_checks UNION ALL
  SELECT 'key',relation,status FROM key_checks UNION ALL
  SELECT 'foreign_key',name,status FROM progress_fk_check UNION ALL
  SELECT 'role',name,status FROM role_checks UNION ALL
  SELECT 'dependency',name||' -> '||dependent,status FROM dependencies UNION ALL
  SELECT 'relation_privilege',name,status FROM relation_privileges UNION ALL
  SELECT 'function_privilege',name,status FROM function_privileges UNION ALL
  SELECT 'ownership',name,status FROM ownership UNION ALL
  SELECT 'schema',name,status FROM schema_privileges UNION ALL
  SELECT 'future_trigger',relation||'.'||name,status FROM required_trigger_checks UNION ALL
  SELECT 'extension','pg_trgm',status FROM extension_check UNION ALL
  SELECT 'history','supabase_migrations.schema_migrations',CASE WHEN available THEN 'PASS' ELSE 'BLOCKER_HISTORY_NOT_AVAILABLE' END FROM history UNION ALL
  SELECT 'postgres','server_version',CASE WHEN version_num>=150000 THEN 'PASS' ELSE 'BLOCKER_POSTGRES_VERSION' END FROM operator_context
)
SELECT jsonb_build_object(
  'scope','METADATA_ONLY_NO_INVENTORY_OR_RPC_EXECUTION',
  'postgres',(SELECT to_jsonb(o)-'service_oid' FROM operator_context o),
  'pg_trgm',(SELECT to_jsonb(e)||jsonb_build_object('expected_schema','extensions','compatible',e.status IN ('PASS','NOT_INSTALLED_PLANNED_IN_EXTENSIONS')) FROM extension_check e),
  'migration_history_available',(SELECT available FROM history),
  'migrations',(SELECT jsonb_agg(to_jsonb(m) ORDER BY version) FROM migration_checks m),
  'relations',(SELECT jsonb_agg(to_jsonb(r) ORDER BY name) FROM relation_checks r),
  'columns',(SELECT jsonb_agg(to_jsonb(c) ORDER BY relation,name) FROM column_checks c),
  'function_signatures',(SELECT jsonb_agg(to_jsonb(f)-'oid' ORDER BY name) FROM function_checks f),
  'function_body_fingerprints',(SELECT jsonb_agg(to_jsonb(f) ORDER BY migration,name) FROM function_fingerprints f),
  'view_replace_compatibility',(SELECT jsonb_agg(to_jsonb(v) ORDER BY name) FROM view_checks v),
  'dependencies',(SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY name,dependent),'[]'::jsonb) FROM dependencies d),
  'indexes',(SELECT jsonb_agg(to_jsonb(i) ORDER BY name) FROM index_checks i),
  'unique_keys',(SELECT jsonb_agg(to_jsonb(k) ORDER BY relation) FROM key_checks k),
  'progress_profile_foreign_key',(SELECT to_jsonb(f) FROM progress_fk_check f),
  'privileges',jsonb_build_object('roles',(SELECT jsonb_agg(to_jsonb(r)-'oid' ORDER BY name) FROM role_checks r),
    'schemas',(SELECT jsonb_agg(to_jsonb(s) ORDER BY name) FROM schema_privileges s),
    'relations',(SELECT jsonb_agg(to_jsonb(r) ORDER BY name) FROM relation_privileges r),
    'functions',(SELECT jsonb_agg(to_jsonb(f) ORDER BY name) FROM function_privileges f),
    'replacement_ownership',(SELECT coalesce(jsonb_agg(to_jsonb(o) ORDER BY name),'[]'::jsonb) FROM ownership o),
    'database_create',has_database_privilege(current_database(),'CREATE')),
  'triggers',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY relation,tgname),'[]'::jsonb) FROM trigger_checks t),
  'future_trigger_requirements',(SELECT jsonb_agg(to_jsonb(t) ORDER BY relation,name) FROM required_trigger_checks t),
  'constraints',(SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY relation,conname),'[]'::jsonb) FROM constraint_metadata c),
  'blockers',(SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY kind,object),'[]'::jsonb) FROM all_checks c WHERE status LIKE 'BLOCKER_%'),
  'review_required',(SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY kind,object),'[]'::jsonb) FROM all_checks c WHERE status IN ('EXISTS_DEFINITION_REVIEW_REQUIRED','RLS_POLICY_REVIEW_REQUIRED','REPLACEMENT_GRANTS_REVIEW_REQUIRED')),
  'not_verified',jsonb_build_array('PROD release gate values must be false before canary','Actual published rollback deploy ID and object backups','Available Disk IO budget for synchronous index builds','Unrecorded migrations may have been applied manually; compare object metadata before applying','Operational singleton/checkpoint contents not read; bounded canary still required','No consumer readiness or product validation inferred from catalogs')
) AS cvitae_release_preflight;
