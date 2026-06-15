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
  runtimeRegistryCore: 'src-runtime-base/0F0c.⬛️🧬 Library Registry Core 🧬.js',
  studioRegistryCore: 'src-surfaces-base/studio/S0F0c. 🎬 Library Registry Core - Studio.js',
  extensionBridge: 'src-runtime-base/0D3b.⚫️🗄️ Transcript Extension Bridge 📡🗂️🗄️.js',
  archiveEngine: 'src-runtime-base/0D3a.⬛️🗄️ Transcript Archive Engine 🗂️🗄️.js',
  libraryActions: 'src-runtime-base/0F1j.⬛️🗂️ Library Actions 🎯🗂️.js',
  nativeFolders: 'src-runtime-base/0F3a.⬛️🗂️ Folders 🗂️.js',
  nativeSync: 'src-runtime-base/0F1h.⬛️🗂️ Library Sync 🛰🗂️.js',
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
