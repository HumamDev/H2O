#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';

const evidencePath = 'release-evidence/2026-07-01/operational5-fullbundle-v2-readonly-projection-diagnostic.md';
const liveEvidencePath = 'release-evidence/2026-07-01/operational5-live-readonly-canonical-count-parity-diagnostic.md';
const exportBundlePath = 'src-surfaces-base/studio/ingestion/export-bundle.tauri.js';
const webdavGatesPath = 'src-surfaces-base/studio/sync/webdav-transport-gates.js';
const chatSavingBoundaryPath = 'tools/validation/studio/validate-saved-chat-archive-cloud-sync-boundary-v1.mjs';

function read(path) {
  assert.ok(fs.existsSync(path), `missing ${path}`);
  return fs.readFileSync(path, 'utf8');
}

function assertIncludes(text, token, label) {
  assert.ok(text.includes(token), `${label}: missing ${token}`);
}

function extractFunctionBody(source, signature) {
  const start = source.indexOf(signature);
  assert.ok(start >= 0, `missing function signature ${signature}`);
  const open = source.indexOf('{', start);
  assert.ok(open >= 0, `missing function body for ${signature}`);
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    const char = source[index];
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(open, index + 1);
    }
  }
  throw new Error(`unterminated function body for ${signature}`);
}

const evidence = read(evidencePath);
const liveEvidence = read(liveEvidencePath);
const exportBundle = read(exportBundlePath);
const webdavGates = read(webdavGatesPath);
const chatSavingBoundary = read(chatSavingBoundaryPath);

[
  'OPERATIONAL.5 FULLBUNDLE.V2 READ-ONLY PROJECTION DIAGNOSTIC IMPLEMENTED',
  '0291e55d75542a482a7ff3538e4d1733c4b0ec87',
  'H2O.Studio.ingestion.diagnoseFullBundleV2ReadonlyProjection()',
  'h2o.studio.fullBundle.v2.readonly-projection-diagnostic.v1',
  'readOnlyProjection:true',
  'writesData:false',
  'writesFiles:false',
  'writesTransport:false',
  'mutatesExportState:false',
  'noExportFullBundleCall:true',
  'noExportLatestSyncBundleCall:true',
  'folderProjection.count',
  'folderProjection.hash',
  'folderStateBindingProjection.count',
  'folderStateBindingProjection.hash',
  'canonicalChatFolderBindingProjection.count',
  'canonicalChatFolderBindingProjection.hash',
  'canonicalChatFolderBindingProjection.activeCount',
  'canonicalChatFolderBindingProjection.activeHash',
  'chatFolderBindingReceiptProjection.count',
  'chatFolderBindingReceiptProjection.hash',
  'productSyncReady',
  'false',
  'No WebDAV/cloud/relay/`fullBundle.v3` started',
  'No Chat Saving WebDAV/cloud/archive CAS was touched',
].forEach((token) => assertIncludes(evidence, token, `evidence token ${token}`));

assertIncludes(exportBundle, "var FULL_BUNDLE_SCHEMA = 'h2o.studio.fullBundle.v2'", 'fullBundle.v2 schema source');
assertIncludes(exportBundle, 'async function diagnoseFullBundleV2ReadonlyProjection()', 'readonly projection function');
assertIncludes(exportBundle, 'buildDesktopCanonicalChatFolderBindingProjection(stores, chatRows.length)', 'binding projection helper reused');
assertIncludes(exportBundle, 'buildFolderState(stores, {}, folderFallback.state)', 'folder projection helper reused');
assertIncludes(exportBundle, 'buildChatFolderBindingReceiptPayloadSafely(stores)', 'receipt projection helper reused');
assertIncludes(exportBundle, 'diagnoseFullBundleV2ReadonlyProjection: function ()', 'public diagnostic export');

const body = extractFunctionBody(exportBundle, 'async function diagnoseFullBundleV2ReadonlyProjection()');
[
  'readOnlyProjection: true',
  'writesData: false',
  'writesFiles: false',
  'writesTransport: false',
  'mutatesExportState: false',
  'noExportFullBundleCall: true',
  'noExportLatestSyncBundleCall: true',
  'noSequenceMutation: true',
  'noExportIdMutation: true',
  'noWebdavWrite: true',
  'noCloudWrite: true',
  'noRelayWrite: true',
  'noCasWrite: true',
  'productSyncReady: false',
  'folderProjection:',
  'folderStateBindingProjection:',
  'canonicalChatFolderBindingProjection:',
  'chatFolderBindingReceiptProjection:',
  'projectionSha256(folderRows)',
  'projectionSha256(folderStateBindingRows)',
  'projectionSha256(canonicalBindingRows)',
  'projectionSha256(activeCanonicalBindingRows)',
  'projectionSha256(receiptRows)',
].forEach((token) => assertIncludes(body, token, `readonly function token ${token}`));

[
  'exportFullBundle(',
  'exportLatestSyncBundle(',
  'fsWriteTextFile(',
  'fsRename(',
  'recordExportEventSafely(',
  'writePeerTransportMirrorSafely(',
  'state.lastExportAt',
  'state.lastSummary',
  'state.lastFolderParity',
  'state.lastSyncExport',
  'chrome.storage.local.set',
  'localStorage.setItem',
  'runF15SettledBindingRestartConvergence(',
  'bindingRepair.apply',
].forEach((token) => assert.ok(!body.includes(token), `readonly projection function must not contain ${token}`));

assertIncludes(liveEvidence, 'diagnoseFullBundleV2ReadonlyProjection', 'live diagnostic snippet uses new read-only projection');
assertIncludes(liveEvidence, 'fullBundle.v2-readonly-projection-diagnostic', 'live diagnostic surface updated');
assertIncludes(liveEvidence, 'exportFullBundle-not-called-by-this-diagnostic', 'live diagnostic still avoids real export');
assert.ok(!/await\s+ingestion\.exportFullBundle\s*\(/.test(liveEvidence), 'live diagnostic must not call exportFullBundle');
assert.ok(!/await\s+ingestion\.exportLatestSyncBundle\s*\(/.test(liveEvidence), 'live diagnostic must not call exportLatestSyncBundle');

assertIncludes(webdavGates, 'product-sync-ready-false-guard', 'WebDAV remains gated');
assertIncludes(webdavGates, 'webdavDisabledByDefault: true', 'WebDAV disabled by default');
assert.ok(!exportBundle.includes('h2o.studio.fullBundle.v3'), 'fullBundle.v3 must not be introduced');
assertIncludes(chatSavingBoundary, 'encrypted CAS-over-transport lane', 'Chat Saving archive CAS boundary retained');
assertIncludes(chatSavingBoundary, 'no archive module has premature cloud/WebDAV/network package transport',
  'Chat Saving WebDAV/cloud transport remains blocked');

console.log(JSON.stringify({
  schema: 'h2o.studio.operational5.fullbundle-v2-readonly-projection-diagnostic.validator.v1',
  verdict: 'OPERATIONAL5_FULLBUNDLE_V2_READONLY_PROJECTION_DIAGNOSTIC_IMPLEMENTED',
  evidence: evidencePath,
  source: exportBundlePath,
  productSourceChanged: true,
  diagnosticOnly: true,
  productSyncReady: false,
  webdavCloudRelayStarted: false,
  chatSavingCasBlocked: true,
  nextAction: 'rerun-operational5-live-readonly-devtools-diagnostic',
}, null, 2));
console.log('PASS validate-operational5-fullbundle-v2-readonly-projection-diagnostic');
