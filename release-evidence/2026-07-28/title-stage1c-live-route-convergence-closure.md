# Title Stage 1C Live Route-Convergence Closure

`TITLE_STAGE_1C_LIVE_ROUTE_CANARY_ACCEPTED`

## Accepted source

- Commit: `7c3543ad34221e9b7f65313603b3d526639e03cd`
- Commit subject: `fix(title-interface): converge Stage 1C on route signals`
- 9B0a SHA-256: `bcbaee7817f4d7cbfea1c063b0936a877e99e2bfe7cb8e28072a96b8f9411a16`
- Stage 1C validator SHA-256: `5eaecf5c385e35d97fa94b4250552dac3ee837110af90e3146a608b7cd60881f`

## Accepted canonical build

- Marker: `1785256869673`
- ISO: `2026-07-28T16:41:09.673Z`
- Proxy SHA-256: `576d8a239f08caf87be744a4eaf6e2d3c196d6f2759a0909c05f16a734139788`
- Bridge SHA-256: `7abe76133de7c8b71f1b0c41a1410ccbfec70e4d62960aef0dff7bfc62414ca7`
- Loader SHA-256: `75815aa0a18e6ccd1ea07d1ce16e2844921aa6ca740ad3d59dd1ea11f0441725`
- Manifest SHA-256: `1138ab90738054362a28d8ce6faa4778784f775dbd9d768d0d58c1764313e3c9`
- Extension ID: `ogcjkeaiicglflamhjaaimdhphjlgkbb`
- Manifest: V3, version `1.3.0`

The accepted manifest permission set is exactly:

- `storage`
- `tabs`
- `contextMenus`
- `identity`

The diagnostic permissions `webNavigation` and `scripting` are absent.
Host permissions, content-script matches, extension key, and canonical script
ordering remain unchanged.

The canonical alias farm contains 154 aliases. All 154 are authoritative
symlinks. There are zero regular aliases, broken aliases, mismatched targets,
or targets resolving into a foreign worktree.

The delivered bridge retains the Stage 1B compatibility identity:

- schema version: `2`
- source export count: `35`
- public helpers: `27`
- privileged exports exposed: `0`

## Live browser baseline

- Chat A: `/c/691751f6-7c8c-832a-8ebf-04dc0adc6b01`
- `performance.timeOrigin`: `1785257147031`
- `state.chatId`: `691751f6-7c8c-832a-8ebf-04dc0adc6b01`
- `routeToken`: `1`
- parity gate: `ok`
- parity comparisons: `3`
- parity matches: `3`
- parity mismatches: `0`
- parity errors: `0`
- parity suppressed: `6`

The direct Resource Timing search did not expose a standalone 9B0a request
because 9B0a delivery occurs through the generated proxy path. This is not a
build failure.

## Live same-document transition

- Chat A: `691751f6-7c8c-832a-8ebf-04dc0adc6b01`
- Chat B: `6a5f8557-06a8-83eb-af02-f86afe4aed2e`
- `sameDocument`: `true`
- `destinationChanged`: `true`
- `pathnameChatId`: `6a5f8557-06a8-83eb-af02-f86afe4aed2e`
- `stateChatId`: `6a5f8557-06a8-83eb-af02-f86afe4aed2e`
- `routeToken`: `2`
- `exactlyOneRouteIncrement`: `true`
- `lastReason`: `pushstate`
- `converged`: `true`

The completed same-document navigation converged automatically. No manual
`H2O.ChatTitle.refresh()` call was required.

## Final formatter-parity result

- comparisons: `5`
- matches: `5`
- mismatches: `0`
- errors: `0`
- suppressed: `8`
- gate: `ok`
- invariant: `5 = 5 + 0 + 0`
- `parityHealthy`: `true`

Formatter parity remained shadow-only. The legacy formatter remained
authoritative throughout the accepted route transition.

## Verdict

`TITLE_STAGE_1C_LIVE_ROUTE_CANARY_ACCEPTED`

The original stale-route failure is corrected. Completed same-document
navigation converges automatically, and the route token increments exactly
once. Formatter parity remains shadow-only and healthy. No manual refresh was
required.

Stage 1C is closed. No push occurred.
