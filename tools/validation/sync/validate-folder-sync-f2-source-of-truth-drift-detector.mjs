#!/usr/bin/env node
//
// Folder Sync Phase F2 - source-of-truth drift detector meta-validator.
//
// This is intentionally validator-only. It uses synthetic canonical/mirror snapshots to prove the
// SQLite-vs-FOLDER_STATE_DATA_KEY drift classes are detectable without live DB access, chrome.storage
// writes, reconciliation writes, runtime behavior changes, or product source edits.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const failures = [];

const f2Doc = 'release-evidence/2026-06-25/folder-sync-f2-source-of-truth-drift-detector.md';
const f1Doc = 'release-evidence/2026-06-25/folder-sync-f1-source-of-truth-reconciliation.md';
const foldersStoreFile = 'src-surfaces-base/studio/store/folders.tauri.js';
const folderSyncFile = 'src-surfaces-base/studio/sync/folder-sync.tauri.js';
const folderImportFile = 'src-surfaces-base/studio/sync/folder-import.mv3.js';

const METADATA_APPLIED_TYPES = [
  'chat-category-assign',
  'chat-category-clear',
  'chat-label-bind',
  'chat-tag-bind',
];

const REQUIRED_SOURCE_ANCHORS = [
  ['FOLDER_STATE_DATA_KEY', foldersStoreFile],
  ['h2o:prm:cgx:fldrs:state:data:v1', foldersStoreFile],
  ['removeFolderFromStateMirror', foldersStoreFile],
  ['restoreFolderToStateMirror', foldersStoreFile],
  ["syncPropagation: 'deferred'", foldersStoreFile],
  ['hardDeleteBlocked', foldersStoreFile],
  ['softDeleteEmptyFolder', foldersStoreFile],
  ['restoreTombstonedFolder', foldersStoreFile],
  ['noChatDelete: true', foldersStoreFile],
  ['sort_order', foldersStoreFile],
  ['h2o.studio.folder-delete-request.v1', folderSyncFile],
  ['h2o.studio.folder-restore-request.v1', folderSyncFile],
  ['h2o.studio.chat-folder-binding-request.v1', folderSyncFile],
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

function canonicalDeleted(canonical, folderId, row) {
  const tombstones = canonical.tombstones || {};
  const recentlyDeleted = new Set(canonical.recentlyDeletedFolderIds || []);
  return Boolean(row?.deleted || row?.tombstoned || tombstones[folderId]?.active || recentlyDeleted.has(folderId));
}

function mirrorDeleted(mirror, folderId, row) {
  const recentlyDeleted = new Set(mirror.recentlyDeletedFolderIds || []);
  return Boolean(row?.deleted || row?.tombstoned || row?.deletedAt || row?.tombstoneId || recentlyDeleted.has(folderId));
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

    const fieldPairs = [
      ['name', canonicalRow.name, mirrorRow.name],
      ['color', canonicalRow.color, mirrorRow.color],
      ['sortOrder', normalizeSortOrder(canonicalRow), normalizeSortOrder(mirrorRow)],
    ];

    let rowDiverged = false;
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

function assertDiagnosticCodes(label, diagnostics, expectedCodes) {
  const codes = new Set(diagnostics.map((diagnostic) => diagnostic.code));
  for (const code of expectedCodes) {
    assert(codes.has(code), `${label}: missing diagnostic code ${code}; got [${Array.from(codes).join(', ')}]`);
  }
}

const matchingCanonical = {
  folders: [
    {
      id: 'folder-private-alpha',
      name: 'Quarterly Planning Private',
      color: '#123abc',
      sort_order: 10,
      deleted: false,
    },
  ],
  bindings: {
    'folder-private-alpha': ['chat-private-one', 'chat-private-two'],
  },
  tombstones: {},
  recentlyDeletedFolderIds: [],
};

const matchingMirror = {
  folders: [
    {
      id: 'folder-private-alpha',
      name: 'Quarterly Planning Private',
      color: '#123abc',
      sortOrder: 10,
      deleted: false,
      source: 'desktop-sqlite',
      syncPropagation: 'current',
    },
  ],
  items: {
    'folder-private-alpha': ['chat-private-two', 'chat-private-one'],
  },
  recentlyDeletedFolderIds: [],
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

// ---- doc presence and posture ----
assert(exists(f2Doc), `${f2Doc}: missing`);
assert(exists(f1Doc), `${f1Doc}: missing`);
if (!exists(f2Doc)) {
  console.error('FAIL validate-folder-sync-f2-source-of-truth-drift-detector');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

const doc = read(f2Doc);
const flat = doc.replace(/\s+/g, ' ');

assert(doc.length > 4500, `${f2Doc}: evidence too short`);
assert(flat.includes('4039d7b'), 'F2 evidence must reference F1 commit 4039d7b');
for (const marker of [
  'VALIDATOR / DIAGNOSTIC ONLY',
  'No product runtime source was changed',
  'Folder sync readiness remains NOT READY',
  'Desktop SQLite `folders`',
  'FOLDER_STATE_DATA_KEY',
  'h2o:prm:cgx:fldrs:state:data:v1',
  "syncPropagation: 'deferred'",
  'Public/premium sync remains blocked',
  'Real remote WebDAV remains deferred',
  'Folder delete preserves chats',
  'No hard delete',
]) {
  assert(flat.includes(marker), `F2 evidence missing marker: ${marker}`);
}

for (const code of [
  'missing-mirror-folder',
  'extra-mirror-folder',
  'field-mismatch:name',
  'field-mismatch:color',
  'field-mismatch:sortOrder',
  'tombstone-status-mismatch',
  'binding-mismatch',
  'desktop-sqlite-source-diverged',
  'stale-deferred-propagation',
]) {
  assert(flat.includes(code), `F2 evidence missing drift class ${code}`);
}

// ---- real source anchors ----
for (const [token, file] of REQUIRED_SOURCE_ANCHORS) {
  assert(exists(file), `source file missing: ${file}`);
  if (exists(file)) assert(read(file).includes(token), `${file}: missing source anchor ${token}`);
  assert(flat.includes(token), `F2 evidence does not cite source anchor ${token}`);
}

// ---- synthetic drift model ----
const matchingDiagnostics = detectFolderSourceDrift(matchingCanonical, matchingMirror);
assert(matchingDiagnostics.length === 0, `matching canonical/mirror state should have no diagnostics: ${JSON.stringify(matchingDiagnostics)}`);

const missingMirror = detectFolderSourceDrift(matchingCanonical, { ...clone(matchingMirror), folders: [], items: {} });
assertDiagnosticCodes('missing mirror folder', missingMirror, ['missing-mirror-folder']);

const extraMirrorState = clone(matchingMirror);
extraMirrorState.folders.push({ id: 'folder-private-extra', name: 'Extra Private Folder', color: '#456def', sortOrder: 20 });
const extraMirror = detectFolderSourceDrift(matchingCanonical, extraMirrorState);
assertDiagnosticCodes('extra mirror folder', extraMirror, ['extra-mirror-folder']);

const fieldMismatchMirror = clone(matchingMirror);
fieldMismatchMirror.folders[0].name = 'Different Private Folder';
fieldMismatchMirror.folders[0].color = '#999999';
fieldMismatchMirror.folders[0].sortOrder = 42;
fieldMismatchMirror.folders[0].syncPropagation = 'deferred';
const fieldMismatch = detectFolderSourceDrift(matchingCanonical, fieldMismatchMirror);
assertDiagnosticCodes('field mismatch', fieldMismatch, [
  'field-mismatch:name',
  'field-mismatch:color',
  'field-mismatch:sortOrder',
  'desktop-sqlite-source-diverged',
  'stale-deferred-propagation',
]);

const tombstoneMirror = clone(matchingMirror);
tombstoneMirror.folders[0].deleted = true;
const tombstoneMismatch = detectFolderSourceDrift(matchingCanonical, tombstoneMirror);
assertDiagnosticCodes('tombstone mismatch', tombstoneMismatch, [
  'tombstone-status-mismatch',
  'desktop-sqlite-source-diverged',
]);

const bindingMirror = clone(matchingMirror);
bindingMirror.items['folder-private-alpha'] = ['chat-private-two'];
const bindingMismatch = detectFolderSourceDrift(matchingCanonical, bindingMirror);
assertDiagnosticCodes('binding mismatch', bindingMismatch, [
  'binding-mismatch',
  'desktop-sqlite-source-diverged',
]);

const emittedDiagnostics = JSON.stringify([
  missingMirror,
  extraMirror,
  fieldMismatch,
  tombstoneMismatch,
  bindingMismatch,
]);
for (const rawPrivateValue of [
  'Quarterly Planning Private',
  'Different Private Folder',
  'Extra Private Folder',
  'chat-private-one',
  'chat-private-two',
  'folder-private-alpha',
  'folder-private-extra',
]) {
  assert(!emittedDiagnostics.includes(rawPrivateValue), `diagnostics leaked raw private fixture value: ${rawPrivateValue}`);
}
assert(emittedDiagnostics.includes('sha256:'), 'diagnostics must be hash/redacted');

// ---- metadata lane untouched ----
assert(exists(folderSyncFile), `${folderSyncFile}: missing`);
assert(exists(folderImportFile), `${folderImportFile}: missing`);
const currentFolderSync = read(folderSyncFile);
const currentFolderImport = read(folderImportFile);
const currentApplied = parseMetadataAllowlist(currentFolderSync);
const expectedApplied = METADATA_APPLIED_TYPES.slice().sort();
let metadataAllowlistCaveat = false;
assert(Array.isArray(currentApplied), 'could not parse applied metadata allowlist');
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
assert(currentFolderSync.includes("webdav: 'deferred'"), `${folderSyncFile}: WebDAV must remain deferred`);
assert(currentFolderImport.includes("webdav: 'deferred'"), `${folderImportFile}: WebDAV must remain deferred`);

if (failures.length) {
  console.error('FAIL validate-folder-sync-f2-source-of-truth-drift-detector');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(JSON.stringify({
  schema: 'h2o.studio.folder-sync.f2-source-of-truth-drift-detector.v1',
  lane: 'folder-sync',
  phase: 'F2',
  f2Doc,
  validatorOnly: true,
  diagnosticOnly: true,
  f1CommitReferenced: '4039d7b',
  canonicalOwner: 'desktop-sqlite-folders',
  renderMirror: 'FOLDER_STATE_DATA_KEY',
  mirrorKey: 'h2o:prm:cgx:fldrs:state:data:v1',
  driftClassesDetected: [
    'missing-mirror-folder',
    'extra-mirror-folder',
    'field-mismatch:name',
    'field-mismatch:color',
    'field-mismatch:sortOrder',
    'tombstone-status-mismatch',
    'binding-mismatch',
    'desktop-sqlite-source-diverged',
    'stale-deferred-propagation',
  ],
  redactedDiagnostics: true,
  sourceAnchorsVerified: REQUIRED_SOURCE_ANCHORS.length,
  folderSyncReady: false,
  publicPremiumBlocked: true,
  realRemoteWebdavDeferred: true,
  metadataAllowlistExpected: METADATA_APPLIED_TYPES,
  currentSourceMetadataAllowlist: currentApplied,
  metadataAllowlistOutOfScopeCaveat: metadataAllowlistCaveat,
  recommendedNext: 'F3-read-only-live-drift-report-probe',
}, null, 2));
console.log('PASS validate-folder-sync-f2-source-of-truth-drift-detector');
