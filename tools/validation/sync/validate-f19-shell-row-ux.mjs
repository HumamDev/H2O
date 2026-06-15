#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SCHEMA = 'h2o.sync.f19.shell-row-ux.v1';

const FILES = {
  chromeExport: 'src-surfaces-base/studio/sync/auto-import.mv3.js',
  chromeImport: 'src-surfaces-base/studio/sync/folder-import.mv3.js',
  libraryIndex: 'src-surfaces-base/studio/S0F1c. 🎬 Library Index - Studio.js',
  insights: 'src-surfaces-base/studio/S0F1d. 🎬 Library Insights - Studio.js',
};

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function check(id, ok, file, detail) {
  return { id, ok: !!ok, file, detail };
}

const sources = Object.fromEntries(
  Object.entries(FILES).map(([key, rel]) => [key, read(rel)])
);

const checks = [
  check(
    'chrome-export-shell-title-friendly',
    sources.chromeExport.includes('friendlyShellTitle(') &&
      sources.chromeExport.includes('titleCandidatesFromLibraryRow') &&
      sources.chromeExport.includes('displayTitle: title') &&
      sources.chromeExport.includes('sourceTitle: title') &&
      sources.chromeExport.includes("linked && !saved ? 'Linked chat' : 'Imported chat'") &&
      !sources.chromeExport.includes('var title = cleanString(row && (row.title || row.chatTitle || row.name)) || id;'),
    FILES.chromeExport,
    'Chrome minimal LibraryIndex export must preserve available source/display title metadata and not fall back to raw chat IDs.'
  ),
  check(
    'chrome-import-shell-title-friendly',
    sources.chromeImport.includes('friendlyShellTitle(') &&
      sources.chromeImport.includes("linked && !saved ? 'Linked chat' : 'Imported chat'") &&
      !sources.chromeImport.includes('title: cleanString(index.title || chat.title || chatId)'),
    FILES.chromeImport,
    'Desktop-to-Chrome shell materialization must project friendly titles.'
  ),
  check(
    'library-index-rehydrates-friendly-shell-titles',
    sources.libraryIndex.includes('friendlyShellTitle(') &&
      sources.libraryIndex.includes('function normalizeRegistryShellRow') &&
      !sources.libraryIndex.includes('title: String(rec.title || chatId).trim()'),
    FILES.libraryIndex,
    'Durable shell-row rehydration must not restore raw IDs as titles.'
  ),
  check(
    'insights-imported-placeholder-clickable',
    sources.insights.includes('function isImportedShellRow') &&
      sources.insights.includes('function displayTitleForRow') &&
      sources.insights.includes("placeholder: placeholderKind") &&
      sources.insights.includes("const canShowPlaceholder = ['dashboard', 'explorer', 'recents', 'saved', 'pinned', 'archive', 'linked', 'all'].includes") &&
      sources.insights.includes("opens:      opensReader ? 'reader' : (opensLinkedDetails ? 'placeholder-details' : 'none')"),
    FILES.insights,
    'Library Insights must route imported shell rows to a placeholder details panel instead of making them inert.'
  ),
  check(
    'insights-explorer-all-filter',
    sources.insights.includes("view: 'all'") &&
      sources.insights.includes("Pill({ label: 'All'") &&
      sources.insights.includes("let list = v === 'all' ? rows.slice() : rows.filter((r) => r.view === v);") &&
      sources.insights.includes("view === 'all' || view === 'saved'"),
    FILES.insights,
    'Explorer must expose an All filter before Saved and include every known chat row.'
  ),
  check(
    'insights-title-candidate-order',
    sources.insights.includes('row?.displayTitle') &&
      sources.insights.includes('row?.sourceTitle') &&
      sources.insights.includes('source.label') &&
      sources.insights.includes('imported chat|linked chat|untitled chat') &&
      sources.insights.includes("if (kind === 'imported') return 'Imported chat';"),
    FILES.insights,
    'Imported shell rows must prefer original/display/source title metadata before the generic fallback.'
  ),
  check(
    'insights-imported-placeholder-copy',
    sources.insights.includes('Imported placeholder') &&
      sources.insights.includes('Transcript content is not present on this surface') &&
      sources.insights.includes('Sync metadata is loading; counts may settle after import hydration.'),
    FILES.insights,
    'Imported shell rows and delayed hydration must be visible and explainable in the UI.'
  ),
];

const blockers = checks.filter((entry) => !entry.ok).map((entry) => ({
  code: 'f19-shell-row-ux-check-failed',
  check: entry.id,
  file: entry.file,
  detail: entry.detail,
}));

const result = {
  schema: SCHEMA,
  ok: blockers.length === 0,
  verdict: blockers.length === 0 ? 'SHELL ROW UX READY' : 'SHELL ROW UX BLOCKED',
  checks,
  blockers,
  observedAtIso: new Date().toISOString(),
};

console.log(JSON.stringify(result, null, 2));
process.exit(result.ok ? 0 : 1);
