// F7.4.2b - real Desktop DB folder.metadata color apply rollback proof.
//
// This module owns a proof-only transaction shape for one future local
// folder.metadata.color apply. It may run against the loaded Desktop SQLite
// DB, but it always rolls back and verifies no folder/audit changes persisted.
// It exposes no real apply path and returns only redacted proof metadata.

use serde::{Deserialize, Serialize};
use serde_json::{json, Value as JsonValue};
use sqlx::{Connection, Row, SqliteConnection};
use std::collections::BTreeMap;
use std::sync::atomic::{AtomicU64, Ordering};

pub const ROLLBACK_PROOF_SCHEMA: &str = "h2o.studio.sync.folder-metadata-apply-rollback-proof.v0";
pub const ROLLBACK_PROOF_GATE: &str =
    "I_UNDERSTAND_THIS_RUNS_A_REAL_DB_ROLLBACK_PROOF_FOR_FOLDER_METADATA";

const AUDIT_SCHEMA: &str = "h2o.studio.sync.maintenance.v1";
const AUDIT_OPERATION: &str = "folder-metadata-color-apply-rollback-proof";
const POLICY_VERSION: &str = "h2o.studio.sync.folder-metadata-apply.v0";
const ENTITY_KIND: &str = "folder.metadata";
const PLATFORM_DESKTOP: &str = "desktop-tauri";

static AUDIT_ID_COUNTER: AtomicU64 = AtomicU64::new(0);

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderMetadataColorApplyRollbackProofPayload {
    pub dry_run: bool,
    pub dev_gate: String,
    pub target_folder_id: String,
    pub field: String,
    #[serde(default)]
    pub target_color: Option<String>,
    #[serde(default)]
    pub selected_delta: Option<JsonValue>,
    pub expected_baseline_hash: String,
    #[serde(default)]
    pub expected_target_hash: Option<String>,
    pub reason: String,
    pub requested_by_sync_peer_id: String,
    #[serde(default)]
    pub apply_plan_ok: Option<bool>,
    #[serde(default)]
    pub apply_plan_applyable: Option<bool>,
    #[serde(default)]
    pub prior_plan: Option<JsonValue>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum RollbackProofFailure {
    AuditInsert,
    AffectedRowMismatch,
    AuditUpdate,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RollbackProofBlocker {
    pub code: String,
}

impl RollbackProofBlocker {
    fn new(code: &str) -> Self {
        Self {
            code: code.to_string(),
        }
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RollbackProofTransaction {
    pub began: bool,
    pub audit_inserted: bool,
    pub current_row_read: bool,
    pub baseline_verified: bool,
    pub update_simulated: bool,
    pub affected_rows_verified: bool,
    pub audit_updated: bool,
    pub rolled_back: bool,
    pub rollback_verified: bool,
}

impl RollbackProofTransaction {
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
pub struct RollbackProofVerification {
    pub folder_unchanged: bool,
    pub audit_not_persisted: bool,
    pub row_counts_unchanged: bool,
}

impl RollbackProofVerification {
    fn new() -> Self {
        Self {
            folder_unchanged: false,
            audit_not_persisted: false,
            row_counts_unchanged: false,
        }
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderMetadataColorApplyRollbackProofResult {
    pub schema: &'static str,
    pub ok: bool,
    pub redacted: bool,
    pub dry_run: bool,
    pub proof_only: bool,
    pub applied: bool,
    pub writes_committed: i64,
    pub entity_kind: &'static str,
    pub field: Option<String>,
    pub transaction: RollbackProofTransaction,
    pub verification: RollbackProofVerification,
    pub blockers: Vec<RollbackProofBlocker>,
    pub warnings: Vec<RollbackProofBlocker>,
}

impl FolderMetadataColorApplyRollbackProofResult {
    fn skeleton(dry_run: bool, field: Option<&str>) -> Self {
        Self {
            schema: ROLLBACK_PROOF_SCHEMA,
            ok: false,
            redacted: true,
            dry_run,
            proof_only: true,
            applied: false,
            writes_committed: 0,
            entity_kind: ENTITY_KIND,
            field: field.map(|f| f.to_string()),
            transaction: RollbackProofTransaction::new(),
            verification: RollbackProofVerification::new(),
            blockers: vec![],
            warnings: vec![],
        }
    }

    pub fn blocked(code: &str) -> Self {
        let mut result = Self::skeleton(true, None);
        result.add_blocker(code);
        result
    }

    fn add_blocker(&mut self, code: &str) {
        if !self.blockers.iter().any(|b| b.code == code) {
            self.blockers.push(RollbackProofBlocker::new(code));
        }
    }
}

#[derive(Clone, Debug)]
struct FolderRow {
    name: String,
    parent_id: Option<String>,
    color: Option<String>,
    sort_order: i64,
    source: String,
    meta_json: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
struct RollbackProofSnapshot {
    folder_count: i64,
    audit_count: i64,
    target_folder_hash: Option<String>,
}

fn clean_string(value: &str) -> String {
    value.trim().to_string()
}

fn allowed_field(field: &str) -> bool {
    matches!(field, "color" | "iconColor")
}

fn valid_reason(value: &str) -> bool {
    let trimmed = value.trim();
    !trimmed.is_empty() && trimmed.len() <= 256 && !trimmed.chars().any(|c| c.is_control())
}

fn valid_sensitive_id(value: &str) -> bool {
    let trimmed = value.trim();
    !trimmed.is_empty() && trimmed.len() <= 256 && !trimmed.chars().any(|c| c.is_control())
}

fn valid_hash(value: &str) -> bool {
    let trimmed = value.trim();
    matches!(trimmed.len(), 8 | 64) && trimmed.chars().all(|c| c.is_ascii_hexdigit())
}

fn valid_target_color(value: &str) -> bool {
    let trimmed = value.trim();
    !trimmed.is_empty()
        && trimmed.len() <= 128
        && !trimmed.chars().any(|c| c.is_control())
        && !trimmed.starts_with('{')
        && !trimmed.starts_with('[')
}

fn json_bool(value: &JsonValue, key: &str) -> Option<bool> {
    value.as_object()?.get(key)?.as_bool()
}

fn prior_plan_passed(payload: &FolderMetadataColorApplyRollbackProofPayload) -> bool {
    if payload.apply_plan_ok == Some(true) && payload.apply_plan_applyable == Some(true) {
        return true;
    }
    let Some(plan) = payload.prior_plan.as_ref() else {
        return false;
    };
    json_bool(plan, "ok") == Some(true)
        && json_bool(plan, "applyable") == Some(true)
        && json_bool(plan, "dryRun") == Some(true)
        && plan
            .as_object()
            .and_then(|obj| obj.get("writesPerformed"))
            .and_then(|v| v.as_i64())
            == Some(0)
}

fn target_color_from_payload(payload: &FolderMetadataColorApplyRollbackProofPayload) -> String {
    if let Some(color) = payload.target_color.as_ref() {
        let trimmed = color.trim();
        if !trimmed.is_empty() {
            return trimmed.to_string();
        }
    }
    let Some(selected_delta) = payload.selected_delta.as_ref() else {
        return String::new();
    };
    let Some(obj) = selected_delta.as_object() else {
        return String::new();
    };
    for key in ["targetColor", "color", "iconColor", "targetValue"] {
        if let Some(value) = obj.get(key).and_then(|v| v.as_str()) {
            let trimmed = value.trim();
            if !trimmed.is_empty() {
                return trimmed.to_string();
            }
        }
    }
    String::new()
}

fn make_audit_id() -> String {
    let n = AUDIT_ID_COUNTER.fetch_add(1, Ordering::Relaxed);
    let micros = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_micros())
        .unwrap_or(0);
    format!("f7-folder-color-rollback-proof-{micros}-{n}")
}

fn fnv1a_32_hex(input: &str) -> String {
    let mut hash: u32 = 0x811c9dc5;
    for b in input.as_bytes() {
        hash ^= *b as u32;
        hash = hash.wrapping_mul(0x01000193);
    }
    format!("{hash:08x}")
}

fn folder_hash(row: &FolderRow) -> String {
    let meta_present = row.meta_json.trim() != "{}" && !row.meta_json.trim().is_empty();
    let parent_id = row.parent_id.as_deref().unwrap_or("").trim().to_string();
    let mut map = BTreeMap::<String, JsonValue>::new();
    map.insert("color".to_string(), json!(row.color));
    map.insert("icon".to_string(), JsonValue::Null);
    map.insert("kind".to_string(), JsonValue::Null);
    map.insert("metaPresent".to_string(), json!(meta_present));
    map.insert("name".to_string(), json!(row.name));
    map.insert("parentId".to_string(), json!(parent_id));
    map.insert("sortOrder".to_string(), json!(row.sort_order));
    map.insert("source".to_string(), json!(row.source));
    fnv1a_32_hex(&serde_json::to_string(&map).unwrap_or_else(|_| "{}".to_string()))
}

async fn table_exists(conn: &mut SqliteConnection, table: &str) -> bool {
    sqlx::query("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1")
        .bind(table)
        .fetch_optional(&mut *conn)
        .await
        .map(|row| row.is_some())
        .unwrap_or(false)
}

async fn read_folder_row(
    conn: &mut SqliteConnection,
    target_folder_id: &str,
) -> Result<Option<FolderRow>, sqlx::Error> {
    let row = sqlx::query(
        r#"
        SELECT name, parent_id, color, sort_order, source, meta_json
          FROM folders
         WHERE id = ?
         LIMIT 1
        "#,
    )
    .bind(target_folder_id)
    .fetch_optional(&mut *conn)
    .await?;

    let Some(row) = row else {
        return Ok(None);
    };

    Ok(Some(FolderRow {
        name: row.try_get::<String, _>("name")?,
        parent_id: row.try_get::<Option<String>, _>("parent_id")?,
        color: row.try_get::<Option<String>, _>("color")?,
        sort_order: row.try_get::<i64, _>("sort_order")?,
        source: row.try_get::<String, _>("source")?,
        meta_json: row.try_get::<String, _>("meta_json")?,
    }))
}

async fn capture_snapshot(
    conn: &mut SqliteConnection,
    target_folder_id: &str,
) -> Result<RollbackProofSnapshot, sqlx::Error> {
    let folder_count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM folders")
        .fetch_one(&mut *conn)
        .await?;
    let audit_count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM sync_maintenance_log")
        .fetch_one(&mut *conn)
        .await?;
    let target_folder_hash = read_folder_row(conn, target_folder_id)
        .await?
        .map(|row| folder_hash(&row));
    Ok(RollbackProofSnapshot {
        folder_count: folder_count.0,
        audit_count: audit_count.0,
        target_folder_hash,
    })
}

async fn audit_row_persisted(
    conn: &mut SqliteConnection,
    audit_id: &str,
) -> Result<bool, sqlx::Error> {
    let count: (i64,) =
        sqlx::query_as("SELECT COUNT(*) FROM sync_maintenance_log WHERE maintenance_id = ?")
            .bind(audit_id)
            .fetch_one(&mut *conn)
            .await?;
    Ok(count.0 > 0)
}

async fn rollback_transaction(
    tx: sqlx::Transaction<'_, sqlx::Sqlite>,
    result: &mut FolderMetadataColorApplyRollbackProofResult,
) {
    result.transaction.rolled_back = tx.rollback().await.is_ok();
    if !result.transaction.rolled_back {
        result.add_blocker("rollback-failed");
    }
}

async fn verify_rollback(
    conn: &mut SqliteConnection,
    target_folder_id: &str,
    audit_id: Option<&str>,
    before: &RollbackProofSnapshot,
    result: &mut FolderMetadataColorApplyRollbackProofResult,
) {
    if !result.transaction.rolled_back {
        return;
    }
    let after = match capture_snapshot(conn, target_folder_id).await {
        Ok(snapshot) => snapshot,
        Err(_) => {
            result.add_blocker("rollback-verification-failed");
            return;
        }
    };
    result.verification.folder_unchanged = before.target_folder_hash == after.target_folder_hash;
    result.verification.row_counts_unchanged =
        before.folder_count == after.folder_count && before.audit_count == after.audit_count;
    result.verification.audit_not_persisted = match audit_id {
        Some(id) => match audit_row_persisted(conn, id).await {
            Ok(persisted) => !persisted,
            Err(_) => false,
        },
        None => true,
    };
    result.transaction.rollback_verified = result.verification.folder_unchanged
        && result.verification.audit_not_persisted
        && result.verification.row_counts_unchanged;
    if !result.transaction.rollback_verified {
        result.add_blocker("rollback-verification-failed");
    }
}

pub async fn run_rollback_proof(
    conn: &mut SqliteConnection,
    payload: FolderMetadataColorApplyRollbackProofPayload,
    now_iso: String,
    updated_at_ms: i64,
) -> FolderMetadataColorApplyRollbackProofResult {
    run_rollback_proof_inner(conn, payload, now_iso, updated_at_ms, None).await
}

async fn run_rollback_proof_inner(
    conn: &mut SqliteConnection,
    payload: FolderMetadataColorApplyRollbackProofPayload,
    now_iso: String,
    updated_at_ms: i64,
    failure: Option<RollbackProofFailure>,
) -> FolderMetadataColorApplyRollbackProofResult {
    let field = clean_string(&payload.field);
    let field_for_result = if allowed_field(&field) {
        Some(field.as_str())
    } else {
        None
    };
    let mut result =
        FolderMetadataColorApplyRollbackProofResult::skeleton(payload.dry_run, field_for_result);

    if payload.dry_run != true {
        result.add_blocker("dry-run-required");
    }
    if payload.dev_gate.trim() != ROLLBACK_PROOF_GATE {
        result.add_blocker("invalid-dev-gate");
    }
    if !allowed_field(&field) {
        result.add_blocker("field-not-allowlisted");
    }
    let target_folder_id = clean_string(&payload.target_folder_id);
    if !valid_sensitive_id(&target_folder_id) {
        result.add_blocker("target-folder-id-required");
    }
    let reason = clean_string(&payload.reason);
    if !valid_reason(&reason) {
        result.add_blocker("invalid-reason");
    }
    let requested_by_sync_peer_id = clean_string(&payload.requested_by_sync_peer_id);
    if !valid_sensitive_id(&requested_by_sync_peer_id) {
        result.add_blocker("identity-unavailable");
    }
    let expected_baseline_hash = clean_string(&payload.expected_baseline_hash).to_ascii_lowercase();
    if expected_baseline_hash.is_empty() {
        result.add_blocker("expected-baseline-hash-required");
    } else if !valid_hash(&expected_baseline_hash) {
        result.add_blocker("invalid-baseline-hash");
    }
    let expected_target_hash = payload
        .expected_target_hash
        .as_ref()
        .map(|v| clean_string(v).to_ascii_lowercase())
        .filter(|v| !v.is_empty());
    if let Some(hash) = expected_target_hash.as_ref() {
        if !valid_hash(hash) {
            result.add_blocker("invalid-target-hash");
        }
    }
    let target_color = target_color_from_payload(&payload);
    if !valid_target_color(&target_color) {
        result.add_blocker("target-color-required");
    }
    if !prior_plan_passed(&payload) {
        result.add_blocker("apply-plan-proof-required");
    }
    if !result.blockers.is_empty() {
        return result;
    }

    if !table_exists(conn, "folders").await {
        result.add_blocker("folders-table-unavailable");
        return result;
    }
    if !table_exists(conn, "sync_maintenance_log").await {
        result.add_blocker("maintenance-log-unavailable");
        return result;
    }

    let before = match capture_snapshot(conn, &target_folder_id).await {
        Ok(snapshot) => snapshot,
        Err(_) => {
            result.add_blocker("before-snapshot-failed");
            return result;
        }
    };

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

    let mut audit_id: Option<String> = None;
    if failure == Some(RollbackProofFailure::AuditInsert) {
        result.add_blocker("audit-insert-failed");
        rollback_transaction(tx, &mut result).await;
        verify_rollback(
            conn,
            &target_folder_id,
            audit_id.as_deref(),
            &before,
            &mut result,
        )
        .await;
        result.ok = false;
        return result;
    }

    let generated_audit_id = make_audit_id();
    let audit_insert = sqlx::query(
        r#"
        INSERT INTO sync_maintenance_log
          (maintenance_id, schema, operation, policy_version, reason,
           requested_at, requested_by_sync_peer_id, platform, dry_run,
           affected_tombstone_count, affected_review_count, skipped_count,
           warnings_json, result_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 0, 0, 0, '[]', '{}', ?)
        "#,
    )
    .bind(&generated_audit_id)
    .bind(AUDIT_SCHEMA)
    .bind(AUDIT_OPERATION)
    .bind(POLICY_VERSION)
    .bind(&reason)
    .bind(&now_iso)
    .bind(&requested_by_sync_peer_id)
    .bind(PLATFORM_DESKTOP)
    .bind(&now_iso)
    .execute(&mut *tx)
    .await;
    if audit_insert.is_err() {
        result.add_blocker("audit-insert-failed");
        rollback_transaction(tx, &mut result).await;
        verify_rollback(
            conn,
            &target_folder_id,
            audit_id.as_deref(),
            &before,
            &mut result,
        )
        .await;
        result.ok = false;
        return result;
    }
    audit_id = Some(generated_audit_id);
    result.transaction.audit_inserted = true;

    let current_row = match sqlx::query(
        r#"
        SELECT name, parent_id, color, sort_order, source, meta_json
          FROM folders
         WHERE id = ?
         LIMIT 1
        "#,
    )
    .bind(&target_folder_id)
    .fetch_optional(&mut *tx)
    .await
    {
        Ok(Some(row)) => row,
        Ok(None) => {
            result.add_blocker("target-folder-not-found");
            rollback_transaction(tx, &mut result).await;
            verify_rollback(
                conn,
                &target_folder_id,
                audit_id.as_deref(),
                &before,
                &mut result,
            )
            .await;
            result.ok = false;
            return result;
        }
        Err(_) => {
            result.add_blocker("current-row-read-failed");
            rollback_transaction(tx, &mut result).await;
            verify_rollback(
                conn,
                &target_folder_id,
                audit_id.as_deref(),
                &before,
                &mut result,
            )
            .await;
            result.ok = false;
            return result;
        }
    };
    result.transaction.current_row_read = true;
    let current = FolderRow {
        name: current_row.try_get::<String, _>("name").unwrap_or_default(),
        parent_id: current_row
            .try_get::<Option<String>, _>("parent_id")
            .unwrap_or(None),
        color: current_row
            .try_get::<Option<String>, _>("color")
            .unwrap_or(None),
        sort_order: current_row.try_get::<i64, _>("sort_order").unwrap_or(0),
        source: current_row
            .try_get::<String, _>("source")
            .unwrap_or_else(|_| "user".to_string()),
        meta_json: current_row
            .try_get::<String, _>("meta_json")
            .unwrap_or_else(|_| "{}".to_string()),
    };
    let current_hash = folder_hash(&current);
    if current_hash != expected_baseline_hash {
        result.add_blocker("baseline-hash-mismatch");
        rollback_transaction(tx, &mut result).await;
        verify_rollback(
            conn,
            &target_folder_id,
            audit_id.as_deref(),
            &before,
            &mut result,
        )
        .await;
        result.ok = false;
        return result;
    }
    result.transaction.baseline_verified = true;

    if let Some(target_hash) = expected_target_hash.as_ref() {
        let mut target = current.clone();
        target.color = Some(target_color.clone());
        if folder_hash(&target) != *target_hash {
            result.add_blocker("target-hash-mismatch");
            rollback_transaction(tx, &mut result).await;
            verify_rollback(
                conn,
                &target_folder_id,
                audit_id.as_deref(),
                &before,
                &mut result,
            )
            .await;
            result.ok = false;
            return result;
        }
    }

    let update_id = if failure == Some(RollbackProofFailure::AffectedRowMismatch) {
        "__f7_folder_color_rollback_missing_folder__"
    } else {
        &target_folder_id
    };
    let updated = sqlx::query("UPDATE folders SET color = ?, updated_at = ? WHERE id = ?")
        .bind(&target_color)
        .bind(updated_at_ms)
        .bind(update_id)
        .execute(&mut *tx)
        .await;
    result.transaction.update_simulated = updated.is_ok();
    let affected = match updated {
        Ok(done) => done.rows_affected(),
        Err(_) => {
            result.add_blocker("folder-update-failed");
            rollback_transaction(tx, &mut result).await;
            verify_rollback(
                conn,
                &target_folder_id,
                audit_id.as_deref(),
                &before,
                &mut result,
            )
            .await;
            result.ok = false;
            return result;
        }
    };
    if affected != 1 {
        result.add_blocker("affected-row-count-mismatch");
        rollback_transaction(tx, &mut result).await;
        verify_rollback(
            conn,
            &target_folder_id,
            audit_id.as_deref(),
            &before,
            &mut result,
        )
        .await;
        result.ok = false;
        return result;
    }
    result.transaction.affected_rows_verified = true;

    let audit_update_id = if failure == Some(RollbackProofFailure::AuditUpdate) {
        "__f7_folder_color_rollback_missing_audit__"
    } else {
        audit_id.as_deref().unwrap_or("")
    };
    let result_json = json!({
        "redacted": true,
        "proofOnly": true,
        "operation": AUDIT_OPERATION,
        "policyVersion": POLICY_VERSION,
        "entityKind": ENTITY_KIND,
        "fieldsUpdated": [field],
        "baselineHashPresent": true,
        "targetHashPresent": expected_target_hash.is_some(),
        "rowsWouldUpdate": 1,
        "rowsUpdatedInTransaction": 1,
        "writesCommitted": 0
    })
    .to_string();
    let audit_update = sqlx::query(
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
    let audit_rows = match audit_update {
        Ok(done) => done.rows_affected(),
        Err(_) => {
            result.add_blocker("audit-update-failed");
            rollback_transaction(tx, &mut result).await;
            verify_rollback(
                conn,
                &target_folder_id,
                audit_id.as_deref(),
                &before,
                &mut result,
            )
            .await;
            result.ok = false;
            return result;
        }
    };
    if audit_rows != 1 {
        result.add_blocker("audit-update-failed");
        rollback_transaction(tx, &mut result).await;
        verify_rollback(
            conn,
            &target_folder_id,
            audit_id.as_deref(),
            &before,
            &mut result,
        )
        .await;
        result.ok = false;
        return result;
    }
    result.transaction.audit_updated = true;

    rollback_transaction(tx, &mut result).await;
    verify_rollback(
        conn,
        &target_folder_id,
        audit_id.as_deref(),
        &before,
        &mut result,
    )
    .await;
    result.ok = result.blockers.is_empty() && result.transaction.rollback_verified;
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    const FIXTURE_FOLDER_ID: &str = "f7-real-rollback-folder-001";
    const FIXTURE_FOLDER_NAME: &str = "F7 Rollback Folder";
    const FIXTURE_COLOR: &str = "proof-blue";
    const TARGET_COLOR: &str = "proof-green";
    const FIXTURE_PEER_ID: &str = "f7-proof-peer";

    async fn setup_conn() -> SqliteConnection {
        let mut conn = SqliteConnection::connect(":memory:").await.unwrap();
        sqlx::query(
            r#"
            CREATE TABLE folders (
              id          TEXT    PRIMARY KEY,
              name        TEXT    NOT NULL,
              parent_id   TEXT,
              color       TEXT,
              sort_order  INTEGER NOT NULL DEFAULT 0,
              source      TEXT    NOT NULL DEFAULT 'user',
              created_at  INTEGER NOT NULL,
              updated_at  INTEGER NOT NULL,
              meta_json   TEXT    NOT NULL DEFAULT '{}'
            )
            "#,
        )
        .execute(&mut conn)
        .await
        .unwrap();
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
        .execute(&mut conn)
        .await
        .unwrap();
        sqlx::query(
            r#"
            INSERT INTO folders
              (id, name, parent_id, color, sort_order, source, created_at, updated_at, meta_json)
            VALUES (?, ?, NULL, ?, 0, 'user', 1700000000000, 1700000000000, '{}')
            "#,
        )
        .bind(FIXTURE_FOLDER_ID)
        .bind(FIXTURE_FOLDER_NAME)
        .bind(FIXTURE_COLOR)
        .execute(&mut conn)
        .await
        .unwrap();
        conn
    }

    fn valid_payload(hash: String) -> FolderMetadataColorApplyRollbackProofPayload {
        FolderMetadataColorApplyRollbackProofPayload {
            dry_run: true,
            dev_gate: ROLLBACK_PROOF_GATE.to_string(),
            target_folder_id: FIXTURE_FOLDER_ID.to_string(),
            field: "color".to_string(),
            target_color: Some(TARGET_COLOR.to_string()),
            selected_delta: None,
            expected_baseline_hash: hash,
            expected_target_hash: None,
            reason: "operator approved rollback proof".to_string(),
            requested_by_sync_peer_id: FIXTURE_PEER_ID.to_string(),
            apply_plan_ok: Some(true),
            apply_plan_applyable: Some(true),
            prior_plan: None,
        }
    }

    async fn current_hash(conn: &mut SqliteConnection) -> String {
        folder_hash(
            &read_folder_row(conn, FIXTURE_FOLDER_ID)
                .await
                .unwrap()
                .unwrap(),
        )
    }

    fn fixture_baseline_hash_for_redaction() -> String {
        folder_hash(&FolderRow {
            name: FIXTURE_FOLDER_NAME.to_string(),
            parent_id: None,
            color: Some(FIXTURE_COLOR.to_string()),
            sort_order: 0,
            source: "user".to_string(),
            meta_json: "{}".to_string(),
        })
    }

    #[test]
    fn f7_folder_metadata_apply_rollback_proof_empty_parent_hash_canonicalizes() {
        let base = FolderRow {
            name: FIXTURE_FOLDER_NAME.to_string(),
            parent_id: None,
            color: Some(FIXTURE_COLOR.to_string()),
            sort_order: 0,
            source: "user".to_string(),
            meta_json: "{}".to_string(),
        };
        let empty_parent = FolderRow {
            parent_id: Some("".to_string()),
            ..base.clone()
        };
        let whitespace_parent = FolderRow {
            parent_id: Some("   ".to_string()),
            ..base.clone()
        };

        assert_eq!(folder_hash(&base), folder_hash(&empty_parent));
        assert_eq!(folder_hash(&base), folder_hash(&whitespace_parent));
    }

    async fn run(
        mut payload: FolderMetadataColorApplyRollbackProofPayload,
        failure: Option<RollbackProofFailure>,
    ) -> (
        FolderMetadataColorApplyRollbackProofResult,
        RollbackProofSnapshot,
    ) {
        let mut conn = setup_conn().await;
        if payload.expected_baseline_hash == "__fixture_hash__" {
            payload.expected_baseline_hash = current_hash(&mut conn).await;
        }
        let before = capture_snapshot(&mut conn, FIXTURE_FOLDER_ID)
            .await
            .unwrap();
        let result = run_rollback_proof_inner(
            &mut conn,
            payload,
            "2026-05-24T00:00:00Z".to_string(),
            1_800_000_000_000,
            failure,
        )
        .await;
        let after = capture_snapshot(&mut conn, FIXTURE_FOLDER_ID)
            .await
            .unwrap();
        assert_eq!(
            before, after,
            "rollback proof must leave fixture DB unchanged"
        );
        (result, after)
    }

    fn assert_redacted(result: &FolderMetadataColorApplyRollbackProofResult) {
        let raw = serde_json::to_string(result).expect("rollback proof result serializes");
        let fixture_hash = fixture_baseline_hash_for_redaction();
        for forbidden in [
            FIXTURE_FOLDER_ID,
            FIXTURE_FOLDER_NAME,
            FIXTURE_COLOR,
            TARGET_COLOR,
            FIXTURE_PEER_ID,
            "f7-folder-color-rollback-proof",
            fixture_hash.as_str(),
        ] {
            assert!(
                !raw.contains(forbidden),
                "rollback proof result leaked forbidden token {forbidden}: {raw}"
            );
        }
    }

    #[test]
    fn f7_folder_metadata_apply_rollback_proof_success_rolls_back_and_verifies() {
        tauri::async_runtime::block_on(async {
            let payload = valid_payload("__fixture_hash__".to_string());
            let (result, _) = run(payload, None).await;
            assert!(result.ok);
            assert!(result.redacted);
            assert!(result.dry_run);
            assert!(result.proof_only);
            assert!(!result.applied);
            assert_eq!(result.writes_committed, 0);
            assert_eq!(result.field.as_deref(), Some("color"));
            assert!(result.transaction.began);
            assert!(result.transaction.audit_inserted);
            assert!(result.transaction.current_row_read);
            assert!(result.transaction.baseline_verified);
            assert!(result.transaction.update_simulated);
            assert!(result.transaction.affected_rows_verified);
            assert!(result.transaction.audit_updated);
            assert!(result.transaction.rolled_back);
            assert!(result.transaction.rollback_verified);
            assert!(result.verification.folder_unchanged);
            assert!(result.verification.audit_not_persisted);
            assert!(result.verification.row_counts_unchanged);
            assert!(result.blockers.is_empty());
            assert_redacted(&result);
        });
    }

    #[test]
    fn f7_folder_metadata_apply_rollback_proof_wrong_gate_and_missing_reason_block() {
        tauri::async_runtime::block_on(async {
            let mut wrong_gate = valid_payload("__fixture_hash__".to_string());
            wrong_gate.dev_gate = "wrong".to_string();
            let (wrong_result, _) = run(wrong_gate, None).await;
            assert!(!wrong_result.ok);
            assert_eq!(wrong_result.blockers[0].code, "invalid-dev-gate");
            assert!(!wrong_result.transaction.began);
            assert_redacted(&wrong_result);

            let mut missing_reason = valid_payload("__fixture_hash__".to_string());
            missing_reason.reason = " ".to_string();
            let (missing_result, _) = run(missing_reason, None).await;
            assert!(!missing_result.ok);
            assert_eq!(missing_result.blockers[0].code, "invalid-reason");
            assert!(!missing_result.transaction.began);
            assert_redacted(&missing_result);

            let mut not_dry_run = valid_payload("__fixture_hash__".to_string());
            not_dry_run.dry_run = false;
            let (dry_run_result, _) = run(not_dry_run, None).await;
            assert!(!dry_run_result.ok);
            assert_eq!(dry_run_result.blockers[0].code, "dry-run-required");
            assert!(!dry_run_result.transaction.began);
            assert_redacted(&dry_run_result);
        });
    }

    #[test]
    fn f7_folder_metadata_apply_rollback_proof_unsupported_field_blocks() {
        tauri::async_runtime::block_on(async {
            for field in ["name", "parentId", "sortOrder", "icon", "meta", "updatedAt"] {
                let mut payload = valid_payload("__fixture_hash__".to_string());
                payload.field = field.to_string();
                let (result, _) = run(payload, None).await;
                assert!(!result.ok, "field {field} must block");
                assert_eq!(result.blockers[0].code, "field-not-allowlisted");
                assert_eq!(result.field, None);
                assert!(!result.transaction.began);
                assert_redacted(&result);
            }
        });
    }

    #[test]
    fn f7_folder_metadata_apply_rollback_proof_stale_baseline_blocks_and_rolls_back() {
        tauri::async_runtime::block_on(async {
            let payload = valid_payload("deadbeef".to_string());
            let (result, _) = run(payload, None).await;
            assert!(!result.ok);
            assert!(result.transaction.began);
            assert!(result.transaction.audit_inserted);
            assert!(result.transaction.current_row_read);
            assert!(!result.transaction.baseline_verified);
            assert!(result.transaction.rolled_back);
            assert!(result.transaction.rollback_verified);
            assert_eq!(result.blockers[0].code, "baseline-hash-mismatch");
            assert_redacted(&result);
        });
    }

    #[test]
    fn f7_folder_metadata_apply_rollback_proof_missing_folder_blocks_and_rolls_back() {
        tauri::async_runtime::block_on(async {
            let mut conn = setup_conn().await;
            let hash = current_hash(&mut conn).await;
            let mut payload = valid_payload(hash);
            payload.target_folder_id = "missing-folder".to_string();
            let before = capture_snapshot(&mut conn, FIXTURE_FOLDER_ID)
                .await
                .unwrap();
            let result = run_rollback_proof_inner(
                &mut conn,
                payload,
                "2026-05-24T00:00:00Z".to_string(),
                1_800_000_000_000,
                None,
            )
            .await;
            let after = capture_snapshot(&mut conn, FIXTURE_FOLDER_ID)
                .await
                .unwrap();
            assert_eq!(before, after);
            assert!(!result.ok);
            assert!(result.transaction.audit_inserted);
            assert!(result.transaction.rolled_back);
            assert!(result.transaction.rollback_verified);
            assert_eq!(result.blockers[0].code, "target-folder-not-found");
            assert_redacted(&result);
        });
    }

    #[test]
    fn f7_folder_metadata_apply_rollback_proof_affected_row_mismatch_rolls_back() {
        tauri::async_runtime::block_on(async {
            let payload = valid_payload("__fixture_hash__".to_string());
            let (result, _) = run(payload, Some(RollbackProofFailure::AffectedRowMismatch)).await;
            assert!(!result.ok);
            assert!(result.transaction.audit_inserted);
            assert!(result.transaction.baseline_verified);
            assert!(result.transaction.update_simulated);
            assert!(!result.transaction.affected_rows_verified);
            assert!(result.transaction.rolled_back);
            assert!(result.transaction.rollback_verified);
            assert_eq!(result.blockers[0].code, "affected-row-count-mismatch");
            assert_redacted(&result);
        });
    }

    #[test]
    fn f7_folder_metadata_apply_rollback_proof_audit_insert_failure_rolls_back() {
        tauri::async_runtime::block_on(async {
            let payload = valid_payload("__fixture_hash__".to_string());
            let (result, _) = run(payload, Some(RollbackProofFailure::AuditInsert)).await;
            assert!(!result.ok);
            assert!(result.transaction.began);
            assert!(!result.transaction.audit_inserted);
            assert!(result.transaction.rolled_back);
            assert!(result.transaction.rollback_verified);
            assert_eq!(result.blockers[0].code, "audit-insert-failed");
            assert_redacted(&result);
        });
    }

    #[test]
    fn f7_folder_metadata_apply_rollback_proof_audit_update_failure_rolls_back() {
        tauri::async_runtime::block_on(async {
            let payload = valid_payload("__fixture_hash__".to_string());
            let (result, _) = run(payload, Some(RollbackProofFailure::AuditUpdate)).await;
            assert!(!result.ok);
            assert!(result.transaction.audit_inserted);
            assert!(result.transaction.affected_rows_verified);
            assert!(!result.transaction.audit_updated);
            assert!(result.transaction.rolled_back);
            assert!(result.transaction.rollback_verified);
            assert_eq!(result.blockers[0].code, "audit-update-failed");
            assert_redacted(&result);
        });
    }

    #[test]
    fn f7_folder_metadata_apply_rollback_proof_requires_prior_plan_and_accepts_icon_color() {
        tauri::async_runtime::block_on(async {
            let mut missing_plan = valid_payload("__fixture_hash__".to_string());
            missing_plan.apply_plan_ok = None;
            missing_plan.apply_plan_applyable = None;
            let (missing_result, _) = run(missing_plan, None).await;
            assert!(!missing_result.ok);
            assert_eq!(missing_result.blockers[0].code, "apply-plan-proof-required");
            assert!(!missing_result.transaction.began);
            assert_redacted(&missing_result);

            let mut icon_color = valid_payload("__fixture_hash__".to_string());
            icon_color.field = "iconColor".to_string();
            let (icon_result, _) = run(icon_color, None).await;
            assert!(icon_result.ok);
            assert_eq!(icon_result.field.as_deref(), Some("iconColor"));
            assert_redacted(&icon_result);
        });
    }

    #[test]
    fn f7_folder_metadata_apply_rollback_proof_target_hash_mismatch_blocks() {
        tauri::async_runtime::block_on(async {
            let mut payload = valid_payload("__fixture_hash__".to_string());
            payload.expected_target_hash = Some("deadbeef".to_string());
            let (result, _) = run(payload, None).await;
            assert!(!result.ok);
            assert!(result.transaction.baseline_verified);
            assert!(result.transaction.rolled_back);
            assert!(result.transaction.rollback_verified);
            assert_eq!(result.blockers[0].code, "target-hash-mismatch");
            assert_redacted(&result);
        });
    }

    #[test]
    fn f7_folder_metadata_apply_rollback_proof_no_real_apply_result_surface() {
        tauri::async_runtime::block_on(async {
            let payload = valid_payload("__fixture_hash__".to_string());
            let (result, _) = run(payload, None).await;
            assert_eq!(result.schema, ROLLBACK_PROOF_SCHEMA);
            assert!(result.proof_only);
            assert!(!result.applied);
            assert_eq!(result.writes_committed, 0);
            assert_eq!(result.entity_kind, ENTITY_KIND);
            assert_redacted(&result);
        });
    }
}
