#!/usr/bin/env node
// Validator for the M06 P4 T4.1 activation boundary.
//
// G02 passed, so the destructive core became reachable. This validator exists
// to pin exactly HOW MUCH became reachable: two commands, one New UI surface,
// no new renderer filesystem authority, and no third destructive route.
//
// It deliberately spans the activation boundary rather than one file, because
// that boundary IS the thing under test: the renderer surface, the Tauri
// command vocabulary, the capability files and the Legacy UI have to agree that
// exactly the approved authority exists. The read-only card behaviour itself
// stays with validate-studio-archive-health-ui.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..', '..', '..');

const RECLAIM_UI_REL = 'src-surfaces-base/studio/ingestion/saved-chat-reclamation-ui.studio.js';
const LIB_REL = 'apps/studio/desktop/src-tauri/src/lib.rs';
const CAPABILITY_RELS = [
  'apps/studio/desktop/src-tauri/capabilities/archive-cas.json',
  'apps/studio/desktop/src-tauri/capabilities/archive-export.json',
  'apps/studio/desktop/src-tauri/capabilities/default.json',
];

/* The exact authority Human Decision Authority approved at G02. */
const APPROVED_COMMANDS = [
  'h2o_archive_occupant_quarantine',
  'h2o_archive_reclamation_execute',
];
const EXPECTED_ARCHIVE_COMMANDS = [
  'h2o_archive_cas_repair_write',
  'h2o_archive_durable_temp_residue',
  'h2o_archive_durable_write',
  'h2o_archive_generation_abort',
  'h2o_archive_generation_begin',
  'h2o_archive_generation_commit',
  'h2o_archive_generation_write_member',
  'h2o_archive_occupant_quarantine',
  'h2o_archive_reclamation_execute',
  'h2o_archive_reclamation_preview',
  /* M07 commands already present at this checkpoint; none is reclamation
     mutation authority. Keep the exact-vocabulary seal current. */
  'h2o_archive_transport_handoff_begin',
  'h2o_archive_transport_handoff_end',
  'h2o_archive_transport_handoff_read',
];

const PASS = [];
const FAIL = [];
function check(label, fn) {
  try { fn(); PASS.push(label); console.log(`  ✓ ${label}`); }
  catch (e) { const m = e && e.message ? e.message : String(e); FAIL.push({ label, m }); console.log(`  ✗ ${label}`); console.log(`      ${m}`); }
}
async function checkAsync(label, fn) {
  try { await fn(); PASS.push(label); console.log(`  ✓ ${label}`); }
  catch (e) { const m = e && e.message ? e.message : String(e); FAIL.push({ label, m }); console.log(`  ✗ ${label}`); console.log(`      ${m}`); }
}
function readRepo(rel) { return fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'); }

const uiSrc = readRepo(RECLAIM_UI_REL);
const libSrc = readRepo(LIB_REL);

/* Boundary scans test CODE, not the prose that explains the boundary. */
function codeOf(src) {
  return src
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\/\*|\*)/.test(l))
    .join('\n');
}
const uiCode = codeOf(uiSrc);

/* A DOM stub just rich enough for the card. */
function domStub() {
  const make = (tag) => {
    const node = {
      tagName: String(tag).toUpperCase(),
      children: [], attributes: {}, style: {}, disabled: false, title: '',
      _text: '',
      set textContent(v) { this._text = String(v); this.children = []; },
      get textContent() { return this._text; },
      setAttribute(k, v) { this.attributes[k] = String(v); },
      getAttribute(k) { return this.attributes[k]; },
      appendChild(c) { this.children.push(c); return c; },
      addEventListener(kind, fn) { (this._listeners ||= {})[kind] = fn; },
      click() { const fn = this._listeners && this._listeners.click; if (fn) fn(); },
    };
    return node;
  };
  return { document: { createElement: make } };
}
function allText(node) {
  if (!node) return '';
  return [node._text || '', ...(node.children || []).map(allText)].join(' ');
}
function findByAction(node, action) {
  if (!node) return null;
  if (node.attributes && node.attributes['data-h2o-action'] === action) return node;
  for (const child of node.children || []) {
    const hit = findByAction(child, action);
    if (hit) return hit;
  }
  return null;
}
function loadUi(document) {
  const sandbox = { window: { document }, document, console };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(uiSrc, sandbox);
  return sandbox.window.H2O.Studio.reclamationUi;
}

const PREVIEW_FIXTURE = {
  schema: 'h2o.m06.reclamationPreview',
  schema_version: 1,
  sources: {
    package_scan_complete: true, package_scan_blockers: [],
    db_probe_complete: true, db_probe_blockers: [],
    cas_inventory_complete: true, cas_inventory_blockers: [],
  },
  plan: {
    schema: 'h2o.m06.reclamationPlan', schema_version: 1, complete: true, retention_floor: 3, blockers: [],
    totals: { chats_in_scope: 1, occupants: 3, protected: 1, candidates: 1, excluded: 1, referenced_cas_objects: 0 },
    decisions: [
      { path: 'archive/packages/chat_a.g' + 'aa'.repeat(32) + '.h2ochat', name: 'chat_a.g' + 'aa'.repeat(32) + '.h2ochat', chat_id: 'chat_a', content_hash: 'aa'.repeat(32), decision: 'candidate', evidence: { saved_at: '2026-01-01T00:00:00.000Z', family_rank: 4, retention_floor: 3, content_obsolete: true, current_projection_content_hash: 'bb'.repeat(32) } },
      { path: 'archive/packages/chat_a.g' + 'bb'.repeat(32) + '.h2ochat', name: 'chat_a.g' + 'bb'.repeat(32) + '.h2ochat', chat_id: 'chat_a', content_hash: 'bb'.repeat(32), decision: 'protected', reasons: ['newest-overall'] },
      /* The trusted engine marks exactly one row as the governed remedy class
         and supplies the identity; the damaged LEGACY row below classifies
         identically and is deliberately left unmarked. */
      { path: 'archive/packages/chat_x.g' + 'cc'.repeat(32) + '.h2ochat', name: 'chat_x.g' + 'cc'.repeat(32) + '.h2ochat', chat_id: '', content_hash: '', decision: 'excluded', reason: 'indeterminate', occupant_remedy: { chat_id: 'chat_x' } },
      { path: 'archive/packages/chat_leg.h2ochat', name: 'chat_leg.h2ochat', chat_id: '', content_hash: '', decision: 'excluded', reason: 'indeterminate' },
      { path: 'archive/packages/.h2o-genstage-a1', name: '.h2o-genstage-a1', chat_id: '', content_hash: '', decision: 'excluded', reason: 'reserved-infrastructure' },
    ],
    cas: { complete: true, observed: [], referenced: [], observed_unreferenced: ['sha256-' + 'ee'.repeat(32)], incomplete_reasons: [] },
  },
};
const DIAGNOSTICS_FIXTURE = {
  complete: true,
  packages: { entries: [{ chatId: 'chat_a' }] },
  residue: { complete: true, count: 0, entries: [] },
};
const RUN_OUTCOME = {
  schema: 'h2o.m06.reclamationRun', schema_version: 2, run_id: 'run-abc', state: 'partial',
  retention_floor: 3, blockers: ['execute-residue-not-authoritative'], acted: [],
  quarantined: 1, purged: 0, residue_acted: [],
  residue: { generation_staging_quarantined: 0, generation_staging_purged: 0, durable_temp_quarantined: 0, durable_temp_purged: 0 },
  residue_indeterminate: 0, recovered: 0,
};

console.log('[reclamation-activation]');

// ── 1 / 13. New UI only; Legacy UI gains nothing ───────────────────────────
check('1+13 Reclaim exists in the New UI only — Legacy UI gains no action', () => {
  assert.ok(uiCode.includes("'reclaim-archive'"), 'the New UI owns the Reclaim action');
  const legacyDir = path.join(REPO_ROOT, 'src-surfaces-base', 'studio');
  const legacyHits = [];
  for (const entry of fs.readdirSync(legacyDir)) {
    if (!entry.endsWith('.js') || entry.startsWith('studio.js')) continue;
    const src = fs.readFileSync(path.join(legacyDir, entry), 'utf8');
    for (const command of APPROVED_COMMANDS) {
      if (src.includes(command)) legacyHits.push(`${entry}:${command}`);
    }
  }
  assert.deepEqual(legacyHits, [], `no Legacy surface invokes a destructive command: ${legacyHits}`);
});

// ── 2 / 3 / 10. Analyze remains, does not auto-execute, and gates Reclaim ───
await checkAsync('2+3+10 Analyze does not auto-execute, and Reclaim needs a complete Analyze', async () => {
  const stub = domStub();
  const api = loadUi(stub.document);
  const calls = [];
  const container = stub.document.createElement('div');
  const handle = api.mountReclamationCard(container, {
    diagnose: async () => DIAGNOSTICS_FIXTURE,
    probeProjection: async () => ({ status: 'ok', contentHash: 'a'.repeat(64) }),
    invoke: async (cmd, args) => { calls.push({ cmd, args }); return PREVIEW_FIXTURE; },
    confirm: () => true,
  });
  assert.equal(calls.length, 0, 'mounting invokes nothing');
  assert.equal(handle.canReclaim(), false, 'Reclaim is disabled before Analyze');

  /* Before Analyze, execute must do nothing at all. */
  await handle.execute();
  assert.equal(calls.length, 0, 'Reclaim cannot run before a successful Analyze');

  await handle.analyze();
  assert.equal(calls.length, 1, 'Analyze invoked Preview exactly once');
  assert.equal(calls[0].cmd, 'h2o_archive_reclamation_preview');
  assert.equal(handle.canReclaim(), true, 'a complete Analyze arms Reclaim');
  /* Analyze did NOT execute. */
  assert.ok(!calls.some((c) => c.cmd === 'h2o_archive_reclamation_execute'), 'Analyze never auto-executes');

  /* No background scheduling anywhere. */
  for (const forbidden of ['setInterval', 'setTimeout', 'requestIdleCallback', 'requestAnimationFrame', 'DOMContentLoaded', 'onload']) {
    assert.ok(!uiCode.includes(forbidden), `no background execution: ${forbidden}`);
  }
});

// ── 3b. an INCOMPLETE or failed Analyze must not arm Reclaim ───────────────
await checkAsync('3b an incomplete or failed Analyze leaves Reclaim disabled', async () => {
  for (const [label, preview] of [
    ['incomplete', (() => { const p = JSON.parse(JSON.stringify(PREVIEW_FIXTURE)); p.plan.complete = false; return p; })()],
    ['sources-incomplete', (() => { const p = JSON.parse(JSON.stringify(PREVIEW_FIXTURE)); p.sources.db_probe_complete = false; return p; })()],
  ]) {
    const stub = domStub();
    const api = loadUi(stub.document);
    const container = stub.document.createElement('div');
    const handle = api.mountReclamationCard(container, {
      diagnose: async () => DIAGNOSTICS_FIXTURE,
      probeProjection: async () => ({ status: 'ok', contentHash: 'a'.repeat(64) }),
      invoke: async () => preview,
      confirm: () => true,
    });
    await handle.analyze();
    assert.equal(handle.canReclaim(), false, `${label} analysis must not arm Reclaim`);
  }
  /* And a THROWN analysis disarms it too. */
  const stub = domStub();
  const api = loadUi(stub.document);
  const container = stub.document.createElement('div');
  let fail = false;
  const handle = api.mountReclamationCard(container, {
    diagnose: async () => DIAGNOSTICS_FIXTURE,
    probeProjection: async () => ({ status: 'ok', contentHash: 'a'.repeat(64) }),
    invoke: async () => { if (fail) throw new Error('probe down'); return PREVIEW_FIXTURE; },
    confirm: () => true,
  });
  await handle.analyze();
  assert.equal(handle.canReclaim(), true);
  fail = true;
  await handle.analyze();
  assert.equal(handle.canReclaim(), false, 'a failed Analyze disarms Reclaim');
});

await checkAsync('3c actual snake_case Preview wire values render exactly and missing never defaults complete', async () => {
  const wire = JSON.parse(JSON.stringify(PREVIEW_FIXTURE));
  wire.plan.complete = false;
  wire.plan.blockers = ['plan-package-scan-incomplete'];
  wire.sources.package_scan_complete = false;
  wire.sources.package_scan_blockers = ['package-scan-packages-unreadable'];
  wire.sources.db_probe_complete = true;
  wire.sources.cas_inventory_complete = false;
  wire.sources.cas_inventory_blockers = ['cas-inventory-incomplete'];

  const stub = domStub();
  const api = loadUi(stub.document);
  const overview = api.formatPreviewOverview(wire);
  assert.equal(overview.sources.packageScanComplete, false);
  assert.equal(overview.sources.dbProbeComplete, true);
  assert.equal(overview.sources.casInventoryComplete, false);
  assert.equal(overview.complete, false);

  const missing = JSON.parse(JSON.stringify(wire));
  delete missing.sources.db_probe_complete;
  assert.equal(api.formatPreviewOverview(missing).sources.dbProbeComplete, false,
    'missing trusted completeness evidence must fail closed in presentation');

  const container = stub.document.createElement('div');
  const handle = api.mountReclamationCard(container, {
    diagnose: async () => DIAGNOSTICS_FIXTURE,
    probeProjection: async () => ({ status: 'ok', contentHash: 'a'.repeat(64) }),
    invoke: async () => wire,
    confirm: () => true,
  });
  await handle.analyze();
  const text = allText(container);
  assert.ok(text.includes('Package scan: incomplete'));
  assert.ok(text.includes('Database probe: complete'));
  assert.ok(text.includes('CAS inventory: incomplete'));
  assert.ok(text.includes('package-scan-packages-unreadable'));
  assert.equal(handle.canReclaim(), false);
});

// ── 4 / 5. execution invokes only the approved command, with no plan ────────
await checkAsync('4+5 Reclaim invokes only the approved command and sends no plan or path', async () => {
  const stub = domStub();
  const api = loadUi(stub.document);
  const calls = [];
  const container = stub.document.createElement('div');
  const handle = api.mountReclamationCard(container, {
    diagnose: async () => DIAGNOSTICS_FIXTURE,
    probeProjection: async () => ({ status: 'ok', contentHash: 'a'.repeat(64) }),
    invoke: async (cmd, args) => {
      calls.push({ cmd, args });
      return cmd === 'h2o_archive_reclamation_execute' ? RUN_OUTCOME : PREVIEW_FIXTURE;
    },
    confirm: () => true,
  });
  await handle.analyze();
  const staleCandidatePath = 'archive/packages/chat_a.g' + 'aa'.repeat(32) + '.h2ochat';
  assert.ok(allText(container).includes(staleCandidatePath), 'Analyze rendered the candidate row');
  await handle.execute();

  const exec = calls.filter((c) => c.cmd === 'h2o_archive_reclamation_execute');
  assert.equal(exec.length, 1, 'exactly one execute invocation');
  assert.deepEqual(Object.keys(exec[0].args.request), ['projections'], 'ONLY the enabling request');
  const payload = JSON.stringify(exec[0].args).toLowerCase();
  for (const forbidden of ['path', 'candidate', 'decision', 'runid', 'run_id', 'plan', 'force', 'retention', 'floor', 'sha256']) {
    assert.ok(!payload.includes(forbidden), `execute payload must not carry ${forbidden}`);
  }
  /* The confirmation is consumed: a second Reclaim needs a new Analyze. */
  assert.equal(handle.canReclaim(), false, 'confirmation does not persist');
  assert.equal(handle.getState().state, 'stale', 'a completed run invalidates the prior plan');
  assert.ok(!allText(container).includes(staleCandidatePath), 'old candidate rows are removed after execution');
  assert.ok(allText(container).includes('Run Analyze again'), 'the card requires a fresh read-only Analyze');
  await handle.execute();
  assert.equal(calls.filter((c) => c.cmd === 'h2o_archive_reclamation_execute').length, 1,
    'no second run without a new Analyze');
});

// ── explicit confirmation is REQUIRED ──────────────────────────────────────
await checkAsync('4b declining the confirmation performs no execution', async () => {
  const stub = domStub();
  const api = loadUi(stub.document);
  const calls = [];
  const container = stub.document.createElement('div');
  const handle = api.mountReclamationCard(container, {
    diagnose: async () => DIAGNOSTICS_FIXTURE,
    probeProjection: async () => ({ status: 'ok', contentHash: 'a'.repeat(64) }),
    invoke: async (cmd, args) => { calls.push({ cmd, args }); return PREVIEW_FIXTURE; },
    confirm: () => false,
  });
  await handle.analyze();
  await handle.execute();
  assert.ok(!calls.some((c) => c.cmd === 'h2o_archive_reclamation_execute'), 'a declined confirmation runs nothing');
  assert.equal(handle.canReclaim(), true, 'and leaves the armed state intact');
});

// ── 6. occupant action sends identity fields only ──────────────────────────
await checkAsync('6 the occupant action sends chatId + occupantName and nothing else', async () => {
  const stub = domStub();
  const api = loadUi(stub.document);
  const calls = [];
  const container = stub.document.createElement('div');
  const handle = api.mountReclamationCard(container, {
    diagnose: async () => DIAGNOSTICS_FIXTURE,
    probeProjection: async () => ({ status: 'ok', contentHash: 'a'.repeat(64) }),
    invoke: async (cmd, args) => {
      calls.push({ cmd, args });
      return cmd === 'h2o_archive_occupant_quarantine'
        ? { state: 'quarantined', occupantName: 'chat_x.g' + 'cc'.repeat(32) + '.h2ochat', classification: 'corrupt', quarantined: true, purged: false, dwell: 'one-run', blockers: [] }
        : PREVIEW_FIXTURE;
    },
    confirm: () => true,
  });
  await handle.analyze();
  const action = findByAction(container, 'quarantine-occupant');
  assert.ok(action, 'the governed remedy is offered on the indeterminate generation-path row');
  assert.equal(action.getAttribute('data-h2o-occupant'), 'chat_x.g' + 'cc'.repeat(32) + '.h2ochat');
  assert.ok(allText(container).includes('archive/packages/chat_a.g' + 'aa'.repeat(32) + '.h2ochat'),
    'Analyze candidate rows are visible before the action');
  /* The handler takes the TRUSTED ROW, so both halves of the payload come from
     Analyze output rather than from anything the renderer derived. */
  const trustedRow = api.formatDecisionRows(PREVIEW_FIXTURE)
    .find((r) => r.name === action.getAttribute('data-h2o-occupant'));
  await handle.quarantineOccupant(trustedRow);

  const occ = calls.filter((c) => c.cmd === 'h2o_archive_occupant_quarantine');
  assert.equal(occ.length, 1);
  assert.deepEqual(Object.keys(occ[0].args.request).sort(), ['chatId', 'occupantName']);
  assert.equal(occ[0].args.request.chatId, 'chat_x');
  assert.equal(handle.getState().state, 'stale', 'occupant action invalidates the prior plan');
  assert.ok(!allText(container).includes('archive/packages/chat_a.g' + 'aa'.repeat(32) + '.h2ochat'),
    'old Analyze rows are removed after the occupant action');
  assert.ok(allText(container).includes('Run Analyze again'));
  const payload = JSON.stringify(occ[0].args).toLowerCase();
  for (const forbidden of ['path', 'root', 'runid', 'run_id', 'destination', 'classification', 'force']) {
    assert.ok(!payload.includes(forbidden), `occupant payload must not carry ${forbidden}`);
  }
});

// ── 6a. the offered remedy is actually operable, not text-shaped ───────────
/* T4.2 shipped this control unusable: it WAS a real hint-gated <button> with a
   bound listener, but `studio.css` resets every button to
   `border:0;background:none;color:inherit`, and this one carried no style of
   its own — so inline among the monospace decision spans it rendered as
   ordinary text with no affordance, and the New-UI-only occupant action could
   not be exercised. Existence and wiring alone therefore do NOT prove the
   control is operable, which is exactly what the old pins asserted.

   This pin is deliberately structural, not cosmetic: it requires the element
   to still be a <button>, and to carry a presentation style that survives the
   global reset — a pointer affordance plus visible treatment. Exact colours,
   pixel values and property order are free. */
await checkAsync('6a the occupant remedy renders as an operable control under the global button reset', async () => {
  const stub = domStub();
  const api = loadUi(stub.document);
  const container = stub.document.createElement('div');
  const handle = api.mountReclamationCard(container, {
    diagnose: async () => DIAGNOSTICS_FIXTURE,
    probeProjection: async () => ({ status: 'ok', contentHash: 'a'.repeat(64) }),
    invoke: async () => PREVIEW_FIXTURE,
    confirm: () => false,
  });
  await handle.analyze();
  const action = findByAction(container, 'quarantine-occupant');
  assert.ok(action, 'the governed remedy is offered on the indeterminate row');
  assert.equal(String(action.tagName).toLowerCase(), 'button',
    'the remedy stays a real button element, never an anchor or a span');
  assert.equal(action.getAttribute('type'), 'button', 'it never submits');

  const style = String(action.getAttribute('style') || '');
  assert.ok(style.trim(), 'an unstyled button is invisible under the global reset');
  assert.ok(/cursor\s*:\s*pointer/i.test(style),
    'the control must present a pointer affordance');
  /* The global reset zeroes border and background, so at least one of them
     must be restored for the control to read as a control at all. */
  assert.ok(/border\s*:\s*(?!0)[^;]+/i.test(style) || /background\s*:\s*(?!none)[^;]+/i.test(style),
    'the control must restore a visible border or background over the reset');
  assert.ok(/padding\s*:/i.test(style), 'the control must be separated from adjacent row text');
});

// ── 6b. the remedy is offered ONLY where it is legitimate ──────────────────
check('6b the remedy is gated by the TRUSTED hint, with no filename fallback', () => {
  const api = loadUi(domStub().document);
  const rows = api.formatDecisionRows(PREVIEW_FIXTURE);
  const offered = api.occupantRemedyRows(rows).map((r) => r.name);
  assert.deepEqual(offered, ['chat_x.g' + 'cc'.repeat(32) + '.h2ochat'],
    'only the row the trusted engine marked');
  /* The legacy row is excluded/indeterminate with the SAME visible shape and is
     still not offered — which is only possible because the hint decides. */
  assert.ok(!offered.includes('chat_leg.h2ochat'), 'a legacy package is never offered');
  assert.ok(!offered.includes('.h2o-genstage-a1'), 'reserved infrastructure is never offered');

  /* NO FILENAME FALLBACK: strip the hint from a perfectly generation-shaped
     name and the control disappears. */
  const unhinted = JSON.parse(JSON.stringify(PREVIEW_FIXTURE));
  delete unhinted.plan.decisions[2].occupant_remedy;
  assert.equal(api.occupantRemedyRows(api.formatDecisionRows(unhinted)).length, 0,
    'a generation-shaped name without the trusted hint is NOT offered');

  /* And the identity comes from the hint, never from the name: a hint naming a
     different chat than the basename is followed verbatim. */
  const relabelled = JSON.parse(JSON.stringify(PREVIEW_FIXTURE));
  relabelled.plan.decisions[2].occupant_remedy = { chat_id: 'trusted_chat' };
  const row = api.formatDecisionRows(relabelled).find((r) => r.name.startsWith('chat_x.'));
  assert.equal(api.chatIdOfOccupant(row), 'trusted_chat', 'the identity is the trusted one');
  assert.equal(api.chatIdOfOccupant({ name: 'chat_leg.h2ochat' }), '', 'no hint, no identity');
});

/* THE BLOCKER FIX: the New UI owns no canonical package-name grammar. */
check('6c the New UI owns no .h2ochat / .g<hex> generation-name grammar', () => {
  for (const forbidden of [
    '.h2ochat', 'h2ochat', '[0-9a-f]{64}', '.g<', 'GENERATION_NAME',
    "split('.')", 'split(".")', 'lastIndexOf', 'substring(', 'substr(',
    'endsWith(', 'startsWith(', 'slice(0,', 'match(/',
  ]) {
    assert.ok(!uiSrc.includes(forbidden), `no package-name grammar in the New UI: ${forbidden}`);
  }
  /* No regex literal of ANY kind survives in this surface. */
  assert.equal((uiSrc.match(/=\s*\/[^/\n]+\/[gimsuy]*/g) || []).length, 0,
    'no regular expression is defined in the reclamation UI');
  /* Eligibility reads the trusted field and nothing else. */
  assert.ok(uiCode.includes('occupantRemedy'), 'the trusted hint is consumed');
  assert.ok(uiCode.includes('occupant_remedy'), 'read straight off the trusted row');
  const predicate = uiCode.slice(uiCode.indexOf('function occupantRemedyRows'));
  const body = predicate.slice(0, predicate.indexOf('\n  }'));
  assert.ok(body.includes('occupantRemedy'), 'the predicate is the hint');
  for (const forbidden of ['name', 'path', 'decision', 'reason', 'test(', 'exec(']) {
    assert.ok(!body.includes(forbidden), `the predicate must not consult ${forbidden}`);
  }
});

// ── 7 / 8. no stale-recovery and no CAS-destructive command or control ─────
check('7+8 no stale-recovery and no CAS-destructive command or control exists', () => {
  for (const forbidden of [
    'h2o_archive_recover', 'h2o_archive_stale', 'h2o_archive_purge', 'h2o_archive_delete',
    'h2o_archive_collect', 'h2o_archive_cas_reclaim', 'h2o_archive_cas_purge',
    'recover_and_record', 'recover_stale_quarantine', 'purge_quarantined_item',
    'purge_run', 'purge_all',
  ]) {
    assert.ok(!uiCode.includes(forbidden), `UI must not reference ${forbidden}`);
    assert.ok(!libSrc.includes(forbidden), `lib.rs must not register ${forbidden}`);
  }
  /* CAS stays analysis-only in the surface. */
  for (const forbidden of [/reclaim cas/i, /purge cas/i, /delete cas/i, /collect orphan/i, /free .*cas/i]) {
    assert.ok(!forbidden.test(uiSrc), `no CAS destructive offer: ${forbidden}`);
  }
  assert.ok(/Analysis only/.test(uiSrc), 'CAS is labelled analysis only');
});

// ── 9. no renderer archive remove/rename capability ────────────────────────
check('9 no renderer archive mutation capability was added', () => {
  const READ_ONLY = ['fs:allow-exists', 'fs:allow-read-file', 'fs:allow-read-text-file', 'fs:allow-lstat', 'fs:allow-read-dir'];
  let inspected = 0;
  for (const rel of CAPABILITY_RELS) {
    const value = JSON.parse(readRepo(rel));
    for (const entry of value.permissions || []) {
      if (!entry || typeof entry !== 'object' || !entry.identifier) continue;
      if (!JSON.stringify(entry.allow || []).includes('$APPLOCALDATA/archive')) continue;
      inspected += 1;
      assert.ok(READ_ONLY.includes(entry.identifier),
        `${entry.identifier} grants the renderer non-read authority over the archive`);
    }
  }
  assert.ok(inspected > 0, 'archive grants were actually inspected');
});

// ── 11. result states are not collapsed ────────────────────────────────────
await checkAsync('11 Refused / Partial / NoOp / Complete are rendered honestly', async () => {
  const api = loadUi(domStub().document);
  for (const [state, expected] of [['refused', 'refused'], ['partial', 'partial'], ['no-op', 'no-op'], ['complete', 'complete']]) {
    const view = api.formatRunOutcome({ ...RUN_OUTCOME, state });
    assert.equal(view.state, expected, `${state} must survive presentation`);
  }
  /* Blockers survive, and a partial run is never shown as a success. */
  const stub = domStub();
  const live = loadUi(stub.document);
  const container = stub.document.createElement('div');
  const handle = live.mountReclamationCard(container, {
    diagnose: async () => DIAGNOSTICS_FIXTURE,
    probeProjection: async () => ({ status: 'ok', contentHash: 'a'.repeat(64) }),
    invoke: async (cmd) => (cmd === 'h2o_archive_reclamation_execute' ? RUN_OUTCOME : PREVIEW_FIXTURE),
    confirm: () => true,
  });
  await handle.analyze();
  await handle.execute();
  const text = allText(container);
  assert.ok(text.includes('partial'), 'the partial state is shown');
  assert.ok(text.includes('execute-residue-not-authoritative'), 'blockers are shown');
  assert.ok(!/\bsuccess\b/i.test(text), 'a partial run is never relabelled a success');
});

// ── 12. occupant success reads as quarantine + dwell, never deletion ───────
await checkAsync('12 a quarantined occupant is reported as preserved, never deleted', async () => {
  const stub = domStub();
  const api = loadUi(stub.document);
  const container = stub.document.createElement('div');
  const handle = api.mountReclamationCard(container, {
    diagnose: async () => DIAGNOSTICS_FIXTURE,
    probeProjection: async () => ({ status: 'ok', contentHash: 'a'.repeat(64) }),
    invoke: async (cmd) => (cmd === 'h2o_archive_occupant_quarantine'
      ? { state: 'quarantined', occupantName: 'chat_x.g' + 'cc'.repeat(32) + '.h2ochat', classification: 'corrupt', quarantined: true, purged: false, dwell: 'one-run', blockers: [] }
      : PREVIEW_FIXTURE),
    confirm: () => true,
  });
  await handle.analyze();
  await handle.quarantineOccupant(
    api.formatDecisionRows(PREVIEW_FIXTURE).find((r) => r.name.startsWith('chat_x.')));
  const text = allText(container);
  assert.ok(/quarantined/i.test(text), 'the quarantined state is shown');
  assert.ok(/not deleted/i.test(text), 'the operator is told it was NOT deleted');
  for (const forbidden of [/was deleted/i, /has been deleted/i, /removed permanently/i, /freed/i]) {
    assert.ok(!forbidden.test(text), `dwell must not be described as deletion: ${forbidden}`);
  }
  /* A trusted refusal is presented honestly and never retried. */
  const stub2 = domStub();
  const api2 = loadUi(stub2.document);
  const container2 = stub2.document.createElement('div');
  const calls = [];
  const handle2 = api2.mountReclamationCard(container2, {
    diagnose: async () => DIAGNOSTICS_FIXTURE,
    probeProjection: async () => ({ status: 'ok', contentHash: 'a'.repeat(64) }),
    invoke: async (cmd) => {
      calls.push(cmd);
      return cmd === 'h2o_archive_occupant_quarantine'
        ? { state: 'refused', occupantName: 'x', blockers: ['occupant-is-a-verified-generation'], quarantined: false, purged: false, dwell: 'one-run' }
        : PREVIEW_FIXTURE;
    },
    confirm: () => true,
  });
  await handle2.analyze();
  await handle2.quarantineOccupant(
    api2.formatDecisionRows(PREVIEW_FIXTURE).find((r) => r.name.startsWith('chat_x.')));
  const text2 = allText(container2);
  assert.ok(text2.includes('refused'), 'the refusal is shown');
  assert.ok(text2.includes('occupant-is-a-verified-generation'), 'the reason is shown');
  assert.equal(calls.filter((c) => c === 'h2o_archive_occupant_quarantine').length, 1, 'no automatic retry');
});

// ── 14 / 15. the exact registered command vocabulary ──────────────────────
check('14+15 exactly two new destructive commands; raw purge and recovery stay unregistered', () => {
  const found = [...libSrc.matchAll(/h2o_archive_[a-z_]+/g)].map((m) => m[0]);
  const unique = [...new Set(found)].sort();
  assert.deepEqual(unique, EXPECTED_ARCHIVE_COMMANDS, 'the archive command vocabulary is exact');
  assert.equal(unique.length, 13, 'current archive vocabulary plus exactly two G02 destructive commands');
  for (const command of APPROVED_COMMANDS) {
    assert.equal((libSrc.match(new RegExp(command, 'g')) || []).length, 2,
      `${command} is registered in BOTH invoke-handler variants`);
  }
  assert.equal((libSrc.match(/macro_rules! h2o_studio_invoke_handler/g) || []).length, 2,
    'there are exactly two handler variants');
  /* Raw primitives and the recovery module are compiled but unreachable. */
  for (const module of ['archive_reclaim', 'archive_reclaim_recovery']) {
    assert.ok(libSrc.includes(`pub mod ${module};`), `${module} is compiled`);
    assert.ok(!libSrc.includes(`${module}::`), `${module} appears in no handler arm`);
  }
});

// ── the trusted command still re-derives and re-classifies ────────────────
check('6d the hint grants nothing — trusted Rust still re-classifies before acting', () => {
  const occupant = readRepo('apps/studio/desktop/src-tauri/src/archive_occupant_quarantine.rs');
  /* The sequence re-runs the T2.1 authority under exclusive ownership, and the
     hint is not consulted anywhere in the destructive path. */
  assert.ok(occupant.includes('scan_packages_within(archive_root)'), 're-scans under exclusive');
  assert.ok(occupant.includes('name_shape(&occupant.name)'), 're-derives the canonical identity');
  assert.ok(occupant.includes('OCCUPANT_IS_VALID'), 'a now-VALID target is refused');
  assert.ok(occupant.includes('OCCUPANT_IS_LEGACY'), 'a legacy target is refused');
  /* Spelled precisely: the SHARED predicate is named `is_occupant_remedy_class`
     and legitimately appears here, so a bare `occupant_remedy` would ban the
     very centralization this fix introduced. What must be absent is any use of
     the display HINT as input. */
  for (const forbidden of [
    'OccupantRemedyHint', '.occupant_remedy', 'occupant_remedy:', 'remedy_hint',
    'hint.chat_id', 'PreviewResult', 'preview_from_parts',
  ]) {
    assert.ok(!occupant.includes(forbidden), `the command must not trust the hint: ${forbidden}`);
  }
  /* And the eligibility rule has ONE owner, shared by hint and command. */
  const scan = readRepo('apps/studio/desktop/src-tauri/src/archive_package_scan.rs');
  assert.ok(scan.includes('pub fn is_occupant_remedy_class'), 'the rule lives beside the classifier');
  const plan = readRepo('apps/studio/desktop/src-tauri/src/archive_retention_plan.rs');
  assert.ok(plan.includes('reason.is_occupant_remedy_class()'), 'the hint asks that owner');
  assert.ok(occupant.includes('reason.is_occupant_remedy_class()'), 'the command asks that owner');
});

console.log('');
if (FAIL.length) {
  console.log(`[reclamation-activation] ${FAIL.length} failed, ${PASS.length} passed`);
  process.exit(1);
}
console.log(`[reclamation-activation] all ${PASS.length} checks passed`);
