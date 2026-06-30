# Labels / Tags / Categories / Classification Metadata Sync

## Phase 24 Four-Type Readiness / Closure Audit

Date: 2026-06-29

## Scope

Audit/consolidation only. No new sync behavior, no new applied request types, no mutation UI, no
transport. This audit advances the readiness boundary from three to exactly four live-proven applied
request types, maps each loop + invariant to a real source enforcement anchor and its proving
validator, documents the `chat-tag-bind` proof/dev-only fixture, and records the remaining deferred
surface.

## Live-Proven Applied Request Types (exactly four)

- `chat-category-assign`
- `chat-category-clear`
- `chat-label-bind`
- `chat-tag-bind`

The applied-type allowlist remains exactly these four types, enforced as an exact set in
`src-surfaces-base/studio/sync/folder-sync.tauri.js`:

```
var APPLIED_LIBRARY_METADATA_MUTATION_REQUEST_ACTIONS = {
  'chat-category-assign': true,
  'chat-category-clear': true,
  'chat-label-bind': true,
  'chat-tag-bind': true
};
```

Apply is gated by `APPLIED_LIBRARY_METADATA_MUTATION_REQUEST_ACTIONS[action] !== true`. There is no
fifth applied type, and no broader applied request type is documented as ready.

## Context Commits

- Phase 20 closure gate: `7f5746b`
- Phase 22 deterministic `chat-tag-bind` implementation/proof: `57fe33e`
- Phase 23a fixture-backed live `chat-tag-bind` proof: `eeb896b`
  (`release-evidence/2026-06-25/labels-tags-categories-phase23a-chat-tag-bind-fixture-live-proof.md`,
  `tools/validation/sync/validate-labels-tags-categories-phase23a-chat-tag-bind-fixture-live-proof.mjs`).
- WebDAV / Cloud / Relay architecture memo: `e377f91d598934ca9f6d5a6e5c0dfb2597902a02`

## Per-Type Live-Proven Loop

Each of the four applied types is proven across the full chain, with the only difference being the
Desktop-authoritative store call:

- `chat-category-assign` → `categories.assignChat` (category set)
- `chat-category-clear` → `categories.clearChat` (`category_id = NULL`, non-destructive)
- `chat-label-bind` → `labels.bindChat` (`INSERT OR IGNORE INTO label_bindings`, additive)
- `chat-tag-bind` → `tags.bindChat` (`INSERT OR IGNORE INTO tag_bindings`, additive); applied via
  `applyChatTagBindLibraryMetadataRequest`.

For every type the loop holds:

- **Chrome request-only export** — `requestOnly: true`, `desktopApply: false`, `noLocalApply: true`.
- **Desktop authoritative validation/apply** — gated by the four-type allowlist; applies only through
  the canonical store path above.
- **canonical post-write verification** — Desktop re-reads canonical state and recomputes the
  projection basis to confirm the write landed before issuing an `applied` receipt.
- **Desktop receipt export** — `libraryMetadataMutationReceipts[]`
  (`h2o.studio.library-metadata-mutation-receipt.v1`).
- **Chrome read-only receipt import/resolution** — receipts imported read-only; the matching pending
  request is resolved in the read-model/outbox only.
- **projection count/hash update** — the relevant count (`chatCategoryAssignmentCount` /
  `chatLabelBindingCount` / `chatTagBindingCount`) and `hashes.projection` advance on apply.
- **replay/idempotency via `skipped_duplicate`** — replay detects already-applied from current
  canonical state and emits `skipped_duplicate` with no redundant write.
- **no Chrome canonical mutation** — `noChromeCanonicalMutation: true` throughout.
- **no delete/purge/destructive behavior** — all no-delete flags `true`; clear is a NULL-set, binds
  are additive `INSERT OR IGNORE`; the destructive guard `/(delete|remove|unbind|clear|purge|hard-delete)/i`
  is intact with the only carve-out being `NON_DESTRUCTIVE_CLEAR_ALLOWLIST = new Set(['chat-category-clear'])`.
- **privacy redaction** — receipts/requests/projection are hash/status/count only; no raw chat
  titles, no raw chat content, no raw label/tag/category names, no account-linked metadata.

### Proving validators

| Type | Deterministic | Live |
| --- | --- | --- |
| `chat-category-assign` | phase7 / phase9 | phase14g / phase14h |
| `chat-category-clear` | phase13 / phase14f | phase14g / phase14h |
| `chat-label-bind` | phase17 | phase18 |
| `chat-tag-bind` | phase22 (`57fe33e`) | phase23a (`eeb896b`) |

## chat-tag-bind Proof/Dev-Only Fixture (explicit record)

The Phase 23a live `chat-tag-bind` proof used a proof/dev-only Desktop-local fixture tag because the
live Desktop database had `tagCatalogCount: 0` (no existing tag to bind). The fixture:

- was seeded through the existing local store API `H2O.Studio.store.tags.upsert` (a normal Desktop
  product capability), NOT through any metadata-sync request;
- involved NO `tag-create` sync request — `tag-create` is not on the applied allowlist;
- involved NO Chrome tag catalog mutation — Desktop is the canonical authority; the fixture is
  Desktop-local and seeded by the proof harness, never by Chrome;
- was NO product behavior change — the fixture helper lives in the proof tooling, not product code;
- left `productSyncReady: false` — product metadata sync remains globally NOT READY.

With the fixture present, the live proof captured the full loop: `chatTagBindingCount` `0` → `1`,
projection hash change, Chrome read-only receipt import, and `skipped_duplicate` on replay.

## Deferred Surface (remains blocked)

- `chat-label-clear`
- `chat-label-remove`
- `chat-label-unbind`
- `chat-tag-clear`
- `chat-tag-remove`
- `chat-tag-unbind`
- label/tag/category catalog create/rename/delete
- classification expansion
- destructive clear/delete/remove/unbind/purge/hard-delete actions
- WebDAV/cloud/relay transport
- broader metadata sync closeout

Each is NOT on the applied allowlist. The exact-match `NON_DESTRUCTIVE_CLEAR_ALLOWLIST` carve-out is
unchanged at `['chat-category-clear']`, so every other `*-clear`/`*-unbind`/`*-remove`/`*-delete`
stays blocked by the destructive guard.

## Validator Suite (closeout gate)

```bash
node tools/validation/sync/validate-labels-tags-categories-phase24-four-type-readiness-audit.mjs
node tools/validation/sync/validate-labels-tags-categories-phase23a-chat-tag-bind-fixture-live-proof.mjs
node tools/validation/sync/validate-labels-tags-categories-phase22-chat-tag-bind.mjs
node tools/validation/sync/validate-labels-tags-categories-phase18-chat-label-bind-live-proof.mjs
node tools/validation/sync/validate-labels-tags-categories-phase17-chat-label-bind.mjs
node tools/validation/sync/validate-labels-tags-categories-phase13-chat-category-clear.mjs
node tools/validation/sync/validate-labels-tags-categories-phase11-closeout-readiness-audit.mjs
node tools/validation/sync/validate-f19-sync-hardening.mjs
node tools/validation/sync/validate-f15-cutover.mjs
```

All prior validators (Phases 11–23a, F19, F15) are green as of this audit.

## Four-Type Loop Classification

- **ready for review**: the four applied types
  (`chat-category-assign`, `chat-category-clear`, `chat-label-bind`, `chat-tag-bind`) — implemented,
  deterministically validated, and live-proven, non-destructive, behind the exact four-type allowlist.
- **internal/dev-only**: the read-only `libraryMetadataSyncStatus` diagnostics surface, the in-process
  proofs, and the Phase 23a proof/dev-only fixture tooling — for review/inspection, not a shipped
  end-user mutation workflow.
- **blocked**: every destructive-shaped action (delete/remove/unbind/clear other than the exact
  `chat-category-clear` carve-out, purge, hard-delete).
- **deferred**: the deferred surface above (label/tag clear/remove/unbind, catalog create/rename/
  delete, classification expansion, WebDAV/cloud/relay transport, broader metadata sync closeout).

## Readiness Verdict

Four-type safe metadata sync loop: READY FOR REVIEW. The full request → apply → receipt → resolution
→ canonical export → projection refresh → read-only status chain is implemented and live-proven for
all four applied types, with every boundary invariant enforced in source and covered by a validator.
The chat-tag-bind live proof is fixture-backed (proof/dev-only), which does not change product
behavior.

## Product Metadata Sync Verdict

Product metadata sync: NOT READY globally. Only the four applied types are runtime-proven and applied;
the deferred surface remains out of scope, and `productSyncReady` stays `false`.

## Recommended Next Phase

Recommend a **stabilization / readiness-lock pass (Phase 25)** that re-locks the closure gate to
exactly four applied types (updating the Phase 20-style scope lock and release-risk categories for the
four-type boundary) before any further request type is considered. Do NOT recommend implementation of
a fifth type before a fresh design gate: the next candidate (e.g. a guarded reversal such as a
non-destructive policy for `chat-tag-unbind`/`chat-label-unbind`, which are currently destructive and
deferred) must first pass a Phase 20-style Gate A design-only audit. Any next step must remain
read-only on Chrome canonical metadata, must not broaden the applied allowlist beyond the four proven
types until designed and proven, must not add destructive actions, and must not add WebDAV/cloud/relay
transport.
