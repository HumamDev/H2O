#!/usr/bin/env node
// Sync identity/key/E2E boundary validator.
//
// The 2026-06-30 identity/key/E2E model is a design contract only. This
// validator locks the current boundary: peer identity and hash helpers may
// exist, but keychain-backed E2E, pairing, recipient key wrapping, encrypted
// package CAS transport, and metadata envelope freeze remain unimplemented.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..', '..', '..');

const CONTRACT_REL = 'release-evidence/2026-06-30/sync-identity-key-e2e-model-contract.md';
const ARCHIVE_CLOUD_VALIDATOR_REL = 'tools/validation/studio/validate-saved-chat-archive-cloud-sync-boundary-v1.mjs';
const STUDIO_SRC_REL = 'src-surfaces-base/studio';
const DESKTOP_TAURI_REL = 'apps/studio/desktop/src-tauri';
const SYNC_SRC_REL = 'src-surfaces-base/studio/sync';
const INGESTION_SRC_REL = 'src-surfaces-base/studio/ingestion';

const REQUIRED_CONTRACT_PATTERNS = [
  /DESIGN ONLY/i,
  /NOT IMPLEMENTED/i,
  /`installId`[\s\S]*stable per-install identity anchor/i,
  /`syncPeerId`[\s\S]*current protocol peer identifier/i,
  /`peerId`[\s\S]*shorthand/i,
  /May mean raw `syncPeerId`, hashed `syncPeerId`, or a per-table peer key/i,
  /`sync_peer_id`[\s\S]*Storage\/envelope column naming convention/i,
  /future signed publication identity[\s\S]*`producerDeviceId`/i,
  /future encryption recipient identity[\s\S]*`recipientDeviceKeyId`/i,
  /explicit pairing/i,
  /trusted device set/i,
  /Device revocation/i,
  /Rotation/i,
  /re-wrap keys to surviving trusted devices/i,
  /Private keys are stored in OS secure storage/i,
  /Keys are never stored in synced files/i,
  /Per-payload content-encryption key/i,
  /wrapped to each trusted recipient device public key/i,
  /Verify-before-use/i,
  /`payloadHash`/i,
  /signature or authenticity proof/i,
  /quarantine on mismatch/i,
  /transport-agnostic/i,
  /metadata envelopes now\/later/i,
  /future `.h2ochat\.enc` immutable CAS blobs later/i,
];

const E2E_RUNTIME_PATTERNS = [
  /\bkeychainSyncKey\b/i,
  /\bsyncKeychain\b/i,
  /\bstoreSyncPrivateKey\b/i,
  /\bloadSyncPrivateKey\b/i,
  /\bpairTrustedDevice\b/i,
  /\btrustedDeviceSet\b/i,
  /\bdeviceTrust\b/i,
  /\bgenerateSyncKeypair\b/i,
  /\bgenerateDeviceKeypair\b/i,
  /\bwrapCEK\b/i,
  /\bunwrapCEK\b/i,
  /\bcontentEncryptionKey\b/i,
  /\brecipientDeviceKeyId\b/i,
  /\bproducerDeviceId\b/i,
  /\bencryptSyncEnvelope\b/i,
  /\bdecryptSyncEnvelope\b/i,
  /\bencryptArchivePackage\b/i,
  /\bdecryptArchivePackage\b/i,
  /\.h2ochat\.enc\b/i,
  /\bwebdavPackageEncryption\b/i,
  /\barchivePackageEncryption\b/i,
];

const SYNCED_KEY_MATERIAL_PATTERNS = [
  /\bprivateKey\b/i,
  /\bsecretKey\b/i,
  /\brecoveryKey\b/i,
  /\bmnemonic\b/i,
  /\brawCEK\b/i,
  /\bunwrappedKey\b/i,
  /\bkeyMaterial\b/i,
  /\bexportedPrivateKey\b/i,
  /\bpassphrase\b/i,
];

const METADATA_FREEZE_PATTERNS = [
  /h2o\.studio\.fullBundle\.v3/i,
  /h2o\.studio\.transportEnvelope\.v1/i,
  /transport-identity-envelope/i,
  /producerDeviceId/i,
  /recipientDeviceKeyId/i,
  /\.h2ochat\b/i,
  /\.h2ochat\.enc\b/i,
  /\bpackageBytes\b/i,
  /\bpackageBody\b/i,
  /\bbase64Package\b/i,
];

const CLOUD_PACKAGE_PATTERNS = [
  /\buploadArchivePackage\b/i,
  /\bdownloadArchivePackage\b/i,
  /\bfetchRemoteArchivePackage\b/i,
  /\barchivePackageCloudSync\b/i,
  /\bwebdavArchivePackage\b/i,
  /\.h2ochat\.enc\b/i,
  /\bautoImportRemotePackage\b/i,
  /\bautoRestoreRemotePackage\b/i,
  /\bautoRelinkRemotePackage\b/i,
  /\bapplyRemotePackage\b/i,
];

const PASS = [];
const FAIL = [];

function check(label, fn) {
  try {
    fn();
    PASS.push(label);
    console.log(`  ✓ ${label}`);
  } catch (e) {
    const message = e && e.message ? e.message : String(e);
    FAIL.push({ label, message });
    console.log(`  ✗ ${label}`);
    console.log(`      ${message}`);
  }
}

function repoPath(rel) {
  return path.join(REPO_ROOT, rel);
}

function exists(rel) {
  return fs.existsSync(repoPath(rel));
}

function readRepo(rel) {
  return fs.readFileSync(repoPath(rel), 'utf8');
}

function stripComments(src) {
  return String(src)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function walkFiles(absDir) {
  if (!fs.existsSync(absDir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(absDir, { withFileTypes: true })) {
    const abs = path.join(absDir, entry.name);
    if (entry.isDirectory()) out.push(...walkFiles(abs));
    else out.push(abs);
  }
  return out;
}

function relPath(abs) {
  return path.relative(REPO_ROOT, abs).split(path.sep).join('/');
}

function sourceFiles() {
  const roots = [STUDIO_SRC_REL, DESKTOP_TAURI_REL];
  return roots
    .flatMap((rel) => walkFiles(repoPath(rel)))
    .filter((abs) => /\.(js|mjs|ts|rs|json)$/.test(path.basename(abs)))
    .map(relPath)
    .sort();
}

function syncPublicationFiles() {
  return walkFiles(repoPath(SYNC_SRC_REL))
    .filter((abs) => /\.(js|mjs)$/.test(path.basename(abs)))
    .map(relPath)
    .sort();
}

function archiveAndSyncFiles() {
  return [INGESTION_SRC_REL, SYNC_SRC_REL]
    .flatMap((rel) => walkFiles(repoPath(rel)))
    .filter((abs) => /\.(js|mjs)$/.test(path.basename(abs)))
    .map(relPath)
    .sort();
}

function codeOf(rel) {
  return stripComments(readRepo(rel));
}

function assertAbsent(rel, code, patterns, label) {
  for (const pattern of patterns) {
    assert.ok(!pattern.test(code), `${label} matched ${pattern} in ${rel}`);
  }
}

const contract = exists(CONTRACT_REL) ? readRepo(CONTRACT_REL) : '';
const allSourceFiles = sourceFiles();
const syncFiles = syncPublicationFiles();
const archiveSyncFiles = archiveAndSyncFiles();

console.log('[sync-identity-key-e2e-boundary] design-only identity/key/E2E checks');

check('[CONTRACT] identity/key/E2E contract exists', () => {
  assert.ok(exists(CONTRACT_REL), 'missing identity/key/E2E contract evidence');
  assert.match(contract, /IDENTITY \+ KEY \+ E2E ENCRYPTION MODEL[\s\S]*DESIGN ONLY[\s\S]*NOT IMPLEMENTED/i);
});

check('[CONTRACT] required design decisions are present', () => {
  for (const pattern of REQUIRED_CONTRACT_PATTERNS) {
    assert.match(contract, pattern, `contract missing ${pattern}`);
  }
});

check('[CONTRACT] sequencing keeps WebDAV and archive package CAS blocked', () => {
  assert.match(contract, /hard prerequisite for WebDAV metadata transport/i);
  assert.match(contract, /hard prerequisite for archive package CAS sync L\.2/i);
  assert.match(contract, /must not freeze the metadata envelope/i);
  assert.match(contract, /must not implement transport/i);
  assert.match(contract, /must not implement archive package sync/i);
});

check('[SOURCE] runtime/source files are discoverable for E2E boundary scan', () => {
  assert.ok(allSourceFiles.some((rel) => rel.endsWith('src-surfaces-base/studio/sync/kernel/identity-kit.tauri.js')), 'identity kit missing from scan');
  assert.ok(allSourceFiles.length > 50, 'source scan unexpectedly small');
});

check('[SOURCE] no keychain-backed sync E2E runtime exists yet', () => {
  for (const rel of allSourceFiles) {
    assertAbsent(rel, codeOf(rel), E2E_RUNTIME_PATTERNS, 'key/E2E implementation pattern');
  }
});

check('[SYNC] keys are not stored in synced publication/envelope files', () => {
  assert.ok(syncFiles.length > 10, 'sync publication scan unexpectedly small');
  for (const rel of syncFiles) {
    assertAbsent(rel, codeOf(rel), SYNCED_KEY_MATERIAL_PATTERNS, 'synced key material pattern');
  }
});

check('[SYNC] metadata envelope has not been frozen for transport identity/E2E in this slice', () => {
  for (const rel of syncFiles) {
    assertAbsent(rel, codeOf(rel), METADATA_FREEZE_PATTERNS, 'metadata envelope freeze/package body pattern');
  }
});

check('[ARCHIVE/SYNC] WebDAV/package CAS remains blocked; no package bytes over cloud or auto-apply exists', () => {
  for (const rel of archiveSyncFiles) {
    assertAbsent(rel, codeOf(rel), CLOUD_PACKAGE_PATTERNS, 'cloud package CAS or auto-apply pattern');
  }
});

check('[ARCHIVE] archive package cloud-sync boundary validator remains present', () => {
  assert.ok(exists(ARCHIVE_CLOUD_VALIDATOR_REL), 'archive cloud sync boundary validator missing');
  const src = readRepo(ARCHIVE_CLOUD_VALIDATOR_REL);
  assert.match(src, /no archive module has premature cloud\/WebDAV\/network package transport/i);
  assert.match(src, /Chrome\/MV3 remains package-body-authority-free/i);
});

console.log('');
if (FAIL.length) {
  console.error(`[sync-identity-key-e2e-boundary] ${FAIL.length} failed, ${PASS.length} passed`);
  process.exitCode = 1;
} else {
  console.log(`[sync-identity-key-e2e-boundary] all ${PASS.length} checks passed`);
}
