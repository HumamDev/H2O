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
const sharedCoreFile = 'shared/library/library-index-core.js';
const runtimeCoreFile = 'src-runtime-base/0F0d.⬛️🧬 Library Index Core 🧬.js';
const studioCoreFile = 'src-surfaces-base/studio/S0F0d. 🎬 Library Index Core - Studio.js';
const studioIndexFile = 'src-surfaces-base/studio/S0F1c. 🎬 Library Index - Studio.js';
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

function coreBody(file) {
  const text = read(file);
  const start = text.indexOf('(() => {');
  assert(start !== -1, `${file}: core IIFE missing`);
  return start === -1 ? '' : text.slice(start).trim();
}

function buildCoreContext() {
  const context = { console, Date, H2O: { Library: {} } };
  context.globalThis = context;
  return vm.createContext(context);
}

function installCore(context) {
  vm.runInContext(read(sharedCoreFile), context, { filename: sharedCoreFile });
  return context.H2O?.Library?.LibraryIndexCore || null;
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

function makeCanonicalHeadlineRows() {
  const rows = [];
  for (let index = 0; index < 17; index += 1) {
    const saved = index < 7;
    rows.push({
      chatId: `active-chat-${index + 1}`,
      snapshotId: saved ? `snapshot-${index + 1}` : '',
      href: saved ? `/c/active-chat-${index + 1}` : `/c/link-chat-${index + 1}`,
      view: saved ? 'saved' : 'linked',
      pinned: index === 0,
      folderId: 'active-folder',
      categoryId: 'active-category',
      labels: ['active-label'],
      projectId: 'active-project',
      state: {
        isSaved: saved,
        isLinked: true,
        isPinned: index === 0,
        isArchived: false,
        isDeleted: false
      }
    });
  }
  for (let index = 0; index < 3; index += 1) {
    rows.push({
      chatId: `archived-chat-${index + 1}`,
      snapshotId: `archived-snapshot-${index + 1}`,
      view: 'saved',
      archived: true,
      folderId: 'archived-folder',
      categoryId: 'archived-category',
      labels: ['archived-label'],
      projectId: 'archived-project',
      state: {
        isSaved: true,
        isLinked: false,
        isArchived: true,
        isDeleted: false
      }
    });
  }
  return rows;
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
  installCore(chromeContext);
  installCore(desktopContext);
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
  assert(chromeSnapshot.sourceMetadata.libraryIndexRows === 10, 'Chrome raw LibraryIndex row metadata mismatch');
  assert(chromeSnapshot.sourceMetadata.libraryIndexActiveRows === 9, 'Chrome active LibraryIndex row metadata mismatch');
  assert(desktopSnapshot.sourceMetadata.libraryIndexRows === 7, 'Desktop raw LibraryIndex row metadata mismatch');
  assert(desktopSnapshot.sourceMetadata.libraryIndexActiveRows === 6, 'Desktop active LibraryIndex row metadata mismatch');
  assert(chromeSnapshot.counts.total === 9, 'Chrome canonical active total count mismatch');
  assert(chromeSnapshot.counts.archived === 1, 'Chrome canonical archived count mismatch');
  assert(chromeSnapshot.counts.link === 1, 'Chrome canonical link count mismatch');
  assert(chromeSnapshot.counts.linked === chromeSnapshot.counts.link, 'Chrome linked alias mismatch');
  assert(desktopSnapshot.counts.total === 6, 'Desktop canonical active total count mismatch');
  assert(desktopSnapshot.counts.archived === 1, 'Desktop canonical archived count mismatch');
  assert(desktopSnapshot.counts.link === 0, 'Desktop canonical link count mismatch');
  assert(desktopSnapshot.counts.linked === desktopSnapshot.counts.link, 'Desktop linked alias mismatch');

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

function runCanonicalHeadlineProof() {
  const context = buildCoreContext();
  const core = installCore(context);
  assert(core?.__phase === '2B', 'LibraryIndexCore phase marker missing');
  assert(typeof core?.canonicalHeadlineCounts === 'function', 'canonicalHeadlineCounts missing');
  const rows = makeCanonicalHeadlineRows();
  const counts = core.canonicalHeadlineCounts(rows);
  assert(counts.total === 17, 'canonical active total must exclude archived rows');
  assert(counts.saved === 7, 'saved+linked rows must count as saved');
  assert(counts.link === 10, 'link-only rows must count as link');
  assert(counts.linked === counts.link, 'linked alias must equal link');
  assert(counts.pinned === 1, 'active pinned count mismatch');
  assert(counts.archived === 3, 'archived side bucket mismatch');
  assert(counts.folders === 1, 'folder count must use active rows only');
  assert(counts.labels === 1, 'label count must use active rows only');
  assert(counts.categories === 1, 'category count must use active rows only');

  assert(typeof core.canonicalActiveRows === 'function', 'canonicalActiveRows missing');
  assert(typeof core.canonicalArchivedRows === 'function', 'canonicalArchivedRows missing');
  assert(typeof core.canonicalExplorerRows === 'function', 'canonicalExplorerRows missing');
  assert(typeof core.canonicalRecentRows === 'function', 'canonicalRecentRows missing');
  assert(typeof core.canonicalSavedRecentRows === 'function', 'canonicalSavedRecentRows missing');
  assert(typeof core.rowHasTranscriptEvidence === 'function', 'rowHasTranscriptEvidence missing');
  assert(typeof core.rowIsSavedRecentEligible === 'function', 'rowIsSavedRecentEligible missing');
  assert(typeof core.canonicalActiveFacets === 'function', 'canonicalActiveFacets missing');
  assert(core.canonicalActiveRows(rows).length === 17, 'canonicalActiveRows must return 17 active rows');
  assert(core.canonicalArchivedRows(rows).length === 3, 'canonicalArchivedRows must return 3 archived rows');
  assert(core.canonicalExplorerRows(rows, { view: 'all' }).length === 17, 'canonicalExplorerRows all view must use active rows');
  assert(core.canonicalExplorerRows(rows, { view: 'archive' }).length === 3, 'canonicalExplorerRows archive view must use archived rows');
  const recentRows = core.canonicalRecentRows(rows, 99);
  assert(recentRows.length === 17, 'canonicalRecentRows must exclude archived rows');
  assert(recentRows.every((row) => !row.archived && !row.state?.isArchived), 'canonicalRecentRows returned an archived row');
  const savedRecentRows = core.canonicalSavedRecentRows(rows, 99);
  assert(savedRecentRows.length === 7, 'canonicalSavedRecentRows must include only active saved transcript rows');
  assert(savedRecentRows.every((row) => row.snapshotId && row.state?.isSaved && !row.archived && !row.state?.isArchived), 'canonicalSavedRecentRows returned a non-saved, link-only, or archived row');
  assert(core.canonicalRowView(savedRecentRows[0]) === 'saved', 'saved+linked payload-backed rows must classify as saved');
  assert(rows.filter((row) => !row.state?.isSaved && !row.state?.isArchived).every((row) => core.canonicalRowView(row) === 'linked'), 'link-only rows must classify as linked');
  const chromeStyleLinkWithTranscriptEvidence = {
    chatId: 'chrome-link-transcript-evidence',
    title: 'Chrome linked row with transcript evidence',
    href: '/c/chrome-link-transcript-evidence',
    view: 'link',
    saved: false,
    linked: true,
    isLinked: true,
    messageCount: 8,
    opens: 'placeholder-details',
    state: { isSaved: false, isLinked: true, isArchived: false, isDeleted: false },
  };
  const chromeStyleSavedFalseLinked = {
    chatId: 'chrome-saved-false-linked',
    title: 'Chrome saved false linked row',
    href: '/c/chrome-saved-false-linked',
    view: 'saved',
    snapshotId: 'chrome-saved-false-linked-snapshot',
    saved: false,
    isSaved: false,
    isLinked: true,
    state: { isSaved: false, isLinked: true, isArchived: false, isDeleted: false },
  };
  const savedLinkedPayloadBacked = {
    chatId: 'saved-linked-payload-backed',
    title: 'Saved linked payload backed',
    href: '/c/saved-linked-payload-backed',
    view: 'saved',
    snapshotId: 'saved-linked-payload-backed-snapshot',
    saved: true,
    isSaved: true,
    isLinked: true,
    state: { isSaved: true, isLinked: true, isArchived: false, isDeleted: false },
  };
  assert(core.rowHasTranscriptEvidence(chromeStyleLinkWithTranscriptEvidence), 'fixture must carry transcript evidence');
  assert(core.rowIsSavedRecentEligible(chromeStyleLinkWithTranscriptEvidence) === false, 'Chrome link rows with transcript evidence but saved:false must not be saved recents');
  assert(core.rowIsSavedRecentEligible(chromeStyleSavedFalseLinked) === false, 'snapshot-backed rows with explicit saved:false must not be saved recents');
  assert(core.rowIsSavedRecentEligible(savedLinkedPayloadBacked) === true, 'saved+linked payload-backed rows with saved:true must remain saved recents');
  const savedRecentEligibilityRows = core.canonicalSavedRecentRows([
    chromeStyleLinkWithTranscriptEvidence,
    chromeStyleSavedFalseLinked,
    savedLinkedPayloadBacked,
  ], 99);
  assert(savedRecentEligibilityRows.length === 1 && savedRecentEligibilityRows[0].chatId === 'saved-linked-payload-backed', 'canonicalSavedRecentRows must use saved-recents eligibility, not transcript evidence alone');
  const unknownDateRows = [
    { chatId: 'unknown-b', snapshotId: 'snap-b', title: 'Bravo', view: 'saved', state: { isSaved: true } },
    { chatId: 'unknown-a', snapshotId: 'snap-a', title: 'Alpha', view: 'saved', state: { isSaved: true } },
    { chatId: 'unknown-link', title: 'Link', href: '/c/unknown-link', view: 'linked', state: { isLinked: true } },
    { chatId: 'unknown-archived', snapshotId: 'snap-archived', title: 'Archived', view: 'saved', archived: true, state: { isSaved: true, isArchived: true } },
  ];
  const deterministicSavedRecents = core.canonicalSavedRecentRows(unknownDateRows, 99);
  assert(deterministicSavedRecents.length === 2, 'saved recents must exclude unknown-date link-only and archived rows');
  assert(deterministicSavedRecents.map((row) => row.chatId).join(',') === 'unknown-a,unknown-b', 'unknown-date saved recents must sort by title/id fallback deterministically');
  const activeFacets = core.canonicalActiveFacets(rows);
  assert(Object.prototype.hasOwnProperty.call(activeFacets.byFolder, 'active-folder'), 'canonicalActiveFacets missing active folder');
  assert(!Object.prototype.hasOwnProperty.call(activeFacets.byFolder, 'archived-folder'), 'canonicalActiveFacets must exclude archived folder');
}

function runTriplicateProof() {
  const sharedBody = coreBody(sharedCoreFile);
  assert(coreBody(runtimeCoreFile) === sharedBody, 'runtime LibraryIndexCore body differs from shared core');
  assert(coreBody(studioCoreFile) === sharedBody, 'Studio LibraryIndexCore body differs from shared core');
}

for (const file of [moduleFile, sharedCoreFile, runtimeCoreFile, studioCoreFile, studioIndexFile, htmlFile, packFile, contractFile]) assertExists(file);

if (failures.length === 0) {
  runTriplicateProof();
  runCanonicalHeadlineProof();
  assertContains(moduleFile, "var VERSION = '0.1.0-f19.1.a'", 'version marker');
  assertContains(moduleFile, 'h2o.studio.sync.library-parity-snapshot.v1', 'snapshot schema');
  assertContains(moduleFile, 'h2o.studio.sync.chrome-desktop-library-parity.v1', 'parity schema');
  assertContains(moduleFile, 'canonicalHeadlineCounts', 'canonical headline count usage');
  assertContains(moduleFile, 'canonicalActiveRows', 'canonical active projection usage');
  assertContains(moduleFile, 'canonicalSavedRecentRows', 'canonical saved recent projection usage');
  assertContains(moduleFile, 'libraryIndexActiveRows', 'active row metadata');
  assertContains(studioIndexFile, 'function diagnoseRecentsParity(options = {})', 'recents runtime diagnostic');
  assertContains(studioIndexFile, 'domSidebarRecentsRowTokens', 'sidebar DOM recents tokens');
  assertContains(studioIndexFile, 'domDashboardRecentTokens', 'dashboard DOM recents tokens');
  assertContains(studioIndexFile, 'domSidebarMatchesSourceOrder', 'sidebar DOM/source order check');
  assertContains(studioIndexFile, 'domSidebarSourceOrderMismatchCount', 'sidebar DOM/source mismatch count');
  assertContains(studioIndexFile, 'domLinkOnlyRowsAccidentallyIncludedCount', 'DOM link-only leak counter');
  assertContains(studioIndexFile, 'first10CanonicalSortTokens', 'canonical sort token proof');
  assertContains(sharedCoreFile, 'canonicalExplorerRows', 'canonical explorer projection');
  assertContains(sharedCoreFile, 'canonicalRecentRows', 'canonical recents projection');
  assertContains(sharedCoreFile, 'canonicalSavedRecentRows', 'canonical saved recents projection');
  assertContains(sharedCoreFile, 'rowIsSavedRecentEligible', 'canonical saved recents eligibility predicate');
  assertContains(sharedCoreFile, 'filter(rowIsSavedRecentEligible)', 'canonical saved recents eligibility usage');
  assertContains(htmlFile, './S0F0d. 🎬 Library Index Core - Studio.js?v=2.5.73', 'Library Index Core cache bust');
  assertContains(htmlFile, './S0F1c. 🎬 Library Index - Studio.js?v=2.5.73', 'Library Index cache bust');
  assertContains(htmlFile, './S0F1d. 🎬 Library Insights - Studio.js?v=2.5.71', 'Library Insights cache bust');
  assertContains(htmlFile, './S0F1b. 🎬 Library Workspace - Studio.js?v=2.5.78', 'Library workspace cache bust');
  assertContains(htmlFile, './S0Z1f. 🎬 Library Sidebar Tab - Studio.js?v=2.5.74', 'Library sidebar tab cache bust');
  assertContains(htmlFile, './S0Z1g. 🎬 Library Sidebar Sections - Studio.js?v=2.5.78', 'Library sidebar sections cache bust');
  assertContains(htmlFile, './studio.js?v=2.5.75', 'Studio shell cache bust');
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
