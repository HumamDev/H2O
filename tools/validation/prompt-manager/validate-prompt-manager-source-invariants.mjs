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

// [2C] Portability is additive: it must not reach into the Phase-2B retrieval
// rules at all. Pinning the digest of the ranking block — the constants through
// to the move-availability authority — makes any drift a hard failure rather
// than a scoring change nobody notices until a list looks subtly wrong.
/* [2-storage] Storage keys at the time this mission landed. The classification
 * work adds no schema and no migration, so this count must not move. */
const PINNED_PM_KEY_COUNT = 12;
const PINNED_RANKING_SHA256 = '8d8c7c8c5a516f42faa6c0f4cb4253d51e5e046fb64fd43dbfb41687d6a9de32';

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
    for (const fn of ['savePromptsResult', 'saveQuickResult', 'saveHistory', 'saveDrafts', 'savePasted']) {
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
      ['savePromptsResult', 'STATE_PM.data.prompts', 'persistPrompts'],
      ['saveQuickResult', 'STATE_PM.data.quick', 'persistQuick'],
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

        // A failed persist must short-circuit before adoption/emit. The
        // classified path returns the failing result itself rather than false.
        const iShort = body.indexOf('if (!res.ok) return res;');
        assert.ok(iShort >= 0 && iShort < iAdopt,
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

  /* ═══════════════════════════ PHASE 2A INVARIANTS ═══════════════════════════
   * Every assertion below runs against CODE (comments stripped), so explanatory
   * prose containing words like "prompt", "confirm" or "alert" can never make
   * them pass or fail. */

  check('[2A] no active native prompt()/confirm()/alert() call remains', () => {
    // Word-boundary + call syntax, on comment-stripped code only. `.prompt(` and
    // identifiers such as `convertToPrompt(` are deliberately excluded.
    for (const name of ['prompt', 'confirm', 'alert']) {
      const re = new RegExp(`(^|[^\\w.$])${name}\\s*\\(`, 'g');
      const hits = CODE.match(re) || [];
      assert.equal(hits.length, 0, `found ${hits.length} active ${name}( call site(s)`);
    }
  });

  check('[2A] the editor persists only through the approved commit helpers', () => {
    const ed = CODE.match(/const EDITOR_PM = \{[\s\S]*?\n  \};/);
    assert.ok(ed, 'EDITOR_PM block not found');
    assert.match(ed[0], /ENGINE_PM\.commitPromptsResult\(/, 'prompt writes must use commitPromptsResult');
    assert.match(ed[0], /ENGINE_PM\.commitQuickResult\(/, 'quick writes must use commitQuickResult');
    // No direct storage access from the editor.
    assert.doesNotMatch(ed[0], /UTIL_storage\.set/, 'editor must not write storage directly');
    assert.doesNotMatch(ed[0], /localStorage/, 'editor must not touch localStorage directly');
  });

  check('[2A] a failed editor commit never reports success', () => {
    const ed = CODE.match(/const EDITOR_PM = \{[\s\S]*?\n  \};/)[0];
    // Every commit call in the editor is guarded and returns false on failure.
    /* Scoped to STORAGE-write guards. A bare `if (!x.ok)` also matches the
     * editor's validation guard, which never touches storage. */
    const guards = ed.match(/if \(!\w+\.ok\)\s*\{[^}]*FEEDBACK_PM_writeFailure\([^)]*\);[^}]*return false;/g) || [];
    assert.ok(guards.length >= 4, `expected >=4 guarded commits, found ${guards.length}`);
    for (const g of guards) {
      assert.match(g, /FEEDBACK_PM_writeFailure\(\w+, root\)/, 'failure must raise the shared classified status');
    }
  });

  check('[2A] a per-prompt auto-send field is NOT introduced', () => {
    /* [2B] This case originally also forbade `lastUsedAt` and `useCount`, which
     * was correct while Phase 2A was the head: they were Phase 2B surface and
     * had no business appearing early. Phase 2B introduces them by approved
     * design, so that half of the premise is obsolete and only that half is
     * removed — their shape and normalization are now pinned by the [2B] cases
     * and by the ranking validator. `autoSend` stays forbidden as a prompt
     * field, and the record-literal check below is untouched. */
    assert.match(CODE, /const ENGINE_PM_normUsageTs = /, 'usage metadata must be normalized, not raw');
    assert.match(CODE, /const ENGINE_PM_normUseCount = /);
    /* A per-prompt autoSend PROPERTY must not exist. The pre-existing uses are a
     * storage-key map entry and the DOM_setInputText option bag — neither is a
     * record field — so target object literals that also carry `favorite:`,
     * which is what makes a literal a prompt record. */
    const recordLiterals = CODE.match(/\{[^{}]*favorite\s*:[^{}]*\}/g) || [];
    assert.ok(recordLiterals.length > 0, 'no prompt-record literals found to inspect');
    for (const lit of recordLiterals) {
      assert.doesNotMatch(lit, /autoSend/, 'prompt records must not carry autoSend in Phase 2A');
      assert.doesNotMatch(lit, /lastUsedAt|useCount/, 'prompt records must not carry Phase 2B fields');
    }
  });

  check('[2A] one shared prompt-card builder serves BOTH render paths', () => {
    assert.match(CODE, /const RENDER_PM_promptCard = /, 'shared card builder missing');
    const simple = CODE.match(/renderSimple\(root, filter\)[\s\S]*?\n    \},/);
    const edit = CODE.match(/renderEdit\(root, filter\)[\s\S]*?\n    \},/);
    assert.ok(simple && edit, 'renderers not found');
    assert.match(simple[0], /RENDER_PM_promptCard\(/, 'Simple must use the shared builder');
    assert.match(edit[0], /RENDER_PM_promptCard\(/, 'Edit must use the shared builder');
    assert.equal((CODE.match(/RENDER_PM_promptCard\(/g) || []).length, 2,
      'exactly two call sites — one per renderer, no third copy');
  });

  check('[2A] one shared prompt-card tooltip binder serves both renderers', () => {
    assert.match(CODE, /const RENDER_PM_bindPromptTooltips = /);
    assert.equal((CODE.match(/RENDER_PM_bindPromptTooltips\(/g) || []).length, 2,
      'exactly two call sites — one per renderer, no third copy');
  });

  check('[2A] the favourite control is a button carrying aria-pressed', () => {
    const card = CODE.match(/const RENDER_PM_promptCard = [\s\S]*?\n  \};/)[0];
    assert.match(card, /<button[^`]*--star/, 'favourite must be a <button>');
    assert.match(card, /aria-pressed=/, 'favourite must expose aria-pressed');
    assert.match(card, /aria-label=/, 'favourite must expose an accessible label');
  });

  check('[2A] the prompt/append type badge is rendered', () => {
    const card = CODE.match(/const RENDER_PM_promptCard = [\s\S]*?\n  \};/)[0];
    assert.match(card, /--badge/, 'type badge class missing');
    assert.match(card, /isAppend \? 'Append' : 'Prompt'/, 'badge must reflect the record type');
  });

  check('[2A] the two-line preview clamp exists in markup and CSS', () => {
    assert.match(CODE, /--prev-clamp/, 'clamp class missing from markup');
    assert.match(CODE, /-webkit-line-clamp:\s*2/, 'CSS clamp missing');
    assert.match(CODE, /max-height:\s*2\.8em/, 'non-webkit fallback missing');
  });

  check('[2A] the feedback region is a polite live status region', () => {
    assert.match(CODE, /role="status"/, 'status role missing');
    assert.match(CODE, /aria-live="polite"/, 'aria-live missing');
    assert.equal(CODE.split('="${UI_PM_STATUS}"').length - 1, 1,
      'exactly one status surface is mounted');
  });

  check('[2A] error feedback does not auto-clear', () => {
    const fb = CODE.match(/const FEEDBACK_PM = \{[\s\S]*?\n  \};/)[0];
    assert.match(fb, /if \(kind !== 'error'\)/, 'auto-clear must be gated to non-error kinds');
  });

  check('[2A] editor and feedback timers use the OWNED timer helpers', () => {
    const ed = CODE.match(/const EDITOR_PM = \{[\s\S]*?\n  \};/)[0];
    const fb = CODE.match(/const FEEDBACK_PM = \{[\s\S]*?\n  \};/)[0];
    for (const [name, blk] of [['EDITOR_PM', ed], ['FEEDBACK_PM', fb]]) {
      assert.doesNotMatch(blk, /(^|[^\w.$])setTimeout\s*\(/, `${name} must not call raw setTimeout`);
      assert.doesNotMatch(blk, /(^|[^\w.$])clearTimeout\s*\(/, `${name} must not call raw clearTimeout`);
    }
    assert.match(ed, /CLEAN_setTimeout\(/);
    assert.match(fb, /CLEAN_setTimeout\(/);
  });

  check('[2A] Duplicate is offered on prompt cards only, in Edit mode', () => {
    const card = CODE.match(/const RENDER_PM_promptCard = [\s\S]*?\n  \};/)[0];
    assert.equal((card.match(/data-act="duplicate"/g) || []).length, 1,
      'exactly one duplicate control, in the edit branch');
    // The simple branch is the trailing return; it must not carry the action.
    const simpleBranch = card.slice(card.lastIndexOf('return `'));
    assert.doesNotMatch(simpleBranch, /data-act="duplicate"/, 'simple cards must not offer Duplicate');
  });

  check('[2A] duplicate persists before adopting and leaves no phantom', () => {
    const dup = CODE.match(/if \(act === 'duplicate'\)[\s\S]*?\n          \}/);
    assert.ok(dup, 'duplicate handler not found');
    assert.match(dup[0], /const \w+ = ENGINE_PM\.commitPromptsResult\(next\);/, 'must persist before adopting');
    assert.match(dup[0], /ENGINE_PM_buildDuplicate\(/);
    assert.match(dup[0], /ENGINE_PM_insertAfterId\(/);
  });

  check('[2A] conversion de-duplication routes through the ONE existing helper', () => {
    assert.equal((CODE.match(/const convertToPrompt = /g) || []).length, 1,
      'there must remain exactly one conversion helper');
    const conv = CODE.match(/const convertToPrompt = [\s\S]*?\n      \};/)[0];
    assert.match(conv, /ENGINE_PM_findConvDuplicate\(/, 'dedup must live in the shared helper');
    assert.match(conv, /ENGINE_PM_normalizeConvBody\(/);
    assert.match(conv, /ENGINE_PM_convTitle\(/);
  });

  check('[2A] conversion duplicates require same normalized body AND same type', () => {
    const f = CODE.match(/const ENGINE_PM_findConvDuplicate = [\s\S]*?\n  \};/)[0];
    assert.match(f, /!== wantType\) continue;/, 'type must be part of the duplicate test');
    assert.match(f, /ENGINE_PM_normalizeConvBody\(p\.body\) === normBody/, 'body must compare normalized');
    assert.doesNotMatch(f, /toLowerCase\(\)/, 'case differences must remain distinct');
    assert.doesNotMatch(f, /\.title/, 'title must never be duplication authority');
  });

  check('[2A] conversion body normalization is CRLF/CR → LF plus outer trim only', () => {
    const n = CODE.match(/const ENGINE_PM_normalizeConvBody = [\s\S]*?;\n/)[0];
    assert.match(n, /replace\(\/\\r\\n\?\/g, '\\n'\)/, 'CRLF and bare CR must both fold to LF');
    assert.match(n, /\.trim\(\)/, 'outer whitespace must be trimmed');
    assert.doesNotMatch(n, /toLowerCase|toUpperCase/, 'case must be preserved');
  });

  check('[2A] prompt and quick delete no longer use a native confirm', () => {
    const del = CODE.match(/if \(act === 'delete' \|\| act === 'edit'\)[\s\S]*?\n          \}/g) || [];
    assert.ok(del.length >= 1, 'combined delete/edit handler not found');
    for (const blk of del) {
      assert.match(blk, /EDITOR_PM\.open\(/, 'delete must route through the editor');
      assert.doesNotMatch(blk, /(^|[^\w.$])confirm\s*\(/, 'no native confirm');
    }
    assert.match(CODE, /armDelete\(root\)/, 'inline two-step delete arm missing');
  });

  check('[2A] Escape is consumed by an open editor before the panel closes', () => {
    const esc = CODE.match(/attachEscClose\(getPanelOpen, closePanel\)[\s\S]*?\n    \},/)[0];
    assert.match(esc, /EDITOR_PM\.isOpen\(\)/, 'editor must be checked first');
    const guardIdx = esc.indexOf('EDITOR_PM.isOpen()');
    const closeIdx = esc.lastIndexOf('closePanel();');
    assert.ok(guardIdx < closeIdx, 'the editor guard must precede closePanel()');
  });

  check('[2A] the old inline add-form and its tokens are fully removed', () => {
    for (const tok of ['UI_PM_ADD_TITLE', 'UI_PM_ADD_BODY', 'UI_PM_ADD_BTN']) {
      assert.doesNotMatch(CODE, new RegExp(`\\b${tok}\\b`), `${tok} must be gone, not merely unused`);
    }
  });

  check('[2A] capture-surface occurrence markup was NOT folded into the card builder', () => {
    const card = CODE.match(/const RENDER_PM_promptCard = [\s\S]*?\n  \};/)[0];
    for (const attr of ['data-hidx', 'data-hsnap', 'data-didx', 'data-dsnap', 'data-pidx', 'data-psnap']) {
      assert.doesNotMatch(card, new RegExp(attr), `${attr} must stay with the capture renderers`);
    }
  });

  /* ══════════════ PHASE 2A AUDIT CORRECTIONS ══════════════ */

  check('[fix A] Back consults the editor and cannot switch mode past a dirty one', () => {
    const back = CODE.match(/if \(btnBack\) \{[\s\S]*?\n      \}/);
    assert.ok(back, 'Back handler not found');
    assert.match(back[0], /if \(!EDITOR_PM\.requestBack\(root\)\) return;/,
      'Back must consult EDITOR_PM.requestBack and bail when denied');
    const guardIdx = back[0].indexOf('EDITOR_PM.requestBack');
    const modeIdx = back[0].indexOf("RENDER_PM.setMode(root, 'simple')");
    assert.ok(guardIdx !== -1 && guardIdx < modeIdx,
      'the guard must precede the mode switch, not follow it');
  });

  check('[fix A] requestBack denies on a dirty editor and permits otherwise', () => {
    const rb = CODE.match(/requestBack\(root\) \{[\s\S]*?\n    \},/);
    assert.ok(rb, 'requestBack not found');
    assert.match(rb[0], /if \(!st\.open\) return true;/, 'closed editor permits Back');
    assert.match(rb[0], /return EDITOR_PM\.cancel\(root\);/,
      'open editor delegates to cancel(), which returns false while dirty');
  });

  check('[fix B] boot re-syncs an open editor onto the freshly mounted root', () => {
    const boot = CODE.match(/RENDER_PM\.setMode\(root, ENGINE_PM\.getUiMode\(\)\);[\s\S]*?renderQuickTray\(root\);/);
    assert.ok(boot, 'boot render block not found');
    assert.match(boot[0], /EDITOR_PM\.restore\(root\);/,
      'a remounted root must reapply surviving editor state');
  });

  check('[fix B] openPanel restores an open editor instead of focusing the list search', () => {
    const op = CODE.match(/function UI_PM_openPanel\(opts\) \{[\s\S]*?\n  \}/);
    assert.ok(op, 'UI_PM_openPanel not found');
    assert.match(op[0], /const editorRestored = EDITOR_PM\.restore\(root\);/);
    assert.match(op[0], /if \(editorRestored\) \{ EDITOR_PM\.focusPrimary\(root\); return; \}/,
      'an open editor must receive focus, not the hidden list search box');
  });

  check('[fix B] restore() makes Edit mode authoritative before syncing', () => {
    const r = CODE.match(/restore\(root\) \{[\s\S]*?\n    \},/);
    assert.ok(r, 'restore not found');
    const modeIdx = r[0].indexOf("RENDER_PM.setMode(root, 'edit')");
    const syncIdx = r[0].indexOf('EDITOR_PM.sync(root);\n        return true;');
    assert.ok(modeIdx !== -1, 'Edit mode must be forced');
    assert.ok(modeIdx < r[0].lastIndexOf('EDITOR_PM.sync(root)'),
      'mode must be set BEFORE sync so the editor is never hidden behind the list');
  });

  check('[fix B] dispose resets transient editor confirmation state', () => {
    const d = CODE.match(/function CORE_PM_dispose\(\) \{[\s\S]*?\n  \}/);
    assert.ok(d, 'CORE_PM_dispose not found');
    assert.match(d[0], /EDITOR_PM\.resetTransient\(\)/,
      'dispose must drop deleteArmed/discardArmed and the stale timer id');
  });

  check('[fix B] resetTransient clears both arms and the stale timer id', () => {
    const rt = CODE.match(/resetTransient\(\) \{[\s\S]*?\n    \},/);
    assert.ok(rt, 'resetTransient not found');
    assert.match(rt[0], /st\.deleteArmed = false;/);
    assert.match(rt[0], /st\.discardArmed = false;/);
    assert.match(rt[0], /STATE_PM\.ui\.editorDeleteTimer = 0;/);
    // the unsaved draft must NOT be cleared here
    assert.doesNotMatch(rt[0], /st\.draft = null|st\.open = false/,
      'the unsaved draft must survive a transient reset');
  });

  check('[fix C] conversion title no longer slices raw UTF-16 units', () => {
    const ct = CODE.match(/const ENGINE_PM_convTitle = [\s\S]*?\n  \};/);
    assert.ok(ct, 'convTitle not found');
    assert.doesNotMatch(ct[0], /line\.slice\(0, PM_CONV_TITLE_MAX\)/,
      'the unsafe UTF-16 slice must be gone');
    assert.match(ct[0], /Array\.from\(line\)/, 'truncation must iterate code points');
    assert.match(ct[0], /chars\.slice\(0, PM_CONV_TITLE_MAX\)\.join\(''\)/);
  });

  check('[fix D] manual feedback hide cancels the pending clear timer', () => {
    const hide = CODE.match(/hide\(root = \(STATE_PM\.ui\.root \|\| UI_PM\.getRoot\(\)\)\) \{[\s\S]*?\n    \},/);
    assert.ok(hide, 'FEEDBACK_PM.hide not found');
    assert.match(hide[0], /FEEDBACK_PM\.clearTimer\(\);/,
      'hide must cancel any pending owned auto-clear');
  });

  check('[fix D] closing the editor clears editor-scoped feedback', () => {
    const close = CODE.match(/close\(root\) \{[\s\S]*?\n    \},/);
    assert.ok(close, 'EDITOR_PM.close not found');
    assert.match(close[0], /FEEDBACK_PM\.hide\(root\);/,
      'a validation error must not outlive the editor that produced it');
  });

  check('[fix] favourite write failure reports through FEEDBACK_PM', () => {
    const tf = CODE.match(/const toggleFavorite = [\s\S]*?\n      \};/);
    assert.ok(tf, 'toggleFavorite not found');
    assert.match(tf[0], /const \w+ = ENGINE_PM\.commitPromptsResult\(next\);[\s\S]*?if \(!\w+\.ok\) \{[\s\S]*?FEEDBACK_PM_writeFailure\(\w+, root\);[\s\S]*?return false;/,
      'a failed favourite commit must raise persistent error feedback');
    // the unknown-id early return must stay silent — it never attempted a write
    const early = tf[0].slice(0, tf[0].indexOf('const now'));
    assert.doesNotMatch(early, /FEEDBACK_PM/,
      'an unknown id must not report a storage failure it never attempted');
  });

  check('[fix] the corrections introduced no out-of-scope surface', () => {
    /* [2B] `lastUsedAt`, `useCount`, the Favorites filter token and rankPrompts
     * were listed here as future surface that Phase 2A must not anticipate.
     * Phase 2B ships them deliberately, so they move out of this prohibition
     * and into the [2B] cases that pin their exact shape.
     *
     * [2C] `createObjectURL` and a backup key were listed for the same reason:
     * they were Phase 2C's surface, and Phase 2A must not have grown them
     * early. Phase 2C now ships both under an explicit contract, so they move
     * out of this list and into the [2C] cases that pin their exact shape —
     * exactly one download helper, exactly one backup key, and a write order
     * proven by 2C-I13/2C-I14/2C-I17. The prohibition is not weakened: what
     * remains listed is what is STILL out of scope, plus the spellings Phase 2C
     * deliberately did not adopt. */
    for (const pat of [/LIBRARY_PM/, /schemaVersion/, /\bexportPrompts\b/, /\bimportPrompts\b/,
                       /:backup:/]) {
      assert.doesNotMatch(CODE, pat, `out-of-scope surface leaked: ${pat}`);
    }
    // The one download helper that Phase 2C does ship stays bounded to it.
    assert.equal((CODE.match(/createObjectURL/g) || []).length, 1,
      'exactly one object-URL creation site, and it lives in the portability block');
    assert.ok(SRC.indexOf('URL.createObjectURL') > SRC.indexOf('📦 PORTABILITY — controller'),
      'that site is inside the portability controller');
  });

  /* ══════════════ STALE TARGET + PERSISTENT FEEDBACK CLOSURE ══════════════ */

  const SAVE = CODE.match(/    save\(root\) \{[\s\S]*?\n    \},/);
  const DEL = CODE.match(/    confirmDelete\(root\) \{[\s\S]*?\n    \},/);

  check('[fix E] hasTarget answers existence only, tolerating holes and bad ids', () => {
    const h = CODE.match(/const EDITOR_PM_hasTarget = [\s\S]*?\n  \};/);
    assert.ok(h, 'EDITOR_PM_hasTarget not found');
    assert.match(h[0], /if \(!Array\.isArray\(list\) \|\| id == null \|\| id === ''\) return false;/,
      'a non-array list or an empty id can never match a target');
    assert.match(h[0], /return list\.some\(x => x && x\.id === id\);/,
      'existence is a plain some() over ids — no dedup, no ranking, no repair');
    // Phase 2A boundary: this must not creep into duplicate-ID policy.
    assert.doesNotMatch(h[0], /filter|reduce|Map|Set|indexOf|lastIndexOf/,
      'duplicate-ID semantics are explicitly out of scope for this pass');
  });

  check('[fix E] edit-mode prompt save checks target existence BEFORE commitPrompts', () => {
    assert.ok(SAVE, 'EDITOR_PM.save not found');
    const body = SAVE[0];
    const tail = body.slice(body.indexOf('const list = STATE_PM.data.prompts'));
    const guardIdx = tail.indexOf("st.mode === 'edit' && !EDITOR_PM_hasTarget(list, st.id)");
    const commitIdx = tail.indexOf('ENGINE_PM.commitPromptsResult(next)');
    assert.ok(guardIdx !== -1, 'the prompt save path must guard the stale target');
    assert.ok(commitIdx !== -1 && guardIdx < commitIdx,
      'the guard must precede the commit, never follow it');
  });

  check('[fix E] edit-mode quick save checks target existence BEFORE commitQuick', () => {
    const body = SAVE[0];
    const q = body.slice(body.indexOf("if (st.kind === 'quick')"), body.indexOf('const title ='));
    const guardIdx = q.indexOf("st.mode === 'edit' && !EDITOR_PM_hasTarget(list, st.id)");
    const commitIdx = q.indexOf('ENGINE_PM.commitQuickResult(next)');
    assert.ok(guardIdx !== -1, 'the quick save path must guard the stale target');
    assert.ok(commitIdx !== -1 && guardIdx < commitIdx, 'guard precedes commit');
  });

  check('[fix E] both save guards are independent and both report the same message', () => {
    const body = SAVE[0];
    const guards = body.match(/st\.mode === 'edit' && !EDITOR_PM_hasTarget\(/g) || [];
    assert.equal(guards.length, 2, 'exactly one guard for Prompt and one for Quick');
    const says = body.match(/FEEDBACK_PM\.say\(PM_MSG_TARGET_GONE, 'error', root\);/g) || [];
    assert.equal(says.length, 2, 'each guard reports the stale target persistently');
  });

  check('[fix E] prompt delete checks target existence BEFORE its commit', () => {
    assert.ok(DEL, 'EDITOR_PM.confirmDelete not found');
    const body = DEL[0];
    const p = body.slice(body.indexOf('const plist = STATE_PM.data.prompts'));
    const guardIdx = p.indexOf('!EDITOR_PM_hasTarget(plist, st.id)');
    const filterIdx = p.indexOf('plist.filter(');
    const commitIdx = p.indexOf('ENGINE_PM.commitPromptsResult(next)');
    assert.ok(guardIdx !== -1, 'the prompt delete path must guard the stale target');
    assert.ok(guardIdx < filterIdx, 'the guard must precede candidate construction');
    assert.ok(guardIdx < commitIdx, 'the guard must precede the commit');
  });

  check('[fix E] quick delete checks target existence BEFORE its commit', () => {
    const body = DEL[0];
    const q = body.slice(body.indexOf("if (st.kind === 'quick')"), body.indexOf('const plist ='));
    const guardIdx = q.indexOf('!EDITOR_PM_hasTarget(list, st.id)');
    const filterIdx = q.indexOf('.filter(q => q && q.id !== st.id)');
    const commitIdx = q.indexOf('ENGINE_PM.commitQuickResult(next)');
    assert.ok(guardIdx !== -1, 'the quick delete path must guard the stale target');
    assert.ok(guardIdx < filterIdx, 'the guard must precede candidate construction');
    assert.ok(guardIdx < commitIdx, 'the guard must precede the commit');
  });

  check('[fix E] a missing target cannot reach the Saved branch', () => {
    for (const seg of [
      SAVE[0].slice(SAVE[0].indexOf("if (st.kind === 'quick')"), SAVE[0].indexOf('const title =')),
      SAVE[0].slice(SAVE[0].indexOf('const list = STATE_PM.data.prompts')),
    ]) {
      const guardIdx = seg.indexOf('EDITOR_PM_hasTarget');
      const savedIdx = seg.indexOf("FEEDBACK_PM.say('Saved', 'info', root)");
      assert.ok(guardIdx !== -1 && savedIdx !== -1 && guardIdx < savedIdx,
        'the stale-target guard must dominate the Saved report');
      // the guard's own branch must return false without committing or closing
      const branch = seg.slice(guardIdx, seg.indexOf('const next ='));
      assert.match(branch, /return false;/, 'the guard returns false');
      assert.doesNotMatch(branch, /ENGINE_PM\.commit(Prompts|Quick)/, 'no commit inside the guard');
      assert.doesNotMatch(branch, /EDITOR_PM\.close\(/, 'the editor must stay open');
    }
  });

  check('[fix E] a missing target cannot reach the Deleted branch', () => {
    for (const seg of [
      DEL[0].slice(DEL[0].indexOf("if (st.kind === 'quick')"), DEL[0].indexOf('const plist =')),
      DEL[0].slice(DEL[0].indexOf('const plist = STATE_PM.data.prompts')),
    ]) {
      const guardIdx = seg.indexOf('EDITOR_PM_hasTarget');
      const delIdx = seg.indexOf("FEEDBACK_PM.say('Deleted', 'info', root)");
      assert.ok(guardIdx !== -1 && delIdx !== -1 && guardIdx < delIdx,
        'the stale-target guard must dominate the Deleted report');
      const branch = seg.slice(guardIdx, seg.indexOf('const next ='));
      assert.match(branch, /EDITOR_PM\.disarmDelete\(\);/, 'the confirmation must be disarmed');
      assert.match(branch, /return false;/);
      assert.doesNotMatch(branch, /ENGINE_PM\.commit(Prompts|Quick)/, 'no commit inside the guard');
      assert.doesNotMatch(branch, /EDITOR_PM\.close\(/, 'the editor must stay open');
    }
  });

  check('[fix E] the stale-target message is a single shared constant', () => {
    assert.match(CODE, /const PM_MSG_TARGET_GONE = 'Item no longer exists';/,
      'one constant, so Prompt and Quick can never drift apart');
    const literals = CODE.match(/'Item no longer exists'/g) || [];
    assert.equal(literals.length, 1, 'the literal appears exactly once, at its definition');
  });

  check('[fix E] a vanished item is never recreated, appended or repaired', () => {
    for (const body of [SAVE[0], DEL[0]]) {
      const guards = body.split('EDITOR_PM_hasTarget').slice(1);
      for (const g of guards) {
        const branch = g.slice(0, g.indexOf('return false;'));
        assert.doesNotMatch(branch, /concat|push|splice|UTIL_cryptoId/,
          'a missing target must fail, never be silently re-created');
      }
    }
  });

  check('[fix F] the persistent feedback authority lives in STATE_PM.ui, not storage', () => {
    const ui = CODE.match(/    ui: \{[\s\S]*?\n    \},/);
    assert.ok(ui, 'STATE_PM.ui not found');
    assert.match(ui[0], /feedback: \{ message: '', kind: '' \}/,
      'the status line needs a state authority to survive a remount');
    // memory only — no new storage key may be introduced for it
    assert.doesNotMatch(CODE, /KEY_PM_[A-Z_]*FEEDBACK/, 'feedback must never be persisted to storage');
    assert.doesNotMatch(CODE, /(setItem|getItem)\([^)]*feedback/i, 'no direct feedback storage access');
  });

  check('[fix F] say() writes the authority before touching the DOM', () => {
    const say = CODE.match(/    say\(message, kind = 'info'[\s\S]*?\n    \},/);
    assert.ok(say, 'FEEDBACK_PM.say not found');
    const stateIdx = say[0].indexOf('STATE_PM.ui.feedback = {');
    const elIdx = say[0].indexOf('const el = FEEDBACK_PM.el(root);');
    assert.ok(stateIdx !== -1, 'say must record the authority');
    assert.ok(stateIdx < elIdx,
      'an error raised while the root is missing must still be recorded');
    assert.match(say[0], /kind === 'error'\) \? 'error' :/, 'the kind is normalised');
  });

  check('[fix F] say() keeps errors persistent and info auto-clearing', () => {
    const say = CODE.match(/    say\(message, kind = 'info'[\s\S]*?\n    \},/);
    assert.match(say[0], /if \(kind !== 'error'\) \{[\s\S]*?CLEAN_setTimeout\(/,
      'only non-error feedback may schedule an auto-clear');
    const timerIdx = say[0].indexOf('CLEAN_setTimeout(');
    const guardIdx = say[0].indexOf("if (kind !== 'error')");
    assert.ok(guardIdx !== -1 && guardIdx < timerIdx, 'the error guard dominates the timer');
  });

  check('[fix F] hide() clears the authority as well as the DOM', () => {
    const hide = CODE.match(/    hide\(root = \(STATE_PM\.ui\.root \|\| UI_PM\.getRoot\(\)\)\) \{[\s\S]*?\n    \},/);
    assert.ok(hide, 'FEEDBACK_PM.hide not found');
    assert.match(hide[0], /STATE_PM\.ui\.feedback = \{ message: '', kind: '' \};/,
      'a dismissal must not leave an error that reappears at the next remount');
    const clearIdx = hide[0].indexOf('STATE_PM.ui.feedback = {');
    const elIdx = hide[0].indexOf('const el = FEEDBACK_PM.el(root);');
    assert.ok(clearIdx < elIdx, 'the authority clears even when no node is mounted');
  });

  check('[fix F] clearTransient preserves errors and drops everything else', () => {
    const ct = CODE.match(/    clearTransient\(\) \{[\s\S]*?\n    \},/);
    assert.ok(ct, 'FEEDBACK_PM.clearTransient not found');
    assert.match(ct[0], /if \(!fb \|\| fb\.kind === 'error'\) return false;/,
      'a persistent error must survive disposal');
    assert.match(ct[0], /STATE_PM\.ui\.feedback = \{ message: '', kind: '' \};/);
    assert.doesNotMatch(ct[0], /CLEAN_setTimeout|setTimeout/, 'clearing must never create a timer');
  });

  check('[fix F] restore() re-applies a persistent error and creates no timer', () => {
    const r = CODE.match(/    restore\(root = \(STATE_PM\.ui\.root \|\| UI_PM\.getRoot\(\)\)\) \{[\s\S]*?\n    \},/);
    assert.ok(r, 'FEEDBACK_PM.restore not found');
    assert.match(r[0], /FEEDBACK_PM\.clearTransient\(\);/,
      'transient feedback is dropped before deciding what to restore');
    assert.match(r[0], /fb\.kind !== 'error' \|\| !fb\.message\) return false;/,
      'only a non-empty error is restored');
    assert.match(r[0], /status-err/, 'error styling is restored, not just the text');
    assert.doesNotMatch(r[0], /CLEAN_setTimeout|setTimeout/,
      'a restored error must never be scheduled away');
    assert.doesNotMatch(r[0], /STATE_PM\.ui\.feedback = \{ message: '', kind: '' \}/,
      'restore must not consume the authority it just restored');
  });

  check('[fix F] boot restores persistent feedback AFTER the editor is restored', () => {
    const boot = CODE.match(/RENDER_PM\.setMode\(root, ENGINE_PM\.getUiMode\(\)\);[\s\S]*?renderQuickTray\(root\);/);
    assert.ok(boot, 'boot render block not found');
    const edIdx = boot[0].indexOf('EDITOR_PM.restore(root);');
    const fbIdx = boot[0].indexOf('FEEDBACK_PM.restore(root);');
    assert.ok(fbIdx !== -1, 'a remounted root must reapply a surviving persistent error');
    assert.ok(edIdx !== -1 && edIdx < fbIdx,
      'editor restoration must not run after — and so risk disturbing — the restored error');
  });

  check('[fix F] openPanel restores persistent feedback after the editor', () => {
    const op = CODE.match(/function UI_PM_openPanel\(opts\) \{[\s\S]*?\n  \}/);
    assert.ok(op, 'UI_PM_openPanel not found');
    const edIdx = op[0].indexOf('const editorRestored = EDITOR_PM.restore(root);');
    const fbIdx = op[0].indexOf('FEEDBACK_PM.restore(root);');
    assert.ok(fbIdx !== -1 && edIdx !== -1 && edIdx < fbIdx);
  });

  check('[fix F] editor restore() is recovery, not a user action: it clears no feedback', () => {
    const r = CODE.match(/    restore\(root\) \{[\s\S]*?\n    \},/);
    assert.ok(r, 'EDITOR_PM.restore not found');
    assert.doesNotMatch(r[0], /FEEDBACK_PM\.hide\(/,
      'self-heal must not dismiss the failure the user has not seen resolved');
    // by contrast open() — a genuine new action — still clears it
    const open = CODE.match(/    open\(root, \{ kind = 'prompt'[\s\S]*?\n    \},/);
    assert.ok(open, 'EDITOR_PM.open not found');
    assert.match(open[0], /FEEDBACK_PM\.hide\(root\);/,
      'starting a new editor action still supersedes old feedback');
  });

  check('[fix F] dispose drops transient feedback but keeps a persistent error', () => {
    const d = CODE.match(/function CORE_PM_dispose\(\) \{[\s\S]*?\n  \}/);
    assert.ok(d, 'CORE_PM_dispose not found');
    assert.match(d[0], /FEEDBACK_PM\.clearTransient\(\)/,
      'an info line whose timer was just drained must not be resurrected');
    assert.match(d[0], /STATE_PM\.ui\.statusTimer = 0;/, 'the dead timer id is zeroed');
    assert.doesNotMatch(d[0], /FEEDBACK_PM\.hide\(/,
      'disposal must not dismiss a persistent error');
    assert.doesNotMatch(d[0], /FEEDBACK_PM\.say\(/, 'disposal raises no new feedback');
  });

  check('[fix E/F] the closure introduced no out-of-scope surface', () => {
    for (const pat of [/mergeConflict/i, /\bonStorageEvent\b/i, /BroadcastChannel/,
                       /\bexportPrompts\b/, /\bimportPrompts\b/, /autoSend:\s*!!/]) {
      assert.doesNotMatch(CODE, pat, `out-of-scope surface leaked: ${pat}`);
    }
    // duplicate-ID policy stays explicitly deferred
    assert.doesNotMatch(CODE, /dedupeById|duplicateIdPolicy|resolveDuplicateId/,
      'duplicate-ID redesign remains outside Phase 2A');
  });


  /* ══════════════ PHASE 2B — RETRIEVAL, FAVOURITES, USAGE ══════════════ */

  check('[2B] usage metadata is exactly lastUsedAt + useCount, and no autoSend field', () => {
    assert.match(CODE, /const ENGINE_PM_normUsageTs = /);
    assert.match(CODE, /const ENGINE_PM_normUseCount = /);
    // the two fields exist only as OPTIONAL prompt metadata written by usage
    const touch = CODE.match(/const ENGINE_PM_touchPromptUsage = [\s\S]*?\n  \};/);
    assert.ok(touch, 'touchPromptUsage not found');
    assert.match(touch[0], /lastUsedAt: ENGINE_PM_normUsageTs\(now\)/);
    assert.match(touch[0], /useCount: ENGINE_PM_normUseCount\(p\.useCount\) \+ 1/);
    // no per-prompt autoSend anywhere: the only autoSend is the global config key
    assert.doesNotMatch(CODE, /autoSend:\s*!!p\.|p\.autoSend|autoSend:\s*rec\./,
      'Phase 2B must not add a per-prompt autoSend field');
  });

  check('[2B] the normalizers implement exactly the specified acceptance rule', () => {
    const ts = CODE.match(/const ENGINE_PM_normUsageTs = [\s\S]*?\n  \};/)[0];
    assert.match(ts, /Number\.isFinite\(n\) \? n : 0/);
    const uc = CODE.match(/const ENGINE_PM_normUseCount = [\s\S]*?\n  \};/)[0];
    assert.match(uc, /if \(!Number\.isFinite\(n\)\) return 0;/);
    assert.match(uc, /if \(!Number\.isInteger\(n\)\) return 0;/);
    assert.match(uc, /return n >= 0 \? n : 0;/);
  });

  check('[2B] absence is NOT a reason to rewrite storage', () => {
    const lp = CODE.match(/    loadPrompts\(\) \{[\s\S]*?\n    \},/);
    assert.ok(lp, 'loadPrompts not found');
    // only a PRESENT-but-invalid value may set changed
    assert.match(lp[0], /if \(p\.lastUsedAt !== undefined\) \{/);
    assert.match(lp[0], /if \(p\.useCount !== undefined\) \{/);
    assert.doesNotMatch(lp[0], /if \(!p\.lastUsedAt\)|if \(!p\.useCount\)|p\.lastUsedAt = 0; changed|p\.useCount = 0; changed/,
      'a missing field must not mark the list dirty');
  });

  check('[2B] no storage schema version bump and no new key for usage', () => {
    assert.doesNotMatch(CODE, /schemaVersion|SCHEMA_VERSION|:schema:|state:usage|KEY_PM_[A-Z_]*USAGE/,
      'usage metadata must not introduce a schema key or version');
  });

  check('[2B] the exact ranking constants are present with the specified values', () => {
    for (const [name, value] of [
      ['PM_RANK_TITLE_EXACT', 1000], ['PM_RANK_TITLE_PREFIX', 800],
      ['PM_RANK_TITLE_WORD', 600], ['PM_RANK_TITLE_INCLUDES', 400],
      ['PM_RANK_BODY_WORD', 200], ['PM_RANK_BODY_INCLUDES', 100],
      ['PM_RANK_NO_MATCH', 0], ['PM_RANK_FAVORITE_BOOST', 150],
      ['PM_RANK_RECENT_7D_BOOST', 60], ['PM_RANK_RECENT_30D_BOOST', 30],
      ['PM_RANK_USE_UNIT', 5], ['PM_RANK_USE_CAP', 10],
    ]) {
      assert.match(CODE, new RegExp(`const ${name} = ${value};`), `${name} must be exactly ${value}`);
    }
  });

  check('[2B] scoring is integer arithmetic — no floating point', () => {
    const rank = CODE.match(/const ENGINE_PM_rankPrompts = [\s\S]*?\n  \};/)[0];
    assert.doesNotMatch(rank, /Math\.(random|log|pow|sqrt|exp)|\/ *\d|\* *0\.\d/,
      'no division, decimals or transcendental scoring may enter the ranker');
  });

  check('[2B] the recency boosts never stack', () => {
    const rb = CODE.match(/const ENGINE_PM_recencyBoost = [\s\S]*?\n  \};/)[0];
    assert.match(rb, /if \(age <= PM_RANK_WINDOW_7D\) return PM_RANK_RECENT_7D_BOOST;/);
    assert.match(rb, /if \(age <= PM_RANK_WINDOW_30D\) return PM_RANK_RECENT_30D_BOOST;/);
    assert.doesNotMatch(rb, /PM_RANK_RECENT_7D_BOOST \+ PM_RANK_RECENT_30D_BOOST/);
  });

  check('[2B] the usage boost is capped at 10 uses', () => {
    const ub = CODE.match(/const ENGINE_PM_usageBoost = [\s\S]*?;\n/)[0];
    assert.match(ub, /Math\.min\(ENGINE_PM_normUseCount\(useCount\), PM_RANK_USE_CAP\) \* PM_RANK_USE_UNIT/);
  });

  check('[2B] only the highest base tier applies', () => {
    const rb = CODE.match(/const ENGINE_PM_rankBase = [\s\S]*?\n  \};/)[0];
    // each tier returns immediately, so tiers cannot accumulate
    const returns = rb.match(/return PM_RANK_[A-Z_]+;/g) || [];
    assert.equal(returns.length, 7, `expected 7 early returns, found ${returns.length}`);
    assert.doesNotMatch(rb, /score \+=|base \+=/, 'tiers must not accumulate');
  });

  check('[2B] an empty query does NOT sort by recency or useCount', () => {
    const rank = CODE.match(/const ENGINE_PM_rankPrompts = [\s\S]*?\n  \};/)[0];
    const emptyIdx = rank.indexOf('if (!q) {');
    const emptyEnd = rank.indexOf('const scored = [];');
    assert.ok(emptyIdx !== -1 && emptyEnd > emptyIdx, 'empty-query branch not found');
    const branch = rank.slice(emptyIdx, emptyEnd);
    assert.doesNotMatch(branch, /lastUsedAt|useCount|recencyBoost|usageBoost/,
      'the unsearched library must not be reordered by usage signals');
    assert.match(branch, /favorite \? 1 : 0/, 'favourites are pinned first');
    assert.match(branch, /a\.originalIndex - b\.originalIndex/, 'manual order inside each group');
  });

  check('[2B] the original array index is the FINAL tie-break', () => {
    const rank = CODE.match(/const ENGINE_PM_rankPrompts = [\s\S]*?\n  \};/)[0];
    const sortIdx = rank.lastIndexOf('return scored.sort(');
    const chain = rank.slice(sortIdx);
    const order = ['a.score !== b.score', 'favorite ? 1 : 0', 'lastUsedAt', 'useCount', 'a.originalIndex - b.originalIndex'];
    let at = -1;
    for (const key of order) {
      const i = chain.indexOf(key);
      assert.ok(i > at, `tie-break key out of order or missing: ${key}`);
      at = i;
    }
    assert.ok(chain.lastIndexOf('a.originalIndex - b.originalIndex') > chain.lastIndexOf('useCount'),
      'original index must come last');
  });

  check('[2B] ranking never mutates the authoritative array', () => {
    const rank = CODE.match(/const ENGINE_PM_rankPrompts = [\s\S]*?\n  \};/)[0];
    assert.doesNotMatch(rank, /\blist\.sort\(|\barr\.sort\(|\blist\.splice\(|\barr\.splice\(|\blist\.reverse\(/,
      'the input array must never be sorted or spliced in place');
    assert.match(rank, /entries\.slice\(\)\.sort\(/, 'the empty-query view sorts a copy');
  });

  check('[2B] the query reaches RegExp only escaped', () => {
    const esc = CODE.match(/const ENGINE_PM_escapeRegex = [\s\S]*?;\n/)[0];
    assert.match(esc, /replace\(\/\[\.\*\+\?\^\$\{\}\(\)\|\[\\\]\\\\\]\/g, '\\\\\$&'\)/);
    const wb = CODE.match(/const ENGINE_PM_hasWordBoundary = [\s\S]*?\n  \};/)[0];
    assert.match(wb, /ENGINE_PM_escapeRegex\(qLower\)/, 'the boundary regex must escape the query');
    assert.doesNotMatch(wb, /new RegExp\(`[^`]*\$\{qLower\}/, 'a raw query must never be interpolated');
  });

  check('[2B] no fuzzy-search or external ranking dependency', () => {
    /* [2C] The module-loading pattern was `/\bimport\s+[\w{]/`, which is a
     * substring test for the WORD "import" rather than for an import
     * STATEMENT. Phase 2C ships the user-facing message "Unsupported import
     * version", so that spelling now appears legitimately in a string literal.
     * The pattern is narrowed to an actual ES import at the start of a line —
     * which is what this case was always about — and the dynamic form is
     * covered alongside it, so the prohibition is tighter, not looser. */
    for (const pat of [/fuse\.?js/i, /levenshtein/i, /\bfuzzy\b/i, /require\(/,
                       /^\s*import\s+[\w{*]/m, /\bimport\s*\(/, /jaro|winkler|trigram/i]) {
      assert.doesNotMatch(CODE, pat, `external/fuzzy search surface leaked: ${pat}`);
    }
  });

  check('[2B] one shared selection path — Simple and Edit cannot diverge', () => {
    /* [2B-perf] Four call sites now, and every one is named: the two renderers,
     * the retained exact oracle, and the batch availability authority — which
     * ranks the CURRENT view once so a stale DOM fails closed. All four go
     * through the same selection path, which is what keeps the move decision in
     * agreement with what will actually be rendered. */
    const calls = CODE.match(/ENGINE_PM_selectPromptView\(/g) || [];
    assert.equal(calls.length, 4, `expected exactly 4 call sites, found ${calls.length}`);
    const oracle = CODE.match(/const ENGINE_PM_canMovePromptView = [\s\S]*?\n  \};/);
    const batch = CODE.match(/const ENGINE_PM_computeMoveAvailability = [\s\S]*?\n  \};/);
    assert.ok(oracle && batch, 'the non-renderer callers must be the oracle and the batch authority');
    assert.equal((oracle[0].match(/ENGINE_PM_selectPromptView\(/g) || []).length, 1);
    assert.equal((batch[0].match(/ENGINE_PM_selectPromptView\(/g) || []).length, 1,
      'the batch authority ranks the current view exactly once');
    const simple = CODE.match(/    renderSimple\(root, filter\) \{[\s\S]*?\n    \},/);
    const edit = CODE.match(/    renderEdit\(root, filter\) \{[\s\S]*?\n    \},/);
    assert.ok(simple && edit, 'renderers not found');
    assert.match(simple[0], /ENGINE_PM_selectPromptView\(STATE_PM\.data\.prompts, mode, q, UTIL_now\(\)\)/);
    assert.match(edit[0], /ENGINE_PM_selectPromptView\(STATE_PM\.data\.prompts, cat, q, UTIL_now\(\)\)/);
    // the old duplicated substring filter is gone from BOTH renderers
    for (const [name, block] of [['renderSimple', simple[0]], ['renderEdit', edit[0]]]) {
      assert.doesNotMatch(block, /String\(p\.title \|\| ''\)\.toLowerCase\(\)\.includes\(q\)/,
        `${name} must not keep its own Prompt matching rule`);
    }
  });

  check('[2B] ranking is NOT applied to the capture stores or Quick', () => {
    const rankedNames = /ENGINE_PM_(rankPrompts|selectPromptView)\(/g;
    // every call site must sit in a Prompt path — never in a history/draft/pasted/quick block
    for (const block of [
      CODE.match(/const hist = ENGINE_PM\.loadHistory\(\);[\s\S]{0,1200}/),
      CODE.match(/const drafts = ENGINE_PM\.loadDrafts\(\);[\s\S]{0,1200}/),
      CODE.match(/const pasted = ENGINE_PM\.loadPasted\(\);[\s\S]{0,1200}/),
    ]) {
      if (!block) continue;
      assert.doesNotMatch(block[0], rankedNames, 'capture stores must keep their own filtering');
    }
    const sel = CODE.match(/const ENGINE_PM_selectPromptView = [\s\S]*?\n  \};/)[0];
    assert.doesNotMatch(sel, /history|draft|pasted|quick/i, 'the Prompt selector must not know about capture stores');
  });

  check('[2B] a Favorites filter exists in BOTH Simple and Edit', () => {
    assert.match(CODE, /const UI_PM_FILTER_FAVORITES = `\$\{SkID\}-filter-favorites`;/);
    assert.match(CODE, /const UI_PM_EDIT_FILTER_FAVORITES = `\$\{SkID\}-edit-filter-favorites`;/);
    assert.match(CODE, /\$\{UI_PM_FILTER_FAVORITES\}[\s\S]{0,80}Favorites</);
    assert.match(CODE, /\$\{UI_PM_EDIT_FILTER_FAVORITES\}[\s\S]{0,80}Favorites</);
    assert.match(CODE, /bindFilter\(UI_PM_FILTER_FAVORITES, 'favorites'\);/);
    assert.match(CODE, /bindEditFilter\(UI_PM_EDIT_FILTER_FAVORITES, 'favorites'\);/);
    assert.match(CODE, /\[UI_PM_FILTER_FAVORITES, 'favorites'\]/);
    assert.match(CODE, /\[UI_PM_EDIT_FILTER_FAVORITES, 'favorites'\]/);
  });

  check('[2B] Favorites is a VIEW, not a stored bucket', () => {
    const sel = CODE.match(/const ENGINE_PM_selectPromptView = [\s\S]*?\n  \};/)[0];
    assert.match(sel, /if \(cat === 'favorites' && !p\.favorite\) return false;/,
      'the filter reads the existing favorite flag');
    assert.doesNotMatch(sel, /commit|persist|setItem|splice|push/,
      'entering Favorites must not move, copy or write records');
  });

  check('[2B] the canonical search query stays synchronous', () => {
    const set = CODE.match(/    set\(value, root = \(STATE_PM\.ui\.root \|\| UI_PM\.getRoot\(\)\), except = null\) \{[\s\S]*?\n    \},/)
             || CODE.match(/    set\([\s\S]*?STATE_PM\.ui\.searchQuery = [\s\S]*?\n    \},/);
    assert.ok(set, 'SEARCH_PM.set not found');
    assert.match(set[0], /STATE_PM\.ui\.searchQuery = /, 'the query is written immediately');
    assert.match(set[0], /SEARCH_PM\.syncInputs\(root, except\);/, 'both inputs mirror it immediately');
    assert.doesNotMatch(set[0], /setTimeout|scheduleRender/, 'set() must never be debounced');
  });

  check('[2B] exactly one owned ~80 ms search rerender timer', () => {
    assert.match(CODE, /const PM_SEARCH_RENDER_MS = 80;/);
    const sched = CODE.match(/    scheduleRender\(root = [\s\S]*?\n    \},/)[0];
    assert.match(sched, /SEARCH_PM\.cancelRender\(\);/, 'a newer keystroke cancels the pending render');
    assert.match(sched, /STATE_PM\.ui\.searchRenderTimer = CLEAN_setTimeout\(/, 'the timer must be owned');
    assert.match(sched, /PM_SEARCH_RENDER_MS/);
    const cancel = CODE.match(/    cancelRender\(\) \{[\s\S]*?\n    \},/)[0];
    assert.match(cancel, /CLEAN_clearTimeout\(STATE_PM\.ui\.searchRenderTimer\)/);
    assert.match(cancel, /STATE_PM\.ui\.searchRenderTimer = 0;/);
    // exactly one scheduling site: typing. Filters/mode switches stay synchronous.
    assert.match(CODE, /    scheduleRender\(root = /, 'the debounce helper is defined once');
    const sites = CODE.match(/SEARCH_PM\.scheduleRender\(/g) || [];
    assert.equal(sites.length, 1, `exactly one caller — typing. Found ${sites.length}`);
    assert.match(CODE, /SEARCH_PM\.set\(el\.value, root, el\);[\s\S]{0,120}SEARCH_PM\.scheduleRender\(root\);/);
  });

  check('[2B] filter chips and mode switches still render synchronously', () => {
    assert.match(CODE, /RENDER_PM\.setSimpleFilter\(root, type\); RENDER_PM\.renderSimple\(root, SEARCH_PM\.get\(\)\);/);
    assert.match(CODE, /RENDER_PM\.setEditCategory\(root, type\); RENDER_PM\.renderEdit\(root, SEARCH_PM\.get\(\)\);/);
  });

  check('[2B] the empty state distinguishes "no prompts" from "no matches"', () => {
    const e = CODE.match(/const RENDER_PM_promptEmptyHtml = [\s\S]*?\n  \};/);
    assert.ok(e, 'promptEmptyHtml not found');
    assert.match(e[0], /'No prompts yet\.'/);
    assert.match(e[0], /'No matches\.'/);
    assert.match(e[0], /if \(!anyPrompts\) return centred\('No prompts yet\.'\);/,
      'the "nothing exists" copy is gated on there genuinely being nothing');
    // the misleading Phase-1 copy is gone from both renderers
    assert.doesNotMatch(CODE, /No prompts yet\. Open Settings to add\./);
    assert.doesNotMatch(CODE, /No prompts yet\. Add one below\./);
    const calls = CODE.match(/RENDER_PM_promptEmptyHtml\(/g) || [];
    assert.equal(calls.length, 2, 'both Prompt renderers use the same empty copy');
  });

  check('[2B] usage counts insertion only, and never writes updatedAt', () => {
    const cu = CODE.match(/const commitPromptUsage = \(id\) => \{[\s\S]*?\n      \};/)[0];
    assert.match(cu, /ENGINE_PM_touchPromptUsage\(STATE_PM\.data\.prompts, id, UTIL_now\(\)\)/);
    assert.match(cu, /FEEDBACK_PM_writeFailure\(\w+, root\)/);
    assert.doesNotMatch(cu, /updatedAt/, 'usage is not an edit');
    // the Phase-1 updatedAt-on-use helper is gone
    assert.doesNotMatch(CODE, /touchPromptUpdatedAt/);
    const sites = CODE.match(/commitPromptUsage\(id\)/g) || [];
    assert.equal(sites.length, 2, 'exactly the two insertion paths record a use');
  });

  check('[2B] a failed insert is never counted as a use', () => {
    for (const anchor of [
      'const okIns = DOM_setInputText(p.body, { append: isAppend',
      'const okIns = DOM_setInputText(p.body, { append: act === \'append\'',
    ]) {
      const i = CODE.indexOf(anchor);
      assert.notEqual(i, -1, `insertion site not found: ${anchor}`);
      const seg = CODE.slice(i, i + 700);
      const guard = seg.indexOf('if (okIns === false) return;');
      const use = seg.indexOf('commitPromptUsage(id)');
      assert.ok(guard !== -1, 'the failure guard is missing');
      assert.ok(guard < use, 'the guard must precede the usage commit');
    }
  });

  check('[2B] no out-of-scope surface entered the module', () => {
    /* [2C] `backup:v1`, `:backup:` and the download helper were listed as Phase
     * 2C surface that Phase 2B must not anticipate. Phase 2C ships them under
     * an explicit contract, so they move into the [2C] cases that pin their
     * exact shape — one backup key at `state:import_backup:v1`, one download
     * helper, and the write ordering proven by 2C-I13/2C-I14/2C-I18.
     *
     * Everything genuinely still out of scope stays listed, and the Phase-2C
     * spellings deliberately NOT adopted (`exportPrompts`, `importPrompts`,
     * `downloadBlob`) remain prohibited so a second, divergent implementation
     * cannot appear beside the one that shipped. */
    for (const pat of [/\bexportPrompts\b/, /\bimportPrompts\b/, /downloadBlob/,
                       /\bfolders?\b:/, /\btags\b:/,
                       /highlightMatch|<mark>/, /commandPalette/]) {
      assert.doesNotMatch(CODE, pat, `out-of-scope surface leaked: ${pat}`);
    }
    // The one backup key that Phase 2C does ship is a single named constant.
    assert.equal((CODE.match(/import_backup/g) || []).length, 1,
      'exactly one backup key spelling, defined once');
    assert.match(CODE, /const KEY_PM_STATE_IMPORT_BACKUP_V1 = /);
  });

  check('[2B] Phase 2A behaviour is preserved verbatim', () => {
    // editor, card, feedback and stale-target guards all still present
    for (const marker of [
      'const EDITOR_PM = {', 'const FEEDBACK_PM = {', 'const RENDER_PM_promptCard = ',
      'EDITOR_PM_hasTarget', "PM_MSG_TARGET_GONE = 'Item no longer exists'",
      'FEEDBACK_PM.restore(root);', 'requestBack(root) {', 'clearTransient() {',
      "data-act=\"duplicate\"", 'ENGINE_PM_convTitle', 'ENGINE_PM_findConvDuplicate',
      'aria-pressed', '-webkit-line-clamp',
    ]) {
      assert.ok(CODE.includes(marker), `Phase 2A marker missing: ${marker}`);
    }
    // and no native dialog came back
    for (const pat of [/(?<!\/\/[^\n]{0,200})\bwindow\.(alert|confirm|prompt)\(/, /Sortable\.create/]) {
      assert.doesNotMatch(CODE, pat, `regression: ${pat}`);
    }
  });


  /* ══════════════ PHASE 2B — POST-MOVE VISIBILITY SAFETY ══════════════
   * The earlier ranked-view cases asserted a PRE-move rule (does the current
   * view equal manual order). That rule was insufficient — it allowed moves that
   * ranking immediately undid — so it was retired, and these cases assert the
   * proposed-move authority that replaced it. Nothing is weakened: the same
   * guarantees are now checked against a strictly stronger rule. */

  check('[2B-fix2] the proposed-move authority exists and is pure', () => {
    const h = CODE.match(/const ENGINE_PM_canMovePromptView = [\s\S]*?\n  \};/);
    assert.ok(h, 'ENGINE_PM_canMovePromptView not found');
    assert.doesNotMatch(h[0], /commit|persist|setItem|\.sort\(|\.splice\(/,
      'the authority must not mutate or write anything');
    assert.doesNotMatch(CODE, /canReorderPromptView/,
      'the superseded pre-move rule must no longer exist as an authority');
  });

  check('[2B-fix2] the candidate comes from the UNCHANGED Phase-1 reorder helper', () => {
    const h = CODE.match(/const ENGINE_PM_canMovePromptView = [\s\S]*?\n  \};/)[0];
    assert.match(h, /const candidate = ENGINE_PM_reorderVisible\(arr, ids, targetId, dir\);/,
      'the real persistence helper must produce the candidate');
    assert.match(h, /if \(!candidate\) return false;/, 'a rejected candidate fails closed');
  });

  check('[2B-fix2] the candidate is reranked through the UNCHANGED shipped ranker', () => {
    const h = CODE.match(/const ENGINE_PM_canMovePromptView = [\s\S]*?\n  \};/)[0];
    assert.match(h, /ENGINE_PM_selectPromptView\(candidate, category, query, now\)/,
      'the same selection path the renderers use must decide what would be shown');
  });

  check('[2B-fix2] expected-vs-reranked is an exact element-wise comparison', () => {
    const h = CODE.match(/const ENGINE_PM_canMovePromptView = [\s\S]*?\n  \};/)[0];
    assert.match(h, /const expected = ids\.slice\(\);/);
    assert.match(h, /expected\[at\] = ids\[swapWith\];/);
    assert.match(h, /expected\[swapWith\] = ids\[at\];/);
    assert.match(h, /if \(reranked\.length !== expected\.length\) return false;/);
    assert.match(h, /if \(reranked\[i\] !== expected\[i\]\) return false;/);
    assert.match(h, /return true;/);
  });

  check('[2B-fix2] safety is not inferred from query, favourites or scores', () => {
    const h = CODE.match(/const ENGINE_PM_canMovePromptView = [\s\S]*?\n  \};/)[0];
    assert.doesNotMatch(h, /PM_RANK_|\.favorite|score/,
      'the answer must come from running the real ranker, not from assumptions about it');
    assert.doesNotMatch(h, /SEARCH_PM|searchQuery/, 'the query is an argument, not a shortcut');
  });

  check('[2B-fix2] the authority fails closed on an untrustworthy view', () => {
    const h = CODE.match(/const ENGINE_PM_canMovePromptView = [\s\S]*?\n  \};/)[0];
    assert.match(h, /if \(new Set\(ids\)\.size !== ids\.length\) return false;/, 'duplicate rendered id');
    assert.match(h, /if \(seen !== 1\) return false;/, 'ghost or duplicated record');
    assert.match(h, /if \(swapWith < 0 \|\| swapWith >= ids\.length\) return false;/, 'boundary');
    assert.match(h, /if \(at === -1\) return false;/, 'target absent from the view');
  });

  check('[2B-perf] the renderer applies per-direction availability from ONE batch call', () => {
    /* [2B-perf] This case previously asserted a per-card, per-direction call to
     * the exact simulation. That was the performance blocker, so the shape it
     * pinned is gone; the guarantee it protected — each direction decided
     * independently — is now enforced through the occurrence-aligned batch
     * result, and asserted here plus in the [2B-perf] regression cases below. */
    const r = CODE.match(/const RENDER_PM_applyReorderAvailability = [\s\S]*?\n  \};/);
    assert.ok(r, 'RENDER_PM_applyReorderAvailability not found');
    assert.equal((r[0].match(/ENGINE_PM_computeMoveAvailability\(/g) || []).length, 1,
      'exactly one availability computation per render');
    assert.match(r[0], /slot\.up/, 'Up comes from the slot');
    assert.match(r[0], /slot\.down/, 'Down comes from the slot, independently');
    assert.match(r[0], /data-act="up"/); assert.match(r[0], /data-act="down"/);
  });

  check('[2B-fix2] disabled controls stay in the DOM and explain themselves', () => {
    const r = CODE.match(/const RENDER_PM_applyReorderAvailability = [\s\S]*?\n  \};/)[0];
    assert.match(r, /btn\.disabled = !can;/);
    assert.match(r, /btn\.setAttribute\('aria-disabled', can \? 'false' : 'true'\);/);
    assert.match(r, /btn\.setAttribute\('title', PM_MSG_RANKED_NO_REORDER\);/);
    assert.match(r, /if \(can\) btn\.removeAttribute\('title'\);/, 'no stale explanation on an enabled control');
    assert.doesNotMatch(r, /\.remove\(\)|innerHTML/, 'buttons are disabled, never removed');
    assert.match(CODE, /const PM_MSG_RANKED_NO_REORDER = 'Manual order unavailable while results are ranked';/);
  });

  check('[2B-fix2] Edit rendering applies availability AFTER the cards exist', () => {
    const edit = CODE.match(/    renderEdit\(root, filter\) \{[\s\S]*?\n    \},/)[0];
    assert.match(edit, /RENDER_PM_applyReorderAvailability\(list, items, cat, q, UTIL_now\(\)\);/,
      'the renderer must pass the same category/query/now the view was built with');
    assert.ok(edit.indexOf('RENDER_PM_promptCard') < edit.indexOf('RENDER_PM_applyReorderAvailability'),
      'availability is a post-render pass');
  });

  check('[2B-perf] renderer and handler share ONE final authority', () => {
    const calls = CODE.match(/ENGINE_PM_computeMoveAvailability\(/g) || [];
    assert.equal(calls.length, 2, `exactly one renderer and one handler call site; found ${calls.length}`);
    assert.match(CODE, /const ENGINE_PM_computeMoveAvailability = /, 'defined once');
    // the exact simulation is retained as the validators' oracle, never as a production path
    assert.equal((CODE.match(/ENGINE_PM_canMovePromptView\(/g) || []).length, 0,
      'the exact per-move simulation must not run in production');
  });

  check('[2B-perf] the handler re-asks for the exact occurrence and direction', () => {
    const i = CODE.indexOf('const moveBtn = e.target.closest');
    const end = CODE.indexOf('const starBtn = e.target.closest', i);
    const block = CODE.slice(i, end > i ? end : i + 2400);
    const guard = block.indexOf('if (!slot || slot.id !== id || !slot[dir])');
    const reorder = block.indexOf('ENGINE_PM_reorderVisible(');
    const commit = block.indexOf('ENGINE_PM.commitPromptsResult(');
    const flash = block.indexOf('RENDER_PM.flashMoved(');
    assert.ok(guard !== -1, 'handler guard missing');
    assert.ok(guard < reorder, 'guard precedes ENGINE_PM_reorderVisible');
    assert.ok(guard < commit, 'guard precedes commitPrompts');
    assert.ok(guard < flash, 'guard precedes the moved flash');
    const branch = block.slice(guard, reorder);
    assert.match(block, /const slotIndex = Array\.from\(listEdit\.children\)\.indexOf\(card\);/,
      'the clicked occurrence is resolved positionally, so a duplicate id cannot smuggle a row through');
    assert.match(branch, /return;/);
    assert.doesNotMatch(branch, /commitPrompts|reorderVisible\(|flashMoved/, 'the refused path mutates nothing');
    assert.match(branch, /'info'/, 'informational, not a storage failure');
    assert.doesNotMatch(branch, /'error'/);
  });

  check('[2B-fix2] the Phase-1 reorder helper is still untouched by the fix', () => {
    const r = CODE.match(/const ENGINE_PM_reorderVisible = [\s\S]*?\n  \};/);
    assert.ok(r, 'ENGINE_PM_reorderVisible not found');
    assert.doesNotMatch(r[0], /canMovePromptView|PM_MSG_RANKED_NO_REORDER|selectPromptView|rankPrompts/,
      'the fix belongs at the integration boundary, not inside the approved helper');
  });

  check('[2B-fix2] ranking behaviour is unchanged by this correction', () => {
    for (const [name, value] of [
      ['PM_RANK_TITLE_EXACT', 1000], ['PM_RANK_TITLE_PREFIX', 800],
      ['PM_RANK_TITLE_WORD', 600], ['PM_RANK_TITLE_INCLUDES', 400],
      ['PM_RANK_BODY_WORD', 200], ['PM_RANK_BODY_INCLUDES', 100],
      ['PM_RANK_FAVORITE_BOOST', 150], ['PM_RANK_RECENT_7D_BOOST', 60],
      ['PM_RANK_RECENT_30D_BOOST', 30], ['PM_RANK_USE_UNIT', 5], ['PM_RANK_USE_CAP', 10],
    ]) {
      assert.match(CODE, new RegExp(`const ${name} = ${value};`), `${name} must still be ${value}`);
    }
    const rank = CODE.match(/const ENGINE_PM_rankPrompts = [\s\S]*?\n  \};/)[0];
    assert.match(rank, /favorite \? 1 : 0/, 'favourites-first pinning stays');
    assert.match(rank, /a\.originalIndex - b\.originalIndex/, 'the final tie-break stays');
  });


  /* ══════════════ PHASE 2B — REORDER AVAILABILITY PERFORMANCE ══════════════
   * These exist to stop the quadratic shape coming back: N cards x 2 directions
   * x (full scan + full reorder + full rerank) on every debounced re-render. */

  check('[2B-perf] a batch availability authority exists and is pure', () => {
    const h = CODE.match(/const ENGINE_PM_computeMoveAvailability = [\s\S]*?\n  \};/);
    assert.ok(h, 'ENGINE_PM_computeMoveAvailability not found');
    assert.doesNotMatch(h[0], /commit|persist|setItem|\.sort\(|\.splice\(|\.push\(list/,
      'the authority must not mutate or write anything');
  });

  check('[2B-perf] the batch helper validates the whole view exactly ONCE', () => {
    const h = CODE.match(/const ENGINE_PM_computeMoveAvailability = [\s\S]*?\n  \};/)[0];
    assert.equal((h.match(/ENGINE_PM_selectPromptView\(/g) || []).length, 1,
      'the current view is ranked once, not once per button');
    assert.match(h, /for \(const rec of list\)/, 'ONE pass builds the id count and lookup');
    assert.equal((h.match(/for \(const rec of list\)/g) || []).length, 1, 'and only one such pass');
    assert.match(h, /if \(new Set\(ids\)\.size !== n\) return denied\(\);/, 'duplicate rendered ids fail closed');
    assert.match(h, /if \(seen\.get\(id\) !== 1\) return denied\(\);/, 'ghost or duplicated record fails closed');
    assert.match(h, /if \(current\[i\]\.prompt\.id !== ids\[i\]\) return denied\(\);/, 'a stale view fails closed');
  });

  check('[2B-perf] adjacent-pair work uses TWO-RECORD ranking, not full reranks', () => {
    const h = CODE.match(/const ENGINE_PM_computeMoveAvailability = [\s\S]*?\n  \};/)[0];
    assert.match(h, /for \(let i = 0; i \+ 1 < n; i\+\+\)/, 'N-1 adjacent pairs');
    assert.match(h, /ENGINE_PM_rankPrompts\(\[a, b\], query, now\)/, 'the pair is ranked forward');
    assert.match(h, /ENGINE_PM_rankPrompts\(\[b, a\], query, now\)/, 'and reversed');
    assert.match(h, /out\[i\]\.down = true; out\[i \+ 1\]\.up = true;/, 'one verdict serves two buttons');
    assert.doesNotMatch(h, /ENGINE_PM_reorderVisible|ENGINE_PM_canMovePromptView/,
      'no candidate build or full simulation inside the batch helper');
    assert.doesNotMatch(h, /PM_RANK_|\.favorite|\.lastUsedAt|\.useCount/,
      'no ranking arithmetic is duplicated — the real ranker decides the tie');
  });

  check('[2B-perf] the render loop contains no per-button simulation', () => {
    const r = CODE.match(/const RENDER_PM_applyReorderAvailability = [\s\S]*?\n  \};/)[0];
    assert.doesNotMatch(r, /ENGINE_PM_canMovePromptView|ENGINE_PM_reorderVisible|ENGINE_PM_selectPromptView/,
      'rendering must not build candidates or rerank per button');
    assert.match(r, /const cards = Array\.from\(listEl\.children \|\| \[\]\);/,
      'cards are walked positionally');
    assert.doesNotMatch(r, /CSS\.escape\(id\)/, 'no per-card id lookup — a duplicate id would keep hitting card one');
    assert.match(r, /availability\[i\]/, 'the occurrence-aligned slot drives the controls');
  });

  check('[2B-perf] availability output is occurrence-aligned', () => {
    const h = CODE.match(/const ENGINE_PM_computeMoveAvailability = [\s\S]*?\n  \};/)[0];
    assert.match(h, /const out = ids\.map\(id => \(\{ id, up: false, down: false \}\)\);/,
      'one entry per rendered slot, in render order');
    assert.match(h, /const denied = \(\) => ids\.map\(/, 'refusals keep the same shape');
  });

  check('[2B-perf] the exact simulation is retained ONLY as the validators\' oracle', () => {
    assert.match(CODE, /const ENGINE_PM_canMovePromptView = /, 'the oracle is still defined');
    assert.equal((CODE.match(/ENGINE_PM_canMovePromptView\(/g) || []).length, 0,
      'and never invoked by production code');
    // its semantics are untouched, so it remains a trustworthy oracle
    const o = CODE.match(/const ENGINE_PM_canMovePromptView = [\s\S]*?\n  \};/)[0];
    assert.match(o, /ENGINE_PM_reorderVisible\(arr, ids, targetId, dir\)/);
    assert.match(o, /ENGINE_PM_selectPromptView\(candidate, category, query, now\)/);
    assert.match(o, /if \(reranked\[i\] !== expected\[i\]\) return false;/);
  });

  /* ══════════════ PHASE 2C — PORTABILITY ══════════════
   * Portability is the first feature in this module that writes two live stores
   * in one action and the first that reads a file from outside the browser.
   * These invariants pin the contract those two facts create: exactly one
   * envelope shape, exactly two portable collections, and a write order in
   * which nothing is adopted until every byte has landed. */

  /* The two portability blocks, comment-stripped, for "is this ACTIVE code?"
   * questions that must not be answered by the block's own prose. */
  const PORT_PURE = (() => {
    const a = SRC.indexOf('📦 PORTABILITY — export / import');
    const b = SRC.indexOf('🧪 TEST HOOK', a);
    return (a === -1 || b <= a) ? '' : SRC.slice(a, b);
  })();
  const PORT_CTL = (() => {
    const a = SRC.indexOf('📦 PORTABILITY — controller');
    const b = SRC.indexOf('if (W.__H2O_PM_TEST__ === true)', a);
    return (a === -1 || b <= a) ? '' : SRC.slice(a, b);
  })();
  const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map(l => l.replace(/^\s*\/\/.*$/, '')).join('\n');
  const PORT_CODE = `${stripComments(PORT_PURE)}\n${stripComments(PORT_CTL)}`;

  check('2C-I1: both portability blocks exist and are locatable', () => {
    assert.ok(PORT_PURE.length > 0, 'the pure export/import block exists');
    assert.ok(PORT_CTL.length > 0, 'the controller block exists');
    assert.ok(PORT_PURE.indexOf('PORT_PM_buildExportEnvelope') !== -1);
    assert.ok(PORT_CTL.indexOf('const PORT_PM = {') !== -1);
  });

  check('2C-I2: exactly one versioned portability kind', () => {
    const kinds = CODE.match(/const PORT_PM_KIND = '[^']+'/g) || [];
    assert.equal(kinds.length, 1, `one kind constant (found ${kinds.length})`);
    assert.match(kinds[0], /'h2o-prompt-manager-portability'/);
    const literals = (CODE.match(/'h2o-prompt-manager-portability'/g) || []).length;
    assert.equal(literals, 1, 'the literal appears once — the constant is the only authority');
  });

  check('2C-I3: exactly one supported portability version, compared strictly', () => {
    const vers = CODE.match(/const PORT_PM_VERSION = \d+;/g) || [];
    assert.equal(vers.length, 1, `one version constant (found ${vers.length})`);
    assert.match(PORT_CODE, /parsed\.version !== PORT_PM_VERSION/,
      'the gate compares with !== against that one constant');
    assert.ok(!/parsed\.version\s*[<>]=?/.test(PORT_CODE),
      'no range check — an unsupported version is rejected, never tolerated');
  });

  check('2C-I4: the backup envelope carries its own kind and version', () => {
    assert.match(CODE, /const PORT_PM_BACKUP_KIND = 'h2o-prompt-manager-import-backup';/);
    assert.match(CODE, /const PORT_PM_BACKUP_VERSION = \d+;/);
    assert.ok(!CODE.includes('PORT_PM_BACKUP_KIND = PORT_PM_KIND'),
      'a backup can never be mistaken for a portability file');
  });

  check('2C-I5: the portable surface is Prompts and Quick Replies only', () => {
    assert.match(CODE, /const PORT_PM_ENVELOPE_KEYS = Object\.freeze\(\['kind', 'version', 'exportedAt', 'prompts', 'quickReplies'\]\)/,
      'the declared envelope keys are exactly the five');
    const env = PORT_CODE.slice(PORT_CODE.indexOf('const PORT_PM_buildExportEnvelope'),
      PORT_CODE.indexOf('const PORT_PM_serializeExport'));
    assert.match(env, /PORT_PM_projectList\(prompts, PORT_PM_exportPrompt/);
    assert.match(env, /PORT_PM_projectList\(quick, PORT_PM_exportQuick/);
    assert.ok(!/Array\.isArray\(prompts\) \? prompts : \[\]/.test(env),
      'a non-array collection is never normalized into an empty library');
    assert.ok(!/Array\.isArray\(quick\) \? quick : \[\]/.test(env));
    assert.equal((env.match(/PORT_PM_projectList\(/g) || []).length, 2,
      'exactly two collections are projected');
    assert.match(env, /prompts: p\.list/);
    assert.match(env, /quickReplies: q\.list/);
  });

  check('2C-I6: History, Drafts and Pasted never reach the export payload', () => {
    for (const key of ['KEY_PM_STATE_HISTORY_V1', 'KEY_PM_STATE_DRAFTS_V1', 'KEY_PM_STATE_PASTED_V1']) {
      assert.ok(!PORT_CODE.includes(key), `no ${key} anywhere in the portability code`);
    }
    for (const fn of ['loadHistory', 'loadDrafts', 'loadPasted', 'loadHistoryStrict',
      'loadDraftsStrict', 'loadPastedStrict', 'pushHistory', 'pushDraft', 'pushPasted']) {
      assert.ok(!PORT_CODE.includes(fn), `the portability code never calls ${fn}`);
    }
  });

  check('2C-I7: the export payload reads only the two in-memory collections', () => {
    const ex = PORT_CTL.slice(PORT_CTL.indexOf('exportLibrary('), PORT_CTL.indexOf('beginImport('));
    const reads = ex.match(/STATE_PM\.data\.\w+/g) || [];
    assert.deepEqual(Array.from(new Set(reads)).sort(),
      ['STATE_PM.data.prompts', 'STATE_PM.data.quick'],
      'nothing but Prompts and Quick is read for an export');
    /* The only UI read is `STATE_PM.ui.root`, the default-parameter lookup for
     * the panel node the feedback line lives on. Content-bearing UI state —
     * the query, the filters, the editor draft — must not appear. */
    const uiReads = Array.from(new Set(ex.match(/STATE_PM\.ui\.\w+/g) || []));
    assert.deepEqual(uiReads, ['STATE_PM.ui.root'],
      `the export path reads no UI state but the root node (saw ${JSON.stringify(uiReads)})`);
  });

  check('2C-I8: a strict import validator exists and rejects unknown keys', () => {
    assert.match(CODE, /const PORT_PM_validateImportEnvelope = /);
    assert.match(CODE, /const PORT_PM_validateImportPrompt = /);
    assert.match(CODE, /const PORT_PM_validateImportQuick = /);
    assert.match(PORT_CODE, /PORT_PM_onlyKnownKeys\(parsed, PORT_PM_ENVELOPE_KEYS\)/);
    assert.match(PORT_CODE, /PORT_PM_onlyKnownKeys\(rec, PORT_PM_PROMPT_KEYS\)/);
    assert.match(PORT_CODE, /PORT_PM_onlyKnownKeys\(rec, PORT_PM_QUICK_KEYS\)/);
  });

  check('2C-I9: duplicate imported IDs reject the file with collection-specific messages', () => {
    assert.match(PORT_CODE, /seenPrompt\.has\(rec\.id\)[\s\S]{0,60}PM_MSG_PORT_DUP_PROMPT/);
    assert.match(PORT_CODE, /seenQuick\.has\(rec\.id\)[\s\S]{0,60}PM_MSG_PORT_DUP_QUICK/);
    assert.notEqual(
      (CODE.match(/const PM_MSG_PORT_DUP_PROMPT = '([^']+)'/) || [])[1],
      (CODE.match(/const PM_MSG_PORT_DUP_QUICK = '([^']+)'/) || [])[1],
      'the two messages are distinct');
    for (const forbidden of ['dedupe', 'deduplicate', 'renameId', 'suffixId']) {
      assert.ok(!PORT_CODE.includes(forbidden), `no ${forbidden} — collisions reject, never repair`);
    }
  });

  check('2C-I10: import validation never quarantines a user-supplied file', () => {
    assert.ok(!PORT_CODE.includes('ENGINE_PM_quarantine'),
      'quarantine is for internal storage corruption, not for a file the user chose');
    assert.ok(!PORT_CODE.includes('corruptReads'), 'and no corrupt-read counter is touched');
  });

  check('2C-I11: both Merge and Replace exist as deterministic candidate builders', () => {
    assert.match(CODE, /const PORT_PM_mergePromptRecords = /);
    assert.match(CODE, /const PORT_PM_mergeQuickRecords = /);
    assert.match(CODE, /const PORT_PM_buildImportCandidates = /);
    assert.match(PORT_CODE, /if \(mode === 'replace'\)/, 'replace is an explicit branch');
    assert.match(PORT_CODE, /mode: 'merge'/, 'and merge is the other');
  });

  check('2C-I12: merge keys on record id and preserves the local slot', () => {
    const m = PORT_CODE.slice(PORT_CODE.indexOf('const PORT_PM_mergeById'),
      PORT_CODE.indexOf('const PORT_PM_mergePromptRecords'));
    assert.match(m, /const out = Array\.isArray\(localList\) \? localList\.slice\(\) : \[\]/,
      'the local array is copied, never mutated');
    assert.match(m, /out\[at\] = rec/, 'an existing id updates in place');
    assert.match(m, /out\.push\(rec\)/, 'and a new id appends');
    assert.ok(!/\.splice\(/.test(m), 'no slot is moved');
    assert.ok(!/\.sort\(/.test(m), 'and manual order is never re-sorted');
  });

  check('2C-I13: a pre-import backup key exists and is a single latest snapshot', () => {
    assert.match(CODE, /const KEY_PM_STATE_IMPORT_BACKUP_V1 = `\$\{NS_DISK\}:state:import_backup:v1`;/);
    assert.match(CODE, /const PORT_PM_buildBackupEnvelope = /);
    const writes = (PORT_CODE.match(/setJSON\(KEY_PM_STATE_IMPORT_BACKUP_V1/g) || []).length;
    assert.equal(writes, 1, 'exactly one backup write site');
    assert.ok(!/import_backup[^`']*\$\{/.test(PORT_CODE),
      'the backup key is a constant, not a timestamped series');
  });

  check('2C-I14: the backup is written before any live store write', () => {
    const i = PORT_CTL.indexOf('applyImport(root =');
    const block = PORT_CTL.slice(i);
    const backup = block.indexOf('KEY_PM_STATE_IMPORT_BACKUP_V1');
    const wp = block.indexOf('ENGINE_PM.persistPrompts(');
    const wq = block.indexOf('ENGINE_PM.persistQuick(');
    assert.ok(backup !== -1 && wp !== -1 && wq !== -1, 'all three sites are present');
    assert.ok(backup < wp && backup < wq, 'the backup precedes both live writes');
  });

  check('2C-I15: live import writes are bytes-only, never the adopting commit path', () => {
    const i = PORT_CTL.indexOf('applyImport(root =');
    const block = PORT_CTL.slice(i);
    assert.match(block, /ENGINE_PM\.persistPrompts\(/);
    assert.match(block, /ENGINE_PM\.persistQuick\(/);
    for (const adopting of ['commitPrompts', 'commitQuick', 'savePrompts', 'saveQuick']) {
      assert.ok(!block.includes(`ENGINE_PM.${adopting}(`),
        `${adopting} would adopt in-memory state before the pair is proven written`);
    }
  });

  check('2C-I16: a rollback path restores BOTH stores on either failure', () => {
    const i = PORT_CTL.indexOf('applyImport(root =');
    const block = PORT_CTL.slice(i);
    assert.match(block, /const rollback = /, 'one rollback authority');
    assert.match(block, /PORT_PM_restoreRaw\(KEY_PM_STATE_PROMPTS_V1, beforePrompts\)/);
    assert.match(block, /PORT_PM_restoreRaw\(KEY_PM_STATE_QUICK_V1, beforeQuick\)/);
    assert.ok((block.match(/rollback\(\)/g) || []).length >= 2,
      'both write-failure branches roll back');
  });

  check('2C-I17: rollback restores exact raw bytes and distinguishes absence', () => {
    const r = PORT_PURE.slice(PORT_PURE.indexOf('const PORT_PM_restoreRaw'));
    assert.match(r, /UTIL_storage\.readRaw\(key\)/, 'the current bytes are read before rewriting');
    assert.match(r, /if \(!snap\.present\) return UTIL_storage\.del\(key\)/,
      'an absent key is restored by REMOVING it');
    assert.match(r, /return UTIL_storage\.setStr\(key, snap\.raw\)/,
      'and a present key by writing back its exact string');
    assert.ok(!r.includes('setJSON'), 'never a re-serialization of a parsed value');
    assert.ok(!r.includes("'[]'") && !r.includes('"[]"'),
      'and absence is never expressed as an empty array literal');
    const pre = PORT_CTL.slice(PORT_CTL.indexOf('applyImport(root ='));
    assert.match(pre, /UTIL_storage\.readRaw\(KEY_PM_STATE_PROMPTS_V1\)/);
    assert.match(pre, /UTIL_storage\.readRaw\(KEY_PM_STATE_QUICK_V1\)/);
  });

  check('2C-I18: in-memory adoption and events follow complete storage success', () => {
    const i = PORT_CTL.indexOf('applyImport(root =');
    const block = PORT_CTL.slice(i);
    const wq = block.indexOf('ENGINE_PM.persistQuick(');
    const adoptP = block.indexOf('STATE_PM.data.prompts = candidates.prompts');
    const adoptQ = block.indexOf('STATE_PM.data.quick = candidates.quick');
    const emit = block.indexOf('UTIL_emitPmChanged(');
    assert.ok(adoptP !== -1 && adoptQ !== -1 && emit !== -1);
    assert.ok(wq < adoptP && wq < adoptQ, 'no adoption before the second write returned');
    /* [2C-closure] The degraded path also assigns STATE_PM.data.* and emits,
     * and it is defined ABOVE the writes as a closure. Compare against the
     * SUCCESS-path adoption specifically — the last assignment in the block —
     * rather than the first occurrence anywhere. */
    const emitAfterAdopt = block.indexOf('UTIL_emitPmChanged(', adoptQ);
    assert.ok(emitAfterAdopt !== -1 && adoptQ < emitAfterAdopt,
      'the success path publishes after adoption');
    /* [2C-closure] `reconcileDegraded` is DEFINED above the writes and also
     * assigns STATE_PM.data.*, so a naive "no assignment before the writes"
     * text scan now trips on a closure that can only RUN after a rollback has
     * already failed. The rule is unchanged and is asserted more precisely:
     * every pre-write assignment must live inside that closure, and that
     * closure must only be reachable when rollback() reported not-ok. */
    const degStart = block.indexOf('const reconcileDegraded = ');
    const degEnd = block.indexOf('// 3+4.', degStart);
    assert.ok(degStart !== -1 && degEnd > degStart, 'the degraded closure is locatable');
    const outsideDegraded = block.slice(0, degStart) + block.slice(degEnd, wq);
    assert.ok(!outsideDegraded.includes('STATE_PM.data.prompts ='),
      'nothing outside the degraded closure assigns the live arrays ahead of the writes');
    assert.ok(!outsideDegraded.includes('STATE_PM.data.quick ='));

    const degraded = block.slice(degStart, degEnd);
    assert.match(degraded, /STATE_PM\.data\.prompts = dp\.list/,
      'the degraded adoption comes from the DECODED surviving bytes');
    assert.match(degraded, /STATE_PM\.data\.quick = dq\.list/);
    assert.ok(!degraded.includes('candidates.'),
      'the degraded path never silently adopts the import candidate');
    for (const call of block.match(/return reconcileDegraded\(rb\);/g) || []) {
      assert.ok(call, 'reconcileDegraded is only reached through a returned failure');
    }
    assert.match(block, /if \(rb\.ok\) \{ FEEDBACK_PM\.say\(PM_MSG_PORT_WRITE, 'error', root\); return false; \}\s*\n\s*return reconcileDegraded\(rb\);/,
      'a successful rollback reports an ordinary write failure; only a failed one degrades');
  });

  check('2C-I19: no success feedback exists on any failure branch', () => {
    const i = PORT_CTL.indexOf('applyImport(root =');
    const block = PORT_CTL.slice(i, PORT_CTL.indexOf('function PORT_PM_download'));
    const success = block.indexOf("'Imported — replaced'");
    const adopt = block.indexOf('STATE_PM.data.prompts = candidates.prompts');
    assert.ok(success !== -1 && adopt !== -1 && adopt < success,
      'the only "Imported" message sits after adoption');
    /* Matched to end of line, not to the first ")": one branch reads
     * `say(rollback() ? A : B, 'error', root)` and a lazy paren match would
     * stop inside the ternary and miss the kind argument entirely. */
    for (const m of block.match(/FEEDBACK_PM\.say\(.*$/gm) || []) {
      if (m.includes('Imported')) continue;
      assert.ok(m.includes("'error'"), `every other import message is an error: ${m.trim()}`);
    }
  });

  check('2C-I20: portability introduces no native dialog', () => {
    for (const re of [/[^.\w]alert\s*\(/, /[^.\w]confirm\s*\(/, /[^.\w]prompt\s*\(/]) {
      assert.ok(!re.test(PORT_CODE), `no native dialog matching ${re}`);
    }
    assert.match(PORT_CTL, /UI_PM_IMPORT_MERGE|UI_PM_IMPORT_REPLACE|UI_PM_IMPORT_CANCEL/,
      'the confirmation is inline controls instead');
  });

  check('2C-I21: no autoSend field is introduced on a Prompt record', () => {
    for (const shape of ['const PORT_PM_exportPrompt', 'const PORT_PM_validateImportPrompt']) {
      const i = PORT_PURE.indexOf(shape);
      assert.ok(i !== -1, `${shape} exists`);
      const body = PORT_PURE.slice(i, i + 1400);
      assert.ok(!body.includes('autoSend'), `${shape} carries no autoSend field`);
    }
    assert.ok(!PORT_PM_PROMPT_KEYS_HAS_AUTOSEND(), 'and the declared Prompt key list has none');
    function PORT_PM_PROMPT_KEYS_HAS_AUTOSEND() {
      const m = CODE.match(/const PORT_PM_PROMPT_KEYS = Object\.freeze\(\[([^\]]*)\]\)/);
      return !!(m && m[1].includes('autoSend'));
    }
  });

  check('2C-I22: the public API is still exactly six methods', () => {
    const api = SRC.match(/^ {2}MOD_OBJ\.api\.\w+ = /gm) || [];
    assert.equal(api.length, 6, `six public methods (found ${api.length})`);
    assert.ok(!PORT_CODE.includes('MOD_OBJ.api'),
      'portability never writes to the public API surface');
    for (const leak of ['MOD_OBJ.api.exportLibrary', 'MOD_OBJ.api.importLibrary', 'MOD_OBJ.api.portability']) {
      assert.ok(!SRC.includes(leak), `no ${leak}`);
    }
  });

  check('2C-I23: Phase-2B ranking helpers are byte-identical', () => {
    const a = SRC.indexOf('  const PM_RANK_TITLE_EXACT = 1000;');
    const b = SRC.indexOf('  const ENGINE_PM_touchPromptUsage =');
    assert.ok(a !== -1 && b > a, 'the ranking block is locatable');
    const digest = crypto.createHash('sha256').update(SRC.slice(a, b), 'utf8').digest('hex');
    assert.equal(digest, PINNED_RANKING_SHA256,
      'Phase 2C must not alter a single byte of the retrieval rules');
  });

  check('2C-I24: Phase-2A editor and feedback authorities are preserved', () => {
    // The editor still owns validation, dirty tracking, the two-step delete and
    // the stale-target guard; feedback still keeps errors persistent.
    for (const sym of ['EDITOR_PM_validate', 'EDITOR_PM_isDirty', 'EDITOR_PM_hasTarget',
      'PM_MSG_TARGET_GONE', 'armDelete(root)', 'discardArmed']) {
      assert.ok(SRC.includes(sym), `${sym} survives Phase 2C`);
    }
    const say = SRC.slice(SRC.indexOf('say(message, kind = '), SRC.indexOf('hide(root = '));
    assert.match(say, /if \(kind !== 'error'\)/, 'errors still do not auto-clear');
  });

  check('2C-I25: Phase-1 capture and storage protections are preserved', () => {
    for (const sym of ['ENGINE_PM_quarantine', 'ENGINE_PM_readArray', 'ENGINE_PM_readCaptureStore',
      'ENGINE_PM_verifyCaptureOccurrence', 'ENGINE_PM_noteWriteFailure',
      'migrateKeysOnce', 'migrateDraftsFromHistoryOnce', 'PM_QUARANTINE_MAX_CANDIDATES']) {
      assert.ok(SRC.includes(sym), `${sym} survives Phase 2C`);
    }
    // Same extraction as the Phase-1 case that owns this pin, so the two can
    // never disagree about which bytes are being protected.
    const m = SRC.match(/  const ENGINE_PM_quarantine = [\s\S]*?\n  \};/);
    assert.ok(m, 'ENGINE_PM_quarantine is still locatable');
    const digest = crypto.createHash('sha256').update(m[0]).digest('hex');
    assert.equal(digest, PINNED_QUARANTINE_SHA256, 'the quarantine block is byte-identical');
  });

  check('2C-I26: the portability test hook is flag-gated like every other helper', () => {
    const hook = SRC.slice(SRC.indexOf('if (W.__H2O_PM_TEST__ === true)'));
    assert.ok(hook.includes('portability: Object.freeze({'), 'exposed only inside the gate');
    const beforeGate = SRC.slice(0, SRC.indexOf('if (W.__H2O_PM_TEST__ === true)'));
    assert.ok(!beforeGate.includes('MOD_OBJ.__test'), 'nothing is exposed outside it');
    assert.ok(!PORT_CODE.includes('__H2O_PM_TEST__'),
      'and the portability code itself has no test-only branch');
  });

  /* ══════════════ PHASE 2C CLOSURE — LOSSLESS EXPORT + TRUTHFUL ROLLBACK ══════════════
   * Independent review found two data-safety defects: export silently skipped
   * records it could not represent while still reporting success, and rollback
   * judged itself by what the setters returned rather than by the bytes that
   * ended up persisted. These invariants pin both corrections. */

  check('2C-X1: export never skips a record into a success envelope', () => {
    const proj = PORT_PURE.slice(PORT_PURE.indexOf('const PORT_PM_projectList'),
      PORT_PURE.indexOf('const PORT_PM_buildExportEnvelope'));
    assert.ok(proj.length > 0, 'the projection authority is locatable');
    assert.ok(!/\bcontinue\b/.test(stripComments(proj)),
      'no `continue` — a record is either represented or the projection fails');
    assert.match(proj, /const canonical = validate\(rec\)/,
      'the ORIGINAL record reaches the strict validator before projection');
    assert.match(proj, /if \(!canonical\) return \{ ok: false/, 'an unusable source record refuses');
    assert.match(proj, /const id = canonical\.id;/, 'identity comes from the validated canonical source');
    assert.match(proj, /if \(seen\.has\(id\)\) return \{ ok: false/, 'a duplicate id refuses');
    assert.match(proj, /const projected = validate\(project\(canonical, id\)\)/,
      'the historical projector must round-trip through the strict validator');
    assert.match(proj, /JSON\.stringify\(projected\) !== JSON\.stringify\(canonical\)/,
      'and may not omit or change a declared canonical value');
    for (const forbidden of ['UTIL_cryptoId', 'crypto.randomUUID', '(copy)', 'suffix']) {
      assert.ok(!proj.includes(forbidden), `no id is generated or renamed (${forbidden})`);
    }
  });

  check('2C-X2: successful export cardinality equals source cardinality', () => {
    const env = PORT_PURE.slice(PORT_PURE.indexOf('const PORT_PM_buildExportEnvelope'),
      PORT_PURE.indexOf('const PORT_PM_serializeExport'));
    assert.match(env, /if \(p\.list\.length !== prompts\.length\) return fail\(/,
      'Prompt cardinality is checked, not assumed');
    assert.match(env, /if \(q\.list\.length !== quick\.length\) return fail\(/,
      'Quick cardinality is checked, not assumed');
    assert.match(env, /PORT_PM_validateImportEnvelope\(envelope\)/,
      'and the finished envelope is re-validated by the module\'s own importer');
  });

  check('2C-X3: duplicate local ids abort the export with a distinct message', () => {
    assert.match(CODE, /const PM_MSG_PORT_EXPORT_DUP_PROMPT = '[^']+'/);
    assert.match(CODE, /const PM_MSG_PORT_EXPORT_DUP_QUICK = '[^']+'/);
    const dupP = (CODE.match(/const PM_MSG_PORT_EXPORT_DUP_PROMPT = '([^']+)'/) || [])[1];
    const dupQ = (CODE.match(/const PM_MSG_PORT_EXPORT_DUP_QUICK = '([^']+)'/) || [])[1];
    assert.notEqual(dupP, dupQ, 'the two collections report distinctly');
    for (const m of [dupP, dupQ]) {
      assert.ok(!/title|body|text|content/i.test(m), `no record content in "${m}"`);
    }
  });

  check('2C-X4: export failure happens before any download side effect', () => {
    const ex = PORT_CTL.slice(PORT_CTL.indexOf('exportLibrary(root ='), PORT_CTL.indexOf('beginImport('));
    const build = ex.indexOf('PORT_PM_buildExportEnvelope(');
    const guard = ex.indexOf('if (!built.ok)');
    const download = ex.indexOf('PORT_PM_download(');
    const serialize = ex.indexOf('PORT_PM_serializeExport(');
    assert.ok(build !== -1 && guard !== -1 && download !== -1 && serialize !== -1);
    assert.ok(build < guard, 'the envelope is built first');
    assert.ok(guard < serialize && guard < download,
      'the refusal returns before serialization and before the download path');
    assert.ok(!ex.slice(0, guard).includes('createObjectURL'),
      'no object URL can exist when the export is refused');
    const success = ex.indexOf("FEEDBACK_PM.say('Exported'");
    assert.ok(success > download, 'success is reported only after the download path returned');
  });

  check('2C-X5: the pre-import backup uses the same all-or-nothing projection', () => {
    const b = PORT_PURE.slice(PORT_PURE.indexOf('const PORT_PM_buildBackupEnvelope'),
      PORT_PURE.indexOf('const PORT_PM_rawEquals'));
    assert.match(b, /PORT_PM_projectList\(prompts, PORT_PM_exportPrompt, PORT_PM_validateImportPrompt/);
    assert.match(b, /PORT_PM_projectList\(quick, PORT_PM_exportQuick, PORT_PM_validateImportQuick/);
    assert.match(b, /if \(!p\.ok\) return \{ ok: false/);
    assert.match(b, /if \(!q\.ok\) return \{ ok: false/);
    const apply = PORT_CTL.slice(PORT_CTL.indexOf('applyImport(root ='));
    const built = apply.indexOf('const backupBuilt = ');
    const guard = apply.indexOf('if (!backupBuilt.ok)');
    const wp = apply.indexOf('ENGINE_PM.persistPrompts(');
    assert.ok(built !== -1 && guard !== -1 && guard < wp,
      'a backup that cannot be built aborts before any live write');
  });

  check('2C-X6: rollback success is decided by re-read bytes, not by return values', () => {
    const apply = PORT_CTL.slice(PORT_CTL.indexOf('applyImport(root ='));
    const rb = apply.slice(apply.indexOf('const rollback = '), apply.indexOf('const reconcileDegraded'));
    assert.match(rb, /PORT_PM_restoreRaw\(KEY_PM_STATE_PROMPTS_V1, beforePrompts\);/);
    assert.match(rb, /PORT_PM_restoreRaw\(KEY_PM_STATE_QUICK_V1, beforeQuick\);/);
    assert.match(rb, /UTIL_storage\.readRaw\(KEY_PM_STATE_PROMPTS_V1\)/, 'the key is re-read after restoring');
    assert.match(rb, /UTIL_storage\.readRaw\(KEY_PM_STATE_QUICK_V1\)/);
    assert.match(rb, /PORT_PM_rawEquals\(beforePrompts, nowPrompts\)/);
    assert.match(rb, /PORT_PM_rawEquals\(beforeQuick, nowQuick\)/);
    assert.ok(!/const rp = |const rq = |if \(!rp \|\| !rq\)/.test(rb),
      'the verdict no longer comes from the restore helpers\' return values');
    const eq = PORT_PURE.slice(PORT_PURE.indexOf('const PORT_PM_rawEquals'),
      PORT_PURE.indexOf('const PORT_PM_decodeRawList'));
    assert.match(eq, /cur\.raw === snap\.raw/, 'exact raw string comparison');
    assert.ok(!eq.includes('JSON.parse'), 'never a normalized comparison');
  });

  check('2C-X7: the degraded path reads the ACTUAL surviving stores', () => {
    const apply = PORT_CTL.slice(PORT_CTL.indexOf('applyImport(root ='));
    const deg = apply.slice(apply.indexOf('const reconcileDegraded'), apply.indexOf('// 3+4.'));
    assert.match(deg, /PORT_PM_decodeRawList\(rb\.nowPrompts\)/);
    assert.match(deg, /PORT_PM_decodeRawList\(rb\.nowQuick\)/);
    for (const mutating of ['loadPrompts', 'loadQuick', 'ENGINE_PM_quarantine', 'markSeeded',
      'persistPrompts', 'persistQuick', 'commitPrompts', 'commitQuick',
      'setJSON', 'setStr', 'UTIL_storage.del']) {
      assert.ok(!deg.includes(mutating),
        `the degraded read never calls ${mutating} — it must not mutate storage`);
    }
  });

  check('2C-X8: the degraded decoder is pure and fails closed', () => {
    const d = PORT_PURE.slice(PORT_PURE.indexOf('const PORT_PM_decodeRawList'),
      PORT_PURE.indexOf('const PORT_PM_restoreRaw'));
    assert.match(d, /if \(!snap\.present\) return \{ ok: true, list: \[\] \}/,
      'absence resolves to the module\'s existing empty-list contract');
    assert.match(d, /catch \{ return \{ ok: false, list: \[\] \}; \}/, 'unparseable fails closed');
    assert.match(d, /if \(!Array\.isArray\(parsed\)\) return \{ ok: false/, 'a non-array fails closed');
    for (const mutating of ['setItem', 'setStr', 'setJSON', 'removeItem', 'del(']) {
      assert.ok(!d.includes(mutating), `the decoder never writes (${mutating})`);
    }
  });

  check('2C-X9: an undecodable degraded state latches recovery-required', () => {
    const apply = PORT_CTL.slice(PORT_CTL.indexOf('applyImport(root ='));
    const deg = apply.slice(apply.indexOf('const reconcileDegraded'), apply.indexOf('// 3+4.'));
    assert.match(deg, /if \(!dp\.ok \|\| !dq\.ok\)/, 'either undecodable store is caught');
    assert.match(deg, /recoveryRequired = true/, 'and latches the flag');
    assert.match(deg, /FEEDBACK_PM\.say\(PM_MSG_PORT_RECOVERY, 'error', root\)/);
    // and the flag gates further portability mutation
    assert.match(PORT_CTL, /if \(PORT_PM\.st\(\)\.recoveryRequired\) \{[\s\S]{0,200}return false;/,
      'a latched recovery requirement fails closed');
    assert.ok((PORT_CTL.match(/recoveryRequired\)/g) || []).length >= 2,
      'both the staging and the applying path are gated');
    assert.match(CODE, /port: \{ pending: null, recoveryRequired: false, readSeq: 0 \}/,
      'the flag is memory-only state, so a reload clears it');
  });

  check('2C-X10: no normal Imported success is reachable on any degraded path', () => {
    const apply = PORT_CTL.slice(PORT_CTL.indexOf('applyImport(root ='),
      PORT_CTL.indexOf('function PORT_PM_download'));
    const degRaw = apply.slice(apply.indexOf('const reconcileDegraded'), apply.indexOf('// 3+4.'));
    // Comment-stripped: the block documents WHY it never reports "Imported".
    const deg = stripComments(degRaw);
    assert.ok(!deg.includes('Imported'), 'the degraded closure never says Imported');
    assert.ok(!deg.includes("'info'"), 'and never uses transient success feedback');
    assert.match(deg, /return false;\s*\};/, 'it always reports failure to its caller');
    for (const forbidden of ['touchPromptUsage', 'useCount', 'lastUsedAt', 'updatedAt']) {
      assert.ok(!deg.includes(forbidden), `degraded reconciliation never touches ${forbidden}`);
    }
    assert.match(deg, /UTIL_emitPmChanged\(\{ what: 'prompts' \}\)/,
      'but consumers ARE told the in-memory pair changed');
    assert.match(deg, /UTIL_emitPmChanged\(\{ what: 'quick' \}\)/);
  });

  check('2C-X11: the closure leaves capture stores and the public API alone', () => {
    for (const sym of ['KEY_PM_STATE_HISTORY_V1', 'KEY_PM_STATE_DRAFTS_V1', 'KEY_PM_STATE_PASTED_V1',
      'loadHistory', 'loadDrafts', 'loadPasted', 'ENGINE_PM_quarantine']) {
      assert.ok(!PORT_CODE.includes(sym), `portability still never names ${sym}`);
    }
    const api = SRC.match(/^ {2}MOD_OBJ\.api\.\w+ = /gm) || [];
    assert.equal(api.length, 6, `still exactly six public methods (found ${api.length})`);
    assert.ok(!PORT_CODE.includes('MOD_OBJ.api'));
    assert.ok(!/autoSend/.test(PORT_CODE), 'and no Prompt-record autoSend');
  });

  /* ══════════════ PHASE 2C CLOSURE 2 — CANONICAL IDENTITY + READ RACE ══════════════
   * Independent inspection of the closure bundle found three more edge cases:
   * portability trimmed ids (a repair, not a validation), buildExportEnvelope
   * normalized a non-array collection into an empty successful export, and
   * concurrent FileReader completions could stage the wrong file. */

  check('2C-Y1: portability ids are validated, never trimmed', () => {
    const idBlock = PORT_PURE.slice(PORT_PURE.indexOf('const PORT_PM_isCanonicalId'),
      PORT_PURE.indexOf('const PORT_PM_finiteNumber'));
    assert.ok(idBlock.length > 0, 'the canonical-id authority exists');
    assert.match(idBlock, /typeof v === 'string' && v\.length > 0 && v === v\.trim\(\)/,
      'canonical means: a non-empty string that already equals its trimmed form');
    assert.match(idBlock, /PORT_PM_isCanonicalId\(rec\.id\)\) \? rec\.id : ''/,
      'a valid id is returned EXACTLY as stored');
    assert.ok(!/rec\.id\.trim\(\)/.test(idBlock), 'nothing returns a trimmed id');
    // and no other portability site trims an id back into existence
    const code = stripComments(PORT_CODE);
    assert.ok(!/\.id\.trim\(\)/.test(code), 'no portability site trims a record id');
    assert.ok(!/id: [a-zA-Z]+\.trim\(\)/.test(code), 'and none assigns a trimmed id');
  });

  check('2C-Y2: one canonical-id authority serves every portability path', () => {
    const code = stripComments(PORT_CODE);
    assert.equal((code.match(/const PORT_PM_isCanonicalId = /g) || []).length, 1,
      'exactly one definition');
    assert.equal((code.match(/const PORT_PM_recordId = /g) || []).length, 1);
    // strict import, export projection, duplicate detection and merge all route
    // through it rather than re-deriving identity
    for (const site of ['const PORT_PM_validateImportPrompt', 'const PORT_PM_validateImportQuick',
      'const PORT_PM_mergeById']) {
      const i = code.indexOf(site);
      assert.ok(i !== -1, `${site} exists`);
      const body = code.slice(i, i + 1400);
      assert.ok(body.includes('PORT_PM_recordId('),
        `${site} uses the canonical identity authority`);
    }
    const proj = code.slice(code.indexOf('const PORT_PM_projectList'),
      code.indexOf('const PORT_PM_buildExportEnvelope'));
    assert.match(proj, /const canonical = validate\(rec\)/,
      'projectList delegates identity to the strict record validators');
    assert.match(proj, /const id = canonical\.id;/,
      'and only consumes the canonical id they return');
  });

  check('2C-Y3: the Phase-1 tolerant readers keep their own contract', () => {
    // Strictness is scoped to portability: the storage readers must NOT have
    // grown an id rule, or a library that portability refuses would stop loading.
    const load = SRC.slice(SRC.indexOf('    loadPrompts() {'), SRC.indexOf('    persistPrompts(list) {'));
    assert.ok(!load.includes('PORT_PM_isCanonicalId'), 'loadPrompts is untouched by the id rule');
    assert.ok(!load.includes('PORT_PM_recordId'));
    const loadQ = SRC.slice(SRC.indexOf('    loadQuick() {'), SRC.indexOf('    saveQuick(list) {'));
    assert.ok(!loadQ.includes('PORT_PM_isCanonicalId'), 'loadQuick is untouched too');
    assert.match(SRC, /const ENGINE_PM_validRecordId = [\s\S]{0,200}rec\.id\.trim\(\)/,
      'and the Phase-1 tolerant id helper still trims, as it always did');
  });

  check('2C-Y4: buildExportEnvelope never normalizes a non-array into []', () => {
    /* Comment-stripped: the block documents the defect by QUOTING the removed
     * line, so a raw substring scan would trip on its own explanation. */
    const env = stripComments(PORT_PURE.slice(PORT_PURE.indexOf('const PORT_PM_buildExportEnvelope'),
      PORT_PURE.indexOf('const PORT_PM_serializeExport')));
    assert.ok(!/Array\.isArray\(prompts\) \? prompts : \[\]/.test(env),
      'the normalizing ternary is gone from the code');
    assert.ok(!/Array\.isArray\(quick\) \? quick : \[\]/.test(env));
    assert.ok(!/const srcPrompts|const srcQuick/.test(env),
      'and no normalized local shadows the caller\'s collection');
    assert.match(env, /PORT_PM_projectList\(prompts, /, 'the caller hands the input over untouched');
    assert.match(env, /PORT_PM_projectList\(quick, /);
    // the projection is the single gate, and it refuses a non-array
    const proj = PORT_PURE.slice(PORT_PURE.indexOf('const PORT_PM_projectList'),
      PORT_PURE.indexOf('const PORT_PM_buildExportEnvelope'));
    assert.match(proj, /if \(!Array\.isArray\(list\)\) return \{ ok: false/,
      'a non-array collection refuses');
  });

  check('2C-Y5: the backup builder is fail-closed for non-arrays too', () => {
    const b = PORT_PURE.slice(PORT_PURE.indexOf('const PORT_PM_buildBackupEnvelope'),
      PORT_PURE.indexOf('const PORT_PM_rawEquals'));
    assert.ok(!/Array\.isArray/.test(b), 'it does not pre-normalize either collection');
    assert.match(b, /PORT_PM_projectList\(prompts, /);
    assert.match(b, /PORT_PM_projectList\(quick, /);
    assert.match(b, /if \(!p\.ok\) return \{ ok: false/);
    assert.match(b, /if \(!q\.ok\) return \{ ok: false/);
  });

  check('2C-Y6: exactly one read-generation authority exists', () => {
    assert.match(CODE, /port: \{ pending: null, recoveryRequired: false, readSeq: 0 \}/,
      'readSeq lives in the port state slot');
    const code = stripComments(PORT_CTL);
    assert.equal((code.match(/nextRead\(\) \{/g) || []).length, 1, 'one generator');
    assert.equal((code.match(/isCurrentRead\(token\) \{ return/g) || []).length, 1,
      'one comparator definition');
    assert.ok((code.match(/PORT_PM\.isCurrentRead\(token\)/g) || []).length >= 3,
      'and every asynchronous completion consults it');
    assert.match(code, /st\.readSeq = \(Number\(st\.readSeq\) \|\| 0\) \+ 1/, 'monotonic increment');
    assert.ok(!/readSeq/.test(stripComments(PORT_PURE)),
      'the pure block has no read state — this is controller-only');
  });

  check('2C-Y7: every FileReader completion checks its token first', () => {
    const begin = PORT_CTL.slice(PORT_CTL.indexOf('beginImport(root, file)'),
      PORT_CTL.indexOf('cancelImport(root ='));
    assert.match(begin, /const token = PORT_PM\.nextRead\(\);/, 'a token is taken at selection time');
    for (const cb of ['reader.onerror = ', 'reader.onload = ']) {
      const i = begin.indexOf(cb);
      assert.ok(i !== -1, `${cb} exists`);
      const body = begin.slice(i, begin.indexOf('};', begin.indexOf('SAFE_try', i)));
      const guard = body.indexOf('if (!PORT_PM.isCurrentRead(token)) return false;');
      assert.ok(guard !== -1, `${cb} validates its token`);
      for (const effect of ['FEEDBACK_PM.say', 'st().pending =', 'PORT_PM.sync']) {
        const at = body.indexOf(effect);
        if (at !== -1) assert.ok(guard < at, `${cb}: the token check precedes ${effect}`);
      }
    }
    assert.ok((begin.match(/isCurrentRead\(token\)/g) || []).length >= 3,
      'and the parse path re-checks after the async work');
  });

  check('2C-Y8: a new selection clears and syncs the previous preview immediately', () => {
    const begin = PORT_CTL.slice(PORT_CTL.indexOf('beginImport(root, file)'),
      PORT_CTL.indexOf('cancelImport(root ='));
    const token = begin.indexOf('const token = PORT_PM.nextRead();');
    const clear = begin.indexOf('PORT_PM.st().pending = null;');
    const sync = begin.indexOf('PORT_PM.sync(root);');
    const recovery = begin.indexOf('recoveryRequired');
    const reader = begin.indexOf('new FileReader()');
    assert.ok(token !== -1 && clear !== -1 && sync !== -1 && reader !== -1);
    assert.ok(token < clear && clear < sync, 'generation, then clear, then sync');
    assert.ok(sync < recovery, 'the preview is hidden before any early return');
    assert.ok(sync < reader, 'and before the new read starts');
  });

  check('2C-Y9: clearing and cancelling retire the read generation', () => {
    const clear = PORT_CTL.slice(PORT_CTL.indexOf('clearPending(root) {'),
      PORT_CTL.indexOf('exportLibrary(root ='));
    assert.match(clear, /PORT_PM\.nextRead\(\);/, 'clearPending retires the generation');
    const cancel = PORT_CTL.slice(PORT_CTL.indexOf('cancelImport(root ='),
      PORT_CTL.indexOf('applyImport(root ='));
    assert.match(cancel, /PORT_PM\.clearPending\(root\);/, 'cancel routes through it');
    assert.ok(cancel.indexOf('PORT_PM.clearPending(root);') < cancel.indexOf('if (!wasPending) return false;'),
      'and does so BEFORE the early return, so a read in flight is retired even with no confirmation open');
    const apply = PORT_CTL.slice(PORT_CTL.indexOf('applyImport(root ='));
    assert.match(apply, /PORT_PM\.clearPending\(root\);/,
      'a successful import clears — and therefore retires — as well');
  });

  check('2C-Y10: recoveryRequired gates both portability mutations and export', () => {
    const ex = PORT_CTL.slice(PORT_CTL.indexOf('exportLibrary(root ='), PORT_CTL.indexOf('beginImport(root, file)'));
    const gate = ex.indexOf('if (PORT_PM.st().recoveryRequired)');
    const build = ex.indexOf('PORT_PM_buildExportEnvelope(');
    assert.ok(gate !== -1 && build !== -1 && gate < build, 'export is gated before it builds anything');
    assert.ok(!ex.slice(0, gate).includes('createObjectURL'));
    const begin = PORT_CTL.slice(PORT_CTL.indexOf('beginImport(root, file)'), PORT_CTL.indexOf('cancelImport(root ='));
    assert.match(begin, /if \(PORT_PM\.st\(\)\.recoveryRequired\)/, 'staging is gated');
    const apply = PORT_CTL.slice(PORT_CTL.indexOf('applyImport(root ='));
    assert.match(apply, /if \(PORT_PM\.st\(\)\.recoveryRequired\)/, 'applying is gated');
    assert.ok((PORT_CTL.match(/recoveryRequired\)/g) || []).length >= 4,
      'export, staging, applying and the async re-check');
    // and the gate stays inside portability
    assert.ok(!SRC.slice(SRC.indexOf('const EDITOR_PM = {'), SRC.indexOf('const PORT_PM = {')).includes('recoveryRequired'),
      'the editor is not disabled by a portability recovery state');
  });

  check('2C-Y11: the recovery gate does not widen the public API', () => {
    const api = SRC.match(/^ {2}MOD_OBJ\.api\.\w+ = /gm) || [];
    assert.equal(api.length, 6, `still exactly six public methods (found ${api.length})`);
    assert.ok(!PORT_CODE.includes('MOD_OBJ.api'));
    // The UI reflects the gate rather than exposing a new entry point.
    const sync = PORT_CTL.slice(PORT_CTL.indexOf('sync(root ='), PORT_CTL.indexOf('clearPending(root) {'));
    assert.match(sync, /e\.importBtn\.disabled = blocked/);
    assert.match(sync, /e\.exportBtn\.disabled = blocked/);
    assert.ok(!sync.includes('e.cancel.disabled'), 'Cancel stays available to dismiss stale UI');
  });

  check('2C-Y12: the approved rollback closure is structurally intact', () => {
    const apply = PORT_CTL.slice(PORT_CTL.indexOf('applyImport(root ='));
    for (const marker of [
      'UTIL_storage.readRaw(KEY_PM_STATE_PROMPTS_V1)',
      'UTIL_storage.readRaw(KEY_PM_STATE_QUICK_V1)',
      'const backupBuilt = PORT_PM_buildBackupEnvelope(',
      'const rollback = ',
      'PORT_PM_restoreRaw(KEY_PM_STATE_PROMPTS_V1, beforePrompts)',
      'PORT_PM_restoreRaw(KEY_PM_STATE_QUICK_V1, beforeQuick)',
      'PORT_PM_rawEquals(beforePrompts, nowPrompts)',
      'PORT_PM_rawEquals(beforeQuick, nowQuick)',
      'const reconcileDegraded = ',
      'PORT_PM_decodeRawList(rb.nowPrompts)',
      'PORT_PM_decodeRawList(rb.nowQuick)',
      'recoveryRequired = true',
      'ENGINE_PM.persistPrompts(',
      'ENGINE_PM.persistQuick(',
    ]) {
      assert.ok(apply.includes(marker), `still present: ${marker}`);
    }
    for (const adopting of ['commitPrompts', 'commitQuick', 'savePrompts', 'saveQuick']) {
      assert.ok(!apply.includes(`ENGINE_PM.${adopting}(`), `${adopting} still absent from the import path`);
    }
  });

  /* ══════════════ PHASE 2C CLOSURE 3 — QUICK ORDER · LIVE STORE · BYTE SIZE ══════════════ */

  check('2C-Z1: the imported Quick sequence is encoded durably into `order`', () => {
    const seq = PORT_PURE.slice(PORT_PURE.indexOf('const PORT_PM_sequenceQuick'),
      PORT_PURE.indexOf('/* Candidate builder.'));
    assert.ok(seq.length > 0, 'the sequencing authority exists');
    assert.match(seq, /\{ \.\.\.rec, order: i \}/, 'order is the final array index');
    assert.ok(!/\.sort\(/.test(seq), 'it re-derives rather than re-sorts');
    assert.ok(!/rec\.order/.test(stripComments(seq)), 'the incoming order is never consulted');
  });

  check('2C-Z2: both candidate modes route Quick through the sequencer', () => {
    const env = PORT_PURE.slice(PORT_PURE.indexOf('const PORT_PM_buildImportCandidates'),
      PORT_PURE.indexOf('const PORT_PM_buildBackupEnvelope'));
    assert.match(env, /quick: PORT_PM_sequenceQuick\(impQuick\)/, 'replace');
    assert.match(env, /quick: PORT_PM_sequenceQuick\(mq\.list\)/, 'merge');
    assert.equal((env.match(/PORT_PM_sequenceQuick\(/g) || []).length, 2, 'exactly the two modes');
    assert.ok(!/prompts: PORT_PM_sequenceQuick/.test(env), 'Prompts are never sequenced');
  });

  check('2C-Z3: the runtime order authority it must satisfy is unchanged', () => {
    // loadQuick still sorts by `order`; that is precisely why the candidate has
    // to encode its sequence there.
    const lq = SRC.slice(SRC.indexOf('    loadQuick() {'), SRC.indexOf('    saveQuick(list) {'));
    assert.match(lq, /\.sort\(\(a, b\) => \(a\?\.order \|\| 0\) - \(b\?\.order \|\| 0\)\)/,
      'loadQuick still sorts by order');
    assert.ok(!lq.includes('PORT_PM_'), 'and portability did not reach into it');
    const trayAt = SRC.indexOf('    renderQuickTray(root) {');
    assert.ok(trayAt !== -1, 'the tray renderer is locatable');
    const tray = SRC.slice(trayAt, trayAt + 900);
    assert.match(tray, /sort\(\(a, b\) => \(a\.order \|\| 0\) - \(b\.order \|\| 0\)\)/,
      'and the tray renderer sorts the same way');
    assert.ok(!tray.includes('PORT_PM_'), 'the tray renderer was not touched by portability');
  });

  check('2C-Z4: a read-only live-store preflight exists', () => {
    const pf = PORT_PURE.slice(PORT_PURE.indexOf('const PORT_PM_checkLiveStoreAuthority'),
      PORT_PURE.indexOf('const PORT_PM_utf8Bytes'));
    assert.ok(pf.length > 0, 'the preflight exists');
    assert.match(pf, /ENGINE_PM_readArray\(key\)/, 'it uses the classified pure reader');
    assert.match(pf, /KEY_PM_STATE_PROMPTS_V1/);
    assert.match(pf, /KEY_PM_STATE_QUICK_V1/);
    assert.match(pf, /rd\.kind === PM_READ_CORRUPT/, 'malformed or non-array is unsafe');
    assert.match(pf, /const persisted = \(rd\.kind === PM_READ_ABSENT\) \? \[\] : rd\.value/,
      'absence is the canonical empty persisted collection');
    assert.match(pf, /PORT_PM_projectList\(persisted, project, validate/,
      'valid live arrays still pass through the strict collection authority');
    assert.match(pf, /PORT_PM_projectList\(mem, project, validate/,
      'and are compared with strict current memory rather than accepted on health alone');
    assert.match(pf, /JSON\.stringify\(liveLogical\) !== JSON\.stringify\(memoryLogical\)/,
      'any canonical logical mismatch fails closed');
  });

  check('2C-Z5: the preflight mutates nothing', () => {
    const pf = stripComments(PORT_PURE.slice(PORT_PURE.indexOf('const PORT_PM_checkLiveStoreAuthority'),
      PORT_PURE.indexOf('const PORT_PM_utf8Bytes')));
    for (const mutating of ['ENGINE_PM_quarantine', 'setJSON', 'setStr', 'setItem',
      'removeItem', 'UTIL_storage.del', 'markSeeded', 'loadPrompts', 'loadQuick',
      'persistPrompts', 'persistQuick', 'commitPrompts', 'commitQuick']) {
      assert.ok(!pf.includes(mutating), `the preflight never calls ${mutating}`);
    }
    // and it is specific to the two portable stores, not a broad dataError gate
    assert.ok(!pf.includes('dataError'),
      'it does not lean on a flag that History/Drafts/Pasted can also set');
  });

  check('2C-Z6: export calls the preflight before it builds or downloads anything', () => {
    const ex = PORT_CTL.slice(PORT_CTL.indexOf('exportLibrary(root ='), PORT_CTL.indexOf('beginImport(root, file)'));
    const pre = ex.indexOf('PORT_PM_checkLiveStoreAuthority(');
    const build = ex.indexOf('PORT_PM_buildExportEnvelope(');
    const serialize = ex.indexOf('PORT_PM_serializeExport(');
    const download = ex.indexOf('PORT_PM_download(');
    assert.ok(pre !== -1 && build !== -1 && serialize !== -1 && download !== -1);
    assert.ok(pre < build && pre < serialize && pre < download,
      'the store check precedes build, serialize and download');
    assert.ok(!ex.slice(0, pre).includes('createObjectURL'));
  });

  check('2C-Z7: apply re-checks the live store before candidates, backup and writes', () => {
    const apply = PORT_CTL.slice(PORT_CTL.indexOf('applyImport(root ='));
    const pre = apply.indexOf('PORT_PM_checkLiveStoreAuthority(');
    const cand = apply.indexOf('PORT_PM_buildImportCandidates(');
    const backup = apply.indexOf('KEY_PM_STATE_IMPORT_BACKUP_V1');
    const wp = apply.indexOf('ENGINE_PM.persistPrompts(');
    const wq = apply.indexOf('ENGINE_PM.persistQuick(');
    assert.ok(pre !== -1, 'the mandatory re-check exists');
    assert.ok(pre < cand && pre < backup && pre < wp && pre < wq,
      'it precedes candidates, the backup and both live writes');
    // selection is gated too
    const begin = PORT_CTL.slice(PORT_CTL.indexOf('beginImport(root, file)'), PORT_CTL.indexOf('cancelImport(root ='));
    assert.match(begin, /PORT_PM_checkLiveStoreAuthority\(/, 'staging checks it as well');
    assert.ok(begin.indexOf('PORT_PM_checkLiveStoreAuthority(') < begin.indexOf('new FileReader()'),
      'and does so before any FileReader work');
  });

  check('2C-Z8: corrupt live storage cannot become a successful empty portability op', () => {
    // The only route to a portability mutation runs through the preflight, and
    // the preflight treats PM_READ_CORRUPT as unsafe rather than as [].
    const pf = PORT_PURE.slice(PORT_PURE.indexOf('const PORT_PM_checkLiveStoreAuthority'),
      PORT_PURE.indexOf('const PORT_PM_utf8Bytes'));
    assert.ok(!/PM_READ_CORRUPT[\s\S]{0,80}ok: true/.test(pf),
      'a corrupt read never resolves to a safe verdict');
    assert.equal((PORT_CTL.match(/PORT_PM_checkLiveStoreAuthority\(/g) || []).length, 3,
      'export, staging and apply — the three mutation boundaries');
  });

  check('2C-Z9: one real UTF-8 byte authority exists and is used on both sides', () => {
    const u = PORT_PURE.slice(PORT_PURE.indexOf('const PORT_PM_utf8Bytes'),
      PORT_PURE.indexOf('const PORT_PM_decodeRawList'));
    assert.match(u, /new TextEncoder\(\)\.encode\(/, 'it measures real bytes');
    assert.match(u, /typeof TextEncoder !== 'function'\) return null/, 'and fails closed');
    assert.match(u, /catch \{ return null; \}/);
    assert.equal((stripComments(PORT_CODE).match(/const PORT_PM_utf8Bytes = /g) || []).length, 1,
      'exactly one definition');
    // parser side
    const parse = PORT_PURE.slice(PORT_PURE.indexOf('const PORT_PM_parseImportText'),
      PORT_PURE.indexOf('/* ── Merge'));
    assert.match(parse, /const bytes = PORT_PM_utf8Bytes\(s\)/, 'the parser measures bytes');
    assert.match(parse, /bytes === null \|\| bytes > PORT_PM_MAX_BYTES/, 'and fails closed');
    assert.ok(!/s\.length > PORT_PM_MAX_BYTES/.test(parse),
      'the String.length gate is gone from the parser');
  });

  check('2C-Z10: the export size check precedes createObjectURL and the download', () => {
    const ex = PORT_CTL.slice(PORT_CTL.indexOf('exportLibrary(root ='), PORT_CTL.indexOf('beginImport(root, file)'));
    const serialize = ex.indexOf('PORT_PM_serializeExport(');
    const size = ex.indexOf('const bytes = PORT_PM_utf8Bytes(text)');
    const guard = ex.indexOf('bytes === null || bytes > PORT_PM_MAX_BYTES');
    const download = ex.indexOf('PORT_PM_download(');
    const success = ex.indexOf("FEEDBACK_PM.say('Exported'");
    assert.ok(size !== -1 && guard !== -1, 'the export byte gate exists');
    assert.ok(serialize < size, 'it measures the serialized text');
    assert.ok(guard < download, 'and refuses before the download path');
    assert.ok(guard < success, 'so success cannot be reported for an unimportable file');
    assert.ok(!ex.slice(0, guard).includes('createObjectURL'),
      'no object URL can exist when the size gate refuses');
    assert.match(ex, /PM_MSG_PORT_EXPORT_TOO_LARGE/, 'with a truthful export-specific message');
  });

  check('2C-Z11: the export and import caps are the same constant', () => {
    const code = stripComments(PORT_CODE);
    assert.equal((code.match(/const PORT_PM_MAX_BYTES = /g) || []).length, 1, 'one cap');
    assert.ok(code.includes('bytes > PORT_PM_MAX_BYTES'), 'both sides compare against it');
    assert.ok(!/PORT_PM_MAX_BYTES \* |PORT_PM_MAX_BYTES \+ \d/.test(code),
      'and neither side quietly scales it');
  });

  check('2C-Z12: the earlier closures remain structurally intact', () => {
    for (const marker of [
      'const PORT_PM_isCanonicalId = ', 'const PORT_PM_rawEquals = ',
      'const PORT_PM_decodeRawList = ', 'const PORT_PM_restoreRaw = ',
      'nextRead() {', 'isCurrentRead(token) { return',
      'recoveryRequired = true', 'const reconcileDegraded = ',
    ]) {
      assert.ok(PORT_CODE.includes(marker), `still present: ${marker}`);
    }
    const api = SRC.match(/^ {2}MOD_OBJ\.api\.\w+ = /gm) || [];
    assert.equal(api.length, 6);
    assert.ok(!/autoSend/.test(PORT_CODE));
    assert.ok(!PORT_CODE.includes('KEY_PM_STATE_HISTORY_V1'));
  });

  check('2C-Z13: the stale trimmed-id comment is gone', () => {
    assert.ok(!PORT_PURE.includes('the id, which is trimmed'),
      'the export projection no longer claims to trim the id');
    assert.match(PORT_PURE, /Ids are not trimmed either/,
      'and says what it actually does');
  });

  /* ═════ PHASE 2C CLOSURE 4 — LIVE AUTHORITY + COMPLETE RECORDS ═════ */

  check('2C-AA1: VALID live arrays are compared with current in-memory authority', () => {
    const pf = stripComments(PORT_PURE.slice(PORT_PURE.indexOf('const PORT_PM_checkLiveStoreAuthority'),
      PORT_PURE.indexOf('const PORT_PM_utf8Bytes')));
    const read = pf.indexOf('const rd = ENGINE_PM_readArray(key);');
    const live = pf.indexOf('const live = PORT_PM_projectList(persisted, project, validate');
    const memory = pf.indexOf('const memory = PORT_PM_projectList(mem, project, validate');
    const compare = pf.indexOf('JSON.stringify(liveLogical) !== JSON.stringify(memoryLogical)');
    assert.ok(read !== -1 && live > read && memory > live && compare > memory,
      'classified read, strict live projection, strict memory projection, then comparison');
  });

  check('2C-AA2: PM_READ_VALID can never be a stand-alone success verdict', () => {
    const pf = stripComments(PORT_PURE.slice(PORT_PURE.indexOf('const PORT_PM_checkLiveStoreAuthority'),
      PORT_PURE.indexOf('const PORT_PM_utf8Bytes')));
    assert.ok(!/PM_READ_VALID[\s\S]{0,100}ok: true/.test(pf),
      'VALID is not treated as coherent merely because it parsed as an array');
    assert.ok(pf.indexOf("return { ok: true, error: '' };") >
      pf.indexOf('JSON.stringify(liveLogical) !== JSON.stringify(memoryLogical)'),
      'success occurs only after canonical logical equality');
  });

  check('2C-AA3: Prompt manual sequence participates in coherence unchanged', () => {
    const pf = PORT_PURE.slice(PORT_PURE.indexOf('const PORT_PM_checkLiveStoreAuthority'),
      PORT_PURE.indexOf('const PORT_PM_utf8Bytes'));
    assert.match(pf, /const promptSequence = \(list\) => list\.slice\(\)/,
      'Prompt comparison copies but never reorders');
    assert.match(pf, /PM_MSG_PORT_CHANGED_PROMPTS, promptSequence\)/,
      'the Prompt store uses that exact sequence authority');
  });

  check('2C-AA4: Quick coherence uses the unchanged runtime `order` semantics on copies', () => {
    const pf = PORT_PURE.slice(PORT_PURE.indexOf('const PORT_PM_checkLiveStoreAuthority'),
      PORT_PURE.indexOf('const PORT_PM_utf8Bytes'));
    assert.match(pf, /const quickSequence = \(list\) => list\.slice\(\)\s*\.sort\(\(a, b\) => \(a\?\.order \|\| 0\) - \(b\?\.order \|\| 0\)\)/,
      'Quick copies are sorted exactly like ENGINE_PM.loadQuick');
    assert.match(pf, /PM_MSG_PORT_CHANGED_QUICK, quickSequence\)/);
    assert.ok(!/list\.sort\(/.test(stripComments(pf)), 'neither caller-owned array is sorted in place');
  });

  check('2C-AA5: stale storage returns before Export can build or download', () => {
    const ex = PORT_CTL.slice(PORT_CTL.indexOf('exportLibrary(root ='), PORT_CTL.indexOf('beginImport(root, file)'));
    const live = ex.indexOf('const live = PORT_PM_checkLiveStoreAuthority(');
    const guard = ex.indexOf('if (!live.ok)');
    const ret = ex.indexOf('return false;', guard);
    const build = ex.indexOf('PORT_PM_buildExportEnvelope(');
    const download = ex.indexOf('PORT_PM_download(');
    assert.ok(live !== -1 && guard > live && ret > guard && ret < build && ret < download);
  });

  check('2C-AA6: Apply mismatch returns before candidates, backup and all live writes', () => {
    const apply = PORT_CTL.slice(PORT_CTL.indexOf('applyImport(root ='));
    const live = apply.indexOf('const liveAtApply = PORT_PM_checkLiveStoreAuthority(');
    const guard = apply.indexOf('if (!liveAtApply.ok)');
    const ret = apply.indexOf('return false;', guard);
    for (const later of ['PORT_PM_buildImportCandidates(', 'UTIL_storage.readRaw(',
      'PORT_PM_buildBackupEnvelope(', 'ENGINE_PM.persistPrompts(', 'ENGINE_PM.persistQuick(']) {
      const at = apply.indexOf(later);
      assert.ok(at > ret, `${later} remains unreachable after a mismatch return`);
    }
    assert.ok(live !== -1 && guard > live && ret > guard);
  });

  check('2C-AA7: projectList strict-validates ORIGINAL records before projection', () => {
    const proj = stripComments(PORT_PURE.slice(PORT_PURE.indexOf('const PORT_PM_projectList'),
      PORT_PURE.indexOf('const PORT_PM_buildExportEnvelope')));
    const original = proj.indexOf('const canonical = validate(rec);');
    const originalGuard = proj.indexOf('if (!canonical)');
    const projection = proj.indexOf('project(canonical, id)');
    assert.ok(original !== -1 && original < originalGuard && originalGuard < projection,
      'an unknown source key is seen before any selector can drop it');
    assert.match(proj, /out\.push\(canonical\)/, 'the validated complete record is the output authority');
  });

  check('2C-AA8: unknown source keys cannot be sanitized away', () => {
    for (const validator of ['const PORT_PM_validateImportPrompt', 'const PORT_PM_validateImportQuick']) {
      const i = PORT_PURE.indexOf(validator);
      const body = PORT_PURE.slice(i, i + 1800);
      assert.match(body, /PORT_PM_onlyKnownKeys\(rec, PORT_PM_(?:PROMPT|QUICK)_KEYS\)/,
        `${validator} owns the declared key gate`);
    }
    const proj = PORT_PURE.slice(PORT_PURE.indexOf('const PORT_PM_projectList'),
      PORT_PURE.indexOf('const PORT_PM_buildExportEnvelope'));
    assert.ok(proj.indexOf('validate(rec)') < proj.indexOf('project(canonical, id)'),
      'the known-key gate necessarily runs on the source object first');
  });

  check('2C-AA9: backup and export share the same complete-record authority', () => {
    const exportBlock = PORT_PURE.slice(PORT_PURE.indexOf('const PORT_PM_buildExportEnvelope'),
      PORT_PURE.indexOf('const PORT_PM_serializeExport'));
    const backupBlock = PORT_PURE.slice(PORT_PURE.indexOf('const PORT_PM_buildBackupEnvelope'),
      PORT_PURE.indexOf('const PORT_PM_rawEquals'));
    for (const block of [exportBlock, backupBlock]) {
      assert.match(block, /PORT_PM_projectList\(prompts, PORT_PM_exportPrompt, PORT_PM_validateImportPrompt/);
      assert.match(block, /PORT_PM_projectList\(quick, PORT_PM_exportQuick, PORT_PM_validateImportQuick/);
    }
    assert.equal((stripComments(PORT_PURE).match(/const PORT_PM_projectList = /g) || []).length, 1,
      'there is one collection authority, not export/backup/preflight copies');
  });

  check('2C-AA10: optional Prompt presence is strict, not undefined-as-absent repair', () => {
    const vp = PORT_PURE.slice(PORT_PURE.indexOf('const PORT_PM_validateImportPrompt'),
      PORT_PURE.indexOf('const PORT_PM_validateImportQuick'));
    assert.match(vp, /PORT_PM_hasOwn\(rec, 'lastUsedAt'\)/);
    assert.match(vp, /PORT_PM_hasOwn\(rec, 'useCount'\)/);
    assert.ok(!/rec\.(?:lastUsedAt|useCount) !== undefined/.test(stripComments(vp)));
  });

  check('2C-AA11: coherence is structural and never raw-JSON-string equality', () => {
    const pf = stripComments(PORT_PURE.slice(PORT_PURE.indexOf('const PORT_PM_checkLiveStoreAuthority'),
      PORT_PURE.indexOf('const PORT_PM_utf8Bytes')));
    assert.ok(!pf.includes('rd.raw'), 'the preflight does not compare storage byte strings');
    assert.match(pf, /JSON\.stringify\(liveLogical\)/,
      'only fixed-key canonical values are serialized for structural equality');
    assert.match(pf, /PORT_PM_projectList\(persisted/);
  });

  check('2C-AA12: Q/S/Z, read generation, recovery and rollback authorities remain present', () => {
    for (const marker of [
      'const PORT_PM_sequenceQuick = ', 'const PORT_PM_checkLiveStoreAuthority = ',
      'const PORT_PM_utf8Bytes = ', 'nextRead() {', 'isCurrentRead(token) { return',
      'recoveryRequired = true', 'const PORT_PM_rawEquals = ', 'const rollback = ',
      'const reconcileDegraded = ', 'PORT_PM_decodeRawList(rb.nowPrompts)',
    ]) assert.ok(PORT_CODE.includes(marker), `preserved: ${marker}`);
    assert.equal((PORT_CTL.match(/PORT_PM_checkLiveStoreAuthority\(/g) || []).length, 3,
      'Export, beginImport and Apply remain the three portability boundaries');
  });

  /* ── Route suppression: chat-only controls must never mount, remount or
   * remain visible off an active chat route, while product-wide Prompt Manager
   * services stay unconditional. ─────────────────────────────────────────── */

  const rsSlice = (start, end) => {
    const a = CODE.indexOf(start);
    assert.ok(a >= 0, `missing anchor: ${start}`);
    const b = CODE.indexOf(end, a + start.length);
    assert.ok(b > a, `missing terminator: ${end}`);
    return CODE.slice(a, b);
  };

  check('3A-R1: route eligibility is pathname-derived and its pattern is pinned', () => {
    const CHAT_RE = /^(?:\/c\/|\/g\/[^/]+\/c\/)/i;
    assert.ok(CODE.includes(`CHAT_PATH_RE: ${CHAT_RE.toString()},`),
      'VIEW_PM.CHAT_PATH_RE drifted from the pinned pattern');
    assert.match(CODE, /const VIEW_PM_isChatPath = \(\) => VIEW_PM\.CHAT_PATH_RE\.test\(String\(W\.location\?\.pathname/,
      'route eligibility must be derived from live location.pathname');
    for (const p of ['/c/abc', '/C/abc', '/g/g-1/c/abc']) {
      assert.ok(CHAT_RE.test(p), `must be eligible: ${p}`);
    }
    for (const p of ['/g/g-1/project', '/g/g-1/project/x', '/', '/library', '/gpts', '/codex']) {
      assert.ok(!CHAT_RE.test(p), `must be ineligible: ${p}`);
    }
  });

  check('3A-R2: the mount boundary fails closed on route before it reads the form', () => {
    const head = rsSlice('ensureUI() {', 'const existing = UI_PM.getRoot();');
    const guard = head.indexOf('if (!VIEW_PM_isChatPath()) return null;');
    const form = head.indexOf('const form = DOM_getForm();');
    assert.ok(guard >= 0, 'ensureUI does not refuse ineligible routes');
    assert.ok(form >= 0, 'ensureUI no longer reads the form');
    assert.ok(guard < form,
      'the route guard must precede the form read — composer presence alone must never authorise a mount');
  });

  check('3A-R3: ensureUI remains the single creator of the owned root', () => {
    assert.equal((CODE.match(/setAttribute\(ATTR_CGXUI, UI_PM_WRAP\)/g) || []).length, 1,
      'more than one site creates the Prompt Manager wrap');
    assert.equal((CODE.match(/UI_PM\.ensureUI\(\)/g) || []).length, 1,
      'ensureUI gained a second call site; the mount boundary must stay single');
  });

  check('3A-R4: product-wide boot initialization is NOT route-gated', () => {
    const pre = rsSlice('function CORE_PM_boot() {', 'const root = UI_PM.ensureUI();');
    for (const marker of [
      'ENGINE_PM.migrateKeysOnce()', 'ENGINE_PM.migrateDraftsFromHistoryOnce()',
      'ENGINE_PM.loadPrompts()', 'ENGINE_PM.loadQuick()', 'UI_ensureStyle()',
    ]) assert.ok(pre.includes(marker), `core initialization lost: ${marker}`);
    assert.ok(!/VIEW_PM_isChatPath|VIEW_PM_shouldShow/.test(pre),
      'boot must not refuse core/background initialization on non-chat routes');
  });

  check('3A-R5: an ineligible route is a refusal, not a boot failure', () => {
    const branch = rsSlice('const root = UI_PM.ensureUI();', 'PM_DOCK_installBridge();');
    const ineligible = branch.indexOf('if (!VIEW_PM_isChatPath()) {');
    const unlatch = branch.indexOf('STATE_PM.booted = false;');
    assert.ok(ineligible >= 0, 'boot does not distinguish an ineligible route from a failed mount');
    assert.ok(unlatch > ineligible,
      'the ineligible branch must be handled before the failure branch un-latches booted');
    const refusal = branch.slice(ineligible, unlatch);
    assert.ok(refusal.includes('CORE_PM_finishBoot();') && refusal.includes('return;'),
      'the ineligible branch must still run the non-UI tail, then return');
    assert.ok(!/PM_FORCE_RECOVER = true|CORE_PM_scheduleBootRetry/.test(refusal),
      'an ineligible route must not arm recovery — that would re-run migrations every retry');
  });

  check('3A-R6: the non-UI tail is shared by both boot paths', () => {
    const tail = rsSlice('function CORE_PM_finishBoot() {', 'function CORE_PM_invalidateRoute');
    for (const marker of [
      'TIME_PM.ensureHistoryCapture();', 'TIME_PM.attachDraftCaptureOnClose();',
      'TIME_PM.attachPastedCapture();', 'PM_READY_EMITTED = true;',
      'UTIL_event.emit(EV_PM_READY_V1, detail)', 'UTIL_event.emit(EV_PM_READY_LEGACY_V1, detail)',
    ]) assert.ok(tail.includes(marker), `non-UI tail lost: ${marker}`);
    assert.ok(!/STATE_PM\.ui\.root|UI_PM\.getRoot\(\)/.test(tail),
      'the non-UI tail must not depend on the root');
    assert.equal((CODE.match(/CORE_PM_finishBoot\(\);/g) || []).length, 2,
      'the tail must run on exactly the mounted path and the route-withheld path');
    assert.equal((CODE.match(/function CORE_PM_finishBoot\(\)/g) || []).length, 1);
  });

  check('3A-R7: remount/self-heal recovery is route-gated', () => {
    const heal = rsSlice('function CORE_PM_scheduleSelfHeal', 'function CORE_PM_installSelfHealObserver');
    assert.match(heal, /if \(!hasRoot && VIEW_PM_isChatPath\(\)\) \{/,
      'the no-root recovery branch must be route-gated or it loops forever off a chat route');
    assert.ok(heal.includes('CORE_PM_dispose();'), 'recovery still disposes before re-boot');
  });

  check('3A-R8: invalidation tears down synchronously, in the only correct order', () => {
    const inv = rsSlice('function CORE_PM_invalidateRoute() {', 'function PM_ROUTE_installInvalidation');
    const dock = inv.indexOf('PM_DOCK_sync(root);');
    const place = inv.indexOf('UI_PM_placeFloatingRoot(root);');
    assert.ok(dock >= 0 && place >= 0, 'invalidation must use the existing hide-only paths');
    assert.ok(dock < place,
      'PM_DOCK_sync must run first: it clears dockMode, which UI_PM_scheduleFloatingLayout early-returns on');
    assert.ok(!inv.includes('UI_PM_scheduleFloatingLayout'),
      'teardown must not defer through requestAnimationFrame — that reopens the frame it exists to close');
    assert.ok(!inv.includes('CORE_PM_dispose'),
      'teardown must not dispose; Project->chat must remount without a full re-boot');
    assert.ok(!/persist|commit|localStorage|setItem|removeItem/i.test(inv),
      'route invalidation must never touch storage');
    assert.ok(!/setInterval|MutationObserver|requestAnimationFrame/.test(inv),
      'no new timers, observers or frame work in the teardown path');
  });

  check('3A-R9: the route listener is document-scoped, not module-scoped', () => {
    const ins = rsSlice('function PM_ROUTE_installInvalidation() {', 'function CORE_PM_boot()');
    assert.match(ins, /if \(W\.__H2O_PM_ROUTE_WIRED__\) return;\s*\n\s*W\.__H2O_PM_ROUTE_WIRED__ = true;/,
      'idempotency must use a window-owned sentinel; a module-local flag resets on re-evaluation');
    assert.ok(!ins.includes('CLEAN_addFn'),
      'the route listener must outlive CORE_PM_dispose(), like the self-heal observer');
    assert.match(ins, /MOD_OBJ\.core\?\.invalidateRoute\?\.\(\)/,
      'the handler must dispatch through the window-owned module object, never a captured closure');
    assert.ok(!/CORE_PM_invalidateRoute\(\)/.test(ins),
      'binding the local function directly would strand a stale scope after re-evaluation');
  });

  check('3A-R10: ho:navigate is the authority; the rest are supplemental', () => {
    const ins = rsSlice('function PM_ROUTE_installInvalidation() {', 'function CORE_PM_boot()');
    assert.ok(ins.includes(`W.addEventListener('ho:navigate', onRoute`),
      'the synchronous pushState/replaceState authority must be bound');
    for (const ev of ['evt:h2o:route:changed', 'h2o:route:changed', 'popstate', 'pageshow']) {
      assert.ok(ins.includes(`W.addEventListener('${ev}', onRoute`), `supplemental signal lost: ${ev}`);
    }
    assert.match(ins, /typeof onChange === 'function'/,
      'H2O.surface must be optional — it is only pushState-aware via optional MiniMap');
    assert.ok(!/setInterval|setTimeout/.test(ins), 'no polling for a navigation signal');
  });

  check('3A-R11: lifecycle is published before the permanent listener is installed', () => {
    const boot = rsSlice('MOD_OBJ.core = MOD_OBJ.core ||', 'MOD_OBJ.api.open = API_PM_open;');
    const publish = boot.indexOf('MOD_OBJ.core.invalidateRoute = CORE_PM_invalidateRoute;');
    const install = boot.indexOf('PM_ROUTE_installInvalidation();');
    assert.ok(publish >= 0 && install >= 0, 'bootstrap must publish and install');
    assert.ok(publish < install, 'the lazy MOD_OBJ.core lookup must never be able to miss');
    assert.ok(boot.indexOf('CORE_PM_installSelfHealObserver();') < install + 1);
    assert.equal((CODE.match(/PM_ROUTE_installInvalidation\(\);/g) || []).length, 1);
  });

  check('3A-R12: visibility policy is unchanged and no router was added', () => {
    assert.equal((CODE.match(/VIEW_PM_shouldShow/g) || []).length, 3,
      'VIEW_PM_shouldShow must remain its definition plus exactly its two existing hide-only call sites');
    for (const host of ['PM_DOCK_sync', 'UI_PM_placeFloatingRoot']) {
      assert.ok(CODE.includes(host), `hide-only call site lost: ${host}`);
    }
    assert.ok(!/history\.(pushState|replaceState)\s*=/.test(CODE),
      'Prompt Manager must never wrap history; ho:navigate is the existing authority');
    assert.ok(!/new MutationObserver/.test(
      rsSlice('function CORE_PM_finishBoot() {', 'function CORE_PM_boot()')),
      'no new observer was introduced by the suppression work');
  });


  /* ── [2-storage] Classified write-failure invariants ────────────────────
   * Behaviour is proven by the storage-safety fault injection. These pin the
   * shape that behaviour depends on: one shared reporting path, no silent
   * refusal, no stale global error, and no capacity claim. */

  check('[2-storage] no user-facing persistence path fails silently', () => {
    /* Every commit*Result guard in a UI handler must report. The oracle is the
     * absence of the old shape: a refused commit that simply returns. */
    assert.doesNotMatch(CODE, /if \(!ENGINE_PM\.commit(Prompts|Quick)\(next\)\) return;/,
      'a refused commit must never return without telling the user');
    const guards = CODE.match(/if \(!w[a-z]\.ok\)\s*\{[^}]*\}/g) || [];
    assert.ok(guards.length >= 8, `expected the classified guards, found ${guards.length}`);
    for (const g of guards) {
      assert.match(g, /FEEDBACK_PM_writeFailure\(/,
        `every classified write guard must report through the shared helper: ${g.slice(0, 60)}`);
    }
  });

  check('[2-storage] the reorder handler reports a refused write', () => {
    const i = CODE.indexOf('const moveBtn = e.target.closest');
    assert.ok(i !== -1, 'reorder handler not found');
    const block = CODE.slice(i, CODE.indexOf('const starBtn = e.target.closest', i));
    const commit = block.indexOf('ENGINE_PM.commitPromptsResult(');
    const report = block.indexOf('FEEDBACK_PM_writeFailure(');
    assert.ok(commit !== -1, 'reorder must persist through the classified commit');
    assert.ok(report !== -1 && report > commit,
      'reorder must report the refusal after attempting the write — this is the Issue closed here');
  });

  check('[2-storage] the generic duplicated failure literal is gone', () => {
    const hits = (CODE.match(/FEEDBACK_PM\.say\('Storage write failed'/g) || []);
    assert.equal(hits.length, 0,
      `the duplicated generic literal must be replaced by the classified helper; found ${hits.length}`);
    assert.equal((CODE.match(/const FEEDBACK_PM_writeFailure = /g) || []).length, 1,
      'exactly one shared write-failure reporter');
  });

  check('[2-storage] classification is per-attempt, never a module-level last error', () => {
    assert.doesNotMatch(CODE, /lastWriteError|LAST_WRITE_ERROR|STATE_PM\.lastWrite/,
      'a stale global last-error field would describe the wrong attempt');
    /* The kind is carried on the result object each attempt returns. */
    assert.match(CODE, /const UTIL_writeFail = \(kind, error\) =>/, 'per-attempt failure factory missing');
    assert.match(CODE, /setJSONResult\(key, obj\)/, 'classified write missing');
  });

  check('[2-storage] serialization is classified separately from the storage write', () => {
    const fn = CODE.match(/setJSONResult\(key, obj\) \{[\s\S]*?\n    \},/);
    assert.ok(fn, 'setJSONResult not found');
    const body = fn[0];
    const iSer = body.indexOf('PM_WRITE_SERIALIZATION');
    const iSet = body.indexOf('localStorage.setItem');
    assert.ok(iSer !== -1 && iSet !== -1 && iSer < iSet,
      'serialization must be resolved before any setItem is attempted');
    assert.match(body, /UTIL_classifyWriteError\(e\)/, 'the setItem catch must classify');
  });

  check('[2-storage] no message claims storage capacity PM cannot measure', () => {
    for (const name of ['PM_MSG_WRITE_QUOTA', 'PM_MSG_WRITE_BLOCKED', 'PM_MSG_WRITE_SERIALIZATION', 'PM_MSG_WRITE_UNKNOWN']) {
      const m = CODE.match(new RegExp(`const ${name} = '([^']*)'`));
      assert.ok(m, `${name} missing`);
      assert.ok(!/\d+\s*%/.test(m[1]) && !/\d+\s*(KB|MB|GB)/i.test(m[1]),
        `${name} must not state capacity: ${m[1]}`);
    }
    assert.doesNotMatch(CODE, /navigator\.storage|storage\.estimate\(/,
      'PM must not read an origin-wide estimate and present it as localStorage headroom');
  });

  check('[2-storage] the public API is unchanged and the surface stays internal', () => {
    const api = CODE.match(/MOD_OBJ\.api\.\w+ = /g) || [];
    assert.equal(api.length, 6, `the public API must stay at six methods, found ${api.length}`);
    assert.match(CODE, /if \(W\.__H2O_PM_TEST__ === true\) \{/, 'the test surface must stay flag-gated');
    const gate = CODE.indexOf('if (W.__H2O_PM_TEST__ === true) {');
    assert.ok(CODE.indexOf('writeKinds:') > gate, 'writeKinds must live behind the test gate');
    assert.ok(CODE.indexOf('writeMessage:') > gate, 'writeMessage must live behind the test gate');
  });

  check('[2-storage] no storage schema key was added or renamed', () => {
    const keys = (CODE.match(/const KEY_PM_[A-Z0-9_]+ = /g) || []).length;
    assert.equal(keys, PINNED_PM_KEY_COUNT,
      `storage key count changed (${keys} vs ${PINNED_PM_KEY_COUNT}) — this mission adds no schema and no migration`);
  });



  /* ── [A11Y] Panel disclosure semantics and focus ownership ──────────────
   * Behaviour is proven by the route/lifecycle harness. These pin the shape it
   * depends on: non-modal semantics, one focus owner, and a restoration path
   * that route teardown cannot reach. */

  check('[A11Y] the panel is a non-modal region, never a dialog', () => {
    const i = CODE.indexOf('id="${A11Y_PM_PANEL_ID}"');
    assert.ok(i !== -1, 'panel markup not found');
    const tpl = CODE.slice(i, i + 300);
    assert.match(tpl, /role="region"/, 'the panel must carry the non-modal structural role');
    assert.ok(!/role="dialog"/.test(tpl), 'the page stays interactive — dialog would be untrue');
    assert.ok(!/aria-modal/.test(CODE), 'aria-modal must never appear: nothing is made inert but the panel');
  });

  check('[A11Y] no focus trap is introduced', () => {
    assert.ok(!/focusTrap|trapFocus|FOCUS_TRAP/i.test(CODE),
      'a non-modal disclosure must not trap focus');
    assert.ok(!/(body|documentElement)\.setAttribute\('inert'/.test(CODE),
      'only the panel is inerted — never the page');
  });

  check('[A11Y] the panel id is stable and singular', () => {
    assert.match(CODE, /const A11Y_PM_PANEL_ID = `cgxui-\$\{SkID\}-panel`/,
      'a generated id would break aria-controls across remounts');
    assert.equal((CODE.match(/id="\$\{A11Y_PM_PANEL_ID\}"/g) || []).length, 1, 'exactly one panel carries the id');
    assert.equal((CODE.match(/aria-controls="\$\{A11Y_PM_PANEL_ID\}"/g) || []).length, 1, 'exactly one trigger references it');
  });

  check('[A11Y] aria-expanded is owned by the single panel-state authority', () => {
    const fn = CODE.match(/const UI_PM_applyPanelState = [\s\S]*?\n  \}, false\);/);
    assert.ok(fn, 'applyPanelState not found');
    assert.match(fn[0], /aria-expanded/, 'the state authority must synchronise aria-expanded');
    assert.equal((CODE.match(/'aria-expanded'/g) || []).length, 1,
      'aria-expanded must be written in exactly one place, never at the call sites');
  });

  check('[A11Y] focus restoration belongs to the explicit close path only', () => {
    const close = CODE.match(/function UI_PM_closePanel\(\) \{[\s\S]*?\n  \}/);
    assert.ok(close, 'closePanel not found');
    assert.match(close[0], /A11Y_PM_restoreFocus\(/, 'the explicit close owner restores focus');
    const aps = CODE.match(/const UI_PM_applyPanelState = [\s\S]*?\n  \}, false\);/)[0];
    assert.ok(!/A11Y_PM_restoreFocus/.test(aps),
      'the generic state function is also the route-suppression path — it must never restore focus');
    assert.match(CODE, /const A11Y_PM_restoreFocus = /, 'exactly one definition');
    assert.equal((CODE.match(/A11Y_PM_restoreFocus\(/g) || []).length, 1,
      'exactly one caller — restoration must not be scattered across close buttons');
  });

  check('[A11Y] the focus origin is captured once, internally, and never exposed', () => {
    assert.match(CODE, /if \(!UI_PM_isPanelOpen\(\)\) \{\s*PM_FOCUS_ORIGIN = /,
      'capture must be gated on a real CLOSED -> OPEN transition');
    assert.ok(!/MOD_OBJ\.api\.[A-Za-z]*[Ff]ocusOrigin/.test(CODE), 'not on the public API');
    assert.ok(!/setJSON[^\n]*PM_FOCUS_ORIGIN|PM_FOCUS_ORIGIN[^\n]*setJSON/.test(CODE), 'never persisted');
    assert.ok(!/UTIL_diag[^\n]*PM_FOCUS_ORIGIN/.test(CODE), 'never written to diagnostics');
  });

  check('[A11Y] restoration never falls back to the composer or the document root', () => {
    const g = CODE.match(/const A11Y_PM_canFocus = [\s\S]*?\n  \}, false\);/);
    assert.ok(g, 'canFocus guard not found');
    assert.match(g[0], /el === D\.body \|\| el === D\.documentElement/, 'body/documentElement rejected');
    assert.match(g[0], /D\.contains\(el\)/, 'detached elements rejected');
    assert.match(g[0], /hasAttribute\?\.\('inert'\)/, 'inert subtrees rejected');
    assert.match(g[0], /aria-hidden/, 'aria-hidden subtrees rejected');
    const r = CODE.match(/const A11Y_PM_restoreFocus = [\s\S]*?\n  \}, false\);/)[0];
    assert.ok(!/DOM_getEditableInput|DOM_setInputText/.test(r),
      'the composer must never be a focus fallback — it would move the caret');
  });

  check('[A11Y] no focus timer or frame was introduced', () => {
    const r = CODE.match(/const A11Y_PM_restoreFocus = [\s\S]*?\n  \}, false\);/)[0];
    const c = CODE.match(/const A11Y_PM_canFocus = [\s\S]*?\n  \}, false\);/)[0];
    for (const b of [r, c]) {
      assert.ok(!/setTimeout|requestAnimationFrame|setInterval/.test(b),
        'focus work must be synchronous — a deferred call could fire after navigation');
    }
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
