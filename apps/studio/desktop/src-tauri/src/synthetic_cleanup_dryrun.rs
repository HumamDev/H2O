// F5H.3b.0d — true transactional synthetic cleanup DRY-RUN.
//
// Runs the exact future cleanup transaction shape (audit insert → review
// delete → tombstone delete → count verification) against the real loaded
// Desktop SQLite database, using the canonical SYNTHETIC_PREDICATE_V1 from
// crate::synthetic_marker, then ALWAYS rolls back. After the call, the
// logical DB state (row counts of the three tables touched) MUST be
// identical to the pre-call state.
//
// This module owns NO real-cleanup code. There is no COMMIT path. There
// is no `cleanupSynthetic` API. F5H.3b.1 will introduce real cleanup as
// a separate commit by extending the same proof shape with an explicit
// gate-checked commit step; F5H.3b.0d is the bridge that proves the
// predicate + transaction work end-to-end on real data without writing
// anything.

use serde::Serialize;
use serde_json::Value as JsonValue;
use sqlx::{Connection, Row, SqliteConnection};
use std::sync::atomic::{AtomicU64, Ordering};

use crate::synthetic_marker;

pub const DRY_RUN_RESULT_SCHEMA: &str = "h2o.studio.synthetic-cleanup-transaction-dry-run.v1";
pub const AUDIT_SCHEMA: &str = "h2o.studio.sync.maintenance.v1";
pub const AUDIT_OPERATION_DRY_RUN: &str = "cleanup-synthetic-dry-run";
pub const PLATFORM_DESKTOP: &str = "desktop-tauri";

// Monotonic counter for audit IDs that survive long enough to roll back.
// Combined with a microsecond timestamp this produces a unique-per-call
// identifier without pulling in a uuid crate. The row is rolled back so
// the identifier never persists.
static AUDIT_ID_COUNTER: AtomicU64 = AtomicU64::new(0);

fn make_audit_id() -> String {
    let n = AUDIT_ID_COUNTER.fetch_add(1, Ordering::Relaxed);
    let micros = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_micros())
        .unwrap_or(0);
    format!("f5h3b0d-dry-{micros}-{n}")
}

#[derive(Serialize, Clone, Debug)]
pub struct DryRunCounts {
    pub tombstones: i64,
    pub reviews: i64,
    pub total: i64,
}

#[derive(Serialize, Clone, Debug)]
pub struct ScannedCounts {
    pub tombstones: i64,
    pub reviews: i64,
    #[serde(rename = "maintenanceLog")]
    pub maintenance_log: i64,
}

#[derive(Serialize, Clone, Debug)]
pub struct AuditState {
    #[serde(rename = "insertedInTransaction")]
    pub inserted_in_transaction: bool,
    pub persisted: bool,
    #[serde(rename = "rollbackExpected")]
    pub rollback_expected: bool,
    #[serde(rename = "auditMaintenanceId")]
    pub audit_maintenance_id: Option<String>,
}

#[derive(Serialize, Clone, Debug)]
pub struct ActionsState {
    #[serde(rename = "deletedRows")]
    pub deleted_rows: bool,
    #[serde(rename = "mutatedRows")]
    pub mutated_rows: bool,
    #[serde(rename = "realCleanupImplemented")]
    pub real_cleanup_implemented: bool,
}

#[derive(Serialize, Clone, Debug)]
pub struct RollbackState {
    pub performed: bool,
    pub verified: bool,
    #[serde(rename = "rollbackReason")]
    pub rollback_reason: Option<String>,
}

#[derive(Serialize, Clone, Debug)]
pub struct DryRunResult {
    pub schema: &'static str,
    #[serde(rename = "generatedAt")]
    pub generated_at: String,
    pub redacted: bool,
    #[serde(rename = "dryRun")]
    pub dry_run: bool,
    pub transactional: bool,
    pub platform: &'static str,
    #[serde(rename = "predicateVersion")]
    pub predicate_version: &'static str,
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub blocker: Option<String>,
    #[serde(rename = "wouldDeleteRows")]
    pub would_delete_rows: DryRunCounts,
    pub scanned: ScannedCounts,
    pub audit: AuditState,
    pub actions: ActionsState,
    pub rollback: RollbackState,
    pub warnings: Vec<String>,
}

impl DryRunResult {
    fn skeleton(now_iso: &str) -> Self {
        Self {
            schema: DRY_RUN_RESULT_SCHEMA,
            generated_at: now_iso.to_string(),
            redacted: true,
            dry_run: true,
            transactional: true,
            platform: PLATFORM_DESKTOP,
            predicate_version: synthetic_marker::SYNTHETIC_PREDICATE_VERSION,
            ok: false,
            blocker: None,
            would_delete_rows: DryRunCounts { tombstones: 0, reviews: 0, total: 0 },
            scanned: ScannedCounts { tombstones: 0, reviews: 0, maintenance_log: 0 },
            audit: AuditState {
                inserted_in_transaction: false,
                persisted: false,
                rollback_expected: true,
                audit_maintenance_id: None,
            },
            actions: ActionsState {
                deleted_rows: false,
                mutated_rows: false,
                real_cleanup_implemented: false,
            },
            rollback: RollbackState {
                performed: false,
                verified: false,
                rollback_reason: None,
            },
            warnings: vec![],
        }
    }

    fn blocked(now_iso: &str, code: &str) -> Self {
        let mut r = Self::skeleton(now_iso);
        r.ok = false;
        r.blocker = Some(code.to_string());
        r
    }

    /// Public blocked-result helper for early-fail call sites in lib.rs
    /// (DB unavailable, acquire failed, etc.). Uses a coarse timestamp.
    pub fn skeleton_blocked(code: &str) -> Self {
        let micros = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        let approx = format!("{:020}Z", micros);
        Self::blocked(&approx, code)
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
struct CountSnapshot {
    tombstones: i64,
    reviews: i64,
    maintenance_log: i64,
}

async fn capture_counts(conn: &mut SqliteConnection) -> Result<CountSnapshot, sqlx::Error> {
    let tombstones: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM sync_tombstones")
        .fetch_one(&mut *conn)
        .await?;
    let reviews: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM sync_tombstone_reviews")
        .fetch_one(&mut *conn)
        .await?;
    let maintenance: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM sync_maintenance_log")
        .fetch_one(&mut *conn)
        .await?;
    Ok(CountSnapshot {
        tombstones: tombstones.0,
        reviews: reviews.0,
        maintenance_log: maintenance.0,
    })
}

async fn table_exists_with_column(
    conn: &mut SqliteConnection,
    table: &str,
    column: &str,
) -> bool {
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

async fn table_exists(conn: &mut SqliteConnection, table: &str) -> bool {
    let rows = sqlx::query(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
    )
    .bind(table)
    .fetch_all(&mut *conn)
    .await;
    rows.map(|r| !r.is_empty()).unwrap_or(false)
}

/// Failure mode injection — TEST USE ONLY. Production callers always pass
/// `None`. Used by the F5H.3b.0d unit suite to simulate audit-insert and
/// delete-count-mismatch races.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum DryRunFailure {
    AuditInsert,
    ReviewDeleteMismatch,
    TombstoneDeleteMismatch,
}

/// Run the dry-run transaction. Always ROLLBACKs (even on apparent success).
/// `now_iso` controls the age-floor cutoff used by SYNTHETIC_PREDICATE_V1.
/// `requested_by` and `reason` go into the (rolled-back) audit row only.
pub async fn run_dry_run(
    conn: &mut SqliteConnection,
    now_iso: String,
    requested_by: String,
    reason: String,
    inject_failure: Option<DryRunFailure>,
) -> DryRunResult {
    let mut result = DryRunResult::skeleton(&now_iso);

    // ── Pre-flight: required schema must be present. Cheap probes that
    // don't open a transaction.
    if !table_exists_with_column(conn, "sync_tombstones", "is_synthetic").await
        || !table_exists_with_column(conn, "sync_tombstone_reviews", "is_synthetic").await
    {
        return DryRunResult::blocked(&now_iso, "synthetic-marker-migration-missing");
    }
    if !table_exists(conn, "sync_maintenance_log").await {
        return DryRunResult::blocked(&now_iso, "maintenance-log-migration-missing");
    }

    // ── Capture before-counts on the same connection. These are the
    // logical state we will verify hasn't changed after rollback.
    let before = match capture_counts(conn).await {
        Ok(c) => c,
        Err(e) => {
            result.blocker = Some(format!("before-count-failed: {e}"));
            return result;
        }
    };
    result.scanned = ScannedCounts {
        tombstones: before.tombstones,
        reviews: before.reviews,
        maintenance_log: before.maintenance_log,
    };

    // ── BEGIN. Inside the txn, audit insert runs first to upgrade the
    // SQLite lock to RESERVED before any SELECT. This prevents another
    // writer from changing the candidate set between SELECT and DELETE.
    let mut tx = match conn.begin().await {
        Ok(tx) => tx,
        Err(e) => {
            result.blocker = Some(format!("txn-begin-failed: {e}"));
            return result;
        }
    };

    let audit_id = make_audit_id();

    // Inner closure pattern so we can guarantee a single ROLLBACK call
    // at the end regardless of where we exit.
    let inner: Result<InnerSuccess, InnerFailure> = async {
        // 1. Audit insert (lock upgrade).
        if inject_failure == Some(DryRunFailure::AuditInsert) {
            return Err(InnerFailure {
                blocker: "audit-insert-failed".to_string(),
                rollback_reason: None,
            });
        }
        sqlx::query(
            r#"
            INSERT INTO sync_maintenance_log
              (maintenance_id, schema, operation, policy_version, reason,
               requested_at, requested_by_sync_peer_id, platform, dry_run,
               affected_tombstone_count, affected_review_count, skipped_count,
               warnings_json, result_json, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 0, 0, 0, '[]', '{}', ?)
            "#,
        )
        .bind(&audit_id)
        .bind(AUDIT_SCHEMA)
        .bind(AUDIT_OPERATION_DRY_RUN)
        .bind(synthetic_marker::SYNTHETIC_PREDICATE_VERSION)
        .bind(&reason)
        .bind(&now_iso)
        .bind(&requested_by)
        .bind(PLATFORM_DESKTOP)
        .bind(&now_iso)
        .execute(&mut *tx)
        .await
        .map_err(|e| InnerFailure {
            blocker: format!("audit-insert-failed: {e}"),
            rollback_reason: None,
        })?;

        // 2. Eligible candidate IDs from the v1 predicate. Read-only.
        let tombstone_ids = synthetic_marker::eligible_synthetic_tombstone_ids(
            &mut *tx,
            &now_iso,
        )
        .await
        .map_err(|e| InnerFailure {
            blocker: format!("candidate-select-failed: tombstones: {e}"),
            rollback_reason: None,
        })?;
        let review_ids = synthetic_marker::eligible_synthetic_review_ids(
            &mut *tx,
            &now_iso,
        )
        .await
        .map_err(|e| InnerFailure {
            blocker: format!("candidate-select-failed: reviews: {e}"),
            rollback_reason: None,
        })?;

        // 3. Simulated DELETEs (id-pinned). These are the same statements
        // F5H.3b.1 will execute under COMMIT. Here they run only to
        // verify count parity and exercise the path.
        let review_deleted = delete_by_ids(&mut tx, "sync_tombstone_reviews", "review_id", &review_ids)
            .await
            .map_err(|e| InnerFailure {
                blocker: format!("review-delete-failed: {e}"),
                rollback_reason: None,
            })?;
        let expected_reviews = if inject_failure == Some(DryRunFailure::ReviewDeleteMismatch) {
            // Pretend we expected one more than we actually got. This
            // triggers the count-mismatch rollback path so callers can
            // see how a real drift would surface in F5H.3b.1.
            review_ids.len() as i64 + 1
        } else {
            review_ids.len() as i64
        };
        if review_deleted != expected_reviews {
            return Err(InnerFailure {
                blocker: format!(
                    "review-delete-count-mismatch: expected {} got {}",
                    expected_reviews, review_deleted
                ),
                rollback_reason: Some("review-delete-count-mismatch".to_string()),
            });
        }

        let tombstone_deleted = delete_by_ids(&mut tx, "sync_tombstones", "tombstone_id", &tombstone_ids)
            .await
            .map_err(|e| InnerFailure {
                blocker: format!("tombstone-delete-failed: {e}"),
                rollback_reason: None,
            })?;
        let expected_tombstones = if inject_failure == Some(DryRunFailure::TombstoneDeleteMismatch) {
            tombstone_ids.len() as i64 + 1
        } else {
            tombstone_ids.len() as i64
        };
        if tombstone_deleted != expected_tombstones {
            return Err(InnerFailure {
                blocker: format!(
                    "tombstone-delete-count-mismatch: expected {} got {}",
                    expected_tombstones, tombstone_deleted
                ),
                rollback_reason: Some("tombstone-delete-count-mismatch".to_string()),
            });
        }

        // 4. Audit row UPDATE inside the same txn (also rolled back).
        // Exercises the UPDATE path; result_json carries the in-txn counts.
        let result_json = serde_json::to_string(&JsonValue::Object({
            let mut m = serde_json::Map::new();
            m.insert("dryRun".into(), JsonValue::Bool(true));
            m.insert("wouldDeleteTombstones".into(), JsonValue::from(tombstone_deleted));
            m.insert("wouldDeleteReviews".into(), JsonValue::from(review_deleted));
            m.insert("predicateVersion".into(), JsonValue::from(synthetic_marker::SYNTHETIC_PREDICATE_VERSION));
            m
        }))
        .unwrap_or_else(|_| "{}".to_string());
        sqlx::query(
            r#"
            UPDATE sync_maintenance_log
            SET affected_tombstone_count = ?,
                affected_review_count = ?,
                result_json = ?
            WHERE maintenance_id = ?
            "#,
        )
        .bind(tombstone_deleted)
        .bind(review_deleted)
        .bind(&result_json)
        .bind(&audit_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| InnerFailure {
            blocker: format!("audit-update-failed: {e}"),
            rollback_reason: None,
        })?;

        Ok(InnerSuccess {
            tombstone_count: tombstone_deleted,
            review_count: review_deleted,
        })
    }
    .await;

    // ── ROLLBACK. Unconditional. Even on apparent success.
    let rollback_outcome = tx.rollback().await;
    result.audit.inserted_in_transaction = true;
    result.audit.audit_maintenance_id = Some(audit_id);
    let rollback_ok = rollback_outcome.is_ok();
    result.rollback.performed = rollback_ok;

    // ── Verify after-counts match before-counts.
    let after = match capture_counts(conn).await {
        Ok(c) => c,
        Err(e) => {
            result.blocker = Some(format!("after-count-failed: {e}"));
            return result;
        }
    };
    let counts_match = after == before;
    result.rollback.verified = rollback_ok && counts_match;

    if !rollback_ok {
        result.blocker = Some("rollback-failed".to_string());
        return result;
    }
    if !counts_match {
        result.blocker = Some("rollback-verification-failed".to_string());
        return result;
    }

    match inner {
        Ok(success) => {
            result.ok = true;
            result.would_delete_rows = DryRunCounts {
                tombstones: success.tombstone_count,
                reviews: success.review_count,
                total: success.tombstone_count + success.review_count,
            };
            result
        }
        Err(failure) => {
            if let Some(reason) = failure.rollback_reason.as_ref() {
                // Count-mismatch: txn rolled back cleanly, surfaced as
                // a non-fatal rollback reason. ok = true so the caller
                // sees the counts and can decide.
                result.ok = true;
                result.rollback.rollback_reason = Some(reason.clone());
            } else {
                result.ok = false;
                result.blocker = Some(failure.blocker);
            }
            result
        }
    }
}

struct InnerSuccess {
    tombstone_count: i64,
    review_count: i64,
}

struct InnerFailure {
    blocker: String,
    rollback_reason: Option<String>,
}

async fn delete_by_ids(
    tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    table: &str,
    id_column: &str,
    ids: &[String],
) -> Result<i64, sqlx::Error> {
    if ids.is_empty() {
        return Ok(0);
    }
    let placeholders = std::iter::repeat("?")
        .take(ids.len())
        .collect::<Vec<_>>()
        .join(", ");
    let sql = format!("DELETE FROM {table} WHERE {id_column} IN ({placeholders})");
    let mut q = sqlx::query(&sql);
    for id in ids {
        q = q.bind(id);
    }
    let result = q.execute(&mut **tx).await?;
    Ok(result.rows_affected() as i64)
}

#[cfg(test)]
mod dryrun_tests {
    use super::*;

    #[test]
    fn skeleton_has_v1_schema_and_v1_predicate_version() {
        let r = DryRunResult::skeleton("2026-06-01T00:00:00Z");
        assert_eq!(r.schema, "h2o.studio.synthetic-cleanup-transaction-dry-run.v1");
        assert_eq!(
            r.predicate_version,
            "h2o.studio.sync.synthetic-marker.v1"
        );
        assert_eq!(r.platform, "desktop-tauri");
        assert!(r.redacted);
        assert!(r.dry_run);
        assert!(r.transactional);
        assert!(!r.actions.deleted_rows);
        assert!(!r.actions.mutated_rows);
        assert!(!r.actions.real_cleanup_implemented);
    }

    #[test]
    fn blocked_carries_code() {
        let r = DryRunResult::blocked("2026-06-01T00:00:00Z", "test-blocker");
        assert!(!r.ok);
        assert_eq!(r.blocker.as_deref(), Some("test-blocker"));
    }

    #[test]
    fn audit_id_is_unique_per_call() {
        let a = make_audit_id();
        let b = make_audit_id();
        assert_ne!(a, b);
        assert!(a.starts_with("f5h3b0d-dry-"));
        assert!(b.starts_with("f5h3b0d-dry-"));
    }
}
