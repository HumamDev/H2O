#!/usr/bin/env node
// Validator for C5.1/C5.2 saved-chat archive diagnostics.
//
// This check keeps the diagnostics lane read-only: package inventory and
// manifest/snapshot/hash validation under AppLocalData archive/packages only.

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..', '..', '..');

const MODULE_REL = 'src-surfaces-base/studio/ingestion/saved-chat-archive-diagnostics.tauri.js';
const STUDIO_HTML_REL = 'src-surfaces-base/studio/studio.html';
const PACK_STUDIO_REL = 'tools/product/studio/pack-studio.mjs';
const CAPABILITY_REL = 'apps/studio/desktop/src-tauri/capabilities/archive-cas.json';

const APP_LOCAL_DATA = 15;
const PACKAGE_ROOT = 'archive/packages';
const MODULE_NAME = 'saved-chat-archive-diagnostics.tauri.js';

const PASS = [];
const FAIL = [];

function readRepo(rel) {
  return fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
}

function check(label, fn) {
  try {
    fn();
    PASS.push(label);
    console.log(`  PASS ${label}`);
  } catch (err) {
    const message = err && err.message ? err.message : String(err);
    FAIL.push({ label, message });
    console.log(`  FAIL ${label}`);
    console.log(`       ${message}`);
  }
}

async function checkAsync(label, fn) {
  try {
    await fn();
    PASS.push(label);
    console.log(`  PASS ${label}`);
  } catch (err) {
    const message = err && err.message ? err.message : String(err);
    FAIL.push({ label, message });
    console.log(`  FAIL ${label}`);
    console.log(`       ${message}`);
  }
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) {
      if (typeof value[key] !== 'undefined') out[key] = canonicalize(value[key]);
    }
    return out;
  }
  return value;
}

function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

function sha256Prefixed(value) {
  return `sha256-${crypto.createHash('sha256').update(Buffer.from(value)).digest('hex')}`;
}

function encode(text) {
  return new TextEncoder().encode(text);
}

function makePackage({ chatId, snapshotId, schemaVersion, assetSha }) {
  const snapshot = {
    schema: 'h2o.savedChatSnapshot',
    schemaVersion,
    chatId,
    snapshotId,
    title: schemaVersion === 2 ? 'Archive diagnostics v2' : 'Archive diagnostics v1',
    capturedAt: '2026-06-24T00:00:00.000Z',
    messages: schemaVersion === 2
      ? [{ index: 0, role: 'assistant', contentText: 'image', assetRefs: [{ sha256: assetSha, path: `assets/${assetSha}.png` }] }]
      : [{ index: 0, role: 'assistant', contentText: 'plain' }],
  };
  const snapshotText = canonicalJson(snapshot);
  const snapshotSha = sha256Prefixed(snapshotText);
  const assets = schemaVersion === 2 ? [{ sha256: assetSha, path: `assets/${assetSha}.png`, ext: 'png', mimeType: 'image/png', byteLength: 5 }] : [];
  const contentHash = schemaVersion === 2
    ? sha256Prefixed(canonicalJson({ snapshot: snapshotSha, assets: assets.map((asset) => asset.sha256).sort() }))
    : snapshotSha;
  const manifest = {
    schema: 'h2o.savedChatPackage',
    schemaVersion,
    chatId,
    snapshotId,
    contentHash,
    files: {
      snapshot: { path: 'snapshot.json', sha256: snapshotSha, byteLength: encode(snapshotText).byteLength },
      markdown: { path: 'chat.md', sha256: sha256Prefixed(`# ${chatId}\n`), byteLength: encode(`# ${chatId}\n`).byteLength },
      html: { path: 'chat.html', sha256: sha256Prefixed('<!doctype html>'), byteLength: encode('<!doctype html>').byteLength },
    },
    assets,
  };
  if (schemaVersion === 2) manifest.payloadVersion = 2;
  return {
    manifestText: canonicalJson(manifest),
    snapshotText,
    manifest,
    snapshot,
  };
}

function createFixtureFs({ missingRoot = false } = {}) {
  const dirs = new Set();
  const files = new Map();
  const readCalls = [];
  const mutationCalls = [];
  const v1 = makePackage({ chatId: 'chat_diag_v1', snapshotId: 'snap_diag_v1', schemaVersion: 1 });
  const assetSha = 'sha256-abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789';
  const v2 = makePackage({ chatId: 'chat_diag_v2', snapshotId: 'snap_diag_v2', schemaVersion: 2, assetSha });
  const bad = makePackage({ chatId: 'chat_diag_bad', snapshotId: 'snap_diag_bad', schemaVersion: 1 });

  function addDir(p) { dirs.add(p); }
  function addFile(p, text) { files.set(p, encode(text)); }
  function addPackage(chatId, pkg, { omitHtml = false } = {}) {
    const dir = `${PACKAGE_ROOT}/${chatId}.h2ochat`;
    addDir(dir);
    addFile(`${dir}/manifest.json`, pkg.manifestText);
    addFile(`${dir}/snapshot.json`, pkg.snapshotText);
    addFile(`${dir}/chat.md`, `# ${chatId}\n`);
    if (!omitHtml) addFile(`${dir}/chat.html`, '<!doctype html>');
    if (pkg.manifest.assets.length) addDir(`${dir}/assets`);
    return dir;
  }

  if (!missingRoot) {
    addDir(PACKAGE_ROOT);
    addPackage('chat_diag_v1', v1);
    addPackage('chat_diag_v2', v2);
    addPackage('chat_diag_bad', bad, { omitHtml: true });
    addDir(`${PACKAGE_ROOT}/not_a_package`);
    addFile(`${PACKAGE_ROOT}/loose.txt`, 'not a package');
  }

  const entries = [
    { name: 'chat_diag_v1.h2ochat', isDirectory: true },
    { name: 'chat_diag_v2.h2ochat', isDirectory: true },
    { name: 'chat_diag_bad.h2ochat', isDirectory: true },
    { name: 'not_a_package', isDirectory: true },
    { name: 'loose.txt', isFile: true },
  ];

  async function invoke(cmd, args) {
    const p = args && args.path;
    const options = args && args.options ? args.options : {};
    if (cmd === 'plugin:fs|write_file' || cmd === 'plugin:fs|write_text_file' || cmd === 'plugin:fs|mkdir' || cmd === 'plugin:fs|remove' || cmd === 'plugin:fs|rename') {
      mutationCalls.push({ cmd, path: p, baseDir: options.baseDir });
      throw new Error(`mutation command forbidden in diagnostics validator: ${cmd}`);
    }
    assert.equal(options.baseDir, APP_LOCAL_DATA, `${cmd} must use AppLocalData baseDir 15`);
    assert.ok(!String(p || '').includes('H2O Studio Sync'), `${cmd} must not touch Sync folder paths`);
    readCalls.push({ cmd, path: p, baseDir: options.baseDir });
    if (cmd === 'plugin:fs|exists') return dirs.has(p) || files.has(p);
    if (cmd === 'plugin:fs|read_dir') {
      if (!dirs.has(p)) throw new Error(`not found: ${p}`);
      return entries;
    }
    if (cmd === 'plugin:fs|read_file') {
      if (!files.has(p)) throw new Error(`not found: ${p}`);
      return files.get(p);
    }
    throw new Error(`unexpected command: ${cmd}`);
  }

  return {
    invoke,
    readCalls,
    mutationCalls,
    paths: {
      v1: `${PACKAGE_ROOT}/chat_diag_v1.h2ochat`,
      v2: `${PACKAGE_ROOT}/chat_diag_v2.h2ochat`,
      bad: `${PACKAGE_ROOT}/chat_diag_bad.h2ochat`,
    },
  };
}

function loadModule(fixture) {
  const context = {
    console,
    TextEncoder,
    TextDecoder,
    Uint8Array,
    ArrayBuffer,
    crypto: globalThis.crypto || crypto.webcrypto,
    setTimeout,
    __TAURI_INTERNALS__: { invoke: fixture.invoke },
    H2O: { Studio: { ingestion: {} } },
  };
  context.globalThis = context;
  context.window = context;
  const sandbox = vm.createContext(context);
  vm.runInContext(readRepo(MODULE_REL), sandbox, { filename: MODULE_REL });
  return sandbox.H2O.Studio.ingestion;
}

const moduleSource = readRepo(MODULE_REL);
const studioHtml = readRepo(STUDIO_HTML_REL);
const packStudio = readRepo(PACK_STUDIO_REL);
const capability = JSON.parse(readRepo(CAPABILITY_REL));

console.log('[saved-chat-archive-diagnostics-v1] static checks');

check('module file exists', () => {
  assert.ok(fs.existsSync(path.join(REPO_ROOT, MODULE_REL)));
});

check('module registers required H2O.Studio.ingestion APIs', () => {
  for (const apiName of [
    'diagnoseSavedChatArchiveCapabilitiesV1',
    'listSavedChatArchivePackagesV1',
    'validateSavedChatPackageV1',
    'diagnoseSavedChatArchiveV1',
  ]) {
    assert.match(moduleSource, new RegExp(`H2O\\.Studio\\.ingestion\\.${apiName}`));
  }
});

check('module is Desktop/Tauri gated', () => {
  assert.match(moduleSource, /function detectTauri/);
  assert.match(moduleSource, /__TAURI_INTERNALS__/);
  assert.match(moduleSource, /if \(!detectTauri\(\)\) return/);
});

check('module uses AppLocalData baseDir 15 and archive/packages root', () => {
  assert.match(moduleSource, /APP_LOCAL_DATA\s*=\s*15/);
  assert.match(moduleSource, /PACKAGE_ROOT\s*=\s*'archive\/packages'/);
});

check('module has v1 and v2 contentHash validation logic', () => {
  assert.match(moduleSource, /diag\.schemaVersion === 1/);
  assert.match(moduleSource, /diag\.schemaVersion === 2/);
  assert.match(moduleSource, /canonicalJson\(\{ snapshot: fileSnapshotSha, assets: assetShas \}\)/);
  assert.match(moduleSource, /sha256Prefixed/);
});

check('module treats missing archive root as empty warning, not blocker', () => {
  assert.match(moduleSource, /archive-packages-root-missing/);
  assert.match(moduleSource, /return setAggregateStatus\(result, true\)/);
});

check('module contains no mutation filesystem commands', () => {
  for (const forbidden of [
    'plugin:fs|write_file',
    'plugin:fs|write_text_file',
    'plugin:fs|mkdir',
    'plugin:fs|remove',
    'plugin:fs|rename',
  ]) {
    assert.ok(!moduleSource.includes(forbidden), `forbidden command present: ${forbidden}`);
  }
});

check('module does not implement DB, CAS, Sync, Chrome, import, or export reconciliation', () => {
  for (const forbidden of [
    'H2O.Studio.store',
    'assetCas.',
    'putAssetBytes',
    'getAssetBytes',
    'H2O.Studio.sync',
    'H2O Studio Sync',
    'importSavedChat',
    'recoverSavedChat',
    'writeSavedChatPackageV1',
  ]) {
    assert.ok(!moduleSource.includes(forbidden), `forbidden coupling present: ${forbidden}`);
  }
});

check('studio.html loads archive diagnostics module', () => {
  assert.ok(studioHtml.includes(`./ingestion/${MODULE_NAME}`));
});

check('pack-studio includes archive diagnostics module', () => {
  const count = (packStudio.match(new RegExp(`ingestion/${MODULE_NAME}`, 'g')) || []).length;
  assert.ok(count >= 2, `expected source and mirror pack entries, got ${count}`);
});

check('capability grants narrow read-dir under AppLocalData archive/packages', () => {
  const readDir = capability.permissions.find((entry) => entry.identifier === 'fs:allow-read-dir');
  assert.ok(readDir, 'fs:allow-read-dir missing');
  const paths = readDir.allow.map((entry) => entry.path).sort();
  assert.deepEqual(paths, [
    '$APPLOCALDATA/archive/packages',
    '$APPLOCALDATA/archive/packages/**',
  ]);
  for (const permission of capability.permissions) {
    for (const allow of permission.allow || []) {
      assert.ok(!String(allow.path || '').includes('$HOME'), `broad home path found: ${allow.path}`);
      assert.ok(!String(allow.path || '').includes('H2O Studio Sync'), `sync folder path found: ${allow.path}`);
    }
  }
});

console.log('[saved-chat-archive-diagnostics-v1] fixture checks');

await checkAsync('APIs register in Tauri VM context', async () => {
  const fixture = createFixtureFs();
  const ingestion = loadModule(fixture);
  assert.equal(typeof ingestion.diagnoseSavedChatArchiveCapabilitiesV1, 'function');
  assert.equal(typeof ingestion.listSavedChatArchivePackagesV1, 'function');
  assert.equal(typeof ingestion.validateSavedChatPackageV1, 'function');
  assert.equal(typeof ingestion.diagnoseSavedChatArchiveV1, 'function');
});

await checkAsync('capability diagnostic reports read-only Desktop archive scope', async () => {
  const fixture = createFixtureFs();
  const ingestion = loadModule(fixture);
  const result = ingestion.diagnoseSavedChatArchiveCapabilitiesV1();
  assert.equal(result.installed, true);
  assert.equal(result.desktopOnly, true);
  assert.equal(result.readOnly, true);
  assert.equal(result.baseDir, APP_LOCAL_DATA);
  assert.equal(result.roots.packages, PACKAGE_ROOT);
  assert.equal(result.boundaries.dbChecks, false);
  assert.equal(result.boundaries.casChecks, false);
  assert.equal(result.boundaries.sync, false);
  assert.equal(result.boundaries.chrome, false);
  assert.equal(result.boundaries.ui, false);
});

await checkAsync('missing archive root returns empty warning without blocker', async () => {
  const fixture = createFixtureFs({ missingRoot: true });
  const ingestion = loadModule(fixture);
  const result = await ingestion.listSavedChatArchivePackagesV1();
  assert.equal(result.status, 'empty');
  assert.equal(result.ok, false);
  assert.equal(result.blockers.length, 0);
  assert.ok(result.warnings.some((issue) => issue.code === 'archive-packages-root-missing'));
  assert.equal(result.packages.length, 0);
});

await checkAsync('inventory lists package folders and warns on non-package entries', async () => {
  const fixture = createFixtureFs();
  const ingestion = loadModule(fixture);
  const result = await ingestion.listSavedChatArchivePackagesV1({ limit: 20 });
  assert.equal(result.packages.length, 3);
  assert.ok(result.packages.some((pkg) => pkg.packageDirName === 'chat_diag_v1.h2ochat'));
  assert.ok(result.packages.some((pkg) => pkg.packageDirName === 'chat_diag_v2.h2ochat'));
  assert.ok(result.warnings.some((issue) => issue.code === 'archive-entry-not-package'));
  assert.ok(result.warnings.some((issue) => issue.code === 'archive-entry-not-directory'));
  assert.equal(fixture.mutationCalls.length, 0);
});

await checkAsync('v1 package validation passes snapshot and content hash checks', async () => {
  const fixture = createFixtureFs();
  const ingestion = loadModule(fixture);
  const result = await ingestion.validateSavedChatPackageV1({ packagePath: fixture.paths.v1 });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'ok');
  assert.equal(result.schemaVersion, 1);
  assert.equal(result.hashChecks.snapshotShaOk, true);
  assert.equal(result.hashChecks.contentHashOk, true);
});

await checkAsync('v2 package validation uses locked descriptor content hash', async () => {
  const fixture = createFixtureFs();
  const ingestion = loadModule(fixture);
  const result = await ingestion.validateSavedChatPackageV1({ packagePath: fixture.paths.v2 });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'ok');
  assert.equal(result.schemaVersion, 2);
  assert.equal(result.payloadVersion, 2);
  assert.equal(result.hashChecks.snapshotShaOk, true);
  assert.equal(result.hashChecks.contentHashOk, true);
  assert.match(result.hashChecks.expectedContentHash, /^sha256-[0-9a-f]{64}$/);
});

await checkAsync('missing renderer file blocks package validation', async () => {
  const fixture = createFixtureFs();
  const ingestion = loadModule(fixture);
  const result = await ingestion.validateSavedChatPackageV1({ packagePath: fixture.paths.bad });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'blocked');
  assert.ok(result.blockers.some((issue) => issue.code === 'html-missing'));
});

await checkAsync('aggregate diagnostic returns partial for mixed package health', async () => {
  const fixture = createFixtureFs();
  const ingestion = loadModule(fixture);
  const result = await ingestion.diagnoseSavedChatArchiveV1({ limit: 20 });
  assert.equal(result.status, 'partial');
  assert.equal(result.counts.packagesTotal, 3);
  assert.equal(result.counts.packagesOk, 2);
  assert.equal(result.counts.packagesBlocked, 1);
  assert.equal(result.counts.v1, 2);
  assert.equal(result.counts.v2, 1);
  assert.equal(fixture.mutationCalls.length, 0);
});

if (FAIL.length) {
  console.error(`\n[saved-chat-archive-diagnostics-v1] ${FAIL.length} failed, ${PASS.length} passed`);
  process.exitCode = 1;
} else {
  console.log(`\n[saved-chat-archive-diagnostics-v1] all ${PASS.length} checks passed`);
}
