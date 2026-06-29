#!/usr/bin/env node
//
// Phase 14B — Chrome export-lock diagnosis/fix guard.
//
// Proves the Chrome auto-import export trigger no longer treats the
// Desktop-origin import refresh event as a Chrome-origin export trigger,
// while preserving active-lock blocking, bounded stale-lock recovery, and
// labels/tags/categories metadata request safety boundaries.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const failures = [];

const autoImportFile = 'src-surfaces-base/studio/sync/auto-import.mv3.js';
const folderImportFile = 'src-surfaces-base/studio/sync/folder-import.mv3.js';
const folderSyncFile = 'src-surfaces-base/studio/sync/folder-sync.tauri.js';
const phase13ValidatorFile = 'tools/validation/sync/validate-labels-tags-categories-phase13-chat-category-clear.mjs';
const evidenceFile = 'release-evidence/2026-06-25/labels-tags-categories-phase14b-export-lock-diagnosis.md';

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function assertContains(source, needle, label = needle) {
  assert(source.includes(needle), `missing ${label}`);
}

function assertNotContains(source, needle, label = needle) {
  assert(!source.includes(needle), `forbidden ${label}`);
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

for (const file of [autoImportFile, folderImportFile, folderSyncFile, phase13ValidatorFile, evidenceFile]) {
  assert(fs.existsSync(path.join(root, file)), `${file} missing`);
}

const autoImport = read(autoImportFile);
const folderImport = read(folderImportFile);
const folderSync = read(folderSyncFile);
const phase13Validator = read(phase13ValidatorFile);
const evidence = read(evidenceFile);

const onTriggerEventBody = functionBody(autoImport, 'onTriggerEvent');
const suppressBody = functionBody(autoImport, 'shouldSuppressEventTriggeredExport');
const recordSuppressedBody = functionBody(autoImport, 'recordEventTriggerSuppressed');
const bindBody = functionBody(autoImport, 'bindEventListeners');
const triggerBody = functionBody(autoImport, 'trigger');
const exportNowBody = functionBody(autoImport, 'exportNow');
const clearLockBody = functionBody(autoImport, 'clearStaleChromeExportLock');
const statusBody = functionBody(autoImport, 'status');
const folderRunExportBody = functionBody(folderImport, 'runChromeToDesktopExport');
const folderExportBody = functionBody(folderImport, 'exportChromeToSyncFolder');

[
  "var DESKTOP_ORIGIN_IMPORT_EVENT_SOURCES = ['sync-folder-import'];",
  'shouldSuppressEventTriggeredExport(eventName, event)',
  'recordEventTriggerSuppressed(suppressed)',
  'eventDetailSource(event)',
  'eventTriggerSuppressedCount',
  'lastEventTriggerSuppressedSource',
  'lastEventTriggerSuppressedReason',
].forEach((needle) => assertContains(autoImport, needle, `auto-import Phase 14B ${needle}`));

[
  "name !== 'evt:h2o:library:cross-surface-sync'",
  'DESKTOP_ORIGIN_IMPORT_EVENT_SOURCES.indexOf(source) === -1',
  "reason: 'desktop-origin-import-event'",
  'return null',
].forEach((needle) => assertContains(suppressBody, needle, `source-specific suppression ${needle}`));

[
  'var suppressed = shouldSuppressEventTriggeredExport(eventName, event)',
  'recordEventTriggerSuppressed(suppressed)',
  'return',
  'if (!flagEnabled())',
  'if (!eventTriggerFlagEnabled())',
  "exportNow({ reason: 'event:' + eventName })",
].forEach((needle) => assertContains(onTriggerEventBody, needle, `trigger guard order ${needle}`));

assert(
  onTriggerEventBody.indexOf('recordEventTriggerSuppressed(suppressed)') <
    onTriggerEventBody.indexOf('if (!flagEnabled())'),
  'Desktop-origin import suppression must run before export flag gates'
);
assert(
  onTriggerEventBody.indexOf('recordEventTriggerSuppressed(suppressed)') <
    onTriggerEventBody.indexOf('exportNow({ reason:'),
  'Desktop-origin import suppression must run before export scheduling'
);

[
  'state.eventTriggerSuppressedCount += 1',
  'state.lastEventTriggerSuppressedName',
  'state.lastEventTriggerSuppressedSource',
  'state.lastEventTriggerSuppressedReason',
].forEach((needle) => assertContains(recordSuppressedBody, needle, `suppression diagnostics ${needle}`));

assertContains(bindBody, 'var handler = function (event) { onTriggerEvent(name, event); };', 'DOM event detail forwarded');
assertContains(triggerBody, 'onTriggerEvent(name, null);', 'manual trigger remains source-less and unsuppressed');

[
  'desktopOriginImportEventSources',
  'eventTriggerSuppressedCount',
  'lastEventTriggerSuppressedAt',
  'lastEventTriggerSuppressedName',
  'lastEventTriggerSuppressedSource',
  'lastEventTriggerSuppressedReason',
  'chromeExportInFlightAgeMs',
  'chromeExportInFlightStaleMs',
  'chromeExportLockOwner',
  'chromeExportLockReason',
].forEach((needle) => assertContains(statusBody, needle, `status diagnostics ${needle}`));

[
  'clearStaleChromeExportLock(reason)',
  "blockers: ['chrome-to-desktop-export-in-flight']",
  "state.inFlightOwner = 'auto-import.exportNow'",
  'state.inFlightStartedAt = Date.now()',
  'state.inFlight = false',
].forEach((needle) => assertContains(exportNowBody, needle, `active/stale lock behavior ${needle}`));

[
  'CHROME_EXPORT_IN_FLIGHT_STALE_MS',
  'state.inFlight = false',
  'lastStaleInFlightClearedAt',
  'lastStaleInFlightClearedReason',
].forEach((needle) => assertContains(clearLockBody, needle, `bounded stale lock clear ${needle}`));

[
  'clearStaleChromeExportLock(cleanReason)',
  "state.chromeExportInFlightOwner = 'folder-import.runChromeToDesktopExport'",
  'chromeExportInFlightStartedAt',
  "exportChromeToSyncFolder({",
].forEach((needle) => assertContains(folderRunExportBody, needle, `folder facade lock remains ${needle}`));

[
  'autoImport.exportNow(Object.assign({}, opts',
  "direction: 'chrome-to-desktop'",
  'transport: CHROME_LATEST_FILE',
  'rememberChromeExportResult(normalized',
].forEach((needle) => assertContains(folderExportBody, needle, `manual export path remains ${needle}`));

[
  'chat-category-assign',
  'chat-category-clear',
  'BAD_ACTIONS',
  'chat-label-clear',
  'chat-tag-clear',
  'category-clear',
  'metadata-clear',
  'delete',
  'remove',
  'unbind',
  'purge',
  'hard-delete',
].forEach((needle) => assertContains(phase13Validator, needle, `Phase 13 action boundary ${needle}`));

[
  "chat-category-assign'",
  "chat-category-clear'",
  'categories.clearChat',
  'noHardDelete',
  'noPurge',
  'noChatDelete',
  'noSnapshotDelete',
  'noAssetDelete',
].forEach((needle) => assertContains(folderSync + folderImport, needle, `metadata safety boundary ${needle}`));

[
  'Root Cause',
  'sync-folder-import',
  'evt:h2o:library:cross-surface-sync',
  'desktop-origin-import-event',
  'eventTriggerSuppressedCount',
  'chrome-to-desktop-export-in-flight',
  'Phase 14 live proof should be rerun',
  'Product metadata sync: NOT READY',
].forEach((needle) => assertContains(evidence, needle, `Phase 14B evidence ${needle}`));

assertNotContains(autoImport, 'disable loop suppression globally', 'global loop suppression disable');
assertNotContains(autoImport, 'setInterval(function', 'new polling loop');

if (failures.length) {
  console.error('validate-labels-tags-categories-phase14b-export-lock-diagnosis: failed');
  failures.forEach((failure) => console.error(` - ${failure}`));
  process.exit(1);
}

console.log('validate-labels-tags-categories-phase14b-export-lock-diagnosis: ok');
