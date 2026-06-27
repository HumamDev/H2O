#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const autoImportPath = path.join(root, 'src-surfaces-base/studio/sync/auto-import.mv3.js');
const folderImportPath = path.join(root, 'src-surfaces-base/studio/sync/folder-import.mv3.js');
const bridgePath = path.join(root, 'src-surfaces-base/studio/dev/folder-sync-rc-smoke-bridge.studio.js');
const evidencePath = path.join(root, 'release-evidence/2026-06-25/folder-restore-phase6c2b-export-inflight-recovery.md');

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertContains(source, needle, label) {
  assert(source.includes(needle), `${label} missing ${needle}`);
}

function functionBody(source, name) {
  const match = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`).exec(source);
  const start = match ? match.index : -1;
  assert(start >= 0, `${name} missing`);
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
  throw new Error(`${name} body parse failed`);
}

for (const file of [autoImportPath, folderImportPath, bridgePath, evidencePath]) {
  assert(fs.existsSync(file), `${path.relative(root, file)} missing`);
}

const autoImport = read(autoImportPath);
const folderImport = read(folderImportPath);
const bridge = read(bridgePath);
const evidence = read(evidencePath);

const autoExportBody = functionBody(autoImport, 'exportNow');
const autoClearBody = functionBody(autoImport, 'clearStaleChromeExportLock');
const autoDiagBody = functionBody(autoImport, 'chromeExportLockDiagnostics');
const autoStatusBody = functionBody(autoImport, 'status');
const folderRunExportBody = functionBody(folderImport, 'runChromeToDesktopExport');
const folderStatusBody = functionBody(folderImport, 'status');
const folderDiagnoseBody = functionBody(folderImport, 'diagnose');
const bridgeSyncBody = functionBody(bridge, 'syncNow');
const bridgeHealthBody = functionBody(bridge, 'diagnoseHealth');

[
  'CHROME_EXPORT_IN_FLIGHT_STALE_MS',
  'inFlightStartedAt',
  'inFlightReason',
  'inFlightOwner',
  'lastStaleInFlightClearedAt',
  'lastStaleInFlightClearedReason',
].forEach((needle) => assertContains(autoImport, needle, `6C.2b auto-import lock state ${needle}`));

[
  'chromeExportInFlightPersisted',
  'chromeExportInFlightMemory',
  'chromeExportInFlightAgeMs',
  'chromeExportStaleLockCleared',
  'chromeExportLockOwner',
  'chromeExportLockReason',
].forEach((needle) => assertContains(autoDiagBody + autoStatusBody + autoExportBody, needle, `6C.2b auto-import diagnostics ${needle}`));

[
  'CHROME_EXPORT_IN_FLIGHT_STALE_MS',
  'state.inFlight = false',
  'lastStaleInFlightClearedAt',
  'lastStaleInFlightClearedReason',
].forEach((needle) => assertContains(autoClearBody, needle, `6C.2b auto-import stale clear ${needle}`));

[
  'clearStaleChromeExportLock(reason)',
  "blockers: ['chrome-to-desktop-export-in-flight']",
  "state.inFlightOwner = 'auto-import.exportNow'",
  'state.inFlightStartedAt = Date.now()',
  'state.inFlightStartedAt = 0',
  'folderRestoreRequestExport',
].forEach((needle) => assertContains(autoExportBody, needle, `6C.2b auto-import export recovery ${needle}`));

[
  'chromeExportInFlightStartedAt',
  'chromeExportInFlightReason',
  'chromeExportInFlightOwner',
  'chromeExportLastStaleLockClearedAt',
  'chromeExportLastStaleLockClearedReason',
].forEach((needle) => assertContains(folderImport, needle, `6C.2b folder facade lock state ${needle}`));

[
  'clearStaleChromeExportLock(cleanReason)',
  "state.chromeExportInFlightOwner = 'folder-import.runChromeToDesktopExport'",
  'chromeExportInFlightStartedAt',
  'chromeExportStaleLockCleared',
].forEach((needle) => assertContains(folderRunExportBody, needle, `6C.2b folder facade scheduled recovery ${needle}`));

[
  'chromeExportInFlightPersisted',
  'chromeExportInFlightMemory',
  'chromeExportInFlightAgeMs',
  'chromeExportInFlightStaleMs',
  'chromeExportStaleLockCleared',
  'chromeExportLockOwner',
  'chromeExportLockReason',
].forEach((needle) => assertContains(folderStatusBody + folderDiagnoseBody + bridgeSyncBody + bridgeHealthBody, needle, `6C.2b surfaced diagnostics ${needle}`));

[
  'folderRestoreRequestExport.requestCount',
  'chrome-to-desktop-export-in-flight',
  'chromeExportStaleLockCleared',
  'no Chrome restore authority',
  'no Chrome tombstone apply/create',
].forEach((needle) => assertContains(evidence, needle, `6C.2b evidence ${needle}`));

console.log('validate-folder-restore-phase6c2b-export-inflight-recovery: ok');
