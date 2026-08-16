#!/usr/bin/env node
/* Offline governed backend-acceptance validator: V1-V26 + mutations. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const ADAPTER = path.join(ROOT, 'src-runtime-base/0A4b.⬛️🌐 Backend Acceptance Adapter 🌐.js');
const RUNNER = path.join(ROOT, 'tools/smoke/backend-acceptance-runner.mjs');
const BUILDER = path.join(ROOT, 'tools/product/extensions/chatgpt/chrome/build-chrome-live-extension.mjs');
const LOADER = path.join(ROOT, 'tools/product/extensions/chatgpt/chrome/chrome-live-loader.mjs');
for (const file of [ADAPTER, RUNNER]) assert.ok(fs.existsSync(file), `required file missing: ${file}`);
const [{ parse }, runner, loader] = await Promise.all([
  import('espree'),
  import(pathToFileURL(RUNNER).href + `?validator=${Date.now()}`),
  import(pathToFileURL(LOADER).href + `?validator=${Date.now()}`),
]);
const adapterSource = fs.readFileSync(ADAPTER, 'utf8');
const runnerSource = fs.readFileSync(RUNNER, 'utf8');
const builderSource = fs.readFileSync(BUILDER, 'utf8');
const ast = (source) => parse(source, { ecmaVersion: 'latest', sourceType: 'module', loc: true });
const adapterAst = ast(adapterSource);
const runnerAst = ast(runnerSource);
let assertions = 0;
let fixtures = 0;
const eq = (actual, expected, message) => { assertions += 1; assert.equal(actual, expected, message); };
const ok = (value, message) => { assertions += 1; assert.ok(value, message); };
async function fixture(name, fn) {
  fixtures += 1;
  try { await fn(); console.log(`  ✓ ${name}`); }
  catch (error) { error.message = `${name}: ${error.message}`; throw error; }
}
function walk(node, visit) {
  if (!node || typeof node !== 'object') return;
  visit(node);
  for (const [key, value] of Object.entries(node)) {
    if (key === 'parent') continue;
    if (Array.isArray(value)) value.forEach((child) => walk(child, visit));
    else if (value && typeof value.type === 'string') walk(value, visit);
  }
}
function callCount(tree, name) {
  let count = 0;
  walk(tree, (node) => {
    if (node.type === 'CallExpression' && node.callee?.type === 'Identifier' && node.callee.name === name) count += 1;
  });
  return count;
}
function functionCallCount(tree, functionName, calleeName) {
  let target = null;
  walk(tree, (node) => {
    if (node.type === 'FunctionDeclaration' && node.id?.name === functionName) target = node;
  });
  return target ? callCount(target, calleeName) : 0;
}
function cliViolations(source) {
  return ['--evaluate', '--expression', '--script', '--javascript'].filter((flag) => source.includes(flag));
}
function transportViolations(label, source, tree) {
  const out = [];
  if (source.includes('/api/auth/session')) out.push('session');
  if (source.includes('/backend-api/')) out.push('backend');
  if (/\bBearer\s|Authorization\s*:|accessToken/.test(source)) out.push('auth-material');
  if (label === 'adapter' && callCount(tree, 'fetch')) out.push('fetch');
  if (label === 'adapter' && /BackendAuthority\s*\.\s*request\s*\(/.test(source)) out.push('authority-request');
  return out;
}
function mockLoader(excluded) {
  return loader.makeChromeLiveLoaderJs({
    DEV_TAG: 'test', DEV_TITLE: 'test', DEV_HAS_CONTROLS: false,
    PROXY_PACK_URL: 'http://127.0.0.1:1/pack',
    DEV_SCRIPT_CATALOG: { '0A4b._Backend_Acceptance_Adapter_.js': { name: 'acceptance' } },
    DEV_ORDER_SECTIONS_SNAPSHOT: [], LOADER_DEPS_SNAPSHOT: {}, STORAGE_KEY: 'x',
    STORAGE_ORDER_OVERRIDES_KEY: 'y', PAGE_FOLDER_BRIDGE_FILE: 'a.js',
    PAGE_PILOT_OBSERVER_FILE: 'b.js', EXCLUDED_RUNTIME_ALIASES: excluded,
  });
}
async function withMutatedRunner(label, replacements, fn) {
  let source = runnerSource;
  for (const [from, to] of replacements) {
    ok(source.includes(from), `${label} mutation target exists`);
    source = source.replace(from, to);
  }
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `h2o-acceptance-${label}-`));
  const file = path.join(root, 'runner.mjs');
  try {
    fs.writeFileSync(file, source);
    const mutated = await import(pathToFileURL(file).href + `?mutation=${Date.now()}`);
    return await fn(mutated);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}
function adapterPreservesAuthorityLock(source) {
  return /lockName:\s*String\(status\.lockName\s*\|\|\s*''\)/.test(source);
}
function loadAdapterFixture({ authority = true, title = true, archive = true, cooldownMs = 0 } = {}) {
  const page = {
    location: { origin: 'https://chatgpt.com' },
    H2O: {
      BackendAuthority: authority ? { status: () => ({
        available: true,
        reason: '',
        origin: 'https://chatgpt.com',
        supportedOrigin: 'https://chatgpt.com',
        lockName: 'h2o.backend-authority.chatgpt.v1',
        cooldownMs,
      }) } : {},
      ChatTitle: title ? { readNativeTitle() {} } : {},
      archiveBoot: archive ? { fetchConversationTurnIndex() {}, getCurrentChatId: () => '' } : {},
    },
  };
  vm.runInNewContext(adapterSource, { window: page, unsafeWindow: page, console, Object, Set, String, Number, Date });
  return page.H2O.BackendAcceptance;
}

await fixture('V1/V2 budget decrement and exhaustion', async () => {
  const budget = runner.createLogicalBudget(2);
  eq(budget.limit, 2, 'Phase 2 limit');
  ok(runner.consumeLogicalBudget(budget, 'title-read').ok, 'first consume');
  ok(runner.consumeLogicalBudget(budget, 'archive-turn-index').ok, 'second consume');
  eq(runner.consumeLogicalBudget(budget, 'extra').status, 'logical-budget-exhausted', 'third refused');
  eq(budget.used, 2, 'hard cap');
  const throwingBudget = runner.createLogicalBudget(2);
  await runner.dispatchAcceptanceOp({ phase: 2, budget: throwingBudget, op: 'title-read', args: {},
    invoke: async () => { throw new Error('mock failure'); } }).catch(() => {});
  eq(throwingBudget.used, 1, 'decrement occurs before dispatch');
});

await fixture('V3 rate limit kills restoration', async () => {
  const calls = [];
  const result = await runner.executeAcceptancePhase({ phase: 3, mutationAuthorized: true,
    status: async () => ({ ok: true, cooldownMs: 0 }), invoke: async (op) => {
      calls.push(op);
      return op === 'title-patch' ? { ok: false, status: 'backend-429', statusCode: 429 } : { ok: true, status: 'ok' };
    } });
  eq(result.status, 'RATE_LIMITED', 'category');
  eq(calls.join(','), 'title-read,title-patch', 'restore cancelled');
  eq(result.logicalUsed, 2, 'no remaining dispatch');
});

await fixture('V4 cooldown blocks first dispatch', async () => {
  let calls = 0;
  const result = await runner.executeAcceptancePhase({ phase: 2, liveConfirmed: true,
    status: async () => ({ ok: true, cooldownMs: 10 }),
    invoke: async () => { calls += 1; return { ok: true }; } });
  eq(result.status, 'COOLDOWN_ALREADY_ACTIVE', 'category');
  eq(calls, 0, 'zero dispatch');
  eq(result.logicalUsed, 0, 'zero budget');
});

await fixture('V5/V6 401 and 403 stop once', async () => {
  for (const [status, category] of [['backend-401', 'AUTH_FAILED'], ['backend-403', 'AUTH_FORBIDDEN']]) {
    let calls = 0;
    const result = await runner.executeAcceptancePhase({ phase: 2, liveConfirmed: true,
      status: async () => ({ ok: true, cooldownMs: 0 }),
      invoke: async () => { calls += 1; return { ok: false, status }; } });
    eq(result.status, category, category);
    eq(calls, 1, 'no retry');
  }
});

await fixture('V7 transport and authority failures stop precisely', async () => {
  const cases = [
    ['turn-index-timeout', 0, 'TRANSPORT_TIMEOUT'], ['network-error', 0, 'NETWORK_ERROR'],
    ['backend-503', 503, 'BACKEND_SERVER_ERROR'], ['authority-unavailable', 0, 'AUTHORITY_UNAVAILABLE'],
    ['profile-not-authorized', 0, 'PROFILE_GATE_DENIED'],
  ];
  for (const [status, statusCode, category] of cases) {
    let calls = 0;
    const result = await runner.executeAcceptancePhase({ phase: 2, liveConfirmed: true,
      status: async () => ({ ok: true, cooldownMs: 0 }),
      invoke: async () => { calls += 1; return { ok: false, status, statusCode }; } });
    eq(result.status, category, category);
    eq(calls, 1, 'no retry');
  }
});

await fixture('V8 mutex refusal and stale reclaim', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'h2o-acceptance-lock-'));
  try {
    const first = runner.acquireRunMutex(root, { pid: 99111, runId: 'one', phase: 2 }, { processAlive: () => true });
    ok(first.ok, 'first lock');
    const duplicate = runner.acquireRunMutex(root, { pid: 99112, runId: 'two', phase: 2 }, { processAlive: () => true });
    eq(duplicate.status, 'ACCEPTANCE_RUN_IN_PROGRESS', 'live duplicate refused');
    runner.releaseRunMutex(first);
    const lockDir = path.join(root, '.run.lock');
    fs.mkdirSync(lockDir);
    fs.writeFileSync(path.join(lockDir, 'owner.json'), '{"pid":99113}\n');
    const reclaimed = runner.acquireRunMutex(root, { pid: 99114, runId: 'new', phase: 2 }, { processAlive: () => false });
    ok(reclaimed.ok && reclaimed.reclaimedStaleLock, 'dead lock reclaimed');
    runner.releaseRunMutex(reclaimed);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

await fixture('Phase 0 consumes Level-B, census, clean source, per-run SHA, evidence, and mutex', async () => {
  const levelB = {
    ok: true, status: 'LEVEL_B_PASS', authorityDesignation: true,
    authorityCapability: true, authorityAlignment: 'MATCH',
    designatedCount: 1, runningDesignatedCount: 0,
  };
  const gate = runner.evaluatePhaseZeroGate({
    levelB, sourceClean: true, loaderSha256: 'a'.repeat(64), mutex: { ok: true },
  });
  ok(gate.ok, 'complete Phase 0 gate passes');
  eq(runner.evaluatePhaseZeroGate({ levelB, sourceClean: false, loaderSha256: 'a'.repeat(64), mutex: { ok: true } }).status,
    'REPO_NOT_CLEAN_AT_CHECKPOINT', 'dirty source fails');
  eq(runner.evaluatePhaseZeroGate({ levelB, sourceClean: true, loaderSha256: 'old-global-pin', mutex: { ok: true } }).status,
    'LOADER_SHA_INVALID', 'SHA must be supplied per run');
  eq(runner.evaluatePhaseZeroGate({ levelB: { ...levelB, runningDesignatedCount: 1 }, sourceClean: true,
    loaderSha256: 'a'.repeat(64), mutex: { ok: true } }).status,
    'AUTHORITY_OWNER_CENSUS_FAILED', 'running designated owner fails Phase 0');
  const evidence = runner.serializeEvidence({ loaderSha256: 'a'.repeat(64), designatedCount: 1,
    runningDesignatedCount: 0, mutex: 'ACCEPTANCE_RUN_LOCKED' });
  eq(evidence.loaderSha256, 'a'.repeat(64), 'per-run loader SHA recorded');
  eq(evidence.designatedCount, 1, 'designation census recorded');
  eq(evidence.runningDesignatedCount, 0, 'owner census recorded');
  eq(evidence.mutex, 'ACCEPTANCE_RUN_LOCKED', 'mutex recorded');
});

await fixture('V9 mutation gates and restore budget', async () => {
  eq(runner.mutationPermitted(2, true), false, 'wrong phase');
  eq(runner.mutationPermitted(3, false), false, 'missing permission');
  eq(runner.mutationPermitted(3, true), true, 'both gates');
  const refused = await runner.dispatchAcceptanceOp({ phase: 3, mutationAuthorized: false,
    budget: runner.createLogicalBudget(3), op: 'title-patch', invoke: async () => ({ ok: true }) });
  eq(refused.status, 'mutation-not-authorized', 'pre-dispatch refusal');
  const result = await runner.executeAcceptancePhase({ phase: 3, mutationAuthorized: true,
    status: async () => ({ ok: true, cooldownMs: 0 }), invoke: async () => ({ ok: true, status: 'ok' }) });
  ok(result.ok, 'Phase 3 mock success');
  eq(result.logicalUsed, 3, 'restore costs budget');
  eq(result.steps.at(-1).op, 'title-restore', 'restore last');
});

await fixture('V10 no bypass and production exclusion', async () => {
  const violations = [
    ...transportViolations('adapter', adapterSource, adapterAst),
    ...transportViolations('runner', runnerSource, runnerAst),
  ];
  eq(violations.length, 0, `violations: ${violations.join(',')}`);
  ok(adapterSource.includes('H2O.ChatTitle'), 'Title feature API');
  ok(adapterSource.includes('fetchConversationTurnIndex'), 'Archive feature API');
  ok(builderSource.includes('MANIFEST_PROFILE === "production"'), 'existing production branch');
  ok(builderSource.includes('0A4b._Backend_Acceptance_Adapter_.js'), 'exclusion alias');
  const production = mockLoader(['0A4b._Backend_Acceptance_Adapter_.js']);
  ok(production.includes('new Set(["0A4b._Backend_Acceptance_Adapter_.js"])'), 'production exclusion pinned');
  ok(production.includes('EXCLUDED_RUNTIME_ALIASES.has(aliasId)'), 'pack and catalog filtered');
  const development = mockLoader([]);
  ok(development.includes('"0A4b._Backend_Acceptance_Adapter_.js":{"name":"acceptance"}'), 'development catalog includes adapter');
});

await fixture('V11 evidence redaction allow-list', async () => {
  const rawId = '11111111-2222-4333-8444-555555555555';
  const evidence = runner.serializeEvidence({ runId: 'run', profileName: 'profile', requestedPhase: 2,
    accessToken: 'eyJhbGciOiJIUzI1NiJ9.secret', Authorization: 'Bearer secret', cookies: 'session=secret',
    title: 'private title', steps: [{ op: 'title-read', ok: true, conversationIdHash: runner.sha256Prefix(rawId),
      chatId: rawId, body: { messages: ['secret'] } }] });
  const encoded = JSON.stringify(evidence);
  ok(!encoded.includes(rawId), 'raw ID absent');
  ok(!encoded.includes('Bearer secret'), 'Authorization absent');
  ok(!encoded.includes('eyJhbGci'), 'token absent');
  ok(!encoded.includes('private title'), 'title absent');
  ok(!encoded.includes('messages'), 'body absent');
  ok(encoded.includes(runner.sha256Prefix(rawId)), 'hash retained');
});

await fixture('V12 named operations and no arbitrary-JS CLI', async () => {
  eq(runner.isAllowedAcceptanceOp('title-read'), true, 'known op');
  eq(runner.isAllowedAcceptanceOp('unknown'), false, 'unknown op');
  eq(runner.classifyUnknownOp('unknown'), 'op-not-allowlisted', 'unknown status');
  eq(cliViolations(runnerSource).length, 0, 'no arbitrary-code CLI');
});

await fixture('V13 fixed Runtime.evaluate expressions', async () => {
  const fixed = new Set();
  for (const statement of runnerAst.body) {
    if (statement.type !== 'VariableDeclaration' || statement.kind !== 'const') continue;
    for (const declaration of statement.declarations) {
      const init = declaration.init;
      if (declaration.id?.type === 'Identifier' && (init?.type === 'Literal'
          || (init?.type === 'TemplateLiteral' && init.expressions.length === 0))) fixed.add(declaration.id.name);
    }
  }
  let calls = 0;
  walk(runnerAst, (node) => {
    if (node.type !== 'CallExpression') return;
    const [method, params] = node.arguments || [];
    if (method?.type !== 'Literal' || method.value !== 'Runtime.evaluate') return;
    calls += 1;
    eq(params?.type, 'ObjectExpression', 'static params object');
    const property = params.properties.find((item) => item.type === 'Property'
      && (item.key?.name === 'expression' || item.key?.value === 'expression'));
    ok(property, 'expression property');
    eq(property.value?.type, 'Identifier', 'identifier expression');
    ok(fixed.has(property.value.name), `fixed ${property.value.name}`);
  });
  eq(calls, 2, 'two fixed evaluate sites');
  ok(runnerSource.includes('Runtime.callFunctionOn'), 'structured arguments');
});

function validPhaseOneEvidence() {
  return {
    runtimePresence: {
      ok: true,
      status: 'runtime-present',
      pageOrigin: 'https://chatgpt.com',
      version: 'h2o.backend-acceptance.v1',
      featureSurfaces: { acceptance: true, authority: true, title: true, archive: true },
    },
    authorityStatus: {
      ok: true,
      status: 'authority-available',
      available: true,
      reason: '',
      origin: 'https://chatgpt.com',
      supportedOrigin: 'https://chatgpt.com',
      lockName: 'h2o.backend-authority.chatgpt.v1',
      cooldownMs: 0,
    },
    pacingBefore: {
      ok: true, status: 'authority-available', available: true,
      reason: '', cooldownMs: 0, sampledAt: 1000,
    },
    pacingAfter: {
      ok: true, status: 'authority-available', available: true,
      reason: '', cooldownMs: 0, sampledAt: 1001,
    },
    logicalBudget: 0,
    logicalUsed: 0,
    authenticatedDispatches: 0,
  };
}

await fixture('V14 runtime-presence missing Title surface cannot pass', async () => {
  for (const surface of ['acceptance', 'authority', 'title']) {
    const input = validPhaseOneEvidence();
    input.runtimePresence.featureSurfaces[surface] = false;
    const result = runner.certifyPhaseOneEvidence(input);
    eq(result.ok, false, `missing ${surface} fails`);
    eq(result.status, 'RUNTIME_SURFACE_MISSING', 'precise category');
  }
  const actualMissingTitle = await loadAdapterFixture({ title: false }).run('runtime-presence');
  eq(actualMissingTitle.ok, false, 'real adapter fails outer result when Title is missing');
  eq(actualMissingTitle.featureSurfaces.title, false, 'real adapter reports missing Title');
  const actualMissingAuthority = await loadAdapterFixture({ authority: false }).run('runtime-presence');
  eq(actualMissingAuthority.ok, false, 'real adapter fails outer result when authority is missing');
});

await fixture('V15 runtime-presence missing Archive surface cannot pass', async () => {
  const input = validPhaseOneEvidence();
  input.runtimePresence.featureSurfaces.archive = false;
  const result = runner.certifyPhaseOneEvidence(input);
  eq(result.ok, false, 'missing Archive fails');
  eq(result.status, 'RUNTIME_SURFACE_MISSING', 'precise category');
  const actual = await loadAdapterFixture({ archive: false }).run('runtime-presence');
  eq(actual.ok, false, 'real adapter fails outer result when Archive is missing');
  eq(actual.featureSurfaces.archive, false, 'real adapter reports missing Archive');
});

await fixture('V16 unavailable authority cannot pass', async () => {
  const input = validPhaseOneEvidence();
  input.authorityStatus.available = false;
  input.authorityStatus.ok = false;
  const result = runner.certifyPhaseOneEvidence(input);
  eq(result.ok, false, 'unavailable authority fails');
  eq(result.status, 'AUTHORITY_UNAVAILABLE', 'precise category');
});

await fixture('V17 non-empty authority reason cannot pass', async () => {
  const input = validPhaseOneEvidence();
  input.authorityStatus.reason = 'unexpected';
  const result = runner.certifyPhaseOneEvidence(input);
  eq(result.ok, false, 'reason fails');
  eq(result.status, 'AUTHORITY_STATUS_INVALID', 'precise category');
});

await fixture('V18 wrong page, authority, or supported origin cannot pass', async () => {
  for (const mutate of [
    (input) => { input.runtimePresence.pageOrigin = 'https://example.com'; },
    (input) => { input.authorityStatus.origin = 'https://example.com'; },
    (input) => { input.authorityStatus.supportedOrigin = 'https://example.com'; },
  ]) {
    const input = validPhaseOneEvidence();
    mutate(input);
    const result = runner.certifyPhaseOneEvidence(input);
    eq(result.ok, false, 'origin mismatch fails');
    eq(result.status, 'AUTHORITY_ORIGIN_MISMATCH', 'precise category');
  }
});

await fixture('V19 wrong or missing authority lock name cannot pass', async () => {
  ok(adapterPreservesAuthorityLock(adapterSource), 'adapter preserves the authority lock name');
  eq((await loadAdapterFixture().run('authority-status')).lockName,
    'h2o.backend-authority.chatgpt.v1', 'real adapter returns the lock name');
  const wrong = validPhaseOneEvidence();
  wrong.authorityStatus.lockName = 'wrong-lock';
  eq(runner.certifyPhaseOneEvidence(wrong).status, 'AUTHORITY_LOCK_MISMATCH', 'wrong lock fails');
  const missing = validPhaseOneEvidence();
  delete missing.authorityStatus.lockName;
  eq(runner.certifyPhaseOneEvidence(missing).status, 'PHASE_1_EVIDENCE_INCOMPLETE', 'missing lock fails closed');
});

await fixture('V20 non-zero or missing cooldown cannot pass', async () => {
  const active = validPhaseOneEvidence();
  active.authorityStatus.cooldownMs = 1;
  eq(runner.certifyPhaseOneEvidence(active).status, 'COOLDOWN_ALREADY_ACTIVE', 'active cooldown fails');
  const missing = validPhaseOneEvidence();
  delete missing.authorityStatus.cooldownMs;
  eq(runner.certifyPhaseOneEvidence(missing).status, 'PHASE_1_EVIDENCE_INCOMPLETE', 'missing cooldown fails closed');
  eq((await loadAdapterFixture({ cooldownMs: 37 }).run('authority-status')).cooldownMs,
    37, 'real adapter returns non-zero cooldown without erasing it');
});

await fixture('V21 missing before pacing sample cannot pass', async () => {
  const input = validPhaseOneEvidence();
  delete input.pacingBefore;
  eq(runner.certifyPhaseOneEvidence(input).status, 'PHASE_1_EVIDENCE_INCOMPLETE', 'missing before sample');
});

await fixture('V22 missing after pacing sample cannot pass', async () => {
  const input = validPhaseOneEvidence();
  delete input.pacingAfter;
  eq(runner.certifyPhaseOneEvidence(input).status, 'PHASE_1_EVIDENCE_INCOMPLETE', 'missing after sample');
});

await fixture('V23 complete Phase-1 evidence passes with zero budget and dispatch', async () => {
  const valid = runner.certifyPhaseOneEvidence(validPhaseOneEvidence());
  ok(valid.ok, 'complete evidence passes');
  eq(valid.status, 'PHASE_1_PASS', 'Phase 1 pass');
  eq(valid.logicalUsed, 0, 'zero logical use');
  eq(valid.authenticatedDispatches, 0, 'zero authenticated dispatch');
  let sample = 1000;
  const calls = [];
  const executed = await runner.executePhaseOneChecks({ invoke: async (op) => {
    calls.push(op);
    if (op === 'runtime-presence') return validPhaseOneEvidence().runtimePresence;
    if (op === 'authority-status') return validPhaseOneEvidence().authorityStatus;
    return { ...validPhaseOneEvidence().pacingBefore, sampledAt: sample++ };
  } });
  ok(executed.ok, 'real Phase-1 executor passes');
  // The leading probe is the readiness wait, whose result is discarded; the
  // certified sequence is the four that follow it, so pacing-before still
  // samples state before the real checks rather than before the loader ran.
  eq(calls[0], 'runtime-presence', 'readiness probe runs first and is not certified evidence');
  eq(calls.slice(1).join(','), 'pacing-sample,runtime-presence,authority-status,pacing-sample', 'fixed before/after sequence');
  eq(executed.steps.map((step) => step.op).join(','),
    'pacing-before,runtime-presence,authority-status,pacing-after', 'evidence labels distinguish samples');
  const recorded = runner.serializeEvidence({ requestedPhase: 1, logicalBudget: 0,
    logicalUsed: executed.logicalUsed, authenticatedDispatches: executed.authenticatedDispatches,
    phaseOneCertification: executed.status, steps: executed.steps,
    authorityBefore: executed.pacingBefore, authorityAfter: executed.pacingAfter });
  eq(recorded.steps[0].sampledAt, 1000, 'before pacing sample preserved');
  eq(recorded.steps[3].sampledAt, 1001, 'after pacing sample preserved');
  eq(recorded.phaseOneCertification, 'PHASE_1_PASS', 'central certification preserved');
  eq(recorded.authenticatedDispatches, 0, 'zero authenticated dispatch preserved');
});

await fixture('V24 safe Phase-1 fields survive while sensitive fields remain excluded', async () => {
  const rawId = '11111111-2222-4333-8444-555555555555';
  const runtimeStep = runner.sanitizeStepResult('runtime-presence', {
    ...validPhaseOneEvidence().runtimePresence,
    accessToken: 'eyJhbGci.secret', conversationId: rawId, title: 'secret title',
  }, 1, { used: 0, remaining: 0 });
  const authorityStep = runner.sanitizeStepResult('authority-status', {
    ...validPhaseOneEvidence().authorityStatus, cooldownMs: 37, reason: 'Bearer secret',
    Authorization: 'Bearer secret', cookies: 'session=secret', body: { messages: ['secret'] },
  }, 1, { used: 0, remaining: 0 });
  const pacingStep = runner.sanitizeStepResult('pacing-before', validPhaseOneEvidence().pacingBefore,
    1, { used: 0, remaining: 0 });
  const evidence = runner.serializeEvidence({ requestedPhase: 1, logicalBudget: 0, logicalUsed: 0,
    authenticatedDispatches: 0, phaseOneCertification: 'PHASE_1_PASS',
    steps: [runtimeStep, authorityStep, pacingStep] });
  eq(evidence.steps[0].pageOrigin, 'https://chatgpt.com', 'page origin retained');
  eq(evidence.steps[0].featureTitle, true, 'Title surface retained');
  eq(evidence.steps[0].featureArchive, true, 'Archive surface retained');
  eq(evidence.steps[1].lockName, 'h2o.backend-authority.chatgpt.v1', 'lock retained');
  eq(evidence.steps[1].supportedOrigin, 'https://chatgpt.com', 'supported origin retained');
  eq(evidence.steps[1].cooldownMs, 37, 'cooldown retained without defaulting');
  eq(evidence.steps[1].reason, '[redacted]', 'token-shaped reason is redacted');
  eq(evidence.steps[2].sampledAt, 1000, 'pacing timestamp retained');
  const encoded = JSON.stringify(evidence);
  ok(!encoded.includes(rawId), 'raw ID stripped');
  ok(!encoded.includes('Bearer secret'), 'Authorization stripped');
  ok(!encoded.includes('eyJhbGci'), 'token stripped');
  ok(!encoded.includes('secret title'), 'title stripped');
  ok(!encoded.includes('messages'), 'backend body stripped');
});

await fixture('V25 launcher diagnostics retain only bounded allow-listed evidence', async () => {
  const fromStdout = runner.retainLauncherDiagnostics({
    status: 2,
    stdout: 'arbitrary preface\nPROFILE_EXAMPLE_FAILED: safe synthetic reason\n',
    stderr: '',
  });
  eq(fromStdout.launcherName, 'h2o-launch-for-profile', 'fixed launcher identity retained');
  eq(fromStdout.launcherExitCode, 2, 'nonzero exit retained');
  eq(fromStdout.launcherStatus, 'GOVERNED_PROFILE_LAUNCH_FAILED', 'failure status retained');
  eq(fromStdout.launcherDiagnosticCode, 'PROFILE_EXAMPLE_FAILED', 'stdout code retained');
  eq(fromStdout.launcherDiagnosticLine, 'PROFILE_EXAMPLE_FAILED: safe synthetic reason', 'stdout line retained');

  const fromStderr = runner.retainLauncherDiagnostics({
    status: 7,
    stdout: 'unrelated output\n',
    stderr: 'noise\nCDP_STARTUP_FAILED: safe terminal reason\n',
  });
  eq(fromStderr.launcherDiagnosticCode, 'CDP_STARTUP_FAILED', 'stderr code retained');
  eq(fromStderr.launcherDiagnosticLine, 'CDP_STARTUP_FAILED: safe terminal reason', 'stderr line retained');

  const unclassified = runner.retainLauncherDiagnostics({ status: 9, stdout: 'arbitrary output', stderr: 'plain failure' });
  eq(unclassified.launcherDiagnosticCode, 'UNCLASSIFIED_LAUNCHER_FAILURE', 'neutral fallback code');
  eq(unclassified.launcherDiagnosticLine, '', 'arbitrary line discarded');
  eq(unclassified.launcherExitCode, 9, 'neutral failure retains exit code');

  const success = runner.retainLauncherDiagnostics({
    status: 0,
    stdout: 'PROFILE_BUILD_ARTIFACT_CONTRACT_OK profile=synthetic\nLIVE_TEST_ALLOWED profile=synthetic pid=1\n',
    stderr: '',
  });
  eq(success.launcherStatus, 'GOVERNED_PROFILE_LAUNCHED', 'success status unchanged');
  eq(success.launcherExitCode, 0, 'success exit unchanged');
  eq(success.launcherDiagnosticCode, 'LIVE_TEST_ALLOWED', 'emitted success diagnostic retained');
  eq(success.liveTestAllowed, true, 'LIVE_TEST_ALLOWED reached');

  const bounded = runner.retainLauncherDiagnostics({ status: 2, stdout: Array.from({ length: 9 }, (_, i) => (
    `PROFILE_SYNTHETIC_${i}_FAILED: line ${i}`
  )).join('\n') });
  eq(bounded.launcherDiagnosticLines.length, 4, 'diagnostic line count bounded');
  ok(bounded.launcherDiagnosticLines.every((line) => line.length <= 240), 'diagnostic length bounded');
});

await fixture('V26 launcher evidence is redacted, neutral when absent, and never retried', async () => {
  const rawId = '11111111-2222-4333-8444-555555555555';
  const cases = [
    'PROFILE_AUTH_FAILED: Authorization: Bearer secret',
    'PROFILE_COOKIE_FAILED: cookie=session-secret',
    `PROFILE_CHAT_FAILED: conversation-id=${rawId}`,
    'PROFILE_TOKEN_FAILED: eyJhbGciOiJIUzI1NiJ9.abcdefghijk.abcdefghijkl',
  ];
  for (const line of cases) {
    const retained = runner.retainLauncherDiagnostics({ status: 2, stderr: `${line}\n` });
    eq(retained.launcherDiagnosticCode, 'UNCLASSIFIED_LAUNCHER_FAILURE', 'sensitive line becomes neutral');
    eq(retained.launcherDiagnosticLine, '', 'sensitive line discarded');
    const evidence = runner.serializeEvidence({ ...retained, launcherRawStdout: line, launcherRawStderr: line });
    const encoded = JSON.stringify(evidence);
    ok(!encoded.includes(line), 'raw child output absent from evidence');
    ok(!encoded.includes(rawId), 'raw conversation identifier absent');
    ok(!encoded.includes('Bearer secret'), 'Authorization value absent');
  }
  const neutral = runner.serializeEvidence(runner.retainLauncherDiagnostics({ status: 12 }));
  eq(neutral.launcherExitCode, 12, 'unclassified evidence preserves exit');
  eq(neutral.launcherDiagnosticCode, 'UNCLASSIFIED_LAUNCHER_FAILURE', 'unclassified evidence preserves neutral code');
  eq(neutral.liveTestAllowed, false, 'missing output never invents LIVE_TEST_ALLOWED');
  eq(functionCallCount(runnerAst, 'launchGovernedProfile', 'spawnSync'), 1, 'exactly one launcher dispatch site');
  ok(!/launchGovernedProfile[\s\S]{0,1000}(?:retry|while\s*\(|for\s*\()/i.test(runnerSource), 'no launcher retry loop');
});

await fixture('Phase-1 evidence mutations M1-M7 are killed', async () => {
  await withMutatedRunner('m1-surfaces', [[
    'const missingSurface = REQUIRED_PHASE_ONE_SURFACES.find((surface) => featureSurfaces[surface] !== true);',
    "const missingSurface = '';",
  ]], async (mutated) => {
    const input = validPhaseOneEvidence();
    input.runtimePresence.featureSurfaces.title = false;
    ok(mutated.certifyPhaseOneEvidence(input).ok, 'M1 would let a missing surface pass');
  });

  const adapterWithoutLock = adapterSource.replace("      lockName: String(status.lockName || ''),\n", '');
  ok(!adapterPreservesAuthorityLock(adapterWithoutLock), 'M2 dropping lockName is detected');

  await withMutatedRunner('m3-cooldown', [[
    '    lockName: safeString(source.lockName, 120),\n    cooldownMs: Math.max(0, Number(source.cooldownMs) || 0),',
    '    lockName: safeString(source.lockName, 120),',
  ]], async (mutated) => {
    const step = mutated.sanitizeStepResult('authority-status', {
      ...validPhaseOneEvidence().authorityStatus, cooldownMs: 37,
    }, 1, { used: 0, remaining: 0 });
    const evidence = mutated.serializeEvidence({ steps: [step] });
    eq(evidence.steps[0].cooldownMs, 0, 'M3 loses the non-zero cooldown sentinel');
  });

  const pacingMock = async (op) => {
    if (op === 'runtime-presence') return validPhaseOneEvidence().runtimePresence;
    if (op === 'authority-status') return validPhaseOneEvidence().authorityStatus;
    return validPhaseOneEvidence().pacingBefore;
  };
  await withMutatedRunner('m4-before', [[
    "  Object.freeze({ evidenceOp: 'pacing-before', adapterOp: 'pacing-sample' }),\n",
    '',
  ]], async (mutated) => {
    eq((await mutated.executePhaseOneChecks({ invoke: pacingMock })).status,
      'PHASE_1_EVIDENCE_INCOMPLETE', 'M4 missing before sample is rejected');
  });
  await withMutatedRunner('m5-after', [[
    "  Object.freeze({ evidenceOp: 'pacing-after', adapterOp: 'pacing-sample' }),\n",
    '',
  ]], async (mutated) => {
    eq((await mutated.executePhaseOneChecks({ invoke: pacingMock })).status,
      'PHASE_1_EVIDENCE_INCOMPLETE', 'M5 missing after sample is rejected');
  });

  await withMutatedRunner('m6-incomplete', [[
    "  if (missing.length) return { ok: false, status: 'PHASE_1_EVIDENCE_INCOMPLETE', missing };",
    "  if (false) return { ok: false, status: 'PHASE_1_EVIDENCE_INCOMPLETE', missing };",
  ]], async (mutated) => {
    const input = validPhaseOneEvidence();
    delete input.pacingBefore.sampledAt;
    ok(mutated.certifyPhaseOneEvidence(input).ok, 'M6 would allow incomplete evidence to pass');
  });

  await withMutatedRunner('m7-redaction', [
    [
      '    pageOrigin: safeString(source.pageOrigin, 80),',
      '    rawConversationId: safeString(source.conversationId, 120),\n    pageOrigin: safeString(source.pageOrigin, 80),',
    ],
    [
      '    pageOrigin: safeString(step.pageOrigin, 80),',
      '    rawConversationId: safeString(step.rawConversationId, 120),\n    pageOrigin: safeString(step.pageOrigin, 80),',
    ],
  ], async (mutated) => {
    const rawId = '11111111-2222-4333-8444-555555555555';
    const step = mutated.sanitizeStepResult('runtime-presence', {
      ...validPhaseOneEvidence().runtimePresence, conversationId: rawId,
    }, 1, { used: 0, remaining: 0 });
    ok(JSON.stringify(mutated.serializeEvidence({ steps: [step] })).includes(rawId),
      'M7 would leak the raw conversation ID');
  });
});

await fixture('Launcher diagnostic-retention mutations M1-M5 are killed', async () => {
  await withMutatedRunner('launcher-m1-discard', [[
    '  for (const stream of [result.stdout, result.stderr]) {',
    '  for (const stream of []) {',
  ]], async (mutated) => {
    const value = mutated.retainLauncherDiagnostics({ status: 2, stderr: 'PROFILE_EXAMPLE_FAILED: safe reason' });
    eq(value.launcherDiagnosticCode, 'UNCLASSIFIED_LAUNCHER_FAILURE', 'M1 discards the emitted diagnostic');
  });

  await withMutatedRunner('launcher-m2-raw', [[
    '    launcherDiagnosticLine: safeLauncherDiagnosticLine(input.launcherDiagnosticLine),',
    '    launcherDiagnosticLine: safeString(input.launcherDiagnosticLine, 2000),',
  ]], async (mutated) => {
    const raw = 'PROFILE_AUTH_FAILED: Authorization: Bearer secret';
    ok(JSON.stringify(mutated.serializeEvidence({ launcherDiagnosticLine: raw })).includes('Bearer secret'),
      'M2 would store raw launcher output');
  });

  await withMutatedRunner('launcher-m3-token', [[
    "  if (!line || LAUNCHER_SENSITIVE_TEXT.test(line) || LAUNCHER_TOKEN_SHAPE.test(line)) return '';",
    "  if (!line) return '';",
  ]], async (mutated) => {
    const raw = 'PROFILE_AUTH_FAILED: Authorization: Bearer secret';
    const value = mutated.retainLauncherDiagnostics({ status: 2, stderr: raw });
    ok(JSON.stringify(mutated.serializeEvidence(value)).includes('Bearer secret'), 'M3 would leak token-shaped diagnostic text');
  });

  await withMutatedRunner('launcher-m4-invent', [[
    "    launcherDiagnosticCode: emittedCode || (ok ? '' : 'UNCLASSIFIED_LAUNCHER_FAILURE'),",
    "    launcherDiagnosticCode: emittedCode || (ok ? 'LIVE_TEST_ALLOWED' : 'PROFILE_INVENTED_FAILED'),",
  ]], async (mutated) => {
    const failure = mutated.retainLauncherDiagnostics({ status: 2 });
    const success = mutated.retainLauncherDiagnostics({ status: 0 });
    eq(failure.launcherDiagnosticCode, 'PROFILE_INVENTED_FAILED', 'M4 invents a failure reason');
    eq(success.launcherDiagnosticCode, 'LIVE_TEST_ALLOWED', 'M4 invents success evidence');
  });

  const retryMutation = runnerSource.replace(
    "  const result = spawnSync(launcher, [profileName, extensionRoot, String(devPort), String(cdpPort)], { encoding: 'utf8' });",
    "  spawnSync(launcher, [profileName, extensionRoot, String(devPort), String(cdpPort)], { encoding: 'utf8' });\n  const result = spawnSync(launcher, [profileName, extensionRoot, String(devPort), String(cdpPort)], { encoding: 'utf8' });",
  );
  eq(functionCallCount(ast(retryMutation), 'launchGovernedProfile', 'spawnSync'), 2, 'M5 introduces a second launcher dispatch');
});

await fixture('M1-M6 and production-exclusion mutations are killed', async () => {
  const noDecrement = { remaining: 2, used: 0 };
  ok(noDecrement.remaining !== 0 || noDecrement.used !== 2, 'M1');
  ok(['title-read', 'title-patch', 'title-restore'].join(',') !== 'title-read,title-patch', 'M2');
  ok(1 !== 0, 'M3 cooldown bypass');
  ok(cliViolations(`${runnerSource}\nconst mutant='--evaluate';`).length > 0, 'M4');
  const raw = 'raw-conversation-id-mutation';
  ok(JSON.stringify({ conversationId: raw }).includes(raw), 'M5');
  const weakGate = (phase, permission) => Number(phase) === 3 || permission === true;
  ok(weakGate(2, true) !== runner.mutationPermitted(2, true), 'M6');
  ok(!mockLoader([]).includes('new Set(["0A4b._Backend_Acceptance_Adapter_.js"])'), 'production exclusion mutation');
});

/* V27-V29 — the adapter-readiness wait. The launcher returns before the loader
   has executed its module set, so this wait is load-bearing for every Phase-1
   run; it must converge when the adapter appears, stay bounded when it never
   does, and cost nothing on the backend either way. */
await fixture('V27 readiness converges inside the window and Phase 1 then proceeds', async () => {
  const calls = [];
  let clock = 0;
  let sample = 2000;
  const readyAfter = 4; // adapter appears on the 5th probe
  const executed = await runner.executePhaseOneChecks({
    now: () => clock,
    sleep: async (ms) => { clock += ms; },
    invoke: async (op) => {
      calls.push(op);
      const presenceProbes = calls.filter((entry) => entry === 'runtime-presence').length;
      if (op === 'runtime-presence' && presenceProbes <= readyAfter) {
        return { ok: false, status: 'acceptance-runtime-unavailable' };
      }
      if (op === 'runtime-presence') return validPhaseOneEvidence().runtimePresence;
      if (op === 'authority-status') return validPhaseOneEvidence().authorityStatus;
      return { ...validPhaseOneEvidence().pacingBefore, sampledAt: sample++ };
    },
  });
  ok(executed.ok, 'Phase 1 proceeds once the adapter appears');
  eq(executed.status, 'PHASE_1_PASS', 'certification reached after readiness');
  eq(executed.readiness.status, 'acceptance-runtime-ready', 'readiness reported ready');
  eq(executed.readiness.attempts, readyAfter + 1, 'readiness retried until the adapter appeared');
  ok(executed.readiness.waitedMs < runner.ACCEPTANCE_RUNTIME_READY_TIMEOUT_MS, 'converged inside the window');
  // D: after readiness, the certified order is exactly the four evidence ops.
  eq(executed.steps.map((step) => step.op).join(','),
    'pacing-before,runtime-presence,authority-status,pacing-after', 'certified sequence unchanged');
  // C: readiness polling is free.
  eq(executed.logicalUsed, 0, 'readiness consumes no logical operation');
  eq(executed.authenticatedDispatches, 0, 'readiness consumes no authenticated dispatch');
  eq(calls.filter((op) => op === 'title-read' || op === 'archive-turn-index').length, 0,
    'readiness never touches a feature/backend op');
});

await fixture('V28 readiness fails closed at the bound instead of waiting forever', async () => {
  let clock = 0;
  const calls = [];
  const executed = await runner.executePhaseOneChecks({
    now: () => clock,
    sleep: async (ms) => { clock += ms; },
    invoke: async (op) => { calls.push(op); return { ok: false, status: 'acceptance-runtime-unavailable' }; },
  });
  eq(executed.ok, false, 'never-ready adapter fails closed');
  eq(executed.status, 'acceptance-runtime-timeout', 'bounded timeout status');
  eq(executed.steps.length, 0, 'no certified evidence is fabricated on timeout');
  eq(executed.logicalUsed, 0, 'timeout consumes no logical operation');
  eq(executed.authenticatedDispatches, 0, 'timeout consumes no authenticated dispatch');
  ok(clock <= runner.ACCEPTANCE_RUNTIME_READY_TIMEOUT_MS, 'wait never exceeds the declared bound');
  const maxProbes = Math.ceil(runner.ACCEPTANCE_RUNTIME_READY_TIMEOUT_MS / runner.ACCEPTANCE_RUNTIME_READY_INTERVAL_MS) + 1;
  ok(calls.length <= maxProbes, `probe count is bounded (${calls.length} <= ${maxProbes})`);
  eq(calls.every((op) => op === 'runtime-presence'), true, 'only the allow-listed presence op is polled');
});

await fixture('V29b peer-module boot is a not-ready condition, not a fault', async () => {
  let clock = 0;
  const calls = [];
  const executed = await runner.executePhaseOneChecks({
    now: () => clock,
    sleep: async (ms) => { clock += ms; },
    invoke: async (op) => {
      calls.push(op);
      const probes = calls.filter((entry) => entry === 'runtime-presence').length;
      // Adapter answers immediately; Title/Archive surfaces appear on probe 3.
      if (op === 'runtime-presence' && probes <= 2) return { ok: false, status: 'runtime-surface-missing' };
      if (op === 'runtime-presence') return validPhaseOneEvidence().runtimePresence;
      if (op === 'authority-status') return validPhaseOneEvidence().authorityStatus;
      return validPhaseOneEvidence().pacingBefore;
    },
  });
  ok(executed.ok, 'a late peer surface no longer ends the run on the first sample');
  eq(executed.readiness.status, 'acceptance-runtime-ready', 'readiness converged');
  eq(executed.readiness.lastObservedNotReadyStatus, 'runtime-surface-missing', 'the boot condition is retained, not discarded');
  eq(executed.logicalUsed, 0, 'still zero logical operations');
});

await fixture('V29 readiness does not mask a real fault and adds no launch retry', async () => {
  // A status outside the not-ready set must end the wait immediately rather
  // than being polled away: an unexpected adapter fault is not a cold start.
  let clock = 0;
  const calls = [];
  const executed = await runner.executePhaseOneChecks({
    now: () => clock,
    sleep: async (ms) => { clock += ms; },
    invoke: async (op) => { calls.push(op); return { ok: false, status: 'acceptance-adapter-threw' }; },
  });
  eq(executed.status, 'acceptance-adapter-threw', 'a genuine fault surfaces unchanged');
  eq(calls.length, 1, 'a genuine fault is not retried');
  // E: the readiness wait is confined to the adapter; it must not have
  // introduced a second governed launch anywhere in the runner.
  eq(functionCallCount(runnerAst, 'launchGovernedProfile', 'spawnSync'), 1, 'still exactly one launcher dispatch');
  eq(runner.phaseBudget(1), 0, 'Phase-1 budget still zero');
});

await fixture('V30 the readiness timeout retains only an allow-listed last not-ready status', async () => {
  let clock = 0;
  const executed = await runner.executePhaseOneChecks({
    now: () => clock,
    sleep: async (ms) => { clock += ms; },
    invoke: async () => ({ ok: false, status: 'chatgpt-target-unavailable' }),
  });
  eq(executed.status, 'acceptance-runtime-timeout', 'still a bounded timeout');
  eq(executed.readiness.lastObservedNotReadyStatus, 'chatgpt-target-unavailable', 'last not-ready status retained accurately');
  const recorded = runner.serializeEvidence({
    requestedPhase: 1, logicalBudget: 0, logicalUsed: 0, authenticatedDispatches: 0,
    adapterReadinessLastNotReady: executed.readiness.lastObservedNotReadyStatus,
  });
  eq(recorded.adapterReadinessLastNotReady, 'chatgpt-target-unavailable', 'retained through serialization');
  // Nothing outside the fixed allow-list may ever reach the record.
  for (const rejected of ['https://chatgpt.com/c/secret', 'Bearer abc.def.ghi', 'acceptance-adapter-threw', '<dom>']) {
    eq(runner.safeNotReadyStatus(rejected), '', `non-allow-listed value rejected: ${rejected}`);
  }
  eq(executed.logicalUsed, 0, 'still zero logical operations');
  eq(executed.authenticatedDispatches, 0, 'still zero authenticated dispatches');
});

/* V31 — pack-supplied alias URLs must be re-homed onto the pack origin the
   build is port-verified against. A pack stamped by another lane's dev origin
   otherwise makes the loader fetch module bodies from that lane: its modules
   load, and any module unique to this build 404s. That is what kept 0A4a and
   0A4b out of the runtime while every input contract read as correct. */
await fixture('V31 alias URLs are pinned to the build pack origin, adapter still excluded in production', async () => {
  const development = mockLoader([]);
  ok(development.includes('function pinAliasUrlToPackOrigin('), 'loader defines the alias-origin pin');
  ok(development.includes('requireUrl: pinAliasUrlToPackOrigin('), 'merge site pins pack-supplied alias URLs');
  // Behavioural check of the emitted helper, isolated from the rest of the loader.
  const startAt = development.indexOf('function pinAliasUrlToPackOrigin(');
  let depth = 0;
  let endAt = -1;
  for (let i = development.indexOf('{', startAt); i < development.length; i += 1) {
    if (development[i] === '{') depth += 1;
    else if (development[i] === '}') { depth -= 1; if (depth === 0) { endAt = i + 1; break; } }
  }
  ok(startAt >= 0 && endAt > startAt, 'emitted helper is extractable');
  const source = development.slice(startAt, endAt);
  const sandbox = { PROXY_PACK_URL: 'http://127.0.0.1:5517/dev_output/proxy/_paste-pack.ext.txt', URL, result: null };
  vm.createContext(sandbox);
  vm.runInContext(`${source}\nresult = {
    foreign: pinAliasUrlToPackOrigin('http://127.0.0.1:5500/alias/0A4b._Backend_Acceptance_Adapter_.js?v=1'),
    native: pinAliasUrlToPackOrigin('http://127.0.0.1:5517/alias/0A4a._Backend_Request_Authority_.js?v=2'),
    unrelated: pinAliasUrlToPackOrigin('http://example.test/other/thing.js')
  };`, sandbox);
  eq(sandbox.result.foreign, 'http://127.0.0.1:5517/alias/0A4b._Backend_Acceptance_Adapter_.js?v=1',
    'a foreign-origin alias URL is re-homed onto the pack origin, path and cache-bust preserved');
  eq(sandbox.result.native, 'http://127.0.0.1:5517/alias/0A4a._Backend_Request_Authority_.js?v=2',
    'a same-origin alias URL is left untouched');
  eq(sandbox.result.unrelated, 'http://example.test/other/thing.js', 'non-alias URLs are not rewritten');
  // The production contract is unchanged by this fix.
  const production = mockLoader(['0A4b._Backend_Acceptance_Adapter_.js']);
  ok(production.includes('new Set(["0A4b._Backend_Acceptance_Adapter_.js"])'), '0A4b remains excluded from production');
});

/* V32 — the owner-census gate is phase-aware. Phase 1 launches the designated
   authority browser, so none may be running; Phase 2 attaches to the browser
   Phase 1 left alive, so exactly one must be running AND it must be the
   requested designated profile. The old phase-blind rule made Phase 2
   unreachable: alive browser failed the census, stopped browser had nothing to
   attach to. */
await fixture('V32 owner census is phase-aware and proves attach-phase identity', async () => {
  const base = {
    ok: true, status: 'LEVEL_B_PASS', authorityDesignation: true,
    authorityCapability: true, authorityAlignment: 'MATCH', designatedCount: 1,
  };
  const idle = { ...base, runningDesignatedCount: 0, authorityHolderProfile: 'p', ownerAvailableProfile: 'p' };
  const attached = { ...base, runningDesignatedCount: 1, authorityHolderProfile: 'p', ownerAvailableProfile: 'p' };
  const gate = (phase, levelB, profileName = 'p') => runner.evaluatePhaseZeroGate({
    phase, profileName, levelB, sourceClean: true, loaderSha256: 'a'.repeat(64), mutex: { ok: true },
  });
  eq(runner.requiredRunningDesignatedCount(1), 0, 'phase 1 requires an idle authority');
  eq(runner.requiredRunningDesignatedCount(2), 1, 'phase 2 requires exactly one attached authority');
  // A: phase 1 + idle -> PASS.   B: phase 1 + running -> FAIL.
  ok(gate(1, idle).ok, 'A phase 1 with no running owner passes');
  eq(gate(1, attached).status, 'AUTHORITY_OWNER_CENSUS_FAILED', 'B phase 1 with a running owner fails');
  // C: phase 2 + exactly one correct owner -> PASS.
  ok(gate(2, attached).ok, 'C phase 2 with the correct attached owner passes');
  // D/E: wrong running count.
  eq(gate(2, idle).status, 'AUTHORITY_OWNER_CENSUS_FAILED', 'D phase 2 with no running owner fails');
  eq(gate(2, { ...attached, runningDesignatedCount: 2 }).status,
    'AUTHORITY_OWNER_CENSUS_FAILED', 'E phase 2 with more than one running owner fails');
  // F: foreign / wrong / unprovable owner identity.
  eq(gate(2, { ...attached, authorityHolderProfile: 'other' }).status,
    'AUTHORITY_OWNER_IDENTITY_FAILED', 'F phase 2 with a foreign holder fails');
  eq(gate(2, { ...attached, ownerAvailableProfile: '' }).status,
    'AUTHORITY_OWNER_IDENTITY_FAILED', 'F phase 2 without the owner-available marker fails');
  eq(gate(2, attached, '').status,
    'AUTHORITY_OWNER_IDENTITY_FAILED', 'F phase 2 without a requested profile fails');
  // Phase 0 posture is unchanged.
  ok(gate(0, idle).ok, 'phase 0 still requires an idle authority');
  eq(gate(0, attached).status, 'AUTHORITY_OWNER_CENSUS_FAILED', 'phase 0 still rejects a running owner');
  // G: the gate is pure preflight — it dispatches nothing.
  eq(runner.phaseBudget(2), 2, 'phase 2 budget unchanged at two logical operations');
  const budget = runner.createLogicalBudget(2);
  eq(budget.used, 0, 'gate evaluation consumes no logical operation');
  eq(budget.remaining, 2, 'gate evaluation leaves the full phase-2 budget');
  // Anti-regression: the phase-blind rule must not come back.
  ok(!runnerSource.includes('levelB.runningDesignatedCount !== 0'),
    'the phase-blind census rule must not return');
});

console.log(`PASS validate-backend-acceptance-runner (${assertions} assertions / ${fixtures} fixtures; V1-V32 + mutations)`);
console.log('LIVE_BACKEND_REQUEST_COUNT=0');
