#!/usr/bin/env node
// Validator for the C6.2 read-only Saved Chat Archive Health panel summary.
//
// Static-checks the helper module + the studio.js Settings wiring, and runs a
// pure behavioral check of formatting/copy helpers (no DOM needed). Proves the
// summary cards, read-only boundaries, and that no C6.3 package details surface
// or mutation actions were added.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..', '..', '..');
const HELPER_REL = 'src-surfaces-base/studio/ingestion/archive-health-ui.studio.js';
const STUDIO_JS_REL = 'src-surfaces-base/studio/studio.js';
const STUDIO_HTML_REL = 'src-surfaces-base/studio/studio.html';
const PACK_REL = 'tools/product/studio/pack-studio.mjs';

const PASS = [];
const FAIL = [];
function check(label, fn) {
  try { fn(); PASS.push(label); console.log(`  ✓ ${label}`); }
  catch (e) { const m = e && e.message ? e.message : String(e); FAIL.push({ label, m }); console.log(`  ✗ ${label}`); console.log(`      ${m}`); }
}
async function checkAsync(label, fn) {
  try { await fn(); PASS.push(label); console.log(`  ✓ ${label}`); }
  catch (e) { const m = e && e.message ? e.message : String(e); FAIL.push({ label, m }); console.log(`  ✗ ${label}`); console.log(`      ${m}`); }
}
function readRepo(rel) { return fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'); }

const helperSrc = readRepo(HELPER_REL);
const studioJs = readRepo(STUDIO_JS_REL);
const studioHtml = readRepo(STUDIO_HTML_REL);
const pack = readRepo(PACK_REL);

// Strip comments so boundary scans test CODE, not the header prose (which names
// the non-goals: repair/import/Copy report JSON, etc.).
function stripComments(src) {
  return String(src)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}
const helperCode = stripComments(helperSrc);

function functionBlock(src, name) {
  const signature = `function ${name}`;
  const idx = src.indexOf(signature);
  assert.ok(idx >= 0, `${signature} missing`);
  const start = src.indexOf('{', idx);
  assert.ok(start >= 0, `${signature} body missing`);
  let depth = 0;
  for (let i = start; i < src.length; i += 1) {
    const ch = src[i];
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) return src.slice(idx, i + 1);
    }
  }
  throw new Error(`${signature} body did not close`);
}

console.log('[archive-health-ui] static checks');

check('helper module exists and registers the public API', () => {
  assert.ok(fs.existsSync(path.join(REPO_ROOT, HELPER_REL)));
  assert.match(helperSrc, /H2O\.Studio\.archiveHealthUi/);
  assert.match(helperSrc, /renderArchiveHealthCard/);
  assert.match(helperSrc, /formatArchiveHealthSummary/);
  assert.match(helperSrc, /formatArchiveHealthSections/);
  assert.match(helperSrc, /renderArchiveHealthCounts/);
  assert.match(helperSrc, /copyArchiveHealthReport/);
});

check('helper renders the Run diagnostics button, Copy report JSON button, and status texts', () => {
  assert.ok(helperSrc.includes('Run diagnostics'));
  assert.ok(helperSrc.includes('Copy report JSON'));
  assert.ok(helperSrc.includes('Report JSON copied.'));
  assert.ok(helperSrc.includes('Could not copy report JSON.'));
  assert.ok(helperSrc.includes('Saved Chat Archive Health'));
  for (const t of [
    'Run diagnostics to check saved chat package health.',
    'Reading saved chat archive diagnostics…',
    'Archive diagnostics are available in Desktop Studio only.',
    'No saved chat packages found yet.',
    'Archive diagnostics completed.',
    'Archive diagnostics completed with warnings. Saved packages may still be portable.',
    'Archive diagnostics found package integrity problems.',
    'Could not run archive diagnostics.',
  ]) assert.ok(helperSrc.includes(t), `missing copy: ${t}`);
});

check('helper implements all six status-shell states', () => {
  for (const s of ['idle', 'loading', 'unavailable', 'empty', 'ready', 'error']) {
    assert.ok(new RegExp("'" + s + "'").test(helperSrc), `state literal missing: ${s}`);
  }
  for (const s of ['copyStatus', 'copied']) {
    assert.ok(helperSrc.includes(s), `copy state missing: ${s}`);
  }
});

check('helper is read-only: no mutation/repair/import/sync/CAS/DB-write/package-write', () => {
  // Scan comment-stripped CODE (the header prose legitimately names the non-goals).
  for (const banned of [
    'repair', 'recover', 'import', 'delete', 'remove(', 'overwrite',
    'writeSavedChatPackageV1', 'putAssetBytes', 'getAssetBytes',
    'plugin:fs|write', 'plugin:sql', 'upsert', 'linkToTurn',
    'H2O.Studio.sync', 'webdav', 'chrome.',
  ]) {
    assert.ok(!helperCode.includes(banned), `forbidden token in helper code: ${banned}`);
  }
});

check('helper has C6.2 summary count labels and separates integrity from drift', () => {
  for (const label of [
    'packagesTotal', 'packagesOk', 'packagesWarning', 'packagesBlocked', 'v1', 'v2',
    'brokenPackageAssets', 'assetRefMismatches', 'dataImageResidue',
    'missingLiveCasAssets', 'missingDbChats', 'missingDbSnapshots', 'orphanedPackages', 'stalePackages', 'storeAssetMismatches',
    'dbChecks passed', 'dbChecks warnings', 'dbChecks failed',
  ]) {
    assert.ok(helperSrc.includes(label), `summary label missing: ${label}`);
  }
  assert.ok(helperSrc.includes('Integrity'), 'integrity section missing');
  assert.ok(helperSrc.includes('Blockers are package integrity problems and need attention.'), 'blocker explanation missing');
  assert.ok(helperSrc.includes('Drift / informational warnings'), 'drift section missing');
  assert.ok(helperSrc.includes('Drift does not automatically mean a saved package is broken'), 'drift explanation missing');
  assert.ok(helperSrc.includes('grid-template-columns:repeat(auto-fit,minmax(150px,1fr))'), 'compact counts grid missing');
});

check('helper copy path uses safe clipboard and does not create/download/save files', () => {
  assert.ok(helperSrc.includes('navigator'));
  assert.ok(helperSrc.includes('clipboard.writeText'));
  assert.ok(helperSrc.includes('JSON.stringify(result, null, 2)'));
  for (const banned of ["createElement('a'", 'createElement("a"', '.download', 'showSaveFilePicker', 'createObjectURL', 'writeSavedChatPackageV1']) {
    assert.ok(!helperCode.includes(banned), `forbidden copy/download behavior: ${banned}`);
  }
});

check('helper still has no package details table/list or repair actions', () => {
  for (const deferred of ['<table', 'packagePath', 'data-archive-health-package', 'Repair', 'Import', 'Delete', 'Overwrite']) {
    assert.ok(!helperCode.includes(deferred), `C6.3 or action surface leaked into helper: ${deferred}`);
  }
});

check('studio.js Settings adds the read-only archive health card container + title', () => {
  const cardHtml = functionBlock(studioJs, 'settingsArchiveHealthCardHtml');
  assert.ok(cardHtml.includes('wbSettingsArchiveHealthBox'), 'container id missing from archive card HTML helper');
  assert.ok(cardHtml.includes('Saved Chat Archive Health'), 'section title missing from archive card HTML helper');
  assert.ok(cardHtml.includes('data-settings-archive-health-section'), 'archive card section marker missing');
});

check('studio.js mounts the card in the active Diagnostics / Storage settings branch', () => {
  const topLevel = functionBlock(studioJs, 'settingsTopLevelContentHtml');
  const diagnosticsIdx = topLevel.indexOf('section === "diagnostics"');
  assert.ok(diagnosticsIdx >= 0, 'diagnostics branch missing from active Settings renderer');
  const libraryIdx = topLevel.indexOf('section === "library"', diagnosticsIdx);
  assert.ok(libraryIdx > diagnosticsIdx, 'diagnostics branch boundary missing');
  const diagnosticsBranch = topLevel.slice(diagnosticsIdx, libraryIdx);
  assert.ok(diagnosticsBranch.includes('settingsStorageDiagnosticsHtml(meta, cardStyle)'), 'active diagnostics branch missing storage diagnostics');
  assert.ok(diagnosticsBranch.includes('settingsArchiveHealthCardHtml(cardStyle)'), 'active diagnostics branch does not render archive health card');
  assert.ok(diagnosticsBranch.includes('settingsFolderOperatorModeDiagnosticsHtml(cardStyle, btnStyle)'), 'active diagnostics branch should preserve folder operator diagnostics');
  assert.ok(diagnosticsBranch.indexOf('settingsStorageDiagnosticsHtml(meta, cardStyle)') < diagnosticsBranch.indexOf('settingsArchiveHealthCardHtml(cardStyle)'), 'archive health should render inside diagnostics branch after storage diagnostics');
});

check('studio.js wiring calls only the read-only diagnostic API with the C5.4A options', () => {
  const block = functionBlock(studioJs, 'mountSettingsArchiveHealthCard');
  assert.ok(block.includes('renderArchiveHealthCard'), 'wiring does not call the helper');
  assert.ok(block.includes('diagnoseSavedChatArchiveV1'), 'wiring does not call diagnoseSavedChatArchiveV1');
  assert.ok(block.includes('archiveHealthMounted'), 'mount guard missing');
  for (const k of ['includeCasChecks', 'includeRendererChecks', 'includeDbChecks']) {
    assert.ok(block.includes(k), `diagnose options missing ${k}`);
  }
  // the wiring block (comment-stripped) must not perform any mutation/repair
  const blockCode = stripComments(block);
  for (const banned of ['repair', 'writeSavedChatPackageV1', 'putAssetBytes', 'upsert', 'delete', 'overwrite', 'import']) {
    assert.ok(!blockCode.includes(banned), `forbidden token in archive-health wiring: ${banned}`);
  }
});

check('studio.js post-render wiring runs for the same active Diagnostics branch that renders the container', () => {
  const shell = functionBlock(studioJs, 'renderSettingsSectionShell');
  assert.ok(shell.includes('settingsTopLevelContentHtml(key, cardStyle, btnStyle, extensionMeta)'), 'active settings shell must render top-level content');
  assert.ok(shell.includes('if (key === "diagnostics") mountSettingsArchiveHealthCard(panel);'), 'active diagnostics branch does not mount archive health after render');
  assert.ok(shell.indexOf('settingsTopLevelContentHtml(key, cardStyle, btnStyle, extensionMeta)') < shell.indexOf('mountSettingsArchiveHealthCard(panel)'), 'mount should happen after active branch markup is rendered');

  const route = functionBlock(studioJs, 'renderSettingsTopLevelRoute');
  assert.ok(route.includes('if (section === "diagnostics") mountSettingsArchiveHealthCard(panel);'), 'same-route diagnostics refresh path does not mount archive health');
});

check('helper is loaded in studio.html and packed', () => {
  assert.ok(studioHtml.includes('./ingestion/archive-health-ui.studio.js'), 'studio.html missing helper script');
  const count = (pack.match(/ingestion\/archive-health-ui\.studio\.js/g) || []).length;
  assert.ok(count >= 2, `expected source + mirror pack entries, got ${count}`);
});

console.log('[archive-health-ui] behavioral checks (pure formatArchiveHealthSummary)');

function loadHelper(extra) {
  const context = Object.assign({ console }, extra || {});
  context.globalThis = context; // no window, no document → renderArchiveHealthCard must no-op safely
  const sandbox = vm.createContext(context);
  vm.runInContext(helperSrc, sandbox, { filename: HELPER_REL });
  const api = sandbox.H2O?.Studio?.archiveHealthUi;
  if (!api) throw new Error('archiveHealthUi did not register');
  return api;
}

check('formatArchiveHealthSummary maps statuses without scary warning wording', () => {
  const api = loadHelper();

  const ok = api.formatArchiveHealthSummary({ status: 'ok' });
  assert.equal(ok.state, 'ready');
  assert.equal(ok.pill.tone, 'ok');
  assert.equal(ok.headline, 'Archive diagnostics completed.');

  const warn = api.formatArchiveHealthSummary({ status: 'warning' });
  assert.equal(warn.state, 'ready');
  assert.equal(warn.pill.tone, 'warn');
  assert.match(warn.headline, /may still be portable/);
  assert.match(warn.explanation, /drift/i);
  assert.match(warn.explanation, /portable|valid/i);
  assert.doesNotMatch(warn.headline + ' ' + warn.explanation, /corrupt|broken|integrity problem/i);

  const partial = api.formatArchiveHealthSummary({ status: 'partial' });
  assert.equal(partial.pill.tone, 'block');

  const blocked = api.formatArchiveHealthSummary({ status: 'blocked' });
  assert.equal(blocked.pill.tone, 'block');
  assert.match(blocked.headline, /integrity problems/i);

  const empty = api.formatArchiveHealthSummary({ status: 'empty' });
  assert.equal(empty.state, 'empty');
  assert.match(empty.headline, /No saved chat packages/i);

  // null / unknown must not throw
  const none = api.formatArchiveHealthSummary(null);
  assert.ok(none && typeof none.headline === 'string');
});

check('formatArchiveHealthSections returns the four C6.2 count sections', () => {
  const api = loadHelper();
  const sections = api.formatArchiveHealthSections({
    counts: {
      packagesTotal: 9,
      packagesOk: 8,
      packagesWarning: 1,
      packagesBlocked: 0,
      v1: 2,
      v2: 7,
      brokenPackageAssets: 0,
      assetRefMismatches: 0,
      dataImageResidue: 0,
      missingLiveCasAssets: 1,
      missingDbChats: 0,
      missingDbSnapshots: 0,
      orphanedPackages: 0,
      stalePackages: 1,
      storeAssetMismatches: 0,
    },
    dbChecks: { passed: 8, warnings: 1, failed: 0 },
  });
  assert.equal(JSON.stringify(sections.map((section) => section.key)), JSON.stringify(['archive-health', 'integrity', 'drift', 'db-checks']));
  const html = api.renderArchiveHealthCounts(sections);
  assert.match(html, /data-archive-health-counts/);
  assert.match(html, /packagesTotal/);
  assert.match(html, /brokenPackageAssets/);
  assert.match(html, /missingLiveCasAssets/);
  assert.match(html, /dbChecks\.passed/);
  assert.match(html, /repeat\(auto-fit,minmax\(150px,1fr\)\)/);
});

await checkAsync('copyArchiveHealthReport pretty-prints JSON via navigator.clipboard.writeText and fails softly', async () => {
  let copied = '';
  const api = loadHelper({
    navigator: {
      clipboard: {
        writeText: async (text) => { copied = text; },
      },
    },
  });
  const ok = await api.copyArchiveHealthReport({ status: 'ok', counts: { packagesTotal: 1 } });
  assert.equal(ok.ok, true);
  assert.equal(ok.message, 'Report JSON copied.');
  assert.match(copied, /"packagesTotal": 1/);

  const noClipboardApi = loadHelper();
  const failed = await noClipboardApi.copyArchiveHealthReport({ status: 'ok' });
  assert.equal(failed.ok, false);
  assert.equal(failed.message, 'Could not copy report JSON.');
});

check('renderArchiveHealthCard is safe when no DOM is present (no crash, returns null)', () => {
  const api = loadHelper();
  assert.equal(typeof api.renderArchiveHealthCard, 'function');
  const out = api.renderArchiveHealthCard({}, { diagnose: async () => ({ status: 'ok' }) });
  assert.equal(out, null, 'must no-op without a document');
});

console.log('');
if (FAIL.length) {
  console.error(`[archive-health-ui] ${FAIL.length} failed, ${PASS.length} passed`);
  process.exitCode = 1;
} else {
  console.log(`[archive-health-ui] all ${PASS.length} checks passed`);
}
