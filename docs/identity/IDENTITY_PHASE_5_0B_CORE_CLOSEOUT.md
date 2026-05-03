# Identity Phase 5.0B-core — Closeout

## Summary

Phase 5.0B-core (mobile identity alignment) is structurally complete and has
passed runtime QA on a real iPhone running an Xcode dev build. The mobile app
boots, signs in via Supabase email-code and password flows, refreshes identity,
signs out, and restores the session across restart. The Identity Debug surface
reflects each transition correctly, and all hard security constraints declared
for this phase are still in force.

This document captures the verified state, the security constraints that must
remain locked, and the deferred-roadmap so a later phase can resume from a
known-good baseline without re-deriving scope.

## Runtime QA matrix (real iPhone / Xcode dev build)

| Scenario                              | Result |
| ------------------------------------- | ------ |
| Existing-user email-code sign-in      | PASS   |
| Password sign-in                      | PASS   |
| Refresh identity                      | PASS   |
| Sign out                              | PASS   |
| Restart after sign-out                | PASS   |
| Restart restore while signed in       | PASS   |
| Settings reorg (grouped settings menu)| PASS   |
| Recovery placeholder inert            | PASS   |
| Password-change placeholder inert     | PASS   |

Observed signed-in fields on Identity Debug: `status: sync_ready`,
`mode: provider_backed`, `provider: supabase`, `signed in: Yes`, masked email
shown, `error: None`. Observed signed-out fields: `status: anonymous_local`,
`mode: local_dev`, `provider: mock_local`, `signed in: No`.

## Static validation

| Gate                              | Result |
| --------------------------------- | ------ |
| `apps/studio-mobile` `tsc --noEmit` | PASS |
| `packages/identity-core` typecheck  | PASS |
| Phase 5.0B mobile alignment validator | PASS |
| Full identity release gate          | PASS |

Reproduce:

```
cd apps/studio-mobile && npx tsc --noEmit
node tools/validation/identity/validate-identity-phase5_0b-mobile-alignment.mjs
node tools/validation/identity/run-identity-release-gate.mjs
```

## Security constraints (must remain locked)

- `RECOVERY_FLOW_VERIFIED = false`.
- No active recovery flow is implemented.
- Do not introduce `type: 'recovery'` in any sign-in / OTP / link flow.
- Do not use `resetPasswordForEmail` as an active recovery flow.
- Access token is memory-only.
- Refresh token is persisted only via SecureStore.
- No raw token, raw session, raw user object, or raw provider response is
  exposed to the UI, to logs, or to the Identity Debug surface. Email is shown
  masked only.

These constraints are enforced both in code and by the 5.0B mobile alignment
validator; any future change that weakens them must update the spec, the
validator, and obtain explicit phase approval.

## Changed / new files (logical scope of 5.0B-core)

Mobile identity (under `apps/studio-mobile/src/identity/`):

- `IdentityContext.tsx`
- `MobileSupabaseProvider.ts` (RPC snake_case → `H2OProfile` / `H2OWorkspace`
  normalization with safe email fallback)
- `mobileConfig.ts`
- `mobileStorage.ts`
- `secureStore.ts` (guarded dynamic import to survive missing native module)
- `selfCheck.ts`

Mobile app routes:

- `apps/studio-mobile/src/app/identity-debug.tsx` (QA-only surface)
- `apps/studio-mobile/src/app/_layout.tsx` (route registration for
  `/identity-debug`)
- `apps/studio-mobile/src/app/settings.tsx` (grouped settings reorg; identity
  QA controls relocated to `/identity-debug`)

Validation:

- `tools/validation/identity/validate-identity-phase5_0b-mobile-alignment.mjs`
  (new, static-only)
- `tools/validation/identity/run-identity-release-gate.mjs` (wired the 5.0B
  validator into the release run group and the syntax-check group; two-line
  diff)

Shared contract foundation (already committed under `9ff28bc`):

- `packages/identity-core/*`

Specs already on main:

- `docs/identity/IDENTITY_PHASE_5_0A_MOBILE_ALIGNMENT.md`
- `docs/identity/IDENTITY_AMENDMENT_4_X_A3_DIAG_RUNTIME.md`

## Deferred roadmap

The following items are intentionally out of scope for 5.0B-core and must be
addressed in a later, separately-scoped phase. None of them should be
back-ported into 5.0B-core.

- Active recovery flow (must arrive with its own spec, validator, and the
  promotion of `RECOVERY_FLOW_VERIFIED` to `true`).
- Mobile change-password (currently inert placeholder).
- Google OAuth on mobile.
- Mobile billing surface.
- Polished, user-facing Account page (Identity Debug is QA-only).
- Production / TestFlight build, signing, and provisioning.
- Expo package patch updates (rebuild required; hold for a maintenance
  window).
- Anon / publishable key rotation prior to any production cutover.

## Repo-state warning

At the time of this closeout the working tree contains material that is
**not** part of 5.0B-core and must not be swept into a 5.0B-core commit:

- `apps/` is currently entirely untracked. `git ls-files apps/` returns no
  files — the whole mobile workspace has never been committed. Committing it
  is a much larger decision than 5.0B-core closeout (gitignore review for
  `node_modules`, `.expo`, `ios/Pods`, lockfile policy, asset binaries) and
  must be its own scoped step.
- `packages/studio-core/`, `packages/studio-types/`, `packages/studio-ui/`
  are untracked peer packages outside identity scope.
- `surfaces/studio/` carries a large in-progress refactor (modified
  `studio.{js,css,html}` plus ~20 untracked `S*` host files) that is unrelated
  to identity.
- `scripts/` has unrelated dirty userscripts (`0D1a` Data Core, `0D1b` Data
  Store, `0F2a` Projects, `1A1c` MiniMap Engine, `7A1a` Prompt Manager) and a
  modified `config/dev-order.tsv`.
- `cockpit-pro-site/`, `plans/`, `artifacts/`, `tmp/`, `supabase/.temp/` are
  untracked and outside this phase.
- `identity-provider.local.json` at repo root is now covered by `.gitignore`
  (added in this closeout). The file currently holds template placeholders
  only; it must never be committed once filled with real keys.

Any commit produced for 5.0B-core closeout must be hand-staged and limited to
the files listed in "Changed / new files" above plus this document and the
`.gitignore` tightening.
