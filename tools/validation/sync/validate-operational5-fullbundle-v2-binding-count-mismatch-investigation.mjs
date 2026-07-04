#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';

const evidencePath = 'release-evidence/2026-07-01/operational5-fullbundle-v2-binding-count-mismatch-investigation.md';
const liveDiagnosticEvidencePath = 'release-evidence/2026-07-01/operational5-live-readonly-canonical-count-parity-diagnostic.md';
const exportBundlePath = 'src-surfaces-base/studio/ingestion/export-bundle.tauri.js';
const fullBundleDiagnosticValidatorPath = 'tools/validation/sync/validate-operational5-fullbundle-v2-readonly-projection-diagnostic.mjs';
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
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(open, index + 1);
    }
  }
  throw new Error(`unterminated function body for ${signature}`);
}

const evidence = read(evidencePath);
const liveEvidence = read(liveDiagnosticEvidencePath);
const exportBundle = read(exportBundlePath);
const fullBundleDiagnosticValidator = read(fullBundleDiagnosticValidatorPath);
const webdavGates = read(webdavGatesPath);
const chatSavingBoundary = read(chatSavingBoundaryPath);

[
  'OPERATIONAL.5 FULLBUNDLE.V2 BINDING COUNT MISMATCH CLASSIFIED',
  '90b633052ea86de3b192490f59482613a92eaa27',
  'classification.overall:"mismatch"',
  'mismatches:["fullBundleV2BindingsVsCanonical"]',
  'Desktop canonical `folder_bindings` count: `14`',
  'sha256:32e697d704934acc5cc614979e776b46b934b9fe3c144efe3d59b9ad941b294e',
  '`fullBundle.v2` canonical chat-folder binding projection count: `12`',
  '`fullBundle.v2` active binding count: `12`',
  '`missingFolderBindingCount:2`',
  '`fallbackUnfiledBindingCount:2`',
  '`activeDanglingFolderBindingCount:2`',
  '`deletedFolderBindingCount:0`',
  'expected export filtering that exposes canonical cleanup debt',
  'not a',
  '`fullBundle.v2` export bug',
  'canonical active/exportable subset',
  'Raw canonical dangling rows remain reported separately',
  'No destructive cleanup',
  'No productSyncReady flip',
  'No WebDAV/cloud/relay/`fullBundle.v3`',
  'No Chat Saving WebDAV/cloud/archive CAS',
].forEach((token) => assertIncludes(evidence, token, `evidence token ${token}`));

const projectionBody = extractFunctionBody(exportBundle, 'async function buildDesktopCanonicalChatFolderBindingProjection(stores, chatCount)');
[
  'var missingFolderBindingCount = 0',
  'var deletedFolderBindingCount = 0',
  'var fallbackUnfiledBindingCount = 0',
  'var activeDanglingFolderBindingCount = 0',
  'if (folderIds.indexOf(folderId) < 0)',
  'missingFolderBindingCount += 1',
  'fallbackUnfiledBindingCount += 1',
  'activeDanglingFolderBindingCount += 1',
  'return;',
  'if (activeDeletedFolderIds[folderId])',
  'deletedFolderBindingCount += 1',
  'bindings.push({',
  'bindingCount: bindings.length',
].forEach((token) => assertIncludes(projectionBody, token, `projection source token ${token}`));

const missingBranch = projectionBody.slice(
  projectionBody.indexOf('if (folderIds.indexOf(folderId) < 0)'),
  projectionBody.indexOf('if (activeDeletedFolderIds[folderId])'),
);
assertIncludes(missingBranch, 'return;', 'missing-folder branch must exclude row from active projection');
assert.ok(!missingBranch.includes('bindings.push'), 'missing-folder branch must not push exported binding');

[
  'canonicalExportableBindingRows',
  'canonicalMissingFolderBindingRows',
  'canonicalDeletedFolderBindingRows',
  'canonicalExportableBindings',
  'desktopCanonicalChatFolderBindingCount: canonicalExportableBindings.count',
  'desktopCanonicalChatFolderBindingHash: canonicalExportableBindings.hash',
  'activeDesktopCanonicalChatFolderBindingCount: canonicalExportableBindings.count',
  'activeDesktopCanonicalChatFolderBindingHash: canonicalExportableBindings.hash',
  'desktop-canonical-binding-exportability',
  'rawCanonicalBindingCount',
  'exportableCanonicalBindingCount',
  'filteredFolderBindings',
  'missingFolderBindingCount',
  'activeDanglingFolderBindingCount',
  'fallbackUnfiledBindingCount',
].forEach((token) => assertIncludes(liveEvidence, token, `live diagnostic token ${token}`));

assertIncludes(fullBundleDiagnosticValidator, 'diagnoseFullBundleV2ReadonlyProjection', 'fullBundle diagnostic validator retained');
assertIncludes(webdavGates, 'product-sync-ready-false-guard', 'WebDAV productSyncReady guard retained');
assertIncludes(webdavGates, 'webdavDisabledByDefault: true', 'WebDAV disabled by default retained');
assertIncludes(chatSavingBoundary, 'encrypted CAS-over-transport lane', 'Chat Saving archive CAS boundary retained');

assert.ok(!/productSyncReady\s*[:=]\s*true/.test(liveEvidence + evidence + exportBundle), 'productSyncReady must not be flipped');
assert.ok(!exportBundle.includes('h2o.studio.fullBundle.v3'), 'fullBundle.v3 must not be introduced');
assert.ok(!evidence.includes('delete canonical'), 'evidence must not authorize destructive cleanup');

console.log(JSON.stringify({
  schema: 'h2o.studio.operational5.fullbundle-v2-binding-count-mismatch-investigation.validator.v1',
  verdict: 'OPERATIONAL5_FULLBUNDLE_V2_BINDING_COUNT_MISMATCH_CLASSIFIED',
  evidence: evidencePath,
  rawCanonicalBindingCount: 14,
  exportableBindingProjectionCount: 12,
  gap: 2,
  classification: 'expected-filtering-plus-canonical-cleanup-debt',
  exportBug: false,
  destructiveCleanupPerformed: false,
  productSyncReady: false,
  webdavCloudRelayStarted: false,
  chatSavingCasBlocked: true,
  nextAction: 'rerun-operational5-live-readonly-devtools-diagnostic',
}, null, 2));
console.log('PASS validate-operational5-fullbundle-v2-binding-count-mismatch-investigation');
