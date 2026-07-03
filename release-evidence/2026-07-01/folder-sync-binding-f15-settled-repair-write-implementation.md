# Folder Sync - F15-Settled Binding Repair-Write Routing (Implementation)

Status: BINDING F15-SETTLED REPAIR-WRITE ROUTING IMPLEMENTED.

This slice implements the fix defined by the F15-settled repair-write preflight (`44151f14`): the normal binding
repair write now routes through the existing F15-settled delegation, so the F15-settled source-of-truth is
updated and a later settlement / materialization / reconcile does NOT revert the repair. It is a **JS-only**
change to `folder-sync.tauri.js` (the binding repair handler); `folders.tauri.js` is unchanged. No new Rust; no
f16 trigger guard enablement; no new `h2o_writer_identity()` path. No live apply was performed.

## True revert vector (from `7dd1e069`, gated by `44151f14`)

Binding repair previously wrote canonical `folder_bindings` via the bare/legacy path
(`moveCanonicalChatFolderBinding` + `explicitF7Fallback: true`, `plugin:sql|execute`, empty
`h2o_writer_identity()`). The f16 guard being disabled let the bare write land and read back same-session
(durable-looking), but it never updated the F15-settled source-of-truth, so a later authorized F15
settlement/materialization/reconcile rebuilt `folder_bindings` from the settled source and reverted the repair.

## Source change (`folder-sync.tauri.js` only)

`applyChatFolderBindingRepairRequest`:
- The repair `writeOpts` now sets `useF15FolderBindingDelegation: true` and NO LONGER sets
  `explicitF7Fallback: true`. It does NOT set `allowF7Fallback` / `f15AllowF7Fallback`, so there is NO
  bare/legacy fallback: if F15 delegation is unavailable or fails, the store write returns falsy and the handler
  safe-fails (`rejected`, zero ledger consume, `idempotencyPersisted:false`).
- The bind/move path now routes BOTH `bind` and `move` (rebind) through the F15-settled `folders.bindChat(...)`.
  `bindChat` with `useF15FolderBindingDelegation` calls `delegateF15FolderBindingWrite('bind', ...)`, which
  DECOMPOSES a rebind (unbind-old + bind-new) through the F15 settlement pipeline — so the settled
  source-of-truth is updated. The bare `folders.moveCanonicalChatFolderBinding(...)` is no longer called by the
  repair (there are zero `folders.moveCanonicalChatFolderBinding(` calls in the handler).
- `unbind` continues via `folders.unbindChat(...)`, now settled through F15 delegation (the same `writeOpts`).
- The existing `post-apply-binding-hash-mismatch` gate and the busy-aware durable gate are UNCHANGED and still
  run before any ledger consume; ledger consume / `applied` / `idempotencyPersisted:true` still require the
  same-session hash gate + the busy-aware durable gate + a successful settled write.

`folders.tauri.js` is not modified: the F15-settled delegation (`delegateF15FolderBindingWrite`,
`f15FolderBindingDelegationEnabled`, `bindChat`/`unbindChat` routing) and the busy-aware durable fence already
exist there.

## Behavioral proof (node harness)

- **Settled-write routing + reconcile-survival (bind):** with F15 delegation available, an accepted repair bind
  writes through the settled path (updating both the canonical bindings and the F15-settled source), returns
  `applied` + consumes one ledger row; then a simulated settlement/reconcile pass (rebuild canonical from the
  settled source) leaves the binding intact — it does NOT revert.
- **Settled-write routing + reconcile-survival (move/rebind):** a repair move routes through the settled
  `bindChat` rebind decomposition; the moved binding survives the simulated reconcile; the bare
  `moveCanonicalChatFolderBinding` mock is NOT called by the repair.
- **Ledger-contingency (F15 unavailable):** with the settled delegation failing, the repair returns `rejected`
  with zero canonical write count, `idempotencyPersisted:false`, and consumes ZERO ledger rows.
- **Gate retention:** the busy-aware durable fence (`busy === 1` safe-fail) and the
  `post-apply-binding-hash-mismatch` gate remain present and ordered before the ledger consume.

## Boundaries

- `binding-mismatch` remains BLOCKED; `productSyncReady` remains `false`; WebDAV/cloud/relay remains blocked;
  Chat Saving WebDAV/cloud/archive CAS remains blocked; no `fullBundle.v3`.
- No Rust `lib.rs` / `sqlite_writer_identity.rs` edit; f16 trigger guard not enabled; no new
  `h2o_writer_identity()` path; competing-writer files not edited; existing hash gate + busy-aware durable gate
  preserved.
- No live apply; no gate passed live; no `apply:true`.

## Verdict

BINDING F15-SETTLED REPAIR-WRITE ROUTING IMPLEMENTED. The normal binding repair write no longer uses
`explicitF7Fallback: true` or the bare `moveCanonicalChatFolderBinding` path; it routes through the existing
F15-settled delegation (`useF15FolderBindingDelegation: true` → `delegateF15FolderBindingWrite`), so the settled
source-of-truth is updated and survives reconcile. `applied` / ledger consume require the settled write + the
same-session hash gate + the busy-aware durable gate; if F15 delegation is unavailable the repair safe-fails and
consumes no ledger. No new Rust, no f16 guard enablement, no new writer identity.

## Recommended Next Step

Independent patch review, then prepare the live proof sequence (separately approved): dry-run → settlement-routed
controlled apply → reload/restart → readback equals requested → run a settlement/reconcile pass → readback STILL
equals requested (no revert) → duplicate replay 0-write — BEFORE any binding allowed-set flip. Keep
`binding-mismatch` blocked, `productSyncReady` false, WebDAV/cloud/relay + Chat Saving CAS blocked, and no live
apply retry until the live reconcile-survival proof lands and is separately approved.

## References

- F15-settled repair-write preflight: `44151f14`. Rust/writer-authority investigation: `7dd1e069`. Busy-aware
  fence fix: `a2864ad6`. Durable gate implementation: `71616328`. Earlier blocker chain: controlled apply
  `5c89ba95`; readback blocked `d46f0805`; state-source diagnostic `132002b6`; binding implementation
  `d4d5db19`.
