#!/usr/bin/env node
// Docs-only validator for Studio Reader & Notes Architecture Contract v1.2.
//
// This script reads contract/ADR markdown and checks that MVP-A0 locked
// decisions are documented. It does not import runtime modules and does not
// write files.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..', '..', '..');

const CONTRACT_REL = 'docs/systems/reader-notes/architecture-contract-v1.2.md';
const ADR_REL = 'docs/decisions/ADR-0011-studio-reader-notes-architecture.md';
const HIGHLIGHTS_REL = 'docs/systems/highlights/contract.md';
const COMMAND_BAR_REL = 'docs/systems/command-bar/contract.md';
const SIDE_ACTIONS_REL = 'docs/systems/side-actions-panel/contract.md';

const pass = [];
const fail = [];

function read(rel) {
  const full = path.join(REPO_ROOT, rel);
  assert.ok(fs.existsSync(full), `${rel} must exist`);
  return fs.readFileSync(full, 'utf8');
}

function check(label, fn) {
  try {
    fn();
    pass.push(label);
    console.log(`[ok] ${label}`);
  } catch (error) {
    const message = error && error.message ? error.message : String(error);
    fail.push({ label, message });
    console.log(`[fail] ${label}`);
    console.log(`       ${message}`);
  }
}

function includes(text, needle, label) {
  assert.ok(text.includes(needle), `${label}: missing "${needle}"`);
}

function matches(text, pattern, label) {
  assert.ok(pattern.test(text), `${label}: missing ${pattern}`);
}

const contract = read(CONTRACT_REL);
const adr = read(ADR_REL);
const highlights = read(HIGHLIGHTS_REL);
const commandBar = read(COMMAND_BAR_REL);
const sideActions = read(SIDE_ACTIONS_REL);
const allDocs = [contract, adr, highlights, commandBar, sideActions].join('\n\n');

check('contract and ADR exist', () => {
  includes(contract, '# Studio Reader & Notes Architecture Contract v1.2', 'contract title');
  includes(adr, '# ADR-0011: Studio Reader & Notes Architecture Contract', 'ADR title');
});

check('contract mentions Hybrid Typed-Object Architecture', () => {
  includes(contract, 'Hybrid Typed-Object Architecture', 'architecture name');
  includes(contract, 'typed `LibraryItem` envelope', 'LibraryItem envelope');
});

check('D10 captured-chat identity is resolved to Chat Registry chatId', () => {
  includes(contract, '## D10 - Captured-Chat LibraryItem Identity', 'D10 heading');
  includes(contract, '`LibraryItem.id` is the existing Chat Registry identity /', 'LibraryItem identity');
  includes(contract, '`chatId`', 'chatId');
  matches(contract, /does not own\s+deduplication, recapture identity, merge ordering, cross-account scoping, or fork/s, 'D10 non-ownership');
  includes(contract, 'Cross-account scoping remains deferred', 'cross-account deferral');
});

check('D11 highlight attribution uses no-mis-attribution and unattributed', () => {
  includes(contract, '## D11 - Highlight-to-Item Attribution', 'D11 heading');
  includes(contract, 'no-mis-attribution rule', 'no-mis-attribution');
  includes(contract, '`unattributed`', 'unattributed');
  includes(contract, 'Never attribute a highlight to the wrong `LibraryItem`', 'never wrong item');
});

check('A2b sidecar is auxiliary derived sidecar-only data', () => {
  includes(contract, '## A2b Sidecar Policy', 'A2b heading');
  includes(contract, 'auxiliary/derived data', 'auxiliary derived sidecar');
  includes(contract, 'sidecar-only', 'sidecar-only');
  includes(contract, '{itemId}:{answerId}:{highlightId}', 'composed sidecar key');
  matches(contract, /merge\s+additively at resolve time/s, 'additive merge');
  includes(contract, 'byte-identical to A2a', 'A2a parity rollback');
});

check('A2b sidecar forbids native highlight/key writes', () => {
  includes(contract, 'must never write native `h2o:prm:cgx:*` keys', 'forbid native h2o keys');
  matches(contract, /must never write native\s+highlight blobs/s, 'forbid native highlight blobs');
});

check('new Reader & Notes stores route through platform storage', () => {
  includes(contract, 'New Studio-local stores', 'new stores');
  includes(contract, 'H2O.Studio.platform.storage', 'platform storage');
  matches(contract, /future A2b sidecar and MVP-B note-doc\s+store/s, 'future stores');
});

check('raw storage APIs are forbidden for new Reader & Notes stores', () => {
  includes(contract, 'raw `chrome.*`', 'raw chrome forbidden');
  includes(contract, '`localStorage`', 'localStorage forbidden');
  includes(contract, 'direct `indexedDB`', 'indexedDB forbidden');
  includes(contract, 'grandfathered only', 'legacy grandfather note');
});

check('renderer fallback is legacy buildReaderDOM and never blank', () => {
  includes(contract, 'legacy `buildReaderDOM`', 'legacy buildReaderDOM');
  matches(contract, /must never\s+render a blank reader as fallback/s, 'never blank reader');
  includes(contract, 'A3 must not alter:', 'A3 exclusions');
  includes(contract, 'RibbonBridge', 'RibbonBridge exclusion');
  includes(contract, 'export bridges', 'export bridge exclusion');
  includes(contract, 'overlay wiring', 'overlay exclusion');
});

check('A1 facade scope is highlights notes bookmarks only', () => {
  includes(contract, 'MVP-A1 annotation facade covers only current Studio store-backed annotation', 'A1 facade heading');
  includes(contract, '- highlights', 'highlights kind');
  includes(contract, '- notes', 'notes kind');
  includes(contract, '- bookmarks', 'bookmarks kind');
  includes(contract, 'Sticky, margin, ink, and quote are future kinds', 'future kinds');
  includes(contract, 'exposes no write APIs', 'no write APIs');
});

check('category and labels remain structured pass-through data', () => {
  includes(contract, '`category` maps to the existing structured `CategoryRecord`', 'category structured');
  includes(contract, '`labels` maps to the existing structured `LabelAssignments`', 'labels structured');
  includes(contract, 'opaque structured pass-through', 'opaque pass-through');
  includes(contract, 'must not flatten structured metadata to `string` or `string[]`', 'no flattening');
});

check('feature flags default off and ship-disabled until validators pass', () => {
  includes(contract, 'feature-flagged, default off, and ship-disabled until', 'flag invariant');
  includes(contract, 'MVP-A0 adds no runtime feature flags', 'A0 no runtime flags');
  includes(contract, 'studio.readerNotes.rendererRegistry.enabled', 'future renderer flag');
});

check('MVP-A0 is documented as no runtime behavior change', () => {
  includes(contract, 'MVP-A0 only', 'A0 scope');
  includes(contract, 'introduces no runtime behavior change', 'no runtime behavior change');
  includes(adr, 'introduces no runtime behavior', 'ADR no runtime behavior');
});

check('A1/A2/A3/B are explicitly not implemented by A0', () => {
  for (const phase of ['MVP-A1', 'MVP-A2a', 'MVP-A2b', 'MVP-A3', 'MVP-B']) {
    includes(contract, `${phase} |`, `${phase} phase table`);
    includes(contract, 'Not implemented by A0', 'not implemented by A0');
  }
  includes(adr, 'typed `LibraryItem` runtime modules', 'ADR non-goal LibraryItem');
  includes(adr, 'annotation facade', 'ADR non-goal annotation facade');
  includes(adr, 'anchor resolver', 'ADR non-goal anchor resolver');
  includes(adr, 'sidecar storage', 'ADR non-goal sidecar');
  includes(adr, 'renderer registry', 'ADR non-goal renderer');
  includes(adr, '`native_note`', 'ADR non-goal native note');
});

check('protected lanes are documented', () => {
  for (const lane of [
    'Sync Architecture',
    'Chat Saving Architecture',
    'Capture/Saving Architecture',
    'Library Index / Chat Registry identity authority',
  ]) {
    includes(contract, lane, `protected lane ${lane}`);
  }
});

check('forbidden runtime areas are documented', () => {
  for (const rel of [
    'src-surfaces-base/studio/sync/**',
    'src-surfaces-base/studio/ingestion/**',
    'src-runtime-base/**',
    'apps/studio/desktop/src-tauri/**',
    'src-surfaces-base/studio/studio.js',
    'runtime stores',
  ]) {
    includes(contract, rel, `forbidden area ${rel}`);
  }
});

check('cross-contract surface docs point at Reader & Notes v1.2', () => {
  includes(highlights, 'Reader & Notes Architecture Contract v1.2', 'highlights contract link');
  includes(commandBar, 'Reader & Notes Architecture Contract v1.2', 'command bar contract link');
  includes(sideActions, 'Reader & Notes Architecture Contract v1.2', 'side actions contract link');
  matches(allDocs, /Command Bar is .*system\/debug\/recovery/s, 'command bar system/debug/recovery');
  matches(allDocs, /Side Actions\/Dock is .*user feature workflow/s, 'side actions user workflow');
});

if (fail.length) {
  console.log(`\nReader & Notes architecture contract v1.2 validation failed: ${fail.length} failed, ${pass.length} passed.`);
  process.exitCode = 1;
} else {
  console.log(`\nReader & Notes architecture contract v1.2 validation passed: ${pass.length} checks.`);
}
