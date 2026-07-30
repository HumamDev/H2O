# ADR-0011: Title Management Contract

- Status: Accepted through Stage 1D; Stage 1E-a source implementation pending canary
- Date: 2026-07-21
- Amended: 2026-07-30
- Scope: Pure contract, source-only DTO boundaries, and executable validation

## Context

Native ChatGPT title handling and Studio title handling currently expose overlapping ideas with incompatible version conventions. Native legacy data uses numeric version `1`; Studio legacy data uses string version `"1.0.0"`. Neither version expresses independent title and emoji authority, trusted Native confirmation, route transaction identity, durable migration evidence, or deterministic cross-surface merge behavior.

Stage 0B established the delivered title-interface baseline and proved that
`9B0a`, `9B1a`, and `9C1a` are active while `9D1a` remains disabled. Stage 1A
defined the shared pure contract. Stage 1B delivered a non-authoritative
classic-script bridge, and Stage 1C added formatter-parity observation while
keeping the legacy display result authoritative. Stage 1D corrected the
browser-neutral source contract and coordinated the accepted public bridge.
Stage 1E-a introduces a disabled-by-default Native runtime adoption path while
retaining the full legacy path for immediate rollback.

## Decision

### Canonical ownership direction

`9B0a` is the future single canonical title-state owner for the Native surface. Studio will consume the same contract through adapters in a later stage. The Stage 1A package supplies decisions and immutable data structures only; it is not a coordinator, adapter, persistence implementation, or renderer.

### Canonical record

Schema version `2` contains one chat identity and two independent field envelopes:

- title;
- emoji.

The record also carries writer-surface metadata, a bounded record timestamp, durability summary, and migration summary. Canonical records are newly allocated, deeply frozen, and branded in a module-private `WeakSet`. No enumerable property, writable flag, caller-provided symbol, or copied object can forge canonical membership.

Native numeric legacy version `1` and Studio string legacy version `"1.0.0"` normalize into schema `2` with conservative authority:

- counter `0`;
- actor ID `legacy`;
- no Native confirmation.

### Canonical authority normalization

All arbitrary, imported, compatibility, legacy, and migration-candidate
canonical records enter through `normalizeRecord`. The normalizer reads own
data-property descriptors only, rejects accessors and inherited authority,
catches Proxy failures, bounds strings and safe integers, traverses only
allowlisted structures, and never retains the input object. Functions, symbols,
bigint values, mutable unsupported containers, and self-declared Native
confirmations fail closed or are stripped.

Persisted records use `hydrateCanonicalRecord` only when a trusted adapter provides branded durable persistence evidence. A persisted Native confirmation survives restart only when its structure, operation, route generation, receipt provenance, supersession state, and timestamp all verify. Otherwise hydration degrades to ordinary untrusted normalization and removes the confirmation.

### Surface-neutral persisted DTO boundary

`normalizePersistedTitleRecordV1` is a separate strict parser for the observed
flat Native and Studio persisted DTO. It accepts only numeric version `1` or
Studio string version `"1.0.0"`, descriptor-safely sanitizes the real flat
fields, preserves supplied priority, confidence, provenance strings, and
timestamps as untrusted DTO data, normalizes an empty emoji to `null`, rejects
unknown or nested authority-bearing fields, and invents no missing metadata.
Its deeply frozen result is deliberately not canonically branded and is not an
input adapter for merge arbitration.

`normalizeTitleBootCacheV1` parses only the observed
`{version, chatId, state, updatedAt, expiresAt}` envelope, delegates `state` to
the persisted DTO normalizer, requires matching chat identity and a structurally
valid later expiry, and performs no read, delete, migration, or expiry side
effect.

These DTO timestamps express record provenance only. Current persisted records
do not contain trusted counters or causal freshness evidence, so equal or newer
timestamps alone cannot create canonical authority. Counter minting and trusted
restart hydration remain explicit later-adapter responsibilities.

### Independent field semantics

Each field carries:

- value and tombstone state;
- provenance source and derived priority;
- confidence;
- independent `FieldVersion`;
- route generation;
- operation ID;
- bounded update timestamp.

Only title may carry Native confirmation.

Field status is exactly:

- `unknown`: `value: null`, `tombstone: false`;
- `present`: non-null value, `tombstone: false`;
- `tombstone`: `value: null`, `tombstone: true`.

A non-null tombstone is invalid. Title tombstones are prohibited and an empty title is invalid. Emoji `""` normalizes to unknown `null`; an explicit emoji clear is the tombstone form.

Unknown input is non-authoritative regardless of its counter. It cannot erase a known title, present emoji, or emoji tombstone. A known incoming value may replace an unknown current value. Newer explicit emoji may replace an older tombstone, and a newer tombstone may clear an older explicit emoji.

### Field ordering and route separation

`FieldVersion` is `{ counter, actorId }`. Merge decisions apply this exact order:

1. structural validity;
2. chat identity;
3. unknown, value, and tombstone semantics;
4. trusted current title-confirmation protection;
5. version counter;
6. explicit source-derived priority;
7. bounded timestamp;
8. actor ID as the final deterministic tie-break.

`compareFieldVersionCounter` compares counters only. Actor ID cannot outrank authority or time. A newer trusted counter may defeat an older higher-priority value because only trusted writers may mint counters.

Route generation is separate transaction-safety metadata. It prevents a pending operation from confirming on a different route; it never orders stored title or emoji values.

No-op merges return the exact current field or record reference. Changed merges allocate and privately brand a new deeply frozen record. Title and emoji merge independently, so a title transaction cannot alter emoji and an emoji update cannot alter title.

### Counter-mint authority

Counter minting requires a capability created by `createMintAuthority` and branded in a second private `WeakSet`. Visible properties cannot be copied to forge it, and the capability is never persisted in a record.

Approved minting contexts are:

- canonical coordination of a verified external Native observation;
- trusted Native rename confirmation;
- accepted explicit user title intent;
- explicit user emoji set or clear;
- approved Studio user edit.

Hydration, compatibility replay, import, legacy normalization, migration-candidate loading, passive synchronization, stale PATCH responses, and arbitrary input cannot mint. The next counter is one greater than the maximum observed safe counter; overflow past `Number.MAX_SAFE_INTEGER` fails closed.

### Trust-boundary assumption

The module-private `WeakSet` brands prevent untrusted record content, imported or serialized JSON, and copied visible object properties from forging canonical membership, counter-mint authority, or durable persistence evidence. They do not create a security sandbox or isolate the package from arbitrary JavaScript that is already permitted to import and call it. `createMintAuthority()` and `summarizeDurableWrites()` are public factories, while `verifyNativeConfirmation()` consumes trusted context supplied by its caller. The contract therefore assumes trusted first-party runtime integrations: these mechanisms enforce data-integrity and API-discipline boundaries, not protection from malicious or compromised importing code. Runtime integration stages must tightly control which modules receive mint capabilities, durable persistence evidence, adapter receipt identities, and trusted hydration context. Untrusted record content must never be promoted into trusted context merely because its visible fields match an expected structure.

### Trusted Native confirmation

Native confirmation is structural data containing operation ID, confirmed value, confirmation timestamp, adapter receipt ID, and route generation. Verification requires matching chat identity, latest pending operation, expected route generation, trusted adapter receipt evidence, non-supersession, and freshness.

`applyTrustedNativeConfirmation` is the sole contract path that sets authoritative confirmation. It verifies evidence, mints the next title counter using a valid capability, updates the title, and preserves emoji unchanged. Studio, import, legacy, compatibility, and arbitrary raw records cannot self-declare confirmation.

### Rename state machine

Rename operations are bounded immutable snapshots of chat, operation, requested title, expected previous title, captured route generation, start time, and explicit intent provenance.

The pure reducer supports `idle`, `preparing`, `pending`, `superseded`, `confirmed`, `failed`, `rolledBack`, and `reconcile`. A rapid second rename makes the newest operation active and records the prior operation as superseded. Responses for a non-current operation are ignored. Route-generation mismatch reconciles rather than confirming. Timeout, HTTP, authentication, and conflict failures are structured. Auto-suggestion provenance cannot create an explicit rename operation. The reducer performs no PATCH or other adapter behavior.

### Display formatting

The pure `isRTL` helper intentionally detects the bounded Hebrew and Arabic
ranges already accepted by the title contract, including Hebrew and Arabic
presentation forms. It is not a comprehensive Unicode bidirectional
classifier.

The original `formatDisplayTitle` behavior remains unchanged for the delivered
Stage 1B bridge and Stage 1C parity probe. The additive
`sanitizeNativeTitle` helper collapses whitespace and removes exactly one
terminal hyphen, en-dash, or em-dash plus `ChatGPT` suffix; internal
dash-separated title content is preserved. A bare title `ChatGPT` remains
valid title content. Trailing zero-width and bidirectional control characters
are not currently treated as whitespace for suffix removal.

The additive `formatNativeDisplayTitle` helper sanitizes first and uses one
bounded deterministic contract parser in every environment. It does not depend
on `Intl.Segmenter`, ICU segmentation, or a host-specific grapheme fallback.
A selected emoji must be exactly one supported sequence: an extended
pictographic component with optional VS16 or Fitzpatrick modifier and optional
ZWJ-linked pictographic components, exactly one regional-indicator pair, or a
valid keycap sequence. Bare ZWJ, bare VS16, lone regional indicators, plain
text, mixed text-plus-emoji values, and multiple separate clusters such as
`"✨✨"` are invalid selected inputs. Invalid selection returns the sanitized
base title without adding or deleting emoji.

For a valid selection, the helper removes repeated identical selected
sequences only from the absolute outer title edges, preserves different and
embedded emojis, and composes the selection exactly once before LTR or after
RTL text. The algorithm intentionally implements only these accepted bounded
forms rather than general Unicode grapheme segmentation.

Later renderer integration must preserve semantic direction, keyboard access,
visible focus, screen-reader names, and non-color state cues. These contract
helpers implement only pure text-and-direction decisions.

### Route normalization

Route snapshots recognize `/c/<chatId>` and `/g/<project-or-gpt-id>/c/<chatId>`. They include route kind, chat ID, project ID, surface, route key, generation, internal-H2O flag, and a bounded redacted pathname shape. Generation increases only when the route key changes.

The pure route helper currently reports the Native surface and does not model
Studio routes. It does not subscribe to route events. Native `9B0a` separately
listens to both `evt:h2o:route:changed` and `h2o:route:changed`; those
compatibility aliases are current runtime delivery details, not field ordering
or a cross-surface route authority.

### Bridge identity and regeneration

The Stage 1B classic bridge attests the exact committed contract source bytes,
its exact accepted export set, generator version, and repository HEAD at build.
Adding these Stage 1D-A exports intentionally changes the source hash and export
count. The existing generated bridge remains the accepted earlier identity
until a separately reviewed bridge-surface decision updates the generator
allowlist, privileged/public exposure policy, identity version if required, and
canonical generated output. Stage 1D-A does not regenerate or claim delivery of
the new helpers.

The historical contract surfaces are recorded separately:

- Stage 1A accepted baseline: 35 exports and 37/37 scenarios.
- Stage 1D additive source revision: 39 exports with all 37/37 Stage 1A
  regression scenarios still passing.

### Delivery revisions

Delivery revision is not persisted field authority. The delivery gate accepts one valid initial revision and then only strictly greater revisions. Bare and `evt:` compatibility aliases that carry the same revision collapse into one accepted logical delivery. Malformed, duplicate, and stale revisions are rejected.

### Durable writes and trusted receipts

`summarizeDurableWrites` consumes settled-result descriptions, not Promise objects. A completed `allSettled` call is not success by itself. All rejected attempts fail. Memory-only success is non-durable. Optional backend failure may coexist with success only when every required durable backend succeeded durably.

Migration receipt IDs have this exact form:

`title-migration-v1:<migrationKind>:<chatId>:<candidateHash>`

The persistence adapter supplies the candidate hash; the pure package performs no hashing. `makeReceipt` and `verifyReceipt` establish immutable structure and deterministic identity only. Structural validity never authorizes deletion.

Deletion authority requires branded persistence evidence produced from required durable backend results, matching candidate identity, acceptable backend, and timestamp. A caller-authored plain object, imported record, memory state, or fallback cache cannot acquire that provenance by copying visible fields.

### Migration reducer and no-delete rule

The migration reducer supports:

1. `idle`;
2. `candidate-normalized`;
3. `write-pending`;
4. `written`;
5. `readback-verified`;
6. `receipt-persisted`;
7. `delete-eligible`;
8. `deleted`;
9. `failed`.

Legacy deletion is permitted only in `delete-eligible`. Write completion without readback is insufficient. Receipt structure without trusted durable provenance is insufficient. A crash after receipt persistence resumes at `delete-eligible` only after both checks pass. Deletion is idempotent and `deleted` is terminal. The contract never writes or deletes storage itself.

### Lifecycle ownership

`createLifecycleScope` registers cleanup callbacks, returns per-registration disposers, destroys in reverse order, continues after errors, reports cleanup errors, makes duplicate destroy a no-op, and immediately cleans registrations made after destruction. This supports rollback of partial initialization.

`createLifecycleOwner` maintains one active scope. Duplicate installation of the same identity returns the existing scope. A successful replacement destroys the previous scope once. A failed candidate installation destroys the failed candidate while leaving the prior owner active. Final destroy removes the active owner. The primitive never accesses DOM, timer, observer, or subscription APIs directly.

## Runtime direction and deferred work

This decision distinguishes the delivered bridge and shadow probe from
authoritative runtime adoption.

- Stage 1B delivered the pure contract bridge without privileged handoff.
- Stage 1C consumes only the existing formatter for shadow parity; the legacy
  formatter remains authoritative.
- Stage 1D-A adds source-only DTO and formatting helpers. No runtime imports or
  consumers are added.
- Stage 1E-a resolves `title.threeSurfaceConvergenceV1` centrally in `9B0a`.
  The flag defaults to `false`; the accepted canonical formatter remains
  opt-in until protected browser canary acceptance. Invalid or unavailable
  flag or bridge state fails closed to the unchanged legacy formatter.
- Under the Stage 1E-a opt-in path, `9B0a` alone invokes
  `sanitizeNativeTitle` and `formatNativeDisplayTitle`. Native ChatGPT
  persists only the sanitized clean base title. A supported submitted edge
  emoji is separated before the Native request, retained as a distinct H2O
  field, and installed canonically only after request success. `displayTitle`
  remains derived inside `9B0a`.
- Stage 1E-a corrects the optimistic rename defect. `9C1a` keeps pending editor
  text locally, awaits `9B0a.renameNative`, and never installs canonical title
  state before successful Native PATCH completion. `9B0a.renameNative` is the
  single confirmed-state installation point; failed, aborted, superseded, and
  route-stale operations cannot update canonical state.
- A `9C1a` editor session immutably captures its opening chat ID, route token,
  route kind, and editor-session ID. `9B0a.renameNative` validates that expected
  identity, the live URL identity, operation freshness, and abort state before
  authentication or PATCH. Teardown and route removal cancel the session and
  abort its request where supported.
- With the convergence flag enabled, confirmed `9C1a` display and native-chat
  `9B1a` tab display consume canonical snapshot strings byte-exactly, without
  independent normalization, title sanitation, or emoji composition. `9B0a`
  alone adapts the existing flag registry setter and compatibility events into
  one coordinator-owned change listener and performs a read-only display
  reprojection. False-to-true and true-to-false changes therefore immediately
  update subscribed consumers without changing title records, Store records, or
  boot-cache records. The full legacy display paths remain executable for
  rollback.
- Stage 1E-b adds only `9B2a Sidebar Title Renderer` plus its loader
  registration, this decision update, and Stage 1E validation. `9B2a` owns no
  title state: it consumes one `9B0a` subscription and operates only for an
  enabled canonical convergence snapshot on the active Native chat route. It
  renders `displayTitle` byte-exactly and has no formatter, flag listener,
  route listener, persistence, PATCH, canonical mutation, or inactive-chat
  synchronization authority.
- For each visible exact-route active-chat anchor in approved `nav` or `aside`
  containers, `9B2a` retains the non-empty Native truncate source and its clean
  text. Renderer-owned CSS hides that exact source and a separate owned visual
  node presents the canonical text. The visual node is outside the Native
  source, never has a truncate class, and does not write `aria-label`, anchor
  `title`, `data-ho-raw-title`, or any `data-ho-raw-title-*` attribute.
- The visual node receives a unique ID and `dir="auto"`; the anchor's
  `aria-labelledby` is temporarily set to that ID only. Original
  `aria-labelledby` presence and value are escrowed in both a `WeakMap` and
  renderer-specific recovery attributes. Recovery restores that escrow only
  while the current value still references the recorded stale H2O visual ID.
  If React has installed a fresh Native value, that value wins and the
  obsolete escrow is cleared without overwriting it. Stale visual nodes and
  source-hiding markers are removed in either case, and repeated recovery is
  idempotent. Native role, direction, keyboard, pointer, click, and
  context-menu behavior remain untouched.
- Stage 1E-b reader invariants are explicit. INV-1 retains the Native truncate
  node and clean base text for clean Native readers. INV-2 permits intentional
  rendered-text readers to see the canonical visual text, but that observation
  cannot outrank or alter canonical base or emoji state on re-entry. INV-3
  permits zero PATCH, Store, boot-cache, localStorage-title, or canonical-state
  writes. Source validation executes real ancestor-based `9B0a` exclusion with
  a negative control and source-replacement window, byte-pinned committed
  `0F6a` selector/helper logic, and the genuine
  `readLibraryTitle → detectTitles → setTitle` re-entry path, including the
  committed Library longer-title heuristic.
- Every visible exact direct `/c/<active-chat-id>` or project-scoped
  `/g/<project-id>/c/<active-chat-id>` duplicate may be adopted, up to six
  rows; excess candidates remain Native and are diagnosed. Route identity
  retains its direct/project family and project ID, so matching chat IDs under
  different projects are not interchangeable. Prefix, suffix, extra-segment,
  malformed, inactive, hidden, disconnected, dialog, `main`, and H2O-owned
  candidates are rejected. Query and fragment components do not affect the
  exact pathname comparison; project-scoped chat routes are not silently
  excluded.
- Flag-off rollback removes all visual effects immediately and restores the
  exact Native source and accessibility state. `9D1a` remains disabled. Stage
  1E-b adds no Studio, persistence, migration, receipt, NativeTitleAdapter, or
  inactive-chat architecture and claims source acceptance only; browser
  acceptance remains a later protected canary. Disabled `9D1a` retains its
  original loader dependency/order metadata and does not depend on `9B2a`.
- `9D1a` will be decomposed into suggestion and explicit emoji-intent responsibilities; it remains disabled.
- Storage migration, NativeTitleAdapter, read-back receipts, Studio
  convergence, and generalized transaction architecture are not part of Stage
  1E-a or Stage 1E-b and remain deferred.

Stages 1E-a and 1E-b are source-only. Stage 1E-b changes only source loader
registration and dependency metadata; neither stage changes a generated
extension artifact, browser state, existing stored title record, or storage
schema.
