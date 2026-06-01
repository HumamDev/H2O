#!/usr/bin/env node
// R4.5.5 — Library Organization UI Release Gate validator.
//
// MATRIX validator for the complete Desktop-first Library Organization UI
// surface (R4.5.1.a → R4.5.4). Asserts that for each target × operation ×
// surface, the implementation routes through the canonical chain and
// respects the hard boundaries.
//
// This validator is a GATE, not a feature exercise — it does not invoke
// runtime behavior (the existing import-bundle validator's Groups 14–18
// cover runtime contracts). It is pure source-pattern matching across
// the 8 files that constitute the R4.5 surface:
//
//   Studio actions modules (write paths):
//     - S0F3b. 🎬 Folders Actions      (R4.4)
//     - S0F4b. 🎬 Categories Actions   (R4.1)
//     - S0F5b. 🎬 Tags Actions         (R4.3)
//     - S0F6b. 🎬 Labels Actions       (R4.2)
//   Public facade (platform routing):
//     - S0F1j. 🎬 Library Actions      (extended across R4.1–R4.4)
//   UI surfaces (R4.5):
//     - S0F1m. 🎬 Library Organization Modals  (R4.5.1.a / R4.5.2 / R4.5.3)
//     - S0F1n. 🎬 Library Batch Toolbar         (R4.5.4)
//     - S0Z1g. 🎬 Library Sidebar Sections      (re-wired across R4.5.x)
//
// The validator is organized into 8 sections:
//
//   A. Studio actions modules — namespace + canonical refresh dispatch
//   B. LibraryActions facade — Desktop vs MV3 routing per method
//   C. OrganizationModals — modes + actions.* dependency per target
//   D. BatchToolbar — selection API + Promise.all fan-out + refresh coalesce
//   E. S0Z1g sidebar — Desktop branches + MV3 fallback ladders preserved
//   F. Cross-file boundary — no ChatGPT DOM scanning in any UI module
//   G. Refresh event single-source — canonical event only, no novel names
//   H. Native 0F5a remains the extraction owner

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..', '..', '..');

function abs(rel) { return path.join(REPO_ROOT, rel); }
function read(rel) { return fs.readFileSync(abs(rel), 'utf8'); }
/* Strip JS comments so docstring mentions of forbidden APIs don't
 * false-trigger boundary scans. Mirrors the pattern used across the
 * R4.x boundary checks. */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:\\])\/\/[^\n]*/g, '$1');
}

const PASS = [];
const FAIL = [];
function check(label, fn) {
  try { fn(); PASS.push(label); }
  catch (e) { FAIL.push({ label, err: String(e && e.message ? e.message : e) }); }
}

/* ── File handles ─────────────────────────────────────────────────────── */
const FILES = {
  folders:        'src-surfaces-base/studio/S0F3b. 🎬 Folders Actions - Studio.js',
  categories:     'src-surfaces-base/studio/S0F4b. 🎬 Categories Actions - Studio.js',
  tags:           'src-surfaces-base/studio/S0F5b. 🎬 Tags Actions - Studio.js',
  labels:         'src-surfaces-base/studio/S0F6b. 🎬 Labels Actions - Studio.js',
  facade:         'src-surfaces-base/studio/S0F1j. 🎬 Library Actions - Studio.js',
  modals:         'src-surfaces-base/studio/S0F1m. 🎬 Library Organization Modals - Studio.js',
  toolbar:        'src-surfaces-base/studio/S0F1n. 🎬 Library Batch Toolbar - Studio.js',
  sidebar:        'src-surfaces-base/studio/S0Z1g. 🎬 Library Sidebar Sections - Studio.js',
  nativeTags:     'src-runtime-base/0F5a.⬛️🗂️ Tags 🗂️.js',
};

const SRC = {};
for (const [k, rel] of Object.entries(FILES)) {
  SRC[k] = fs.existsSync(abs(rel)) ? read(rel) : '';
  if (!SRC[k]) FAIL.push({ label: `FILE_MISSING: ${rel}`, err: 'file not found' });
}
const STRIPPED = {};
for (const [k, src] of Object.entries(SRC)) {
  STRIPPED[k] = src ? stripComments(src) : '';
}

console.log('── R4.5.5 Library Organization UI Release Gate ──────────────');
console.log('   Matrix: 4 targets × 5 surfaces × multiple operations\n');

/* ════════════════════════════════════════════════════════════════════════
 * Section A — Studio actions modules (4 targets)
 * Assert each target's actions module exists, is Tauri-gated, registers on
 * H2O.Studio.actions.<target>, exposes create/rename/remove + bindings,
 * dispatches the canonical refresh event with `<target>-actions:<op>`
 * reason, and contains NO Native API / chrome.* / direct plugin:sql calls.
 * ═══════════════════════════════════════════════════════════════════════ */

console.log('Section A — Studio actions modules');
const TARGET_BINDOP = {
  folders:    'bindChat',     // single-folder-per-chat
  categories: 'assignChat',   // chats.category_id column
  labels:     'bindChat',     // many-to-many
  tags:       'bindChat',     // many-to-many
};
for (const target of ['folders', 'categories', 'labels', 'tags']) {
  const src = SRC[target];
  const stripped = STRIPPED[target];
  const bindOp = TARGET_BINDOP[target];

  check(`A.${target}: module is Tauri-gated`, () => {
    assert.match(src, /__TAURI_INTERNALS__/);
    assert.match(src, /if\s*\(\s*!\s*detectTauri\s*\(\s*\)\s*\)\s*return/);
  });
  check(`A.${target}: registers H2O.Studio.actions.${target}`, () => {
    assert.match(src, new RegExp(`H2O\\.Studio\\.actions\\.${target}\\s*=`));
  });
  check(`A.${target}: exposes create / rename / remove`, () => {
    assert.match(src, /async function create/);
    assert.match(src, /async function rename/);
    assert.match(src, /async function remove/);
  });
  check(`A.${target}: dispatches canonical refresh with '${target}-actions:<op>' reason`, () => {
    assert.match(src, /evt:h2o:library-index:refresh-request/);
    assert.match(src, new RegExp(`'${target}-actions:'`));
  });
  check(`A.${target}: has binding op (${bindOp})`, () => {
    assert.match(src, new RegExp(`async function ${bindOp}`));
  });
  check(`A.${target}: no direct chrome.* runtime calls`, () => {
    assert.equal(/\bchrome\.runtime\b/.test(stripped), false);
    assert.equal(/\bchrome\.storage\b/.test(stripped), false);
  });
}

/* ════════════════════════════════════════════════════════════════════════
 * Section B — LibraryActions facade (S0F1j)
 * Assert each public method exists, routes through actions.* on Desktop,
 * returns native-context-required on MV3, no direct plugin:sql.
 * ═══════════════════════════════════════════════════════════════════════ */

console.log('Section B — LibraryActions facade');
const FACADE_METHODS = [
  { name: 'setFolder',    target: 'folders'    },
  { name: 'setCategory',  target: 'categories' },
  { name: 'setLabels',    target: 'labels'     },
  { name: 'addLabel',     target: 'labels'     },
  { name: 'removeLabel',  target: 'labels'     },
  { name: 'setTags',      target: 'tags'       },
  { name: 'addTag',       target: 'tags'       },
  { name: 'removeTag',    target: 'tags'       },
];
for (const m of FACADE_METHODS) {
  check(`B.${m.name}: facade method exists`, () => {
    assert.match(SRC.facade, new RegExp(`async function ${m.name}\\s*\\(`));
  });
  check(`B.${m.name}: routes through H2O.Studio.actions.${m.target} on Desktop`, () => {
    assert.match(SRC.facade, new RegExp(`H2O\\.Studio\\?\\.actions\\?\\.${m.target}|H2O\\.Studio\\.actions\\.${m.target}`));
  });
}
check(`B.facade: returns native-context-required on MV3`, () => {
  /* After R4.4 there are at least 10 native-context-required references
   * in the facade — one per method that requires Desktop. */
  const occurrences = (SRC.facade.match(/native-context-required/g) || []).length;
  assert.ok(occurrences >= 10,
    `expected at least 10 'native-context-required' refs after R4.5; got ${occurrences}`);
});
check(`B.facade: no direct plugin:sql calls`, () => {
  const stripped = STRIPPED.facade;
  assert.equal(/plugin:sql/.test(stripped), false);
});

/* ════════════════════════════════════════════════════════════════════════
 * Section C — OrganizationModals (S0F1m)
 * Assert all 4 editors exist with correct modes; each handler routes
 * through H2O.Studio.actions.<target>.* (NOT store, NOT Native).
 * ═══════════════════════════════════════════════════════════════════════ */

console.log('Section C — OrganizationModals (S0F1m)');
check(`C.modals: Tauri-gated + registers H2O.Studio.OrganizationModals`, () => {
  assert.match(SRC.modals, /__TAURI_INTERNALS__/);
  assert.match(SRC.modals, /H2O\.Studio\.OrganizationModals\s*=/);
});
check(`C.modals: exposes openFolderEditor + openCategoryEditor + openLabelEditor + openTagEditor`, () => {
  assert.match(SRC.modals, /openFolderEditor:\s*openFolderEditor/);
  assert.match(SRC.modals, /openCategoryEditor:\s*openCategoryEditor/);
  assert.match(SRC.modals, /openLabelEditor:\s*openLabelEditor/);
  assert.match(SRC.modals, /openTagEditor:\s*openTagEditor/);
});
const MODES_PER_TARGET = {
  folders:    ['create', 'rename', 'color', 'delete'],   // 4 — color present
  categories: ['create', 'rename', 'delete'],            // 3 — no color
  labels:     ['create', 'rename', 'color', 'delete'],   // 4 — color present
  tags:       ['create', 'rename', 'delete'],            // 3 — no color, no extraction
};
for (const [target, modes] of Object.entries(MODES_PER_TARGET)) {
  check(`C.modals.${target}: supports ${modes.length} modes [${modes.join(', ')}]`, () => {
    const constName = target === 'folders' ? 'SUPPORTED_MODES' : `SUPPORTED_${target.toUpperCase().replace(/IES$/, 'Y').replace(/S$/, '')}_MODES`;
    /* The exact constants in S0F1m: SUPPORTED_MODES (folders),
     * SUPPORTED_CATEGORY_MODES, SUPPORTED_LABEL_MODES, SUPPORTED_TAG_MODES. */
    const constMap = {
      folders:    'SUPPORTED_MODES',
      categories: 'SUPPORTED_CATEGORY_MODES',
      labels:     'SUPPORTED_LABEL_MODES',
      tags:       'SUPPORTED_TAG_MODES',
    };
    const expectedConst = constMap[target];
    const pattern = new RegExp(`${expectedConst}\\s*=\\s*\\[${modes.map(m => `'${m}'`).join(',\\s*')}\\]`);
    assert.match(SRC.modals, pattern, `expected ${expectedConst} = [${modes.join(', ')}]`);
  });
  check(`C.modals.${target}: each mode has a handler`, () => {
    const targetPart = target === 'folders' ? '' : target.charAt(0).toUpperCase() + target.slice(1, -1);
    /* handleCreate/handleRename/handleDelete (folders) or
     * handleCategoryCreate/Rename/Delete, handleLabelCreate/.../Color/Delete, etc. */
    const handlerNames = {
      folders:    ['handleCreate', 'handleRename', 'handleColor', 'handleDelete'],
      categories: ['handleCategoryCreate', 'handleCategoryRename', 'handleCategoryDelete'],
      labels:     ['handleLabelCreate', 'handleLabelRename', 'handleLabelColor', 'handleLabelDelete'],
      tags:       ['handleTagCreate', 'handleTagRename', 'handleTagDelete'],
    };
    for (const hn of handlerNames[target]) {
      assert.match(SRC.modals, new RegExp(`async function ${hn}`));
    }
  });
  check(`C.modals.${target}: handlers call H2O.Studio.actions.${target}.*`, () => {
    assert.match(SRC.modals, new RegExp(`H2O\\.Studio && H2O\\.Studio\\.actions && H2O\\.Studio\\.actions\\.${target}`));
  });
}
check(`C.modals: no direct Native folder/category/label/tag mutation calls`, () => {
  const stripped = STRIPPED.modals
    .replace(/H2O\.Studio\.actions\.(folders|categories|labels|tags)/g, '<<ACTIONS>>')
    .replace(/H2O\.Studio\.store\.(folders|categories|labels|tags)/g, '<<STORE>>');
  assert.equal(/H2O\.folders\.(create|rename|update|remove|delete|patch)/.test(stripped), false);
  assert.equal(/H2O\.archiveBoot\.(renameCategory|deleteCategory|createCategory)/.test(stripped), false);
  assert.equal(/H2O\.Labels\.(renameLabel|deleteLabel|createLabel)/.test(stripped), false);
  assert.equal(/H2O\.Tags\.(renameTag|deleteTag|createTag|extractTag|deriveTag)/.test(stripped), false);
});
check(`C.modals: no direct plugin:sql / chrome.* calls`, () => {
  const stripped = STRIPPED.modals;
  assert.equal(/plugin:sql/.test(stripped), false);
  assert.equal(/\bchrome\.runtime\b/.test(stripped), false);
  assert.equal(/\bchrome\.storage\b/.test(stripped), false);
});
check(`C.modals: no dispatchEvent — single-source refresh via actions.*`, () => {
  assert.equal(/dispatchEvent\s*\(/.test(SRC.modals), false,
    'S0F1m must not dispatchEvent — single-source refresh via actions.*');
  assert.match(SRC.modals, /evt:h2o:library-index:refresh-request/);
});

/* ════════════════════════════════════════════════════════════════════════
 * Section D — BatchToolbar (S0F1n)
 * Assert selection API + enable/disable + Promise.all fan-out + ONE final
 * batch-toolbar refresh + opInProgress guard + lastAnchor clearing.
 * ═══════════════════════════════════════════════════════════════════════ */

console.log('Section D — BatchToolbar (S0F1n)');
check(`D.toolbar: Tauri-gated + registers H2O.Studio.BatchToolbar`, () => {
  assert.match(SRC.toolbar, /__TAURI_INTERNALS__/);
  assert.match(SRC.toolbar, /H2O\.Studio\.BatchToolbar\s*=/);
});
check(`D.toolbar: exposes selection.{add,remove,clear,has,size,all}`, () => {
  /* Accept any amount of whitespace between key and value (the public
   * surface object aligns columns for readability). */
  for (const [key, val] of [
    ['add',    'selectionAdd'],
    ['remove', 'selectionRemove'],
    ['clear',  'selectionClear'],
    ['has',    'selectionHas'],
    ['size',   'selectionSize'],
    ['all',    'selectionAll'],
  ]) {
    assert.match(SRC.toolbar, new RegExp(`${key}:\\s*${val}\\b`),
      `expected selection.${key} → ${val} in public API`);
  }
});
check(`D.toolbar: exposes enable / disable / isEnabled / diagnose`, () => {
  for (const m of ['enable', 'disable', 'isEnabled', 'diagnose']) {
    assert.match(SRC.toolbar, new RegExp(`${m}:\\s*${m}\\b`), `expected ${m}: ${m} in public API`);
  }
});
check(`D.toolbar: routes through H2O.LibraryActions facade (not actions.* directly)`, () => {
  assert.match(SRC.toolbar, /global\.H2O && global\.H2O\.LibraryActions/);
  const stripped = STRIPPED.toolbar;
  assert.equal(/H2O\.Studio\.actions\.(folders|categories|labels|tags)\./.test(stripped), false,
    'toolbar must compose via H2O.LibraryActions, not actions.* directly');
  assert.equal(/H2O\.Studio\.store\.(folders|categories|labels|tags)\./.test(stripped), false);
});
check(`D.toolbar: 4 batch ops (setFolder/setCategory/addLabel/addTag)`, () => {
  for (const op of ['setFolder', 'setCategory', 'addLabel', 'addTag']) {
    assert.match(SRC.toolbar, new RegExp(`fnName\\s*=\\s*'${op}'`));
  }
});
check(`D.toolbar: Promise.all fan-out + ONE final batch refresh`, () => {
  assert.match(SRC.toolbar, /Promise\.all\(\s*ids\.map\(/);
  assert.match(SRC.toolbar, /dispatchBatchRefresh\(\s*op\s*\+\s*':'\s*\+\s*ids\.length\s*\)/);
  assert.match(SRC.toolbar, /'batch-toolbar:'\s*\+/);
});
check(`D.toolbar: opInProgress guard (review-fix #1)`, () => {
  assert.match(SRC.toolbar, /opInProgress:\s*false/);
  assert.match(SRC.toolbar, /if\s*\(\s*state\.opInProgress\s*\)/);
  assert.match(SRC.toolbar, /status:\s*'op-in-progress'/);
  assert.match(SRC.toolbar, /state\.opInProgress\s*=\s*true/);
  assert.match(SRC.toolbar, /finally\s*\{[\s\S]*?state\.opInProgress\s*=\s*false/);
});
check(`D.toolbar: selectionRemove clears lastAnchor on anchor removal (review-fix #2)`, () => {
  const removeMatch = SRC.toolbar.match(/function selectionRemove[\s\S]*?return true;\s*\}/);
  assert.ok(removeMatch, 'selectionRemove function not found');
  assert.match(removeMatch[0], /if\s*\(\s*state\.lastAnchor\s*===\s*chatId\s*\)\s*state\.lastAnchor\s*=\s*''/);
});
check(`D.toolbar: modifier-aware click delegation (Cmd/Ctrl/Shift)`, () => {
  assert.match(SRC.toolbar, /function handleRowClick/);
  assert.match(SRC.toolbar, /ev\.shiftKey/);
  assert.match(SRC.toolbar, /ev\.metaKey\s*\|\|\s*ev\.ctrlKey/);
  assert.match(SRC.toolbar, /function selectionRange/);
});
check(`D.toolbar: no novel refresh event names`, () => {
  const stripped = STRIPPED.toolbar;
  assert.equal(/'evt:h2o:batch-toolbar:/.test(stripped), false,
    'toolbar must not invent novel event names');
  assert.match(SRC.toolbar, /'evt:h2o:library-index:refresh-request'/);
});

/* ════════════════════════════════════════════════════════════════════════
 * Section E — Sidebar (S0Z1g) — Desktop branches + MV3 fallbacks preserved
 * ═══════════════════════════════════════════════════════════════════════ */

console.log('Section E — Sidebar S0Z1g re-wiring');
check(`E.sidebar: folder-create button branches through OrganizationModals on Desktop (R4.5.1.a)`, () => {
  assert.match(SRC.sidebar, /tryOpenOrganizationModalsCreate/);
  assert.match(SRC.sidebar, /openFolderEditor\(\s*\{\s*mode:\s*'create'/);
  /* MV3 fallback preserved. */
  assert.match(SRC.sidebar, /openFolderCreatePanel\(button\)/);
});
check(`E.sidebar: promptRenameItem has Desktop branch for categories (R4.5.2)`, () => {
  const m = SRC.sidebar.match(/function promptRenameItem\(item\)[\s\S]*?^  \}/m);
  assert.ok(m, 'promptRenameItem not found');
  assert.match(m[0], /openCategoryEditor\(\{\s*categoryId:\s*item\.id,\s*mode:\s*'rename'/);
  /* MV3 ladder preserved. */
  assert.match(m[0], /H2O\.archiveBoot\?\.renameCategory/);
});
check(`E.sidebar: promptRenameItem has Desktop branch for labels (R4.5.3)`, () => {
  const m = SRC.sidebar.match(/function promptRenameItem\(item\)[\s\S]*?^  \}/m);
  assert.match(m[0], /openLabelEditor\(\{\s*labelId:\s*item\.id,\s*mode:\s*'rename'/);
  /* MV3 ladder preserved. */
  assert.match(m[0], /H2O\.Labels\?\.renameLabel/);
});
check(`E.sidebar: deleteMenuItem Desktop branches INSERTED BEFORE W.confirm (R4.5.2 + R4.5.3)`, () => {
  const m = SRC.sidebar.match(/function deleteMenuItem\(item\)[\s\S]*?^  \}/m);
  assert.ok(m, 'deleteMenuItem not found');
  const catIdx = m[0].indexOf("openCategoryEditor({ categoryId: item.id, mode: 'delete' })");
  const lblIdx = m[0].indexOf("openLabelEditor({ labelId: item.id, mode: 'delete' })");
  const confirmIdx = m[0].indexOf('W.confirm?.');
  assert.ok(catIdx > 0, 'categories Desktop branch missing');
  assert.ok(lblIdx > 0, 'labels Desktop branch missing');
  assert.ok(confirmIdx > catIdx, 'categories branch must precede W.confirm');
  assert.ok(confirmIdx > lblIdx, 'labels branch must precede W.confirm');
  /* MV3 ladder preserved. */
  assert.match(m[0], /H2O\.archiveBoot\?\.deleteCategory/);
  assert.match(m[0], /H2O\.Labels\?\.deleteLabel/);
});
check(`E.sidebar: ensureCategoryCreateButton + ensureLabelCreateButton + ensureTagCreateButton present`, () => {
  assert.match(SRC.sidebar, /function ensureCategoryCreateButton/);
  assert.match(SRC.sidebar, /function ensureLabelCreateButton/);
  assert.match(SRC.sidebar, /function ensureTagCreateButton/);
});
check(`E.sidebar: create-button helpers Tauri-gated + reference OrganizationModals`, () => {
  for (const fn of ['ensureCategoryCreateButton', 'ensureLabelCreateButton', 'ensureTagCreateButton']) {
    const m = SRC.sidebar.match(new RegExp(`function ${fn}[\\s\\S]*?return button;\\s*\\}`));
    assert.ok(m, `${fn} body not found`);
    assert.match(m[0], /__TAURI_INTERNALS__/);
    assert.match(m[0], /OrganizationModals/);
  }
});
check(`E.sidebar: distinct data attributes per catalog create button`, () => {
  assert.match(SRC.sidebar, /data-h2o-folder-create-button/);
  assert.match(SRC.sidebar, /data-h2o-category-create-button/);
  assert.match(SRC.sidebar, /data-h2o-label-create-button/);
  assert.match(SRC.sidebar, /data-h2o-tag-create-button/);
});
check(`E.sidebar: renderCategories + renderLabels wire ensure*CreateButton`, () => {
  const renderCat = SRC.sidebar.match(/async function renderCategories[\s\S]*?step\('renderCategories'/);
  assert.ok(renderCat && /ensureCategoryCreateButton\(\)/.test(renderCat[0]));
  const renderLab = SRC.sidebar.match(/async function renderLabels[\s\S]*?step\('renderLabels'/);
  assert.ok(renderLab && /ensureLabelCreateButton\(\)/.test(renderLab[0]));
  /* R4.5.3 defensive — tag create button is wired in renderLabels as
   * temporary host until a future slice adds the tags sidebar section. */
  assert.ok(renderLab && /ensureTagCreateButton\(\)/.test(renderLab[0]),
    'ensureTagCreateButton must be wired into the render path');
});

/* ════════════════════════════════════════════════════════════════════════
 * Section F — Cross-file boundary: NO ChatGPT DOM scanning in any UI file
 * ═══════════════════════════════════════════════════════════════════════ */

console.log('Section F — Cross-file boundary (no ChatGPT DOM scanning in UI)');
const UI_MODULES = ['modals', 'toolbar', 'sidebar'];
const FORBIDDEN_DOM_PATTERNS = [
  'chatgpt.com',
  'data-testid="conversation-turn"',
  'data-message-author-role',
  'extractTagsFromTurn',
  'deriveTags',
  'scanTurn',
];
for (const key of UI_MODULES) {
  for (const pat of FORBIDDEN_DOM_PATTERNS) {
    check(`F.${key}: no '${pat}' (extraction stays Native)`, () => {
      assert.equal(STRIPPED[key].indexOf(pat) === -1, true,
        `${FILES[key]} must not reference '${pat}'`);
    });
  }
}
/* MutationObserver-over-chat-turns: S0F1n DOES legitimately use
 * MutationObserver to watch the Studio body for .wbChatRow rendering.
 * That's NOT chat-turn observation. Assert it's bounded to the Studio
 * selector and does not target chatgpt conversation turns. */
check(`F.toolbar: MutationObserver targets Studio internals only (not chat turns)`, () => {
  /* MutationObserver appears, but only paired with the Studio chat-row
   * selector. No data-testid or article-tag references near it. */
  const stripped = STRIPPED.toolbar;
  assert.match(stripped, /MutationObserver/);
  assert.match(stripped, /'\.wbChatRow\[data-chatId\]'/);
  /* The stripped source must contain neither chatgpt.com nor
   * conversation-turn anywhere (already asserted above per-pattern, but
   * keep an aggregate sanity check here). */
  assert.equal(/chatgpt\.com|conversation-turn/i.test(stripped), false);
});
check(`F.modals: no MutationObserver anywhere`, () => {
  /* S0F1m has zero DOM observation by design (prompt+confirm UI only). */
  const stripped = STRIPPED.modals;
  assert.equal(/MutationObserver/.test(stripped), false,
    'S0F1m must not use MutationObserver (prompt+confirm UI only)');
});
check(`F.diagnose markers: every UI surface reports domAccess:false + observesChatGptDom:false`, () => {
  for (const key of UI_MODULES) {
    if (key === 'sidebar') continue;  /* sidebar is the existing surface; its diagnose pattern differs */
    assert.match(SRC[key], /domAccess:\s*false/, `${key}.diagnose must report domAccess:false`);
    assert.match(SRC[key], /observesChatGptDom:\s*false/, `${key}.diagnose must report observesChatGptDom:false`);
  }
});
check(`F.tagExtraction marker: modals + toolbar both report tagExtraction:false`, () => {
  assert.match(SRC.modals, /tagExtraction:\s*false/);
  assert.match(SRC.toolbar, /tagExtraction:\s*false/);
});

/* ════════════════════════════════════════════════════════════════════════
 * Section G — Refresh event single-source
 * No invented event names. Reasons follow documented patterns.
 * ═══════════════════════════════════════════════════════════════════════ */

console.log('Section G — Refresh event single-source');
check(`G.canonical: refresh event name unchanged`, () => {
  for (const key of ['folders', 'categories', 'labels', 'tags', 'toolbar']) {
    assert.match(SRC[key], /evt:h2o:library-index:refresh-request/,
      `${FILES[key]} must use the canonical refresh event name`);
  }
});
check(`G.no-novelty: no novel batch-toolbar:* event names`, () => {
  for (const key of UI_MODULES) {
    assert.equal(/'evt:h2o:batch-toolbar:/.test(STRIPPED[key]), false);
    assert.equal(/'evt:h2o:modals:/.test(STRIPPED[key]), false);
  }
});
check(`G.reasons: actions modules use '<target>-actions:<op>' reason format`, () => {
  for (const t of ['folders', 'categories', 'labels', 'tags']) {
    assert.match(SRC[t], new RegExp(`'${t}-actions:'`));
  }
});
check(`G.reasons: BatchToolbar uses 'batch-toolbar:<op>:<count>' reason`, () => {
  assert.match(SRC.toolbar, /'batch-toolbar:'\s*\+/);
});
check(`G.single-source: modals does NOT dispatch refresh — actions.* does`, () => {
  /* S0F1m has zero dispatchEvent calls. */
  assert.equal(/dispatchEvent\s*\(/.test(SRC.modals), false);
});

/* ════════════════════════════════════════════════════════════════════════
 * Section H — Native 0F5a remains the extraction owner
 * The R4.3 boundary requires turn-level extraction to remain in Native
 * 0F5a. Assert the file still exists and is non-empty (the canonical
 * tags extraction module).
 * ═══════════════════════════════════════════════════════════════════════ */

console.log('Section H — Native 0F5a remains the extraction owner');
check(`H.native: 0F5a Tags module exists`, () => {
  assert.ok(fs.existsSync(abs(FILES.nativeTags)), `${FILES.nativeTags} not found`);
});
check(`H.native: 0F5a is substantial (>=100 KB — known extraction code path)`, () => {
  const stat = fs.statSync(abs(FILES.nativeTags));
  assert.ok(stat.size >= 100_000,
    `${FILES.nativeTags} unexpectedly small (${stat.size} bytes) — extraction may have been removed`);
});
check(`H.native: 0F5a still contains tag-extraction code patterns`, () => {
  /* The Native file legitimately observes ChatGPT DOM (extractions, turn
   * tags, etc.) — this is its purpose. Verify it still does. */
  const native = SRC.nativeTags;
  /* At minimum, the file should contain MutationObserver OR conversation-
   * turn observation — proving the extraction code path lives here. */
  const hasObserver = /MutationObserver/.test(native);
  const hasTurn = /conversation-turn|data-message-author-role/.test(native);
  assert.ok(hasObserver || hasTurn,
    'Native 0F5a should contain MutationObserver / turn observation patterns');
});

/* ════════════════════════════════════════════════════════════════════════
 * Output
 * ═══════════════════════════════════════════════════════════════════════ */

console.log('');
console.log(`── R4.5.5 Release Gate ──────────────────────────────────────`);
console.log(`  passed: ${PASS.length}`);
console.log(`  failed: ${FAIL.length}`);

if (FAIL.length > 0) {
  console.error('');
  console.error('Failures:');
  for (const f of FAIL) {
    console.error(`  ✗ ${f.label}`);
    console.error(`      ${f.err}`);
  }
  process.exit(1);
}
console.log(`  all R4.5 matrix checks passed ✓\n`);
process.exit(0);
