# Cockpit Pro — Phase 0B: Loader Boot-Timing Baseline

> **Purpose**: establish a quantitative reference for the chrome-live loader's
> boot timing **before** any Phase 0C+ tool refactor lands. Every subsequent
> phase will re-measure against this baseline and fail-stop on regression
> (see thresholds in §5).
>
> **Why this matters**: `build/chrome-ext-prod/loader.js` has explicit
> per-tier and total-budget timeouts (line 605–682 of the loader). When a
> budget is exceeded, the loader silently falls back to a degraded path —
> users see broken UX with no error. Without a baseline we cannot detect
> "we added 80 ms of import overhead and now prod boots fall back 5 % of
> the time." This document is the regression detector.
>
> **Status**: Phase 0B in progress. Methodology + harness + provenance are
> complete. Captured samples must be added manually to §6 (3 cold-load
> reloads) before Phase 0B is declared complete.

---

## 1. Phase 0B contract

- **Adds**: this single markdown file under `docs/migration/`.
- **Modifies**: nothing.
- **Touches** scripts/, surfaces/, build/, config/, supabase/: **no**.
- **Runtime behavior change**: **none**. The loader was already emitting
  these diagnostic surfaces; we only read them.

The harness in §4 below is **pasted into the page DevTools console** by a
human. It does not modify the loader or the extension. It uses two existing
postMessage protocols that the loader already exposes for diagnostics.

---

## 2. Environment provenance (captured 2026-05-17)

| Field | Value |
|---|---|
| Git HEAD | `b8aed9f` |
| Git tag at HEAD | `migration-phase-0A-complete` |
| Branch | `main` (pushed; in sync with origin) |
| Working tree state | clean before this file was created |
| Extension build measured | `build/chrome-ext-dev-controls-oauth-google` |
| Manifest version | `1.3.0` |
| `LOADER_BUILD_TS` | `1779026754691` |
| `LOADER_BUILD_ISO` (from loader.js) | `2026-05-17T14:05:54.830Z` |
| Proxy pack `buildTs` | `1779026754382` |
| Proxy pack module count | 135 |
| `serve.py` running at capture time | yes, port 5500 (PID 73680 at capture moment — may differ on rerun) |
| OS | macOS (Apple Silicon path conventions; iCloud detection logic confirmed active in `make-aliases.mjs` but **the repo is NOT inside iCloud**) |
| Loader content-script run_at | `document_start` |
| Host permissions in manifest | `https://chatgpt.com/*`, `http://127.0.0.1:5500/*`, optional `https://kjwrrkqqtxyxtuigianr.supabase.co/*` |
| V3 dispatcher state | DISABLED by default — controlled by `localStorage.H2O_LOADER_V3_DISPATCHER_MODE`; baseline measures the **default path** |
| V3 diag flag default | OFF — measure both ON and OFF (§4.3) |

---

## 3. Diagnostic surfaces we measure

The chrome-live loader exposes **three** read-only diagnostic ops via
`window.postMessage`. The harness queries each in turn and assembles a
single JSON sample.

### 3.1 Always-on lightweight timing

- Request: `{ type: "h2o-loader-diag-req", id: "<reqId>" }`
- Reply:   `{ type: "h2o-loader-diag-res", id: "<reqId>", ok: true, result: <cloneLoaderDiagState> }`
- Loader source: `loader.js:4060` (`REQ_TYPE` / `RES_TYPE`).
- Flag required: **none**. Always populated.
- Fields used in this baseline (`result.timing`):
  - `bootStartMs` — when `boot()` begins
  - `proxyPackStartMs` — before proxy-pack network fetch
  - `proxyPackDoneMs` — after proxy-pack text received + parsed
  - `preflightDoneMs` — after `loaderState` + `resolvedSetState` resolved
  - `phaseIdleStartMs` — when `document-idle` `loadPhase` begins
  - `phaseIdleDoneMs` — when `document-idle` `loadPhase` completes
  - `bootDoneMs` — when `boot()` fully completes
- Computed deltas (also returned by the loader at line 1772–1774):
  - `proxyPackMs = proxyPackDoneMs - proxyPackStartMs`
  - `preflightTotalMs = preflightDoneMs - bootStartMs`
  - `phaseIdleMs = phaseIdleDoneMs - phaseIdleStartMs`

### 3.2 V3 detail report

- Request: `{ type: "h2o-ext-archive:v1:req", id: "<reqId>", req: { op: "__schedulerReport" } }`
- Reply:   `{ type: "h2o-ext-archive:v1:res", id: "<reqId>", ok: true, result: { report: { ... } } }`
- Loader source: `loader.js:2597`.
- Flag required: `localStorage.H2O_LOADER_V3_DIAG = "1"` set **before** the
  cold reload that produced this sample. When the flag is OFF, the reply
  is structurally valid but `report.enabled === false` and most fields are null.
- Fields used (when enabled):
  - `report.bootStartMs`, `report.bootEndMs`
  - `report.phases.{start,end,idle}.{startMs,endMs}` — per-phase wallclock windows
  - `report.scripts[].{aliasId, dispatchMs, settleMs, lane, waitReason, tier}` — per-script timing
  - `report.tiers[].{tier, scriptCount, dispatchAllMs, settleAllMs, waveExitMs, waveExitEventsObserved, waveExitMissing, fallbackReason, fallbackAtMs}`
  - `report.fallbackReason`, `report.fallbackAtMs` (top-level fallback if dispatcher gave up)

### 3.3 Loader build info

- Request: `{ type: "h2o-ext-archive:v1:req", id: "<reqId>", req: { op: "__loaderInfo" } }`
- Reply:   `{ type: "h2o-ext-archive:v1:res", id: "<reqId>", ok: true, result: { loaderBuildTs, loaderBuildIso, libraryKvOps, allowOps, allowOpsCount, tag } }`
- Loader source: `loader.js:2528`.
- Flag required: **none**.
- Use: confirms which loader.js build the sample was captured against. Critical
  for confirming the baseline was taken on the right version.

### 3.4 Wave-exit ready events the loader actually waits for

For reference — these are hardcoded in the loader (line 120–121) and are the
gates whose `waveExitMs` we record in §3.2's `report.tiers[].waveExitMs`:

| Wave | Ready events |
|---|---|
| L0 (CORE) | `evt:h2o:core:ready`, `evt:h2o:obs:ready` |
| L1 (DATA) | `evt:h2o:data:ready`, `h2o:identity:ready` |
| L2 (SURFACES) | `h2o.ev:prm:cgx:cntrlhb:ready:v1`, `evt:h2o:minimap:engine-ready`, `h2o.ev:prm:cgx:lib:ready:v1`, `h2o.ev:prm:cgx:sap:ready:v1` |
| L4 (INPUT DOCK) | `evt:h2o:inputdock:ready` (nullable; composer-only) |

If any of these events fail to fire within the wave's budget, the loader
records that wave as a fallback. **Any subsequent phase that introduces a
script-rename or event-rename must be paired with a manifest rebuild and a
re-measurement at this point.**

---

## 4. Measurement methodology

### 4.1 Pre-conditions

1. **Dev server up**: `lsof -iTCP:5500 -sTCP:LISTEN` reports a process. If not:
   ```
   cd /Users/hobayda/H2OCode/repos/h2o-platforms/cockpit-pro/h2o-dev-server
   python3 serve.py 5500
   ```
2. **Extension is loaded** in Chrome from
   `build/chrome-ext-dev-controls-oauth-google/` (Load Unpacked on the Extensions page).
3. **Build is current**: confirm in DevTools after page load that
   `LOADER_BUILD_TS` matches the value recorded in §2. If it doesn't, **stop**
   and rebuild before measuring.
4. **No browser cache for chatgpt.com**: clear or use DevTools "Empty Cache and Hard Reload"
   for the cold-load measurements (right-click the reload button while DevTools is open).
5. **Recommended browser**: the same browser the team uses daily. Note the
   browser name + version in §6 alongside each sample.

### 4.2 Steps per sample

For each of the 3 cold-load samples:

1. Open Chrome. Sign in to `https://chatgpt.com/` (if not already).
2. Open DevTools, switch to the **Console** tab.
3. **For samples 2 and 3 (V3-diag-enabled samples)**: paste and execute
   ```js
   localStorage.setItem("H2O_LOADER_V3_DIAG", "1");
   ```
   then close + reopen DevTools to clear any prior captures.
4. **Hard reload** chatgpt.com (right-click reload → "Empty Cache and Hard Reload").
5. Wait for the page to finish loading. The MiniMap should appear. The Dock
   should be openable. If either fails to render, the sample is invalid —
   note it but do not record as a clean cold-load baseline.
6. Wait **3 seconds** after the visible page is interactive (allows the
   loader to populate `bootDoneMs`).
7. Paste the **harness from §4.3** into the Console and press Enter.
8. The harness prints a JSON block bracketed by
   `===== PHASE 0B BASELINE SAMPLE =====` and
   `===== END SAMPLE — copy the JSON above =====`. Copy the JSON.
9. Paste the JSON into §6 (one of the three "Sample N — raw JSON" code blocks).
10. Repeat for the next sample.

### 4.3 Pasteable harness

Paste this **entire block** into the DevTools Console after step 4.2.6. It
does not require any local files; it is self-contained.

```js
(async () => {
  const PHASE = "0B-baseline";
  const t0 = performance.now();

  const reqId = (prefix) =>
    prefix + "-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8);

  function sendOnce(reqType, body, resType, timeoutMs = 5000) {
    return new Promise((resolve, reject) => {
      const id = reqId(reqType);
      const onMsg = (ev) => {
        if (ev.source !== window) return;
        const d = ev.data;
        if (!d || d.type !== resType || d.id !== id) return;
        window.removeEventListener("message", onMsg);
        resolve(d);
      };
      window.addEventListener("message", onMsg);
      try {
        window.postMessage({ ...body, type: reqType, id }, "*");
      } catch (e) {
        window.removeEventListener("message", onMsg);
        reject(e);
        return;
      }
      setTimeout(() => {
        window.removeEventListener("message", onMsg);
        reject(new Error("timeout waiting for " + resType));
      }, timeoutMs);
    });
  }

  const captureOne = async () => {
    const out = {};
    try {
      const res = await sendOnce(
        "h2o-loader-diag-req",
        {},
        "h2o-loader-diag-res",
      );
      out.timings = res.result;
      out.timingsOk = res.ok;
    } catch (e) {
      out.timingsErr = String(e && (e.message || e));
    }

    try {
      const res = await sendOnce(
        "h2o-ext-archive:v1:req",
        { req: { op: "__schedulerReport" } },
        "h2o-ext-archive:v1:res",
      );
      out.scheduler = res.result;
      out.schedulerOk = res.ok;
    } catch (e) {
      out.schedulerErr = String(e && (e.message || e));
    }

    try {
      const res = await sendOnce(
        "h2o-ext-archive:v1:req",
        { req: { op: "__loaderInfo" } },
        "h2o-ext-archive:v1:res",
      );
      out.loaderInfo = res.result;
      out.loaderInfoOk = res.ok;
    } catch (e) {
      out.loaderInfoErr = String(e && (e.message || e));
    }

    return out;
  };

  const surfaces = await captureOne();

  const sample = {
    capturedAt: new Date().toISOString(),
    phase: PHASE,
    href: location.href,
    pageStartedAtMs: window.performance.timing
      ? window.performance.timing.navigationStart
      : null,
    captureElapsedMs: Math.round(performance.now() - t0),
    userAgent: navigator.userAgent,
    diagFlags: {
      H2O_LOADER_V3_DIAG: localStorage.getItem("H2O_LOADER_V3_DIAG"),
      H2O_LOADER_V3_WAVE_DIAG: localStorage.getItem("H2O_LOADER_V3_WAVE_DIAG"),
      H2O_LOADER_V3_DISPATCHER_MODE: localStorage.getItem(
        "H2O_LOADER_V3_DISPATCHER_MODE",
      ),
      H2O_LOADER_V3_DISPATCHER_PILOT: localStorage.getItem(
        "H2O_LOADER_V3_DISPATCHER_PILOT",
      ),
    },
    ...surfaces,
  };

  // Convenience console output for human copy-paste.
  console.log("===== PHASE 0B BASELINE SAMPLE =====");
  console.log(JSON.stringify(sample, null, 2));
  console.log("===== END SAMPLE — copy the JSON above =====");

  // Also park on window for programmatic retrieval if needed.
  window.__h2oBaselineSample = sample;
  return sample;
})();
```

### 4.4 What to do if a sample fails to capture

- **`timings.bootDoneMs === null`**: the loader hasn't finished booting yet.
  Wait longer and re-run the harness in the same console (no reload).
- **`scheduler.report.enabled === false`** AND you set `H2O_LOADER_V3_DIAG=1`:
  the flag was set after boot started. Set the flag, then hard-reload.
- **`schedulerErr` contains "timeout"**: the V3 diag op isn't responding
  within 5 s. Likely the loader fell back early. Capture the sample anyway
  and note it in §6 as a fallback case — fallback cases are themselves
  baseline data.
- **`timings` is missing entirely** but `loaderInfo` is present: the always-on
  diag receiver may be in a window the loader couldn't reach (cross-frame
  isolation). Record the loaderInfo to confirm which build, and re-run.

---

## 5. Regression thresholds (apply from Phase 0C onward)

Every subsequent migration micro-phase must capture a new triplet of samples
and compare against the median of §6's three samples. A phase is considered
**regression-failed** if any of the following holds:

| Metric | Threshold |
|---|---|
| `timings.bootDoneMs - timings.bootStartMs` (median) | **+10 %** vs. baseline median |
| `timings.proxyPackMs` (median) | **+10 %** vs. baseline median (this is the network fetch + parse of `_paste-pack.ext.txt`; sensitive to dev-server or path changes) |
| `timings.preflightTotalMs` (median) | **+10 %** vs. baseline median |
| `timings.phaseIdleMs` (median) | **+10 %** vs. baseline median |
| Any fallback observed at L0 or L1 in the post-phase samples that was NOT observed in baseline | **immediate fail** |
| Any wave-exit `waveExitMissing` event in post-phase that was absent in baseline | **immediate fail** (a hardcoded ready-event isn't firing) |
| `loaderInfo.allowOpsCount` change | **review required** (the loader's allowed ops surface shifted — possibly intended, possibly accidental) |

For **per-script timings** in `scheduler.report.scripts[]`, regression is
defined per-script: any script whose `(dispatchMs + settleMs)` grows by
≥ 15 % AND ≥ 50 ms is flagged. Smaller absolute increases are within noise.

**Total-budget headroom** to watch: the V3 dispatcher's `V3D_TOTAL_BUDGET_MS`
is the hard limit at which the loader gives up the V3 path. The exact value
is defined inside the loader (read it from a sample's
`scheduler.report.budget` if exposed, else look up in
`build/.../loader.js:618`). Baseline boot should consume **< 60 %** of that
budget; if it consumes more after any phase, **stop** and investigate.

---

## 6. Captured samples (TO BE FILLED IN)

> **This section is empty pending manual capture.** Follow §4.2 three times,
> paste each JSON block in the slot below, then commit. **Phase 0B is not
> complete until all three slots are filled and §7 is signed off.**

### 6.1 Sample 1 — V3 diag flag OFF (baseline path)

- Browser: _<fill in: Chrome xx.x.xxxx.xx>_
- Captured at: _<ISO timestamp from JSON's `capturedAt`>_
- Hard reload? Yes / No: _<fill in>_
- Visible page interactive within: _<seconds>_
- MiniMap rendered: yes / no
- Dock openable: yes / no
- Identity onboarding popup loaded: yes / no
- Notes: _<anything notable>_

```json
<<<PASTE JSON FROM CONSOLE HERE>>>
```

### 6.2 Sample 2 — V3 diag flag ON (detail captured)

- Browser: _<fill in>_
- Captured at: _<ISO timestamp>_
- `H2O_LOADER_V3_DIAG=1` set BEFORE reload: yes / no
- Hard reload? Yes / No: _<fill in>_
- Visible page interactive within: _<seconds>_
- MiniMap rendered: yes / no
- Dock openable: yes / no
- Identity onboarding popup loaded: yes / no
- Notes: _<anything notable>_

```json
<<<PASTE JSON FROM CONSOLE HERE>>>
```

### 6.3 Sample 3 — V3 diag flag ON (detail; second confirmation pass)

- Browser: _<fill in>_
- Captured at: _<ISO timestamp>_
- `H2O_LOADER_V3_DIAG=1` set BEFORE reload: yes / no
- Hard reload? Yes / No: _<fill in>_
- Visible page interactive within: _<seconds>_
- MiniMap rendered: yes / no
- Dock openable: yes / no
- Identity onboarding popup loaded: yes / no
- Notes: _<anything notable>_

```json
<<<PASTE JSON FROM CONSOLE HERE>>>
```

### 6.4 Computed medians (TO BE FILLED IN AFTER SAMPLES)

| Metric | Sample 1 | Sample 2 | Sample 3 | Median |
|---|---|---|---|---|
| `bootDoneMs - bootStartMs` (ms) | _ | _ | _ | _ |
| `proxyPackMs` (ms) | _ | _ | _ | _ |
| `preflightTotalMs` (ms) | _ | _ | _ | _ |
| `phaseIdleMs` (ms) | _ | _ | _ | _ |
| L0 waveExitMs (sample 2/3, if V3 enabled) | n/a | _ | _ | _ |
| L1 waveExitMs (sample 2/3, if V3 enabled) | n/a | _ | _ | _ |
| L2 waveExitMs (sample 2/3, if V3 enabled) | n/a | _ | _ | _ |
| Any fallbackReason populated | _ | _ | _ | _ |

---

## 7. Sign-off (TO BE COMPLETED)

- [ ] All three samples captured per §4.2 with no harness errors.
- [ ] All three samples show MiniMap + Dock + Identity rendering correctly.
- [ ] §6.4 medians filled in.
- [ ] No L0/L1 fallback observed.
- [ ] No `waveExitMissing` events observed.
- [ ] `loaderBuildTs` in all three samples matches §2's recorded value.
- [ ] Sample 1 (V3 flag OFF) consumed < 60 % of total budget if measurable.
- [ ] This file committed; tag `migration-phase-0B-complete` created.

Once signed off, Phase 0C may proceed: refactor `tools/loader/make-aliases.mjs`
and `tools/loader/make-ext-proxy-pack.mjs` to import from `tools/paths.mjs`,
**then re-run §4.2 and compare against §6.4 medians using §5 thresholds.**

---

## 8. Notes for future re-measurement (Phase 0C+)

- Use the **same Chrome profile** and **same chatgpt.com workspace** each time
  to minimize variance from server-side variability.
- Take **at least three** cold reloads per measurement. Document outliers;
  use the median, not the mean.
- If `serve.py` is restarted between captures, expect a small jitter in
  `proxyPackMs` (cold OS file cache). Measure with the server warm — i.e.
  load chatgpt.com once before starting the first measured sample.
- Network conditions: prefer wired or stable wifi. Cellular tethering yields
  high variance and is not a valid baseline source.
- If any future phase changes the loader.js (i.e. `LOADER_BUILD_TS` in
  samples differs from the §2 recorded value), the new baseline must be
  **recaptured** — old samples are invalid for direct comparison.
- The harness at §4.3 is intentionally pure (no `fetch`, no imports). It can
  be pasted into any chrome-live extension variant's console; the per-variant
  difference is in the V3 dispatcher pilot state, which is reported per-sample
  in `diagFlags`.

---

_Last updated: 2026-05-17 (Phase 0B in progress; samples pending manual capture)._
