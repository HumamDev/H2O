// Development-only Stage 0B-2B title-navigation diagnostic generators.
// The generated collectors are passive and exist only in the explicitly
// gated dev-controls-oauth-google build.

export const TITLE_DIAGNOSTIC_VARIANT = "dev-controls-oauth-google";
export const TITLE_DIAGNOSTIC_ENV = "H2O_TITLE_DIAGNOSTIC";

export const TITLE_DIAGNOSTIC_FILES = Object.freeze({
  isolated: "title-navigation-diagnostic-content.js",
  main: "title-navigation-diagnostic-page.js",
  popup: "title-navigation-diagnostic-popup.js",
});

export const TITLE_DIAGNOSTIC_CONSTANTS = Object.freeze({
  namespace: "h2o.title-stage0b2b.v1",
  schema: "h2o.title-stage0b2b.evidence.v1",
  bridgeMarker: "__H2O_TITLE_STAGE0B2B_BRIDGE_V1__",
  registrationIds: Object.freeze({
    isolated: "h2o-title-stage0b2b-isolated-v1",
    main: "h2o-title-stage0b2b-page-v1",
  }),
  storage: Object.freeze({
    control: "h2o:dev:title-stage0b2b:v1:control",
    evidence: "h2o:dev:title-stage0b2b:v1:evidence",
    status: "h2o:dev:title-stage0b2b:v1:status",
  }),
  limits: Object.freeze({
    maxEvents: 500,
    maxDocuments: 20,
    maxStoredBytes: 128 * 1024,
    maxEventPayloadBytes: 2 * 1024,
    criticalReserveEvents: 64,
    criticalReserveBytes: 24 * 1024,
    maxTitleLengthMetadata: 128,
    maxErrorMessage: 200,
    maxStackFrames: 5,
    maxStackChars: 500,
    maxStatusTtlMs: 24 * 60 * 60 * 1000,
    runTimeoutMs: 3 * 60 * 1000,
    settleMs: 2 * 1000,
  }),
});

export function isTitleDiagnosticBuildEnabled({ envValue, outVariant }) {
  return String(envValue || "") === "1" && String(outVariant || "") === TITLE_DIAGNOSTIC_VARIANT;
}

function constantsSource() {
  return JSON.stringify({
    ...TITLE_DIAGNOSTIC_CONSTANTS,
    files: TITLE_DIAGNOSTIC_FILES,
  });
}

export function makeTitleNavigationDiagnosticServiceWorkerJs() {
  const constants = constantsSource();
  return `
/* H2O_TITLE_STAGE0B2B_SERVICE_WORKER_V1 */
(function h2oTitleStage0B2BServiceWorker() {
  "use strict";
  if (globalThis.__h2oTitleStage0B2BServiceWorkerV1) return;
  globalThis.__h2oTitleStage0B2BServiceWorkerV1 = true;

  const C = ${constants};
  const OWNED_IDS = Object.freeze([C.registrationIds.isolated, C.registrationIds.main]);
  const CHAT_FILTER = Object.freeze({ url: [{ hostEquals: "chatgpt.com", schemes: ["https"] }] });
  const ALLOWED_POPUP_OPS = new Set(["reset", "arm", "status", "export", "clear"]);
  const ALLOWED_COLLECTOR_TYPES = new Set([
    "content.bootstrap", "content.activated", "content.reinjected", "content.stopped",
    "bridge.main-ready", "bridge.h2o-ready", "bridge.h2o-replaced", "bridge.subscribed",
    "bridge.unsubscribed", "bridge.stopped", "title.direct-notification", "title.state-snapshot", "title.event",
    "route.event", "route.popstate", "document.title", "dom.under-input",
    "dom.title-menu-count", "dom.emoji-badge-count", "performance.longtask",
    "performance.layout-shift", "runtime.availability", "runtime.loader-marker",
    "runtime.error", "runtime.timeout"
  ]);
  const CRITICAL_EVENT_TYPES = new Set([
    "content.bootstrap", "content.activated", "bridge.main-ready", "bridge.h2o-replaced",
    "runtime.loader-marker", "runtime.error", "runtime.timeout", "run.completed"
  ]);
  const DESTINATION_ACTIVITY_TYPES = new Set([
    "content.bootstrap", "content.activated", "bridge.main-ready", "title.direct-notification",
    "title.state-snapshot", "title.event", "route.event", "route.popstate", "document.title",
    "dom.under-input", "dom.title-menu-count", "dom.emoji-badge-count", "runtime.error"
  ]);
  const DATA_KEYS = new Set([
    "reason", "state", "name", "present", "active", "count", "added", "removed",
    "textChanged", "attribute", "length", "lengthCapped", "changeSeq", "value",
    "duration", "startTime", "hadRecentInput", "titleOwned", "source", "emojiSource",
    "priority", "routeTokenPresent", "stateRevision", "storageBackend", "durable",
    "selfCheckOk", "chatTitle", "tabTitle", "underInput", "autoEmojiAbsent",
    "loaderBuildTs", "loaderBuildIso", "loaderSource", "contentInstanceId",
    "pageInstanceId", "performanceTimeOrigin", "errorKind", "message", "stack",
    "markerMatch", "lifecycle", "destinationReady", "isolatedReady", "mainReady"
  ]);
  let writeChain = Promise.resolve();
  let settleTimer = null;
  let timeoutTimer = null;

  const now = () => Date.now();
  const bytes = (value) => new TextEncoder().encode(JSON.stringify(value)).byteLength;
  const cleanText = (value, max) => String(value == null ? "" : value)
    .replace(/https?:\\/\\/\\S+/gi, "[url]")
    .replace(/(?:[A-Za-z]:)?[\\/][^\\s]+/g, "[path]")
    .replace(/[\\r\\n\\t]+/g, " ").slice(0, max);
  const finite = (value) => value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value)) ? Number(value) : null;
  const validNonce = (value) => typeof value === "string" && /^[a-z0-9-]{16,80}$/i.test(value);
  const validId = (value) => typeof value === "string" && /^[a-z0-9._:-]{1,128}$/i.test(value);
  const isChatUrl = (value) => {
    try {
      const url = new URL(String(value || ""));
      return url.protocol === "https:" && url.hostname === "chatgpt.com" && /^\\/c\\/[^/?#]+/.test(url.pathname);
    } catch { return false; }
  };

  async function shortHash(value, salt) {
    const raw = new TextEncoder().encode(String(salt || "") + "\\u0000" + String(value || ""));
    const digest = await crypto.subtle.digest("SHA-256", raw);
    return Array.from(new Uint8Array(digest).slice(0, 6), (n) => n.toString(16).padStart(2, "0")).join("");
  }

  async function routeShape(value, salt) {
    try {
      const url = new URL(String(value || ""));
      if (url.protocol !== "https:" || url.hostname !== "chatgpt.com") return "other";
      const parts = url.pathname.split("/").filter(Boolean);
      if (parts[0] === "c" && parts[1]) return "/c/#" + await shortHash(parts[1], salt);
      if (parts[0] === "g" && parts[1] && parts[2] === "c" && parts[3]) {
        return "/g/#" + await shortHash(parts[1], salt) + "/c/#" + await shortHash(parts[3], salt);
      }
      if (parts[0] === "g" && parts[1]) return "/g/#" + await shortHash(parts[1], salt);
      return parts.length ? "/" + cleanText(parts[0], 32) : "/";
    } catch { return "invalid"; }
  }

  function sanitizeStack(value) {
    return String(value || "").split("\\n").slice(0, C.limits.maxStackFrames)
      .map((line) => cleanText(line, 160)).join("\\n").slice(0, C.limits.maxStackChars);
  }

  function sanitizeData(input) {
    if (!input || typeof input !== "object" || Array.isArray(input)) return {};
    const out = {};
    for (const [key, value] of Object.entries(input)) {
      if (!DATA_KEYS.has(key)) continue;
      if (key === "message") out[key] = cleanText(value, C.limits.maxErrorMessage);
      else if (key === "stack") out[key] = sanitizeStack(value);
      else if (key === "length" || key === "lengthCapped") out[key] = Math.max(0, Math.min(C.limits.maxTitleLengthMetadata, finite(value) || 0));
      else if (typeof value === "boolean") out[key] = value;
      else if (typeof value === "number") out[key] = Number.isFinite(value) ? value : null;
      else if (typeof value === "string") out[key] = cleanText(value, 128);
    }
    return out;
  }

  function emptyEvidence(runId, state, at) {
    return {
      schema: C.schema, runId: runId || null, state: state || "idle", createdAt: at || now(),
      armedAt: null, completedAt: null, targetTabId: null, build: null, documents: [], events: [],
      summary: { sourceRoute: null, destinationRoute: null, markerMatch: null },
      limits: C.limits, overflowCount: 0, droppedBySizeCount: 0, dedupSuppressedCount: 0,
      truncated: false, completionReason: null
    };
  }

  const enqueue = (job) => {
    const next = writeChain.then(job, job);
    writeChain = next.catch(() => {});
    return next;
  };
  const readAll = async () => chrome.storage.local.get([C.storage.control, C.storage.evidence, C.storage.status]);
  const rawWriteValues = async (values) => chrome.storage.local.set(values);
  const writeValues = async (values) => enqueue(() => rawWriteValues(values));
  const removeValues = async (keys) => enqueue(() => chrome.storage.local.remove(keys));

  function makeStatus(control, evidence, stateOverride) {
    const state = stateOverride || control?.state || evidence?.state || "idle";
    return {
      schema: C.schema, state, updatedAt: now(), expiresAt: now() + C.limits.maxStatusTtlMs,
      eventCount: evidence?.events?.length || 0, documentCount: evidence?.documents?.length || 0,
      markerMatch: evidence?.summary?.markerMatch ?? null,
      timeout: evidence?.completionReason === "timeout",
      completionReason: evidence?.completionReason || null,
      sourceRoute: evidence?.summary?.sourceRoute || null,
      destinationRoute: evidence?.summary?.destinationRoute || null
    };
  }

  function bumpCounter(evidence, key) {
    evidence[key] = Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Number(evidence[key]) || 0) + 1);
    evidence.truncated = true;
  }

  function nextSequence(evidence) {
    return evidence.events.reduce((max, event) => Math.max(max, Number(event.seq) || 0), 0) + 1;
  }

  function makeEvent(evidence, spec) {
    const atEpochMs = finite(spec.atEpochMs) ?? now();
    return {
      seq: nextSequence(evidence), eventId: spec.eventId, atEpochMs,
      tRelMs: Math.max(0, atEpochMs - evidence.createdAt),
      source: cleanText(spec.source, 32), category: cleanText(spec.category, 32), type: cleanText(spec.type, 80),
      priorityClass: spec.priorityClass === "critical" ? "critical" : "optional",
      tabId: Number.isInteger(spec.tabId) ? spec.tabId : null,
      frameId: Number.isInteger(spec.frameId) ? spec.frameId : null,
      documentId: validId(spec.documentId) ? spec.documentId : null,
      route: typeof spec.route === "string" && spec.route.length <= 96 ? spec.route : null,
      data: sanitizeData(spec.data)
    };
  }

  function trimToHardLimit(evidence, protectedEventId) {
    while (evidence.events.length > C.limits.maxEvents || bytes(evidence) > C.limits.maxStoredBytes) {
      let index = evidence.events.findIndex((event) => event.priorityClass !== "critical" && event.eventId !== protectedEventId);
      if (index < 0) index = evidence.events.findIndex((event) => event.eventId !== protectedEventId);
      if (index < 0) break;
      evidence.events.splice(index, 1);
      bumpCounter(evidence, "overflowCount");
    }
    return evidence.events.some((event) => event.eventId === protectedEventId) && bytes(evidence) <= C.limits.maxStoredBytes;
  }

  // Optional telemetry may use only the non-reserved portion of the record.
  // Critical events evict oldest optional telemetry first and, only if the
  // record contains critical evidence exclusively, the oldest prior critical
  // event. The newest critical transition therefore remains bounded and visible.
  function retainEvent(evidence, event) {
    if (bytes(event) > C.limits.maxEventPayloadBytes) {
      bumpCounter(evidence, "droppedBySizeCount");
      trimToHardLimit(evidence, null);
      return false;
    }
    const critical = event.priorityClass === "critical";
    const optionalCount = evidence.events.filter((item) => item.priorityClass !== "critical").length;
    if (!critical && (optionalCount >= C.limits.maxEvents - C.limits.criticalReserveEvents ||
      bytes(evidence) + bytes(event) > C.limits.maxStoredBytes - C.limits.criticalReserveBytes)) {
      bumpCounter(evidence, "droppedBySizeCount");
      trimToHardLimit(evidence, null);
      return false;
    }
    evidence.events.push(event);
    if (!critical && (evidence.events.length > C.limits.maxEvents || bytes(evidence) > C.limits.maxStoredBytes)) {
      evidence.events.pop();
      bumpCounter(evidence, "droppedBySizeCount");
      trimToHardLimit(evidence, null);
      return false;
    }
    const retained = trimToHardLimit(evidence, event.eventId);
    if (!retained) bumpCounter(evidence, "droppedBySizeCount");
    trimToHardLimit(evidence, retained ? event.eventId : null);
    return retained;
  }

  function applyEventState(evidence, event, spec) {
    if (spec.type === "runtime.loader-marker") {
      const reported = {
        loaderBuildTs: event.data.loaderBuildTs ?? null,
        loaderBuildIso: event.data.loaderBuildIso || "",
        source: event.data.loaderSource || ""
      };
      if (!evidence.build) evidence.build = reported;
      const matches = evidence.build.loaderBuildTs === reported.loaderBuildTs &&
        evidence.build.loaderBuildIso === reported.loaderBuildIso && evidence.build.source === reported.source;
      evidence.summary.markerMatch = evidence.summary.markerMatch === false ? false : matches;
    }
    if (spec.documentId && !evidence.documents.some((doc) => doc.documentId === spec.documentId)) {
      if (evidence.documents.length < C.limits.maxDocuments) {
        evidence.documents.push({
          documentId: spec.documentId, tabId: event.tabId, frameId: event.frameId,
          firstSeenAt: event.atEpochMs, route: event.route, isolatedReady: false, mainReady: false
        });
      } else { bumpCounter(evidence, "overflowCount"); }
    }
    const document = evidence.documents.find((doc) => doc.documentId === spec.documentId);
    if (document && spec.type === "content.activated") document.isolatedReady = true;
    if (document && spec.type === "bridge.main-ready") document.mainReady = true;
  }

  function eventPriority(spec) {
    return spec.priorityClass === "critical" || spec.category === "navigation" || CRITICAL_EVENT_TYPES.has(spec.type)
      ? "critical" : "optional";
  }

  async function appendEvent(spec) {
    return enqueue(async () => {
      const all = await readAll();
      const control = all[C.storage.control];
      const evidence = all[C.storage.evidence];
      if (!control || !evidence || control.runId !== spec.runId || evidence.runId !== spec.runId) return false;
      if (!validId(spec.eventId) || evidence.events.some((event) => event.eventId === spec.eventId)) {
        bumpCounter(evidence, "dedupSuppressedCount");
        trimToHardLimit(evidence, null);
        await rawWriteValues({ [C.storage.evidence]: evidence, [C.storage.status]: makeStatus(control, evidence) });
        return false;
      }
      const event = makeEvent(evidence, { ...spec, priorityClass: eventPriority(spec) });
      applyEventState(evidence, event, spec);
      const retained = retainEvent(evidence, event);
      await rawWriteValues({ [C.storage.evidence]: evidence, [C.storage.status]: makeStatus(control, evidence) });
      return retained;
    });
  }

  async function unregisterOwned() {
    const registered = await chrome.scripting.getRegisteredContentScripts({ ids: OWNED_IDS }).catch(() => []);
    const ids = registered.map((item) => item.id).filter((id) => OWNED_IDS.includes(id));
    if (ids.length) await chrome.scripting.unregisterContentScripts({ ids }).catch(() => {});
  }

  function registrationIsHealthy(item, id, file, world) {
    return Boolean(item && item.id === id && item.runAt === "document_start" &&
      item.persistAcrossSessions === false && item.allFrames === false && item.world === world &&
      Array.isArray(item.matches) && item.matches.length === 1 && item.matches[0] === "https://chatgpt.com/*" &&
      Array.isArray(item.js) && item.js.length === 1 && item.js[0] === file);
  }

  async function ownedRegistrationHealth() {
    const registered = await chrome.scripting.getRegisteredContentScripts({ ids: OWNED_IDS }).catch(() => []);
    const isolated = registered.find((item) => item.id === C.registrationIds.isolated);
    const main = registered.find((item) => item.id === C.registrationIds.main);
    return {
      count: registered.length,
      healthy: registered.length === 2 &&
        registrationIsHealthy(isolated, C.registrationIds.isolated, C.files.isolated, "ISOLATED") &&
        registrationIsHealthy(main, C.registrationIds.main, C.files.main, "MAIN")
    };
  }

  async function registerOwned() {
    await unregisterOwned();
    await chrome.scripting.registerContentScripts([
      { id: C.registrationIds.isolated, matches: ["https://chatgpt.com/*"], js: [C.files.isolated], runAt: "document_start", allFrames: false, persistAcrossSessions: false, world: "ISOLATED" },
      { id: C.registrationIds.main, matches: ["https://chatgpt.com/*"], js: [C.files.main], runAt: "document_start", allFrames: false, persistAcrossSessions: false, world: "MAIN" }
    ]);
    const confirmed = await chrome.scripting.getRegisteredContentScripts({ ids: OWNED_IDS });
    if (confirmed.length !== 2 || !OWNED_IDS.every((id) => confirmed.some((item) => item.id === id))) {
      throw new Error("diagnostic collector registration confirmation failed");
    }
  }

  async function requestTeardown(tabId, nonce) {
    if (!Number.isInteger(tabId)) return;
    await chrome.tabs.sendMessage(tabId, { namespace: C.namespace, op: "collector-teardown", nonce }).catch(() => {});
  }

  function clearTimers() {
    if (settleTimer) clearTimeout(settleTimer);
    if (timeoutTimer) clearTimeout(timeoutTimer);
    settleTimer = null; timeoutTimer = null;
  }

  function clearSettleTimer() {
    if (settleTimer) clearTimeout(settleTimer);
    settleTimer = null;
  }

  function clearTimeoutTimer() {
    if (timeoutTimer) clearTimeout(timeoutTimer);
    timeoutTimer = null;
  }

  async function completeRun(reason) {
    clearTimers();
    const result = await enqueue(async () => {
      const all = await readAll();
      const control = all[C.storage.control];
      const evidence = all[C.storage.evidence];
      if (!control || !evidence || !["armed", "navigating", "settling"].includes(control.state)) return null;
      control.state = reason === "timeout" ? "error" : "complete";
      control.completedAt = now();
      evidence.state = control.state; evidence.completedAt = control.completedAt; evidence.completionReason = reason;
      const completedEvent = makeEvent(evidence, {
        runId: control.runId, eventId: "run:completed:" + control.runId + ":" + control.completedAt,
        atEpochMs: control.completedAt, source: "service-worker", category: "lifecycle", type: "run.completed",
        priorityClass: "critical", tabId: control.targetTabId, frameId: 0,
        documentId: control.destinationDocumentId || control.sourceDocumentId,
        route: control.destinationRoute || control.sourceRoute, data: { reason, state: control.state }
      });
      retainEvent(evidence, completedEvent);
      await rawWriteValues({
        [C.storage.control]: control,
        [C.storage.evidence]: evidence,
        [C.storage.status]: makeStatus(control, evidence)
      });
      return { tabId: control.targetTabId, nonce: control.nonce };
    });
    await unregisterOwned();
    if (result) await requestTeardown(result.tabId, result.nonce);
  }

  function scheduleTimeout(control) {
    clearTimeoutTimer();
    if (!control || !Number.isFinite(control.expiresAt)) return;
    timeoutTimer = setTimeout(() => { void completeRun("timeout"); }, Math.max(0, control.expiresAt - now()));
  }

  function scheduleSettle(control) {
    clearSettleTimer();
    if (!control || control.state !== "settling" || !Number.isFinite(control.quietDeadline)) return;
    const runId = control.runId;
    settleTimer = setTimeout(async () => {
      const current = (await readAll())[C.storage.control];
      if (current?.runId === runId && current.state === "settling" && current.quietDeadline <= now()) {
        await completeRun("destination-settled");
      } else if (current?.runId === runId && current.state === "settling") {
        scheduleSettle(current);
      }
    }, Math.max(0, control.quietDeadline - now()) + 25);
  }

  async function maybeSettle(runId, documentId, extendQuiet) {
    const scheduled = await enqueue(async () => {
      const all = await readAll();
      const control = all[C.storage.control];
      const evidence = all[C.storage.evidence];
      if (!control || !evidence || control.runId !== runId || !control.destinationDocumentId) return null;
      const document = evidence.documents.find((doc) => doc.documentId === control.destinationDocumentId);
      if (!document || !document.isolatedReady || !document.mainReady || document.documentId !== documentId) return null;
      const entering = control.state !== "settling" || !Number.isFinite(control.quietDeadline);
      if (entering || extendQuiet === true) control.quietDeadline = now() + C.limits.settleMs;
      control.state = "settling";
      evidence.state = "settling";
      await rawWriteValues({
        [C.storage.control]: control,
        [C.storage.evidence]: evidence,
        [C.storage.status]: makeStatus(control, evidence)
      });
      return structuredClone(control);
    });
    if (scheduled) scheduleSettle(scheduled);
  }

  async function reconcile(reason) {
    const all = await readAll();
    const control = all[C.storage.control];
    const registrationHealth = await ownedRegistrationHealth();
    if (control && ["armed", "navigating", "settling"].includes(control.state) && control.expiresAt > now()) {
      if (!registrationHealth.healthy) await registerOwned();
      if (control.state === "settling" && Number.isFinite(control.quietDeadline)) {
        if (control.quietDeadline <= now()) {
          await completeRun("destination-settled");
          return { active: false, repaired: !registrationHealth.healthy, reason };
        }
        if (!settleTimer) scheduleSettle(control);
      }
      if (!timeoutTimer) scheduleTimeout(control);
      return { active: true, repaired: !registrationHealth.healthy, reason };
    }
    if (registrationHealth.count) await unregisterOwned();
    if (control && ["armed", "navigating", "settling"].includes(control.state)) await completeRun("timeout");
    return { active: false, reason };
  }

  async function resetEvidence() {
    const all = await readAll();
    const previous = all[C.storage.control];
    clearTimers(); await unregisterOwned();
    if (previous) await requestTeardown(previous.targetTabId, previous.nonce);
    const at = now();
    const control = { schema: C.schema, state: "idle", runId: null, nonce: null, createdAt: at, expiresAt: null };
    const evidence = emptyEvidence(null, "idle", at);
    await writeValues({
      [C.storage.control]: control,
      [C.storage.evidence]: evidence,
      [C.storage.status]: makeStatus(control, evidence)
    });
    return makeStatus(control, evidence);
  }

  async function armRun() {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];
    if (!tab || !Number.isInteger(tab.id) || !isChatUrl(tab.url)) throw new Error("Open one active normal https://chatgpt.com/c/... tab before arming.");
    const old = (await readAll())[C.storage.control];
    if (old) await requestTeardown(old.targetTabId, old.nonce);
    clearTimers(); await unregisterOwned();
    const at = now();
    const runId = crypto.randomUUID();
    const nonce = crypto.randomUUID();
    const sourceRoute = await routeShape(tab.url, nonce);
    const control = {
      schema: C.schema, state: "armed", runId, nonce, createdAt: at, armedAt: at,
      expiresAt: at + C.limits.runTimeoutMs, targetTabId: tab.id, sourceDocumentId: null,
      destinationDocumentId: null, sourceRoute, destinationRoute: null, quietDeadline: null
    };
    const evidence = emptyEvidence(runId, "armed", at);
    evidence.armedAt = at; evidence.targetTabId = tab.id; evidence.summary.sourceRoute = sourceRoute;
    await writeValues({
      [C.storage.control]: control,
      [C.storage.evidence]: evidence,
      [C.storage.status]: makeStatus(control, evidence)
    });
    await registerOwned();
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id, frameIds: [0] }, world: "MAIN", files: [C.files.main] });
      await chrome.scripting.executeScript({ target: { tabId: tab.id, frameIds: [0] }, world: "ISOLATED", files: [C.files.isolated] });
    } catch (error) {
      await completeRun("injection-failed");
      throw new Error("Current-document diagnostic injection failed: " + cleanText(error?.message, 160));
    }
    scheduleTimeout(control);
    return makeStatus(control, evidence);
  }

  async function clearEvidence() {
    const previous = (await readAll())[C.storage.control];
    clearTimers(); await unregisterOwned();
    if (previous) await requestTeardown(previous.targetTabId, previous.nonce);
    await removeValues([C.storage.control, C.storage.evidence, C.storage.status]);
    return { schema: C.schema, state: "idle", cleared: true };
  }

  async function popupCommand(op) {
    if (!ALLOWED_POPUP_OPS.has(op)) throw new Error("Unknown diagnostic operation.");
    if (op === "reset") return resetEvidence();
    if (op === "arm") return armRun();
    if (op === "clear") return clearEvidence();
    if (op === "status") {
      await reconcile("popup-status");
      const all = await readAll();
      return all[C.storage.status] || makeStatus(all[C.storage.control], all[C.storage.evidence]);
    }
    const evidence = (await readAll())[C.storage.evidence];
    return evidence || emptyEvidence(null, "idle", now());
  }

  async function collectorBoot(message, sender) {
    if (!sender.tab || !Number.isInteger(sender.tab.id) || sender.frameId !== 0 || !validId(sender.documentId)) return { active: false };
    const all = await readAll();
    const control = all[C.storage.control];
    if (!control || !["armed", "navigating", "settling"].includes(control.state) || control.expiresAt <= now() || control.targetTabId !== sender.tab.id) return { active: false };
    const route = await routeShape(sender.url || sender.tab.url, control.nonce);
    if (!control.sourceDocumentId) {
      control.sourceDocumentId = sender.documentId;
      if (control.destinationRoute && route === control.destinationRoute) control.destinationDocumentId = sender.documentId;
    } else if (sender.documentId !== control.sourceDocumentId && route.startsWith("/c/#")) {
      control.destinationDocumentId = sender.documentId;
      control.destinationRoute = route;
      control.state = "navigating";
      const evidence = all[C.storage.evidence];
      evidence.state = "navigating"; evidence.summary.destinationRoute = route;
      await writeValues({ [C.storage.control]: control, [C.storage.evidence]: evidence, [C.storage.status]: makeStatus(control, evidence) });
    } else {
      await writeValues({ [C.storage.control]: control });
    }
    await appendEvent({
      runId: control.runId, eventId: validId(message.eventId) ? message.eventId : "boot:" + sender.documentId,
      atEpochMs: now(), source: "isolated", category: "lifecycle", type: "content.bootstrap",
      tabId: sender.tab.id, frameId: sender.frameId, documentId: sender.documentId, route,
      data: { contentInstanceId: cleanText(message.contentInstanceId, 80), lifecycle: sender.documentLifecycle || "unknown" }
    });
    if (control.destinationDocumentId === sender.documentId) await maybeSettle(control.runId, sender.documentId, true);
    return { active: true, runId: control.runId, nonce: control.nonce, route, expiresAt: control.expiresAt };
  }

  async function collectorEvent(message, sender) {
    if (!sender.tab || sender.frameId !== 0 || !validId(sender.documentId)) return false;
    if (!validNonce(message.nonce) || !validId(message.runId) || !validId(message.eventId) || !ALLOWED_COLLECTOR_TYPES.has(message.type)) return false;
    const all = await readAll();
    const control = all[C.storage.control];
    if (!control || control.runId !== message.runId || control.nonce !== message.nonce || control.targetTabId !== sender.tab.id) return false;
    const route = typeof message.route === "string" && /^\\/(?:c\\/#id|g\\/#slug(?:\\/c\\/#id)?|)$/.test(message.route) ? message.route : null;
    const stored = await appendEvent({
      runId: control.runId, eventId: message.eventId, atEpochMs: finite(message.atEpochMs) || now(),
      source: message.source === "main" ? "main" : "isolated", category: message.category,
      type: message.type, tabId: sender.tab.id, frameId: sender.frameId, documentId: sender.documentId,
      route, data: message.data
    });
    if (control.destinationDocumentId === sender.documentId) {
      await maybeSettle(control.runId, sender.documentId, DESTINATION_ACTIVITY_TYPES.has(message.type));
    }
    return stored;
  }

  async function markDestination(control, evidence, route, documentId, transitionKind) {
    if (!route.startsWith("/c/#") || route === control.sourceRoute) return false;
    const destinationDocumentId = validId(documentId) ? documentId : control.sourceDocumentId;
    control.destinationRoute = route;
    control.destinationDocumentId = destinationDocumentId || null;
    control.transitionKind = transitionKind;
    control.state = "navigating";
    evidence.state = "navigating";
    evidence.summary.destinationRoute = route;
    evidence.summary.transitionKind = transitionKind;
    const document = evidence.documents.find((item) => item.documentId === destinationDocumentId);
    if (document) document.route = route;
    await writeValues({
      [C.storage.control]: control,
      [C.storage.evidence]: evidence,
      [C.storage.status]: makeStatus(control, evidence)
    });
    return true;
  }

  async function navigationEvent(kind, details) {
    if (!details || details.frameId !== 0 || !Number.isInteger(details.tabId)) return;
    const all = await readAll();
    const control = all[C.storage.control];
    if (!control || !["armed", "navigating", "settling"].includes(control.state) || control.targetTabId !== details.tabId || control.expiresAt <= now()) return;
    const route = await routeShape(details.url, control.nonce);
    const documentId = validId(details.documentId) ? details.documentId : null;
    const evidence = all[C.storage.evidence];
    if (kind === "committed" && documentId && control.sourceDocumentId && documentId !== control.sourceDocumentId) {
      await markDestination(control, evidence, route, documentId, "full-document");
    } else if ((kind === "history-state" || kind === "fragment") &&
      (!documentId || !control.sourceDocumentId || documentId === control.sourceDocumentId)) {
      await markDestination(control, evidence, route, documentId || control.sourceDocumentId, "same-document");
    }
    await appendEvent({
      runId: control.runId, eventId: "nav:" + kind + ":" + (documentId || "none") + ":" + String(details.timeStamp || now()),
      atEpochMs: finite(details.timeStamp) || now(), source: "service-worker", category: "navigation",
      type: "webNavigation." + kind, tabId: details.tabId, frameId: details.frameId,
      documentId, route, data: { errorKind: details.error ? cleanText(details.error, 80) : "" }
    });
    const destinationDocumentId = control.destinationDocumentId || documentId;
    const destinationRelevant = route === control.destinationRoute &&
      ["committed", "domcontentloaded", "completed", "history-state", "fragment", "error"].includes(kind);
    if (destinationDocumentId) await maybeSettle(control.runId, destinationDocumentId, destinationRelevant);
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || message.namespace !== C.namespace || typeof message.op !== "string") return false;
    (async () => {
      if (message.op === "popup") return popupCommand(message.command);
      if (message.op === "collector-boot") return collectorBoot(message, sender);
      if (message.op === "collector-event") return collectorEvent(message, sender);
      throw new Error("Unknown diagnostic message operation.");
    })().then((data) => sendResponse({ ok: true, data }), (error) => sendResponse({ ok: false, error: cleanText(error?.message, 200) }));
    return true;
  });

  chrome.webNavigation.onBeforeNavigate.addListener((d) => { void navigationEvent("before", d); }, CHAT_FILTER);
  chrome.webNavigation.onCommitted.addListener((d) => { void navigationEvent("committed", d); }, CHAT_FILTER);
  chrome.webNavigation.onDOMContentLoaded.addListener((d) => { void navigationEvent("domcontentloaded", d); }, CHAT_FILTER);
  chrome.webNavigation.onCompleted.addListener((d) => { void navigationEvent("completed", d); }, CHAT_FILTER);
  chrome.webNavigation.onErrorOccurred.addListener((d) => { void navigationEvent("error", d); }, CHAT_FILTER);
  chrome.webNavigation.onHistoryStateUpdated.addListener((d) => { void navigationEvent("history-state", d); }, CHAT_FILTER);
  chrome.webNavigation.onReferenceFragmentUpdated.addListener((d) => { void navigationEvent("fragment", d); }, CHAT_FILTER);
  chrome.runtime.onStartup.addListener(() => { void reconcile("startup"); });
  chrome.runtime.onInstalled.addListener(() => { void reconcile("installed"); });
  void reconcile("worker-wake");
})();
`;
}

export function makeTitleNavigationDiagnosticIsolatedJs() {
  const constants = constantsSource();
  return `
/* H2O_TITLE_STAGE0B2B_ISOLATED_V1 */
(function h2oTitleStage0B2BIsolatedCollector() {
  "use strict";
  const C = ${constants};
  if (globalThis.__h2oTitleStage0B2BIsolatedV1) {
    try { globalThis.__h2oTitleStage0B2BIsolatedV1.reinjected(); } catch {}
    return;
  }
  const contentInstanceId = crypto.randomUUID();
  let run = null;
  let seq = 0;
  let titleSeq = 0;
  let stopped = false;
  let observer = null;
  let runtimeHandler = null;
  let lastTitleValue = null;
  let lastUnderInputCount = null;
  let lastTitleMenuCount = null;
  let lastEmojiBadgeCount = null;
  const performanceObservers = [];
  const activationTimers = [];
  const listeners = [];
  const ALLOWED_MAIN_TYPES = new Set([
    "bridge.main-ready", "bridge.h2o-ready", "bridge.h2o-replaced", "bridge.subscribed",
    "bridge.unsubscribed", "bridge.stopped", "title.direct-notification", "title.state-snapshot", "title.event",
    "route.event", "route.popstate", "runtime.availability", "runtime.loader-marker",
    "runtime.error", "runtime.timeout"
  ]);
  const allowedAttributes = new Set(["class", "role", "title", "hidden", "aria-label", "aria-expanded", "aria-hidden"]);
  const now = () => Date.now();
  const route = () => {
    const parts = location.pathname.split("/").filter(Boolean);
    if (parts[0] === "c" && parts[1]) return "/c/#id";
    if (parts[0] === "g" && parts[1] && parts[2] === "c" && parts[3]) return "/g/#slug/c/#id";
    if (parts[0] === "g" && parts[1]) return "/g/#slug";
    return parts.length ? "/" + parts[0].replace(/[^a-z0-9_-]/gi, "").slice(0, 24) : "/";
  };
  const bounded = (value, max) => String(value == null ? "" : value).replace(/[\\r\\n\\t]+/g, " ").slice(0, max);
  const send = (message) => chrome.runtime.sendMessage(message).catch(() => null);
  function eventId(type) { seq += 1; return contentInstanceId + ":" + seq + ":" + type; }
  function emit(type, category, data, source) {
    if (!run || stopped) return;
    void send({ namespace: C.namespace, op: "collector-event", runId: run.runId, nonce: run.nonce,
      eventId: eventId(type), atEpochMs: now(), source: source || "isolated", category, type,
      route: route(), data: data && typeof data === "object" ? data : {} });
  }
  function count(selector) { try { return document.querySelectorAll(selector).length; } catch { return 0; } }
  function titleMetadata(value) {
    const len = String(value == null ? document.title || "" : value).length;
    return { present: len > 0, length: Math.min(len, C.limits.maxTitleLengthMetadata), lengthCapped: Math.min(len, C.limits.maxTitleLengthMetadata), changeSeq: ++titleSeq };
  }
  function emitTitleSnapshot(force) {
    const value = String(document.title || "");
    if (!force && value === lastTitleValue) return false;
    lastTitleValue = value;
    emit("document.title", "render", titleMetadata(value));
    return true;
  }
  function emitUnderInputSnapshot(meta, force) {
    const current = count(".ho-tab-title-under-input");
    const meaningful = force || current !== lastUnderInputCount || meta.added > 0 || meta.removed > 0 || meta.textChanged || !!meta.attribute;
    lastUnderInputCount = current;
    if (!meaningful) return false;
    emit("dom.under-input", "render", { count: current, ...meta });
    return true;
  }
  function emitCountSnapshot(type, selector, key, force) {
    const current = count(selector);
    const previous = key === "menu" ? lastTitleMenuCount : lastEmojiBadgeCount;
    if (key === "menu") lastTitleMenuCount = current; else lastEmojiBadgeCount = current;
    if (!force && current === previous) return false;
    emit(type, "render", { count: current });
    return true;
  }
  function related(node, selector) {
    if (!(node instanceof Element)) return false;
    try { return node.matches(selector) || !!node.closest(selector) || !!node.querySelector(selector); } catch { return false; }
  }
  function installObservers() {
    const root = document.documentElement;
    if (!root || observer) return;
    observer = new MutationObserver((records) => {
      let titleChanged = false, added = 0, removed = 0, textChanged = false, attr = null, relevant = false, uiRelevant = false;
      for (const record of records) {
        if (record.target === document.querySelector("title") || related(record.target, "title")) titleChanged = true;
        if (record.type === "attributes" && related(record.target, ".ho-tab-title-under-input")) {
          relevant = true; uiRelevant = true; if (allowedAttributes.has(record.attributeName)) attr = record.attributeName;
        }
        if (record.type === "characterData" && record.target.parentElement?.closest(".ho-tab-title-under-input")) { relevant = true; uiRelevant = true; textChanged = true; }
        for (const node of record.addedNodes) {
          if (related(node, ".ho-tab-title-under-input")) { relevant = true; uiRelevant = true; added += 1; }
          if (related(node, ".ho-title-action-menu,.ho-emoji-badge")) uiRelevant = true;
        }
        for (const node of record.removedNodes) {
          if (related(node, ".ho-tab-title-under-input")) { relevant = true; uiRelevant = true; removed += 1; }
          if (related(node, ".ho-title-action-menu,.ho-emoji-badge")) uiRelevant = true;
        }
      }
      if (titleChanged) emitTitleSnapshot(false);
      if (relevant) emitUnderInputSnapshot({ added, removed, textChanged, attribute: attr || "" }, false);
      if (uiRelevant) {
        emitCountSnapshot("dom.title-menu-count", ".ho-title-action-menu", "menu", false);
        emitCountSnapshot("dom.emoji-badge-count", ".ho-emoji-badge", "emoji", false);
      }
    });
    observer.observe(root, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: Array.from(allowedAttributes) });
    for (const type of ["longtask", "layout-shift"]) {
      try {
        const po = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (type === "longtask") emit("performance.longtask", "performance", { duration: entry.duration, startTime: entry.startTime });
            else {
              const sources = Array.isArray(entry.sources) ? entry.sources : [];
              const titleOwned = sources.some((item) => related(item?.node, ".ho-tab-title-under-input,.ho-title-action-menu,.ho-emoji-badge"));
              emit("performance.layout-shift", "performance", { value: entry.value, startTime: entry.startTime, hadRecentInput: !!entry.hadRecentInput, titleOwned });
            }
          }
        });
        po.observe({ type, buffered: false }); performanceObservers.push(po);
      } catch {}
    }
  }
  function on(target, type, handler) { target.addEventListener(type, handler); listeners.push([target, type, handler]); }
  function postControl(type) {
    if (!run) return;
    window.postMessage({ marker: C.bridgeMarker, direction: "isolated-to-main", messageType: type,
      runId: run.runId, nonce: run.nonce }, "https://chatgpt.com");
  }
  function activateMain() {
    for (let i = 0; i < 20; i += 1) activationTimers.push(setTimeout(() => postControl("activate"), i * 250));
  }
  function teardown(reason) {
    if (stopped) return;
    stopped = true;
    activationTimers.splice(0).forEach(clearTimeout);
    try { observer?.disconnect(); } catch {}
    performanceObservers.splice(0).forEach((item) => { try { item.disconnect(); } catch {} });
    listeners.splice(0).forEach(([target, type, handler]) => { try { target.removeEventListener(type, handler); } catch {} });
    if (runtimeHandler) { try { chrome.runtime.onMessage.removeListener(runtimeHandler); } catch {} runtimeHandler = null; }
    postControl("teardown");
    try { delete globalThis.__h2oTitleStage0B2BIsolatedV1; } catch {}
    if (run) void send({ namespace: C.namespace, op: "collector-event", runId: run.runId, nonce: run.nonce,
      eventId: eventId("content.stopped"), atEpochMs: now(), source: "isolated", category: "lifecycle",
      type: "content.stopped", route: route(), data: { reason: bounded(reason, 80) } });
  }
  function bridgeMessage(event) {
    if (event.source !== window || !run || stopped) return;
    const message = event.data;
    if (!message || typeof message !== "object" || message.marker !== C.bridgeMarker || message.direction !== "main-to-isolated") return;
    if (message.runId !== run.runId || message.nonce !== run.nonce || !ALLOWED_MAIN_TYPES.has(message.messageType)) return;
    let encoded = ""; try { encoded = JSON.stringify(message.data || {}); } catch { return; }
    if (new TextEncoder().encode(encoded).byteLength > C.limits.maxEventPayloadBytes) return;
    emit(message.messageType, String(message.category || "bridge").slice(0, 32), message.data || {}, "main");
  }
  async function boot() {
    const reply = await send({ namespace: C.namespace, op: "collector-boot", eventId: "boot:" + contentInstanceId,
      contentInstanceId, atEpochMs: now() });
    if (!reply?.ok || !reply.data?.active || typeof reply.data.nonce !== "string" || typeof reply.data.runId !== "string") return;
    run = reply.data;
    on(window, "message", bridgeMessage);
    on(window, "popstate", () => emit("route.popstate", "route", {}));
    on(window, "error", (event) => emit("runtime.error", "error", { errorKind: "isolated-error", message: bounded(event.message, C.limits.maxErrorMessage) }));
    runtimeHandler = (message) => {
      if (message?.namespace === C.namespace && message.op === "collector-teardown" && message.nonce === run?.nonce) teardown("service-worker");
    };
    chrome.runtime.onMessage.addListener(runtimeHandler);
    installObservers();
    emit("content.activated", "lifecycle", { contentInstanceId, lifecycle: "active" });
    emitTitleSnapshot(true);
    emitUnderInputSnapshot({ added: 0, removed: 0, textChanged: false, attribute: "" }, true);
    emitCountSnapshot("dom.title-menu-count", ".ho-title-action-menu", "menu", true);
    emitCountSnapshot("dom.emoji-badge-count", ".ho-emoji-badge", "emoji", true);
    activateMain();
  }
  globalThis.__h2oTitleStage0B2BIsolatedV1 = { reinjected: () => emit("content.reinjected", "lifecycle", { contentInstanceId }), teardown };
  void boot();
})();
`;
}

export function makeTitleNavigationDiagnosticMainJs() {
  const constants = constantsSource();
  return `
/* H2O_TITLE_STAGE0B2B_MAIN_V1 */
(function h2oTitleStage0B2BMainCollector() {
  "use strict";
  const C = ${constants};
  if (globalThis.__h2oTitleStage0B2BMainV1) return;
  const pageInstanceId = crypto.randomUUID();
  let run = null;
  let seq = 0;
  let active = false;
  let stopped = false;
  let apiTimer = null;
  let apiDeadline = 0;
  let chatTitleOwner = null;
  let tabTitleOwner = null;
  let underInputOwner = null;
  let autoEmojiOwner = null;
  let lastAvailabilityFingerprint = null;
  let chatReady = false;
  let loaderMarkerSettled = false;
  let loaderMarkerPromise = null;
  let loaderMarkerGeneration = 0;
  let loaderErrorReported = false;
  let unsubscribe = null;
  const listeners = [];
  const PASSIVE_EVENTS = [
    "h2o:chat-title:changed", "evt:h2o:chat-title:changed", "h2o:h2o:chat-title:changed",
    "h2o:chat-title:emoji-updated", "evt:h2o:chat-title:emoji-updated", "h2o:h2o:chat-title:emoji-updated",
    "ho:navigate", "h2o:route:changed", "evt:h2o:route:changed", "h2o:surface:change", "evt:h2o:surface:change"
  ];
  const now = () => Date.now();
  const route = () => {
    const parts = location.pathname.split("/").filter(Boolean);
    if (parts[0] === "c" && parts[1]) return "/c/#id";
    if (parts[0] === "g" && parts[1] && parts[2] === "c" && parts[3]) return "/g/#slug/c/#id";
    if (parts[0] === "g" && parts[1]) return "/g/#slug";
    return parts.length ? "/" + parts[0].replace(/[^a-z0-9_-]/gi, "").slice(0, 24) : "/";
  };
  const clean = (value, max) => String(value == null ? "" : value).replace(/[^a-z0-9_.:/ -]/gi, "").slice(0, max);
  function eventId(type) { seq += 1; return pageInstanceId + ":" + seq + ":" + type; }
  function emit(type, category, data) {
    if (!active || stopped || !run) return;
    const message = { marker: C.bridgeMarker, direction: "main-to-isolated", messageType: type,
      category, runId: run.runId, nonce: run.nonce, eventId: eventId(type), atEpochMs: now(),
      route: route(), data: data && typeof data === "object" ? data : {} };
    let encoded = ""; try { encoded = JSON.stringify(message.data); } catch { return; }
    if (new TextEncoder().encode(encoded).byteLength > C.limits.maxEventPayloadBytes) return;
    window.postMessage(message, "https://chatgpt.com");
  }
  function on(target, type, handler) { target.addEventListener(type, handler); listeners.push([target, type, handler]); }
  function stateMeta(value) {
    const state = value && typeof value === "object" ? value : {};
    const base = typeof state.baseTitle === "string" ? state.baseTitle : (typeof state.title === "string" ? state.title : "");
    return {
      present: base.length > 0, length: Math.min(base.length, C.limits.maxTitleLengthMetadata),
      source: clean(state.source, 48), emojiSource: clean(state.emojiSource, 48),
      priority: Number.isFinite(Number(state.priority)) ? Number(state.priority) : null,
      routeTokenPresent: state.routeToken != null,
      stateRevision: Number.isFinite(Number(state.stateRevision)) ? Number(state.stateRevision) : null,
      storageBackend: clean(state.storageBackend || state.backend, 48), durable: state.durable === true
    };
  }
  function unsubscribeCurrent(reason) {
    if (typeof unsubscribe === "function") { try { unsubscribe(); } catch {} }
    unsubscribe = null; chatTitleOwner = null;
    emit("bridge.unsubscribed", "bridge", { reason: clean(reason, 64) });
  }
  function availability() {
    const H2O = globalThis.H2O;
    return {
      chatTitle: !!H2O?.ChatTitle, tabTitle: !!H2O?.TabTitle,
      underInput: !!globalThis.__h2oTitleUnderInputRuntime_v4,
      autoEmojiAbsent: !H2O?.AutoEmojiTitle && typeof globalThis.H2O_AutoEmojiTitle_openPanel !== "function"
    };
  }
  function loaderMarker() {
    if (loaderMarkerSettled || stopped || !active) return Promise.resolve(false);
    if (loaderMarkerPromise) return loaderMarkerPromise;
    const generation = loaderMarkerGeneration;
    const runId = run?.runId;
    loaderMarkerPromise = (async () => {
      try {
        const bridge = globalThis.H2O?.archiveBoot?._getExtensionBridge?.();
        const info = await bridge?.__loaderInfo?.();
        if (stopped || !active || generation !== loaderMarkerGeneration || run?.runId !== runId) return false;
        if (!Number.isFinite(Number(info?.loaderBuildTs)) || !info?.loaderBuildIso) return false;
        loaderMarkerSettled = true;
        emit("runtime.loader-marker", "runtime", {
          loaderBuildTs: Number(info.loaderBuildTs), loaderBuildIso: clean(info.loaderBuildIso, 40),
          loaderSource: clean(info?.source, 48)
        });
        return true;
      } catch (error) {
        if (!loaderErrorReported && !stopped && generation === loaderMarkerGeneration) {
          loaderErrorReported = true;
          emit("runtime.error", "error", { errorKind: "loader-marker", message: clean(error?.message, C.limits.maxErrorMessage) });
        }
        return false;
      } finally {
        if (generation === loaderMarkerGeneration) loaderMarkerPromise = null;
      }
    })();
    return loaderMarkerPromise;
  }
  function inspectApis() {
    if (!active || stopped) return;
    const current = globalThis.H2O?.ChatTitle || null;
    const currentTabTitle = globalThis.H2O?.TabTitle || null;
    const currentUnderInput = globalThis.__h2oTitleUnderInputRuntime_v4 || null;
    const currentAutoEmoji = globalThis.H2O?.AutoEmojiTitle || globalThis.H2O_AutoEmojiTitle_openPanel || null;
    const available = availability();
    const availabilityFingerprint = JSON.stringify(available);
    if (lastAvailabilityFingerprint === null || availabilityFingerprint !== lastAvailabilityFingerprint) {
      lastAvailabilityFingerprint = availabilityFingerprint;
      emit("runtime.availability", "runtime", available);
    }
    if (tabTitleOwner && currentTabTitle !== tabTitleOwner) emit("bridge.h2o-replaced", "bridge", { name: "TabTitle", present: !!currentTabTitle });
    if (underInputOwner && currentUnderInput !== underInputOwner) emit("bridge.h2o-replaced", "bridge", { name: "TitleUnderInput", present: !!currentUnderInput });
    if (autoEmojiOwner && currentAutoEmoji !== autoEmojiOwner) emit("bridge.h2o-replaced", "bridge", { name: "AutoEmojiTitle", present: !!currentAutoEmoji });
    tabTitleOwner = currentTabTitle;
    underInputOwner = currentUnderInput;
    autoEmojiOwner = currentAutoEmoji;
    if (current !== chatTitleOwner) {
      if (chatTitleOwner) { unsubscribeCurrent("api-replaced"); emit("bridge.h2o-replaced", "bridge", { name: "ChatTitle", present: !!current }); }
      if (current && typeof current.subscribe === "function") {
        chatTitleOwner = current;
        try {
          const off = current.subscribe((state) => emit("title.direct-notification", "title", stateMeta(state)));
          unsubscribe = typeof off === "function" ? off : null;
          emit("bridge.subscribed", "bridge", { present: true });
          let snapshot = null;
          try { snapshot = typeof current.getState === "function" ? current.getState() : null; } catch {}
          if (snapshot) {
            const data = stateMeta(snapshot);
            try { data.selfCheckOk = typeof current.selfCheck === "function" ? current.selfCheck()?.ok !== false : null; } catch { data.selfCheckOk = false; }
            emit("title.state-snapshot", "title", data);
          }
        } catch (error) { emit("runtime.error", "error", { errorKind: "subscribe", message: clean(error?.message, C.limits.maxErrorMessage) }); }
      }
    }
    if (current && !chatReady) emit("bridge.h2o-ready", "bridge", available);
    chatReady = !!current;
    if (!loaderMarkerSettled) void loaderMarker();
    if (!current && now() >= apiDeadline) {
      emit("runtime.timeout", "runtime", { reason: "h2o-api-readiness" });
      clearInterval(apiTimer); apiTimer = null;
    }
  }
  function eventMeta(event) {
    const detail = event?.detail && typeof event.detail === "object" ? event.detail : {};
    return {
      reason: clean(detail.reason, 64), source: clean(detail.source, 48),
      routeTokenPresent: detail.routeToken != null,
      stateRevision: Number.isFinite(Number(detail.stateRevision)) ? Number(detail.stateRevision) : null
    };
  }
  function teardown(reason) {
    if (stopped) return;
    emit("bridge.stopped", "bridge", { reason: clean(reason, 64) });
    stopped = true; active = false;
    if (apiTimer) clearInterval(apiTimer);
    apiTimer = null;
    loaderMarkerGeneration += 1;
    loaderMarkerPromise = null;
    unsubscribeCurrent("teardown");
    listeners.splice(0).forEach(([target, type, handler]) => { try { target.removeEventListener(type, handler); } catch {} });
    try { delete globalThis.__h2oTitleStage0B2BMainV1; } catch {}
  }
  function activate(message) {
    if (active || stopped) return;
    if (typeof message.runId !== "string" || typeof message.nonce !== "string" || !/^[a-z0-9-]{16,80}$/i.test(message.nonce)) return;
    run = { runId: message.runId, nonce: message.nonce }; active = true;
    emit("bridge.main-ready", "bridge", { pageInstanceId, performanceTimeOrigin: performance.timeOrigin });
    for (const name of PASSIVE_EVENTS) on(window, name, (event) => emit(name.includes("title") ? "title.event" : "route.event", name.includes("title") ? "title" : "route", { ...eventMeta(event), name }));
    on(window, "popstate", () => emit("route.popstate", "route", {}));
    on(window, "error", (event) => emit("runtime.error", "error", { errorKind: "main-error", message: clean(event.message, C.limits.maxErrorMessage), stack: clean(event.error?.stack, C.limits.maxStackChars) }));
    on(window, "unhandledrejection", (event) => emit("runtime.error", "error", { errorKind: "unhandledrejection", message: clean(event.reason?.message || event.reason, C.limits.maxErrorMessage), stack: clean(event.reason?.stack, C.limits.maxStackChars) }));
    apiDeadline = now() + 10000;
    inspectApis(); apiTimer = setInterval(inspectApis, 500);
    void loaderMarker();
  }
  function controlMessage(event) {
    if (event.source !== window) return;
    const message = event.data;
    if (!message || typeof message !== "object" || message.marker !== C.bridgeMarker || message.direction !== "isolated-to-main") return;
    if (message.messageType === "activate") activate(message);
    else if (message.messageType === "teardown" && run && message.runId === run.runId && message.nonce === run.nonce) teardown("isolated-request");
  }
  on(window, "message", controlMessage);
  globalThis.__h2oTitleStage0B2BMainV1 = Object.freeze({ pageInstanceId });
})();
`;
}

export function makeTitleNavigationDiagnosticPopupJs() {
  const constants = constantsSource();
  return `
/* H2O_TITLE_STAGE0B2B_POPUP_V1 */
(function h2oTitleStage0B2BPopup() {
  "use strict";
  const C = ${constants};
  const TITLE_SINGLE_CLICK_DELAY_MS = 500;
  const MODULES = Object.freeze([Object.freeze({
    id: "title-navigation",
    label: "Title navigation diagnostic",
    description: "Passive one-navigation Stage 0B-2B evidence",
    icon: "⌁",
    operations: Object.freeze(["reset", "arm", "status", "export", "clear"]),
    renderer: "title-navigation-detail-v1",
    availability: "available"
  })]);
  const ids = Object.freeze({
    reset: "title-diag-reset", arm: "title-diag-arm", status: "title-diag-status",
    export: "title-diag-export", clear: "title-diag-clear"
  });
  const FILTERS = Object.freeze([
    ["all", "All"], ["navigation", "Navigation"], ["lifecycle", "Lifecycle"],
    ["title", "Title"], ["dom", "DOM"], ["performance", "Performance"], ["errors", "Errors"]
  ]);
  const DISPLAY_DATA_KEYS = new Set([
    "reason", "state", "name", "present", "active", "count", "added", "removed",
    "textChanged", "attribute", "length", "lengthCapped", "changeSeq", "value", "duration",
    "startTime", "hadRecentInput", "titleOwned", "source", "emojiSource", "priority",
    "routeTokenPresent", "stateRevision", "storageBackend", "durable", "selfCheckOk",
    "chatTitle", "tabTitle", "underInput", "autoEmojiAbsent", "loaderBuildTs", "loaderBuildIso",
    "loaderSource", "contentInstanceId", "pageInstanceId", "performanceTimeOrigin", "errorKind",
    "message", "markerMatch", "lifecycle", "destinationReady", "isolatedReady", "mainReady"
  ]);
  const app = document.getElementById("app");
  const workspace = document.getElementById("diagnostics-workspace");
  const detail = document.getElementById("diagnostics-detail");
  const titleText = document.querySelector("#brand-title-toggle .brand-title");
  const logo = document.getElementById("logo-toggle");
  const yellow = document.querySelector('[data-popup-action="open-diagnostics"]');
  const actionButtons = [...Object.values(ids), "title-diag-copy-raw"].map((id) => document.getElementById(id))
    .filter((item) => item instanceof HTMLButtonElement);
  const ui = {
    workspaceMode: "normal", lastNormalView: "main", selectedModuleId: "title-navigation",
    diagnosticsSidebarCollapsed: false, commandInFlight: false, activeFilter: "all",
    status: null, evidence: null, pendingTitleClick: null
  };

  const byId = (id) => document.getElementById(id);
  const text = (id, value) => { const node = byId(id); if (node) node.textContent = String(value ?? ""); };
  const clean = (value, max = 160) => String(value == null ? "" : value).replace(/[\\r\\n\\t]+/g, " ").slice(0, max);
  const create = (tag, className, value) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (value != null) node.textContent = String(value);
    return node;
  };
  const clearNode = (node) => { while (node?.firstChild) node.removeChild(node.firstChild); };
  const stateLabel = (value) => ({
    idle: "Idle", armed: "Armed", navigating: "Navigating", settling: "Settling",
    complete: "Complete", error: "Error"
  })[value] || "Idle";
  const finiteDisplayNumber = (value) => value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value))
    ? Number(value) : null;
  const timeLabel = (value) => {
    const number = finiteDisplayNumber(value);
    return number === null ? "—" : new Date(number).toLocaleString();
  };
  const durationLabel = (start, end) => {
    const startNumber = finiteDisplayNumber(start);
    const endNumber = finiteDisplayNumber(end);
    return startNumber === null || endNumber === null ? "—" : Math.max(0, endNumber - startNumber).toLocaleString() + " ms";
  };
  const shortRef = (value) => {
    const raw = clean(value, 128);
    return raw.length > 14 ? raw.slice(0, 6) + "…" + raw.slice(-6) : (raw || "—");
  };
  async function command(command) {
    const reply = await chrome.runtime.sendMessage({ namespace: C.namespace, op: "popup", command });
    if (!reply?.ok) throw new Error(reply?.error || "Diagnostic command failed.");
    return reply.data;
  }

  function setBadge(node, state) {
    if (!node) return;
    node.textContent = stateLabel(state);
    node.dataset.runState = state || "idle";
  }

  function setBusy(active, label) {
    ui.commandInFlight = Boolean(active);
    for (const button of actionButtons) button.disabled = ui.commandInFlight;
    workspace?.setAttribute("aria-busy", ui.commandInFlight ? "true" : "false");
    if (ui.commandInFlight) text("title-diag-command-status", label || "Working…");
  }

  function showError(error) {
    const node = byId("title-diag-command-error");
    if (!node) return;
    const message = clean(error?.message || error || "", 200);
    node.textContent = message;
    node.hidden = !message;
  }

  function appendKv(target, label, value, fullValue) {
    if (!target) return;
    const term = create("dt", "", label);
    const description = create("dd", "", value == null || value === "" ? "—" : value);
    if (fullValue) description.title = clean(fullValue, 500);
    target.append(term, description);
  }

  function renderRegistry() {
    const target = byId("diagnostics-module-list");
    if (!target) return;
    clearNode(target);
    for (const module of MODULES) {
      const button = create("button", "diagnostics-module-button");
      button.type = "button";
      button.dataset.diagnosticModule = module.id;
      button.setAttribute("aria-current", module.id === ui.selectedModuleId ? "page" : "false");
      button.disabled = module.availability !== "available";
      const icon = create("span", "diagnostics-module-icon", module.icon);
      icon.setAttribute("aria-hidden", "true");
      const copy = create("span", "diagnostics-module-copy");
      copy.append(create("strong", "", module.label), create("span", "", module.description));
      button.append(icon, copy);
      button.addEventListener("click", () => {
        if (ui.commandInFlight || module.availability !== "available") return;
        ui.selectedModuleId = module.id;
        renderRegistry();
        render();
      });
      target.appendChild(button);
    }
  }

  function eventMatchesFilter(event) {
    if (ui.activeFilter === "all") return true;
    if (ui.activeFilter === "errors") {
      return event?.category === "error" || /error|timeout|failure/i.test(String(event?.type || ""));
    }
    if (ui.activeFilter === "navigation") {
      return event?.category === "navigation" || event?.category === "route";
    }
    if (ui.activeFilter === "title") {
      return event?.category === "title" || event?.type === "document.title";
    }
    if (ui.activeFilter === "dom") {
      return event?.category === "dom" || /^dom\./.test(String(event?.type || ""));
    }
    return event?.category === ui.activeFilter;
  }

  function safeEventDetail(event) {
    const fields = [];
    if (event?.route) fields.push(event.route);
    if (event?.data && typeof event.data === "object") {
      for (const [key, value] of Object.entries(event.data)) {
        if (!DISPLAY_DATA_KEYS.has(key) || value == null || value === "") continue;
        fields.push(key + "=" + clean(value, 96));
      }
    }
    return fields.join(" · ").slice(0, 420);
  }

  function renderFilters() {
    const target = byId("title-diag-event-filters");
    if (!target) return;
    clearNode(target);
    for (const [id, label] of FILTERS) {
      const button = create("button", "diagnostics-filter-button", label);
      button.type = "button";
      button.dataset.eventFilter = id;
      button.setAttribute("aria-pressed", id === ui.activeFilter ? "true" : "false");
      button.addEventListener("click", () => {
        ui.activeFilter = id;
        renderFilters();
        renderEvents();
      });
      target.appendChild(button);
    }
  }

  function renderEvents() {
    const target = byId("title-diag-events");
    if (!target) return;
    clearNode(target);
    const events = Array.isArray(ui.evidence?.events)
      ? ui.evidence.events.filter(eventMatchesFilter)
      : [];
    if (!events.length) {
      target.appendChild(create("div", "diagnostics-timeline-empty", "No events in this filter."));
      return;
    }
    for (const event of events) {
      const row = create("article", "diagnostics-event");
      row.dataset.category = clean(event.category || "other", 24);
      row.append(
        create("span", "diagnostics-event-time", "+" + Math.max(0, Number(event.tRelMs) || 0).toLocaleString() + " ms"),
        create("span", "diagnostics-event-source", clean(event.source || "unknown", 28))
      );
      const copy = create("div", "diagnostics-event-copy");
      copy.append(create("strong", "", clean(event.type || "event", 80)));
      const detailText = safeEventDetail(event);
      if (detailText) copy.append(create("span", "", detailText));
      row.append(copy);
      target.appendChild(row);
    }
  }

  function documentEvidence(documentRecord) {
    const events = Array.isArray(ui.evidence?.events)
      ? ui.evidence.events.filter((event) => event.documentId === documentRecord.documentId)
      : [];
    const content = events.find((event) => event.data?.contentInstanceId)?.data?.contentInstanceId;
    const page = events.find((event) => event.data?.pageInstanceId)?.data?.pageInstanceId;
    const lifecycle = [...events].reverse().find((event) => event.data?.lifecycle)?.data?.lifecycle ||
      (documentRecord.mainReady && documentRecord.isolatedReady ? "ready" : "initializing");
    const isolatedAt = events.find((event) => event.type === "content.activated")?.tRelMs;
    const mainAt = events.find((event) => event.type === "bridge.main-ready")?.tRelMs;
    return { content, page, lifecycle, isolatedAt, mainAt };
  }

  function renderDocuments() {
    const target = byId("title-diag-documents");
    if (!target) return;
    clearNode(target);
    const documents = Array.isArray(ui.evidence?.documents) ? ui.evidence.documents : [];
    text("title-diag-documents-note", documents.length
      ? documents.length + " trusted document record" + (documents.length === 1 ? "" : "s")
      : "No documents captured");
    for (const [index, documentRecord] of documents.entries()) {
      const extra = documentEvidence(documentRecord);
      const row = document.createElement("tr");
      const values = [
        String(index + 1), shortRef(documentRecord.documentId), clean(extra.lifecycle, 40),
        clean(documentRecord.route || "—", 96), shortRef(extra.content), shortRef(extra.page),
        "isolated " + (Number.isFinite(Number(extra.isolatedAt))
          ? "+" + Number(extra.isolatedAt).toLocaleString() + " ms" : "—") +
          " · MAIN " + (Number.isFinite(Number(extra.mainAt))
            ? "+" + Number(extra.mainAt).toLocaleString() + " ms" : "—")
      ];
      const fullValues = [null, documentRecord.documentId, null, documentRecord.route,
        extra.content, extra.page, null];
      for (const [cellIndex, value] of values.entries()) {
        const cell = create("td", "", value);
        if (fullValues[cellIndex]) cell.title = clean(fullValues[cellIndex], 500);
        row.appendChild(cell);
      }
      target.appendChild(row);
    }
  }

  function warningMessages() {
    const evidence = ui.evidence;
    const status = ui.status;
    const messages = [];
    if (status?.timeout || evidence?.completionReason === "timeout") {
      messages.push("The run reached its bounded timeout.");
    }
    if (evidence?.summary?.markerMatch === false || status?.markerMatch === false) {
      messages.push("Loader markers differed between captured documents.");
    }
    if ((evidence?.overflowCount || 0) > 0) {
      messages.push(String(evidence.overflowCount) + " event or document entries exceeded a configured limit.");
    }
    if ((evidence?.droppedBySizeCount || 0) > 0) {
      messages.push(String(evidence.droppedBySizeCount) + " event payloads were dropped by size limits.");
    }
    for (const event of Array.isArray(evidence?.events) ? evidence.events : []) {
      if (event.category === "error" || /error|timeout|failure/i.test(String(event.type || ""))) {
        messages.push(clean(event.type, 80) +
          (event.data?.message ? ": " + clean(event.data.message, 160) : ""));
      }
    }
    return [...new Set(messages)].slice(0, 20);
  }

  function renderWarnings() {
    const panel = byId("title-diag-warnings-panel");
    const target = byId("title-diag-warnings");
    if (!panel || !target) return;
    const messages = warningMessages();
    panel.hidden = !messages.length;
    clearNode(target);
    for (const message of messages) target.appendChild(create("li", "", message));
  }

  function render() {
    const evidence = ui.evidence;
    const status = ui.status || {};
    const runState = clean(status.state || evidence?.state || "idle", 24).toLowerCase();
    setBadge(byId("title-diag-state"), runState);
    setBadge(byId("title-diag-sidebar-state"), runState);
    text("title-diag-last-updated", status.updatedAt
      ? "Updated " + timeLabel(status.updatedAt)
      : "Not refreshed");
    const completion = clean(status.completionReason || evidence?.completionReason || "", 120);
    const completionNode = byId("title-diag-completion-reason");
    if (completionNode) {
      completionNode.hidden = !completion;
      completionNode.textContent = completion ? "Reason: " + completion : "";
    }

    const hasEvidence = Boolean(evidence &&
      (evidence.runId || evidence.events?.length || evidence.documents?.length || runState !== "idle"));
    const empty = byId("title-diag-empty");
    const report = byId("title-diag-report");
    if (empty) empty.hidden = hasEvidence;
    if (report) report.hidden = !hasEvidence;
    if (!hasEvidence) return;

    const eventCount = evidence?.events?.length ?? status.eventCount ?? 0;
    const documentCount = evidence?.documents?.length ?? status.documentCount ?? 0;
    const markerMatch = evidence?.summary?.markerMatch ?? status.markerMatch ?? null;
    const overflow = Number(evidence?.overflowCount || 0) + Number(evidence?.droppedBySizeCount || 0);
    text("title-diag-event-count", eventCount);
    text("title-diag-document-count", documentCount);
    text("title-diag-marker-match", markerMatch == null ? "Unknown" : markerMatch ? "Match" : "Mismatch");
    text("title-diag-timeout", status.timeout || evidence?.completionReason === "timeout" ? "Yes" : "No");
    text("title-diag-overflow", overflow);
    const overflowCard = byId("title-diag-overflow-card");
    if (overflowCard) overflowCard.hidden = overflow === 0;

    const build = byId("title-diag-build");
    clearNode(build);
    appendKv(build, "Loader source", evidence?.build?.source || "—");
    appendKv(build, "Build timestamp", evidence?.build?.loaderBuildTs ?? "—");
    appendKv(build, "Build ISO", evidence?.build?.loaderBuildIso || "—", evidence?.build?.loaderBuildIso);
    appendKv(build, "Marker match", markerMatch == null ? "Unknown" : markerMatch ? "Yes" : "No");

    const navigation = byId("title-diag-navigation");
    clearNode(navigation);
    appendKv(navigation, "Source route", evidence?.summary?.sourceRoute || status.sourceRoute || "—");
    appendKv(navigation, "Destination route", evidence?.summary?.destinationRoute || status.destinationRoute || "—");
    appendKv(navigation, "Started", timeLabel(evidence?.armedAt || evidence?.createdAt));
    appendKv(navigation, "Completed", timeLabel(evidence?.completedAt));
    appendKv(navigation, "Duration", durationLabel(evidence?.armedAt || evidence?.createdAt, evidence?.completedAt));
    appendKv(navigation, "Completion reason", completion || "—");

    renderDocuments();
    renderFilters();
    renderEvents();
    renderWarnings();
    const raw = byId("title-diag-raw");
    if (raw) raw.textContent = JSON.stringify(evidence, null, 2);
  }

  async function refreshSnapshot() {
    ui.status = await command("status");
    ui.evidence = await command("export");
    render();
  }

  async function runOperation(label, operation) {
    if (ui.commandInFlight) return;
    setBusy(true, label);
    showError("");
    try {
      await operation();
      if (byId("title-diag-command-status")?.textContent === label) {
        text("title-diag-command-status", "Ready.");
      }
    }
    catch (error) {
      showError(error);
      text("title-diag-command-status", "Operation failed.");
    }
    finally { setBusy(false, ""); }
  }
  async function exportEvidence() {
    const evidence = await command("export");
    ui.evidence = evidence;
    render();
    const blob = new Blob([JSON.stringify(evidence, null, 2) + "\\n"], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "h2o-title-stage0b2b-" + String(evidence?.runId || "idle").replace(/[^a-z0-9-]/gi, "").slice(0, 48) + ".json";
    anchor.hidden = true; document.body.appendChild(anchor);
    try {
      anchor.click();
      text("title-diag-command-status", "Sanitized evidence exported.");
    }
    catch (error) {
      try {
        await navigator.clipboard?.writeText(JSON.stringify(evidence, null, 2));
        text("title-diag-command-status", "Export unavailable; sanitized JSON copied.");
      } catch {
        throw new Error("Export failed: " + clean(error?.message || "unknown", 160));
      }
    } finally { anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
    ui.status = await command("status");
    render();
  }

  function setDiagnosticsSidebarCollapsed(value) {
    ui.diagnosticsSidebarCollapsed = Boolean(value);
    workspace?.classList.toggle("is-sidebar-collapsed", ui.diagnosticsSidebarCollapsed);
    if (logo instanceof HTMLButtonElement && ui.workspaceMode === "diagnostics") {
      logo.setAttribute("aria-pressed", ui.diagnosticsSidebarCollapsed ? "true" : "false");
      logo.title = ui.diagnosticsSidebarCollapsed
        ? "Expand diagnostics sidebar"
        : "Collapse diagnostics sidebar";
      logo.setAttribute("aria-label", logo.title);
    }
  }

  function enterDiagnostics() {
    if (!workspace || !app || ui.workspaceMode === "diagnostics") return;
    const active = document.querySelector('[data-controls-tab][aria-selected="true"]');
    ui.lastNormalView = active?.dataset?.controlsTab || "main";
    ui.workspaceMode = "diagnostics";
    app.dataset.workspaceMode = "diagnostics";
    app.classList.add("diagnostics-workspace-active");
    workspace.hidden = false;
    setDiagnosticsSidebarCollapsed(ui.diagnosticsSidebarCollapsed);
    renderRegistry();
    render();
    const selected = workspace.querySelector('[data-diagnostic-module][aria-current="page"]');
    (selected || detail)?.focus();
    void runOperation("Refreshing status…", () => refreshSnapshot());
  }

  function leaveDiagnostics() {
    if (!workspace || !app || ui.workspaceMode !== "diagnostics") return;
    cancelPendingTitleClick();
    ui.workspaceMode = "normal";
    workspace.hidden = true;
    app.classList.remove("diagnostics-workspace-active");
    delete app.dataset.workspaceMode;
    if (logo instanceof HTMLButtonElement) {
      const collapsed = app.classList.contains("leftbar-collapsed");
      logo.setAttribute("aria-pressed", collapsed ? "true" : "false");
      logo.title = collapsed ? "Open leftbar" : "Collapse leftbar";
      logo.setAttribute("aria-label", logo.title);
    }
    const previous = document.querySelector(
      '[data-controls-tab="' + clean(ui.lastNormalView, 20) + '"]'
    );
    (previous || titleText)?.focus();
  }

  function cancelPendingTitleClick() {
    if (!ui.pendingTitleClick) return;
    clearTimeout(ui.pendingTitleClick);
    ui.pendingTitleClick = null;
  }

  const actions = {
    [ids.reset]: () => runOperation("Resetting evidence…", async () => {
      await command("reset");
      await refreshSnapshot();
    }),
    [ids.arm]: () => runOperation("Arming next navigation…", async () => {
      await command("arm");
      await refreshSnapshot();
    }),
    [ids.status]: () => runOperation("Refreshing status…", () => refreshSnapshot()),
    [ids.export]: () => runOperation("Preparing sanitized export…", () => exportEvidence()),
    [ids.clear]: () => runOperation("Clearing evidence…", async () => {
      await command("clear");
      await refreshSnapshot();
    })
  };
  for (const [id, action] of Object.entries(actions)) byId(id)?.addEventListener("click", action);

  byId("title-diag-copy-raw")?.addEventListener("click", () => {
    void runOperation("Copying sanitized evidence…", async () => {
      if (!ui.evidence) throw new Error("No sanitized evidence is available to copy.");
      await navigator.clipboard.writeText(JSON.stringify(ui.evidence, null, 2));
      text("title-diag-command-status", "Sanitized JSON copied.");
    });
  });
  yellow?.addEventListener("click", enterDiagnostics);
  document.addEventListener("h2o:title-diagnostics-workspace-toggle-sidebar", (event) => {
    if (ui.workspaceMode !== "diagnostics") return;
    setDiagnosticsSidebarCollapsed(Boolean(event.detail?.collapsed));
  });
  titleText?.addEventListener("click", (event) => {
    if (ui.workspaceMode !== "diagnostics") return;
    if (event.detail >= 2) {
      cancelPendingTitleClick();
      return;
    }
    cancelPendingTitleClick();
    ui.pendingTitleClick = setTimeout(() => {
      ui.pendingTitleClick = null;
      leaveDiagnostics();
    }, TITLE_SINGLE_CLICK_DELAY_MS);
  });
  titleText?.addEventListener("dblclick", cancelPendingTitleClick);

  renderRegistry();
  render();
})();
`;
}
