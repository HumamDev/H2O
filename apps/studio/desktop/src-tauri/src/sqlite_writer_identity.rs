use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;
use sqlx::{Connection, SqliteConnection};
use std::ffi::CString;
use std::os::raw::{c_int, c_void};
use tauri::State;
use tauri_plugin_sql::{DbInstances, DbPool};

const DB_URL: &str = "sqlite:studio-v1.db";
const FUNCTION_NAME: &str = "h2o_writer_identity";
const SETTLEMENT_IDENTITY: &str = "f15.execute-settlement-writer";
const BULK_MIGRATION_IDENTITY: &str = "f15.bulk-migration";
const DEBUG_BYPASS_IDENTITY: &str = "f15.debug-bypass";
const EMERGENCY_REPAIR_IDENTITY: &str = "f15.emergency-repair";
const DEBUG_BYPASS_TOKEN: &str = "I_UNDERSTAND_F15_DEBUG_BYPASS";
const EMERGENCY_REPAIR_TOKEN: &str = "I_UNDERSTAND_F15_EMERGENCY_REPAIR";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct F15AuthorizedSqlStatement {
    pub query: String,
    #[serde(default)]
    pub values: Vec<JsonValue>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct F15AuthorizedSqlPayload {
    pub identity: String,
    #[serde(default)]
    pub statements: Vec<F15AuthorizedSqlStatement>,
    #[serde(default)]
    pub bulk_migration_enabled: bool,
    #[serde(default)]
    pub debug_bypass_token: Option<String>,
    #[serde(default)]
    pub emergency_repair_token: Option<String>,
    #[serde(default)]
    pub reason: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct F15AuthorizedSqlResult {
    pub ok: bool,
    pub executed: bool,
    pub identity: String,
    pub statement_count: usize,
    pub rows_affected: u64,
    pub sqlite_sentinel_used: bool,
    pub audit_warning: Option<String>,
    pub blockers: Vec<String>,
    pub warnings: Vec<String>,
}

impl F15AuthorizedSqlResult {
    fn blocked(identity: &str, code: &str) -> Self {
        Self {
            ok: false,
            executed: false,
            identity: identity.to_string(),
            statement_count: 0,
            rows_affected: 0,
            sqlite_sentinel_used: false,
            audit_warning: None,
            blockers: vec![code.to_string()],
            warnings: Vec::new(),
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct F15SentinelProofResult {
    pub ok: bool,
    pub unauthorized_before_blocked: bool,
    pub authorized_write_passed: bool,
    pub unauthorized_after_clear_blocked: bool,
    pub unregistered_connection_failed_closed: bool,
    pub blockers: Vec<String>,
    pub warnings: Vec<String>,
}

struct WriterIdentityState {
    value: CString,
}

unsafe extern "C" fn writer_identity_fn(
    ctx: *mut libsqlite3_sys::sqlite3_context,
    _argc: c_int,
    _argv: *mut *mut libsqlite3_sys::sqlite3_value,
) {
    let data = libsqlite3_sys::sqlite3_user_data(ctx) as *const WriterIdentityState;
    if data.is_null() {
        libsqlite3_sys::sqlite3_result_text(ctx, b"\0".as_ptr() as *const i8, 0, libsqlite3_sys::SQLITE_TRANSIENT());
        return;
    }
    let state = &*data;
    libsqlite3_sys::sqlite3_result_text(
        ctx,
        state.value.as_ptr(),
        -1,
        libsqlite3_sys::SQLITE_TRANSIENT(),
    );
}

unsafe extern "C" fn drop_writer_identity_state(ptr: *mut c_void) {
    if !ptr.is_null() {
        let _ = Box::from_raw(ptr as *mut WriterIdentityState);
    }
}

pub async fn install_writer_identity_function(
    conn: &mut SqliteConnection,
    identity: &str,
) -> Result<(), String> {
    let function_name = CString::new(FUNCTION_NAME)
        .map_err(|_| "sqlite-writer-identity-function-name-invalid".to_string())?;
    let mut handle = conn
        .lock_handle()
        .await
        .map_err(|e| format!("sqlite-writer-identity-lock-failed:{e}"))?;
    let state = Box::new(WriterIdentityState {
        value: CString::new(identity)
            .map_err(|_| "sqlite-writer-identity-value-invalid".to_string())?,
    });
    let state_ptr = Box::into_raw(state) as *mut c_void;
    let rc = {
        unsafe {
            libsqlite3_sys::sqlite3_create_function_v2(
                handle.as_raw_handle().as_ptr(),
                function_name.as_ptr(),
                0,
                libsqlite3_sys::SQLITE_UTF8 | libsqlite3_sys::SQLITE_DETERMINISTIC,
                state_ptr,
                Some(writer_identity_fn),
                None,
                None,
                Some(drop_writer_identity_state),
            )
        }
    };
    if rc != libsqlite3_sys::SQLITE_OK {
        unsafe {
            let _ = Box::from_raw(state_ptr as *mut WriterIdentityState);
        }
        return Err(format!("sqlite-writer-identity-register-failed:{rc}"));
    }
    Ok(())
}

fn validate_identity(payload: &F15AuthorizedSqlPayload) -> Result<Option<String>, String> {
    match payload.identity.as_str() {
        SETTLEMENT_IDENTITY => Ok(None),
        BULK_MIGRATION_IDENTITY => {
            if payload.bulk_migration_enabled {
                Ok(Some("f15-bulk-migration-explicitly-enabled".to_string()))
            } else {
                Err("sqlite-writer-identity-bulk-migration-not-enabled".to_string())
            }
        }
        DEBUG_BYPASS_IDENTITY => {
            if payload.debug_bypass_token.as_deref() == Some(DEBUG_BYPASS_TOKEN) {
                Ok(Some("f15-debug-bypass-used".to_string()))
            } else {
                Err("sqlite-writer-identity-debug-bypass-not-enabled".to_string())
            }
        }
        EMERGENCY_REPAIR_IDENTITY => {
            if payload.emergency_repair_token.as_deref() == Some(EMERGENCY_REPAIR_TOKEN) {
                Ok(Some("f15-emergency-repair-used".to_string()))
            } else {
                Err("sqlite-writer-identity-emergency-repair-not-enabled".to_string())
            }
        }
        _ => Err("sqlite-writer-identity-not-allowed".to_string()),
    }
}

async fn execute_statement(
    conn: &mut SqliteConnection,
    statement: &F15AuthorizedSqlStatement,
) -> Result<u64, String> {
    if statement.query.trim().is_empty() {
        return Err("sqlite-authorized-query-empty".to_string());
    }
    let mut query = sqlx::query(&statement.query);
    for value in &statement.values {
        if value.is_null() {
            query = query.bind(None::<String>);
        } else if let Some(s) = value.as_str() {
            query = query.bind(s.to_string());
        } else if let Some(i) = value.as_i64() {
            query = query.bind(i);
        } else if let Some(u) = value.as_u64() {
            if u <= i64::MAX as u64 {
                query = query.bind(u as i64);
            } else {
                query = query.bind(u.to_string());
            }
        } else if let Some(f) = value.as_f64() {
            query = query.bind(f);
        } else if let Some(b) = value.as_bool() {
            query = query.bind(if b { 1_i64 } else { 0_i64 });
        } else {
            query = query.bind(value.to_string());
        }
    }
    let result = query
        .execute(conn)
        .await
        .map_err(|e| format!("sqlite-authorized-query-failed:{e}"))?;
    Ok(result.rows_affected())
}

async fn execute_control_sql(conn: &mut SqliteConnection, sql: &str, code: &str) -> Result<(), String> {
    sqlx::query(sql)
        .execute(conn)
        .await
        .map(|_| ())
        .map_err(|e| format!("{code}:{e}"))
}

async fn acquire_studio_sqlite_pool(
    db_instances: &State<'_, DbInstances>,
) -> Result<sqlx::Pool<sqlx::Sqlite>, String> {
    let instances = db_instances.0.read().await;
    let Some(db) = instances.get(DB_URL) else {
        return Err("sqlite-db-unavailable".to_string());
    };
    match db {
        DbPool::Sqlite(pool) => Ok(pool.clone()),
        #[allow(unreachable_patterns)]
        _ => Err("sqlite-db-unavailable".to_string()),
    }
}

#[tauri::command]
pub async fn f15_authorized_sqlite_execute(
    db_instances: State<'_, DbInstances>,
    payload: F15AuthorizedSqlPayload,
) -> Result<F15AuthorizedSqlResult, String> {
    let identity = payload.identity.trim().to_string();
    let audit_warning = match validate_identity(&payload) {
        Ok(warning) => warning,
        Err(code) => return Ok(F15AuthorizedSqlResult::blocked(&identity, &code)),
    };
    if payload.statements.is_empty() {
        return Ok(F15AuthorizedSqlResult::blocked(
            &identity,
            "sqlite-authorized-statements-required",
        ));
    }

    let pool = match acquire_studio_sqlite_pool(&db_instances).await {
        Ok(pool) => pool,
        Err(code) => return Ok(F15AuthorizedSqlResult::blocked(&identity, &code)),
    };
    let mut conn = match pool.acquire().await {
        Ok(conn) => conn,
        Err(e) => {
            return Ok(F15AuthorizedSqlResult::blocked(
                &identity,
                &format!("sqlite-db-acquire-failed:{e}"),
            ));
        }
    };

    if let Err(code) = install_writer_identity_function(&mut *conn, &identity).await {
        return Ok(F15AuthorizedSqlResult::blocked(&identity, &code));
    }

    let mut rows_affected = 0_u64;
    if let Err(code) = execute_control_sql(&mut *conn, "BEGIN IMMEDIATE", "sqlite-authorized-transaction-begin-failed").await {
        let _ = install_writer_identity_function(&mut *conn, "").await;
        return Ok(F15AuthorizedSqlResult::blocked(
            &identity,
            &code,
        ));
    }

    for statement in &payload.statements {
        match execute_statement(&mut *conn, statement).await {
            Ok(rows) => rows_affected += rows,
            Err(code) => {
                let _ = install_writer_identity_function(&mut *conn, "").await;
                let _ = execute_control_sql(&mut *conn, "ROLLBACK", "sqlite-authorized-transaction-rollback-failed").await;
                return Ok(F15AuthorizedSqlResult::blocked(&identity, &code));
            }
        }
    }

    if let Err(code) = install_writer_identity_function(&mut *conn, "").await {
        let _ = execute_control_sql(&mut *conn, "ROLLBACK", "sqlite-authorized-transaction-rollback-failed").await;
        return Ok(F15AuthorizedSqlResult::blocked(&identity, &code));
    }

    if let Err(code) = execute_control_sql(&mut *conn, "COMMIT", "sqlite-authorized-transaction-commit-failed").await {
        let _ = execute_control_sql(&mut *conn, "ROLLBACK", "sqlite-authorized-transaction-rollback-failed").await;
        return Ok(F15AuthorizedSqlResult::blocked(
            &identity,
            &code,
        ));
    }

    Ok(F15AuthorizedSqlResult {
        ok: true,
        executed: true,
        identity,
        statement_count: payload.statements.len(),
        rows_affected,
        sqlite_sentinel_used: true,
        audit_warning,
        blockers: Vec::new(),
        warnings: Vec::new(),
    })
}

async fn probe_insert(conn: &mut SqliteConnection, id: &str) -> bool {
    sqlx::query("INSERT INTO protected_test(id, value) VALUES (?, ?)")
        .bind(id)
        .bind("value")
        .execute(conn)
        .await
        .is_ok()
}

#[tauri::command]
pub async fn f15_prove_sqlite_writer_identity_sentinel() -> Result<F15SentinelProofResult, String> {
    let mut blockers = Vec::new();
    let mut warnings = Vec::new();
    let mut conn = SqliteConnection::connect("sqlite::memory:")
        .await
        .map_err(|e| format!("sqlite-sentinel-proof-open-failed:{e}"))?;
    sqlx::query("CREATE TABLE protected_test(id TEXT PRIMARY KEY, value TEXT)")
        .execute(&mut conn)
        .await
        .map_err(|e| format!("sqlite-sentinel-proof-schema-failed:{e}"))?;
    sqlx::query(
        r#"
        CREATE TRIGGER f15_protect_test_insert
        BEFORE INSERT ON protected_test
        BEGIN
          SELECT CASE
            WHEN COALESCE(h2o_writer_identity(), '') != 'f15.execute-settlement-writer'
            THEN RAISE(ABORT, 'f15-store-write-protected:protected_test')
          END;
        END
        "#,
    )
    .execute(&mut conn)
    .await
    .map_err(|e| format!("sqlite-sentinel-proof-trigger-failed:{e}"))?;

    install_writer_identity_function(&mut conn, "").await?;
    let unauthorized_before_blocked = !probe_insert(&mut conn, "unauthorized-before").await;
    install_writer_identity_function(&mut conn, SETTLEMENT_IDENTITY).await?;
    let authorized_write_passed = probe_insert(&mut conn, "authorized").await;
    install_writer_identity_function(&mut conn, "").await?;
    let unauthorized_after_clear_blocked = !probe_insert(&mut conn, "unauthorized-after").await;

    let mut other = SqliteConnection::connect("sqlite::memory:")
        .await
        .map_err(|e| format!("sqlite-sentinel-proof-open-failed:{e}"))?;
    sqlx::query("CREATE TABLE protected_test(id TEXT PRIMARY KEY, value TEXT)")
        .execute(&mut other)
        .await
        .map_err(|e| format!("sqlite-sentinel-proof-schema-failed:{e}"))?;
    sqlx::query(
        r#"
        CREATE TRIGGER f15_protect_test_insert
        BEFORE INSERT ON protected_test
        BEGIN
          SELECT CASE
            WHEN COALESCE(h2o_writer_identity(), '') != 'f15.execute-settlement-writer'
            THEN RAISE(ABORT, 'f15-store-write-protected:protected_test')
          END;
        END
        "#,
    )
    .execute(&mut other)
    .await
    .map_err(|e| format!("sqlite-sentinel-proof-trigger-failed:{e}"))?;
    let unregistered_connection_failed_closed = !probe_insert(&mut other, "unregistered").await;

    if !unauthorized_before_blocked {
        blockers.push("sqlite-sentinel-proof-unauthorized-before-passed".to_string());
    }
    if !authorized_write_passed {
        blockers.push("sqlite-sentinel-proof-authorized-blocked".to_string());
    }
    if !unauthorized_after_clear_blocked {
        blockers.push("sqlite-sentinel-proof-unauthorized-after-passed".to_string());
    }
    if !unregistered_connection_failed_closed {
        blockers.push("sqlite-sentinel-proof-unregistered-passed".to_string());
    }
    if blockers.is_empty() {
        warnings.push("sqlite-sentinel-proof-in-memory-only".to_string());
    }

    Ok(F15SentinelProofResult {
        ok: blockers.is_empty(),
        unauthorized_before_blocked,
        authorized_write_passed,
        unauthorized_after_clear_blocked,
        unregistered_connection_failed_closed,
        blockers,
        warnings,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn payload(identity: &str) -> F15AuthorizedSqlPayload {
        F15AuthorizedSqlPayload {
            identity: identity.to_string(),
            statements: Vec::new(),
            bulk_migration_enabled: false,
            debug_bypass_token: None,
            emergency_repair_token: None,
            reason: None,
        }
    }

    #[test]
    fn writer_identity_sentinel_blocks_and_allows() {
        let result = tauri::async_runtime::block_on(f15_prove_sqlite_writer_identity_sentinel())
            .expect("sentinel proof should run");
        assert!(result.ok, "sentinel proof blockers: {:?}", result.blockers);
        assert!(result.unauthorized_before_blocked);
        assert!(result.authorized_write_passed);
        assert!(result.unauthorized_after_clear_blocked);
        assert!(result.unregistered_connection_failed_closed);
    }

    #[test]
    fn writer_identity_requires_explicit_bypass_enablement() {
        assert!(validate_identity(&payload(SETTLEMENT_IDENTITY)).unwrap().is_none());

        let mut bulk = payload(BULK_MIGRATION_IDENTITY);
        assert_eq!(
            validate_identity(&bulk).unwrap_err(),
            "sqlite-writer-identity-bulk-migration-not-enabled"
        );
        bulk.bulk_migration_enabled = true;
        assert_eq!(
            validate_identity(&bulk).unwrap().as_deref(),
            Some("f15-bulk-migration-explicitly-enabled")
        );

        let mut debug = payload(DEBUG_BYPASS_IDENTITY);
        assert_eq!(
            validate_identity(&debug).unwrap_err(),
            "sqlite-writer-identity-debug-bypass-not-enabled"
        );
        debug.debug_bypass_token = Some(DEBUG_BYPASS_TOKEN.to_string());
        assert_eq!(
            validate_identity(&debug).unwrap().as_deref(),
            Some("f15-debug-bypass-used")
        );

        let mut emergency = payload(EMERGENCY_REPAIR_IDENTITY);
        assert_eq!(
            validate_identity(&emergency).unwrap_err(),
            "sqlite-writer-identity-emergency-repair-not-enabled"
        );
        emergency.emergency_repair_token = Some(EMERGENCY_REPAIR_TOKEN.to_string());
        assert_eq!(
            validate_identity(&emergency).unwrap().as_deref(),
            Some("f15-emergency-repair-used")
        );
    }
}
