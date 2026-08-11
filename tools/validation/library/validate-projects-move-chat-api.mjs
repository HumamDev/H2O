#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), '../../..');
const ownerPath = path.join(repoRoot, 'src-runtime-base/0F2a.⬛️🗂️ Projects 🗂️.js');
const source = fs.readFileSync(ownerPath, 'utf8');

function extractFunction(name) {
  const marker = `function ${name}(`;
  const start = source.indexOf(marker);
  assert.ok(start >= 0, `${name} declaration missing`);
  const open = source.indexOf('{', start);
  assert.ok(open >= 0, `${name} body missing`);
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    else if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`${name} body is unterminated`);
}

assert.match(
  source,
  /MOD\.moveChatToProject\s*=\s*\(\.\.\.args\)\s*=>\s*owner\.moveChatToProject\(\.\.\.args\)/,
  'H2O.Projects.moveChatToProject public facade must exist'
);
assert.match(
  source,
  /moveChatToProject\(input\s*=\s*\{\}\)\s*\{\s*return PROJECTS_moveChatToProject\(input\);\s*\}/,
  'Projects owner/service must expose moveChatToProject'
);
assert.match(source, /PROJECTS_nativeTargetIdentityMatches/, 'native project choice must use an identity matcher');
assert.match(source, /PROJECTS_loadRowsFast\(\)\.filter/, 'project target must resolve through canonical Projects rows');
assert.match(source, /data-project-id/, 'native project identity may use data-project-id');
assert.match(source, /PROJECTS_idFromHref\(path\)/, 'native project identity must use the canonical project href ID');
assert.match(source, /PROJECTS_waitForDom\(\s*\(\) => PROJECTS_isChatInProject/, 'native success must wait for canonical assignment evidence');

const sandbox = { Map, Promise, String };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(
  `${extractFunction('PROJECTS_moveChatToProjectWithDeps')}\n` +
  'globalThis.moveChatToProjectWithDeps = PROJECTS_moveChatToProjectWithDeps;',
  sandbox,
  { filename: ownerPath }
);
const move = sandbox.moveChatToProjectWithDeps;
assert.equal(typeof move, 'function', 'test seam must load');

function baseDeps(overrides = {}) {
  return {
    normalizeChatId: (value) => String(value || '').trim(),
    resolveProject: (value) => value === 'project-1'
      ? { ok: true, status: 'ok', project: { id: 'project-1', href: '/g/project-1/project' } }
      : { ok: false, status: 'project-not-found', project: null },
    isAlreadyInProject: () => false,
    executePersistentMove: async () => ({ ok: true, status: 'moved' }),
    refreshProjectState: async () => ({ ok: true }),
    inFlight: new Map(),
    ...overrides,
  };
}

{
  let resolved = 0;
  let executed = 0;
  const result = await move({ chatId: '', projectId: 'project-1' }, baseDeps({
    normalizeChatId: () => '',
    resolveProject: () => { resolved += 1; return { ok: true, project: { id: 'project-1' } }; },
    executePersistentMove: async () => { executed += 1; return { ok: true }; },
  }));
  assert.equal(result.ok, false, 'invalid chatId fails closed');
  assert.equal(result.status, 'invalid-chat-id');
  assert.equal(resolved, 0, 'invalid chatId cannot reach project authority');
  assert.equal(executed, 0, 'invalid chatId cannot mutate');
}

{
  let executed = 0;
  const result = await move({ chatId: 'chat-1', projectId: 'bad/project' }, baseDeps({
    resolveProject: () => ({ ok: false, status: 'invalid-project-id' }),
    executePersistentMove: async () => { executed += 1; return { ok: true }; },
  }));
  assert.equal(result.ok, false, 'syntactically invalid projectId fails closed');
  assert.equal(result.status, 'invalid-project-id');
  assert.equal(executed, 0, 'invalid project identity cannot mutate');
}

{
  let executed = 0;
  const result = await move({ chatId: 'chat-1', projectId: 'missing' }, baseDeps({
    executePersistentMove: async () => { executed += 1; return { ok: true }; },
  }));
  assert.equal(result.ok, false, 'invalid/unknown projectId fails closed');
  assert.equal(result.status, 'project-not-found');
  assert.equal(executed, 0, 'unknown project cannot mutate');
}

{
  const lookedUp = [];
  const result = await move({ chatId: 'chat-1', projectId: 'project-1' }, baseDeps({
    resolveProject: (projectId) => {
      lookedUp.push(projectId);
      return { ok: true, project: { id: projectId, href: `/g/${projectId}/project` } };
    },
  }));
  assert.equal(result.ok, true);
  assert.deepEqual(lookedUp, ['project-1'], 'canonical project resolver receives the requested ID exactly');
}

{
  let release;
  const confirmation = new Promise((resolve) => { release = resolve; });
  let executeCalls = 0;
  let refreshCalls = 0;
  const deps = baseDeps({
    executePersistentMove: async () => { executeCalls += 1; return confirmation; },
    refreshProjectState: async () => { refreshCalls += 1; },
  });
  const first = move({ chatId: 'chat-1', projectId: 'project-1' }, deps);
  const duplicate = move({ chatId: 'chat-1', projectId: 'project-1' }, deps);
  assert.equal(first, duplicate, 'concurrent duplicate submissions share one Promise');
  let settled = false;
  first.finally(() => { settled = true; });
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(settled, false, 'success is not returned before persistence confirmation');
  assert.equal(refreshCalls, 0, 'Project state is not refreshed before persistence confirmation');
  release({ ok: true, status: 'moved' });
  const result = await first;
  assert.equal(result.ok, true);
  assert.equal(executeCalls, 1, 'persistent move primitive is called exactly once');
  assert.equal(refreshCalls, 1, 'successful persistence triggers established Project refresh');
}

{
  let refreshCalls = 0;
  const result = await move({ chatId: 'chat-1', projectId: 'project-1' }, baseDeps({
    executePersistentMove: async () => ({ ok: false, status: 'persistence-unconfirmed', error: 'no receipt' }),
    refreshProjectState: async () => { refreshCalls += 1; },
  }));
  assert.equal(result.ok, false, 'failed persistence returns ok:false');
  assert.equal(result.status, 'persistence-unconfirmed');
  assert.equal(refreshCalls, 0, 'failed persistence cannot publish a Project refresh');
}

{
  let executeCalls = 0;
  let refreshCalls = 0;
  const result = await move({ chatId: 'chat-1', projectId: 'project-1' }, baseDeps({
    isAlreadyInProject: () => true,
    executePersistentMove: async () => { executeCalls += 1; return { ok: true }; },
    refreshProjectState: async () => { refreshCalls += 1; },
  }));
  assert.equal(result.ok, true, 'already-in-project is a successful no-op');
  assert.equal(result.status, 'already-in-project');
  assert.equal(executeCalls, 0, 'already-in-project does not mutate');
  assert.equal(refreshCalls, 0, 'already-in-project does not refresh unnecessarily');
}

{
  let resolvedProjectId = '';
  let receivedSource = 'unset';
  const result = await move({
    chatId: 'chat-1',
    projectId: 'project-1',
    source: { projectId: 'attacker-project', authority: true },
  }, baseDeps({
    resolveProject: (projectId) => {
      resolvedProjectId = projectId;
      return { ok: true, project: { id: projectId, href: `/g/${projectId}/project` } };
    },
    executePersistentMove: async ({ source: provenance }) => {
      receivedSource = provenance;
      return { ok: true, status: 'moved' };
    },
  }));
  assert.equal(result.ok, true);
  assert.equal(resolvedProjectId, 'project-1', 'source metadata cannot replace canonical target authority');
  assert.equal(receivedSource, '', 'non-string source metadata is discarded');
}

console.log('validate-projects-move-chat-api: ok');
