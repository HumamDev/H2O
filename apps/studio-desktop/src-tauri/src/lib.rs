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
