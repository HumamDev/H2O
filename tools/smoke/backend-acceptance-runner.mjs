#!/usr/bin/env node
/* Versioned governed backend acceptance runner.
 *
 * This is deliberately a narrow phase runner, not a general browser or page
 * automation surface. Page-world execution is limited to the fixed adapter
 * registry and named operations below. Dynamic values cross CDP as structured
 * Runtime.callFunctionOn arguments, never as generated source text.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const RUN_SCHEMA = 'h2o.backend-acceptance-run.v1';
export const MAX_LOGICAL_OPS_PER_RUN = 3;
export const MAX_LOGICAL_OPS_PER_STEP = 1;
export const READ_ONLY_OPS = Object.freeze([
  'runtime-presence',
  'authority-status',
  'pacing-sample',
  'title-read',
  'archive-turn-index',
]);
export const MUTATION_OPS = Object.freeze(['title-patch', 'title-restore']);
export const ALL_ACCEPTANCE_OPS = Object.freeze([...READ_ONLY_OPS, ...MUTATION_OPS]);

const READ_SET = new Set(READ_ONLY_OPS);
const MUTATION_SET = new Set(MUTATION_OPS);
const PHASE_STEPS = Object.freeze({
  0: Object.freeze([]),
  1: Object.freeze([]),
  2: Object.freeze(['title-read', 'archive-turn-index']),
  3: Object.freeze(['title-read', 'title-patch', 'title-restore']),
});
const PHASE_BUDGETS = Object.freeze({ 0: 0, 1: 0, 2: 2, 3: 3 });
const PHASE_ONE_ORIGIN = 'https://chatgpt.com';
const PHASE_ONE_LOCK_NAME = 'h2o.backend-authority.chatgpt.v1';
const REQUIRED_PHASE_ONE_SURFACES = Object.freeze(['acceptance', 'authority', 'title', 'archive']);
export const PHASE_ONE_CHECKS = Object.freeze([
  Object.freeze({ evidenceOp: 'pacing-before', adapterOp: 'pacing-sample' }),
  Object.freeze({ evidenceOp: 'runtime-presence', adapterOp: 'runtime-presence' }),
  Object.freeze({ evidenceOp: 'authority-status', adapterOp: 'authority-status' }),
  Object.freeze({ evidenceOp: 'pacing-after', adapterOp: 'pacing-sample' }),
]);

/* The governed launcher returns LIVE_TEST_ALLOWED as soon as CDP answers and
   the session is observed, which is long before the loader has fetched and
   executed its module set. Sampling the adapter at that instant reports
   acceptance-runtime-unavailable truthfully but uselessly. This bounded wait
   is initialization only: it uses the same allow-listed read-only op, issues
   no backend request, and never becomes an unbounded retry. */
export const ACCEPTANCE_RUNTIME_READY_TIMEOUT_MS = 10000;
export const ACCEPTANCE_RUNTIME_READY_INTERVAL_MS = 250;
const ACCEPTANCE_RUNTIME_NOT_READY_STATUSES = Object.freeze(new Set([
  'acceptance-runtime-unavailable',
  'acceptance-registry-unavailable',
  'chatgpt-target-unavailable',
  // The adapter can answer before its peer modules finish booting: 0A4b is
  // ordered ahead of the Title and Archive surfaces it reports on, so an early
  // probe sees the adapter up and its peers absent. That is the same cold
  // start the wait exists for, not a fault, so it belongs here rather than
  // ending the wait on the first sample.
  'runtime-surface-missing',
]));

// These are the only Runtime.evaluate expressions in this module. Both are
// fixed, versioned module constants. Operation names and arguments use the
// structured Runtime.callFunctionOn arguments array below.
const ACCEPTANCE_REGISTRY_EXPRESSION_V1 = 'globalThis.H2O && globalThis.H2O.BackendAcceptance || null';
const ACCEPTANCE_RUNTIME_PRESENCE_EXPRESSION_V1 = 'Boolean(globalThis.H2O && globalThis.H2O.BackendAcceptance && globalThis.H2O.BackendAcceptance.version === "h2o.backend-acceptance.v1")';
const ACCEPTANCE_CALL_FUNCTION_V1 = 'async function(op,args){return await this.run(op,args);}';

export function isAllowedAcceptanceOp(op) {
  return READ_SET.has(String(op || '')) || MUTATION_SET.has(String(op || ''));
}

export function classifyUnknownOp(op) {
  return isAllowedAcceptanceOp(op) ? '' : 'op-not-allowlisted';
}

export function phaseBudget(phaseRaw) {
  const phase = Number(phaseRaw);
  return Object.prototype.hasOwnProperty.call(PHASE_BUDGETS, phase) ? PHASE_BUDGETS[phase] : -1;
}

export function createLogicalBudget(phaseRaw) {
  const phase = Number(phaseRaw);
  const limit = phaseBudget(phase);
  if (limit < 0) throw new Error('invalid-phase');
  return { phase, limit, remaining: limit, used: 0, perStep: new Map() };
}

export function consumeLogicalBudget(budget, step) {
  if (!budget || typeof budget !== 'object') return { ok: false, status: 'budget-unavailable' };
  const key = String(step || '');
  const usedForStep = Number(budget.perStep.get(key) || 0);
  if (usedForStep >= MAX_LOGICAL_OPS_PER_STEP || budget.remaining <= 0
      || budget.used >= MAX_LOGICAL_OPS_PER_RUN) {
    return { ok: false, status: 'logical-budget-exhausted' };
  }
  // Load-bearing: decrement before dispatch so a thrown operation still costs
  // the logical budget allocated to it.
  budget.remaining -= 1;
  budget.used += 1;
  budget.perStep.set(key, usedForStep + 1);
  return { ok: true, status: 'budget-consumed', used: budget.used, remaining: budget.remaining };
}

export function mutationPermitted(phase, explicitAuthorization) {
  return Number(phase) === 3 && explicitAuthorization === true;
}

export function classifyFeatureResult(result) {
  const value = result && typeof result === 'object' ? result : {};
  const status = String(value.status || '').toLowerCase();
  const reason = String(value.reason || '').toLowerCase();
  const statusCode = Number(value.statusCode || 0);
  if (value.ok === true) return { ok: true, category: 'OK', stop: false };
  if (value.rateLimited === true || statusCode === 429
      || ['rate-limited', 'rate-limited-cooldown', 'backend-429'].includes(status)) {
    return { ok: false, category: 'RATE_LIMITED', stop: true };
  }
  if (statusCode === 401 || status === 'backend-401' || status === 'unauthorized-failed-closed') {
    return { ok: false, category: 'AUTH_FAILED', stop: true };
  }
  if (statusCode === 403 || status === 'backend-403' || status === 'forbidden-failed-closed') {
    return { ok: false, category: 'AUTH_FORBIDDEN', stop: true };
  }
  if (status === 'profile-not-authorized' || reason === 'profile-not-authorized'
      || status.includes('profile-gate') || reason.includes('profile-gate')) {
    return { ok: false, category: 'PROFILE_GATE_DENIED', stop: true };
  }
  if (status === 'authority-unavailable' || reason === 'authority-unavailable'
      || status.includes('authority-unavailable') || reason.includes('authority-unavailable')) {
    return { ok: false, category: 'AUTHORITY_UNAVAILABLE', stop: true };
  }
  if (status.includes('timeout') || status.includes('aborted')) {
    return { ok: false, category: 'TRANSPORT_TIMEOUT', stop: true };
  }
  if (status === 'network-error' || status === 'backend-request-failed') {
    return { ok: false, category: 'NETWORK_ERROR', stop: true };
  }
  if (statusCode >= 500 || /^backend-5\d\d$/.test(status)) {
    return { ok: false, category: 'BACKEND_SERVER_ERROR', stop: true };
  }
  return { ok: false, category: 'ASSERTION_FAILED', stop: true };
}

export function sha256Prefix(value, length = 16) {
  const text = String(value || '');
  if (!text) return '';
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex').slice(0, length);
}

function safeString(value, max = 160) {
  return String(value == null ? '' : value).replace(/[\u0000-\u001f\u007f]/g, '').slice(0, max);
}

function safeEvidenceCode(value, max = 80) {
  const text = safeString(value, max);
  if (!text) return '';
  if (!/^[a-z0-9._:-]+$/i.test(text)
      || /(?:authorization|bearer|cookie|session|token)/i.test(text)
      || /^[a-z0-9_-]+\.[a-z0-9_-]+\.[a-z0-9_-]+$/i.test(text)
      || /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(text)) return '[redacted]';
  return text;
}

const LAUNCHER_DIAGNOSTIC_CODE = /^(?:PROFILE|LIVE|FEATURE|EXTENSION|CORRECT_RUNTIME_PORT|RUNTIME_SOURCE|AUTH|CDP)_[A-Z0-9_]+$/;
const LAUNCHER_DIAGNOSTIC_LINE_MAX = 240;
const LAUNCHER_DIAGNOSTIC_LINE_LIMIT = 4;
const LAUNCHER_SENSITIVE_TEXT = /(?:authorization|bearer|cookie|session|access[\s_-]*token|conversation[\s_-]*(?:id|title)|chat[\s_-]*id|message[\s_-]*(?:text|body)|backend[\s_-]*(?:body|response))/i;
const LAUNCHER_TOKEN_SHAPE = /(?:\beyJ[a-z0-9_-]{8,}\.[a-z0-9_-]{8,}\.[a-z0-9_-]{8,}\b|\bsk-[a-z0-9_-]{12,}\b|\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b)/i;

function safeLauncherDiagnosticLine(value) {
  const line = safeString(value, LAUNCHER_DIAGNOSTIC_LINE_MAX).trim();
  if (!line || LAUNCHER_SENSITIVE_TEXT.test(line) || LAUNCHER_TOKEN_SHAPE.test(line)) return '';
  const code = String(line.match(/^([A-Z][A-Z0-9_]+)(?=\s|:|=|$)/)?.[1] || '');
  return LAUNCHER_DIAGNOSTIC_CODE.test(code) ? line : '';
}

export function retainLauncherDiagnostics(result = {}) {
  const ok = Number(result.status) === 0;
  const lines = [];
  for (const stream of [result.stdout, result.stderr]) {
    for (const rawLine of String(stream || '').split(/\r?\n/)) {
      const line = safeLauncherDiagnosticLine(rawLine);
      if (line) lines.push(line);
    }
  }
  const retained = lines.slice(-LAUNCHER_DIAGNOSTIC_LINE_LIMIT);
  const terminalLine = retained.at(-1) || '';
  const emittedCode = String(terminalLine.match(/^([A-Z][A-Z0-9_]+)(?=\s|:|=|$)/)?.[1] || '');
  return {
    launcherName: 'h2o-launch-for-profile',
    launcherExitCode: Number(result.status ?? 1),
    launcherStatus: ok ? 'GOVERNED_PROFILE_LAUNCHED' : 'GOVERNED_PROFILE_LAUNCH_FAILED',
    launcherDiagnosticCode: emittedCode || (ok ? '' : 'UNCLASSIFIED_LAUNCHER_FAILURE'),
    launcherDiagnosticLine: terminalLine,
    launcherDiagnosticLines: retained,
    liveTestAllowed: retained.some((line) => /^LIVE_TEST_ALLOWED(?:\s|:|=|$)/.test(line)),
  };
}

function safeAuthorityStatus(value) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    available: source.available === true || source.ok === true,
    reason: safeEvidenceCode(source.reason, 80),
    cooldownMs: Math.max(0, Number(source.cooldownMs) || 0),
  };
}

function isRecord(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function hasOwn(value, key) {
  return isRecord(value) && Object.prototype.hasOwnProperty.call(value, key);
}

export function certifyPhaseOneEvidence(input = {}) {
  const runtimePresence = isRecord(input.runtimePresence) ? input.runtimePresence : {};
  const featureSurfaces = isRecord(runtimePresence.featureSurfaces) ? runtimePresence.featureSurfaces : {};
  const authorityStatus = isRecord(input.authorityStatus) ? input.authorityStatus : {};
  const pacingBefore = isRecord(input.pacingBefore) ? input.pacingBefore : {};
  const pacingAfter = isRecord(input.pacingAfter) ? input.pacingAfter : {};
  const missing = [];
  if (!isRecord(input.runtimePresence)) missing.push('runtimePresence');
  if (!hasOwn(runtimePresence, 'ok') || typeof runtimePresence.ok !== 'boolean') missing.push('runtimePresence.ok');
  if (!hasOwn(runtimePresence, 'pageOrigin') || typeof runtimePresence.pageOrigin !== 'string') missing.push('runtimePresence.pageOrigin');
  if (!hasOwn(runtimePresence, 'version') || typeof runtimePresence.version !== 'string') missing.push('runtimePresence.version');
  if (!isRecord(runtimePresence.featureSurfaces)) missing.push('runtimePresence.featureSurfaces');
  for (const surface of REQUIRED_PHASE_ONE_SURFACES) {
    if (!hasOwn(featureSurfaces, surface) || typeof featureSurfaces[surface] !== 'boolean') {
      missing.push(`runtimePresence.featureSurfaces.${surface}`);
    }
  }
  if (!isRecord(input.authorityStatus)) missing.push('authorityStatus');
  for (const key of ['available']) {
    if (!hasOwn(authorityStatus, key) || typeof authorityStatus[key] !== 'boolean') missing.push(`authorityStatus.${key}`);
  }
  for (const key of ['reason', 'origin', 'supportedOrigin', 'lockName']) {
    if (!hasOwn(authorityStatus, key) || typeof authorityStatus[key] !== 'string') missing.push(`authorityStatus.${key}`);
  }
  if (!hasOwn(authorityStatus, 'cooldownMs') || !Number.isFinite(Number(authorityStatus.cooldownMs))) {
    missing.push('authorityStatus.cooldownMs');
  }
  for (const [name, sample] of [['pacingBefore', pacingBefore], ['pacingAfter', pacingAfter]]) {
    if (!isRecord(input[name])) missing.push(name);
    if (!hasOwn(sample, 'available') || typeof sample.available !== 'boolean') missing.push(`${name}.available`);
    if (!hasOwn(sample, 'reason') || typeof sample.reason !== 'string') missing.push(`${name}.reason`);
    if (!hasOwn(sample, 'cooldownMs') || !Number.isFinite(Number(sample.cooldownMs))) missing.push(`${name}.cooldownMs`);
    if (!hasOwn(sample, 'sampledAt') || !Number.isFinite(Number(sample.sampledAt))) missing.push(`${name}.sampledAt`);
  }
  for (const key of ['logicalBudget', 'logicalUsed', 'authenticatedDispatches']) {
    if (!hasOwn(input, key) || !Number.isFinite(Number(input[key]))) missing.push(key);
  }
  if (missing.length) return { ok: false, status: 'PHASE_1_EVIDENCE_INCOMPLETE', missing };

  const missingSurface = REQUIRED_PHASE_ONE_SURFACES.find((surface) => featureSurfaces[surface] !== true);
  if (runtimePresence.ok !== true || missingSurface) {
    return { ok: false, status: 'RUNTIME_SURFACE_MISSING', missingSurface: missingSurface || 'runtime' };
  }
  if (runtimePresence.version !== 'h2o.backend-acceptance.v1') {
    return { ok: false, status: 'RUNTIME_VERSION_MISMATCH' };
  }
  if (runtimePresence.pageOrigin !== PHASE_ONE_ORIGIN
      || authorityStatus.origin !== PHASE_ONE_ORIGIN
      || authorityStatus.supportedOrigin !== PHASE_ONE_ORIGIN) {
    return { ok: false, status: 'AUTHORITY_ORIGIN_MISMATCH' };
  }
  if (authorityStatus.available !== true) return { ok: false, status: 'AUTHORITY_UNAVAILABLE' };
  if (authorityStatus.reason !== '') return { ok: false, status: 'AUTHORITY_STATUS_INVALID' };
  if (authorityStatus.lockName !== PHASE_ONE_LOCK_NAME) return { ok: false, status: 'AUTHORITY_LOCK_MISMATCH' };
  if (Number(authorityStatus.cooldownMs) !== 0
      || Number(pacingBefore.cooldownMs) !== 0
      || Number(pacingAfter.cooldownMs) !== 0) {
    return { ok: false, status: 'COOLDOWN_ALREADY_ACTIVE' };
  }
  if (pacingBefore.available !== true || pacingAfter.available !== true
      || pacingBefore.reason !== '' || pacingAfter.reason !== '') {
    return { ok: false, status: 'PACING_STATE_INVALID' };
  }
  if (Number(pacingBefore.sampledAt) <= 0
      || Number(pacingAfter.sampledAt) < Number(pacingBefore.sampledAt)) {
    return { ok: false, status: 'PACING_STATE_INVALID' };
  }
  if (Number(input.logicalBudget) !== 0 || Number(input.logicalUsed) !== 0
      || Number(input.authenticatedDispatches) !== 0) {
    return { ok: false, status: 'PHASE_1_BUDGET_VIOLATION' };
  }
  return {
    ok: true,
    status: 'PHASE_1_PASS',
    logicalBudget: 0,
    logicalUsed: 0,
    authenticatedDispatches: 0,
  };
}

export function sanitizeStepResult(op, result, elapsedMs, budgetSnapshot) {
  const source = result && typeof result === 'object' ? result : {};
  const featureSurfaces = isRecord(source.featureSurfaces) ? source.featureSurfaces : {};
  const classified = classifyFeatureResult(source);
  return {
    op: safeString(op, 48),
    ok: source.ok === true,
    category: classified.category,
    status: safeString(source.status, 80),
    statusCode: Number(source.statusCode || 0),
    elapsedMs: Math.max(0, Math.round(Number(elapsedMs) || 0)),
    budgetUsed: Math.max(0, Number(budgetSnapshot?.used) || 0),
    budgetRemaining: Math.max(0, Number(budgetSnapshot?.remaining) || 0),
    rateLimited: source.rateLimited === true || classified.category === 'RATE_LIMITED',
    retryAfterMs: Math.max(0, Number(source.retryAfterMs) || 0),
    conversationIdHash: sha256Prefix(source.chatId),
    titlePresent: source.titlePresent === true,
    titleLength: Math.max(0, Number(source.titleLength) || 0),
    turnCount: Math.max(0, Number(source.turnCount) || 0),
    nodeCount: Math.max(0, Number(source.nodeCount) || 0),
    complete: source.complete === true,
    pageOrigin: safeString(source.pageOrigin, 80),
    runtimeVersion: safeString(source.version, 80),
    featureAcceptance: featureSurfaces.acceptance === true,
    featureAuthority: featureSurfaces.authority === true,
    featureTitle: featureSurfaces.title === true,
    featureArchive: featureSurfaces.archive === true,
    authorityAvailable: source.available === true,
    reason: safeEvidenceCode(source.reason, 80),
    origin: safeString(source.origin, 80),
    supportedOrigin: safeString(source.supportedOrigin, 80),
    lockName: safeString(source.lockName, 120),
    cooldownMs: Math.max(0, Number(source.cooldownMs) || 0),
    sampledAt: Math.max(0, Number(source.sampledAt) || 0),
  };
}

export function serializeEvidence(input = {}) {
  const steps = Array.isArray(input.steps) ? input.steps.map((step) => ({
    op: safeString(step.op, 48),
    ok: step.ok === true,
    category: safeString(step.category, 48),
    status: safeString(step.status, 80),
    statusCode: Number(step.statusCode || 0),
    elapsedMs: Math.max(0, Number(step.elapsedMs) || 0),
    budgetUsed: Math.max(0, Number(step.budgetUsed) || 0),
    budgetRemaining: Math.max(0, Number(step.budgetRemaining) || 0),
    rateLimited: step.rateLimited === true,
    retryAfterMs: Math.max(0, Number(step.retryAfterMs) || 0),
    conversationIdHash: safeString(step.conversationIdHash, 32),
    titlePresent: step.titlePresent === true,
    titleLength: Math.max(0, Number(step.titleLength) || 0),
    turnCount: Math.max(0, Number(step.turnCount) || 0),
    nodeCount: Math.max(0, Number(step.nodeCount) || 0),
    complete: step.complete === true,
    pageOrigin: safeString(step.pageOrigin, 80),
    runtimeVersion: safeString(step.runtimeVersion, 80),
    featureAcceptance: step.featureAcceptance === true,
    featureAuthority: step.featureAuthority === true,
    featureTitle: step.featureTitle === true,
    featureArchive: step.featureArchive === true,
    authorityAvailable: step.authorityAvailable === true,
    reason: safeEvidenceCode(step.reason, 80),
    origin: safeString(step.origin, 80),
    supportedOrigin: safeString(step.supportedOrigin, 80),
    lockName: safeString(step.lockName, 120),
    cooldownMs: Math.max(0, Number(step.cooldownMs) || 0),
    sampledAt: Math.max(0, Number(step.sampledAt) || 0),
  })) : [];
  return {
    schema: RUN_SCHEMA,
    runId: safeString(input.runId, 80),
    startedAt: safeString(input.startedAt, 40),
    finishedAt: safeString(input.finishedAt, 40),
    repoCheckpoint: safeString(input.repoCheckpoint, 64),
    sourceWorktree: safeString(input.sourceWorktree, 512),
    sourceClean: input.sourceClean === true,
    profileName: safeString(input.profileName, 120),
    extensionRoot: safeString(input.extensionRoot, 512),
    loaderSha256: safeString(input.loaderSha256, 64),
    extensionId: safeString(input.extensionId, 64),
    authorityDesignation: input.authorityDesignation === true,
    authorityCapability: input.authorityCapability === true,
    authorityAlignment: safeString(input.authorityAlignment, 32),
    designatedCount: Math.max(0, Number(input.designatedCount) || 0),
    runningDesignatedCount: Math.max(0, Number(input.runningDesignatedCount) || 0),
    devPort: Math.max(0, Number(input.devPort) || 0),
    cdpPort: Math.max(0, Number(input.cdpPort) || 0),
    requestedPhase: Math.max(0, Number(input.requestedPhase) || 0),
    logicalBudget: Math.max(0, Number(input.logicalBudget) || 0),
    logicalUsed: Math.max(0, Number(input.logicalUsed) || 0),
    authenticatedDispatches: Math.max(0, Number(input.authenticatedDispatches) || 0),
    phaseOneCertification: safeString(input.phaseOneCertification, 80),
    adapterReadinessStatus: safeEvidenceCode(input.adapterReadinessStatus, 80),
    adapterReadinessAttempts: Math.max(0, Number(input.adapterReadinessAttempts) || 0),
    adapterReadinessWaitedMs: Math.max(0, Number(input.adapterReadinessWaitedMs) || 0),
    adapterReadinessLastNotReady: safeNotReadyStatus(input.adapterReadinessLastNotReady),
    launcherName: safeEvidenceCode(input.launcherName, 80),
    launcherExitCode: Math.max(0, Number(input.launcherExitCode) || 0),
    launcherStatus: safeEvidenceCode(input.launcherStatus, 80),
    launcherDiagnosticCode: safeEvidenceCode(input.launcherDiagnosticCode, 80),
    launcherDiagnosticLine: safeLauncherDiagnosticLine(input.launcherDiagnosticLine),
    launcherDiagnosticLines: Array.isArray(input.launcherDiagnosticLines)
      ? input.launcherDiagnosticLines.map(safeLauncherDiagnosticLine).filter(Boolean).slice(-LAUNCHER_DIAGNOSTIC_LINE_LIMIT)
      : [],
    liveTestAllowed: input.liveTestAllowed === true,
    conservativePhysicalUpperBound: Math.max(0, Number(input.conservativePhysicalUpperBound) || 0),
    steps,
    authorityBefore: safeAuthorityStatus(input.authorityBefore),
    authorityAfter: safeAuthorityStatus(input.authorityAfter),
    rateLimited: input.rateLimited === true,
    retryAfterMs: Math.max(0, Number(input.retryAfterMs) || 0),
    mutationAuthorized: input.mutationAuthorized === true,
    restorationState: safeString(input.restorationState, 48),
    stoppedEarly: input.stoppedEarly === true,
    stopReason: safeString(input.stopReason, 80),
    noRawBackendBypass: input.noRawBackendBypass === true,
    mutex: safeString(input.mutex, 80),
    reclaimedStaleLock: input.reclaimedStaleLock === true,
  };
}

export function writeEvidence(file, input) {
  const target = path.resolve(file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const safe = serializeEvidence(input);
  fs.writeFileSync(target, JSON.stringify(safe, null, 2) + '\n', { encoding: 'utf8', mode: 0o600 });
  return safe;
}

function processAlive(pid) {
  const value = Number(pid);
  if (!Number.isSafeInteger(value) || value <= 0) return false;
  try { process.kill(value, 0); return true; } catch (error) { return error?.code === 'EPERM'; }
}

export function acquireRunMutex(runsRoot, metadata, hooks = {}) {
  const root = path.resolve(runsRoot);
  fs.mkdirSync(root, { recursive: true });
  const lockDir = path.join(root, '.run.lock');
  const ownerFile = path.join(lockDir, 'owner.json');
  let reclaimedStaleLock = false;
  try {
    fs.mkdirSync(lockDir);
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error;
    let owner = {};
    try { owner = JSON.parse(fs.readFileSync(ownerFile, 'utf8')); } catch {}
    const alive = (hooks.processAlive || processAlive)(owner.pid);
    if (alive) return { ok: false, status: 'ACCEPTANCE_RUN_IN_PROGRESS', owner, dispatched: 0 };
    const stale = path.join(root, `.run.lock.stale-${Date.now()}-${process.pid}`);
    fs.renameSync(lockDir, stale);
    fs.mkdirSync(lockDir);
    reclaimedStaleLock = true;
  }
  const owner = {
    pid: Number(metadata?.pid || process.pid),
    runId: safeString(metadata?.runId, 80),
    startedAt: safeString(metadata?.startedAt, 40),
    phase: Number(metadata?.phase || 0),
  };
  fs.writeFileSync(ownerFile, JSON.stringify(owner, null, 2) + '\n', { encoding: 'utf8', mode: 0o600 });
  return { ok: true, status: 'ACCEPTANCE_RUN_LOCKED', lockDir, ownerFile, owner, reclaimedStaleLock };
}

export function releaseRunMutex(lock) {
  if (!lock?.ok || !lock.lockDir || !lock.ownerFile) return false;
  try { fs.unlinkSync(lock.ownerFile); } catch (error) { if (error?.code !== 'ENOENT') throw error; }
  try { fs.rmdirSync(lock.lockDir); } catch (error) { if (error?.code !== 'ENOENT') throw error; }
  return true;
}

export async function dispatchAcceptanceOp({ phase, mutationAuthorized, budget, op, args, invoke }) {
  if (!isAllowedAcceptanceOp(op)) return { ok: false, status: 'op-not-allowlisted', dispatched: false };
  if (MUTATION_SET.has(op) && !mutationPermitted(phase, mutationAuthorized)) {
    return { ok: false, status: 'mutation-not-authorized', dispatched: false };
  }
  const consumed = consumeLogicalBudget(budget, op);
  if (!consumed.ok) return { ...consumed, dispatched: false };
  const started = Date.now();
  const result = await invoke(op, { ...(args || {}), phase: Number(phase), mutationAuthorized: mutationAuthorized === true });
  return { result, elapsedMs: Date.now() - started, dispatched: true, budget: consumed };
}

export async function executeAcceptancePhase(options = {}) {
  const phase = Number(options.phase);
  const steps = PHASE_STEPS[phase];
  if (!steps) return { ok: false, status: 'invalid-phase', steps: [], logicalUsed: 0 };
  if (phase === 2 && options.liveConfirmed !== true) {
    return { ok: false, status: 'live-confirmation-required', steps: [], logicalUsed: 0 };
  }
  if (phase === 3 && options.mutationAuthorized !== true) {
    return { ok: false, status: 'mutation-not-authorized', steps: [], logicalUsed: 0 };
  }
  const budget = options.budget || createLogicalBudget(phase);
  const evidenceSteps = [];
  let authorityBefore = null;
  if (phase >= 2) {
    authorityBefore = await options.status();
    if (Math.max(0, Number(authorityBefore?.cooldownMs) || 0) > 0) {
      return {
        ok: false,
        status: 'COOLDOWN_ALREADY_ACTIVE',
        steps: [],
        logicalUsed: 0,
        authorityBefore,
        stoppedEarly: true,
      };
    }
  }
  for (const op of steps) {
    const dispatched = await dispatchAcceptanceOp({
      phase,
      mutationAuthorized: options.mutationAuthorized,
      budget,
      op,
      args: options.argsByOp?.[op] || {},
      invoke: options.invoke,
    });
    if (!dispatched.dispatched) {
      return { ok: false, status: dispatched.status, steps: evidenceSteps, logicalUsed: budget.used, stoppedEarly: true };
    }
    const step = sanitizeStepResult(op, dispatched.result, dispatched.elapsedMs, dispatched.budget);
    evidenceSteps.push(step);
    const classified = classifyFeatureResult(dispatched.result);
    if (classified.stop) {
      return {
        ok: false,
        status: classified.category,
        steps: evidenceSteps,
        logicalUsed: budget.used,
        stoppedEarly: true,
        stopReason: classified.category,
      };
    }
  }
  return { ok: true, status: `PHASE_${phase}_PASS`, steps: evidenceSteps, logicalUsed: budget.used, authorityBefore };
}

/* Initialization probe, deliberately NOT part of the certified evidence: its
   result is discarded and the full four-step sequence runs afterwards, so
   pacing-before still samples state before the real checks rather than before
   the loader existed. Only "not ready yet" statuses are retried; any other
   result ends the wait immediately so a genuine fault is not masked by
   polling. */
export async function awaitAcceptanceRuntimeReady(options = {}) {
  const invoke = options.invoke;
  if (typeof invoke !== 'function') return { ok: false, status: 'acceptance-runtime-timeout', attempts: 0, waitedMs: 0 };
  const timeoutMs = Number(options.timeoutMs ?? ACCEPTANCE_RUNTIME_READY_TIMEOUT_MS);
  const intervalMs = Number(options.intervalMs ?? ACCEPTANCE_RUNTIME_READY_INTERVAL_MS);
  const now = typeof options.now === 'function' ? options.now : () => Date.now();
  const sleep = typeof options.sleep === 'function'
    ? options.sleep
    : (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const startedAt = now();
  let attempts = 0;
  let lastNotReady = '';
  for (;;) {
    attempts += 1;
    const result = await invoke('runtime-presence', {});
    if (result?.ok === true) {
      return { ok: true, status: 'acceptance-runtime-ready', attempts, waitedMs: now() - startedAt, lastObservedNotReadyStatus: lastNotReady };
    }
    const status = String(result?.status || 'acceptance-runtime-unavailable');
    if (!ACCEPTANCE_RUNTIME_NOT_READY_STATUSES.has(status)) {
      return { ok: false, status, attempts, waitedMs: now() - startedAt, lastObservedNotReadyStatus: lastNotReady };
    }
    // A timeout that cannot say which of the three not-ready conditions it saw
    // forces a second live run to learn it. Only the fixed allow-listed codes
    // are ever retained; nothing observed on the page reaches this field.
    lastNotReady = status;
    if (now() - startedAt + intervalMs > timeoutMs) {
      return { ok: false, status: 'acceptance-runtime-timeout', attempts, waitedMs: now() - startedAt, lastObservedNotReadyStatus: lastNotReady };
    }
    await sleep(intervalMs);
  }
}

export function safeNotReadyStatus(value) {
  const status = String(value || '');
  return ACCEPTANCE_RUNTIME_NOT_READY_STATUSES.has(status) ? status : '';
}

export async function executePhaseOneChecks(options = {}) {
  if (typeof options.invoke !== 'function') {
    return { ok: false, status: 'PHASE_1_EVIDENCE_INCOMPLETE', steps: [], logicalUsed: 0, authenticatedDispatches: 0 };
  }
  const readiness = await awaitAcceptanceRuntimeReady(options);
  if (!readiness.ok) {
    return {
      ok: false,
      status: readiness.status,
      steps: [],
      readiness,
      logicalBudget: 0,
      logicalUsed: 0,
      authenticatedDispatches: 0,
    };
  }
  const raw = {};
  const steps = [];
  for (const check of PHASE_ONE_CHECKS) {
    const started = Date.now();
    const result = await options.invoke(check.adapterOp, {});
    raw[check.evidenceOp] = result;
    steps.push(sanitizeStepResult(check.evidenceOp, result, Date.now() - started, { used: 0, remaining: 0 }));
  }
  const input = {
    runtimePresence: raw['runtime-presence'],
    authorityStatus: raw['authority-status'],
    pacingBefore: raw['pacing-before'],
    pacingAfter: raw['pacing-after'],
    logicalBudget: 0,
    logicalUsed: 0,
    authenticatedDispatches: 0,
  };
  const certification = certifyPhaseOneEvidence(input);
  return {
    ...certification,
    steps,
    readiness,
    runtimePresence: input.runtimePresence,
    authorityStatus: input.authorityStatus,
    pacingBefore: input.pacingBefore,
    pacingAfter: input.pacingAfter,
    logicalBudget: 0,
    logicalUsed: 0,
    authenticatedDispatches: 0,
  };
}

class CdpClient {
  constructor(webSocketUrl) {
    this.url = webSocketUrl;
    this.socket = null;
    this.nextId = 1;
    this.pending = new Map();
  }
  async connect(timeoutMs = 5000) {
    if (typeof WebSocket !== 'function') throw new Error('websocket-unavailable');
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('cdp-connect-timeout')), timeoutMs);
      const socket = new WebSocket(this.url);
      this.socket = socket;
      socket.onopen = () => { clearTimeout(timer); resolve(); };
      socket.onerror = () => { clearTimeout(timer); reject(new Error('cdp-connect-failed')); };
      socket.onmessage = (event) => {
        let message = null;
        try { message = JSON.parse(String(event.data || '')); } catch { return; }
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(String(message.error.message || 'cdp-error')));
        else pending.resolve(message.result || {});
      };
    });
  }
  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
  close() { try { this.socket?.close(); } catch {} }
}

function readJsonHttp(url, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const request = http.get(url, { timeout: timeoutMs }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => {
        if (response.statusCode !== 200) return reject(new Error(`cdp-http-${response.statusCode || 0}`));
        try { resolve(JSON.parse(body)); } catch { reject(new Error('cdp-json-invalid')); }
      });
    });
    request.on('timeout', () => request.destroy(new Error('cdp-http-timeout')));
    request.on('error', reject);
  });
}

export async function invokeAdapterThroughCdp({ cdpPort, op, args }) {
  if (!isAllowedAcceptanceOp(op)) return { ok: false, status: 'op-not-allowlisted' };
  const targets = await readJsonHttp(`http://127.0.0.1:${Number(cdpPort)}/json/list`);
  const target = (Array.isArray(targets) ? targets : []).find((item) => (
    item?.type === 'page' && /^https:\/\/chatgpt\.com\//.test(String(item?.url || '')) && item?.webSocketDebuggerUrl
  ));
  if (!target) return { ok: false, status: 'chatgpt-target-unavailable' };
  const cdp = new CdpClient(target.webSocketDebuggerUrl);
  try {
    await cdp.connect();
    const presence = await cdp.send('Runtime.evaluate', {
      expression: ACCEPTANCE_RUNTIME_PRESENCE_EXPRESSION_V1,
      returnByValue: true,
    });
    if (presence?.result?.value !== true) return { ok: false, status: 'acceptance-runtime-unavailable' };
    const registry = await cdp.send('Runtime.evaluate', {
      expression: ACCEPTANCE_REGISTRY_EXPRESSION_V1,
      objectGroup: 'h2o-backend-acceptance-v1',
      returnByValue: false,
    });
    const objectId = registry?.result?.objectId;
    if (!objectId) return { ok: false, status: 'acceptance-registry-unavailable' };
    const called = await cdp.send('Runtime.callFunctionOn', {
      objectId,
      functionDeclaration: ACCEPTANCE_CALL_FUNCTION_V1,
      arguments: [{ value: op }, { value: args || {} }],
      awaitPromise: true,
      returnByValue: true,
    });
    if (called?.exceptionDetails) return { ok: false, status: 'acceptance-adapter-threw' };
    return called?.result?.value || { ok: false, status: 'acceptance-adapter-empty' };
  } finally {
    cdp.close();
  }
}

export function verifyLevelBOffline({ authorityRoot, profileName, extensionRoot, devPort }) {
  const verifier = path.join(path.resolve(authorityRoot), 'h2o-verify-build-for-profile');
  const result = spawnSync(verifier, [profileName, extensionRoot, String(devPort)], { encoding: 'utf8' });
  const output = `${result.stdout}\n${result.stderr}`;
  const census = output.match(/PROFILE_BACKEND_AUTHORITY_CENSUS designated=(\d+) running=(\d+)/);
  const extensionId = output.match(/EXTENSION_ID_OK id=([a-p]{32})\b/);
  return {
    ok: result.status === 0 && /PROFILE_BUILD_VERIFICATION_PASS/.test(output),
    status: result.status === 0 ? 'LEVEL_B_PASS' : 'LEVEL_B_FAILED',
    exitCode: Number(result.status ?? 1),
    authorityDesignation: /PROFILE_BACKEND_AUTHORITY_DESIGNATION=BACKEND_AUTHORITY_ON/.test(output),
    authorityCapability: /PROFILE_BACKEND_AUTHORITY_BUILD=ON/.test(output),
    authorityAlignment: /PROFILE_BACKEND_AUTHORITY_ALIGNMENT=MATCH/.test(output) ? 'MATCH' : 'DRIFT',
    designatedCount: Number(census?.[1] || 0),
    runningDesignatedCount: Number(census?.[2] || 0),
    extensionId: String(extensionId?.[1] || ''),
  };
}

export function evaluatePhaseZeroGate({ levelB, sourceClean, loaderSha256, mutex }) {
  if (!mutex?.ok) return { ok: false, status: mutex?.status || 'ACCEPTANCE_RUN_LOCK_FAILED' };
  if (!levelB?.ok) return { ok: false, status: levelB?.status || 'LEVEL_B_FAILED' };
  if (sourceClean !== true) return { ok: false, status: 'REPO_NOT_CLEAN_AT_CHECKPOINT' };
  if (!/^[a-f0-9]{64}$/.test(String(loaderSha256 || ''))) return { ok: false, status: 'LOADER_SHA_INVALID' };
  if (levelB.designatedCount !== 1 || levelB.runningDesignatedCount !== 0) {
    return { ok: false, status: 'AUTHORITY_OWNER_CENSUS_FAILED' };
  }
  if (levelB.authorityDesignation !== true || levelB.authorityCapability !== true
      || levelB.authorityAlignment !== 'MATCH') {
    return { ok: false, status: 'AUTHORITY_ARTIFACT_NOT_ALIGNED' };
  }
  return { ok: true, status: 'PHASE_0_GATE_PASS' };
}

export function launchGovernedProfile({ authorityRoot, profileName, extensionRoot, devPort, cdpPort }) {
  const launcher = path.join(path.resolve(authorityRoot), 'h2o-launch-for-profile');
  const result = spawnSync(launcher, [profileName, extensionRoot, String(devPort), String(cdpPort)], { encoding: 'utf8' });
  const diagnostics = retainLauncherDiagnostics(result);
  return {
    ok: result.status === 0,
    status: diagnostics.launcherStatus,
    exitCode: diagnostics.launcherExitCode,
    ...diagnostics,
  };
}

export function repoCleanAt(sourceWorktree, expectedCheckpoint) {
  const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: sourceWorktree, encoding: 'utf8' });
  const status = spawnSync('git', ['status', '--short'], { cwd: sourceWorktree, encoding: 'utf8' });
  return head.status === 0 && status.status === 0
    && head.stdout.trim() === String(expectedCheckpoint || '').trim()
    && status.stdout.trim() === '';
}

function parseArgs(argv) {
  const options = { phase: 0, devPort: 0, cdpPort: 0, liveConfirmed: false, mutationAuthorized: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) throw new Error(`unexpected argument: ${arg}`);
    const key = arg.slice(2);
    if (key === 'live-confirmation') options.liveConfirmed = true;
    else if (key === 'allow-mutation') options.mutationAuthorized = true;
    else {
      const value = argv[++i];
      if (value == null) throw new Error(`missing value for --${key}`);
      if (key === 'phase') options.phase = Number(value);
      else if (key === 'profile') options.profileName = value;
      else if (key === 'authority-root') options.authorityRoot = value;
      else if (key === 'extension-root') options.extensionRoot = value;
      else if (key === 'dev-port') options.devPort = Number(value);
      else if (key === 'cdp-port') options.cdpPort = Number(value);
      else if (key === 'source-worktree') options.sourceWorktree = value;
      else if (key === 'repo-checkpoint') options.repoCheckpoint = value;
      else if (key === 'evidence-root') options.evidenceRoot = value;
      else if (key === 'mutation-title') options.mutationTitle = value;
      else if (key === 'restore-title') options.restoreTitle = value;
      else throw new Error(`unknown option: --${key}`);
    }
  }
  if (![0, 1, 2, 3].includes(options.phase)) throw new Error('invalid --phase');
  return options;
}

function loaderSha(extensionRoot) {
  return crypto.createHash('sha256').update(fs.readFileSync(path.join(extensionRoot, 'loader.js'))).digest('hex');
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  for (const key of ['profileName', 'authorityRoot', 'extensionRoot', 'sourceWorktree', 'repoCheckpoint']) {
    if (!options[key]) throw new Error(`missing required option: ${key}`);
  }
  const runId = new Date().toISOString().replace(/[-:.]/g, '').replace('Z', 'Z') + `-${process.pid}`;
  const evidenceRoot = path.resolve(options.evidenceRoot || path.join(options.authorityRoot, options.profileName, 'acceptance-runs'));
  const runDir = path.join(evidenceRoot, runId);
  const lock = acquireRunMutex(evidenceRoot, { pid: process.pid, runId, startedAt: new Date().toISOString(), phase: options.phase });
  if (!lock.ok) {
    process.stderr.write(`${lock.status}\n`);
    process.exitCode = 2;
    return;
  }
  const release = () => { try { releaseRunMutex(lock); } catch {} };
  process.once('exit', release);
  process.once('SIGINT', () => { release(); process.exit(130); });
  process.once('SIGTERM', () => { release(); process.exit(143); });
  const evidence = {
    runId,
    startedAt: new Date().toISOString(),
    repoCheckpoint: options.repoCheckpoint,
    sourceWorktree: path.resolve(options.sourceWorktree),
    sourceClean: repoCleanAt(options.sourceWorktree, options.repoCheckpoint),
    profileName: options.profileName,
    extensionRoot: path.resolve(options.extensionRoot),
    loaderSha256: loaderSha(options.extensionRoot),
    devPort: options.devPort,
    cdpPort: options.cdpPort,
    requestedPhase: options.phase,
    logicalBudget: phaseBudget(options.phase),
    // Phase 2 reads allow one session/backend pair plus the authority's single
    // bounded 401 pair per logical op. Optional Phase 3 is deliberately more
    // conservative because Title owns bounded persistence verification.
    conservativePhysicalUpperBound: options.phase === 3 ? 32 : phaseBudget(options.phase) * 4,
    mutationAuthorized: options.mutationAuthorized,
    noRawBackendBypass: true,
    mutex: lock.status,
    reclaimedStaleLock: lock.reclaimedStaleLock,
  };
  try {
    const levelB = verifyLevelBOffline(options);
    Object.assign(evidence, {
      extensionId: levelB.extensionId,
      authorityDesignation: levelB.authorityDesignation,
      authorityCapability: levelB.authorityCapability,
      authorityAlignment: levelB.authorityAlignment,
      designatedCount: levelB.designatedCount,
      runningDesignatedCount: levelB.runningDesignatedCount,
    });
    const phaseZero = evaluatePhaseZeroGate({
      levelB,
      sourceClean: evidence.sourceClean,
      loaderSha256: evidence.loaderSha256,
      mutex: lock,
    });
    if (!phaseZero.ok) {
      const status = phaseZero.status;
      writeEvidence(path.join(runDir, 'run.json'), { ...evidence, stoppedEarly: true, stopReason: status });
      process.stderr.write(`${status}\n`);
      process.exitCode = 2;
      return;
    }
    if (options.phase === 0) {
      writeEvidence(path.join(runDir, 'run.json'), { ...evidence, logicalUsed: 0, stoppedEarly: false });
      process.stdout.write('PHASE_0_PASS\n');
      return;
    }
    if (options.phase === 1) {
      if (!options.cdpPort) throw new Error('Phase 1 requires --cdp-port');
      const launched = launchGovernedProfile(options);
      Object.assign(evidence, {
        launcherName: launched.launcherName,
        launcherExitCode: launched.launcherExitCode,
        launcherStatus: launched.launcherStatus,
        launcherDiagnosticCode: launched.launcherDiagnosticCode,
        launcherDiagnosticLine: launched.launcherDiagnosticLine,
        launcherDiagnosticLines: launched.launcherDiagnosticLines,
        liveTestAllowed: launched.liveTestAllowed,
      });
      if (!launched.ok) {
        writeEvidence(path.join(runDir, 'run.json'), { ...evidence, logicalUsed: 0, stoppedEarly: true, stopReason: launched.status });
        process.stderr.write(`${launched.status}\n`);
        process.exitCode = 2;
        return;
      }
      const phaseOne = await executePhaseOneChecks({
        invoke: (op, args) => invokeAdapterThroughCdp({ cdpPort: options.cdpPort, op, args }),
      });
      writeEvidence(path.join(runDir, 'run.json'), {
        ...evidence,
        steps: phaseOne.steps,
        authorityBefore: phaseOne.pacingBefore,
        authorityAfter: phaseOne.pacingAfter,
        logicalUsed: phaseOne.logicalUsed,
        authenticatedDispatches: phaseOne.authenticatedDispatches,
        phaseOneCertification: phaseOne.status,
        adapterReadinessStatus: phaseOne.readiness?.status,
        adapterReadinessAttempts: phaseOne.readiness?.attempts,
        adapterReadinessWaitedMs: phaseOne.readiness?.waitedMs,
        adapterReadinessLastNotReady: phaseOne.readiness?.lastObservedNotReadyStatus,
        stoppedEarly: phaseOne.ok !== true,
        stopReason: phaseOne.ok === true ? '' : phaseOne.status,
      });
      if (!phaseOne.ok) {
        process.stderr.write(`${phaseOne.status}\n`);
        process.exitCode = 2;
        return;
      }
      // Explicit hard stop: Phase 1 never falls through to Phase 2.
      process.stdout.write('PHASE_1_PASS\n');
      return;
    }
    const status = () => invokeAdapterThroughCdp({ cdpPort: options.cdpPort, op: 'authority-status', args: {} });
    const invoked = (op, args) => invokeAdapterThroughCdp({ cdpPort: options.cdpPort, op, args });
    if (options.phase === 3 && (!String(options.mutationTitle || '').trim() || !String(options.restoreTitle || '').trim())) {
      throw new Error('Phase 3 requires --mutation-title and --restore-title');
    }
    const result = await executeAcceptancePhase({
      phase: options.phase,
      liveConfirmed: options.liveConfirmed,
      mutationAuthorized: options.mutationAuthorized,
      status,
      invoke: invoked,
      argsByOp: options.phase === 3 ? {
        'title-patch': { title: String(options.mutationTitle || '') },
        'title-restore': { restoreTitle: String(options.restoreTitle || '') },
      } : {},
    });
    writeEvidence(path.join(runDir, 'run.json'), {
      ...evidence,
      ...result,
      logicalUsed: result.logicalUsed,
      steps: result.steps,
      stoppedEarly: result.ok !== true,
      stopReason: result.ok === true ? '' : result.status,
      rateLimited: result.status === 'RATE_LIMITED',
    });
    process.stdout.write(`${result.status}\n`);
    if (!result.ok) process.exitCode = 2;
  } finally {
    release();
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main().catch((error) => {
  process.stderr.write(`BACKEND_ACCEPTANCE_FAILED ${safeString(error?.message || error)}\n`);
  process.exitCode = 2;
});
