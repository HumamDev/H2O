# Folder Sync - Binding Persistence Rust/Writer-Authority Investigation

Status: BINDING PERSISTENCE TRUE REVERT VECTOR IDENTIFIED.

Investigation + evidence only. No product source was changed (no final persistence fix implemented here). No
live apply was run. The busy-aware durable gate (`a2864ad6`) remains in place; live apply retry remains
blocked.

## Verdict

BINDING PERSISTENCE TRUE REVERT VECTOR IDENTIFIED: the binding repair writes canonical `folder_bindings`
through the **bare / legacy (unsettled, unauthenticated) path**, not the authorized F15 settlement writer. The
bare write lands in SQLite (the f16 trigger guard is disabled by default, so it is NOT blocked) and reads back
in the same session (so the post-apply hash gate matched and the write looked durable), but it does NOT update
the F15-settled source-of-truth. A subsequent AUTHORIZED F15 settlement / materialization / reconcile pass
rebuilds `folder_bindings` from the settled source (which still holds the OLD binding), reverting the repair to
the exact pre-apply hash. This matches the observed blocker: `applied` + same-session durable-looking readback
(`sha256:d53244…` requested), later reverted to the old before hash (`sha256:1d602101…`) with a consumed
ledger row and no canonical persistence.

## Inspected source files / functions

- Rust substrate: `apps/studio/desktop/src-tauri/src/lib.rs` (SQL migrations, `folder_bindings` table + f15/f16
  protection triggers), `apps/studio/desktop/src-tauri/src/sqlite_writer_identity.rs`
  (`h2o_writer_identity` SQL function; per-connection identity install/clear).
- Store: `src-surfaces-base/studio/store/folders.tauri.js` — `bindChat` / `bindChatLegacy` / `unbindChat` /
  `unbindChatLegacy` / `moveCanonicalChatFolderBinding` / `delegateF15FolderBindingWrite` /
  `f15FolderBindingDelegationEnabled` / `explicitF7FallbackAllowed` / `confirmCanonicalChatFolderBindingDurable`
  / `sqlExecute` / `sqlSelect` (`plugin:sql|execute` / `plugin:sql|select`, `db: sqlite:studio-v1.db`).
- Handler: `src-surfaces-base/studio/sync/folder-sync.tauri.js` — `applyChatFolderBindingRepairRequest`
  (post-apply-binding-hash-mismatch gate, durable gate, ledger consume ordering, receipt construction; write
  `writeOpts` carrying `explicitF7Fallback: true`).
- Competing writers: `src-surfaces-base/studio/sync/binding-reviewed-apply.tauri.js`,
  `src-surfaces-base/studio/ingestion/import-bundle.tauri.js`,
  `src-surfaces-base/studio/sync/tombstone-reviews.tauri.js`.

## Discovered `folder_bindings` writers

| Writer | Path | Authority |
| --- | --- | --- |
| `bindChat` (store) | delegates to F15 (`delegateF15FolderBindingWrite`) UNLESS delegation disabled / explicit F7 fallback → then `bindChatLegacy` | **F15-settled (authorized)** by default; bare on fallback |
| `unbindChat` (store) | same F15 delegation vs `unbindChatLegacy` | F15-settled vs bare |
| `bindChatLegacy` / `unbindChatLegacy` (store) | bare `INSERT OR REPLACE` / `DELETE FROM folder_bindings` via `plugin:sql|execute` | **bare / unsettled (identity "")** |
| `moveCanonicalChatFolderBinding` (store) | bare `INSERT OR REPLACE INTO folder_bindings` via `plugin:sql|execute` (no F15 delegation) | **bare / unsettled (identity "")** |
| `binding-reviewed-apply.tauri.js` | `BEGIN IMMEDIATE` / `INSERT INTO folder_bindings` / `COMMIT` | reviewed-apply transaction |
| `import-bundle.tauri.js` | materialization writes `folders` / `folder_bindings` ("protected by F15 settlement rules") | F15-adjacent materialization |
| store `DELETE FROM folder_bindings WHERE folder_id = ?` | folder soft-delete/purge | bare |

**The binding repair handler uses the BARE paths:** its `writeOpts` sets `explicitF7Fallback: true`, and its
move branch calls `folders.moveCanonicalChatFolderBinding` (inherently bare). So the repair's canonical write is
NOT F15-settled.

## Trigger guard / writer-identity posture

- `h2o_writer_identity()` is a per-connection SQLite function (`sqlite_writer_identity.rs`). Authorized F15
  settlement/cache paths install the identity (`f15.execute-settlement-writer`) on the acquired connection
  before writing, then clear it. The JS `plugin:sql` path installs NO identity → `h2o_writer_identity()` is
  the empty string.
- f15 (v12) triggers protect labels/tags/categories/label_bindings/tag_bindings; f16 (v13) triggers protect
  `folder_bindings`. Allowlist for both: `f15.execute-settlement-writer`, `f16.folder-legacy-fallback`.
- The **f16 `folder_bindings` trigger guard is DISABLED by default** (`f16_folder_bindings_trigger_guard.enabled
  = 0`; an F16 command flips it to 1). While disabled, the f16 triggers are inert → bare JS
  `folder_bindings` writes are NOT blocked (they succeed and read back same-session). If ENABLED, a bare write
  (identity "") would `RAISE(ABORT)` and fail at write time.

## Is binding repair currently using an authorized writer identity?

**No.** The repair writes via the bare/legacy path (`moveCanonicalChatFolderBinding` and/or
`bindChat`/`unbindChat` with `explicitF7Fallback: true`), which runs with `h2o_writer_identity()` = "" and does
NOT settle through F15. It is unauthenticated and unsettled.

## Does the final fix likely require a Rust/Tauri authorized write path?

**Mostly JS, reusing the existing Rust authority.** The authorized mechanism already exists (the F15 settlement
delegation `delegateF15FolderBindingWrite` + `h2o_writer_identity('f15.execute-settlement-writer')` installed by
the Rust settlement path). The fix is to ROUTE the repair through that existing F15-settled write path instead
of the bare/legacy path — no NEW Rust is required if the repair reuses F15 delegation. A Rust change would only
be needed if a DISTINCT repair writer identity were desired (not recommended; reuse F15 settlement to keep a
single source-of-truth).

## Is competing-writer serialization required?

**No serialization needed if the repair joins the settlement source-of-truth.** The revert is not a race
between equal writers; it is a bare write being overwritten by the authoritative settled source. Once the
repair writes THROUGH F15 settlement (updating the settled source-of-truth), a later settlement/materialization
reproduces the NEW binding rather than reverting it. Detection (the busy-aware durable gate + a reconcile that
flags a consumed ledger row with no matching settled binding) remains valuable as defense-in-depth.

## Recommended final fix option

Route the binding repair canonical write through the **F15-settled delegation path** (authorized
`f15.execute-settlement-writer`): drop `explicitF7Fallback: true` / the bare `moveCanonicalChatFolderBinding`
for the repair, and instead perform the bind/move/unbind via `delegateF15FolderBindingWrite` (F15 delegation
enabled) so the settled source-of-truth is updated and survives reconcile. Keep the busy-aware durable gate and
the `post-apply-binding-hash-mismatch` gate; only emit `applied` / consume the ledger after a durable AND
settled write. Split across `folder-sync.tauri.js` (repair write routing + durable/settled gate) and
`folders.tauri.js` (expose/confirm the F15-settled repair write); no edit to the competing-writer files and no
new Rust unless a distinct identity is required.

## Required validators / live proofs before live retry

- A validator proving the repair write path is F15-settled (no `explicitF7Fallback: true` on the repair; the
  write delegates to `delegateF15FolderBindingWrite`), and that `applied`/consume require both durable AND
  settled confirmation.
- A reconcile-survival proof: after a settlement-routed apply, a simulated settlement/materialization pass does
  NOT revert the binding (the settled source reflects the new binding).
- Retained: busy-aware fence, durability/ledger-contingency, revert-detection, boundary validators.
- Live proof sequence (separately approved): dry-run → controlled apply (settlement-routed) → reload/restart →
  readback still equals requested → run a settlement/reconcile pass → readback STILL equals requested (no
  revert) → duplicate replay 0-write.

## Boundaries (reaffirmed)

- No live apply was run; no gate passed live; no `apply:true`.
- `binding-mismatch` remains BLOCKED; `productSyncReady` remains `false`; WebDAV/cloud/relay remains blocked;
  Chat Saving WebDAV/cloud/archive CAS remains blocked.
- No Rust `lib.rs` edit; f16 trigger guard not enabled; binding repair not yet routed through
  `h2o_writer_identity()`; competing-writer files not edited; existing `post-apply-binding-hash-mismatch` and
  busy-aware durable gate preserved.

## References

- Durable gate implementation: `71616328`. Busy-aware fence fix: `a2864ad6`.
- Earlier blocker chain: controlled apply `5c89ba95`; readback blocked `d46f0805`; state-source diagnostic
  `132002b6`; hardening preflight `01dc9957`; source-fix preflight `3afd4058`; binding implementation
  `d4d5db19`.
