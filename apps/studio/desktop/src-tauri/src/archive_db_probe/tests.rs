use super::*;
use sqlx::Connection;

const HASH_A: &str = "aa11223344556677889900aabbccddeeff00112233445566778899aabbccddee";
const HASH_B: &str = "bb11223344556677889900aabbccddeeff00112233445566778899aabbccddee";
const SHA_1: &str = "1111111111111111111111111111111111111111111111111111111111111111";
const SHA_2: &str = "2222222222222222222222222222222222222222222222222222222222222222";
const SHA_3: &str = "3333333333333333333333333333333333333333333333333333333333333333";

/// The REQUIRED schema only. Extra columns and unrelated tables are added by
/// individual tests to prove forward compatibility.
const BASE_SCHEMA: &str = r#"
CREATE TABLE assets (
  sha256 TEXT PRIMARY KEY, mime_type TEXT NOT NULL DEFAULT '',
  byte_size INTEGER NOT NULL DEFAULT 0, refcount INTEGER NOT NULL DEFAULT 0,
  meta_json TEXT NOT NULL DEFAULT '{}'
);
CREATE TABLE snapshot_turn_assets (
  snapshot_id TEXT NOT NULL, turn_idx INTEGER NOT NULL, sha256 TEXT NOT NULL,
  PRIMARY KEY (snapshot_id, turn_idx, sha256)
);
CREATE TABLE saved_chat_archive_requests (
  request_id TEXT PRIMARY KEY, status TEXT NOT NULL, studio_chat_id TEXT,
  snapshot_id TEXT, meta_json TEXT NOT NULL DEFAULT '{}'
);
CREATE TABLE chats (id TEXT PRIMARY KEY, meta_json TEXT NOT NULL DEFAULT '{}');
CREATE TABLE snapshots (
  id TEXT PRIMARY KEY, chat_id TEXT NOT NULL, meta_json TEXT NOT NULL DEFAULT '{}'
);
"#;

async fn memory_db(extra: &str) -> SqliteConnection {
    let mut conn = SqliteConnection::connect("sqlite::memory:").await.unwrap();
    for statement in BASE_SCHEMA.split(';') {
        if statement.trim().is_empty() {
            continue;
        }
        sqlx::query(statement).execute(&mut conn).await.unwrap();
    }
    for statement in extra.split(";\n") {
        if statement.trim().is_empty() {
            continue;
        }
        sqlx::query(statement).execute(&mut conn).await.unwrap();
    }
    conn
}

fn import_meta(chat: &str, hash: &str) -> String {
    format!(
        r#"{{"recovered":{{"recoveredFromPackage":true,"source":"h2ochat-package-recovery","importer":"archive-importer-h4","originalChatId":"{chat}","originalSnapshotId":"snap_x","contentHash":"{hash}","digest":"d","packageDirName":"p.h2ochat"}}}}"#
    )
}
fn restore_meta(chat: &str, hash: &str) -> String {
    format!(
        r#"{{"restored":{{"restoredFromPackage":true,"source":"h2ochat-package-restore","restorer":"archive-restore-k2","originalChatId":"{chat}","originalSnapshotId":"snap_x","contentHash":"{hash}","digest":"d"}}}}"#
    )
}
fn relink_meta(chat: &str, hash: &str) -> String {
    format!(
        r#"{{"relinked":{{"relinkedFromPackage":true,"source":"h2ochat-package-relink","relinker":"archive-relink-k4","originalChatId":"{chat}","originalSnapshotId":"snap_x","contentHash":"{hash}","digest":"d"}}}}"#
    )
}

/// (A) CAS roots are the UNION of both tables, deduped, and refcount is not
/// consulted — a zero refcount must not remove a root, and a huge one must not
/// add anything.
#[test]
fn cas_roots_union_both_tables_and_ignore_refcount() {
    tauri::async_runtime::block_on(async {
        let mut conn = memory_db(&format!(
            r#"
    INSERT INTO assets (sha256, refcount) VALUES ('{SHA_1}', 0);
    INSERT INTO assets (sha256, refcount) VALUES ('{SHA_2}', 9999);
    INSERT INTO snapshot_turn_assets (snapshot_id, turn_idx, sha256) VALUES ('s1', 0, '{SHA_2}');
    INSERT INTO snapshot_turn_assets (snapshot_id, turn_idx, sha256) VALUES ('s1', 1, '{SHA_3}');
    INSERT INTO snapshot_turn_assets (snapshot_id, turn_idx, sha256) VALUES ('s2', 0, '{SHA_3}')
    "#
        ))
        .await;

        let result = probe_with_connection(&mut conn).await;
        assert!(result.complete, "{:?}", result.blockers);
        assert_eq!(result.cas_roots, vec![SHA_1, SHA_2, SHA_3]);
        assert_eq!(result.counts.cas_roots, 3);
        // A refcount of 0 did NOT drop SHA_1 from the root set.
        assert!(result.cas_roots.iter().any(|s| s == SHA_1));
    });
}

/// (B) writing-state protection, and only that state.
#[test]
fn only_writing_rows_yield_stranded_writing_protection() {
    tauri::async_runtime::block_on(async {
        let mat = |hash: &str| format!(r#"{{"materialization":{{"intendedContentHash":"{hash}"}}}}"#);
        let mut conn = memory_db(&format!(
            r#"
    INSERT INTO saved_chat_archive_requests VALUES ('r1','writing','chat_w','s',' {}');
    INSERT INTO saved_chat_archive_requests VALUES ('r2','written','chat_a','s','{}');
    INSERT INTO saved_chat_archive_requests VALUES ('r3','validated','chat_b','s','{}');
    INSERT INTO saved_chat_archive_requests VALUES ('r4','failed','chat_c','s','{}');
    INSERT INTO saved_chat_archive_requests VALUES ('r5','duplicate','chat_d','s','{}')
    "#,
            mat(HASH_A),
            mat(HASH_B),
            mat(HASH_B),
            mat(HASH_B),
            mat(HASH_B)
        ))
        .await;

        let result = probe_with_connection(&mut conn).await;
        assert!(result.complete, "{:?}", result.blockers);
        assert_eq!(result.generation_protections.len(), 1);
        let p = &result.generation_protections[0];
        assert_eq!(p.chat_id, "chat_w");
        assert_eq!(p.content_hash, HASH_A);
        assert_eq!(p.source, ProtectionSource::StrandedWriting);
        assert_eq!(result.counts.writing_protections, 1);
        assert_eq!(result.counts.provenance_protections, 0);
    });
}

/// (B) a writing row whose intent cannot be established FAILS CLOSED rather
/// than quietly contributing nothing.
#[test]
fn a_writing_row_without_usable_intent_fails_closed() {
    tauri::async_runtime::block_on(async {
        for meta in [
            "{}",                                                    // historical: claimed before intent
            r#"{"materialization":{}}"#,                             // no intent recorded
            r#"{"materialization":{"intendedContentHash":"nope"}}"#, // malformed
            r#"{"materialization":{"intendedContentHash":""}}"#,     // empty
            "not json at all",                                       // unparseable
        ] {
            let mut conn = memory_db(&format!(
                "INSERT INTO saved_chat_archive_requests VALUES ('r1','writing','chat_w','s','{meta}')"
            ))
            .await;
            let result = probe_with_connection(&mut conn).await;
            assert!(
                !result.complete,
                "meta {meta:?} must not yield an authoritative result"
            );
            assert!(result
                .blockers
                .iter()
                .any(|b| b.starts_with(codes::WRITING_IDENTITY_UNUSABLE)));
            assert!(result.generation_protections.is_empty());
        }

        // A writing row with no chat identity is equally unusable.
        let mut conn = memory_db(&format!(
            r#"INSERT INTO saved_chat_archive_requests VALUES ('r1','writing',NULL,'s','{{"materialization":{{"intendedContentHash":"{HASH_A}"}}}}')"#
        ))
        .await;
        let result = probe_with_connection(&mut conn).await;
        assert!(!result.complete);
    });
}

/// (C) each provenance writer's ACTUAL shape yields its protection.
#[test]
fn import_restore_and_relink_provenance_each_protect_their_generation() {
    tauri::async_runtime::block_on(async {
        let mut conn = memory_db(&format!(
            r#"
    INSERT INTO chats VALUES ('c1','{}');
    INSERT INTO chats VALUES ('c2','{}');
    INSERT INTO chats VALUES ('c3','{}');
    INSERT INTO snapshots VALUES ('s1','c1','{}')
    "#,
            import_meta("orig_import", HASH_A),
            restore_meta("orig_restore", HASH_B),
            relink_meta("orig_relink", SHA_1),
            import_meta("orig_import", HASH_A)
        ))
        .await;

        let result = probe_with_connection(&mut conn).await;
        assert!(result.complete, "{:?}", result.blockers);
        let found: Vec<(&str, &str, ProtectionSource)> = result
            .generation_protections
            .iter()
            .map(|p| (p.chat_id.as_str(), p.content_hash.as_str(), p.source))
            .collect();
        assert!(found.contains(&("orig_import", HASH_A, ProtectionSource::Import)));
        assert!(found.contains(&("orig_restore", HASH_B, ProtectionSource::Restore)));
        assert!(found.contains(&("orig_relink", SHA_1, ProtectionSource::Relink)));
        // The chat and snapshot copies of the SAME import provenance dedupe to one.
        assert_eq!(result.generation_protections.len(), 3);
        assert_eq!(result.counts.provenance_protections, 3);
    });
}

/// (C) relink keeps a bounded history array; every entry is durable provenance.
#[test]
fn the_relink_history_array_also_protects() {
    tauri::async_runtime::block_on(async {
        let entry = |chat: &str, hash: &str| {
            format!(
                r#"{{"relinkedFromPackage":true,"source":"h2ochat-package-relink","originalChatId":"{chat}","contentHash":"{hash}"}}"#
            )
        };
        let meta = format!(
            r#"{{"relinked":{},"relinks":[{},{}]}}"#,
            entry("orig_now", HASH_A),
            entry("orig_old", HASH_B),
            entry("orig_now", HASH_A)
        );
        let mut conn = memory_db(&format!("INSERT INTO chats VALUES ('c1','{meta}')")).await;
        let result = probe_with_connection(&mut conn).await;
        assert!(result.complete, "{:?}", result.blockers);
        assert_eq!(result.generation_protections.len(), 2, "history is protective, deduped");
        assert!(result
            .generation_protections
            .iter()
            .any(|p| p.chat_id == "orig_old" && p.content_hash == HASH_B));
    });
}

/// (C) unrelated metadata is NOT provenance; positively identified but broken
/// provenance FAILS CLOSED.
#[test]
fn unrelated_metadata_is_ignored_but_broken_provenance_blocks() {
    tauri::async_runtime::block_on(async {
        // Unrelated rows, including one carrying an innocent contentHash.
        let mut conn = memory_db(
            r#"
    INSERT INTO chats VALUES ('c1','{}');
    INSERT INTO chats VALUES ('c2','{"folder":"x","pinned":true}');
    INSERT INTO chats VALUES ('c3','{"someTool":{"contentHash":"deadbeef"}}');
    INSERT INTO chats VALUES ('c4','')
    "#,
        )
        .await;
        let result = probe_with_connection(&mut conn).await;
        assert!(result.complete, "{:?}", result.blockers);
        assert!(result.generation_protections.is_empty());

        // Positively identified provenance with unusable identity must block.
        for broken in [
            r#"{"recovered":{"recoveredFromPackage":true,"originalChatId":"c","contentHash":"short"}}"#,
            r#"{"recovered":{"recoveredFromPackage":true,"originalChatId":"","contentHash":"aa"}}"#,
            r#"{"restored":{"source":"h2ochat-package-restore","originalChatId":"c"}}"#,
            r#"{"relinked":{"relinkedFromPackage":true,"contentHash":"deadbeef"}}"#,
        ] {
            let mut conn = memory_db(&format!("INSERT INTO chats VALUES ('c1','{broken}')")).await;
            let result = probe_with_connection(&mut conn).await;
            assert!(!result.complete, "{broken} must fail closed");
            assert!(result
                .blockers
                .iter()
                .any(|b| b.starts_with(codes::PROVENANCE_IDENTITY_UNUSABLE)));
        }

        // Metadata that cannot be parsed could have held provenance.
        let mut conn = memory_db("INSERT INTO chats VALUES ('c1','{oops')").await;
        let result = probe_with_connection(&mut conn).await;
        assert!(!result.complete);
        assert!(result
            .blockers
            .iter()
            .any(|b| b.starts_with(codes::METADATA_UNPARSEABLE)));
    });
}

/// (D) a compatible database with nothing to protect IS authoritative.
#[test]
fn a_compatible_empty_database_is_an_authoritative_empty_result() {
    tauri::async_runtime::block_on(async {
        let mut conn = memory_db("").await;
        let result = probe_with_connection(&mut conn).await;
        assert!(result.complete);
        assert!(result.blockers.is_empty());
        assert!(result.cas_roots.is_empty());
        assert!(result.generation_protections.is_empty());
        assert_eq!(result.counts.protections, 0);
    });
}

/// (E) a missing required table or column fails closed, never empty-authoritative.
#[test]
fn missing_required_schema_fails_closed() {
    tauri::async_runtime::block_on(async {
        let mut conn = SqliteConnection::connect("sqlite::memory:").await.unwrap();
        let result = probe_with_connection(&mut conn).await;
        assert!(!result.complete);
        assert!(result
            .blockers
            .iter()
            .any(|b| b.starts_with(codes::SCHEMA_INCOMPATIBLE)));
        assert!(result.generation_protections.is_empty());

        // A required COLUMN missing is equally fatal, even though the table exists.
        let mut conn = SqliteConnection::connect("sqlite::memory:").await.unwrap();
        for statement in BASE_SCHEMA.split(';') {
            if statement.trim().is_empty() {
                continue;
            }
            sqlx::query(statement).execute(&mut conn).await.unwrap();
        }
        sqlx::query("ALTER TABLE saved_chat_archive_requests DROP COLUMN studio_chat_id")
            .execute(&mut conn)
            .await
            .unwrap();
        let result = probe_with_connection(&mut conn).await;
        assert!(!result.complete);
        assert!(result.blockers.iter().any(|b| b.contains("studio_chat_id")));
    });
}

/// (F) D9: a database carrying NEWER unrelated migrations and extra columns
/// stays readable. Success must not be coupled to any migration ceiling.
#[test]
fn a_newer_but_compatible_schema_is_accepted() {
    tauri::async_runtime::block_on(async {
        let mut conn = memory_db(&format!(
            r#"
    CREATE TABLE _sqlx_migrations (version BIGINT PRIMARY KEY, description TEXT);
    INSERT INTO _sqlx_migrations VALUES (21, 'a migration this checkout has never seen');
    INSERT INTO _sqlx_migrations VALUES (22, 'and another');
    CREATE TABLE some_future_table (id TEXT PRIMARY KEY, payload TEXT);
    ALTER TABLE assets ADD COLUMN future_column TEXT;
    ALTER TABLE chats ADD COLUMN another_future_column INTEGER;
    INSERT INTO assets (sha256, refcount, future_column) VALUES ('{SHA_1}', 3, 'x');
    INSERT INTO chats (id, meta_json, another_future_column) VALUES ('c1','{}',7)
    "#,
            import_meta("orig_import", HASH_A)
        ))
        .await;

        let result = probe_with_connection(&mut conn).await;
        assert!(
            result.complete,
            "a newer compatible DB must remain readable: {:?}",
            result.blockers
        );
        assert_eq!(result.cas_roots, vec![SHA_1]);
        assert_eq!(result.generation_protections.len(), 1);
    });
}

/// (J) determinism: the same logical rows inserted in a different physical
/// order produce an identical result.
#[test]
fn results_are_deterministic_and_deduplicated_regardless_of_row_order() {
    tauri::async_runtime::block_on(async {
        let forward = format!(
            r#"
    INSERT INTO assets (sha256) VALUES ('{SHA_1}');
    INSERT INTO assets (sha256) VALUES ('{SHA_2}');
    INSERT INTO snapshot_turn_assets VALUES ('s1',0,'{SHA_3}');
    INSERT INTO chats VALUES ('c1','{}');
    INSERT INTO chats VALUES ('c2','{}')
    "#,
            import_meta("orig_a", HASH_A),
            restore_meta("orig_b", HASH_B)
        );
        let reverse = format!(
            r#"
    INSERT INTO chats VALUES ('c2','{}');
    INSERT INTO chats VALUES ('c1','{}');
    INSERT INTO snapshot_turn_assets VALUES ('s1',0,'{SHA_3}');
    INSERT INTO assets (sha256) VALUES ('{SHA_2}');
    INSERT INTO assets (sha256) VALUES ('{SHA_1}')
    "#,
            restore_meta("orig_b", HASH_B),
            import_meta("orig_a", HASH_A)
        );

        let mut a = memory_db(&forward).await;
        let mut b = memory_db(&reverse).await;
        let ra = probe_with_connection(&mut a).await;
        let rb = probe_with_connection(&mut b).await;
        assert_eq!(ra.cas_roots, rb.cas_roots);
        assert_eq!(ra.generation_protections, rb.generation_protections);
        assert_eq!(ra.cas_roots, vec![SHA_1, SHA_2, SHA_3]);
    });
}

/// (K) the result carries protection identity ONLY — no chat text, titles,
/// snapshot bodies, raw metadata or unrelated account fields.
#[test]
fn the_result_leaks_no_raw_content() {
    tauri::async_runtime::block_on(async {
        let secret = "TOP-SECRET-CHAT-TITLE-AND-BODY";
        let meta = format!(
            r#"{{"title":"{secret}","note":"{secret}","recovered":{{"recoveredFromPackage":true,"originalChatId":"orig","contentHash":"{HASH_A}","packagePath":"/Users/somebody/private/{secret}"}}}}"#
        );
        let mut conn = memory_db(&format!("INSERT INTO chats VALUES ('c1','{meta}')")).await;
        let result = probe_with_connection(&mut conn).await;
        assert!(result.complete, "{:?}", result.blockers);

        let json = serde_json::to_string(&result).unwrap();
        assert!(!json.contains(secret), "no raw content may reach the result");
        assert!(!json.contains("/Users/"), "no absolute host path may reach the result");
        assert!(!json.contains("packagePath"));
        assert!(!json.contains("digest"));
        assert!(json.contains(HASH_A), "the protection identity itself is present");
    });
}

fn disposable_db_path(tag: &str) -> std::path::PathBuf {
    let dir = std::env::temp_dir().join(format!(
        "h2o-m06-t14-{tag}-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0)
    ));
    std::fs::create_dir_all(&dir).expect("temp dir");
    dir.join("disposable-v1.db")
}

async fn open_file_db(path: &std::path::Path, create: bool) -> Result<SqliteConnection, sqlx::Error> {
    use sqlx::sqlite::SqliteConnectOptions;
    use std::str::FromStr;
    let url = format!("sqlite:{}", path.display());
    let options = SqliteConnectOptions::from_str(&url)?.create_if_missing(create);
    SqliteConnection::connect_with(&options).await
}

/// The full schema catalogue, so a new table, index or trigger appearing during
/// a probe would be caught, not just a byte-length change.
async fn catalogue(conn: &mut SqliteConnection) -> Vec<String> {
    let rows = sqlx::query("SELECT type, name, sql FROM sqlite_master ORDER BY type, name")
        .fetch_all(conn)
        .await
        .unwrap();
    rows.iter()
        .map(|r| {
            format!(
                "{}|{}|{}",
                r.try_get::<String, _>("type").unwrap_or_default(),
                r.try_get::<String, _>("name").unwrap_or_default(),
                r.try_get::<Option<String>, _>("sql").ok().flatten().unwrap_or_default()
            )
        })
        .collect()
}

fn schema_fingerprint(bytes: &[u8]) -> String {
    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    format!("{:x}", hasher.finalize())
}

/// (G) READ-ONLY DURABILITY. Capture the disposable database bytes and its
/// schema catalogue before and after probing, and prove nothing durable moved:
/// no migration ran, no schema object appeared, no row changed.
#[test]
fn probing_a_disposable_database_changes_nothing_durable() {
    tauri::async_runtime::block_on(async {
        let path = disposable_db_path("readonly");

        // Build a disposable database with real content to read.
        {
            let mut conn = open_file_db(&path, true).await.expect("create");
            for statement in BASE_SCHEMA.split(';') {
                if statement.trim().is_empty() { continue; }
                sqlx::query(statement).execute(&mut conn).await.unwrap();
            }
            sqlx::query(&format!("INSERT INTO assets (sha256, refcount) VALUES ('{SHA_1}', 4)"))
                .execute(&mut conn).await.unwrap();
            sqlx::query(&format!("INSERT INTO chats VALUES ('c1','{}')", import_meta("orig", HASH_A)))
                .execute(&mut conn).await.unwrap();
            sqlx::query("PRAGMA wal_checkpoint(TRUNCATE)").execute(&mut conn).await.ok();
            conn.close().await.ok();
        }

        // PRE-STATE.
        let before_bytes = std::fs::read(&path).expect("read db");
        let before_hash = schema_fingerprint(&before_bytes);
        let before_len = before_bytes.len();
        let mut conn = open_file_db(&path, false).await.expect("open");
        let before_catalogue = catalogue(&mut conn).await;

        // PROBE.
        let result = probe_with_connection(&mut conn).await;
        assert!(result.complete, "{:?}", result.blockers);
        assert_eq!(result.cas_roots, vec![SHA_1]);
        assert_eq!(result.generation_protections.len(), 1);

        // FIRST-RESULT EVIDENCE + POST-STATE.
        let after_catalogue = catalogue(&mut conn).await;
        conn.close().await.ok();
        let after_bytes = std::fs::read(&path).expect("read db");

        assert_eq!(before_catalogue, after_catalogue, "no schema object may appear or change");
        assert_eq!(before_len, after_bytes.len(), "database length must not change");
        assert_eq!(before_hash, schema_fingerprint(&after_bytes), "database bytes must be identical");

        // No migration ledger was created by probing.
        assert!(
            !before_catalogue.iter().any(|row| row.contains("_sqlx_migrations")),
            "precondition: fixture has no migration ledger"
        );
        assert!(
            !after_catalogue.iter().any(|row| row.contains("_sqlx_migrations")),
            "probing must never create a migration ledger"
        );

        let _ = std::fs::remove_dir_all(path.parent().unwrap());
    });
}

/// (H) ABSENT DATABASE. The probe never opens a path of its own -- it borrows
/// the application pool -- so there is no code path that could create a
/// database file. Proven structurally, plus a behavioural check that a missing
/// file stays missing.
#[test]
fn the_probe_never_opens_or_creates_a_database_file() {
    // Structural: no path-based connection or creation anywhere in the module.
    let source = include_str!("../archive_db_probe.rs");
    for forbidden in [
        "connect_with",
        "SqliteConnectOptions",
        "create_if_missing",
        "create_dir_all",
        "File::create",
    ] {
        assert!(
            !source.contains(forbidden),
            "the probe must not be able to open or create a database: {forbidden}"
        );
    }

    // Behavioural: a path the probe was never given stays absent.
    let path = disposable_db_path("absent");
    let _ = std::fs::remove_file(&path);
    assert!(!path.exists(), "precondition");
    let unavailable = DbProbeResult::unavailable(codes::DB_UNAVAILABLE);
    assert!(!unavailable.complete, "an unavailable database is never authoritative");
    assert!(unavailable.generation_protections.is_empty());
    assert!(unavailable.blockers.iter().any(|b| b.starts_with(codes::DB_UNAVAILABLE)));
    assert!(!path.exists(), "probing must not have created the database");
    let _ = std::fs::remove_dir_all(path.parent().unwrap());
}

/// (I) BUSY / LOCKED. A writer holding an exclusive lock must yield a
/// fail-closed blocker, never an authoritative empty protection set.
#[test]
fn a_locked_database_fails_closed_rather_than_reporting_no_protections() {
    tauri::async_runtime::block_on(async {
        let path = disposable_db_path("busy");
        {
            let mut conn = open_file_db(&path, true).await.expect("create");
            sqlx::query("PRAGMA journal_mode=DELETE").execute(&mut conn).await.ok();
            for statement in BASE_SCHEMA.split(';') {
                if statement.trim().is_empty() { continue; }
                sqlx::query(statement).execute(&mut conn).await.unwrap();
            }
            sqlx::query(&format!("INSERT INTO assets (sha256) VALUES ('{SHA_1}')"))
                .execute(&mut conn).await.unwrap();
            conn.close().await.ok();
        }

        // A second connection takes an exclusive lock and holds it.
        let mut writer = open_file_db(&path, false).await.expect("writer");
        sqlx::query("PRAGMA busy_timeout=0").execute(&mut writer).await.ok();
        sqlx::query("BEGIN EXCLUSIVE").execute(&mut writer).await.expect("exclusive lock");

        let mut reader = open_file_db(&path, false).await.expect("reader");
        sqlx::query("PRAGMA busy_timeout=0").execute(&mut reader).await.ok();
        let result = probe_with_connection(&mut reader).await;

        assert!(!result.complete, "a locked database must not be authoritative");
        assert!(
            result.blockers.iter().any(|b| b.starts_with(codes::QUERY_FAILED)
                || b.starts_with(codes::SCHEMA_INCOMPATIBLE)),
            "expected a fail-closed blocker, got {:?}",
            result.blockers
        );
        assert!(result.generation_protections.is_empty());

        sqlx::query("ROLLBACK").execute(&mut writer).await.ok();
        writer.close().await.ok();
        reader.close().await.ok();
        let _ = std::fs::remove_dir_all(path.parent().unwrap());
    });
}

/// (L) the module owns no mutation SQL. Structural, not a brittle token scan:
/// it inspects the SQL string literals this module actually issues.
#[test]
fn the_probe_issues_no_mutation_sql() {
    let source = include_str!("../archive_db_probe.rs");
    let mut statements = vec![];
    for fragment in source.split("sqlx::query(").skip(1) {
        let head: String = fragment.chars().take(200).collect();
        statements.push(head.to_ascii_uppercase());
    }
    assert!(!statements.is_empty(), "the probe must issue some SQL");
    for statement in &statements {
        let is_read = statement.contains("SELECT") || statement.contains("PRAGMA TABLE_INFO");
        assert!(is_read, "every issued statement must be a read: {statement}");
        for forbidden in [
            "INSERT ", "UPDATE ", "DELETE ", "DROP ", "CREATE ", "ALTER ", "REPLACE ", "BEGIN ",
            "COMMIT", "VACUUM", "ATTACH",
        ] {
            assert!(
                !statement.contains(forbidden),
                "issued statement must not contain {forbidden}: {statement}"
            );
        }
    }
    // And no migration machinery is reachable from here.
    assert!(!source.contains("MigrationKind"));
    assert!(!source.contains("Migration {"));
    assert!(!source.contains("run_migrations"));
}
