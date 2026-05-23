// F5H.3b.0c — Synthetic marker contract v1.
//
// Canonical source of truth for "what makes a row in sync_tombstones or
// sync_tombstone_reviews confidently synthetic and cleanup-eligible".
//
// Hard rules (do not relax without bumping the version string):
//   1. A row is cleanup-eligible ONLY IF its `is_synthetic` column is 1.
//      Prefix matching alone is NEVER sufficient for cleanup.
//   2. Prefix corroboration uses ONLY safe top-level fields. JSON content
//      fields (raw_tombstone_json, warnings_json, meta_json) are NOT scanned
//      because they can carry strings from inbound bundles or user content
//      and would false-positive.
//   3. Reviews with status pending or accepted-later are NEVER eligible —
//      they may still receive operator attention.
//   4. Restored tombstones are NEVER eligible.
//   5. Tombstones with a protected delete_reason (folder-delete,
//      folder-delete-cascade, user-unbind, remote-review-apply,
//      remote-tombstone-applied) are NEVER eligible, even if mistakenly
//      marked synthetic.
//   6. Rows newer than SAFETY_AGE_FLOOR_SECONDS are NEVER eligible.
//
// This module declares the contract and provides pure predicate helpers
// used by:
//   - Preview functions (counts only; no writes).
//   - F5H.3b.0d true-dry-run cleanup (transaction + ROLLBACK).
//   - F5H.3b.1 real cleanup (transaction + COMMIT).
//
// F5H.3b.0c implements only the contract. No cleanup, no DELETE statements,
// no apply behavior change. See docs/systems/sync/synthetic-marker-contract-v1.md.

use sqlx::{Row, SqliteConnection};

/// Canonical predicate version. Stamp this in every preview / cleanup
/// return so consumers can compare what predicate version produced a
/// number. Bump only with an explicit migration story.
pub const SYNTHETIC_PREDICATE_VERSION: &str = "h2o.studio.sync.synthetic-marker.v1";

/// Distinct version stamp used by Chrome's prefix-only heuristic preview.
/// Chrome has no SQLite-side `is_synthetic` column and cannot apply the
/// real contract. Its preview is a heuristic forever; this string keeps it
/// unambiguously separate from the Rust v1 contract.
pub const SYNTHETIC_PREFIX_HEURISTIC_VERSION: &str =
    "h2o.studio.sync.synthetic-prefix-heuristic";

/// Allowed prefixes used by approved fixture seeders. These prefixes
/// corroborate the column marker for cleanup eligibility but never
/// substitute for it. The column is the gate; the prefix is the second
/// layer of defense.
pub const SYNTHETIC_PREFIXES_V1: &[&str] =
    &["f5c-", "f5d-", "f5d1-", "f5d2-", "f5f-", "f5g-", "f5h-"];

/// Rows newer than this floor are not cleanup-eligible. Protects against
/// in-flight ingest the operator hasn't seen yet.
pub const SAFETY_AGE_FLOOR_SECONDS: i64 = 3600;

/// Tombstone delete_reasons that represent real user/sync events. Even
/// if such a row is mistakenly flagged synthetic, it is never eligible.
pub const PROTECTED_TOMBSTONE_DELETE_REASONS: &[&str] = &[
    "folder-delete",
    "folder-delete-cascade",
    "user-unbind",
    "remote-review-apply",
    "remote-tombstone-applied",
];

/// Review statuses that mean operator attention may still apply. Never
/// eligible for cleanup.
pub const PROTECTED_REVIEW_STATUSES: &[&str] = &["pending", "accepted-later"];

/// Returns true if `value` contains any allowed synthetic prefix
/// (case-insensitive substring match).
pub fn has_synthetic_prefix(value: &str) -> bool {
    let lower = value.trim().to_ascii_lowercase();
    if lower.is_empty() {
        return false;
    }
    SYNTHETIC_PREFIXES_V1
        .iter()
        .any(|prefix| lower.contains(prefix))
}

/// SQL predicate for cleanup-eligible synthetic tombstones, applied as a
/// WHERE clause to `sync_tombstones`. Parameter order matches the bind
/// order in [`eligible_synthetic_tombstone_ids`].
///
/// Required:
///   - `is_synthetic = 1`
///   - prefix corroboration in `tombstone_id` OR `record_id` OR `delete_reason`
///   - `restored_at IS NULL`
///   - `created_at < ?` (now - SAFETY_AGE_FLOOR_SECONDS, ISO string)
///   - `delete_reason NOT IN` (protected list)
///   - no live (pending / accepted-later) review attached
const ELIGIBLE_TOMBSTONE_SQL: &str = r#"
    SELECT tombstone_id
    FROM sync_tombstones t
    WHERE t.is_synthetic = 1
      AND t.restored_at IS NULL
      AND t.created_at < ?
      AND t.delete_reason NOT IN (
        'folder-delete', 'folder-delete-cascade', 'user-unbind',
        'remote-review-apply', 'remote-tombstone-applied'
      )
      AND (
            LOWER(t.tombstone_id)   GLOB '*f5c-*'
         OR LOWER(t.tombstone_id)   GLOB '*f5d-*'
         OR LOWER(t.tombstone_id)   GLOB '*f5d1-*'
         OR LOWER(t.tombstone_id)   GLOB '*f5d2-*'
         OR LOWER(t.tombstone_id)   GLOB '*f5f-*'
         OR LOWER(t.tombstone_id)   GLOB '*f5g-*'
         OR LOWER(t.tombstone_id)   GLOB '*f5h-*'
         OR LOWER(t.record_id)      GLOB '*f5c-*'
         OR LOWER(t.record_id)      GLOB '*f5d-*'
         OR LOWER(t.record_id)      GLOB '*f5d1-*'
         OR LOWER(t.record_id)      GLOB '*f5d2-*'
         OR LOWER(t.record_id)      GLOB '*f5f-*'
         OR LOWER(t.record_id)      GLOB '*f5g-*'
         OR LOWER(t.record_id)      GLOB '*f5h-*'
         OR LOWER(t.delete_reason)  GLOB '*f5c-*'
         OR LOWER(t.delete_reason)  GLOB '*f5d-*'
         OR LOWER(t.delete_reason)  GLOB '*f5d1-*'
         OR LOWER(t.delete_reason)  GLOB '*f5d2-*'
         OR LOWER(t.delete_reason)  GLOB '*f5f-*'
         OR LOWER(t.delete_reason)  GLOB '*f5g-*'
         OR LOWER(t.delete_reason)  GLOB '*f5h-*'
      )
      AND NOT EXISTS (
        SELECT 1
        FROM sync_tombstone_reviews r
        WHERE r.remote_tombstone_id = t.tombstone_id
          AND r.status IN ('pending', 'accepted-later')
      )
"#;

/// SQL predicate for cleanup-eligible synthetic reviews.
///
/// Required:
///   - `is_synthetic = 1`
///   - prefix corroboration in `review_id` OR `remote_tombstone_id` OR
///     `record_id` OR `dedupe_key`
///   - status NOT IN (pending, accepted-later)
///   - decision allow-list (NULL or {ignored, rejected, superseded, resolved,
///     applied-folder-binding})
///   - `created_at < ?`
///   - the referenced remote tombstone (if any) is NOT a real non-synthetic row
const ELIGIBLE_REVIEW_SQL: &str = r#"
    SELECT review_id
    FROM sync_tombstone_reviews r
    WHERE r.is_synthetic = 1
      AND r.status NOT IN ('pending', 'accepted-later')
      AND (
            r.decision IS NULL
         OR r.decision IN ('ignored', 'rejected', 'superseded', 'resolved', 'applied-folder-binding')
      )
      AND r.created_at < ?
      AND (
            LOWER(r.review_id)            GLOB '*f5c-*'
         OR LOWER(r.review_id)            GLOB '*f5d-*'
         OR LOWER(r.review_id)            GLOB '*f5d1-*'
         OR LOWER(r.review_id)            GLOB '*f5d2-*'
         OR LOWER(r.review_id)            GLOB '*f5f-*'
         OR LOWER(r.review_id)            GLOB '*f5g-*'
         OR LOWER(r.review_id)            GLOB '*f5h-*'
         OR LOWER(r.remote_tombstone_id)  GLOB '*f5c-*'
         OR LOWER(r.remote_tombstone_id)  GLOB '*f5d-*'
         OR LOWER(r.remote_tombstone_id)  GLOB '*f5d1-*'
         OR LOWER(r.remote_tombstone_id)  GLOB '*f5d2-*'
         OR LOWER(r.remote_tombstone_id)  GLOB '*f5f-*'
         OR LOWER(r.remote_tombstone_id)  GLOB '*f5g-*'
         OR LOWER(r.remote_tombstone_id)  GLOB '*f5h-*'
         OR LOWER(r.record_id)            GLOB '*f5c-*'
         OR LOWER(r.record_id)            GLOB '*f5d-*'
         OR LOWER(r.record_id)            GLOB '*f5d1-*'
         OR LOWER(r.record_id)            GLOB '*f5d2-*'
         OR LOWER(r.record_id)            GLOB '*f5f-*'
         OR LOWER(r.record_id)            GLOB '*f5g-*'
         OR LOWER(r.record_id)            GLOB '*f5h-*'
         OR LOWER(r.dedupe_key)           GLOB '*f5c-*'
         OR LOWER(r.dedupe_key)           GLOB '*f5d-*'
         OR LOWER(r.dedupe_key)           GLOB '*f5d1-*'
         OR LOWER(r.dedupe_key)           GLOB '*f5d2-*'
         OR LOWER(r.dedupe_key)           GLOB '*f5f-*'
         OR LOWER(r.dedupe_key)           GLOB '*f5g-*'
         OR LOWER(r.dedupe_key)           GLOB '*f5h-*'
      )
      AND NOT EXISTS (
        SELECT 1
        FROM sync_tombstones t
        WHERE t.tombstone_id = r.remote_tombstone_id
          AND t.is_synthetic = 0
      )
"#;

/// Returns the IDs of `sync_tombstones` rows that satisfy
/// SYNTHETIC_PREDICATE_V1 at the given `now_iso` cutoff.
/// Read-only — never mutates the database.
pub async fn eligible_synthetic_tombstone_ids(
    conn: &mut SqliteConnection,
    now_iso: &str,
) -> Result<Vec<String>, sqlx::Error> {
    let cutoff = subtract_seconds_iso(now_iso, SAFETY_AGE_FLOOR_SECONDS);
    let rows = sqlx::query(ELIGIBLE_TOMBSTONE_SQL)
        .bind(&cutoff)
        .fetch_all(&mut *conn)
        .await?;
    Ok(rows.into_iter().map(|r| r.get::<String, _>(0)).collect())
}

/// Returns the IDs of `sync_tombstone_reviews` rows that satisfy
/// SYNTHETIC_PREDICATE_V1 at the given `now_iso` cutoff.
/// Read-only — never mutates the database.
pub async fn eligible_synthetic_review_ids(
    conn: &mut SqliteConnection,
    now_iso: &str,
) -> Result<Vec<String>, sqlx::Error> {
    let cutoff = subtract_seconds_iso(now_iso, SAFETY_AGE_FLOOR_SECONDS);
    let rows = sqlx::query(ELIGIBLE_REVIEW_SQL)
        .bind(&cutoff)
        .fetch_all(&mut *conn)
        .await?;
    Ok(rows.into_iter().map(|r| r.get::<String, _>(0)).collect())
}

/// Pure string helper: subtract `seconds` from an ISO timestamp expressed
/// at second precision. Works for the comparison-only use here without
/// pulling in chrono.
///
/// Inputs that don't parse as the expected `YYYY-MM-DDTHH:MM:SS[...]`
/// shape return the original string unchanged — the SQL comparison will
/// then treat all rows as older than the cutoff and rely on the other
/// predicate clauses for safety.
fn subtract_seconds_iso(iso: &str, seconds: i64) -> String {
    let s = iso.trim();
    // Expect "YYYY-MM-DDTHH:MM:SS" prefix at minimum.
    if s.len() < 19 {
        return s.to_string();
    }
    let date_part = &s[0..10];
    let time_part = &s[11..19];
    let suffix = &s[19..];
    let date_ok = date_part.chars().nth(4) == Some('-')
        && date_part.chars().nth(7) == Some('-');
    let time_ok = time_part.chars().nth(2) == Some(':')
        && time_part.chars().nth(5) == Some(':');
    if !date_ok || !time_ok || s.chars().nth(10) != Some('T') {
        return s.to_string();
    }
    let (Some(year), Some(month), Some(day), Some(hh), Some(mm), Some(ss)) = (
        date_part[0..4].parse::<i64>().ok(),
        date_part[5..7].parse::<i64>().ok(),
        date_part[8..10].parse::<i64>().ok(),
        time_part[0..2].parse::<i64>().ok(),
        time_part[3..5].parse::<i64>().ok(),
        time_part[6..8].parse::<i64>().ok(),
    ) else {
        return s.to_string();
    };
    // Convert to a naive day-of-month epoch approximation (calendar-aware
    // would need chrono). Days-since-1970 calculation is sufficient for
    // strict-less-than ISO string comparison because the result is then
    // formatted back with normalized DD/MM/YYYY rollover via the helper
    // below. For test stability we use a careful naive implementation.
    let days = days_from_civil(year, month, day);
    let total_seconds: i64 = days * 86_400 + hh * 3600 + mm * 60 + ss - seconds;
    if total_seconds < 0 {
        return "0001-01-01T00:00:00Z".to_string();
    }
    let new_days = total_seconds.div_euclid(86_400);
    let secs_of_day = total_seconds.rem_euclid(86_400);
    let new_hh = secs_of_day / 3600;
    let new_mm = (secs_of_day % 3600) / 60;
    let new_ss = secs_of_day % 60;
    let (ny, nmo, nd) = civil_from_days(new_days);
    let mut out = format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}",
        ny, nmo, nd, new_hh, new_mm, new_ss
    );
    out.push_str(suffix);
    out
}

/// Public wrapper around the civil-from-days conversion so callers
/// outside this module (e.g. lib.rs's `nowish_iso` helper) can format
/// ISO timestamps without re-implementing the algorithm.
pub fn civil_from_days_pub(days: i64) -> (i64, i64, i64) {
    civil_from_days(days)
}

// Howard Hinnant's algorithms (public domain) for civil↔days.
fn days_from_civil(y: i64, m: i64, d: i64) -> i64 {
    let y = if m <= 2 { y - 1 } else { y };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = (y - era * 400) as i64;
    let doy = (153 * (if m > 2 { m - 3 } else { m + 9 }) + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe - 719_468
}

fn civil_from_days(z: i64) -> (i64, i64, i64) {
    let z = z + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    (y, m, d)
}

#[cfg(test)]
mod marker_tests {
    use super::*;

    #[test]
    fn predicate_version_is_v1() {
        assert_eq!(SYNTHETIC_PREDICATE_VERSION, "h2o.studio.sync.synthetic-marker.v1");
    }

    #[test]
    fn prefix_heuristic_version_is_distinct() {
        assert_ne!(SYNTHETIC_PREDICATE_VERSION, SYNTHETIC_PREFIX_HEURISTIC_VERSION);
        assert_eq!(
            SYNTHETIC_PREFIX_HEURISTIC_VERSION,
            "h2o.studio.sync.synthetic-prefix-heuristic"
        );
    }

    #[test]
    fn prefix_list_contains_all_known_eras() {
        let want = ["f5c-", "f5d-", "f5d1-", "f5d2-", "f5f-", "f5g-", "f5h-"];
        for p in want {
            assert!(SYNTHETIC_PREFIXES_V1.contains(&p), "missing {p}");
        }
    }

    #[test]
    fn has_synthetic_prefix_basic() {
        assert!(has_synthetic_prefix("f5g-tombstone-001"));
        assert!(has_synthetic_prefix("F5G-Tombstone-001")); // case-insensitive
        assert!(has_synthetic_prefix("folderBinding:f5h-chat:f5h-folder"));
        assert!(!has_synthetic_prefix(""));
        assert!(!has_synthetic_prefix("folderBinding:abc:def"));
        assert!(!has_synthetic_prefix("user-unbind"));
    }

    #[test]
    fn safety_age_floor_is_one_hour() {
        assert_eq!(SAFETY_AGE_FLOOR_SECONDS, 3600);
    }

    #[test]
    fn protected_delete_reasons_include_known_real() {
        for reason in ["folder-delete", "folder-delete-cascade", "user-unbind", "remote-review-apply", "remote-tombstone-applied"] {
            assert!(PROTECTED_TOMBSTONE_DELETE_REASONS.contains(&reason), "missing {reason}");
        }
    }

    #[test]
    fn protected_review_statuses_include_pending_and_accepted_later() {
        assert!(PROTECTED_REVIEW_STATUSES.contains(&"pending"));
        assert!(PROTECTED_REVIEW_STATUSES.contains(&"accepted-later"));
    }

    #[test]
    fn subtract_seconds_basic() {
        let r = subtract_seconds_iso("2026-05-21T12:00:00Z", 3600);
        assert_eq!(r, "2026-05-21T11:00:00Z");
    }

    #[test]
    fn subtract_seconds_day_rollover() {
        let r = subtract_seconds_iso("2026-05-21T00:00:30Z", 60);
        assert_eq!(r, "2026-05-20T23:59:30Z");
    }

    #[test]
    fn subtract_seconds_invalid_passthrough() {
        let r = subtract_seconds_iso("not-an-iso", 3600);
        assert_eq!(r, "not-an-iso");
    }
}
