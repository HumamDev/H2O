# Labels / Tags / Categories / Classification Metadata Sync

## Phase 19 Closeout / Readiness Audit (three live-proven applied types)

Date: 2026-06-29

## Scope

Audit/consolidation only. No new sync behavior, no new applied request types, no mutation UI, no
transport. This audit consolidates the safe metadata sync loop now that THREE applied request types
are live-proven, maps each boundary invariant to a real source enforcement anchor + its proving
validator, confirms the applied-type allowlist is exactly those three types, and records the
remaining deferred surface.

## Live-Proven Applied Request Types (exactly three)

- `chat-category-assign`
- `chat-category-clear`
- `chat-label-bind`

The applied-type allowlist is enforced as an exact set in
`src-surfaces-base/studio/sync/folder-sync.tauri.js`:

```
var APPLIED_LIBRARY_METADATA_MUTATION_REQUEST_ACTIONS = {
  'chat-category-assign': true,
  'chat-category-clear': true,
  'chat-label-bind': true
};
```

Apply is gated by `if (APPLIED_LIBRARY_METADATA_MUTATION_REQUEST_ACTIONS[action] !== true)` — every
other action is deferred. No fourth type is applied.

## Context Commits

- Phase 11 closeout/readiness audit: `b16fa29`
- Phase 12 chat-category-clear design: `d2b6816`
- Phase 13 chat-category-clear implementation: `e463a88`
- Phase 14 chat-category-clear export-lock + live-consistency chain: `ecb0d27`, `3075014`, `189ccd9`,
  `1036238`, `8fc2f2f`, `b9ef22b`
- Phase 15 readiness audit: `ac49df1`
- Phase 16 next-request-type design audit: `019eee6`
- Phase 17 chat-label-bind implementation: `0b58d9e`
- Phase 18 chat-label-bind live proof: `0f65543`
- WebDAV / Cloud / Relay architecture memo: `e377f91d598934ca9f6d5a6e5c0dfb2597902a02`

## Evidence Spine

- Runtime spine: the Phase 18 live proof
  (`tools/validation/sync/validate-labels-tags-categories-phase18-chat-label-bind-live-proof.mjs`,
  commit `0f65543`) plus the Phase 14G/14H live apply/receipt/canonical-consistency proofs
  (`validate-labels-tags-categories-phase14g-live-runtime-apply-consistency.mjs`,
  `validate-labels-tags-categories-phase14h-live-apply-receipt-canonical-consistency.mjs`) and the
  Phase 9 end-to-end runtime proof for the original assign loop.
- Diagnostics spine: the Phase 1 diagnostics
  (`validate-labels-tags-categories-phase1-diagnostics.mjs`).

## Full Safe Loop Walkthrough (end to end, all three applied types)

The three applied types share one chain shape; only the Desktop apply store call differs.

| # | Stage | Phase / commit | Proving validator |
| --- | --- | --- | --- |
| 1 | Chrome request export (`libraryMetadataMutationRequests[]`, request-only) | Phase 6 / `91e1c95` (+ clear `e463a88`, bind `0b58d9e`) | `validate-labels-tags-categories-phase6-chrome-request-export.mjs`, `validate-labels-tags-categories-phase14e-request-export-sanitizer.mjs` |
| 2 | Desktop validate + apply (allowlist = the three types) | Phase 7 / `8addf3a`, Phase 13 / `e463a88`, Phase 17 / `0b58d9e` | `validate-labels-tags-categories-phase7-desktop-apply-receipts.mjs`, `validate-labels-tags-categories-phase13-chat-category-clear.mjs`, `validate-labels-tags-categories-phase17-chat-label-bind.mjs` |
| 3 | Desktop receipt export (`libraryMetadataMutationReceipts[]`) | Phase 7 / `8addf3a` | `validate-labels-tags-categories-phase14h-live-apply-receipt-canonical-consistency.mjs` |
| 4 | Chrome receipt import + request resolution (read-model only) | Phase 8 / `2b6116f` | `validate-labels-tags-categories-phase8-chrome-receipt-import.mjs` |
| 5 | Desktop canonical export (`desktopCanonicalLibraryMetadata`) | Phase 2 / `02dbf4ef609cfe3d03cc3d6521040c76d72d8c35` | `validate-labels-tags-categories-phase2-desktop-export.mjs` |
| 6 | Chrome projection refresh / display parity | Phase 3 / `60d3c7404fd9a7f574d65dd770f26e0d72ff9e45`, Phase 5 / `93d07f3` | `validate-labels-tags-categories-phase3-chrome-import-display.mjs`, `validate-labels-tags-categories-phase5-display-parity.mjs` |
| 7 | Read-only status surface (`libraryMetadataSyncStatus`) | Phase 10 / `daf28cc` | `validate-labels-tags-categories-phase10-status-display.mjs` |
| — | Live runtime apply/clear/bind consistency (spine) | Phase 14 / `b9ef22b`, Phase 18 / `0f65543` | `validate-labels-tags-categories-phase14g-live-runtime-apply-consistency.mjs`, `validate-labels-tags-categories-phase18-chat-label-bind-live-proof.mjs` |

## Boundary Invariants

Each invariant lists where it is enforced (file + a real source token), the phase/commit that
introduced or proved it, and the validator(s) that prove it.

### Only chat-category-assign, chat-category-clear, and chat-label-bind are applied

- Enforced: `src-surfaces-base/studio/sync/folder-sync.tauri.js` —
  `APPLIED_LIBRARY_METADATA_MUTATION_REQUEST_ACTIONS` with `'chat-category-assign': true`,
  `'chat-category-clear': true`, `'chat-label-bind': true`; apply gated by
  `APPLIED_LIBRARY_METADATA_MUTATION_REQUEST_ACTIONS[action] !== true`.
- Introduced/proved: Phase 13 `e463a88` (clear), Phase 17 `0b58d9e` (bind).
- Proven by: `validate-labels-tags-categories-phase13-chat-category-clear.mjs`,
  `validate-labels-tags-categories-phase17-chat-label-bind.mjs`,
  `validate-labels-tags-categories-phase14g-live-runtime-apply-consistency.mjs`.

### Chrome remains request-only

- Enforced: `src-surfaces-base/studio/sync/folder-import.mv3.js` — request shape carries
  `requestOnly: true`, `desktopApply: false`, `noLocalApply: true`.
- Introduced: Phase 6 / `91e1c95`.
- Proven by: `validate-labels-tags-categories-phase6-chrome-request-export.mjs`.

### Chrome remains read-only over canonical metadata

- Enforced: `src-surfaces-base/studio/sync/folder-import.mv3.js` — `readOnlyProjection: true`.
- Introduced: Phase 3 / `60d3c7404fd9a7f574d65dd770f26e0d72ff9e45`.
- Proven by: `validate-labels-tags-categories-phase3-chrome-import-display.mjs`,
  `validate-labels-tags-categories-phase10-status-display.mjs` (`chromeReadOnlyCanonical: true`).

### Desktop remains canonical authority

- Enforced: `src-surfaces-base/studio/sync/library/library-metadata-export-projection.tauri.js` —
  the projection is the Desktop-authoritative read model; Desktop receipts carry `desktopAuthority: true`.
- Introduced: Phase 2 / `02dbf4ef609cfe3d03cc3d6521040c76d72d8c35`.
- Proven by: `validate-labels-tags-categories-phase2-desktop-export.mjs`,
  `validate-labels-tags-categories-phase14h-live-apply-receipt-canonical-consistency.mjs`.

### No Chrome canonical mutation

- Enforced: `src-surfaces-base/studio/sync/folder-import.mv3.js` — `noChromeCanonicalMutation: true`
  across request, receipt import, and status paths.
- Introduced: Phase 6 / `91e1c95`, Phase 8 / `2b6116f`.
- Proven by: `validate-labels-tags-categories-phase8-chrome-receipt-import.mjs`,
  `validate-labels-tags-categories-phase18-chat-label-bind-live-proof.mjs`.

### No Desktop canonical mutation beyond the three approved apply paths

- Enforced: the only canonical writes are `categories.assignChat`, `categories.clearChat`, and
  `labels.bindChat`, each reached only when the action is in
  `APPLIED_LIBRARY_METADATA_MUTATION_REQUEST_ACTIONS`; the projection reports `canonicalMutation: false`
  (read-only) in `library-metadata-export-projection.tauri.js`.
- Introduced: Phase 7 / `8addf3a`, Phase 13 / `e463a88`, Phase 17 / `0b58d9e`.
- Proven by: `validate-labels-tags-categories-phase14f-clear-apply-consistency.mjs`,
  `validate-labels-tags-categories-phase14g-live-runtime-apply-consistency.mjs`.

### chat-category-clear and chat-label-bind are non-destructive

- Clear means category assignment becomes NULL: `src-surfaces-base/studio/store/categories.tauri.js`
  — `clearChat` runs `UPDATE chats SET category_id = NULL ... WHERE id = ?`. It does not delete a
  chat, a category, or any metadata row.
- Bind means add a label binding only: `src-surfaces-base/studio/store/labels.tauri.js` — `bindChat`
  runs `INSERT OR IGNORE INTO label_bindings (chat_id, label_id, assigned_at) VALUES (?, ?, ?)`. It
  does not mutate the label catalog (no insert/update/delete on the `labels` table) and deletes nothing.
- Introduced: Phase 13 / `e463a88`, Phase 17 / `0b58d9e`.
- Proven by: `validate-labels-tags-categories-phase13-chat-category-clear.mjs`,
  `validate-labels-tags-categories-phase17-chat-label-bind.mjs`.

### Destructive-shaped actions remain blocked/deferred

- Enforced: `libraryMetadataMutationDeferredDestructiveAction` (Chrome) and
  `libraryMetadataMutationRequestDestructiveAction` (Desktop) use
  `/(delete|remove|unbind|clear|purge|hard-delete)/i`, with the only exact-match carve-out being
  `NON_DESTRUCTIVE_CLEAR_ALLOWLIST = new Set(['chat-category-clear'])` in both
  `folder-sync.tauri.js` and `folder-import.mv3.js`. Every other `*-clear`/`*-delete`/`unbind`/`purge`
  stays blocked.
- Introduced: Phase 6 / `91e1c95`, Phase 13 / `e463a88`.
- Proven by: `validate-labels-tags-categories-phase13-chat-category-clear.mjs`,
  `validate-labels-tags-categories-phase17-chat-label-bind.mjs`.

### No deletion (all no-delete flags preserved)

- noHardDelete / noPurge / noChatDelete / noSnapshotDelete / noAssetDelete / noLabelDelete /
  noTagDelete / noCategoryDelete / noMetadataDelete remain `true` across request, apply, receipt, and
  status payloads. No delete path exists in any metadata module.
- Proven by: Phase 7/8/13/14/17/18 validators (no-delete flag + non-destructive store assertions).

### No WebDAV/cloud/relay transport

- Enforced: transport remains local sync-folder JSON only (`chrome-latest.json` Chrome→Desktop,
  `latest.json` Desktop→Chrome). No WebDAV/cloud/relay code path is added; the memo
  `e377f91d598934ca9f6d5a6e5c0dfb2597902a02` remains a deferred note.
- Proven by: this Phase 19 audit (absence check) + `validate-f19-sync-hardening.mjs`,
  `validate-f15-cutover.mjs`.

### Product metadata sync remains NOT READY globally

- Enforced: `productSyncReady: false` across every metadata module and surface; the status surface
  shows the limited applied-type set.
- Proven by: Phase 2/7/8/10/14/18 validators.

## Confirmed Blocked / Deferred Actions

Every action below is NOT in the applied allowlist and remains blocked/deferred:

- `chat-label-clear`
- `chat-label-remove`
- `chat-label-unbind`
- all tag actions (`chat-tag-bind`, tag clear/remove/unbind)
- catalog create/rename/delete (`label-create`, `tag-create`, `category-create`, renames, deletes)
- classification expansion (`classification-set`)
- generic clear/delete/remove/unbind/purge/hard-delete
- WebDAV/cloud/relay transport

## Deferred Surface

- label clear/remove/unbind
- tag bind/clear/remove/unbind
- label/tag/category catalog create/rename/delete
- classification expansion
- destructive actions
- live proof for any not-yet-captured type
- WebDAV/cloud/relay transport
- broader product metadata sync closeout

## Validator Suite (closeout gate)

```bash
node tools/validation/sync/validate-labels-tags-categories-phase19-readiness-audit.mjs
node tools/validation/sync/validate-labels-tags-categories-phase18-chat-label-bind-live-proof.mjs
node tools/validation/sync/validate-labels-tags-categories-phase17-chat-label-bind.mjs
node tools/validation/sync/validate-labels-tags-categories-phase16-next-request-type-design-audit.mjs
node tools/validation/sync/validate-labels-tags-categories-phase15-readiness-audit.mjs
node tools/validation/sync/validate-labels-tags-categories-phase14h-live-apply-receipt-canonical-consistency.mjs
node tools/validation/sync/validate-labels-tags-categories-phase14g-live-runtime-apply-consistency.mjs
node tools/validation/sync/validate-labels-tags-categories-phase14f-clear-apply-consistency.mjs
node tools/validation/sync/validate-labels-tags-categories-phase14e-request-export-sanitizer.mjs
node tools/validation/sync/validate-labels-tags-categories-phase14b-export-lock-diagnosis.mjs
node tools/validation/sync/validate-labels-tags-categories-phase13-chat-category-clear.mjs
node tools/validation/sync/validate-labels-tags-categories-phase12-chat-category-clear-design.mjs
node tools/validation/sync/validate-labels-tags-categories-phase11-closeout-readiness-audit.mjs
node tools/validation/sync/validate-f19-sync-hardening.mjs
node tools/validation/sync/validate-f15-cutover.mjs
```

All of the above are green as of this audit.

## Readiness Verdict

Safe metadata sync loop for `chat-category-assign`, `chat-category-clear`, and `chat-label-bind`:
READY FOR REVIEW. The full request → apply → receipt → resolution → canonical export → projection
refresh → read-only status chain is implemented and live-proven for all three types, with every
boundary invariant enforced in source and covered by a validator.

## Product Metadata Sync Verdict

Product metadata sync: NOT READY globally. Only the three applied types above are runtime-proven and
applied; the deferred surface remains out of scope.

## Recommended Phase 20

Either (1) a design-only review of the next safe non-destructive type — the natural next candidate is
`chat-tag-bind` (mirror of `chat-label-bind`, adding a chat↔tag binding only via a non-destructive
`tags.bindChat` insert), design only and still deferred for apply; or (2) promote live-CDP capture
for any applied type not yet captured against real Chrome + Desktop surfaces. Either path must remain
read-only on Chrome canonical metadata, must not broaden the applied allowlist beyond the three proven
types until implemented and proven, must not add destructive actions, and must not add
WebDAV/cloud/relay transport.
