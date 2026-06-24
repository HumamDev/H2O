#!/usr/bin/env node
// Static validator for the Phase D.1 saved-chat archive request contract.
//
// This intentionally reads documentation only. It must not import Chrome,
// Desktop runtime, package writer, CAS, store, sync, or UI modules.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..', '..', '..');
const SPEC_REL = 'docs/systems/archive/saved-chat-archive-request-v1.md';
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

console.log('[saved-chat-archive-request-contract] static checks');

check('saved-chat archive request spec exists', () => {
  assert.ok(fs.existsSync(SPEC_PATH), `${SPEC_REL} does not exist`);
});

const spec = readRepo(SPEC_REL);

check('schema name h2o.savedChatArchiveRequest.v1 exists', () => {
  requireText(spec, 'h2o.savedChatArchiveRequest.v1');
});

check('requestId and dedupeKey are defined', () => {
  requirePattern(spec, /requestId[\s\S]*Tracks one user action/);
  requirePattern(spec, /dedupeKey[\s\S]*collapses repeated requests/i);
  requirePattern(spec, /Duplicate delivery must be idempotent/);
});

check('required request envelope fields are present', () => {
  for (const field of [
    'schema',
    'requestId',
    'dedupeKey',
    'createdAt',
    'source.surface',
    'source.nativeConversationId',
    'source.href',
    'source.title',
    'source.capturedAt',
    'source.captureDigest',
    'source.messageCount',
    'desktopResolution.studioChatId',
    'desktopResolution.snapshotId',
    'desktopResolution.requireExistingDesktopSnapshot',
    'intent.kind',
    'intent.target.folderIdAtRequest',
    'intent.target.categoryIdAtRequest',
    'intent.target.projectIdAtRequest',
    'intent.target.labelIdsAtRequest',
    'intent.target.tagIdsAtRequest',
    'payloadPolicy.containsSnapshotContent',
    'payloadPolicy.containsAssets',
  ]) {
    requireText(spec, field);
  }
});

check('lifecycle states are listed', () => {
  for (const state of [
    'draft',
    'queued',
    'received',
    'validated',
    'needs-desktop-snapshot',
    'accepted',
    'writing',
    'written',
    'duplicate',
    'rejected',
    'failed',
  ]) {
    requirePattern(spec, new RegExp(`\\| \`${state}\` \\|`), `lifecycle state ${state}`);
  }
});

check('Chrome request intent is separated from Desktop archive write', () => {
  requireText(spec, 'Chrome owns request intent only');
  requireText(spec, 'Desktop owns all durable archive authority');
  requirePattern(spec, /A request is not a\s+package, not a store mutation, and not a second source of truth\./);
});

check('Desktop owns package materialization, CAS, diagnostics, and durable state', () => {
  for (const text of [
    'Desktop owns saved-chat package materialization',
    'Desktop owns live CAS and package asset copies',
    'Desktop owns archive diagnostics and durable package state',
  ]) {
    requireText(spec, text);
  }
});

check('Desktop resolves through store and snapshot state', () => {
  requireText(spec, 'Desktop resolves canonical `chatId` and `snapshotId` through Desktop');
  requireText(spec, '`H2O.Studio.store` adapters');
  requireText(spec, 'If no Desktop snapshot exists, the request becomes `needs-desktop-snapshot`.');
  requireText(spec, 'Desktop materializes a package only from Desktop store data.');
});

check('Chrome must not write archive/packages or Desktop SQLite', () => {
  requireText(spec, 'write `archive/packages`');
  requireText(spec, 'write Desktop SQLite');
  requireText(spec, 'direct Chrome archive write');
  requireText(spec, 'direct Chrome SQLite write');
});

check('Chrome must not build package files, assets, CAS, or contentHash', () => {
  for (const text of [
    'build `manifest.json`',
    'build `snapshot.json`',
    'build `chat.md`',
    'build `chat.html`',
    'build package `assets/`',
    'write or own CAS',
    'compute authoritative package `contentHash`',
    'Chrome construction of `manifest.json`, `snapshot.json`, `chat.md`',
  ]) {
    requireText(spec, text);
  }
});

check('payloadPolicy fields exist and D.1 forbids snapshot/assets payloads', () => {
  requireText(spec, 'payloadPolicy.containsSnapshotContent');
  requireText(spec, 'payloadPolicy.containsAssets');
  requireText(spec, '`payloadPolicy.containsSnapshotContent` must be `false`.');
  requireText(spec, '`payloadPolicy.containsAssets` must be `false`.');
});

check('trust boundary documents Chrome metadata as untrusted archive input', () => {
  requireText(spec, 'Chrome request metadata is untrusted archive input.');
  requirePattern(spec, /not\s+the package payload/);
  requireText(spec, 'Desktop intake/import flow');
  requireText(spec, 'package re-projection from Desktop store state');
});

check('failure modes are documented', () => {
  for (const text of [
    'Malformed request',
    'Unsupported `schema`',
    'Desktop unavailable',
    'Desktop chat missing',
    'Desktop snapshot missing',
    'Duplicate request',
    'Package already exists',
    'Package writer failure',
    'Stale Chrome capture vs Desktop snapshot',
    'Transport replay or out-of-order delivery',
  ]) {
    requireText(spec, text);
  }
});

check('forbidden scopes are explicitly non-goals', () => {
  for (const text of [
    'Chrome package writer',
    'sync transport mutation',
    'import/recovery',
    'repair/delete/overwrite',
    'user-folder export/save dialog',
    'CAS write-back',
    'CAS garbage collection',
    'CAS refcount repair',
    'C5.4B/C5.5 DB-centric inventory',
    'broad Chrome Studio redesign',
  ]) {
    requireText(spec, text);
  }
});

check('Phase D roadmap is present', () => {
  for (const phase of [
    'D.1 request contract',
    'D.2 Desktop intake/approval boundary',
    'D.3 request queue/status model',
    'D.4 minimal runtime proof',
    'D.5 evidence/closure',
  ]) {
    requireText(spec, phase);
  }
});

check('validator remains static/docs-only and avoids runtime imports', () => {
  const validatorSource = fs.readFileSync(__filename, 'utf8');
  assert.ok(!/import\s+.*from\s+['"][^'"]*(src-surfaces-base|apps\/extensions|apps\/studio|sync|ingestion|store|chrome)[^'"]*['"]/.test(validatorSource), 'validator imports runtime code');
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
  console.error(`[saved-chat-archive-request-contract] ${FAIL.length} failed, ${PASS.length} passed`);
  process.exit(1);
}

console.log(`[saved-chat-archive-request-contract] all ${PASS.length} checks passed`);
