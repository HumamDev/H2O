# Studio Platform Adapter Guide

Status: Active
Audience: Anyone building the adapter layer or routing platform calls through it.
Companion: `STUDIO_PORTABILITY_CONTRACT.md`, `STUDIO_STORAGE_CONTRACT.md`, `STUDIO_CAPTURE_BOUNDARY.md`.

## Purpose

Define the **one** thin layer through which Studio feature code reaches the host environment. Studio code calls `H2O.Studio.platform.*`; the adapter implementation decides whether that maps to a Chrome extension API, a Tauri command, a PWA primitive, or a mock for tests.

The adapter is the single port-time surface. Get it right and the rest of Studio is platform-agnostic by construction.

## Naming

The namespace is `H2O.Studio.platform`. It hangs off the existing `H2O` global to fit the repo's convention (see `S0A1a` H2O Core). Sub-namespaces and method names use lowerCamelCase. Adapter modules live in `surfaces/studio/platform/` (to be created) with one file per concern.

Recommended module layout:

```
surfaces/studio/
└── platform/
    ├── index.js                  # binds H2O.Studio.platform and selects adapter at boot
    ├── adapter-extension-mv3.js  # current implementation (chrome.* backed)
    ├── adapter-tauri.js          # future implementation (Tauri backed)
    ├── adapter-mock.js           # in-memory mock for tests / Storybook
    ├── store.js                  # StudioStore façade (calls platform.storage)
    ├── messaging.js              # H2O.Studio.platform.messaging
    ├── broadcast.js              # H2O.Studio.platform.broadcast
    ├── runtime.js                # H2O.Studio.platform.runtime (URL, env, openUrl)
    ├── files.js                  # H2O.Studio.platform.files (import/export)
    ├── auth.js                   # H2O.Studio.platform.auth (token requests)
    └── selectors.contract.js     # SELECTORS — central ChatGPT-compatible selectors
```

Adapter selection at boot (rough sketch — adjust to repo style):

```js
// platform/index.js
(function(global){
  const adapter =
    detectTauri()    ? buildTauriAdapter() :
    detectExtension()? buildExtensionMv3Adapter() :
                       buildMockAdapter();
  global.H2O = global.H2O || {};
  global.H2O.Studio = global.H2O.Studio || {};
  global.H2O.Studio.platform = adapter;
})(window);
```

Env detection is intentionally dumb:

- `detectTauri()` → checks `window.__TAURI__`
- `detectExtension()` → checks `typeof chrome !== 'undefined' && chrome.runtime?.id`
- otherwise → mock

## Surface Area

The adapter exposes exactly these concerns. If feature code needs something not listed, the proposed addition goes through review — do not add ad-hoc methods.

### `H2O.Studio.platform.storage` (low-level KV)

Low-level adapter only. **Feature code does not call this directly** — feature code calls `H2O.Studio.store` (StudioStore), which uses this internally. Documented here so the adapter contract is complete.

```ts
interface PlatformStorage {
  get(key: string): Promise<unknown | null>;
  set(key: string, value: unknown): Promise<void>;
  remove(key: string): Promise<void>;
  listKeys(prefix: string): Promise<string[]>;
  estimate(): Promise<{ usage: number; quota: number } | null>;
}
```

Implementations:
- **MV3 adapter** — IndexedDB primary (`h2o.library.studio` DB, `kv` store), localStorage fallback (mirrors current `S0F1e` Library Store, which becomes the MV3 adapter implementation).
- **Tauri adapter** — `tauri-plugin-sql` SQLite. The KV interface above is preserved for prefs/UI state; entities use the relational StudioStore methods.

### `H2O.Studio.platform.broadcast` (cross-surface signaling)

```ts
interface PlatformBroadcast {
  emit(channel: string, payload: unknown): Promise<void>;
  subscribe(channel: string, fn: (payload: unknown) => void): Unsubscribe;
}
```

Implementations:
- **MV3 adapter** — `chrome.storage.local.set({ [channelKey]: { ts, payload } })` to broadcast; `chrome.storage.onChanged` to subscribe. Mirrors `S0F1h` Library Sync's heartbeat keys (`h2o:library:cross-surface:broadcast:v1` and `:native:v1`). Library Sync today writes these keys directly; under the contract, it routes through `broadcast`.
- **Tauri adapter** — Tauri event channels (`emit`/`listen` on the app side). Channels named identically (`library:cross-surface`, etc.) so feature code is unchanged.

### `H2O.Studio.platform.messaging` (request/response across contexts)

```ts
interface PlatformMessaging {
  send<T = unknown>(target: 'capture' | 'host' | 'identity', message: unknown): Promise<T>;
  subscribe(target: 'capture' | 'host' | 'identity', fn: (msg: unknown) => unknown | Promise<unknown>): Unsubscribe;
}
```

Implementations:
- **MV3 adapter** — `chrome.runtime.sendMessage` / `chrome.runtime.onMessage`. The message envelope is namespaced (e.g., `{ ns: 'h2o-ext-archive:v1', op: '...', payload }`) to keep current routing logic in `bg.js` working unchanged.
- **Tauri adapter** — `invoke()` for sends; `listen()` for subscribes. Targets map to Tauri command names.

`'capture'` is the only target Studio feature code needs to know about today (used in `studio.js` ↔ archive bridge interactions). `'host'` and `'identity'` exist for future use and current internal routing.

### `H2O.Studio.platform.runtime` (URLs, env, navigation)

```ts
interface PlatformRuntime {
  resolveAsset(path: string): string;      // e.g., 'surfaces/studio/icons/x.svg'
  openUrl(url: string, opts?: { external?: boolean }): void;
  env: {
    kind: 'extension-mv3' | 'tauri' | 'pwa' | 'mock';
    version: string;
    isDev: boolean;
  };
}
```

Implementations:
- **MV3 adapter** — `resolveAsset` → `chrome.runtime.getURL(path)`; `openUrl` → `chrome.tabs.create({ url })` (or `window.open` for the WebView).
- **Tauri adapter** — `resolveAsset` → resolves relative to the bundled app; `openUrl` → Tauri shell open.

### `H2O.Studio.platform.files` (import/export)

```ts
interface PlatformFiles {
  exportJson(opts: { suggestedName: string; data: unknown }): Promise<{ ok: boolean }>;
  exportBlob(opts: { suggestedName: string; blob: Blob }): Promise<{ ok: boolean }>;
  importJson<T = unknown>(opts?: { mimeTypes?: string[] }): Promise<T | null>;
  importFile(opts?: { mimeTypes?: string[] }): Promise<File | null>;
}
```

Implementations:
- **MV3 adapter** — Blob + `<a download>` for export; hidden `<input type=file>` for import.
- **Tauri adapter** — `dialog.save` / `dialog.open` plus `fs.writeTextFile` / `fs.readTextFile`.

### `H2O.Studio.platform.auth` (token requests)

```ts
interface PlatformAuth {
  getIdentity(): Promise<IdentityState | null>;   // current cached identity, null if not signed in
  onIdentityChange(fn: (state: IdentityState | null) => void): Unsubscribe;
  requestToken(scope: string): Promise<string | null>; // future use
}
```

Implementations:
- **MV3 adapter** — bridges `H2O.Identity` global and `h2o:identity:*` events (defined in `surfaces/identity/`). `requestToken` is a stub today — returns `null` — and grows when remote sync is introduced.
- **Tauri adapter** — same bridge to identity surface; `requestToken` may call into Rust for secret-store-backed tokens.

Feature code uses this for read-only identity awareness only. Auth flows remain owned by `surfaces/identity/`.

## Boot Order

The adapter must be bound before any feature module reads from it. In `studio.html`, the script load order already runs `S0A1a` H2O Core early; the platform adapter module should sit immediately after H2O Core and before any feature service. Add a `<script src="./platform/index.js">` tag right after the H2O Core scripts.

If a feature module needs the adapter at top-level (rare; most use it inside event handlers), it should defer via `H2O.events.on('evt:h2o:studio:platform:ready', ...)` rather than capture the reference at load time.

## What Goes Inside the Adapter and What Stays Outside

**Inside the adapter:**

- Every reference to `chrome.*`.
- Every reference to `localStorage`, `sessionStorage`, `indexedDB`.
- Every reference to `chrome-extension://` URLs or path resolution.
- Every Blob/download-link/file-input trick used for import/export.
- All Tauri `invoke` and `listen` calls (when that adapter is added).
- The selector-constants module (`selectors.contract.js`) — strictly speaking this is not the adapter, but it lives in the same folder for proximity.

**Outside the adapter (in feature code):**

- All DOM manipulation of Studio's own rendered chat replay.
- All `H2O.events.emit`/`.on` usage with Studio-internal events.
- All business logic over StudioStore records.
- All UI rendering.

## Migration Path From Today's Code

Existing chrome.* call sites are debts to be paid down opportunistically. The recommended order:

1. **Create `platform/index.js` and the adapter contract** with the MV3 implementation that simply wraps current behavior. No feature code changes yet.
2. **Migrate `S0F1h` Library Sync** to use `platform.broadcast.emit/subscribe`. This is the highest-leverage single change: it owns the cross-surface broadcast mechanism that the contract depends on.
3. **Migrate `studio.js`'s `chrome.runtime.sendMessage` calls** (lines 848 and around 4301) to `platform.messaging.send('capture', ...)`. This makes the archive bridge swappable.
4. **Migrate `S0F0a` Library Surface Host's `chrome.runtime.sendMessage`** call (around line 320) similarly.
5. **Migrate `S3H1a` Highlights Engine's storage paths** (currently chrome.storage → GM_* → localStorage, three places) to a single `H2O.Studio.store.highlights.*` call. This also removes the legacy Tampermonkey fallback.
6. **Migrate `S9D1a` Auto Emoji Title's dual writes** (localStorage + chrome.storage broadcast) to `H2O.Studio.store.chatTitles.*` + `platform.broadcast.emit(...)`.
7. **Centralize selectors** into `selectors.contract.js`; replace literals in `S1A1b`, `S1A2a`, `S2Z1a`, `S3H1a` over time.

None of these are urgent. They become urgent the day someone says "let's start the Tauri port" — and at that point you want them already done.

## Testing

The mock adapter (`adapter-mock.js`) exists so Studio feature code can be unit-tested without a browser extension or Tauri runtime. It uses an in-memory Map for storage, in-memory EventTarget for broadcast/messaging, and `Object.assign({}, fakeEnv)` for runtime. Any feature you build that goes through the adapter is testable; any feature that bypasses it is not.

## Anti-Patterns

- **Adapter as god-object.** The adapter exposes only the surface area listed above. New top-level keys require review.
- **Adapter pass-through of `chrome` events with their original shape.** Wrap event shapes into stable, adapter-defined shapes so feature code doesn't see Chrome's `changes` objects or Tauri's payload shapes — it sees the adapter's normalized payload.
- **Lazy adapter selection inside feature code.** `if (chrome?.runtime) { ... } else { ... }` in a feature file is a Rule 1 violation, full stop. That logic lives in the adapter.
- **Feature code that imports both `adapter-extension-mv3.js` and `adapter-tauri.js`.** Feature code does not see the implementations; it sees only `H2O.Studio.platform`.
