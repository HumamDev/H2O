# Labels / Tags / Categories / Classification Metadata Sync

## Phase 25 Maintainer Readiness Decision Gate (four-type loop)

Date: 2026-06-29

## Scope

Decision/audit only. No product logic, no fifth request type, no runtime behavior change, no UI, no
WebDAV/cloud/relay transport. This phase makes a maintainer-facing decision about whether the
four-type loop is ready for review and whether the iteration should close here or continue, and it
re-checks the source allowlist and the deferred surface.

## Live-Proven Applied Request Types (exactly four)

- `chat-category-assign`
- `chat-category-clear`
- `chat-label-bind`
- `chat-tag-bind`

The applied allowlist remains exactly these four types, enforced as an exact set in
`src-surfaces-base/studio/sync/folder-sync.tauri.js`:

```
var APPLIED_LIBRARY_METADATA_MUTATION_REQUEST_ACTIONS = {
  'chat-category-assign': true,
  'chat-category-clear': true,
  'chat-label-bind': true,
  'chat-tag-bind': true
};
```

No fifth type is implemented or documented as ready.

## Context

- Phase 24 four-type readiness audit committed: `4ac80c5`
  (`release-evidence/2026-06-25/labels-tags-categories-phase24-four-type-readiness-audit.md`,
  `tools/validation/sync/validate-labels-tags-categories-phase24-four-type-readiness-audit.mjs`).

## 1. Is the four-type loop ready for maintainer review?

YES — **READY FOR MAINTAINER REVIEW.** All four applied types are implemented, deterministically
validated, and live-proven across the full chain (Chrome request-only export → Desktop authoritative
validate/apply → canonical post-write verification → Desktop receipt export → Chrome read-only
receipt import/resolution → projection count/hash update → replay `skipped_duplicate`), with no Chrome
canonical mutation, no delete/purge/destructive behavior, and hash-only privacy. Every boundary
invariant is enforced in source and covered by a validator; the full prior-validator suite is green.

## 2. Should this iteration close here or continue?

**Close here (stabilization/closeout).** The four applied types form a coherent, complete "safe"
unit: they are all additive or pure reassignment —
`assign` (set), `clear` (reassignment-to-none, `category_id = NULL`), `label-bind` and `tag-bind`
(additive `INSERT OR IGNORE` bindings). There is no remaining purely-additive/non-destructive
candidate: every next candidate moves into a higher-risk class (binding removal, catalog mutation, or
a new canonical model). Continuing should therefore be a deliberate maintainer decision behind a
fresh design gate, not an automatic next step.

## 3. Source Allowlist Re-Check

Confirmed exactly four: `chat-category-assign`, `chat-category-clear`, `chat-label-bind`,
`chat-tag-bind`. No broader applied type.

## 4. Deferred Surface (remains blocked)

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

The exact-match `NON_DESTRUCTIVE_CLEAR_ALLOWLIST = new Set(['chat-category-clear'])` carve-out is
unchanged; every other `*-clear`/`*-unbind`/`*-remove`/`*-delete` stays blocked by the destructive
guard `/(delete|remove|unbind|clear|purge|hard-delete)/i`.

## 5. Maintainer-Facing Release Categories

- **ready-for-review**: the four applied types
  (`chat-category-assign`, `chat-category-clear`, `chat-label-bind`, `chat-tag-bind`) — implemented,
  validated, live-proven, non-destructive, behind the exact four-type allowlist.
- **internal/dev-only**: the read-only `libraryMetadataSyncStatus` diagnostics surface, the in-process
  deterministic proofs, and the Phase 23a proof/dev-only fixture tooling — for review/inspection, not
  a shipped end-user mutation workflow.
- **blocked**: every destructive-shaped action (delete/remove/unbind/clear other than the exact
  `chat-category-clear` carve-out, purge, hard-delete).
- **deferred**: the deferred surface in §4 (label/tag clear/remove/unbind, catalog create/rename/
  delete, classification expansion, WebDAV/cloud/relay transport).

## 6. Is the chat-tag-bind fixture-backed proof acceptable for readiness?

YES, with documented limits. The Phase 23a live `chat-tag-bind` proof used a proof/dev-only
Desktop-local fixture tag because the live database had no existing tag (`tagCatalogCount: 0`). Limits:

- the fixture tag was seeded via the existing local store API `H2O.Studio.store.tags.upsert` — a
  normal Desktop capability — NOT through any metadata-sync request;
- there was no `tag-create` sync request (`tag-create` is not on the applied allowlist);
- there was no Chrome tag catalog mutation (Desktop is canonical authority; the fixture is
  Desktop-local, seeded by the proof harness, never by Chrome);
- there was no product behavior change (the fixture helper lives in proof tooling, not product code);
- product metadata sync remained globally NOT READY (`productSyncReady: false`).

The bind loop itself was genuinely exercised end to end (`chatTagBindingCount` `0` → `1`, projection
hash change, Chrome read-only receipt import, `skipped_duplicate` on replay). The fixture only
provided the binding precondition. Acceptable for review; a maintainer may optionally request a
real-data / CDP confirmation before broad release (see Option C) — a release-confidence step, not a
review blocker.

## 7. Recommended Next Slice

**Option A — stabilization / closeout (RECOMMENDED).** Stop metadata expansion at four types, lock the
scope, and hand the four-type loop to maintainer review. This is the safest next step because the
remaining candidates all leave the additive/non-destructive class.

Not recommended now:

- **Option B — design-only audit for one next candidate**: acceptable only if the maintainer chooses
  to continue; it must be a single candidate behind a fresh Phase 20-style Gate A design-only audit.
- **Option C — collect additional live proof / maintainer screenshots / CDP proof**: a reasonable
  parallel release-confidence step (e.g. a real-data `chat-tag-bind` capture), not blocking for review.

## 8. Candidate Comparison (if the maintainer chooses Option B)

| Candidate | Class | Risk | Verdict |
| --- | --- | --- | --- |
| `chat-tag-unbind` | binding removal (destructive-shaped) | medium — needs a guarded non-destructive "remove exactly one user-added binding" framing + stale-basis policy | design-only candidate; Gate A required |
| `chat-label-unbind` | binding removal (destructive-shaped) | medium — same as above | design-only candidate; Gate A required |
| `chat-tag-clear` | bulk binding removal | higher — removes all of a chat's tag bindings | deferred |
| `chat-label-clear` | bulk binding removal | higher — removes all of a chat's label bindings | deferred |
| catalog create/rename | catalog mutation | higher — mutates the tag/label/category catalog; needs naming/collision policy | deferred |
| classification expansion | new canonical model | highest — introduces a new projection/classification surface | deferred |

If continued, the least-risky design-only next is a **guarded non-destructive reversal**
(`chat-tag-unbind` or `chat-label-unbind`) framed strictly as removing exactly one binding the user
previously added, with the destructive carve-out handled by an explicit exact-match allowlist (never
a regex loosening) and full stale-basis/idempotency handling. This is a DESIGN-ONLY recommendation;
implementation is not recommended until a fresh Gate A design gate is explicitly passed.

## 9. No Implementation Without a Fresh Design Gate

No fifth applied type is recommended for implementation in this phase. Any expansion requires a fresh
Gate A design-only audit, then Gate B validators, then Gate C live proof — in that order — before the
applied allowlist is widened beyond the four proven types.

## Maintainer Readiness Verdict

Four-type safe metadata sync loop: READY FOR MAINTAINER REVIEW. Recommended iteration decision:
close here with a stabilization/closeout pass. Do not expand to a fifth type without a fresh design
gate.

## Product Metadata Sync Verdict

Product metadata sync: NOT READY globally. Only the four applied types are runtime-proven and applied;
the deferred surface remains out of scope and `productSyncReady` stays `false`.
