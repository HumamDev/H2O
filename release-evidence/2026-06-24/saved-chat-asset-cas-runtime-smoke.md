# Saved Chat Asset CAS — Real-Tauri Runtime Smoke (Phase C C3.3)

Date: 2026-06-24

Lane: Chat Saving Architecture. Proves the one thing the headless C3.2 validator
cannot: that the **installed Tauri FS plugin accepts binary `write_file` /
`read_file` with `options.baseDir: 15` (`BaseDirectory.AppLocalData`)** under
`$APPLOCALDATA/archive/assets`, using the existing private API
`H2O.Studio.ingestion.assetCas` (commit `cd8a468`).

Status: **PREPARED — not executed in this environment.** No running Desktop/Tauri
webview is reachable from the build host (a built `h2o-studio-desktop` binary
exists, but its GUI webview console cannot be driven headlessly here). Run the
snippet below on a real Desktop build and paste the console output back into this
note as evidence.

## Scope / boundaries

This is a **docs-only** runtime smoke. It adds **no** runtime code: it reuses the
C3.2 private API. It does **not** do C4 (no package materialization, no image
extraction, no `manifest.assets`, no `contentHash` v2), does **not** touch the
asset registry (`store.assets`), the DB, UI, sync, import/recovery, or
WebDAV/cloud, and does **not** delete/remove/rename anything.

## Where to run

1. Launch the Desktop Studio app (Tauri build that includes commit `cd8a468`,
   i.e. with `ingestion/asset-cas.tauri.js` packed and the `archive-cas`
   capability present).
2. Open the Studio window's developer tools (webview devtools console).
3. Paste the snippet below and press Enter.

It is read/write only against the app-owned CAS root; it needs no UI interaction.

## Smoke snippet (paste into the Desktop Studio devtools console)

```js
(async () => {
  const cas = (window.H2O && window.H2O.Studio && window.H2O.Studio.ingestion && window.H2O.Studio.ingestion.assetCas);
  if (!cas) { console.error('[cas-smoke] H2O.Studio.ingestion.assetCas not present — Desktop/Tauri build only'); return; }

  // Deterministic 16-byte payload: UTF-8 of "h2o-cas-smoke-v1".
  const EXPECT_SHA  = 'sha256-3665d0a7e01ab20f0a0a3447e87ca5b6dd0b5a328f8a78fba212c1c3d1b375f2';
  const EXPECT_HEX  = EXPECT_SHA.slice('sha256-'.length);
  const EXPECT_PATH = `archive/assets/${EXPECT_HEX.slice(0, 2)}/sha256-${EXPECT_HEX}`;
  const bytes = new TextEncoder().encode('h2o-cas-smoke-v1');

  const rows = [];
  const add = (check, ok, detail) => rows.push({ check, result: ok ? 'PASS' : 'FAIL', detail });

  try {
    const put1 = await cas.putAssetBytes({ bytes, mimeType: 'application/octet-stream', source: 'cas-smoke' });
    add('sha256 matches expected constant', put1.sha256 === EXPECT_SHA, put1.sha256);
    add('path matches archive/assets/<aa>/sha256-<hex>', put1.path === EXPECT_PATH, put1.path);
    // First run writes; a re-run finds it already present — either is acceptable here.
    add('first put wrote OR already deduped', put1.wrote === true || put1.deduped === true, JSON.stringify({ wrote: put1.wrote, deduped: put1.deduped }));

    const ex = await cas.exists(EXPECT_SHA);
    add('exists() === true', ex === true, ex);

    const got = await cas.getAssetBytes(EXPECT_SHA);
    const sameBytes = !!got && got.length === bytes.length && got.every((b, i) => b === bytes[i]);
    add('getAssetBytes byte-identical', sameBytes, got && ('len=' + got.length));

    const put2 = await cas.putAssetBytes({ bytes });
    add('second put dedupes (wrote:false, deduped:true)', put2.wrote === false && put2.deduped === true, JSON.stringify({ wrote: put2.wrote, deduped: put2.deduped }));

    const d = await cas.describe(EXPECT_SHA);
    add('describe.exists === true', d.exists === true, JSON.stringify(d));

    add('no sync-folder path used', !String(put1.path).includes('H2O Studio Sync'), put1.path);

    const diag = cas.diagnoseAssetCas();
    add('diagnose: baseDir 15 + archive/assets root', diag.baseDir === 15 && diag.casRoot === 'archive/assets', JSON.stringify({ baseDir: diag.baseDir, casRoot: diag.casRoot }));

    const allPass = rows.every((r) => r.result === 'PASS');
    console.table(rows);
    console.log(allPass ? '[cas-smoke] ALL PASS' : '[cas-smoke] FAILURES PRESENT — see table');
  } catch (err) {
    console.error('[cas-smoke] threw before completing:', err);
    console.table(rows);
    console.error('[cas-smoke] A throw from putAssetBytes/getAssetBytes usually means the FS plugin rejected options.baseDir:15 or the capability scope is wrong — see "What failure means".');
  }
})();
```

## Expected PASS output

A `console.table` with every row `result: "PASS"`, followed by `[cas-smoke] ALL PASS`:

| check | result |
|---|---|
| sha256 matches expected constant | PASS |
| path matches archive/assets/<aa>/sha256-<hex> | PASS |
| first put wrote OR already deduped | PASS |
| exists() === true | PASS |
| getAssetBytes byte-identical | PASS |
| second put dedupes (wrote:false, deduped:true) | PASS |
| describe.exists === true | PASS |
| no sync-folder path used | PASS |
| diagnose: baseDir 15 + archive/assets root | PASS |

The expected blob is written to (relative to app-local-data):
`archive/assets/36/sha256-3665d0a7e01ab20f0a0a3447e87ca5b6dd0b5a328f8a78fba212c1c3d1b375f2`.

**A green run is itself the proof of the `options.baseDir: 15` binary shape:** if
`write_file`/`read_file` did not accept `options.baseDir`, `putAssetBytes` /
`getAssetBytes` would reject and the smoke would FAIL or throw.

## What failure means

- **Throws with a capability / "not allowed" / scope error on `putAssetBytes`:**
  the `archive-cas` capability is missing from the build, or the path resolved
  outside `$APPLOCALDATA/archive/**`. Verify
  `apps/studio/desktop/src-tauri/capabilities/archive-cas.json` is present and the
  build picked it up.
- **Throws specifically about `options` / `baseDir` on `write_file`:** the
  installed `tauri-plugin-fs` version does not accept `options.baseDir` on the
  binary write command. Fall back to the C3.0-documented **absolute-path**
  approach (resolve app-local-data via `plugin:path`, pass an absolute path with
  no `baseDir`); that still satisfies the `$APPLOCALDATA/**` scope but needs a
  path-resolution permission check. This is the single shape this smoke exists to
  catch.
- **`sha256` row FAIL:** hashing/encoding bug in the CAS (SHA-256 input differs
  from the raw bytes).
- **`path` row FAIL:** shard/layout derivation drift from
  `archive/assets/<aa>/sha256-<hex>`.
- **`getAssetBytes byte-identical` FAIL:** the `read_file` decode path
  (`decodeToBytes`) is mishandling the `Vec<u8>` (`number[]`) return shape.
- **second-put dedup FAIL:** the `exists`-before-write idempotency check is not
  short-circuiting.

## Cleanup / immutability

The smoke intentionally performs **no cleanup**. C2a deliberately did not grant
`remove`/`rename`, and CAS blobs are immutable content-addressed objects, so the
single tiny `sha256-3665d0a7…` blob it leaves under `archive/assets/36/` is
**acceptable, expected CAS data** — not a leak. Re-running the smoke is safe and
idempotent (the second-or-later run simply dedupes).

## Evidence (fill in after a real run)

```
(paste the console.table + ALL PASS / FAIL line here, with Desktop build id/date)
```
