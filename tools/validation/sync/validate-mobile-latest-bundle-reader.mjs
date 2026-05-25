import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import Module from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
const defaultBundlePath = path.join(os.homedir(), 'H2O Studio Sync', 'latest.json');
const bundlePath = process.env.H2O_MOBILE_LATEST_BUNDLE_PATH || defaultBundlePath;

function readRepoFile(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function loadLatestBundleReader() {
  return loadTypescriptModule('apps/studio/mobile/src/features/sync/latest-bundle-reader.ts');
}

function loadLatestBundleViewModel() {
  return loadTypescriptModule('apps/studio/mobile/src/features/sync/latest-bundle-view-model.ts');
}

function loadTypescriptModule(relativePath) {
  const helperPath = path.join(
    repoRoot,
    relativePath,
  );
  const source = readRepoFile(relativePath);
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      strict: true,
    },
    fileName: helperPath,
  });
  const helperModule = new Module(helperPath);
  helperModule.filename = helperPath;
  helperModule.paths = Module._nodeModulePaths(path.dirname(helperPath));
  helperModule._compile(transpiled.outputText, helperPath);
  return helperModule.exports;
}

function sha256Hex(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parsePossiblyStringifiedRecord(value) {
  if (isRecord(value)) {
    return value;
  }
  if (typeof value !== 'string' || value.trim().length === 0) {
    return null;
  }
  try {
    const parsed = JSON.parse(value);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function safeNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.trunc(value)
    : null;
}

function valueAtPath(record, pathParts) {
  let current = record;
  for (const part of pathParts) {
    if (!isRecord(current)) {
      return undefined;
    }
    current = current[part];
  }
  return current;
}

function fallbackCount(bundle, ...paths) {
  for (const pathParts of paths) {
    const count = safeNumber(valueAtPath(bundle, pathParts));
    if (count !== null) {
      return count;
    }
  }
  return 0;
}

function countRecordArrayValues(record) {
  let total = 0;
  for (const value of Object.values(record)) {
    if (Array.isArray(value)) {
      total += value.length;
    }
  }
  return total;
}

function countCatalogLikeSection(record, key) {
  if (Array.isArray(record[key])) {
    return record[key].length;
  }
  if (isRecord(record[key])) {
    return Object.values(record[key]).filter(isRecord).length;
  }
  return 0;
}

function countExpected(bundle) {
  const counts = {
    chats: 0,
    snapshots: 0,
    folders: 0,
    folderMemberships: 0,
    labels: 0,
    categories: 0,
    conflicts: 0,
    tombstones: 0,
    applyEvents: 0,
  };

  if (isRecord(bundle.chatArchive) && Array.isArray(bundle.chatArchive.chats)) {
    counts.chats = bundle.chatArchive.chats.length;
    counts.snapshots = bundle.chatArchive.chats.reduce((total, chat) => {
      if (!isRecord(chat)) {
        return total;
      }
      const snapshots = Array.isArray(chat.snapshots)
        ? chat.snapshots
        : Array.isArray(chat.savedSnapshots)
          ? chat.savedSnapshots
          : [];
      return total + snapshots.length;
    }, 0);
    if (isRecord(bundle.chatArchive.catalogs)) {
      counts.labels = Array.isArray(bundle.chatArchive.catalogs.labels)
        ? bundle.chatArchive.catalogs.labels.length
        : 0;
      counts.categories = Array.isArray(bundle.chatArchive.catalogs.categories)
        ? bundle.chatArchive.catalogs.categories.length
        : 0;
    }
  } else {
    counts.chats = fallbackCount(bundle, ['summary', 'chats'], ['summary', 'chatCount']);
    counts.snapshots = fallbackCount(bundle, ['summary', 'snapshots'], ['summary', 'snapshotCount']);
  }

  if (isRecord(bundle.chromeStorageLocal)) {
    const folderState = parsePossiblyStringifiedRecord(
      bundle.chromeStorageLocal['h2o:prm:cgx:fldrs:state:data:v1'],
    );
    if (folderState) {
      const folders = Array.isArray(folderState.folders)
        ? folderState.folders
        : Array.isArray(folderState.folderMetadata)
          ? folderState.folderMetadata
          : null;
      counts.folders = folders ? folders.length : 0;

      const memberships = Array.isArray(folderState.folderMemberships)
        ? folderState.folderMemberships
        : Array.isArray(folderState.memberships)
          ? folderState.memberships
          : Array.isArray(folderState.folderBindings)
            ? folderState.folderBindings
            : null;
      counts.folderMemberships = memberships
        ? memberships.length
        : isRecord(folderState.items)
          ? countRecordArrayValues(folderState.items)
          : 0;
    }
  }
  if (counts.folders === 0) {
    counts.folders = fallbackCount(bundle, ['summary', 'folders'], ['summary', 'folderCount']);
  }
  if (counts.folderMemberships === 0) {
    counts.folderMemberships = fallbackCount(
      bundle,
      ['summary', 'folderMemberships'],
      ['summary', 'folderBindingCount'],
    );
  }

  if (isRecord(bundle.libraryKv)) {
    counts.labels = counts.labels || countCatalogLikeSection(bundle.libraryKv, 'labels');
    counts.categories = counts.categories || countCatalogLikeSection(bundle.libraryKv, 'categories');
    counts.folderMemberships =
      counts.folderMemberships || countCatalogLikeSection(bundle.libraryKv, 'folderBindings');
  }

  if (Array.isArray(bundle.tombstones)) {
    counts.tombstones = bundle.tombstones.length;
  } else if (isRecord(bundle.tombstones)) {
    counts.tombstones = safeNumber(bundle.tombstones.total) ?? countRecordArrayValues(bundle.tombstones);
  } else {
    counts.tombstones = fallbackCount(
      bundle,
      ['summary', 'tombstones'],
      ['summary', 'tombstoneCount'],
      ['diagnostics', 'desktopExport', 'tombstones', 'total'],
    );
  }

  if (isRecord(bundle.syncApplyEvents)) {
    counts.applyEvents =
      safeNumber(bundle.syncApplyEvents.total) ??
      (Array.isArray(bundle.syncApplyEvents.events) ? bundle.syncApplyEvents.events.length : 0);
  } else {
    counts.applyEvents = fallbackCount(bundle, ['summary', 'applyEvents'], ['summary', 'applyEventCount']);
  }

  const conflicts = bundle.syncConflicts ?? bundle.conflicts;
  if (Array.isArray(conflicts)) {
    counts.conflicts = conflicts.length;
  } else if (isRecord(conflicts)) {
    counts.conflicts = safeNumber(conflicts.total) ?? (Array.isArray(conflicts.items) ? conflicts.items.length : 0);
  } else {
    counts.conflicts = fallbackCount(bundle, ['summary', 'conflicts'], ['summary', 'conflictCount']);
  }

  return counts;
}

function collectSensitiveStrings(value, output = new Set(), activeKey = '') {
  if (typeof value === 'string') {
    const normalized = value.trim();
    if (normalized.length >= 8 && isSensitiveKey(activeKey)) {
      output.add(normalized);
    }
    return output;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectSensitiveStrings(item, output, activeKey);
    }
    return output;
  }
  if (isRecord(value)) {
    for (const [key, child] of Object.entries(value)) {
      collectSensitiveStrings(child, output, key);
    }
  }
  return output;
}

function isSensitiveKey(key) {
  const normalized = key.toLowerCase();
  return (
    normalized === 'id' ||
    normalized.endsWith('id') ||
    normalized.includes('peer') ||
    normalized.includes('hash') ||
    normalized.includes('digest') ||
    normalized.includes('name') ||
    normalized.includes('title') ||
    normalized.includes('prompt') ||
    normalized.includes('answer') ||
    normalized.includes('content') ||
    normalized.includes('message') ||
    normalized.includes('metadata') ||
    normalized.includes('resultjson') ||
    normalized.includes('rawjson')
  );
}

function assertRedacted(diagnostic, bundle) {
  const diagnosticJson = JSON.stringify(diagnostic);
  assert.equal(diagnosticJson.includes('contentSha256'), false, 'diagnostic exposed checksum key');
  assert.equal(diagnosticJson.includes('resultJson'), false, 'diagnostic exposed resultJson key');
  assert.equal(diagnosticJson.includes('metadata'), false, 'diagnostic exposed metadata key');

  const leaked = [];
  for (const sensitive of collectSensitiveStrings(bundle)) {
    if (diagnosticJson.includes(sensitive)) {
      leaked.push(sensitive);
    }
    if (leaked.length >= 5) {
      break;
    }
  }
  assert.deepEqual(leaked, [], 'diagnostic leaked sensitive bundle values');
}

function collectRawIds(value, output = new Set(), activeKey = '') {
  if (typeof value === 'string') {
    const normalized = value.trim();
    if (normalized.length >= 6 && isIdKey(activeKey)) {
      output.add(normalized);
    }
    return output;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectRawIds(item, output, activeKey);
    }
    return output;
  }
  if (isRecord(value)) {
    for (const [key, child] of Object.entries(value)) {
      collectRawIds(child, output, key);
    }
  }
  return output;
}

function isIdKey(key) {
  const normalized = key.toLowerCase();
  return normalized === 'id' || normalized.endsWith('id') || normalized.endsWith('_id');
}

function assertViewModelNoRawIds(view, bundle) {
  const viewJson = JSON.stringify(view);
  const leaked = [];
  for (const rawId of collectRawIds(bundle)) {
    if (viewJson.includes(rawId)) {
      leaked.push(rawId);
    }
    if (leaked.length >= 5) {
      break;
    }
  }
  assert.deepEqual(leaked, [], 'view model leaked raw IDs');
}

if (!fs.existsSync(bundlePath)) {
  console.error(
    JSON.stringify(
      {
        ok: false,
        blocker: { code: 'latest-json-missing' },
        expectedPath: bundlePath,
        operatorCommand: 'ls -l "$HOME/H2O Studio Sync/latest.json"',
      },
      null,
      2,
    ),
  );
  process.exit(2);
}

const text = fs.readFileSync(bundlePath, 'utf8');
const bundle = JSON.parse(text);
const { diagnoseMobileSyncBundle } = loadLatestBundleReader();
const {
  buildMobileReadOnlyBundleView,
  buildMobileReadOnlySnapshotDetail,
} = loadLatestBundleViewModel();
const diagnostic = await diagnoseMobileSyncBundle(
  { text, sourceKind: 'latest-json' },
  { verifyChecksum: true, sha256Hex },
);
const view = buildMobileReadOnlyBundleView(bundle, {
  checksumVerified: diagnostic.source.checksumVerified,
});
const snapshotDetail = buildMobileReadOnlySnapshotDetail(bundle);
const missingSnapshotDetail = buildMobileReadOnlySnapshotDetail(bundle, {
  snapshotIndex: 100000,
});

assert.equal(diagnostic.schema, 'h2o.mobile.bundle-reader.diagnostic.v1');
assert.equal(diagnostic.ok, true);
assert.equal(diagnostic.readOnly, true);
assert.equal(diagnostic.redacted, true);
assert.equal(diagnostic.capabilities.includes('read-only'), true);
assert.equal(diagnostic.source.schemaPresent, true);
assert.equal(diagnostic.source.exportedAtPresent, true);
assert.equal(diagnostic.source.sourcePeerPresent, true);
assert.equal(diagnostic.source.checksumPresent, true);
assert.equal(diagnostic.source.checksumVerified, true);

const expectedCounts = countExpected(bundle);
assert.deepEqual(diagnostic.counts, expectedCounts);
assertRedacted(diagnostic, bundle);

assert.equal(view.schema, 'h2o.mobile.readonly-library-view.v1');
assert.equal(view.readOnly, true);
assert.equal(view.diagnostics.sourceSchemaPresent, true);
assert.equal(view.diagnostics.exportedAtPresent, true);
assert.equal(view.diagnostics.sourcePeerPresent, true);
assert.equal(view.diagnostics.checksumVerified, true);
assert.equal(view.chats.length, expectedCounts.chats);
assert.equal(view.snapshots.length, expectedCounts.snapshots);
assert.equal(view.folders.length, expectedCounts.folders);
assert.equal(
  view.folders.reduce((total, folder) => total + folder.itemCount, 0),
  expectedCounts.folderMemberships,
);
assert.equal(
  view.chats.reduce((total, chat) => total + chat.folderCount, 0),
  expectedCounts.folderMemberships,
);
assertViewModelNoRawIds(view, bundle);

const firstSnapshot = bundle.chatArchive?.chats?.flatMap((chat) => chat.snapshots ?? [])[0];
assert.ok(firstSnapshot, 'real bundle should include at least one snapshot');
assert.equal(snapshotDetail.schema, 'h2o.mobile.readonly-snapshot-detail.v1');
assert.equal(snapshotDetail.readOnly, true);
assert.equal(snapshotDetail.snapshotFound, true);
assert.equal(snapshotDetail.contentKind, 'turns');
assert.equal(snapshotDetail.messageCount, firstSnapshot.messages.length);
assert.equal(snapshotDetail.messages.length, firstSnapshot.messages.length);
assert.equal(snapshotDetail.contentPresent, true);
assert.equal(snapshotDetail.warnings.length, 0);
assert.equal(
  snapshotDetail.messages.filter((message) => message.textPresent).length,
  firstSnapshot.messages.filter((message) => typeof message.text === 'string' && message.text.length > 0).length,
);
assert.equal(missingSnapshotDetail.snapshotFound, false);
assert.equal(missingSnapshotDetail.contentPresent, false);
assert.deepEqual(missingSnapshotDetail.warnings, [{ code: 'snapshot-not-found' }]);

console.log(
  JSON.stringify(
    {
      schema: 'h2o.mobile.bundle-reader.validation.v1',
      ok: true,
      redacted: true,
      pathUsed: bundlePath,
      diagnostic: {
        ok: diagnostic.ok,
        readOnly: diagnostic.readOnly,
        source: diagnostic.source,
        counts: diagnostic.counts,
        blockers: diagnostic.blockers,
        warnings: diagnostic.warnings,
      },
      checksum: {
        present: diagnostic.source.checksumPresent,
        verified: diagnostic.source.checksumVerified,
      },
      countComparison: {
        matched: true,
        counts: diagnostic.counts,
      },
      redaction: {
        passed: true,
      },
      readOnlyViewModel: {
        schema: view.schema,
        readOnly: view.readOnly,
        chats: view.chats.length,
        snapshots: view.snapshots.length,
        folders: view.folders.length,
        folderMembershipsFromFolders: view.folders.reduce((total, folder) => total + folder.itemCount, 0),
        folderMembershipsFromChats: view.chats.reduce((total, chat) => total + chat.folderCount, 0),
        diagnostics: view.diagnostics,
        warnings: view.warnings,
        rawIdsExposed: false,
      },
      snapshotDetail: {
        schema: snapshotDetail.schema,
        readOnly: snapshotDetail.readOnly,
        snapshotFound: snapshotDetail.snapshotFound,
        contentKind: snapshotDetail.contentKind,
        contentPresent: snapshotDetail.contentPresent,
        messageCount: snapshotDetail.messageCount,
        textMessageCount: snapshotDetail.messages.filter((message) => message.textPresent).length,
        warnings: snapshotDetail.warnings,
      },
      missingSnapshot: {
        snapshotFound: missingSnapshotDetail.snapshotFound,
        warnings: missingSnapshotDetail.warnings,
      },
    },
    null,
    2,
  ),
);
