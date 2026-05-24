// F7.4.2a - in-memory folder.metadata color apply transaction proof.
//
// This module is compiled for Rust tests only. It opens sqlite::memory:,
// mirrors the minimum folders + sync_maintenance_log shape, and proves the
// future audit/update/rollback mechanics without touching production DB state.

use serde::Serialize;
use serde_json::json;
use sha2::{Digest, Sha256};
use sqlx::{Connection, Row, SqliteConnection};
use std::sync::atomic::{AtomicU64, Ordering};

const PROOF_SCHEMA: &str = "h2o.studio.sync.folder-metadata-apply-transaction-proof.v0";
const AUDIT_SCHEMA: &str = "h2o.studio.sync.maintenance.v1";
const AUDIT_OPERATION: &str = "folder-metadata-color-apply";
const POLICY_VERSION: &str = "h2o.studio.sync.folder-metadata-apply.v0";
const ENTITY_KIND: &str = "folder.metadata";
const PLATFORM_DESKTOP: &str = "desktop-tauri";
const FIXTURE_FOLDER_ID: &str = "f7-proof-folder-001";
const FIXTURE_COLOR: &str = "proof-blue";
const FIXTURE_UPDATED_AT: &str = "2026-05-24T00:00:00.000Z";
const PROOF_UPDATED_AT: &str = "2026-05-24T00:01:00.000Z";

static AUDIT_ID_COUNTER: AtomicU64 = AtomicU64::new(0);

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum ProofFailure {
    AuditInsert,
    AffectedRowMismatch,
    AuditUpdate,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProofBlocker {
    code: String,
}

impl ProofBlocker {
    fn new(code: &str) -> Self {
        Self {
            code: code.to_string(),
        }
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProofTransaction {
    began: bool,
    audit_inserted: bool,
    current_row_read: bool,
    baseline_verified: bool,
    update_simulated: bool,
    affected_rows_verified: bool,
    audit_updated: bool,
    rolled_back: bool,
    rollback_verified: bool,
}

impl ProofTransaction {
    fn new() -> Self {
        Self {
            began: false,
            audit_inserted: false,
            current_row_read: false,
            baseline_verified: false,
            update_simulated: false,
            affected_rows_verified: false,
            audit_updated: false,
            rolled_back: false,
            rollback_verified: false,
        }
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProofResult {
    schema: &'static str,
    ok: bool,
    redacted: bool,
    dry_run: bool,
    proof_only: bool,
    applied: bool,
    writes_committed: i64,
    entity_kind: &'static str,
    field: String,
    transaction: ProofTransaction,
    blockers: Vec<ProofBlocker>,
    warnings: Vec<ProofBlocker>,
}

impl ProofResult {
    fn skeleton(field: &str) -> Self {
        Self {
            schema: PROOF_SCHEMA,
            ok: false,
            redacted: true,
            dry_run: true,
            proof_only: true,
            applied: false,
            writes_committed: 0,
            entity_kind: ENTITY_KIND,
            field: field.to_string(),
            transaction: ProofTransaction::new(),
            blockers: vec![],
            warnings: vec![],
        }
    }

    fn blocked(field: &str, code: &str) -> Self {
        let mut result = Self::skeleton(field);
        result.blockers.push(ProofBlocker::new(code));
        result
    }

    fn add_blocker(&mut self, code: &str) {
        if !self.blockers.iter().any(|b| b.code == code) {
            self.blockers.push(ProofBlocker::new(code));
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
struct ProofSnapshot {
    folders: i64,
    maintenance_log: i64,
    folder_hash: String,
}

fn make_audit_id() -> String {
    let n = AUDIT_ID_COUNTER.fetch_add(1, Ordering::Relaxed);
    format!("f7-apply-proof-audit-{n}")
}

fn allowed_field(field: &str) -> bool {
    matches!(field, "color" | "iconColor")
}

fn sha256_hex(input: &str) -> String {
    let digest = Sha256::digest(input.as_bytes());
    let mut hex = String::with_capacity(64);
    for b in digest {
        hex.push_str(&format!("{:02x}", b));
    }
    hex
}

fn folder_hash(color: &str, updated_at: &str, meta_json: &str) -> String {
    let meta_present = meta_json.trim() != "{}" && !meta_json.trim().is_empty();
    sha256_hex(&format!(
        "folder.metadata.color.v0|color={color}|updatedAt={updated_at}|metaPresent={meta_present}"
    ))
}

async fn setup_schema(conn: &mut SqliteConnection) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        CREATE TABLE folders (
          id          TEXT PRIMARY KEY,
          color       TEXT,
          updated_at  TEXT,
          meta_json   TEXT NOT NULL DEFAULT '{}'
        )
        "#,
    )
    .execute(&mut *conn)
    .await?;
    sqlx::query(
        r#"
        CREATE TABLE sync_maintenance_log (
          maintenance_id              TEXT PRIMARY KEY,
          schema                      TEXT NOT NULL,
          operation                   TEXT NOT NULL,
          policy_version              TEXT NOT NULL,
          reason                      TEXT NOT NULL,
          requested_at                TEXT NOT NULL,
          requested_by_sync_peer_id   TEXT NOT NULL,
          platform                    TEXT NOT NULL,
          dry_run                     INTEGER NOT NULL,
          affected_tombstone_count    INTEGER NOT NULL DEFAULT 0,
          affected_review_count       INTEGER NOT NULL DEFAULT 0,
          skipped_count               INTEGER NOT NULL DEFAULT 0,
          warnings_json               TEXT NOT NULL DEFAULT '[]',
          result_json                 TEXT NOT NULL DEFAULT '{}',
          created_at                  TEXT NOT NULL
        )
        "#,
    )
    .execute(&mut *conn)
    .await?;
    Ok(())
}

async fn seed_folder(conn: &mut SqliteConnection) -> Result<(), sqlx::Error> {
    sqlx::query("INSERT INTO folders (id, color, updated_at, meta_json) VALUES (?, ?, ?, '{}')")
        .bind(FIXTURE_FOLDER_ID)
        .bind(FIXTURE_COLOR)
        .bind(FIXTURE_UPDATED_AT)
        .execute(&mut *conn)
        .await?;
    Ok(())
}

async fn capture_snapshot(conn: &mut SqliteConnection) -> Result<ProofSnapshot, sqlx::Error> {
    let folders: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM folders")
        .fetch_one(&mut *conn)
        .await?;
    let maintenance_log: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM sync_maintenance_log")
        .fetch_one(&mut *conn)
        .await?;
    let row = sqlx::query("SELECT color, updated_at, meta_json FROM folders WHERE id = ?")
        .bind(FIXTURE_FOLDER_ID)
        .fetch_one(&mut *conn)
        .await?;
    let color: String = row.try_get("color")?;
    let updated_at: String = row.try_get("updated_at")?;
    let meta_json: String = row.try_get("meta_json")?;
    Ok(ProofSnapshot {
        folders: folders.0,
        maintenance_log: maintenance_log.0,
        folder_hash: folder_hash(&color, &updated_at, &meta_json),
    })
}

async fn rollback_transaction(tx: sqlx::Transaction<'_, sqlx::Sqlite>, result: &mut ProofResult) {
    result.transaction.rolled_back = tx.rollback().await.is_ok();
    if !result.transaction.rolled_back {
        result.add_blocker("rollback-failed");
    }
}

async fn verify_rollback(
    conn: &mut SqliteConnection,
    before: &ProofSnapshot,
    result: &mut ProofResult,
) {
    if !result.transaction.rolled_back {
        return;
    }
    match capture_snapshot(conn).await {
        Ok(after) if &after == before => {
            result.transaction.rollback_verified = true;
        }
        Ok(_) => {
            result.add_blocker("rollback-verification-failed");
        }
        Err(_) => {
            result.add_blocker("rollback-verification-failed");
        }
    }
}

async fn run_transaction_proof_inner(
    conn: &mut SqliteConnection,
    field: &str,
    expected_baseline_hash: &str,
    failure: Option<ProofFailure>,
) -> ProofResult {
    let normalized_field = field.trim();
    if !allowed_field(normalized_field) {
        return ProofResult::blocked(normalized_field, "field-not-allowlisted");
    }
    if expected_baseline_hash.trim().is_empty() {
        return ProofResult::blocked(normalized_field, "expected-baseline-hash-required");
    }

    let before = match capture_snapshot(conn).await {
        Ok(snapshot) => snapshot,
        Err(_) => return ProofResult::blocked(normalized_field, "before-snapshot-failed"),
    };

    let mut result = ProofResult::skeleton(normalized_field);
    let mut tx = match conn.begin().await {
        Ok(tx) => {
            result.transaction.began = true;
            tx
        }
        Err(_) => {
            result.add_blocker("transaction-begin-failed");
            return result;
        }
    };

    if failure == Some(ProofFailure::AuditInsert) {
        result.add_blocker("audit-insert-failed");
        rollback_transaction(tx, &mut result).await;
        verify_rollback(conn, &before, &mut result).await;
        result.ok = false;
        return result;
    }

    let audit_id = make_audit_id();
    if sqlx::query(
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
    .bind(AUDIT_OPERATION)
    .bind(POLICY_VERSION)
    .bind("f7 folder metadata apply proof")
    .bind(PROOF_UPDATED_AT)
    .bind("f7-proof-operator-peer")
    .bind(PLATFORM_DESKTOP)
    .bind(PROOF_UPDATED_AT)
    .execute(&mut *tx)
    .await
    .is_err()
    {
        result.add_blocker("audit-insert-failed");
        rollback_transaction(tx, &mut result).await;
        verify_rollback(conn, &before, &mut result).await;
        result.ok = false;
        return result;
    }
    result.transaction.audit_inserted = true;

    let row = match sqlx::query("SELECT color, updated_at, meta_json FROM folders WHERE id = ?")
        .bind(FIXTURE_FOLDER_ID)
        .fetch_one(&mut *tx)
        .await
    {
        Ok(row) => row,
        Err(_) => {
            result.add_blocker("current-row-read-failed");
            rollback_transaction(tx, &mut result).await;
            verify_rollback(conn, &before, &mut result).await;
            result.ok = false;
            return result;
        }
    };
    result.transaction.current_row_read = true;
    let color: String = row.try_get("color").unwrap_or_default();
    let updated_at: String = row.try_get("updated_at").unwrap_or_default();
    let meta_json: String = row
        .try_get("meta_json")
        .unwrap_or_else(|_| "{}".to_string());
    let current_hash = folder_hash(&color, &updated_at, &meta_json);
    if current_hash != expected_baseline_hash.trim() {
        result.add_blocker("baseline-hash-mismatch");
        rollback_transaction(tx, &mut result).await;
        verify_rollback(conn, &before, &mut result).await;
        result.ok = false;
        return result;
    }
    result.transaction.baseline_verified = true;

    let target_id = if failure == Some(ProofFailure::AffectedRowMismatch) {
        "f7-proof-missing-folder"
    } else {
        FIXTURE_FOLDER_ID
    };
    let updated = sqlx::query("UPDATE folders SET color = ?, updated_at = ? WHERE id = ?")
        .bind("proof-green")
        .bind(PROOF_UPDATED_AT)
        .bind(target_id)
        .execute(&mut *tx)
        .await;
    result.transaction.update_simulated = updated.is_ok();
    let affected = match updated {
        Ok(done) => done.rows_affected(),
        Err(_) => {
            result.add_blocker("folder-update-failed");
            rollback_transaction(tx, &mut result).await;
            verify_rollback(conn, &before, &mut result).await;
            result.ok = false;
            return result;
        }
    };
    if affected != 1 {
        result.add_blocker("affected-row-count-mismatch");
        rollback_transaction(tx, &mut result).await;
        verify_rollback(conn, &before, &mut result).await;
        result.ok = false;
        return result;
    }
    result.transaction.affected_rows_verified = true;

    let audit_update_id = if failure == Some(ProofFailure::AuditUpdate) {
        "f7-proof-missing-audit"
    } else {
        &audit_id
    };
    let result_json = json!({
        "redacted": true,
        "proofOnly": true,
        "entityKind": ENTITY_KIND,
        "fieldsUpdated": [normalized_field],
        "baselineHashPresent": true,
        "targetHashPresent": true,
        "rowsWouldUpdate": 1,
        "rowsUpdatedInTransaction": 1
    })
    .to_string();
    let audit_updated = sqlx::query(
        r#"
        UPDATE sync_maintenance_log
           SET result_json = ?
         WHERE maintenance_id = ?
        "#,
    )
    .bind(result_json)
    .bind(audit_update_id)
    .execute(&mut *tx)
    .await;
    let audit_rows = match audit_updated {
        Ok(done) => done.rows_affected(),
        Err(_) => {
            result.add_blocker("audit-update-failed");
            rollback_transaction(tx, &mut result).await;
            verify_rollback(conn, &before, &mut result).await;
            result.ok = false;
            return result;
        }
    };
    if audit_rows != 1 {
        result.add_blocker("audit-update-failed");
        rollback_transaction(tx, &mut result).await;
        verify_rollback(conn, &before, &mut result).await;
        result.ok = false;
        return result;
    }
    result.transaction.audit_updated = true;

    rollback_transaction(tx, &mut result).await;
    verify_rollback(conn, &before, &mut result).await;
    result.ok = result.blockers.is_empty() && result.transaction.rollback_verified;
    result
}

async fn run_in_memory_transaction_proof(
    field: &str,
    expected_baseline_hash: &str,
    failure: Option<ProofFailure>,
) -> ProofResult {
    let mut conn = SqliteConnection::connect("sqlite::memory:")
        .await
        .expect("F7.4.2a proof sqlite memory DB opens");
    setup_schema(&mut conn)
        .await
        .expect("F7.4.2a proof schema creates");
    seed_folder(&mut conn)
        .await
        .expect("F7.4.2a proof seed inserts");
    run_transaction_proof_inner(&mut conn, field, expected_baseline_hash, failure).await
}

fn fixture_baseline_hash() -> String {
    folder_hash(FIXTURE_COLOR, FIXTURE_UPDATED_AT, "{}")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn run(field: &str, hash: &str, failure: Option<ProofFailure>) -> ProofResult {
        tauri::async_runtime::block_on(run_in_memory_transaction_proof(field, hash, failure))
    }

    fn assert_redacted(result: &ProofResult) {
        let raw = serde_json::to_string(result).expect("proof result serializes");
        for forbidden in [
            FIXTURE_FOLDER_ID,
            FIXTURE_COLOR,
            "proof-green",
            "f7-proof-operator-peer",
            "f7-proof-audit",
            "meta_json",
            &fixture_baseline_hash(),
        ] {
            assert!(
                !raw.contains(forbidden),
                "proof result leaked forbidden token {forbidden}: {raw}"
            );
        }
    }

    #[test]
    fn f7_folder_metadata_apply_transaction_success_proof_path_rolls_back() {
        let result = run("color", &fixture_baseline_hash(), None);
        assert!(result.ok);
        assert!(result.redacted);
        assert!(result.dry_run);
        assert!(result.proof_only);
        assert!(!result.applied);
        assert_eq!(result.writes_committed, 0);
        assert_eq!(result.field, "color");
        assert!(result.transaction.began);
        assert!(result.transaction.audit_inserted);
        assert!(result.transaction.current_row_read);
        assert!(result.transaction.baseline_verified);
        assert!(result.transaction.update_simulated);
        assert!(result.transaction.affected_rows_verified);
        assert!(result.transaction.audit_updated);
        assert!(result.transaction.rolled_back);
        assert!(result.transaction.rollback_verified);
        assert!(result.blockers.is_empty());
        assert_redacted(&result);
    }

    #[test]
    fn f7_folder_metadata_apply_transaction_color_and_icon_color_are_allowed() {
        let color = run("color", &fixture_baseline_hash(), None);
        let icon_color = run("iconColor", &fixture_baseline_hash(), None);
        assert!(color.ok);
        assert!(icon_color.ok);
        assert_eq!(color.field, "color");
        assert_eq!(icon_color.field, "iconColor");
    }

    #[test]
    fn f7_folder_metadata_apply_transaction_rejects_non_allowlisted_fields() {
        for field in [
            "name",
            "parentId",
            "sortOrder",
            "icon",
            "kind",
            "source",
            "meta",
            "createdAt",
            "updatedAt",
            "other",
        ] {
            let result = run(field, &fixture_baseline_hash(), None);
            assert!(!result.ok, "field {field} must be rejected");
            assert_eq!(result.blockers[0].code, "field-not-allowlisted");
            assert!(!result.transaction.began);
            assert_redacted(&result);
        }
    }

    #[test]
    fn f7_folder_metadata_apply_transaction_rejects_missing_and_stale_baseline() {
        let missing = run("color", "", None);
        assert!(!missing.ok);
        assert_eq!(missing.blockers[0].code, "expected-baseline-hash-required");
        assert!(!missing.transaction.began);
        assert_redacted(&missing);

        let stale = run("color", "stale-baseline-hash", None);
        assert!(!stale.ok);
        assert!(stale.transaction.began);
        assert!(stale.transaction.audit_inserted);
        assert!(stale.transaction.current_row_read);
        assert!(!stale.transaction.baseline_verified);
        assert!(stale.transaction.rolled_back);
        assert!(stale.transaction.rollback_verified);
        assert_eq!(stale.blockers[0].code, "baseline-hash-mismatch");
        assert_redacted(&stale);
    }

    #[test]
    fn f7_folder_metadata_apply_transaction_audit_insert_failure_rolls_back() {
        let result = run(
            "color",
            &fixture_baseline_hash(),
            Some(ProofFailure::AuditInsert),
        );
        assert!(!result.ok);
        assert!(result.transaction.began);
        assert!(!result.transaction.audit_inserted);
        assert!(result.transaction.rolled_back);
        assert!(result.transaction.rollback_verified);
        assert_eq!(result.blockers[0].code, "audit-insert-failed");
        assert_redacted(&result);
    }

    #[test]
    fn f7_folder_metadata_apply_transaction_affected_row_mismatch_rolls_back() {
        let result = run(
            "color",
            &fixture_baseline_hash(),
            Some(ProofFailure::AffectedRowMismatch),
        );
        assert!(!result.ok);
        assert!(result.transaction.audit_inserted);
        assert!(result.transaction.baseline_verified);
        assert!(result.transaction.update_simulated);
        assert!(!result.transaction.affected_rows_verified);
        assert!(result.transaction.rolled_back);
        assert!(result.transaction.rollback_verified);
        assert_eq!(result.blockers[0].code, "affected-row-count-mismatch");
        assert_redacted(&result);
    }

    #[test]
    fn f7_folder_metadata_apply_transaction_audit_update_failure_rolls_back() {
        let result = run(
            "color",
            &fixture_baseline_hash(),
            Some(ProofFailure::AuditUpdate),
        );
        assert!(!result.ok);
        assert!(result.transaction.audit_inserted);
        assert!(result.transaction.affected_rows_verified);
        assert!(!result.transaction.audit_updated);
        assert!(result.transaction.rolled_back);
        assert!(result.transaction.rollback_verified);
        assert_eq!(result.blockers[0].code, "audit-update-failed");
        assert_redacted(&result);
    }

    #[test]
    fn f7_folder_metadata_apply_transaction_no_production_apply_api_surface() {
        // This module intentionally exposes no Tauri command or JS-facing
        // function. The proof is available only through Rust tests.
        let result = run("color", &fixture_baseline_hash(), None);
        assert!(result.ok);
        assert_eq!(result.schema, PROOF_SCHEMA);
        assert_eq!(result.entity_kind, ENTITY_KIND);
        assert_eq!(result.writes_committed, 0);
    }
}
