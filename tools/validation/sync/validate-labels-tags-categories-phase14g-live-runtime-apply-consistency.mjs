#!/usr/bin/env node
//
// Phase 14G — live runtime apply consistency diagnostics.
//
// Proves the Desktop sync surface exposes a runtime marker for the Phase 14F
// chat-category-clear apply verification contract, without changing metadata
// request semantics or broadening applied request types.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const failures = [];

const folderSyncFile = 'src-surfaces-base/studio/sync/folder-sync.tauri.js';
const evidenceFile = 'release-evidence/2026-06-25/labels-tags-categories-phase14g-live-runtime-apply-consistency.md';

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function functionBody(source, name) {
  const match = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`).exec(source);
  const start = match ? match.index : -1;
  assert(start >= 0, `${name} missing`);
  if (start < 0) return '';
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
  assert(false, `${name} body parse failed`);
  return '';
}

function objectLiteralBody(source, name) {
  const match = new RegExp(`var\\s+${name}\\s*=\\s*\\{`).exec(source);
  const start = match ? source.indexOf('{', match.index) : -1;
  assert(start >= 0, `${name} object missing`);
  if (start < 0) return '';
  let depth = 0;
  for (let i = start; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start + 1, i);
    }
  }
  assert(false, `${name} object parse failed`);
  return '';
}

for (const file of [folderSyncFile, evidenceFile]) {
  assert(fs.existsSync(path.join(root, file)), `${file} missing`);
}

const folderSync = read(folderSyncFile);
const evidence = fs.existsSync(path.join(root, evidenceFile)) ? read(evidenceFile) : '';

const appliedActions = objectLiteralBody(folderSync, 'APPLIED_LIBRARY_METADATA_MUTATION_REQUEST_ACTIONS');
const appliedActionNames = Array.from(appliedActions.matchAll(/'([^']+)'\s*:\s*true/g)).map((match) => match[1]).sort();
assert(JSON.stringify(appliedActionNames) === JSON.stringify(['chat-category-assign', 'chat-category-clear', 'chat-label-bind']),
  `applied actions must remain exact: ${JSON.stringify(appliedActionNames)}`);
for (const forbidden of [
  'chat-label-clear',
  'chat-tag-clear',
  'category-clear',
  'metadata-clear',
  'chat-category-delete',
  'delete',
  'remove',
  'unbind',
  'purge',
  'hard-delete',
]) {
  assert(!appliedActionNames.includes(forbidden), `applied allowlist must not include ${forbidden}`);
}

assert(
  folderSync.includes("var NON_DESTRUCTIVE_CLEAR_ALLOWLIST = new Set(['chat-category-clear']);"),
  'non-destructive clear allowlist must exact-match chat-category-clear'
);

const runtimeMarker = functionBody(folderSync, 'libraryMetadataMutationApplyRuntimeDiagnostic');
for (const needle of [
  'h2o.studio.library-metadata-mutation.apply-runtime-diagnostic.v1',
  'phase14g-live-runtime-apply-consistency',
  'appliedRequestTypes',
  'nonDestructiveClearAllowlist',
  'verifiesCanonicalChatRowAfterClear: true',
  'rejectsIfCategoryStillPresent: true',
  'rejectsIfProjectionNotDecremented: true',
  'duplicateDetectionUsesCurrentCanonicalState: true',
  'staleAppliedReceiptDoesNotMaskCanonicalState: true',
  'verifiesCanonicalLabelBindingAfterBind: true',
  'rejectsIfLabelMissing: true',
  'rejectsIfProjectionNotIncremented: true',
  'appliedRequiresPostWriteCanonicalVerification: true',
  'productSyncReady: false',
]) {
  assert(runtimeMarker.includes(needle), `runtime marker missing ${needle}`);
}

const diagnoseBody = functionBody(folderSync, 'diagnose');
assert(
  diagnoseBody.includes('libraryMetadataMutationApplyRuntime: libraryMetadataMutationApplyRuntimeDiagnostic()'),
  'diagnose must expose libraryMetadataMutationApplyRuntime marker'
);

const clearApplyBody = functionBody(folderSync, 'applyChatCategoryClearLibraryMetadataRequest');
for (const needle of [
  'var afterChatRow = await chats.get(chatId)',
  'library-metadata-mutation-request-category-clear-not-reflected',
  'library-metadata-mutation-request-category-clear-projection-not-reflected',
  'afterAssignmentCount !== beforeAssignmentCount - 1',
]) {
  assert(clearApplyBody.includes(needle), `clear apply guard missing ${needle}`);
}

for (const forbidden of ['DELETE FROM', 'remove(', 'purge', 'hardDelete', 'hard-delete', 'unlink']) {
  assert(!clearApplyBody.includes(forbidden), `clear apply must not contain ${forbidden}`);
}

const autoApplyBody = functionBody(folderSync, 'autoApplyLibraryMetadataMutationRequestsFromChromeBundle');
for (const needle of [
  'canonicalLibraryMetadataMutationDuplicateReceiptData',
  'library-metadata-mutation-request-applied-receipt-canonical-mismatch',
  "else if (applied.status === 'stale_basis') result.staleBasisCount += 1",
]) {
  assert(autoApplyBody.includes(needle), `auto apply guard missing ${needle}`);
}

for (const needle of [
  'Phase 14G',
  'libraryMetadataMutationApplyRuntime',
  'requestCount: 0',
  'stale or unreloaded Desktop runtime',
  'Product metadata sync: NOT READY',
]) {
  assert(evidence.includes(needle), `evidence missing ${needle}`);
}

if (failures.length) {
  console.error('FAIL validate-labels-tags-categories-phase14g-live-runtime-apply-consistency');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(JSON.stringify({
  schema: 'h2o.studio.library-metadata.phase14g-live-runtime-apply-consistency-validator.v1',
  diagnosticMarkerExposed: true,
  appliedRequestTypes: ['chat-category-assign', 'chat-category-clear', 'chat-label-bind'],
  exactClearCarveOutPreserved: true,
  phase14fApplyVerificationMarkersPresent: true,
  noChromeCanonicalMutation: true,
  destructiveBehaviorAdded: false,
  productSyncReady: false,
}, null, 2));
console.log('PASS validate-labels-tags-categories-phase14g-live-runtime-apply-consistency');
