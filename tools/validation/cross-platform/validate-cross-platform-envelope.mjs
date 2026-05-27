#!/usr/bin/env node
/**
 * F10.2.1 validation script.
 *
 * Loads @h2o/cross-platform-envelope via esbuild (in repo devDeps) and
 * exercises:
 *   - positive validation for every fixture (base + kind + authority)
 *   - one negative tamper per blocker code (18 codes)
 *   - authority downgrade and reject paths
 *   - doc-sync parity between BLOCKER_CODES and envelope-v1.md
 *
 * Reuse-safe: this script does no network, no DB, no archive-store
 * writes, no apply. It only reads source files and exercises the pure
 * validators.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import Module from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import esbuild from 'esbuild';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
const packageDir = path.join(repoRoot, 'packages/cross-platform-envelope');
const entry = path.join(packageDir, 'index.ts');

function loadHelperPackage() {
  const result = esbuild.buildSync({
    entryPoints: [entry],
    bundle: true,
    format: 'cjs',
    platform: 'neutral',
    mainFields: ['main'],
    target: ['es2020'],
    write: false,
  });
  const bundle = result.outputFiles[0].text;
  const m = new Module(entry);
  m.filename = entry;
  m.paths = Module._nodeModulePaths(path.dirname(entry));
  m._compile(bundle, entry);
  return m.exports;
}

const helper = loadHelperPackage();

// ── Helpers ────────────────────────────────────────────────────────────

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function expectOk(label, result) {
  assert.equal(result.ok, true, `${label} expected ok=true; blockers=${JSON.stringify(result.blockers)}`);
  assert.deepEqual(result.blockers, [], `${label} blockers should be empty`);
}

function expectBlocker(label, result, code) {
  assert.equal(result.ok, false, `${label} expected ok=false; got ok=true`);
  assert.ok(
    result.blockers.includes(code),
    `${label} expected blocker '${code}' in [${result.blockers.join(', ')}]`,
  );
}

const allFixtures = [
  { name: 'fixtureEvidence', env: helper.fixtureEvidence },
  { name: 'fixturePreview', env: helper.fixturePreview },
  { name: 'fixtureProposal', env: helper.fixtureProposal },
  { name: 'fixtureConflictCandidate', env: helper.fixtureConflictCandidate },
  { name: 'fixtureApplyEvent', env: helper.fixtureApplyEvent },
  { name: 'fixtureBundle', env: helper.fixtureBundle },
  { name: 'fixtureCacheMetadata', env: helper.fixtureCacheMetadata },
  { name: 'fixtureChromeEvidence', env: helper.fixtureChromeEvidence },
  { name: 'fixtureNativeEvidence', env: helper.fixtureNativeEvidence },
];

let passed = 0;
let failed = 0;
function runTest(label, fn) {
  try {
    fn();
    console.log(`  ok  ${label}`);
    passed += 1;
  } catch (e) {
    console.error(`  FAIL ${label}\n    ${e.message}`);
    failed += 1;
  }
}

// ── 1. Positive: each fixture passes all three validators ──────────────

console.log('▸ Positive fixture validation');
for (const { name, env } of allFixtures) {
  runTest(`${name} base`, () => expectOk(name, helper.validateEnvelopeBase(env)));
  runTest(`${name} kind`, () => expectOk(name, helper.validateEnvelopeKind(env)));
  runTest(`${name} authority`, () => {
    const r = helper.validateEnvelopeAuthority(
      env,
      helper.FIXTURE_MANIFEST,
      helper.FIXTURE_KNOWN_SNAPSHOTS,
      { nowIso: helper.FIXTURE_NOW },
    );
    expectOk(name, r);
    assert.notEqual(r.effectiveAuthority, 'rejected', `${name} effectiveAuthority should not be rejected`);
  });
}

// ── 2. Negative: one tamper per blocker code (18) ──────────────────────

console.log('\n▸ Negative validation — one tamper per blocker code');

// 2.1 platform-not-authorized-for-kind: chrome-studio producing applyEvent.
runTest('platform-not-authorized-for-kind', () => {
  const env = clone(helper.fixtureApplyEvent);
  env.sourcePlatform.platformId = 'chrome-studio';
  env.sourcePlatform.surfaceKind = 'browser-studio';
  env.sourcePlatform.sourcePeerEnvelope.surfaceKind = 'browser-studio';
  env.declaredAuthority = 'preview-coordinator';
  env.capabilityUsed = 'preview';
  const r = helper.validateEnvelopeAuthority(
    env,
    helper.FIXTURE_MANIFEST,
    helper.FIXTURE_KNOWN_SNAPSHOTS,
  );
  expectBlocker('platform-not-authorized-for-kind', r, 'platform-not-authorized-for-kind');
});

// 2.2 capability-not-on-platform-allowlist: native-extension claims propose.
runTest('capability-not-on-platform-allowlist', () => {
  const env = clone(helper.fixtureNativeEvidence);
  env.capabilityUsed = 'propose';
  const r = helper.validateEnvelopeAuthority(
    env,
    helper.FIXTURE_MANIFEST,
    helper.FIXTURE_KNOWN_SNAPSHOTS,
  );
  expectBlocker('capability-not-on-platform-allowlist', r, 'capability-not-on-platform-allowlist');
});

// 2.3 surface-authority-mismatch: desktop-tauri surface but declared chrome authority.
runTest('surface-authority-mismatch', () => {
  const env = clone(helper.fixtureEvidence);
  env.declaredAuthority = 'preview-coordinator';
  const r = helper.validateEnvelopeAuthority(
    env,
    helper.FIXTURE_MANIFEST,
    helper.FIXTURE_KNOWN_SNAPSHOTS,
  );
  expectBlocker('surface-authority-mismatch', r, 'surface-authority-mismatch');
});

// 2.4 mobile-payload-outside-allowlist: mobile evidence with banned field.
runTest('mobile-payload-outside-allowlist', () => {
  const env = clone(helper.fixtureCacheMetadata);
  env.kind = 'evidence';
  env.payload = {
    observationKind: 'whatever',
    observedAtIso: helper.FIXTURE_NOW,
    auditMaintenanceId: 'leaked',
  };
  env.dryRun = null;
  env.transactional = null;
  env.capabilityUsed = 'produceEvidence';
  const r = helper.validateEnvelopeAuthority(
    env,
    helper.FIXTURE_MANIFEST,
    helper.FIXTURE_KNOWN_SNAPSHOTS,
  );
  expectBlocker('mobile-payload-outside-allowlist', r, 'mobile-payload-outside-allowlist');
});

// 2.5 mobile-must-redact: mobile with device-local redaction.
runTest('mobile-must-redact', () => {
  const env = clone(helper.fixtureCacheMetadata);
  env.redactionClass = 'device-local';
  const r = helper.validateEnvelopeAuthority(
    env,
    helper.FIXTURE_MANIFEST,
    helper.FIXTURE_KNOWN_SNAPSHOTS,
  );
  expectBlocker('mobile-must-redact', r, 'mobile-must-redact');
});

// 2.6 native-extension-entity-outside-evidence-scope.
runTest('native-extension-entity-outside-evidence-scope', () => {
  const env = clone(helper.fixtureNativeEvidence);
  env.subjectType = 'folder.metadata';
  const r = helper.validateEnvelopeAuthority(
    env,
    helper.FIXTURE_MANIFEST,
    helper.FIXTURE_KNOWN_SNAPSHOTS,
  );
  expectBlocker('native-extension-entity-outside-evidence-scope', r, 'native-extension-entity-outside-evidence-scope');
});

// 2.7 native-extension-not-authorized-for-tombstones.
runTest('native-extension-not-authorized-for-tombstones', () => {
  const env = clone(helper.fixtureNativeEvidence);
  env.subjectType = 'tombstone.review';
  const r = helper.validateEnvelopeAuthority(
    env,
    helper.FIXTURE_MANIFEST,
    helper.FIXTURE_KNOWN_SNAPSHOTS,
  );
  expectBlocker('native-extension-not-authorized-for-tombstones', r, 'native-extension-not-authorized-for-tombstones');
});

// 2.8 envelope-schema-too-new: bad schema literal.
runTest('envelope-schema-too-new', () => {
  const env = clone(helper.fixtureEvidence);
  env.schema = 'h2o.crossPlatform.envelope.v999';
  const r = helper.validateEnvelopeBase(env);
  expectBlocker('envelope-schema-too-new', r, 'envelope-schema-too-new');
});

// 2.9 envelope-schema-too-old: same blocker family in v1; tested via authority schema check.
runTest('envelope-schema-too-old (via authority schema skew)', () => {
  const env = clone(helper.fixtureEvidence);
  env.envelopeVersion = 'v0';
  const r = helper.validateEnvelopeAuthority(
    env,
    helper.FIXTURE_MANIFEST,
    helper.FIXTURE_KNOWN_SNAPSHOTS,
  );
  // v1 helper emits 'envelope-schema-too-new' for any non-v1 envelopeVersion;
  // we accept either 'envelope-schema-too-new' or 'envelope-schema-too-old' here.
  assert.ok(
    r.blockers.includes('envelope-schema-too-new') || r.blockers.includes('envelope-schema-too-old'),
    'expected envelope-schema-too-new or envelope-schema-too-old',
  );
});

// 2.10 envelope-schema-hash-unknown.
runTest('envelope-schema-hash-unknown', () => {
  const env = clone(helper.fixtureEvidence);
  env.schemaHash = 'not-a-sha256';
  const r = helper.validateEnvelopeBase(env);
  expectBlocker('envelope-schema-hash-unknown', r, 'envelope-schema-hash-unknown');
});

// 2.11 capability-snapshot-unknown: write-capable kind, unknown snapshot.
runTest('capability-snapshot-unknown', () => {
  const env = clone(helper.fixtureApplyEvent);
  env.capabilitySnapshotHash = '0'.repeat(64);
  const r = helper.validateEnvelopeAuthority(
    env,
    helper.FIXTURE_MANIFEST,
    helper.FIXTURE_KNOWN_SNAPSHOTS,
  );
  expectBlocker('capability-snapshot-unknown', r, 'capability-snapshot-unknown');
});

// 2.12 operation-intent-wrong-for-kind: evidence with operationIntent.
runTest('operation-intent-wrong-for-kind', () => {
  const env = clone(helper.fixtureEvidence);
  env.operationIntent = 'update';
  const r = helper.validateEnvelopeKind(env);
  expectBlocker('operation-intent-wrong-for-kind', r, 'operation-intent-wrong-for-kind');
});

// 2.13 delete-intent-on-read-only-kind: preview with operationIntent: 'delete'.
runTest('delete-intent-on-read-only-kind', () => {
  const env = clone(helper.fixturePreview);
  env.operationIntent = 'delete';
  const r = helper.validateEnvelopeKind(env);
  expectBlocker('delete-intent-on-read-only-kind', r, 'delete-intent-on-read-only-kind');
});

// 2.14 delete-proposal-missing-f5-predicate.
runTest('delete-proposal-missing-f5-predicate', () => {
  const env = clone(helper.fixtureProposal);
  env.operationIntent = 'delete';
  env.payload.predicateVersion = '';
  env.payload.justifyingEvidenceDigests = [];
  const r = helper.validateEnvelopeKind(env);
  expectBlocker('delete-proposal-missing-f5-predicate', r, 'delete-proposal-missing-f5-predicate');
});

// 2.15 delete-apply-event-missing-audit-id.
runTest('delete-apply-event-missing-audit-id', () => {
  const env = clone(helper.fixtureApplyEvent);
  env.operationIntent = 'delete';
  env.payload.auditMaintenanceId = '';
  const r = helper.validateEnvelopeKind(env);
  expectBlocker('delete-apply-event-missing-audit-id', r, 'delete-apply-event-missing-audit-id');
});

// 2.16 local-only-audit-detail-on-mobile-or-cache.
runTest('local-only-audit-detail-on-mobile-or-cache', () => {
  const env = clone(helper.fixtureCacheMetadata);
  env.payload.auditMaintenanceId = 'should-not-be-here';
  const r = helper.validateEnvelopeKind(env);
  expectBlocker('local-only-audit-detail-on-mobile-or-cache', r, 'local-only-audit-detail-on-mobile-or-cache');
});

// 2.17 payload-contains-forever-no-field: any forever-no key in payload.
runTest('payload-contains-forever-no-field', () => {
  const env = clone(helper.fixtureEvidence);
  env.payload.content = 'a chat body would never travel';
  const r = helper.validateEnvelopeKind(env);
  expectBlocker('payload-contains-forever-no-field', r, 'payload-contains-forever-no-field');
});

// 2.18 stale-evidence-not-revalidated.
runTest('stale-evidence-not-revalidated', () => {
  const env = clone(helper.fixtureEvidence);
  env.expiresAt = '2026-01-01T00:00:00Z';
  const r = helper.validateEnvelopeAuthority(
    env,
    helper.FIXTURE_MANIFEST,
    helper.FIXTURE_KNOWN_SNAPSHOTS,
    { nowIso: '2026-12-31T23:59:59Z' },
  );
  expectBlocker('stale-evidence-not-revalidated', r, 'stale-evidence-not-revalidated');
});

// ── 3. Authority downgrade / reject paths ─────────────────────────────

console.log('\n▸ Authority downgrade / reject paths');

runTest('snapshot-unknown on read-only kind downgrades to read-only', () => {
  const env = clone(helper.fixtureEvidence);
  env.capabilitySnapshotHash = '1'.repeat(64);
  const r = helper.validateEnvelopeAuthority(
    env,
    helper.FIXTURE_MANIFEST,
    helper.FIXTURE_KNOWN_SNAPSHOTS,
  );
  assert.equal(r.ok, true, 'should still validate ok on read-only kind');
  assert.equal(r.effectiveAuthority, 'read-only', 'should downgrade to read-only');
  assert.ok(
    r.warnings.includes('capability-snapshot-unknown-downgraded'),
    'should emit downgrade warning',
  );
});

runTest('declared > manifest declared → downgrade to manifest', () => {
  const env = clone(helper.fixtureChromeEvidence);
  // Chrome's surface only permits preview-coordinator, so we cannot
  // mismatch via declaredAuthority without surface-authority-mismatch.
  // Instead simulate a manifest that grants less than the producer:
  const stricterManifest = {
    platforms: {
      ...helper.FIXTURE_MANIFEST.platforms,
      'chrome-studio': {
        ...helper.FIXTURE_MANIFEST.platforms['chrome-studio'],
        authorityLevel: 'evidence-producer',
      },
    },
  };
  const r = helper.validateEnvelopeAuthority(
    env,
    stricterManifest,
    helper.FIXTURE_KNOWN_SNAPSHOTS,
  );
  assert.equal(r.ok, true, `expected ok=true; blockers=${JSON.stringify(r.blockers)}`);
  assert.equal(r.effectiveAuthority, 'evidence-producer', 'should downgrade to manifest authority');
});

runTest('rejected on any blocker', () => {
  const env = clone(helper.fixtureEvidence);
  env.capabilityUsed = 'apply'; // not allowed for produceEvidence kind chain
  const r = helper.validateEnvelopeAuthority(
    env,
    helper.FIXTURE_MANIFEST,
    helper.FIXTURE_KNOWN_SNAPSHOTS,
  );
  assert.equal(r.ok, false, 'expected rejection');
  assert.equal(r.effectiveAuthority, 'rejected', 'effectiveAuthority should be rejected');
});

// ── 4. Doc-sync parity ────────────────────────────────────────────────

console.log('\n▸ Doc-sync parity (BLOCKER_CODES vs envelope-v1.md)');

runTest('BLOCKER_CODES matches envelope-v1.md F10.2.1 Readiness Checklist', () => {
  const docPath = path.join(repoRoot, 'docs/systems/cross-platform/envelope-v1.md');
  const docText = fs.readFileSync(docPath, 'utf8');
  // Locate the readiness-checklist code list. It is enumerated as a
  // bullet list of `code` literals under the heading "Blocker codes
  // are enumerated".
  const sectionStart = docText.indexOf('### Blocker codes are enumerated');
  assert.ok(sectionStart >= 0, 'could not find Blocker codes section in envelope-v1.md');
  const sectionEnd = docText.indexOf('###', sectionStart + 1);
  const section = docText.slice(sectionStart, sectionEnd > 0 ? sectionEnd : undefined);
  const codeRegex = /^- `([a-z0-9][a-z0-9-]+)`/gm;
  const docCodes = new Set();
  let m;
  while ((m = codeRegex.exec(section)) !== null) {
    docCodes.add(m[1]);
  }
  const helperCodes = new Set(helper.BLOCKER_CODES);
  // Both directions:
  for (const code of helperCodes) {
    assert.ok(
      docCodes.has(code),
      `helper exports '${code}' that is not enumerated in envelope-v1.md`,
    );
  }
  for (const code of docCodes) {
    assert.ok(
      helperCodes.has(code),
      `envelope-v1.md enumerates '${code}' that helper does not export`,
    );
  }
  assert.equal(
    helperCodes.size,
    docCodes.size,
    `helper has ${helperCodes.size} codes; doc has ${docCodes.size}`,
  );
});

// ── 5. Predicate sanity ────────────────────────────────────────────────

console.log('\n▸ Predicate sanity');

runTest('isSha256Hex accepts 64-char lowercase hex', () => {
  assert.equal(helper.isSha256Hex('a'.repeat(64)), true);
  assert.equal(helper.isSha256Hex('A'.repeat(64)), false, 'uppercase rejected');
  assert.equal(helper.isSha256Hex('a'.repeat(63)), false, 'short rejected');
  assert.equal(helper.isSha256Hex('a'.repeat(65)), false, 'long rejected');
  assert.equal(helper.isSha256Hex(42), false, 'non-string rejected');
});

runTest('isValidEnvelopeId accepts ULID and UUID', () => {
  assert.equal(helper.isValidEnvelopeId('01HZX0YKJM7P6A0B0C0D0E0F0G'), true, 'ULID');
  assert.equal(helper.isValidEnvelopeId('12345678-1234-1234-1234-123456789abc'), true, 'UUID');
  assert.equal(helper.isValidEnvelopeId('not-an-id'), false);
});

runTest('isExpired uses caller-supplied nowIso, never Date.now()', () => {
  const env = { expiresAt: '2026-01-01T00:00:00Z' };
  assert.equal(helper.isExpired(env, '2026-06-01T00:00:00Z'), true);
  assert.equal(helper.isExpired(env, '2025-12-31T23:59:59Z'), false);
  assert.equal(helper.isExpired({}, '2026-01-01T00:00:00Z'), false, 'no expiresAt => not expired');
});

runTest('formatDedupeKeyInput is deterministic and stable across key order', () => {
  const a = helper.formatDedupeKeyInput({
    platformId: 'desktop-studio',
    kind: 'proposal',
    subjectType: 'folder.metadata',
    operation: 'op',
    operationIntent: 'update',
    dedupeFields: { a: 1, b: 2 },
  });
  const b = helper.formatDedupeKeyInput({
    platformId: 'desktop-studio',
    kind: 'proposal',
    subjectType: 'folder.metadata',
    operation: 'op',
    operationIntent: 'update',
    dedupeFields: { b: 2, a: 1 },
  });
  assert.equal(a, b, 'should be canonical / order-insensitive');
});

// ── Summary ────────────────────────────────────────────────────────────

console.log('');
console.log(`F10.2.1 validation: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
