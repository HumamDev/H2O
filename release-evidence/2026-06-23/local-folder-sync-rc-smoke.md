# Local Folder Sync RC Smoke

Date: 2026-06-23

## Purpose

Attempt a packaged/local Chrome <-> Desktop folder sync RC smoke for the completed local folder sync loop after rebuilt/prepared assets.

Target loop:

1. Desktop -> Chrome folder create/rename/color.
2. Chrome -> Desktop folder create/rename/color.
3. Chrome delete request -> Chrome export -> Desktop import/review.
4. Desktop approve/apply -> soft tombstone only.
5. Desktop receipt export -> Chrome receipt import.
6. Chrome visible-state hide.
7. Repeat apply/import idempotency.
8. Folder sync health diagnostics.

## Preparation Results

Commands run:

```sh
npm run dev:all
node apps/studio/desktop/build-tools/prepare-dist.mjs
```

Results:

- `npm run dev:all` passed.
- `dev:all` rebuilt scripts, aliases, proxy pack, Dev Controls OAuth Google extension, Prod Cockpit Pro extension, and Studio Launcher extension.
- `dev:all` reported one non-blocking loader-order warning: optional dependency phase drift from `7A1a._Prompt_Manager_.js` to `0A1a._H2O_Core_.js`.
- `node apps/studio/desktop/build-tools/prepare-dist.mjs` passed.
- `prepare-dist` copied 274 files into `apps/studio/desktop/dist/`.
- `prepare-dist` sanitized 56 filenames for Tauri asset compatibility.
- `prepare-dist` rewrote 56 `src=` references in HTML.

Local sync folder:

- `/Users/hobayda/H2O Studio Sync`
- Present.
- `latest.json` present.
- `chrome-latest.json` present.

Observed runtime surfaces:

- Desktop process present: `target/debug/h2o-studio-desktop`
- Local Desktop server listening: `127.0.0.1:1430`
- Dev server listening: `127.0.0.1:5500`
- Chrome Dev running.
- Chrome Studio tab open at `chrome-extension://bpobkkppdlldlkccaehmpfclmkhiemhg/surfaces/studio/studio.html#/library/folders`.

## Smoke Result

The packaged/local RC smoke could not be completed from this automation surface.

This is a smoke-harness/access blocker, not a newly observed sync behavior failure.

Blockers:

- Chrome Dev is running, but no Chrome DevTools Protocol port is available on the common debug ports checked (`9222`, `9223`, `9224`).
- Apple Events can read Chrome tab URLs and execute simple DOM JavaScript in the Chrome Studio tab.
- Apple Events executes in an isolated world for the Chrome extension page: it can read DOM text and buttons but cannot access page-created app globals such as `window.H2O`.
- Page-world script injection from Apple Events was blocked by the extension page/CSP path; a probe attempting to set a DOM attribute from an injected inline script returned no result.
- The Desktop Tauri WebView is running, but no external JavaScript command channel or supported Desktop console automation bridge was available from this shell.
- Because neither live surface could be driven through its authoritative app APIs, creating fresh folders, applying Desktop review decisions, and collecting live health outputs could not be performed safely or authoritatively by Codex in this run.

## Smoke Matrix

| Area | Result | Notes |
|---|---:|---|
| Rebuild assets with `npm run dev:all` | Pass | Extension bundles regenerated. |
| Prepare Desktop dist assets | Pass | 274 files copied; 56 filename/reference rewrites. |
| Confirm local sync folder | Pass | `/Users/hobayda/H2O Studio Sync` exists with `latest.json` and `chrome-latest.json`. |
| Confirm Chrome Studio surface open | Pass | Extension Studio tab is open and visible to Apple Events. |
| Confirm Desktop Studio process/server | Pass | `target/debug/h2o-studio-desktop` running; `127.0.0.1:1430` listening. |
| Drive Chrome app APIs | Blocked | Apple Events isolated world cannot see `window.H2O`; CDP unavailable. |
| Drive Desktop app APIs | Blocked | Tauri WebView has no external JS command bridge available. |
| Desktop -> Chrome create/rename/color | Not run | Requires Desktop API/UI execution. |
| Chrome -> Desktop create/rename/color | Not run | Requires Chrome API execution and Desktop verification. |
| Chrome delete request loop | Not run | Requires Chrome API execution and Desktop apply API execution. |
| Receipt import/hide idempotency | Not run | Requires Chrome API execution. |
| Health diagnostics | Not run | Requires live app API execution on both surfaces. |

## Previously Proven Components

Phase 4C is already closed by targeted runtime proofs:

- Chrome request-only implementation: `bcf47cbba572f3e60d31e8d52de645f55d6291a4`
- Chrome request runtime proof: `22e07263afc4532abcb10dbf252358615cdb4caf`
- Chrome-to-Desktop request transport: `9bfb26e1ab800d12a9f815eea74d20e726654f5a`
- Request transport runtime proof: `ae190ace398e3391439ad47b0aefdcd4658c4662`
- Desktop review/apply implementation: `5b8da7e5b0de11f28f9a47db690eadb8536788db`
- Desktop apply runtime proof: `e86b03aaa6e719918d38aa16fe5c167731f41247`
- Desktop receipt export implementation: `1849f3624492eb272ab031ed6b27f6aa583f8549`
- Receipt export runtime proof: `843836dd99b30ce0bfc5d0e9cec537f37ebcc06c`
- Chrome receipt import implementation: `80ec02ee4f484f6f49549aa477c517c8f3dffde9`
- Receipt import runtime proof: `cb95e81c2e068079ec96353370649e86fa2f30a8`
- Chrome visible hide implementation: `14049f1a3ab6937bc97a92e07d1cf477b228a1df`
- Chrome hide runtime proof: `5f3dc7efe7046d9aa91b505acd74313448ddc576`
- Phase 4C closeout: `c20c2905f95c99d302196a76a867ef46e342ca4c`

## Safety Invariants

Not re-proven in this smoke attempt because live app API execution was blocked. They remain proven by the prior targeted Phase 4C runtime evidence:

- Chrome never directly deletes folders.
- Desktop remains delete authority.
- Desktop delete uses the safe `softDeleteFolder` path.
- No hard delete/purge.
- No chats deleted.
- No snapshots deleted.
- Chrome receipt import is status-only before hide.
- Chrome hide is visible-state/mirror-only.
- Real tombstone propagation remains deferred.

## Known Caveats

- Manual Desktop import can report `transport-file-missing` after auto-import already imported/observed the request.
- `tombstones.list({ includeRestored:false })` may surface restored tombstones, so active proof should filter by `!restoredAt`.
- Chrome LibraryIndex row count may hydrate during sync; authoritative safety proof should use explicit `noChatDelete`, `noChatMutation`, `noSnapshotMutation`, and `noBindingMutation` flags.

## Recommended Follow-Up

Smallest next step:

- Re-run the same RC smoke with an attachable live-console path:
  - Chrome Dev launched with a known `--remote-debugging-port`, or manual Chrome DevTools console output captured from the existing Chrome Studio tab.
  - Desktop Studio WebView console available through Web Inspector/manual console, or a dev-only smoke bridge explicitly added and gated for local RC validation.

Preferred implementation if repeated RC smoke runs are expected:

- Add a narrowly scoped, dev-only packaged smoke harness that is disabled by default and can be enabled only with an explicit local flag or query parameter.
- The harness should expose redacted smoke functions on both Chrome and Desktop surfaces and should not alter production behavior.

## Validation

- `git diff --check` - passed.
- `git diff --cached --check` - passed.
- No runtime-code `node --check` was required because no runtime code was changed.
- No broad build gate was required beyond the requested prep commands because no runtime code was changed.

## Final Verdict

Local Chrome <-> Desktop folder sync is not yet RC-ready by this packaged/local smoke criterion because the full smoke matrix could not be executed after rebuild/prepared assets from the available automation surface.

This report does not identify a new sync architecture regression. It identifies a missing live smoke execution channel for the packaged/local RC validation step.
