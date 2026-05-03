# Identity Amendment 4.X.A3 — Allow safe `diag().runtime` metadata

> **Status:** Approved standalone amendment. Lands before Phase 5.0B implementation begins.
>
> **References:** `docs/identity/IDENTITY_PHASE_5_0A_MOBILE_ALIGNMENT.md` (D6, D10, §11 prereq 2)
>
> **Validator:** `tools/validation/identity/validate-identity-phase4_8-observability-support-diagnostics.mjs`

## What this amendment changes

A small forward-compatible extension to the Phase 4.8B observability/support diagnostics policy:
`H2O.Identity.diag()` may include an OPTIONAL `runtime` sub-object containing string-scalar
platform/runtime metadata, while preserving every other invariant of the no-leak contract.

## What this amendment does NOT change

- Public snapshot shape (`H2O.Identity.getSnapshot()`) remains byte-stable. The runtime
  metadata does not appear on the snapshot.
- Phase 4.8B redaction policy: tokens, sessions, raw users, raw emails, provider identities,
  service-role strings, passwords, credentials, recovery tokens, and DB-private fields
  remain forbidden everywhere they were forbidden before.
- `selfCheck()`'s `noTokenSurface` invariant.
- Browser identity runtime behavior. The current Identity Core implementation does not emit
  `diag().runtime`. This amendment is a forward-compatible allowance: the shape contract
  applies if and only if a future implementation chooses to populate it.
- Mobile identity is NOT implemented under A3. Mobile implementation remains gated to
  Phase 5.0B. A3 only unblocks the diagnostic-shape contract that 5.0B may consume.

## The allowed shape

When present, `diag().runtime` must be exactly:

```js
runtime: {
  platform: 'browser-extension' | 'studio-mobile',
  runtimeKind: 'chrome-mv3' | 'expo-ios' | 'expo-android',
  appVersion: '<quoted string literal>',
  identityCoreVersion: '<quoted string literal>'
}
```

**Form constraints (statically verifiable):**

- The `runtime` property must be assigned an **inline object literal**. Function calls
  (`runtime: buildRuntimeDiag()`), identifier references (`runtime: runtimeInfo`), shorthand
  (`{ runtime }`), spread (`...someObject`), and computed keys (`[someKey]: ...`) are all
  rejected. The validator cannot inspect what those resolve to at runtime; the only safe
  policy is to require a syntactically inspectable literal.
- The `runtime` property must appear **at most once** inside `diag()`. JS object literals
  outside strict mode tolerate duplicate keys (last-wins), so a second `runtime` declaration
  could otherwise be a non-literal that bypasses shape enforcement. The validator rejects
  any `diag()` body containing more than one `runtime` property declaration.
- The literal must contain **exactly these four keys** at the top level — no more, no less:
  `platform`, `runtimeKind`, `appVersion`, `identityCoreVersion`. Missing keys, extra keys,
  and duplicate keys all fail the validator.
- All four values must be **plain quoted string literals** (single or double quotes). No
  numbers, booleans, nulls, arrays, nested objects, template literals, identifiers,
  concatenation, function calls, ternaries, or fallback expressions (`a ?? b`).
- **`platform`** must be one of: `'browser-extension'`, `'studio-mobile'`. Any other value
  fails the validator.
- **`runtimeKind`** must be one of: `'chrome-mv3'`, `'expo-ios'`, `'expo-android'`. Any
  other value fails the validator.
- **`appVersion`** and **`identityCoreVersion`** must be non-empty quoted string literals.
  Empty strings fail the validator.
- No token-shaped or secret-shaped key names anywhere in the sub-object. Forbidden patterns
  include `access_token`, `refresh_token`, `provider_token`, `provider_refresh_token`,
  `rawSession`, `rawUser`, `rawEmail`, `rawOAuth`, `providerIdentity`, `identity_data`,
  `owner_user_id`, `deleted_at`, `service_role` / `service-role` / `SERVICE_ROLE` /
  `SUPABASE_SERVICE_ROLE_KEY`, `secret`, `credential`, `currentPassword` /
  `current_password`, `newPassword`, `confirmPassword`, `recoveryToken` / `recovery_token`.
- The whole sub-object is OPTIONAL. Implementations may omit `runtime` entirely. But if it
  is present, it must satisfy every constraint above.

**Why literals only (and not named constants)?**

A named-constant allow-list (e.g. allowing `appVersion: APP_VERSION` where `APP_VERSION` is
a build-injected constant) would require the validator to follow the constant's definition
and re-verify its value shape, which expands the validator's surface and adds places where
drift can hide. The strict first-cut policy is **literals only**. If a future implementation
genuinely needs build-injected constants (e.g. so version strings come from `package.json`
rather than being hand-edited in the script), that is a follow-on amendment with its own
explicit review and an explicit named allow-list. The literals-only policy is intentionally
tight so the only way to add expressiveness is to open a new amendment.

## Why this shape is safe

- All four values are platform-identifying metadata, not user data.
- `platform` and `runtimeKind` are bounded enums.
- `appVersion` and `identityCoreVersion` come from `package.json` files, not user input.
- The fields are immutable per build, not per-session, so they cannot leak session state.
- The values do not depend on the active session, refresh token, or any provider response.

## Validator enforcement

`validate-identity-phase4_8-observability-support-diagnostics.mjs` extracts the body of
`diag()` and, if a `runtime:` sub-object is present, asserts:

1. Top-level keys are a subset of `{platform, runtimeKind, appVersion, identityCoreVersion}`.
2. No nested object literals appear inside the runtime block.
3. No token / secret / password / credential-shaped substring appears inside the runtime block.
4. The pre-existing whole-`diag()` redaction checks (token / password / refresh / etc.)
   still apply unchanged.

If any check fails, the validator exits non-zero with a message naming Amendment 4.X.A3.

The validator also asserts this amendment doc exists and contains the four allowed keys, so
removing the doc forces an explicit decision rather than silent drift.

## Why this is a tiny standalone amendment

- No runtime code changes. The Identity Core script (`scripts/0D4a.⬛️🔐 Identity Core 🔐.js`)
  is not touched.
- No snapshot shape changes.
- No mobile code added.
- No new release-gate entries; the amendment lives inside the existing Phase 4.8 validator.
- The amendment doc and the validator extension are the entire delivery.

## Rollback

To remove this allowance, delete this doc and revert the validator extension. No runtime
state needs to change because the runtime never started populating `runtime`.

## Does this unblock Phase 5.0B?

Yes — partially. A3 satisfies §11 prereq 2 of the 5.0A spec ("Amendment 4.X.A3 is landed").
The other 5.0B prerequisites (5.0A spec approval, D3 recovery-flow verification, Supabase
project decision, SDK pin, 5.0B plan file) remain independent.
