// F6.4b - manual sync conflict candidate ingestion.
//
// This module owns the first write path into sync_conflicts. It is deliberately
// narrow: callers must pass sanitized candidate write plans, and the command
// only inserts new evidence rows or updates duplicate sighting metadata inside
// one SQLite transaction. It never merges, applies, resolves, deletes, or
// discovers candidates automatically.

use serde::{Deserialize, Serialize};
use sqlx::{Connection, SqliteConnection};
use std::sync::atomic::{AtomicU64, Ordering};

pub const INGEST_SCHEMA: &str = "h2o.studio.sync-conflict-ingest.v1";
pub const CONFLICT_SCHEMA: &str = "h2o.studio.sync-conflict.v1";
const PLATFORM_DESKTOP: &str = "desktop-tauri";
const MAX_INGEST_PLANS: usize = 10_000;

static CONFLICT_ID_COUNTER: AtomicU64 = AtomicU64::new(0);

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncConflictIngestPayload {
    pub source: String,
    pub reason: String,
    #[serde(default)]
    pub plans: Vec<SyncConflictIngestPlan>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncConflictIngestPlan {
    pub dedupe_key: String,
    pub conflict_kind: String,
    pub entity_kind: String,
    pub classification: String,
    pub severity: String,
    #[serde(default)]
    pub remote_export_id: Option<String>,
    #[serde(default)]
    pub remote_sequence_number: Option<i64>,
    #[serde(default)]
    pub local_version_digest: Option<String>,
    #[serde(default)]
    pub remote_version_digest: Option<String>,
    #[serde(default)]
    pub local_updated_at: Option<String>,
    #[serde(default)]
    pub remote_updated_at: Option<String>,
    pub raw_local_summary_json: String,
    pub raw_remote_summary_json: String,
    pub warnings_json: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncConflictIngestBlocker {
    pub code: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncConflictIngestResult {
    pub schema: &'static str,
    pub ok: bool,
    pub dry_run: bool,
    pub redacted: bool,
    pub platform: &'static str,
    pub inserted: i64,
    pub updated: i64,
    pub failed: i64,
    pub writes_performed: i64,
    pub blockers: Vec<SyncConflictIngestBlocker>,
    pub warnings: Vec<String>,
}

impl SyncConflictIngestResult {
    pub fn rejected(code: &str) -> Self {
        Self {
            schema: INGEST_SCHEMA,
            ok: false,
            dry_run: false,
            redacted: true,
            platform: PLATFORM_DESKTOP,
            inserted: 0,
            updated: 0,
            failed: 0,
            writes_performed: 0,
            blockers: vec![SyncConflictIngestBlocker {
                code: code.to_string(),
            }],
            warnings: vec![],
        }
    }

    fn committed(inserted: i64, updated: i64) -> Self {
        Self {
            schema: INGEST_SCHEMA,
            ok: true,
            dry_run: false,
            redacted: true,
            platform: PLATFORM_DESKTOP,
            inserted,
            updated,
            failed: 0,
            writes_performed: inserted + updated,
            blockers: vec![],
            warnings: vec![],
        }
    }

    fn rolled_back(code: &str, failed: i64) -> Self {
        let mut result = Self::rejected(code);
        result.failed = failed;
        result
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum IngestFailure {
    Insert,
    Update,
}

fn make_conflict_id() -> String {
    let n = CONFLICT_ID_COUNTER.fetch_add(1, Ordering::Relaxed);
    let micros = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_micros())
        .unwrap_or(0);
    format!("f6-conflict-{micros}-{n}")
}

fn valid_reason(reason: &str) -> bool {
    let trimmed = reason.trim();
    !trimmed.is_empty() && trimmed.len() <= 256 && !trimmed.chars().any(|c| c.is_control())
}

fn valid_code_string(value: &str, max_len: usize) -> bool {
    let trimmed = value.trim();
    !trimmed.is_empty()
        && trimmed.len() <= max_len
        && trimmed
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | ':' | '-'))
}

fn valid_optional_code(value: &Option<String>, max_len: usize) -> bool {
    match value {
        None => true,
        Some(v) => valid_code_string(v, max_len),
    }
}

fn valid_optional_timestamp(value: &Option<String>) -> bool {
    match value {
        None => true,
        Some(v) => {
            let trimmed = v.trim();
            !trimmed.is_empty()
                && trimmed.len() <= 64
                && trimmed
                    .chars()
                    .all(|c| c.is_ascii_digit() || matches!(c, 'T' | 'Z' | ':' | '.' | '-' | '+'))
        }
    }
}

fn valid_conflict_kind(value: &str) -> bool {
    matches!(
        value,
        "same-record-divergent-metadata"
            | "local-newer-than-remote"
            | "remote-newer-than-local"
            | "duplicate-identity"
            | "folder-membership-divergence"
            | "label-binding-divergence"
            | "category-binding-divergence"
            | "visual-metadata-divergence"
            | "unsupported-merge-kind"
            | "delete-vs-edit-reference"
    )
}

fn valid_entity_kind(value: &str) -> bool {
    matches!(
        value,
        "folder"
            | "folderBinding"
            | "chat"
            | "snapshot"
            | "label"
            | "labelBinding"
            | "category"
            | "categoryBinding"
            | "visualMetadata"
            | "linkedOnlyChat"
            | "savedSnapshot"
            | "unknown"
    )
}

fn valid_classification(value: &str) -> bool {
    matches!(
        value,
        "safe-review"
            | "needs-human-review"
            | "dangerous-auto-merge"
            | "unsupported-record-kind"
            | "delete-vs-edit-owned-by-f5"
            | "local-comparison-unavailable"
            | "malformed-remote-record"
            | "duplicate-candidate"
    )
}

fn valid_severity(value: &str) -> bool {
    matches!(value, "info" | "low" | "medium" | "high" | "critical")
}

fn valid_json_object(raw: &str) -> bool {
    serde_json::from_str::<serde_json::Value>(raw)
        .map(|v| v.is_object())
        .unwrap_or(false)
}

fn valid_json_array(raw: &str) -> bool {
    serde_json::from_str::<serde_json::Value>(raw)
        .map(|v| v.is_array())
        .unwrap_or(false)
}

fn validate_plan(plan: &SyncConflictIngestPlan) -> bool {
    valid_code_string(&plan.dedupe_key, 220)
        && plan.dedupe_key.starts_with("candidate-hash:")
        && valid_conflict_kind(&plan.conflict_kind)
        && valid_entity_kind(&plan.entity_kind)
        && valid_classification(&plan.classification)
        && valid_severity(&plan.severity)
        && valid_optional_code(&plan.remote_export_id, 256)
        && plan.remote_sequence_number.map(|n| n >= 0).unwrap_or(true)
        && valid_optional_code(&plan.local_version_digest, 256)
        && valid_optional_code(&plan.remote_version_digest, 256)
        && valid_optional_timestamp(&plan.local_updated_at)
        && valid_optional_timestamp(&plan.remote_updated_at)
        && valid_json_object(&plan.raw_local_summary_json)
        && valid_json_object(&plan.raw_remote_summary_json)
        && valid_json_array(&plan.warnings_json)
}

async fn table_exists(conn: &mut SqliteConnection, table: &str) -> bool {
    let rows = sqlx::query("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
        .bind(table)
        .fetch_all(&mut *conn)
        .await;
    rows.map(|r| !r.is_empty()).unwrap_or(false)
}

pub async fn run_ingest(
    conn: &mut SqliteConnection,
    payload: SyncConflictIngestPayload,
    now_iso: String,
    inject_failure: Option<IngestFailure>,
) -> SyncConflictIngestResult {
    if !valid_reason(&payload.reason) {
        return SyncConflictIngestResult::rejected("invalid-reason");
    }
    if !valid_code_string(&payload.source, 80) {
        return SyncConflictIngestResult::rejected("invalid-source");
    }
    if payload.plans.len() > MAX_INGEST_PLANS {
        return SyncConflictIngestResult::rejected("invalid-candidates");
    }
    if payload.plans.iter().any(|p| !validate_plan(p)) {
        return SyncConflictIngestResult::rejected("invalid-write-plan");
    }
    if payload.plans.is_empty() {
        return SyncConflictIngestResult::committed(0, 0);
    }
    if !table_exists(conn, "sync_conflicts").await {
        return SyncConflictIngestResult::rejected("sync-conflicts-table-missing");
    }

    let mut tx = match conn.begin().await {
        Ok(tx) => tx,
        Err(_) => return SyncConflictIngestResult::rejected("transaction-begin-failed"),
    };
    let mut inserted = 0_i64;
    let mut updated = 0_i64;

    let inner: Result<(), &'static str> = async {
        for plan in payload.plans.iter() {
            let existing =
                sqlx::query("SELECT conflict_id FROM sync_conflicts WHERE dedupe_key = ? LIMIT 1")
                    .bind(&plan.dedupe_key)
                    .fetch_optional(&mut *tx)
                    .await
                    .map_err(|_| "dedupe-lookup-failed")?;
            if existing.is_none() {
                if inject_failure == Some(IngestFailure::Insert) {
                    return Err("insert-failed");
                }
                sqlx::query(
                    r#"
                    INSERT INTO sync_conflicts (
                      conflict_id, schema, conflict_kind, entity_kind, entity_id,
                      local_peer_id, remote_peer_id, remote_export_id, remote_sequence_number,
                      local_version_digest, remote_version_digest, local_updated_at,
                      remote_updated_at, classification, status, severity, first_seen_at,
                      last_seen_at, seen_count, dedupe_key, raw_local_summary_json,
                      raw_remote_summary_json, warnings_json, decision, decided_at,
                      decided_by_sync_peer_id, created_at, updated_at
                    )
                    VALUES (?, ?, ?, ?, NULL, NULL, NULL, ?, ?, ?, ?, ?, ?, ?, 'pending', ?,
                            ?, ?, 1, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?)
                    "#,
                )
                .bind(make_conflict_id())
                .bind(CONFLICT_SCHEMA)
                .bind(&plan.conflict_kind)
                .bind(&plan.entity_kind)
                .bind(plan.remote_export_id.as_deref())
                .bind(plan.remote_sequence_number)
                .bind(plan.local_version_digest.as_deref())
                .bind(plan.remote_version_digest.as_deref())
                .bind(plan.local_updated_at.as_deref())
                .bind(plan.remote_updated_at.as_deref())
                .bind(&plan.classification)
                .bind(&plan.severity)
                .bind(&now_iso)
                .bind(&now_iso)
                .bind(&plan.dedupe_key)
                .bind(&plan.raw_local_summary_json)
                .bind(&plan.raw_remote_summary_json)
                .bind(&plan.warnings_json)
                .bind(&now_iso)
                .bind(&now_iso)
                .execute(&mut *tx)
                .await
                .map_err(|_| "insert-failed")?;
                inserted += 1;
            } else {
                if inject_failure == Some(IngestFailure::Update) {
                    return Err("update-failed");
                }
                let update = sqlx::query(
                    r#"
                    UPDATE sync_conflicts
                       SET seen_count = seen_count + 1,
                           last_seen_at = ?,
                           updated_at = ?,
                           remote_export_id = COALESCE(?, remote_export_id),
                           remote_sequence_number = COALESCE(?, remote_sequence_number),
                           warnings_json = ?
                     WHERE dedupe_key = ?
                    "#,
                )
                .bind(&now_iso)
                .bind(&now_iso)
                .bind(plan.remote_export_id.as_deref())
                .bind(plan.remote_sequence_number)
                .bind(&plan.warnings_json)
                .bind(&plan.dedupe_key)
                .execute(&mut *tx)
                .await
                .map_err(|_| "update-failed")?;
                if update.rows_affected() != 1 {
                    return Err("update-failed");
                }
                updated += 1;
            }
        }
        Ok(())
    }
    .await;

    if let Err(code) = inner {
        let _ = tx.rollback().await;
        return SyncConflictIngestResult::rolled_back(code, payload.plans.len() as i64);
    }
    if tx.commit().await.is_err() {
        return SyncConflictIngestResult::rolled_back(
            "transaction-commit-failed",
            payload.plans.len() as i64,
        );
    }

    SyncConflictIngestResult::committed(inserted, updated)
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::{Row, SqliteConnection};

    async fn setup_conn() -> SqliteConnection {
        let mut conn = SqliteConnection::connect(":memory:").await.unwrap();
        sqlx::query(
            r#"
            CREATE TABLE sync_conflicts (
              conflict_id             TEXT PRIMARY KEY,
              schema                  TEXT NOT NULL,
              conflict_kind           TEXT NOT NULL,
              entity_kind             TEXT NOT NULL,
              entity_id               TEXT,
              local_peer_id           TEXT,
              remote_peer_id          TEXT,
              remote_export_id        TEXT,
              remote_sequence_number  INTEGER,
              local_version_digest    TEXT,
              remote_version_digest   TEXT,
              local_updated_at        TEXT,
              remote_updated_at       TEXT,
              classification          TEXT NOT NULL,
              status                  TEXT NOT NULL,
              severity                TEXT NOT NULL,
              first_seen_at           TEXT NOT NULL,
              last_seen_at            TEXT NOT NULL,
              seen_count              INTEGER NOT NULL DEFAULT 1,
              dedupe_key              TEXT NOT NULL UNIQUE,
              raw_local_summary_json  TEXT NOT NULL DEFAULT '{}',
              raw_remote_summary_json TEXT NOT NULL DEFAULT '{}',
              warnings_json           TEXT NOT NULL DEFAULT '[]',
              decision                TEXT,
              decided_at              TEXT,
              decided_by_sync_peer_id TEXT,
              created_at              TEXT NOT NULL,
              updated_at              TEXT NOT NULL
            )
            "#,
        )
        .execute(&mut conn)
        .await
        .unwrap();
        conn
    }

    fn plan(hash: &str) -> SyncConflictIngestPlan {
        SyncConflictIngestPlan {
            dedupe_key: format!("candidate-hash:{hash}"),
            conflict_kind: "same-record-divergent-metadata".to_string(),
            entity_kind: "folder".to_string(),
            classification: "needs-human-review".to_string(),
            severity: "medium".to_string(),
            remote_export_id: Some("export-001".to_string()),
            remote_sequence_number: Some(7),
            local_version_digest: Some("local-digest-001".to_string()),
            remote_version_digest: Some("remote-digest-001".to_string()),
            local_updated_at: Some("2026-01-01T00:00:00Z".to_string()),
            remote_updated_at: Some("2026-01-02T00:00:00Z".to_string()),
            raw_local_summary_json: r#"{"redacted":true,"side":"local"}"#.to_string(),
            raw_remote_summary_json: r#"{"redacted":true,"side":"remote"}"#.to_string(),
            warnings_json: r#"[{"code":"fixture-warning"}]"#.to_string(),
        }
    }

    fn payload(plans: Vec<SyncConflictIngestPlan>) -> SyncConflictIngestPayload {
        SyncConflictIngestPayload {
            source: "manual-devtools".to_string(),
            reason: "manual conflict queue validation".to_string(),
            plans,
        }
    }

    #[test]
    fn f6_conflict_ingest_valid_candidate_inserts_pending_row() {
        tauri::async_runtime::block_on(async {
            let mut conn = setup_conn().await;
            let result = run_ingest(
                &mut conn,
                payload(vec![plan("insert-001")]),
                "2026-01-03T00:00:00Z".to_string(),
                None,
            )
            .await;
            assert!(result.ok);
            assert_eq!(result.inserted, 1);
            assert_eq!(result.updated, 0);
            assert_eq!(result.writes_performed, 1);
            let row = sqlx::query(
                "SELECT status, seen_count, entity_id, local_peer_id, remote_peer_id FROM sync_conflicts WHERE dedupe_key = ?",
            )
            .bind("candidate-hash:insert-001")
            .fetch_one(&mut conn)
            .await
            .unwrap();
            assert_eq!(row.try_get::<String, _>("status").unwrap(), "pending");
            assert_eq!(row.try_get::<i64, _>("seen_count").unwrap(), 1);
            assert!(row
                .try_get::<Option<String>, _>("entity_id")
                .unwrap()
                .is_none());
            assert!(row
                .try_get::<Option<String>, _>("local_peer_id")
                .unwrap()
                .is_none());
            assert!(row
                .try_get::<Option<String>, _>("remote_peer_id")
                .unwrap()
                .is_none());
        });
    }

    #[test]
    fn f6_conflict_ingest_duplicate_updates_seen_count_without_reopening_terminal_row() {
        tauri::async_runtime::block_on(async {
            let mut conn = setup_conn().await;
            let first = run_ingest(
                &mut conn,
                payload(vec![plan("dupe-001")]),
                "2026-01-03T00:00:00Z".to_string(),
                None,
            )
            .await;
            assert!(first.ok);
            sqlx::query(
                "UPDATE sync_conflicts SET status = 'resolved', decision = 'resolved-local-wins', first_seen_at = '2026-01-01T00:00:00Z' WHERE dedupe_key = ?",
            )
            .bind("candidate-hash:dupe-001")
            .execute(&mut conn)
            .await
            .unwrap();
            let second = run_ingest(
                &mut conn,
                payload(vec![plan("dupe-001")]),
                "2026-01-04T00:00:00Z".to_string(),
                None,
            )
            .await;
            assert!(second.ok);
            assert_eq!(second.inserted, 0);
            assert_eq!(second.updated, 1);
            let row = sqlx::query(
                "SELECT status, decision, first_seen_at, last_seen_at, seen_count FROM sync_conflicts WHERE dedupe_key = ?",
            )
            .bind("candidate-hash:dupe-001")
            .fetch_one(&mut conn)
            .await
            .unwrap();
            assert_eq!(row.try_get::<String, _>("status").unwrap(), "resolved");
            assert_eq!(
                row.try_get::<String, _>("decision").unwrap(),
                "resolved-local-wins"
            );
            assert_eq!(
                row.try_get::<String, _>("first_seen_at").unwrap(),
                "2026-01-01T00:00:00Z"
            );
            assert_eq!(
                row.try_get::<String, _>("last_seen_at").unwrap(),
                "2026-01-04T00:00:00Z"
            );
            assert_eq!(row.try_get::<i64, _>("seen_count").unwrap(), 2);
        });
    }

    #[test]
    fn f6_conflict_ingest_rejects_invalid_write_plan_before_transaction() {
        tauri::async_runtime::block_on(async {
            let mut conn = setup_conn().await;
            let mut bad = plan("bad-001");
            bad.dedupe_key = "candidate-code:not-durable".to_string();
            let result = run_ingest(
                &mut conn,
                payload(vec![bad]),
                "2026-01-03T00:00:00Z".to_string(),
                None,
            )
            .await;
            assert!(!result.ok);
            assert_eq!(result.blockers[0].code, "invalid-write-plan");
            let count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM sync_conflicts")
                .fetch_one(&mut conn)
                .await
                .unwrap();
            assert_eq!(count.0, 0);
        });
    }

    #[test]
    fn f6_conflict_ingest_insert_failure_rolls_back_batch() {
        tauri::async_runtime::block_on(async {
            let mut conn = setup_conn().await;
            let result = run_ingest(
                &mut conn,
                payload(vec![plan("rollback-insert-001")]),
                "2026-01-03T00:00:00Z".to_string(),
                Some(IngestFailure::Insert),
            )
            .await;
            assert!(!result.ok);
            assert_eq!(result.blockers[0].code, "insert-failed");
            let count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM sync_conflicts")
                .fetch_one(&mut conn)
                .await
                .unwrap();
            assert_eq!(count.0, 0);
        });
    }

    #[test]
    fn f6_conflict_ingest_update_failure_rolls_back_prior_insert() {
        tauri::async_runtime::block_on(async {
            let mut conn = setup_conn().await;
            let seeded = run_ingest(
                &mut conn,
                payload(vec![plan("rollback-update-existing")]),
                "2026-01-03T00:00:00Z".to_string(),
                None,
            )
            .await;
            assert!(seeded.ok);
            let result = run_ingest(
                &mut conn,
                payload(vec![
                    plan("rollback-update-new"),
                    plan("rollback-update-existing"),
                ]),
                "2026-01-04T00:00:00Z".to_string(),
                Some(IngestFailure::Update),
            )
            .await;
            assert!(!result.ok);
            assert_eq!(result.blockers[0].code, "update-failed");
            let new_count: (i64,) =
                sqlx::query_as("SELECT COUNT(*) FROM sync_conflicts WHERE dedupe_key = ?")
                    .bind("candidate-hash:rollback-update-new")
                    .fetch_one(&mut conn)
                    .await
                    .unwrap();
            assert_eq!(new_count.0, 0);
            let existing = sqlx::query(
                "SELECT seen_count, last_seen_at FROM sync_conflicts WHERE dedupe_key = ?",
            )
            .bind("candidate-hash:rollback-update-existing")
            .fetch_one(&mut conn)
            .await
            .unwrap();
            assert_eq!(existing.try_get::<i64, _>("seen_count").unwrap(), 1);
            assert_eq!(
                existing.try_get::<String, _>("last_seen_at").unwrap(),
                "2026-01-03T00:00:00Z"
            );
        });
    }
}
