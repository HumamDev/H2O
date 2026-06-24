#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const foldersPath = path.join(root, 'src-surfaces-base/studio/store/folders.tauri.js');
const smokeBridgePath = path.join(root, 'src-surfaces-base/studio/dev/folder-sync-rc-smoke-bridge.studio.js');
const evidencePath = path.join(root, 'release-evidence/2026-06-24/folder-delete-tombstone-phase4e-retention-diagnostics.md');

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
  const start = source.indexOf(`function ${name}`);
  assert(start >= 0, `${name} missing`);
  const brace = source.indexOf('{', start);
  assert(brace >= 0, `${name} body missing`);
  let depth = 0;
  for (let i = brace; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(brace, i + 1);
    }
  }
  throw new Error(`${name} body parse failed`);
}

for (const file of [foldersPath, smokeBridgePath, evidencePath]) {
  assert(fs.existsSync(file), `${path.relative(root, file)} missing`);
}

const folders = read(foldersPath);
const smokeBridge = read(smokeBridgePath);
const evidence = read(evidencePath);

[
  'PHASE4D3_RETENTION_DAYS = 30',
  "retentionEnforcement: 'deferred'",
  'purgeEligible: false',
  'purgeEligibleCount',
  'purgeBlockedReason',
  'purge-phase-deferred',
  'restorePolicy',
  'allowed-while-purge-deferred',
  'restoreAvailableReason',
  'retentionStartedAt',
  'retentionExpiresAt',
  'retentionExpired',
  'activeRetentionCount',
  'expiredRetentionCount',
  'restoredRetentionCount',
  'unknownRetentionCount',
  'noHardDelete: true',
  'noPurge: true',
  'noChatDelete: true',
  'noSnapshotDelete: true',
].forEach((needle) => assertContains(folders, needle, `folders retention policy ${needle}`));

const retentionBody = functionBody(folders, 'retentionCountdownStatus');
[
  "return 'unknown'",
  "return 'restored'",
  "return Date.now() >= expiresAt ? 'expired' : 'active'",
].forEach((needle) => assertContains(retentionBody, needle, `retentionCountdownStatus ${needle}`));

const rowBody = functionBody(folders, 'recentlyDeletedRowFromTombstone');
[
  'retentionStartedAt: deletedAt',
  'retentionExpired: retentionExpired',
  'retentionCountdownStatus: retentionStatus',
  "retentionEnforcement: 'deferred'",
  'purgeEligible: false',
  "restorePolicy: 'allowed-while-purge-deferred'",
  'restoreAvailableReason:',
  "purgeBlockedReason: 'purge-phase-deferred'",
  'purgeBlocked: true',
  'hardDeleteBlocked: true',
].forEach((needle) => assertContains(rowBody, needle, `recently deleted row ${needle}`));

const listBody = functionBody(folders, 'listRecentlyDeletedFolders');
[
  "retentionEnforcement: 'deferred'",
  'activeRetentionCount',
  'expiredRetentionCount',
  'restoredRetentionCount',
  'unknownRetentionCount',
  'purgeEligibleCount: 0',
  'purgeBlockedCount',
  'hardDeleteBlockedCount',
].forEach((needle) => assertContains(listBody, needle, `recently deleted aggregate ${needle}`));

[
  'summarizeRecentlyDeletedRetention',
  'activeRetentionCount',
  'expiredRetentionCount',
  'restoredRetentionCount',
  'unknownRetentionCount',
  'purgeEligibleCount',
  'retentionEnforcement',
  'rawDiagnostics',
  'recentlyDeletedDiagnostics: diagnostics',
].forEach((needle) => assertContains(smokeBridge, needle, `smoke bridge retention field ${needle}`));

const smokeListBody = functionBody(smokeBridge, 'listRecentlyDeletedFolders');
[
  'var rawDiagnostics = safeObject(result.recentlyDeletedDiagnostics)',
  'var retention = summarizeRecentlyDeletedRetention(result, rows)',
  'Object.assign({}, rawDiagnostics, result, retention',
  'recentlyDeletedDiagnostics: diagnostics',
  'Object.assign({}, result, retention',
].forEach((needle) => assertContains(smokeListBody, needle, `smoke bridge runtime surfacing ${needle}`));

const smokeRetentionBody = functionBody(smokeBridge, 'summarizeRecentlyDeletedRetention');
[
  "countByStatus('active')",
  "countByStatus('expired')",
  "countByStatus('restored')",
  "countByStatus('unknown')",
  'purgeEligibleCount: 0',
  "nested.retentionEnforcement || 'deferred'",
].forEach((needle) => assertContains(smokeRetentionBody, needle, `smoke bridge retention normalizer ${needle}`));

for (const forbidden of [
  'purgeTombstone',
  'purgeFolder',
  'hardDeleteFolder',
  'DELETE FROM',
  'deleteChat(',
  'deleteSnapshot(',
]) {
  assertNotContains(rowBody, forbidden, 'recently deleted row retention policy');
  assertNotContains(listBody, forbidden, 'recently deleted list retention policy');
}

[
  'Phase 4E',
  'retentionEnforcement:"deferred"',
  'purgeEligible:false',
  'purgeEligibleCount:0',
  'allowed-while-purge-deferred',
  'purge-phase-deferred',
  'No purge',
].forEach((needle) => assertContains(evidence, needle, `evidence ${needle}`));

console.log(JSON.stringify({
  ok: true,
  validator: 'validate-folder-retention-phase4e',
  folders: path.relative(root, foldersPath),
  smokeBridge: path.relative(root, smokeBridgePath),
  evidence: path.relative(root, evidencePath),
  retentionDays: 30,
  retentionEnforcement: 'deferred',
  purgeEligibleCount: 0,
}, null, 2));
