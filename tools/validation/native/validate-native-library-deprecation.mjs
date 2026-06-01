#!/usr/bin/env node
// R4.6.0 — Native Library UI Deprecation gate validator.
//
// Verifies the deprecation-flag PLUMBING installed across 6 Native
// modules:
//   0F1b — Library Workspace (gated: LibraryButton, WorkspacePage)
//   0F2a — Projects (gated: ProjectsSidebar; unconditional: fetch interception)
//   0F3a — Folders (gated: FoldersSidebarList; unconditional: capture menu + openFolderCreatePanel)
//   0F4a — Categories (gated: CategoriesSidebar; unconditional: rename/delete/createCategory)
//   0F6a — Labels (gated: LabelsSidebar; unconditional: rename/delete/createLabel)
//   0F1j — Library Actions (NEVER gated — pure capture business logic)
//
// And verifies the boundary:
//   0F5a — Tags extraction module UNTOUCHED (size + observation patterns)
//
// Default flags in R4.6.0:
//   library.nativeWorkspaceUi    = true  (no behavior change)
//   library.nativeOrganizationUi = true  (no behavior change)
//   library.nativeCaptureOnlyMode = false (no behavior change)

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..', '..', '..');

function abs(rel) { return path.join(REPO_ROOT, rel); }
function read(rel) { return fs.readFileSync(abs(rel), 'utf8'); }
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

const FILES = {
  '0F1b': 'src-runtime-base/0F1b.⬛️🗂️ Library Workspace 🗂️.js',
  '0F2a': 'src-runtime-base/0F2a.⬛️🗂️ Projects 🗂️.js',
  '0F3a': 'src-runtime-base/0F3a.⬛️🗂️ Folders 🗂️.js',
  '0F4a': 'src-runtime-base/0F4a.⬛️🗂️ Categories 🗂️.js',
  '0F6a': 'src-runtime-base/0F6a.⬛️🏷️ Labels 🏷️.js',
  '0F1j': 'src-runtime-base/0F1j.⬛️🗂️ Library Actions 🎯🗂️.js',
  '0F5a': 'src-runtime-base/0F5a.⬛️🗂️ Tags 🗂️.js',
};
const SRC = {};
const STRIPPED = {};
for (const [k, rel] of Object.entries(FILES)) {
  if (!fs.existsSync(abs(rel))) {
    FAIL.push({ label: `FILE_MISSING: ${rel}`, err: 'file not found' });
    SRC[k] = ''; STRIPPED[k] = '';
    continue;
  }
  SRC[k] = read(rel);
  STRIPPED[k] = stripComments(SRC[k]);
}

console.log('── R4.6.0 Native Library UI Deprecation Gate ────────────────');
console.log('   Plumbing verification — default behavior preserved\n');

/* ════════════════════════════════════════════════════════════════════════
 * Section A — Flag NAME literals appear in every gated module
 * ═══════════════════════════════════════════════════════════════════════ */

console.log('Section A — Flag name literals');
const GATED_MODULES = ['0F1b', '0F2a', '0F3a', '0F4a', '0F6a', '0F1j'];
for (const mod of GATED_MODULES) {
  check(`A.${mod}: references 'library.nativeWorkspaceUi'`, () => {
    assert.match(SRC[mod], /'library\.nativeWorkspaceUi'/);
  });
  check(`A.${mod}: references 'library.nativeOrganizationUi'`, () => {
    assert.match(SRC[mod], /'library\.nativeOrganizationUi'/);
  });
  check(`A.${mod}: references 'library.nativeCaptureOnlyMode'`, () => {
    assert.match(SRC[mod], /'library\.nativeCaptureOnlyMode'/);
  });
}

/* ════════════════════════════════════════════════════════════════════════
 * Section B — Flag-reader helpers present in every gated module
 * Helpers default to `true` (preserving pre-R4.6 behavior).
 * ═══════════════════════════════════════════════════════════════════════ */

console.log('Section B — Flag-reader helpers');
for (const mod of GATED_MODULES) {
  check(`B.${mod}: declares isNativeWorkspaceUiEnabled()`, () => {
    assert.match(SRC[mod], /function isNativeWorkspaceUiEnabled\s*\(\s*\)/);
  });
  check(`B.${mod}: declares isNativeOrganizationUiEnabled()`, () => {
    assert.match(SRC[mod], /function isNativeOrganizationUiEnabled\s*\(\s*\)/);
  });
  check(`B.${mod}: declares isNativeCaptureOnlyMode()`, () => {
    assert.match(SRC[mod], /function isNativeCaptureOnlyMode\s*\(\s*\)/);
  });
  check(`B.${mod}: helpers default to true for organization/workspace UI`, () => {
    /* Each helper passes `true` as the default to flags.get(). */
    assert.match(SRC[mod], /flags\.get\(H2O_R46_FLAG_WORKSPACE_UI,\s*true\)/);
    assert.match(SRC[mod], /flags\.get\(H2O_R46_FLAG_ORGANIZATION_UI,\s*true\)/);
    /* CaptureOnly defaults to false (operator-opt-in). */
    assert.match(SRC[mod], /flags\.get\(H2O_R46_FLAG_CAPTURE_ONLY,\s*false\)/);
  });
}

/* ════════════════════════════════════════════════════════════════════════
 * Section C — registerR46Diagnose registers on H2O.deprecation.native
 * Each gated module exposes a diagnose entry with gatedSurfaces +
 * unconditionalSurfaces declarations.
 * ═══════════════════════════════════════════════════════════════════════ */

console.log('Section C — Deprecation diagnose namespace');
for (const mod of GATED_MODULES) {
  check(`C.${mod}: registers H2O.deprecation.native['${mod}']`, () => {
    assert.match(SRC[mod], new RegExp(`H2O\\.deprecation\\.native\\['${mod}'\\]\\s*=\\s*function`));
    /* Accept R4.6.0-plumbing OR any later R4.6.x phase string. 0F1b
     * bumps to 'R4.6.1-banner+gates'; sibling modules stay at
     * 'R4.6.0-plumbing'. Both are valid R4.6.x states. */
    assert.match(SRC[mod], /phase:\s*'R4\.6\.[0-9].*?'/);
    assert.match(SRC[mod], /gatedSurfaces:/);
    assert.match(SRC[mod], /unconditionalSurfaces:/);
  });
}

/* Module-specific gated/unconditional declarations. */
check('C.0F1b: gates LibraryButton + WorkspacePage', () => {
  const m = SRC['0F1b'].match(/H2O\.deprecation\.native\['0F1b'\][\s\S]*?\}\s*;\s*\}/);
  assert.ok(m, '0F1b diagnose block not found');
  assert.match(m[0], /gatedSurfaces:\s*\['LibraryButton',\s*'WorkspacePage'\]/);
});
check('C.0F2a: gates ProjectsSidebar; KEEPS fetchInterception unconditional', () => {
  const m = SRC['0F2a'].match(/H2O\.deprecation\.native\['0F2a'\][\s\S]*?\}\s*;\s*\}/);
  assert.ok(m);
  assert.match(m[0], /gatedSurfaces:\s*\['ProjectsSidebar'\]/);
  assert.match(m[0], /'fetchInterception'/);
});
check('C.0F3a: gates FoldersSidebarList; KEEPS capture menu + Native folder-create unconditional', () => {
  const m = SRC['0F3a'].match(/H2O\.deprecation\.native\['0F3a'\][\s\S]*?\}\s*;\s*\}/);
  assert.ok(m);
  assert.match(m[0], /gatedSurfaces:\s*\['FoldersSidebarList'\]/);
  assert.match(m[0], /'ENGINE_injectAddToLibrary'/);
  assert.match(m[0], /'ENGINE_injectAddToFolder'/);
  /* Native folder-create code path that S0Z1g's MV3 fallback depends on. */
  assert.match(m[0], /'STORE_validateFolderCreate'/);
});
check('C.0F4a: gates CategoriesSidebar; KEEPS rename/delete/createCategory unconditional', () => {
  const m = SRC['0F4a'].match(/H2O\.deprecation\.native\['0F4a'\][\s\S]*?\}\s*;\s*\}/);
  assert.ok(m);
  assert.match(m[0], /gatedSurfaces:\s*\['CategoriesSidebar'\]/);
  assert.match(m[0], /'renameCategory'/);
  assert.match(m[0], /'deleteCategory'/);
  assert.match(m[0], /'createCategory'/);
});
check('C.0F6a: gates LabelsSidebar; KEEPS rename/delete/createLabel unconditional', () => {
  const m = SRC['0F6a'].match(/H2O\.deprecation\.native\['0F6a'\][\s\S]*?\}\s*;\s*\}/);
  assert.ok(m);
  assert.match(m[0], /gatedSurfaces:\s*\['LabelsSidebar'\]/);
  assert.match(m[0], /'renameLabel'/);
  assert.match(m[0], /'deleteLabel'/);
  assert.match(m[0], /'createLabel'/);
});
check('C.0F1j: declares gatedSurfaces:[] — CAPTURE never gated', () => {
  const m = SRC['0F1j'].match(/H2O\.deprecation\.native\['0F1j'\][\s\S]*?\}\s*;\s*\}/);
  assert.ok(m);
  /* Empty array — capture is never a deprecation candidate. */
  assert.match(m[0], /gatedSurfaces:\s*\[\]/);
  /* Lists the capture surfaces as unconditional. */
  assert.match(m[0], /'addToLibrary'/);
  assert.match(m[0], /'saveToFolder'/);
  assert.match(m[0], /'openLinkedChat'/);
});

/* ════════════════════════════════════════════════════════════════════════
 * Section D — 0F1b has the only code-level gate (mountPage)
 * Default-true means the gate passes; no behavior change.
 * ═══════════════════════════════════════════════════════════════════════ */

console.log('Section D — 0F1b code-level gate at mountPage');
check('D.0F1b: mountPage starts with isNativeWorkspaceUiEnabled() guard', () => {
  /* Strip comments first — the R4.6.0/R4.6.1 docstring between the
   * function opening and the gate would otherwise exceed any
   * reasonable character limit on the regex. */
  const stripped = STRIPPED['0F1b'];
  const m = stripped.match(/function mountPage\(page\)\s*\{\s*if\s*\(\s*!isNativeWorkspaceUiEnabled\(\s*\)\s*\)/);
  assert.ok(m, 'mountPage gate at top of function not found (after stripping comments)');
});
check('D.0F1b: mountPage gate uses default-true semantics (returns false on flag off)', () => {
  /* On flag-off, mountPage returns false (skip mount); default is true
   * so the gate is a no-op in default state. After R4.6.1 the gated
   * branch first attempts to render the banner via
   * buildR46DeprecationBanner, then returns false if that fails. */
  const m = SRC['0F1b'].match(/function mountPage\(page\)\s*\{[\s\S]*?return\s+false;/);
  assert.ok(m);
  /* R4.6.1 — banner attempt before returning false. */
  assert.match(m[0], /buildR46DeprecationBanner/);
});

/* ════════════════════════════════════════════════════════════════════════
 * Section E — Capture / extraction / MV3-fallback APIs UNGATED
 * For each protected API, search the source for references to ANY
 * deprecation flag NEAR the function definition. The protected APIs
 * must have NO flag check.
 * ═══════════════════════════════════════════════════════════════════════ */

console.log('Section E — Capture / MV3 fallback APIs unconditional');

/* Helper: find the function body span starting from `function NAME` and
 * extending to the first matching closing brace at indentation level 2
 * (the typical body length). */
function functionBody(src, name) {
  const re = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\([^)]*\\)\\s*\\{`, 'g');
  const m = re.exec(src);
  if (!m) return null;
  /* Walk braces from start to find matching close. */
  let depth = 0, i = m.index;
  while (i < src.length) {
    const c = src[i++];
    if (c === '{') depth += 1;
    else if (c === '}') { depth -= 1; if (depth === 0) return src.slice(m.index, i); }
  }
  return null;
}

/* Each entry: [moduleId, kind, target, label]
 *   - kind === 'function-def': assert `function NAME` definition exists
 *     in the module + its body has no deprecation-flag gate
 *   - kind === 'call-site': assert the literal call expression appears
 *     in the source (proves the wiring is preserved). For MV3-fallback
 *     APIs that live in archiveBoot (0D3a), the meaningful native-side
 *     assertion is that the call sites in 0F4a remain in place. */
const PROTECTED = [
  ['0F1j', 'function-def', 'addToLibrary',              'capture: addToLibrary'],
  ['0F1j', 'function-def', 'saveToFolder',              'capture: saveToFolder'],
  ['0F1j', 'function-def', 'openLinkedChat',            'capture: openLinkedChat'],
  ['0F3a', 'function-def', 'ENGINE_injectAddToLibrary', 'capture: Add-to-Library menu injection'],
  ['0F3a', 'function-def', 'ENGINE_injectAddToFolder',  'capture: Save-to-Folder menu injection'],
  ['0F3a', 'function-def', 'STORE_validateFolderCreate','MV3 fallback: Native folder-create code path'],
  ['0F4a', 'call-site',    'H2O\\.archiveBoot\\??\\.?renameCategory', 'MV3 fallback: archiveBoot.renameCategory call site'],
  ['0F4a', 'call-site',    'H2O\\.archiveBoot\\??\\.?deleteCategory', 'MV3 fallback: archiveBoot.deleteCategory call site'],
  ['0F4a', 'call-site',    'H2O\\.archiveBoot\\??\\.?createCategory', 'MV3 fallback: archiveBoot.createCategory call site'],
  ['0F6a', 'function-def', 'renameLabel',               'MV3 fallback: renameLabel'],
  ['0F6a', 'function-def', 'deleteLabel',               'MV3 fallback: deleteLabel'],
  ['0F6a', 'function-def', 'createLabel',               'MV3 fallback: createLabel'],
];
for (const [mod, kind, target, label] of PROTECTED) {
  if (kind === 'function-def') {
    check(`E.${mod}: ${label} (${target}) function exists`, () => {
      const body = functionBody(SRC[mod], target);
      assert.ok(body, `${target} function not found in ${mod}`);
    });
    check(`E.${mod}: ${label} (${target}) has NO deprecation-flag gate`, () => {
      const body = functionBody(SRC[mod], target);
      if (!body) return;
      assert.equal(/isNativeWorkspaceUiEnabled\s*\(/.test(body), false,
        `${target} must not gate on workspace UI flag`);
      assert.equal(/isNativeOrganizationUiEnabled\s*\(/.test(body), false,
        `${target} must not gate on organization UI flag`);
      assert.equal(/isNativeCaptureOnlyMode\s*\(/.test(body), false,
        `${target} must not gate on capture-only flag`);
      assert.equal(/library\.native(Workspace|Organization|Capture)/.test(body), false,
        `${target} must not reference any library.native* flag literal`);
    });
  } else if (kind === 'call-site') {
    check(`E.${mod}: ${label} call site preserved`, () => {
      const re = new RegExp(target);
      assert.match(SRC[mod], re, `expected ${label} call site in ${mod}`);
    });
    check(`E.${mod}: ${label} call site is NOT inside a flag-gated block`, () => {
      /* Find the line containing the call expression. Walk up to the
       * containing `if (...)` or `function` block opener within 30
       * lines; assert that opener does NOT reference a deprecation
       * flag literal. */
      const lines = SRC[mod].split('\n');
      const re = new RegExp(target);
      let firstHit = -1;
      for (let i = 0; i < lines.length; i++) {
        if (re.test(lines[i])) { firstHit = i; break; }
      }
      if (firstHit < 0) return;
      const window = lines.slice(Math.max(0, firstHit - 30), firstHit + 1).join('\n');
      assert.equal(/isNativeWorkspaceUiEnabled|isNativeOrganizationUiEnabled|isNativeCaptureOnlyMode/.test(window), false,
        `${label} appears within 30 lines of a deprecation-flag helper — call site may be gated`);
      assert.equal(/if\s*\([^)]*library\.native(Workspace|Organization|Capture)/.test(window), false,
        `${label} call site appears inside an if-block gated by a library.native* flag`);
    });
  }
}

/* ════════════════════════════════════════════════════════════════════════
 * Section F — 0F5a Tags extraction module UNTOUCHED
 * The file must remain at its R4.5-baseline size + still contain the
 * MutationObserver / conversation-turn observation patterns. R4.6
 * MUST NOT modify this file in any way.
 * ═══════════════════════════════════════════════════════════════════════ */

console.log('Section F — 0F5a extraction module untouched');
check('F.0F5a: file size is the R4.5-baseline 273099 bytes', () => {
  const stat = fs.statSync(abs(FILES['0F5a']));
  assert.equal(stat.size, 273099,
    `0F5a size changed: ${stat.size} vs baseline 273099 — R4.6 must not modify Native tag extraction`);
});
check('F.0F5a: still contains MutationObserver / conversation-turn observation', () => {
  const src = SRC['0F5a'];
  assert.match(src, /MutationObserver|conversation-turn|data-message-author-role/);
});
check('F.0F5a: contains NO deprecation flag references', () => {
  const src = SRC['0F5a'];
  assert.equal(/library\.native(Workspace|Organization|Capture)/.test(src), false,
    '0F5a must remain free of deprecation flag references');
  assert.equal(/isNativeWorkspaceUiEnabled|isNativeOrganizationUiEnabled|isNativeCaptureOnlyMode/.test(src), false,
    '0F5a must remain free of deprecation flag helpers');
});

/* ════════════════════════════════════════════════════════════════════════
 * Section G — Doc exists + lists the hard invariants
 * ═══════════════════════════════════════════════════════════════════════ */

console.log('Section G — Deprecation plan doc');
const DOC_REL = 'docs/systems/library/r4.6-native-deprecation-plan.md';
check('G.doc: r4.6-native-deprecation-plan.md exists', () => {
  assert.ok(fs.existsSync(abs(DOC_REL)), `${DOC_REL} not found`);
});
const doc = fs.existsSync(abs(DOC_REL)) ? read(DOC_REL) : '';
check('G.doc: documents the 3 R4.6 flags', () => {
  assert.match(doc, /library\.nativeWorkspaceUi/);
  assert.match(doc, /library\.nativeOrganizationUi/);
  assert.match(doc, /library\.nativeCaptureOnlyMode/);
});
check('G.doc: lists the hard invariants (capture, extraction, MV3 fallback)', () => {
  assert.match(doc, /[Cc]apture/);
  assert.match(doc, /[Ee]xtraction/);
  assert.match(doc, /MV3 fallback/);
});
check('G.doc: archive folder plan is explicitly DEFERRED', () => {
  assert.match(doc, /[Aa]rchive folder plan/);
  assert.match(doc, /DEFERRED/);
});

/* ════════════════════════════════════════════════════════════════════════
 * Section H — R4.6.1 deprecation banner + body-attribute mechanism (0F1b)
 * The workspace gate now ALSO renders a deprecation banner with two CTA
 * buttons (Open Desktop Studio / Restore Native Library UI). 0F1b also
 * owns the body-attribute updater that drives per-module CSS gates.
 * ═══════════════════════════════════════════════════════════════════════ */

console.log('Section H — R4.6.1 banner + body-attribute mechanism');
check('H.0F1b: declares applyR46BodyAttrs() body-attribute updater', () => {
  assert.match(SRC['0F1b'], /function applyR46BodyAttrs\s*\(\s*\)/);
  /* Sets the org-hide attribute when flag is off (true means hide). */
  assert.match(SRC['0F1b'], /'data-h2o-r46-hide-org'/);
  /* Sets the workspace-hide attribute when flag is off. */
  assert.match(SRC['0F1b'], /'data-h2o-r46-hide-workspace'/);
});
check('H.0F1b: installs workspace CSS gate with library button + page selectors', () => {
  assert.match(SRC['0F1b'], /function installR46WorkspaceCssGate\s*\(\s*\)/);
  /* Library button suffix selectors. */
  assert.match(SRC['0F1b'], /\[data-cgxui\$=\"-top-library-button\"\]/);
  assert.match(SRC['0F1b'], /\[data-cgxui\$=\"-rail-library-button\"\]/);
  /* Workspace page suffix selector. */
  assert.match(SRC['0F1b'], /\[data-cgxui\$=\"-page\"\]/);
  /* Hide rule itself. */
  assert.match(SRC['0F1b'], /display:none\s*!important/);
});
check('H.0F1b: setInterval poll loop picks up flag flips', () => {
  assert.match(SRC['0F1b'], /function startR46PollLoop/);
  assert.match(SRC['0F1b'], /W\.setInterval\(\s*function\s*\(\s*\)\s*\{\s*applyR46BodyAttrs\(\s*\)\s*;\s*\}\s*,\s*1000\s*\)/);
});
check('H.0F1b: deprecation banner builder exists', () => {
  assert.match(SRC['0F1b'], /function buildR46DeprecationBanner\s*\(\s*\)/);
  /* The banner heading literal — proves it's a USER-VISIBLE banner. */
  assert.match(SRC['0F1b'], /Library has moved to Desktop Studio/);
  /* Two CTA buttons by data attribute. */
  assert.match(SRC['0F1b'], /'data-h2o-r46-banner-action',\s*'open-studio'/);
  assert.match(SRC['0F1b'], /'data-h2o-r46-banner-action',\s*'restore-native'/);
});
check('H.0F1b: Open Studio CTA broadcasts via chrome.runtime.sendMessage', () => {
  /* Locate the openBtn block by its action attribute. */
  const idx = SRC['0F1b'].indexOf("'open-studio'");
  assert.ok(idx > 0);
  /* Within ~30 lines of the open-studio attribute, chrome.runtime.sendMessage
   * must be called with type 'h2o.studio.open'. */
  const window = SRC['0F1b'].slice(idx, idx + 2500);
  assert.match(window, /chrome\.runtime\.sendMessage/);
  assert.match(window, /'h2o\.studio\.open'/);
});
check('H.0F1b: Restore Native CTA sets flags back to true + reload', () => {
  const idx = SRC['0F1b'].indexOf("'restore-native'");
  assert.ok(idx > 0);
  const window = SRC['0F1b'].slice(idx, idx + 2500);
  /* Sets both flags back to true. */
  assert.match(window, /flags\.set\('library\.nativeWorkspaceUi',\s*true\)/);
  assert.match(window, /flags\.set\('library\.nativeOrganizationUi',\s*true\)/);
  /* Reloads the page so the new flag state takes effect. */
  assert.match(window, /location\.reload/);
});
check('H.0F1b: mountPage gated path tries to render the banner before returning false', () => {
  /* The gated branch of mountPage now calls buildR46DeprecationBanner. */
  const gate = SRC['0F1b'].match(/if\s*\(!isNativeWorkspaceUiEnabled\(\)\)\s*\{[\s\S]*?return false;\s*\}/);
  assert.ok(gate, 'mountPage gated block not found');
  assert.match(gate[0], /buildR46DeprecationBanner/);
});
check('H.0F1b: diagnose phase bumped to R4.6.1', () => {
  assert.match(SRC['0F1b'], /phase:\s*'R4\.6\.1-banner\+gates'/);
});

/* ════════════════════════════════════════════════════════════════════════
 * Section I — Per-module CSS gates (R4.6.1)
 * Each gated module installs an idempotent <style> rule with a module-
 * specific selector. The categories gate (0F4a) targets the known-safe
 * `flsc-categories-root` value. Other modules use placeholder selectors
 * pending precise sidebar-root identification — the gate plumbing is
 * present and the validator asserts the CSS scaffolding is correctly
 * scoped to the body attribute.
 * ═══════════════════════════════════════════════════════════════════════ */

console.log('Section I — Per-module CSS gates (R4.6.1 + R4.6.2)');
const PER_MODULE_GATES = [
  /* All four sections use REAL selectors after R4.6.2. */
  ['0F4a', 'css-known-selector', '[data-cgxui="flsc-categories-root"]',                              'NATIVE CATEGORIES SECTION'],
  ['0F6a', 'css-known-selector', '[data-cgxui="lbsc-root"]',                                         'NATIVE LABELS SECTION'],
  ['0F2a', 'css-known-selector', '.ho-project-row',                                                   'NATIVE PROJECTS SECTION'],
  ['0F3a', 'css-known-selector', '[data-cgxui="flsc-folder-row"], [data-cgxui="flsc-folder-more"]',   'NATIVE FOLDERS SECTION'],
];
for (const [mod, impl, selector, label] of PER_MODULE_GATES) {
  check(`I.${mod}: ${label} — installR46OrgCssGate() function exists`, () => {
    assert.match(SRC[mod], /function installR46OrgCssGate\s*\(\s*\)/);
  });
  check(`I.${mod}: ${label} — boot wrapper invokes the gate at load`, () => {
    /* The gate is called either immediately or on DOMContentLoaded. */
    assert.match(SRC[mod], /\(function bootR46OrgCssGate\(\)/);
    assert.match(SRC[mod], /installR46OrgCssGate\s*\(\s*\)/);
  });
  check(`I.${mod}: ${label} — diagnose declares gateImplementation '${impl}'`, () => {
    assert.match(SRC[mod], new RegExp(`gateImplementation:\\s*'${impl}'`));
  });
  check(`I.${mod}: ${label} — diagnose declares gateSelector '${selector}'`, () => {
    /* Escape selector for regex use. */
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    assert.match(SRC[mod], new RegExp(`gateSelector:\\s*'${escaped}'`));
  });
  check(`I.${mod}: ${label} — CSS rule is scoped to body[data-h2o-r46-hide-org="1"]`, () => {
    /* The injected style.textContent string includes the body attribute trigger. */
    assert.match(SRC[mod], /body\[data-h2o-r46-hide-org="1"\]/);
    /* And contains display:none !important. */
    assert.match(SRC[mod], /display:none\s*!important/);
  });
}

/* The categories gate (0F4a) is the user-emphasized "Native categories
 * section is gated" assertion. Verify the selector is precisely the
 * canonical root. */
check('I.0F4a: categories gate uses the KNOWN flsc-categories-root selector', () => {
  assert.match(SRC['0F4a'], /\[data-cgxui="flsc-categories-root"\]/);
  assert.match(SRC['0F4a'], /body\[data-h2o-r46-hide-org="1"\] \[data-cgxui="flsc-categories-root"\]/);
});

/* ════════════════════════════════════════════════════════════════════════
 * Section K — R4.6.2 specific assertions
 * Every gate uses a REAL selector (no placeholders); selectors only
 * target sidebar/list UI; capture / menu / extraction surfaces are
 * NOT included in any hide rule.
 * ═══════════════════════════════════════════════════════════════════════ */

console.log('Section K — R4.6.2 real-selector enforcement');

check('K.no-placeholders: no placeholder selectors remain in any Native module', () => {
  for (const mod of GATED_MODULES) {
    /* The placeholder pattern from R4.6.1. */
    assert.equal(/data-h2o-r46-section="[^"]*-pending"/.test(SRC[mod]), false,
      `placeholder selector still present in ${mod} — R4.6.2 should have replaced it`);
    /* The placeholder gateImplementation marker. */
    assert.equal(/css-placeholder-pending-selector-identification/.test(SRC[mod]), false,
      `${mod} still declares gateImplementation as placeholder`);
  }
});

check('K.0F2a: projects gate uses real .ho-project-row class selector', () => {
  /* Selector value declared in diagnose. */
  assert.match(SRC['0F2a'], /gateSelector:\s*'\.ho-project-row'/);
  /* CSS rule string. */
  assert.match(SRC['0F2a'], /body\[data-h2o-r46-hide-org="1"\] \.ho-project-row/);
  /* The class is constant UI_PROJECT_TITLE_ROW_CLASS at line 168. */
  assert.match(SRC['0F2a'], /UI_PROJECT_TITLE_ROW_CLASS\s*=\s*'ho-project-row'/);
});

check('K.0F3a: folders gate uses real flsc-folder-row + flsc-folder-more selectors', () => {
  assert.match(SRC['0F3a'], /gateSelector:\s*'\[data-cgxui="flsc-folder-row"\],\s*\[data-cgxui="flsc-folder-more"\]'/);
  assert.match(SRC['0F3a'], /body\[data-h2o-r46-hide-org="1"\] \[data-cgxui="flsc-folder-row"\]/);
  assert.match(SRC['0F3a'], /body\[data-h2o-r46-hide-org="1"\] \[data-cgxui="flsc-folder-more"\]/);
  /* The constants are UI_FSECTION_FOLDER_ROW / FOLDER_MORE. */
  assert.match(SRC['0F3a'], /UI_FSECTION_FOLDER_ROW\s*=\s*`\$\{SkID\}-folder-row`/);
  assert.match(SRC['0F3a'], /UI_FSECTION_FOLDER_MORE\s*=\s*`\$\{SkID\}-folder-more`/);
});

check('K.0F6a: labels gate uses real lbsc-root selector', () => {
  assert.match(SRC['0F6a'], /gateSelector:\s*'\[data-cgxui="lbsc-root"\]'/);
  assert.match(SRC['0F6a'], /body\[data-h2o-r46-hide-org="1"\] \[data-cgxui="lbsc-root"\]/);
  /* The constant is UI_LABELS_ROOT. */
  assert.match(SRC['0F6a'], /UI_LABELS_ROOT\s*=\s*`\$\{SkID\}-root`/);
});

check('K.capture-not-hidden: NO module includes capture-menu cgxui values in its hide rule', () => {
  /* Strip comments so docstring mentions don't false-trigger. */
  const FORBIDDEN_IN_HIDE_RULES = [
    'flsc-add-to-folder',     /* Save-to-Folder menu item */
    'flsc-add-to-library',    /* Add-to-Library menu item */
  ];
  for (const mod of GATED_MODULES) {
    const stripped = STRIPPED[mod];
    /* Search for any <style>.textContent that mentions a forbidden
     * capture-menu cgxui value. We do this by looking inside any
     * 'body[data-h2o-r46-hide-org=...] ... display:none' style block. */
    const styleBlockMatch = stripped.match(/style\.textContent\s*=[\s\S]*?display:none[\s\S]*?;/g) || [];
    for (const block of styleBlockMatch) {
      for (const forbidden of FORBIDDEN_IN_HIDE_RULES) {
        assert.equal(block.indexOf(forbidden), -1,
          `${mod} hide rule contains forbidden capture-menu cgxui value "${forbidden}"`);
      }
    }
  }
});

check('K.tag-ui-not-hidden: NO module includes lbsc-chip-color (turn-level chip) in its hide rule', () => {
  for (const mod of GATED_MODULES) {
    const stripped = STRIPPED[mod];
    const styleBlockMatch = stripped.match(/style\.textContent\s*=[\s\S]*?display:none[\s\S]*?;/g) || [];
    for (const block of styleBlockMatch) {
      assert.equal(block.indexOf('lbsc-chip-color'), -1,
        `${mod} hide rule must not target lbsc-chip-color (turn-level UI)`);
    }
  }
});

check('K.studio-not-hidden: NO module includes Studio-side wbSidebarSection--* in its hide rule', () => {
  /* Studio S0Z1g uses wbSidebarSection--{folders,categories,labels,projects}
   * for its OWN sidebar rendering. Native CSS gates must not target
   * Studio classes — they live in a different document context but the
   * safety assertion is still valuable. */
  for (const mod of GATED_MODULES) {
    const stripped = STRIPPED[mod];
    const styleBlockMatch = stripped.match(/style\.textContent\s*=[\s\S]*?display:none[\s\S]*?;/g) || [];
    for (const block of styleBlockMatch) {
      assert.equal(block.indexOf('wbSidebarSection'), -1,
        `${mod} hide rule must not target Studio wbSidebarSection--* classes`);
    }
  }
});

check('K.all-real: every gate declares gateImplementation = css-known-selector', () => {
  for (const mod of ['0F2a', '0F3a', '0F4a', '0F6a']) {
    assert.match(SRC[mod], /gateImplementation:\s*'css-known-selector'/,
      `${mod} must declare gateImplementation as css-known-selector after R4.6.2`);
  }
});

/* ════════════════════════════════════════════════════════════════════════
 * Section J — R4.6.1 invariant re-verification
 * Re-assert that the protected APIs (category CRUD, label CRUD, capture
 * menu, tag extraction) remain ungated after R4.6.1's additions.
 * ═══════════════════════════════════════════════════════════════════════ */

console.log('Section J — R4.6.1 invariant re-verification');
check('J.0F4a: category CRUD call sites still NOT preceded by deprecation gate', () => {
  /* Strip comments first so docstring references to the CRUD names
   * don't false-trigger. Then scan for ACTUAL call expressions. */
  const stripped = STRIPPED['0F4a'];
  const lines = stripped.split('\n');
  for (const fn of ['renameCategory', 'deleteCategory', 'createCategory']) {
    let hit = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].indexOf(`H2O.archiveBoot`) >= 0 && lines[i].indexOf(fn) >= 0) {
        hit = i; break;
      }
    }
    if (hit < 0) continue;
    const window = lines.slice(Math.max(0, hit - 30), hit + 1).join('\n');
    assert.equal(/isNativeWorkspaceUiEnabled\(|isNativeOrganizationUiEnabled\(|isNativeCaptureOnlyMode\(/.test(window), false,
      `${fn} call site appears within 30 lines of a deprecation-flag helper — must remain unconditional`);
  }
});
check('J.0F6a: label CRUD function definitions still NOT preceded by deprecation gate', () => {
  for (const fn of ['renameLabel', 'deleteLabel', 'createLabel']) {
    const body = functionBody(SRC['0F6a'], fn);
    assert.ok(body, `${fn} not found`);
    assert.equal(/isNativeWorkspaceUiEnabled\(|isNativeOrganizationUiEnabled\(|isNativeCaptureOnlyMode\(/.test(body), false,
      `${fn} body must remain unconditional`);
  }
});
check('J.0F3a: capture menu injections still NOT preceded by deprecation gate', () => {
  for (const fn of ['ENGINE_injectAddToLibrary', 'ENGINE_injectAddToFolder']) {
    const body = functionBody(SRC['0F3a'], fn);
    assert.ok(body);
    assert.equal(/isNativeWorkspaceUiEnabled\(|isNativeOrganizationUiEnabled\(|isNativeCaptureOnlyMode\(/.test(body), false,
      `${fn} body must remain unconditional`);
  }
});
check('J.0F1j: capture business logic functions still NOT preceded by deprecation gate', () => {
  for (const fn of ['addToLibrary', 'saveToFolder', 'openLinkedChat']) {
    const body = functionBody(SRC['0F1j'], fn);
    assert.ok(body);
    assert.equal(/isNativeWorkspaceUiEnabled\(|isNativeOrganizationUiEnabled\(|isNativeCaptureOnlyMode\(/.test(body), false,
      `${fn} body must remain unconditional`);
  }
});
check('J.0F5a: tag extraction module STILL unchanged after R4.6.1', () => {
  const stat = fs.statSync(abs(FILES['0F5a']));
  assert.equal(stat.size, 273099, '0F5a size must remain at R4.5 baseline 273099');
});

/* ════════════════════════════════════════════════════════════════════════
 * Output
 * ═══════════════════════════════════════════════════════════════════════ */

console.log('');
console.log(`── R4.6.0 Native Deprecation Gate ───────────────────────────`);
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
console.log(`  all R4.6.0 plumbing checks passed ✓\n`);
process.exit(0);
