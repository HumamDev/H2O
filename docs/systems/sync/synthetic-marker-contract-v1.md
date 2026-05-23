# Synthetic Marker Contract v1 (F5H.3b.0c)

## Status

Active. Implemented in commit landing F5H.3b.0c.

This document is the single source of truth for what makes a row in
`sync_tombstones` or `sync_tombstone_reviews` cleanup-eligible. Preview,
true-dry-run, and future real-cleanup paths must all use the same
predicate.

## Version

```
SYNTHETIC_PREDICATE_VERSION = "h2o.studio.sync.synthetic-marker.v1"
```

Stamped on every preview and future cleanup return. Chrome's prefix-only
heuristic preview uses a distinct version string:

```
SYNTHETIC_PREFIX_HEURISTIC_VERSION = "h2o.studio.sync.synthetic-prefix-heuristic"
```

The two are intentionally different so consumers cannot conflate them.

## Marker column

Migration v8 adds a single column to both tables:

```sql
ALTER TABLE sync_tombstones        ADD COLUMN is_synthetic INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sync_tombstone_reviews ADD COLUMN is_synthetic INTEGER NOT NULL DEFAULT 0;
CREATE INDEX idx_sync_tombstones_is_synthetic        ON sync_tombstones(is_synthetic, restored_at);
CREATE INDEX idx_sync_tombstone_reviews_is_synthetic ON sync_tombstone_reviews(is_synthetic, status);
```

All existing rows default to `is_synthetic = 0` (non-synthetic). The
migration does not backfill. Pre-contract test fixtures are not
cleanup-eligible after the migration; they sit until manually removed.

## Predicate (cleanup-eligible synthetic)

A row is cleanup-eligible iff **all** conditions hold. Both tables share
the column gate + age floor + prefix corroboration on safe top-level
fields; per-table conditions differ.

### `sync_tombstones`

| # | Condition |
|---|---|
| T1 | `is_synthetic = 1` |
| T2 | Case-insensitive substring match of any prefix from `SYNTHETIC_PREFIXES_V1` in one of `tombstone_id`, `record_id`, or `delete_reason` |
| T3 | `restored_at IS NULL` |
| T4 | `created_at < (now - SAFETY_AGE_FLOOR_SECONDS)` |
| T5 | `delete_reason NOT IN PROTECTED_TOMBSTONE_DELETE_REASONS` |
| T6 | NOT EXISTS a `sync_tombstone_reviews` row with `remote_tombstone_id = t.tombstone_id AND status IN ('pending', 'accepted-later')` |

### `sync_tombstone_reviews`

| # | Condition |
|---|---|
| R1 | `is_synthetic = 1` |
| R2 | Case-insensitive substring match of any prefix from `SYNTHETIC_PREFIXES_V1` in one of `review_id`, `remote_tombstone_id`, `record_id`, or `dedupe_key` |
| R3 | `status NOT IN ('pending', 'accepted-later')` |
| R4 | `decision IS NULL` OR `decision IN ('ignored', 'rejected', 'superseded', 'resolved', 'applied-folder-binding')` |
| R5 | `created_at < (now - SAFETY_AGE_FLOOR_SECONDS)` |
| R6 | NOT EXISTS a `sync_tombstones` row with `tombstone_id = r.remote_tombstone_id AND is_synthetic = 0` (the review must not point at a real, non-synthetic tombstone) |

### Definitely **not** synthetic

- Any row with `is_synthetic = 0` (the DEFAULT). No exception.
- Any row whose only F5 prefix appears in a JSON content field
  (`meta_json`, `raw_tombstone_json`, `warnings_json`) — content fields
  are not safe corroboration sources.
- Any review with `status ∈ {pending, accepted-later}`.
- Any restored tombstone.
- Any tombstone with `delete_reason ∈ PROTECTED_TOMBSTONE_DELETE_REASONS`,
  regardless of column value.

## Constants

Defined in [`apps/studio/desktop/src-tauri/src/synthetic_marker.rs`](../../../apps/studio/desktop/src-tauri/src/synthetic_marker.rs):

```rust
pub const SYNTHETIC_PREFIXES_V1: &[&str] =
    &["f5c-", "f5d-", "f5d1-", "f5d2-", "f5f-", "f5g-", "f5h-"];

pub const SAFETY_AGE_FLOOR_SECONDS: i64 = 3600;

pub const PROTECTED_TOMBSTONE_DELETE_REASONS: &[&str] = &[
    "folder-delete",
    "folder-delete-cascade",
    "user-unbind",
    "remote-review-apply",
    "remote-tombstone-applied",
];

pub const PROTECTED_REVIEW_STATUSES: &[&str] = &["pending", "accepted-later"];
```

## Writer contract

**Only named test/dev fixture seeders may set `is_synthetic = 1`.**
Production paths must omit the column (relying on `DEFAULT 0`) or
explicitly bind `0`.

Approved writers in this repo:

- `tests::f5h3_seed_tombstone(...)` in
  [`apps/studio/desktop/src-tauri/src/lib.rs`](../../../apps/studio/desktop/src-tauri/src/lib.rs)
  (inside `#[cfg(test)] mod tests`)
- `tests::f5h3_seed_review(...)` in the same module

Both are inside the `#[cfg(test)]`-gated test module and so do not exist
in release builds.

The contract is enforced by:

1. The column DEFAULT 0 — any INSERT that omits the column gets 0.
2. The fixture seeders are #[cfg(test)] only — they are not compiled into
   release builds.
3. The contract test `f5h3b0c_no_production_writer_binds_is_synthetic_one`
   scans the source file for unauthorized writers.
4. CI grep (recommended follow-up — see "Optional CI follow-up" below)
   can add a hard guard outside the Rust test suite.

## Preview / cleanup parity

| Surface | Predicate | Version string | Cleanup planned? |
|---|---|---|---|
| Desktop preview (`tombstone-reviews.tauri.js`) | Prefix heuristic + contract counts side-by-side | `predicateVersion: "h2o.studio.sync.synthetic-marker.v1"` (contract) + `predicateHeuristicVersion: "...synthetic-prefix-heuristic"` (legacy fields) | Yes — F5H.3b.0d (true dry run) → F5H.3b.1 (commit) |
| Chrome preview (`tombstone-reviews.mv3.js`) | Prefix heuristic ONLY | `predicateVersion: "h2o.studio.sync.synthetic-prefix-heuristic"` | **No** — Chrome cleanup is not planned |
| Future Rust cleanup (F5H.3b.0d / F5H.3b.1) | `eligible_synthetic_*_ids` in `synthetic_marker.rs` (the v1 contract) | `predicateVersion: "h2o.studio.sync.synthetic-marker.v1"` | F5H.3b.0d = transactional ROLLBACK; F5H.3b.1 = transactional COMMIT |

The Desktop preview surfaces **both** the legacy prefix-heuristic counts
(`syntheticCandidates`, `cleanupEligible`) and the new contract counts
(`syntheticContractCount`, `cleanupContractEligible`) inside each section
so operators can compare what the strict contract would target vs what
the loose heuristic flags.

## What this contract does NOT do

- Does not delete any row.
- Does not expose a `cleanupSynthetic({ dryRun: false })` API.
- Does not change import / export / sync / apply behavior.
- Does not backfill `is_synthetic = 1` on existing rows.
- Does not add a UI control or settings entry.
- Does not enable Chrome-side cleanup. Ever.
- Does not start F5H.3b.1b, F6, or F7.

## Future phases that depend on this contract

- **F5H.3b.0d — DONE.** True-dry-run cleanup. Runs the full transaction
  shape proven in F5H.3b.0 against the real Desktop SQLite DB with the v1
  predicate, then unconditionally ROLLBACKs. Implemented as Tauri command
  `preview_cleanup_synthetic_transactional` and surfaced via
  `previewCleanupSynthetic({ dryRun: true, transactional: true })`.
  Adds migration v9 (`sync_maintenance_log`). Returns redacted counts-only
  envelope with schema `h2o.studio.synthetic-cleanup-transaction-dry-run.v1`.
  No deletes commit, no row mutates.
- **F5H.3b.1a — DONE.** Opt-in candidate ID + previewToken surface.
  Extends the F5H.3b.0d Tauri command with an additional payload flag
  `includeCandidateIds: true`. When set, the same always-rollback dry-run
  additionally returns:
  - `candidateIds: { syncTombstoneIds, syncTombstoneReviewIds }` — sorted,
    deduped, exactly the rows the v1 predicate selected.
  - `expectedCounts: { tombstones, reviews }` — mirrors `wouldDeleteRows`.
  - `previewToken: "ptok1:<sha256-hex>"` — deterministic over the
    predicate version + DB fingerprint (`schemaUserVersion`,
    `migrationCount`) + sorted candidate IDs + expected counts. No
    timestamps, no randomness. F5H.3b.1b will recompute the token at
    cleanup time and reject if the caller-supplied value mismatches.
  - `dbFingerprint: { schemaUserVersion, migrationCount }` — the inputs
    the caller must echo back so F5H.3b.1b can recompute the token.

  Default behavior (flag omitted / `false`) is **byte-identical** to
  F5H.3b.0d: the four optional fields are `Option::None` server-side and
  `skip_serializing_if = "Option::is_none"` means they never appear in
  the JSON response. The dry-run STILL rolls back when IDs are included;
  no row mutates whether the flag is set or not. No new Tauri command,
  no Chrome path, no UI, no real cleanup, no COMMIT.
- **F5H.3b.1b — DONE.** Desktop-only real cleanup commit. Exposes
  `H2O.Studio.maintenance.cleanupSynthetic({ dryRun: false, ... })` behind
  the exact gate
  `I_UNDERSTAND_THIS_DELETES_SYNTHETIC_TOMBSTONE_DATA`. The caller must echo
  the F5H.3b.1a-issued `candidateIds`, `expectedCounts`, and `previewToken`.
  Rust recomputes the token from the current DB fingerprint and supplied
  candidate set before opening the write transaction. Inside the transaction,
  each DELETE is both candidate-pinned and guarded by the same
  `SYNTHETIC_PREDICATE_V1` subquery. Audit is written to
  `sync_maintenance_log` with hash-only result metadata. Chrome remains
  preview-only and registers no cleanup function.

All phases use exactly the predicate defined here. None may relax it
without bumping the version string.

## Optional CI follow-up

A grep-based CI script can complement the in-tree test:

```bash
# Fail if any file outside the approved scope binds is_synthetic to 1.
git grep -nE "is_synthetic\s*[:,= ]\s*1|VALUES\s*\([^)]*,\s*1\s*\)" -- \
    'apps/studio/desktop/src-tauri/src/*.rs' \
    'src-surfaces-base/**/*.js' \
  | grep -v 'src/synthetic_marker.rs' \
  | grep -v 'src/lib.rs:.*f5h3_seed_' \
  | grep -v 'tombstone-reviews\.(tauri|mv3)\.js'  # the contract helpers
```

Such a script can land alongside the existing validation tooling under
`tools/validation/`. F5H.3b.0c does not require it; the Rust test
`f5h3b0c_no_production_writer_binds_is_synthetic_one` provides the
in-suite floor.
