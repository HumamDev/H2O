// F7.4.3 - exact-gated local folder.metadata color apply.
//
// This is the first real F7 mutation path. It is deliberately narrow:
// one existing local folder row, one scalar column (`folders.color`), one
// transaction, one audit row. It does not write Chrome storage, trigger
// import/export/sync, mutate F5/F6 state, or touch folder bindings/content.

use serde::{Deserialize, Serialize};
use serde_json::{json, Value as JsonValue};
use sqlx::{Connection, Row, SqliteConnection};
use std::collections::BTreeMap;
use std::sync::atomic::{AtomicU64, Ordering};

pub const APPLY_SCHEMA: &str = "h2o.studio.sync.folder-metadata-color-apply.v0";
pub const APPLY_GATE: &str = "I_UNDERSTAND_THIS_APPLIES_ONE_LOCAL_FOLDER_COLOR_CHANGE";

const AUDIT_SCHEMA: &str = "h2o.studio.sync.maintenance.v1";
const AUDIT_OPERATION: &str = "folder-metadata-color-apply";
const POLICY_VERSION: &str = "h2o.studio.sync.folder-metadata-apply.v0";
const ENTITY_KIND: &str = "folder.metadata";
const PLATFORM_DESKTOP: &str = "desktop-tauri";
const CANDIDATE_DEDUPE_PREFIX: &str = "candidate-hash:";

static AUDIT_ID_COUNTER: AtomicU64 = AtomicU64::new(0);

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderMetadataColorApplyPayload {
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
    pub dedupe_key_hash: String,
    #[serde(default)]
    pub prior_plan: Option<JsonValue>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum ApplyFailure {
    AuditInsert,
    AffectedRowMismatch,
    AuditUpdate,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApplyBlocker {
    pub code: String,
}

impl ApplyBlocker {
    fn new(code: &str) -> Self {
        Self {
            code: code.to_string(),
        }
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApplyAudit {
    pub recorded: bool,
    pub operator_peer_recorded: bool,
}

impl ApplyAudit {
    fn new() -> Self {
        Self {
            recorded: false,
            operator_peer_recorded: false,
        }
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApplyCounts {
    pub rows_updated: i64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderMetadataColorApplyResult {
    pub schema: &'static str,
    pub ok: bool,
    pub redacted: bool,
    pub dry_run: bool,
    pub applied: bool,
    pub local_only: bool,
    pub sync_propagated: bool,
    pub entity_kind: &'static str,
    pub fields_updated: Vec<String>,
    pub audit: ApplyAudit,
    pub counts: ApplyCounts,
    pub blockers: Vec<ApplyBlocker>,
    pub warnings: Vec<ApplyBlocker>,
}

impl FolderMetadataColorApplyResult {
    fn skeleton(dry_run: bool) -> Self {
        Self {
            schema: APPLY_SCHEMA,
            ok: false,
            redacted: true,
            dry_run,
            applied: false,
            local_only: true,
            sync_propagated: false,
            entity_kind: ENTITY_KIND,
            fields_updated: vec![],
            audit: ApplyAudit::new(),
            counts: ApplyCounts { rows_updated: 0 },
            blockers: vec![],
            warnings: vec![],
        }
    }

    pub fn blocked(code: &str) -> Self {
        let mut result = Self::skeleton(false);
        result.add_blocker(code);
        result
    }

    fn add_blocker(&mut self, code: &str) {
        if !self.blockers.iter().any(|b| b.code == code) {
            self.blockers.push(ApplyBlocker::new(code));
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

fn suspicious_dedupe_hash(value: &str) -> bool {
    let s = value.trim().to_ascii_lowercase();
    if s.is_empty() {
        return true;
    }
    if s.chars()
        .any(|c| c.is_whitespace() || matches!(c, '{' | '}' | '[' | ']' | '"' | '\'' | '`'))
    {
        return true;
    }
    let padded = format!(
        ".{}.",
        s.replace(':', ".").replace('-', ".").replace('_', ".")
    );
    [
        "rawjson",
        "raw_json",
        "content",
        "title",
        "prompt",
        "answer",
        "message",
        "href",
        "url",
        "transcript",
        "text",
        "body",
        "metadata",
        "raw",
    ]
    .iter()
    .any(|token| padded.contains(&format!(".{token}.")))
}

fn valid_dedupe_key_hash(value: &str) -> bool {
    let trimmed = value.trim();
    !trimmed.is_empty()
        && trimmed.len() <= 160
        && trimmed
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | ':' | '-'))
        && !trimmed
            .to_ascii_lowercase()
            .starts_with(CANDIDATE_DEDUPE_PREFIX)
        && !suspicious_dedupe_hash(trimmed)
}

fn json_bool(value: &JsonValue, key: &str) -> Option<bool> {
    value.as_object()?.get(key)?.as_bool()
}

fn prior_plan_passed(payload: &FolderMetadataColorApplyPayload) -> bool {
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

fn target_color_from_payload(payload: &FolderMetadataColorApplyPayload) -> String {
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
    format!("f7-folder-color-apply-{micros}-{n}")
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
    let mut map = BTreeMap::<String, JsonValue>::new();
    map.insert("color".to_string(), json!(row.color));
    map.insert("icon".to_string(), JsonValue::Null);
    map.insert("kind".to_string(), JsonValue::Null);
    map.insert("metaPresent".to_string(), json!(meta_present));
    map.insert("name".to_string(), json!(row.name));
    map.insert("parentId".to_string(), json!(row.parent_id));
    map.insert("sortOrder".to_string(), json!(row.sort_order));
    map.insert("source".to_string(), json!(row.source));
    fnv1a_32_hex(&serde_json::to_string(&map).unwrap_or_else(|_| "{}".to_string()))
}

fn encode_component(value: &str) -> String {
    let mut out = String::new();
    for b in value.as_bytes() {
        let c = *b as char;
        if c.is_ascii_alphanumeric()
            || matches!(c, '-' | '_' | '.' | '!' | '~' | '*' | '\'' | '(' | ')')
        {
            out.push(c);
        } else {
            out.push_str(&format!("%{b:02X}"));
        }
    }
    out
}

fn folder_record_id(folder_id: &str) -> String {
    format!("folder:{}", encode_component(folder_id))
}

async fn table_exists(
    tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    table: &str,
) -> Result<bool, sqlx::Error> {
    let row =
        sqlx::query("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1")
            .bind(table)
            .fetch_optional(&mut **tx)
            .await?;
    Ok(row.is_some())
}

async fn read_folder_row(
    tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
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
    .fetch_optional(&mut **tx)
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

async fn f5_blocker(
    tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    target_folder_id: &str,
) -> Result<Option<&'static str>, sqlx::Error> {
    if !table_exists(tx, "sync_tombstones").await?
        || !table_exists(tx, "sync_tombstone_reviews").await?
    {
        return Ok(Some("f5-blocker-check-unavailable"));
    }
    let encoded = folder_record_id(target_folder_id);
    let row = sqlx::query(
        r#"
        SELECT delete_reason, cascade_from
          FROM sync_tombstones
         WHERE record_kind = 'folder'
           AND restored_at IS NULL
           AND record_id IN (?, ?)
         LIMIT 1
        "#,
    )
    .bind(target_folder_id)
    .bind(&encoded)
    .fetch_optional(&mut **tx)
    .await?;
    if let Some(row) = row {
        let delete_reason = row
            .try_get::<Option<String>, _>("delete_reason")
            .ok()
            .flatten()
            .unwrap_or_default()
            .to_ascii_lowercase();
        let cascade_from = row
            .try_get::<Option<String>, _>("cascade_from")
            .ok()
            .flatten()
            .unwrap_or_default();
        if !cascade_from.trim().is_empty() || delete_reason.contains("cascade") {
            return Ok(Some("f5-cascade-delete-evidence-present"));
        }
        return Ok(Some("f5-folder-tombstone-present"));
    }

    let cascade = sqlx::query(
        r#"
        SELECT tombstone_id
          FROM sync_tombstones
         WHERE restored_at IS NULL
           AND cascade_from IN (?, ?)
         LIMIT 1
        "#,
    )
    .bind(target_folder_id)
    .bind(&encoded)
    .fetch_optional(&mut **tx)
    .await?;
    if cascade.is_some() {
        return Ok(Some("f5-cascade-delete-evidence-present"));
    }

    let review = sqlx::query(
        r#"
        SELECT classification, status
          FROM sync_tombstone_reviews
         WHERE record_kind = 'folder'
           AND record_id IN (?, ?)
           AND status IN ('pending', 'accepted-later')
         LIMIT 1
        "#,
    )
    .bind(target_folder_id)
    .bind(&encoded)
    .fetch_optional(&mut **tx)
    .await?;
    if let Some(row) = review {
        let classification = row
            .try_get::<Option<String>, _>("classification")
            .ok()
            .flatten()
            .unwrap_or_default();
        if classification == "delete-vs-edit" {
            return Ok(Some("f5-delete-vs-edit-review-present"));
        }
        if classification == "cascade-review" {
            return Ok(Some("f5-cascade-delete-review-present"));
        }
        return Ok(Some("f5-unresolved-delete-review-present"));
    }

    Ok(None)
}

fn f6_resolved_blocker(decision: &str) -> Option<&'static str> {
    match decision {
        "resolved-no-action-needed"
        | "resolved-duplicate"
        | "resolved-local-wins"
        | "resolved-remote-wins"
        | "resolved-manual-merge" => None,
        "resolved-owned-by-f5" => Some("f6-conflict-owned-by-f5"),
        "blocked-unsupported" => Some("f6-conflict-blocked-unsupported"),
        _ => Some("f6-conflict-resolution-ambiguous"),
    }
}

async fn f6_blocker(
    tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    dedupe_key_hash: &str,
) -> Result<Option<&'static str>, sqlx::Error> {
    if !table_exists(tx, "sync_conflicts").await? {
        return Ok(Some("f6-blocker-check-unavailable"));
    }
    let dedupe_key = format!("{CANDIDATE_DEDUPE_PREFIX}{}", dedupe_key_hash.trim());
    let row = sqlx::query(
        r#"
        SELECT status, decision, classification, severity, conflict_kind, entity_kind
          FROM sync_conflicts
         WHERE dedupe_key = ?
         LIMIT 1
        "#,
    )
    .bind(dedupe_key)
    .fetch_optional(&mut **tx)
    .await?;
    let Some(row) = row else {
        return Ok(None);
    };
    let status = row
        .try_get::<Option<String>, _>("status")
        .ok()
        .flatten()
        .unwrap_or_default();
    let decision = row
        .try_get::<Option<String>, _>("decision")
        .ok()
        .flatten()
        .unwrap_or_default();
    let classification = row
        .try_get::<Option<String>, _>("classification")
        .ok()
        .flatten()
        .unwrap_or_default();
    let conflict_kind = row
        .try_get::<Option<String>, _>("conflict_kind")
        .ok()
        .flatten()
        .unwrap_or_default();

    if status == "ignored" {
        return Ok(
            (decision != "ignored-by-operator").then_some("f6-conflict-resolution-ambiguous")
        );
    }
    if status == "rejected" {
        return Ok(
            (decision != "rejected-by-operator").then_some("f6-conflict-resolution-ambiguous")
        );
    }
    if conflict_kind == "delete-vs-edit-reference" || classification == "delete-vs-edit-owned-by-f5"
    {
        return Ok(Some("f6-conflict-owned-by-f5"));
    }
    match status.as_str() {
        "pending" => Ok(Some("f6-conflict-pending")),
        "accepted-later" => Ok(Some("f6-conflict-accepted-later")),
        "superseded" => Ok(None),
        "resolved" => Ok(f6_resolved_blocker(&decision)),
        _ => Ok(Some("f6-conflict-status-unknown")),
    }
}

pub async fn run_apply(
    conn: &mut SqliteConnection,
    payload: FolderMetadataColorApplyPayload,
    now_iso: String,
    updated_at_ms: i64,
) -> FolderMetadataColorApplyResult {
    run_apply_inner(conn, payload, now_iso, updated_at_ms, None).await
}

async fn run_apply_inner(
    conn: &mut SqliteConnection,
    payload: FolderMetadataColorApplyPayload,
    now_iso: String,
    updated_at_ms: i64,
    failure: Option<ApplyFailure>,
) -> FolderMetadataColorApplyResult {
    let mut result = FolderMetadataColorApplyResult::skeleton(payload.dry_run);
    let field = clean_string(&payload.field);
    if payload.dry_run != false {
        result.add_blocker("dry-run-must-be-false");
    }
    if payload.dev_gate.trim() != APPLY_GATE {
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
    let dedupe_key_hash = clean_string(&payload.dedupe_key_hash);
    if !valid_dedupe_key_hash(&dedupe_key_hash) {
        result.add_blocker("invalid-dedupe-key-hash");
    }
    if !prior_plan_passed(&payload) {
        result.add_blocker("apply-plan-proof-required");
    }
    if !result.blockers.is_empty() {
        return result;
    }

    let mut tx = match conn.begin().await {
        Ok(tx) => tx,
        Err(_) => {
            result.add_blocker("transaction-begin-failed");
            return result;
        }
    };

    for table in [
        "folders",
        "sync_maintenance_log",
        "sync_tombstones",
        "sync_tombstone_reviews",
        "sync_conflicts",
    ] {
        match table_exists(&mut tx, table).await {
            Ok(true) => {}
            Ok(false) => {
                let _ = tx.rollback().await;
                result.add_blocker(match table {
                    "folders" => "folders-table-unavailable",
                    "sync_maintenance_log" => "maintenance-log-unavailable",
                    "sync_tombstones" | "sync_tombstone_reviews" => "f5-blocker-check-unavailable",
                    "sync_conflicts" => "f6-blocker-check-unavailable",
                    _ => "db-unavailable",
                });
                return result;
            }
            Err(_) => {
                let _ = tx.rollback().await;
                result.add_blocker("db-unavailable");
                return result;
            }
        }
    }

    if failure == Some(ApplyFailure::AuditInsert) {
        let _ = tx.rollback().await;
        result.add_blocker("audit-insert-failed");
        return result;
    }

    let audit_id = make_audit_id();
    let audit_insert = sqlx::query(
        r#"
        INSERT INTO sync_maintenance_log
          (maintenance_id, schema, operation, policy_version, reason,
           requested_at, requested_by_sync_peer_id, platform, dry_run,
           affected_tombstone_count, affected_review_count, skipped_count,
           warnings_json, result_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 0, '[]', '{}', ?)
        "#,
    )
    .bind(&audit_id)
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
        let _ = tx.rollback().await;
        result.add_blocker("audit-insert-failed");
        return result;
    }

    let current = match read_folder_row(&mut tx, &target_folder_id).await {
        Ok(Some(row)) => row,
        Ok(None) => {
            let _ = tx.rollback().await;
            result.add_blocker("target-folder-not-found");
            return result;
        }
        Err(_) => {
            let _ = tx.rollback().await;
            result.add_blocker("current-row-read-failed");
            return result;
        }
    };
    let current_hash = folder_hash(&current);
    if current_hash != expected_baseline_hash {
        let _ = tx.rollback().await;
        result.add_blocker("baseline-hash-mismatch");
        return result;
    }

    if let Some(target_hash) = expected_target_hash.as_ref() {
        let mut target = current.clone();
        target.color = Some(target_color.clone());
        if folder_hash(&target) != *target_hash {
            let _ = tx.rollback().await;
            result.add_blocker("target-hash-mismatch");
            return result;
        }
    }

    match f5_blocker(&mut tx, &target_folder_id).await {
        Ok(Some(code)) => {
            let _ = tx.rollback().await;
            result.add_blocker(code);
            return result;
        }
        Ok(None) => {}
        Err(_) => {
            let _ = tx.rollback().await;
            result.add_blocker("f5-blocker-check-unavailable");
            return result;
        }
    }

    match f6_blocker(&mut tx, &dedupe_key_hash).await {
        Ok(Some(code)) => {
            let _ = tx.rollback().await;
            result.add_blocker(code);
            return result;
        }
        Ok(None) => {}
        Err(_) => {
            let _ = tx.rollback().await;
            result.add_blocker("f6-blocker-check-unavailable");
            return result;
        }
    }

    let update_id = if failure == Some(ApplyFailure::AffectedRowMismatch) {
        "__f7_folder_color_apply_missing_folder__"
    } else {
        &target_folder_id
    };
    let updated = sqlx::query("UPDATE folders SET color = ?, updated_at = ? WHERE id = ?")
        .bind(&target_color)
        .bind(updated_at_ms)
        .bind(update_id)
        .execute(&mut *tx)
        .await;
    let affected = match updated {
        Ok(done) => done.rows_affected() as i64,
        Err(_) => {
            let _ = tx.rollback().await;
            result.add_blocker("folder-update-failed");
            return result;
        }
    };
    if affected != 1 {
        let _ = tx.rollback().await;
        result.add_blocker("affected-row-count-mismatch");
        return result;
    }

    let audit_update_id = if failure == Some(ApplyFailure::AuditUpdate) {
        "__f7_folder_color_apply_missing_audit__"
    } else {
        &audit_id
    };
    let result_json = json!({
        "redacted": true,
        "operation": AUDIT_OPERATION,
        "policyVersion": POLICY_VERSION,
        "entityKind": ENTITY_KIND,
        "fieldsUpdated": ["color"],
        "baselineHashPresent": true,
        "targetHashPresent": expected_target_hash.is_some(),
        "rowsUpdated": 1,
        "f5BlockersAbsent": true,
        "f6BlockersAbsent": true,
        "localOnly": true,
        "syncPropagated": false
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
            let _ = tx.rollback().await;
            result.add_blocker("audit-update-failed");
            return result;
        }
    };
    if audit_rows != 1 {
        let _ = tx.rollback().await;
        result.add_blocker("audit-update-failed");
        return result;
    }

    if tx.commit().await.is_err() {
        result.add_blocker("transaction-commit-failed");
        return result;
    }

    result.ok = true;
    result.applied = true;
    result.fields_updated = vec!["color".to_string()];
    result.audit.recorded = true;
    result.audit.operator_peer_recorded = true;
    result.counts.rows_updated = 1;
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    const FIXTURE_FOLDER_ID: &str = "f7-real-apply-folder-001";
    const FIXTURE_FOLDER_NAME: &str = "F7 Apply Folder";
    const FIXTURE_COLOR: &str = "proof-blue";
    const TARGET_COLOR: &str = "proof-green";
    const FIXTURE_PEER_ID: &str = "f7-apply-peer";
    const FIXTURE_DEDUPE_HASH: &str = "f7-apply-dedupe-001";

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
            CREATE TABLE folder_bindings (
              chat_id     TEXT    NOT NULL,
              folder_id   TEXT    NOT NULL,
              assigned_at INTEGER NOT NULL,
              PRIMARY KEY (chat_id)
            )
            "#,
        )
        .execute(&mut conn)
        .await
        .unwrap();
        sqlx::query(
            r#"
            CREATE TABLE chats (
              id TEXT PRIMARY KEY,
              title TEXT NOT NULL DEFAULT '',
              updated_at INTEGER NOT NULL DEFAULT 0
            )
            "#,
        )
        .execute(&mut conn)
        .await
        .unwrap();
        sqlx::query(
            r#"
            CREATE TABLE snapshots (
              id TEXT PRIMARY KEY,
              chat_id TEXT NOT NULL,
              updated_at INTEGER NOT NULL DEFAULT 0
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
            CREATE TABLE sync_tombstones (
              tombstone_id TEXT PRIMARY KEY,
              record_kind TEXT NOT NULL,
              record_id TEXT NOT NULL,
              delete_reason TEXT NOT NULL,
              restored_at TEXT,
              cascade_from TEXT
            )
            "#,
        )
        .execute(&mut conn)
        .await
        .unwrap();
        sqlx::query(
            r#"
            CREATE TABLE sync_tombstone_reviews (
              review_id TEXT PRIMARY KEY,
              record_kind TEXT,
              record_id TEXT,
              classification TEXT NOT NULL,
              status TEXT NOT NULL,
              decision TEXT
            )
            "#,
        )
        .execute(&mut conn)
        .await
        .unwrap();
        sqlx::query(
            r#"
            CREATE TABLE sync_conflicts (
              conflict_id TEXT PRIMARY KEY,
              dedupe_key TEXT NOT NULL UNIQUE,
              status TEXT NOT NULL,
              decision TEXT,
              classification TEXT NOT NULL,
              severity TEXT NOT NULL,
              conflict_kind TEXT NOT NULL,
              entity_kind TEXT NOT NULL
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
        sqlx::query(
            "INSERT INTO folder_bindings (chat_id, folder_id, assigned_at) VALUES ('chat-1', ?, 1)",
        )
        .bind(FIXTURE_FOLDER_ID)
        .execute(&mut conn)
        .await
        .unwrap();
        sqlx::query("INSERT INTO chats (id, title, updated_at) VALUES ('chat-1', 'Chat', 1)")
            .execute(&mut conn)
            .await
            .unwrap();
        sqlx::query(
            "INSERT INTO snapshots (id, chat_id, updated_at) VALUES ('snap-1', 'chat-1', 1)",
        )
        .execute(&mut conn)
        .await
        .unwrap();
        conn
    }

    fn valid_payload(hash: String) -> FolderMetadataColorApplyPayload {
        FolderMetadataColorApplyPayload {
            dry_run: false,
            dev_gate: APPLY_GATE.to_string(),
            target_folder_id: FIXTURE_FOLDER_ID.to_string(),
            field: "color".to_string(),
            target_color: Some(TARGET_COLOR.to_string()),
            selected_delta: None,
            expected_baseline_hash: hash,
            expected_target_hash: None,
            reason: "operator approved one local folder color update".to_string(),
            requested_by_sync_peer_id: FIXTURE_PEER_ID.to_string(),
            dedupe_key_hash: FIXTURE_DEDUPE_HASH.to_string(),
            prior_plan: Some(json!({
                "ok": true,
                "applyable": true,
                "dryRun": true,
                "writesPerformed": 0
            })),
        }
    }

    async fn current_folder_hash(conn: &mut SqliteConnection) -> String {
        let mut tx = conn.begin().await.unwrap();
        let row = read_folder_row(&mut tx, FIXTURE_FOLDER_ID)
            .await
            .unwrap()
            .unwrap();
        tx.rollback().await.unwrap();
        folder_hash(&row)
    }

    async fn table_count(conn: &mut SqliteConnection, table: &str) -> i64 {
        let sql = format!("SELECT COUNT(*) FROM {table}");
        let count: (i64,) = sqlx::query_as(&sql).fetch_one(&mut *conn).await.unwrap();
        count.0
    }

    async fn folder_color(conn: &mut SqliteConnection) -> String {
        let row = sqlx::query("SELECT color FROM folders WHERE id = ?")
            .bind(FIXTURE_FOLDER_ID)
            .fetch_one(&mut *conn)
            .await
            .unwrap();
        row.try_get::<String, _>("color").unwrap()
    }

    async fn run(
        mut payload: FolderMetadataColorApplyPayload,
        failure: Option<ApplyFailure>,
    ) -> (FolderMetadataColorApplyResult, SqliteConnection) {
        let mut conn = setup_conn().await;
        if payload.expected_baseline_hash == "__fixture_hash__" {
            payload.expected_baseline_hash = current_folder_hash(&mut conn).await;
        }
        let result = run_apply_inner(
            &mut conn,
            payload,
            "2026-05-24T00:00:00Z".to_string(),
            1_800_000_000_000,
            failure,
        )
        .await;
        (result, conn)
    }

    fn assert_redacted(result: &FolderMetadataColorApplyResult) {
        let raw = serde_json::to_string(result).expect("apply result serializes");
        for forbidden in [
            FIXTURE_FOLDER_ID,
            FIXTURE_FOLDER_NAME,
            FIXTURE_COLOR,
            TARGET_COLOR,
            FIXTURE_PEER_ID,
            FIXTURE_DEDUPE_HASH,
            "f7-folder-color-apply",
        ] {
            assert!(
                !raw.contains(forbidden),
                "apply result leaked forbidden token {forbidden}: {raw}"
            );
        }
    }

    async fn insert_f6_conflict(conn: &mut SqliteConnection, status: &str, decision: Option<&str>) {
        sqlx::query(
            r#"
            INSERT INTO sync_conflicts
              (conflict_id, dedupe_key, status, decision, classification, severity, conflict_kind, entity_kind)
            VALUES ('conflict-1', ?, ?, ?, 'needs-human-review', 'medium', 'same-record-divergent-metadata', 'folder')
            "#,
        )
        .bind(format!("{CANDIDATE_DEDUPE_PREFIX}{FIXTURE_DEDUPE_HASH}"))
        .bind(status)
        .bind(decision)
        .execute(&mut *conn)
        .await
        .unwrap();
    }

    #[test]
    fn f7_folder_metadata_color_apply_success_updates_one_row_and_audits() {
        tauri::async_runtime::block_on(async {
            let (result, mut conn) = run(valid_payload("__fixture_hash__".to_string()), None).await;
            assert!(result.ok);
            assert!(result.applied);
            assert!(result.local_only);
            assert!(!result.sync_propagated);
            assert_eq!(result.fields_updated, vec!["color".to_string()]);
            assert_eq!(result.counts.rows_updated, 1);
            assert!(result.audit.recorded);
            assert!(result.audit.operator_peer_recorded);
            assert_eq!(folder_color(&mut conn).await, TARGET_COLOR);
            assert_eq!(table_count(&mut conn, "sync_maintenance_log").await, 1);
            assert_eq!(table_count(&mut conn, "folder_bindings").await, 1);
            assert_eq!(table_count(&mut conn, "chats").await, 1);
            assert_eq!(table_count(&mut conn, "snapshots").await, 1);
            assert_redacted(&result);
        });
    }

    #[test]
    fn f7_folder_metadata_color_apply_icon_color_maps_to_color() {
        tauri::async_runtime::block_on(async {
            let mut payload = valid_payload("__fixture_hash__".to_string());
            payload.field = "iconColor".to_string();
            let (result, mut conn) = run(payload, None).await;
            assert!(result.ok);
            assert_eq!(result.fields_updated, vec!["color".to_string()]);
            assert_eq!(folder_color(&mut conn).await, TARGET_COLOR);
            assert_redacted(&result);
        });
    }

    #[test]
    fn f7_folder_metadata_color_apply_gate_dry_run_reason_identity_block() {
        tauri::async_runtime::block_on(async {
            let mut wrong_gate = valid_payload("__fixture_hash__".to_string());
            wrong_gate.dev_gate = "wrong".to_string();
            let (wrong_result, mut wrong_conn) = run(wrong_gate, None).await;
            assert_eq!(wrong_result.blockers[0].code, "invalid-dev-gate");
            assert_eq!(folder_color(&mut wrong_conn).await, FIXTURE_COLOR);
            assert_redacted(&wrong_result);

            let mut dry_run = valid_payload("__fixture_hash__".to_string());
            dry_run.dry_run = true;
            let (dry_result, _) = run(dry_run, None).await;
            assert_eq!(dry_result.blockers[0].code, "dry-run-must-be-false");
            assert_redacted(&dry_result);

            let mut no_reason = valid_payload("__fixture_hash__".to_string());
            no_reason.reason = " ".to_string();
            let (reason_result, _) = run(no_reason, None).await;
            assert_eq!(reason_result.blockers[0].code, "invalid-reason");
            assert_redacted(&reason_result);

            let mut no_identity = valid_payload("__fixture_hash__".to_string());
            no_identity.requested_by_sync_peer_id = " ".to_string();
            let (identity_result, _) = run(no_identity, None).await;
            assert_eq!(identity_result.blockers[0].code, "identity-unavailable");
            assert_redacted(&identity_result);
        });
    }

    #[test]
    fn f7_folder_metadata_color_apply_rejects_non_color_fields() {
        tauri::async_runtime::block_on(async {
            for field in [
                "name",
                "parentId",
                "sortOrder",
                "icon",
                "kind",
                "source",
                "meta",
            ] {
                let mut payload = valid_payload("__fixture_hash__".to_string());
                payload.field = field.to_string();
                let (result, mut conn) = run(payload, None).await;
                assert!(!result.ok);
                assert_eq!(result.blockers[0].code, "field-not-allowlisted");
                assert_eq!(folder_color(&mut conn).await, FIXTURE_COLOR);
                assert_redacted(&result);
            }
        });
    }

    #[test]
    fn f7_folder_metadata_color_apply_baseline_folder_and_target_hash_block() {
        tauri::async_runtime::block_on(async {
            let stale = valid_payload("deadbeef".to_string());
            let (stale_result, mut stale_conn) = run(stale, None).await;
            assert_eq!(stale_result.blockers[0].code, "baseline-hash-mismatch");
            assert_eq!(folder_color(&mut stale_conn).await, FIXTURE_COLOR);
            assert_eq!(
                table_count(&mut stale_conn, "sync_maintenance_log").await,
                0
            );
            assert_redacted(&stale_result);

            let mut missing = valid_payload("__fixture_hash__".to_string());
            missing.target_folder_id = "missing-folder".to_string();
            let (missing_result, mut missing_conn) = run(missing, None).await;
            assert_eq!(missing_result.blockers[0].code, "target-folder-not-found");
            assert_eq!(folder_color(&mut missing_conn).await, FIXTURE_COLOR);
            assert_redacted(&missing_result);

            let mut target = valid_payload("__fixture_hash__".to_string());
            target.expected_target_hash = Some("deadbeef".to_string());
            let (target_result, mut target_conn) = run(target, None).await;
            assert_eq!(target_result.blockers[0].code, "target-hash-mismatch");
            assert_eq!(folder_color(&mut target_conn).await, FIXTURE_COLOR);
            assert_redacted(&target_result);
        });
    }

    #[test]
    fn f7_folder_metadata_color_apply_f5_tombstone_blocks() {
        tauri::async_runtime::block_on(async {
            let mut conn = setup_conn().await;
            let hash = current_folder_hash(&mut conn).await;
            sqlx::query(
                "INSERT INTO sync_tombstones (tombstone_id, record_kind, record_id, delete_reason, restored_at, cascade_from) VALUES ('t1', 'folder', ?, 'manual-delete', NULL, NULL)",
            )
            .bind(folder_record_id(FIXTURE_FOLDER_ID))
            .execute(&mut conn)
            .await
            .unwrap();
            let result = run_apply_inner(
                &mut conn,
                valid_payload(hash),
                "2026-05-24T00:00:00Z".to_string(),
                1_800_000_000_000,
                None,
            )
            .await;
            assert_eq!(result.blockers[0].code, "f5-folder-tombstone-present");
            assert_eq!(folder_color(&mut conn).await, FIXTURE_COLOR);
            assert_eq!(table_count(&mut conn, "sync_maintenance_log").await, 0);
            assert_redacted(&result);
        });
    }

    #[test]
    fn f7_folder_metadata_color_apply_f6_pending_and_accepted_later_block() {
        tauri::async_runtime::block_on(async {
            let mut conn = setup_conn().await;
            let hash = current_folder_hash(&mut conn).await;
            insert_f6_conflict(&mut conn, "pending", None).await;
            let result = run_apply_inner(
                &mut conn,
                valid_payload(hash),
                "2026-05-24T00:00:00Z".to_string(),
                1_800_000_000_000,
                None,
            )
            .await;
            assert_eq!(result.blockers[0].code, "f6-conflict-pending");
            assert_eq!(folder_color(&mut conn).await, FIXTURE_COLOR);
            assert_eq!(table_count(&mut conn, "sync_maintenance_log").await, 0);
            assert_redacted(&result);

            let mut conn2 = setup_conn().await;
            let hash2 = current_folder_hash(&mut conn2).await;
            insert_f6_conflict(&mut conn2, "accepted-later", None).await;
            let result2 = run_apply_inner(
                &mut conn2,
                valid_payload(hash2),
                "2026-05-24T00:00:00Z".to_string(),
                1_800_000_000_000,
                None,
            )
            .await;
            assert_eq!(result2.blockers[0].code, "f6-conflict-accepted-later");
            assert_eq!(folder_color(&mut conn2).await, FIXTURE_COLOR);
            assert_redacted(&result2);
        });
    }

    #[test]
    fn f7_folder_metadata_color_apply_f6_resolved_safe_does_not_block() {
        tauri::async_runtime::block_on(async {
            let mut conn = setup_conn().await;
            let hash = current_folder_hash(&mut conn).await;
            insert_f6_conflict(&mut conn, "resolved", Some("resolved-no-action-needed")).await;
            let result = run_apply_inner(
                &mut conn,
                valid_payload(hash),
                "2026-05-24T00:00:00Z".to_string(),
                1_800_000_000_000,
                None,
            )
            .await;
            assert!(result.ok);
            assert_eq!(folder_color(&mut conn).await, TARGET_COLOR);
            assert_redacted(&result);
        });
    }

    #[test]
    fn f7_folder_metadata_color_apply_rolls_back_on_failure_after_audit() {
        tauri::async_runtime::block_on(async {
            let (audit_insert, mut audit_insert_conn) = run(
                valid_payload("__fixture_hash__".to_string()),
                Some(ApplyFailure::AuditInsert),
            )
            .await;
            assert_eq!(audit_insert.blockers[0].code, "audit-insert-failed");
            assert_eq!(folder_color(&mut audit_insert_conn).await, FIXTURE_COLOR);
            assert_eq!(
                table_count(&mut audit_insert_conn, "sync_maintenance_log").await,
                0
            );
            assert_redacted(&audit_insert);

            let (affected, mut affected_conn) = run(
                valid_payload("__fixture_hash__".to_string()),
                Some(ApplyFailure::AffectedRowMismatch),
            )
            .await;
            assert_eq!(affected.blockers[0].code, "affected-row-count-mismatch");
            assert_eq!(folder_color(&mut affected_conn).await, FIXTURE_COLOR);
            assert_eq!(
                table_count(&mut affected_conn, "sync_maintenance_log").await,
                0
            );
            assert_redacted(&affected);

            let (audit_update, mut audit_update_conn) = run(
                valid_payload("__fixture_hash__".to_string()),
                Some(ApplyFailure::AuditUpdate),
            )
            .await;
            assert_eq!(audit_update.blockers[0].code, "audit-update-failed");
            assert_eq!(folder_color(&mut audit_update_conn).await, FIXTURE_COLOR);
            assert_eq!(
                table_count(&mut audit_update_conn, "sync_maintenance_log").await,
                0
            );
            assert_redacted(&audit_update);
        });
    }

    #[test]
    fn f7_folder_metadata_color_apply_requires_plan_and_safe_dedupe() {
        tauri::async_runtime::block_on(async {
            let mut no_plan = valid_payload("__fixture_hash__".to_string());
            no_plan.prior_plan = None;
            let (plan_result, _) = run(no_plan, None).await;
            assert_eq!(plan_result.blockers[0].code, "apply-plan-proof-required");
            assert_redacted(&plan_result);

            let mut bad_dedupe = valid_payload("__fixture_hash__".to_string());
            bad_dedupe.dedupe_key_hash = "candidate-hash:raw".to_string();
            let (dedupe_result, _) = run(bad_dedupe, None).await;
            assert_eq!(dedupe_result.blockers[0].code, "invalid-dedupe-key-hash");
            assert_redacted(&dedupe_result);
        });
    }
}
