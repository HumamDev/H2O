#!/usr/bin/env node
// Validator for C5.1-C5.3 saved-chat archive diagnostics.
//
// This check keeps the diagnostics lane read-only: package inventory and
// manifest/snapshot/hash/asset validation under AppLocalData archive/packages
// only, plus optional read-only live CAS presence comparison.

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

const ASSET_BYTES = Buffer.from('archive-diagnostic-asset');
const ASSET_SHA = sha256Prefixed(ASSET_BYTES);
const ASSET_PATH = `assets/${ASSET_SHA}.png`;

function makePackage({ chatId, snapshotId, schemaVersion, assetSha = ASSET_SHA, dataImageResidue = false }) {
  const assetPath = `assets/${assetSha}.png`;
  const htmlRef = dataImageResidue ? 'data:image/png;base64,AAAA' : assetPath;
  const snapshot = {
    schema: 'h2o.savedChatSnapshot',
    schemaVersion,
    chatId,
    snapshotId,
    title: schemaVersion === 2 ? 'Archive diagnostics v2' : 'Archive diagnostics v1',
    capturedAt: '2026-06-24T00:00:00.000Z',
    messages: schemaVersion === 2
      ? [{ index: 0, role: 'assistant', contentText: 'image', contentHtml: `<p><img src="${htmlRef}"></p>`, assetRefs: [assetSha] }]
      : [{ index: 0, role: 'assistant', contentText: 'plain' }],
  };
  const snapshotText = canonicalJson(snapshot);
  const snapshotSha = sha256Prefixed(snapshotText);
  const assets = schemaVersion === 2 ? [{ sha256: assetSha, path: assetPath, ext: 'png', mimeType: 'image/png', byteLength: ASSET_BYTES.length, source: 'chatgpt-capture' }] : [];
  const contentHash = schemaVersion === 2
    ? sha256Prefixed(canonicalJson({ snapshot: snapshotSha, assets: assets.map((asset) => asset.sha256).sort() }))
    : snapshotSha;
  const htmlText = schemaVersion === 2 ? `<!doctype html><img src="${htmlRef}">` : '<!doctype html>';
  const manifest = {
    schema: 'h2o.savedChatPackage',
    schemaVersion,
    chatId,
    snapshotId,
    contentHash,
    files: {
      snapshot: { path: 'snapshot.json', sha256: snapshotSha, byteLength: encode(snapshotText).byteLength },
      markdown: { path: 'chat.md', sha256: sha256Prefixed(`# ${chatId}\n`), byteLength: encode(`# ${chatId}\n`).byteLength },
      html: { path: 'chat.html', sha256: sha256Prefixed(htmlText), byteLength: encode(htmlText).byteLength },
    },
    assets,
  };
  if (schemaVersion === 2) manifest.payloadVersion = 2;
  return {
    manifestText: canonicalJson(manifest),
    snapshotText,
    htmlText,
    manifest,
    snapshot,
  };
}

// C5.4A: read-only store adapter mock for DB reconciliation. Default is
// "consistent" for the standard fixtures (chat+snapshot exist, package is the
// latest snapshot, store asset registry matches the manifest) so existing tests
// stay green; config knobs inject the drift cases.
const SNAP_BY_CHAT = {
  chat_diag_v1: 'snap_diag_v1',
  chat_diag_v2: 'snap_diag_v2',
  chat_diag_bad: 'snap_diag_bad',
  chat_diag_bad_asset: 'snap_diag_bad_asset',
};
const ASSETS_BY_SNAP = {
  snap_diag_v2: [ASSET_SHA],
  snap_diag_bad_asset: [ASSET_SHA],
};

function buildDiagStore(config = {}) {
  const missingChats = new Set(config.missingChats || []);
  const missingSnapshots = new Set(config.missingSnapshots || []);
  const staleLatest = config.staleLatest || {}; // chatId -> fake latest snapshotId
  const assetOverride = config.assetOverride || {}; // snapshotId -> [sha...]
  const omit = new Set(config.omitMethods || []); // e.g. 'assets.listBySnapshot'
  const throwOn = new Set(config.throwOn || []); // method names that should throw

  const store = { chats: {}, snapshots: {}, assets: {} };
  if (!omit.has('chats.get')) {
    store.chats.get = async (id) => {
      if (throwOn.has('chats.get')) throw new Error('boom chats.get');
      return missingChats.has(id) ? null : { chatId: id, title: 't' };
    };
  }
  if (!omit.has('snapshots.get')) {
    store.snapshots.get = async (id) => {
      if (throwOn.has('snapshots.get')) throw new Error('boom snapshots.get');
      return missingSnapshots.has(id) ? null : { snapshot: { snapshotId: id } };
    };
  }
  if (!omit.has('snapshots.listByChat')) {
    store.snapshots.listByChat = async (chatId) => {
      if (throwOn.has('snapshots.listByChat')) throw new Error('boom listByChat');
      const latest = Object.prototype.hasOwnProperty.call(staleLatest, chatId) ? staleLatest[chatId] : SNAP_BY_CHAT[chatId];
      return latest ? [{ snapshotId: latest }] : [];
    };
  }
  if (!omit.has('assets.listBySnapshot')) {
    store.assets.listBySnapshot = async (snapshotId) => {
      if (throwOn.has('assets.listBySnapshot')) throw new Error('boom listBySnapshot');
      const shas = Object.prototype.hasOwnProperty.call(assetOverride, snapshotId) ? assetOverride[snapshotId] : (ASSETS_BY_SNAP[snapshotId] || []);
      return shas.map((sha) => ({ sha256: sha, turnIdx: 0, relation: 'inline' }));
    };
  }
  return store;
}

function createFixtureFs({ missingRoot = false, liveCasMissing = false, storeOptions = {} } = {}) {
  const dirs = new Set();
  const files = new Map();
  const readCalls = [];
  const mutationCalls = [];
  const v1 = makePackage({ chatId: 'chat_diag_v1', snapshotId: 'snap_diag_v1', schemaVersion: 1 });
  const v2 = makePackage({ chatId: 'chat_diag_v2', snapshotId: 'snap_diag_v2', schemaVersion: 2 });
  const bad = makePackage({ chatId: 'chat_diag_bad', snapshotId: 'snap_diag_bad', schemaVersion: 1 });
  const badAsset = makePackage({ chatId: 'chat_diag_bad_asset', snapshotId: 'snap_diag_bad_asset', schemaVersion: 2, dataImageResidue: true });

  function addDir(p) { dirs.add(p); }
  function addFile(p, value) { files.set(p, typeof value === 'string' ? encode(value) : new Uint8Array(value)); }
  function addPackage(chatId, pkg, { omitHtml = false, omitAsset = false, corruptAsset = false } = {}) {
    const dir = `${PACKAGE_ROOT}/${chatId}.h2ochat`;
    addDir(dir);
    addFile(`${dir}/manifest.json`, pkg.manifestText);
    addFile(`${dir}/snapshot.json`, pkg.snapshotText);
    addFile(`${dir}/chat.md`, `# ${chatId}\n`);
    if (!omitHtml) addFile(`${dir}/chat.html`, pkg.htmlText);
    if (pkg.manifest.assets.length) {
      addDir(`${dir}/assets`);
      if (!omitAsset) {
        const asset = pkg.manifest.assets[0];
        addFile(`${dir}/${asset.path}`, corruptAsset ? Buffer.from('wrong-asset-bytes') : ASSET_BYTES);
      }
    }
    return dir;
  }

  if (!missingRoot) {
    addDir(PACKAGE_ROOT);
    addPackage('chat_diag_v1', v1);
    addPackage('chat_diag_v2', v2);
    addPackage('chat_diag_bad', bad, { omitHtml: true });
    addPackage('chat_diag_bad_asset', badAsset, { corruptAsset: true });
    addDir(`${PACKAGE_ROOT}/not_a_package`);
    addFile(`${PACKAGE_ROOT}/loose.txt`, 'not a package');
  }

  const entries = [
    { name: 'chat_diag_v1.h2ochat', isDirectory: true },
    { name: 'chat_diag_v2.h2ochat', isDirectory: true },
    { name: 'chat_diag_bad.h2ochat', isDirectory: true },
    { name: 'chat_diag_bad_asset.h2ochat', isDirectory: true },
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
      if (p.endsWith('/assets')) {
        const prefix = `${p}/`;
        return [...files.keys()]
          .filter((key) => key.startsWith(prefix))
          .map((key) => key.slice(prefix.length))
          .filter((name) => name && !name.includes('/'))
          .map((name) => ({ name, isFile: true }));
      }
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
      badAsset: `${PACKAGE_ROOT}/chat_diag_bad_asset.h2ochat`,
    },
    assetCas: {
      exists: async (sha256) => !liveCasMissing && sha256 === ASSET_SHA,
      describe: async (sha256) => ({ sha256, exists: !liveCasMissing && sha256 === ASSET_SHA, path: `archive/assets/${sha256.slice(7, 9)}/${sha256}`, byteLength: ASSET_BYTES.length }),
    },
    store: buildDiagStore(storeOptions),
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
    H2O: { Studio: { ingestion: { assetCas: fixture.assetCas }, store: fixture.store } },
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
  assert.match(moduleSource, /LIVE_CAS_ROOT\s*=\s*'archive\/assets'/);
});

check('module has v1 and v2 contentHash validation logic', () => {
  assert.match(moduleSource, /diag\.schemaVersion === 1/);
  assert.match(moduleSource, /diag\.schemaVersion === 2/);
  assert.match(moduleSource, /canonicalJson\(\{ snapshot: fileSnapshotSha, assets: assetShas \}\)/);
  assert.match(moduleSource, /sha256Prefixed/);
});

check('module has C5.3 assetChecks schema and asset validation logic', () => {
  for (const marker of [
    'assetChecks',
    'manifestAssetCount',
    'packageAssetsOk',
    'missingPackageAssets',
    'hashMismatches',
    'byteLengthMismatches',
    'unreferencedManifestAssets',
    'assetRefMismatches',
    'dataImageResidue',
    'rendererAssetRefMismatches',
    'missingLiveCasAssets',
    'validateManifestAssets',
    'validatePackageAssetFiles',
    'validateSnapshotAssetRefs',
    'validateRendererAssetRefs',
    'compareLiveCasAssets',
  ]) {
    assert.ok(moduleSource.includes(marker), `missing marker: ${marker}`);
  }
});

check('module validates package-relative asset path safety and byte hashes', () => {
  assert.match(moduleSource, /packageRelativePathIsSafe/);
  assert.match(moduleSource, /assets\/sha256-<hash>\.<ext>/);
  assert.match(moduleSource, /sha256Prefixed\(bytes\)/);
  assert.match(moduleSource, /package-asset-sha-mismatch/);
  assert.match(moduleSource, /package-asset-byte-length-mismatch/);
});

check('module checks v2 data:image residue and renderer asset references', () => {
  assert.match(moduleSource, /data:image/);
  assert.match(moduleSource, /data-image-residue-v2/);
  assert.match(moduleSource, /renderer-asset-ref-not-in-manifest/);
  assert.match(moduleSource, /renderer-asset-ref-missing-file/);
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

check('module uses only read-only live CAS presence checks', () => {
  assert.match(moduleSource, /assetCas\.exists/);
  assert.match(moduleSource, /assetCas\.describe/);
  assert.ok(!moduleSource.includes('assetCas.putAssetBytes'));
  assert.ok(!moduleSource.includes('assetCas.getAssetBytes'));
  assert.ok(moduleSource.includes('live-cas-missing-package-portable'));
});

check('module does not implement CAS write-back, Sync, Chrome, import, or export reconciliation', () => {
  for (const forbidden of [
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

check('module reads DB only via read-only store adapters (no store mutation)', () => {
  // C5.4A reads
  assert.match(moduleSource, /\.chats\.get\b/);
  assert.match(moduleSource, /\.snapshots\.get\b/);
  assert.match(moduleSource, /\.snapshots\.listByChat\b/);
  assert.match(moduleSource, /\.assets\.listBySnapshot\b/);
  // unambiguous store-mutation method names must be absent entirely
  for (const banned of ['upsert', 'bulkUpsert', 'linkToTurn', 'unlinkFromTurn']) {
    assert.ok(!moduleSource.includes(banned), `store mutation referenced: ${banned}`);
  }
  // generic mutators must not be called on store namespaces
  const storeMutation = /\.(chats|snapshots|assets)\.(upsert|update|delete|remove|insert|write|patch|create|saveNow|bulkUpsert|linkToTurn|unlinkFromTurn)\s*\(/;
  assert.ok(!storeMutation.test(moduleSource), 'store mutation method call present on a store namespace');
});

check('module declares includeDbChecks option and dbChecks schema', () => {
  assert.match(moduleSource, /includeDbChecks/);
  assert.match(moduleSource, /function defaultDbChecks/);
  for (const field of ['chatExists', 'snapshotExists', 'latestSnapshotId', 'packageIsLatest', 'storeSnapshotCount', 'storeAssetCount', 'packageAssetSetMatchesStore', 'missingStoreAssets', 'extraStoreAssets']) {
    assert.match(moduleSource, new RegExp(field), `dbChecks field missing: ${field}`);
  }
  for (const code of ['missing-db-chat', 'missing-db-snapshot', 'stale-package', 'store-asset-registry-mismatch', 'db-api-missing', 'db-check-failed']) {
    assert.ok(moduleSource.includes(code), `db warning code missing: ${code}`);
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
  assert.equal(result.boundaries.dbChecks, 'read-only-store-adapters');
  assert.equal(result.boundaries.casChecks, 'read-only-exists-describe');
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
  assert.equal(result.packages.length, 4);
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

await checkAsync('v2 package validation uses locked descriptor content hash and asset checks', async () => {
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
  assert.equal(result.assetChecks.manifestAssetCount, 1);
  assert.equal(result.assetChecks.packageAssetCount, 1);
  assert.equal(result.assetChecks.packageAssetsOk, true);
  assert.equal(result.assetChecks.liveCasChecked, true);
  assert.equal(result.assetChecks.liveCasAvailable, true);
  assert.equal(result.assetChecks.missingPackageAssets.length, 0);
  assert.equal(result.assetChecks.hashMismatches.length, 0);
  assert.equal(result.assetChecks.dataImageResidue.length, 0);
});

await checkAsync('missing renderer file blocks package validation', async () => {
  const fixture = createFixtureFs();
  const ingestion = loadModule(fixture);
  const result = await ingestion.validateSavedChatPackageV1({ packagePath: fixture.paths.bad });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'blocked');
  assert.ok(result.blockers.some((issue) => issue.code === 'html-missing'));
});

await checkAsync('live CAS missing warns but does not block portable package asset', async () => {
  const fixture = createFixtureFs({ liveCasMissing: true });
  const ingestion = loadModule(fixture);
  const result = await ingestion.validateSavedChatPackageV1({ packagePath: fixture.paths.v2 });
  assert.equal(result.status, 'warning');
  assert.equal(result.blockers.length, 0);
  assert.equal(result.assetChecks.packageAssetsOk, true);
  assert.equal(result.assetChecks.missingLiveCasAssets.length, 1);
  assert.ok(result.warnings.some((issue) => issue.code === 'live-cas-missing-package-portable'));
});

await checkAsync('corrupt package asset and data:image residue block v2 validation', async () => {
  const fixture = createFixtureFs();
  const ingestion = loadModule(fixture);
  const result = await ingestion.validateSavedChatPackageV1({ packagePath: fixture.paths.badAsset });
  assert.equal(result.status, 'blocked');
  assert.ok(result.assetChecks.hashMismatches.some((issue) => issue.code === 'package-asset-sha-mismatch'));
  assert.ok(result.assetChecks.byteLengthMismatches.some((issue) => issue.code === 'package-asset-byte-length-mismatch'));
  assert.ok(result.assetChecks.dataImageResidue.some((issue) => issue.code === 'data-image-residue-v2'));
});

await checkAsync('aggregate diagnostic returns partial for mixed package health', async () => {
  const fixture = createFixtureFs();
  const ingestion = loadModule(fixture);
  const result = await ingestion.diagnoseSavedChatArchiveV1({ limit: 20 });
  assert.equal(result.status, 'partial');
  assert.equal(result.counts.packagesTotal, 4);
  assert.equal(result.counts.packagesOk, 2);
  assert.equal(result.counts.packagesBlocked, 2);
  assert.equal(result.counts.v1, 2);
  assert.equal(result.counts.v2, 2);
  assert.ok(result.counts.brokenPackageAssets >= 2);
  assert.ok(result.counts.dataImageResidue >= 2);
  assert.equal(result.counts.assetRefMismatches, 0);
  assert.ok(result.assetChecks.passed >= 2);
  assert.ok(result.assetChecks.failed >= 1);
  assert.equal(fixture.mutationCalls.length, 0);
});

console.log('[saved-chat-archive-diagnostics-v1] C5.4A db-reconciliation checks');

const DB_CODES = new Set(['missing-db-chat', 'missing-db-snapshot', 'stale-package', 'store-asset-registry-mismatch', 'db-api-missing', 'db-check-failed']);

await checkAsync('capability advertises read-only store-adapter DB checks', async () => {
  const ingestion = loadModule(createFixtureFs());
  const caps = ingestion.diagnoseSavedChatArchiveCapabilitiesV1();
  assert.equal(caps.boundaries.dbChecks, 'read-only-store-adapters');
  assert.deepEqual([...caps.storeReads].sort(), ['assets.listBySnapshot', 'chats.get', 'snapshots.get', 'snapshots.listByChat']);
});

await checkAsync('consistent store: v2 dbChecks pass with no DB warnings', async () => {
  const fixture = createFixtureFs();
  const ingestion = loadModule(fixture);
  const r = await ingestion.validateSavedChatPackageV1({ packagePath: fixture.paths.v2 });
  const db = r.dbChecks;
  assert.equal(db.checked, true);
  assert.equal(db.available, true);
  assert.equal(db.chatExists, true);
  assert.equal(db.snapshotExists, true);
  assert.equal(db.packageIsLatest, true);
  assert.equal(db.storeAssetCount, 1);
  assert.equal(db.packageAssetSetMatchesStore, true);
  assert.equal(db.warnings.length, 0);
  assert.ok(!r.warnings.some((i) => DB_CODES.has(i.code)), 'no DB warning codes on a consistent package');
});

await checkAsync('missing DB chat is a warning, not a blocker', async () => {
  const fixture = createFixtureFs({ storeOptions: { missingChats: ['chat_diag_v1'] } });
  const ingestion = loadModule(fixture);
  const r = await ingestion.validateSavedChatPackageV1({ packagePath: fixture.paths.v1 });
  assert.equal(r.dbChecks.chatExists, false);
  assert.ok(r.warnings.some((i) => i.code === 'missing-db-chat'));
  assert.equal(r.dbChecks.blockers.length, 0, 'DB drift must not add blockers');
  assert.equal(r.blockers.length, 0, 'package must remain structurally valid');
  assert.equal(r.status, 'warning');
  assert.equal(r.ok, false);
});

await checkAsync('stale package (not latest DB snapshot) is a warning', async () => {
  const fixture = createFixtureFs({ storeOptions: { staleLatest: { chat_diag_v2: 'snap_newer' } } });
  const ingestion = loadModule(fixture);
  const r = await ingestion.validateSavedChatPackageV1({ packagePath: fixture.paths.v2 });
  assert.equal(r.dbChecks.packageIsLatest, false);
  assert.equal(r.dbChecks.latestSnapshotId, 'snap_newer');
  assert.ok(r.warnings.some((i) => i.code === 'stale-package'));
  assert.equal(r.blockers.length, 0);
  assert.equal(r.status, 'warning');
});

await checkAsync('store asset registry mismatch is a warning', async () => {
  const fakeSha = 'sha256-' + 'b'.repeat(64);
  const fixture = createFixtureFs({ storeOptions: { assetOverride: { snap_diag_v2: [fakeSha] } } });
  const ingestion = loadModule(fixture);
  const r = await ingestion.validateSavedChatPackageV1({ packagePath: fixture.paths.v2 });
  assert.equal(r.dbChecks.packageAssetSetMatchesStore, false);
  assert.ok(r.dbChecks.missingStoreAssets.includes(ASSET_SHA), 'manifest asset missing from store registry');
  assert.ok(r.dbChecks.extraStoreAssets.includes(fakeSha), 'store registry has an extra asset');
  assert.ok(r.warnings.some((i) => i.code === 'store-asset-registry-mismatch'));
  assert.equal(r.blockers.length, 0);
});

await checkAsync('v1 asset-less package with store assets present warns (mismatch, not blocker)', async () => {
  const fixture = createFixtureFs({ storeOptions: { assetOverride: { snap_diag_v1: ['sha256-' + 'c'.repeat(64)] } } });
  const ingestion = loadModule(fixture);
  const r = await ingestion.validateSavedChatPackageV1({ packagePath: fixture.paths.v1 });
  assert.equal(r.dbChecks.packageAssetSetMatchesStore, false);
  assert.ok(r.dbChecks.extraStoreAssets.length >= 1);
  assert.ok(r.warnings.some((i) => i.code === 'store-asset-registry-mismatch'));
  assert.equal(r.blockers.length, 0);
});

await checkAsync('missing store namespace degrades to warning (db-api-missing), no crash/blocker', async () => {
  const fixture = createFixtureFs();
  fixture.store = null;
  const ingestion = loadModule(fixture);
  const r = await ingestion.validateSavedChatPackageV1({ packagePath: fixture.paths.v1 });
  assert.equal(r.dbChecks.checked, true);
  assert.equal(r.dbChecks.available, false);
  assert.ok(r.warnings.some((i) => i.code === 'db-api-missing'));
  assert.equal(r.blockers.length, 0);
  assert.equal(r.status, 'warning');
});

await checkAsync('partial store API (no assets.listBySnapshot) degrades to warning, no crash', async () => {
  const fixture = createFixtureFs({ storeOptions: { omitMethods: ['assets.listBySnapshot'] } });
  const ingestion = loadModule(fixture);
  const r = await ingestion.validateSavedChatPackageV1({ packagePath: fixture.paths.v2 });
  assert.equal(r.dbChecks.available, true);
  assert.equal(r.dbChecks.chatExists, true, 'other store reads still ran');
  assert.equal(r.dbChecks.storeAssetCount, null, 'asset comparison skipped');
  assert.ok(r.warnings.some((i) => i.code === 'db-api-missing'));
  assert.equal(r.blockers.length, 0);
});

await checkAsync('store read throw degrades to warning (db-check-failed), no crash', async () => {
  const fixture = createFixtureFs({ storeOptions: { throwOn: ['chats.get'] } });
  const ingestion = loadModule(fixture);
  const r = await ingestion.validateSavedChatPackageV1({ packagePath: fixture.paths.v1 });
  assert.ok(r.warnings.some((i) => i.code === 'db-check-failed'));
  assert.equal(r.blockers.length, 0);
  assert.equal(r.status, 'warning');
});

await checkAsync('includeDbChecks:false skips DB reconciliation entirely', async () => {
  const fixture = createFixtureFs({ storeOptions: { missingChats: ['chat_diag_v2'] } });
  const ingestion = loadModule(fixture);
  const r = await ingestion.validateSavedChatPackageV1({ packagePath: fixture.paths.v2, includeDbChecks: false });
  assert.equal(r.dbChecks.checked, false);
  assert.ok(!r.warnings.some((i) => DB_CODES.has(i.code)), 'no DB warnings when DB checks are disabled');
});

await checkAsync('aggregate exposes dbChecks summary + DB drift counts (orphaned/missing/stale)', async () => {
  const fixture = createFixtureFs({
    storeOptions: {
      missingChats: ['chat_diag_v1'],
      missingSnapshots: ['snap_diag_v1'],
      staleLatest: { chat_diag_v2: 'snap_newer' },
    },
  });
  const ingestion = loadModule(fixture);
  const result = await ingestion.diagnoseSavedChatArchiveV1({ limit: 20 });
  assert.ok(result.dbChecks && typeof result.dbChecks.passed === 'number' && typeof result.dbChecks.warnings === 'number' && typeof result.dbChecks.failed === 'number');
  assert.ok(result.counts.missingDbChats >= 1, 'missingDbChats counted');
  assert.ok(result.counts.missingDbSnapshots >= 1, 'missingDbSnapshots counted');
  assert.ok(result.counts.orphanedPackages >= 1, 'orphaned (chat+snapshot missing) classified');
  assert.ok(result.counts.stalePackages >= 1, 'stalePackages counted');
  assert.equal(typeof result.counts.storeAssetMismatches, 'number');
  assert.equal(fixture.mutationCalls.length, 0, 'no fs mutation during diagnostics');
});

if (FAIL.length) {
  console.error(`\n[saved-chat-archive-diagnostics-v1] ${FAIL.length} failed, ${PASS.length} passed`);
  process.exitCode = 1;
} else {
  console.log(`\n[saved-chat-archive-diagnostics-v1] all ${PASS.length} checks passed`);
}
