import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');

function readRepoFile(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function loadBidirectionalPreview() {
  const context = {
    console,
    H2O: { Studio: { diagnostics: {} } },
  };
  vm.createContext(context);
  vm.runInContext(
    readRepoFile('src-surfaces-base/studio/sync/bidirectional-folder-preview.js'),
    context,
    { filename: 'bidirectional-folder-preview.js' },
  );
  return context.H2O.Studio.diagnostics.previewBidirectionalFolderMetadata;
}

function loadApplyCheckHash() {
  const source = readRepoFile('src-surfaces-base/studio/sync/folder-metadata-apply-checks.tauri.js').trimEnd();
  const suffix = "\n})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));";
  assert.ok(source.endsWith(suffix), 'apply-checks module suffix changed');
  const instrumented = source.slice(0, -suffix.length)
    + '\n  global.__normalizeFolderHashForTest = normalizeFolderHash;'
    + suffix;
  const context = {
    console,
    __TAURI__: {},
    H2O: {
      Studio: {
        diagnostics: {
          planBidirectionalFolderMetadataApply() {},
        },
      },
    },
  };
  vm.createContext(context);
  vm.runInContext(instrumented, context, { filename: 'folder-metadata-apply-checks.tauri.js' });
  assert.equal(typeof context.__normalizeFolderHashForTest, 'function');
  return context.__normalizeFolderHashForTest;
}

function folder(overrides = {}) {
  return {
    id: 'folder-a',
    name: 'Folder A',
    color: '#123456',
    sortOrder: 0,
    source: 'user',
    meta: {},
    ...overrides,
  };
}

function assertPreviewSame(preview, localOverrides, remoteOverrides) {
  const report = preview({
    localFolders: [folder(localOverrides)],
    remoteFolders: [folder(remoteOverrides)],
  });
  assert.equal(report.categories.same, 1);
  assert.equal(report.categories.divergentMetadata, 0);
  assert.equal(report.matches.sameIdSameMetadata, 1);
}

const preview = loadBidirectionalPreview();
assertPreviewSame(preview, { parentId: null }, { parentId: '' });
assertPreviewSame(preview, {}, { parent_id: '' });
assertPreviewSame(preview, { parentFolderId: undefined }, { parentId: null });

const hash = loadApplyCheckHash();
const missingParentHash = hash(folder());
assert.equal(hash(folder({ parentId: null })), missingParentHash);
assert.equal(hash(folder({ parentId: '' })), missingParentHash);
assert.equal(hash(folder({ parent_id: '' })), missingParentHash);
assert.equal(hash(folder({ parentFolderId: undefined })), missingParentHash);
assert.notEqual(hash(folder({ parentId: 'parent-a' })), missingParentHash);

console.log('F7 folder metadata hash parity validation passed');
