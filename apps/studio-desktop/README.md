# H2O Studio — Desktop (Tauri V2)

**Status:** Milestone M1 — Tauri shell + Studio boot proof.

This is the desktop host for the H2O Studio UI. It does NOT contain
Studio's source — that lives in `surfaces/studio/`. This app reuses the
exact assets the Chrome MV3 extension builds and wraps them in a Tauri V2
native window. The platform-adapter layer (already part of
`surfaces/studio/platform/`) auto-detects the Tauri context and swaps in
a Tauri-flavored backend.

The goal of M1 is to prove **the existing Studio UI boots inside Tauri
on macOS with no fatal errors**. No import pipeline, no SQLite, no live
ChatGPT capture — those are M2 and beyond.

---

## Architecture

```
h2o-source/
├── surfaces/studio/                            ← Studio source (shared with MV3)
│   ├── studio.html, studio.css, studio.js
│   ├── platform/
│   │   ├── index.js                            ← adapter namespace + fallback
│   │   ├── platform.mv3.js                     ← auto-activates if chrome.runtime exists
│   │   └── platform.tauri.js                   ← auto-activates if __TAURI_INTERNALS__ exists
│   ├── store/                                  ← entity stores (highlights, libraryIndex)
│   └── (all S0*..S9* feature modules)
│
├── build/chrome-ext-prod/surfaces/studio/      ← Output of `npm run dev:all`
│                                                 (Tauri reads from here)
│
└── apps/studio-desktop/                        ← THIS DIRECTORY
    ├── package.json                            ← npm scripts (tauri:dev, tauri:build)
    ├── scripts/prepare-dist.mjs                ← Copies Studio assets into ./dist/
    ├── dist/                                   ← (generated; .gitignored) Tauri frontendDist
    └── src-tauri/                              ← Tauri Rust project
        ├── tauri.conf.json                     ← window config + CSP + bundle config
        ├── Cargo.toml                          ← Rust deps (tauri 2, plugin-shell)
        ├── capabilities/default.json           ← Tauri permissions
        ├── src/main.rs                         ← Tauri entry point
        └── icons/                              ← App icons (placeholder; see icons/README.md)
```

Asset flow at `npm run tauri:dev` time:

```
1. scripts/prepare-dist.mjs:
     copies   build/chrome-ext-prod/surfaces/studio/* → apps/studio-desktop/dist/
     emits    dist/index.html (redirector → studio.html)

2. Tauri serves dist/ via the tauri://localhost asset scheme.

3. tauri.conf.json's app.windows[0].url = "studio.html" loads it.

4. studio.html's <script> tags load in order:
     ./platform/index.js              (sets up H2O.Studio.platform + fallback)
     ./platform/platform.mv3.js       (no-op in Tauri — chrome.runtime absent)
     ./platform/platform.tauri.js     (registers tauri adapter)
     ./platform/selectors.contract.js (selectors)
     ./store/index.js, ./store/highlights.js, ./store/libraryIndex.js
     (all S0*..S9* feature modules)

5. Studio boots with the Tauri adapter as the active platform.
   Library Index hydrates from localStorage (empty on first run).
   refreshFromArchive() rejects gracefully (no archive bridge in V1).
   UI renders Library empty state.
```

---

## First-time setup (one-time, on your machine)

These tools must be installed before any `tauri` command works. The
scaffold does NOT automate them.

### 1. Rust toolchain

```bash
# Install rustup (which installs rustc + cargo)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

Restart your shell or `source "$HOME/.cargo/env"`. Verify:

```bash
rustc --version    # → rustc 1.77 or later
cargo --version
```

### 2. Xcode Command Line Tools

```bash
xcode-select --install
```

(Likely already installed if you do any native macOS development.)

### 3. npm dependencies

```bash
cd h2o-source/apps/studio-desktop
npm install
```

Installs `@tauri-apps/cli` (which orchestrates `cargo` under the hood).

---

## Build & run the boot proof

The Tauri shell loads Studio's BUILT assets from
`build/chrome-ext-prod/surfaces/studio/`. You must build them first:

```bash
# From h2o-source/
npm run dev:rebuild
npm run dev:all
node tools/product/extension/build-chrome-live-extension.mjs
```

(The same build chain you run for MV3 validation.)

Then from `h2o-source/apps/studio-desktop/`:

```bash
npm run tauri:dev
```

This runs `prepare-dist` (copies assets into `dist/`), then starts the
Tauri dev loop. First run compiles Tauri's Rust dependencies — expect
5-15 minutes. Subsequent runs are fast (incremental compile).

A native macOS window titled **"H2O Studio"** should open and render
Studio's empty-library state.

### Production build (later — needs icons)

```bash
npm run tauri:build
```

This produces a `.dmg` / `.app` under `src-tauri/target/release/bundle/`.
**Requires real icons** at `src-tauri/icons/` (see that folder's README).
`tauri:dev` works without icons; `tauri:build` does not.

---

## Runtime validation probes

Open the Tauri window's DevTools (right-click → Inspect Element, or
Cmd+Option+I). Paste the following one-by-one into the Console:

```js
// 1. Tauri adapter took precedence
H2O.Studio.platform.diagnose();
//    → expect: adapter === 'tauri', isTauri-friendly fields present, no warnings

// 2. Studio's existing self-checks survived the platform swap
H2O.Studio.platform.diagnose().selectorsLoaded === true;
//    → true (the selectors contract loaded unchanged)

// 3. Store namespace is alive
H2O.Studio.store.diagnose();
//    → entities: ['highlights', 'libraryIndex']; no fatal warnings

// 4. Entity stores initialized without errors
H2O.Studio.store.highlights.diagnose().errors.length === 0;
H2O.Studio.store.libraryIndex.diagnose().errors.length === 0;

// 5. Library Index is healthy (empty is correct — no import yet)
H2O.LibraryIndex.diagnose().ready === true;
H2O.LibraryIndex.diagnose().errors.length === 0;
H2O.LibraryIndex.getAll().length === 0;
//    → 0 rows — by design (no archive bridge, no import yet)

// 6. openUrl works via Tauri shell plugin
H2O.Studio.platform.openUrl('https://example.com');
//    → returns Promise; should open in the user's default browser
```

### Expected console output

You should see Studio's normal boot log lines:

- `[H2O DEV LOAD ✅ S*. ...]` from each Studio module
- `[H2O.Studio.platform] tauri adapter registered`
- Some warnings are EXPECTED in M1 (they're MV3-only paths failing
  gracefully because there's no service worker):
  - `platform.messaging.send: not available on Tauri (V1 import-only desktop)`
  - `[S0F1c Library Index] refreshFromArchive: chat-list service unavailable`
  - Similar warnings from S0F0a (Library Surface Host) and S0F1h
    (Library Sync) about their MV3 dependencies being absent

### Fatal errors: there should be none

If you see uncaught exceptions, capture the stack and report. Most likely
candidates (with fixes):

| Symptom | Likely cause | Fix |
|---|---|---|
| `ReferenceError: chrome is not defined` from `studio.js` around lines ~521/550/560/571/582 | Direct `chrome.storage.*` calls without platform-first preference | Add a small `chrome` shim in `platform.tauri.js` init that routes through `platform.storage`. (Known site; fix in M1.x.) |
| `Failed to load resource: studio.html` | `prepare-dist` skipped or build wasn't produced first | Re-run `npm run dev:all` from `h2o-source/`, then `npm run tauri:dev` from here |
| `Refused to load … due to Content Security Policy` | CSP too strict for inline scripts or external fetches | Loosen the policy in `src-tauri/tauri.conf.json` `app.security.csp` |
| `Failed to load image` for icons or fonts | Tauri asset protocol mismatch in CSS url(...) | Adjust `img-src` / `font-src` in CSP |
| Tauri window opens but is blank | Most likely `dist/index.html` redirector failed | Open DevTools, check the Network tab for studio.html load |

---

## Known M1 limitations (by design)

- **No import pipeline.** Library is empty; first-launch shows empty
  state. The import UI + ZIP parser arrives in M3.
- **No SQLite.** Storage uses `localStorage` (per-window, persists
  between launches via Tauri's webview). M2 swaps this for
  `tauri-plugin-sql` / SQLite.
- **No icons committed.** Tauri uses default placeholder icons for
  `tauri dev`. `tauri build` will fail until icons are added.
- **No code signing / notarization.** `tauri build` produces an
  unsigned `.dmg`. Distribution requires Apple Developer ID setup.
- **No auto-updater.** Manual upgrade only (download a new `.dmg`).
- **No identity / auth / billing.** Those MV3 service worker backends
  are not loaded in the Tauri build.
- **No live archive bridge / no native scripts.** Many Studio modules
  expect a `chat-list` service from the MV3 service worker; in M1 those
  calls reject gracefully and the UI stays at empty state. This is
  intentional. V2 (later phase) adds optional webview-with-injection
  capture; V1 desktop is import-only.
- **Single window.** Multi-window support is deferred.

---

## What gets stubbed

The Tauri platform adapter (`surfaces/studio/platform/platform.tauri.js`)
implements:

| Method | M1 behavior |
|---|---|
| `env` | `{ adapter: 'tauri', isTauri: true, isExtension: false }` |
| `storage.{get, set, remove}` | localStorage-backed (M2 → SQLite) |
| `broadcast.{emit, on, onAnyChange}` | in-page only (single window V1) |
| `broadcast.emitRaw` | no-op (no chrome.storage to write to) |
| `messaging.{send, on}` | rejects all calls with a clear error |
| `openUrl(url)` | invokes `plugin:shell|open` via Tauri |
| `files`, `capture`, `auth` | `{ available: false }` (fallback defaults) |

---

## What comes next

- **M2** — Add `tauri-plugin-sql` and migrate `store.highlights` +
  `store.libraryIndex` from localStorage to SQLite. Add the V1 schema
  (per `apps/studio-desktop/docs/...` once created). New entity stores
  for chats, turns, folders, labels, tags, categories, attachments,
  prefs, import_batches.
- **M3** — Implement the ChatGPT export ZIP import pipeline. Awaiting
  Task 0 (export-schema inventory against a real export ZIP).

Refer to the V1 roadmap document (in conversation history; will be
codified in `apps/studio-desktop/docs/` in a future commit) for the
full Milestone breakdown.

---

## Troubleshooting

### `Cargo.lock` keeps changing

This is expected — Cargo lock file updates with each Tauri dep update.
Keep it committed (the file is part of this scaffold).

### "platform.tauri.js: tauri invoke unavailable"

Means the Tauri internals global wasn't injected. Usually happens if
you're loading `studio.html` directly in a regular browser instead of
via `tauri dev`. The adapter intentionally no-ops outside Tauri.

### Rust build is slow

First-time Tauri build downloads ~400 crates and compiles them. 5-15
minutes is normal. Use `cargo build --release` once first; subsequent
`tauri dev` runs are incremental and fast.

### Studio shows "Refresh from archive failed"

Expected in M1 — there's no MV3 service worker and no chatgpt.com tab
to harvest from. The UI's empty state is the correct M1 result.
