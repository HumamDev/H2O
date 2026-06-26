#!/usr/bin/env node
// Static validator for the Phase D.3C.0 saved-chat archive request delivery
// contract. This intentionally reads documentation only and imports no Chrome,
// Desktop runtime, package writer, CAS, store, sync, or UI modules.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..', '..', '..');
const SPEC_REL = 'docs/systems/archive/saved-chat-archive-request-delivery-v1.md';
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

console.log('[saved-chat-archive-request-delivery-contract] static checks');

check('saved-chat archive request delivery spec exists', () => {
  assert.ok(fs.existsSync(SPEC_PATH), `${SPEC_REL} does not exist`);
});

const spec = readRepo(SPEC_REL);

check('title and contract identity are present', () => {
  requireText(spec, '# Saved Chat Archive Request Delivery v1');
  requireText(spec, 'Status: D.3C.0 docs-lock');
  requireText(spec, 'H2O Studio Chat Saving Architecture');
});

check('File System Access API delivery approach is documented', () => {
  requireText(spec, 'File System Access API');
  requireText(spec, 'showDirectoryPicker');
  requireText(spec, 'showDirectoryPicker({ mode: "readwrite" })');
});

check('dedicated IndexedDB handle identity is documented', () => {
  requireText(spec, 'h2o.studio.archive-requests.folder.mv3');
  requireText(spec, 'handles');
  requireText(spec, 'archive-requests-folder');
  requireText(spec, 'must be separate from the Sync folder handle');
});

check('inbox and receipt paths are documented', () => {
  requireText(spec, '$HOME/H2O Studio Archive Requests');
  requireText(spec, 'inbox/<requestId>.request.json');
  requireText(spec, 'inbox/<requestId>.request.json.tmp');
  requireText(spec, 'receipts/<requestId>.receipt.json');
});

check('request and receipt schemas are documented', () => {
  requireText(spec, 'h2o.savedChatArchiveRequest.v1');
  requireText(spec, 'h2o.savedChatArchiveRequestReceipt.v1');
});

check('builder API is the only envelope source', () => {
  requireText(spec, 'buildSavedChatArchiveRequestV1');
  requireText(spec, 'H2O.Studio.ingestion.buildSavedChatArchiveRequestV1(options)');
});

check('metadata-only payload policy is locked false/false', () => {
  requireText(spec, 'payloadPolicy.containsSnapshotContent=false');
  requireText(spec, 'payloadPolicy.containsAssets=false');
});

check('folder ownership boundary is documented', () => {
  requireText(spec, 'Chrome may create inbox only');
  requireText(spec, 'Chrome must not create/write');
  requireText(spec, 'receipts/');
  requireText(spec, 'The receipt folder is Desktop-owned');
  requireText(spec, 'delivered-awaiting-desktop');
});

check('receipts are informational and Desktop queue stays authoritative', () => {
  requireText(spec, 'the receipt is informational only');
  requireText(spec, 'Desktop queue remains authoritative');
});

check('no watcher / no polling / flag OFF by default are documented', () => {
  requireText(spec, 'no watcher');
  requireText(spec, 'no polling');
  requireText(spec, 'flag OFF by default');
});

check('explicit user gesture and per-write permission are documented', () => {
  requireText(spec, 'explicit user gesture');
  requireText(spec, 'per-write `readwrite` permission check');
  requirePattern(spec, /per-write[\s\S]{0,40}readwrite/i, 'per-write readwrite permission');
});

check('move() plus fallback and Desktop .tmp ignore are documented', () => {
  requireText(spec, 'move()');
  requireText(spec, 'fallback');
  requireText(spec, 'move()` plus fallback');
  requireText(spec, 'Desktop ignores `.tmp`');
});

check('forbidden authoritative payload content is enumerated', () => {
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

check('Chrome forbidden runtime calls are documented', () => {
  requirePattern(spec, /no\s+`enqueueSavedChatArchiveRequestV1`\s+call from Chrome/, 'no enqueue call from Chrome');
  requireText(spec, 'call `materializeSavedChatArchiveRequestV1`');
  requireText(spec, 'call `writeSavedChatPackageV1`');
  requireText(spec, 'call `buildSavedChatPackageV1`');
  requireText(spec, 'write Desktop SQLite');
  requireText(spec, 'write `archive/packages`');
  requireText(spec, 'write CAS');
  requireText(spec, 'write receipts');
  requireText(spec, 'delete/move/repair Desktop request files');
});

check('separation boundary excludes sync / smoke / archive / health surfaces', () => {
  for (const text of [
    '$HOME/H2O Studio Sync',
    '.h2o-smoke',
    'sync `latest.json`',
    'WebDAV/cloud/sync transport',
    '$APPLOCALDATA/archive',
    'archive/packages',
    'Archive Health UI',
  ]) {
    requireText(spec, text);
  }
});

check('failure handling conditions are documented', () => {
  for (const text of [
    'File System Access API unavailable',
    'No folder handle connected',
    'Permission denied',
    'Selected folder name mismatch',
    'Inbox creation/write failure',
    '`.tmp` write failure',
    '`move()` unsupported',
    'Final write failure',
    'Receipt folder missing',
    'Receipt file missing',
    'Receipt JSON malformed',
    'Receipt schema mismatch',
    'Receipt `requestId` mismatch',
    'Desktop closed / not yet scanned',
    'Duplicate delivery',
    'Rejected request',
  ]) {
    requireText(spec, text);
  }
});

check('status mapping covers all Desktop receipt statuses', () => {
  requireText(spec, 'queued on Desktop');
  requireText(spec, 'already queued / duplicate');
  requireText(spec, 'rejected by Desktop');
  requireText(spec, 'Desktop snapshot missing');
  requireText(spec, 'Desktop database unavailable');
  requireText(spec, 'unusable receipt / pending manual review');
});

check('repeated delivery is idempotent via Desktop dedupeKey', () => {
  requireText(spec, 'Desktop dedupes by');
  requireText(spec, 'dedupeKey');
  requirePattern(spec, /no silent background write/i, 'no silent background write');
});

check('roadmap and deferral of D.3C.1..D.3C.4 are documented', () => {
  requireText(spec, 'D.3C.0 docs-lock');
  requireText(spec, 'D.3C.1 Chrome delivery module only, no UI');
  requireText(spec, 'D.3C.2 minimal manual UI / settings control');
  requireText(spec, 'D.3C.3 receipt read-back');
  requireText(spec, 'D.3C.4 runtime smoke / evidence');
  requireText(spec, 'D.3C.5 closure');
  requireText(spec, 'D.3C.1, D.3C.2, D.3C.3, and D.3C.4 are deferred.');
});

check('explicit non-goals include all forbidden D.3C.0 scopes', () => {
  for (const text of [
    'runtime delivery module',
    'UI',
    'receipt reader',
    'Chrome service-worker transport',
    'native messaging',
    'localhost relay',
    'sync/WebDAV/cloud',
    'auto-materialization',
    'package writing',
    'CAS writing',
    'Desktop scanner changes',
    'Desktop queue changes',
    'capability changes',
    'Archive Health UI changes',
    'import/recovery',
    'user-folder export/save dialog',
    'retry/overwrite/delete/repair policy',
  ]) {
    requireText(spec, text);
  }
});

check('validator remains static/docs-only and avoids runtime imports', () => {
  const validatorSource = fs.readFileSync(__filename, 'utf8');
  assert.ok(
    !/import\s+.*from\s+['"][^'"]*(src-surfaces-base|apps\/extensions|apps\/studio|sync|ingestion|store|chrome)[^'"]*['"]/.test(validatorSource),
    'validator imports runtime code',
  );
  for (const forbidden of [
    /readRepo\(['"][^'"]*src-surfaces-base/,
    /readRepo\(['"][^'"]*apps\/extensions/,
    /readRepo\(['"][^'"]*apps\/studio/,
    /readRepo\(['"][^'"]*sync/,
    /readRepo\(['"][^'"]*ingestion/,
    /readRepo\(['"][^'"]*store/,
    /writeSavedChatPackageV1\s*\(/,
  ]) {
    assert.ok(!forbidden.test(validatorSource), `validator references runtime forbidden scope: ${forbidden}`);
  }
});

if (FAIL.length) {
  console.error(`[saved-chat-archive-request-delivery-contract] FAIL ${FAIL.length} checks failed`);
  process.exit(1);
}

console.log(`[saved-chat-archive-request-delivery-contract] all ${PASS.length} checks passed`);
