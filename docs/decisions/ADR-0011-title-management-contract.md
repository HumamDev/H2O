# ADR-0011: Title Management Contract

- Status: Accepted for Stage 1A foundation
- Date: 2026-07-21
- Scope: Pure contract and executable validation only

## Context

Native ChatGPT title handling and Studio title handling currently expose overlapping ideas with incompatible version conventions. Native legacy data uses numeric version `1`; Studio legacy data uses string version `"1.0.0"`. Neither version expresses independent title and emoji authority, trusted Native confirmation, route transaction identity, durable migration evidence, or deterministic cross-surface merge behavior.

Stage 0B established the delivered title-interface baseline and proved that `9B0a`, `9B1a`, and `9C1a` are active while `9D1a` remains disabled. Stage 1A defines a shared, pure contract without integrating it into those runtimes. No storage, migration, network, DOM, extension, or browser behavior changes in this stage.

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

### Descriptor-safe normalization

All arbitrary, imported, compatibility, legacy, and migration-candidate records enter through `normalizeRecord`. The normalizer reads own data-property descriptors only, rejects accessors and inherited authority, catches Proxy failures, bounds strings and safe integers, traverses only allowlisted structures, and never retains the input object. Functions, symbols, bigint values, mutable unsupported containers, and self-declared Native confirmations fail closed or are stripped.

Persisted records use `hydrateCanonicalRecord` only when a trusted adapter provides branded durable persistence evidence. A persisted Native confirmation survives restart only when its structure, operation, route generation, receipt provenance, supersession state, and timestamp all verify. Otherwise hydration degrades to ordinary untrusted normalization and removes the confirmation.

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

Native and Studio use the same Hebrew/Arabic-script RTL detection. Display formatting places emoji before LTR titles and after RTL titles, collapses duplicate whitespace, omits unknown emoji, and returns `{ text, dir }`.

Later renderer integration must preserve semantic direction, keyboard access, visible focus, screen-reader names, and non-color state cues. Stage 1A implements only the pure text-and-direction decision.

### Route normalization

Route snapshots recognize `/c/<chatId>` and `/g/<project-or-gpt-id>/c/<chatId>`. They include route kind, chat ID, project ID, surface, route key, generation, internal-H2O flag, and a bounded redacted pathname shape. Generation increases only when the route key changes.

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

This decision does not claim runtime integration.

- Stage 1B will design adapters and integration sequencing around current authoritative runtime behavior.
- `9B0a` will evolve toward canonical coordination only through a separately reviewed runtime stage.
- `9B1a` will move toward a passive renderer that consumes canonical display output.
- `9C1a` will move toward a transactional editor that produces explicit intent and waits for trusted confirmation.
- `9D1a` will be decomposed into suggestion and explicit emoji-intent responsibilities; it remains disabled.
- Native and Studio persistence adapters, readback, trusted evidence creation, migrations, accessibility UI, cross-surface synchronization, rollback presentation, and telemetry remain deferred.

No existing title module, configuration, generated extension artifact, browser state, storage, or diagnostic state is changed by Stage 1A.
