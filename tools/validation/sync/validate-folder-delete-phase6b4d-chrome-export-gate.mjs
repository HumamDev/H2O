#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const autoImportPath = path.join(root, 'src-surfaces-base/studio/sync/auto-import.mv3.js');
const folderImportPath = path.join(root, 'src-surfaces-base/studio/sync/folder-import.mv3.js');
const bridgePath = path.join(root, 'src-surfaces-base/studio/dev/folder-sync-rc-smoke-bridge.studio.js');
const studioPath = path.join(root, 'src-surfaces-base/studio/studio.js');
const evidencePath = path.join(root, 'release-evidence/2026-06-25/folder-delete-phase6b4d-chrome-export-gate.md');

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

for (const file of [autoImportPath, folderImportPath, bridgePath, studioPath, evidencePath]) {
  assert(fs.existsSync(file), `${path.relative(root, file)} missing`);
}

const autoImport = read(autoImportPath);
const folderImport = read(folderImportPath);
const bridge = read(bridgePath);
const studio = read(studioPath);
const evidence = read(evidencePath);

const setMasterFlagBody = functionBody(autoImport, 'setMasterFlag');
const enableChromeExportBody = functionBody(autoImport, 'enableChromeExport');
const disableChromeExportBody = functionBody(autoImport, 'disableChromeExport');
const enableBody = functionBody(autoImport, 'enable');
const disableBody = functionBody(autoImport, 'disable');
const exportNowBody = functionBody(autoImport, 'exportNow');
const diagnoseGateBody = functionBody(autoImport, 'diagnoseChromeExportWriteGate');
const persistStateBody = functionBody(folderImport, 'persistState');
const diagnoseBody = functionBody(folderImport, 'diagnose');
const bridgeEnsureBody = functionBody(bridge, 'ensureChromeSmokeExportOptIn');
const bridgeSyncBody = functionBody(bridge, 'syncNow');
const bridgeHealthBody = functionBody(bridge, 'diagnoseHealth');
const settingsRefreshBody = functionBody(studio, 'refreshSettingsSync');
const settingsBindBody = functionBody(studio, 'bindSettingsSyncControls');

[
  'flags.set(FLAG_KEY, !!next)',
  'return true',
].forEach((needle) => assertContains(setMasterFlagBody, needle, `6B.4d master export flag writer ${needle}`));

[
  'setMasterFlag(true)',
  'diagnoseChromeExportWriteGate()',
].forEach((needle) => assertContains(enableChromeExportBody, needle, `6B.4d explicit enable API ${needle}`));

[
  'setMasterFlag(false)',
  'setEventTriggerFlag(false)',
  'state.enabled = false',
].forEach((needle) => assertContains(disableChromeExportBody, needle, `6B.4d explicit disable API ${needle}`));

[
  'setMasterFlag(true)',
  'setEventTriggerFlag(true)',
  "reconcileEventTriggerBinding('enable')",
].forEach((needle) => assertContains(enableBody, needle, `6B.4d settings enable path ${needle}`));

[
  'setMasterFlag(false)',
  'setEventTriggerFlag(false)',
  'state.enabled = false',
].forEach((needle) => assertContains(disableBody, needle, `6B.4d settings disable path ${needle}`));

[
  'enableChromeExport: enableChromeExport',
  'disableChromeExport: disableChromeExport',
].forEach((needle) => assertContains(autoImport, needle, `6B.4d public autoImport API ${needle}`));

[
  'chrome-export-flag-off',
  'SMOKE_CHROME_EXPORT_OPT_IN_KEY',
  'smokeChromeExportEnabled()',
  'effectiveFlagEnabled',
].forEach((needle) => assertContains(diagnoseGateBody, needle, `6B.4d export gate diagnostic ${needle}`));

[
  'if (!flagEnabled() && !folderAutoSync)',
  "status: 'chrome-to-desktop-export-flag-off'",
  'chrome-export-flag-off',
  "status: 'chrome-to-desktop-exported'",
  'chromeWritesSyncFolder: true',
].forEach((needle) => assertContains(exportNowBody, needle, `6B.4d export gate behavior ${needle}`));

[
  'chromeExportReady',
  'getChromeExportWriteGate().effectiveFlagEnabled === true',
  "state.lastChromeExportStatus === 'chrome-to-desktop-exported' || chromeExportReady",
].forEach((needle) => assertContains(persistStateBody, needle, `6B.4d persisted write-capability diagnostic ${needle}`));

[
  'chromeDesktopExportApiAvailable',
  "state.lastChromeExportStatus === 'chrome-to-desktop-exported' ||",
  'getChromeExportWriteGate().effectiveFlagEnabled === true',
].forEach((needle) => assertContains(folderImport, needle, `6B.4d summary write-capability diagnostic ${needle}`));

[
  'chromeExportWriteGate.effectiveFlagEnabled === true',
  'exportReady',
  "state.lastChromeExportStatus === 'chrome-to-desktop-exported' ||",
].forEach((needle) => assertContains(diagnoseBody, needle, `6B.4d diagnose write-capability diagnostic ${needle}`));

[
  'SMOKE_CHROME_EXPORT_OPT_IN_KEY',
  "surface.kind !== 'chrome-studio'",
  'readLocalOptIn() !== REQUIRED_VALUE',
  'publicReleaseFlagActive()',
  'global.localStorage.setItem(SMOKE_CHROME_EXPORT_OPT_IN_KEY, REQUIRED_VALUE)',
].forEach((needle) => assertContains(bridgeEnsureBody, needle, `6B.4d smoke export opt-in helper ${needle}`));

[
  "cleanString(payload.direction) === 'chrome-to-desktop'",
  'chromeExportSmokeOptInEnsured = ensureChromeSmokeExportOptIn()',
  'chromeExportSmokeOptInEnsured: chromeExportSmokeOptInEnsured',
].forEach((needle) => assertContains(bridgeSyncBody, needle, `6B.4d smoke sync export opt-in ${needle}`));

[
  'chromeExportSmokeOptInEnsured = ensureChromeSmokeExportOptIn()',
  'chromeExportSmokeOptInEnsured: chromeExportSmokeOptInEnsured',
].forEach((needle) => assertContains(bridgeHealthBody, needle, `6B.4d smoke health export opt-in ${needle}`));

[
  'Enable Chrome Export',
  'Disable Chrome Export',
  'Chrome export is disabled. Use Enable Chrome Export.',
  'chromeExportFullyEnabled',
].forEach((needle) => assertContains(studio, needle, `6B.4d Settings Chrome export UX ${needle}`));

[
  'W.H2O?.Studio?.sync?.autoImport?.enable',
  'W.H2O?.Studio?.sync?.autoImport?.disable',
  'Enabling Chrome export',
  'Disabling Chrome export',
].forEach((needle) => assertContains(settingsBindBody, needle, `6B.4d Settings wiring ${needle}`));

assertNotContains(settingsRefreshBody, "H2O.flags.set('sync.chromeAutoImport', true)", '6B.4d Settings should not instruct manual flag edits');
assertNotContains(settingsRefreshBody, 'Master flag sync.chromeAutoImport is OFF', '6B.4d Settings should not present stale event-only gate copy');
assertContains(studio, 'wbSettingsSyncEnableDesktopAuto', '6B.4d Desktop auto export control remains present');

[
  'Phase 6B.4d',
  'chrome-export-flag-off',
  'sync.chromeAutoImport',
  'Enable Chrome Export',
  'chromeWritesSyncFolder:true',
  'chrome-to-desktop-exported',
  'no Chrome permanent delete',
  'no Chrome purge authority',
].forEach((needle) => assertContains(evidence, needle, `6B.4d evidence ${needle}`));

[
  'purgeRecentlyDeletedFolders',
  'previewRecentlyDeletedFolderPurge',
  'clearRecentlyDeletedRestoredHistory',
  'deleteChat(',
  'deleteSnapshot(',
  'deleteAssets',
  'hardDelete',
].forEach((needle) => assertNotContains(autoImport + folderImport + bridgeEnsureBody + settingsBindBody, needle, `6B.4d forbidden behavior ${needle}`));

console.log(JSON.stringify({
  ok: true,
  validator: 'validate-folder-delete-phase6b4d-chrome-export-gate',
  autoImport: path.relative(root, autoImportPath),
  folderImport: path.relative(root, folderImportPath),
  bridge: path.relative(root, bridgePath),
  settings: path.relative(root, studioPath),
  evidence: path.relative(root, evidencePath),
  chromeExportGate: 'master-flag-or-smoke-opt-in',
  chromeAuthority: 'export-only-request-transport',
  chromePurgeAuthority: false,
}, null, 2));
