#!/usr/bin/env node
//
// Folder Sync Phase F5 - disabled/read-only Desktop runtime drift probe validator.
//
// The validator does not attach to Desktop DevTools. It validates the exact manual DevTools snippet
// and proves the same drift/report contract with fixture-backed read adapters and writer traps.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const failures = [];

const f5Doc = 'release-evidence/2026-06-25/folder-sync-f5-desktop-runtime-drift-probe.md';
const f4Doc = 'release-evidence/2026-06-25/folder-sync-f4-runtime-drift-probe-design-gate.md';
const f3Doc = 'release-evidence/2026-06-25/folder-sync-f3-read-only-live-drift-probe.md';
const foldersStoreFile = 'src-surfaces-base/studio/store/folders.tauri.js';
const bridgeFile = 'src-surfaces-base/studio/dev/folder-sync-rc-smoke-bridge.studio.js';
const folderSyncFile = 'src-surfaces-base/studio/sync/folder-sync.tauri.js';
const folderImportFile = 'src-surfaces-base/studio/sync/folder-import.mv3.js';

const F4_COMMIT = 'b21f408dc6e0fb4a9f5f2d8f2f3f3ea8f7b6c1d1';
const F3_COMMIT = 'ba0a13f';
const F2_COMMIT = 'ef4fb16';
const MIRROR_KEY = 'h2o:prm:cgx:fldrs:state:data:v1';

const DRIFT_CLASSES = [
  'missing-mirror-folder',
  'extra-mirror-folder',
  'field-mismatch:name',
  'field-mismatch:color',
  'field-mismatch:sortOrder',
  'tombstone-status-mismatch',
  'binding-mismatch',
  'desktop-sqlite-source-diverged',
  'stale-deferred-propagation',
];

const METADATA_CORE_TYPES = [
  'chat-category-assign',
  'chat-category-clear',
  'chat-label-bind',
  'chat-tag-bind',
];

const WRITE_FORBIDDEN_OPS = [
  'create',
  'upsert',
  'patch',
  'softDeleteEmptyFolder',
  'restoreTombstonedFolder',
  'bindChat',
  'unbindChat',
  'moveCanonicalChatFolderBinding',
  'chrome.storage.set',
  'chromeStorageSet',
  'exportLatestSyncBundle',
  'syncNow',
  'webdavWrite',
  'repairMirror',
  'reconcileMirror',
];

const READ_SOURCE_ANCHORS = [
  ['function listFolders', foldersStoreFile],
  ['function getAll() { return listFolders(); }', foldersStoreFile],
  ['function listRecentlyDeletedFolders', foldersStoreFile],
  ['function listCanonicalChatFolderBindings', foldersStoreFile],
  ['FOLDER_STATE_DATA_KEY', foldersStoreFile],
  ['chromeStorageGet(FOLDER_STATE_DATA_KEY)', foldersStoreFile],
  ['chromeStorageGet(FOLDER_STATE_DATA_KEY)', bridgeFile],
  ['listCanonicalChatFolderBindings', bridgeFile],
  ['listRecentlyDeletedFolders', bridgeFile],
];

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

function exists(file) {
  return fs.existsSync(path.join(root, file));
}

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function stableHash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 24);
}

function redact(kind, value) {
  return `${kind}:sha256:${stableHash(value)}`;
}

function sortedStrings(values) {
  return Array.from(new Set((values || []).map((value) => String(value)))).sort();
}

function normalizeFolderId(row) {
  return String(row?.id || row?.folderId || '');
}

function normalizeSortOrder(row) {
  if (row?.sortOrder !== undefined) return Number(row.sortOrder);
  if (row?.sort_order !== undefined) return Number(row.sort_order);
  return 0;
}

function indexByFolderId(rows) {
  const indexed = new Map();
  for (const row of rows || []) {
    const id = normalizeFolderId(row);
    if (id) indexed.set(id, row);
  }
  return indexed;
}

function canonicalDeleted(canonical, folderId, row) {
  const tombstones = canonical.tombstones || {};
  const recentlyDeleted = new Set(canonical.recentlyDeletedFolderIds || []);
  return Boolean(row?.deleted || row?.tombstoned || tombstones[folderId]?.active || recentlyDeleted.has(folderId));
}

function mirrorDeleted(mirror, folderId, row) {
  const recentlyDeleted = new Set(mirror.recentlyDeletedFolderIds || []);
  return Boolean(row?.deleted || row?.tombstoned || row?.deletedAt || row?.tombstoneId || recentlyDeleted.has(folderId));
}

function pushDiagnostic(diagnostics, code, folderId, detail = {}) {
  diagnostics.push({ code, folder: redact('folder', folderId), ...detail });
}

function detectFolderSourceDrift(canonical, mirror) {
  const diagnostics = [];
  const canonicalById = indexByFolderId(canonical.folders);
  const mirrorById = indexByFolderId(mirror.folders);

  for (const [folderId, canonicalRow] of canonicalById.entries()) {
    const mirrorRow = mirrorById.get(folderId);
    if (!mirrorRow) {
      pushDiagnostic(diagnostics, 'missing-mirror-folder', folderId);
      continue;
    }
    let rowDiverged = false;
    for (const [field, canonicalValue, mirrorValue] of [
      ['name', canonicalRow.name, mirrorRow.name],
      ['color', canonicalRow.color, mirrorRow.color],
      ['sortOrder', normalizeSortOrder(canonicalRow), normalizeSortOrder(mirrorRow)],
    ]) {
      if (String(canonicalValue ?? '') !== String(mirrorValue ?? '')) {
        rowDiverged = true;
        pushDiagnostic(diagnostics, `field-mismatch:${field}`, folderId, {
          field,
          canonical: redact(`${field}:canonical`, canonicalValue ?? null),
          mirror: redact(`${field}:mirror`, mirrorValue ?? null),
        });
      }
    }

    const canonicalStatus = canonicalDeleted(canonical, folderId, canonicalRow);
    const mirrorStatus = mirrorDeleted(mirror, folderId, mirrorRow);
    if (canonicalStatus !== mirrorStatus) {
      rowDiverged = true;
      pushDiagnostic(diagnostics, 'tombstone-status-mismatch', folderId, {
        canonical: redact('deleted:canonical', canonicalStatus),
        mirror: redact('deleted:mirror', mirrorStatus),
      });
    }

    const canonicalBindings = sortedStrings(canonical.bindings?.[folderId]);
    const mirrorBindings = sortedStrings(mirror.items?.[folderId]);
    if (JSON.stringify(canonicalBindings) !== JSON.stringify(mirrorBindings)) {
      rowDiverged = true;
      pushDiagnostic(diagnostics, 'binding-mismatch', folderId, {
        canonicalBindings: redact('bindings:canonical', canonicalBindings),
        mirrorBindings: redact('bindings:mirror', mirrorBindings),
      });
    }

    if (String(mirrorRow.source || '') === 'desktop-sqlite' && rowDiverged) {
      pushDiagnostic(diagnostics, 'desktop-sqlite-source-diverged', folderId, {
        source: redact('source', 'desktop-sqlite'),
      });
    }
    if (String(mirrorRow.syncPropagation || '') === 'deferred' && !mirrorRow.reconciledAt) {
      pushDiagnostic(diagnostics, 'stale-deferred-propagation', folderId, {
        marker: redact('syncPropagation', 'deferred'),
      });
    }
  }

  for (const [folderId] of mirrorById.entries()) {
    if (!canonicalById.has(folderId)) pushDiagnostic(diagnostics, 'extra-mirror-folder', folderId);
  }
  return diagnostics;
}

function parseMetadataAllowlist(source) {
  const start = source.indexOf('APPLIED_LIBRARY_METADATA_MUTATION_REQUEST_ACTIONS = {');
  if (start < 0) return null;
  const end = source.indexOf('}', start);
  if (end < 0) return null;
  const block = source.slice(start, end);
  const applied = [];
  const re = /'([a-z0-9-]+)'\s*:\s*true/gi;
  let match;
  while ((match = re.exec(block)) !== null) applied.push(match[1]);
  return applied;
}

function desktopDevtoolsSnippet() {
  return String.raw`(async function folderSyncF5ReadOnlyDriftProbe() {
  const FOLDER_STATE_DATA_KEY = 'h2o:prm:cgx:fldrs:state:data:v1';
  const READ_PATH_CANONICAL_FOLDERS = 'H2O.Studio.store.folders.getAll';
  const READ_PATH_RECENTLY_DELETED = 'H2O.Studio.store.folders.listRecentlyDeletedFolders';
  const READ_PATH_CANONICAL_BINDINGS = 'H2O.Studio.store.folders.listCanonicalChatFolderBindings';
  const writeCalls = [];
  const forbidWrite = (name) => async function blockedWriter() {
    writeCalls.push({ name, blocked: true });
    throw new Error('folder-sync-f5-write-forbidden:' + name);
  };
  const forbiddenWriters = {
    create: forbidWrite('create'),
    upsert: forbidWrite('upsert'),
    patch: forbidWrite('patch'),
    softDeleteEmptyFolder: forbidWrite('softDeleteEmptyFolder'),
    restoreTombstonedFolder: forbidWrite('restoreTombstonedFolder'),
    bindChat: forbidWrite('bindChat'),
    unbindChat: forbidWrite('unbindChat'),
    moveCanonicalChatFolderBinding: forbidWrite('moveCanonicalChatFolderBinding'),
    chromeStorageSet: forbidWrite('chromeStorageSet'),
    exportLatestSyncBundle: forbidWrite('exportLatestSyncBundle'),
    syncNow: forbidWrite('syncNow'),
    webdavWrite: forbidWrite('webdavWrite'),
    repairMirror: forbidWrite('repairMirror'),
    reconcileMirror: forbidWrite('reconcileMirror')
  };
  void forbiddenWriters;
  const encode = (value) => new TextEncoder().encode(JSON.stringify(value));
  const hash = async (kind, value) => {
    const bytes = await crypto.subtle.digest('SHA-256', encode(value));
    return kind + ':sha256:' + Array.from(new Uint8Array(bytes)).map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 24);
  };
  const cleanArray = (value) => Array.isArray(value) ? value : [];
  const folderId = (row) => String(row && (row.id || row.folderId) || '');
  const sortOrder = (row) => Number(row && (row.sortOrder ?? row.sort_order) || 0);
  const sorted = (arr) => Array.from(new Set(cleanArray(arr).map(String))).sort();
  const indexByFolderId = (rows) => new Map(cleanArray(rows).map((row) => [folderId(row), row]).filter(([id]) => id));
  async function readMirror() {
    if (globalThis.chrome && chrome.storage && chrome.storage.local && typeof chrome.storage.local.get === 'function') {
      const result = await chrome.storage.local.get(FOLDER_STATE_DATA_KEY);
      return (result && result[FOLDER_STATE_DATA_KEY]) || {};
    }
    try {
      const raw = globalThis.localStorage && localStorage.getItem(FOLDER_STATE_DATA_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (_) {
      return {};
    }
  }
  const foldersStore = globalThis.H2O && H2O.Studio && H2O.Studio.store && H2O.Studio.store.folders;
  if (!foldersStore || typeof foldersStore.getAll !== 'function') throw new Error('folder-sync-f5-folders-store-unavailable');
  const canonicalFolders = cleanArray(await foldersStore.getAll());
  const recentlyDeletedRows = typeof foldersStore.listRecentlyDeletedFolders === 'function'
    ? cleanArray(await foldersStore.listRecentlyDeletedFolders({ limit: 1000 }))
    : [];
  const bindingRows = typeof foldersStore.listCanonicalChatFolderBindings === 'function'
    ? cleanArray(await foldersStore.listCanonicalChatFolderBindings())
    : [];
  const mirror = await readMirror();
  const bindings = {};
  for (const row of bindingRows) {
    const fid = folderId(row);
    const cid = String(row && (row.chatId || row.chat_id) || '');
    if (!fid || !cid) continue;
    (bindings[fid] = bindings[fid] || []).push(cid);
  }
  const recentlyDeletedIds = recentlyDeletedRows.map(folderId).filter(Boolean);
  const tombstones = Object.fromEntries(recentlyDeletedIds.map((id) => [id, { active: true }]));
  const canonical = { folders: canonicalFolders, bindings, recentlyDeletedFolderIds: recentlyDeletedIds, tombstones };
  const canonicalById = indexByFolderId(canonical.folders);
  const mirrorById = indexByFolderId(mirror.folders);
  const diagnostics = [];
  async function push(code, fid, detail) {
    diagnostics.push(Object.assign({ code, folder: await hash('folder', fid) }, detail || {}));
  }
  for (const [fid, row] of canonicalById.entries()) {
    const m = mirrorById.get(fid);
    if (!m) {
      await push('missing-mirror-folder', fid);
      continue;
    }
    let rowDiverged = false;
    for (const [field, a, b] of [['name', row.name, m.name], ['color', row.color, m.color], ['sortOrder', sortOrder(row), sortOrder(m)]]) {
      if (String(a ?? '') !== String(b ?? '')) {
        rowDiverged = true;
        await push('field-mismatch:' + field, fid, { field, canonical: await hash(field + ':canonical', a ?? null), mirror: await hash(field + ':mirror', b ?? null) });
      }
    }
    const cDeleted = !!(row.deleted || row.tombstoned || tombstones[fid] || recentlyDeletedIds.includes(fid));
    const mDeleted = !!(m.deleted || m.tombstoned || m.deletedAt || m.tombstoneId || cleanArray(mirror.recentlyDeletedFolderIds).includes(fid));
    if (cDeleted !== mDeleted) {
      rowDiverged = true;
      await push('tombstone-status-mismatch', fid, { canonical: await hash('deleted:canonical', cDeleted), mirror: await hash('deleted:mirror', mDeleted) });
    }
    const cBindings = sorted(bindings[fid]);
    const mBindings = sorted(mirror.items && mirror.items[fid]);
    if (JSON.stringify(cBindings) !== JSON.stringify(mBindings)) {
      rowDiverged = true;
      await push('binding-mismatch', fid, { canonicalBindings: await hash('bindings:canonical', cBindings), mirrorBindings: await hash('bindings:mirror', mBindings) });
    }
    if (m.source === 'desktop-sqlite' && rowDiverged) await push('desktop-sqlite-source-diverged', fid, { source: await hash('source', 'desktop-sqlite') });
    if (m.syncPropagation === 'deferred' && !m.reconciledAt) await push('stale-deferred-propagation', fid, { marker: await hash('syncPropagation', 'deferred') });
  }
  for (const [fid] of mirrorById.entries()) if (!canonicalById.has(fid)) await push('extra-mirror-folder', fid);
  return {
    schema: 'h2o.studio.folder-sync.f5-desktop-runtime-drift-report.v1',
    surface: 'desktop-studio',
    mode: 'manual-devtools-read-only',
    readOnly: true,
    mirrorKey: FOLDER_STATE_DATA_KEY,
    driftClasses: diagnostics.map((d) => d.code).sort(),
    diagnosticCount: diagnostics.length,
    diagnostics,
    writeCallCount: writeCalls.length,
    safety: {
      noSqliteMutation: true,
      noChromeStorageMutation: true,
      noTombstoneMutation: true,
      noBindingMutation: true,
      noTransportWrite: true,
      noWebdavWrite: true,
      folderSyncReady: false,
      publicPremiumBlocked: true,
      realRemoteWebdavDeferred: true
    }
  };
})()`;
}

function fixtureAdapters() {
  const calls = [];
  const canonicalFolders = [
    { id: 'folder-f5-alpha', name: 'F5 Private Alpha', color: '#111111', sort_order: 1, deleted: false },
    { id: 'folder-f5-beta', name: 'F5 Private Beta', color: '#222222', sort_order: 2, deleted: false },
    { id: 'folder-f5-gamma', name: 'F5 Private Gamma Tombstone', color: '#333333', sort_order: 3, deleted: true },
  ];
  const recentlyDeleted = [{ folderId: 'folder-f5-gamma', tombstoneId: 'tombstone-f5-gamma' }];
  const bindings = [
    { folderId: 'folder-f5-alpha', chatId: 'chat-f5-alpha-one' },
    { folderId: 'folder-f5-alpha', chatId: 'chat-f5-alpha-two' },
    { folderId: 'folder-f5-gamma', chatId: 'chat-f5-gamma-one' },
  ];
  const mirror = {
    folders: [
      { id: 'folder-f5-alpha', name: 'F5 Diverged Alpha', color: '#999999', sortOrder: 9, deleted: false, source: 'desktop-sqlite', syncPropagation: 'deferred' },
      { id: 'folder-f5-gamma', name: 'F5 Private Gamma Tombstone', color: '#333333', sortOrder: 3, deleted: false, source: 'desktop-sqlite' },
      { id: 'folder-f5-extra', name: 'F5 Extra Mirror', color: '#444444', sortOrder: 4, source: 'desktop-sqlite' },
    ],
    items: {
      'folder-f5-alpha': ['chat-f5-alpha-one'],
      'folder-f5-gamma': ['chat-f5-gamma-one'],
    },
    recentlyDeletedFolderIds: [],
  };

  function readOnly(name, value) {
    return async function readAdapter() {
      calls.push({ op: name, mode: 'read' });
      return JSON.parse(JSON.stringify(value));
    };
  }

  const writers = Object.fromEntries(WRITE_FORBIDDEN_OPS.map((name) => [name, async function writerTrap() {
    calls.push({ op: name, mode: 'write' });
    throw new Error(`write-forbidden:${name}`);
  }]));

  return {
    calls,
    peer: { peerId: 'peer-f5-private', deviceId: 'mobile-device-f5-private' },
    readCanonicalFolders: readOnly('H2O.Studio.store.folders.getAll', canonicalFolders),
    readRecentlyDeletedFolders: readOnly('H2O.Studio.store.folders.listRecentlyDeletedFolders', recentlyDeleted),
    readCanonicalBindings: readOnly('H2O.Studio.store.folders.listCanonicalChatFolderBindings', bindings),
    readMirror: readOnly('chromeStorageGet(FOLDER_STATE_DATA_KEY)', mirror),
    writers,
  };
}

function buildCanonicalSnapshot(folders, recentlyDeletedRows, bindingRows) {
  const bindings = {};
  for (const row of bindingRows || []) {
    const fid = normalizeFolderId(row);
    const cid = String(row?.chatId || row?.chat_id || '');
    if (!fid || !cid) continue;
    if (!bindings[fid]) bindings[fid] = [];
    bindings[fid].push(cid);
  }
  const recentlyDeletedFolderIds = [];
  const tombstones = {};
  for (const row of recentlyDeletedRows || []) {
    const fid = normalizeFolderId(row);
    if (!fid) continue;
    recentlyDeletedFolderIds.push(fid);
    tombstones[fid] = { active: true };
  }
  return { folders, bindings, recentlyDeletedFolderIds, tombstones };
}

async function runProbeContract(adapters) {
  const [folders, recentlyDeleted, bindingRows, mirror] = await Promise.all([
    adapters.readCanonicalFolders(),
    adapters.readRecentlyDeletedFolders(),
    adapters.readCanonicalBindings(),
    adapters.readMirror(),
  ]);
  const canonical = buildCanonicalSnapshot(folders, recentlyDeleted, bindingRows);
  const diagnostics = detectFolderSourceDrift(canonical, mirror);
  return {
    schema: 'h2o.studio.folder-sync.f5-desktop-runtime-drift-report.v1',
    mode: 'fixture-backed-runtime-contract',
    peer: redact('peer', adapters.peer),
    diagnostics,
    writeCallCount: adapters.calls.filter((call) => call.mode === 'write').length,
    safety: {
      readOnly: true,
      noSqliteMutation: true,
      noChromeStorageMutation: true,
      noTombstoneMutation: true,
      noBindingMutation: true,
      noTransportWrite: true,
      noWebdavWrite: true,
      folderSyncReady: false,
      publicPremiumBlocked: true,
      realRemoteWebdavDeferred: true,
    },
  };
}

if (process.argv.includes('--print-devtools-snippet')) {
  console.log(desktopDevtoolsSnippet());
  process.exit(0);
}

assert(exists(f5Doc), `${f5Doc}: missing`);
if (!exists(f5Doc)) {
  console.error('FAIL validate-folder-sync-f5-desktop-runtime-drift-probe');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

const doc = read(f5Doc);
const flat = doc.replace(/\s+/g, ' ');

assert(doc.length > 5000, `${f5Doc}: evidence too short`);
for (const marker of [
  F4_COMMIT,
  F3_COMMIT,
  F2_COMMIT,
  'DISABLED / READ-ONLY RUNTIME PROBE PREPARED',
  'No product runtime source was changed',
  'No reconciliation writes were implemented',
  'target/debug/h2o-studio-desktop',
  'H2O.Studio.store.folders.getAll()',
  'H2O.Studio.store.folders.listRecentlyDeletedFolders()',
  'H2O.Studio.store.folders.listCanonicalChatFolderBindings()',
  'FOLDER_STATE_DATA_KEY',
  MIRROR_KEY,
  '--print-devtools-snippet',
  'writeCallCount: 0',
  'Desktop Studio, Chrome/native extension Studio across multiple devices, and the mobile app',
  'Folder sync remains NOT READY',
  'Public/premium sync remains blocked',
  'Real remote WebDAV remains deferred',
]) {
  assert(flat.includes(marker), `F5 evidence missing marker: ${marker}`);
}

for (const code of DRIFT_CLASSES) assert(flat.includes(code), `F5 evidence missing drift class ${code}`);
for (const [token, file] of READ_SOURCE_ANCHORS) {
  assert(exists(file), `source file missing: ${file}`);
  if (exists(file)) assert(read(file).includes(token), `${file}: missing source anchor ${token}`);
}
assert(exists(f4Doc), `${f4Doc}: missing`);
assert(exists(f3Doc), `${f3Doc}: missing`);

const snippet = desktopDevtoolsSnippet();
for (const marker of [
  'folderSyncF5ReadOnlyDriftProbe',
  'h2o.studio.folder-sync.f5-desktop-runtime-drift-report.v1',
  'manual-devtools-read-only',
  'H2O.Studio.store.folders.getAll',
  'listRecentlyDeletedFolders',
  'listCanonicalChatFolderBindings',
  'chrome.storage.local.get',
  'FOLDER_STATE_DATA_KEY',
  'writeCallCount',
  'noSqliteMutation',
  'noChromeStorageMutation',
  'noTransportWrite',
  'noWebdavWrite',
]) {
  assert(snippet.includes(marker), `DevTools snippet missing marker: ${marker}`);
}
for (const forbiddenCall of ['chrome.storage.local.set(', '.set({', 'softDeleteEmptyFolder(', 'restoreTombstonedFolder(', 'bindChat(', 'unbindChat(', 'exportLatestSyncBundle(', 'syncNow(']) {
  assert(!snippet.includes(forbiddenCall), `DevTools snippet must not contain writer call pattern: ${forbiddenCall}`);
}

const adapters = fixtureAdapters();
const report = await runProbeContract(adapters);
const codes = new Set(report.diagnostics.map((diagnostic) => diagnostic.code));
for (const code of DRIFT_CLASSES) assert(codes.has(code), `fixture probe missing drift class ${code}`);
assert(report.writeCallCount === 0, `writeCallCount must be 0, got ${report.writeCallCount}`);
for (const call of adapters.calls) assert(call.mode === 'read', `probe made non-read call ${JSON.stringify(call)}`);
for (const key of ['readOnly', 'noSqliteMutation', 'noChromeStorageMutation', 'noTombstoneMutation', 'noBindingMutation', 'noTransportWrite', 'noWebdavWrite', 'publicPremiumBlocked', 'realRemoteWebdavDeferred']) {
  assert(report.safety[key] === true, `probe safety flag must be true: ${key}`);
}
assert(report.safety.folderSyncReady === false, 'folder sync must remain NOT READY');

const emitted = JSON.stringify(report);
for (const rawPrivateValue of [
  'F5 Private Alpha',
  'F5 Private Beta',
  'F5 Private Gamma Tombstone',
  'F5 Diverged Alpha',
  'F5 Extra Mirror',
  'folder-f5-alpha',
  'folder-f5-beta',
  'folder-f5-gamma',
  'folder-f5-extra',
  'chat-f5-alpha-one',
  'chat-f5-alpha-two',
  'chat-f5-gamma-one',
  'peer-f5-private',
  'mobile-device-f5-private',
]) {
  assert(!emitted.includes(rawPrivateValue), `probe report leaked raw private value: ${rawPrivateValue}`);
}
assert(emitted.includes('sha256:'), 'probe output must contain hash redaction');

const currentApplied = parseMetadataAllowlist(read(folderSyncFile));
const expectedCore = METADATA_CORE_TYPES.slice().sort();
let metadataAllowlistCaveat = false;
assert(Array.isArray(currentApplied), 'could not parse metadata applied allowlist');
if (Array.isArray(currentApplied)) {
  const sorted = currentApplied.slice().sort();
  const knownOutOfScopeExtras = ['chat-label-unbind', 'chat-tag-unbind'];
  const expectedWithKnownCaveat = METADATA_CORE_TYPES.concat(knownOutOfScopeExtras).sort();
  const exactExpected = sorted.length === expectedCore.length && sorted.every((type, index) => type === expectedCore[index]);
  const knownCaveatOnly = sorted.length === expectedWithKnownCaveat.length && sorted.every((type, index) => type === expectedWithKnownCaveat[index]);
  metadataAllowlistCaveat = !exactExpected && knownCaveatOnly;
  assert(exactExpected || knownCaveatOnly, `metadata applied allowlist drifted beyond known caveat: got [${sorted.join(', ')}]`);
}
assert(read(folderSyncFile).includes("webdav: 'deferred'"), `${folderSyncFile}: WebDAV must remain deferred`);
assert(read(folderImportFile).includes("webdav: 'deferred'"), `${folderImportFile}: WebDAV must remain deferred`);

if (failures.length) {
  console.error('FAIL validate-folder-sync-f5-desktop-runtime-drift-probe');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(JSON.stringify({
  schema: 'h2o.studio.folder-sync.f5-desktop-runtime-drift-probe.validation.v1',
  lane: 'folder-sync',
  phase: 'F5',
  f5Doc,
  f4CommitReferenced: F4_COMMIT,
  probeMode: 'manual-devtools-snippet-plus-fixture-contract',
  liveRuntimeExecutedHere: false,
  devtoolsBridgeAvailableHere: false,
  readOnly: true,
  writeCallCount: report.writeCallCount,
  driftClassesModeled: DRIFT_CLASSES,
  redactedDiagnostics: true,
  desktopDevtoolsSnippetCommand: 'node tools/validation/sync/validate-folder-sync-f5-desktop-runtime-drift-probe.mjs --print-devtools-snippet',
  folderSyncReady: false,
  publicPremiumBlocked: true,
  realRemoteWebdavDeferred: true,
  crossSurfaceFutureRequirement: 'desktop-chrome-native-extension-multi-device-mobile',
  metadataAllowlistExpectedCore: METADATA_CORE_TYPES,
  currentSourceMetadataAllowlist: currentApplied,
  metadataAllowlistOutOfScopeCaveat: metadataAllowlistCaveat,
  recommendedNext: 'F6-live-desktop-devtools-runtime-proof',
}, null, 2));
console.log('PASS validate-folder-sync-f5-desktop-runtime-drift-probe');
