// F5H final validation seed helpers.
//
// This module is compiled only for debug Desktop builds (see lib.rs). It is
// intentionally not a production API. It inserts a fixed, tiny synthetic
// fixture set so the already-gated F5H cleanup flow can be validated live
// without touching real Library records.

use serde::{Deserialize, Serialize};
use serde_json::json;
use sqlx::{Connection, Row, Sqlite, SqliteConnection, Transaction};

use crate::synthetic_marker;

pub const SEED_GATE: &str = "I_UNDERSTAND_THIS_SEEDS_SYNTHETIC_F5H_VALIDATION_ROWS";
pub const TEARDOWN_GATE: &str = "I_UNDERSTAND_THIS_REMOVES_F5H_VALIDATION_SEED_ROWS";

const RESULT_SCHEMA: &str = "h2o.studio.f5h-final-validation-seed.v1";
const PLATFORM_DESKTOP: &str = "desktop-tauri-debug";
const VALIDATION_PREFIX: &str = "f5h-final-validation-";
const OLD_ISO: &str = "2000-01-01T00:00:00Z";
const DELETE_REASON: &str = "f5h-final-validation-cleanup";

const ELIGIBLE_TOMBSTONE_ID: &str = "f5h-final-validation-tombstone-eligible-001";
const ELIGIBLE_TOMBSTONE_RECORD_ID: &str = "f5h-final-validation-record-tombstone-eligible-001";

const ELIGIBLE_REVIEW_ID: &str = "f5h-final-validation-review-eligible-001";
const ELIGIBLE_REVIEW_REMOTE_TOMBSTONE_ID: &str =
    "f5h-final-validation-remote-tombstone-eligible-001";
const ELIGIBLE_REVIEW_RECORD_ID: &str = "f5h-final-validation-record-review-eligible-001";
const ELIGIBLE_REVIEW_DEDUPE_KEY: &str = "f5h-final-validation-dedupe-review-eligible-001";

const PENDING_REVIEW_ID: &str = "f5h-final-validation-review-pending-001";
const PENDING_REVIEW_REMOTE_TOMBSTONE_ID: &str =
    "f5h-final-validation-remote-tombstone-pending-001";
const PENDING_REVIEW_RECORD_ID: &str = "f5h-final-validation-record-review-pending-001";
const PENDING_REVIEW_DEDUPE_KEY: &str = "f5h-final-validation-dedupe-review-pending-001";

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct DevSeedPayload {
    #[serde(default)]
    pub dev_gate: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DevSeedCounts {
    pub tombstones: i64,
    pub reviews: i64,
    pub pending_reviews: i64,
    pub total: i64,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DevSeedBlocker {
    pub code: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DevSeedResult {
    pub schema: &'static str,
    pub ok: bool,
    pub redacted: bool,
    pub platform: &'static str,
    pub action: &'static str,
    pub debug_only: bool,
    pub predicate_version: &'static str,
    pub counts: DevSeedCounts,
    pub blockers: Vec<DevSeedBlocker>,
    pub warnings: Vec<String>,
}

impl DevSeedResult {
    pub(crate) fn blocked(action: &'static str, code: &str) -> Self {
        Self {
            schema: RESULT_SCHEMA,
            ok: false,
            redacted: true,
            platform: PLATFORM_DESKTOP,
            action,
            debug_only: true,
            predicate_version: synthetic_marker::SYNTHETIC_PREDICATE_VERSION,
            counts: DevSeedCounts {
                tombstones: 0,
                reviews: 0,
                pending_reviews: 0,
                total: 0,
            },
            blockers: vec![DevSeedBlocker {
                code: code.to_string(),
            }],
            warnings: vec![],
        }
    }

    fn ok(action: &'static str, tombstones: i64, reviews: i64, pending_reviews: i64) -> Self {
        Self {
            schema: RESULT_SCHEMA,
            ok: true,
            redacted: true,
            platform: PLATFORM_DESKTOP,
            action,
            debug_only: true,
            predicate_version: synthetic_marker::SYNTHETIC_PREDICATE_VERSION,
            counts: DevSeedCounts {
                tombstones,
                reviews,
                pending_reviews,
                total: tombstones + reviews,
            },
            blockers: vec![],
            warnings: vec![],
        }
    }
}

async fn table_exists(conn: &mut SqliteConnection, table: &str) -> bool {
    let rows = sqlx::query("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
        .bind(table)
        .fetch_all(&mut *conn)
        .await;
    rows.map(|r| !r.is_empty()).unwrap_or(false)
}

async fn table_exists_with_column(conn: &mut SqliteConnection, table: &str, column: &str) -> bool {
    let query = format!("PRAGMA table_info({table})");
    let Ok(rows) = sqlx::query(&query).fetch_all(&mut *conn).await else {
        return false;
    };
    rows.iter().any(|r| {
        r.try_get::<String, _>("name")
            .map(|n| n == column)
            .unwrap_or(false)
    })
}

async fn schema_ready(conn: &mut SqliteConnection) -> bool {
    table_exists_with_column(conn, "sync_tombstones", "is_synthetic").await
        && table_exists_with_column(conn, "sync_tombstone_reviews", "is_synthetic").await
        && table_exists(conn, "sync_maintenance_log").await
}

async fn existing_validation_row_count(
    tx: &mut Transaction<'_, Sqlite>,
) -> Result<i64, sqlx::Error> {
    let row = sqlx::query(
        r#"
        SELECT
          (SELECT COUNT(*)
             FROM sync_tombstones
            WHERE tombstone_id LIKE ?
               OR record_id LIKE ?
               OR delete_reason LIKE ?) +
          (SELECT COUNT(*)
             FROM sync_tombstone_reviews
            WHERE review_id LIKE ?
               OR remote_tombstone_id LIKE ?
               OR record_id LIKE ?
               OR dedupe_key LIKE ?
               OR delete_reason LIKE ?) AS n
        "#,
    )
    .bind(format!("{VALIDATION_PREFIX}%"))
    .bind(format!("{VALIDATION_PREFIX}%"))
    .bind(format!("{VALIDATION_PREFIX}%"))
    .bind(format!("{VALIDATION_PREFIX}%"))
    .bind(format!("{VALIDATION_PREFIX}%"))
    .bind(format!("{VALIDATION_PREFIX}%"))
    .bind(format!("{VALIDATION_PREFIX}%"))
    .bind(format!("{VALIDATION_PREFIX}%"))
    .fetch_one(&mut **tx)
    .await?;
    Ok(row.try_get::<i64, _>("n").unwrap_or(0))
}

fn seed_tombstone_meta_json() -> String {
    json!({
        "source": "f5h-final-validation-seeder",
        "synthetic": true
    })
    .to_string()
}

fn seed_review_raw_tombstone_json(tombstone_id: &str, record_id: &str) -> String {
    json!({
        "schema": "h2o.studio.tombstone.v1",
        "tombstoneId": tombstone_id,
        "recordKind": "syntheticValidationRecord",
        "recordId": record_id,
        "deletedAt": OLD_ISO,
        "deletedBySyncPeerId": "f5h-final-validation-remote-peer",
        "deleteReason": DELETE_REASON,
        "meta": {
            "source": "f5h-final-validation-seeder",
            "synthetic": true
        }
    })
    .to_string()
}

async fn insert_validation_tombstone(tx: &mut Transaction<'_, Sqlite>) -> Result<u64, sqlx::Error> {
    let result = sqlx::query(
        r#"
        INSERT INTO sync_tombstones (
          tombstone_id, schema, record_kind, record_id, deleted_at,
          deleted_by_sync_peer_id, delete_reason, prior_digest, prior_updated_at,
          source_export_id, source_sequence_number, cascade_from, restored_at,
          restored_by_sync_peer_id, meta_json, created_at, updated_at, is_synthetic
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
        "#,
    )
    .bind(ELIGIBLE_TOMBSTONE_ID)
    .bind("h2o.studio.tombstone.v1")
    .bind("syntheticValidationRecord")
    .bind(ELIGIBLE_TOMBSTONE_RECORD_ID)
    .bind(OLD_ISO)
    .bind("f5h-final-validation-local-peer")
    .bind(DELETE_REASON)
    .bind(Option::<String>::None)
    .bind(Option::<String>::None)
    .bind(Option::<String>::None)
    .bind(Option::<i64>::None)
    .bind(Option::<String>::None)
    .bind(Option::<String>::None)
    .bind(Option::<String>::None)
    .bind(seed_tombstone_meta_json())
    .bind(OLD_ISO)
    .bind(OLD_ISO)
    .execute(&mut **tx)
    .await?;
    Ok(result.rows_affected())
}

async fn insert_validation_review(
    tx: &mut Transaction<'_, Sqlite>,
    review_id: &str,
    remote_tombstone_id: &str,
    record_id: &str,
    dedupe_key: &str,
    status: &str,
    decision: Option<&str>,
    sequence: i64,
) -> Result<u64, sqlx::Error> {
    let result = sqlx::query(
        r#"
        INSERT INTO sync_tombstone_reviews (
          review_id, schema, remote_tombstone_id, remote_sync_peer_id, remote_export_id,
          remote_sequence_number, record_kind, record_id, delete_reason, remote_deleted_at,
          received_at, first_seen_at, last_seen_at, seen_count, last_seen_export_id,
          local_record_exists, local_record_digest, local_updated_at, local_has_newer_edit,
          classification, status, decision, decided_at, decided_by_sync_peer_id,
          dedupe_key, raw_tombstone_json, warnings_json, created_at, updated_at, is_synthetic
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
        "#,
    )
    .bind(review_id)
    .bind("h2o.studio.tombstone-review.v1")
    .bind(remote_tombstone_id)
    .bind("f5h-final-validation-remote-peer")
    .bind("f5h-final-validation-export")
    .bind(sequence)
    .bind("syntheticValidationRecord")
    .bind(record_id)
    .bind(DELETE_REASON)
    .bind(OLD_ISO)
    .bind(OLD_ISO)
    .bind(OLD_ISO)
    .bind(OLD_ISO)
    .bind(1_i64)
    .bind("f5h-final-validation-export")
    .bind(0_i64)
    .bind(Option::<String>::None)
    .bind(Option::<String>::None)
    .bind(0_i64)
    .bind("safe-review")
    .bind(status)
    .bind(decision)
    .bind(decision.map(|_| OLD_ISO))
    .bind(decision.map(|_| "f5h-final-validation-local-peer"))
    .bind(dedupe_key)
    .bind(seed_review_raw_tombstone_json(remote_tombstone_id, record_id))
    .bind("[]")
    .bind(OLD_ISO)
    .bind(OLD_ISO)
    .execute(&mut **tx)
    .await?;
    Ok(result.rows_affected())
}

pub async fn run_seed(conn: &mut SqliteConnection, payload: DevSeedPayload) -> DevSeedResult {
    if payload.dev_gate != SEED_GATE {
        return DevSeedResult::blocked("seed", "invalid-dev-gate");
    }
    if !schema_ready(conn).await {
        return DevSeedResult::blocked("seed", "synthetic-validation-schema-unavailable");
    }
    if synthetic_marker::PROTECTED_TOMBSTONE_DELETE_REASONS.contains(&DELETE_REASON) {
        return DevSeedResult::blocked("seed", "protected-delete-reason");
    }

    let mut tx = match conn.begin().await {
        Ok(tx) => tx,
        Err(_) => return DevSeedResult::blocked("seed", "transaction-begin-failed"),
    };

    match existing_validation_row_count(&mut tx).await {
        Ok(0) => {}
        Ok(_) => {
            let _ = tx.rollback().await;
            return DevSeedResult::blocked("seed", "validation-seed-rows-already-exist");
        }
        Err(_) => {
            let _ = tx.rollback().await;
            return DevSeedResult::blocked("seed", "validation-seed-preflight-failed");
        }
    }

    let tombstones = match insert_validation_tombstone(&mut tx).await {
        Ok(1) => 1,
        _ => {
            let _ = tx.rollback().await;
            return DevSeedResult::blocked("seed", "validation-tombstone-insert-failed");
        }
    };

    let eligible_reviews = match insert_validation_review(
        &mut tx,
        ELIGIBLE_REVIEW_ID,
        ELIGIBLE_REVIEW_REMOTE_TOMBSTONE_ID,
        ELIGIBLE_REVIEW_RECORD_ID,
        ELIGIBLE_REVIEW_DEDUPE_KEY,
        "rejected",
        Some("rejected"),
        1,
    )
    .await
    {
        Ok(1) => 1,
        _ => {
            let _ = tx.rollback().await;
            return DevSeedResult::blocked("seed", "validation-review-insert-failed");
        }
    };

    let pending_reviews = match insert_validation_review(
        &mut tx,
        PENDING_REVIEW_ID,
        PENDING_REVIEW_REMOTE_TOMBSTONE_ID,
        PENDING_REVIEW_RECORD_ID,
        PENDING_REVIEW_DEDUPE_KEY,
        "pending",
        None,
        2,
    )
    .await
    {
        Ok(1) => 1,
        _ => {
            let _ = tx.rollback().await;
            return DevSeedResult::blocked("seed", "validation-pending-review-insert-failed");
        }
    };

    if tx.commit().await.is_err() {
        return DevSeedResult::blocked("seed", "transaction-commit-failed");
    }

    DevSeedResult::ok(
        "seed",
        tombstones,
        eligible_reviews + pending_reviews,
        pending_reviews,
    )
}

pub async fn run_teardown(conn: &mut SqliteConnection, payload: DevSeedPayload) -> DevSeedResult {
    if payload.dev_gate != TEARDOWN_GATE {
        return DevSeedResult::blocked("teardown", "invalid-dev-gate");
    }
    if !schema_ready(conn).await {
        return DevSeedResult::blocked("teardown", "synthetic-validation-schema-unavailable");
    }

    let mut tx = match conn.begin().await {
        Ok(tx) => tx,
        Err(_) => return DevSeedResult::blocked("teardown", "transaction-begin-failed"),
    };

    let reviews = match sqlx::query(
        r#"
        DELETE FROM sync_tombstone_reviews
        WHERE is_synthetic = 1
          AND review_id IN (?, ?)
        "#,
    )
    .bind(ELIGIBLE_REVIEW_ID)
    .bind(PENDING_REVIEW_ID)
    .execute(&mut *tx)
    .await
    {
        Ok(result) => result.rows_affected() as i64,
        Err(_) => {
            let _ = tx.rollback().await;
            return DevSeedResult::blocked("teardown", "validation-review-teardown-failed");
        }
    };

    let tombstones = match sqlx::query(
        r#"
        DELETE FROM sync_tombstones
        WHERE is_synthetic = 1
          AND tombstone_id = ?
        "#,
    )
    .bind(ELIGIBLE_TOMBSTONE_ID)
    .execute(&mut *tx)
    .await
    {
        Ok(result) => result.rows_affected() as i64,
        Err(_) => {
            let _ = tx.rollback().await;
            return DevSeedResult::blocked("teardown", "validation-tombstone-teardown-failed");
        }
    };

    if tx.commit().await.is_err() {
        return DevSeedResult::blocked("teardown", "transaction-commit-failed");
    }

    DevSeedResult::ok(
        "teardown",
        tombstones,
        reviews,
        if reviews > 0 { 1.min(reviews) } else { 0 },
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::Connection;

    async fn setup_schema(conn: &mut SqliteConnection) {
        let statements = [
            r#"
            CREATE TABLE sync_maintenance_log (
              maintenance_id TEXT PRIMARY KEY,
              schema TEXT NOT NULL,
              operation TEXT NOT NULL,
              policy_version TEXT NOT NULL,
              reason TEXT NOT NULL,
              requested_at TEXT NOT NULL,
              requested_by_sync_peer_id TEXT NOT NULL,
              platform TEXT NOT NULL,
              dry_run INTEGER NOT NULL,
              affected_tombstone_count INTEGER NOT NULL DEFAULT 0,
              affected_review_count INTEGER NOT NULL DEFAULT 0,
              skipped_count INTEGER NOT NULL DEFAULT 0,
              warnings_json TEXT NOT NULL DEFAULT '[]',
              result_json TEXT NOT NULL DEFAULT '{}',
              created_at TEXT NOT NULL
            )
            "#,
            r#"
            CREATE TABLE sync_tombstones (
              tombstone_id             TEXT PRIMARY KEY,
              schema                   TEXT NOT NULL,
              record_kind              TEXT NOT NULL,
              record_id                TEXT NOT NULL,
              deleted_at               TEXT NOT NULL,
              deleted_by_sync_peer_id  TEXT NOT NULL,
              delete_reason            TEXT NOT NULL,
              prior_digest             TEXT,
              prior_updated_at         TEXT,
              source_export_id         TEXT,
              source_sequence_number   INTEGER,
              cascade_from             TEXT,
              restored_at              TEXT,
              restored_by_sync_peer_id TEXT,
              meta_json                TEXT NOT NULL DEFAULT '{}',
              created_at               TEXT NOT NULL,
              updated_at               TEXT NOT NULL,
              is_synthetic             INTEGER NOT NULL DEFAULT 0
            )
            "#,
            r#"
            CREATE UNIQUE INDEX idx_sync_tombstones_active_record
              ON sync_tombstones(record_kind, record_id)
              WHERE restored_at IS NULL
            "#,
            r#"
            CREATE TABLE sync_tombstone_reviews (
              review_id                 TEXT PRIMARY KEY,
              schema                    TEXT NOT NULL,
              remote_tombstone_id       TEXT,
              remote_sync_peer_id       TEXT,
              remote_export_id          TEXT,
              remote_sequence_number    INTEGER,
              record_kind               TEXT,
              record_id                 TEXT,
              delete_reason             TEXT,
              remote_deleted_at         TEXT,
              received_at               TEXT NOT NULL,
              first_seen_at             TEXT NOT NULL,
              last_seen_at              TEXT NOT NULL,
              seen_count                INTEGER NOT NULL DEFAULT 1,
              last_seen_export_id       TEXT,
              local_record_exists       INTEGER,
              local_record_digest       TEXT,
              local_updated_at          TEXT,
              local_has_newer_edit      INTEGER,
              classification            TEXT NOT NULL,
              status                    TEXT NOT NULL,
              decision                  TEXT,
              decided_at                TEXT,
              decided_by_sync_peer_id   TEXT,
              dedupe_key                TEXT NOT NULL UNIQUE,
              raw_tombstone_json        TEXT NOT NULL,
              warnings_json             TEXT NOT NULL DEFAULT '[]',
              created_at                TEXT NOT NULL,
              updated_at                TEXT NOT NULL,
              is_synthetic              INTEGER NOT NULL DEFAULT 0
            )
            "#,
        ];
        for statement in statements {
            sqlx::query(statement).execute(&mut *conn).await.unwrap();
        }
    }

    fn run_seed_test<F, Fut, T>(f: F) -> T
    where
        F: FnOnce(SqliteConnection) -> Fut,
        Fut: std::future::Future<Output = T>,
    {
        tauri::async_runtime::block_on(async move {
            let mut conn = SqliteConnection::connect("sqlite::memory:").await.unwrap();
            setup_schema(&mut conn).await;
            f(conn).await
        })
    }

    fn seed_payload() -> DevSeedPayload {
        DevSeedPayload {
            dev_gate: SEED_GATE.to_string(),
        }
    }

    fn teardown_payload() -> DevSeedPayload {
        DevSeedPayload {
            dev_gate: TEARDOWN_GATE.to_string(),
        }
    }

    #[test]
    fn f5h3_final_validation_seeder_inserts_exact_fixture_rows() {
        let (result, tombstones, reviews, pending): (DevSeedResult, i64, i64, i64) =
            run_seed_test(|mut conn| async move {
                let result = run_seed(&mut conn, seed_payload()).await;
                let (tombstones,): (i64,) = sqlx::query_as("SELECT COUNT(*) FROM sync_tombstones")
                    .fetch_one(&mut conn)
                    .await
                    .unwrap();
                let (reviews,): (i64,) =
                    sqlx::query_as("SELECT COUNT(*) FROM sync_tombstone_reviews")
                        .fetch_one(&mut conn)
                        .await
                        .unwrap();
                let (pending,): (i64,) = sqlx::query_as(
                    "SELECT COUNT(*) FROM sync_tombstone_reviews WHERE status = 'pending'",
                )
                .fetch_one(&mut conn)
                .await
                .unwrap();
                (result, tombstones, reviews, pending)
            });

        assert!(result.ok, "blockers={:?}", result.blockers);
        assert_eq!(result.counts.tombstones, 1);
        assert_eq!(result.counts.reviews, 2);
        assert_eq!(result.counts.pending_reviews, 1);
        assert_eq!(tombstones, 1);
        assert_eq!(reviews, 2);
        assert_eq!(pending, 1);
    }

    #[test]
    fn f5h3_final_validation_seeder_rows_match_synthetic_predicate() {
        let (tombstone_ids, review_ids): (Vec<String>, Vec<String>) =
            run_seed_test(|mut conn| async move {
                let result = run_seed(&mut conn, seed_payload()).await;
                assert!(result.ok, "blockers={:?}", result.blockers);
                let tombstone_ids = synthetic_marker::eligible_synthetic_tombstone_ids(
                    &mut conn,
                    "2026-06-01T00:00:00Z",
                )
                .await
                .unwrap();
                let review_ids = synthetic_marker::eligible_synthetic_review_ids(
                    &mut conn,
                    "2026-06-01T00:00:00Z",
                )
                .await
                .unwrap();
                (tombstone_ids, review_ids)
            });

        assert_eq!(tombstone_ids, vec![ELIGIBLE_TOMBSTONE_ID.to_string()]);
        assert_eq!(review_ids, vec![ELIGIBLE_REVIEW_ID.to_string()]);
        assert!(!review_ids.contains(&PENDING_REVIEW_ID.to_string()));
    }

    #[test]
    fn f5h3_final_validation_seeder_refuses_second_run() {
        let second = run_seed_test(|mut conn| async move {
            let first = run_seed(&mut conn, seed_payload()).await;
            assert!(first.ok, "blockers={:?}", first.blockers);
            run_seed(&mut conn, seed_payload()).await
        });

        assert!(!second.ok);
        assert_eq!(
            second.blockers[0].code,
            "validation-seed-rows-already-exist"
        );
    }

    #[test]
    fn f5h3_final_validation_seeder_blocks_wrong_gate() {
        let (result, tombstones, reviews): (DevSeedResult, i64, i64) =
            run_seed_test(|mut conn| async move {
                let result = run_seed(
                    &mut conn,
                    DevSeedPayload {
                        dev_gate: "WRONG_GATE".to_string(),
                    },
                )
                .await;
                let (tombstones,): (i64,) = sqlx::query_as("SELECT COUNT(*) FROM sync_tombstones")
                    .fetch_one(&mut conn)
                    .await
                    .unwrap();
                let (reviews,): (i64,) =
                    sqlx::query_as("SELECT COUNT(*) FROM sync_tombstone_reviews")
                        .fetch_one(&mut conn)
                        .await
                        .unwrap();
                (result, tombstones, reviews)
            });

        assert!(!result.ok);
        assert_eq!(result.blockers[0].code, "invalid-dev-gate");
        assert_eq!(tombstones, 0);
        assert_eq!(reviews, 0);
    }

    #[test]
    fn f5h3_final_validation_teardown_deletes_only_fixed_synthetic_ids() {
        let (result, eligible_review, pending_review, eligible_tombstone, extra_review): (
            DevSeedResult,
            i64,
            i64,
            i64,
            i64,
        ) = run_seed_test(|mut conn| async move {
            let seed = run_seed(&mut conn, seed_payload()).await;
            assert!(seed.ok, "blockers={:?}", seed.blockers);
            sqlx::query(
                r#"
                INSERT INTO sync_tombstone_reviews (
                  review_id, schema, remote_tombstone_id, record_kind, record_id,
                  delete_reason, received_at, first_seen_at, last_seen_at,
                  classification, status, decision, dedupe_key, raw_tombstone_json,
                  warnings_json, created_at, updated_at, is_synthetic
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
                "#,
            )
            .bind("f5h-final-validation-extra-review")
            .bind("h2o.studio.tombstone-review.v1")
            .bind("f5h-final-validation-extra-remote")
            .bind("syntheticValidationRecord")
            .bind("f5h-final-validation-extra-record")
            .bind(DELETE_REASON)
            .bind(OLD_ISO)
            .bind(OLD_ISO)
            .bind(OLD_ISO)
            .bind("safe-review")
            .bind("rejected")
            .bind("rejected")
            .bind("f5h-final-validation-extra-dedupe")
            .bind("{}")
            .bind("[]")
            .bind(OLD_ISO)
            .bind(OLD_ISO)
            .execute(&mut conn)
            .await
            .unwrap();
            let result = run_teardown(&mut conn, teardown_payload()).await;
            let (eligible_review,): (i64,) =
                sqlx::query_as("SELECT COUNT(*) FROM sync_tombstone_reviews WHERE review_id = ?")
                    .bind(ELIGIBLE_REVIEW_ID)
                    .fetch_one(&mut conn)
                    .await
                    .unwrap();
            let (pending_review,): (i64,) =
                sqlx::query_as("SELECT COUNT(*) FROM sync_tombstone_reviews WHERE review_id = ?")
                    .bind(PENDING_REVIEW_ID)
                    .fetch_one(&mut conn)
                    .await
                    .unwrap();
            let (eligible_tombstone,): (i64,) =
                sqlx::query_as("SELECT COUNT(*) FROM sync_tombstones WHERE tombstone_id = ?")
                    .bind(ELIGIBLE_TOMBSTONE_ID)
                    .fetch_one(&mut conn)
                    .await
                    .unwrap();
            let (extra_review,): (i64,) =
                sqlx::query_as("SELECT COUNT(*) FROM sync_tombstone_reviews WHERE review_id = ?")
                    .bind("f5h-final-validation-extra-review")
                    .fetch_one(&mut conn)
                    .await
                    .unwrap();
            (
                result,
                eligible_review,
                pending_review,
                eligible_tombstone,
                extra_review,
            )
        });

        assert!(result.ok, "blockers={:?}", result.blockers);
        assert_eq!(result.counts.tombstones, 1);
        assert_eq!(result.counts.reviews, 2);
        assert_eq!(eligible_review, 0);
        assert_eq!(pending_review, 0);
        assert_eq!(eligible_tombstone, 0);
        assert_eq!(extra_review, 1);
    }

    #[test]
    fn f5h3_final_validation_teardown_requires_synthetic_marker() {
        let (result, pending_after): (DevSeedResult, i64) = run_seed_test(|mut conn| async move {
            let seed = run_seed(&mut conn, seed_payload()).await;
            assert!(seed.ok, "blockers={:?}", seed.blockers);
            sqlx::query("UPDATE sync_tombstone_reviews SET is_synthetic = 0 WHERE review_id = ?")
                .bind(PENDING_REVIEW_ID)
                .execute(&mut conn)
                .await
                .unwrap();
            let result = run_teardown(&mut conn, teardown_payload()).await;
            let (pending_after,): (i64,) =
                sqlx::query_as("SELECT COUNT(*) FROM sync_tombstone_reviews WHERE review_id = ?")
                    .bind(PENDING_REVIEW_ID)
                    .fetch_one(&mut conn)
                    .await
                    .unwrap();
            (result, pending_after)
        });

        assert!(result.ok, "blockers={:?}", result.blockers);
        assert_eq!(pending_after, 1);
    }
}
