#!/usr/bin/env node
// Static validator for the Phase D.3B.0 saved-chat archive request inbox
// contract. This intentionally reads documentation only and imports no Chrome,
// Desktop runtime, package writer, CAS, store, sync, or UI modules.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..', '..', '..');
const SPEC_REL = 'docs/systems/archive/saved-chat-archive-request-inbox-v1.md';
const SPEC_PATH = path.join(REPO_ROOT, SPEC_REL);

const PASS = [];
const FAIL = [];

function readRepo(rel) {
  return fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
}

function check(label, fn) {
  try {
    fn();
    PASS.push(label);
    console.log(`  PASS ${label}`);
  } catch (err) {
    const message = err && err.message ? err.message : String(err);
    FAIL.push({ label, message });
    console.log(`  FAIL ${label}`);
    console.log(`       ${message}`);
  }
}

function requireText(source, text) {
  assert.ok(source.includes(text), `missing required text: ${text}`);
}

function requirePattern(source, pattern, label = String(pattern)) {
  assert.match(source, pattern, `missing required pattern: ${label}`);
}

console.log('[saved-chat-archive-request-inbox-contract] static checks');

check('saved-chat archive request inbox v1 contract exists', () => {
  assert.ok(fs.existsSync(SPEC_PATH), `${SPEC_REL} does not exist`);
});

const spec = readRepo(SPEC_REL);

check('title and docs-lock status are present', () => {
  requireText(spec, '# Saved Chat Archive Request Inbox v1');
  requireText(spec, 'Status: D.3B.0 docs-lock');
});

check('objective is Desktop-owned enqueue-only intake', () => {
  requireText(spec, 'Desktop-owned archive request inbox boundary');
  requireText(spec, 'untrusted metadata');
  requireText(spec, 'H2O.Studio.ingestion.enqueueSavedChatArchiveRequestV1(envelope)');
  requireText(spec, 'D.3B is enqueue-only');
  requireText(spec, 'does not materialize packages');
});

check('dedicated root, inbox, receipt, and malformed paths are documented', () => {
  requireText(spec, '$HOME/H2O Studio Archive Requests/');
  requireText(spec, '$HOME/H2O Studio Archive Requests/inbox/');
  requireText(spec, '$HOME/H2O Studio Archive Requests/receipts/');
  requireText(spec, '$HOME/H2O Studio Archive Requests/inbox/<requestId>.request.json');
  requireText(spec, '$HOME/H2O Studio Archive Requests/receipts/<requestId>.receipt.json');
  requireText(spec, '$HOME/H2O Studio Archive Requests/receipts/malformed-sha256-<fileHash>.receipt.json');
});

check('separation boundary excludes sync, smoke, app archive, packages, latest.json, and RC bridge', () => {
  requireText(spec, 'separate from:');
  requireText(spec, '$HOME/H2O Studio Sync');
  requireText(spec, '.h2o-smoke');
  requireText(spec, '$APPLOCALDATA/archive');
  requireText(spec, 'archive/packages');
  requireText(spec, 'sync `latest.json`');
  requireText(spec, 'Chrome/Sync RC bridge infrastructure');
});

check('request file format is one request per D.1/D.3A envelope file', () => {
  requireText(spec, 'one request per file');
  requireText(spec, 'h2o.savedChatArchiveRequest.v1');
  for (const field of [
    'schema',
    'requestId',
    'dedupeKey',
    'createdAt',
    'source',
    'desktopResolution',
    'intent',
    'payloadPolicy',
  ]) {
    requirePattern(spec, new RegExp(`- \`${field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\``), field);
  }
});

check('payload policy must remain false false', () => {
  requireText(spec, 'payloadPolicy.containsSnapshotContent = false');
  requireText(spec, 'payloadPolicy.containsAssets = false');
});

check('authoritative package/content payload fields are forbidden', () => {
  for (const text of [
    'transcript',
    'messages',
    'HTML',
    'outerHTML',
    'markdown',
    'assets',
    'images',
    'blobs',
    'CAS paths',
    'package paths',
    'manifest',
    'snapshot.json',
    'chat.md',
    'chat.html',
    'contentHash',
    'package content',
  ]) {
    requireText(spec, text);
  }
});

check('torn-write convention requires tmp ignored and final request file', () => {
  requireText(spec, '<requestId>.request.json.tmp');
  requireText(spec, '<requestId>.request.json');
  requireText(spec, 'Desktop must ignore `.tmp` files.');
});

check('receipt schema and fields are documented', () => {
  requireText(spec, 'h2o.savedChatArchiveRequestReceipt.v1');
  for (const field of [
    'schema',
    'requestId',
    'dedupeKey',
    'receivedAt',
    'processedAt',
    'sourceFile',
    'requestFileSha256',
    'status',
    'enqueueStatus',
    'persisted',
    'duplicateOf',
    'packageWriteDeferred',
    'materializeTriggered',
    'blockers',
    'warnings',
  ]) {
    requirePattern(spec, new RegExp(`- \`${field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\``), field);
  }
});

check('receipt explicitly forbids materialization and defers package writing', () => {
  requireText(spec, 'materializeTriggered = false');
  requireText(spec, 'packageWriteDeferred = true');
});

check('future Desktop intake lifecycle is enqueue-only and non-mutating to request files', () => {
  requireText(spec, 'list `inbox/*.request.json`');
  requireText(spec, 'ignore `.tmp`, hidden files, directories, and non-matching names');
  requireText(spec, 'enforce a size cap, recommended 128 KB');
  requireText(spec, 'parse JSON');
  requireText(spec, 'pass the envelope to `enqueueSavedChatArchiveRequestV1(envelope)`');
  requireText(spec, 'write a receipt');
  requireText(spec, 'return a scan summary');
  requireText(spec, 'do not delete, move, overwrite, or repair request files');
});

check('future APIs are named', () => {
  requireText(spec, 'diagnoseSavedChatArchiveRequestInboxV1');
  requireText(spec, 'scanSavedChatArchiveRequestInboxV1');
  requireText(spec, 'processSavedChatArchiveRequestInboxFileV1');
});

check('trigger model is manual first, optional focus/visibility, no watcher, no polling', () => {
  requireText(spec, 'manual scan first');
  requireText(spec, 'later optional focus/visibility import only');
  requireText(spec, 'opt-in');
  requireText(spec, 'debounce');
  requireText(spec, 'no watcher');
  requireText(spec, 'no polling');
});

check('security and trust boundaries forbid package writer/materializer/CAS behavior', () => {
  requireText(spec, 'Inbox files are untrusted transport input.');
  requireText(spec, 'Chrome request metadata is not package content.');
  requireText(spec, 'compute package hashes');
  requireText(spec, 'build `manifest.json`');
  requireText(spec, 'build `snapshot.json`');
  requireText(spec, 'build `chat.md`');
  requireText(spec, 'build `chat.html`');
  requireText(spec, 'build `assets`');
  requireText(spec, 'call `materializeSavedChatArchiveRequestV1`');
  requireText(spec, 'call `writeSavedChatPackageV1`');
  requireText(spec, 'write archive packages');
  requireText(spec, 'write CAS');
  requireText(spec, 'writes only receipts and D.2B queue rows');
});

check('failure handling statuses are documented', () => {
  for (const text of [
    'Malformed JSON',
    'Oversized file',
    'Unsupported schema',
    'Forbidden payload fields',
    'Duplicate request',
    'Missing Desktop snapshot',
    'DB unavailable',
    'Receipt write failure',
    'Replay/out-of-order delivery',
    'rejected',
    'duplicate',
    'needs-desktop-snapshot',
    'db-unavailable',
    'durable `dedupeKey`',
  ]) {
    requireText(spec, text);
  }
});

check('future narrow capability requirements are documented and deferred', () => {
  requireText(spec, 'Capability changes are not part of D.3B.0.');
  requireText(spec, 'later separate');
  requireText(spec, 'security-reviewed slice');
  requireText(spec, 'read-dir:');
  requireText(spec, '`$HOME/H2O Studio Archive Requests/inbox`');
  requireText(spec, 'read-file/read-text-file:');
  requireText(spec, '`$HOME/H2O Studio Archive Requests/inbox/*.request.json`');
  requireText(spec, 'mkdir:');
  requireText(spec, '`$HOME/H2O Studio Archive Requests/receipts`');
  requireText(spec, 'write-file/write-text-file:');
  requireText(spec, '`$HOME/H2O Studio Archive Requests/receipts/*.receipt.json`');
});

check('capability anti-patterns are explicitly avoided', () => {
  requireText(spec, '$HOME/**');
  requireText(spec, '$HOME/H2O Studio Sync/**');
  requireText(spec, 'remove/rename/delete');
  requireText(spec, 'archive package write permissions in this module');
});

check('explicit non-goals include all forbidden D.3B.0 scopes', () => {
  for (const text of [
    'runtime scanner',
    'Chrome delivery',
    'File System Access API',
    'native messaging',
    'localhost relay',
    'sync/WebDAV/cloud',
    'deep links',
    'auto-materialization',
    'package writing',
    'CAS writing',
    'Archive Health UI',
    'import/recovery',
    'user-folder export/save dialog',
    'retry/overwrite/delete/repair policy',
    'DB migration',
    'capability changes',
  ]) {
    requireText(spec, text);
  }
});

check('roadmap defers D.3B.1, D.3B.2, and D.3C', () => {
  requireText(spec, 'D.3B.0 docs-lock');
  requireText(spec, 'D.3B.1 Desktop inbox scanner / enqueue-only');
  requireText(spec, 'D.3B.2 runtime smoke / evidence');
  requireText(spec, 'D.3C Chrome delivery + receipt read-back later');
});

if (FAIL.length) {
  console.error(`[saved-chat-archive-request-inbox-contract] FAIL ${FAIL.length} checks failed`);
  process.exit(1);
}

console.log(`[saved-chat-archive-request-inbox-contract] all ${PASS.length} checks passed`);
