#!/usr/bin/env node
//
// Folder Sync Phase F3 - read-only live drift probe contract validator.
//
// This validator models the live probe through read-only adapters and writer traps. It does not attach
// to a running Desktop Studio instance, open a live SQLite DB, write chrome.storage, repair the mirror,
// or alter product runtime behavior.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const failures = [];

const f3Doc = 'release-evidence/2026-06-25/folder-sync-f3-read-only-live-drift-probe.md';
const f2Doc = 'release-evidence/2026-06-25/folder-sync-f2-source-of-truth-drift-detector.md';
const foldersStoreFile = 'src-surfaces-base/studio/store/folders.tauri.js';
const bridgeFile = 'src-surfaces-base/studio/dev/folder-sync-rc-smoke-bridge.studio.js';
const folderSyncFile = 'src-surfaces-base/studio/sync/folder-sync.tauri.js';
const folderImportFile = 'src-surfaces-base/studio/sync/folder-import.mv3.js';

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

const METADATA_APPLIED_TYPES = [
  'chat-category-assign',
  'chat-category-clear',
  'chat-label-bind',
  'chat-tag-bind',
];

const READ_SOURCE_ANCHORS = [
  ['function listFolders', foldersStoreFile],
  ['function getAll() { return listFolders(); }', foldersStoreFile],
  ['function listRecentlyDeletedFolders', foldersStoreFile],
  ['function listCanonicalChatFolderBindings', foldersStoreFile],
  ['function getCanonicalChatFolderBindingForChat', foldersStoreFile],
  ['function listCanonicalChatFolderBindingsForChat', foldersStoreFile],
  ['FOLDER_STATE_DATA_KEY', foldersStoreFile],
  ['chromeStorageGet(FOLDER_STATE_DATA_KEY)', foldersStoreFile],
  ['listCanonicalChatFolderBindings', bridgeFile],
  ['listRecentlyDeletedFolders', bridgeFile],
  ['chromeStorageGet(FOLDER_STATE_DATA_KEY)', bridgeFile],
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
  'chromeStorageSet',
  'writeTombstone',
  'writeBinding',
  'repairMirror',
  'reconcileMirror',
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
  diagnostics.push({
    code,
    folder: redact('folder', folderId),
    ...detail,
  });
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
    const fieldPairs = [
      ['name', canonicalRow.name, mirrorRow.name],
      ['color', canonicalRow.color, mirrorRow.color],
      ['sortOrder', normalizeSortOrder(canonicalRow), normalizeSortOrder(mirrorRow)],
    ];
    for (const [field, canonicalValue, mirrorValue] of fieldPairs) {
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

function fixtureAdapters() {
  const calls = [];
  const canonicalFolders = [
    {
      id: 'folder-secret-alpha',
      name: 'Mobile Device Private Folder',
      color: '#111111',
      sort_order: 1,
      deleted: false,
    },
    {
      id: 'folder-secret-beta',
      name: 'Desktop Only Private Folder',
      color: '#222222',
      sort_order: 2,
      deleted: false,
    },
    {
      id: 'folder-secret-gamma',
      name: 'Tombstone Private Folder',
      color: '#333333',
      sort_order: 3,
      deleted: true,
    },
  ];
  const recentlyDeleted = [{ folderId: 'folder-secret-gamma', tombstoneId: 'tombstone-private-gamma' }];
  const bindings = [
    { folderId: 'folder-secret-alpha', chatId: 'chat-private-alpha-one' },
    { folderId: 'folder-secret-alpha', chatId: 'chat-private-alpha-two' },
    { folderId: 'folder-secret-gamma', chatId: 'chat-private-gamma-one' },
  ];
  const mirror = {
    folders: [
      {
        id: 'folder-secret-alpha',
        name: 'Mirror Diverged Private Folder',
        color: '#999999',
        sortOrder: 5,
        deleted: false,
        source: 'desktop-sqlite',
        syncPropagation: 'deferred',
      },
      {
        id: 'folder-secret-gamma',
        name: 'Tombstone Private Folder',
        color: '#333333',
        sortOrder: 3,
        deleted: false,
        source: 'desktop-sqlite',
      },
      {
        id: 'folder-secret-extra',
        name: 'Extra Mirror Private Folder',
        color: '#444444',
        sortOrder: 4,
        source: 'desktop-sqlite',
      },
    ],
    items: {
      'folder-secret-alpha': ['chat-private-alpha-one'],
      'folder-secret-gamma': ['chat-private-gamma-one'],
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
    peer: { peerId: 'mobile-peer-private-001', deviceId: 'chrome-extension-device-private-001' },
    readCanonicalFolders: readOnly('store.folders.getAll', canonicalFolders),
    readRecentlyDeletedFolders: readOnly('store.folders.listRecentlyDeletedFolders', recentlyDeleted),
    readCanonicalBindings: readOnly('store.folders.listCanonicalChatFolderBindings', bindings),
    readMirror: readOnly('chromeStorageGet(FOLDER_STATE_DATA_KEY)', mirror),
    writers,
  };
}

function buildCanonicalSnapshot(folders, recentlyDeletedRows, bindingRows) {
  const bindings = {};
  for (const row of bindingRows || []) {
    const folderId = normalizeFolderId(row);
    const chatId = String(row?.chatId || row?.chat_id || '');
    if (!folderId || !chatId) continue;
    if (!bindings[folderId]) bindings[folderId] = [];
    bindings[folderId].push(chatId);
  }
  const recentlyDeletedFolderIds = [];
  const tombstones = {};
  for (const row of recentlyDeletedRows || []) {
    const folderId = normalizeFolderId(row);
    if (!folderId) continue;
    recentlyDeletedFolderIds.push(folderId);
    tombstones[folderId] = { active: true };
  }
  return { folders, bindings, recentlyDeletedFolderIds, tombstones };
}

async function runReadOnlyDriftProbe(adapters) {
  const [folders, recentlyDeleted, bindingRows, mirror] = await Promise.all([
    adapters.readCanonicalFolders(),
    adapters.readRecentlyDeletedFolders(),
    adapters.readCanonicalBindings(),
    adapters.readMirror(),
  ]);
  const canonical = buildCanonicalSnapshot(folders, recentlyDeleted, bindingRows);
  const diagnostics = detectFolderSourceDrift(canonical, mirror);
  return {
    schema: 'h2o.studio.folder-sync.f3-read-only-live-drift-report.v1',
    mode: 'read-only-fixture-backed-contract',
    canonicalReadPath: 'H2O.Studio.store.folders.getAll',
    recentlyDeletedReadPath: 'H2O.Studio.store.folders.listRecentlyDeletedFolders',
    bindingReadPath: 'H2O.Studio.store.folders.listCanonicalChatFolderBindings',
    mirrorReadPath: 'chromeStorageGet(FOLDER_STATE_DATA_KEY)',
    peer: redact('peer', adapters.peer),
    diagnostics,
    counts: {
      diagnosticCount: diagnostics.length,
      writeCallCount: adapters.calls.filter((call) => call.mode === 'write').length,
    },
    safety: {
      readOnly: true,
      noSqliteMutation: true,
      noChromeStorageMutation: true,
      noMirrorRepair: true,
      noTombstoneWrite: true,
      noBindingWrite: true,
      noReconciliationWrite: true,
      noHardDelete: true,
      folderDeletePreservesChats: true,
      folderSyncReady: false,
      publicPremiumBlocked: true,
      realRemoteWebdavDeferred: true,
      productSyncReady: false,
    },
  };
}

function assertCodes(report, codes) {
  const observed = new Set(report.diagnostics.map((diagnostic) => diagnostic.code));
  for (const code of codes) assert(observed.has(code), `probe report missing drift class ${code}`);
}

assert(exists(f3Doc), `${f3Doc}: missing`);
assert(exists(f2Doc), `${f2Doc}: missing`);
if (!exists(f3Doc)) {
  console.error('FAIL validate-folder-sync-f3-read-only-live-drift-probe');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

const doc = read(f3Doc);
const flat = doc.replace(/\s+/g, ' ');

assert(doc.length > 5000, `${f3Doc}: evidence too short`);
for (const marker of [
  'ef4fb16',
  'READ-ONLY / DIAGNOSTIC ONLY',
  'No product runtime source was changed',
  'FOLDER_STATE_DATA_KEY',
  'H2O.Studio.store.folders.getAll()',
  'H2O.Studio.store.folders.listRecentlyDeletedFolders()',
  'H2O.Studio.store.folders.listCanonicalChatFolderBindings()',
  'chromeStorageGet(FOLDER_STATE_DATA_KEY)',
  'Desktop Studio + Chrome/native extension multi-device + mobile-app parity',
  'Folder sync remains NOT READY',
  'Public/premium sync remains blocked',
  'Real remote WebDAV remains deferred',
  'No hard delete',
  'Folder delete preserves chats',
]) {
  assert(flat.includes(marker), `F3 evidence missing marker: ${marker}`);
}
for (const code of DRIFT_CLASSES) assert(flat.includes(code), `F3 evidence missing drift class ${code}`);

for (const [token, file] of READ_SOURCE_ANCHORS) {
  assert(exists(file), `source file missing: ${file}`);
  if (exists(file)) assert(read(file).includes(token), `${file}: missing read source anchor ${token}`);
}

const adapters = fixtureAdapters();
const report = await runReadOnlyDriftProbe(adapters);
assertCodes(report, DRIFT_CLASSES);
assert(report.counts.writeCallCount === 0, `probe must not invoke writers, got ${report.counts.writeCallCount}`);
for (const call of adapters.calls) assert(call.mode === 'read', `probe made non-read call ${JSON.stringify(call)}`);
for (const key of [
  'readOnly',
  'noSqliteMutation',
  'noChromeStorageMutation',
  'noMirrorRepair',
  'noTombstoneWrite',
  'noBindingWrite',
  'noReconciliationWrite',
  'noHardDelete',
  'folderDeletePreservesChats',
  'publicPremiumBlocked',
  'realRemoteWebdavDeferred',
]) {
  assert(report.safety[key] === true, `probe safety flag must be true: ${key}`);
}
assert(report.safety.folderSyncReady === false, 'folder sync must remain NOT READY');
assert(report.safety.productSyncReady === false, 'product sync must remain globally NOT READY');

const emitted = JSON.stringify(report);
for (const rawPrivateValue of [
  'Mobile Device Private Folder',
  'Desktop Only Private Folder',
  'Tombstone Private Folder',
  'Mirror Diverged Private Folder',
  'Extra Mirror Private Folder',
  'chat-private-alpha-one',
  'chat-private-alpha-two',
  'chat-private-gamma-one',
  'folder-secret-alpha',
  'folder-secret-beta',
  'folder-secret-gamma',
  'folder-secret-extra',
  'mobile-peer-private-001',
  'chrome-extension-device-private-001',
]) {
  assert(!emitted.includes(rawPrivateValue), `probe report leaked raw private fixture value: ${rawPrivateValue}`);
}
assert(emitted.includes('sha256:'), 'probe report must contain redacted hashes');

// The lane is not modified by F3. Current source may contain known unrelated metadata WIP; this
// validator reports it as a caveat rather than claiming F3 changed it.
const currentApplied = parseMetadataAllowlist(read(folderSyncFile));
const expectedApplied = METADATA_APPLIED_TYPES.slice().sort();
let metadataAllowlistCaveat = false;
assert(Array.isArray(currentApplied), 'could not parse metadata applied allowlist');
if (Array.isArray(currentApplied)) {
  const sorted = currentApplied.slice().sort();
  const knownOutOfScopeExtras = ['chat-label-unbind', 'chat-tag-unbind'];
  const expectedWithKnownCaveat = METADATA_APPLIED_TYPES.concat(knownOutOfScopeExtras).sort();
  const exactExpected = sorted.length === expectedApplied.length &&
    sorted.every((type, index) => type === expectedApplied[index]);
  const knownCaveatOnly = sorted.length === expectedWithKnownCaveat.length &&
    sorted.every((type, index) => type === expectedWithKnownCaveat[index]);
  metadataAllowlistCaveat = !exactExpected && knownCaveatOnly;
  assert(exactExpected || knownCaveatOnly,
    `metadata applied allowlist drifted beyond known caveat: expected [${expectedApplied.join(', ')}], got [${sorted.join(', ')}]`);
}
assert(read(folderSyncFile).includes("webdav: 'deferred'"), `${folderSyncFile}: WebDAV must remain deferred`);
assert(read(folderImportFile).includes("webdav: 'deferred'"), `${folderImportFile}: WebDAV must remain deferred`);

if (failures.length) {
  console.error('FAIL validate-folder-sync-f3-read-only-live-drift-probe');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(JSON.stringify({
  schema: 'h2o.studio.folder-sync.f3-read-only-live-drift-probe.validation.v1',
  lane: 'folder-sync',
  phase: 'F3',
  f3Doc,
  f2CommitReferenced: 'ef4fb16',
  probeMode: 'fixture-backed-contract-only',
  readOnly: true,
  liveRuntimeAttached: false,
  readPaths: {
    canonicalFolders: 'H2O.Studio.store.folders.getAll',
    recentlyDeleted: 'H2O.Studio.store.folders.listRecentlyDeletedFolders',
    canonicalBindings: 'H2O.Studio.store.folders.listCanonicalChatFolderBindings',
    renderMirror: 'chromeStorageGet(FOLDER_STATE_DATA_KEY)',
  },
  driftClassesModeled: DRIFT_CLASSES,
  redactedDiagnostics: true,
  writeCallCount: report.counts.writeCallCount,
  folderSyncReady: false,
  publicPremiumBlocked: true,
  realRemoteWebdavDeferred: true,
  crossSurfaceFutureRequirement: 'desktop-chrome-multi-device-mobile',
  metadataAllowlistExpected: METADATA_APPLIED_TYPES,
  currentSourceMetadataAllowlist: currentApplied,
  metadataAllowlistOutOfScopeCaveat: metadataAllowlistCaveat,
  recommendedNext: 'F4-disabled-desktop-devtools-live-drift-probe',
}, null, 2));
console.log('PASS validate-folder-sync-f3-read-only-live-drift-probe');
