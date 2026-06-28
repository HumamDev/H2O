#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const reviewStorePath = path.join(root, 'src-surfaces-base/studio/store/tombstone-reviews.mv3.js');
const autoImportPath = path.join(root, 'src-surfaces-base/studio/sync/auto-import.mv3.js');
const bridgePath = path.join(root, 'src-surfaces-base/studio/dev/folder-sync-rc-smoke-bridge.studio.js');
const chromeClientPath = path.join(root, 'tools/smoke/chrome-cdp-studio.mjs');
const desktopClientPath = path.join(root, 'tools/smoke/desktop-folder-sync-queue-client.mjs');
const folderStorePath = path.join(root, 'src-surfaces-base/studio/store/folders.tauri.js');
const evidencePath = path.join(root, 'release-evidence/2026-06-25/chat-folder-binding-phase-b8-chrome-request-export.md');

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertContains(source, needle, label) {
  assert(source.includes(needle), `${label} missing ${needle}`);
}

function assertNotContains(source, needle, label) {
  assert(!source.includes(needle), `${label} must not contain ${needle}`);
}

function functionBody(source, name) {
  const match = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`).exec(source);
  const start = match ? match.index : -1;
  assert(start >= 0, `${name} missing`);
  const signatureEnd = source.indexOf(')', start);
  const open = source.indexOf('{', signatureEnd === -1 ? start : signatureEnd);
  assert(open >= 0, `${name} body missing`);
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(open + 1, i);
    }
  }
  throw new Error(`${name} body parse failed`);
}

for (const file of [reviewStorePath, autoImportPath, bridgePath, chromeClientPath, desktopClientPath, folderStorePath, evidencePath]) {
  assert(fs.existsSync(file), `${path.relative(root, file)} missing`);
}

const reviewStore = read(reviewStorePath);
const autoImport = read(autoImportPath);
const bridge = read(bridgePath);
const chromeClient = read(chromeClientPath);
const desktopClient = read(desktopClientPath);
const folderStore = read(folderStorePath);
const evidence = read(evidencePath);

const requestBody = functionBody(reviewStore, 'requestChatFolderBinding');
const shapeBody = functionBody(reviewStore, 'shapeChatFolderBindingRequestInput');
const sanitizeStoreBody = functionBody(reviewStore, 'sanitizeChatFolderBindingRequestExportPayload');
const listBody = functionBody(reviewStore, 'listChatFolderBindingRequests');
const exportCollectBody = functionBody(autoImport, 'collectChatFolderBindingRequestsForExport');
const exportSanitizeBody = functionBody(autoImport, 'sanitizeChatFolderBindingRequestForExport');
const bridgeRequestBody = functionBody(bridge, 'requestChatFolderBinding');
const bridgeDiagnosticBody = functionBody(bridge, 'diagnoseChromeChatFolderBindingParity');
const dispatchBody = functionBody(bridge, 'dispatchOp');

[
  "var CHAT_FOLDER_BINDING_REQUEST_SCHEMA = 'h2o.studio.chat-folder-binding-request.v1'",
  "var CHAT_FOLDER_BINDING_REQUEST_EXPORT_KEY = 'h2o:studio:chat-folder-binding-requests:pending-export:v1'",
  "var CHAT_FOLDER_BINDING_REQUEST_EXPORT_MIRROR_SCHEMA = 'h2o.studio.chat-folder-binding-request.pending-export-mirror.v1'",
  "'binding-request': true",
  'requestChatFolderBinding: requestChatFolderBinding',
  'listChatFolderBindingRequests: listChatFolderBindingRequests',
  'diagnoseChatFolderBindingRequests: diagnoseChatFolderBindingRequests',
  'chatFolderBindingRequestSchema: CHAT_FOLDER_BINDING_REQUEST_SCHEMA',
].forEach((needle) => assertContains(reviewStore, needle, `B8 review store ${needle}`));

[
  'chatId',
  'conversationId',
  'expectedCurrentFolderId',
  'targetFolderId',
  "targetKind: target.targetKind",
  "classification: 'binding-request'",
  "intent: 'chat-folder-binding-request'",
  "sourceSurface: sourceSurface",
  'desktopApplyRequired: true',
  'noLocalApply: true',
  'noChromeBindingAuthority: true',
  'noChromeDestructiveBindingApply: true',
  'noDesktopCanonicalMutation: true',
  'noHardDelete: true',
  'noPurge: true',
  'noChatDelete: true',
  'noSnapshotDelete: true',
  'noAssetDelete: true',
].forEach((needle) => assertContains(shapeBody, needle, `B8 request shape ${needle}`));

[
  'findPendingChatFolderBindingRequest',
  'pending-existing',
  'pending-created',
  'upsertChatFolderBindingRequestExportMirror',
  "source: 'chrome-chat-folder-binding-request'",
  'desktopApplyRequired: true',
  'noChromeBindingAuthority: true',
  'noChromeDestructiveBindingApply: true',
  'noDesktopCanonicalMutation: true',
  'noChatDelete: true',
  'noSnapshotDelete: true',
].forEach((needle) => assertContains(requestBody, needle, `B8 request writer ${needle}`));

[
  "classification: 'binding-request'",
  "recordKind: 'folderBinding'",
  'parseChatFolderBindingRequestPayload',
].forEach((needle) => assertContains(listBody, needle, `B8 request list ${needle}`));

[
  'noChromeBindingAuthority !== true && p.noChromeDestructiveBindingApply !== true',
  'p.noHardDelete !== true || p.noChatDelete !== true || p.noSnapshotDelete !== true',
  "intent: 'chat-folder-binding-request'",
  "classification: 'binding-request'",
  'desktopApplyRequired: true',
  'noChromeBindingAuthority: true',
  'noChromeDestructiveBindingApply: true',
  'noDesktopCanonicalMutation: true',
  'noBindingMutation: true',
].forEach((needle) => assertContains(sanitizeStoreBody, needle, `B8 store sanitizer ${needle}`));

[
  'CHAT_FOLDER_BINDING_REQUEST_SCHEMA',
  'CHAT_FOLDER_BINDING_REQUEST_EXPORT_KEY',
  'readChatFolderBindingRequestExportMirror',
  'collectChatFolderBindingRequestsForExport',
  'sanitizeChatFolderBindingRequestForExport',
  'bundle.chatFolderBindingRequests = chatFolderBindingRequestExport.requests || []',
  'state.lastChatFolderBindingRequestExport = chatFolderBindingRequestExport',
  'chatFolderBindingRequestExport',
  'requestCount: Number(chatFolderBindingRequestExport.requestCount || 0)',
  'pendingRequestCount: Number(chatFolderBindingRequestExport.pendingRequestCount || 0)',
  'noChromeBindingAuthority: true',
  'noChromeDestructiveBindingApply: true',
  'noDesktopCanonicalMutation: true',
].forEach((needle) => assertContains(autoImport, needle, `B8 Chrome export ${needle}`));

[
  'reviews.listChatFolderBindingRequests',
  'review-store',
  'pending-export-mirror',
  'pendingRequestCount',
  'chat-folder-binding-request-export-failed',
  'noDesktopCanonicalMutation: true',
].forEach((needle) => assertContains(exportCollectBody, needle, `B8 export collector ${needle}`));

[
  'noChromeBindingAuthority !== true && payload.noChromeDestructiveBindingApply !== true',
  'payload.noHardDelete !== true || payload.noChatDelete !== true || payload.noSnapshotDelete !== true',
  'targetKind',
  'targetFolderId',
].forEach((needle) => assertContains(exportSanitizeBody, needle, `B8 export sanitizer ${needle}`));

[
  "'requestChatFolderBinding'",
  "'listChatFolderBindingRequests'",
  'requestChatFolderBinding: true',
  'chatFolderBindingRequestPendingCount',
  'chromePendingBindingRequestCount',
  'chromeBindingRequestsAreRequestOnly: true',
  'noDesktopCanonicalMutation: true',
].forEach((needle) => assertContains(bridge, needle, `B8 bridge ${needle}`));

assertContains(dispatchBody, "op === 'requestChatFolderBinding'", 'B8 dispatch request op');
assertContains(dispatchBody, "op === 'listChatFolderBindingRequests'", 'B8 dispatch list op');

[
  'store.requestChatFolderBinding',
  'chromeBindingRequestsAreRequestOnly: true',
  'noChromeBindingAuthority: true',
  'noChromeDestructiveBindingApply: true',
  'noDesktopCanonicalMutation: true',
].forEach((needle) => assertContains(bridgeRequestBody, needle, `B8 bridge request ${needle}`));

[
  'listChatFolderBindingRequests',
  'chatFolderBindingRequestPendingCount',
  'noDesktopCanonicalMutation: true',
].forEach((needle) => assertContains(bridgeDiagnosticBody, needle, `B8 diagnostic ${needle}`));

assertContains(chromeClient, "'requestChatFolderBinding'", 'B8 Chrome CDP mutation allowlist');
assertContains(chromeClient, "'listChatFolderBindingRequests'", 'B8 Chrome CDP read-only allowlist');
assertNotContains(desktopClient, "'requestChatFolderBinding'", 'B8 Desktop queue must not expose Chrome binding request op');
assertNotContains(desktopClient, "'listChatFolderBindingRequests'", 'B8 Desktop queue must not expose Chrome binding request op');

[
  'moveCanonicalChatFolderBinding',
  'bindChat',
  'unbindSnapshotBindingsForSoftDelete',
].forEach((needle) => assertNotContains(requestBody + bridgeRequestBody + exportCollectBody, needle, `B8 request/export must not mutate Desktop canonical bindings ${needle}`));

[
  'deleteChat',
  'deleteSnapshot',
  'purgeRecentlyDeletedFolders',
  'clearRecentlyDeletedRestoredHistory',
  'rawSql',
  'hardDelete',
].forEach((needle) => assertNotContains(requestBody + bridgeRequestBody + exportCollectBody, needle, `B8 forbidden helper ${needle}`));

[
  'moveCanonicalChatFolderBinding',
  'listCanonicalChatFolderBindings',
].forEach((needle) => assertContains(folderStore, `function ${needle}`, `B5-B7 canonical store still present ${needle}`));

[
  'B8',
  'Chrome-origin',
  'requestChatFolderBinding',
  'chatFolderBindingRequests[]',
  'chatFolderBindingRequestExport',
  'request-only',
  'no Chrome destructive binding authority',
  'no direct canonical binding write',
  'no chat deletion',
  'no snapshot deletion',
  'no asset deletion',
  'B9',
].forEach((needle) => assertContains(evidence, needle, `B8 evidence ${needle}`));

console.log(JSON.stringify({
  ok: true,
  validator: 'validate-chat-folder-binding-phase-b8-chrome-request-export',
  reviewStore: path.relative(root, reviewStorePath),
  chromeExport: path.relative(root, autoImportPath),
  bridge: path.relative(root, bridgePath),
  chromeClient: path.relative(root, chromeClientPath),
  evidence: path.relative(root, evidencePath),
  chromeRequestExport: true,
  chromeDestructiveBindingAuthority: false,
  desktopCanonicalMutationFromChromeRequest: false,
  noChatDelete: true,
  noSnapshotDelete: true,
  noAssetDelete: true,
  noHardDelete: true,
  noPurge: true
}, null, 2));
