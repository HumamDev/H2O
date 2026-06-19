#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SCHEMA = 'h2o.sync.f19.shell-row-ux.v1';

const FILES = {
  chromeExport: 'src-surfaces-base/studio/sync/auto-import.mv3.js',
  chromeImport: 'src-surfaces-base/studio/sync/folder-import.mv3.js',
  chromeBackground: 'tools/product/extensions/chatgpt/chrome/chrome-live-background.mjs',
  chromeLiveLoader: 'tools/product/extensions/chatgpt/chrome/chrome-live-loader.mjs',
  chromeLiveManifest: 'tools/product/extensions/chatgpt/chrome/chrome-live-manifest.mjs',
  desktopImport: 'src-surfaces-base/studio/ingestion/import-bundle.tauri.js',
  registryCore: 'shared/library/chat-registry-core.js',
  runtimeRegistryCore: 'src-runtime-base/0F0c.⬛️🧬 Library Registry Core 🧬.js',
  studioRegistryCore: 'src-surfaces-base/studio/S0F0c. 🎬 Library Registry Core - Studio.js',
  extensionBridge: 'src-runtime-base/0D3b.⚫️🗄️ Transcript Extension Bridge 📡🗂️🗄️.js',
  archiveEngine: 'src-runtime-base/0D3a.⬛️🗄️ Transcript Archive Engine 🗂️🗄️.js',
  studioArchiveEngine: 'src-surfaces-base/studio/S0D3a. 🎬 Transcript Archive Engine - Studio.js',
  saveStrip: 'src-runtime-base/0D3d.⚫️🗄️ Transcript Save Strip ⏺️🗂️🗄️.js',
  libraryActions: 'src-runtime-base/0F1j.⬛️🗂️ Library Actions 🎯🗂️.js',
  nativeFolders: 'src-runtime-base/0F3a.⬛️🗂️ Folders 🗂️.js',
  nativeSync: 'src-runtime-base/0F1h.⬛️🗂️ Library Sync 🛰🗂️.js',
  studioSync: 'src-surfaces-base/studio/S0F1h. 🎬 Library Sync - Studio.js',
  libraryIndexCore: 'shared/library/library-index-core.js',
  libraryIndex: 'src-surfaces-base/studio/S0F1c. 🎬 Library Index - Studio.js',
  insights: 'src-surfaces-base/studio/S0F1d. 🎬 Library Insights - Studio.js',
  libraryParityDiagnostic: 'src-surfaces-base/studio/sync/library/library-chrome-desktop-parity-diagnostic.js',
  studioShell: 'src-surfaces-base/studio/studio.js',
  studioHtml: 'src-surfaces-base/studio/studio.html',
  libraryWorkspace: 'src-surfaces-base/studio/S0F1b. 🎬 Library Workspace - Studio.js',
  folderActions: 'src-surfaces-base/studio/S0F3b. 🎬 Folders Actions - Studio.js',
  sidebarSections: 'src-surfaces-base/studio/S0Z1g. 🎬 Library Sidebar Sections - Studio.js',
  sidebarTab: 'src-surfaces-base/studio/S0Z1f. 🎬 Library Sidebar Tab - Studio.js',
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
      sources.libraryIndex.includes("transcriptEvidenceSource = hasTranscript ? 'native-linked-record-broadcast' : ''") &&
      sources.libraryIndex.includes('function mergeNativeTranscriptEvidenceIntoRow') &&
      sources.libraryIndex.includes("transcriptEvidenceSource: 'native-linked-record-broadcast-merge'") &&
      sources.libraryIndex.includes('nativeMergedTranscriptRows') &&
      sources.libraryIndex.includes('nativeTranscriptRows') &&
      sources.libraryIndex.includes('fallbackTranscriptRows') &&
      !sources.libraryIndex.includes('title: String(rec.title || chatId).trim()'),
    FILES.libraryIndex,
    'Durable shell-row rehydration must not restore raw IDs as titles and must carry shell state into the shared UI model.'
  ),
  check(
    'library-index-url-only-source-saved-classifies-link',
    sources.libraryIndex.includes('function chatHasTranscriptEvidence') &&
      sources.libraryIndex.includes('function applyDisplayClassification') &&
      sources.libraryIndex.includes('latestSnapshotByChatId') &&
      sources.libraryIndex.includes('const displaySaved = !!(chat?.isSaved && hasTranscript);') &&
      sources.libraryIndex.includes("else if (displayLinked) view = 'linked';") &&
      sources.libraryIndex.includes('isSaved: displaySaved') &&
      sources.libraryIndex.includes('isLinked: displayLinked') &&
      sources.libraryIndex.includes('f19SourceWasSaved') &&
      sources.libraryIndex.includes('f19DisplayClassifiedAsLink'),
    FILES.libraryIndex,
    'URL-only rows with historical saved/source state must project as Link, while saved rows with snapshot/message evidence remain Saved even if lastSnapshotId is empty.'
  ),
  check(
    'library-index-source-view-display-split',
    sources.libraryIndex.includes('row.sourceView = sourceView') &&
      sources.libraryIndex.includes('row.originalView = sourceView') &&
      sources.libraryIndex.includes('row.rawView = sourceView') &&
      sources.libraryIndex.includes("row.view = 'link'") &&
      sources.libraryIndex.includes("row.displayView = 'link'") &&
      sources.libraryIndex.includes("row.badgeKind = 'Link'") &&
      sources.libraryIndex.includes("row.readerKind = 'placeholder'") &&
      sources.libraryIndex.includes('row.sourceIsSaved') &&
      sources.libraryIndex.includes('raw.sourceView') &&
      sources.libraryIndex.includes('raw.isSaved = false'),
    FILES.libraryIndex,
    'URL-only rows must preserve historical source view separately while exposing user-facing Link display classification.'
  ),
  check(
    'library-index-transcript-evidence-not-last-snapshot-only',
    sources.libraryIndex.includes('numericCount(chat?.messageCount) > 0') &&
      sources.libraryIndex.includes('numericCount(chat?.turnCount) > 0') &&
      sources.libraryIndex.includes('numericCount(chat?.userTurnCount) > 0') &&
      sources.libraryIndex.includes('numericCount(chat?.assistantTurnCount) > 0') &&
      sources.libraryIndex.includes('const snapshotCount = snapshotId ? Math.max(numericCount(chat?.snapshotCount), 1) : 0;') &&
      sources.libraryIndex.includes('const snapshotCount = snapshotId ? Math.max(numericCount(rec.snapshotCount), 1) : 0;') &&
      sources.libraryIndex.includes('const messageCount = numericCount(rec.messageCount);') &&
      sources.libraryIndex.includes('row.snapshotCount = snapshotCount;') &&
      sources.libraryIndex.includes('row.assistantTurnCount = assistantTurnCount;') &&
      sources.libraryIndex.includes("row.view = row.displayView") &&
      sources.libraryIndex.includes("row.isSaved = row.displayView === 'saved' || sourceIsSaved") &&
      sources.libraryIndex.includes('row.isLinked = sourceIsLinked') &&
      sources.libraryIndex.includes('isSaved: row.isSaved') &&
      !sources.libraryIndex.includes('|| numericCount(chat?.snapshotCount) > 0') &&
      !sources.libraryIndex.includes('const hasOpenableTranscript = !!chat?.lastSnapshotId;'),
    FILES.libraryIndex,
    'Desktop LibraryIndex projection must not gate Saved classification solely on chats.last_snapshot_id or snapshot-count-only evidence, and shell rows must not inherit a fake transcript count.'
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
      sources.insights.includes('const activeRows = canonicalActiveRows(rows);') &&
      sources.insights.includes("if (v === 'saved') list = activeRows.filter((r) => rowHasOpenableTranscriptContent(r) && getRowState(r).isSaved);") &&
      sources.insights.includes("else if (v === 'linked' || v === 'link') list = activeRows.filter((r) => rowIsUrlOnlyLink(r));") &&
      sources.insights.includes('else list = canonicalRowsForView(rows, v);') &&
      sources.insights.includes("view === 'all' || view === 'saved'"),
    FILES.insights,
    'Explorer must expose All, keep Saved transcript-backed, and route URL-only rows through the Link filter.'
  ),
  check(
    'insights-canonical-active-projection',
      sources.insights.includes('function canonicalActiveRows(rows)') &&
      sources.insights.includes('function canonicalArchivedRows(rows)') &&
      sources.insights.includes('function canonicalActiveFacets(rows)') &&
      sources.insights.includes('function canonicalRecentRows(rows, limit = 20)') &&
      sources.insights.includes('function canonicalSavedRecentRows(rows, limit = 20)') &&
      sources.insights.includes('core.canonicalSavedRecentRows(rows, limit, { dateField: \'savedRecent\' })') &&
      sources.insights.includes('const recent = canonicalSavedRecentRows(rows, 6);') &&
      sources.insights.includes('const sorted = canonicalSavedRecentRows(all, Infinity);') &&
      sources.insights.includes('const knownRows = explorerKnownRows(rows, opts);') &&
      sources.insights.includes('const f = canonicalActiveFacets(allRows);') &&
      sources.libraryIndex.includes("typeof c.canonicalActiveFacets === 'function'") &&
      sources.libraryIndex.includes("typeof c.canonicalHeadlineCounts === 'function'") &&
      sources.libraryIndexCore.includes('canonicalSavedRecentRows') &&
      sources.libraryIndexCore.includes('rowHasTranscriptEvidence') &&
      sources.libraryIndexCore.includes('function rowIsSavedRecentEligible(row)') &&
      sources.libraryIndexCore.includes('filter(rowIsSavedRecentEligible)') &&
      sources.studioShell.includes('if (next === "archive") return archived;') &&
      sources.studioShell.includes('if (archived) return false;') &&
      sources.studioShell.includes('function canonicalSavedRecentLibraryIndexRows(limit = 30)') &&
      sources.studioShell.includes('core.canonicalSavedRecentRows(rows, limit, { dateField: "savedRecent" })') &&
      sources.studioShell.includes('core.rowIsSavedRecentEligible') &&
      sources.studioShell.includes('function collectCanonicalSidebarRecentChats(rows, folderId = "", query = "")') &&
      sources.studioShell.includes('const sourceIsCanonical = hasLibraryIndexRowsApi();') &&
      sources.studioShell.includes('const canonicalRows = sourceIsCanonical ? canonicalSavedRecentLibraryIndexRows(200) : [];') &&
      sources.studioShell.includes('projectRecentLibraryRowsToWorkbenchRows(canonicalRows)') &&
      sources.studioShell.includes('const source = sourceIsCanonical ? fromIndex : fallback;') &&
      sources.studioShell.includes('if (sourceIsCanonical) return filtered;') &&
      sources.studioShell.includes('if (!libraryRowIsSavedTranscript(row)) return false;') &&
      sources.studioShell.includes('link.dataset.saved = isSavedTranscript ? "1" : "0";') &&
      sources.studioShell.includes('link.dataset.linked = isLinkOnly ? "1" : "0";') &&
      sources.studioShell.includes('link.dataset.opens = readerSnapshotId && !isLinkOnly ? "reader" : "placeholder-details";') &&
      sources.libraryIndex.includes('function diagnoseRecentsParity(options = {})') &&
      sources.libraryIndex.includes('domSidebarRecentsRowTokens') &&
      sources.libraryIndex.includes('domDashboardRecentTokens') &&
      sources.libraryIndex.includes('domSidebarMatchesSourceOrder') &&
      sources.libraryIndex.includes('domSidebarSourceOrderMismatchCount') &&
      sources.libraryIndex.includes('&& domSidebarMatchesSourceOrder') &&
      sources.libraryIndex.includes('function recentsRowIsSavedRecentEligible(row)') &&
      sources.libraryIndex.includes("rowIsSavedRecentEligible: c && typeof c.rowIsSavedRecentEligible === 'function' ? 'LibraryIndexCore.rowIsSavedRecentEligible' : 'S0F1c.recentsRowIsSavedRecentEligible'") &&
      sources.libraryIndex.includes('domLinkOnlyRowsAccidentallyIncludedCount') &&
      sources.libraryIndex.includes('first10CanonicalSortTokens') &&
      sources.insights.includes("archived:   st.isArchived ? '1' : '0'") &&
      sources.insights.includes("deleted:    st.isDeleted ? '1' : '0'") &&
      sources.studioShell.includes('window.addEventListener(eventName, scheduleLibraryIndexWorkbenchRefresh);') &&
      !sources.studioShell.includes('function isRecentSidebarSavedChat') &&
      !sources.studioShell.includes('Loading saved chats'),
    FILES.insights,
    'Library Explorer, Recents, stats, and legacy list views must use the shared active/archive projection instead of raw LibraryIndex rows.'
  ),
  check(
    'saved-recents-require-saved-identity-not-transcript-evidence',
    sources.libraryIndexCore.includes('function rowIsSavedRecentEligible(row)') &&
      sources.libraryIndexCore.includes("if (view === 'link' || view === 'linked') return false;") &&
      sources.libraryIndexCore.includes("if (ensureString(row.opens || row.openTarget || row.openKind).trim().toLowerCase() === 'placeholder-details') return false;") &&
      sources.libraryIndexCore.includes("if (rowFlagFalseForHeadline(row, ['saved', 'isSaved', 'is_saved'])) return false;") &&
      sources.libraryIndexCore.includes('if (!rowSavedForHeadline(row)) return false;') &&
      sources.libraryIndexCore.includes('return rowHasTranscriptEvidence(row);') &&
      sources.libraryIndexCore.includes('filter(rowIsSavedRecentEligible)') &&
      sources.studioShell.includes('core.rowIsSavedRecentEligible') &&
      sources.libraryIndex.includes('recentsRowIsSavedRecentEligible') &&
      sources.libraryParityDiagnostic.includes('function isSavedRecentEligible(row)'),
    FILES.libraryIndexCore,
    'Saved recents must require saved identity and reader evidence; link/placeholder rows with transcript evidence alone must stay out of sidebar and dashboard recents.'
  ),
  check(
    'sidebar-recents-preserves-canonical-dom-order',
    sources.studioShell.indexOf('if (sourceIsCanonical) return filtered;') > -1 &&
      sources.studioShell.indexOf('if (sourceIsCanonical) return filtered;') < sources.studioShell.indexOf('core.canonicalSortRows(filtered, "recent", "savedRecent")') &&
      sources.libraryIndex.includes('recentsTokenSequenceMatches(tokens, domSidebarTokens)') &&
      sources.libraryIndex.includes('ok: linkOnlyLeaks.length === 0 && archivedLeaks.length === 0 && domLinkOnlyLeaks.length === 0 && domArchivedLeaks.length === 0 && domSidebarMatchesSourceOrder'),
    FILES.studioShell,
    'Sidebar Recents DOM renderer must preserve canonical saved-recents order and diagnostics must fail on source/DOM order mismatch.'
  ),
  check(
    'studio-recents-runtime-cache-bust',
    sources.studioHtml.includes('./S0F0d. 🎬 Library Index Core - Studio.js?v=2.5.73') &&
      sources.studioHtml.includes('./S0F1c. 🎬 Library Index - Studio.js?v=2.5.73') &&
      sources.studioHtml.includes('./S0F1d. 🎬 Library Insights - Studio.js?v=2.5.71') &&
        sources.studioHtml.includes('./S0F1b. 🎬 Library Workspace - Studio.js?v=2.5.80') &&
      (sources.studioHtml.includes('./S0Z1f. 🎬 Library Sidebar Tab - Studio.js?v=2.5.74') ||
        sources.studioHtml.includes('./S0Z1f. 🎬 Library Sidebar Tab - Studio.js?v=2.5.75')) &&
        sources.studioHtml.includes('./S0Z1g. 🎬 Library Sidebar Sections - Studio.js?v=2.5.80') &&
        sources.studioHtml.includes('./S0F3b. 🎬 Folders Actions - Studio.js?v=2.5.80') &&
      sources.studioHtml.includes('./S0F1m. 🎬 Library Organization Modals - Studio.js?v=2.5.77') &&
      (sources.studioHtml.includes('./studio.js?v=2.5.75') ||
        sources.studioHtml.includes('./studio.js?v=2.5.76')),
    FILES.studioHtml,
    'Studio must cache-bust the Library Index core, Library Index, Insights, sidebar, and shell scripts so canonical saved-recents and folder operator gates reach Chrome and Desktop runtimes.'
  ),
  check(
    'folder-local-review-operator-gated',
    sources.studioShell.includes('const FOLDER_LOCAL_REVIEW_OPERATOR_MODE_KEY = "h2o:studio:folder-local-review:operator-mode:v1";') &&
      sources.studioShell.includes('const FOLDER_OPERATOR_MODE_CONFIRM_TEXT = "Operator Mode exposes folder review and cleanup tools. Use only for diagnostics.";') &&
      sources.studioShell.includes('function folderOperatorModeEnabled()') &&
      sources.studioShell.includes('function folderLocalReviewUiEnabled()') &&
      sources.studioShell.includes('W.H2O.Studio.folderOperatorMode = {') &&
      sources.studioShell.includes('function settingsFolderOperatorModeDiagnosticsHtml') &&
      sources.studioShell.includes('data-h2o-folder-operator-mode-action="enable"') &&
      sources.studioShell.includes('Operator Mode ON') &&
      sources.studioShell.includes('Disable Operator Mode') &&
      sources.studioShell.includes('W.confirm(FOLDER_OPERATOR_MODE_CONFIRM_TEXT)') &&
      sources.studioShell.includes('function folderSidebarSimpleCountLabel(item)') &&
      sources.studioShell.includes('if (!folderOperatorModeEnabled()) return folderSidebarSimpleCountLabel(item);') &&
      sources.studioShell.includes('function visibleStudioFolderSimpleCountLabel(row)') &&
      sources.studioShell.includes('if (!visibleStudioFolderDebugDetailsVisible()) return visibleStudioFolderSimpleCountLabel(row);') &&
      sources.studioShell.includes('const debugBadge = showDebugDetails') &&
      sources.studioShell.includes('const debugId = showDebugDetails && folderId') &&
      sources.studioShell.includes('pluralize(canonicalRows.length, showLocalReview ? "canonical folder" : "folder")') &&
      sources.studioShell.includes('settingsBindFolderOperatorModeControls(panel)') &&
      sources.studioShell.includes('rerenderSettingsFolderOperatorModeRoute();') &&
      sources.studioShell.includes('const showLocalReview = folderLocalReviewUiEnabled();') &&
      sources.studioShell.includes('host.dataset.h2oFolderLocalReview = showLocalReview ? "operator" : "hidden";') &&
      sources.studioShell.includes('page.dataset.h2oFolderLocalReview = showLocalReview ? "operator" : "hidden";') &&
      sources.studioShell.includes('Folder operator mode is required for cleanup mutation.') &&
      sources.studioShell.includes('if (!folderOperatorModeEnabled() && (next === "local-review" || next === "cleanup-review"))') &&
      sources.studioShell.includes('data-h2o-folder-operator-only="1"') &&
      sources.sidebarSections.includes("const FOLDER_LOCAL_REVIEW_OPERATOR_MODE_KEY = 'h2o:studio:folder-local-review:operator-mode:v1';") &&
      sources.sidebarSections.includes('function folderDestructiveActionsEnabled()') &&
      sources.sidebarSections.includes('function folderSidebarSimpleCountLabel(item = {})') &&
      sources.sidebarSections.includes('if (!folderSidebarDebugDetailsVisible()) return folderSidebarSimpleCountLabel(item);') &&
      (sources.sidebarSections.includes("const countLabel = kind === 'folders' && !folderDebugDetails") ||
        sources.sidebarSections.includes('const countLabel = sidebarSectionCountValue(item);')) &&
      sources.sidebarSections.includes('if (folderSidebarDebugDetailsVisible())') &&
      sources.sidebarSections.includes('const showLocalReview = folderLocalReviewUiEnabled();') &&
      sources.sidebarSections.includes("host.dataset.h2oFolderLocalReview = showLocalReview ? 'operator' : 'hidden';") &&
      sources.sidebarSections.includes('if (folderDestructiveActionsEnabled())') &&
      sources.sidebarSections.includes("W.addEventListener('evt:h2o:studio:folder-operator-mode-changed', () => renderAllSections());") &&
      sources.sidebarTab.includes("const FOLDER_LOCAL_REVIEW_OPERATOR_MODE_KEY = 'h2o:studio:folder-local-review:operator-mode:v1';") &&
      sources.sidebarTab.includes('function folderLocalReviewUiEnabled()') &&
      sources.sidebarTab.includes('function folderPageSimpleCountLabel(row)') &&
      sources.sidebarTab.includes('if (!folderPageDebugDetailsVisible()) return folderPageSimpleCountLabel(row);') &&
      sources.sidebarTab.includes('const showDebugDetails = folderPageDebugDetailsVisible();') &&
      sources.sidebarTab.includes("showLocalReview ? 'Canonical folders' : 'Folders'") &&
      sources.sidebarTab.includes('const showLocalReview = folderLocalReviewUiEnabled();') &&
      sources.sidebarTab.includes("'data-h2o-folder-local-review': showLocalReview ? 'operator' : 'hidden'") &&
      sources.sidebarTab.includes("showLocalReview ? `${reviewRows.length} review` : ''") &&
      sources.sidebarTab.includes("showLocalReview ? `${canonicalRows.length} canonical` : `${canonicalRows.length} folders`"),
    FILES.studioShell,
    'Folder Local Review rows, debug labels, raw folder IDs, and destructive folder cleanup actions must remain hidden/disabled unless folder operator mode is explicitly enabled.'
  ),
  check(
    'folder-sidebar-more-unfiled-polish',
    sources.studioShell.includes('const SIDEBAR_UNFILED_ICON_SVG =') &&
      sources.studioShell.includes('function renderFolderSidebarMoreLink()') &&
      sources.studioShell.includes('link.className = "wbSidebarSectionMore wbFolderSectionMore";') &&
      sources.studioShell.includes('link.href = "#/library/folders";') &&
      sources.studioShell.includes('link.textContent = "More";') &&
      sources.studioShell.includes('const orderedItems = [...unfiledItems, ...projectItems, ...localItems];') &&
      sources.studioShell.includes('if (isUnfiled) link.classList.add("wbFolderItem--unfiled");') &&
      !sources.studioShell.includes('isAllFoldersLink: true') &&
      sources.sidebarSections.includes('inbox:') &&
      (sources.sidebarSections.includes("iconKey: 'inbox'") ||
        sources.sidebarSections.includes("iconKey: 'unfiled'")) &&
      (sources.sidebarSections.includes('iconSvg: SIDEBAR_ICON_SVGS.inbox') ||
        sources.sidebarSections.includes('iconSvg: SIDEBAR_UNFILED_ICON_SVG')) &&
      sources.sidebarSections.includes('const mainItems = [buildUnfiledSidebarItem()];') &&
      sources.sidebarSections.includes("moreHref: '#/library/folders'") &&
      sources.sidebarSections.includes("moreLabel: 'More'") &&
      sources.sidebarSections.includes('const moreText = String(opts.moreLabel ||') &&
      !sources.sidebarSections.includes('mainItems.push(buildAllFoldersSidebarItem())') &&
      !sources.sidebarSections.includes('isAllFoldersLink') &&
      !sources.sidebarSections.includes("name: 'All folders'"),
    FILES.sidebarSections,
    'Sidebar Folders must show Unfiled first with a distinct system icon, replace the fake All folders row with a More link to #/library/folders, and keep Local Review gated separately.'
  ),
  check(
    'folder-sidebar-display-model-parity-actions',
    sources.libraryWorkspace.includes('const CANONICAL_FOLDER_DISPLAY_ORDER_BY_ID = new Map') &&
      sources.libraryWorkspace.includes('const CANONICAL_FOLDER_DISPLAY_ORDER_BY_NAME = new Map') &&
      sources.libraryWorkspace.includes('const CANONICAL_FOLDER_DISPLAY_COLOR_BY_ID = new Map') &&
      sources.libraryWorkspace.includes('const CANONICAL_FOLDER_DISPLAY_COLOR_BY_NAME = new Map') &&
      sources.libraryWorkspace.includes("['f_7050f49d3f341819dba53d547', 'study',   '#F472B6']") &&
      sources.libraryWorkspace.includes('function canonicalFolderDisplayColor(row)') &&
      sources.libraryWorkspace.includes('function decorateCanonicalFolderColorSources(folder, storedById, nativeById)') &&
      sources.libraryWorkspace.includes("? 'known-canonical-display-palette'") &&
      sources.libraryWorkspace.includes('storedColor') &&
      sources.libraryWorkspace.includes('nativeColor') &&
      sources.libraryWorkspace.includes('colorConflict') &&
        sources.libraryWorkspace.includes('function canonicalFolderDisplayOrder(row)') &&
        sources.libraryWorkspace.includes('return 1000 + explicit;') &&
        sources.libraryWorkspace.includes('function isCanonicalDisplayFolder(row)') &&
        sources.libraryWorkspace.includes('function isMaterializedUserFolder(row)') &&
        sources.libraryWorkspace.includes('return isPrimaryCanonicalFolder(row) || isStoredFolderStateRow(row) || isMaterializedUserFolder(row);') &&
        sources.libraryWorkspace.includes('const materializedLocalRows = localRows') &&
        sources.libraryWorkspace.includes('primaryCanonicalRows.push(...materializedLocalRows);') &&
        sources.libraryWorkspace.includes('materializedUserFolderCount') &&
        sources.libraryWorkspace.includes('hiddenLocalOnlyFolders') &&
        sources.libraryWorkspace.includes('folderNameProbe') &&
        sources.libraryWorkspace.includes('function filterFolderStateForNormalDisplay(stateInput, includeStoredDynamic = false)') &&
        sources.libraryWorkspace.includes('nativeOnlyDisplaySuppressedFolders') &&
        sources.libraryWorkspace.includes('function mergeCanonicalFolderDisplaySource(localRow, canonicalRow, canonicalMirrorAvailable)') &&
      sources.libraryWorkspace.includes('const canonicalOrderTokens = canonicalRows.map') &&
      sources.libraryWorkspace.includes('const canonicalColorTokens = canonicalRows.map') &&
      sources.sidebarSections.includes('function diagnoseFolderSidebarParity(options = {})') &&
      sources.sidebarSections.includes("'.wbFolderItem[data-folder-id]'") &&
      sources.sidebarSections.includes('data-h2o-folder-sidebar-row') &&
      sources.sidebarSections.includes('data-h2o-folder-color-source') &&
      sources.sidebarSections.includes('function renderedFolderSidebarTokens(modelRows = [])') &&
      sources.sidebarSections.includes('const modelRows = [buildUnfiledSidebarItem(), ...canonicalRows];') &&
      sources.sidebarSections.includes('renderedSidebarFolderTokens') &&
      sources.sidebarSections.includes('canonicalFolderDisplayModelTokens') &&
      sources.sidebarSections.includes('capabilityPathUsed') &&
      sources.sidebarSections.includes('colorSource') &&
      sources.sidebarSections.includes('H2O.Studio.diagnoseFolderSidebarParity = diagnoseFolderSidebarParity') &&
      sources.sidebarSections.includes('function desktopFolderEditor()') &&
      sources.sidebarSections.includes('function studioIsTauri()') &&
      sources.sidebarSections.includes("function canUseDesktopFolderEditor(mode = '')") &&
      sources.sidebarSections.includes("if (m === 'create') return typeof actions?.create === 'function';") &&
      sources.sidebarSections.includes("if (m === 'rename') return typeof actions?.rename === 'function';") &&
      sources.sidebarSections.includes("if (m === 'color') return typeof actions?.update === 'function';") &&
      sources.sidebarSections.includes('function canRequestNativeCanonicalFolderColor(item)') &&
      sources.sidebarSections.includes('function canRequestNativeCanonicalFolderRename(item)') &&
        sources.sidebarSections.includes('function requestDesktopFolderEditor(mode, item = {}, options = {})') &&
        sources.sidebarSections.includes("const result = await requestDesktopFolderEditor('color', item, { color: nextColor, iconColor: nextColor });") &&
        sources.sidebarSections.includes("const result = await requestDesktopFolderEditor('rename', item, { name: nextName });") &&
        sources.sidebarSections.includes("const result = await requestDesktopFolderEditor('create', {}, { name: nextName });") &&
        sources.sidebarSections.includes('userCreatedMaterializedFolderTokens') &&
        sources.sidebarSections.includes('hiddenLocalOnlyTokens') &&
        sources.sidebarSections.includes('folderCreateLastResult') &&
        sources.sidebarSections.includes("return (studioPlatformAdapter() === 'mv3' && !!folderMetadataOperationRequest())") &&
        sources.sidebarSections.includes("|| canUseDesktopFolderEditor('create')") &&
        sources.sidebarSections.includes('if (folderDestructiveActionsEnabled())') &&
        sources.folderActions.includes("var source = cleanString(opts.source) || 'desktop-user-folder-create';") &&
        sources.folderActions.includes('userCreated: true') &&
        sources.folderActions.includes('materializedUserFolder: true') &&
        sources.folderActions.includes('trustedFolderDisplay: true'),
      FILES.libraryWorkspace,
      'Chrome and Desktop folder sidebar must use stable canonical order/color tokens, Desktop-safe create/rename/color actions, and keep delete/destructive actions operator-only.'
    ),
  check(
    'folder-catalog-readiness-fallback-rendering',
    sources.libraryWorkspace.includes('folderCatalogReady: displayModelAvailable') &&
      sources.libraryWorkspace.includes('displayModelAvailable') &&
      sources.libraryWorkspace.includes('nativeBroadcastRequired: !displayModelAvailable') &&
      sources.libraryWorkspace.includes('renderBlockedReason') &&
      sources.studioShell.includes('function makeKnownCanonicalFolderCatalogFallback') &&
      sources.studioShell.includes('folder-parity-api-loading') &&
      sources.studioShell.includes('folder-parity-timeout-fallback') &&
      sources.studioShell.includes('if (!folderEntries.length)') &&
      sources.studioShell.includes('makeVisibleStudioFoldersFallbackModel(String(model?.renderBlockedReason') &&
      sources.sidebarSections.includes('host.dataset.h2oFolderCatalogReady') &&
      sources.sidebarSections.includes('folderCatalogReady: model?.folderCatalogReady === true || canonicalRows.length > 0') &&
      sources.sidebarSections.includes('renderBlockedReason: canonicalRows.length ?'),
    FILES.studioShell,
    'Folder sidebar/page must render the protected canonical fallback display model when native broadcast or FolderParity hydration is not ready, and only block when no usable model exists.'
  ),
  check(
    'insights-link-badge-semantics',
    sources.insights.includes('function rowHasTranscriptContent') &&
      sources.insights.includes('function rowHasOpenableTranscriptContent') &&
      sources.insights.includes('function resolveReaderSnapshotId') &&
      sources.insights.includes('function rowIsUrlOnlyLink') &&
      sources.insights.includes("row.displayView || row.badgeKind || row.view") &&
      sources.insights.includes("displayView === 'link' || displayView === 'linked'") &&
      sources.insights.includes("view === 'linked' || view === 'link'") &&
      sources.insights.includes("Object.prototype.hasOwnProperty.call(raw, 'messageCount')") &&
      sources.insights.includes("Object.prototype.hasOwnProperty.call(raw, 'turnCount')") &&
      sources.insights.includes('const hasSnapshotArrayEvidence = Array.isArray(raw.snapshots)') &&
      sources.insights.includes('return hasSnapshotArrayEvidence || messageCount > 0;') &&
      sources.insights.includes('return rowHasTranscriptContent(row);') &&
      sources.insights.includes('row.isImported || raw.isImported') &&
      sources.insights.includes("if (opensReader && hasTranscript && st.isSaved) chips.push(['Saved', 'wbRowChip--saved']);") &&
      sources.insights.includes("else if (urlOnlyLink || st.isLinked || opensLinkedDetails) chips.push(['Link', 'wbRowChip--linked']);") &&
      sources.insights.includes("Pill({ label: 'Link'") &&
      !sources.insights.includes("else if (st.isLinked || opensLinkedDetails) chips.push(['Linked', 'wbRowChip--linked']);"),
    FILES.insights,
    'Visible row badges must classify transcript-backed rows as Saved and URL-only shell rows as Link, without depending only on lastSnapshotId or fake snapshotCount defaults.'
  ),
  check(
    'insights-fake-snapshot-count-url-only-remains-link',
    sources.insights.includes('const hasSnapshotArrayEvidence = Array.isArray(raw.snapshots)') &&
      sources.insights.includes('return hasSnapshotArrayEvidence || messageCount > 0;') &&
      !sources.insights.includes('return snapshotCount > 0 || messageCount > 0;'),
    FILES.insights,
    'URL-only rows with href, no snapshot id, no messages, and defaulted snapshotCount:1 must stay Link/placeholder, not Saved/reader.'
  ),
  check(
    'insights-transcript-openability-fallback',
    sources.insights.includes('async function resolveReaderSnapshotId') &&
      sources.insights.includes("typeof snapshots.listByChat === 'function'") &&
      sources.insights.includes("typeof chatList.listAll === 'function'") &&
      sources.insights.includes('const opensReader = rowHasOpenableTranscriptContent(row) && !st.isDeleted;') &&
      sources.insights.includes("sid ? `#/read/${encodeURIComponent(sid)}` : '#/library/explorer'") &&
      sources.insights.includes('Promise.resolve(resolveReaderSnapshotId(row))'),
    FILES.insights,
    'Transcript-backed rows with counts but no denormalized snapshot id must resolve a reader snapshot at click time instead of opening placeholder details.'
  ),
  check(
    'saved-chats-page-saved-linked-snapshot-opens-reader',
    sources.studioShell.includes('function rowReaderSnapshotId') &&
      sources.studioShell.includes('function rowHasReaderSnapshot') &&
      sources.studioShell.includes('row.snapshotId || row.lastSnapshotId || row.latestSnapshotId || row.snapshot_id') &&
      sources.studioShell.includes('return rowHasReaderSnapshot(row) ? false : coreDecision;') &&
      sources.studioShell.includes('if (rowHasReaderSnapshot(row)) return false;') &&
      sources.studioShell.includes('const isLinkedState = liRow.isLinked === true') &&
      sources.studioShell.includes('location.hash = `#/read/${encodeURIComponent(row.snapshotId)}`;'),
    FILES.studioShell,
    'Legacy Saved Chats page must route saved+linked rows with snapshot evidence to the reader instead of opening the original link.'
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
      sources.registryCore.includes("'displayTitle','sourceTitle','pageTitle','originalTitle'") &&
      sources.studioRegistryCore.includes('displayTitle: displayTitle || title') &&
      sources.studioRegistryCore.includes('originalTitle: originalTitle || title'),
    FILES.registryCore,
    'Registry merge must treat Imported chat/Link as placeholder titles and preserve safe title aliases across save/link/update/import flows.'
  ),
  check(
    'registry-core-preserves-transcript-evidence',
    sources.registryCore.includes('snapshotId: snapshotId || lastSnapshotId') &&
      sources.registryCore.includes('lastSnapshotId: lastSnapshotId || snapshotId') &&
      sources.registryCore.includes('latestSnapshotId: lastSnapshotId || snapshotId') &&
      sources.registryCore.includes('messageCount: isFiniteNumber(r.messageCount)') &&
      sources.registryCore.includes('assistantTurnCount: isFiniteNumber(r.assistantTurnCount)') &&
      sources.registryCore.includes("snapshotId','lastSnapshotId','latestSnapshotId','snapshotCount','messageCount','turnCount','answerCount','userTurnCount','assistantTurnCount") &&
      sources.runtimeRegistryCore.includes('snapshotId: snapshotId || lastSnapshotId') &&
      sources.runtimeRegistryCore.includes('messageCount: isFiniteNumber(r.messageCount)') &&
      sources.runtimeRegistryCore.includes('assistantTurnCount: isFiniteNumber(r.assistantTurnCount)') &&
      sources.runtimeRegistryCore.includes('const messageCount = options.fullScan === true ? (b.messageCount || 0) : (maxNum(a.messageCount, b.messageCount) || 0);') &&
      sources.studioRegistryCore.includes('snapshotId: snapshotId || lastSnapshotId') &&
      sources.studioRegistryCore.includes('messageCount: isFiniteNumber(r.messageCount)') &&
      sources.studioRegistryCore.includes('assistantTurnCount: isFiniteNumber(r.assistantTurnCount)') &&
      sources.studioRegistryCore.includes('const messageCount = options.fullScan === true ? (b.messageCount || 0) : (maxNum(a.messageCount, b.messageCount) || 0);'),
    FILES.registryCore,
    'ChatRegistry canonical schema must preserve snapshot/message/turn evidence so Save to Folder records remain transcript-backed in Studio.'
  ),
  check(
    'native-sync-broadcast-preserves-save-to-folder-evidence',
    sources.nativeSync.includes('function snapshotLinkedRecords') &&
      sources.nativeSync.includes('snapshotId: rec.snapshotId || rec.lastSnapshotId || rec.latestSnapshotId ||') &&
      sources.nativeSync.includes('lastSnapshotId: rec.lastSnapshotId || rec.snapshotId || rec.latestSnapshotId ||') &&
      sources.nativeSync.includes('messageCount: Number(rec.messageCount || 0) || 0') &&
      sources.nativeSync.includes('turnCount: Number(rec.turnCount || 0) || 0') &&
      sources.nativeSync.includes('userTurnCount: Number(rec.userTurnCount || 0) || 0') &&
      sources.nativeSync.includes('assistantTurnCount: Number(rec.assistantTurnCount || 0) || 0') &&
      sources.nativeSync.includes('transcriptEvidenceCount: state.lastLinkedRecordsTranscriptEvidence'),
    FILES.nativeSync,
    'Native cross-surface linkedRecords broadcast must carry Save-to-Folder snapshot/message/turn evidence into Chrome Studio.'
  ),
  check(
    'native-sync-broadcast-carries-save-to-folder-snapshot-payload',
    sources.nativeSync.includes('function normalizeSnapshotPayloadForBroadcast') &&
      sources.nativeSync.includes("schema: 'h2o.native.snapshot-payload.v1'") &&
      sources.nativeSync.includes('function queueSnapshotPayload') &&
      sources.nativeSync.includes('function snapshotPayloadsForBroadcast') &&
      sources.nativeSync.includes('snapshotPayloads: snapshotPayloadsForBroadcast()') &&
      sources.nativeSync.includes('SNAPSHOT_PAYLOAD_MAX') &&
      sources.nativeSync.includes('meta.folderId = String(meta.folderId || folderId)') &&
      sources.nativeSync.includes('function broadcastViaBridge') &&
      sources.nativeSync.includes('chrome.runtime.lastError') &&
      sources.nativeSync.includes("broadcastViaBridge(body, reasons, 'chrome-storage-error')") &&
      sources.nativeSync.includes('function handleSnapshotPayloadRequests') &&
      sources.nativeSync.includes('function fulfillSnapshotPayloadRequests') &&
      sources.nativeSync.includes('archive.loadSnapshot(snapshotId)') &&
      sources.nativeSync.includes('archive.loadLatestSnapshot(chatId)') &&
      sources.nativeSync.includes("broadcastImmediately('snapshot-payload-request-fulfilled')") &&
      sources.nativeSync.includes('queuedHasBody') &&
      sources.nativeSync.includes('broadcastHasBodyCount') &&
      sources.nativeSync.includes('requestListenerInstalled: true') &&
      sources.nativeSync.includes('requestBySnapshotIdSuccessCount') &&
      sources.nativeSync.includes('requestByChatIdFallbackSuccessCount') &&
      sources.nativeSync.includes('requestMessagePayloadCount') &&
      sources.nativeSync.includes('snapshot-not-found') &&
      sources.chromeLiveLoader.includes('MSG_NATIVE_SNAPSHOT_PAYLOADS') &&
      sources.chromeLiveLoader.includes('function forwardNativeSnapshotPayloadsToStudioLauncher') &&
      sources.chromeLiveLoader.includes('request && request.snapshotId') &&
      sources.chromeLiveLoader.includes('request && request.chatId') &&
      sources.chromeBackground.includes('function handleExternalNativeSnapshotPayloadsMessage') &&
      sources.chromeLiveManifest.includes('STUDIO_LAUNCHER_EXTENSION_ID') &&
      sources.chromeLiveManifest.includes('manifest.externally_connectable = { ids: [STUDIO_LAUNCHER_EXTENSION_ID] }') &&
      sources.nativeFolders.includes('archive.loadSnapshot(captureSummary.snapshotId)') &&
      sources.nativeFolders.includes('sync.queueSnapshotPayload') &&
      sources.nativeFolders.includes('snapshotPayloadQueued') &&
      sources.nativeFolders.includes('turnCount: captureSummary.turnCount') &&
      sources.nativeFolders.includes('assistantTurnCount: captureSummary.assistantTurnCount'),
    FILES.nativeSync,
    'Native Save to Folder must broadcast recent snapshot payloads, not only compact registry metadata, so Chrome Studio can materialize reader content.'
  ),
  check(
    'studio-native-broadcast-materializes-save-to-folder-snapshot-payload',
    sources.studioSync.includes('async function materializeNativeSnapshotPayloads') &&
      sources.studioSync.includes("scope: 'native-save-to-folder-snapshot-payloads'") &&
      sources.studioSync.includes("await callArchive('importBundle'") &&
      sources.studioSync.includes('function normalizeNativeSnapshotPayload') &&
      sources.studioSync.includes('function redactNativeBroadcastPayload') &&
      sources.studioSync.includes('nativeSnapshotPayloadMaterialize') &&
      sources.studioSync.includes('requestNativeSnapshotPayloads') &&
      sources.studioSync.includes('snapshotPayloadRequests: normalized') &&
      sources.studioSync.includes('snapshotPayloadRequestPayloadPresent') &&
      sources.studioSync.includes('snapshotPayloadResponseCount') &&
      sources.studioSync.includes('waitForNativeSnapshotPayloadMaterialization') &&
      sources.studioSync.includes('verifyNativeSnapshotPayloadImports') &&
      sources.studioSync.includes('const messages = Array.isArray(src.messages) ? src.messages : []') &&
      sources.studioSync.includes("readerKind: 'reader'") &&
      sources.studioSync.includes('meta.folderId = String(meta.folderId || folderId)') &&
      sources.studioSync.includes('assistantTurnCount'),
    FILES.studioSync,
    'Chrome Studio must import native Save-to-Folder snapshot payloads into the archive backend used by loadSnapshot while exposing only redacted diagnostics.'
  ),
  check(
    'desktop-studio-archive-loads-imported-snapshot-store',
    sources.studioArchiveEngine.includes('function desktopSnapshotStore') &&
      sources.studioArchiveEngine.includes('function projectDesktopStoreSnapshotToCanonical') &&
      sources.studioArchiveEngine.includes('async function loadDesktopStoreSnapshot') &&
      sources.studioArchiveEngine.includes('const raw = await store.get(snapshotId)') &&
      sources.studioArchiveEngine.includes('const desktop = await loadDesktopStoreSnapshot(snapshotId)') &&
      sources.studioArchiveEngine.includes('desktopStore.listByChat(chatId)'),
    FILES.studioArchiveEngine,
    'Desktop Studio archiveBoot.loadSnapshot/listSnapshots must read the same SQLite snapshot store that Chrome-to-Desktop import writes.'
  ),
  check(
    'native-archive-accepts-object-form-chat-id-for-payload-recovery',
    sources.archiveEngine.includes('function chatIdArg') &&
      sources.archiveEngine.includes('raw.chatId || raw.id || raw.conversationId || raw.conversation_id') &&
      sources.archiveEngine.includes('const chatId = chatIdArg(chatIdRaw) || toChatId(getCurrentChatId())') &&
      sources.archiveEngine.includes('archiveBoot.listSnapshots = (chatId) => listSnapshots(chatId)') &&
      sources.archiveEngine.includes('archiveBoot.loadLatestSnapshot = (chatId) => loadLatestSnapshotInternal(chatId)'),
    FILES.archiveEngine,
    'Native archive payload recovery must accept both listSnapshots(chatId) and listSnapshots({ chatId }) so Studio/native diagnostics and repair callers resolve the same payloads.'
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
    'native-save-to-folder-requires-transcript-evidence',
    sources.nativeFolders.includes('async function API_saveAndBindToFolder') &&
      sources.nativeFolders.includes('function API_captureHasRealTranscript') &&
      sources.nativeFolders.includes('function API_captureSummary') &&
      sources.nativeFolders.includes('function API_targetIsCurrentLoadedChat') &&
      sources.nativeFolders.includes('function API_currentUrlChatId') &&
      sources.nativeFolders.includes('F19_7u_currentUrlChatIdParsing') &&
      sources.nativeFolders.includes('capture-requires-open-chat') &&
      sources.nativeFolders.includes('Open this chat first to capture transcript.') &&
      sources.nativeFolders.includes('capture-transcript-missing') &&
      sources.nativeFolders.includes('captured-transcript-not-visible-to-studio') &&
      sources.nativeFolders.includes('Could not capture transcript; no Saved row was created.') &&
      !sources.nativeFolders.includes('const registryAllowsBinding = !!API_getRegistryRecordForBindingKey(key);') &&
      !sources.nativeFolders.includes('const captureAllowsBinding = !!(captured?.ok || (captured?.capture && captured.capture.ok !== false));'),
    FILES.nativeFolders,
    'Native ChatGPT Save to Folder must not bind/stamp a link-only registry record as Saved when transcript capture is missing or not Studio-visible.'
  ),
  check(
    'native-save-to-folder-preserves-title-and-sync-status',
    sources.nativeFolders.includes('function API_resolveSaveChatTitle') &&
      sources.nativeFolders.includes('function API_titleMetadataPatch') &&
      sources.nativeFolders.includes('title: DOM_findTitleForHref(targetHref)') &&
      sources.nativeFolders.includes('const preCaptureTitle = API_resolveSaveChatTitle') &&
      sources.nativeFolders.includes('title: preCaptureTitle') &&
      sources.nativeFolders.includes("title: String(opts?.title || '')") &&
      sources.nativeFolders.includes('...API_titleMetadataPatch(API_resolveSaveChatTitle') &&
      sources.nativeFolders.includes('snapshotId: captureSummary.snapshotId') &&
      sources.nativeFolders.includes('lastSnapshotId: captureSummary.lastSnapshotId') &&
      sources.nativeFolders.includes('messageCount: captureSummary.messageCount') &&
      sources.nativeFolders.includes('assistantTurnCount: captureSummary.assistantTurnCount') &&
      sources.nativeFolders.includes('lastSaveToFolder: STATE.lastSaveToFolderSummary || null') &&
      sources.nativeFolders.includes('function API_recordLastSaveToFolderSummary') &&
      sources.nativeFolders.includes("EVENT_flushLibraryFolderSync('save-to-folder-captured')") &&
      sources.nativeFolders.includes('syncQueued') &&
      sources.nativeFolders.includes('syncExported: false'),
    FILES.nativeFolders,
    'Native Save to Folder must preserve the current/sidebar title, expose transcript evidence, and queue the existing native-to-Studio sync broadcast.'
  ),
  check(
    'native-save-strip-folder-dropdown-uses-canonical-save',
    sources.saveStrip.includes('async function saveCurrentChatToFolder') &&
      sources.saveStrip.includes('const saveAndBind = H2O.folders?.saveAndBindToFolder') &&
      sources.saveStrip.includes('source: "capture-save-strip-folder-dropdown"') &&
      sources.saveStrip.includes('canonical-save-to-folder-unavailable') &&
      sources.saveStrip.includes('getLastFolderSaveResult') &&
      sources.saveStrip.includes('state.lastFolderSaveResult = stripSaveResultSummary') &&
      sources.saveStrip.includes('updateSublabel(saveFailureMessage(result))') &&
      sources.nativeFolders.includes('async function API_saveAndBindToFolder') &&
      sources.nativeFolders.includes('capture-transcript-missing') &&
      sources.nativeFolders.includes('extension-context-invalidated'),
    FILES.saveStrip,
    'The transcript save strip folder dropdown must call the canonical Save-to-Folder pipeline instead of doing a folder-only/link-only binding.'
  ),
  check(
    'native-save-to-folder-build-truth-diagnostic',
    sources.nativeFolders.includes('h2o.native.save-to-folder.build-truth.v1') &&
      sources.nativeFolders.includes('f19.7d-runtime-build-truth') &&
      sources.nativeFolders.includes('async function API_buildTruthDiagnostic') &&
      sources.nativeFolders.includes('await bridge.__loaderInfo()') &&
      sources.nativeFolders.includes('await bridge.__loaderDiag()') &&
      sources.nativeFolders.includes('API_targetIsCurrentLoadedChat') &&
      sources.nativeFolders.includes('capture-requires-open-chat') &&
      sources.nativeFolders.includes('API_captureHasRealTranscript') &&
      sources.nativeFolders.includes('API_saveAndBindToFolder') &&
      sources.nativeFolders.includes('archiveBoot.captureNow') &&
      sources.nativeFolders.includes('saveToFolderOwner') &&
      sources.nativeFolders.includes('ENGINE_injectAddToFolder -> UI_openAssignMenu -> API_saveAndBindToFolder') &&
      sources.nativeFolders.includes('visibleMessageCount') &&
      sources.nativeFolders.includes('archiveBoot.captureNow persists snapshots; diagnostic only counts visible DOM messages') &&
      sources.nativeFolders.includes('registryWriteWouldBeLinkOnly') &&
      sources.nativeFolders.includes('saveHandlerStale') &&
      sources.nativeFolders.includes('H2O.folders.diagnose.__h2oF197dBuildTruth') &&
      sources.extensionBridge.includes('__loaderDiag: () => call("__loaderDiag"') &&
      sources.extensionBridge.includes('op !== "__loaderDiag"'),
    FILES.nativeFolders,
    'Native folders runtime must expose H2O.folders.diagnose({ includeCaptureDryRun: true }) with loader/module/marker/handler/capture readiness diagnostics and clear failure reasons.'
  ),
  check(
    'native-save-to-folder-current-chat-visible-message-detection',
    sources.nativeFolders.includes('function DOM_parseChatIdFromHref') &&
      sources.nativeFolders.includes("new URL(raw, W.location?.origin || 'https://chatgpt.com')") &&
      sources.nativeFolders.includes("const params = ['conversationId', 'conversation_id', 'chatId', 'chat_id'];") &&
      sources.nativeFolders.includes('function API_nonPathChatId') &&
      sources.nativeFolders.includes('typeof H2O.archiveBoot?.getCurrentChatId ===') &&
      sources.nativeFolders.includes('function API_visibleConversationSummary') &&
      sources.nativeFolders.includes('archiveBoot.inspectCurrentConversation') &&
      sources.nativeFolders.includes('visibleRoleCounts') &&
      sources.nativeFolders.includes('wouldHaveTranscriptEvidence') &&
      sources.nativeFolders.includes("detectionSource: String(visibleSummary.source || '')") &&
      sources.nativeFolders.includes('if (current) return `/c/${encodeURIComponent(current)}`;') &&
      sources.nativeFolders.includes('API_currentLoadedChatId() || API_nonPathChatId(visibleSummary.currentChatId)') &&
      sources.chromeImport.includes('friendlyShellTitle('),
    FILES.nativeFolders,
    'Native Save to Folder diagnostics must derive current ChatGPT conversation ids from modern URL shapes and report visible transcript evidence from the same archive inspection path used by capture.'
  ),
  check(
    'extension-bridge-context-invalidated-normalized',
    sources.extensionBridge.includes('const EXTENSION_CONTEXT_INVALIDATED = "extension-context-invalidated"') &&
      sources.extensionBridge.includes('function isExtensionContextInvalidatedError') &&
      sources.extensionBridge.includes('function normalizeBridgeError') &&
      sources.extensionBridge.includes('function recordBridgeError') &&
      sources.extensionBridge.includes('extensionContextInvalidated: state.extensionContextInvalidated') &&
      sources.extensionBridge.includes('reloadRequired: state.reloadRequired') &&
      sources.extensionBridge.includes('getHealth'),
    FILES.extensionBridge,
    'Transcript extension bridge must normalize Extension context invalidated into redacted health state instead of leaking raw uncaught bridge failures.'
  ),
  check(
    'archive-capture-context-invalidated-fails-closed',
    sources.archiveEngine.includes('function isExtensionContextInvalidatedError') &&
      sources.archiveEngine.includes('function extensionContextInvalidatedCaptureResult') &&
      sources.archiveEngine.includes('status: "extension-context-invalidated"') &&
      sources.archiveEngine.includes('captureSnapshot bridge invalidated; failing closed') &&
      sources.archiveEngine.includes('archiveBoot.getExtensionBridgeHealth = () => getExtensionBridgeHealth();'),
    FILES.archiveEngine,
    'archiveBoot.captureNow must fail closed on invalidated extension context instead of falling back to local-only snapshots.'
  ),
  check(
    'native-save-to-folder-context-invalidated-fails-closed',
    sources.nativeFolders.includes('const API_EXTENSION_CONTEXT_INVALIDATED_MESSAGE') &&
      sources.nativeFolders.includes('function API_isExtensionContextInvalidated') &&
      sources.nativeFolders.includes('function API_extensionBridgeHealth') &&
      sources.nativeFolders.includes('extensionBridgeHealth') &&
      sources.nativeFolders.includes('extensionContextInvalidated') &&
      sources.nativeFolders.includes("status: 'extension-context-invalidated'") &&
      sources.nativeFolders.includes('Extension was reloaded. Refresh this ChatGPT tab, then try Save to Folder again.') &&
      sources.nativeFolders.includes('F19_7m_extensionContextInvalidatedFailClosed'),
    FILES.nativeFolders,
    'Native Save to Folder must diagnose invalidated extension context and fail closed without creating folder-only or link-only records.'
  ),
  check(
    'library-actions-context-invalidated-normalized',
    sources.libraryActions.includes("status: invalidated ? 'extension-context-invalidated' : 'capture-threw'") &&
      sources.libraryActions.includes("reason: invalidated ? 'extension-context-invalidated' : 'capture-threw'") &&
      sources.libraryActions.includes('Extension was reloaded. Refresh this ChatGPT tab, then try Save to Folder again.'),
    FILES.libraryActions,
    'LibraryActions save fallback must preserve the extension-context-invalidated status instead of collapsing it to a generic capture failure.'
  ),
  check(
    'archive-engine-current-conversation-inspect-fallback',
    sources.archiveEngine?.includes('function normalizeChatIdFromUrl') &&
      sources.archiveEngine.includes('function collectNativeMessageNodesFallback') &&
      sources.archiveEngine.includes('function collectNativeTurnNodesFallback') &&
      sources.archiveEngine.includes('function inferMessageRoleFromNode') &&
      sources.archiveEngine.includes('article[data-testid^="conversation-turn"]') &&
      sources.archiveEngine.includes('[data-message-role="user"],[data-message-role="assistant"]') &&
      sources.archiveEngine.includes('function inspectCurrentConversation') &&
      sources.archiveEngine.includes('function buildCaptureEvidence') &&
      sources.archiveEngine.includes('lastSnapshotId: evidence.lastSnapshotId') &&
      sources.archiveEngine.includes('assistantTurnCount: evidence.assistantTurnCount') &&
      sources.archiveEngine.includes('h2o.native.transcript.inspect-current-conversation.v1') &&
      sources.archiveEngine.includes('wouldHaveTranscriptEvidence: visibleMessageCount > 0') &&
      sources.archiveEngine.includes('archiveBoot.getCurrentChatId = () => getCurrentChatId();') &&
      sources.archiveEngine.includes('archiveBoot.inspectCurrentConversation = (opts = {}) => inspectCurrentConversation(opts);') &&
      sources.archiveEngine.includes('const rendererNodes = getRenderer()?.collectNativeMessageNodes?.(r) || [];') &&
      sources.archiveEngine.includes('return rendererNodes.length ? rendererNodes : collectNativeMessageNodesFallback(r);'),
    'src-runtime-base/0D3a.⬛️🗄️ Transcript Archive Engine 🗂️🗄️.js',
    'Transcript archive capture must use robust local DOM fallbacks and expose a non-persisting current-conversation inspection helper for Save-to-Folder readiness.'
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
