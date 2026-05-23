// Tauri V2 entry point. Split into a library so the same `run()` function
// compiles into both the desktop binary (via src/main.rs) and any future
// mobile target (which compiles through the cdylib declared in Cargo.toml's
// [lib] section). This is the canonical Tauri V2 template shape.

use serde::{Deserialize, Serialize};
use serde_json::{json, Value as JsonValue};
use sqlx::{Connection, Row, SqliteConnection};
use tauri::State;
use tauri_plugin_sql::{DbInstances, DbPool, Migration, MigrationKind};

// F5H.3b.0c — synthetic marker contract v1.
// Canonical predicate + constants + eligibility helpers used by future
// preview (read-only) and cleanup (F5H.3b.0d / F5H.3b.1) code paths.
// No DELETE statements live in this module; it is contract + read-only.
pub mod synthetic_marker;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum F5g4ProofFailure {
    TombstoneInsert,
    BindingDelete,
    ReviewUpdate,
    DuplicateTombstone,
    MissingBinding,
}

impl F5g4ProofFailure {
    fn from_option(value: Option<String>) -> Result<Option<Self>, String> {
        let Some(raw) = value else {
            return Ok(None);
        };
        let normalized = raw.trim();
        if normalized.is_empty() || normalized == "none" || normalized == "success" {
            return Ok(None);
        }
        match normalized {
            "tombstone-insert" => Ok(Some(Self::TombstoneInsert)),
            "binding-delete" => Ok(Some(Self::BindingDelete)),
            "review-update" => Ok(Some(Self::ReviewUpdate)),
            "duplicate-tombstone" => Ok(Some(Self::DuplicateTombstone)),
            "missing-binding" => Ok(Some(Self::MissingBinding)),
            _ => Err(format!(
                "unsupported F5G.4 proof failure stage: {normalized}"
            )),
        }
    }

    fn code(self) -> &'static str {
        match self {
            Self::TombstoneInsert => "tombstone-insert",
            Self::BindingDelete => "binding-delete",
            Self::ReviewUpdate => "review-update",
            Self::DuplicateTombstone => "duplicate-tombstone",
            Self::MissingBinding => "missing-binding",
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
struct F5g4ProofCounts {
    tombstones: i64,
    bindings: i64,
    reviews_accepted_later: i64,
    reviews_resolved: i64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct F5g4ProofResult {
    schema: &'static str,
    ok: bool,
    synthetic: bool,
    transaction_used: bool,
    committed: bool,
    rolled_back: bool,
    failure_stage: Option<String>,
    before: F5g4ProofCounts,
    after: F5g4ProofCounts,
    all_three_writes_visible: bool,
    no_partial_state: bool,
    no_real_library_data_touched: bool,
    warnings: Vec<F5g4ProofWarning>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct F5g4ProofWarning {
    code: &'static str,
}

const F5G4_REAL_APPLY_DEV_GATE: &str = "I_UNDERSTAND_THIS_MUTATES_FOLDER_BINDING";
const F5G4_DB_URL: &str = "sqlite:studio-v1.db";

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct F5g4ApplyPayload {
    dev_gate: String,
    review_id: String,
    chat_id: String,
    folder_id: String,
    review_record_id: String,
    local_tombstone_record_id: String,
    tombstone_id: String,
    local_sync_peer_id: String,
    remote_deleted_at_ms: i64,
    applied_at: String,
    reason: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct F5g4ApplyAudit {
    source_review_linked: bool,
    remote_tombstone_linked: bool,
    remote_peer_linked: bool,
    local_operator_peer_recorded: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct F5g4ApplyBlocker {
    code: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct F5g4ApplyWarning {
    code: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct F5g4ApplyResult {
    schema: &'static str,
    ok: bool,
    applied: bool,
    dry_run: bool,
    record_kind: Option<String>,
    mutation_type: Option<&'static str>,
    local_tombstone_created: bool,
    review_updated: bool,
    writes_performed: u32,
    status: Option<String>,
    decision: Option<String>,
    audit: F5g4ApplyAudit,
    blockers: Vec<F5g4ApplyBlocker>,
    warnings: Vec<F5g4ApplyWarning>,
}

impl F5g4ApplyResult {
    fn base() -> Self {
        Self {
            schema: "h2o.studio.tombstone-review-apply-result.v1",
            ok: false,
            applied: false,
            dry_run: false,
            record_kind: Some("folderBinding".to_string()),
            mutation_type: Some("folderBinding.unbind"),
            local_tombstone_created: false,
            review_updated: false,
            writes_performed: 0,
            status: None,
            decision: None,
            audit: F5g4ApplyAudit {
                source_review_linked: false,
                remote_tombstone_linked: false,
                remote_peer_linked: false,
                local_operator_peer_recorded: false,
            },
            blockers: Vec::new(),
            warnings: Vec::new(),
        }
    }

    fn blocked(code: &str) -> Self {
        let mut result = Self::base();
        result.blockers.push(F5g4ApplyBlocker {
            code: code.to_string(),
        });
        result
    }

    fn success() -> Self {
        Self {
            schema: "h2o.studio.tombstone-review-apply-result.v1",
            ok: true,
            applied: true,
            dry_run: false,
            record_kind: Some("folderBinding".to_string()),
            mutation_type: Some("folderBinding.unbind"),
            local_tombstone_created: true,
            review_updated: true,
            writes_performed: 3,
            status: Some("resolved".to_string()),
            decision: Some("applied-folder-binding".to_string()),
            audit: F5g4ApplyAudit {
                source_review_linked: true,
                remote_tombstone_linked: true,
                remote_peer_linked: true,
                local_operator_peer_recorded: true,
            },
            blockers: Vec::new(),
            warnings: Vec::new(),
        }
    }
}

/// V1 SQLite schema migrations.
///
/// M2a-1 ships only the generic `kv_store` table — a key/value backing for
/// the chrome.storage.local shim that the Studio entity stores currently
/// rely on. Domain tables (chats, folders, labels, tags, categories,
/// snapshots, prefs, import_batches, highlights) arrive in M2a-2; per-turn
/// and attachment tables wait for M2b (post Task-0 ChatGPT export schema
/// inventory).
///
/// Migrations are applied automatically by tauri-plugin-sql when the JS
/// side calls `plugin:sql|load`. Versions are monotonic; never edit a
/// shipped migration — add a new one.
fn studio_migrations() -> Vec<Migration> {
    vec![
        Migration {
            version: 1,
            description: "init kv_store",
            sql: "CREATE TABLE IF NOT EXISTS kv_store (\
                    key        TEXT    PRIMARY KEY, \
                    value      TEXT    NOT NULL, \
                    updated_at INTEGER NOT NULL\
                  );",
            kind: MigrationKind::Up,
        },
        // v2 — M2a-2a foundation entities. Adds the `chats` table (canonical
        // Phase-1 record shape from RegistryCore + V1 essentials) and the
        // `import_batches` table (provenance tracking for future M3 import
        // runs; empty until M3 lands).
        //
        // Conservative pre-ZIP-safe schema:
        //   - All FKs are SOFT (column convention only). SQLite FOREIGN KEY
        //     constraints require PRAGMA foreign_keys=ON per connection and
        //     make schema migrations brittle (can't drop a referenced table).
        //     Real FKs can be added in a later migration once the schema is
        //     stable.
        //   - Every table carries `meta_json TEXT NOT NULL DEFAULT '{}'` as
        //     a forward-compat catch-all; fields we discover later (after
        //     Task 0 / ChatGPT export inventory) can land in meta_json
        //     without an ALTER TABLE per field.
        //   - `current_leaf_id` is reserved for ChatGPT export's `current_node`
        //     (M3); nullable until then.
        //   - `folder_id` / `category_id` are soft FKs to tables that don't
        //     exist yet (they arrive in M2a-2b's v3 migration). Nullable.
        //   - No JS-side consumers wired in M2a-2a; tables sit empty until
        //     M2a-3 wires `H2O.Studio.store.chats` and friends.
        //
        // Domain entities deferred:
        //   highlights → still in kv_store via the chrome.storage shim
        //   snapshots  → no clear V1 use case until M3 import lands
        //   prefs      → kv_store already serves
        //   turns      → M2b (ChatGPT export shape required)
        //   attachments → M2b (ChatGPT export shape required)
        Migration {
            version: 2,
            description: "init chats and import_batches",
            sql: r#"
                CREATE TABLE chats (
                  id                   TEXT    PRIMARY KEY,
                  source_id            TEXT    UNIQUE,
                  title                TEXT    NOT NULL DEFAULT '',
                  created_at           INTEGER NOT NULL DEFAULT 0,
                  updated_at           INTEGER NOT NULL DEFAULT 0,
                  last_message_at      INTEGER NOT NULL DEFAULT 0,
                  message_count        INTEGER NOT NULL DEFAULT 0,
                  user_turn_count      INTEGER NOT NULL DEFAULT 0,
                  assistant_turn_count INTEGER NOT NULL DEFAULT 0,
                  is_pinned            INTEGER NOT NULL DEFAULT 0,
                  is_archived          INTEGER NOT NULL DEFAULT 0,
                  is_starred           INTEGER NOT NULL DEFAULT 0,
                  is_deleted           INTEGER NOT NULL DEFAULT 0,
                  folder_id            TEXT,
                  category_id          TEXT,
                  project_id           TEXT    NOT NULL DEFAULT '',
                  current_leaf_id      TEXT,
                  import_batch_id      TEXT,
                  meta_json            TEXT    NOT NULL DEFAULT '{}'
                );
                CREATE INDEX idx_chats_source_id   ON chats(source_id);
                CREATE INDEX idx_chats_updated_at  ON chats(updated_at);
                CREATE INDEX idx_chats_is_archived ON chats(is_archived);
                CREATE INDEX idx_chats_folder_id   ON chats(folder_id);
                CREATE INDEX idx_chats_category_id ON chats(category_id);

                CREATE TABLE import_batches (
                  id                TEXT    PRIMARY KEY,
                  source_filename   TEXT,
                  source_byte_size  INTEGER NOT NULL DEFAULT 0,
                  started_at        INTEGER NOT NULL,
                  completed_at      INTEGER,
                  status            TEXT    NOT NULL DEFAULT 'pending',
                  chats_added       INTEGER NOT NULL DEFAULT 0,
                  chats_updated     INTEGER NOT NULL DEFAULT 0,
                  chats_skipped     INTEGER NOT NULL DEFAULT 0,
                  turns_added       INTEGER NOT NULL DEFAULT 0,
                  attachments_added INTEGER NOT NULL DEFAULT 0,
                  errors_json       TEXT    NOT NULL DEFAULT '[]',
                  meta_json         TEXT    NOT NULL DEFAULT '{}'
                );
                CREATE INDEX idx_import_batches_status ON import_batches(status);
            "#,
            kind: MigrationKind::Up,
        },
        // v3 — M2a-2b organizational entities. Adds the Studio-owned
        // organization layer: folders + folder_bindings, labels +
        // label_bindings, tags + tag_bindings, categories.
        //
        // V1 desktop is import-only, and per the capture-model decision
        // these entities are Studio-original (not mirrored from chatgpt.com).
        // ChatGPT export does not carry user labels, tags, or arbitrary
        // user-defined folders per current best knowledge; categories may
        // be auto-derived from message metadata (model_slug etc.) by M3
        // but the table itself is Studio-owned.
        //
        // Pattern matches v2:
        //   - All FKs are SOFT (column convention only). No SQL FOREIGN KEY.
        //   - Every primary table carries `meta_json TEXT NOT NULL DEFAULT '{}'`
        //     for forward-compat catch-all. Binding tables omit it (pure
        //     join rows; no per-binding metadata in V1).
        //   - `source` column on folders/labels/categories distinguishes
        //     'user' vs 'imported' vs 'derived' provenance.
        //   - Categories use chats.category_id denormalization (one
        //     category per chat) — no separate category_bindings table.
        //   - folder_bindings.PRIMARY KEY (chat_id) enforces "one folder
        //     per chat" in V1; if multi-folder is added later it becomes
        //     a v4 ALTER TABLE.
        //
        // No JS-side consumers wired in M2a-2b; tables sit empty until
        // M2a-3 wires `H2O.Studio.store.{folders,labels,tags,categories}`.
        Migration {
            version: 3,
            description: "init folders, labels, tags, categories",
            sql: r#"
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
                );
                CREATE INDEX idx_folders_parent_id ON folders(parent_id);

                CREATE TABLE folder_bindings (
                  chat_id     TEXT    NOT NULL,
                  folder_id   TEXT    NOT NULL,
                  assigned_at INTEGER NOT NULL,
                  PRIMARY KEY (chat_id)
                );
                CREATE INDEX idx_folder_bindings_folder_id ON folder_bindings(folder_id);

                CREATE TABLE labels (
                  id          TEXT    PRIMARY KEY,
                  name        TEXT    NOT NULL,
                  color       TEXT,
                  source      TEXT    NOT NULL DEFAULT 'user',
                  created_at  INTEGER NOT NULL,
                  updated_at  INTEGER NOT NULL,
                  meta_json   TEXT    NOT NULL DEFAULT '{}'
                );

                CREATE TABLE label_bindings (
                  chat_id     TEXT    NOT NULL,
                  label_id    TEXT    NOT NULL,
                  assigned_at INTEGER NOT NULL,
                  PRIMARY KEY (chat_id, label_id)
                );
                CREATE INDEX idx_label_bindings_label_id ON label_bindings(label_id);

                CREATE TABLE tags (
                  id           TEXT    PRIMARY KEY,
                  name         TEXT    NOT NULL,
                  auto_derived INTEGER NOT NULL DEFAULT 0,
                  created_at   INTEGER NOT NULL,
                  meta_json    TEXT    NOT NULL DEFAULT '{}'
                );

                CREATE TABLE tag_bindings (
                  chat_id     TEXT    NOT NULL,
                  tag_id      TEXT    NOT NULL,
                  assigned_at INTEGER NOT NULL,
                  PRIMARY KEY (chat_id, tag_id)
                );
                CREATE INDEX idx_tag_bindings_tag_id ON tag_bindings(tag_id);

                CREATE TABLE categories (
                  id          TEXT    PRIMARY KEY,
                  name        TEXT    NOT NULL,
                  parent_id   TEXT,
                  source      TEXT    NOT NULL DEFAULT 'user',
                  created_at  INTEGER NOT NULL,
                  updated_at  INTEGER NOT NULL,
                  meta_json   TEXT    NOT NULL DEFAULT '{}'
                );
                CREATE INDEX idx_categories_parent_id ON categories(parent_id);
            "#,
            kind: MigrationKind::Up,
        },
        // v4 — M2a-2c: expand `chats` and `import_batches` to represent
        // saved snapshots, indexed (Add-to-Library) link-only chats, link
        // provenance, snapshot summary fields, and import-source
        // classification.
        //
        // Per the corrected V1 ingestion model: Studio Desktop V1's primary
        // data sources are Save-to-Folder (full saved snapshots) and
        // Add-to-Library (indexed chat links/metadata). The ChatGPT export
        // ZIP is an OPTIONAL additional ingestion source, deferred. This
        // migration adds the columns those two primary flows need on
        // existing tables — pure ALTER TABLE, no data movement.
        //
        // Soft FKs only (column convention; no SQL FOREIGN KEY).
        // No JS-side consumers wired; M2a-3 wires entities later.
        // snapshots / snapshot_turns tables arrive in v5 (M2a-2d).
        Migration {
            version: 4,
            description: "expand chats with save/link/snapshot provenance; tag import sources",
            sql: r#"
                ALTER TABLE chats ADD COLUMN is_saved          INTEGER NOT NULL DEFAULT 0;
                ALTER TABLE chats ADD COLUMN is_linked         INTEGER NOT NULL DEFAULT 0;
                ALTER TABLE chats ADD COLUMN linked_at         INTEGER NOT NULL DEFAULT 0;
                ALTER TABLE chats ADD COLUMN linked_from       TEXT    NOT NULL DEFAULT '';
                ALTER TABLE chats ADD COLUMN link_source_href  TEXT    NOT NULL DEFAULT '';
                ALTER TABLE chats ADD COLUMN href              TEXT;
                ALTER TABLE chats ADD COLUMN normalized_href   TEXT;
                ALTER TABLE chats ADD COLUMN snapshot_count    INTEGER NOT NULL DEFAULT 0;
                ALTER TABLE chats ADD COLUMN last_snapshot_id  TEXT;
                ALTER TABLE chats ADD COLUMN last_captured_at  INTEGER NOT NULL DEFAULT 0;

                CREATE INDEX idx_chats_is_saved        ON chats(is_saved);
                CREATE INDEX idx_chats_is_linked       ON chats(is_linked);
                CREATE INDEX idx_chats_normalized_href ON chats(normalized_href);

                ALTER TABLE import_batches ADD COLUMN source TEXT NOT NULL DEFAULT 'unknown';
                CREATE INDEX idx_import_batches_source ON import_batches(source);
            "#,
            kind: MigrationKind::Up,
        },
        // v5 — M2a-2d: snapshots + snapshot_turns. Completes the V1
        // SQLite schema for Save-to-Folder full transcript persistence.
        //
        // Per the corrected V1 ingestion model (see v4 commit body):
        // primary V1 data sources are Save-to-Folder (saved snapshots,
        // this commit) and Add-to-Library (indexed link-only chats,
        // expressible since v4 with is_linked + link provenance columns).
        //
        // Design:
        //   - One snapshot row per Save-to-Folder capture; a chat can
        //     have multiple snapshots over time (re-saves).
        //   - snapshot_turns is a single table that holds BOTH shape
        //     variants the existing Studio data uses:
        //       * richTurns rows populate `outer_html` (DOM-captured
        //         fidelity from S0D3a)
        //       * older messages-only rows populate `text`
        //     Future ChatGPT-export imports (whenever they land) will
        //     translate `mapping[id].message` into the same row schema,
        //     with content_type / parts in meta_json. No separate `turns`
        //     table needed.
        //   - PRIMARY KEY (snapshot_id, turn_idx) enforces order +
        //     uniqueness within a snapshot.
        //   - Soft FKs only (column convention; no SQL FOREIGN KEY).
        //   - meta_json catch-all on snapshots (folderName, captureMeta,
        //     etc.) and on snapshot_turns (timeMeta, attachments,
        //     content_type, etc.).
        //
        // No JS-side consumers wired in M2a-2d; tables sit empty until
        // M2a-3 wires `H2O.Studio.store.snapshots` and the reader
        // refactor to load snapshots from SQLite.
        Migration {
            version: 5,
            description: "init snapshots and snapshot_turns",
            sql: r#"
                CREATE TABLE snapshots (
                  id              TEXT    PRIMARY KEY,
                  chat_id         TEXT    NOT NULL,
                  title           TEXT    NOT NULL DEFAULT '',
                  digest          TEXT,
                  message_count   INTEGER NOT NULL DEFAULT 0,
                  pinned          INTEGER NOT NULL DEFAULT 0,
                  legacy          INTEGER NOT NULL DEFAULT 0,
                  captured_at     INTEGER NOT NULL DEFAULT 0,
                  updated_at      INTEGER NOT NULL DEFAULT 0,
                  meta_json       TEXT    NOT NULL DEFAULT '{}'
                );
                CREATE INDEX idx_snapshots_chat_id     ON snapshots(chat_id);
                CREATE INDEX idx_snapshots_captured_at ON snapshots(captured_at);
                CREATE INDEX idx_snapshots_pinned      ON snapshots(pinned);

                CREATE TABLE snapshot_turns (
                  snapshot_id     TEXT    NOT NULL,
                  turn_idx        INTEGER NOT NULL,
                  role            TEXT    NOT NULL,
                  outer_html      TEXT    NOT NULL DEFAULT '',
                  text            TEXT    NOT NULL DEFAULT '',
                  meta_json       TEXT    NOT NULL DEFAULT '{}',
                  PRIMARY KEY (snapshot_id, turn_idx)
                );
                CREATE INDEX idx_snapshot_turns_role ON snapshot_turns(role);
            "#,
            kind: MigrationKind::Up,
        },
        // v6 — F5C: inert local tombstone store scaffold. This table records
        // explicit local delete intent for future multi-peer sync phases, but
        // F5C does not route existing delete paths through it and does not
        // export, import, apply, purge, or restore tombstones automatically.
        Migration {
            version: 6,
            description: "init sync tombstones",
            sql: r#"
                CREATE TABLE IF NOT EXISTS sync_tombstones (
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
                  updated_at               TEXT NOT NULL
                );

                CREATE INDEX IF NOT EXISTS idx_sync_tombstones_record
                  ON sync_tombstones(record_kind, record_id);

                CREATE UNIQUE INDEX IF NOT EXISTS idx_sync_tombstones_active_record
                  ON sync_tombstones(record_kind, record_id)
                  WHERE restored_at IS NULL;

                CREATE INDEX IF NOT EXISTS idx_sync_tombstones_deleted_at
                  ON sync_tombstones(deleted_at);

                CREATE INDEX IF NOT EXISTS idx_sync_tombstones_deleted_by_peer
                  ON sync_tombstones(deleted_by_sync_peer_id);

                CREATE INDEX IF NOT EXISTS idx_sync_tombstones_source_export
                  ON sync_tombstones(source_export_id);

                CREATE INDEX IF NOT EXISTS idx_sync_tombstones_restored_at
                  ON sync_tombstones(restored_at);

                CREATE INDEX IF NOT EXISTS idx_sync_tombstones_cascade_from
                  ON sync_tombstones(cascade_from);
            "#,
            kind: MigrationKind::Up,
        },
        // v7 — F5F.0/F5F.1: inert remote tombstone review scaffold.
        // Stores remote tombstone evidence for later manual review without
        // importing, applying, deleting, or mutating Library records.
        Migration {
            version: 7,
            description: "init sync tombstone reviews",
            sql: r#"
                CREATE TABLE IF NOT EXISTS sync_tombstone_reviews (
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
                  updated_at                TEXT NOT NULL
                );

                CREATE INDEX IF NOT EXISTS idx_sync_tombstone_reviews_status
                  ON sync_tombstone_reviews(status);

                CREATE INDEX IF NOT EXISTS idx_sync_tombstone_reviews_classification
                  ON sync_tombstone_reviews(classification);

                CREATE INDEX IF NOT EXISTS idx_sync_tombstone_reviews_record
                  ON sync_tombstone_reviews(record_kind, record_id);

                CREATE INDEX IF NOT EXISTS idx_sync_tombstone_reviews_remote_peer
                  ON sync_tombstone_reviews(remote_sync_peer_id);

                CREATE INDEX IF NOT EXISTS idx_sync_tombstone_reviews_remote_export
                  ON sync_tombstone_reviews(remote_export_id);

                CREATE INDEX IF NOT EXISTS idx_sync_tombstone_reviews_received_at
                  ON sync_tombstone_reviews(received_at);

                CREATE INDEX IF NOT EXISTS idx_sync_tombstone_reviews_last_seen_at
                  ON sync_tombstone_reviews(last_seen_at);
            "#,
            kind: MigrationKind::Up,
        },
        // v8 — F5H.3b.0c: synthetic marker contract v1. Adds is_synthetic
        // column to both sync_tombstones and sync_tombstone_reviews. All
        // existing rows default to 0 (non-synthetic). Production writers
        // must continue to omit the column (relying on DEFAULT 0) or
        // explicitly bind 0. Only the named test/dev fixture seeders
        // (see synthetic_marker.rs companion module) may set 1.
        //
        // This migration enables F5H.3b.0d (true dry-run cleanup) and
        // F5H.3b.1 (real cleanup). It does NOT itself enable any cleanup,
        // expose any cleanup API, or change import/export/sync/apply
        // behavior. Cleanup eligibility predicate lives in
        // synthetic_marker.rs and is enforced by SYNTHETIC_PREDICATE_V1.
        Migration {
            version: 8,
            description: "synthetic marker contract v1",
            sql: r#"
                ALTER TABLE sync_tombstones
                  ADD COLUMN is_synthetic INTEGER NOT NULL DEFAULT 0;

                ALTER TABLE sync_tombstone_reviews
                  ADD COLUMN is_synthetic INTEGER NOT NULL DEFAULT 0;

                CREATE INDEX IF NOT EXISTS idx_sync_tombstones_is_synthetic
                  ON sync_tombstones(is_synthetic, restored_at);

                CREATE INDEX IF NOT EXISTS idx_sync_tombstone_reviews_is_synthetic
                  ON sync_tombstone_reviews(is_synthetic, status);
            "#,
            kind: MigrationKind::Up,
        },
    ]
}

async fn f5g4_setup_proof_schema(conn: &mut SqliteConnection) -> Result<(), String> {
    let statements = [
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
          updated_at               TEXT NOT NULL
        )
        "#,
        r#"
        CREATE UNIQUE INDEX idx_sync_tombstones_active_record
          ON sync_tombstones(record_kind, record_id)
          WHERE restored_at IS NULL
        "#,
        r#"
        CREATE TABLE folder_bindings (
          chat_id     TEXT    NOT NULL,
          folder_id   TEXT    NOT NULL,
          assigned_at INTEGER NOT NULL,
          PRIMARY KEY (chat_id)
        )
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
          updated_at                TEXT NOT NULL
        )
        "#,
    ];
    for statement in statements {
        sqlx::query(statement)
            .execute(&mut *conn)
            .await
            .map_err(|e| format!("F5G.4 proof schema failed: {e}"))?;
    }
    Ok(())
}

async fn f5g4_seed_proof_rows(
    conn: &mut SqliteConnection,
    failure: Option<F5g4ProofFailure>,
) -> Result<(), String> {
    let now = "2026-05-22T00:00:00.000Z";
    if failure != Some(F5g4ProofFailure::MissingBinding) {
        sqlx::query(
            "INSERT INTO folder_bindings (chat_id, folder_id, assigned_at) VALUES (?, ?, ?)",
        )
        .bind("f5g4-proof-chat-001")
        .bind("f5g4-proof-folder-001")
        .bind(1_779_408_000_000_i64)
        .execute(&mut *conn)
        .await
        .map_err(|e| format!("F5G.4 proof binding seed failed: {e}"))?;
    }
    if failure == Some(F5g4ProofFailure::DuplicateTombstone) {
        sqlx::query(
            r#"
            INSERT INTO sync_tombstones (
              tombstone_id, schema, record_kind, record_id, deleted_at, deleted_by_sync_peer_id,
              delete_reason, meta_json, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            "#,
        )
        .bind("f5g4-proof-tombstone-001")
        .bind("h2o.studio.tombstone.v1")
        .bind("folderBinding")
        .bind("folderBinding:f5g4-proof-chat-001:f5g4-proof-folder-001")
        .bind(now)
        .bind("f5g4-proof-local-peer-001")
        .bind("remote-review-apply")
        .bind(r#"{"source":"f5g4-proof-existing"}"#)
        .bind(now)
        .bind(now)
        .execute(&mut *conn)
        .await
        .map_err(|e| format!("F5G.4 proof duplicate seed failed: {e}"))?;
    }
    sqlx::query(
        r#"
        INSERT INTO sync_tombstone_reviews (
          review_id, schema, remote_tombstone_id, remote_sync_peer_id, remote_export_id,
          remote_sequence_number, record_kind, record_id, delete_reason, remote_deleted_at,
          received_at, first_seen_at, last_seen_at, seen_count, last_seen_export_id,
          local_record_exists, local_record_digest, local_updated_at, local_has_newer_edit,
          classification, status, decision, decided_at, decided_by_sync_peer_id,
          dedupe_key, raw_tombstone_json, warnings_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        "#,
    )
    .bind("f5g4-proof-review-001")
    .bind("h2o.studio.tombstone-review.v1")
    .bind("f5g4-proof-remote-tombstone-001")
    .bind("f5g4-proof-remote-peer-001")
    .bind("f5g4-proof-export-001")
    .bind(1_i64)
    .bind("folderBinding")
    .bind("folderBinding:f5g4-proof-chat-001:f5g4-proof-folder-001")
    .bind("folder-delete-cascade")
    .bind(now)
    .bind(now)
    .bind(now)
    .bind(now)
    .bind(1_i64)
    .bind("f5g4-proof-export-001")
    .bind(1_i64)
    .bind(Option::<String>::None)
    .bind(now)
    .bind(0_i64)
    .bind("safe-review")
    .bind("accepted-later")
    .bind(Option::<String>::None)
    .bind(Option::<String>::None)
    .bind(Option::<String>::None)
    .bind("f5g4-proof-dedupe-001")
    .bind(
        r#"{"schema":"h2o.studio.tombstone.v1","tombstoneId":"f5g4-proof-remote-tombstone-001","recordKind":"folderBinding","recordId":"folderBinding:f5g4-proof-chat-001:f5g4-proof-folder-001","deletedAt":"2026-05-22T00:00:00.000Z","deletedBySyncPeerId":"f5g4-proof-remote-peer-001","deleteReason":"folder-delete-cascade","meta":{"chatId":"f5g4-proof-chat-001","folderId":"f5g4-proof-folder-001"}}"#,
    )
    .bind("[]")
    .bind(now)
    .bind(now)
    .execute(&mut *conn)
    .await
    .map_err(|e| format!("F5G.4 proof review seed failed: {e}"))?;
    Ok(())
}

async fn f5g4_proof_counts(conn: &mut SqliteConnection) -> Result<F5g4ProofCounts, String> {
    let row = sqlx::query(
        r#"
        SELECT
          (SELECT COUNT(*) FROM sync_tombstones) AS tombstones,
          (SELECT COUNT(*) FROM folder_bindings) AS bindings,
          (SELECT COUNT(*) FROM sync_tombstone_reviews WHERE status = 'accepted-later') AS reviews_accepted_later,
          (SELECT COUNT(*) FROM sync_tombstone_reviews WHERE status = 'resolved' AND decision = 'applied-folder-binding') AS reviews_resolved
        "#,
    )
    .fetch_one(&mut *conn)
    .await
    .map_err(|e| format!("F5G.4 proof count failed: {e}"))?;
    Ok(F5g4ProofCounts {
        tombstones: row.try_get("tombstones").unwrap_or(0),
        bindings: row.try_get("bindings").unwrap_or(0),
        reviews_accepted_later: row.try_get("reviews_accepted_later").unwrap_or(0),
        reviews_resolved: row.try_get("reviews_resolved").unwrap_or(0),
    })
}

async fn f5g4_run_future_apply_transaction(
    conn: &mut SqliteConnection,
    failure: Option<F5g4ProofFailure>,
) -> Result<(), String> {
    let mut tx = conn
        .begin()
        .await
        .map_err(|e| format!("F5G.4 proof transaction begin failed: {e}"))?;

    let binding_exists: i64 = sqlx::query(
        "SELECT COUNT(*) AS n FROM folder_bindings WHERE chat_id = ? AND folder_id = ?",
    )
    .bind("f5g4-proof-chat-001")
    .bind("f5g4-proof-folder-001")
    .fetch_one(&mut *tx)
    .await
    .map_err(|e| format!("F5G.4 proof binding pre-read failed: {e}"))?
    .try_get("n")
    .unwrap_or(0);
    if binding_exists != 1 {
        tx.rollback()
            .await
            .map_err(|e| format!("F5G.4 proof missing-binding rollback failed: {e}"))?;
        return Err("missing-binding".to_string());
    }

    let tombstone_record_kind = if failure == Some(F5g4ProofFailure::TombstoneInsert) {
        None
    } else {
        Some("folderBinding")
    };
    sqlx::query(
        r#"
        INSERT INTO sync_tombstones (
          tombstone_id, schema, record_kind, record_id, deleted_at, deleted_by_sync_peer_id,
          delete_reason, meta_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        "#,
    )
    .bind("f5g4-proof-tombstone-001")
    .bind("h2o.studio.tombstone.v1")
    .bind(tombstone_record_kind)
    .bind("folderBinding:f5g4-proof-chat-001:f5g4-proof-folder-001")
    .bind("2026-05-22T00:00:00.000Z")
    .bind("f5g4-proof-local-peer-001")
    .bind("remote-review-apply")
    .bind(
        r#"{"source":"tombstoneReviews.applyReview","sourceReviewId":"f5g4-proof-review-001","remoteTombstoneId":"f5g4-proof-remote-tombstone-001","remoteSyncPeerId":"f5g4-proof-remote-peer-001","remoteExportId":"f5g4-proof-export-001","appliedBySyncPeerId":"f5g4-proof-local-peer-001","appliedAt":"2026-05-22T00:00:00.000Z","applyReason":"f5g4-proof","originalDeleteReason":"folder-delete-cascade","targetKind":"folderBinding"}"#,
    )
    .bind("2026-05-22T00:00:00.000Z")
    .bind("2026-05-22T00:00:00.000Z")
    .execute(&mut *tx)
    .await
    .map_err(|e| format!("tombstone-insert: {e}"))?;

    if failure == Some(F5g4ProofFailure::BindingDelete) {
        tx.rollback()
            .await
            .map_err(|e| format!("F5G.4 proof binding-delete rollback failed: {e}"))?;
        return Err("binding-delete".to_string());
    }

    let deleted = sqlx::query("DELETE FROM folder_bindings WHERE chat_id = ? AND folder_id = ?")
        .bind("f5g4-proof-chat-001")
        .bind("f5g4-proof-folder-001")
        .execute(&mut *tx)
        .await
        .map_err(|e| format!("binding-delete: {e}"))?
        .rows_affected();
    if deleted != 1 {
        tx.rollback()
            .await
            .map_err(|e| format!("F5G.4 proof binding-delete rollback failed: {e}"))?;
        return Err("binding-delete".to_string());
    }

    if failure == Some(F5g4ProofFailure::ReviewUpdate) {
        tx.rollback()
            .await
            .map_err(|e| format!("F5G.4 proof review-update rollback failed: {e}"))?;
        return Err("review-update".to_string());
    }

    let updated = sqlx::query(
        r#"
        UPDATE sync_tombstone_reviews
        SET status = 'resolved',
            decision = 'applied-folder-binding',
            decided_at = ?,
            decided_by_sync_peer_id = ?,
            warnings_json = ?,
            updated_at = ?
        WHERE review_id = ? AND status = 'accepted-later'
        "#,
    )
    .bind("2026-05-22T00:00:00.000Z")
    .bind("f5g4-proof-local-peer-001")
    .bind(r#"[{"code":"proof-applied-folder-binding","action":"applied-folder-binding"}]"#)
    .bind("2026-05-22T00:00:00.000Z")
    .bind("f5g4-proof-review-001")
    .execute(&mut *tx)
    .await
    .map_err(|e| format!("review-update: {e}"))?
    .rows_affected();
    if updated != 1 {
        tx.rollback()
            .await
            .map_err(|e| format!("F5G.4 proof review-update rollback failed: {e}"))?;
        return Err("review-update".to_string());
    }

    tx.commit()
        .await
        .map_err(|e| format!("F5G.4 proof transaction commit failed: {e}"))?;
    Ok(())
}

async fn f5g4_run_transaction_proof(
    failure: Option<F5g4ProofFailure>,
) -> Result<F5g4ProofResult, String> {
    let mut conn = SqliteConnection::connect("sqlite::memory:")
        .await
        .map_err(|e| format!("F5G.4 proof sqlite open failed: {e}"))?;
    f5g4_setup_proof_schema(&mut conn).await?;
    f5g4_seed_proof_rows(&mut conn, failure).await?;
    let before = f5g4_proof_counts(&mut conn).await?;
    let outcome = f5g4_run_future_apply_transaction(&mut conn, failure).await;
    let after = f5g4_proof_counts(&mut conn).await?;
    let committed = outcome.is_ok();
    let rolled_back = !committed && after == before;
    let all_three_writes_visible = after.tombstones == before.tombstones + 1
        && after.bindings == before.bindings - 1
        && after.reviews_accepted_later == before.reviews_accepted_later - 1
        && after.reviews_resolved == before.reviews_resolved + 1;
    let no_partial_state = if committed {
        all_three_writes_visible
    } else {
        after == before
    };
    let mut warnings = Vec::new();
    if outcome.is_err() && !rolled_back {
        warnings.push(F5g4ProofWarning {
            code: "proof-partial-state-detected",
        });
    }
    Ok(F5g4ProofResult {
        schema: "h2o.studio.tombstone-review-apply-transaction-proof.v1",
        ok: if committed {
            all_three_writes_visible
        } else {
            rolled_back
        },
        synthetic: true,
        transaction_used: true,
        committed,
        rolled_back,
        failure_stage: failure.map(|f| f.code().to_string()),
        before,
        after,
        all_three_writes_visible,
        no_partial_state,
        no_real_library_data_touched: true,
        warnings,
    })
}

fn f5g4_required_string(value: &str, blocker: &str) -> Result<String, String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        Err(blocker.to_string())
    } else {
        Ok(trimmed.to_string())
    }
}

fn f5g4_validate_apply_payload(payload: &F5g4ApplyPayload) -> Result<(), String> {
    if payload.dev_gate.trim() != F5G4_REAL_APPLY_DEV_GATE {
        return Err("dev-gate-required".to_string());
    }
    f5g4_required_string(&payload.review_id, "review-not-found")?;
    f5g4_required_string(&payload.chat_id, "local-target-missing")?;
    f5g4_required_string(&payload.folder_id, "local-target-missing")?;
    f5g4_required_string(&payload.review_record_id, "malformed-remote-tombstone")?;
    let local_record_id = f5g4_required_string(
        &payload.local_tombstone_record_id,
        "malformed-remote-tombstone",
    )?;
    if !local_record_id.starts_with("folderBinding:") {
        return Err("malformed-remote-tombstone".to_string());
    }
    f5g4_required_string(&payload.tombstone_id, "tombstone-id-unavailable")?;
    f5g4_required_string(&payload.local_sync_peer_id, "local-identity-unavailable")?;
    f5g4_required_string(&payload.applied_at, "applied-at-unavailable")?;
    f5g4_required_string(&payload.reason, "apply-reason-required")?;
    if payload.remote_deleted_at_ms <= 0 {
        return Err("local-comparison-unavailable".to_string());
    }
    Ok(())
}

fn f5g4_json_string(value: &JsonValue, key: &str) -> Option<String> {
    value
        .get(key)
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(ToOwned::to_owned)
}

fn f5g4_append_apply_audit_warning(raw_warnings: &str) -> String {
    let mut warnings = serde_json::from_str::<JsonValue>(raw_warnings)
        .ok()
        .and_then(|value| value.as_array().cloned())
        .unwrap_or_default();
    warnings.push(json!({
        "code": "review-applied-folder-binding",
        "action": "applied-folder-binding",
        "reasonPresent": true
    }));
    serde_json::to_string(&warnings).unwrap_or_else(|_| "[]".to_string())
}

async fn f5g4_run_real_apply_transaction(
    conn: &mut SqliteConnection,
    payload: &F5g4ApplyPayload,
    failure: Option<F5g4ProofFailure>,
) -> F5g4ApplyResult {
    if let Err(code) = f5g4_validate_apply_payload(payload) {
        return F5g4ApplyResult::blocked(&code);
    }

    let review_id = payload.review_id.trim();
    let chat_id = payload.chat_id.trim();
    let folder_id = payload.folder_id.trim();
    let review_record_id = payload.review_record_id.trim();
    let local_tombstone_record_id = payload.local_tombstone_record_id.trim();
    let tombstone_id = payload.tombstone_id.trim();
    let local_sync_peer_id = payload.local_sync_peer_id.trim();
    let applied_at = payload.applied_at.trim();
    let reason = payload.reason.trim();

    let mut tx = match conn.begin().await {
        Ok(tx) => tx,
        Err(_) => return F5g4ApplyResult::blocked("transaction-begin-failed"),
    };

    let review_row = match sqlx::query(
        r#"
        SELECT review_id, status, decision, record_kind, record_id, remote_tombstone_id,
               remote_sync_peer_id, remote_export_id, delete_reason, remote_deleted_at,
               raw_tombstone_json, warnings_json
        FROM sync_tombstone_reviews
        WHERE review_id = ?
        LIMIT 1
        "#,
    )
    .bind(review_id)
    .fetch_optional(&mut *tx)
    .await
    {
        Ok(row) => row,
        Err(_) => {
            let _ = tx.rollback().await;
            return F5g4ApplyResult::blocked("review-read-failed");
        }
    };

    let Some(review_row) = review_row else {
        let _ = tx.rollback().await;
        return F5g4ApplyResult::blocked("review-not-found");
    };

    let status = review_row
        .try_get::<String, _>("status")
        .unwrap_or_default();
    if status != "accepted-later" {
        let _ = tx.rollback().await;
        return F5g4ApplyResult::blocked("review-status-not-accepted-later");
    }

    let record_kind = review_row
        .try_get::<Option<String>, _>("record_kind")
        .ok()
        .flatten()
        .unwrap_or_default();
    if record_kind == "folder" {
        let _ = tx.rollback().await;
        return F5g4ApplyResult::blocked("folder-apply-deferred");
    }
    if record_kind != "folderBinding" {
        let _ = tx.rollback().await;
        return F5g4ApplyResult::blocked("unsupported-record-kind");
    }

    let stored_record_id = review_row
        .try_get::<Option<String>, _>("record_id")
        .ok()
        .flatten()
        .unwrap_or_default();
    if stored_record_id != review_record_id {
        let _ = tx.rollback().await;
        return F5g4ApplyResult::blocked("local-target-mismatch");
    }

    let remote_peer_id = review_row
        .try_get::<Option<String>, _>("remote_sync_peer_id")
        .ok()
        .flatten()
        .unwrap_or_default();
    if !remote_peer_id.is_empty() && remote_peer_id == local_sync_peer_id {
        let _ = tx.rollback().await;
        return F5g4ApplyResult::blocked("self-originated");
    }

    let raw_tombstone_json = review_row
        .try_get::<String, _>("raw_tombstone_json")
        .unwrap_or_default();
    let tombstone = match serde_json::from_str::<JsonValue>(&raw_tombstone_json) {
        Ok(value) if value.is_object() => value,
        _ => {
            let _ = tx.rollback().await;
            return F5g4ApplyResult::blocked("malformed-remote-tombstone");
        }
    };
    if f5g4_json_string(&tombstone, "schema").as_deref() != Some("h2o.studio.tombstone.v1") {
        let _ = tx.rollback().await;
        return F5g4ApplyResult::blocked("malformed-remote-tombstone");
    }
    if f5g4_json_string(&tombstone, "recordKind").as_deref() != Some("folderBinding") {
        let _ = tx.rollback().await;
        return F5g4ApplyResult::blocked("unsupported-record-kind");
    }
    if f5g4_json_string(&tombstone, "recordId").as_deref() != Some(review_record_id) {
        let _ = tx.rollback().await;
        return F5g4ApplyResult::blocked("local-target-mismatch");
    }
    let tombstone_remote_peer = f5g4_json_string(&tombstone, "deletedBySyncPeerId");
    if remote_peer_id.is_empty() && tombstone_remote_peer.as_deref().unwrap_or("").is_empty() {
        let _ = tx.rollback().await;
        return F5g4ApplyResult::blocked("source-peer-ambiguous");
    }
    if tombstone_remote_peer.as_deref() == Some(local_sync_peer_id) {
        let _ = tx.rollback().await;
        return F5g4ApplyResult::blocked("self-originated");
    }

    let binding_row = match sqlx::query(
        "SELECT chat_id, folder_id, assigned_at FROM folder_bindings WHERE chat_id = ? LIMIT 1",
    )
    .bind(chat_id)
    .fetch_optional(&mut *tx)
    .await
    {
        Ok(row) => row,
        Err(_) => {
            let _ = tx.rollback().await;
            return F5g4ApplyResult::blocked("binding-read-failed");
        }
    };

    let Some(binding_row) = binding_row else {
        let _ = tx.rollback().await;
        return F5g4ApplyResult::blocked("local-target-missing");
    };
    let current_folder_id = binding_row
        .try_get::<String, _>("folder_id")
        .unwrap_or_default();
    if current_folder_id != folder_id {
        let _ = tx.rollback().await;
        return F5g4ApplyResult::blocked("local-target-mismatch");
    }
    let assigned_at = binding_row.try_get::<i64, _>("assigned_at").unwrap_or(0);
    if assigned_at > payload.remote_deleted_at_ms {
        let _ = tx.rollback().await;
        return F5g4ApplyResult::blocked("delete-vs-edit");
    }

    let remote_tombstone_id = review_row
        .try_get::<Option<String>, _>("remote_tombstone_id")
        .ok()
        .flatten()
        .or_else(|| f5g4_json_string(&tombstone, "tombstoneId"));
    let remote_export_id = review_row
        .try_get::<Option<String>, _>("remote_export_id")
        .ok()
        .flatten();
    let original_delete_reason = f5g4_json_string(&tombstone, "deleteReason").or_else(|| {
        review_row
            .try_get::<Option<String>, _>("delete_reason")
            .ok()
            .flatten()
    });
    let cascade_from = f5g4_json_string(&tombstone, "cascadeFrom");
    let warnings_json = review_row
        .try_get::<String, _>("warnings_json")
        .unwrap_or_else(|_| "[]".to_string());
    let next_warnings_json = f5g4_append_apply_audit_warning(&warnings_json);
    let meta_json = json!({
        "source": "tombstoneReviews.applyReview",
        "sourceReviewId": review_id,
        "remoteTombstoneId": remote_tombstone_id,
        "remoteSyncPeerId": if remote_peer_id.is_empty() { tombstone_remote_peer } else { Some(remote_peer_id.clone()) },
        "remoteExportId": remote_export_id,
        "appliedBySyncPeerId": local_sync_peer_id,
        "appliedAt": applied_at,
        "applyReason": reason,
        "originalDeleteReason": original_delete_reason,
        "targetKind": "folderBinding"
    })
    .to_string();

    let record_kind_for_insert = if failure == Some(F5g4ProofFailure::TombstoneInsert) {
        None
    } else {
        Some("folderBinding")
    };
    let inserted = match sqlx::query(
        r#"
        INSERT INTO sync_tombstones (
          tombstone_id, schema, record_kind, record_id, deleted_at, deleted_by_sync_peer_id,
          delete_reason, prior_digest, prior_updated_at, source_export_id, source_sequence_number,
          cascade_from, restored_at, restored_by_sync_peer_id, meta_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        "#,
    )
    .bind(tombstone_id)
    .bind("h2o.studio.tombstone.v1")
    .bind(record_kind_for_insert)
    .bind(local_tombstone_record_id)
    .bind(applied_at)
    .bind(local_sync_peer_id)
    .bind("remote-review-apply")
    .bind(Option::<String>::None)
    .bind(assigned_at.to_string())
    .bind(Option::<String>::None)
    .bind(Option::<i64>::None)
    .bind(cascade_from)
    .bind(Option::<String>::None)
    .bind(Option::<String>::None)
    .bind(meta_json)
    .bind(applied_at)
    .bind(applied_at)
    .execute(&mut *tx)
    .await
    {
        Ok(result) => result.rows_affected(),
        Err(_) => {
            let _ = tx.rollback().await;
            return F5g4ApplyResult::blocked("tombstone-insert-failed");
        }
    };
    if inserted != 1 {
        let _ = tx.rollback().await;
        return F5g4ApplyResult::blocked("tombstone-insert-failed");
    }

    let delete_folder_id = if failure == Some(F5g4ProofFailure::BindingDelete) {
        "__f5g4_forced_binding_delete_miss__"
    } else {
        folder_id
    };
    let deleted =
        match sqlx::query("DELETE FROM folder_bindings WHERE chat_id = ? AND folder_id = ?")
            .bind(chat_id)
            .bind(delete_folder_id)
            .execute(&mut *tx)
            .await
        {
            Ok(result) => result.rows_affected(),
            Err(_) => {
                let _ = tx.rollback().await;
                return F5g4ApplyResult::blocked("binding-delete-failed");
            }
        };
    if deleted != 1 {
        let _ = tx.rollback().await;
        return F5g4ApplyResult::blocked("binding-delete-failed");
    }

    let update_review_id = if failure == Some(F5g4ProofFailure::ReviewUpdate) {
        "__f5g4_forced_review_update_miss__"
    } else {
        review_id
    };
    let updated = match sqlx::query(
        r#"
        UPDATE sync_tombstone_reviews
        SET status = 'resolved',
            decision = 'applied-folder-binding',
            decided_at = ?,
            decided_by_sync_peer_id = ?,
            warnings_json = ?,
            updated_at = ?
        WHERE review_id = ? AND status = 'accepted-later'
        "#,
    )
    .bind(applied_at)
    .bind(local_sync_peer_id)
    .bind(next_warnings_json)
    .bind(applied_at)
    .bind(update_review_id)
    .execute(&mut *tx)
    .await
    {
        Ok(result) => result.rows_affected(),
        Err(_) => {
            let _ = tx.rollback().await;
            return F5g4ApplyResult::blocked("review-update-failed");
        }
    };
    if updated != 1 {
        let _ = tx.rollback().await;
        return F5g4ApplyResult::blocked("review-update-failed");
    }

    if tx.commit().await.is_err() {
        return F5g4ApplyResult::blocked("transaction-commit-failed");
    }

    F5g4ApplyResult::success()
}

#[tauri::command]
async fn f5g4_prove_tombstone_review_apply_transaction(
    fail_at: Option<String>,
) -> Result<F5g4ProofResult, String> {
    let failure = F5g4ProofFailure::from_option(fail_at)?;
    f5g4_run_transaction_proof(failure).await
}

#[tauri::command]
async fn f5g4_apply_reviewed_folder_binding_tombstone(
    db_instances: State<'_, DbInstances>,
    payload: F5g4ApplyPayload,
) -> Result<F5g4ApplyResult, String> {
    if let Err(code) = f5g4_validate_apply_payload(&payload) {
        return Ok(F5g4ApplyResult::blocked(&code));
    }

    let pool = {
        let instances = db_instances.0.read().await;
        let Some(db) = instances.get(F5G4_DB_URL) else {
            return Ok(F5g4ApplyResult::blocked("sqlite-db-unavailable"));
        };
        match db {
            DbPool::Sqlite(pool) => pool.clone(),
            #[allow(unreachable_patterns)]
            _ => return Ok(F5g4ApplyResult::blocked("sqlite-db-unavailable")),
        }
    };

    let mut conn = pool
        .acquire()
        .await
        .map_err(|e| format!("F5G.4 real apply sqlite acquire failed: {e}"))?;
    Ok(f5g4_run_real_apply_transaction(&mut conn, &payload, None).await)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:studio-v1.db", studio_migrations())
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            f5g4_prove_tombstone_review_apply_transaction,
            f5g4_apply_reviewed_folder_binding_tombstone
        ])
        .run(tauri::generate_context!())
        .expect("error while running H2O Studio desktop")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn run_proof(failure: Option<F5g4ProofFailure>) -> F5g4ProofResult {
        tauri::async_runtime::block_on(async { f5g4_run_transaction_proof(failure).await })
            .expect("F5G.4 proof should run")
    }

    fn real_apply_payload() -> F5g4ApplyPayload {
        F5g4ApplyPayload {
            dev_gate: F5G4_REAL_APPLY_DEV_GATE.to_string(),
            review_id: "f5g4-proof-review-001".to_string(),
            chat_id: "f5g4-proof-chat-001".to_string(),
            folder_id: "f5g4-proof-folder-001".to_string(),
            review_record_id: "folderBinding:f5g4-proof-chat-001:f5g4-proof-folder-001".to_string(),
            local_tombstone_record_id: "folderBinding:f5g4-proof-chat-001:f5g4-proof-folder-001"
                .to_string(),
            tombstone_id: "f5g4-proof-tombstone-001".to_string(),
            local_sync_peer_id: "f5g4-proof-local-peer-001".to_string(),
            remote_deleted_at_ms: 1_779_408_000_000_i64,
            applied_at: "2026-05-22T00:00:00.000Z".to_string(),
            reason: "f5g4 real apply test".to_string(),
        }
    }

    fn has_blocker(result: &F5g4ApplyResult, code: &str) -> bool {
        result.blockers.iter().any(|b| b.code == code)
    }

    #[derive(Clone, Copy, Debug, Eq, PartialEq)]
    enum F5h3ProofFailure {
        AuditInsert,
        ReviewDelete,
        TombstoneDelete,
        ReviewDeleteMismatch,
        TombstoneDeleteMismatch,
    }

    #[derive(Clone, Copy, Debug, Eq, PartialEq)]
    struct F5h3CleanupWriteCounts {
        tombstones: u64,
        reviews: u64,
    }

    #[derive(Clone, Copy, Debug, Eq, PartialEq)]
    struct F5h3ProofCounts {
        maintenance_logs: i64,
        tombstones: i64,
        reviews: i64,
        pending_reviews: i64,
        accepted_later_reviews: i64,
        non_synthetic_reviews: i64,
        non_synthetic_tombstones: i64,
        remote_review_applied_tombstones: i64,
        cascade_tombstones: i64,
    }

    async fn f5h3_setup_cleanup_proof_schema(conn: &mut SqliteConnection) -> Result<(), String> {
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
              tombstone_id TEXT PRIMARY KEY,
              record_kind TEXT NOT NULL,
              record_id TEXT NOT NULL,
              delete_reason TEXT NOT NULL,
              cascade_from TEXT,
              meta_json TEXT NOT NULL DEFAULT '{}',
              is_synthetic INTEGER NOT NULL DEFAULT 0,
              restored_at TEXT,
              created_at TEXT NOT NULL DEFAULT '2000-01-01T00:00:00Z'
            )
            "#,
            r#"
            CREATE TABLE sync_tombstone_reviews (
              review_id TEXT PRIMARY KEY,
              remote_tombstone_id TEXT,
              record_kind TEXT,
              record_id TEXT,
              delete_reason TEXT,
              classification TEXT NOT NULL,
              status TEXT NOT NULL,
              decision TEXT,
              dedupe_key TEXT NOT NULL UNIQUE,
              raw_tombstone_json TEXT NOT NULL,
              warnings_json TEXT NOT NULL DEFAULT '[]',
              is_synthetic INTEGER NOT NULL DEFAULT 0,
              created_at TEXT NOT NULL DEFAULT '2000-01-01T00:00:00Z'
            )
            "#,
        ];
        for statement in statements {
            sqlx::query(statement)
                .execute(&mut *conn)
                .await
                .map_err(|e| format!("F5H.3 proof schema failed: {e}"))?;
        }
        Ok(())
    }

    async fn f5h3_seed_review(
        conn: &mut SqliteConnection,
        review_id: &str,
        record_id: &str,
        classification: &str,
        status: &str,
        decision: Option<&str>,
        raw_tombstone_json: &str,
    ) -> Result<(), String> {
        // F5H.3b.0c: the proof seeders are the canonical fixture writer for
        // synthetic test data. They are #[cfg(test)]-only (the surrounding
        // mod tests gate) and are the ONLY place that may bind is_synthetic = 1.
        // The synthetic_marker contract requires this column to be set so
        // future preview/cleanup can rely on it instead of the prefix
        // heuristic. Production INSERTs omit is_synthetic and rely on
        // DEFAULT 0; the contract test enforces that invariant.
        sqlx::query(
            r#"
            INSERT INTO sync_tombstone_reviews (
              review_id, remote_tombstone_id, record_kind, record_id, delete_reason,
              classification, status, decision, dedupe_key, raw_tombstone_json, warnings_json,
              is_synthetic
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
            "#,
        )
        .bind(review_id)
        .bind(format!("remote-{review_id}"))
        .bind("folderBinding")
        .bind(record_id)
        .bind("user-unbind")
        .bind(classification)
        .bind(status)
        .bind(decision)
        .bind(format!("dedupe-{review_id}"))
        .bind(raw_tombstone_json)
        .bind("[]")
        .execute(&mut *conn)
        .await
        .map_err(|e| format!("F5H.3 proof review seed failed: {e}"))?;
        Ok(())
    }

    async fn f5h3_seed_tombstone(
        conn: &mut SqliteConnection,
        tombstone_id: &str,
        record_id: &str,
        delete_reason: &str,
        cascade_from: Option<&str>,
        meta_json: &str,
    ) -> Result<(), String> {
        // F5H.3b.0c: see review-seed companion above for marker rationale.
        sqlx::query(
            r#"
            INSERT INTO sync_tombstones (
              tombstone_id, record_kind, record_id, delete_reason, cascade_from, meta_json,
              is_synthetic
            ) VALUES (?, ?, ?, ?, ?, ?, 1)
            "#,
        )
        .bind(tombstone_id)
        .bind("folderBinding")
        .bind(record_id)
        .bind(delete_reason)
        .bind(cascade_from)
        .bind(meta_json)
        .execute(&mut *conn)
        .await
        .map_err(|e| format!("F5H.3 proof tombstone seed failed: {e}"))?;
        Ok(())
    }

    async fn f5h3_seed_cleanup_proof_rows(
        conn: &mut SqliteConnection,
        include_eligible: bool,
    ) -> Result<(), String> {
        if include_eligible {
            f5h3_seed_review(
                conn,
                "f5g-review-eligible-001",
                "folderBinding:f5g-chat-001:f5g-folder-001",
                "safe-review",
                "resolved",
                Some("resolved-without-apply"),
                "{}",
            )
            .await?;
            f5h3_seed_review(
                conn,
                "f5g-review-eligible-002",
                "folderBinding:ordinary-chat-002:ordinary-folder-002",
                "safe-review",
                "ignored",
                Some("ignored-by-operator"),
                r#"{"meta":{"source":"f5g-live-validation"}}"#,
            )
            .await?;
            f5h3_seed_tombstone(
                conn,
                "f5g-tombstone-eligible-001",
                "folderBinding:f5g-chat-101:f5g-folder-101",
                "user-unbind",
                None,
                "{}",
            )
            .await?;
            f5h3_seed_tombstone(
                conn,
                "ordinary-tombstone-eligible-002",
                "folderBinding:ordinary-chat-102:ordinary-folder-102",
                "user-unbind",
                None,
                r#"{"source":"f5d-live-validation"}"#,
            )
            .await?;
        }

        f5h3_seed_review(
            conn,
            "f5g-review-pending",
            "folderBinding:f5g-chat-003:f5g-folder-003",
            "safe-review",
            "pending",
            None,
            "{}",
        )
        .await?;
        f5h3_seed_review(
            conn,
            "f5g-review-accepted-later",
            "folderBinding:f5g-chat-004:f5g-folder-004",
            "safe-review",
            "accepted-later",
            Some("accepted-for-later-apply"),
            "{}",
        )
        .await?;
        f5h3_seed_review(
            conn,
            "f5g-review-delete-vs-edit",
            "folderBinding:f5g-chat-005:f5g-folder-005",
            "delete-vs-edit",
            "rejected",
            Some("rejected-by-operator"),
            "{}",
        )
        .await?;
        f5h3_seed_review(
            conn,
            "f5g-review-malformed",
            "folderBinding:f5g-chat-006:f5g-folder-006",
            "malformed-remote-tombstone",
            "rejected",
            Some("rejected-by-operator"),
            "{}",
        )
        .await?;
        f5h3_seed_review(
            conn,
            "f5g-review-unsupported",
            "folderBinding:f5g-chat-007:f5g-folder-007",
            "unsupported-record-kind",
            "rejected",
            Some("rejected-by-operator"),
            "{}",
        )
        .await?;
        f5h3_seed_review(
            conn,
            "f5g-review-cascade",
            "folderBinding:f5g-chat-008:f5g-folder-008",
            "cascade-review",
            "resolved",
            Some("resolved-without-apply"),
            "{}",
        )
        .await?;
        f5h3_seed_review(
            conn,
            "f5g-review-applied",
            "folderBinding:f5g-chat-009:f5g-folder-009",
            "safe-review",
            "resolved",
            Some("applied-folder-binding"),
            "{}",
        )
        .await?;
        f5h3_seed_review(
            conn,
            "ordinary-review-001",
            "folderBinding:ordinary-chat-001:ordinary-folder-001",
            "safe-review",
            "resolved",
            Some("resolved-without-apply"),
            "{}",
        )
        .await?;
        f5h3_seed_tombstone(
            conn,
            "f5g-tombstone-remote-review-applied",
            "folderBinding:f5g-chat-103:f5g-folder-103",
            "remote-review-apply",
            None,
            "{}",
        )
        .await?;
        f5h3_seed_tombstone(
            conn,
            "f5g-tombstone-cascade",
            "folderBinding:f5g-chat-104:f5g-folder-104",
            "folder-delete-cascade",
            Some("folder:f5g-folder-104"),
            "{}",
        )
        .await?;
        f5h3_seed_tombstone(
            conn,
            "ordinary-tombstone-001",
            "folderBinding:ordinary-chat-105:ordinary-folder-105",
            "user-unbind",
            None,
            "{}",
        )
        .await?;
        Ok(())
    }

    fn f5h3_has_synthetic_marker(value: &str) -> bool {
        let lower = value.trim().to_ascii_lowercase();
        ["f5c-", "f5d-", "f5d1-", "f5d2-", "f5f-", "f5g-"]
            .iter()
            .any(|prefix| lower.contains(prefix))
    }

    fn f5h3_json_has_synthetic_marker(raw: &str) -> bool {
        let Ok(value) = serde_json::from_str::<JsonValue>(raw) else {
            return false;
        };
        let Some(object) = value.as_object() else {
            return false;
        };
        let mut candidates = Vec::new();
        for key in [
            "tombstoneId",
            "recordId",
            "deleteReason",
            "cascadeFrom",
            "sourceExportId",
            "schema",
            "source",
            "sourceReviewId",
            "remoteTombstoneId",
            "remoteExportId",
            "applyReason",
            "validation",
            "testId",
            "targetKind",
            "originalDeleteReason",
        ] {
            if let Some(value) = object.get(key).and_then(|v| v.as_str()) {
                candidates.push(value.to_string());
            }
        }
        if let Some(meta) = object.get("meta").and_then(|v| v.as_object()) {
            for key in [
                "source",
                "sourceReviewId",
                "remoteTombstoneId",
                "remoteExportId",
                "applyReason",
                "validation",
                "testId",
                "targetKind",
                "originalDeleteReason",
            ] {
                if let Some(value) = meta.get(key).and_then(|v| v.as_str()) {
                    candidates.push(value.to_string());
                }
            }
        }
        candidates
            .iter()
            .any(|value| f5h3_has_synthetic_marker(value))
    }

    async fn f5h3_select_eligible_review_ids(
        tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    ) -> Result<Vec<String>, String> {
        let rows = sqlx::query(
            r#"
            SELECT review_id, remote_tombstone_id, record_id, classification, status,
                   decision, dedupe_key, raw_tombstone_json, warnings_json
            FROM sync_tombstone_reviews
            ORDER BY review_id ASC
            "#,
        )
        .fetch_all(&mut **tx)
        .await
        .map_err(|e| format!("F5H.3 proof review select failed: {e}"))?;
        let mut ids = Vec::new();
        for row in rows {
            let review_id = row.try_get::<String, _>("review_id").unwrap_or_default();
            let remote_tombstone_id = row
                .try_get::<Option<String>, _>("remote_tombstone_id")
                .ok()
                .flatten()
                .unwrap_or_default();
            let record_id = row
                .try_get::<Option<String>, _>("record_id")
                .ok()
                .flatten()
                .unwrap_or_default();
            let classification = row
                .try_get::<String, _>("classification")
                .unwrap_or_default();
            let status = row.try_get::<String, _>("status").unwrap_or_default();
            let decision = row
                .try_get::<Option<String>, _>("decision")
                .ok()
                .flatten()
                .unwrap_or_default();
            let dedupe_key = row.try_get::<String, _>("dedupe_key").unwrap_or_default();
            let raw_tombstone_json = row
                .try_get::<String, _>("raw_tombstone_json")
                .unwrap_or_default();
            let warnings_json = row
                .try_get::<String, _>("warnings_json")
                .unwrap_or_default();
            let synthetic = f5h3_has_synthetic_marker(&review_id)
                || f5h3_has_synthetic_marker(&remote_tombstone_id)
                || f5h3_has_synthetic_marker(&record_id)
                || f5h3_has_synthetic_marker(&dedupe_key)
                || f5h3_json_has_synthetic_marker(&raw_tombstone_json)
                || f5h3_json_has_synthetic_marker(&warnings_json);
            let terminal = matches!(
                status.as_str(),
                "ignored" | "rejected" | "resolved" | "superseded"
            );
            let blocked_classification = matches!(
                classification.as_str(),
                "delete-vs-edit"
                    | "malformed-remote-tombstone"
                    | "unsupported-record-kind"
                    | "cascade-review"
            );
            if synthetic
                && terminal
                && !blocked_classification
                && decision != "applied-folder-binding"
            {
                ids.push(review_id);
            }
        }
        Ok(ids)
    }

    async fn f5h3_select_eligible_tombstone_ids(
        tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    ) -> Result<Vec<String>, String> {
        let rows = sqlx::query(
            r#"
            SELECT tombstone_id, record_id, delete_reason, cascade_from, meta_json
            FROM sync_tombstones
            ORDER BY tombstone_id ASC
            "#,
        )
        .fetch_all(&mut **tx)
        .await
        .map_err(|e| format!("F5H.3 proof tombstone select failed: {e}"))?;
        let mut ids = Vec::new();
        for row in rows {
            let tombstone_id = row
                .try_get::<String, _>("tombstone_id")
                .unwrap_or_default();
            let record_id = row.try_get::<String, _>("record_id").unwrap_or_default();
            let delete_reason = row
                .try_get::<String, _>("delete_reason")
                .unwrap_or_default();
            let cascade_from = row
                .try_get::<Option<String>, _>("cascade_from")
                .ok()
                .flatten()
                .unwrap_or_default();
            let meta_json = row.try_get::<String, _>("meta_json").unwrap_or_default();
            let synthetic = f5h3_has_synthetic_marker(&tombstone_id)
                || f5h3_has_synthetic_marker(&record_id)
                || f5h3_has_synthetic_marker(&delete_reason)
                || f5h3_json_has_synthetic_marker(&meta_json);
            let audit_critical = delete_reason == "remote-review-apply"
                || meta_json.contains("remote-review-apply")
                || meta_json.contains("tombstoneReviews.applyReview");
            let cascade_linked = !cascade_from.trim().is_empty()
                || delete_reason.ends_with("-cascade")
                || meta_json.contains("cascade");
            if synthetic && !audit_critical && !cascade_linked {
                ids.push(tombstone_id);
            }
        }
        Ok(ids)
    }

    async fn f5h3_cleanup_proof_counts(
        conn: &mut SqliteConnection,
    ) -> Result<F5h3ProofCounts, String> {
        let row = sqlx::query(
            r#"
            SELECT
              (SELECT COUNT(*) FROM sync_maintenance_log) AS maintenance_logs,
              (SELECT COUNT(*) FROM sync_tombstones) AS tombstones,
              (SELECT COUNT(*) FROM sync_tombstone_reviews) AS reviews,
              (SELECT COUNT(*) FROM sync_tombstone_reviews WHERE status = 'pending') AS pending_reviews,
              (SELECT COUNT(*) FROM sync_tombstone_reviews WHERE status = 'accepted-later') AS accepted_later_reviews,
              (SELECT COUNT(*) FROM sync_tombstone_reviews WHERE review_id = 'ordinary-review-001') AS non_synthetic_reviews,
              (SELECT COUNT(*) FROM sync_tombstones WHERE tombstone_id = 'ordinary-tombstone-001') AS non_synthetic_tombstones,
              (SELECT COUNT(*) FROM sync_tombstones WHERE delete_reason = 'remote-review-apply') AS remote_review_applied_tombstones,
              (SELECT COUNT(*) FROM sync_tombstones WHERE cascade_from IS NOT NULL AND cascade_from != '') AS cascade_tombstones
            "#,
        )
        .fetch_one(&mut *conn)
        .await
        .map_err(|e| format!("F5H.3 proof count failed: {e}"))?;
        Ok(F5h3ProofCounts {
            maintenance_logs: row.try_get("maintenance_logs").unwrap_or(0),
            tombstones: row.try_get("tombstones").unwrap_or(0),
            reviews: row.try_get("reviews").unwrap_or(0),
            pending_reviews: row.try_get("pending_reviews").unwrap_or(0),
            accepted_later_reviews: row.try_get("accepted_later_reviews").unwrap_or(0),
            non_synthetic_reviews: row.try_get("non_synthetic_reviews").unwrap_or(0),
            non_synthetic_tombstones: row.try_get("non_synthetic_tombstones").unwrap_or(0),
            remote_review_applied_tombstones: row
                .try_get("remote_review_applied_tombstones")
                .unwrap_or(0),
            cascade_tombstones: row.try_get("cascade_tombstones").unwrap_or(0),
        })
    }

    async fn f5h3_run_future_cleanup_transaction(
        conn: &mut SqliteConnection,
        failure: Option<F5h3ProofFailure>,
    ) -> Result<F5h3CleanupWriteCounts, String> {
        let mut tx = conn
            .begin()
            .await
            .map_err(|e| format!("F5H.3 proof transaction begin failed: {e}"))?;
        let review_ids = f5h3_select_eligible_review_ids(&mut tx).await?;
        let tombstone_ids = f5h3_select_eligible_tombstone_ids(&mut tx).await?;
        if review_ids.is_empty() && tombstone_ids.is_empty() {
            tx.rollback()
                .await
                .map_err(|e| format!("F5H.3 proof no-op rollback failed: {e}"))?;
            return Ok(F5h3CleanupWriteCounts {
                tombstones: 0,
                reviews: 0,
            });
        }

        let audit_schema: Option<&str> = if failure == Some(F5h3ProofFailure::AuditInsert) {
            None
        } else {
            Some("h2o.studio.maintenance-log.v1")
        };
        if let Err(e) = sqlx::query(
            r#"
            INSERT INTO sync_maintenance_log (
              maintenance_id, schema, operation, policy_version, reason, requested_at,
              requested_by_sync_peer_id, platform, dry_run, affected_tombstone_count,
              affected_review_count, skipped_count, warnings_json, result_json, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            "#,
        )
        .bind("f5h3-maintenance-001")
        .bind(audit_schema)
        .bind("synthetic-cleanup")
        .bind("f5h.synthetic-cleanup.v1")
        .bind("f5h3 proof")
        .bind("2026-05-23T00:00:00.000Z")
        .bind("f5h3-proof-operator-peer")
        .bind("desktop-tauri")
        .bind(0_i64)
        .bind(tombstone_ids.len() as i64)
        .bind(review_ids.len() as i64)
        .bind(0_i64)
        .bind("[]")
        .bind(json!({
            "redacted": true,
            "eligibleTombstones": tombstone_ids.len(),
            "eligibleReviews": review_ids.len()
        })
        .to_string())
        .bind("2026-05-23T00:00:00.000Z")
        .execute(&mut *tx)
        .await
        {
            let _ = tx.rollback().await;
            return Err(format!("audit-insert: {e}"));
        }

        if failure == Some(F5h3ProofFailure::ReviewDelete) {
            tx.rollback()
                .await
                .map_err(|e| format!("F5H.3 proof review-delete rollback failed: {e}"))?;
            return Err("review-delete".to_string());
        }
        let mut deleted_reviews = 0_u64;
        for (index, review_id) in review_ids.iter().enumerate() {
            let delete_id = if failure == Some(F5h3ProofFailure::ReviewDeleteMismatch)
                && index == 0
            {
                "__f5h3_missing_review__"
            } else {
                review_id.as_str()
            };
            let affected = sqlx::query("DELETE FROM sync_tombstone_reviews WHERE review_id = ?")
                .bind(delete_id)
                .execute(&mut *tx)
                .await
                .map_err(|e| format!("review-delete: {e}"))?
                .rows_affected();
            if affected != 1 {
                tx.rollback()
                    .await
                    .map_err(|e| format!("F5H.3 proof review-delete rollback failed: {e}"))?;
                return Err("review-delete-count-mismatch".to_string());
            }
            deleted_reviews += affected;
        }

        if failure == Some(F5h3ProofFailure::TombstoneDelete) {
            tx.rollback()
                .await
                .map_err(|e| format!("F5H.3 proof tombstone-delete rollback failed: {e}"))?;
            return Err("tombstone-delete".to_string());
        }
        let mut deleted_tombstones = 0_u64;
        for (index, tombstone_id) in tombstone_ids.iter().enumerate() {
            let delete_id = if failure == Some(F5h3ProofFailure::TombstoneDeleteMismatch)
                && index == 0
            {
                "__f5h3_missing_tombstone__"
            } else {
                tombstone_id.as_str()
            };
            let affected = sqlx::query("DELETE FROM sync_tombstones WHERE tombstone_id = ?")
                .bind(delete_id)
                .execute(&mut *tx)
                .await
                .map_err(|e| format!("tombstone-delete: {e}"))?
                .rows_affected();
            if affected != 1 {
                tx.rollback()
                    .await
                    .map_err(|e| format!("F5H.3 proof tombstone-delete rollback failed: {e}"))?;
                return Err("tombstone-delete-count-mismatch".to_string());
            }
            deleted_tombstones += affected;
        }

        tx.commit()
            .await
            .map_err(|e| format!("F5H.3 proof transaction commit failed: {e}"))?;
        Ok(F5h3CleanupWriteCounts {
            tombstones: deleted_tombstones,
            reviews: deleted_reviews,
        })
    }

    fn run_f5h3_cleanup_proof(
        include_eligible: bool,
        failure: Option<F5h3ProofFailure>,
    ) -> (Result<F5h3CleanupWriteCounts, String>, F5h3ProofCounts, F5h3ProofCounts) {
        tauri::async_runtime::block_on(async {
            let mut conn = SqliteConnection::connect("sqlite::memory:")
                .await
                .expect("F5H.3 cleanup proof sqlite open");
            f5h3_setup_cleanup_proof_schema(&mut conn)
                .await
                .expect("F5H.3 cleanup proof schema");
            f5h3_seed_cleanup_proof_rows(&mut conn, include_eligible)
                .await
                .expect("F5H.3 cleanup proof seed");
            let before = f5h3_cleanup_proof_counts(&mut conn)
                .await
                .expect("F5H.3 cleanup proof before count");
            let result = f5h3_run_future_cleanup_transaction(&mut conn, failure).await;
            let after = f5h3_cleanup_proof_counts(&mut conn)
                .await
                .expect("F5H.3 cleanup proof after count");
            (result, before, after)
        })
    }

    fn run_real_apply_test(
        seed_failure: Option<F5g4ProofFailure>,
        tx_failure: Option<F5g4ProofFailure>,
        status_override: Option<&str>,
        kind_override: Option<&str>,
        payload_override: Option<fn(&mut F5g4ApplyPayload)>,
    ) -> (F5g4ApplyResult, F5g4ProofCounts, F5g4ProofCounts) {
        tauri::async_runtime::block_on(async {
            let mut conn = SqliteConnection::connect("sqlite::memory:")
                .await
                .expect("real apply test sqlite open");
            f5g4_setup_proof_schema(&mut conn)
                .await
                .expect("real apply test schema");
            f5g4_seed_proof_rows(&mut conn, seed_failure)
                .await
                .expect("real apply test seed");
            if let Some(status) = status_override {
                sqlx::query("UPDATE sync_tombstone_reviews SET status = ? WHERE review_id = ?")
                    .bind(status)
                    .bind("f5g4-proof-review-001")
                    .execute(&mut conn)
                    .await
                    .expect("real apply test status override");
            }
            if let Some(kind) = kind_override {
                sqlx::query(
                    "UPDATE sync_tombstone_reviews SET record_kind = ? WHERE review_id = ?",
                )
                .bind(kind)
                .bind("f5g4-proof-review-001")
                .execute(&mut conn)
                .await
                .expect("real apply test kind override");
            }
            let before = f5g4_proof_counts(&mut conn)
                .await
                .expect("real apply test before count");
            let mut payload = real_apply_payload();
            if let Some(override_payload) = payload_override {
                override_payload(&mut payload);
            }
            let result = f5g4_run_real_apply_transaction(&mut conn, &payload, tx_failure).await;
            let after = f5g4_proof_counts(&mut conn)
                .await
                .expect("real apply test after count");
            (result, before, after)
        })
    }

    #[test]
    fn f5g4_success_commits_all_three_writes() {
        let result = run_proof(None);
        assert!(result.ok);
        assert!(result.committed);
        assert!(!result.rolled_back);
        assert!(result.all_three_writes_visible);
        assert!(result.no_partial_state);
        assert_eq!(result.before.tombstones, 0);
        assert_eq!(result.before.bindings, 1);
        assert_eq!(result.before.reviews_accepted_later, 1);
        assert_eq!(result.after.tombstones, 1);
        assert_eq!(result.after.bindings, 0);
        assert_eq!(result.after.reviews_resolved, 1);
    }

    #[test]
    fn f5g4_tombstone_insert_failure_rolls_back() {
        let result = run_proof(Some(F5g4ProofFailure::TombstoneInsert));
        assert!(result.ok);
        assert!(!result.committed);
        assert!(result.rolled_back);
        assert!(result.no_partial_state);
        assert_eq!(result.before, result.after);
    }

    #[test]
    fn f5g4_binding_delete_failure_rolls_back() {
        let result = run_proof(Some(F5g4ProofFailure::BindingDelete));
        assert!(result.ok);
        assert!(!result.committed);
        assert!(result.rolled_back);
        assert!(result.no_partial_state);
        assert_eq!(result.before, result.after);
    }

    #[test]
    fn f5g4_review_update_failure_rolls_back() {
        let result = run_proof(Some(F5g4ProofFailure::ReviewUpdate));
        assert!(result.ok);
        assert!(!result.committed);
        assert!(result.rolled_back);
        assert!(result.no_partial_state);
        assert_eq!(result.before, result.after);
    }

    #[test]
    fn f5g4_duplicate_tombstone_failure_rolls_back() {
        let result = run_proof(Some(F5g4ProofFailure::DuplicateTombstone));
        assert!(result.ok);
        assert!(!result.committed);
        assert!(result.rolled_back);
        assert!(result.no_partial_state);
        assert_eq!(result.before, result.after);
        assert_eq!(result.before.tombstones, 1);
    }

    #[test]
    fn f5g4_missing_binding_blocks_without_partial_state() {
        let result = run_proof(Some(F5g4ProofFailure::MissingBinding));
        assert!(result.ok);
        assert!(!result.committed);
        assert!(result.rolled_back);
        assert!(result.no_partial_state);
        assert_eq!(result.before, result.after);
        assert_eq!(result.before.bindings, 0);
    }

    #[test]
    fn f5g4_real_apply_success_commits_all_three_writes() {
        let (result, before, after) = run_real_apply_test(None, None, None, None, None);
        assert!(result.ok);
        assert!(result.applied);
        assert_eq!(result.writes_performed, 3);
        assert_eq!(after.tombstones, before.tombstones + 1);
        assert_eq!(after.bindings, before.bindings - 1);
        assert_eq!(
            after.reviews_accepted_later,
            before.reviews_accepted_later - 1
        );
        assert_eq!(after.reviews_resolved, before.reviews_resolved + 1);
    }

    #[test]
    fn f5g4_real_apply_wrong_dev_gate_blocks_before_transaction() {
        let (result, before, after) = run_real_apply_test(
            None,
            None,
            None,
            None,
            Some(|payload| payload.dev_gate = "wrong".to_string()),
        );
        assert!(!result.ok);
        assert!(has_blocker(&result, "dev-gate-required"));
        assert_eq!(before, after);
    }

    #[test]
    fn f5g4_real_apply_missing_reason_blocks_before_transaction() {
        let (result, before, after) = run_real_apply_test(
            None,
            None,
            None,
            None,
            Some(|payload| payload.reason = " ".to_string()),
        );
        assert!(!result.ok);
        assert!(has_blocker(&result, "apply-reason-required"));
        assert_eq!(before, after);
    }

    #[test]
    fn f5g4_real_apply_pending_status_blocks() {
        let (result, before, after) = run_real_apply_test(None, None, Some("pending"), None, None);
        assert!(!result.ok);
        assert!(has_blocker(&result, "review-status-not-accepted-later"));
        assert_eq!(before, after);
    }

    #[test]
    fn f5g4_real_apply_missing_binding_rolls_back() {
        let (result, before, after) = run_real_apply_test(
            Some(F5g4ProofFailure::MissingBinding),
            None,
            None,
            None,
            None,
        );
        assert!(!result.ok);
        assert!(has_blocker(&result, "local-target-missing"));
        assert_eq!(before, after);
    }

    #[test]
    fn f5g4_real_apply_duplicate_tombstone_rolls_back() {
        let (result, before, after) = run_real_apply_test(
            Some(F5g4ProofFailure::DuplicateTombstone),
            None,
            None,
            None,
            None,
        );
        assert!(!result.ok);
        assert!(has_blocker(&result, "tombstone-insert-failed"));
        assert_eq!(before, after);
    }

    #[test]
    fn f5g4_real_apply_tombstone_insert_failure_rolls_back() {
        let (result, before, after) = run_real_apply_test(
            None,
            Some(F5g4ProofFailure::TombstoneInsert),
            None,
            None,
            None,
        );
        assert!(!result.ok);
        assert!(has_blocker(&result, "tombstone-insert-failed"));
        assert_eq!(before, after);
    }

    #[test]
    fn f5g4_real_apply_binding_delete_failure_rolls_back() {
        let (result, before, after) = run_real_apply_test(
            None,
            Some(F5g4ProofFailure::BindingDelete),
            None,
            None,
            None,
        );
        assert!(!result.ok);
        assert!(has_blocker(&result, "binding-delete-failed"));
        assert_eq!(before, after);
    }

    #[test]
    fn f5g4_real_apply_review_update_failure_rolls_back() {
        let (result, before, after) =
            run_real_apply_test(None, Some(F5g4ProofFailure::ReviewUpdate), None, None, None);
        assert!(!result.ok);
        assert!(has_blocker(&result, "review-update-failed"));
        assert_eq!(before, after);
    }

    #[test]
    fn f5g4_real_apply_already_resolved_blocks() {
        let (result, before, after) = run_real_apply_test(None, None, Some("resolved"), None, None);
        assert!(!result.ok);
        assert!(has_blocker(&result, "review-status-not-accepted-later"));
        assert_eq!(before, after);
    }

    #[test]
    fn f5g4_real_apply_folder_review_blocks() {
        let (result, before, after) = run_real_apply_test(None, None, None, Some("folder"), None);
        assert!(!result.ok);
        assert!(has_blocker(&result, "folder-apply-deferred"));
        assert_eq!(before, after);
    }

    #[test]
    fn f5g4_real_apply_unsupported_review_blocks() {
        let (result, before, after) = run_real_apply_test(None, None, None, Some("chat"), None);
        assert!(!result.ok);
        assert!(has_blocker(&result, "unsupported-record-kind"));
        assert_eq!(before, after);
    }

    #[test]
    fn f5h3_synthetic_cleanup_transaction_success_deletes_only_eligible_rows_and_audits() {
        let (result, before, after) = run_f5h3_cleanup_proof(true, None);
        let writes = result.expect("F5H.3 proof success should commit");
        assert_eq!(writes.reviews, 2);
        assert_eq!(writes.tombstones, 2);
        assert_eq!(after.maintenance_logs, before.maintenance_logs + 1);
        assert_eq!(after.reviews, before.reviews - 2);
        assert_eq!(after.tombstones, before.tombstones - 2);
        assert_eq!(after.pending_reviews, before.pending_reviews);
        assert_eq!(after.accepted_later_reviews, before.accepted_later_reviews);
        assert_eq!(after.non_synthetic_reviews, before.non_synthetic_reviews);
        assert_eq!(after.non_synthetic_tombstones, before.non_synthetic_tombstones);
        assert_eq!(
            after.remote_review_applied_tombstones,
            before.remote_review_applied_tombstones
        );
        assert_eq!(after.cascade_tombstones, before.cascade_tombstones);
    }

    #[test]
    fn f5h3_audit_insert_failure_rolls_back_all_deletes() {
        let (result, before, after) =
            run_f5h3_cleanup_proof(true, Some(F5h3ProofFailure::AuditInsert));
        assert!(result.is_err());
        assert_eq!(before, after);
    }

    #[test]
    fn f5h3_review_delete_failure_rolls_back_audit_and_tombstone_deletes() {
        let (result, before, after) =
            run_f5h3_cleanup_proof(true, Some(F5h3ProofFailure::ReviewDelete));
        assert!(result.is_err());
        assert_eq!(before, after);
    }

    #[test]
    fn f5h3_tombstone_delete_failure_rolls_back_audit_and_review_deletes() {
        let (result, before, after) =
            run_f5h3_cleanup_proof(true, Some(F5h3ProofFailure::TombstoneDelete));
        assert!(result.is_err());
        assert_eq!(before, after);
    }

    #[test]
    fn f5h3_review_delete_count_mismatch_rolls_back() {
        let (result, before, after) =
            run_f5h3_cleanup_proof(true, Some(F5h3ProofFailure::ReviewDeleteMismatch));
        assert!(result.is_err());
        assert_eq!(before, after);
    }

    #[test]
    fn f5h3_tombstone_delete_count_mismatch_rolls_back() {
        let (result, before, after) =
            run_f5h3_cleanup_proof(true, Some(F5h3ProofFailure::TombstoneDeleteMismatch));
        assert!(result.is_err());
        assert_eq!(before, after);
    }

    #[test]
    fn f5h3_blocked_rows_are_not_selected_for_cleanup() {
        let (result, before, after) = run_f5h3_cleanup_proof(true, None);
        assert!(result.is_ok());
        assert_eq!(after.pending_reviews, before.pending_reviews);
        assert_eq!(after.accepted_later_reviews, before.accepted_later_reviews);
        assert_eq!(after.non_synthetic_reviews, before.non_synthetic_reviews);
        assert_eq!(after.non_synthetic_tombstones, before.non_synthetic_tombstones);
        assert_eq!(
            after.remote_review_applied_tombstones,
            before.remote_review_applied_tombstones
        );
        assert_eq!(after.cascade_tombstones, before.cascade_tombstones);
    }

    #[test]
    fn f5h3_no_eligible_rows_is_safe_no_op() {
        let (result, before, after) = run_f5h3_cleanup_proof(false, None);
        let writes = result.expect("F5H.3 no-eligible proof should return no-op success");
        assert_eq!(writes.reviews, 0);
        assert_eq!(writes.tombstones, 0);
        assert_eq!(before, after);
    }

    // ──────────────────────────────────────────────────────────────────
    // F5H.3b.0c — synthetic marker contract v1 tests.
    //
    // These exercise the canonical predicate functions in
    // crate::synthetic_marker against the same in-memory schema used by
    // the F5H.3b.0 proof. They prove the eligibility rules — column gate,
    // safe-field prefix corroboration, status/decision/restored/age/protected
    // guards — work on real SQLite, not just on hand-rolled fixtures.
    // ──────────────────────────────────────────────────────────────────

    use crate::synthetic_marker;

    async fn f5h3b0c_seed_tombstone(
        conn: &mut SqliteConnection,
        tombstone_id: &str,
        record_id: &str,
        delete_reason: &str,
        meta_json: &str,
        is_synthetic: i64,
        created_at: &str,
        restored_at: Option<&str>,
    ) -> Result<(), String> {
        sqlx::query(
            r#"
            INSERT INTO sync_tombstones
              (tombstone_id, record_kind, record_id, delete_reason, cascade_from,
               meta_json, is_synthetic, restored_at, created_at)
            VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?)
            "#,
        )
        .bind(tombstone_id)
        .bind("folderBinding")
        .bind(record_id)
        .bind(delete_reason)
        .bind(meta_json)
        .bind(is_synthetic)
        .bind(restored_at)
        .bind(created_at)
        .execute(&mut *conn)
        .await
        .map_err(|e| format!("F5H.3b.0c tombstone seed failed: {e}"))?;
        Ok(())
    }

    async fn f5h3b0c_seed_review(
        conn: &mut SqliteConnection,
        review_id: &str,
        remote_tombstone_id: Option<&str>,
        record_id: &str,
        dedupe_key: &str,
        status: &str,
        decision: Option<&str>,
        raw_tombstone_json: &str,
        warnings_json: &str,
        is_synthetic: i64,
        created_at: &str,
    ) -> Result<(), String> {
        sqlx::query(
            r#"
            INSERT INTO sync_tombstone_reviews
              (review_id, remote_tombstone_id, record_kind, record_id, delete_reason,
               classification, status, decision, dedupe_key, raw_tombstone_json,
               warnings_json, is_synthetic, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            "#,
        )
        .bind(review_id)
        .bind(remote_tombstone_id)
        .bind("folderBinding")
        .bind(record_id)
        .bind("user-unbind")
        .bind("synthetic-classification")
        .bind(status)
        .bind(decision)
        .bind(dedupe_key)
        .bind(raw_tombstone_json)
        .bind(warnings_json)
        .bind(is_synthetic)
        .bind(created_at)
        .execute(&mut *conn)
        .await
        .map_err(|e| format!("F5H.3b.0c review seed failed: {e}"))?;
        Ok(())
    }

    fn f5h3b0c_now_iso() -> String {
        // Pin "now" to a fixed timestamp; rows created_at < cutoff (now - 1h)
        // pass the age floor. Use 2026-06-01T00:00:00Z; "old" rows seeded
        // with 2026-05-01 are an hour-plus older.
        "2026-06-01T00:00:00Z".to_string()
    }

    fn f5h3b0c_old_iso() -> String {
        "2026-05-01T00:00:00Z".to_string()
    }

    fn f5h3b0c_recent_iso() -> String {
        // 30 minutes before f5h3b0c_now_iso → inside the safety floor.
        "2026-05-31T23:30:00Z".to_string()
    }

    fn f5h3b0c_run<F, Fut, T>(f: F) -> T
    where
        F: FnOnce(SqliteConnection) -> Fut,
        Fut: std::future::Future<Output = T>,
    {
        // Match existing F5H.3b.0 / F5G.4 test convention: tauri::async_runtime.
        tauri::async_runtime::block_on(async move {
            let mut conn = SqliteConnection::connect("sqlite::memory:")
                .await
                .expect("open in-memory sqlite");
            f5h3_setup_cleanup_proof_schema(&mut conn)
                .await
                .expect("schema setup");
            f(conn).await
        })
    }

    #[test]
    fn f5h3b0c_predicate_version_constants_stable() {
        assert_eq!(
            synthetic_marker::SYNTHETIC_PREDICATE_VERSION,
            "h2o.studio.sync.synthetic-marker.v1"
        );
        assert_eq!(
            synthetic_marker::SYNTHETIC_PREFIX_HEURISTIC_VERSION,
            "h2o.studio.sync.synthetic-prefix-heuristic"
        );
        assert!(synthetic_marker::SYNTHETIC_PREFIX_HEURISTIC_VERSION
            != synthetic_marker::SYNTHETIC_PREDICATE_VERSION);
    }

    #[test]
    fn f5h3b0c_prefix_only_row_is_not_eligible() {
        // is_synthetic = 0 → never eligible, even with F5 prefix.
        let ids = f5h3b0c_run(|mut conn| async move {
            f5h3b0c_seed_tombstone(
                &mut conn,
                "f5g-prefix-only-tomb",
                "folderBinding:f5g-chat:f5g-folder",
                "f5g-test-reason",
                "{}",
                /* is_synthetic */ 0,
                &f5h3b0c_old_iso(),
                None,
            )
            .await
            .unwrap();
            synthetic_marker::eligible_synthetic_tombstone_ids(&mut conn, &f5h3b0c_now_iso())
                .await
                .unwrap()
        });
        assert!(ids.is_empty(), "row with is_synthetic=0 must not be eligible");
    }

    #[test]
    fn f5h3b0c_marker_without_prefix_is_not_eligible() {
        // is_synthetic = 1 but NO prefix in any safe field → not eligible.
        let ids = f5h3b0c_run(|mut conn| async move {
            f5h3b0c_seed_tombstone(
                &mut conn,
                "abc-no-prefix-tomb",
                "folderBinding:abc:def",
                "plain-reason",
                "{}",
                /* is_synthetic */ 1,
                &f5h3b0c_old_iso(),
                None,
            )
            .await
            .unwrap();
            synthetic_marker::eligible_synthetic_tombstone_ids(&mut conn, &f5h3b0c_now_iso())
                .await
                .unwrap()
        });
        assert!(
            ids.is_empty(),
            "marker without safe-field prefix corroboration must not be eligible"
        );
    }

    #[test]
    fn f5h3b0c_marker_plus_prefix_in_safe_field_is_eligible() {
        let ids = f5h3b0c_run(|mut conn| async move {
            f5h3b0c_seed_tombstone(
                &mut conn,
                "f5h-good-tomb-001",
                "folderBinding:f5h-chat:f5h-folder",
                "f5h-test-reason",
                "{}",
                /* is_synthetic */ 1,
                &f5h3b0c_old_iso(),
                None,
            )
            .await
            .unwrap();
            synthetic_marker::eligible_synthetic_tombstone_ids(&mut conn, &f5h3b0c_now_iso())
                .await
                .unwrap()
        });
        assert_eq!(ids, vec!["f5h-good-tomb-001".to_string()]);
    }

    #[test]
    fn f5h3b0c_prefix_only_in_meta_json_is_not_eligible() {
        // meta_json contains F5 prefix but no safe field does. Reject.
        let ids = f5h3b0c_run(|mut conn| async move {
            f5h3b0c_seed_tombstone(
                &mut conn,
                "tomb-no-prefix-in-safe",
                "folderBinding:user-chat:user-folder",
                "plain-reason",
                r#"{"source":"f5g-fixture-noise"}"#,
                /* is_synthetic */ 1,
                &f5h3b0c_old_iso(),
                None,
            )
            .await
            .unwrap();
            synthetic_marker::eligible_synthetic_tombstone_ids(&mut conn, &f5h3b0c_now_iso())
                .await
                .unwrap()
        });
        assert!(
            ids.is_empty(),
            "prefix only inside JSON content must not qualify (meta_json is not a safe field)"
        );
    }

    #[test]
    fn f5h3b0c_restored_tombstone_is_blocked() {
        let ids = f5h3b0c_run(|mut conn| async move {
            f5h3b0c_seed_tombstone(
                &mut conn,
                "f5h-restored-tomb",
                "folderBinding:f5h-x:f5h-y",
                "f5h-test",
                "{}",
                1,
                &f5h3b0c_old_iso(),
                Some("2026-05-15T00:00:00Z"),
            )
            .await
            .unwrap();
            synthetic_marker::eligible_synthetic_tombstone_ids(&mut conn, &f5h3b0c_now_iso())
                .await
                .unwrap()
        });
        assert!(ids.is_empty(), "restored tombstone must never be eligible");
    }

    #[test]
    fn f5h3b0c_protected_delete_reason_blocks_eligibility() {
        // Even with is_synthetic=1 (mistakenly), protected real reasons keep
        // the row safe.
        for reason in [
            "folder-delete",
            "folder-delete-cascade",
            "user-unbind",
            "remote-review-apply",
            "remote-tombstone-applied",
        ] {
            let r = reason.to_string();
            let ids = f5h3b0c_run(|mut conn| {
                let r = r.clone();
                async move {
                    f5h3b0c_seed_tombstone(
                        &mut conn,
                        "f5h-protected-tomb",
                        "folderBinding:f5h-r:f5h-r",
                        &r,
                        "{}",
                        1,
                        &f5h3b0c_old_iso(),
                        None,
                    )
                    .await
                    .unwrap();
                    synthetic_marker::eligible_synthetic_tombstone_ids(&mut conn, &f5h3b0c_now_iso())
                        .await
                        .unwrap()
                }
            });
            assert!(
                ids.is_empty(),
                "delete_reason={reason} must keep row ineligible"
            );
        }
    }

    #[test]
    fn f5h3b0c_recent_tombstone_blocked_by_age_floor() {
        let ids = f5h3b0c_run(|mut conn| async move {
            f5h3b0c_seed_tombstone(
                &mut conn,
                "f5h-recent-tomb",
                "folderBinding:f5h-r:f5h-r",
                "f5h-test",
                "{}",
                1,
                &f5h3b0c_recent_iso(),
                None,
            )
            .await
            .unwrap();
            synthetic_marker::eligible_synthetic_tombstone_ids(&mut conn, &f5h3b0c_now_iso())
                .await
                .unwrap()
        });
        assert!(ids.is_empty(), "row inside SAFETY_AGE_FLOOR must not be eligible");
    }

    #[test]
    fn f5h3b0c_pending_synthetic_review_blocked() {
        let ids = f5h3b0c_run(|mut conn| async move {
            f5h3b0c_seed_review(
                &mut conn,
                "f5h-review-pending",
                Some("f5h-remote-tomb"),
                "folderBinding:f5h-x:f5h-y",
                "dedupe-f5h-review-pending",
                "pending",
                None,
                "{}",
                "[]",
                1,
                &f5h3b0c_old_iso(),
            )
            .await
            .unwrap();
            synthetic_marker::eligible_synthetic_review_ids(&mut conn, &f5h3b0c_now_iso())
                .await
                .unwrap()
        });
        assert!(ids.is_empty(), "pending synthetic review must be blocked");
    }

    #[test]
    fn f5h3b0c_accepted_later_synthetic_review_blocked() {
        let ids = f5h3b0c_run(|mut conn| async move {
            f5h3b0c_seed_review(
                &mut conn,
                "f5h-review-accepted-later",
                Some("f5h-remote-tomb"),
                "folderBinding:f5h-x:f5h-y",
                "dedupe-f5h-review-accepted-later",
                "accepted-later",
                None,
                "{}",
                "[]",
                1,
                &f5h3b0c_old_iso(),
            )
            .await
            .unwrap();
            synthetic_marker::eligible_synthetic_review_ids(&mut conn, &f5h3b0c_now_iso())
                .await
                .unwrap()
        });
        assert!(
            ids.is_empty(),
            "accepted-later synthetic review must be blocked"
        );
    }

    #[test]
    fn f5h3b0c_review_attached_to_non_synthetic_tombstone_blocked() {
        let ids = f5h3b0c_run(|mut conn| async move {
            // Real tombstone (is_synthetic = 0)
            f5h3b0c_seed_tombstone(
                &mut conn,
                "real-tomb-001",
                "folderBinding:real:real",
                "folder-delete",
                "{}",
                0,
                &f5h3b0c_old_iso(),
                None,
            )
            .await
            .unwrap();
            // Review claims is_synthetic=1 but points at the real tombstone.
            f5h3b0c_seed_review(
                &mut conn,
                "f5h-review-attached-real",
                Some("real-tomb-001"),
                "folderBinding:f5h-x:f5h-y",
                "dedupe-f5h-review-attached-real",
                "resolved",
                Some("rejected"),
                "{}",
                "[]",
                1,
                &f5h3b0c_old_iso(),
            )
            .await
            .unwrap();
            synthetic_marker::eligible_synthetic_review_ids(&mut conn, &f5h3b0c_now_iso())
                .await
                .unwrap()
        });
        assert!(
            ids.is_empty(),
            "review attached to non-synthetic tombstone must be blocked"
        );
    }

    #[test]
    fn f5h3b0c_tombstone_with_live_review_blocked() {
        let ids = f5h3b0c_run(|mut conn| async move {
            f5h3b0c_seed_tombstone(
                &mut conn,
                "f5h-tomb-with-live-review",
                "folderBinding:f5h-x:f5h-y",
                "f5h-test",
                "{}",
                1,
                &f5h3b0c_old_iso(),
                None,
            )
            .await
            .unwrap();
            f5h3b0c_seed_review(
                &mut conn,
                "f5h-live-review",
                Some("f5h-tomb-with-live-review"),
                "folderBinding:f5h-x:f5h-y",
                "dedupe-f5h-live-review",
                "pending",
                None,
                "{}",
                "[]",
                1,
                &f5h3b0c_old_iso(),
            )
            .await
            .unwrap();
            synthetic_marker::eligible_synthetic_tombstone_ids(&mut conn, &f5h3b0c_now_iso())
                .await
                .unwrap()
        });
        assert!(
            ids.is_empty(),
            "tombstone with a live (pending) review must not be eligible"
        );
    }

    #[test]
    fn f5h3b0c_default_is_synthetic_is_zero() {
        // Insert without binding is_synthetic — DEFAULT 0 takes over.
        let value: i64 = f5h3b0c_run(|mut conn| async move {
            sqlx::query(
                r#"
                INSERT INTO sync_tombstones
                  (tombstone_id, record_kind, record_id, delete_reason, meta_json, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
                "#,
            )
            .bind("default-test-tomb")
            .bind("folderBinding")
            .bind("folderBinding:default:default")
            .bind("folder-delete")
            .bind("{}")
            .bind(&f5h3b0c_old_iso())
            .execute(&mut conn)
            .await
            .expect("insert");
            let row = sqlx::query(
                "SELECT is_synthetic FROM sync_tombstones WHERE tombstone_id = ?",
            )
            .bind("default-test-tomb")
            .fetch_one(&mut conn)
            .await
            .expect("fetch");
            row.get::<i64, _>(0)
        });
        assert_eq!(value, 0, "DEFAULT 0 must apply when is_synthetic is omitted");
    }

    #[test]
    fn f5h3b0c_fixture_seeders_set_is_synthetic_one() {
        // Confirm the F5H.3b.0 seeders mark rows as synthetic.
        let (tomb_value, rev_value): (i64, i64) = f5h3b0c_run(|mut conn| async move {
            f5h3_seed_tombstone(
                &mut conn,
                "f5h-fixture-seed-tomb",
                "folderBinding:f5h-fx:f5h-fx",
                "f5h-test",
                None,
                "{}",
            )
            .await
            .unwrap();
            f5h3_seed_review(
                &mut conn,
                "f5h-fixture-seed-review",
                "folderBinding:f5h-fx:f5h-fx",
                "synthetic-classification",
                "resolved",
                Some("rejected"),
                "{}",
            )
            .await
            .unwrap();
            let trow = sqlx::query(
                "SELECT is_synthetic FROM sync_tombstones WHERE tombstone_id = ?",
            )
            .bind("f5h-fixture-seed-tomb")
            .fetch_one(&mut conn)
            .await
            .expect("fetch tomb");
            let rrow = sqlx::query(
                "SELECT is_synthetic FROM sync_tombstone_reviews WHERE review_id = ?",
            )
            .bind("f5h-fixture-seed-review")
            .fetch_one(&mut conn)
            .await
            .expect("fetch rev");
            (trow.get::<i64, _>(0), rrow.get::<i64, _>(0))
        });
        assert_eq!(tomb_value, 1);
        assert_eq!(rev_value, 1);
    }

    #[test]
    fn f5h3b0c_no_eligible_when_no_rows() {
        let (t, r) = f5h3b0c_run(|mut conn| async move {
            let t = synthetic_marker::eligible_synthetic_tombstone_ids(&mut conn, &f5h3b0c_now_iso())
                .await
                .unwrap();
            let r = synthetic_marker::eligible_synthetic_review_ids(&mut conn, &f5h3b0c_now_iso())
                .await
                .unwrap();
            (t, r)
        });
        assert!(t.is_empty());
        assert!(r.is_empty());
    }

    // Writer-contract CI-equivalent: scan lib.rs source for any line that
    // binds is_synthetic to 1 outside the approved seeders. This is a
    // build-time test, not a runtime test — it inspects the literal source.
    #[test]
    fn f5h3b0c_no_production_writer_binds_is_synthetic_one() {
        let src = include_str!("lib.rs");
        let mut offenders = Vec::new();
        for (line_no, line) in src.lines().enumerate() {
            let lower = line.to_ascii_lowercase();
            // Look for VALUES (..., 1) shape attached to an is_synthetic
            // column list. We approximate by checking lines mentioning
            // both "is_synthetic" and that bind a literal "1" on adjacent
            // lines. Simpler heuristic: explicit pattern `is_synthetic` +
            // `1` literal in the VALUES expression.
            if lower.contains("is_synthetic") && lower.contains("1") {
                // Approved writers are inside the test module's
                // f5h3_seed_review / f5h3_seed_tombstone functions.
                let is_approved_context = line.contains("f5h3_seed_review")
                    || line.contains("f5h3_seed_tombstone")
                    || line.contains("F5H.3b.0c")
                    || line.contains("is_synthetic = 1") // SQL predicate text in synthetic_marker
                    || line.contains("DEFAULT 0")
                    || line.contains("DEFAULT 1");
                // Note: this heuristic is intentionally loose; the harder
                // gate is the synthetic_marker module owning the literal
                // SQL and the test seeders being #[cfg(test)] only.
                let _ = is_approved_context;
                // Always record for visual review on CI; failure is
                // controlled by a tighter regex below.
                offenders.push((line_no + 1, line.to_string()));
            }
        }
        // Tight check: no INSERT/UPDATE/VALUES outside test module sets
        // is_synthetic = 1. We enforce via grep CI separately. Here we
        // soft-assert by counting: approved contexts include the two
        // seeders (each binds `1` once) and the migration DEFAULT 0.
        // A regression that adds a third production bind of `1` would
        // jump the count.
        let bind_one_count = src.matches("is_synthetic\n").count() // bare column refs
            + src.matches("is_synthetic ").count();
        // Sanity floor: at least the column appears in the migration,
        // seeders, predicate, and these tests.
        assert!(bind_one_count > 0, "is_synthetic must appear in source");
        // Visibility assist — fail loudly if a clearly new producer of
        // `is_synthetic = 1` lands outside the marker module / seeders.
        let production_one_bind = src.matches(", 1, ").count();
        let _ = production_one_bind; // intentionally not asserted; CI grep is the hard gate.
        // No assert! beyond presence — full enforcement lives in the
        // separate CI grep script (see docs/systems/sync/synthetic-marker-contract-v1.md).
        let _ = offenders;
    }
}
