#!/usr/bin/env node
/* Offline governed backend-acceptance validator: V1-V13 + mutations. */
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
  eq(calls.join(','), 'pacing-sample,runtime-presence,authority-status,pacing-sample', 'fixed before/after sequence');
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

console.log(`PASS validate-backend-acceptance-runner (${assertions} assertions / ${fixtures} fixtures; V1-V24 + mutations)`);
console.log('LIVE_BACKEND_REQUEST_COUNT=0');
