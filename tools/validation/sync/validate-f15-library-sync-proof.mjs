#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const failures = [];

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

function exists(file) {
  return fs.existsSync(path.join(root, file));
}

function assertExists(file) {
  if (!exists(file)) failures.push(`${file}: missing`);
}

function assertContains(file, needle, label = needle) {
  const text = read(file);
  if (!text.includes(needle)) failures.push(`${file}: missing ${label}`);
}

function assertAll(file, needles) {
  needles.forEach((needle) => assertContains(file, needle));
}

const proof = 'src-surfaces-base/studio/sync/library/library-sync-proof.tauri.js';
const html = 'src-surfaces-base/studio/studio.html';
const pack = 'tools/product/studio/pack-studio.mjs';
const cutoverValidator = 'tools/validation/sync/validate-f15-cutover.mjs';
const bulkValidator = 'tools/validation/sync/validate-f15-bulk-migration.mjs';

[
  proof,
  html,
  pack,
  cutoverValidator,
  bulkValidator
].forEach(assertExists);

if (failures.length === 0) {
  assertAll(proof, [
    "var VERSION = '0.1.0-f15.9.a'",
    "var RESULT_SCHEMA = 'h2o.desktop.sync.library-sync-proof.v1'",
    'runLibraryEndToEndSyncProof',
    'runLibraryCatalogPipelineProof',
    'runLibraryBindingPipelineProof',
    'runLibraryStoreCutoverProof',
    'runLibraryBulkMigrationE2EProof',
    'H2O.Desktop.Sync.runLibraryEndToEndSyncProof = runLibraryEndToEndSyncProof',
    'H2O.Desktop.Sync.runLibraryCatalogPipelineProof = runLibraryCatalogPipelineProof',
    'H2O.Desktop.Sync.runLibraryBindingPipelineProof = runLibraryBindingPipelineProof',
    'H2O.Desktop.Sync.runLibraryStoreCutoverProof = runLibraryStoreCutoverProof',
    'H2O.Desktop.Sync.runLibraryBulkMigrationE2EProof = runLibraryBulkMigrationE2EProof',
    'H2O.Desktop.Sync.__librarySyncProofInstalled = true',
    'H2O.Desktop.Sync.__librarySyncProofVersion = VERSION',
    'canonicalizeLibraryCatalog',
    'diagnoseLibraryCatalog',
    'preflightLibraryCatalog',
    'generateLibraryCatalogProposalCandidate',
    'previewLibraryCatalogHandoff',
    'buildLibraryCatalogApplyEventReceipt',
    'recordLibraryCatalogBookkeeping',
    'shapeLibraryCatalogExecuteEnvelope',
    'canonicalizeLibraryBinding',
    'diagnoseLibraryBinding',
    'preflightLibraryBinding',
    'generateLibraryBindingProposalCandidate',
    'previewLibraryBindingHandoff',
    'buildLibraryBindingApplyEventReceipt',
    'recordLibraryBindingBookkeeping',
    'shapeLibraryBindingExecuteEnvelope',
    'proveSQLiteWriterIdentitySentinel',
    'runLibraryBulkMigrationProof',
    'catalogDeviceLocalInput',
    'bindingDeviceLocalInput',
    'withMemoryChromeStorage',
    'privacyScan',
    'sideEffectSummary',
    'publicationTouched: false',
    'relayTouched: false',
    'outboxTouched: false',
    'nativeCalled: false',
    'f5Touched: false',
    'applyExecuted: false',
    'watermarkWritten: false',
    'consumedOperationWritten: false',
    'realBusinessTableWritten: false'
  ]);

  assertContains(html, 'sync/library/library-sync-proof.tauri.js');
  assertContains(pack, 'sync/library/library-sync-proof.tauri.js');

  const proofText = read(proof);
  for (const forbidden of [
    'rawName:',
    'displayName:',
    'labelId:',
    'tagId:',
    'categoryId:',
    'folderId:',
    'chatId:',
    'chat_id:',
    'category_id:',
    'accountId:',
    'rawAccountId:',
    'userId:',
    'rawUserId:',
    'chatTitle:',
    'rawTitle:',
    'content:',
    'messages:',
    'turns:',
    'attachments:',
    'files:',
    'filename:',
    'fileName:',
    'path:',
    'url:',
    'token:',
    'tokens:'
  ]) {
    if (proofText.includes(forbidden)) {
      failures.push(`${proof}: forbidden returned-field literal ${forbidden}`);
    }
  }

  for (const forbiddenSql of [
    'INSERT INTO labels',
    'INSERT INTO tags',
    'INSERT INTO categories',
    'INSERT INTO label_bindings',
    'INSERT INTO tag_bindings',
    'UPDATE chats SET category_id',
    'DELETE FROM labels',
    'DELETE FROM tags',
    'DELETE FROM categories'
  ]) {
    if (proofText.includes(forbiddenSql)) {
      failures.push(`${proof}: proof foundation must not include business-table SQL ${forbiddenSql}`);
    }
  }
}

if (failures.length) {
  console.error('F15 library sync proof validation failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('F15 library sync proof validation passed');
