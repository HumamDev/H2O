/*
 * CV-3.3 bounded navigation and session spot-check recorder.
 *
 * Evaluation only installs H2O_CV3_3_NAV_SPOT_CHECK. It does not switch
 * canonical sources, navigate, reload, click, write DOM, or start a scenario.
 */
(() => {
  'use strict';

  const G = globalThis;
  const VERSION = 'cv3.3-navigation-spot-check-v1';
  const PREFIX = 'h2o:cv3-3:';
  const STORAGE_KEY = `${PREFIX}navigation:v1`;
  const SCHEMA_VERSION = 1;
  const MAX_BYTES = 64 * 1024;
  const MAX_SNAPSHOTS = 24;
  const LEGACY_SOURCE = 'legacy-durable-cache';

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function asNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function asString(value) {
    return value == null ? '' : String(value);
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function safeRead(fn, fallback = null) {
    try {
      const value = fn();
      return value === undefined ? fallback : value;
    } catch {
      return fallback;
    }
  }

  function stableValue(value, depth = 0, seen = new WeakSet()) {
    if (value == null || typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number') return Number.isFinite(value) ? value : String(value);
    if (typeof value === 'bigint') return String(value);
    if (typeof value === 'function' || typeof value === 'symbol') return undefined;
    if (depth > 10) return '[depth-limit]';
    if (Array.isArray(value)) return value.slice(0, 100).map((item) => stableValue(item, depth + 1, seen));
    if (typeof value === 'object') {
      if (seen.has(value)) return '[circular]';
      seen.add(value);
      const output = {};
      for (const key of Object.keys(value).sort()) {
        const item = stableValue(value[key], depth + 1, seen);
        if (item !== undefined) output[key] = item;
      }
      seen.delete(value);
      return output;
    }
    return asString(value);
  }

  function stableJson(value) {
    return JSON.stringify(stableValue(value));
  }

  function utf8Bytes(value) {
    return new TextEncoder().encode(asString(value)).byteLength;
  }

  function storageKeys(storage) {
    const keys = [];
    try {
      for (let index = 0; index < asNumber(storage?.length); index += 1) {
        const key = storage?.key?.(index);
        if (key != null) keys.push(asString(key));
      }
    } catch {
      return [];
    }
    return keys;
  }

  function readRaw() {
    try {
      return G.sessionStorage?.getItem?.(STORAGE_KEY) ?? null;
    } catch {
      return null;
    }
  }

  function validateEvidence(evidence) {
    if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) return 'evidence-invalid-shape';
    if (evidence.schemaVersion !== SCHEMA_VERSION) return 'evidence-unsupported-schema';
    if (evidence.helperVersion !== VERSION) return 'evidence-foreign-helper-version';
    if (!evidence.scenarioId || !evidence.createdAt || !evidence.updatedAt) return 'evidence-missing-required-field';
    if (!Array.isArray(evidence.snapshots)) return 'evidence-snapshots-invalid';
    if (evidence.snapshots.length > MAX_SNAPSHOTS) return 'snapshot-limit-exceeded';
    return null;
  }

  function readEvidence() {
    const raw = readRaw();
    if (!raw) return { ok: false, reason: 'evidence-missing' };
    const bytes = utf8Bytes(raw);
    if (bytes > MAX_BYTES) return { ok: false, reason: 'evidence-size-limit-exceeded', bytes, limitBytes: MAX_BYTES };
    let evidence;
    try {
      evidence = JSON.parse(raw);
    } catch {
      return { ok: false, reason: 'evidence-malformed-json' };
    }
    const invalid = validateEvidence(evidence);
    return invalid
      ? { ok: false, reason: invalid, bytes, limitBytes: MAX_BYTES }
      : { ok: true, evidence: stableValue(evidence), bytes, limitBytes: MAX_BYTES };
  }

  function writeEvidence(evidence) {
    const invalid = validateEvidence(evidence);
    if (invalid) return { ok: false, reason: invalid };
    const raw = stableJson(evidence);
    const bytes = utf8Bytes(raw);
    if (bytes > MAX_BYTES) return { ok: false, reason: 'evidence-size-limit-exceeded', bytes, limitBytes: MAX_BYTES };
    try {
      G.sessionStorage?.setItem?.(STORAGE_KEY, raw);
      return { ok: true, bytes, limitBytes: MAX_BYTES };
    } catch (error) {
      return { ok: false, reason: 'evidence-storage-write-failed', error: asString(error?.message || error) };
    }
  }

  function runtime() {
    return G.H2O?.turnRuntime || null;
  }

  function activeChatKey() {
    const fromApi = safeRead(() => G.H2O?.surface?.chatId?.(), '');
    if (fromApi) return asString(fromApi);
    const match = asString(G.location?.pathname).match(/\/(?:c|g\/[^/]+\/c)\/([^/?#]+)/i);
    return match ? decodeURIComponent(match[1]) : '';
  }

  function routeType() {
    const path = asString(G.location?.pathname);
    if (/^\/g\/[^/]+\/c\/[^/]+/i.test(path)) return 'project-or-custom-gpt';
    if (/^\/c\/[^/]+/i.test(path)) return 'conversation';
    return 'other';
  }

  function miniMapRows() {
    const root = safeRead(() => G.document?.querySelector?.([
      '[data-cgxui="mnmp-root"][data-cgxui-owner="mnmp"]',
      '[data-h2o-owner="minimap-v10"]',
    ].join(', ')), null);
    if (!root) return [];
    return Array.from(safeRead(() => root.querySelectorAll?.([
      '[data-cgxui="mnmp-btn"]',
      '[data-cgxui="mm-btn"]',
      '.cgxui-mm-btn',
    ].join(', ')), [])).map((button, index) => ({
      index,
      turnNo: asNumber(button?.dataset?.turnIdx),
      qId: asString(button?.dataset?.questionId) || null,
      primaryAId: asString(button?.dataset?.primaryAId) || null,
    }));
  }

  function canonicalRows() {
    return asArray(safeRead(() => runtime()?.listTurnRecords?.(), [])).map((record, index) => ({
      turnNo: asNumber(record?.turnNo || record?.idx || record?.index || index + 1),
      qId: record?.qId || null,
      primaryAId: record?.primaryAId || null,
    })).sort((a, b) => a.turnNo - b.turnNo);
  }

  function miniMapAlignment(records, boxes) {
    const boxByTurn = new Map(boxes.map((box) => [box.turnNo, box]));
    const mismatchTurnNos = [];
    for (const record of records) {
      const box = boxByTurn.get(record.turnNo);
      if (!box
        || (record.qId && box.qId && record.qId !== box.qId)
        || (record.primaryAId && record.primaryAId !== box.primaryAId)) {
        mismatchTurnNos.push(record.turnNo);
      }
    }
    return {
      ok: records.length === boxes.length && mismatchTurnNos.length === 0,
      mismatchTurnNos: mismatchTurnNos.slice(0, 24),
    };
  }

  function sourceSummary(diagnostics) {
    const source = diagnostics?.canonicalSource || {};
    return {
      activeSource: safeRead(() => runtime()?.getChatAtlasCanonicalSource?.(), null) || source.activeSource || null,
      effectiveSource: source.effectiveSource || null,
      defaultSource: source.defaultSource || null,
      persisted: source.persisted ?? null,
      switchCount: asNumber(source.switchCount),
      lastSelection: stableValue(source.lastSelection || null),
    };
  }

  function aliasGauges(diagnostics, ledger) {
    return {
      currentCrossMemberDuplicateCount: asNumber(diagnostics?.currentCrossMemberDuplicateCount),
      crossMemberAliasConflictCount: asNumber(diagnostics?.crossMemberAliasConflictCount),
      currentAliasConflictCount: asNumber(diagnostics?.currentAliasConflictCount),
      historicalAliasConflictCount: asNumber(diagnostics?.historicalAliasConflictCount),
      duplicateAliasCount: asNumber(diagnostics?.duplicateAliasCount),
      quarantinedAliasCount: asNumber(diagnostics?.quarantinedAliasCount ?? ledger?.quarantinedAliasCount),
    };
  }

  function dualRunSummary(dualRun) {
    return {
      ready: !!dualRun?.ready,
      exactParity: dualRun?.exactParity === true,
      legacyCount: asNumber(dualRun?.legacyCount),
      adapterCount: asNumber(dualRun?.adapterCount),
      currentMismatchCount: asNumber(dualRun?.currentMismatchCount),
      totalMismatchCount: asNumber(dualRun?.totalMismatchCount),
      instrumentationErrorCount: asNumber(dualRun?.instrumentationErrorCount),
      evidenceChatKey: dualRun?.evidenceChatKey || null,
      ledgerChatKey: dualRun?.ledgerChatKey || null,
    };
  }

  function captureSnapshot(label) {
    const records = canonicalRows();
    const ledger = safeRead(() => runtime()?.getChatAtlasLedgerSnapshot?.(), { ledgerReady: false, members: [] });
    const diagnostics = safeRead(() => runtime()?.getChatAtlasLedgerDiagnostics?.(), { ledgerReady: false });
    const convergence = safeRead(() => runtime()?.getChatAtlasConvergenceParity?.(), {
      parityStatus: 'unknown',
      blockers: ['convergence-api-unavailable'],
    });
    const source = sourceSummary(diagnostics);
    const boxes = miniMapRows();
    const mapButtons = asNumber(G.H2O_MM_mapButtons?.size, -1);
    const turnById = asNumber(G.H2O_MM_turnById?.size, -1);
    const coreTurnList = asNumber(safeRead(() => G.H2O_MM_CORE_API?.getTurnList?.().length, -1), -1);
    const memberCount = asNumber(ledger?.memberCount, asArray(ledger?.members).length);
    const aliases = aliasGauges(diagnostics, ledger);
    const dualRun = dualRunSummary(diagnostics?.dualRun);
    const alignment = miniMapAlignment(records, boxes);
    const counts = {
      canonical: records.length,
      ledger: memberCount,
      miniMap: boxes.length,
      mapButtons,
      turnById,
      coreTurnList,
      legacy: asNumber(source.lastSelection?.legacyCount, dualRun.legacyCount),
      selected: asNumber(source.lastSelection?.selectedCount, records.length),
    };
    const countValues = [counts.canonical, counts.ledger, counts.miniMap, counts.mapButtons, counts.turnById, counts.coreTurnList];
    const gates = {
      ledgerReady: ledger?.ledgerReady === true,
      ledgerChatMatches: !!activeChatKey() && activeChatKey() === asString(ledger?.chatKey),
      countsAligned: countValues.every((value) => value >= 0) && new Set(countValues).size === 1,
      dualRunExact: dualRun.ready && dualRun.exactParity && dualRun.currentMismatchCount === 0
        && dualRun.totalMismatchCount === 0 && dualRun.instrumentationErrorCount === 0,
      convergenceClean: asArray(convergence?.blockers).length === 0,
      aliasesClean: Object.values(aliases).every((value) => value === 0),
      miniMapAligned: alignment.ok,
    };
    return stableValue({
      label: asString(label).trim().slice(0, 120),
      capturedAt: nowIso(),
      href: asString(G.location?.href),
      routeType: routeType(),
      chatKey: activeChatKey() || null,
      source,
      ledger: {
        ready: !!ledger?.ledgerReady,
        chatKey: ledger?.chatKey || null,
        version: asNumber(ledger?.version),
      },
      counts,
      dualRun,
      convergence: {
        parityStatus: convergence?.parityStatus || null,
        blockers: asArray(convergence?.blockers).slice(0, 12),
      },
      aliasGauges: aliases,
      miniMapAlignment: alignment,
      gates,
    });
  }

  function entryFailures(snapshot) {
    const failures = [];
    if (snapshot?.source?.activeSource !== LEGACY_SOURCE) failures.push('legacy-active-required');
    if (snapshot?.source?.effectiveSource !== LEGACY_SOURCE) failures.push('legacy-effective-required');
    if (snapshot?.source?.defaultSource !== LEGACY_SOURCE) failures.push('legacy-default-required');
    if (snapshot?.source?.persisted !== false) failures.push('source-must-be-memory-only');
    for (const [gate, passed] of Object.entries(snapshot?.gates || {})) {
      if (!passed) failures.push(`entry-${gate}`);
    }
    return failures;
  }

  function existingEvidenceKeys() {
    return [
      ...storageKeys(G.sessionStorage),
      ...storageKeys(G.localStorage),
    ].filter((key) => key.startsWith(PREFIX));
  }

  function START(options = {}) {
    const scenarioId = asString(options?.scenarioId).trim();
    if (!/^CV3\.3-S[1-7]-[A-Za-z0-9._-]{1,80}$/.test(scenarioId)) {
      return { ok: false, reason: 'scenario-id-invalid' };
    }
    const existing = readEvidence();
    if (existing.ok) {
      if (options?.resume === true && existing.evidence.scenarioId === scenarioId) {
        return { ok: true, resumed: true, evidence: existing.evidence, bytes: existing.bytes };
      }
      return { ok: false, reason: 'evidence-existing-cleanup-required' };
    }
    if (existing.reason !== 'evidence-missing' || existingEvidenceKeys().length) {
      return { ok: false, reason: existing.reason === 'evidence-missing'
        ? 'evidence-existing-cleanup-required'
        : existing.reason };
    }
    const initial = captureSnapshot('START');
    const failures = entryFailures(initial);
    if (failures.length) return { ok: false, reason: 'entry-gate-failed', failureReasons: failures, snapshot: initial };
    const createdAt = nowIso();
    const evidence = {
      schemaVersion: SCHEMA_VERSION,
      helperVersion: VERSION,
      scenarioId,
      scenario: asString(options?.scenario || scenarioId.split('-').slice(0, 2).join('-')).slice(0, 80),
      createdAt,
      updatedAt: createdAt,
      snapshots: [initial],
    };
    const write = writeEvidence(evidence);
    return write.ok
      ? { ok: true, resumed: false, scenarioId, snapshot: initial, bytes: write.bytes }
      : write;
  }

  function SNAPSHOT(label) {
    const normalizedLabel = asString(label).trim();
    if (!normalizedLabel) return { ok: false, reason: 'snapshot-label-required' };
    const read = readEvidence();
    if (!read.ok) return read;
    if (read.evidence.snapshots.length >= MAX_SNAPSHOTS) {
      return { ok: false, reason: 'snapshot-limit-exceeded', limit: MAX_SNAPSHOTS };
    }
    const snapshot = captureSnapshot(normalizedLabel);
    const evidence = {
      ...read.evidence,
      updatedAt: nowIso(),
      snapshots: [...read.evidence.snapshots, snapshot],
    };
    const write = writeEvidence(evidence);
    return write.ok
      ? { ok: true, scenarioId: evidence.scenarioId, snapshot, snapshotCount: evidence.snapshots.length, bytes: write.bytes }
      : write;
  }

  async function sha256(value) {
    const digest = await G.crypto?.subtle?.digest?.('SHA-256', new TextEncoder().encode(value));
    if (!digest) throw new Error('sha256-unavailable');
    return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  async function EXPORT() {
    const read = readEvidence();
    if (!read.ok) return read;
    const payload = stableValue({
      evidenceType: 'cv3.3-navigation-spot-check-v1',
      helperVersion: VERSION,
      exportedAt: nowIso(),
      scenarioId: read.evidence.scenarioId,
      evidence: read.evidence,
    });
    const json = stableJson(payload);
    const bytes = utf8Bytes(json);
    if (bytes > MAX_BYTES) return { ok: false, reason: 'export-size-limit-exceeded', bytes, limitBytes: MAX_BYTES };
    try {
      const hash = await sha256(json);
      const stamp = payload.exportedAt.replace(/[:.]/g, '-');
      return {
        ok: true,
        fileName: `${payload.scenarioId}-${stamp}.json`,
        bytes,
        sha256: hash,
        snapshotCount: payload.evidence.snapshots.length,
        json,
      };
    } catch (error) {
      return { ok: false, reason: 'export-sha256-failed', error: asString(error?.message || error) };
    }
  }

  function CLEANUP() {
    const removed = { sessionStorage: [], localStorage: [] };
    for (const [name, storage] of [['sessionStorage', G.sessionStorage], ['localStorage', G.localStorage]]) {
      for (const key of storageKeys(storage)) {
        if (!key.startsWith(PREFIX)) continue;
        try {
          storage.removeItem(key);
          removed[name].push(key);
        } catch {
          // The postcondition below fails closed if removal did not succeed.
        }
      }
    }
    const remaining = existingEvidenceKeys();
    return { ok: remaining.length === 0, removed, remaining };
  }

  const API = Object.freeze({
    version: VERSION,
    limits: Object.freeze({ maxBytes: MAX_BYTES, maxSnapshots: MAX_SNAPSHOTS }),
    START,
    SNAPSHOT,
    EXPORT,
    CLEANUP,
  });

  Object.defineProperty(G, 'H2O_CV3_3_NAV_SPOT_CHECK', {
    value: API,
    configurable: true,
    enumerable: false,
    writable: false,
  });

  console.info(`[CV-3.3] Installed ${VERSION}. No scenario or source action has run.`);
})();
