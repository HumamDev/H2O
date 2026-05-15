// Tauri V2 entry point. Split into a library so the same `run()` function
// compiles into both the desktop binary (via src/main.rs) and any future
// mobile target (which compiles through the cdylib declared in Cargo.toml's
// [lib] section). This is the canonical Tauri V2 template shape.

use tauri_plugin_sql::{Migration, MigrationKind};

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
    ]
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:studio-v1.db", studio_migrations())
                .build(),
        )
        .invoke_handler(tauri::generate_handler![])
        .run(tauri::generate_context!())
        .expect("error while running H2O Studio desktop")
}
