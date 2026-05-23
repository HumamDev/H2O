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

use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;
use sha2::{Digest, Sha256};
use sqlx::{Connection, Row, SqliteConnection};
use std::sync::atomic::{AtomicU64, Ordering};

use crate::synthetic_marker;

pub const PREVIEW_TOKEN_PREFIX: &str = "ptok1:";

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

// F5H.3b.1a — opt-in candidate ID + token surface. These fields are
// populated ONLY when the caller passes `include_candidate_ids = true`.
// Default behavior (no flag) returns the F5H.3b.0d shape exactly.

#[derive(Deserialize, Serialize, Clone, Debug)]
pub struct CandidateIds {
    #[serde(rename = "syncTombstoneReviewIds")]
    pub sync_tombstone_review_ids: Vec<String>,
    #[serde(rename = "syncTombstoneIds")]
    pub sync_tombstone_ids: Vec<String>,
}

#[derive(Deserialize, Serialize, Clone, Debug)]
pub struct ExpectedCounts {
    pub reviews: i64,
    pub tombstones: i64,
}

#[derive(Serialize, Clone, Debug)]
pub struct DbFingerprint {
    #[serde(rename = "schemaUserVersion")]
    pub schema_user_version: i64,
    #[serde(rename = "migrationCount")]
    pub migration_count: i64,
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

    // F5H.3b.1a — populated only when include_candidate_ids = true.
    // Skipped from JSON output otherwise to keep default redaction.
    #[serde(rename = "candidateIds", skip_serializing_if = "Option::is_none")]
    pub candidate_ids: Option<CandidateIds>,
    #[serde(rename = "expectedCounts", skip_serializing_if = "Option::is_none")]
    pub expected_counts: Option<ExpectedCounts>,
    #[serde(rename = "previewToken", skip_serializing_if = "Option::is_none")]
    pub preview_token: Option<String>,
    #[serde(rename = "dbFingerprint", skip_serializing_if = "Option::is_none")]
    pub db_fingerprint: Option<DbFingerprint>,
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
            would_delete_rows: DryRunCounts {
                tombstones: 0,
                reviews: 0,
                total: 0,
            },
            scanned: ScannedCounts {
                tombstones: 0,
                reviews: 0,
                maintenance_log: 0,
            },
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
            candidate_ids: None,
            expected_counts: None,
            preview_token: None,
            db_fingerprint: None,
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

async fn table_exists(conn: &mut SqliteConnection, table: &str) -> bool {
    let rows = sqlx::query("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
        .bind(table)
        .fetch_all(&mut *conn)
        .await;
    rows.map(|r| !r.is_empty()).unwrap_or(false)
}

// F5H.3b.1a — sort + dedupe a vector of IDs. Stable in-place sort (Rust
// std uses Timsort). Dedupe drops consecutive equals after sort, which
// is equivalent to set-uniqueness because the sort puts duplicates
// adjacent. Used both for the returned candidate ID lists and as input
// to the deterministic preview token.
fn sort_dedupe(mut ids: Vec<String>) -> Vec<String> {
    ids.sort();
    ids.dedup();
    ids
}

/// F5H.3b.1a — deterministic preview token. Recomputable from
/// caller-supplied + DB-queried inputs alone; no timestamps, no randomness.
/// F5H.3b.1b cleanup will call this with the caller-provided candidate
/// IDs/counts and the current DB fingerprint, and reject if the result
/// does not match the token the caller passed back.
pub fn compute_preview_token(
    schema_user_version: i64,
    migration_count: i64,
    sorted_review_ids: &[String],
    sorted_tombstone_ids: &[String],
    expected_reviews: i64,
    expected_tombstones: i64,
) -> String {
    let mut input = String::new();
    input.push_str(synthetic_marker::SYNTHETIC_PREDICATE_VERSION);
    input.push('\n');
    input.push_str(&format!("schemaUserVersion={schema_user_version}"));
    input.push('\n');
    input.push_str(&format!("migrationCount={migration_count}"));
    input.push('\n');
    input.push_str(&format!("reviews={}", sorted_review_ids.join(",")));
    input.push('\n');
    input.push_str(&format!("tombstones={}", sorted_tombstone_ids.join(",")));
    input.push('\n');
    input.push_str(&format!("expectedReviews={expected_reviews}"));
    input.push('\n');
    input.push_str(&format!("expectedTombstones={expected_tombstones}"));

    let mut hasher = Sha256::new();
    hasher.update(input.as_bytes());
    let bytes = hasher.finalize();
    let mut hex = String::with_capacity(64);
    for b in bytes.iter() {
        hex.push_str(&format!("{:02x}", b));
    }
    format!("{}{}", PREVIEW_TOKEN_PREFIX, hex)
}

/// F5H.3b.1a — read the DB fingerprint inputs for the preview token.
/// `schema_user_version` from `PRAGMA user_version` (tauri-plugin-sql
/// bumps this with each migration; currently 9 after F5H.3b.0d).
/// `migration_count` from `_sqlx_migrations` if present; defaults to 0
/// when the table is missing (e.g. ad-hoc test schema setups).
pub async fn read_db_fingerprint(
    conn: &mut SqliteConnection,
) -> Result<DbFingerprint, sqlx::Error> {
    let (user_version,): (i64,) = sqlx::query_as("PRAGMA user_version")
        .fetch_one(&mut *conn)
        .await?;
    let migration_count: i64 = sqlx::query_as::<_, (i64,)>("SELECT COUNT(*) FROM _sqlx_migrations")
        .fetch_one(&mut *conn)
        .await
        .map(|(c,)| c)
        .unwrap_or(0);
    Ok(DbFingerprint {
        schema_user_version: user_version,
        migration_count,
    })
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
///
/// F5H.3b.1a — when `include_candidate_ids` is true and the dry-run
/// succeeds, the returned result additionally carries `candidate_ids`,
/// `expected_counts`, `preview_token`, and `db_fingerprint` populated.
/// These give a future F5H.3b.1b real-cleanup caller the exact inputs
/// it must echo back, plus a deterministic token Rust will recompute
/// at cleanup time to detect drift. Default behavior (flag false) is
/// byte-identical to F5H.3b.0d.
pub async fn run_dry_run(
    conn: &mut SqliteConnection,
    now_iso: String,
    requested_by: String,
    reason: String,
    inject_failure: Option<DryRunFailure>,
    include_candidate_ids: bool,
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
        let tombstone_ids = synthetic_marker::eligible_synthetic_tombstone_ids(&mut *tx, &now_iso)
            .await
            .map_err(|e| InnerFailure {
                blocker: format!("candidate-select-failed: tombstones: {e}"),
                rollback_reason: None,
            })?;
        let review_ids = synthetic_marker::eligible_synthetic_review_ids(&mut *tx, &now_iso)
            .await
            .map_err(|e| InnerFailure {
                blocker: format!("candidate-select-failed: reviews: {e}"),
                rollback_reason: None,
            })?;

        // 3. Simulated DELETEs (id-pinned). These are the same statements
        // F5H.3b.1 will execute under COMMIT. Here they run only to
        // verify count parity and exercise the path.
        let review_deleted =
            delete_by_ids(&mut tx, "sync_tombstone_reviews", "review_id", &review_ids)
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

        let tombstone_deleted =
            delete_by_ids(&mut tx, "sync_tombstones", "tombstone_id", &tombstone_ids)
                .await
                .map_err(|e| InnerFailure {
                    blocker: format!("tombstone-delete-failed: {e}"),
                    rollback_reason: None,
                })?;
        let expected_tombstones = if inject_failure == Some(DryRunFailure::TombstoneDeleteMismatch)
        {
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
            m.insert(
                "wouldDeleteTombstones".into(),
                JsonValue::from(tombstone_deleted),
            );
            m.insert("wouldDeleteReviews".into(), JsonValue::from(review_deleted));
            m.insert(
                "predicateVersion".into(),
                JsonValue::from(synthetic_marker::SYNTHETIC_PREDICATE_VERSION),
            );
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
            tombstone_ids,
            review_ids,
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

            // F5H.3b.1a — opt-in candidate-id + token surface. Only
            // populated on successful dry-run when the caller requested
            // it. Default callers (flag false) get the F5H.3b.0d shape.
            //
            // Token is computed AFTER rollback so the DB fingerprint we
            // read reflects committed state, not the rolled-back txn.
            // The candidate IDs were captured inside the txn (snapshot
            // consistent) and survive rollback since they're just Vec<String>.
            if include_candidate_ids {
                let sorted_reviews = sort_dedupe(success.review_ids);
                let sorted_tombstones = sort_dedupe(success.tombstone_ids);
                match read_db_fingerprint(conn).await {
                    Ok(fp) => {
                        let token = compute_preview_token(
                            fp.schema_user_version,
                            fp.migration_count,
                            &sorted_reviews,
                            &sorted_tombstones,
                            success.review_count,
                            success.tombstone_count,
                        );
                        result.candidate_ids = Some(CandidateIds {
                            sync_tombstone_review_ids: sorted_reviews,
                            sync_tombstone_ids: sorted_tombstones,
                        });
                        result.expected_counts = Some(ExpectedCounts {
                            reviews: success.review_count,
                            tombstones: success.tombstone_count,
                        });
                        result.preview_token = Some(token);
                        result.db_fingerprint = Some(fp);
                    }
                    Err(e) => {
                        // Don't fail the whole dry-run — emit a warning
                        // and leave the optional fields unset. ok stays
                        // true because the predicate + transaction shape
                        // still proved out; only the token surface failed.
                        result.warnings.push(format!(
                            "preview-token-skipped: fingerprint read failed: {e}"
                        ));
                    }
                }
            }

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
    // F5H.3b.1a — carry the eligible ID lists out of the inner closure
    // so the outer function can return them when include_candidate_ids
    // is set. The lists are SQL-snapshot consistent with the txn that
    // produced them; rollback does not invalidate them.
    tombstone_ids: Vec<String>,
    review_ids: Vec<String>,
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
        assert_eq!(
            r.schema,
            "h2o.studio.synthetic-cleanup-transaction-dry-run.v1"
        );
        assert_eq!(r.predicate_version, "h2o.studio.sync.synthetic-marker.v1");
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

    // ── F5H.3b.1a — pure-function tests for the preview token surface.
    // DB-touching tests live in lib.rs (the F5H.3b.1a integration suite)
    // because they need the migrated SqliteConnection from set_pool.

    #[test]
    fn f5h3b1a_sort_dedupe_sorts_and_drops_duplicates() {
        let v = sort_dedupe(vec![
            "f5h-zeta".into(),
            "f5h-alpha".into(),
            "f5h-zeta".into(),
            "f5h-beta".into(),
            "f5h-alpha".into(),
        ]);
        assert_eq!(v, vec!["f5h-alpha", "f5h-beta", "f5h-zeta"]);
    }

    #[test]
    fn f5h3b1a_sort_dedupe_preserves_case() {
        // The contract SQL uses LOWER() for prefix matching, but the
        // returned IDs preserve as-stored case. We must not lowercase
        // here or token recomputation in F5H.3b.1b will diverge.
        let v = sort_dedupe(vec!["F5H-Aaa".into(), "f5h-bbb".into()]);
        assert_eq!(v, vec!["F5H-Aaa", "f5h-bbb"]);
    }

    #[test]
    fn f5h3b1a_token_has_v1_prefix_and_hex_body() {
        let t = compute_preview_token(9, 9, &[], &[], 0, 0);
        assert!(t.starts_with("ptok1:"), "expected ptok1: prefix, got {t}");
        let body = &t["ptok1:".len()..];
        assert_eq!(body.len(), 64, "expected sha256 hex (64 chars)");
        assert!(
            body.chars()
                .all(|c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase()),
            "expected lowercase hex only, got {body}"
        );
    }

    #[test]
    fn f5h3b1a_token_is_deterministic_for_same_inputs() {
        let a = compute_preview_token(
            9,
            9,
            &["f5h-r1".into(), "f5h-r2".into()],
            &["f5h-t1".into()],
            2,
            1,
        );
        let b = compute_preview_token(
            9,
            9,
            &["f5h-r1".into(), "f5h-r2".into()],
            &["f5h-t1".into()],
            2,
            1,
        );
        assert_eq!(a, b);
    }

    #[test]
    fn f5h3b1a_token_changes_when_id_set_changes() {
        let a = compute_preview_token(9, 9, &["f5h-r1".into()], &["f5h-t1".into()], 1, 1);
        let b = compute_preview_token(
            9,
            9,
            &["f5h-r1".into(), "f5h-r2".into()],
            &["f5h-t1".into()],
            2,
            1,
        );
        assert_ne!(a, b, "adding a review must change the token");
    }

    #[test]
    fn f5h3b1a_token_changes_when_expected_counts_change() {
        let ids = vec!["f5h-r1".to_string()];
        let a = compute_preview_token(9, 9, &ids, &[], 1, 0);
        let b = compute_preview_token(9, 9, &ids, &[], 1, 1);
        assert_ne!(a, b, "expected-counts skew must change the token");
    }

    #[test]
    fn f5h3b1a_token_changes_when_schema_version_changes() {
        let a = compute_preview_token(9, 9, &[], &[], 0, 0);
        let b = compute_preview_token(10, 9, &[], &[], 0, 0);
        assert_ne!(a, b, "schema user_version bump must change the token");
    }

    #[test]
    fn f5h3b1a_token_changes_when_migration_count_changes() {
        let a = compute_preview_token(9, 9, &[], &[], 0, 0);
        let b = compute_preview_token(9, 10, &[], &[], 0, 0);
        assert_ne!(a, b, "migration count bump must change the token");
    }

    #[test]
    fn f5h3b1a_token_is_order_independent_via_sort_dedupe() {
        // The function itself takes already-sorted inputs by contract.
        // Verify that sort_dedupe gives the same token for two inputs
        // that differ only in order/duplicates.
        let a_ids = sort_dedupe(vec!["f5h-r2".into(), "f5h-r1".into()]);
        let b_ids = sort_dedupe(vec!["f5h-r1".into(), "f5h-r2".into(), "f5h-r1".into()]);
        let a = compute_preview_token(9, 9, &a_ids, &[], 2, 0);
        let b = compute_preview_token(9, 9, &b_ids, &[], 2, 0);
        assert_eq!(a, b);
    }

    #[test]
    fn f5h3b1a_skeleton_omits_optional_token_fields() {
        let r = DryRunResult::skeleton("2026-06-01T00:00:00Z");
        assert!(r.candidate_ids.is_none());
        assert!(r.expected_counts.is_none());
        assert!(r.preview_token.is_none());
        assert!(r.db_fingerprint.is_none());
    }

    #[test]
    fn f5h3b1a_default_json_does_not_leak_candidate_fields() {
        // skip_serializing_if = "Option::is_none" — when the optional
        // fields are None (default path), they MUST NOT appear in JSON.
        let r = DryRunResult::skeleton("2026-06-01T00:00:00Z");
        let s = serde_json::to_string(&r).unwrap();
        assert!(!s.contains("candidateIds"), "candidateIds leaked: {s}");
        assert!(!s.contains("expectedCounts"), "expectedCounts leaked: {s}");
        assert!(!s.contains("previewToken"), "previewToken leaked: {s}");
        assert!(!s.contains("dbFingerprint"), "dbFingerprint leaked: {s}");
    }
}
