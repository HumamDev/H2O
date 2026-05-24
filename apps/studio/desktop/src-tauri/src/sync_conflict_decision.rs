// F6.5 - decision-only sync conflict actions.
//
// This module records operator decision metadata on existing sync_conflicts
// rows. It never mutates folders, chats, snapshots, bindings, imports,
// exports, sync state, tombstones, or any app entity data.

use serde::{Deserialize, Serialize};
use sqlx::{Row, SqliteConnection};

pub const DECISION_SCHEMA: &str = "h2o.studio.sync-conflict-decision.v1";
const PLATFORM_DESKTOP: &str = "desktop-tauri";

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncConflictDecisionPayload {
    pub conflict_id: String,
    pub status: String,
    pub decision: String,
    pub reason: String,
    pub decided_by_sync_peer_id: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncConflictDecisionBlocker {
    pub code: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncConflictDecisionResult {
    pub schema: &'static str,
    pub ok: bool,
    pub conflict_found: bool,
    pub redacted: bool,
    pub platform: &'static str,
    pub status: Option<String>,
    pub decision: Option<String>,
    pub decided_at: Option<String>,
    pub decided_by_sync_peer_id_present: bool,
    pub blockers: Vec<SyncConflictDecisionBlocker>,
    pub warnings: Vec<String>,
}

impl SyncConflictDecisionResult {
    pub fn blocked(code: &str) -> Self {
        Self::blocked_found(code, false)
    }

    fn blocked_found(code: &str, conflict_found: bool) -> Self {
        Self {
            schema: DECISION_SCHEMA,
            ok: false,
            conflict_found,
            redacted: true,
            platform: PLATFORM_DESKTOP,
            status: None,
            decision: None,
            decided_at: None,
            decided_by_sync_peer_id_present: false,
            blockers: vec![SyncConflictDecisionBlocker {
                code: code.to_string(),
            }],
            warnings: vec![],
        }
    }

    fn success(status: &str, decision: &str, decided_at: &str) -> Self {
        Self {
            schema: DECISION_SCHEMA,
            ok: true,
            conflict_found: true,
            redacted: true,
            platform: PLATFORM_DESKTOP,
            status: Some(status.to_string()),
            decision: Some(decision.to_string()),
            decided_at: Some(decided_at.to_string()),
            decided_by_sync_peer_id_present: true,
            blockers: vec![],
            warnings: vec![],
        }
    }
}

fn valid_conflict_id(value: &str) -> bool {
    let trimmed = value.trim();
    !trimmed.is_empty() && trimmed.len() <= 256 && !trimmed.chars().any(|c| c.is_control())
}

fn valid_reason(value: &str) -> bool {
    let trimmed = value.trim();
    trimmed.len() >= 6 && trimmed.len() <= 256 && !trimmed.chars().any(|c| c.is_control())
}

fn valid_peer_id(value: &str) -> bool {
    let trimmed = value.trim();
    !trimmed.is_empty() && trimmed.len() <= 256 && !trimmed.chars().any(|c| c.is_control())
}

fn valid_status_decision(status: &str, decision: &str) -> bool {
    match (status, decision) {
        ("ignored", "ignored-by-operator") => true,
        ("rejected", "rejected-by-operator") => true,
        ("accepted-later", "accepted-for-later-review") => true,
        ("resolved", "resolved-local-wins") => true,
        ("resolved", "resolved-remote-wins") => true,
        ("resolved", "resolved-manual-merge") => true,
        ("resolved", "resolved-no-action-needed") => true,
        ("resolved", "resolved-duplicate") => true,
        ("resolved", "resolved-owned-by-f5") => true,
        ("resolved", "blocked-unsupported") => true,
        _ => false,
    }
}

fn transition_blocker(current_status: &str, target_status: &str) -> Option<&'static str> {
    match current_status {
        "pending" => match target_status {
            "ignored" | "rejected" | "accepted-later" | "resolved" => None,
            _ => Some("unsupported-transition"),
        },
        "accepted-later" => match target_status {
            "ignored" | "rejected" | "resolved" => None,
            "accepted-later" => Some("unsupported-transition"),
            _ => Some("unsupported-transition"),
        },
        "ignored" | "rejected" | "resolved" | "superseded" => Some("terminal-status"),
        _ => Some("unsupported-transition"),
    }
}

async fn table_exists(conn: &mut SqliteConnection, table: &str) -> bool {
    let rows = sqlx::query("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
        .bind(table)
        .fetch_all(&mut *conn)
        .await;
    rows.map(|r| !r.is_empty()).unwrap_or(false)
}

pub async fn run_decision(
    conn: &mut SqliteConnection,
    payload: SyncConflictDecisionPayload,
    now_iso: String,
) -> SyncConflictDecisionResult {
    run_decision_inner(conn, payload, now_iso, false).await
}

async fn run_decision_inner(
    conn: &mut SqliteConnection,
    payload: SyncConflictDecisionPayload,
    now_iso: String,
    force_affected_row_mismatch: bool,
) -> SyncConflictDecisionResult {
    let conflict_id = payload.conflict_id.trim().to_string();
    let status = payload.status.trim().to_string();
    let decision = payload.decision.trim().to_string();
    let reason = payload.reason.trim().to_string();
    let peer_id = payload.decided_by_sync_peer_id.trim().to_string();

    if !valid_conflict_id(&conflict_id) {
        return SyncConflictDecisionResult::blocked("invalid-conflict-id");
    }
    if !valid_reason(&reason) {
        return SyncConflictDecisionResult::blocked("invalid-reason");
    }
    if !valid_peer_id(&peer_id) {
        return SyncConflictDecisionResult::blocked("identity-unavailable");
    }
    if !valid_status_decision(&status, &decision) {
        return SyncConflictDecisionResult::blocked("invalid-decision");
    }
    if !table_exists(conn, "sync_conflicts").await {
        return SyncConflictDecisionResult::blocked("db-unavailable");
    }

    let current =
        match sqlx::query("SELECT status FROM sync_conflicts WHERE conflict_id = ? LIMIT 1")
            .bind(&conflict_id)
            .fetch_optional(&mut *conn)
            .await
        {
            Ok(Some(row)) => row.try_get::<String, _>("status").unwrap_or_default(),
            Ok(None) => {
                return SyncConflictDecisionResult::blocked_found("conflict-not-found", false)
            }
            Err(_) => return SyncConflictDecisionResult::blocked("db-unavailable"),
        };

    if let Some(code) = transition_blocker(&current, &status) {
        return SyncConflictDecisionResult::blocked_found(code, true);
    }

    let status_guard = if force_affected_row_mismatch {
        "__f6_forced_mismatch__"
    } else {
        current.as_str()
    };

    let updated = match sqlx::query(
        r#"
        UPDATE sync_conflicts
           SET status = ?,
               decision = ?,
               decided_at = ?,
               decided_by_sync_peer_id = ?,
               updated_at = ?
         WHERE conflict_id = ?
           AND status = ?
        "#,
    )
    .bind(&status)
    .bind(&decision)
    .bind(&now_iso)
    .bind(&peer_id)
    .bind(&now_iso)
    .bind(&conflict_id)
    .bind(status_guard)
    .execute(&mut *conn)
    .await
    {
        Ok(result) => result.rows_affected(),
        Err(_) => return SyncConflictDecisionResult::blocked_found("db-unavailable", true),
    };

    if updated != 1 {
        return SyncConflictDecisionResult::blocked_found("affected-row-count-mismatch", true);
    }

    SyncConflictDecisionResult::success(&status, &decision, &now_iso)
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::{Connection, Row, SqliteConnection};

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

    async fn insert_conflict(conn: &mut SqliteConnection, id: &str, status: &str) {
        sqlx::query(
            r#"
            INSERT INTO sync_conflicts (
              conflict_id, schema, conflict_kind, entity_kind, classification,
              status, severity, first_seen_at, last_seen_at, dedupe_key,
              raw_local_summary_json, raw_remote_summary_json, warnings_json,
              created_at, updated_at
            )
            VALUES (?, 'h2o.studio.sync-conflict.v1', 'same-record-divergent-metadata',
                    'folder', 'needs-human-review', ?, 'medium',
                    '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', ?,
                    '{}', '{}', '[]', '2026-01-01T00:00:00Z',
                    '2026-01-01T00:00:00Z')
            "#,
        )
        .bind(id)
        .bind(status)
        .bind(format!("candidate-hash:{id}"))
        .execute(conn)
        .await
        .unwrap();
    }

    fn payload(id: &str, status: &str, decision: &str) -> SyncConflictDecisionPayload {
        SyncConflictDecisionPayload {
            conflict_id: id.to_string(),
            status: status.to_string(),
            decision: decision.to_string(),
            reason: "manual decision".to_string(),
            decided_by_sync_peer_id: "peer-local-001".to_string(),
        }
    }

    async fn run(
        conn: &mut SqliteConnection,
        payload: SyncConflictDecisionPayload,
    ) -> SyncConflictDecisionResult {
        run_decision(conn, payload, "2026-01-02T00:00:00Z".to_string()).await
    }

    #[test]
    fn f6_conflict_decision_pending_to_ignored_rejected_accepted_later_and_resolved() {
        tauri::async_runtime::block_on(async {
            let mut conn = setup_conn().await;
            for (id, status, decision) in [
                ("ignored-001", "ignored", "ignored-by-operator"),
                ("rejected-001", "rejected", "rejected-by-operator"),
                ("later-001", "accepted-later", "accepted-for-later-review"),
                ("resolved-001", "resolved", "resolved-local-wins"),
            ] {
                insert_conflict(&mut conn, id, "pending").await;
                let result = run(&mut conn, payload(id, status, decision)).await;
                assert!(result.ok, "{id} should update");
                assert_eq!(result.status.as_deref(), Some(status));
                assert_eq!(result.decision.as_deref(), Some(decision));
                assert!(result.decided_by_sync_peer_id_present);
            }
        });
    }

    #[test]
    fn f6_conflict_decision_accepted_later_to_resolved_works() {
        tauri::async_runtime::block_on(async {
            let mut conn = setup_conn().await;
            insert_conflict(&mut conn, "later-resolved-001", "accepted-later").await;
            let result = run(
                &mut conn,
                payload(
                    "later-resolved-001",
                    "resolved",
                    "resolved-no-action-needed",
                ),
            )
            .await;
            assert!(result.ok);
            let row = sqlx::query(
                "SELECT status, decision, decided_at, decided_by_sync_peer_id FROM sync_conflicts WHERE conflict_id = ?",
            )
            .bind("later-resolved-001")
            .fetch_one(&mut conn)
            .await
            .unwrap();
            assert_eq!(row.try_get::<String, _>("status").unwrap(), "resolved");
            assert_eq!(
                row.try_get::<String, _>("decision").unwrap(),
                "resolved-no-action-needed"
            );
            assert_eq!(
                row.try_get::<String, _>("decided_at").unwrap(),
                "2026-01-02T00:00:00Z"
            );
            assert_eq!(
                row.try_get::<String, _>("decided_by_sync_peer_id").unwrap(),
                "peer-local-001"
            );
        });
    }

    #[test]
    fn f6_conflict_decision_terminal_status_cannot_change() {
        tauri::async_runtime::block_on(async {
            let mut conn = setup_conn().await;
            insert_conflict(&mut conn, "terminal-001", "resolved").await;
            let result = run(
                &mut conn,
                payload("terminal-001", "ignored", "ignored-by-operator"),
            )
            .await;
            assert!(!result.ok);
            assert!(result.conflict_found);
            assert_eq!(result.blockers[0].code, "terminal-status");
        });
    }

    #[test]
    fn f6_conflict_decision_invalid_reason_decision_identity_and_missing_row_block() {
        tauri::async_runtime::block_on(async {
            let mut conn = setup_conn().await;
            insert_conflict(&mut conn, "blocked-001", "pending").await;

            let mut invalid_reason = payload("blocked-001", "ignored", "ignored-by-operator");
            invalid_reason.reason = "short".to_string();
            let result = run(&mut conn, invalid_reason).await;
            assert_eq!(result.blockers[0].code, "invalid-reason");

            let result = run(
                &mut conn,
                payload("blocked-001", "resolved", "not-a-decision"),
            )
            .await;
            assert_eq!(result.blockers[0].code, "invalid-decision");

            let mut no_identity = payload("blocked-001", "ignored", "ignored-by-operator");
            no_identity.decided_by_sync_peer_id = "".to_string();
            let result = run(&mut conn, no_identity).await;
            assert_eq!(result.blockers[0].code, "identity-unavailable");

            let result = run(
                &mut conn,
                payload("missing-001", "ignored", "ignored-by-operator"),
            )
            .await;
            assert_eq!(result.blockers[0].code, "conflict-not-found");
            assert!(!result.conflict_found);
        });
    }

    #[test]
    fn f6_conflict_decision_affected_row_count_mismatch_blocks_without_update() {
        tauri::async_runtime::block_on(async {
            let mut conn = setup_conn().await;
            insert_conflict(&mut conn, "mismatch-001", "pending").await;
            let result = run_decision_inner(
                &mut conn,
                payload("mismatch-001", "ignored", "ignored-by-operator"),
                "2026-01-02T00:00:00Z".to_string(),
                true,
            )
            .await;
            assert!(!result.ok);
            assert!(result.conflict_found);
            assert_eq!(result.blockers[0].code, "affected-row-count-mismatch");
            let row = sqlx::query(
                "SELECT status, decision, decided_at, decided_by_sync_peer_id FROM sync_conflicts WHERE conflict_id = ?",
            )
            .bind("mismatch-001")
            .fetch_one(&mut conn)
            .await
            .unwrap();
            assert_eq!(row.try_get::<String, _>("status").unwrap(), "pending");
            assert!(row
                .try_get::<Option<String>, _>("decision")
                .unwrap()
                .is_none());
            assert!(row
                .try_get::<Option<String>, _>("decided_at")
                .unwrap()
                .is_none());
            assert!(row
                .try_get::<Option<String>, _>("decided_by_sync_peer_id")
                .unwrap()
                .is_none());
        });
    }
}
