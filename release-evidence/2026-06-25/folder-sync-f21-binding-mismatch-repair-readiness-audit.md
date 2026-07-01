# Folder Sync — Phase F21: binding-mismatch Repair-Loop Readiness Audit (design-only)

Date: 2026-07-01

## Status

DESIGN / READINESS AUDIT ONLY. No runtime behavior was changed. No binding repair was implemented. No
chat was bound or unbound. No product SQLite write, no mirror write, no tombstone write, no folder
delete/purge, no chat content touched. `productSyncReady` was NOT flipped. No `fullBundle.v3` was minted.
No WebDAV/cloud/archive CAS. No Chat Saving / archive package code was touched. No product source was
modified. This slice opens the still-blocked `binding-mismatch` drift class the way F14 opened sortOrder:
it audits the real chat-folder binding read/write paths, confirms the sanctioned request/receipt repair
channel, classifies binding mismatch types, decides ownership, and specifies the gate that must exist
BEFORE any binding repair. `binding-mismatch` remains BLOCKED after F21.

## Context

- F20 folder-sync lane readiness ledger committed: `aa4958e` (`binding-mismatch` = blocked; separate
  reviewed repair/request-loop phase required).
- F19 sortOrder readiness gate: `44ace94`. F18 negative-path harness: `62c62b3`. F17 accepted apply
  harness: `c3b24ba`. F16 conflict matrix: `0a80b99`. F15 sortOrder absorption spec: `cc0bda9`.
- `productSyncReady` remains false; public/premium blocked; real remote WebDAV deferred; `fullBundle.v3`
  not minted; Chat Saving WebDAV/cloud/archive CAS blocked.

## Cross-Surface Requirement (carried, not implemented in F21)

Any future binding repair must preserve parity across Desktop Studio, Chrome / native extension Studio
across MULTIPLE DEVICES, and the mobile app: Desktop SQLite canonical, the mirror a derived per-surface
render projection, hash-only / redacted identity + diagnostics. Mobile, remote WebDAV, and Chat Saving
CAS are NOT implemented here. Chrome / native extension and mobile remain non-canonical proposers.

## 1. Chat-Folder Binding Read/Write Path Audit (grounded in real source)

- Canonical binding store (SQLite): `folder_bindings` table (`chat_id` PRIMARY KEY, `folder_id`,
  `assigned_at`), defined in `apps/studio/desktop/src-tauri/src/lib.rs`. V1 enforces ONE-FOLDER-PER-CHAT
  via `folder_bindings.PRIMARY KEY (chat_id)`. This is the canonical source of chat placement.
- Canonical binding WRITES (Desktop only): `bindChat` → `INSERT OR REPLACE INTO folder_bindings
  (chat_id, folder_id, assigned_at)`; `unbindChat` → `DELETE FROM folder_bindings WHERE chat_id = ? AND
  folder_id = ?`. Folder delete cascades `DELETE FROM folder_bindings WHERE folder_id = ?` (bindings
  only; chats are never deleted).
- Canonical binding READS: `getCanonicalChatFolderBindingForChat`
  (`SELECT folder_id, assigned_at FROM folder_bindings WHERE chat_id = ?`), `listChats`
  (`SELECT chat_id, assigned_at FROM folder_bindings WHERE folder_id = ?`),
  `listCanonicalChatFolderBindings`, `moveCanonicalChatFolderBinding`, `canonicalBindingStoreIdentity`.
- Mirror binding projection: `FOLDER_STATE_DATA_KEY.items` (`items[folderId]` → array of chat ids) — a
  DERIVED render projection of the canonical bindings, used for rendering/export. The F5/F6 drift probe
  classifies `binding-mismatch` by comparing `sorted(canonicalBindings[folderId])` vs
  `sorted(mirror.items[folderId])` (hash-only).
- Export/import binding projection: export projects canonical bindings; import is merge-only and marks
  folder-binding propagation deferred (`library-propagation-chat-folder-bindings-deferred`); import does
  not redefine canonical bindings.
- Chrome / native / mobile participation: the native ChatGPT owner and Chrome extension do not write
  canonical `folder_bindings`; they PROPOSE via the request channel below. Native/mobile are
  non-canonical.

## 2. Sanctioned Repair Channel (grounded in real source)

The ONLY sanctioned binding change/repair channel is the existing request loop in
`src-surfaces-base/studio/sync/folder-sync.tauri.js`:

- `CHAT_FOLDER_BINDING_REQUEST_SCHEMA = 'h2o.studio.chat-folder-binding-request.v1'` (intent
  `chat-folder-binding-request`), with the derived transport + apply variants
  `h2o.studio.chat-folder-binding-request.v1.transport-ingest.v1` and
  `h2o.studio.chat-folder-binding-request.v1.desktop-auto-apply.v1`.

Rules confirmed:

- repair flows request → Desktop validate → Desktop apply to canonical `folder_bindings` → result/receipt
  → mirror re-projection → Chrome/native/mobile read-only import.
- NO direct mirror-only binding repair (writing `FOLDER_STATE_DATA_KEY.items` without a canonical apply
  is forbidden — the mirror is derived, not authoritative).
- NO Chrome / native / mobile canonical mutation (proposers never write `folder_bindings`).
- if a future binding repair needs a dedicated RECEIPT schema distinct from the existing metadata-mutation
  receipt, it is minted as part of the future gate (F22+), not in F21.

## 3. Binding Mismatch Classification

| Class | Meaning | Disposition |
| --- | --- | --- |
| missing-mirror-item | canonical `folder_bindings` row absent from `mirror.items` | observe; re-project from canonical (render-only) |
| extra-mirror-item | `mirror.items` entry with no canonical binding | observe; drop on re-projection (render-only); never delete canonical |
| orphan-folder-binding | binding references a folder id not in the folder catalog | request review; blocked from auto-repair |
| orphan-chat-binding | binding references a chat id with no live chat | request review; blocked from auto-repair; never delete chat |
| tombstoned-folder-binding | binding references a tombstoned/deleted folder | request review; blocked; no resurrect |
| duplicate-binding | multiple canonical bindings for one chat (violates one-folder-per-chat) | request review; Desktop-apply resolves via PRIMARY KEY (chat_id) |
| cross-device-stale-proposal | a proposer's binding request is stale vs current canonical | reject stale; re-propose against current canonical |
| privacy-redaction-sensitive-payload | request/diagnostic payload carries raw identifiers | reject; require hash-only / redacted payload |

## 4. Safe vs Dangerous Binding Drift

- SAFE TO OBSERVE ONLY: `missing-mirror-item`, `extra-mirror-item` — render-only projection artifacts;
  reconcilable by re-projecting the mirror from canonical (never touching canonical bindings/chats).
- SAFE TO REQUEST REVIEW: `orphan-folder-binding`, `orphan-chat-binding`, `tombstoned-folder-binding`,
  `duplicate-binding`, `cross-device-stale-proposal` — surfaced as a request for Desktop-mediated review.
- UNSAFE TO AUTO-REPAIR: any change to canonical `folder_bindings` (bind/unbind/move) — could move or
  drop a chat's placement; must NOT be auto-applied from a mirror rebuild.
- BLOCKED UNTIL RECEIPT-CONFIRMED DESKTOP APPLY: every canonical binding change waits on the
  request → Desktop validate → apply → receipt path; nothing canonical changes without a confirmed
  Desktop apply.

## 5. Ownership

- Desktop SQLite `folder_bindings` is CANONICAL for chat-folder bindings (source-confirmed: it is the
  only path that writes bindings, and enforces one-folder-per-chat via `PRIMARY KEY (chat_id)`).
- `FOLDER_STATE_DATA_KEY.items` is a DERIVED render projection of canonical bindings; never authoritative.
- Chrome / native extension and mobile are NON-CANONICAL proposers (they submit
  `chat-folder-binding-request.v1`, they do not write canonical bindings), unless a future gate
  explicitly redesigns that.

## 6. Required Future Gate Before Any Binding Repair

A future binding-repair implementation may proceed ONLY through:

- a request envelope (`chat-folder-binding-request.v1` family), hash-only / redacted, per-peer/per-device
  identity.
- Desktop VALIDATION (schema, chat/folder existence, tombstone state, one-folder-per-chat, idempotency,
  stale-basis).
- Desktop APPLY to canonical `folder_bindings` only (bind/unbind/move via the existing store path).
- a RECEIPT (applied/skipped/rejected, `canonicalAuthority: desktop-sqlite`, no-destructive-mutation
  marker).
- mirror RE-PROJECTION from canonical after the apply (write-through; mirror never leads).
- invariants: NO chat delete; NO folder delete/purge; NO tombstone mutation unless a separate explicitly
  scoped phase authorizes it.
- proofs: a live dry-run proof (no write), a controlled apply proof (single gated apply), and a
  post-apply read-only F5/F6 drift probe proving `binding-mismatch` reconverges with `writeCallCount:0`.

## 7–12. Preserved Postures

- `binding-mismatch` remains BLOCKED after F21 (audit only; no repair).
- `field-mismatch:sortOrder` remains GATED (committed F11 helper still blocks it).
- `productSyncReady` remains `false` / NOT READY TO FLIP.
- Chat Saving WebDAV/cloud/archive CAS remains BLOCKED (no `fullBundle.v3`, no CAS, no archive code).
- Real remote WebDAV remains deferred; public/premium sync remains blocked.
- Desktop remains canonical; Chrome / native extension and mobile stay non-canonical future
  cross-surface participants (proposers only); hard delete blocked; folder delete preserves chats.

## Verdicts

- F21: PASS (design/readiness audit only). The binding read/write path audit, the sanctioned
  request/receipt channel, the eight-class mismatch classification, the safe-vs-dangerous drift split,
  the ownership decision, and the required future gate are specified. No binding repair; no runtime
  change; no write; no flip; no source change.
- binding ownership: Desktop SQLite `folder_bindings` canonical; mirror `FOLDER_STATE_DATA_KEY.items`
  derived; Chrome/native/mobile non-canonical proposers.
- sanctioned repair channel: `h2o.studio.chat-folder-binding-request.v1` request loop (Chrome → Desktop
  apply → Chrome), never direct mirror-only repair, never Chrome/mobile canonical mutation.
- `binding-mismatch`: REMAINS BLOCKED. `field-mismatch:sortOrder`: REMAINS GATED.
- `productSyncReady`: remains `false`. Chat Saving WebDAV/cloud/archive CAS: REMAINS BLOCKED. Real remote
  WebDAV: deferred. Public/premium: blocked. The closed Labels / Tags / Categories metadata lane is not
  modified by this folder-sync lane (its four core applied types — `chat-category-assign`,
  `chat-category-clear`, `chat-label-bind`, `chat-tag-bind` — remain; any label/tag Operational unbind
  extension is a separate out-of-scope lane).

## Recommended F22

F22 = a DESIGN-ONLY binding repair request/receipt loop SPECIFICATION (the binding analog of the F15
sortOrder absorption spec; no runtime, no writes, no flip): specify the `chat-folder-binding-request.v1`
→ Desktop validate → apply to canonical `folder_bindings` → receipt → mirror re-projection →
read-only import loop, the request/receipt envelope fields, the §3 conflict/mismatch matrix behavior, the
one-folder-per-chat + no-chat-delete + no-folder-delete invariants, and the validator + live-proof
requirements — so a LATER implementation slice could safely repair `binding-mismatch`. Keep
`binding-mismatch` blocked, `field-mismatch:sortOrder` gated, `productSyncReady` false, and Chat Saving
CAS blocked. F22 modifies no product source and performs no write.
