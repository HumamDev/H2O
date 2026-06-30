#!/usr/bin/env node
// L.1 - Saved-chat archive package cloud-sync boundary validator.
//
// L.0 registers archive package cloud sync as a deferred encrypted
// CAS-over-transport lane. This validator locks the current boundary: no
// archive package WebDAV/cloud/network transport, no remote-arrival auto-apply,
// no package bodies in metadata sync envelopes, no Chrome package-body
// authority, and no archive cloud-sync runtime namespace.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..', '..', '..');

const L0_CONTRACT_REL = 'release-evidence/2026-06-30/saved-chat-archive-phase-l0-package-cloud-sync-contract.md';
const INGESTION_DIR_REL = 'src-surfaces-base/studio/ingestion';
const SYNC_DIR_REL = 'src-surfaces-base/studio/sync';
const CAPABILITIES_DIR_REL = 'apps/studio/desktop/src-tauri/capabilities';

const ARCHIVE_MODULE_RE = /saved-chat-(archive|package).*\.(studio|tauri|mv3)\.js$/;
const JS_RE = /\.(js|mjs)$/;

const REQUIRED_CONTRACT_PATTERNS = [
  /NOT IMPLEMENTED/i,
  /DEFERRED/i,
  /encrypted CAS-over-transport lane/i,
  /\.h2ochat` package bodies only/i,
  /metadata sync\/metadata-first model/i,
  /Key management and E2E encryption model exists/i,
  /Desktop SQLite remains the canonical archive authority/i,
  /Cloud\/WebDAV is an untrusted transport boundary/i,
  /Chrome has no package-body authority/i,
  /Transport does not auto-apply/i,
  /import-as-new/i,
  /restore-original-ids/i,
  /relink/i,
  /No auto-un-delete/i,
  /Package bytes must not be embedded in metadata sync envelopes/i,
  /flag-gated OFF by default/i,
];

const PREMATURE_TRANSPORT_PATTERNS = [
  /\bWebDAV\b/i,
  /\bPROPFIND\b/i,
  /\bMKCOL\b/i,
  /\bLOCK\b/i,
  /\bUNLOCK\b/i,
  /\bremoteMove\b/i,
  /\bwebdavMove\b/i,
  /\bcloudMove\b/i,
  /\bfetch\s*\(/i,
  /\bXMLHttpRequest\b/i,
  /\bnavigator\.sendBeacon\b/i,
  /\buploadArchivePackage\b/i,
  /\bdownloadArchivePackage\b/i,
  /\bfetchRemoteArchivePackage\b/i,
  /\barchiveCloudSync\b/i,
  /\barchivePackageCloudSync\b/i,
  /\bwebdavArchiveSync\b/i,
  /\.h2ochat\.enc\b/i,
  /cas\/<contentHash>\.h2ochat\.enc/i,
];

const AUTO_APPLY_PATTERNS = [
  /\bautoImportRemotePackage\b/i,
  /\bautoRestoreRemotePackage\b/i,
  /\bautoRelinkRemotePackage\b/i,
  /\bapplyRemotePackage\b/i,
  /\bimportFromCloud\b/i,
  /\brestoreFromCloud\b/i,
  /\brelinkFromCloud\b/i,
  /\bcloudArrival\b/i,
  /\bpackageArrival\b/i,
];

const CLOUD_SYNC_NAMES = [
  'H2O.Studio.archiveCloudSync',
  'H2O.Studio.archivePackageCloudSync',
  'H2O.Studio.webdavArchiveSync',
  'dryRunArchiveCloudSync',
  'syncArchivePackages',
  'uploadArchivePackage',
  'downloadArchivePackage',
  'fetchRemoteArchivePackage',
];

const METADATA_PACKAGE_BODY_PATTERNS = [
  /\.h2ochat\b/i,
  /\.h2ochat\.enc\b/i,
  /\bmanifest\.json\b/i,
  /\bsnapshot\.json\b/i,
  /\bchat\.md\b/i,
  /\bchat\.html\b/i,
  /\bpackageBody\b/i,
  /\bpackageBytes\b/i,
  /\bsnapshotBody\b/i,
  /\bassetBody\b/i,
  /\bbase64Package\b/i,
  /\bpackageBase64\b/i,
];

const CHROME_PACKAGE_AUTHORITY_PATTERNS = [
  /\.h2ochat\b/i,
  /\.h2ochat\.enc\b/i,
  /\bwriteSavedChatPackageV1\b/i,
  /\bwriteSavedChatPackageV2\b/i,
  /\bbuildSavedChatPackageV1\b/i,
  /\bimportVerifiedPackage\b/i,
  /\brestoreVerifiedPackage\b/i,
  /\brelinkVerifiedPackage\b/i,
  /\barchiveExporter\b/i,
  /\barchiveRestore\b/i,
  /\barchiveRelink\b/i,
  /\bassetCas\b/i,
  /\bputAssetBytes\b/i,
  /\buploadArchivePackage\b/i,
  /\bdownloadArchivePackage\b/i,
  /\bwebdavArchivePackage\b/i,
  /\barchivePackageWebDAV\b/i,
  /\barchivePackageCloud\b/i,
];

const PACKAGE_CLOUD_CAPABILITY_PATTERNS = [
  /archive.*cloud.*package/i,
  /package.*cloud.*archive/i,
  /webdav.*h2ochat\.enc/i,
  /h2ochat\.enc.*webdav/i,
  /\.h2ochat\.enc/i,
  /cas\/\*\*.*h2ochat/i,
];

const PASS = [];
const FAIL = [];

function check(label, fn) {
  try {
    fn();
    PASS.push(label);
    console.log(`  ✓ ${label}`);
  } catch (e) {
    const m = e && e.message ? e.message : String(e);
    FAIL.push({ label, m });
    console.log(`  ✗ ${label}`);
    console.log(`      ${m}`);
  }
}

function exists(rel) {
  return fs.existsSync(path.join(REPO_ROOT, rel));
}

function readRepo(rel) {
  return fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
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

function codeOf(rel) {
  return stripComments(readRepo(rel));
}

function archiveModuleFiles() {
  return walkFiles(path.join(REPO_ROOT, INGESTION_DIR_REL))
    .filter((abs) => ARCHIVE_MODULE_RE.test(path.basename(abs)))
    .map(relPath)
    .sort();
}

function syncEnvelopeFiles() {
  return walkFiles(path.join(REPO_ROOT, SYNC_DIR_REL))
    .filter((abs) => JS_RE.test(path.basename(abs)))
    .map(relPath)
    .sort();
}

function chromeSourceFiles() {
  return walkFiles(path.join(REPO_ROOT, 'src-surfaces-base/studio'))
    .filter((abs) => /\.mv3\.js$/.test(path.basename(abs)))
    .map(relPath)
    .sort();
}

function capabilityFiles() {
  return walkFiles(path.join(REPO_ROOT, CAPABILITIES_DIR_REL))
    .filter((abs) => /\.json$/.test(path.basename(abs)))
    .map(relPath)
    .sort();
}

function assertAbsent(rel, code, patterns, label) {
  for (const pattern of patterns) {
    assert.ok(!pattern.test(code), `${label} matched ${pattern} in ${rel}`);
  }
}

const l0 = exists(L0_CONTRACT_REL) ? readRepo(L0_CONTRACT_REL) : '';
const archiveModules = archiveModuleFiles();
const syncFiles = syncEnvelopeFiles();
const chromeFiles = chromeSourceFiles();
const capabilityRels = capabilityFiles();

console.log('[archive-cloud-sync-boundary] L.1 archive package cloud-sync boundary checks');

check('[L.0] archive package cloud-sync contract exists', () => {
  assert.ok(exists(L0_CONTRACT_REL), 'missing L.0 contract evidence');
  assert.match(l0, /PHASE L\.0 CONTRACT[\s\S]*ARCHIVE PACKAGE CLOUD SYNC[\s\S]*NOT IMPLEMENTED/i);
});

check('[L.0] contract contains required deferred encrypted CAS-over-transport decisions', () => {
  for (const pattern of REQUIRED_CONTRACT_PATTERNS) {
    assert.match(l0, pattern, `missing contract boundary pattern ${pattern}`);
  }
});

check('[ARCHIVE] archive saved-chat modules are discoverable for cloud boundary scan', () => {
  assert.ok(archiveModules.includes('src-surfaces-base/studio/ingestion/saved-chat-archive-importer.studio.js'), 'importer missing from scan');
  assert.ok(archiveModules.includes('src-surfaces-base/studio/ingestion/saved-chat-archive-restore.studio.js'), 'restore missing from scan');
  assert.ok(archiveModules.includes('src-surfaces-base/studio/ingestion/saved-chat-archive-relink.studio.js'), 'relink missing from scan');
  assert.ok(archiveModules.includes('src-surfaces-base/studio/ingestion/saved-chat-archive-exporter.studio.js'), 'exporter missing from scan');
  assert.ok(archiveModules.includes('src-surfaces-base/studio/ingestion/saved-chat-archive-inspector.studio.js'), 'inspector missing from scan');
  assert.ok(archiveModules.length >= 10, 'archive module scan unexpectedly small');
});

check('[ARCHIVE] no archive module has premature cloud/WebDAV/network package transport', () => {
  for (const rel of archiveModules) {
    assertAbsent(rel, codeOf(rel), PREMATURE_TRANSPORT_PATTERNS, 'premature archive package transport pattern');
  }
});

check('[ARCHIVE] no archive module has remote-arrival auto-apply path', () => {
  for (const rel of archiveModules) {
    assertAbsent(rel, codeOf(rel), AUTO_APPLY_PATTERNS, 'remote arrival auto-apply pattern');
  }
});

check('[ARCHIVE] no archive package cloud-sync runtime namespace exists', () => {
  for (const rel of archiveModules) {
    const code = codeOf(rel);
    for (const name of CLOUD_SYNC_NAMES) {
      assert.ok(!code.includes(name), `archive cloud-sync runtime namespace leaked into ${rel}: ${name}`);
    }
  }
});

check('[SYNC] metadata sync files are discoverable and do not embed package bodies', () => {
  assert.ok(syncFiles.length >= 4, 'sync file scan unexpectedly small');
  for (const rel of syncFiles) {
    assertAbsent(rel, codeOf(rel), METADATA_PACKAGE_BODY_PATTERNS, 'package body in metadata sync envelope pattern');
  }
});

check('[CHROME] Chrome/MV3 remains package-body-authority-free', () => {
  assert.ok(chromeFiles.length >= 3, 'Chrome/MV3 file scan unexpectedly small');
  for (const rel of chromeFiles) {
    assertAbsent(rel, codeOf(rel), CHROME_PACKAGE_AUTHORITY_PATTERNS, 'Chrome package-body authority pattern');
  }
});

check('[CAPABILITIES] no archive cloud/WebDAV package transport capability exists', () => {
  assert.ok(capabilityRels.length >= 2, 'capability scan unexpectedly small');
  for (const rel of capabilityRels) {
    const text = readRepo(rel);
    assertAbsent(rel, text, PACKAGE_CLOUD_CAPABILITY_PATTERNS, 'archive package cloud capability pattern');
  }
});

check('[BOUNDARY] local package/export filesystem operations remain separate from cloud transport', () => {
  const exporterRel = 'src-surfaces-base/studio/ingestion/saved-chat-archive-exporter.studio.js';
  const writerRel = 'src-surfaces-base/studio/ingestion/saved-chat-package-v1.tauri.js';
  assert.ok(archiveModules.includes(exporterRel), 'bounded local exporter not included in scan');
  assert.ok(archiveModules.includes(writerRel), 'local package writer not included in scan');
  assert.ok(codeOf(exporterRel).includes('H2O Studio Exports'), 'local bounded export root missing');
  assert.ok(codeOf(writerRel).includes('.h2ochat'), 'local package writer missing .h2ochat package identity');
});

console.log('');
if (FAIL.length) {
  console.error(`[archive-cloud-sync-boundary] ${FAIL.length} failed, ${PASS.length} passed`);
  process.exitCode = 1;
} else {
  console.log(`[archive-cloud-sync-boundary] all ${PASS.length} checks passed`);
}
