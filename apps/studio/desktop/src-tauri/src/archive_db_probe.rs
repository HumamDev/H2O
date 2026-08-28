//! M06 T1.4 — trusted READ-ONLY SQLite probe supplying protection facts.
//!
//! This module answers questions; it never decides anything. It supplies the
//! trusted roots that a later reclamation planner must respect, and it holds
//! no authority to classify, select, delete, rename or quarantine.
//!
//! Read-only is enforced two ways. It issues SELECT and read-only PRAGMA only —
//! no INSERT/UPDATE/DELETE/DDL, no migration, no write transaction, no
//! persistent PRAGMA change. And it borrows the application's ALREADY-OPEN
//! plugin pool rather than opening a database of its own, so it cannot create
//! a database, cannot create a directory by probing, and cannot introduce a
//! second SQLite authority. If the pool is absent the probe fails closed.
//!
//! Forward compatibility (D9): a live database may legitimately carry
//! migrations newer than this checkout. The probe therefore depends ONLY on
//! the specific tables and columns it reads, never on a migration ceiling.

use sqlx::{Row, SqliteConnection};

/// Where a generation protection came from. A planner needs to tell these
/// apart; it must never be able to weaken one by confusing it with another.
#[derive(serde::Serialize, Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "kebab-case")]
pub enum ProtectionSource {
    /// `saved_chat_archive_requests.status = 'writing'` — an interrupted write
    /// whose recorded publication intent must survive reclamation.
    StrandedWriting,
    Import,
    Restore,
    Relink,
}

pub mod codes {
    /// A required table or column is absent or incompatible.
    pub const SCHEMA_INCOMPATIBLE: &str = "db-probe-schema-incompatible";
    /// A required query failed (busy, locked, I/O, corrupt).
    pub const QUERY_FAILED: &str = "db-probe-query-failed";
    /// A `writing` row exists but no usable publication intent can be read.
    pub const WRITING_IDENTITY_UNUSABLE: &str = "db-probe-writing-identity-unusable";
    /// A row was positively identified as saved-chat provenance, but its
    /// protection identity is missing or malformed.
    pub const PROVENANCE_IDENTITY_UNUSABLE: &str = "db-probe-provenance-identity-unusable";
    /// Metadata that could have carried provenance could not be parsed.
    pub const METADATA_UNPARSEABLE: &str = "db-probe-metadata-unparseable";
    /// A recorded CAS identity is not a usable sha.
    pub const CAS_IDENTITY_UNUSABLE: &str = "db-probe-cas-identity-unusable";
    /// The application database pool is unavailable.
    pub const DB_UNAVAILABLE: &str = "db-probe-db-unavailable";
}

/// One protected generation identity: `<chat_id>` + `<content_hash>` is exactly
/// what names a generation package, so this is the minimum a planner needs.
#[derive(serde::Serialize, Clone, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub struct GenerationProtection {
    pub chat_id: String,
    /// Bare lowercase 64-hex, normalized through the existing archive helper.
    /// Never recomputed here — M06 adds no second contentHash implementation.
    pub content_hash: String,
    pub source: ProtectionSource,
}

#[derive(serde::Serialize, Clone, Debug, Default)]
pub struct DbProbeCounts {
    pub cas_roots: usize,
    pub protections: usize,
    pub writing_protections: usize,
    pub provenance_protections: usize,
}

#[derive(serde::Serialize, Clone, Debug)]
pub struct DbProbeResult {
    /// True only when every required read succeeded AND every protection-
    /// bearing row yielded a usable identity. A destructive stage depending on
    /// this probe must refuse to proceed when it is false.
    pub complete: bool,
    pub blockers: Vec<String>,
    /// Union of `assets.sha256` and `snapshot_turn_assets.sha256`, sorted and
    /// deduplicated. `assets.refcount` is NOT consulted: it is a maintained
    /// counter, not deletion authority, and the contract forbids using it as
    /// one. CAS is analysis-only in M06.
    pub cas_roots: Vec<String>,
    pub generation_protections: Vec<GenerationProtection>,
    pub counts: DbProbeCounts,
}

impl DbProbeResult {
    fn new() -> Self {
        DbProbeResult {
            complete: true,
            blockers: vec![],
            cas_roots: vec![],
            generation_protections: vec![],
            counts: DbProbeCounts::default(),
        }
    }

    /// Any failure that could hide a protective root makes the whole result
    /// non-authoritative. There is no way to record a blocker and stay
    /// complete, so "complete with an empty set after a failure" is
    /// unrepresentable rather than merely avoided.
    fn fail(&mut self, code: &str, detail: &str) {
        self.complete = false;
        let entry = if detail.is_empty() {
            code.to_string()
        } else {
            format!("{code}:{detail}")
        };
        if !self.blockers.contains(&entry) {
            self.blockers.push(entry);
        }
    }

    fn seal(mut self) -> Self {
        self.cas_roots.sort();
        self.cas_roots.dedup();
        self.generation_protections.sort();
        self.generation_protections.dedup();
        self.blockers.sort();
        self.blockers.dedup();
        self.counts.cas_roots = self.cas_roots.len();
        self.counts.protections = self.generation_protections.len();
        self.counts.writing_protections = self
            .generation_protections
            .iter()
            .filter(|p| p.source == ProtectionSource::StrandedWriting)
            .count();
        self.counts.provenance_protections =
            self.counts.protections - self.counts.writing_protections;
        self
    }

    /// Fail-closed constructor for "we never got to look".
    fn unavailable(code: &str) -> Self {
        let mut out = DbProbeResult::new();
        out.fail(code, "");
        out.seal()
    }
}

/// Required schema, expressed as (table, required columns). Deliberately NOT a
/// migration version: a database carrying newer unrelated migrations, or extra
/// columns on these tables, stays readable as long as these exist.
const REQUIRED_SCHEMA: &[(&str, &[&str])] = &[
    ("assets", &["sha256"]),
    ("snapshot_turn_assets", &["sha256"]),
    (
        "saved_chat_archive_requests",
        &["status", "studio_chat_id", "meta_json"],
    ),
    ("chats", &["id", "meta_json"]),
    ("snapshots", &["id", "chat_id", "meta_json"]),
];

async fn required_schema_ok(conn: &mut SqliteConnection, out: &mut DbProbeResult) -> bool {
    let mut ok = true;
    for (table, columns) in REQUIRED_SCHEMA {
        let rows = match sqlx::query(&format!("PRAGMA table_info({table})"))
            .fetch_all(&mut *conn)
            .await
        {
            Ok(rows) => rows,
            Err(_) => {
                out.fail(codes::QUERY_FAILED, table);
                ok = false;
                continue;
            }
        };
        if rows.is_empty() {
            out.fail(codes::SCHEMA_INCOMPATIBLE, table);
            ok = false;
            continue;
        }
        let present: Vec<String> = rows
            .iter()
            .filter_map(|row| row.try_get::<String, _>("name").ok())
            .collect();
        for column in *columns {
            if !present.iter().any(|name| name == column) {
                out.fail(
                    codes::SCHEMA_INCOMPATIBLE,
                    &format!("{table}.{column}"),
                );
                ok = false;
            }
        }
    }
    ok
}

/// Reads CAS analysis roots. Selects `sha256` ONLY — `refcount` is never in the
/// projection, so it cannot become authority by accident.
async fn collect_cas_roots(conn: &mut SqliteConnection, out: &mut DbProbeResult) {
    for table in ["assets", "snapshot_turn_assets"] {
        let rows = match sqlx::query(&format!("SELECT sha256 FROM {table}"))
            .fetch_all(&mut *conn)
            .await
        {
            Ok(rows) => rows,
            Err(_) => {
                out.fail(codes::QUERY_FAILED, table);
                continue;
            }
        };
        for row in rows {
            let raw: String = row.try_get::<String, _>("sha256").unwrap_or_default();
            match crate::archive_durable_write::normalize_expected_sha(&raw) {
                Some(hex) => out.cas_roots.push(hex),
                // A stored identity that is not a usable sha means a root may
                // be unrepresentable. Analysis-only or not, refuse to present
                // the set as authoritative.
                None => out.fail(codes::CAS_IDENTITY_UNUSABLE, table),
            }
        }
    }
}

fn object_of<'a>(value: &'a serde_json::Value, key: &str) -> Option<&'a serde_json::Map<String, serde_json::Value>> {
    value.get(key).and_then(|v| v.as_object())
}

fn text_field(map: &serde_json::Map<String, serde_json::Value>, key: &str) -> String {
    map.get(key)
        .and_then(|v| v.as_str())
        .unwrap_or_default()
        .trim()
        .to_string()
}

/// A provenance record is POSITIVELY identified by the markers its writer
/// stamps, never by "this meta_json has a contentHash in it somewhere".
fn provenance_source(
    map: &serde_json::Map<String, serde_json::Value>,
) -> Option<ProtectionSource> {
    let source = text_field(map, "source");
    let flag = |key: &str| map.get(key).and_then(|v| v.as_bool()).unwrap_or(false);
    if flag("recoveredFromPackage") || source == "h2ochat-package-recovery" {
        return Some(ProtectionSource::Import);
    }
    if flag("restoredFromPackage") || source == "h2ochat-package-restore" {
        return Some(ProtectionSource::Restore);
    }
    if flag("relinkedFromPackage") || source == "h2ochat-package-relink" {
        return Some(ProtectionSource::Relink);
    }
    None
}

/// Once positively identified, a provenance record MUST yield a usable
/// identity. Silently dropping one would remove a trusted protection, which
/// the monotonicity rule forbids — so an unusable one blocks instead.
fn admit_provenance(
    map: &serde_json::Map<String, serde_json::Value>,
    out: &mut DbProbeResult,
) {
    let Some(source) = provenance_source(map) else {
        return;
    };
    let chat_id = text_field(map, "originalChatId");
    let content_hash =
        crate::archive_durable_write::normalize_expected_sha(&text_field(map, "contentHash"));
    match (chat_id.is_empty(), content_hash) {
        (false, Some(hex)) => out.generation_protections.push(GenerationProtection {
            chat_id,
            content_hash: hex,
            source,
        }),
        _ => out.fail(codes::PROVENANCE_IDENTITY_UNUSABLE, ""),
    }
}

/// The provenance keys each writer actually uses, established from source:
/// Import writes `recovered` on both chat and snapshot; Restore writes
/// `restored` on both; Relink writes `relinked` plus a bounded `relinks`
/// history on the chat, and `relink` on the snapshot.
const PROVENANCE_KEYS: &[&str] = &["recovered", "restored", "relinked", "relink"];

async fn collect_provenance(conn: &mut SqliteConnection, out: &mut DbProbeResult) {
    for table in ["chats", "snapshots"] {
        let rows = match sqlx::query(&format!("SELECT meta_json FROM {table}"))
            .fetch_all(&mut *conn)
            .await
        {
            Ok(rows) => rows,
            Err(_) => {
                out.fail(codes::QUERY_FAILED, table);
                continue;
            }
        };
        for row in rows {
            let raw: String = row.try_get::<String, _>("meta_json").unwrap_or_default();
            let trimmed = raw.trim();
            // A legitimately empty metadata column carries no provenance.
            if trimmed.is_empty() {
                continue;
            }
            let Ok(value) = serde_json::from_str::<serde_json::Value>(trimmed) else {
                // Unparseable metadata COULD have held provenance; refusing to
                // guess is the only monotonic answer.
                out.fail(codes::METADATA_UNPARSEABLE, table);
                continue;
            };
            for key in PROVENANCE_KEYS {
                if let Some(map) = object_of(&value, key) {
                    admit_provenance(map, out);
                }
            }
            // Relink keeps a bounded history array; every entry is a durable
            // provenance record referencing a real generation.
            if let Some(list) = value.get("relinks").and_then(|v| v.as_array()) {
                for item in list {
                    if let Some(map) = item.as_object() {
                        admit_provenance(map, out);
                    }
                }
            }
        }
    }
}

/// Stranded-writing protection. Only `status = 'writing'` claims publication
/// intent: `validated` has not claimed one yet, and `written`, `failed`,
/// `rejected`, `unsupported` and `duplicate` are terminal. The protection
/// identity is the chat plus the recorded `intendedContentHash` — the hash the
/// interrupted worker meant to publish, which reconciliation depends on.
async fn collect_writing_protections(conn: &mut SqliteConnection, out: &mut DbProbeResult) {
    let rows = match sqlx::query(
        "SELECT studio_chat_id, meta_json FROM saved_chat_archive_requests WHERE status = 'writing'",
    )
    .fetch_all(&mut *conn)
    .await
    {
        Ok(rows) => rows,
        Err(_) => {
            out.fail(codes::QUERY_FAILED, "saved_chat_archive_requests");
            return;
        }
    };
    for row in rows {
        let chat_id = row
            .try_get::<Option<String>, _>("studio_chat_id")
            .ok()
            .flatten()
            .unwrap_or_default()
            .trim()
            .to_string();
        let raw: String = row.try_get::<String, _>("meta_json").unwrap_or_default();
        let intended = serde_json::from_str::<serde_json::Value>(raw.trim())
            .ok()
            .and_then(|value| {
                object_of(&value, "materialization")
                    .map(|map| text_field(map, "intendedContentHash"))
            })
            .unwrap_or_default();
        let hash = crate::archive_durable_write::normalize_expected_sha(&intended);
        match (chat_id.is_empty(), hash) {
            (false, Some(hex)) => out.generation_protections.push(GenerationProtection {
                chat_id,
                content_hash: hex,
                source: ProtectionSource::StrandedWriting,
            }),
            // Includes the historical row claimed before intent was recorded:
            // that row still protects SOMETHING we cannot name, so the probe
            // must not present a complete picture without it.
            _ => out.fail(codes::WRITING_IDENTITY_UNUSABLE, ""),
        }
    }
}

/// The testable core. Takes an already-open connection so a test can drive it
/// against a disposable database, and so this module never owns a connection
/// lifecycle of its own.
pub async fn probe_with_connection(conn: &mut SqliteConnection) -> DbProbeResult {
    let mut out = DbProbeResult::new();
    if !required_schema_ok(conn, &mut out).await {
        // Without the required schema every later read is meaningless; return
        // the blockers rather than an empty set that could read as "nothing to
        // protect".
        return out.seal();
    }
    collect_cas_roots(conn, &mut out).await;
    collect_writing_protections(conn, &mut out).await;
    collect_provenance(conn, &mut out).await;
    out.seal()
}

/// Borrows the application's already-open pool. Deliberately NOT a
/// `#[tauri::command]`: the consumer of these facts is future trusted Rust
/// reclamation machinery, and no renderer needs them, so the surface stays
/// internal.
pub async fn probe_protection_facts(app: &tauri::AppHandle) -> DbProbeResult {
    use tauri::Manager;

    let instances = match app.try_state::<tauri_plugin_sql::DbInstances>() {
        Some(instances) => instances,
        None => return DbProbeResult::unavailable(codes::DB_UNAVAILABLE),
    };
    let pools = instances.0.read().await;
    let pool = match pools.get(crate::archive_db_probe::DB_URL) {
        Some(tauri_plugin_sql::DbPool::Sqlite(pool)) => pool.clone(),
        _ => return DbProbeResult::unavailable(codes::DB_UNAVAILABLE),
    };
    drop(pools);
    let mut conn = match pool.acquire().await {
        Ok(conn) => conn,
        // Busy, exhausted or unavailable: retryable and fail-closed, never an
        // authoritative empty protection set.
        Err(_) => return DbProbeResult::unavailable(codes::DB_UNAVAILABLE),
    };
    probe_with_connection(&mut conn).await
}

/// The application database, matching the existing trusted-side constant.
pub const DB_URL: &str = "sqlite:studio-v1.db";

#[cfg(test)]
mod tests;
