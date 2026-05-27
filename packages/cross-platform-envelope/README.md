# @h2o/cross-platform-envelope

F10.2.1 — static cross-platform envelope helper for the H2O / Cockpit Pro
platform mesh.

This package encodes the contract defined by F10.2.0 in
[`docs/systems/cross-platform/envelope-v1.md`](../../docs/systems/cross-platform/envelope-v1.md)
(commits `febd731` and `92d3eb3`).

## What it is

- Pure TypeScript module: constants, types, format predicates, canonical
  input formatters, three validators.
- Source-only consumption (no build output). `index.ts` is the entry
  point; `main` and `types` both point at it directly.
- `sideEffects: false`. No top-level statement with side effects.

## What it is not

- **Not a bridge.** No transport, no network, no file watching.
- **Not an envelope constructor.** Producers assemble envelopes
  themselves and validate.
- **Not a hash computer.** Producers compute `dedupeKey`, `payloadHash`,
  and `eventDigest` with their platform's crypto. This package only
  provides the canonical *input* strings (`formatDedupeKeyInput`,
  `formatEventDigestInput`, `formatPayloadHashInput`).
- **Not a dispatcher.** Validators return result objects. They do not
  call consumer code, mutate envelopes, or register handlers.
- **No `register` / `install` / `subscribe` APIs.**
- **No `node:*` imports.** No `globalThis.crypto`. No `fetch`. No
  `Date.now()` inside validators — callers pass `nowIso` explicitly.
- **No mobile write-back. No remote apply.** Forever-no per F10.1 and
  the envelope spec.

## Public API

```ts
import {
  // Constants
  ENVELOPE_SCHEMA, ENVELOPE_VERSION, ENVELOPE_KIND_VERSION,
  ENVELOPE_KINDS, PLATFORM_IDS, SURFACE_KINDS, AUTHORITY_LEVELS,
  REDACTION_CLASSES, OPERATION_INTENTS, BLOCKER_CODES,
  FOREVER_NO_FIELD_NAMES, MOBILE_CACHE_BANNED_FIELDS,
  // Validators
  validateEnvelopeBase,
  validateEnvelopeKind,
  validateEnvelopeAuthority,
  // Predicates
  isSha256Hex, isValidEnvelopeId, isExpired,
  // Formatters (caller hashes the returned string)
  formatDedupeKeyInput, formatEventDigestInput, formatPayloadHashInput,
} from '@h2o/cross-platform-envelope';
```

Validators are intended to be called in order:

1. `validateEnvelopeBase(envelope)` — shape gate.
2. `validateEnvelopeKind(envelope)` — per-kind payload + posture +
   forever-no + mobile/cache audit-detail scan.
3. `validateEnvelopeAuthority(envelope, manifest, knownSnapshotHashes,
   options?)` — declared vs effective authority, capability allowlist,
   surface↔authority sanity, mobile/native-extension guards, schema
   skew, stale-envelope check. Produces `effectiveAuthority`.

Consumer code must dispatch only on `result.effectiveAuthority`, never on
`envelope.declaredAuthority`. See envelope-v1.md §4.4 for why.

## Blocker codes

The 18 codes from envelope-v1.md F10.2.1 Readiness Checklist are
exported as `BLOCKER_CODES`. A doc-sync test in this repo asserts the
helper's list matches the spec literally — if you change one, change the
other.

## Hash computation is deferred

F10.2.1 ships canonical input formatters only. The platform-specific
hashers (`crypto.subtle` in the browser, `expo-crypto` on mobile,
`node:crypto` in tooling, `sha2` Rust crate in Desktop) compute the
actual sha256 of the formatter's output. This keeps the helper free of
platform coupling. A future phase may add a thin opt-in shim per
platform; F10.2.1 does not.

## Where this lives in the F10 phase plan

| Phase | Scope | Status |
|---|---|---|
| F10.0 | Cross-platform architecture | Accepted |
| F10.1 | Platform capability manifest (docs-only) | Complete |
| F10.2.0 | Envelope spec (docs-only) | Complete (`febd731`, `92d3eb3`) |
| **F10.2.1** | **This package — static helper** | **Current** |
| F10.2.2 | CI scan over repo for envelope literals | Not authorized |
| F10.3 | First bridge implementation | Not authorized |
| F10.6 | Future transports (cloud, WebDAV, signing) | Not authorized |
| F10.7 | Remote apply / write-back | Forbidden |

## License

UNLICENSED — private workspace package.
