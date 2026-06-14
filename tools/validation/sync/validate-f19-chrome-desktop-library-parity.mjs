#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import vm from 'node:vm';
import { TextEncoder } from 'node:util';
import { webcrypto } from 'node:crypto';

const root = process.cwd();
const failures = [];

const moduleFile = 'src-surfaces-base/studio/sync/library/library-chrome-desktop-parity-diagnostic.js';
const htmlFile = 'src-surfaces-base/studio/studio.html';
const packFile = 'tools/product/studio/pack-studio.mjs';
const contractFile = 'docs/systems/cross-platform/f19.1-chrome-desktop-library-parity-contract.md';

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

function assertOrder(file, before, after) {
  const text = read(file);
  const beforeIndex = text.indexOf(before);
  const afterIndex = text.indexOf(after);
  assert(beforeIndex !== -1, `${file}: missing order source ${before}`);
  assert(afterIndex !== -1, `${file}: missing order target ${after}`);
  if (beforeIndex !== -1 && afterIndex !== -1) {
    assert(beforeIndex < afterIndex, `${file}: ${before} must appear before ${after}`);
  }
}

function makeRows(prefix, count, linkedCount = 1) {
  return Array.from({ length: count }, (_, index) => ({
    chatId: `${prefix}-chat-${index + 1}`,
    snapshotId: `${prefix}-snapshot-${index + 1}`,
    title: `${prefix} Private Title ${index + 1}`,
    view: index >= count - linkedCount ? 'linked' : 'saved',
    pinned: index === 0,
    archived: index === 1,
    folderId: index < 2 ? `${prefix}-folder-a` : '',
    categoryId: index < 3 ? `${prefix}-category-a` : '',
    projectId: index < 2 ? `${prefix}-project-a` : '',
    labels: index < 2 ? [`${prefix}-label-a`] : [],
    tags: [],
    updatedAt: 1000 + index
  }));
}

function buildContext(kind) {
  const isDesktop = kind === 'desktop';
  const rows = makeRows(isDesktop ? 'desktop-raw' : 'chrome-raw', isDesktop ? 7 : 10, isDesktop ? 0 : 1);
  const folders = isDesktop ? [] : [{ id: 'chrome-raw-folder-a', name: 'Study Secret Folder' }];
  const labels = isDesktop ? [] : [{ id: 'chrome-raw-label-a', name: 'Secret Label' }];
  const categories = isDesktop ? [] : [{ id: 'chrome-raw-category-a', name: 'Research Secret Category' }];
  const projects = isDesktop ? [] : [{ id: 'chrome-raw-project-a', name: 'Secret Project' }];
  const context = {
    console,
    TextEncoder,
    crypto: webcrypto,
    Date,
    H2O: {
      Studio: {
        platform: {
          env: {
            adapter: isDesktop ? 'tauri' : 'mv3',
            isTauri: isDesktop
          }
        },
        sync: {},
        store: {
          folders: { async getAll() { return folders; }, diagnose() { return { backend: isDesktop ? 'sqlite' : 'chrome' }; } },
          labels: { async getAll() { return labels; } },
          categories: { async getAll() { return categories; } }
        }
      },
      LibraryWorkspace: {
        async getFolders() { return folders; },
        async getLabels() { return labels; },
        async getCategories() { return categories; },
        async getProjects() { return projects; }
      },
      LibraryIndex: {
        getAll() { return rows; },
        counts() { return { total: rows.length }; },
        diagnose() { return { ready: true, source: isDesktop ? 'sqlite' : 'archive', lastSource: isDesktop ? 'desktop-sqlite' : 'studio-archive+registry(1)' }; }
      }
    },
    chrome: isDesktop ? undefined : { runtime: { id: 'chrome-extension-id' }, storage: { local: {} } },
    __TAURI_INTERNALS__: isDesktop ? { invoke() {} } : undefined
  };
  context.globalThis = context;
  return vm.createContext(context);
}

async function runVmProof() {
  const source = read(moduleFile);
  const chromeContext = buildContext('chrome');
  const desktopContext = buildContext('desktop');
  vm.runInContext(source, chromeContext, { filename: moduleFile });
  vm.runInContext(source, desktopContext, { filename: moduleFile });

  const chromeApi = chromeContext.H2O.Studio.sync.libraryParity;
  const desktopApi = desktopContext.H2O.Studio.sync.libraryParity;
  assert(chromeApi?.__installed === true, 'Chrome API marker missing');
  assert(desktopApi?.__installed === true, 'Desktop API marker missing');
  assert(chromeApi.version === '0.1.0-f19.1.a', 'API version mismatch');
  assert(chromeApi.paritySchema === 'h2o.studio.sync.chrome-desktop-library-parity.v1', 'parity schema mismatch');
  assert(chromeApi.snapshotSchema === 'h2o.studio.sync.library-parity-snapshot.v1', 'snapshot schema mismatch');
  assert(typeof chromeApi.captureSnapshot === 'function', 'captureSnapshot missing');
  assert(typeof chromeApi.compareSnapshots === 'function', 'compareSnapshots missing');
  assert(typeof chromeContext.H2O.Studio.sync.runChromeDesktopLibraryParityDiagnostic === 'function', 'run diagnostic alias missing');

  const chromeSnapshot = await chromeApi.captureSnapshot();
  const desktopSnapshot = await desktopApi.captureSnapshot();
  assert(chromeSnapshot.surface === 'chrome-studio', 'Chrome snapshot surface mismatch');
  assert(desktopSnapshot.surface === 'desktop-studio', 'Desktop snapshot surface mismatch');
  assert(chromeSnapshot.counts.total === 10, 'Chrome total count mismatch');
  assert(desktopSnapshot.counts.total === 7, 'Desktop total count mismatch');

  const leakedSnapshot = JSON.stringify({ chromeSnapshot, desktopSnapshot });
  for (const forbidden of [
    'chrome-raw-chat-1',
    'desktop-raw-chat-1',
    'Study Secret Folder',
    'Secret Label',
    'Research Secret Category',
    'Private Title',
    'category_id',
    'chats.category_id',
    'folder_id',
    'chat_id'
  ]) {
    assert(!leakedSnapshot.includes(forbidden), `snapshot leaked ${forbidden}`);
  }

  const comparison = chromeApi.compareSnapshots(chromeSnapshot, desktopSnapshot);
  assert(comparison.schema === 'h2o.studio.sync.chrome-desktop-library-parity.v1', 'comparison schema mismatch');
  assert(comparison.ok === false, 'comparison should detect mismatch');
  const codes = new Set(comparison.mismatches.map((entry) => entry.code));
  for (const code of [
    'library-parity-count-mismatch',
    'library-parity-saved-count-mismatch',
    'library-parity-linked-count-mismatch',
    'library-parity-folder-mismatch',
    'library-parity-label-mismatch',
    'library-parity-category-mismatch',
    'library-parity-project-mismatch',
    'library-parity-recents-mismatch'
  ]) {
    assert(codes.has(code), `comparison missing ${code}`);
  }
  assert(comparison.warnings.includes('library-parity-identity-workspace-unknown'), 'identity/workspace unknown warning missing');

  const localOnly = await chromeApi.runDiagnostic();
  assert(localOnly.ok === false, 'local-only diagnostic should not claim parity');
  assert(localOnly.blockers.includes('library-parity-peer-snapshot-required'), 'local-only peer-required blocker missing');

  const clone = JSON.parse(JSON.stringify(chromeSnapshot));
  const match = chromeApi.compareSnapshots(chromeSnapshot, { ...clone, surface: 'desktop-studio', sourceType: 'desktop-sqlite-library-index' });
  assert(match.ok === true, 'matching snapshots should pass');
}

for (const file of [moduleFile, htmlFile, packFile, contractFile]) assertExists(file);

if (failures.length === 0) {
  assertContains(moduleFile, "var VERSION = '0.1.0-f19.1.a'", 'version marker');
  assertContains(moduleFile, 'h2o.studio.sync.library-parity-snapshot.v1', 'snapshot schema');
  assertContains(moduleFile, 'h2o.studio.sync.chrome-desktop-library-parity.v1', 'parity schema');
  assertContains(moduleFile, 'captureSnapshot', 'capture API');
  assertContains(moduleFile, 'compareSnapshots', 'compare API');
  assertContains(moduleFile, 'runChromeDesktopLibraryParityDiagnostic', 'diagnostic API');
  assertContains(moduleFile, 'library-parity-count-mismatch', 'count mismatch taxonomy');
  assertContains(moduleFile, 'library-parity-saved-count-mismatch', 'saved mismatch taxonomy');
  assertContains(moduleFile, 'library-parity-linked-count-mismatch', 'linked mismatch taxonomy');
  assertContains(moduleFile, 'library-parity-folder-mismatch', 'folder mismatch taxonomy');
  assertContains(moduleFile, 'library-parity-category-mismatch', 'category mismatch taxonomy');
  assertContains(moduleFile, 'library-parity-label-mismatch', 'label mismatch taxonomy');
  assertContains(moduleFile, 'library-parity-recents-mismatch', 'recents mismatch taxonomy');
  assertContains(moduleFile, 'library-parity-identity-workspace-unknown', 'identity/workspace taxonomy');
  assertContains(moduleFile, 'cache-only-read-only', 'read-only snapshot marker');
  assertContains(moduleFile, 'No import, export, settlement', 'no mutation comment');
  assertContains(htmlFile, './sync/library/library-chrome-desktop-parity-diagnostic.js', 'studio loader');
  assertContains(packFile, 'sync/library/library-chrome-desktop-parity-diagnostic.js', 'pack loader');
  assertOrder(htmlFile, './sync/library/library-performance-stress-proof.tauri.js', './sync/library/library-chrome-desktop-parity-diagnostic.js');
  assertOrder(packFile, '"sync/library/library-performance-stress-proof.tauri.js"', '"sync/library/library-chrome-desktop-parity-diagnostic.js"');
  assertContains(contractFile, 'F16.2 multi-peer soak is a deterministic simulated proof', 'coverage gap explanation');
  assertContains(contractFile, 'Premium sync remains incomplete after F19.1.a', 'premium incomplete warning');
}

if (failures.length === 0) {
  await runVmProof();
}

if (failures.length) {
  console.error('F19 Chrome/Desktop Library parity validation failed');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('F19 Chrome/Desktop Library parity validation passed');
