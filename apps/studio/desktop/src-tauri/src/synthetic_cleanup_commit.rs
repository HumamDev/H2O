// F5H.3b.1b — real Desktop synthetic cleanup commit.
//
// This module is intentionally narrow: it commits deletion only for exact
// candidate IDs returned by the transactional preview token flow. It does not
// discover a fresh eligible set and delete it. Every candidate is revalidated
// through SYNTHETIC_PREDICATE_V1 inside one SQLite transaction.

use serde::{Deserialize, Serialize};
use serde_json::{json, Value as JsonValue};
use sha2::{Digest, Sha256};
use sqlx::{Connection, Row, SqliteConnection};
use std::sync::atomic::{AtomicU64, Ordering};

use crate::synthetic_cleanup_dryrun::{
    self, CandidateIds, ExpectedCounts, AUDIT_SCHEMA, PLATFORM_DESKTOP, PREVIEW_TOKEN_PREFIX,
};
use crate::synthetic_marker;

pub const CLEANUP_RESULT_SCHEMA: &str = "h2o.studio.maintenance.cleanup-synthetic.v1";
pub const CLEANUP_DEV_GATE: &str = "I_UNDERSTAND_THIS_DELETES_SYNTHETIC_TOMBSTONE_DATA";
pub const AUDIT_OPERATION_COMMIT: &str = "cleanup-synthetic";
pub const MAX_CANDIDATE_IDS: usize = 10_000;

static MAINTENANCE_ID_COUNTER: AtomicU64 = AtomicU64::new(0);

#[derive(Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CleanupSyntheticCommitPayload {
    pub dry_run: bool,
    pub dev_gate: String,
    pub reason: String,
    pub requested_by_sync_peer_id: String,
    pub candidate_ids: CandidateIds,
    pub expected_counts: ExpectedCounts,
    pub preview_token: String,
}

#[derive(Serialize, Clone, Debug)]
pub struct CleanupCounts {
    #[serde(rename = "reviewsDeleted")]
    pub reviews_deleted: i64,
    #[serde(rename = "tombstonesDeleted")]
    pub tombstones_deleted: i64,
    #[serde(rename = "totalDeleted")]
    pub total_deleted: i64,
}

#[derive(Serialize, Clone, Debug)]
pub struct CleanupAudit {
    pub recorded: bool,
    #[serde(rename = "maintenanceIdPresent")]
    pub maintenance_id_present: bool,
    #[serde(rename = "operatorPeerRecorded")]
    pub operator_peer_recorded: bool,
}

#[derive(Serialize, Clone, Debug)]
pub struct CleanupActions {
    #[serde(rename = "deletedRows")]
    pub deleted_rows: bool,
    #[serde(rename = "mutatedRows")]
    pub mutated_rows: bool,
    #[serde(rename = "realCleanupImplemented")]
    pub real_cleanup_implemented: bool,
}

#[derive(Serialize, Clone, Debug)]
pub struct CleanupBlocker {
    pub code: String,
}

#[derive(Serialize, Clone, Debug)]
pub struct CleanupSyntheticCommitResult {
    pub schema: &'static str,
    pub status: &'static str,
    pub ok: bool,
    pub redacted: bool,
    pub platform: &'static str,
    #[serde(rename = "predicateVersion")]
    pub predicate_version: &'static str,
    pub counts: CleanupCounts,
    pub audit: CleanupAudit,
    pub actions: CleanupActions,
    pub blockers: Vec<CleanupBlocker>,
    pub warnings: Vec<String>,
}

impl CleanupSyntheticCommitResult {
    pub fn rejected(code: &str) -> Self {
        Self::failure("rejected", code)
    }

    fn rolled_back(code: &str) -> Self {
        Self::failure("rolled_back", code)
    }

    fn failure(status: &'static str, code: &str) -> Self {
        Self {
            schema: CLEANUP_RESULT_SCHEMA,
            status,
            ok: false,
            redacted: true,
            platform: PLATFORM_DESKTOP,
            predicate_version: synthetic_marker::SYNTHETIC_PREDICATE_VERSION,
            counts: CleanupCounts {
                reviews_deleted: 0,
                tombstones_deleted: 0,
                total_deleted: 0,
            },
            audit: CleanupAudit {
                recorded: false,
                maintenance_id_present: false,
                operator_peer_recorded: false,
            },
            actions: CleanupActions {
                deleted_rows: false,
                mutated_rows: false,
                real_cleanup_implemented: true,
            },
            blockers: vec![CleanupBlocker {
                code: code.to_string(),
            }],
            warnings: vec![],
        }
    }

    fn committed(reviews: i64, tombstones: i64) -> Self {
        Self {
            schema: CLEANUP_RESULT_SCHEMA,
            status: "committed",
            ok: true,
            redacted: true,
            platform: PLATFORM_DESKTOP,
            predicate_version: synthetic_marker::SYNTHETIC_PREDICATE_VERSION,
            counts: CleanupCounts {
                reviews_deleted: reviews,
                tombstones_deleted: tombstones,
                total_deleted: reviews + tombstones,
            },
            audit: CleanupAudit {
                recorded: true,
                maintenance_id_present: true,
                operator_peer_recorded: true,
            },
            actions: CleanupActions {
                deleted_rows: true,
                mutated_rows: true,
                real_cleanup_implemented: true,
            },
            blockers: vec![],
            warnings: vec![],
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum CommitFailure {
    AuditInsert,
    ReviewDeleteMismatch,
    TombstoneDeleteMismatch,
    AuditUpdate,
}

fn make_maintenance_id() -> String {
    let n = MAINTENANCE_ID_COUNTER.fetch_add(1, Ordering::Relaxed);
    let micros = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_micros())
        .unwrap_or(0);
    format!("f5h3b1b-clean-{micros}-{n}")
}

fn sha256_hex(input: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(input.as_bytes());
    let bytes = hasher.finalize();
    let mut hex = String::with_capacity(64);
    for b in bytes.iter() {
        hex.push_str(&format!("{:02x}", b));
    }
    hex
}

fn hash_id_list(ids: &[String]) -> String {
    sha256_hex(&ids.join("\n"))
}

fn canonicalize_ids(ids: &[String]) -> Option<Vec<String>> {
    let mut out = Vec::with_capacity(ids.len());
    for id in ids {
        let trimmed = id.trim();
        if trimmed.is_empty() || trimmed.chars().any(|c| c.is_control()) {
            return None;
        }
        out.push(trimmed.to_string());
    }
    out.sort();
    out.dedup();
    Some(out)
}

fn valid_token(token: &str) -> bool {
    let Some(hex) = token.strip_prefix(PREVIEW_TOKEN_PREFIX) else {
        return false;
    };
    hex.len() == 64
        && hex
            .chars()
            .all(|c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase())
}

fn validate_reason(reason: &str) -> bool {
    let trimmed = reason.trim();
    trimmed.len() >= 12 && trimmed.len() <= 256 && !trimmed.chars().any(|c| c.is_control())
}

fn validate_requested_by(peer_id: &str) -> bool {
    let trimmed = peer_id.trim();
    !trimmed.is_empty() && trimmed.len() <= 256 && !trimmed.chars().any(|c| c.is_control())
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

async fn schema_ready(conn: &mut SqliteConnection) -> bool {
    table_exists_with_column(conn, "sync_tombstones", "is_synthetic").await
        && table_exists_with_column(conn, "sync_tombstone_reviews", "is_synthetic").await
        && table_exists(conn, "sync_maintenance_log").await
}

pub async fn run_commit(
    conn: &mut SqliteConnection,
    payload: CleanupSyntheticCommitPayload,
    now_iso: String,
    inject_failure: Option<CommitFailure>,
) -> CleanupSyntheticCommitResult {
    if payload.dry_run {
        return CleanupSyntheticCommitResult::rejected("desktop-maintenance-unavailable");
    }
    if payload.dev_gate != CLEANUP_DEV_GATE {
        return CleanupSyntheticCommitResult::rejected("invalid-dev-gate");
    }
    if !validate_reason(&payload.reason) {
        return CleanupSyntheticCommitResult::rejected("invalid-reason");
    }
    if !validate_requested_by(&payload.requested_by_sync_peer_id) {
        return CleanupSyntheticCommitResult::rejected("desktop-maintenance-unavailable");
    }
    if payload.expected_counts.reviews < 0 || payload.expected_counts.tombstones < 0 {
        return CleanupSyntheticCommitResult::rejected("expected-count-mismatch");
    }
    if !valid_token(&payload.preview_token) {
        return CleanupSyntheticCommitResult::rejected("invalid-preview-token");
    }
    let Some(review_ids) = canonicalize_ids(&payload.candidate_ids.sync_tombstone_review_ids)
    else {
        return CleanupSyntheticCommitResult::rejected("invalid-candidate-ids");
    };
    let Some(tombstone_ids) = canonicalize_ids(&payload.candidate_ids.sync_tombstone_ids) else {
        return CleanupSyntheticCommitResult::rejected("invalid-candidate-ids");
    };
    let total_candidates = review_ids.len().saturating_add(tombstone_ids.len());
    if total_candidates > MAX_CANDIDATE_IDS {
        return CleanupSyntheticCommitResult::rejected("invalid-candidate-ids");
    }
    if review_ids.len() != payload.candidate_ids.sync_tombstone_review_ids.len()
        || tombstone_ids.len() != payload.candidate_ids.sync_tombstone_ids.len()
    {
        return CleanupSyntheticCommitResult::rejected("invalid-candidate-ids");
    }
    if payload.expected_counts.reviews != review_ids.len() as i64
        || payload.expected_counts.tombstones != tombstone_ids.len() as i64
    {
        return CleanupSyntheticCommitResult::rejected("expected-count-mismatch");
    }
    if review_ids.is_empty() && tombstone_ids.is_empty() {
        return CleanupSyntheticCommitResult::rejected("no-eligible-synthetic-rows");
    }
    if !schema_ready(conn).await {
        return CleanupSyntheticCommitResult::rejected("desktop-maintenance-unavailable");
    }

    let fingerprint = match synthetic_cleanup_dryrun::read_db_fingerprint(conn).await {
        Ok(fp) => fp,
        Err(_) => return CleanupSyntheticCommitResult::rejected("desktop-maintenance-unavailable"),
    };
    let recomputed_token = synthetic_cleanup_dryrun::compute_preview_token(
        fingerprint.schema_user_version,
        fingerprint.migration_count,
        &review_ids,
        &tombstone_ids,
        payload.expected_counts.reviews,
        payload.expected_counts.tombstones,
    );
    if recomputed_token != payload.preview_token {
        return CleanupSyntheticCommitResult::rejected("preview-token-drift");
    }

    let mut tx = match conn.begin().await {
        Ok(tx) => tx,
        Err(_) => return CleanupSyntheticCommitResult::rejected("desktop-maintenance-unavailable"),
    };
    let maintenance_id = make_maintenance_id();
    let reason = payload.reason.trim().to_string();
    let requested_by = payload.requested_by_sync_peer_id.trim().to_string();

    let inner: Result<(), &'static str> = async {
        if inject_failure == Some(CommitFailure::AuditInsert) {
            return Err("audit-insert-failed");
        }
        sqlx::query(
            r#"
            INSERT INTO sync_maintenance_log
              (maintenance_id, schema, operation, policy_version, reason,
               requested_at, requested_by_sync_peer_id, platform, dry_run,
               affected_tombstone_count, affected_review_count, skipped_count,
               warnings_json, result_json, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 0, '[]', '{}', ?)
            "#,
        )
        .bind(&maintenance_id)
        .bind(AUDIT_SCHEMA)
        .bind(AUDIT_OPERATION_COMMIT)
        .bind(synthetic_marker::SYNTHETIC_PREDICATE_VERSION)
        .bind(&reason)
        .bind(&now_iso)
        .bind(&requested_by)
        .bind(PLATFORM_DESKTOP)
        .bind(&now_iso)
        .execute(&mut *tx)
        .await
        .map_err(|_| "audit-insert-failed")?;

        let deleted_reviews =
            synthetic_marker::delete_eligible_synthetic_review_ids(&mut tx, &review_ids, &now_iso)
                .await
                .map_err(|_| "transaction-rollback")?;
        let expected_reviews = if inject_failure == Some(CommitFailure::ReviewDeleteMismatch) {
            payload.expected_counts.reviews + 1
        } else {
            payload.expected_counts.reviews
        };
        if deleted_reviews != expected_reviews {
            return Err("review-revalidation-count-mismatch");
        }

        let deleted_tombstones = synthetic_marker::delete_eligible_synthetic_tombstone_ids(
            &mut tx,
            &tombstone_ids,
            &now_iso,
        )
        .await
        .map_err(|_| "transaction-rollback")?;
        let expected_tombstones = if inject_failure == Some(CommitFailure::TombstoneDeleteMismatch)
        {
            payload.expected_counts.tombstones + 1
        } else {
            payload.expected_counts.tombstones
        };
        if deleted_tombstones != expected_tombstones {
            return Err("tombstone-revalidation-count-mismatch");
        }

        if inject_failure == Some(CommitFailure::AuditUpdate) {
            return Err("audit-update-failed");
        }
        let result_json = serde_json::to_string(&json!({
            "redacted": true,
            "committed": true,
            "predicateVersion": synthetic_marker::SYNTHETIC_PREDICATE_VERSION,
            "gateSha256": sha256_hex(CLEANUP_DEV_GATE),
            "tokenSha256": sha256_hex(&payload.preview_token),
            "reviewIdsSha256": hash_id_list(&review_ids),
            "tombstoneIdsSha256": hash_id_list(&tombstone_ids),
            "schemaUserVersion": fingerprint.schema_user_version,
            "migrationCount": fingerprint.migration_count,
            "candidateCounts": {
                "reviews": payload.expected_counts.reviews,
                "tombstones": payload.expected_counts.tombstones,
            }
        }))
        .unwrap_or_else(|_| "{}".to_string());
        let update = sqlx::query(
            r#"
            UPDATE sync_maintenance_log
            SET affected_tombstone_count = ?,
                affected_review_count = ?,
                result_json = ?
            WHERE maintenance_id = ?
            "#,
        )
        .bind(deleted_tombstones)
        .bind(deleted_reviews)
        .bind(&result_json)
        .bind(&maintenance_id)
        .execute(&mut *tx)
        .await
        .map_err(|_| "audit-update-failed")?;
        if update.rows_affected() != 1 {
            return Err("audit-update-failed");
        }

        Ok(())
    }
    .await;

    if let Err(code) = inner {
        let _ = tx.rollback().await;
        return CleanupSyntheticCommitResult::rolled_back(code);
    }
    if tx.commit().await.is_err() {
        return CleanupSyntheticCommitResult::rolled_back("transaction-rollback");
    }

    CleanupSyntheticCommitResult::committed(
        payload.expected_counts.reviews,
        payload.expected_counts.tombstones,
    )
}

pub fn audit_result_json_has_no_raw_ids(
    raw: &str,
    review_ids: &[String],
    tombstone_ids: &[String],
) -> bool {
    let Ok(parsed) = serde_json::from_str::<JsonValue>(raw) else {
        return false;
    };
    if !parsed.is_object() {
        return false;
    }
    review_ids
        .iter()
        .chain(tombstone_ids.iter())
        .all(|id| !raw.contains(id))
}
