# Folder Sync - F15-Settled Binding Repair-Write Fix (Design-Only Preflight)

Status: BINDING F15-SETTLED REPAIR-WRITE PREFLIGHT READY.

This is a DESIGN-ONLY preflight. No product source was edited; the fix is NOT implemented here. It defines the
contract for the real persistence fix identified by the Rust/writer-authority investigation (`7dd1e069`): route
the binding repair canonical write through the existing F15-settled delegation so the settled source-of-truth
is updated and survives reconcile. No live apply retry is approved by this preflight.

## True revert vector (identified by `7dd1e069`)

Binding repair currently writes canonical `folder_bindings` through the **bare / legacy path**:
- `moveCanonicalChatFolderBinding` (bare `INSERT OR REPLACE INTO folder_bindings` via `plugin:sql|execute`),
  and/or `bindChat`/`unbindChat` with `explicitF7Fallback: true` falling back to
  `bindChatLegacy`/`unbindChatLegacy`;
- `h2o_writer_identity()` is empty on the JS `plugin:sql` connection (no F15 settlement writer identity).

Because the f16 `folder_bindings` trigger guard is DISABLED by default, the bare write lands in SQLite and reads
back same-session (so the same-session `post-apply-binding-hash-mismatch` gate matched and the write looked
durable). But the bare write does NOT update the F15-settled source-of-truth. A later AUTHORIZED F15
settlement / materialization / reconcile rebuilds `folder_bindings` from the settled source (which still holds
the OLD binding) and reverts the repair. This explains the observed blocker: `applied` receipt, later
snapshot/store/direct-SQLite returning the old before hash, and a consumed ledger row without durable canonical
persistence.

## Selected fix path

Route binding repair canonical writes through the **existing F15-settled delegation**
(`delegateF15FolderBindingWrite`, authorized `f15.execute-settlement-writer`) instead of the bare legacy
fallback path — so the settled source-of-truth is updated and a later settlement/reconcile reproduces the NEW
binding rather than reverting it.

- **No new Rust is required for this planned fix** — the authorized F15 settlement writer identity already
  exists (`sqlite_writer_identity.rs`, installed by the Rust settlement path). The fix reuses it from JS.
- **No f16 trigger guard enablement** (`f16_folder_bindings_trigger_guard.enabled` stays 0).
- **No new `h2o_writer_identity()` path / routing** — reuse the existing settlement delegation.
- **The busy-aware durable gate remains required** (`bindingCheckpointRowParse` / busy-aware fence,
  `confirmCanonicalChatFolderBindingDurable`).
- **The existing `post-apply-binding-hash-mismatch` gate remains required.**

## Fix contract (design-only; to be implemented + proven in a later slice)

1. The binding repair write must update the **F15-settled source-of-truth** (route through
   `delegateF15FolderBindingWrite`), not the bare legacy path.
2. The binding repair must NOT use `explicitF7Fallback: true` for normal settled repair writes (it currently
   sets it at `folder-sync.tauri.js` writeOpts). Legacy/bare fallback must not be the repair's default.
3. `applied`, `idempotencyPersisted: true`, and consumed-ledger insertion require ALL of:
   - the existing same-session `post-apply-binding-hash-mismatch` gate passes,
   - the busy-aware durable gate passes (`durable === true && unverifiable !== true && matchesRequested === true`),
   - the F15-settled write path succeeds,
   - a settlement / reconcile / materialization pass does NOT revert the binding.
4. If F15-settled delegation is unavailable, the repair must safe-fail / `rejected` and consume NO ledger row
   (parallel to `persistence-verification-failure`).
5. The handler must remain hash-only / redacted and non-destructive (no folder/chat delete, no purge, no
   tombstone mutation, no mirror/transport/WebDAV write).
6. No binding allowed-set flip before a LIVE reconcile-survival proof.

## Source areas inspected / to change in the fix (documentation only)

- `src-surfaces-base/studio/store/folders.tauri.js`: `delegateF15FolderBindingWrite` (1276),
  `f15FolderBindingDelegationEnabled` (1031), `explicitF7FallbackAllowed` (1044), `bindChat`, `unbindChat`,
  `bindChatLegacy`, `unbindChatLegacy`, `moveCanonicalChatFolderBinding` (bare),
  `confirmCanonicalChatFolderBindingDurable`.
- `src-surfaces-base/studio/sync/folder-sync.tauri.js`: `applyChatFolderBindingRepairRequest`, the bind/move/
  unbind `writeOpts` (currently `explicitF7Fallback: true` at line 5753), the durable gate, ledger-consume
  ordering, receipt reason/status construction.
- Settlement / reconcile / materialization (inspect only, NOT edited by the fix):
  `binding-reviewed-apply.tauri.js`, `import-bundle.tauri.js`, `tombstone-reviews.tauri.js`, and the
  settlement helper used by `delegateF15FolderBindingWrite`.
- Rust writer-identity anchors (inspect only, NOT edited): `apps/studio/desktop/src-tauri/src/lib.rs`,
  `apps/studio/desktop/src-tauri/src/sqlite_writer_identity.rs`.

## Required future validators / proofs (before live retry)

1. **Settled-write routing validator** — the repair write delegates to `delegateF15FolderBindingWrite`
   (F15-settled), not the bare legacy path.
2. **No-`explicitF7Fallback`-on-normal-repair validator** — the repair writeOpts no longer force
   `explicitF7Fallback: true` for the normal settled path.
3. **Settlement / reconcile-survival validator** — after a settlement-routed apply, a simulated settlement /
   materialization / reconcile pass does NOT revert the binding.
4. **Ledger-contingency validator** — an unsettled / failed settled write consumes ZERO ledger rows.
5. **Durable / busy-aware gate retention validator** — the busy-aware fence + `post-apply-binding-hash-mismatch`
   gate remain and are not weakened.
6. **Live reload + reconcile-survival proof** (separately approved) — dry-run → settlement-routed controlled
   apply → reload/restart → readback equals requested → run a settlement/reconcile pass → readback STILL equals
   requested (no revert) → duplicate replay 0-write — BEFORE any binding allowed-set flip.

## Boundaries (reaffirmed)

- No live apply retry is approved by this preflight; no gate passed; no `apply:true`.
- `binding-mismatch` remains BLOCKED; `productSyncReady` remains `false`; WebDAV/cloud/relay remains blocked;
  Chat Saving WebDAV/cloud/archive CAS remains blocked.
- No Rust edit; f16 trigger guard not enabled; no new `h2o_writer_identity()` routing; competing-writer files
  not edited; existing `post-apply-binding-hash-mismatch` + busy-aware durable gate preserved.

## Verdict

BINDING F15-SETTLED REPAIR-WRITE PREFLIGHT READY. The true revert vector (bare/unsettled repair write
overwritten by the authorized F15 settlement path) is confirmed; the selected fix routes the repair through the
existing F15-settled delegation (no new Rust, no f16 guard enablement, no new writer identity), retaining the
busy-aware durable gate and the `post-apply-binding-hash-mismatch` gate. Implementation + reconcile-survival
proofs are a later, separately-approved slice.

## References

- Rust/writer-authority investigation: `7dd1e069`. Busy-aware fence fix: `a2864ad6`. Durable gate
  implementation: `71616328`. Source-fix preflight: `3afd4058`. Earlier blocker chain: controlled apply
  `5c89ba95`; readback blocked `d46f0805`; state-source diagnostic `132002b6`; binding implementation
  `d4d5db19`.

## Recommended Next Step

Implement the F15-settled repair-write routing (JS only: `folder-sync.tauri.js` + `folders.tauri.js`; no Rust)
with the reconcile-survival + settled-write-routing + no-`explicitF7Fallback` + ledger-contingency + gate-
retention validators, then the live reload + reconcile-survival proof — each separately approved. Keep
`binding-mismatch` blocked, `productSyncReady` false, WebDAV/cloud/relay + Chat Saving CAS blocked, and no live
apply retry until the fix and its reconcile-survival proof land and are separately approved.
