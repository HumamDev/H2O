# Operational.5 - Canonical Count/Hash Parity Read-Only Harness

Verdict: **OPERATIONAL.5 CANONICAL COUNT/HASH PARITY READ-ONLY HARNESS IMPLEMENTED - LIVE DIAGNOSTIC STILL REQUIRED**.

This slice implements a validator-only/read-only parity harness for the next Operational.5 readiness
gate. No product source was edited, no live Desktop runtime was touched, no SQLite/chrome.storage/KV
state was mutated, `productSyncReady` stayed `false`, WebDAV/cloud/relay/`fullBundle.v3` was not
started, and Chat Saving WebDAV/cloud/archive CAS remains blocked/deferred.

## Inputs Reviewed

- Operational.5 preflight: `4f76cfbbc557f9898d6b8d2b9adf2b4e33e2564f`.
- F28 S9 live F15 restart-survival proof: `138f7e120e385b6b5f4dccccc97a73d5868fd112`.
- F28 S10 binding-mismatch reviewed repair path: `69e5a33d946f078761b4344b7ab35cda5b4a3bdb`.
- F28 S11 request-submission proof: `c9fcc08b3ed3ccab01f7923e68115d0524d52a60`.
- F28 S12 multi-device read-only import proof: `df0323e2369a3ff72b42e585a71dc9a924601a80`.
- F28 S13 sustained multi-surface parity proof: `f0d19294d958cc0a66a2c13c7f567e1a9a422039`.
- F28 S14 final productSyncReady review: `ceba8239b5d347024aca23aab55a92f4006fefc0`.

## Read-Only Surface Exposure

The current source already exposes enough read-only building blocks for a parity diagnostic, but not a
single live Operational.5 READY verdict surface.

| Surface | Existing read-only exposure | Harness status |
| --- | --- | --- |
| Desktop SQLite canonical folders | `H2O.Studio.store.folders.getAll()` / `count()` / `listFolders()` | source-exposed; live hash requires diagnostic |
| Canonical `folder_bindings` | `listCanonicalChatFolderBindings()` plus `bindingRepair.bindingHash()` | source-exposed; live hash requires diagnostic |
| Tombstones / recently deleted | `listRecentlyDeletedFolders()` and tombstone export diagnostics | source-exposed; live summary requires diagnostic |
| Render mirror | `FOLDER_STATE_DATA_KEY` read via chrome.storage/local mirror reads | source-exposed; live hash requires diagnostic |
| Chrome/MV3 projection | `folder-import.mv3.js` `fullBundle.v2` read-only projection/diagnostics | source-exposed; live bundle required |
| `fullBundle.v2` export/import | export summary counts and `desktopCanonicalChatFolderBindings` projection | source-exposed; live bundle required |
| Request/receipt ledgers | `chatFolderBindingReceipts`, `syncApplyEvents`, consumed-operation helpers | source-exposed; live summary required |
| Restart convergence records | `runF15SettledBindingRestartConvergence()` and F28 S9 evidence | source-exposed; live summary required |

## Harness Contract

The harness computes stable redacted count/hash summaries for:

- canonical folder rows,
- canonical binding rows,
- tombstones/recently deleted rows,
- render mirror folders and `items` binding projection,
- export `fullBundle.v2` summary counts and binding projection,
- request/receipt ledger summaries,
- F15 restart convergence record summaries.

Each surface is classified as:

- `match`
- `mismatch`
- `not exposed read-only`
- `requires live diagnostic`

The validator proves the count/hash criteria with synthetic read-only fixtures and source anchors. It
does not claim that the current live Desktop instance is globally parity-clean, because this slice does
not run Desktop or read live `latest.json` / `fullBundle.v2` / chrome.storage state.

## Fixture Proofs

The harness includes:

1. A positive fixture where Desktop canonical folders, `folder_bindings`, tombstones, render mirror,
   `fullBundle.v2` export counts, request/receipt ledgers, and restart convergence summaries match.
2. A negative fixture that catches:
   - canonical folder count mismatch,
   - canonical binding hash mismatch,
   - render mirror folder mismatch,
   - render mirror `items` binding projection mismatch,
   - `folderState.items` orphan bucket,
   - export summary count mismatch,
   - receipt/apply-event count mismatch,
   - restart convergence not-current/not-bounded state.

The `folderState.items` orphan bucket is checked separately from raw canonical binding rows and exported
active canonical binding rows. That split is required before any count parity claim.

## Operational.5 READY Criteria

The future READY gate must require all of the following from a live read-only diagnostic:

- Desktop canonical folder count/hash matches export and mirror projection.
- Desktop canonical `folder_bindings` count/hash matches export active projection and mirror `items`.
- Tombstone/recently-deleted count/hash matches export and mirror deleted-state projection.
- Chrome/MV3 import sees the same `fullBundle.v2` read-only projection counts.
- Request/receipt ledger counts and hashes match exported receipt evidence.
- F15 restart convergence is bounded/idempotent and reports already-current/no-op when state matches.
- No orphan `folderState.items` bucket exists.
- UI/user-visible synced state is based on canonical projection plus receipt/parity state, not optimistic
  request success alone.

## Current Result

This slice proves the read-only harness and criteria. It does not by itself prove live parity.

Current statuses:

- Desktop canonical folders: `requires live diagnostic`
- Canonical `folder_bindings`: `requires live diagnostic`
- Tombstones/recently deleted: `requires live diagnostic`
- Render mirror: `requires live diagnostic`
- Chrome/MV3 projection: `requires live diagnostic`
- `fullBundle.v2` export/import projection: `requires live diagnostic`
- Request/receipt ledgers: `requires live diagnostic`
- Restart convergence records: `requires live diagnostic`

No mismatches were found in product source by this validator-only slice. Live mismatches remain unknown
until the read-only diagnostic is run against current Desktop/export state.

## Boundaries Held

- No product source edited.
- No product state mutated.
- No `productSyncReady` flip.
- No WebDAV/cloud/relay/`fullBundle.v3`.
- No Chat Saving WebDAV/cloud/archive CAS.
- No fallback added.
- Durable/hash gates, conflict runtime, `requireContext`, restart convergence, reviewed request path,
  and the F11 render-only boundary were not weakened.
- F11 render mirror was not changed into a writer.

## Next Required Action

Run a live read-only Operational.5 parity diagnostic using this harness contract against Desktop
canonical SQLite, the render mirror, the latest `fullBundle.v2` export/import projection, request/receipt
ledgers, and restart convergence summaries. If any required live count/hash is not safely exposed, add a
minimal diagnostic-only read API; otherwise proceed with live read-only evidence before any
productSyncReady readiness decision.
