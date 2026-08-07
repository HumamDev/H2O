#!/usr/bin/env node
// Static source invariants for Prompt Manager (7A1a) — Phase 1.
//
// Guards the properties that no runtime harness can see: that the removed
// SortableJS integration stays removed, that the two search panes keep distinct
// identifiers, that the version constant and the metadata header cannot drift
// (a comment cannot interpolate a constant, so only a check can pair them),
// that the public contract other modules depend on is intact, and that the
// public API no longer drives panel state by synthesising a button click.
//
// Deliberately narrow on the Sortable checks: the exact CDN directive and the
// active integration, NOT the bare token `@require` (unrelated metadata must
// never trip this) and NOT prose mentions in explanatory comments.

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..', '..', '..');
const MODULE_REL = 'src-runtime-base/7A1a.⬜️✍️ Prompt Manager ✍️.js';

// The migration-safety pass must not touch the reorder validator. Pinning its
// digest here makes an accidental edit a hard failure rather than a silent one.
const PINNED_REORDER_SHA256 = 'b98828ae27d871fd69d65ca17633619a922d5ec4e26196ab1f81ac15e1d4a902';

// The quarantine implementation passed independent review and is explicitly out
// of scope for the identity-collision pass. Pinning the digest of that exact
// block makes any drift a hard failure.
const PINNED_QUARANTINE_SHA256 = '6c7c001165d5b3c9bf7b49ee724716e9df3f2e1b57f05ef1e26698e3fd3849ad';

const SRC = fs.readFileSync(path.join(REPO_ROOT, MODULE_REL), 'utf8');

const PASS = [];
const FAIL = [];
function check(label, fn) {
  try { fn(); PASS.push(label); console.log(`  ✓ ${label}`); }
  catch (e) {
    const m = e && e.message ? e.message : String(e);
    FAIL.push({ label, m });
    console.log(`  ✗ ${label}`);
    console.log(`      ${m}`);
  }
}

// Source with block and line comments stripped, for "is this ACTIVE code?"
// questions. Crude but sufficient: this file has no regex literals or strings
// that could be mistaken for comment delimiters in a way that matters here.
const CODE = SRC
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .map(l => l.replace(/^\s*\/\/.*$/, ''))
  .join('\n');

function main() {
  console.log('── Prompt Manager 7A1a source invariants (Phase 1) ──────');

  check('the SortableJS @require directive is gone', () => {
    assert.doesNotMatch(
      SRC, /@require\s+\S*sortablejs/i,
      'the sortablejs @require directive is back',
    );
    assert.doesNotMatch(
      SRC, /cdn\.jsdelivr\.net\/npm\/sortablejs/i,
      'the sortablejs CDN URL is back',
    );
  });

  check('no active Sortable integration remains', () => {
    assert.doesNotMatch(CODE, /\bSortable\.create\b/, 'Sortable.create() call found');
    assert.doesNotMatch(CODE, /\b[WD]\.Sortable\b/, 'window.Sortable reference found');
    assert.doesNotMatch(CODE, /\bwindow\.Sortable\b/, 'window.Sortable reference found');
    assert.doesNotMatch(CODE, /\bSORT_PM\b/, 'the SORT_PM object is back');
    assert.doesNotMatch(CODE, /sortable-ghost/, 'sortable ghost class still styled');
    assert.doesNotMatch(CODE, /STATE_PM\.sortable/, 'sortable state field is back');
  });

  check('no unbounded Sortable retry chain remains', () => {
    assert.doesNotMatch(CODE, /initEditSortable|initQuickSortable|setQuickReorderMode/,
      'a Sortable init/retry entry point is back');
  });

  check('unrelated metadata directives are untouched', () => {
    // The Sortable checks above must not have been implemented as a blanket
    // "no @require anywhere" rule; prove the header still carries its others.
    for (const d of ['@h2o-id', '@name', '@version', '@match', '@run-at', '@grant']) {
      assert.match(SRC, new RegExp(`^// ${d}\\b`, 'm'), `metadata directive ${d} missing`);
    }
  });

  check('Simple and Edit search identifiers are distinct', () => {
    assert.match(CODE, /const UI_PM_SEARCH_SIMPLE\s*=/, 'UI_PM_SEARCH_SIMPLE missing');
    assert.match(CODE, /const UI_PM_SEARCH_EDIT\s*=/, 'UI_PM_SEARCH_EDIT missing');

    const simple = (SRC.match(/\$\{UI_PM_SEARCH_SIMPLE\}/g) || []).length;
    const edit = (SRC.match(/\$\{UI_PM_SEARCH_EDIT\}/g) || []).length;
    assert.equal(simple, 1, `expected exactly one Simple search input, found ${simple}`);
    assert.equal(edit, 1, `expected exactly one Edit search input, found ${edit}`);
  });

  check('the old shared search identifier is gone', () => {
    assert.doesNotMatch(CODE, /\bUI_PM_SEARCH\b(?!_)/, 'the shared UI_PM_SEARCH token is back');
    assert.doesNotMatch(SRC, /data-cgxui="prmn-search"/, 'literal duplicate search markup found');
    // The rendered attribute values must differ.
    assert.match(CODE, /`\$\{SkID\}-search-simple`/, 'simple search token value missing');
    assert.match(CODE, /`\$\{SkID\}-search-edit`/, 'edit search token value missing');
  });

  check('there is one canonical search query owner', () => {
    assert.match(CODE, /searchQuery:\s*''/, 'STATE_PM.ui.searchQuery missing');
    assert.match(CODE, /const SEARCH_PM\s*=/, 'SEARCH_PM helper missing');
    assert.doesNotMatch(CODE, /search\?\.value/, 'a DOM input is still treated as the query owner');
  });

  check('MOD_VERSION exists and matches the @version header', () => {
    const constMatch = SRC.match(/const MOD_VERSION\s*=\s*'([^']+)'/);
    assert.ok(constMatch, 'MOD_VERSION constant missing');
    const headerMatch = SRC.match(/^\/\/ @version\s+(\S+)\s*$/m);
    assert.ok(headerMatch, '@version metadata line missing');
    assert.equal(
      constMatch[1], headerMatch[1],
      `MOD_VERSION (${constMatch[1]}) must equal the @version header (${headerMatch[1]})`,
    );
  });

  check('the ready event detail uses MOD_VERSION, not a literal', () => {
    const detail = SRC.match(/const detail\s*=\s*\{[^}]*\}/);
    assert.ok(detail, 'ready-event detail object not found');
    assert.match(detail[0], /v:\s*MOD_VERSION/, 'ready detail must carry MOD_VERSION');
    assert.doesNotMatch(detail[0], /v:\s*'[\d.]+'/, 'ready detail still carries a hard-coded version');
  });

  check('all six public API methods remain exported', () => {
    for (const m of ['open', 'close', 'toggle', 'isOpen', 'focusSearch', 'toggleQuickTray']) {
      assert.match(
        CODE, new RegExp(`MOD_OBJ\\.api\\.${m}\\s*=`),
        `public API method ${m} is no longer published`,
      );
    }
  });

  check('both publication surfaces remain', () => {
    assert.match(CODE, /MOD_OBJ\.api\s*=/, 'H2O.PM.prmptmngr.api surface missing');
    assert.match(CODE, /W\.H2O\.PromptManager/, 'W.H2O.PromptManager surface missing');
    assert.match(CODE, /Object\.assign\(W\.H2O\.PromptManager,\s*MOD_OBJ\.api\)/,
      'the PromptManager alias no longer mirrors the API');
  });

  check('canonical and legacy event names both remain', () => {
    for (const ev of [
      'evt:h2o:promptmgr:ready',
      'evt:h2o:promptmgr:changed',
      'evt:h2o:pm:ready:v1',      // Control Hub (0Z1n) listens to THIS one
      'evt:h2o:pm:changed:v1',
    ]) {
      assert.ok(SRC.includes(`'${ev}'`), `event name ${ev} missing`);
    }
    // Both families must actually be emitted, not merely declared.
    assert.match(CODE, /UTIL_event\.emit\(EV_PM_READY_V1/, 'canonical ready not emitted');
    assert.match(CODE, /UTIL_event\.emit\(EV_PM_READY_LEGACY_V1/, 'legacy ready not emitted');
    assert.match(CODE, /UTIL_event\.emit\(EV_PM_CHANGED_V1/, 'canonical changed not emitted');
    assert.match(CODE, /UTIL_event\.emit\(EV_PM_CHANGED_LEGACY_V1/, 'legacy changed not emitted');
  });

  check('primary storage key names are unchanged', () => {
    const expected = [
      ':state:prompts:v1',
      ':cfg:auto_send:v1',
      ':state:last_used_id:v1',
      ':state:quick_replies:v1',
      ':state:history:v1',
      ':state:drafts:v1',
      ':state:pasted:v1',
      ':ui:mode:v1',
      ':migrate:pm_keys:v1',
      ':migrate:pm_drafts_from_history:v1',
    ];
    for (const suffix of expected) {
      assert.ok(SRC.includes(`\${NS_DISK}${suffix}`), `storage key ${suffix} was renamed or removed`);
    }
    assert.ok(SRC.includes('h2o:${SUITE}:${HOST}:${DsID}'), 'the storage namespace changed');
    // The one addition this phase is allowed to make.
    assert.ok(SRC.includes('${NS_DISK}:state:seeded:v1'), 'the seed marker key is missing');
  });

  check('the public API no longer changes panel state via btn.click()', () => {
    const apiRegion = CODE.slice(CODE.indexOf('function API_PM_findRoot'));
    assert.ok(apiRegion.length > 0, 'public API region not found');
    assert.doesNotMatch(apiRegion, /btn\.click\(\)/, 'a public API method still synthesises a button click');
    for (const fn of ['API_PM_open', 'API_PM_close', 'API_PM_toggle']) {
      assert.match(apiRegion, new RegExp(`function ${fn}\\b`), `${fn} missing`);
    }
    assert.match(apiRegion, /UI_PM_openPanel\(/, 'API must call the real open function');
    assert.match(apiRegion, /UI_PM_closePanel\(/, 'API must call the real close function');
  });

  check('focusSearch verifies focus instead of returning unconditional success', () => {
    const fn = CODE.match(/function API_PM_focusSearch\(\)\s*\{[\s\S]*?\n  \}/);
    assert.ok(fn, 'API_PM_focusSearch not found');
    assert.match(fn[0], /SEARCH_PM\.activeInput\(/, 'must resolve the input for the current mode');
    assert.match(fn[0], /D\.activeElement === el/, 'must verify that focus actually landed');
  });

  check('one function owns open class, inert, aria-hidden and overlay together', () => {
    const fn = CODE.match(/const UI_PM_applyPanelState[\s\S]*?\}, false\);/);
    assert.ok(fn, 'UI_PM_applyPanelState not found');
    assert.match(fn[0], /classList\.toggle\(UI_PM_CLS_OPEN/, 'must drive the open class');
    assert.match(fn[0], /setAttribute\('aria-hidden'/, 'must drive aria-hidden');
    assert.match(fn[0], /removeAttribute\('inert'\)/, 'must clear inert when open');
    assert.match(fn[0], /setAttribute\('inert'/, 'must set inert when closed');
    assert.match(fn[0], /UI_PM_CLS_OVSHOW/, 'must drive the overlay');
  });

  check('the closed panel is inert in markup and hidden in CSS', () => {
    assert.match(SRC, /UI_PM_PANEL\}"[^>]*aria-hidden="true" inert>/,
      'the panel must start inert and aria-hidden in the mounted markup');
    assert.match(SRC, /visibility: hidden;/, 'closed-panel visibility fallback missing');
    assert.match(SRC, /visibility: visible;/, 'open-panel visibility restore missing');
  });

  check('the panel uses the theme text variable, not a hard-coded colour', () => {
    assert.match(SRC, /color: var\(--cgxui-\$\{SkID\}-text\);/, 'panel must use the text variable');
    assert.doesNotMatch(SRC, /color: \$\{CFG_PM\.GLASS_TEXT\};/, 'panel still hard-codes GLASS_TEXT');
  });

  check('theme authority reads the host root class with a narrow observer', () => {
    const detect = CODE.match(/const UI_PM_detectHostTheme[\s\S]*?\n  \}, ''\);/);
    assert.ok(detect, 'UI_PM_detectHostTheme not found');
    assert.match(detect[0], /documentElement\??\.classList/, 'must read the host root element class list');
    assert.match(detect[0], /\.contains\('dark'\)/, 'must detect the host dark-theme class');

    assert.match(CODE, /attributeFilter:\s*\['class'\]/, 'theme observer must be scoped to class only');
    assert.match(CODE, /observe\(rootEl,\s*\{\s*attributes: true/, 'theme observer must target the root element');
    assert.match(CODE, /ATTR_CGXUI_THEME/, 'owned theme token missing');
    assert.match(CODE, /PM_THEME_OBS\?\.disconnect\?\.\(\)/, 'theme observer must be registered for cleanup');
    // prefers-color-scheme must survive as the fallback, not be removed outright.
    assert.match(SRC, /@media \(prefers-color-scheme: light\)/, 'media-query fallback removed');
  });

  // ── Correction 4 ──────────────────────────────────────────────────────────
  check('light is the default once the host root is readable (no light class required)', () => {
    const detect = CODE.match(/const UI_PM_detectHostTheme[\s\S]*?\n  \}, ''\);/);
    assert.ok(detect, 'UI_PM_detectHostTheme not found');
    const body = detect[0];

    // The whole authority must reduce to: unreadable -> '', else dark ? dark : light.
    assert.match(body, /return cl\.contains\('dark'\) \? 'dark' : 'light';/,
      "must resolve to 'light' whenever the root is readable and lacks the dark class");
    assert.doesNotMatch(body, /contains\('light'\)/,
      "must NOT require an explicit 'light' class — nothing proves ChatGPT always emits one, " +
      'and requiring it silently falls back to the OS preference');

    // The media-query fallback must be reachable ONLY when the root is unreadable.
    assert.match(body, /if \(!cl[^)]*\) return '';/,
      'an unreadable root must be the only path that defers to prefers-color-scheme');
  });

  // ── Correction 3 ──────────────────────────────────────────────────────────
  check('the lazily created tooltip is themed at creation time', () => {
    const fn = CODE.match(/ensureTooltip\(\)\s*\{[\s\S]*?\n    \},/);
    assert.ok(fn, 'UI_PM.ensureTooltip not found');
    assert.match(fn[0], /UI_PM_applyThemeToEl\(tip\)/,
      'the tooltip must be stamped with the host theme when it is created, not on the ' +
      'next root-class mutation');
    // Applied before the node is mounted, so it never paints unthemed.
    assert.ok(fn[0].indexOf('UI_PM_applyThemeToEl(tip)') < fn[0].indexOf('appendChild(tip)'),
      'the theme must be applied before the tooltip is appended to the document');
    assert.doesNotMatch(fn[0], /UI_PM_applyTheme\(\)/,
      'ensureTooltip must use the single-element helper, not the full sweep (which ' +
      'resolves the tooltip itself and would invite recursion)');
  });

  check('the single-element theme helper is flat (no recursion between helpers)', () => {
    const one = CODE.match(/const UI_PM_applyThemeToEl[\s\S]*?\n  \}, ''\);/);
    assert.ok(one, 'UI_PM_applyThemeToEl not found');
    assert.doesNotMatch(one[0], /UI_PM_applyTheme\(\)/, 'the per-element helper must not call the sweep');
    assert.doesNotMatch(one[0], /ensureTooltip/, 'the per-element helper must not create nodes');
    assert.match(one[0], /setAttribute\(ATTR_CGXUI_THEME/, 'must stamp the owned theme token');

    const sweep = CODE.match(/const UI_PM_applyTheme = [\s\S]*?\n  \}, ''\);/);
    assert.ok(sweep, 'UI_PM_applyTheme not found');
    assert.match(sweep[0], /UI_PM_applyThemeToEl\(el, theme\)/,
      'the sweep must delegate to the per-element helper with the already-detected theme');
  });

  check('the paste-capture whole-composer fallback is gone', () => {
    const fn = CODE.match(/attachPastedCapture\(\)\s*\{[\s\S]*?\n    \},/);
    assert.ok(fn, 'attachPastedCapture not found');
    assert.match(fn[0], /clipboardData/, 'the primary clipboard path must remain');
    assert.doesNotMatch(fn[0], /setTimeout/, 'no fallback timer may remain in the paste path');
    assert.doesNotMatch(fn[0], /innerText/, 'the paste path must not read composer content back');
  });

  check('timer bookkeeping is Set-based with owned wrappers', () => {
    assert.match(CODE, /timers:\s*new Set\(\)/, 'one-shot timer Set missing');
    assert.match(CODE, /intervals:\s*new Set\(\)/, 'interval Set missing');
    assert.match(CODE, /const CLEAN_setTimeout\s*=/, 'owned timeout wrapper missing');
    assert.match(CODE, /const CLEAN_setInterval\s*=/, 'owned interval wrapper missing');
    assert.match(CODE, /STATE_PM\.clean\.timers\.delete\(id\)/, 'one-shot ids must self-remove');
    assert.doesNotMatch(CODE, /CLEAN_addTimer/, 'the unbounded array helper is back');
    assert.doesNotMatch(CODE, /clean\.timers\.splice/, 'array-based timer drain is back');
  });

  check('save/commit paths report success truthfully', () => {
    for (const fn of ['savePrompts', 'saveQuick', 'saveHistory', 'saveDrafts', 'savePasted']) {
      assert.match(CODE, new RegExp(`${fn}\\(list\\)\\s*\\{\\s*return SAFE_try`),
        `${fn} must return its storage result`);
    }
    assert.match(CODE, /commitPrompts\(nextList\)/, 'commitPrompts helper missing');
    assert.match(CODE, /commitQuick\(nextList\)/, 'commitQuick helper missing');
    assert.match(CODE, /writeFailures/, 'write-failure counter missing');
    assert.match(CODE, /corruptReads/, 'corrupt-read counter missing');
    assert.match(CODE, /STATE_PM\.dataError/, 'dataError flag missing');
  });

  check('corrupt reads are quarantined without touching the primary key', () => {
    const fn = CODE.match(/const ENGINE_PM_quarantine[\s\S]*?\n  \};/);
    assert.ok(fn, 'ENGINE_PM_quarantine not found');
    assert.match(fn[0], /\$\{key\}\.corrupt\./, 'quarantine key prefix missing');
    assert.match(fn[0], /\$\{prefix\}\$\{UTIL_now\(\)\}/, 'timestamped quarantine key shape missing');
    assert.doesNotMatch(fn[0], /UTIL_storage\.del\(/, 'quarantine must never delete the primary key');
    assert.doesNotMatch(fn[0], /setJSON\(key/, 'quarantine must never rewrite the primary key');
    assert.doesNotMatch(fn[0], /setStr\(key,/, 'quarantine must never rewrite the primary key');
  });

  // ── Correction 5 ──────────────────────────────────────────────────────────
  check('quarantine copies are deduplicated before a new one is written', () => {
    const fn = CODE.match(/const ENGINE_PM_quarantine[\s\S]*?\n  \};/);
    assert.ok(fn, 'ENGINE_PM_quarantine not found');
    assert.match(fn[0], /UTIL_storage\.keys\(\)/, 'must enumerate existing keys to dedup');
    assert.match(fn[0], /startsWith\(prefix\)/, 'must scope the scan to this primary key');
    assert.match(fn[0], /getStr\(k, null\) === raw/, 'must compare stored bytes before reusing');
    assert.match(fn[0], /return true; \/\/ already quarantined/, 'must reuse an identical copy');
    assert.match(fn[0], /quarantineScan/, 'enumeration failure must be reported diagnostically');
    // The dedup scan must come BEFORE the write, or it cannot prevent anything.
    assert.ok(fn[0].indexOf('UTIL_storage.keys()') < fn[0].indexOf('UTIL_storage.setStr(qKey'),
      'the dedup scan must precede the quarantine write');

    assert.match(CODE, /keys\(\)\s*\{/, 'UTIL_storage.keys() helper missing');
    const keysFn = CODE.match(/keys\(\)\s*\{[\s\S]*?\n    \},/);
    assert.ok(keysFn, 'UTIL_storage.keys() body not found');
    assert.match(keysFn[0], /return null;/, 'keys() must signal enumeration failure distinctly from "no keys"');
  });

  // ── Correction 1 ──────────────────────────────────────────────────────────
  check('readRaw treats only getItem() === null as absent', () => {
    const fn = CODE.match(/readRaw\(key\)\s*\{[\s\S]*?\n    \},/);
    assert.ok(fn, 'UTIL_storage.readRaw not found');
    assert.match(fn[0], /raw === null/, 'absence must be tested strictly against null');
    assert.doesNotMatch(fn[0], /raw === ''/, "an empty string must NOT be classified as absent");
    assert.doesNotMatch(fn[0], /raw == null/, 'loose null comparison would also swallow undefined');
  });

  // ── Correction 2 ──────────────────────────────────────────────────────────
  check('raw persistence is separate from commit/event publication', () => {
    assert.match(CODE, /persistPrompts\(list\)\s*\{/, 'persistPrompts missing');
    assert.match(CODE, /persistQuick\(list\)\s*\{/, 'persistQuick missing');
    for (const fnName of ['persistPrompts', 'persistQuick']) {
      const fn = CODE.match(new RegExp(`${fnName}\\(list\\)\\s*\\{[\\s\\S]*?\\n    \\},`));
      assert.ok(fn, `${fnName} body not found`);
      assert.doesNotMatch(fn[0], /UTIL_emitPmChanged/, `${fnName} must not publish events`);
      assert.doesNotMatch(fn[0], /STATE_PM\.data\./, `${fnName} must not adopt state`);
    }
  });

  check('commit adopts state BEFORE emitting the changed event', () => {
    for (const [fnName, stateField, persistFn] of [
      ['savePrompts', 'STATE_PM.data.prompts', 'persistPrompts'],
      ['saveQuick', 'STATE_PM.data.quick', 'persistQuick'],
    ]) {
      const fn = CODE.match(new RegExp(`${fnName}\\(list\\)\\s*\\{[\\s\\S]*?\\n    \\},`));
      assert.ok(fn, `${fnName} body not found`);
      const body = fn[0];

      const iPersist = body.indexOf(persistFn);
      const iAdopt = body.indexOf(`${stateField} = next`);
      const iEmit = body.indexOf('UTIL_emitPmChanged');

      assert.ok(iPersist >= 0, `${fnName} must persist through ${persistFn}`);
      assert.ok(iAdopt >= 0, `${fnName} must adopt ${stateField}`);
      assert.ok(iEmit >= 0, `${fnName} must emit a changed event`);

      assert.ok(iPersist < iAdopt, `${fnName}: persistence must precede adoption`);
      assert.ok(iAdopt < iEmit,
        `${fnName}: state adoption must precede event publication — a synchronous ` +
        'listener would otherwise observe the replaced array');

      // A failed persist must short-circuit before adoption/emit.
      assert.match(body, new RegExp(`if \\(!ENGINE_PM\\.${persistFn}\\(next\\)\\) return false;`),
        `${fnName} must abort on a failed write before adopting or emitting`);
    }
  });

  // ── MIGRATION SAFETY ──────────────────────────────────────────────────────
  check('migrateKeysOnce does not classify "" as absent', () => {
    const fn = CODE.match(/    migrateKeysOnce\(\) \{[\s\S]*?\n    \},/);
    assert.ok(fn, 'migrateKeysOnce not found');
    const body = fn[0];
    // Presence must come from readRaw (strict getItem() !== null), never from a
    // truthiness or empty-string test.
    assert.match(body, /UTIL_storage\.readRaw\(kNew\)/, 'destination presence must use readRaw');
    assert.match(body, /if \(dst\.present\) continue;/, 'a present destination must be skipped outright');
    assert.doesNotMatch(body, /vNew === ''/, '"" must not be treated as absent');
    assert.doesNotMatch(body, /vOld !== ''/, 'legacy emptiness must not gate the copy');
    assert.doesNotMatch(body, /== null/, 'loose null tests must not decide presence');
  });

  check('legacy deletion happens only after verified destination persistence', () => {
    const fn = CODE.match(/    migrateKeysOnce\(\) \{[\s\S]*?\n    \},/);
    assert.ok(fn, 'migrateKeysOnce not found');
    const body = fn[0];

    const del = body.indexOf('UTIL_storage.del(kOld)');
    assert.ok(del > 0, 'legacy deletion not found');
    assert.equal((body.match(/UTIL_storage\.del\(/g) || []).length, 1,
      'there must be exactly one legacy deletion site');

    const write = body.indexOf('UTIL_storage.setStr(kNew, src.raw)');
    const readBack = body.indexOf('const back = UTIL_storage.readRaw(kNew)');
    const verify = body.indexOf('back.raw !== src.raw');
    assert.ok(write > 0 && readBack > write && verify > readBack && del > verify,
      'order must be write -> read back -> verify equality -> delete legacy');

    // Both failure arms must bail out before reaching the deletion.
    assert.match(body, /ENGINE_PM_noteWriteFailure\(`ENGINE_PM\.migrateKeysOnce\.write/,
      'a failed destination write must be counted');
    assert.equal((body.match(/continue; \/\/ legacy untouched/g) || []).length, 2,
      'both the failed-write and failed-verify arms must leave the legacy key untouched');
  });

  check('the key-migration marker is written only after every pair is terminal', () => {
    const fn = CODE.match(/    migrateKeysOnce\(\) \{[\s\S]*?\n    \},/);
    const body = fn[0];
    assert.match(body, /if \(!allTerminal\) return false;/,
      'the marker must be gated on every pair reaching a terminal state');
    const gate = body.indexOf('if (!allTerminal) return false;');
    const marker = body.indexOf(`setStr(KEY_PM_MIG_KEYS_V1, '1')`);
    assert.ok(gate > 0 && marker > gate, 'the marker write must follow the terminal-state gate');
    assert.match(body, /ENGINE_PM_noteWriteFailure\('ENGINE_PM\.migrateKeysOnce\.marker'\)/,
      'a failed marker write must be reported and must return failure');
  });

  check('drafts migration persists Drafts before filtered History', () => {
    const fn = CODE.match(/    migrateDraftsFromHistoryOnce\(\) \{[\s\S]*?\n    \},/);
    assert.ok(fn, 'migrateDraftsFromHistoryOnce not found');
    const body = fn[0];

    const saveD = body.indexOf('ENGINE_PM.saveDrafts(nextDrafts)');
    const saveH = body.indexOf('ENGINE_PM.saveHistory(keep)');
    assert.ok(saveD > 0, 'Drafts persistence not found');
    assert.ok(saveH > 0, 'History persistence not found');
    assert.ok(saveD < saveH, 'Drafts MUST be persisted before the filtered History');

    // The History write must be gated on the Drafts write succeeding.
    assert.match(body, /if \(!ENGINE_PM\.saveDrafts\(nextDrafts\)\) \{/,
      'a failed Drafts write must short-circuit');
    assert.match(body, /History left untouched/, 'the failure path must document leaving History intact');
  });

  check('the drafts-migration marker is written only after both collection writes succeed', () => {
    const fn = CODE.match(/    migrateDraftsFromHistoryOnce\(\) \{[\s\S]*?\n    \},/);
    const body = fn[0];
    const saveH = body.indexOf('ENGINE_PM.saveHistory(keep)');
    const marker = body.indexOf(`setStr(KEY_PM_MIG_DRAFTS_FROM_HISTORY_V1, '1')`);
    assert.ok(marker > saveH, 'the marker write must follow both collection writes');
    assert.match(body, /ENGINE_PM_noteWriteFailure\('ENGINE_PM\.migrateDraftsFromHistoryOnce\.marker'\)/,
      'a failed marker write must be reported and must return failure');
  });

  check('drafts migration fails closed on malformed source data', () => {
    const fn = CODE.match(/    migrateDraftsFromHistoryOnce\(\) \{[\s\S]*?\n    \},/);
    const body = fn[0];
    assert.match(body, /ENGINE_PM_readArray\(KEY_PM_STATE_HISTORY_V1\)/,
      'History must be read through the classified reader, not getJSON(..., [])');
    assert.match(body, /ENGINE_PM_readArray\(KEY_PM_STATE_DRAFTS_V1\)/,
      'Drafts must be read through the classified reader');
    assert.equal((body.match(/kind === PM_READ_CORRUPT/g) || []).length, 2,
      'both sources must fail closed on malformed data');
    assert.doesNotMatch(body, /getJSON\(KEY_PM_STATE_HISTORY_V1/,
      'getJSON would coerce malformed History into [] and then persist that emptiness');
    assert.doesNotMatch(body, /ENGINE_PM\.loadDrafts\(\)/,
      'loadDrafts silently coerces malformed Drafts to [] — the migration must not use it');
  });

  check('neither migration writes its marker unconditionally', () => {
    for (const [name, key] of [
      ['migrateKeysOnce', 'KEY_PM_MIG_KEYS_V1'],
      ['migrateDraftsFromHistoryOnce', 'KEY_PM_MIG_DRAFTS_FROM_HISTORY_V1'],
    ]) {
      const fn = CODE.match(new RegExp(`    ${name}\\(\\) \\{[\\s\\S]*?\\n    \\},`));
      assert.ok(fn, `${name} not found`);
      const body = fn[0];
      const writes = body.match(new RegExp(`setStr\\(${key},\\s*'1'\\)`, 'g')) || [];
      assert.equal(writes.length, 1, `${name} must have exactly one marker write site`);
      // The single write site must be inside a failure-checked condition.
      assert.match(body, new RegExp(`if \\(!UTIL_storage\\.setStr\\(${key}, '1'\\)\\)`),
        `${name}: the marker write must be result-checked, not fire-and-forget`);
      assert.match(body, /return false;/, `${name} must be able to report failure`);
      assert.match(body, /return true;/, `${name} must report truthful success`);
    }
  });

  check('boot surfaces a deferred migration without blocking the UI', () => {
    assert.match(CODE, /const migKeysOk = ENGINE_PM\.migrateKeysOnce\(\);/,
      'boot must capture the key-migration result');
    assert.match(CODE, /const migDraftsOk = ENGINE_PM\.migrateDraftsFromHistoryOnce\(\);/,
      'boot must capture the drafts-migration result');
    assert.match(CODE, /if \(!migKeysOk \|\| !migDraftsOk\) \{[\s\S]*?STATE_PM\.dataError = true;/,
      'a deferred migration must set dataError');
    assert.match(CODE, /migration deferred/, 'a deferred migration must be recorded in diagnostics');
    // It must NOT abort boot: no return/throw inside the deferral branch.
    const branch = CODE.match(/if \(!migKeysOk \|\| !migDraftsOk\) \{[\s\S]*?\n      \}/);
    assert.ok(branch, 'deferral branch not found');
    assert.doesNotMatch(branch[0], /\breturn\b|\bthrow\b/,
      'a safe deferral must not prevent the UI from mounting');
  });

  check('quarantine proves a candidate is free BEFORE writing it', () => {
    const fn = CODE.match(/const ENGINE_PM_quarantine[\s\S]*?\n  \};/);
    const body = fn[0];
    assert.match(body, /const base = `\$\{prefix\}\$\{UTIL_now\(\)\}`;/, 'timestamped base key missing');
    assert.match(body, /const probe = UTIL_storage\.readRaw\(candidate\);/,
      'each candidate must be read before use');
    assert.match(body, /if \(!probe\.ok\) \{[\s\S]*?return false;/,
      'an unreadable candidate must abort without writing');
    assert.match(body, /if \(!probe\.present\) \{ qKey = candidate; break; \}/,
      'a candidate may be adopted only when the read proves it absent');

    // The write must be reachable only through a proven-free candidate.
    const adopt = body.indexOf('qKey = candidate');
    const write = body.indexOf('UTIL_storage.setStr(qKey, raw)');
    assert.ok(adopt > 0 && write > adopt, 'the write must follow candidate adoption');
    assert.equal((body.match(/UTIL_storage\.setStr\(/g) || []).length, 1,
      'there must be exactly one quarantine write site');
  });

  check('bounded exhaustion cannot fall through into an occupied final candidate', () => {
    const fn = CODE.match(/const ENGINE_PM_quarantine[\s\S]*?\n  \};/);
    const body = fn[0];
    assert.match(body, /PM_QUARANTINE_MAX_CANDIDATES/, 'the bound must be a named constant');
    assert.match(CODE, /const PM_QUARANTINE_MAX_CANDIDATES = \d+;/, 'bound constant not defined');

    // qKey starts empty and is set ONLY inside the proven-absent branch, so an
    // exhausted loop leaves it falsy and must bail before the write.
    assert.match(body, /let qKey = '';/, 'the selected key must start unset');
    assert.match(body, /if \(!qKey\) \{[\s\S]*?quarantineExhausted[\s\S]*?return false;/,
      'exhausting the candidate space must return false with a diagnostic');
    const bail = body.indexOf('if (!qKey)');
    const write = body.indexOf('UTIL_storage.setStr(qKey, raw)');
    assert.ok(bail > 0 && bail < write, 'the exhaustion bail-out must precede the write');

    // The pre-correction shape probed qKey itself inside the loop condition and
    // could exit still holding the occupied final suffix.
    assert.doesNotMatch(body, /UTIL_storage\.readRaw\(qKey\)\.present/,
      'the loop must not test the already-selected key; it must probe candidates');
  });

  // ── FINAL CLOSURE: draft migration identity ───────────────────────────────
  check('draft migration has no universal text-only identity', () => {
    const fn = CODE.match(/    migrateDraftsFromHistoryOnce\(\) \{[\s\S]*?\n    \},/);
    assert.ok(fn, 'migrateDraftsFromHistoryOnce not found');
    const body = fn[0];
    assert.doesNotMatch(body, /`tx:/, 'the universal tx:<text> identity must be gone');
    assert.doesNotMatch(body, /`tc:/, 'the text+timestamp identity key must be gone');
    assert.doesNotMatch(body, /const draftKeys/, 'the multi-key identity model must be gone');
    assert.doesNotMatch(body, /keys\.some\(k => seen\.has\(k\)\)/,
      'any-key matching collapses distinct records and must be gone');
  });

  check('a valid record id is the authoritative migration identity', () => {
    const fn = CODE.match(/    migrateDraftsFromHistoryOnce\(\) \{[\s\S]*?\n    \},/);
    const body = fn[0];
    assert.match(body, /const ownId = ENGINE_PM_validRecordId\(it\);/,
      'a row with a valid id must use that id as its identity');
    assert.match(body, /const occupant = existingById\.get\(ownId\);/,
      'a valid id must inspect any existing occupant rather than accept it blindly');
    assert.match(body, /existingById\.set\(ownId, ownRec\);/, 'accepted ids must be recorded');

    const helper = CODE.match(/const ENGINE_PM_validRecordId = [\s\S]*?\n  \};/);
    assert.ok(helper, 'ENGINE_PM_validRecordId not found');
    assert.match(helper[0], /\.trim\(\)/, 'ids must be trimmed before validity is judged');
  });

  check('idless migration ids are deterministic (no clock, no randomness)', () => {
    const fn = CODE.match(/const ENGINE_PM_migratedDraftId = [\s\S]*?\n  \};/);
    assert.ok(fn, 'ENGINE_PM_migratedDraftId not found');
    const body = fn[0];
    assert.doesNotMatch(body, /UTIL_now\(\)|Date\.now\(\)/,
      'a migration id must not read the clock — a retry must recompute it identically');
    assert.doesNotMatch(body, /randomUUID|UTIL_cryptoId|Math\.random/,
      'a migration id must not be random');
    assert.match(body, /UTIL_hash32\(/, 'text must be compressed through the stable hash helper');

    const h = CODE.match(/const UTIL_hash32 = [\s\S]*?\n  \};/);
    assert.ok(h, 'UTIL_hash32 not found');
    assert.doesNotMatch(h[0], /Date\.now\(\)|Math\.random/, 'the hash helper must be pure');

    // The old call site generated a fresh random id per attempt.
    const mig = CODE.match(/    migrateDraftsFromHistoryOnce\(\) \{[\s\S]*?\n    \},/)[0];
    assert.doesNotMatch(mig, /UTIL_cryptoId\(\)/,
      'the migration must not mint random ids — they break retry identity');
  });

  // ── IDENTITY COLLISION CLOSURE ────────────────────────────────────────────
  check('bucket-local text+timestamp ordinal tracking is gone', () => {
    const mig = CODE.match(/    migrateDraftsFromHistoryOnce\(\) \{[\s\S]*?\n    \},/)[0];
    assert.doesNotMatch(mig, /const ordinals = new Map\(\)/,
      'per-bucket ordinal tracking restarts at 0 for each text and must be gone');
    assert.doesNotMatch(mig, /const bucket =/, 'the text+timestamp bucket key must be gone');
    assert.doesNotMatch(mig, /ordinals\.(get|set)\(/, 'bucket ordinal lookups must be gone');
  });

  check('one global idless-source ordinal provides row uniqueness', () => {
    const mig = CODE.match(/    migrateDraftsFromHistoryOnce\(\) \{[\s\S]*?\n    \},/)[0];
    assert.match(mig, /let idlessOrdinal = 0;/, 'a single monotonic ordinal must be declared');
    assert.match(mig, /const ordinal = idlessOrdinal;\s*\n\s*idlessOrdinal \+= 1;/,
      'the ordinal must be taken then advanced for every idless row');
    assert.match(mig, /ENGINE_PM_migratedDraftId\(text, sourceTs, ordinal\)/,
      'the derived id must consume the global ordinal and the NORMALIZED SOURCE timestamp');
    // Exactly one increment site, so no path can skip or double-advance it.
    assert.equal((mig.match(/idlessOrdinal \+= 1;/g) || []).length, 1,
      'the ordinal must advance at exactly one site');

    const fn = CODE.match(/const ENGINE_PM_migratedDraftId = [\s\S]*?\n  \};/);
    assert.match(fn[0], /ordinal/, 'the derived id must incorporate the ordinal');
    // The id format is explicitly out of scope for the missing-timestamp pass.
    assert.match(fn[0], /`pmmig_\$\{ts\}_\$\{n\}_\$\{t\.length\}_\$\{UTIL_hash32\(t\)\}`/,
      'the generated id format must be unchanged');
  });

  check('existing-id collisions compare text AND timestamp before declaring a retry', () => {
    const mig = CODE.match(/    migrateDraftsFromHistoryOnce\(\) \{[\s\S]*?\n    \},/)[0];
    assert.match(mig, /const isRetryCopy = \(rec\) => \{/, 'a content comparison helper is required');
    assert.match(mig, /ENGINE_PM_normDraftText\(rec\.text\) !== text/,
      'the occupant text must be compared');
    assert.match(mig, /ENGINE_PM_normDraftTs\(rec\.createdAt\) !== storedTs/,
      'the occupant timestamp must be compared against the DETERMINISTIC stored value');
    assert.match(mig, /if \(isRetryCopy\(occupant\)\) \{ alreadyMigrated = true; break; \}/,
      'only a content match may be declared an already-migrated retry');
  });

  // ── MISSING-CREATEDAT CLOSURE ─────────────────────────────────────────────
  check('a deterministic unknown-timestamp sentinel exists and is reserved', () => {
    const m = CODE.match(/const PM_MIG_UNKNOWN_CREATED_AT = (-?\d+);/);
    assert.ok(m, 'PM_MIG_UNKNOWN_CREATED_AT constant missing');
    const v = Number(m[1]);
    assert.ok(Number.isFinite(v), 'the sentinel must be a finite number');
    assert.ok(v < 0, `the sentinel must be negative (reserved), got ${v}`);
    assert.notEqual(v, 0, 'the sentinel must not be 0 — that is the "missing" marker itself');
    // Truthy, so loadDrafts()'s `Number(x) || UTIL_now()` cannot replace it.
    assert.ok(v, 'the sentinel must be truthy to survive loadDrafts() normalization');
    assert.equal(JSON.parse(JSON.stringify({ c: v })).c, v, 'the sentinel must survive JSON');
    // Documented as reserved.
    assert.match(SRC, /RESERVED: no real capture\s*\n\s*\* path ever produces a negative createdAt/,
      'the sentinel must be documented as reserved');
  });

  check('migrated records store the deterministic timestamp, never the clock', () => {
    const mig = CODE.match(/    migrateDraftsFromHistoryOnce\(\) \{[\s\S]*?\n    \},/)[0];
    assert.match(mig, /const sourceTs = ENGINE_PM_normDraftTs\(it\?\.createdAt\);/,
      'the normalized source timestamp must be computed');
    assert.match(mig, /const storedTs = \(sourceTs !== 0\) \? sourceTs : PM_MIG_UNKNOWN_CREATED_AT;/,
      'a missing timestamp must resolve to the sentinel');

    // BOTH record shapes — valid-id and idless — must store storedTs.
    assert.match(mig, /const ownRec = \{ id: ownId, text, createdAt: storedTs \};/,
      'the valid-id record must store the deterministic timestamp');
    assert.match(mig, /const rec = \{ id: chosen, text, createdAt: storedTs \};/,
      'the idless record must store the deterministic timestamp');
    assert.equal((mig.match(/createdAt: storedTs/g) || []).length, 2,
      'exactly the two migrated record shapes must use storedTs');

    // The migration must not read the clock at all.
    assert.doesNotMatch(mig, /UTIL_now\(\)/,
      'the migration must not call UTIL_now() — it destroys retry determinism');
    assert.doesNotMatch(mig, /ts \|\| UTIL_now\(\)/, 'the clock fallback must be gone');
  });

  check('the ts !== 0 timestamp-comparison bypass is gone', () => {
    const mig = CODE.match(/    migrateDraftsFromHistoryOnce\(\) \{[\s\S]*?\n    \},/)[0];
    const retry = mig.match(/const isRetryCopy = \(rec\) => \{[\s\S]*?\n            \};/);
    assert.ok(retry, 'isRetryCopy not found');
    assert.doesNotMatch(retry[0], /ts !== 0/,
      'the bypass let an unrelated same-text record be accepted as the retry copy');
    // The comparison must be unconditional: exactly three guard lines, no &&-gate.
    assert.match(retry[0], /if \(ENGINE_PM_normDraftTs\(rec\.createdAt\) !== storedTs\) return false;/,
      'the timestamp comparison must be unconditional');
    assert.doesNotMatch(retry[0], /&&\s*ENGINE_PM_normDraftTs/,
      'the timestamp comparison must not be gated behind another condition');
  });

  check('an occupied mismatching id is never treated as migrated', () => {
    const mig = CODE.match(/    migrateDraftsFromHistoryOnce\(\) \{[\s\S]*?\n    \},/)[0];

    // Structural, not prose: isolate the candidate loop and prove it has
    // exactly two exits, each guarded. Anything else would mean a mismatching
    // occupant could terminate the search (and be adopted as "migrated").
    const loop = mig.match(/for \(let n = 1; n <= MAX_ID_CANDIDATES; n \+= 1\) \{[\s\S]*?\n            \}/);
    assert.ok(loop, 'the candidate loop was not found');
    const body = loop[0];

    const breaks = body.match(/break;/g) || [];
    assert.equal(breaks.length, 2, `expected exactly 2 guarded exits, found ${breaks.length}`);
    assert.match(body, /if \(!occupant\) \{ chosen = candidate; break; \}/,
      'exit 1 must require a proven-unused candidate');
    assert.match(body, /if \(isRetryCopy\(occupant\)\) \{ alreadyMigrated = true; break; \}/,
      'exit 2 must require a content match');

    // No unguarded fallthrough that adopts or declares a match.
    assert.doesNotMatch(body, /else\b/, 'an else branch could adopt a mismatching occupant');
    assert.equal((body.match(/chosen = candidate/g) || []).length, 1, 'one adoption site only');
    assert.equal((body.match(/alreadyMigrated = true/g) || []).length, 1, 'one retry-declaration site only');

    // Across the whole routine the retry flag may only ever be set here.
    assert.equal((mig.match(/alreadyMigrated = true/g) || []).length, 1,
      'the retry flag must be set at exactly one site in the routine');
  });

  check('collision suffix candidates are proven unused before use', () => {
    const mig = CODE.match(/    migrateDraftsFromHistoryOnce\(\) \{[\s\S]*?\n    \},/)[0];
    assert.match(mig, /const candidate = \(n === 1\) \? base : `\$\{base\}\.\$\{n\}`;/,
      'deterministic .2/.3/... suffixes are required');
    assert.match(mig, /const occupant = existingById\.get\(candidate\);/,
      'each candidate must be looked up before use');
    assert.match(mig, /if \(!occupant\) \{ chosen = candidate; break; \}/,
      'a candidate may be adopted only when proven unused');
    assert.match(mig, /const MAX_ID_CANDIDATES = \(Number\(CFG_PM\.DRAFTS_MAX\) \|\| 50\) \+ 1;/,
      'the candidate space must be bounded by DRAFTS_MAX + 1');
    assert.match(mig, /existingById\.set\(chosen, rec\);/,
      'an adopted candidate must be reserved so a later row cannot reuse it');
  });

  check('identity exhaustion fails before ANY collection write', () => {
    const mig = CODE.match(/    migrateDraftsFromHistoryOnce\(\) \{[\s\S]*?\n    \},/)[0];
    assert.match(mig, /identityExhausted = base;\s*\n\s*break;/,
      'exhaustion must break out of the build loop');
    assert.match(mig, /if \(identityExhausted\) \{[\s\S]*?STATE_PM\.dataError = true;[\s\S]*?return false;/,
      'exhaustion must set dataError, report and return false');
    assert.match(mig, /identityExhausted/, 'exhaustion diagnostic missing');

    const bail = mig.indexOf('if (identityExhausted)');
    const saveD = mig.indexOf('ENGINE_PM.saveDrafts(nextDrafts)');
    const saveH = mig.indexOf('ENGINE_PM.saveHistory(keep)');
    const marker = mig.indexOf("setStr(KEY_PM_MIG_DRAFTS_FROM_HISTORY_V1, '1')");
    assert.ok(bail > 0 && bail < saveD && bail < saveH && bail < marker,
      'the exhaustion bail-out must precede the Drafts write, the History write and the marker');
  });

  // ── FINITE TIMESTAMP ──────────────────────────────────────────────────────
  check('ENGINE_PM_normDraftTs normalizes only finite numbers', () => {
    const fn = CODE.match(/const ENGINE_PM_normDraftTs = [\s\S]*?\n  \};/);
    assert.ok(fn, 'ENGINE_PM_normDraftTs not found');
    assert.match(fn[0], /Number\.isFinite\(n\)/,
      'normalization must gate on Number.isFinite');
    assert.match(fn[0], /const n = Number\(v\);/, 'the value must be coerced once');
    assert.match(fn[0], /return Number\.isFinite\(n\) \? n : 0;/,
      'non-finite values must resolve to 0');
    // The old truthiness implementation let Infinity through.
    assert.doesNotMatch(fn[0], /Number\(v\) \|\| 0/,
      'the truthiness implementation accepted Infinity and must be gone');
    assert.doesNotMatch(CODE, /const ENGINE_PM_normDraftTs = \(v\) => Number\(v\) \|\| 0;/,
      'the single-expression truthiness form must be gone');
  });

  // ── DEFERRED HISTORY ──────────────────────────────────────────────────────
  check('loadHistory branches on the drafts-migration marker', () => {
    assert.match(CODE, /draftsMigrationComplete\(\) \{[\s\S]*?KEY_PM_MIG_DRAFTS_FROM_HISTORY_V1[\s\S]*?=== '1'/,
      'completion must be read from the drafts-migration marker');
    const fn = CODE.match(/    loadHistoryStrict\(\) \{[\s\S]*?\n    \},/);
    assert.ok(fn, 'loadHistoryStrict not found');
    assert.match(fn[0], /const migDone = ENGINE_PM\.draftsMigrationComplete\(\);/,
      'the strict loader must consult the marker');
  });

  check('deferred draft rows are retained verbatim with source "draft"', () => {
    const fn = CODE.match(/    loadHistoryStrict\(\) \{[\s\S]*?\n    \},/)[0];

    // Isolate the draft branch precisely, then assert on that block alone —
    // a loose pattern over the whole function matches unrelated later text.
    const branch = fn.match(/if \(source === 'draft'\) \{[\s\S]*?\n          \}/);
    assert.ok(branch, 'the draft branch was not found');
    const body = branch[0];

    assert.match(body, /if \(migDone\) \{ changed = true; continue; \}/,
      'a draft row may be dropped only once migration is complete');
    assert.match(body, /out\.push\(h\);/, 'a pending draft must be pushed through VERBATIM');
    assert.match(body, /continue;/, 'the branch must not fall through to sent normalization');

    // The branch itself must never rebuild the row as a sent record, and must
    // not re-id or re-timestamp it (that would break migration determinism).
    assert.doesNotMatch(body, /source: 'send'/, 'a draft row must never be normalized to "send"');
    assert.doesNotMatch(body, /UTIL_cryptoId\(\)/, 'a pending draft must not be re-id\'d');
    assert.doesNotMatch(body, /UTIL_now\(\)/, 'a pending draft must not be re-timestamped');

    // The sent normalization must be reachable only AFTER that branch continues.
    assert.ok(fn.indexOf('out.push(h);') < fn.indexOf("source: 'send' });"),
      'the draft branch must precede and bypass the sent normalization');

    // The unconditional drop that destroyed the only copy must be gone.
    assert.doesNotMatch(fn, /if \(source === 'draft'\) \{ changed = true; continue; \}/,
      'the unconditional draft drop must be gone');
  });

  check('retention trimming never drops a pending draft', () => {
    const fn = CODE.match(/    loadHistoryStrict\(\) \{[\s\S]*?\n    \},/)[0];
    assert.match(fn, /const dropOldest = \(\) => \{/, 'a guarded trim helper is required');
    assert.match(fn, /if \(migDone\) \{ out\.shift\(\); return true; \}/,
      'plain trimming is only allowed once migration is complete');
    assert.match(fn, /const i = out\.findIndex\(r => String\(r\?\.source \|\| ''\)\.toLowerCase\(\) !== 'draft'\);/,
      'while deferred, trimming must target the oldest NON-draft row');
    assert.match(fn, /if \(i === -1\) return false;/,
      'trimming must stop rather than drop a pending draft');
    // No raw shift/splice-from-front trimming outside the guarded helper.
    const trims = fn.match(/out\.shift\(\)/g) || [];
    assert.equal(trims.length, 1, 'the only out.shift() must be inside the guarded helper');
    assert.doesNotMatch(fn, /out\.splice\(0, out\.length - CFG_PM\.HISTORY_MAX\)/,
      'the unguarded bulk trim must be gone');
  });

  check('History rendering filters draft rows for display only', () => {
    assert.match(CODE, /loadHistorySent\(\) \{[\s\S]*?loadHistory\(\)\.filter\(/,
      'a sent-only display view must exist and be derived from the full collection');
    // Both render paths must use the display view.
    const renders = CODE.match(/const history = ENGINE_PM\.sentHistoryEntries\(\)/g) || [];
    assert.equal(renders.length, 2, `both History renders must use the sent-entry view, found ${renders.length}`);
    assert.doesNotMatch(CODE, /const history = ENGINE_PM\.loadHistory\(\)\s*\n\s*\.slice\(\)/,
      'no render may read the full collection directly');
    // The display view must never be persisted.
    const view = CODE.match(/loadHistorySent\(\) \{[\s\S]*?\n    \},/)[0];
    assert.doesNotMatch(view, /saveHistory|setJSON/, 'the display view must never be written back');
  });

  check('ordinary History save paths write the FULL collection', () => {
    // The delete handler must load the full collection and remove only one id.
    assert.match(CODE, /const hist = ENGINE_PM\.loadHistory\(\);|const hist = rd\.list;/,
      'History handlers must load the full collection');
    assert.match(CODE, /const next = hist\.slice\(\);\s*\n\s*next\.splice\(Number\(hidx\), 1\);/,
      'delete must remove exactly one verified occurrence');
    assert.doesNotMatch(CODE, /saveHistory\(ENGINE_PM\.loadHistorySent\(\)\)/,
      'the sent-only view must never be saved');
  });

  check('pushHistory dedups against the most recent SENT record', () => {
    const fn = CODE.match(/    pushHistory\(text\) \{[\s\S]*?\n    \},/);
    assert.ok(fn, 'pushHistory not found');
    const body = fn[0];
    assert.match(body, /let lastSent = null;/, 'the most recent sent record must be resolved');
    assert.match(body, /for \(let i = hist\.length - 1; i >= 0; i -= 1\)/,
      'the search must scan backwards');
    assert.match(body, /=== 'send'\) \{ lastSent = hist\[i\]; break; \}/,
      'only a sent record may be the dedup target');
    assert.match(body, /if \(lastSent && lastSent\.text === clean\) return true;/,
      'dedup must compare against the most recent sent record');
    assert.doesNotMatch(body, /const last = hist\[hist\.length - 1\];/,
      'assuming the final item is a sent record must be gone');
  });

  check('only the migration removes draft rows while the marker is incomplete', () => {
    // Enumerate every site that can drop a draft-source row.
    const mig = CODE.match(/    migrateDraftsFromHistoryOnce\(\) \{[\s\S]*?\n    \},/)[0];
    const load = CODE.match(/    loadHistoryStrict\(\) \{[\s\S]*?\n    \},/)[0];

    // In the strict loader the only drop is guarded by migDone.
    assert.match(load, /if \(migDone\) \{ changed = true; continue; \}/,
      'the loader may drop a draft row only once migration is complete');

    // The migration builds `keep` (draft rows excluded) and writes it only after
    // Drafts persistence succeeded.
    const saveD = mig.indexOf('ENGINE_PM.saveDrafts(nextDrafts)');
    const saveH = mig.indexOf('ENGINE_PM.saveHistory(keep)');
    assert.ok(saveD > 0 && saveH > saveD,
      'the filtered History may be written only after Drafts persistence succeeds');
  });

  // ── CAPTURE-STORE INTEGRITY ───────────────────────────────────────────────
  check('capture loaders no longer use getJSON(..., []) as the mutation authority', () => {
    for (const key of ['KEY_PM_STATE_HISTORY_V1', 'KEY_PM_STATE_DRAFTS_V1', 'KEY_PM_STATE_PASTED_V1']) {
      assert.doesNotMatch(CODE, new RegExp(`getJSON\\(${key}`),
        `${key} must not be read through getJSON — it collapses absent/malformed/non-array`);
    }
    // Each strict loader must go through the shared classified reader.
    for (const fn of ['loadHistoryStrict', 'loadDraftsStrict', 'loadPastedStrict']) {
      const m = CODE.match(new RegExp(`    ${fn}\\(\\) \\{[\\s\\S]*?\\n    \\},`));
      assert.ok(m, `${fn} not found`);
      assert.match(m[0], /ENGINE_PM_readCaptureStore\(/, `${fn} must use the shared classified reader`);
      assert.match(m[0], /if \(!rd\.ok\) return \{ ok: false, list: \[\] \};/,
        `${fn} must report failure on a corrupt read`);
      assert.match(m[0], /return \{ ok: true, list: out \};|return \{ ok: true, list: rd\.list \};/,
        `${fn} must return the { ok, list } contract`);
    }
  });

  check('the shared capture reader quarantines without touching the primary key', () => {
    const fn = CODE.match(/const ENGINE_PM_readCaptureStore = [\s\S]*?\n  \};/);
    assert.ok(fn, 'ENGINE_PM_readCaptureStore not found');
    const body = fn[0];
    assert.match(body, /ENGINE_PM_readArray\(key\)/, 'must use the classified reader');
    assert.match(body, /if \(rd\.kind === PM_READ_CORRUPT\)/, 'must detect the corrupt classification');
    assert.match(body, /ENGINE_PM_quarantine\(key, rd\.raw, rd\.err\)/,
      'must invoke the approved quarantine mechanism');
    assert.match(body, /return \{ ok: false, list: \[\] \};/, 'corrupt must report failure');
    assert.doesNotMatch(body, /setJSON|setStr\(key/, 'the reader must never write the primary key');
  });

  check('all three capture pushes abort on a strict-read failure', () => {
    for (const [push, strict] of [
      ['pushHistory', 'loadHistoryStrict'],
      ['pushDraft', 'loadDraftsStrict'],
      ['pushPasted', 'loadPastedStrict'],
    ]) {
      const m = CODE.match(new RegExp(`    ${push}\\(text\\) \\{[\\s\\S]*?\\n    \\},`));
      assert.ok(m, `${push} not found`);
      const body = m[0];
      assert.match(body, new RegExp(`ENGINE_PM\\.${strict}\\(\\)`), `${push} must use the strict reader`);
      assert.match(body, /if \(!rd\.ok\) \{[\s\S]*?return false;/,
        `${push} must abort when the collection is not authoritative`);
      // It must not fall back to the permissive loader for its mutation base.
      assert.doesNotMatch(body, /ENGINE_PM\.load(History|Drafts|Pasted)\(\)/,
        `${push} must not read the permissive view as its mutation base`);
    }
  });

  check('capture normalization writes go through the truthful save functions', () => {
    for (const [fn, save] of [
      ['loadHistoryStrict', 'saveHistory'],
      ['loadDraftsStrict', 'saveDrafts'],
      ['loadPastedStrict', 'savePasted'],
    ]) {
      const m = CODE.match(new RegExp(`    ${fn}\\(\\) \\{[\\s\\S]*?\\n    \\},`))[0];
      assert.match(m, new RegExp(`if \\(changed && !ENGINE_PM\\.${save}\\(out\\)\\) return \\{ ok: false, list: out \\};`),
        `${fn} must persist normalization through ${save} and report a failed write`);
      assert.doesNotMatch(m, /UTIL_storage\.setJSON\(/,
        `${fn} must not bypass ${save} with a raw write`);
    }
  });

  check('capture normalization uses finite timestamp normalization', () => {
    for (const fn of ['loadHistoryStrict', 'loadDraftsStrict', 'loadPastedStrict']) {
      const m = CODE.match(new RegExp(`    ${fn}\\(\\) \\{[\\s\\S]*?\\n    \\},`))[0];
      assert.match(m, /ENGINE_PM_normDraftTs\(\w+\?\.createdAt\)/,
        `${fn} must normalize createdAt through the finite normalizer`);
      assert.doesNotMatch(m, /Number\(\w+\?\.createdAt\) \|\| UTIL_now\(\)/,
        `${fn} must not use the non-finite-permissive coercion`);
    }
  });

  // ── VALID-ID COLLISION ────────────────────────────────────────────────────
  check('a valid-id occupant is compared by text AND timestamp', () => {
    const mig = CODE.match(/    migrateDraftsFromHistoryOnce\(\) \{[\s\S]*?\n    \},/)[0];
    assert.match(mig, /const occupant = existingById\.get\(ownId\);/,
      'the occupant must be fetched, not merely detected');
    assert.match(mig, /if \(occupant\) \{[\s\S]*?if \(isRetryCopy\(occupant\)\) continue;/,
      'only a content match may be accepted as an already-migrated retry');
    // The blind accept that discarded the source row must be gone.
    assert.doesNotMatch(mig, /if \(existingById\.has\(ownId\)\) continue;/,
      'the blind valid-id accept must be gone');
    // One shared comparator serves both identity paths.
    assert.equal((mig.match(/const isRetryCopy = \(rec\) => \{/g) || []).length, 1,
      'exactly one content comparator must serve both identity paths');
  });

  check('a mismatching valid-id occupant fails before any collection write', () => {
    const mig = CODE.match(/    migrateDraftsFromHistoryOnce\(\) \{[\s\S]*?\n    \},/)[0];
    assert.match(mig, /validIdCollision = ownId;\s*\n\s*break;/,
      'a genuine collision must break out of the build loop');
    assert.match(mig, /if \(validIdCollision\) \{[\s\S]*?STATE_PM\.dataError = true;[\s\S]*?return false;/,
      'a collision must set dataError and return false');
    assert.match(mig, /validIdCollision'/, 'a validIdCollision diagnostic must be recorded');

    const bail = mig.indexOf('if (validIdCollision)');
    const saveD = mig.indexOf('ENGINE_PM.saveDrafts(nextDrafts)');
    const saveH = mig.indexOf('ENGINE_PM.saveHistory(keep)');
    const marker = mig.indexOf("setStr(KEY_PM_MIG_DRAFTS_FROM_HISTORY_V1, '1')");
    assert.ok(bail > 0 && bail < saveD && bail < saveH && bail < marker,
      'the collision bail-out must precede the Drafts write, the History write and the marker');

    // A valid source id must never be silently suffixed in this phase.
    assert.doesNotMatch(mig, /ownId\}\.\$\{|`\$\{ownId\}\./, 'a valid source id must not be suffixed');
  });

  // ── SENT-HISTORY OCCURRENCE ADDRESSING ────────────────────────────────────
  check('capture verification compares the COMPLETE rendered snapshot', () => {
    const fn = CODE.match(/const ENGINE_PM_verifyCaptureOccurrence = [\s\S]*?\n  \};/);
    assert.ok(fn, 'ENGINE_PM_verifyCaptureOccurrence not found');
    const body = fn[0];

    assert.match(body, /if \(!Array\.isArray\(list\)\) return null;/, 'non-array refused');
    assert.match(body, /if \(!snapshot \|\| typeof snapshot !== 'object'\) return null;/,
      'a missing snapshot must be refused');
    assert.match(body, /Number\.isInteger\(i\)/, 'fractional/non-numeric index refused');
    assert.match(body, /i < 0 \|\| i >= list\.length/, 'the index must be range-checked');

    // ALL FOUR identity fields, not just the id.
    assert.match(body, /if \(cur\.id !== want\.id\) return null;/, 'id must be compared');
    assert.match(body, /if \(cur\.text !== want\.text\) return null;/, 'TEXT must be compared');
    assert.match(body, /if \(cur\.createdAt !== want\.createdAt\) return null;/,
      'TIMESTAMP must be compared');
    assert.match(body, /if \(cur\.source !== want\.source\) return null;/, 'source must be compared');
    assert.match(body, /if \(expectedSource && cur\.source !== String\(expectedSource\)\.toLowerCase\(\)\) return null;/,
      'an expected source must be enforceable');

    // No hash may act as the comparison authority.
    assert.doesNotMatch(body, /UTIL_hash32|hash/i, 'a hash must not be the comparison authority');

    // The snapshot normalizes through the same helpers the stores use.
    const snap = CODE.match(/const ENGINE_PM_captureSnapshot = [\s\S]*?\n  \}\);/);
    assert.ok(snap, 'ENGINE_PM_captureSnapshot not found');
    assert.match(snap[0], /ENGINE_PM_normDraftText\(rec\?\.text\)/, 'text must be normalized');
    assert.match(snap[0], /ENGINE_PM_normDraftTs\(rec\?\.createdAt\)/, 'timestamp must be finite-normalized');

    // The id-only verifier is gone.
    assert.doesNotMatch(CODE, /ENGINE_PM_verifySentAt/, 'the id-only verifier must be gone');
  });

  check('History handlers pass the complete rendered snapshot', () => {
    assert.equal((CODE.match(/ENGINE_PM_verifyCaptureOccurrence\(hist, hidx, hsnap, 'send'\)/g) || []).length, 2,
      'both History handlers must verify the exact occurrence with expectedSource send');
    assert.equal((SRC.match(/data-hsnap="\$\{UTIL_escapeHtml\(JSON\.stringify\(snapshot\)\)\}"/g) || []).length, 2,
      'both History renders must emit the exact snapshot on each card');
    assert.match(CODE, /const ENGINE_PM_parseSnapshot = /, 'a snapshot parser is required');
  });

  check('Draft and Pasted renderers retain full collection indexes and snapshots', () => {
    // Entries are derived from the FULL collection before sorting/filtering.
    assert.equal((CODE.match(/ENGINE_PM\.captureEntries\(ENGINE_PM\.load(Drafts|Pasted)\(\)\)/g) || []).length, 4,
      'both modes of Drafts and Pasted must derive occurrence entries');
    const helper = CODE.match(/    captureEntries\(list\) \{[\s\S]*?\n    \},/);
    assert.ok(helper, 'captureEntries not found');
    assert.match(helper[0], /out\.push\(\{ item, fullIndex, snapshot: ENGINE_PM_captureSnapshot\(item\) \}\);/,
      'each entry must carry item, fullIndex and an exact snapshot');

    assert.equal((SRC.match(/data-didx="\$\{UTIL_escapeHtml\(String\(fullIndex\)\)\}"/g) || []).length, 2,
      'both Drafts renders must emit the occurrence index');
    assert.equal((SRC.match(/data-pidx="\$\{UTIL_escapeHtml\(String\(fullIndex\)\)\}"/g) || []).length, 2,
      'both Pasted renders must emit the occurrence index');
    assert.equal((SRC.match(/data-dsnap=/g) || []).length, 2, 'Drafts cards must carry the snapshot');
    assert.equal((SRC.match(/data-psnap=/g) || []).length, 2, 'Pasted cards must carry the snapshot');
  });

  check('Draft and Pasted handlers verify exact occurrences', () => {
    assert.equal((CODE.match(/ENGINE_PM_verifyCaptureOccurrence\(drafts, didx, dsnap\)/g) || []).length, 2,
      'both Drafts handlers must verify the exact occurrence');
    assert.equal((CODE.match(/ENGINE_PM_verifyCaptureOccurrence\(pasted, pidx, psnap\)/g) || []).length, 2,
      'both Pasted handlers must verify the exact occurrence');
    // The id-only lookups are gone.
    assert.doesNotMatch(CODE, /drafts\.find\(d => d\.id === did\)/, 'id-only Drafts lookup must be gone');
    assert.doesNotMatch(CODE, /pasted\.find\(p => p\.id === pstid\)/, 'id-only Pasted lookup must be gone');
    assert.doesNotMatch(CODE, /drafts\.findIndex\(d => d\.id === did\)/, 'id-only Drafts index must be gone');
    assert.doesNotMatch(CODE, /pasted\.findIndex\(p => p\.id === pstid\)/, 'id-only Pasted index must be gone');
  });

  check('Draft and Pasted deletion splice exactly one verified index', () => {
    assert.doesNotMatch(CODE, /drafts\.filter\(d => d\.id !== did\)/, 'Drafts filter-delete must be gone');
    assert.doesNotMatch(CODE, /pasted\.filter\(p => p\.id !== pstid\)/, 'Pasted filter-delete must be gone');
    assert.match(CODE, /const next = drafts\.slice\(\);\s*\n\s*next\.splice\(Number\(didx\), 1\);/,
      'Drafts delete must splice one occurrence');
    assert.match(CODE, /const next = pasted\.slice\(\);\s*\n\s*next\.splice\(Number\(pidx\), 1\);/,
      'Pasted delete must splice one occurrence');
  });

  check('Prompt and Quick handling remain outside this change', () => {
    // Prompts/Quick are still addressed by id — explicitly out of scope here.
    assert.match(CODE, /STATE_PM\.data\.prompts\.find\(x => x\.id === id\)/,
      'Prompt id addressing must be unchanged');
    assert.match(CODE, /STATE_PM\.data\.quick\.findIndex\(q => q\.id === qid\)/,
      'Quick id addressing must be unchanged');
    assert.doesNotMatch(CODE, /data-qidx=|data-qsnap=/, 'Quick must not gain occurrence addressing here');
  });

  check('the id-only History lookup and filter-delete are gone', () => {
    assert.doesNotMatch(CODE, /hist\.find\(h => h\.id === hid\)/,
      'the id-only History lookup must be gone');
    assert.doesNotMatch(CODE, /hist\.findIndex\(h => h\.id === hid\)/,
      'the id-only History index lookup must be gone');
    assert.doesNotMatch(CODE, /hist\.filter\(h => h\.id !== hid\)/,
      'filter-by-id delete removes every duplicate id and must be gone');
  });

  check('History deletion removes exactly one verified occurrence', () => {
    assert.match(CODE, /const next = hist\.slice\(\);\s*\n\s*next\.splice\(Number\(hidx\), 1\);/,
      'delete must splice a single occurrence from a copy of the full collection');
    assert.match(CODE, /sentHistoryEntries\(\) \{[\s\S]*?out\.push\(\{ item, fullIndex, snapshot: ENGINE_PM_captureSnapshot\(item\) \}\);/,
      'the sent-entry helper must pair each item with its index AND exact snapshot');
    // Cards must carry the index.
    assert.equal((SRC.match(/data-hidx="\$\{UTIL_escapeHtml\(String\(fullIndex\)\)\}"/g) || []).length, 2,
      'both History renders must emit the occurrence index on each card');
  });

  check('the quarantine implementation is unchanged by this pass', () => {
    const m = SRC.match(/  const ENGINE_PM_quarantine = [\s\S]*?\n  \};/);
    assert.ok(m, 'ENGINE_PM_quarantine not found');
    const digest = crypto.createHash('sha256').update(m[0]).digest('hex');
    assert.equal(digest, PINNED_QUARANTINE_SHA256,
      'the quarantine implementation passed independent review and must not change');
  });

  check('the production source contains no raw control characters', () => {
    // A NUL written as a raw byte rather than a backslash-u escape is invisible in
    // review, survives copy/paste badly and can confuse tooling.
    const bad = [];
    SRC.split('\n').forEach((line, i) => {
      for (const ch of line) {
        if (ch.charCodeAt(0) < 32 && ch !== '\t') { bad.push(i + 1); break; }
      }
    });
    assert.deepEqual(bad, [], `raw control characters on line(s): ${bad.join(', ')}`);
  });

  check('the reorder validator is unchanged by this pass', () => {
    const p = path.join(REPO_ROOT, 'tools/validation/prompt-manager/validate-prompt-manager-reorder-order.mjs');
    const digest = crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
    assert.equal(digest, PINNED_REORDER_SHA256,
      'validate-prompt-manager-reorder-order.mjs must remain byte-identical');
  });

  check('the test hook is flag-gated and does not touch the public API', () => {
    assert.match(CODE, /if \(W\.__H2O_PM_TEST__ === true\)/, 'test hook must be strictly flag-gated');
    const hook = CODE.match(/if \(W\.__H2O_PM_TEST__ === true\)\s*\{[\s\S]*?\n  \}/);
    assert.ok(hook, 'test hook block not found');
    assert.doesNotMatch(hook[0], /MOD_OBJ\.api\./, 'the test hook must not alter the public API');
    assert.equal(
      (CODE.match(/__H2O_PM_TEST__/g) || []).length, 1,
      'the test flag must be referenced exactly once',
    );
  });

  console.log('');
  console.log(`PASS ${PASS.length}`);
  if (FAIL.length) {
    console.log(`FAIL ${FAIL.length}`);
    for (const f of FAIL) console.log(`- ${f.label}: ${f.m}`);
    process.exitCode = 1;
  }
}

main();
