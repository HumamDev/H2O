#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SCHEMA = 'h2o.sync.f19.shell-row-ux.v1';

const FILES = {
  chromeExport: 'src-surfaces-base/studio/sync/auto-import.mv3.js',
  chromeImport: 'src-surfaces-base/studio/sync/folder-import.mv3.js',
  chromeBackground: 'tools/product/extensions/chatgpt/chrome/chrome-live-background.mjs',
  desktopImport: 'src-surfaces-base/studio/ingestion/import-bundle.tauri.js',
  registryCore: 'shared/library/chat-registry-core.js',
  libraryActions: 'src-runtime-base/0F1j.⬛️🗂️ Library Actions 🎯🗂️.js',
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
      sources.chromeExport.includes('originalTitle') &&
      sources.chromeExport.includes("linked && !saved ? 'Link' : 'Imported chat'") &&
      !sources.chromeExport.includes('var title = cleanString(row && (row.title || row.chatTitle || row.name)) || id;'),
    FILES.chromeExport,
    'Chrome minimal LibraryIndex export must preserve available source/display title metadata and not fall back to raw chat IDs.'
  ),
  check(
    'chrome-import-shell-title-friendly',
    sources.chromeImport.includes('friendlyShellTitle(') &&
      sources.chromeImport.includes('originalTitle') &&
      sources.chromeImport.includes("linked && !saved ? 'Link' : 'Imported chat'") &&
      !sources.chromeImport.includes('title: cleanString(index.title || chat.title || chatId)'),
    FILES.chromeImport,
    'Desktop-to-Chrome shell materialization must project friendly titles.'
  ),
  check(
    'library-index-rehydrates-friendly-shell-titles',
    sources.libraryIndex.includes('friendlyShellTitle(') &&
      sources.libraryIndex.includes('function normalizeRegistryShellRow') &&
      sources.libraryIndex.includes("isImported: importedShell") &&
      sources.libraryIndex.includes('originalTitle') &&
      sources.libraryIndex.includes("linked && !saved ? 'Link' : 'Imported chat'") &&
      sources.libraryIndex.includes("isLinked && !isSaved ? 'Link' : 'Imported chat'") &&
      !sources.libraryIndex.includes('title: String(rec.title || chatId).trim()'),
    FILES.libraryIndex,
    'Durable shell-row rehydration must not restore raw IDs as titles and must carry shell state into the shared UI model.'
  ),
  check(
    'library-index-url-only-source-saved-classifies-link',
    sources.libraryIndex.includes('const displaySaved = !!(chat?.isSaved && hasOpenableTranscript);') &&
      sources.libraryIndex.includes("else if (displayLinked) view = 'linked';") &&
      sources.libraryIndex.includes('isSaved: displaySaved') &&
      sources.libraryIndex.includes('isLinked: displayLinked') &&
      sources.libraryIndex.includes('f19SourceWasSaved') &&
      sources.libraryIndex.includes('f19DisplayClassifiedAsLink'),
    FILES.libraryIndex,
    'URL-only rows with historical saved/source state must project as Link, not Saved, unless they have an openable transcript snapshot.'
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
      sources.insights.includes("else if (v === 'saved') list = rows.filter((r) => rowHasOpenableTranscriptContent(r) && getRowState(r).isSaved);") &&
      sources.insights.includes("else if (v === 'linked') list = rows.filter((r) => rowIsUrlOnlyLink(r));") &&
      sources.insights.includes("view === 'all' || view === 'saved'"),
    FILES.insights,
    'Explorer must expose All, keep Saved transcript-backed, and route URL-only rows through the Link filter.'
  ),
  check(
    'insights-link-badge-semantics',
    sources.insights.includes('function rowHasTranscriptContent') &&
      sources.insights.includes('function rowHasOpenableTranscriptContent') &&
      sources.insights.includes('function rowIsUrlOnlyLink') &&
      sources.insights.includes("Object.prototype.hasOwnProperty.call(raw, 'snapshotCount')") &&
      sources.insights.includes('row.isImported || raw.isImported') &&
      sources.insights.includes("if (opensReader && hasTranscript && st.isSaved) chips.push(['Saved', 'wbRowChip--saved']);") &&
      sources.insights.includes("else if (urlOnlyLink || st.isLinked || opensLinkedDetails) chips.push(['Link', 'wbRowChip--linked']);") &&
      sources.insights.includes("Pill({ label: 'Link'") &&
      !sources.insights.includes("else if (st.isLinked || opensLinkedDetails) chips.push(['Linked', 'wbRowChip--linked']);"),
    FILES.insights,
    'Visible row badges must classify transcript-backed rows as Saved and URL-only shell rows as Link.'
  ),
  check(
    'insights-update-from-url-action',
    sources.insights.includes('Update from URL') &&
      sources.insights.includes('function updateRowMetadataFromUrl') &&
      sources.insights.includes('function fetchTitleFromUrl') &&
      sources.insights.includes('fetchPageMetadata') &&
      sources.insights.includes('requiresBackgroundMetadataFetch') &&
      sources.insights.includes('Could not update from URL: permission/metadata unavailable') &&
      sources.insights.includes('Could not update from URL: background unavailable') &&
      sources.insights.includes('Could not update from URL: CORS/fetch blocked') &&
      sources.insights.includes('Could not read title from URL: source page did not expose title') &&
      sources.insights.includes('Open the source tab first, then click Update from URL again') &&
      sources.insights.includes('Could not read title from URL: open source tab title was not specific') &&
      sources.insights.includes('metadata-store-unavailable') &&
      sources.insights.includes('f19UrlMetadataUpdatedAt') &&
      sources.insights.includes("titleSource: 'title'") &&
      sources.insights.includes('originalTitle: title') &&
      sources.insights.includes('looksLikeOpaqueTitle(metadata.title, row)') &&
      !sources.insights.includes('fake turns'),
    FILES.insights,
    'Placeholder details must expose a metadata-only Update from URL action with classified safe failure copy.'
  ),
  check(
    'registry-core-preserves-better-title-aliases',
    sources.registryCore.includes('imported chat|linked chat|link') &&
      sources.registryCore.includes('function firstNonPlaceholderTitle') &&
      sources.registryCore.includes('displayTitle: displayTitle || title') &&
      sources.registryCore.includes('sourceTitle: sourceTitle || title') &&
      sources.registryCore.includes('pageTitle: pageTitle || title') &&
      sources.registryCore.includes('originalTitle: originalTitle || title') &&
      sources.registryCore.includes("'displayTitle','sourceTitle','pageTitle','originalTitle'"),
    FILES.registryCore,
    'Registry merge must treat Imported chat/Link as placeholder titles and preserve safe title aliases across save/link/update/import flows.'
  ),
  check(
    'library-actions-capture-source-title',
    sources.libraryActions.includes('function currentChatTitleState') &&
      sources.libraryActions.includes('function titleMetadataPatch') &&
      sources.libraryActions.includes('displayTitle: cleanTitle') &&
      sources.libraryActions.includes('originalTitle: cleanTitle') &&
      sources.libraryActions.includes("titleSource = isGenericTitle(cleanTitle) ? 'derived' : 'title'") &&
      sources.libraryActions.includes('buildSaveRegistryPatchWithCore(ident, args, source, title)') &&
      sources.libraryActions.includes('H2O.ChatRegistry.upsertRecord(buildAddPatchWithCore(ident, args, source, title), { source })'),
    FILES.libraryActions,
    'Save/link actions must capture the current ChatGPT title into the registry instead of relying on later URL metadata fetch.'
  ),
  check(
    'chrome-background-page-metadata-fetch',
    sources.chromeBackground.includes('"fetchPageMetadata"') &&
      sources.chromeBackground.includes('async function fetchPageMetadata') &&
      sources.chromeBackground.includes('async function pageMetadataTitleFromOpenTab') &&
      sources.chromeBackground.includes('pageMetadataNormalizeChatConversationUrl') &&
      sources.chromeBackground.includes('source-tab-not-open') &&
      sources.chromeBackground.includes('open-tab-title-generic') &&
      sources.chromeBackground.includes('matchedOpenTab: true') &&
      sources.chromeBackground.includes('pageMetadataExtractTitle') &&
      sources.chromeBackground.includes('pageMetadataPermissionContains') &&
      sources.chromeBackground.includes('permission-denied') &&
      sources.chromeBackground.includes('no-title-found'),
    FILES.chromeBackground,
    'Chrome runtime must provide a background metadata fetch bridge so Update from URL can distinguish permission, network, and title failures.'
  ),
  check(
    'desktop-import-shell-title-friendly',
    sources.desktopImport.includes('function friendlyShellTitle') &&
      sources.desktopImport.includes('displayTitle: title') &&
      sources.desktopImport.includes('sourceTitle: title') &&
      sources.desktopImport.includes('pageTitle: title') &&
      sources.desktopImport.includes('originalTitle: title') &&
      !sources.desktopImport.includes('cleanString(patch && patch.title) || chatId'),
    FILES.desktopImport,
    'Desktop minimal shell materialization must preserve title metadata and never fall back to raw chat IDs.'
  ),
  check(
    'insights-title-candidate-order',
    sources.insights.includes('row?.displayTitle') &&
      sources.insights.includes('row?.sourceTitle') &&
      sources.insights.includes('row?.originalTitle') &&
      sources.insights.includes('source.label') &&
      sources.insights.includes('imported chat|linked chat|untitled chat|link|chatgpt') &&
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
