#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import vm from 'node:vm';
import { TextEncoder } from 'node:util';
import { webcrypto } from 'node:crypto';

const root = process.cwd();
const failures = [];

const proofSchema = 'h2o.studio.sync.chrome-desktop-live-parity-proof.v1';
const proofVersion = '0.1.0-f19.3';
const paritySchema = 'h2o.studio.sync.chrome-desktop-library-parity.v1';
const snapshotSchema = 'h2o.studio.sync.library-parity-snapshot.v1';
const chromeExportCoverageSchema = 'h2o.studio.sync.chrome-export-coverage.v1';

const contractFile = 'docs/systems/cross-platform/f19.3-live-chrome-desktop-parity-proof-contract.md';
const closureContractFile = 'docs/systems/cross-platform/f19.5-premium-sync-closure-evidence.md';
const hardeningContractFile = 'docs/systems/cross-platform/f19.4-chrome-desktop-sync-hardening-contract.md';
const parityModuleFile = 'src-surfaces-base/studio/sync/library/library-chrome-desktop-parity-diagnostic.js';
const chromeDesktopPropagationValidator = 'tools/validation/sync/validate-f19-chrome-desktop-propagation.mjs';
const desktopChromePropagationValidator = 'tools/validation/sync/validate-f19-desktop-chrome-propagation.mjs';
const parityValidator = 'tools/validation/sync/validate-f19-chrome-desktop-library-parity.mjs';
const hardeningValidator = 'tools/validation/sync/validate-f19-sync-hardening.mjs';
const chromeAutoImportFile = 'src-surfaces-base/studio/sync/auto-import.mv3.js';

const supportedFields = [
  'total',
  'saved',
  'linked',
  'pinned',
  'archived',
  'folders',
  'categories',
  'recents',
  'rows'
];

const deferredFields = [
  'labels',
  'tags',
  'projects',
  'chat-folder-bindings',
  'tombstones',
  'sync-apply-events',
  'unsupported-storage-kv'
];

const supportedMismatchFields = new Set([
  'counts.total',
  'counts.saved',
  'counts.linked',
  'counts.pinned',
  'counts.archived',
  'counts.folders',
  'counts.categories',
  'hashes.folders',
  'hashes.categories',
  'hashes.recents',
  'hashes.rows',
  'chrome.sourceAvailable',
  'desktop.sourceAvailable',
  'chrome.schema',
  'desktop.schema'
]);

const deferredMismatchCodes = new Set([
  'library-parity-label-mismatch',
  'library-parity-project-mismatch'
]);

const requiredDeferredWarnings = [
  'library-propagation-labels-deferred',
  'library-propagation-tags-deferred',
  'library-propagation-projects-deferred',
  'library-propagation-chat-folder-bindings-deferred',
  'library-propagation-tombstones-deferred',
  'library-propagation-apply-events-deferred',
  'library-propagation-unsupported-storage-deferred'
];

const requiredHardeningCodes = [
  'sync-folder-missing',
  'permission-denied',
  'transport-file-missing',
  'transport-file-malformed',
  'transport-schema-unsupported',
  'transport-stale',
  'duplicate-import-idempotent',
  'local-newer-conflict',
  'simultaneous-update-conflict',
  'deferred-field-present',
  'unsupported-field-present',
  'source-metadata-missing',
  'parity-peer-snapshot-required'
];

const requiredChromeExportCoverageFields = [
  'snapshotTotal',
  'snapshotSaved',
  'snapshotLinked',
  'bundleChatCount',
  'bundleSavedCount',
  'bundleLinkedCount',
  'missingRowCount',
  'missingRowTypeCounts'
];

const forbiddenNeedles = [
  'Private Title',
  'Private Folder',
  'Private Category',
  'Private Project',
  'Private message',
  'raw-chat-id',
  'raw-folder-id',
  'raw-category-id',
  'desktop-chat-id',
  'desktop-folder-id',
  'chrome-chat-id',
  'chrome-folder-id',
  'chat_id',
  'folder_id',
  'category_id',
  'chats.category_id'
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

function assertExists(file) {
  assert(exists(file), `${file}: missing`);
}

function assertContains(file, needle, label = needle) {
  const text = read(file);
  assert(text.includes(needle), `${file}: missing ${label}`);
}

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { json: false, proof: '' };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--json') out.json = true;
    else if (arg === '--proof') {
      out.proof = String(args[i + 1] || '');
      i += 1;
    } else if (arg.startsWith('--proof=')) {
      out.proof = arg.slice('--proof='.length);
    }
  }
  return out;
}

function makeSnapshot(surface, extras = {}) {
  return {
    schema: snapshotSchema,
    version: '0.1.0-f19.1.a',
    surface,
    sourceType: surface === 'chrome-studio' ? 'chrome-library-index' : 'desktop-sqlite-library-index',
    sourceAvailable: true,
    sourceMetadata: {
      platformAdapter: surface === 'chrome-studio' ? 'mv3' : 'tauri',
      isTauri: surface === 'desktop-studio',
      isChromeRuntime: surface === 'chrome-studio',
      libraryIndexAvailable: true,
      libraryIndexRows: 2,
      libraryIndexSource: surface === 'chrome-studio' ? 'chrome-fixture' : 'desktop-fixture',
      catalogSources: {
        folders: 'fixture',
        labels: 'fixture',
        categories: 'fixture',
        projects: 'fixture'
      },
      identityKnown: true,
      workspaceKnown: true,
      snapshotMode: 'cache-only-read-only'
    },
    counts: {
      total: 2,
      saved: 1,
      linked: 1,
      pinned: 1,
      archived: 0,
      folders: 1,
      labels: extras.labels ?? 0,
      categories: 1,
      projects: extras.projects ?? 0
    },
    hashes: {
      rows: 'hash-supported-rows',
      folders: 'hash-folder',
      labels: extras.labelHash || 'hash-empty-labels',
      categories: 'hash-category',
      projects: extras.projectHash || 'hash-empty-projects',
      recents: 'hash-recents'
    },
    warnings: [],
    observedAtIso: '2026-06-14T00:00:00.000Z'
  };
}

function buildContext() {
  const context = {
    console,
    TextEncoder,
    crypto: webcrypto,
    Date,
    H2O: {
      Studio: {
        sync: {}
      }
    }
  };
  context.window = context;
  context.globalThis = context;
  return vm.createContext(context);
}

function partitionMismatches(parity) {
  const mismatches = Array.isArray(parity?.mismatches) ? parity.mismatches : [];
  const supported = [];
  const deferred = [];
  for (const mismatch of mismatches) {
    const field = String(mismatch?.field || '');
    const code = String(mismatch?.code || '');
    if (supportedMismatchFields.has(field)) supported.push(mismatch);
    else if (deferredMismatchCodes.has(code)) deferred.push(mismatch);
    else supported.push(mismatch);
  }
  return { supported, deferred };
}

function propagationResult(direction) {
  const warnings = direction === 'chrome-to-desktop'
    ? [
      'library-propagation-labels-deferred',
      'library-propagation-tags-deferred',
      'library-propagation-projects-deferred',
      'library-propagation-chat-folder-bindings-deferred',
      'library-propagation-unsupported-storage-deferred'
    ]
    : requiredDeferredWarnings.slice();
  return {
    schema: 'h2o.studio.sync.chrome-desktop-propagation.v1',
    version: direction === 'chrome-to-desktop' ? '0.1.0-f19.2.b' : '0.1.0-f19.2.c',
    ok: true,
    direction,
    transport: direction === 'chrome-to-desktop' ? 'chrome-latest.json' : 'latest.json',
    status: 'imported',
    conflictDecision: direction === 'desktop-to-chrome' ? 'approve-merge' : '',
    conflictApproved: direction === 'desktop-to-chrome',
    conflictApproval: direction === 'desktop-to-chrome' ? {
      approved: true,
      decision: 'approve-merge',
      approvedBlockers: ['library-propagation-simultaneous-update-conflict'],
      staleTransportStillBlocks: true,
      duplicateIdempotencyPreserved: true
    } : {
      approved: false,
      decision: '',
      approvedBlockers: [],
      staleTransportStillBlocks: true,
      duplicateIdempotencyPreserved: true
    },
    supportedFields: [
      'saved-chat-records',
      'linked-chat-records',
      'folder-metadata',
      'category-metadata',
      'chat-category-bindings'
    ],
    deferredFields: warnings.slice(),
    sourceSummary: {
      chatCount: 2,
      savedCount: 1,
      linkedCount: 1,
      pinnedCount: 1,
      archivedCount: 0,
      folderCount: 1,
      categoryCount: 1
    },
    importSummary: direction === 'desktop-to-chrome' ? {
      ok: true,
      shellRowsIncoming: 1,
      shellRowsMaterialized: 1,
      shellRowsExisting: 0,
      shellRowsSatisfied: 1,
      shellRowsFailed: 0,
      redactedErrorCategories: []
    } : null,
    convergence: direction === 'desktop-to-chrome' ? {
      ok: true,
      expected: {
        total: 2,
        saved: 1,
        linked: 1,
        pinned: 1,
        archived: 0,
        folders: 1,
        categories: 1
      },
      observed: {
        total: 2,
        saved: 1,
        linked: 1,
        pinned: 1,
        archived: 0,
        folders: 1,
        categories: 1
      },
      mismatchCount: 0,
      mismatches: [],
      blocker: ''
    } : null,
    privacy: {
      redacted: true,
      rawIdsReturned: false,
      rawTitlesReturned: false,
      rawContentReturned: false
    },
    hardening: {
      taxonomy: {
        syncFolderMissing: 'sync-folder-missing',
        permissionDenied: 'permission-denied',
        transportFileMissing: 'transport-file-missing',
        transportFileMalformed: 'transport-file-malformed',
        transportSchemaUnsupported: 'transport-schema-unsupported',
        transportStale: 'transport-stale',
        duplicateImportIdempotent: 'duplicate-import-idempotent',
        localNewerConflict: 'local-newer-conflict',
        simultaneousUpdateConflict: 'simultaneous-update-conflict',
        deferredFieldPresent: 'deferred-field-present',
        unsupportedFieldPresent: 'unsupported-field-present',
        sourceMetadataMissing: 'source-metadata-missing',
        parityPeerSnapshotRequired: 'parity-peer-snapshot-required'
      },
      duplicateImportIdempotent: false,
      staleBlocked: false,
      simultaneousConflictBlocked: false,
      deferredFieldsExplicit: true,
      unsupportedFieldsExplicit: warnings.includes('library-propagation-unsupported-storage-deferred'),
      sourceMetadataChecked: false
    },
    sideEffects: {
      chromeStorageWritten: false,
      desktopSqliteWritten: false,
      nativeCalled: false
    },
    blockers: [],
    warnings,
    observedAt: '2026-06-14T00:00:00.000Z'
  };
}

function chromeExportCoverageFixture() {
  return {
    schema: chromeExportCoverageSchema,
    ok: true,
    sourcePolicy: 'library-index-supported-rows',
    snapshotTotal: 2,
    snapshotSaved: 1,
    snapshotLinked: 1,
    snapshotPinned: 1,
    snapshotArchived: 0,
    bundleOriginalChatCount: 1,
    bundleChatCount: 2,
    bundleSavedCount: 1,
    bundleLinkedCount: 1,
    bundlePinnedCount: 1,
    bundleArchivedCount: 0,
    missingRowCount: 1,
    addedMinimalRowCount: 1,
    unexportableRowCount: 0,
    missingRowTypeCounts: {
      linkedOnly: 1,
      savedOnly: 0,
      registryOnly: 1,
      archiveBacked: 0,
      pinned: 0
    },
    blockers: [],
    warnings: ['chrome-export-source-coverage-minimal-rows-added'],
    privacy: {
      redacted: true,
      rawIdsReturned: false,
      rawTitlesReturned: false,
      rawContentReturned: false
    }
  };
}

function makeProof(finalParity) {
  const partition = partitionMismatches(finalParity);
  return {
    schema: proofSchema,
    version: proofVersion,
    ok: partition.supported.length === 0,
    status: partition.supported.length === 0 ? 'supported-parity-ready' : 'supported-parity-blocked',
    headCommit: 'synthetic-vm-proof',
    syncFolder: {
      configured: true,
      transport: 'local-sync-folder',
      latestJsonSeen: true,
      chromeLatestJsonSeen: true
    },
    snapshots: {
      chromeBefore: makeSnapshot('chrome-studio', { labels: 2, labelHash: 'hash-chrome-labels' }),
      desktopBefore: makeSnapshot('desktop-studio', { labels: 0, labelHash: 'hash-empty-labels' }),
      chromeAfter: makeSnapshot('chrome-studio', { labels: 2, labelHash: 'hash-chrome-labels' }),
      desktopAfter: makeSnapshot('desktop-studio', { labels: 0, labelHash: 'hash-empty-labels' })
    },
    parity: {
      initial: finalParity,
      final: finalParity,
      supportedOk: partition.supported.length === 0,
      supportedMismatchCount: partition.supported.length,
      deferredMismatchCount: partition.deferred.length,
      supportedMismatches: partition.supported,
      deferredMismatches: partition.deferred
    },
    propagation: {
      chromeToDesktop: propagationResult('chrome-to-desktop'),
      desktopToChrome: propagationResult('desktop-to-chrome')
    },
    chromeExportCoverage: chromeExportCoverageFixture(),
    supportedFields,
    deferredFields,
    privacy: {
      ok: true,
      redacted: true,
      rawLeakCount: 0
    },
    safety: {
      proofMode: 'synthetic-fixture',
      realBusinessWritesExpected: false,
      unexpectedSideEffects: false
    },
    blockers: [],
    warnings: ['f19-live-proof-synthetic-only'],
    observedAtIso: '2026-06-14T00:00:00.000Z'
  };
}

async function runSyntheticProof() {
  const context = buildContext();
  vm.runInContext(read(parityModuleFile), context, { filename: parityModuleFile });
  const api = context.H2O.Studio.sync.libraryParity;
  assert(api?.__installed === true, 'parity API marker missing in VM proof');
  assert(api?.paritySchema === paritySchema, 'parity schema marker mismatch');
  const chrome = makeSnapshot('chrome-studio', { labels: 2, labelHash: 'hash-chrome-labels' });
  const desktop = makeSnapshot('desktop-studio', { labels: 0, labelHash: 'hash-empty-labels' });
  const parity = api.compareSnapshots(chrome, desktop);
  assert(parity.schema === paritySchema, 'synthetic parity schema mismatch');
  assert(parity.ok === false, 'synthetic parity should retain deferred mismatch');
  const partition = partitionMismatches(parity);
  assert(partition.supported.length === 0, 'deferred-only proof produced supported mismatches');
  assert(partition.deferred.length > 0, 'deferred mismatch partition should not be empty');
  const proof = makeProof(parity);
  validateProofObject(proof, { synthetic: true });
  return proof;
}

function collectCodes(value, out = []) {
  if (Array.isArray(value)) {
    value.forEach((entry) => collectCodes(entry, out));
    return out;
  }
  if (!value || typeof value !== 'object') return out;
  if (typeof value.code === 'string') out.push(value.code);
  if (typeof value === 'object') {
    Object.values(value).forEach((entry) => collectCodes(entry, out));
  }
  return out;
}

function validatePropagationResult(result, direction) {
  assert(result && typeof result === 'object', `${direction}: propagation result missing`);
  if (!result || typeof result !== 'object') return;
  assert(result.schema === 'h2o.studio.sync.chrome-desktop-propagation.v1', `${direction}: propagation schema mismatch`);
  assert(result.direction === direction, `${direction}: direction mismatch`);
  assert(result.ok === true || result.status === 'already-imported', `${direction}: propagation must pass or be idempotent`);
  assert(Array.isArray(result.warnings), `${direction}: warnings must be array`);
  assert(result.hardening && typeof result.hardening === 'object', `${direction}: F19.4 hardening summary missing`);
  if (direction === 'desktop-to-chrome') {
    const blockers = Array.isArray(result.blockers) ? result.blockers : [];
    assert(result.convergence && result.convergence.ok === true, `${direction}: convergence proof missing or not ok`);
    assert(Number(result.convergence?.mismatchCount || 0) === 0, `${direction}: convergence mismatch count must be zero`);
    assert(!blockers.includes('desktop-to-chrome-convergence-not-proven'), `${direction}: convergence blocker must not be present`);
    assert(result.importSummary && typeof result.importSummary === 'object', `${direction}: import summary missing`);
    assert(Number(result.importSummary.shellRowsFailed || 0) === 0, `${direction}: shell row failures must be zero`);
    assert(Array.isArray(result.importSummary.redactedErrorCategories), `${direction}: redacted error categories missing`);
    assert(!blockers.includes('desktop-shell-row-import-unsupported'), `${direction}: shell row unsupported blocker must not be present`);
  }
  for (const code of requiredHardeningCodes) {
    assert(result.hardening?.taxonomy && Object.values(result.hardening.taxonomy).includes(code), `${direction}: hardening taxonomy missing ${code}`);
  }
  assert(result.privacy && result.privacy.redacted === true, `${direction}: propagation privacy redaction missing`);
  assert(result.privacy && result.privacy.rawIdsReturned === false, `${direction}: propagation raw ID flag unsafe`);
  assert(result.privacy && result.privacy.rawTitlesReturned === false, `${direction}: propagation raw title flag unsafe`);
  assert(result.privacy && result.privacy.rawContentReturned === false, `${direction}: propagation raw content flag unsafe`);
  if (result.conflictDecision || result.conflictApproved === true) {
    assert(result.conflictDecision === 'approve-merge', `${direction}: approved conflict decision must be approve-merge`);
    assert(result.conflictApproved === true, `${direction}: conflictApproved must be true when decision is present`);
    assert(result.conflictApproval?.staleTransportStillBlocks === true, `${direction}: stale transport must still block`);
    assert(result.conflictApproval?.duplicateIdempotencyPreserved === true, `${direction}: duplicate idempotency must be preserved`);
  }
}

function validateChromeExportCoverage(coverage) {
  assert(coverage && typeof coverage === 'object', 'chromeExportCoverage missing');
  if (!coverage || typeof coverage !== 'object') return;
  assert(coverage.schema === chromeExportCoverageSchema, 'chromeExportCoverage schema mismatch');
  assert(coverage.ok === true, 'chromeExportCoverage must be ok');
  for (const field of requiredChromeExportCoverageFields) {
    assert(Object.prototype.hasOwnProperty.call(coverage, field), `chromeExportCoverage missing ${field}`);
  }
  assert(Number(coverage.snapshotTotal) === Number(coverage.bundleChatCount), 'chromeExportCoverage snapshotTotal must equal bundleChatCount');
  assert(Number(coverage.snapshotSaved) === Number(coverage.bundleSavedCount), 'chromeExportCoverage snapshotSaved must equal bundleSavedCount');
  assert(Number(coverage.snapshotLinked) === Number(coverage.bundleLinkedCount), 'chromeExportCoverage snapshotLinked must equal bundleLinkedCount');
  if (Object.prototype.hasOwnProperty.call(coverage, 'snapshotPinned') && Object.prototype.hasOwnProperty.call(coverage, 'bundlePinnedCount')) {
    assert(Number(coverage.snapshotPinned) === Number(coverage.bundlePinnedCount), 'chromeExportCoverage snapshotPinned must equal bundlePinnedCount');
  }
  if (Object.prototype.hasOwnProperty.call(coverage, 'snapshotArchived') && Object.prototype.hasOwnProperty.call(coverage, 'bundleArchivedCount')) {
    assert(Number(coverage.snapshotArchived) === Number(coverage.bundleArchivedCount), 'chromeExportCoverage snapshotArchived must equal bundleArchivedCount');
  }
  assert(Number(coverage.unexportableRowCount || 0) === 0, 'chromeExportCoverage unexportable rows must be zero');
  assert(Array.isArray(coverage.blockers), 'chromeExportCoverage blockers must be an array');
  assert(!coverage.blockers.includes('chrome-export-source-coverage-mismatch'), 'chromeExportCoverage must not include coverage mismatch blocker');
  assert(coverage.privacy?.redacted === true, 'chromeExportCoverage privacy redaction missing');
  assert(coverage.privacy?.rawIdsReturned === false, 'chromeExportCoverage raw ID flag unsafe');
  assert(coverage.privacy?.rawTitlesReturned === false, 'chromeExportCoverage raw title flag unsafe');
  assert(coverage.privacy?.rawContentReturned === false, 'chromeExportCoverage raw content flag unsafe');
}

function scanForForbiddenNeedles(proof) {
  const text = JSON.stringify(proof);
  return forbiddenNeedles.filter((needle) => text.includes(needle));
}

function validateProofObject(proof, options = {}) {
  assert(proof && typeof proof === 'object', 'proof JSON must be an object');
  if (!proof || typeof proof !== 'object') return;
  assert(proof.schema === proofSchema, 'proof schema mismatch');
  assert(proof.version === proofVersion, 'proof version mismatch');
  assert(proof.syncFolder?.configured === true, 'sync folder must be configured');
  assert(proof.syncFolder?.latestJsonSeen === true, 'latest.json must be observed');
  assert(proof.syncFolder?.chromeLatestJsonSeen === true, 'chrome-latest.json must be observed');
  assert(Array.isArray(proof.supportedFields), 'supportedFields missing');
  assert(Array.isArray(proof.deferredFields), 'deferredFields missing');
  for (const field of supportedFields) assert(proof.supportedFields.includes(field), `supportedFields missing ${field}`);
  for (const field of deferredFields) assert(proof.deferredFields.includes(field), `deferredFields missing ${field}`);
  assert(proof.parity?.final?.schema === paritySchema, 'final parity schema mismatch');
  assert(proof.parity?.supportedOk === true, 'supported parity must be ok');
  assert(Number(proof.parity?.supportedMismatchCount || 0) === 0, 'supported mismatch count must be zero');
  assert(typeof proof.parity?.deferredMismatchCount === 'number', 'deferred mismatch count missing');
  validatePropagationResult(proof.propagation?.chromeToDesktop, 'chrome-to-desktop');
  validatePropagationResult(proof.propagation?.desktopToChrome, 'desktop-to-chrome');
  validateChromeExportCoverage(proof.chromeExportCoverage);
  const warnings = new Set([
    ...(proof.propagation?.chromeToDesktop?.warnings || []),
    ...(proof.propagation?.desktopToChrome?.warnings || [])
  ]);
  for (const code of requiredDeferredWarnings) {
    assert(warnings.has(code), `proof propagation warnings missing ${code}`);
  }
  assert(proof.privacy?.ok === true, 'proof privacy must be ok');
  assert(proof.privacy?.redacted === true, 'proof redaction marker missing');
  assert(Number(proof.privacy?.rawLeakCount || 0) === 0, 'proof raw leak count must be zero');
  assert(proof.safety?.unexpectedSideEffects === false, 'unexpected side effects must be false');
  const leaked = scanForForbiddenNeedles(proof);
  assert(leaked.length === 0, `proof output contains forbidden raw needles: ${leaked.join(', ')}`);
  if (!options.synthetic) {
    assert(typeof proof.headCommit === 'string' && proof.headCommit.length >= 7, 'live proof headCommit missing');
    assert(typeof proof.observedAtIso === 'string' && proof.observedAtIso.includes('T'), 'live proof observedAtIso missing');
  }
}

function validateStaticFiles() {
  for (const file of [
    contractFile,
    closureContractFile,
    hardeningContractFile,
    parityModuleFile,
    parityValidator,
    chromeDesktopPropagationValidator,
    desktopChromePropagationValidator,
    hardeningValidator,
    chromeAutoImportFile
  ]) assertExists(file);

  if (failures.length) return;

  assertContains(contractFile, proofSchema, 'live proof schema');
  assertContains(contractFile, 'Chrome Studio Console Steps', 'Chrome manual steps');
  assertContains(contractFile, 'Desktop Studio Console Steps', 'Desktop manual steps');
  assertContains(contractFile, 'chrome-latest.json', 'Chrome transport file');
  assertContains(contractFile, 'latest.json', 'Desktop transport file');
  assertContains(contractFile, 'labels', 'deferred labels');
  assertContains(contractFile, 'chat-folder bindings', 'deferred chat-folder bindings');
  assertContains(contractFile, 'tombstones', 'deferred tombstones');
  assertContains(contractFile, 'sync apply events', 'deferred apply events');
  assertContains(closureContractFile, proofSchema, 'F19.5 closure proof schema');
  assertContains(closureContractFile, 'chrome-export-source-coverage-mismatch', 'F19.5 export coverage blocker');
  assertContains(closureContractFile, 'chromeExportCoverage', 'F19.5 export coverage proof field');
  assertContains(closureContractFile, 'desktop-shell-row-import-unsupported', 'F19.5 Desktop shell row blocker');
  assertContains(closureContractFile, 'desktop-to-chrome-convergence-not-proven', 'F19.5 Desktop to Chrome convergence blocker');
  assertContains(closureContractFile, 'convergence.ok === true', 'F19.5 Desktop to Chrome convergence proof');
  assertContains(closureContractFile, 'conflictDecision: "approve-merge"', 'F19.5 operator-approved merge command');
  assertContains(closureContractFile, 'conflictApproved:true', 'F19.5 operator-approved merge evidence');
  assertContains(closureContractFile, 'Premium Sync v1 supported fields complete', 'F19.5 supported-fields closure phrase');
  assertContains(closureContractFile, 'Premium Sync complete', 'F19.5 full closure phrase');
  assertContains(closureContractFile, 'node tools/validation/sync/validate-f19-live-parity-proof.mjs --proof', 'F19.5 proof validation command');
  assertContains(hardeningContractFile, 'transport-stale', 'F19.4 stale taxonomy');
  assertContains(hardeningContractFile, 'permission-denied', 'F19.4 permission taxonomy');
  assertContains(hardeningValidator, 'h2o.studio.sync.chrome-desktop-hardening-validation.v1', 'F19.4 validator schema');
  for (const code of requiredHardeningCodes) assertContains(hardeningContractFile, code, `F19.4 taxonomy ${code}`);
  assertContains(parityModuleFile, 'captureSnapshot', 'captureSnapshot API');
  assertContains(parityModuleFile, 'runDiagnostic', 'runDiagnostic API');
  assertContains(parityModuleFile, 'cache-only-read-only', 'read-only marker');
  assertContains(chromeAutoImportFile, chromeExportCoverageSchema, 'Chrome export coverage schema');
  assertContains(chromeAutoImportFile, 'chrome-export-source-coverage-mismatch', 'Chrome export coverage mismatch blocker');
  assertContains(chromeAutoImportFile, 'f19MinimalLibraryIndexRow', 'minimal LibraryIndex row marker');
}

const args = parseArgs();

validateStaticFiles();

let proof = null;
if (failures.length === 0) {
  proof = await runSyntheticProof();
}

if (args.proof) {
  try {
    const proofPath = path.resolve(root, args.proof);
    const parsed = JSON.parse(fs.readFileSync(proofPath, 'utf8'));
    validateProofObject(parsed);
    proof = parsed;
  } catch (error) {
    failures.push(`--proof validation failed: ${String(error && (error.message || error))}`);
  }
}

const result = {
  schema: proofSchema,
  version: proofVersion,
  ok: failures.length === 0,
  mode: args.proof ? 'operator-proof-validation' : 'synthetic-contract-validation',
  supportedFields,
  deferredFields,
  failures,
  proofStatus: proof?.status || '',
  observedAtIso: new Date().toISOString()
};

if (failures.length) {
  if (args.json) console.log(JSON.stringify(result, null, 2));
  else {
    console.error('F19 live Chrome/Desktop parity proof validation failed');
    for (const failure of failures) console.error(`- ${failure}`);
  }
  process.exit(1);
}

if (args.json) console.log(JSON.stringify(result, null, 2));
else console.log('F19 live Chrome/Desktop parity proof validation passed');
