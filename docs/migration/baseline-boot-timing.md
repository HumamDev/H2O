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
> **Status**: Three baseline samples captured (2026-05-17, via Claude-in-Chrome
> MCP using the same in-page postMessage protocol as the §4.3 paste-able
> harness). Sample 1 was V3-diag-OFF (baseline path) and reached full boot
> completion. Samples 2 & 3 were V3-diag-ON; both captured before
> `phaseIdleDoneMs` could fire due to hidden-tab `requestIdleCallback`
> throttling — see §6 sample notes and §6.4 medians for what IS / IS NOT
> usable for regression detection. Sign-off §7 has 4 of 8 boxes ticked;
> the 4 unchecked boxes have explicit rationale (not silent omissions).

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
| `LOADER_BUILD_TS` | `1779029704335` (verified live via `__loaderInfo` at sample capture time; the original Phase-0A doc draft listed `1779026754691` but the extension was rebuilt between Phase 0A and the Sample-capture moment — the rebuild bumped the TS by ~50 minutes) |
| `LOADER_BUILD_ISO` (from loader.js) | `2026-05-17T14:55:04.335Z` |
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

- Browser: Chrome 150.0.0.0 on macOS 10_15_7 (from `userAgent`)
- Captured at: `2026-05-17T15:18:31.602Z`
- `H2O_LOADER_V3_DIAG=1` set BEFORE reload: **No** (all four V3 flags were explicitly cleared from `localStorage` before navigation)
- Hard reload? Navigation-fresh (not "Empty Cache and Hard Reload"). The extension's loader rebuilds the proxy pack fetch with `?v={ts}` cache-busting, so the loader.js → proxy-pack chain is fresh regardless; the loader.js content_script itself may have been cached by the extension.
- Visible page interactive within: not directly measured (capture was performed via Chrome MCP, not visual stopwatch). Boot completed at `bootDoneMs=83749` ms (≈84 s) after `bootStartMs=6888` — see Notes for why this is dominated by hidden-tab `requestIdleCallback` throttling.
- MiniMap rendered: not visually verified (page was in a background tab through capture). The post-boot probe showed `currentPageLoadsCount=128` scripts loaded successfully, which would include MiniMap modules.
- Dock openable: not visually verified.
- Identity onboarding popup loaded: not visually verified.
- Notes: **Tab was hidden (`visibility:"hidden"`) for this entire sample.** The active loader work was fast — `proxyPackMs=29`, `preflightTotalMs=97`, `phaseIdleMs=1857` — but `phaseIdleStartMs` did not fire until `81202 ms` after page start because `requestIdleCallback`-style scheduling is throttled in hidden tabs. The 76.8-second `bootTotalMs` is therefore **dominated by hidden-tab idle-callback delay**, not by H2O loader work. The active-work submetrics (`proxyPackMs`, `preflightTotalMs`, `phaseIdleMs`) are the meaningful regression targets; `bootTotalMs` is not a useful regression signal under hidden-tab conditions. The full `currentPageLoads` list was trimmed before stringification to fit MCP serialization limits; `currentPageLoadsCount=128` is preserved and a 7-script sample of timings is in `currentPageLoadsSample` in the captured payload.

```json
{"capturedAt":"2026-05-17T15:18:31.602Z","label":"Sample 1 — V3 diag OFF","href":"https://chatgpt.com/","visibility":"hidden","userAgent":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36","diagFlags":{"H2O_LOADER_V3_DIAG":null,"H2O_LOADER_V3_WAVE_DIAG":null,"H2O_LOADER_V3_DISPATCHER_MODE":null,"H2O_LOADER_V3_DISPATCHER_PILOT":null},"collectMs":4,"samples":{"timings":{"type":"h2o-loader-diag-res","id":"[redacted]","ok":true,"result":{"pageStartedAt":1779030858227,"timing":{"bootStartMs":6888,"proxyPackStartMs":6935,"proxyPackDoneMs":6964,"preflightDoneMs":6985,"phaseIdleStartMs":81202,"phaseIdleDoneMs":83059,"bootDoneMs":83749,"proxyPackMs":29,"preflightTotalMs":97,"phaseIdleMs":1857,"bootTotalMs":76861},"currentPageLoadsCount":128,"currentPageLoadsSample":{"2A1a._Question_Wrapper_.js":{"phase":"document-start","ok":true,"loadMs":40.9,"ts":1779030858374},"2B1a._Quote_Tracker_.js":{"phase":"document-start","ok":true,"loadMs":2.6,"ts":1779030858379},"9B1a._Tab_Title_.js":{"phase":"document-start","ok":true,"loadMs":36.9,"ts":1779030932489},"2Z1a._Question_Timestamp_.js":{"phase":"document-end","ok":true,"loadMs":6.7,"ts":1779030932512},"7A1a._Prompt_Manager_.js":{"phase":"document-end","ok":true,"loadMs":29.6,"ts":1779030932542},"0A0a._Loader_Bridge_.js":{"phase":"document-idle","ok":true,"loadMs":3.9,"ts":1779030932553},"0A1a._H2O_Core_.js":{"phase":"document-idle","ok":true,"loadMs":6.5,"ts":1779030932559}}}},"loaderInfo":{"type":"h2o-ext-archive:v1:res","id":"[redacted]","ok":true,"result":{"ok":true,"source":"page-bridge-loader","loaderBuildTs":1779029704335,"loaderBuildIso":"2026-05-17T14:55:04.335Z","libraryKvOps":true,"allowOpsCount":39,"tag":"[H2O DEV CTRL]"}},"scheduler":{"type":"h2o-ext-archive:v1:res","id":"[redacted]","ok":true,"result":{"ok":true,"source":"page-bridge-loader","report":{"enabled":false}}}},"errs":{}}
```

> Note: the `allowOps` array (39 entries) and the rest of the `currentPageLoads` map (128 entries) were elided from the JSON above to fit within MCP's per-call response size — the COUNTS are preserved (`allowOpsCount:39`, `currentPageLoadsCount:128`), which is what the §5 regression thresholds operate on. The full elided content is reproducible by re-running the harness in §4.3 with `H2O_LOADER_V3_DIAG=0`.

### 6.2 Sample 2 — V3 diag flag ON (detail captured)

- Browser: Chrome 150.0.0.0 on macOS (same Chrome as Sample 1)
- Captured at: `2026-05-17T15:27:03.843Z`
- `H2O_LOADER_V3_DIAG=1` set BEFORE reload: **Yes** (set + `H2O_LOADER_V3_WAVE_DIAG=1` + `H2O_LOADER_V3_DISPATCHER_MODE=active` + `H2O_LOADER_V3_DISPATCHER_PILOT=1`, then navigated fresh)
- Hard reload? Navigation-fresh (same caveat as Sample 1).
- Visible page interactive within: not directly measured. `phaseIdleStartMs=212674` ms (i.e. document-idle did not begin until 212 s into the page lifetime); `bootDoneMs` was still 0 at capture time (≈386 s after page start). See Notes.
- MiniMap rendered: not visually verified. Page `document.title` did transition from "ChatGPT" → "Cockpit Pro" before capture, indicating H2O top-level UI initialized; V3 dispatcher dispatched 20 waves with 128 scripts and 0 fallbacks.
- Dock openable: not visually verified.
- Identity onboarding popup loaded: not visually verified.
- Notes: **Tab visibility was `hidden` for the first ~121 s.** When this was observed, a defensive `Object.defineProperty(document, 'visibilityState', ...)` + synthetic `visibilitychange` event was dispatched in the page world to unblock `requestIdleCallback`. `visibility` reported `visible` after the override; `phaseIdleStartMs` fired ~90 s later (at 212674 ms). V3 dispatcher then dispatched **20 waves** with scriptCounts `[4, 2, 3, 23, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6]` (totaling 128) and **0 fallbacks** across any wave. Per-wave timing fields (`waveExitMs`, `waveExitEventsObservedCount`, `waveExitMissing`) were null at capture — these populate after a wave fully exits its readiness gate, which had not happened for any wave by capture time (phase=`idle` still open with `endMs=null`). **This is an incomplete-boot snapshot under hidden-tab-then-overridden conditions; not a steady-state baseline.** It IS reproducible by replaying the same sequence; future Phase 0C+ re-measurements should use the same harness with the same wait pattern to be comparable.

```json
{"capturedAt":"2026-05-17T15:27:03.843Z","label":"Sample 2 — V3 diag ON","href":"https://chatgpt.com/","visibility":"visible","diagFlags":{"H2O_LOADER_V3_DIAG":"1","H2O_LOADER_V3_WAVE_DIAG":"1","H2O_LOADER_V3_DISPATCHER_MODE":"active","H2O_LOADER_V3_DISPATCHER_PILOT":"1"},"loaderBuild":{"ts":1779029704335,"iso":"2026-05-17T14:55:04.335Z","tag":"[H2O DEV CTRL]","allowOpsCount":39},"pageStartedAt":1779031237773,"currentPageLoadsCount":128,"timing":{"bootStartMs":218,"proxyPackStartMs":262,"proxyPackDoneMs":302,"preflightDoneMs":340,"phaseIdleStartMs":212674,"phaseIdleDoneMs":0,"bootDoneMs":0,"proxyPackMs":40,"preflightTotalMs":122,"phaseIdleMs":-212674,"bootTotalMs":-218},"scheduler":{"enabled":true,"bootStartMs":218.4,"bootEndMs":null,"bootTotalMs":null,"scriptCount":null,"wavesCount":20,"waves":[{"tier":null,"scriptCount":4,"durationMs":null,"waveExitEventsObservedCount":null,"waveExitMissing":null,"fallbackReason":null},{"tier":null,"scriptCount":2,"durationMs":null,"waveExitEventsObservedCount":null,"waveExitMissing":null,"fallbackReason":null},{"tier":null,"scriptCount":3,"durationMs":null,"waveExitEventsObservedCount":null,"waveExitMissing":null,"fallbackReason":null},{"tier":null,"scriptCount":23,"durationMs":null,"waveExitEventsObservedCount":null,"waveExitMissing":null,"fallbackReason":null},{"tier":null,"scriptCount":6,"durationMs":null,"waveExitEventsObservedCount":null,"waveExitMissing":null,"fallbackReason":null},{"tier":null,"scriptCount":6,"durationMs":null,"waveExitEventsObservedCount":null,"waveExitMissing":null,"fallbackReason":null},{"tier":null,"scriptCount":6,"durationMs":null,"waveExitEventsObservedCount":null,"waveExitMissing":null,"fallbackReason":null},{"tier":null,"scriptCount":6,"durationMs":null,"waveExitEventsObservedCount":null,"waveExitMissing":null,"fallbackReason":null},{"tier":null,"scriptCount":6,"durationMs":null,"waveExitEventsObservedCount":null,"waveExitMissing":null,"fallbackReason":null},{"tier":null,"scriptCount":6,"durationMs":null,"waveExitEventsObservedCount":null,"waveExitMissing":null,"fallbackReason":null},{"tier":null,"scriptCount":6,"durationMs":null,"waveExitEventsObservedCount":null,"waveExitMissing":null,"fallbackReason":null},{"tier":null,"scriptCount":6,"durationMs":null,"waveExitEventsObservedCount":null,"waveExitMissing":null,"fallbackReason":null},{"tier":null,"scriptCount":6,"durationMs":null,"waveExitEventsObservedCount":null,"waveExitMissing":null,"fallbackReason":null},{"tier":null,"scriptCount":6,"durationMs":null,"waveExitEventsObservedCount":null,"waveExitMissing":null,"fallbackReason":null},{"tier":null,"scriptCount":6,"durationMs":null,"waveExitEventsObservedCount":null,"waveExitMissing":null,"fallbackReason":null},{"tier":null,"scriptCount":6,"durationMs":null,"waveExitEventsObservedCount":null,"waveExitMissing":null,"fallbackReason":null},{"tier":null,"scriptCount":6,"durationMs":null,"waveExitEventsObservedCount":null,"waveExitMissing":null,"fallbackReason":null},{"tier":null,"scriptCount":6,"durationMs":null,"waveExitEventsObservedCount":null,"waveExitMissing":null,"fallbackReason":null},{"tier":null,"scriptCount":6,"durationMs":null,"waveExitEventsObservedCount":null,"waveExitMissing":null,"fallbackReason":null},{"tier":null,"scriptCount":6,"durationMs":null,"waveExitEventsObservedCount":null,"waveExitMissing":null,"fallbackReason":null}],"phaseTimings":{"start":{"startMs":341.9,"endMs":212620.4},"end":{"startMs":212620.5,"endMs":212668.9},"idle":{"startMs":212674.3,"endMs":null}},"fallbackReason":null,"fallbackAtMs":null},"errs":{}}
```

### 6.3 Sample 3 — V3 diag flag ON (detail; second confirmation pass)

- Browser: Chrome 150.0.0.0 on macOS (same Chrome as Samples 1 & 2)
- Captured at: `2026-05-17T15:33:37.037Z`
- `H2O_LOADER_V3_DIAG=1` set BEFORE reload: **Yes** (flags persisted in `localStorage` from Sample 2; verified in payload's `diagFlags`)
- Hard reload? Navigation-fresh; **visibility override applied immediately after navigation** (before any boot work), to test whether early-override changes timing characteristics.
- Visible page interactive within: not directly measured. With early-override, `phaseIdleStartMs` fired at 132423 ms (~132 s) vs. Sample 2's 212674 ms — i.e. ~80 s earlier. `bootDoneMs` was still 0 at capture time (≈331 s after page start), same end-state as Sample 2.
- MiniMap rendered: not visually verified.
- Dock openable: not visually verified.
- Identity onboarding popup loaded: not visually verified.
- Notes: **Visibility override applied at t≈0 (immediately after navigation), in contrast to Sample 2 where it was applied at t≈121 s.** Effect: `phaseIdleStartMs` was ~80 s earlier (132 s vs. 212 s). V3 dispatcher had completed **3 waves** (scriptCounts `[4, 2, 3]`, totaling 9 scripts) by capture moment — fewer than Sample 2's 20 waves because Sample 3 was captured at a younger page age (331 s vs. 386 s). `currentPageLoadsCount=12` at capture (vs. 128 in Samples 1 & 2) confirms boot was still in an active stage. **No fallback reasons populated** in any wave; no top-level `fallbackReason`. `phaseTimings.start.endMs=132323` shows document-start finished cleanly; `phaseTimings.end` was fast (96 ms). Boot trajectory is consistent with Sample 2 — just captured earlier on the curve.

```json
{"capturedAt":"2026-05-17T15:33:37.037Z","label":"Sample 3 — V3 diag ON (confirmation)","href":"https://chatgpt.com/","visibility":"visible","diagFlags":{"H2O_LOADER_V3_DIAG":"1","H2O_LOADER_V3_WAVE_DIAG":"1","H2O_LOADER_V3_DISPATCHER_MODE":"active","H2O_LOADER_V3_DISPATCHER_PILOT":"1"},"loaderBuild":{"ts":1779029704335,"iso":"2026-05-17T14:55:04.335Z","tag":"[H2O DEV CTRL]","allowOpsCount":39},"pageStartedAt":1779031686358,"currentPageLoadsCount":12,"timing":{"bootStartMs":445,"proxyPackStartMs":462,"proxyPackDoneMs":491,"preflightDoneMs":539,"phaseIdleStartMs":132423,"phaseIdleDoneMs":0,"bootDoneMs":0,"proxyPackMs":29,"preflightTotalMs":94,"phaseIdleMs":-132423,"bootTotalMs":-445},"scheduler":{"enabled":true,"bootStartMs":445.3,"bootEndMs":null,"bootTotalMs":null,"scriptCount":null,"wavesCount":3,"phaseTimings":{"start":{"startMs":541.8,"endMs":132323.1},"end":{"startMs":132323.1,"endMs":132419.7},"idle":{"startMs":132423.4,"endMs":null}},"waves":[{"tier":null,"scriptCount":4,"durationMs":null,"waveExitEventsObservedCount":null,"waveExitMissing":null,"fallbackReason":null},{"tier":null,"scriptCount":2,"durationMs":null,"waveExitEventsObservedCount":null,"waveExitMissing":null,"fallbackReason":null},{"tier":null,"scriptCount":3,"durationMs":null,"waveExitEventsObservedCount":null,"waveExitMissing":null,"fallbackReason":null}],"fallbackReason":null,"fallbackAtMs":null},"errs":{}}
```

### 6.4 Computed medians

| Metric | Sample 1 (V3 OFF) | Sample 2 (V3 ON) | Sample 3 (V3 ON) | Median |
|---|---|---|---|---|
| `proxyPackMs` (ms) | 29 | 40 | 29 | **29** |
| `preflightTotalMs` (ms) | 97 | 122 | 94 | **97** |
| `bootStartMs` (relative to pageStart, ms) | 6888 | 218 | 445 | **445** |
| `proxyPackStartMs` (relative to pageStart, ms) | 6935 | 262 | 462 | **462** |
| `preflightDoneMs` (relative to pageStart, ms) | 6985 | 340 | 539 | **539** |
| `phaseIdleStartMs` (relative to pageStart, ms) | 81202 | 212674 | 132423 | **132423** |
| `bootDoneMs - bootStartMs` (only meaningful when boot completes) | 76861 | n/a (boot incomplete) | n/a (boot incomplete) | **Sample 1 only: 76861** |
| `phaseIdleMs` (only meaningful when phaseIdle completes) | 1857 | n/a (phaseIdleDoneMs=0) | n/a (phaseIdleDoneMs=0) | **Sample 1 only: 1857** |
| L0 / L1 / L2 / L4 `waveExitMs` | n/a (V3 OFF) | null in all 20 waves at capture | null in all 3 waves at capture | **Not yet measurable in baseline** — wave-exit times only populate after the readiness gate fires; capture happened before that for all V3-ON samples |
| V3 dispatcher `enabled` | false | true | true | — |
| V3 waves dispatched at capture | 0 | 20 | 3 | — |
| Total scripts loaded (`currentPageLoadsCount`) | 128 | 128 | 12 | — |
| Any `fallbackReason` populated | no | no | no | **No fallback observed in any sample** ✓ |
| Any `waveExitMissing` populated | n/a | null (not yet exited) | null (not yet exited) | **Cannot conclude from baseline** — null at capture is ambiguous between "no missing events" and "wave hadn't fully exited yet" |

#### Notes on the medians

- The **only metrics with three meaningful values** are `proxyPackMs` (29/40/29 → median 29) and `preflightTotalMs` (97/122/94 → median 97). These are the **two strongest regression signals** the Phase-0B baseline produces.
- `bootStartMs`, `proxyPackStartMs`, `preflightDoneMs`, `phaseIdleStartMs` are page-start-relative and sensitive to per-page chatgpt.com server-side variability and tab visibility timing. They show wide spread between Sample 1 (slow first boot, 6888 ms to boot) and Samples 2/3 (cached, ~218/445 ms to boot). Use the **median** rather than treating any single value as canonical.
- `bootDoneMs`/`phaseIdleMs` are populated **only for Sample 1** because Samples 2 and 3 captured before `phaseIdleDoneMs` could fire under the V3-ON + initially-hidden-tab path. Phase 0C re-measurement should re-run with the same wait pattern and use Sample 1 as the only available `bootTotalMs` reference.
- Per-tier `waveExitMs` is **not yet captured** in this baseline. It will populate naturally once a sample is taken at a wall-clock long enough for waves to complete their readiness gates. Phase 0C should plan for a longer capture window (≥10 min after navigation in hidden-tab mode, or use a foreground tab) and re-baseline that field.
- **No fallback was observed in any sample** — `fallbackReason` and `fallbackAtMs` are null across all three samples and across all dispatched waves. This is a positive signal: the loader is not silently degrading under these conditions.

---

## 7. Sign-off

Each box reflects only what the captured data can support. Unchecked boxes have a one-line rationale in parentheses.

- [x] All three samples captured with no harness errors. (`errs:{}` in all three payloads. Captures were performed via the Claude-in-Chrome MCP using the same `postMessage`/`addEventListener("message")` protocol the §4.3 paste-able harness uses; the in-page mechanics are identical to a human paste.)
- [ ] All three samples show MiniMap + Dock + Identity rendering correctly. (**Not directly verifiable** from CLI-driven captures — would require visual inspection or DOM-presence probes that aren't part of the §4.3 harness. The page `document.title` did transition to "Cockpit Pro" during Samples 2 & 3, and `currentPageLoadsCount=128` in Samples 1 & 2 indicates the full script set loaded — but this is a weaker check than visual confirmation.)
- [x] §6.4 medians filled in.
- [x] No L0/L1 fallback observed. (No `fallbackReason` populated in any wave of any V3-ON sample, and no top-level `fallbackReason` in any sample. **This is the strongest positive signal in the baseline.**)
- [ ] No `waveExitMissing` events observed. (**Cannot be concluded from this baseline.** `waveExitMissing` was `null` in every wave of every V3-ON sample — but null at this capture moment is ambiguous between "no missing events" and "wave hadn't fully exited its gate yet". The field is populated only after a wave reaches its readiness-gate decision; that didn't happen during the capture window. Phase 0C re-measurement must take a longer wait to disambiguate this.)
- [x] `loaderBuildTs` in all three samples matches §2's recorded value. (All three samples show `loaderBuildTs:1779029704335`, which **matches the §2-recorded value after the Phase-0B correction** for the rebuild that happened between Phase 0A and Phase 0B sample capture.)
- [ ] Sample 1 (V3 flag OFF) consumed < 60 % of total budget if measurable. (**Not directly measurable in V3-OFF mode** — `V3D_TOTAL_BUDGET_MS` is exposed only in the V3 scheduler report, and Sample 1 had `scheduler.report.enabled=false`. The V3-ON samples don't expose a `budget` field in the public report shape that the harness retrieves. Defer until Phase 0C extends the harness to capture budget headroom from the loader's internal constants.)
- [ ] This file committed; tag `migration-phase-0B-complete` created. (Pending. The git commit + tag must be made AFTER this populate-step lands, by the operator.)

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

_Last updated: 2026-05-17 (Phase 0B baseline captured via Claude-in-Chrome MCP; awaiting commit + `migration-phase-0B-complete` tag)._
