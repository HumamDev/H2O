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
  '0F1d': 'src-runtime-base/0F1d.⬛️🗂️ Library Insights 📊🗂️.js',
  '0F2a': 'src-runtime-base/0F2a.⬛️🗂️ Projects 🗂️.js',
  '0F3a': 'src-runtime-base/0F3a.⬛️🗂️ Folders 🗂️.js',
  '0F4a': 'src-runtime-base/0F4a.⬛️🗂️ Categories 🗂️.js',
  '0F6a': 'src-runtime-base/0F6a.⬛️🏷️ Labels 🏷️.js',
  '0F1j': 'src-runtime-base/0F1j.⬛️🗂️ Library Actions 🎯🗂️.js',
  '0F5a': 'src-runtime-base/0F5a.⬛️🗂️ Tags 🗂️.js',
  /* R4.6.4 — Canonical flag registry. Houses the NATIVE_FLAG_DEFAULTS
   * table that pins the post-flip default values. */
  '0F1k': 'src-runtime-base/0F1k.⬛️🗂️ Library Canonical Services 🪪🗂️.js',
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
    assert.match(SRC[mod], /phase:\s*'R4\.(?:6\.[0-9].*?|7\.5-retired)'/);
    assert.match(SRC[mod], /gatedSurfaces:/);
    assert.match(SRC[mod], /unconditionalSurfaces:/);
  });
}

/* Module-specific gated/unconditional declarations. */
check('C.0F1b: reports LibraryButton + WorkspacePage as retired, not gated', () => {
  const m = SRC['0F1b'].match(/H2O\.deprecation\.native\['0F1b'\][\s\S]*?\}\s*;\s*\}/);
  assert.ok(m, '0F1b diagnose block not found');
  assert.match(m[0], /phase:\s*'R4\.7\.5-retired'/);
  assert.match(m[0], /gatedSurfaces:\s*\[\]/);
  assert.match(m[0], /retiredSurfaces:[\s\S]*'LibraryButton'/);
  assert.match(m[0], /retiredSurfaces:[\s\S]*'WorkspacePage'/);
  assert.match(m[0], /retired-features\/native-library-ui\/0F1b-library-workspace\/library-workspace-ui\.js/);
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

console.log('Section D — 0F1b workspace page retired');
check('D.0F1b: mountPage definition is removed from live source', () => {
  assert.equal(/^\s*function mountPage\b/m.test(SRC['0F1b']), false,
    '0F1b still defines mountPage — Native workspace page should be retired');
});
check('D.0F1b: live source keeps openWorkspace as a retired compatibility API', () => {
  assert.match(SRC['0F1b'], /openWorkspace\(opts = \{\}\)[\s\S]*retiredResult\('openWorkspace'/);
  assert.match(SRC['0F1b'], /R4\.7\.5-native-workspace-ui-retired/);
});
check('D.0F1b: no Library Core page or route registration remains', () => {
  assert.equal(/registerPage\?\.\('library'/.test(SRC['0F1b']), false,
    '0F1b must not register the Native Library page after R4.7.5');
  assert.equal(/registerRoute\?\.\(/.test(SRC['0F1b']), false,
    '0F1b must not register Native Library routes after R4.7.5');
});
check('D.0F1b: archived source preserves the old mountPage implementation', () => {
  const archive = fs.readFileSync(abs('retired-features/native-library-ui/0F1b-library-workspace/library-workspace-ui.js'), 'utf8');
  assert.match(archive, /Block 5 of 6/);
  assert.match(archive, /function mountPage\(page\)/);
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
  /* Call-site regexes use `\s*(?:\?\.)?\(` to match ONLY real call
   * expressions (`fn(...)` or `fn?.(...)`). This avoids the post-
   * R4.7.2 false positive where the diagnose block's
   * unconditionalSurfaces array first surfaces the symbol name as a
   * string literal followed by a comma — which would otherwise lead
   * the surrounding-window heuristic to nearby `isNative*Enabled()`
   * metadata calls and mis-classify them as a gate. */
  ['0F4a', 'call-site',    'H2O\\.archiveBoot\\??\\.?renameCategory\\s*(?:\\?\\.)?\\(', 'MV3 fallback: archiveBoot.renameCategory call site'],
  ['0F4a', 'call-site',    'H2O\\.archiveBoot\\??\\.?deleteCategory\\s*(?:\\?\\.)?\\(', 'MV3 fallback: archiveBoot.deleteCategory call site'],
  ['0F4a', 'call-site',    'H2O\\.archiveBoot\\??\\.?createCategory\\s*(?:\\?\\.)?\\(', 'MV3 fallback: archiveBoot.createCategory call site'],
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
      /* Find EVERY line containing the call expression. For each
       * hit, walk back 30 lines and assert no `if (...isNative*
       * Enabled(...)...)` wrapper appears. (We look for the if-block
       * pattern specifically; the post-R4.7.2 diagnose block reads
       * the same flags into metadata without wrapping anything in
       * an `if`, so it does not constitute a gate.) */
      const lines = SRC[mod].split('\n');
      const re = new RegExp(target);
      const hits = [];
      for (let i = 0; i < lines.length; i++) {
        if (re.test(lines[i])) hits.push(i);
      }
      if (hits.length === 0) return;
      for (const hit of hits) {
        const window = lines.slice(Math.max(0, hit - 30), hit + 1).join('\n');
        assert.equal(/if\s*\([^)]*isNative(Workspace|Organization|Capture)\w*Enabled/.test(window), false,
          `${label} call site at line ${hit + 1} appears inside an if-block gated by a library.native* flag helper`);
        assert.equal(/if\s*\([^)]*library\.native(Workspace|Organization|Capture)/.test(window), false,
          `${label} call site at line ${hit + 1} appears inside an if-block gated by a library.native* flag literal`);
      }
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

console.log('Section H — R4.7.5 0F1b banner + workspace gate retired');
check('H.0F1b: live source no longer declares applyR46BodyAttrs()', () => {
  assert.equal(/function applyR46BodyAttrs\b/.test(SRC['0F1b']), false,
    '0F1b still declares applyR46BodyAttrs — workspace gate should be archived');
});
check('H.0F1b: live source no longer declares workspace CSS gate functions', () => {
  assert.equal(/function syncR46WorkspaceElements\b/.test(SRC['0F1b']), false);
  assert.equal(/function installR46WorkspaceCssGate\b/.test(SRC['0F1b']), false);
  assert.equal(/function startR46PollLoop\b/.test(SRC['0F1b']), false);
});
check('H.0F1b: live source no longer declares deprecation banner builder', () => {
  assert.equal(/function buildR46DeprecationBanner\b/.test(SRC['0F1b']), false,
    '0F1b still declares buildR46DeprecationBanner — banner should be archived');
  assert.equal(/Library has moved to Desktop Studio/.test(STRIPPED['0F1b']), false,
    '0F1b live code still contains user-visible banner copy');
});
check('H.archive: 0F1b archive preserves gate + banner blocks', () => {
  const archive = fs.readFileSync(abs('retired-features/native-library-ui/0F1b-library-workspace/library-workspace-ui.js'), 'utf8');
  assert.match(archive, /Block 1 of 6 — R4\.6\.3 workspace body-attribute \+ CSS gate/);
  assert.match(archive, /function applyR46BodyAttrs\b/);
  assert.match(archive, /function syncR46WorkspaceElements\b/);
  assert.match(archive, /function installR46WorkspaceCssGate\b/);
  assert.match(archive, /Block 2 of 6 — R4\.6\.1 deprecation banner/);
  assert.match(archive, /function buildR46DeprecationBanner\b/);
  assert.match(archive, /Library has moved to Desktop Studio/);
});
check('H.0F1b: live diagnose phase is R4.7.5-retired', () => {
  assert.match(SRC['0F1b'], /phase:\s*'R4\.7\.5-retired'/);
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
  /* R4.7.2 — 0F4a's per-module gate retired alongside the
   * categories sidebar UI; the gate (R46_ORG_SELECTORS,
   * syncR46OrgElements, installR46OrgCssGate) physically moved
   * into retired-features/native-library-ui/0F4a-categories-ui/
   * categories-sidebar.js Block 1. Section O re-verifies that the
   * gate is gone from 0F4a.
   *
   * R4.7.3 — 0F6a's per-module gate retired alongside the labels
   * sidebar UI; moved into retired-features/native-library-ui/
   * 0F6a-labels-ui/labels-sidebar.js Block 1. Section P
   * re-verifies the absence.
   *
   * R4.7.4 — 0F2a's per-module gate retired alongside the projects
   * sidebar row UI; moved into retired-features/native-library-ui/
   * 0F2a-projects-ui/projects-sidebar-rows.js Block 1. Section Q
   * re-verifies the absence. The remaining 0F3a module retains its
   * gate until R4.7.5 retires its UI. */
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
  check(`I.${mod}: ${label} — installs the SHARED [data-h2o-r46-hidden] CSS rule (R4.6.3)`, () => {
    /* R4.6.3 — every module installs the same shared rule keyed by
     * the per-element data-h2o-r46-hidden attribute. The shared
     * style id is 'h2o-r46-hidden-attr-css'. */
    assert.match(SRC[mod], /h2o-r46-hidden-attr-css/);
    /* CSS rule body: targets the per-element attribute. */
    assert.match(SRC[mod], /\[data-h2o-r46-hidden="org-ui"\]/);
    /* Hide rule itself. */
    assert.match(SRC[mod], /display:none\s*!important/);
  });
}

/* R4.7.2 — The I.0F4a "categories gate uses flsc-categories-root"
 * check was removed because the gate itself is retired. The
 * UI_FSECTION_CATEGORIES_ROOT constant still exists in 0F4a
 * (other modules may inspect it), and Section O verifies that
 * 0F4a no longer DEFINES R46_ORG_SELECTORS / syncR46OrgElements /
 * installR46OrgCssGate. The diagnose block still publishes the
 * selector string for historical inspection. */

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

/* R4.7.4 — The K.0F2a "projects gate uses .ho-project-row" check
 * was removed because the gate itself is retired alongside the
 * projects sidebar UI. The UI_PROJECT_TITLE_ROW_CLASS constant
 * still exists in 0F2a (it's metadata kept for diagnose-block
 * reference; no live consumer). The diagnose block still
 * publishes the selector string for historical inspection.
 * Section Q (R4.7.4) verifies the gate retirement independently. */

check('K.0F3a: folders gate uses real flsc-folder-row + flsc-folder-more selectors', () => {
  assert.match(SRC['0F3a'], /gateSelector:\s*'\[data-cgxui="flsc-folder-row"\],\s*\[data-cgxui="flsc-folder-more"\]'/);
  /* R4.6.3 — both selectors live in R46_ORG_SELECTORS. */
  assert.match(SRC['0F3a'], /R46_ORG_SELECTORS\s*=\s*\[[\s\S]*?'\[data-cgxui="flsc-folder-row"\]'[\s\S]*?'\[data-cgxui="flsc-folder-more"\]'/);
  /* The constants are UI_FSECTION_FOLDER_ROW / FOLDER_MORE. */
  assert.match(SRC['0F3a'], /UI_FSECTION_FOLDER_ROW\s*=\s*`\$\{SkID\}-folder-row`/);
  assert.match(SRC['0F3a'], /UI_FSECTION_FOLDER_MORE\s*=\s*`\$\{SkID\}-folder-more`/);
});

/* R4.7.3 — The K.0F6a "labels gate uses lbsc-root" check was
 * removed because the gate itself is retired alongside the labels
 * sidebar UI. The UI_LABELS_ROOT constant still exists in 0F6a
 * (it's referenced by workspace viewer + chip-color UI which stay
 * until R4.7.4). The diagnose block still publishes the selector
 * string for historical inspection. Section P (R4.7.3) verifies
 * the gate retirement independently. */

/* ════════════════════════════════════════════════════════════════════════
 * Section L — R4.6.3 cascade-proof gate enforcement
 * After soak testing revealed that the body[data-h2o-r46-hide-org="1"]
 * cascade-based gate was unreliable (host framework strips body
 * attributes during re-renders), R4.6.3 introduced per-element marking
 * with inline `style.setProperty('display','none','important')`. These
 * assertions ensure the regression cannot recur — each gated module
 * MUST use the new pattern with all its essential parts.
 * ═══════════════════════════════════════════════════════════════════════ */

console.log('Section L — R4.6.3 cascade-proof per-element gate');

const PER_ELEMENT_GATED_MODULES = [
  /* moduleId, sync fn name, hidden marker value
   *
   * R4.7.2 — 0F4a was removed from this list because its
   * syncR46OrgElements + installR46OrgCssGate + boot wrapper
   * physically retired into retired-features/native-library-ui/
   * 0F4a-categories-ui/categories-sidebar.js Block 1. Section O
   * verifies the absence of those functions from 0F4a's live
   * source.
   *
   * R4.7.3 — 0F6a removed for the same reason; its gate moved
   * into retired-features/native-library-ui/0F6a-labels-ui/
   * labels-sidebar.js Block 1. Section P verifies the absence.
   *
   * R4.7.4 — 0F2a removed for the same reason; its gate moved
   * into retired-features/native-library-ui/0F2a-projects-ui/
   * projects-sidebar-rows.js Block 1. Section Q verifies the
   * absence.
   *
   * The remaining 2 modules retain their per-element gates until
   * R4.7.5 retires their UI. */
  ['0F3a', 'syncR46OrgElements',       'org-ui'],
];

for (const [mod, syncFn, hiddenValue] of PER_ELEMENT_GATED_MODULES) {
  check(`L.${mod}: declares ${syncFn}() per-element sync function`, () => {
    assert.match(SRC[mod], new RegExp(`function ${syncFn}\\s*\\(\\s*\\)`));
  });
  check(`L.${mod}: sync marks elements with data-h2o-r46-hidden="${hiddenValue}"`, () => {
    /* The body of the sync function contains both the attribute-set
     * line AND the inline-style-set line. */
    const body = SRC[mod].match(new RegExp(`function ${syncFn}\\s*\\(\\s*\\)[\\s\\S]*?^\\s{2}\\}`, 'm'));
    assert.ok(body, `${syncFn} body not found in ${mod}`);
    assert.match(body[0], new RegExp(`setAttribute\\('data-h2o-r46-hidden',\\s*'${hiddenValue}'\\)`));
  });
  check(`L.${mod}: sync uses style.setProperty('display','none','important') — cascade-proof inline !important`, () => {
    /* This is the CRITICAL R4.6.3 assertion. The Web's CSSOM
     * setProperty(name, value, priority='important') sets an inline
     * style WITH the !important flag, which beats CSS rules AND
     * non-important inline styles (e.g. 0F3a's folderMore button's
     * `style.cssText` with display:inline-flex). Without this
     * priority arg, the gate would silently lose to the existing
     * inline style. */
    const body = SRC[mod].match(new RegExp(`function ${syncFn}\\s*\\(\\s*\\)[\\s\\S]*?^\\s{2}\\}`, 'm'));
    assert.ok(body);
    assert.match(body[0], /style\.setProperty\(\s*'display',\s*'none',\s*'important'\s*\)/,
      `${mod}.${syncFn} must use setProperty('display','none','important') to beat inline styles`);
  });
  check(`L.${mod}: sync removes BOTH the attribute AND inline display when un-hiding`, () => {
    const body = SRC[mod].match(new RegExp(`function ${syncFn}\\s*\\(\\s*\\)[\\s\\S]*?^\\s{2}\\}`, 'm'));
    assert.ok(body);
    assert.match(body[0], /removeAttribute\('data-h2o-r46-hidden'\)/);
    assert.match(body[0], /style\.removeProperty\(\s*'display'\s*\)/,
      `${mod}.${syncFn} must restore display by removing the inline style property`);
  });
  check(`L.${mod}: installs the SHARED [data-h2o-r46-hidden] CSS rule (idempotent across modules)`, () => {
    /* The shared style element uses id 'h2o-r46-hidden-attr-css'. The
     * textContent is assembled via string concatenation across lines,
     * so check each component separately rather than as one regex. */
    assert.match(SRC[mod], /h2o-r46-hidden-attr-css/);
    /* Both selectors appear (string-concat order may differ; verify both substrings present). */
    assert.ok(SRC[mod].indexOf('[data-h2o-r46-hidden="org-ui"]') >= 0,
      `${mod} must reference the [data-h2o-r46-hidden="org-ui"] selector`);
    assert.ok(SRC[mod].indexOf('[data-h2o-r46-hidden="workspace-ui"]') >= 0,
      `${mod} must reference the [data-h2o-r46-hidden="workspace-ui"] selector`);
    /* And the hide rule itself. */
    assert.match(SRC[mod], /display:none\s*!important/);
  });
  check(`L.${mod}: ${syncFn} is invoked via setInterval (directly or via wrapper)`, () => {
    /* For 0F1b, the sync is called from within startR46PollLoop's
     * setInterval-wrapped anonymous function alongside applyR46BodyAttrs:
     *   W.setInterval(function () { applyR46BodyAttrs(); syncR46WorkspaceElements(); }, 1000);
     * For sibling modules, direct: setInterval(syncR46OrgElements, 1000).
     * Check that any setInterval(...) call is "close to" the sync fn
     * reference in source — within 400 chars covers either layout. */
    const intervals = [...SRC[mod].matchAll(/setInterval\(/g)];
    let found = false;
    for (const m of intervals) {
      const window = SRC[mod].slice(m.index, m.index + 400);
      if (window.indexOf(syncFn) >= 0) { found = true; break; }
    }
    assert.ok(found, `${mod} must call ${syncFn} within a setInterval block`);
  });
  check(`L.${mod}: wires MutationObserver to apply gate on newly-rendered nodes`, () => {
    assert.match(SRC[mod], /MutationObserver/);
    assert.match(SRC[mod], new RegExp(`obs\\.observe\\([\\s\\S]*?childList:\\s*true[\\s\\S]*?subtree:\\s*true`));
  });
}

check('L.regression-no-body-only-gate: no module relies solely on body[data-h2o-r46-hide-*] descendant CSS', () => {
  /* The R4.6.2 pattern `body[data-h2o-r46-hide-org="1"] <selector>
   * { display:none !important }` was fragile. Each module's CSS
   * gate MUST either include the per-element shared rule
   * `[data-h2o-r46-hidden="org-ui"]` OR the workspace selector group.
   * Pure-body-descendant patterns are a regression.
   *
   * R4.7.2 — 0F4a removed from the loop because the gate moved
   * with the UI into retired-features. Section O verifies the
   * removal independently.
   *
   * R4.7.3 — 0F6a removed for the same reason. Section P verifies
   * the removal.
   *
   * R4.7.4 — 0F2a removed for the same reason. Section Q verifies
   * the removal. */
  for (const mod of ['0F3a']) {
    /* The shared per-element rule must be present. */
    assert.match(SRC[mod], /\[data-h2o-r46-hidden="org-ui"\]/);
  }
});

check('L.R4.7.5: 0F1b no longer owns body/html workspace attributes', () => {
  assert.equal(/function applyR46BodyAttrs\b/.test(SRC['0F1b']), false,
    '0F1b live source should no longer mutate body/html attributes for retired workspace UI');
  assert.equal(/data-h2o-r46-hide-workspace/.test(STRIPPED['0F1b']), false,
    '0F1b live code should not contain workspace hide attribute logic after R4.7.5');
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
  /* 0F4a (R4.7.2) and 0F6a (R4.7.3) still publish
   * `gateImplementation: 'css-known-selector'` in their diagnose
   * blocks (the metadata persists for historical inspection even
   * after the gate code itself was retired). */
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
   * don't false-trigger. Then scan for ACTUAL call expressions
   * (matching the symbol followed by `(` or `?.(`) — this skips the
   * R4.7.2 diagnose block where the symbol appears as a bare string
   * literal in the unconditionalSurfaces array.
   *
   * The post-R4.7.2 diagnose block ALSO populates a metadata object
   * via `'library.nativeWorkspaceUi': isNativeWorkspaceUiEnabled()`
   * which is a flag READ, not a gate. To distinguish a real gate
   * from a metadata read, we look for the wrapping pattern
   * `if (...isNative*Enabled(...)...) { ... call ... }`. The
   * diagnose block uses no such wrapper.
   *
   * We additionally check EVERY call site (not just the first), so
   * even if a newly-introduced metadata block sits ahead of the
   * historical call site, the historical site itself is verified
   * independently. */
  const stripped = STRIPPED['0F4a'];
  const lines = stripped.split('\n');
  for (const fn of ['renameCategory', 'deleteCategory', 'createCategory']) {
    const callPat = new RegExp(`H2O\\.archiveBoot\\??\\.?${fn}\\s*(?:\\?\\.)?\\(`);
    const hits = [];
    for (let i = 0; i < lines.length; i++) {
      if (callPat.test(lines[i])) hits.push(i);
    }
    if (hits.length === 0) continue;
    for (const hit of hits) {
      const window = lines.slice(Math.max(0, hit - 30), hit + 1).join('\n');
      assert.equal(/if\s*\([^)]*isNative(Workspace|Organization|Capture)\w*Enabled/.test(window), false,
        `${fn} call site at line ${hit + 1} appears inside an if-block gated by a library.native* flag helper`);
      assert.equal(/if\s*\([^)]*library\.native(Workspace|Organization|Capture)/.test(window), false,
        `${fn} call site at line ${hit + 1} appears inside an if-block gated by a library.native* flag literal`);
    }
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
 * Section M — R4.6.4 default flag flip (irrevocable user-visible step)
 * Native Library organization UI is now hidden by default. Operators who
 * haven't explicitly set the flags get the deprecated state. The
 * NATIVE_FLAG_DEFAULTS table in 0F1k pins the new defaults. The escape
 * hatch (operator-set via DevTools or banner button) still works because
 * localStorage values win over the defaults.
 * ═══════════════════════════════════════════════════════════════════════ */

console.log('Section M — R4.6.4 default flag flip');

check('M.0F1k: NATIVE_FLAG_DEFAULTS literal declares the post-flip values', () => {
  assert.match(SRC['0F1k'], /const NATIVE_FLAG_DEFAULTS\s*=\s*Object\.freeze\(\{/);
  assert.match(SRC['0F1k'], /'library\.nativeWorkspaceUi':\s*false/);
  assert.match(SRC['0F1k'], /'library\.nativeOrganizationUi':\s*false/);
  assert.match(SRC['0F1k'], /'library\.nativeCaptureOnlyMode':\s*true/);
});

check('M.0F1k: ensureFlags() get() consults defaults after storage miss, before fallback', () => {
  const getBody = SRC['0F1k'].match(/get\(name,\s*fallback[\s\S]*?\},\s*set/);
  assert.ok(getBody, 'get() function body not found');
  assert.match(getBody[0], /hasOwnProperty\.call\(flagState\.values,\s*k\)/);
  assert.match(getBody[0], /hasOwnProperty\.call\(NATIVE_FLAG_DEFAULTS,\s*k\)/);
  assert.match(getBody[0], /return NATIVE_FLAG_DEFAULTS\[k\]/);
  assert.match(getBody[0], /return fallback/);
});

check('M.0F1k: set() still writes to localStorage (restore escape hatch intact)', () => {
  assert.match(SRC['0F1k'], /set\(name,\s*value\)\s*\{[\s\S]*?flagState\.values\[k\]\s*=\s*value;[\s\S]*?writeFlagsToStorage\(flagState\.values\)/);
});

check('M.0F1k: diagnose() exposes nativeFlagDefaults (operator visibility)', () => {
  assert.match(SRC['0F1k'], /nativeFlagDefaults:\s*\{\s*\.\.\.NATIVE_FLAG_DEFAULTS\s*\}/);
});

check('M.R4.7.5: 0F1b banner restore handler is archived, not live', () => {
  assert.equal(/flags\.set\('library\.nativeWorkspaceUi',\s*true\)/.test(STRIPPED['0F1b']), false,
    '0F1b live source still contains restore-native flag writes');
  assert.equal(/location\.reload\(\)/.test(STRIPPED['0F1b']), false,
    '0F1b live source still contains restore-native reload');
  const archive = fs.readFileSync(abs('retired-features/native-library-ui/0F1b-library-workspace/library-workspace-ui.js'), 'utf8');
  assert.match(archive, /flags\.set\('library\.nativeWorkspaceUi',\s*true\)/);
  assert.match(archive, /flags\.set\('library\.nativeOrganizationUi',\s*true\)/);
  assert.match(archive, /location\.reload\(\)/);
});

check('M.capture-untouched-by-flip: capture functions are not gated by R4.6.4', () => {
  for (const fn of ['addToLibrary', 'saveToFolder', 'openLinkedChat']) {
    const body = functionBody(SRC['0F1j'], fn);
    assert.ok(body, `${fn} not found`);
    assert.equal(/library\.native(Workspace|Organization|Capture)/.test(body), false,
      `${fn} body must not reference any library.native* flag after R4.6.4`);
  }
});

check('M.0F5a-untouched: extraction module size unchanged after R4.6.4', () => {
  const stat = fs.statSync(abs(FILES['0F5a']));
  assert.equal(stat.size, 273099,
    `0F5a size changed: ${stat.size} vs baseline 273099 — R4.6.4 must not modify Native tag extraction`);
});

check('M.category-API-ungated-after-flip: archiveBoot.{rename,delete,create}Category call sites preserved', () => {
  const stripped = STRIPPED['0F4a'];
  for (const fn of ['renameCategory', 'deleteCategory', 'createCategory']) {
    assert.match(stripped, new RegExp(`H2O\\.archiveBoot\\??\\.?${fn}`),
      `${fn} call site must still exist in 0F4a`);
  }
});

check('M.label-API-ungated-after-flip: H2O.Labels.{rename,delete,create}Label functions preserved', () => {
  for (const fn of ['renameLabel', 'deleteLabel', 'createLabel']) {
    const body = functionBody(SRC['0F6a'], fn);
    assert.ok(body, `${fn} not found`);
    assert.equal(/isNativeWorkspaceUiEnabled\(|isNativeOrganizationUiEnabled\(|isNativeCaptureOnlyMode\(/.test(body), false,
      `${fn} body must not reference any deprecation-flag helper after R4.6.4`);
  }
});

check('M.documentation-references: 0F1k declares R4.6.4 in its comment', () => {
  assert.match(SRC['0F1k'], /R4\.6\.4/);
});

/* ════════════════════════════════════════════════════════════════════════
 * Section N — R4.7.1 retired-features inventory (scaffolding only)
 *
 * R4.7.1 creates the directory tree + documentation. No code is moved
 * in this slice — Section N asserts ONLY that the scaffolding files
 * exist with the documented top-level files + 6 module sub-folders
 * + 3 notes files. Code-move assertions (Section O size shrinkage,
 * Section P invariant re-verification post-move) land in R4.7.2 +
 * R4.7.3.
 *
 * The retired folder name is FROZEN as `retired-features/native-library-ui/`.
 * Do NOT use: archive/, reference/, backup/, old/, src-runtime-base/retired/
 * ═══════════════════════════════════════════════════════════════════════ */

console.log('Section N — R4.7.1 retired-features scaffolding');

const R47_ROOT = 'retired-features/native-library-ui';

check('N.root: retired-features/native-library-ui/ directory exists', () => {
  assert.ok(fs.existsSync(abs(R47_ROOT)), `${R47_ROOT} not found`);
  const stat = fs.statSync(abs(R47_ROOT));
  assert.ok(stat.isDirectory(), `${R47_ROOT} must be a directory`);
});

check('N.root: forbidden alternate folder names are NOT used', () => {
  /* The R4.7 plan explicitly forbids these alternates. If any of
   * these exists at the repo root, the project has drifted from the
   * documented architecture. */
  const forbidden = [
    'archive',
    'reference',
    'backup',
    'old',
    'src-runtime-base/retired',
  ];
  for (const f of forbidden) {
    assert.equal(fs.existsSync(abs(f)), false,
      `forbidden alternate folder ${f} must not exist — use ${R47_ROOT} instead`);
  }
});

check('N.top-level: README.md, original-path-map.md, migration-map.md present', () => {
  for (const f of ['README.md', 'original-path-map.md', 'migration-map.md']) {
    assert.ok(fs.existsSync(abs(`${R47_ROOT}/${f}`)),
      `${R47_ROOT}/${f} not found`);
  }
});

check('N.top-README: documents retirement reason + replacement + rollback + invariants', () => {
  const readme = fs.readFileSync(abs(`${R47_ROOT}/README.md`), 'utf8');
  /* Retirement reason mentions Desktop Studio replacement. */
  assert.match(readme, /Desktop Studio/i);
  /* Replacement table includes the four catalog targets. */
  assert.match(readme, /folder/i);
  assert.match(readme, /categor/i);
  assert.match(readme, /label/i);
  assert.match(readme, /tag/i);
  /* Safety invariants enumerated. */
  assert.match(readme, /[Ss]afety invariants/);
  /* 0F5a invariant explicitly stated. */
  assert.match(readme, /0F5a/);
  assert.match(readme, /273099/);
  /* Capture invariants explicitly stated. */
  assert.match(readme, /ENGINE_injectAddToLibrary/);
  assert.match(readme, /ENGINE_injectAddToFolder/);
  assert.match(readme, /STORE_validateFolderCreate/);
  /* Rollback strategy documented. */
  assert.match(readme, /[Rr]ollback/);
  assert.match(readme, /git revert/);
});

check('N.original-path-map: present with the move-log format', () => {
  const map = fs.readFileSync(abs(`${R47_ROOT}/original-path-map.md`), 'utf8');
  /* Records the format for moves. */
  assert.match(map, /[Ss]ource file/);
  assert.match(map, /[Dd]estination/);
  assert.match(map, /R4\.7/);
  /* R4.7.1 explicitly notes "no code moves yet". */
  assert.match(map, /scaffolding/i);
});

check('N.migration-map: maps Native surfaces to Studio replacements', () => {
  const map = fs.readFileSync(abs(`${R47_ROOT}/migration-map.md`), 'utf8');
  /* Studio replacement modules referenced. */
  assert.match(map, /S0F3b/);
  assert.match(map, /S0F4b/);
  assert.match(map, /S0F5b/);
  assert.match(map, /S0F6b/);
  assert.match(map, /S0F1m/);
  assert.match(map, /S0F1n/);
  assert.match(map, /S0Z1g/);
  /* The hard invariant: 0F5a extraction stays. */
  assert.match(map, /0F5a/);
  assert.match(map, /NOT (RETIRED|REPLACED)/i);
});

check('N.notes: notes/ directory has r4.7-investigation, r4.6-soak-summary, rollback-procedures', () => {
  for (const f of ['r4.7-investigation.md', 'r4.6-soak-summary.md', 'rollback-procedures.md']) {
    assert.ok(fs.existsSync(abs(`${R47_ROOT}/notes/${f}`)),
      `${R47_ROOT}/notes/${f} not found`);
  }
});

check('N.notes: r4.7-investigation.md freezes the plan + lists module dispositions', () => {
  const doc = fs.readFileSync(abs(`${R47_ROOT}/notes/r4.7-investigation.md`), 'utf8');
  /* Lists module inventory. */
  for (const mod of ['0F1b', '0F2a', '0F3a', '0F4a', '0F6a', '0F1j', '0F5a']) {
    assert.ok(doc.indexOf(mod) >= 0, `r4.7-investigation.md missing module ${mod}`);
  }
  /* Lists the slice plan. */
  assert.match(doc, /R4\.7\.1/);
  assert.match(doc, /R4\.7\.2/);
  assert.match(doc, /R4\.7\.3/);
  /* Hard invariants section. */
  assert.match(doc, /[Hh]ard invariants/);
});

check('N.notes: r4.6-soak-summary.md records R4.6.x commits + pre-R4.7 validator counts', () => {
  const doc = fs.readFileSync(abs(`${R47_ROOT}/notes/r4.6-soak-summary.md`), 'utf8');
  /* R4.6 commit hashes (truncated). */
  assert.match(doc, /4dcab8d/);
  assert.match(doc, /fa70892/);
  assert.match(doc, /ee144af/);
  /* Pre-R4.7 baseline validator counts (these are the values at R4.6.4). */
  assert.match(doc, /176/);
  assert.match(doc, /107/);
  assert.match(doc, /135/);
  assert.match(doc, /277/);
});

check('N.notes: rollback-procedures.md documents 3 levels + post-R4.7 escape-hatch retirement', () => {
  const doc = fs.readFileSync(abs(`${R47_ROOT}/notes/rollback-procedures.md`), 'utf8');
  /* 3 rollback levels. */
  assert.match(doc, /Level 1/i);
  assert.match(doc, /Level 2/i);
  assert.match(doc, /Level 3/i);
  /* Per-file restore. */
  assert.match(doc, /Per-file/i);
  /* Git revert. */
  assert.match(doc, /git revert/);
  /* Post-R4.7 escape-hatch becomes inert. */
  assert.match(doc, /NO LONGER FUNCTIONAL/i);
  /* Hard invariants never affected by rollback. */
  assert.match(doc, /[Hh]ard invariants/);
});

const R47_MODULE_DIRS = [
  '0F1b-library-workspace',
  '0F1d-library-insights',
  '0F2a-projects-ui',
  '0F3a-folders-ui',
  '0F4a-categories-ui',
  '0F6a-labels-ui',
];

for (const dir of R47_MODULE_DIRS) {
  check(`N.module-folder: ${dir}/ exists with README.md`, () => {
    assert.ok(fs.existsSync(abs(`${R47_ROOT}/${dir}`)),
      `${R47_ROOT}/${dir} not found`);
    assert.ok(fs.statSync(abs(`${R47_ROOT}/${dir}`)).isDirectory(),
      `${R47_ROOT}/${dir} must be a directory`);
    assert.ok(fs.existsSync(abs(`${R47_ROOT}/${dir}/README.md`)),
      `${R47_ROOT}/${dir}/README.md not found`);
  });
  check(`N.module-README: ${dir}/README.md documents retirement + replacement + rollback`, () => {
    const doc = fs.readFileSync(abs(`${R47_ROOT}/${dir}/README.md`), 'utf8');
    /* "What was here pre-R4.7" section. */
    assert.match(doc, /pre-R4\.7/i);
    /* "What R4.7.x will retire" section. */
    assert.match(doc, /[Rr]etire/);
    /* "What STAYS" section (the kept surfaces). */
    assert.match(doc, /STAYS/);
    /* Replacement reference. */
    assert.match(doc, /[Rr]eplacement/);
    /* Rollback procedure. */
    assert.match(doc, /[Rr]ollback/);
    assert.match(doc, /git revert/);
  });
}

check('N.r47.x-staged-code-moves: only retired R4.7.x subfolders may contain .js', () => {
  /* R4.7.1 was scaffolding only. R4.7.2 retired 0F4a categories
   * sidebar UI. R4.7.3 retired 0F6a labels sidebar UI. R4.7.4
   * retired 0F2a projects sidebar row UI. R4.7.5 retires 0F1b
   * Native Workspace UI and the entire 0F1d Native Insights UI.
   * 0F3a remains out of scope and must stay README-only. */
  const R47_RETIRED_JS_DIRS = new Set([
    '0F4a-categories-ui',     /* R4.7.2 */
    '0F6a-labels-ui',         /* R4.7.3 */
    '0F2a-projects-ui',       /* R4.7.4 */
    '0F1b-library-workspace', /* R4.7.5 */
    '0F1d-library-insights',  /* R4.7.5 */
  ]);
  for (const dir of R47_MODULE_DIRS) {
    const entries = fs.readdirSync(abs(`${R47_ROOT}/${dir}`));
    const jsFiles = entries.filter(f => f.endsWith('.js'));
    if (R47_RETIRED_JS_DIRS.has(dir)) {
      /* Allowed — verified by Section O (R4.7.2) / Section P
       * (R4.7.3) / Section Q (R4.7.4) checks. */
      continue;
    }
    assert.equal(jsFiles.length, 0,
      `${R47_ROOT}/${dir} should contain no .js files until its R4.7 slice retires it; found: ${jsFiles.join(', ')}`);
  }
});

check('N.r47.1-no-runtime-impact: 0F5a invariant survives every R4.7 slice', () => {
  /* The byte-exact 0F5a check is the canary: any R4.7 slice that
   * accidentally touches Native tag extraction surfaces here. */
  const stat = fs.statSync(abs(FILES['0F5a']));
  assert.equal(stat.size, 273099,
    `0F5a size changed: ${stat.size} vs baseline 273099 — R4.7 slices must not modify Native extraction`);
});

/* ════════════════════════════════════════════════════════════════════════
 * Section O — R4.7.2 Native Categories Sidebar UI physically retired
 *
 * R4.7.2 retires the 0F4a categories SIDEBAR UI surgically. This
 * section asserts:
 *
 *   1. The retired-features archive file exists with the 5 declared
 *      blocks (Block 1 R4.6.3 gate, Block 2 openCategoryAppearanceEditor
 *      archival reference, Block 3 makeFallbackSidebarHeader,
 *      Block 4 prepareCategoriesSection, Block 5 buildCategoriesSection).
 *   2. 0F4a no longer contains the live sidebar render path
 *      (Block 3 / Block 4 / Block 5 internals are gone from 0F4a).
 *   3. 0F4a still contains the H2O.archiveBoot category CRUD
 *      entrypoints — both via direct call sites (in
 *      openCategoryAppearanceEditor + acceptCategoryCandidate, which
 *      stay) and via the new H2O.Categories.archiveBootApi shim.
 *   4. 0F4a contains breadcrumb comments pointing to
 *      categories-sidebar.js at the removal sites.
 *   5. 0F4a's file size shrank vs the pre-R4.7.2 baseline.
 *   6. The per-module documentation (README.md +
 *      extracted-from-0F4a.md) records the move + replacement.
 *   7. The top-level original-path-map.md was updated from
 *      "scaffolding only" to record concrete moves.
 *   8. 0F5a remains byte-exact 273099. Capture files untouched.
 *   9. Studio replacement modules (S0Z1g, S0F1m, S0F1n, S0F4b) are
 *      referenced in the 0F4a-categories-ui README.
 * ═══════════════════════════════════════════════════════════════════════ */

console.log('Section O — R4.7.2 Categories sidebar UI physically retired');

const O_ARCHIVE_PATH = `${R47_ROOT}/0F4a-categories-ui/categories-sidebar.js`;
const O_EXTRACTED_DOC = `${R47_ROOT}/0F4a-categories-ui/extracted-from-0F4a.md`;
const O_README = `${R47_ROOT}/0F4a-categories-ui/README.md`;
const O_PATH_MAP = `${R47_ROOT}/original-path-map.md`;

check('O.archive: categories-sidebar.js exists and is non-empty', () => {
  assert.ok(fs.existsSync(abs(O_ARCHIVE_PATH)),
    `${O_ARCHIVE_PATH} not found`);
  const stat = fs.statSync(abs(O_ARCHIVE_PATH));
  assert.ok(stat.size > 5000,
    `${O_ARCHIVE_PATH} suspiciously small (${stat.size} bytes); expected the 5-block archive`);
});

check('O.archive: categories-sidebar.js declares all 5 blocks', () => {
  const src = fs.readFileSync(abs(O_ARCHIVE_PATH), 'utf8');
  assert.match(src, /Block 1 of 5 — R4\.6\.3 per-element org gate/);
  assert.match(src, /Block 2 of 5 — openCategoryAppearanceEditor/);
  assert.match(src, /Block 3 of 5 — makeFallbackSidebarHeader/);
  assert.match(src, /Block 4 of 5 — prepareCategoriesSection/);
  assert.match(src, /Block 5 of 5 — buildCategoriesSection/);
});

check('O.archive: Block 2 documents that openCategoryAppearanceEditor was KEPT in 0F4a', () => {
  /* The function is reproduced archivally because the sidebar row
   * (a now-retired consumer) called it, but workspace-viewer callers
   * remain — so the live function definition stays in 0F4a until
   * R4.7.3. The archive header must declare that this block is
   * NOT removed from source. */
  const src = fs.readFileSync(abs(O_ARCHIVE_PATH), 'utf8');
  /* Find Block 2's header span and ensure it carries the keep-in-source
   * caveat. */
  const block2 = src.split(/Block 2 of 5/)[1] || '';
  const block2Header = block2.split(/Block 3 of 5/)[0] || '';
  assert.match(block2Header, /KEPT IN 0F4a/);
  assert.match(block2Header, /(workspace|MOD)/i);
});

check('O.source: 0F4a contains R4.7.2 breadcrumbs at each removal site', () => {
  const src = SRC['0F4a'];
  /* Block 1 breadcrumb (R4.6.3 per-element gate). */
  assert.match(src, /R4\.7\.2 — R4\.6\.3 per-element org gate retired/);
  /* Block 3 + Block 4 breadcrumb (combined; they were contiguous). */
  assert.match(src, /R4\.7\.2 — makeFallbackSidebarHeader \+ prepareCategoriesSection/);
  /* Block 5 breadcrumb (buildCategoriesSection). */
  assert.match(src, /R4\.7\.2 — buildCategoriesSection retired/);
  /* Each breadcrumb cites the archive file. */
  const breadcrumbCount = (src.match(/retired-features\/native-library-ui\/0F4a-categories-ui\/categories-sidebar\.js/g) || []).length;
  assert.ok(breadcrumbCount >= 3,
    `0F4a should cite categories-sidebar.js at least 3× (one per moved block); found ${breadcrumbCount}`);
});

check('O.source: 0F4a buildCategoriesSection is now a no-op stub', () => {
  const src = SRC['0F4a'];
  /* The function name stays for MOD API forwarding, but its body
   * must be a no-op early return. */
  const m = src.match(/function buildCategoriesSection\s*\([^)]*\)\s*\{([\s\S]{0,200})\}/);
  assert.ok(m, 'buildCategoriesSection function declaration not found');
  const body = m[1];
  /* Body must contain an early `return null`. */
  assert.match(body, /return null\s*;/);
  /* Body must NOT contain the sidebar render internals that lived in
   * the original function. */
  assert.equal(/makeActionRow\s*\(/.test(body), false,
    'buildCategoriesSection body still contains makeActionRow — function body not fully removed');
  assert.equal(/'New category'/.test(body), false,
    'buildCategoriesSection body still contains the "New category" label — function body not fully removed');
  assert.equal(/'\bflsc-categories-root\b'/.test(body), false,
    'buildCategoriesSection body still references flsc-categories-root literal — body not fully removed');
});

check('O.source: 0F4a no longer contains live sidebar render path', () => {
  const src = SRC['0F4a'];
  /* prepareCategoriesSection function must be gone (was Block 4). */
  assert.equal(/function prepareCategoriesSection\b/.test(src), false,
    '0F4a still defines prepareCategoriesSection — should have been moved');
  /* makeFallbackSidebarHeader must be gone (was Block 3). */
  assert.equal(/function makeFallbackSidebarHeader\b/.test(src), false,
    '0F4a still defines makeFallbackSidebarHeader — should have been moved');
  /* The R4.6.3 gate sync function must be gone (was Block 1). */
  assert.equal(/function syncR46OrgElements\b/.test(src), false,
    '0F4a still defines syncR46OrgElements — R4.6.3 gate should have been moved');
  assert.equal(/function installR46OrgCssGate\b/.test(src), false,
    '0F4a still defines installR46OrgCssGate — R4.6.3 gate should have been moved');
});

check('O.source: 0F4a still preserves H2O.archiveBoot category CRUD entrypoints', () => {
  /* The MV3-fallback audit trail. The literal substrings MUST still
   * appear in 0F4a — either via the openCategoryAppearanceEditor +
   * acceptCategoryCandidate call sites (which stay) or via the new
   * H2O.Categories.archiveBootApi compat shim, or both. */
  const src = SRC['0F4a'];
  assert.match(src, /H2O\.archiveBoot\??\.?renameCategory/,
    '0F4a missing renameCategory audit trail');
  assert.match(src, /H2O\.archiveBoot\??\.?deleteCategory/,
    '0F4a missing deleteCategory audit trail');
  assert.match(src, /H2O\.archiveBoot\??\.?createCategory/,
    '0F4a missing createCategory audit trail');
});

check('O.source: 0F4a defines the H2O.Categories.archiveBootApi compat shim', () => {
  const src = SRC['0F4a'];
  assert.match(src, /H2O\.Categories\.archiveBootApi\s*=/,
    'archiveBootApi shim not found in 0F4a');
  /* Each of the three wrappers present in the shim. */
  const shimSpan = src.split(/archiveBootApi\s*=\s*H2O\.Categories\.archiveBootApi\s*\|\|\s*\{/)[1];
  assert.ok(shimSpan, 'archiveBootApi shim has unexpected shape');
  const shim = shimSpan.split(/^\s*\};/m)[0];
  assert.match(shim, /renameCategory:\s*function/);
  assert.match(shim, /deleteCategory:\s*function/);
  assert.match(shim, /createCategory:\s*function/);
});

check('O.source: 0F4a openCategoryAppearanceEditor remains (R4.7.3 retires it)', () => {
  /* This function holds the rename + delete UI handlers. It stays
   * for workspace viewer callers + MOD API exposure. R4.7.3 will
   * move it. */
  const src = SRC['0F4a'];
  assert.match(src, /function openCategoryAppearanceEditor\b/,
    '0F4a must still define openCategoryAppearanceEditor (kept for workspace viewer + MOD API; retires in R4.7.3)');
  /* And the inline rename/delete handlers inside it still call
   * archiveBoot directly (which is the primary audit trail). */
  assert.match(src, /H2O\.archiveBoot\.renameCategory\(group\.id/);
  assert.match(src, /H2O\.archiveBoot\.deleteCategory\(group\.id\)/);
});

check('O.source: 0F4a acceptCategoryCandidate retains createCategory call site', () => {
  /* This is a secondary audit trail: the candidate-pool acceptance
   * flow still mints fresh categories. */
  const src = SRC['0F4a'];
  assert.match(src, /H2O\.archiveBoot\.createCategory\(/,
    '0F4a must still contain a direct H2O.archiveBoot.createCategory call site');
});

check('O.size: 0F4a shrank measurably vs pre-R4.7.2', () => {
  /* Pre-R4.7.2 baseline (post-R4.6.4): roughly 3564 lines. After
   * R4.7.2 we observed 3303 lines. Anything appreciably above
   * baseline means a removal failed. We allow some headroom for
   * the breadcrumb + compat shim additions. */
  const lines = SRC['0F4a'].split(/\n/).length;
  assert.ok(lines < 3500,
    `0F4a line count ${lines} suggests R4.7.2 removals didn't actually apply (expected < 3500)`);
  /* And it should be at least somewhat smaller than 3500 — a hard
   * floor protects against accidental wholesale deletion. */
  assert.ok(lines > 2800,
    `0F4a line count ${lines} suspiciously small — over-aggressive deletion?`);
});

check('O.doc: extracted-from-0F4a.md exists and records line ranges + commit placeholder', () => {
  assert.ok(fs.existsSync(abs(O_EXTRACTED_DOC)),
    `${O_EXTRACTED_DOC} not found`);
  const doc = fs.readFileSync(abs(O_EXTRACTED_DOC), 'utf8');
  /* Title + retirement framing. */
  assert.match(doc, /R4\.7\.2/);
  assert.match(doc, /[Ee]xtracted from 0F4a/);
  /* Records all 4 moved block ranges + retains Block 2. */
  assert.match(doc, /108[–-]177/);
  assert.match(doc, /1779[–-]1787/);
  assert.match(doc, /1789[–-]1832/);
  assert.match(doc, /1834[–-]2045/);
  /* Block 2 disposition. */
  assert.match(doc, /openCategoryAppearanceEditor/);
  /* Commit hash placeholder. */
  assert.match(doc, /commit hash/i);
  /* Boundary invariants. */
  assert.match(doc, /0F5a/);
  assert.match(doc, /273099/);
  /* Rollback. */
  assert.match(doc, /[Rr]ollback/);
});

check('O.doc: 0F4a-categories-ui README reports R4.7.2 RETIRED status', () => {
  const doc = fs.readFileSync(abs(O_README), 'utf8');
  /* No longer scaffolding. */
  assert.equal(/scaffolding only — no code moved/i.test(doc), false,
    '0F4a-categories-ui README still says "scaffolding only" — should reflect R4.7.2 retirement');
  /* Reports RETIRED status. */
  assert.match(doc, /RETIRED/);
  /* References the 4 moved blocks. */
  assert.match(doc, /Block 1/);
  assert.match(doc, /Block 3/);
  assert.match(doc, /Block 4/);
  assert.match(doc, /Block 5/);
  /* Studio replacement stack: S0Z1g + S0F1m + S0F1n + S0F4b. */
  assert.match(doc, /S0Z1g/);
  assert.match(doc, /S0F1m/);
  assert.match(doc, /S0F1n/);
  assert.match(doc, /S0F4b/);
  /* archiveBootApi shim referenced. */
  assert.match(doc, /archiveBootApi/);
});

check('O.doc: original-path-map.md records R4.7.2 moves (no longer scaffolding-only)', () => {
  const doc = fs.readFileSync(abs(O_PATH_MAP), 'utf8');
  /* No longer empty. */
  assert.equal(/_\(empty — R4\.7\.1 scaffolding/i.test(doc), false,
    'original-path-map.md still shows scaffolding-only — should record R4.7.2 moves');
  /* Concrete entries cite 0F4a (in some form) and the archive file. */
  assert.match(doc, /0F4a\b/);
  assert.match(doc, /[Cc]ategories/);
  assert.match(doc, /categories-sidebar\.js/);
  /* All 4 moved block line ranges referenced. */
  assert.match(doc, /108[–-]177/);
  assert.match(doc, /1779[–-]1787/);
  assert.match(doc, /1789[–-]1832/);
  assert.match(doc, /1834[–-]2045/);
  /* Slice tag. */
  assert.match(doc, /R4\.7\.2/);
});

check('O.invariants: capture path untouched (re-verify post-R4.7.2)', () => {
  /* Sentinel: capture entrypoints in 0F3a + 0F1j unchanged. The
   * full Section E check already covers exhaustive detail; this is
   * a fast re-canary scoped to R4.7.2's actually-modified file
   * neighborhood. 0F1j declares its capture entrypoints with
   * `async function NAME` (not as object properties), so the
   * regexes mirror that shape. */
  assert.match(SRC['0F3a'], /function ENGINE_injectAddToLibrary\b/);
  assert.match(SRC['0F3a'], /function ENGINE_injectAddToFolder\b/);
  assert.match(SRC['0F1j'], /(?:async\s+)?function\s+addToLibrary\b/);
  assert.match(SRC['0F1j'], /(?:async\s+)?function\s+saveToFolder\b/);
  assert.match(SRC['0F1j'], /(?:async\s+)?function\s+openLinkedChat\b/);
});

check('O.invariants: 0F5a byte-exact (re-verify post-R4.7.2)', () => {
  const stat = fs.statSync(abs(FILES['0F5a']));
  assert.equal(stat.size, 273099,
    `0F5a size changed during R4.7.2: ${stat.size} vs baseline 273099 — Tag extraction must not be touched`);
});

check('O.invariants: archiveBoot CRUD definitions untouched in 0D3a (canonical archive)', () => {
  /* The R4.7.2 retirement only moved UI; the archiveBoot
   * implementations remain in 0D3a. We don't ship 0D3a in SRC[],
   * but the diagnose registry asserted in Section C demonstrated
   * the API names. This check confirms 0F4a still depends on
   * `H2O.archiveBoot.*` (it does not re-implement them) — already
   * proved above; here we just guard against a counter-pattern
   * (don't allow 0F4a to define its own renameCategory/etc. as a
   * standalone top-level function, since that would shadow the
   * canonical archive implementation). */
  const src = SRC['0F4a'];
  /* Permitted: archiveBootApi shim's `renameCategory: function (...)` (inside an object literal). */
  /* Forbidden: top-level `function renameCategory(` declaration. */
  assert.equal(/^\s*function renameCategory\s*\(/m.test(src), false,
    '0F4a must not define a top-level renameCategory function — it forwards to H2O.archiveBoot');
  assert.equal(/^\s*function deleteCategory\s*\(/m.test(src), false,
    '0F4a must not define a top-level deleteCategory function — it forwards to H2O.archiveBoot');
  assert.equal(/^\s*function createCategory\s*\(/m.test(src), false,
    '0F4a must not define a top-level createCategory function — it forwards to H2O.archiveBoot');
});

/* ════════════════════════════════════════════════════════════════════════
 * Section P — R4.7.3 Native Labels Sidebar UI physically retired
 *
 * R4.7.3 retires the 0F6a labels SIDEBAR UI surgically. This
 * section asserts:
 *
 *   1. The retired-features archive file exists with the 6
 *      declared blocks (Block 1 R4.6.3 gate, Block 2
 *      openLabelActionsPop, Block 3 makeFallbackSidebarHeader,
 *      Block 4 prepareLabelsSection, Block 5 buildLabelsSection,
 *      Block 6 sidebar lifecycle stubs).
 *   2. 0F6a no longer DEFINES any of the four fully-retired
 *      surfaces (R46_ORG_SELECTORS, syncR46OrgElements,
 *      installR46OrgCssGate, openLabelActionsPop,
 *      makeFallbackSidebarHeader, prepareLabelsSection).
 *   3. 0F6a still DEFINES `function buildLabelsSection` (no-op
 *      stub — body is a single `return null;` followed by `}`).
 *   4. 0F6a still DEFINES the seven sidebar-lifecycle no-op stubs
 *      (activePageLabelKey, syncLabelSidebarActiveState,
 *      scheduleLabelSidebarActiveSync, rerenderLabelsSection,
 *      ensureSidebarObserver, scheduleEnsure, ensureInjected).
 *   5. 0F6a still DEFINES the three label CRUD entrypoints
 *      (function createLabel, function renameLabel,
 *      function deleteLabel) — Studio MV3 fallback dependency.
 *   6. The CRUD definitions are NOT gated by any library.native*
 *      flag helper.
 *   7. The per-turn `lbsc-chip-color` UI (both the JS setProperty
 *      call site and the CSS) remains present in 0F6a.
 *   8. 0F6a's file size shrank measurably vs the pre-R4.7.3
 *      baseline.
 *   9. The per-module documentation (README.md +
 *      extracted-from-0F6a.md) records the move + replacement.
 *  10. The top-level original-path-map.md was updated with the
 *      R4.7.3 entries.
 *  11. 0F5a remains byte-exact 273099. Capture files untouched.
 *  12. Studio replacement modules (S0Z1g, S0F1m, S0F1n, S0F6b)
 *      are referenced in the 0F6a-labels-ui README.
 * ═══════════════════════════════════════════════════════════════════════ */

console.log('Section P — R4.7.3 Labels sidebar UI physically retired');

const P_ARCHIVE_PATH = `${R47_ROOT}/0F6a-labels-ui/labels-sidebar.js`;
const P_EXTRACTED_DOC = `${R47_ROOT}/0F6a-labels-ui/extracted-from-0F6a.md`;
const P_README = `${R47_ROOT}/0F6a-labels-ui/README.md`;
const P_PATH_MAP = `${R47_ROOT}/original-path-map.md`;

check('P.archive: labels-sidebar.js exists and is non-empty', () => {
  assert.ok(fs.existsSync(abs(P_ARCHIVE_PATH)),
    `${P_ARCHIVE_PATH} not found`);
  const stat = fs.statSync(abs(P_ARCHIVE_PATH));
  assert.ok(stat.size > 8000,
    `${P_ARCHIVE_PATH} suspiciously small (${stat.size} bytes); expected the 6-block archive`);
});

check('P.archive: labels-sidebar.js declares all 6 blocks', () => {
  const src = fs.readFileSync(abs(P_ARCHIVE_PATH), 'utf8');
  assert.match(src, /Block 1 of 6 — R4\.6\.3 per-element org gate/);
  assert.match(src, /Block 2 of 6 — openLabelActionsPop/);
  assert.match(src, /Block 3 of 6 — makeFallbackSidebarHeader/);
  assert.match(src, /Block 4 of 6 — prepareLabelsSection/);
  assert.match(src, /Block 5 of 6 — buildLabelsSection/);
  assert.match(src, /Block 6 of 6 — Sidebar lifecycle/);
});

check('P.source: 0F6a contains R4.7.3 breadcrumbs at each removal site', () => {
  const src = SRC['0F6a'];
  /* Block 1 breadcrumb (R4.6.3 per-element gate). */
  assert.match(src, /R4\.7\.3 — R4\.6\.3 per-element org gate retired/);
  /* Block 2 breadcrumb (openLabelActionsPop). */
  assert.match(src, /R4\.7\.3 — openLabelActionsPop retired/);
  /* Block 3 + Block 4 breadcrumb (combined). */
  assert.match(src, /R4\.7\.3 — makeFallbackSidebarHeader \+ prepareLabelsSection/);
  /* Block 5 breadcrumb (buildLabelsSection). */
  assert.match(src, /R4\.7\.3 — buildLabelsSection retired/);
  /* Block 6 breadcrumb (sidebar lifecycle stubs). */
  assert.match(src, /R4\.7\.3 — Sidebar lifecycle functions retired/);
  /* Each breadcrumb cites the archive file. */
  const breadcrumbCount = (src.match(/retired-features\/native-library-ui\/0F6a-labels-ui\/labels-sidebar\.js/g) || []).length;
  assert.ok(breadcrumbCount >= 4,
    `0F6a should cite labels-sidebar.js at least 4× (one per breadcrumb block); found ${breadcrumbCount}`);
});

check('P.source: 0F6a no longer defines fully-retired sidebar surfaces', () => {
  const src = SRC['0F6a'];
  assert.equal(/^\s*const R46_ORG_SELECTORS\s*=/m.test(src), false,
    '0F6a still declares R46_ORG_SELECTORS — should have been moved (R4.6.3 gate retired)');
  assert.equal(/^\s*function syncR46OrgElements\b/m.test(src), false,
    '0F6a still defines syncR46OrgElements — R4.6.3 gate should have been moved');
  assert.equal(/^\s*function installR46OrgCssGate\b/m.test(src), false,
    '0F6a still defines installR46OrgCssGate — R4.6.3 gate should have been moved');
  assert.equal(/^\s*function openLabelActionsPop\b/m.test(src), false,
    '0F6a still defines openLabelActionsPop — sidebar row context menu should have been moved');
  assert.equal(/^\s*function makeFallbackSidebarHeader\b/m.test(src), false,
    '0F6a still defines makeFallbackSidebarHeader — should have been moved');
  assert.equal(/^\s*function prepareLabelsSection\b/m.test(src), false,
    '0F6a still defines prepareLabelsSection — should have been moved');
});

check('P.source: 0F6a buildLabelsSection is now a no-op stub', () => {
  const src = SRC['0F6a'];
  const m = src.match(/function buildLabelsSection\s*\([^)]*\)\s*\{([\s\S]{0,200})\}/);
  assert.ok(m, 'buildLabelsSection function declaration not found');
  const body = m[1];
  assert.match(body, /return null\s*;/);
  /* Body must NOT contain the sidebar render internals that lived
   * in the original function. */
  assert.equal(/'Manage labels'/.test(body), false,
    'buildLabelsSection body still contains the "Manage labels" label — body not fully removed');
  assert.equal(/'Label current chat'/.test(body), false,
    'buildLabelsSection body still contains the "Label current chat" label — body not fully removed');
  assert.equal(/recordLabelsShellSeen\s*\(/.test(body), false,
    'buildLabelsSection body still calls recordLabelsShellSeen — body not fully removed');
});

check('P.source: 0F6a still defines the 7 sidebar-lifecycle no-op stubs', () => {
  const src = SRC['0F6a'];
  /* Each function must still exist (MOD API + CRUD + workspace
   * callers depend on the names resolving). */
  assert.match(src, /function activePageLabelKey\s*\(/);
  assert.match(src, /function syncLabelSidebarActiveState\s*\(/);
  assert.match(src, /function scheduleLabelSidebarActiveSync\s*\(/);
  assert.match(src, /function rerenderLabelsSection\s*\(/);
  assert.match(src, /function ensureSidebarObserver\s*\(/);
  assert.match(src, /function scheduleEnsure\s*\(/);
  assert.match(src, /function ensureInjected\s*\(/);
  /* And each is now a no-op (the original bodies are 9..89 lines
   * long; the stubs are single-line). The R4.7.3 stub comment
   * must be near the function definitions. */
  assert.match(src, /no-op \(R4\.7\.3\)/);
});

check('P.source: 0F6a still defines label CRUD entrypoints', () => {
  const src = SRC['0F6a'];
  /* These are the Studio MV3 fallback dependency. */
  assert.match(src, /^\s*function createLabel\s*\(/m,
    '0F6a missing function createLabel — Studio MV3 fallback requires it');
  assert.match(src, /^\s*function renameLabel\s*\(/m,
    '0F6a missing function renameLabel — Studio MV3 fallback requires it');
  assert.match(src, /^\s*function deleteLabel\s*\(/m,
    '0F6a missing function deleteLabel — Studio MV3 fallback requires it');
});

check('P.source: 0F6a CRUD bodies are NOT gated by deprecation flags', () => {
  /* Re-verify Section E's invariant scoped to R4.7.3's touched
   * neighborhood: no library.native* flag helper appears inside
   * any of the three CRUD function bodies. */
  for (const fn of ['createLabel', 'renameLabel', 'deleteLabel']) {
    const body = functionBody(SRC['0F6a'], fn);
    assert.ok(body, `${fn} body not found in 0F6a`);
    assert.equal(/isNativeWorkspaceUiEnabled\s*\(/.test(body), false,
      `${fn} must not gate on workspace UI flag`);
    assert.equal(/isNativeOrganizationUiEnabled\s*\(/.test(body), false,
      `${fn} must not gate on organization UI flag`);
    assert.equal(/isNativeCaptureOnlyMode\s*\(/.test(body), false,
      `${fn} must not gate on capture-only flag`);
    assert.equal(/library\.native(Workspace|Organization|Capture)/.test(body), false,
      `${fn} must not reference any library.native* flag literal`);
  }
});

check('P.source: 0F6a preserves the per-turn lbsc-chip-color UI', () => {
  const src = SRC['0F6a'];
  /* JS side: the chip-color CSS variable is set on a chip element
   * (in openAssignModal). */
  assert.match(src, /--lbsc-chip-color/,
    '0F6a missing --lbsc-chip-color reference — turn-level chip UI must stay');
  /* Both a setProperty call site and CSS rule(s) should appear. */
  const hits = (src.match(/--lbsc-chip-color/g) || []).length;
  assert.ok(hits >= 2,
    `0F6a should reference --lbsc-chip-color at least 2× (setProperty + CSS); found ${hits}`);
});

check('P.size: 0F6a shrank measurably vs pre-R4.7.3', () => {
  /* Pre-R4.7.3 baseline (post-R4.6.4): 3188 lines. After R4.7.3
   * we observed 2728 lines (~460 fewer). Anything appreciably
   * above 3100 lines means a removal failed. We also enforce a
   * hard floor against accidental wholesale deletion. */
  const lines = SRC['0F6a'].split(/\n/).length;
  assert.ok(lines < 3100,
    `0F6a line count ${lines} suggests R4.7.3 removals didn't actually apply (expected < 3100)`);
  assert.ok(lines > 2200,
    `0F6a line count ${lines} suspiciously small — over-aggressive deletion?`);
});

check('P.doc: extracted-from-0F6a.md exists and records line ranges + commit placeholder', () => {
  assert.ok(fs.existsSync(abs(P_EXTRACTED_DOC)),
    `${P_EXTRACTED_DOC} not found`);
  const doc = fs.readFileSync(abs(P_EXTRACTED_DOC), 'utf8');
  assert.match(doc, /R4\.7\.3/);
  assert.match(doc, /[Ee]xtracted from 0F6a/);
  /* All 4 moved block ranges. */
  assert.match(doc, /128[–-]183/);
  assert.match(doc, /1483[–-]1544/);
  assert.match(doc, /1799[–-]1807/);
  assert.match(doc, /1809[–-]1849/);
  /* Stub disposition. */
  assert.match(doc, /buildLabelsSection/);
  assert.match(doc, /[Ss]tub/);
  /* Commit placeholder. */
  assert.match(doc, /commit hash/i);
  /* Boundary invariants. */
  assert.match(doc, /0F5a/);
  assert.match(doc, /273099/);
  /* Rollback. */
  assert.match(doc, /[Rr]ollback/);
});

check('P.doc: 0F6a-labels-ui README reports R4.7.3 RETIRED status', () => {
  const doc = fs.readFileSync(abs(P_README), 'utf8');
  /* No longer scaffolding. */
  assert.equal(/scaffolding only — no code moved/i.test(doc), false,
    '0F6a-labels-ui README still says "scaffolding only" — should reflect R4.7.3 retirement');
  /* Reports RETIRED status. */
  assert.match(doc, /RETIRED/);
  /* References the 6 blocks. */
  assert.match(doc, /Block 1/);
  assert.match(doc, /Block 2/);
  assert.match(doc, /Block 3/);
  assert.match(doc, /Block 4/);
  assert.match(doc, /Block 5/);
  assert.match(doc, /Block 6/);
  /* Studio replacement stack: S0Z1g + S0F1m + S0F1n + S0F6b. */
  assert.match(doc, /S0Z1g/);
  assert.match(doc, /S0F1m/);
  assert.match(doc, /S0F1n/);
  assert.match(doc, /S0F6b/);
});

check('P.doc: original-path-map.md records R4.7.3 moves', () => {
  const doc = fs.readFileSync(abs(P_PATH_MAP), 'utf8');
  /* Concrete entries cite 0F6a + the archive file. */
  assert.match(doc, /0F6a\b/);
  assert.match(doc, /[Ll]abels/);
  assert.match(doc, /labels-sidebar\.js/);
  /* All 4 moved block line ranges. */
  assert.match(doc, /128[–-]183/);
  assert.match(doc, /1483[–-]1544/);
  assert.match(doc, /1799[–-]1807/);
  assert.match(doc, /1809[–-]1849/);
  /* Slice tag. */
  assert.match(doc, /R4\.7\.3/);
});

check('P.invariants: capture path untouched (re-verify post-R4.7.3)', () => {
  /* Sentinel: capture entrypoints in 0F3a + 0F1j unchanged. */
  assert.match(SRC['0F3a'], /function ENGINE_injectAddToLibrary\b/);
  assert.match(SRC['0F3a'], /function ENGINE_injectAddToFolder\b/);
  assert.match(SRC['0F1j'], /(?:async\s+)?function\s+addToLibrary\b/);
  assert.match(SRC['0F1j'], /(?:async\s+)?function\s+saveToFolder\b/);
  assert.match(SRC['0F1j'], /(?:async\s+)?function\s+openLinkedChat\b/);
});

check('P.invariants: 0F5a byte-exact (re-verify post-R4.7.3)', () => {
  const stat = fs.statSync(abs(FILES['0F5a']));
  assert.equal(stat.size, 273099,
    `0F5a size changed during R4.7.3: ${stat.size} vs baseline 273099 — Tag extraction must not be touched`);
});

check('P.invariants: 0F4a R4.7.2 invariants still hold (cross-slice canary)', () => {
  /* Confirms that R4.7.3 didn't accidentally undo R4.7.2's
   * retirements in 0F4a. */
  const src = SRC['0F4a'];
  assert.match(src, /R4\.7\.2 — R4\.6\.3 per-element org gate retired/);
  assert.match(src, /function buildCategoriesSection\s*\([^)]*\)\s*\{\s*return null/);
});

/* ════════════════════════════════════════════════════════════════════════
 * Section Q — R4.7.4 Native Projects Sidebar Row UI physically retired
 *
 * R4.7.4 retires the 0F2a projects SIDEBAR row UI surgically. This
 * section asserts:
 *
 *   1. The retired-features archive file exists with the 4
 *      declared blocks (Block 1 R4.6.3 gate,
 *      Block 2 UI_installProjectTitleContainerStyle,
 *      Block 3 UI_markProjectTitleRows,
 *      Block 4 UI_applyProjectsNativeControls stub).
 *   2. 0F2a no longer DEFINES R46_ORG_SELECTORS,
 *      syncR46OrgElements, installR46OrgCssGate,
 *      UI_installProjectTitleContainerStyle, or
 *      UI_markProjectTitleRows.
 *   3. 0F2a still DEFINES `function UI_applyProjectsNativeControls`
 *      as a no-op stub.
 *   4. 0F2a still DEFINES the projects DATA layer entrypoints
 *      (fetch / cache / reconcile / harvest / observers).
 *   5. The data-layer entrypoints are NOT gated by any
 *      library.native* flag helper.
 *   6. 0F2a's file size shrank measurably vs the pre-R4.7.4
 *      baseline.
 *   7. The per-module documentation (README.md +
 *      extracted-from-0F2a.md) records the move + replacement.
 *   8. The top-level original-path-map.md was updated with the
 *      R4.7.4 entries.
 *   9. 0F5a remains byte-exact 273099. Capture files untouched.
 *  10. Studio replacement (S0Z1g) is referenced in the
 *      0F2a-projects-ui README.
 *  11. R4.7.2 + R4.7.3 invariants still hold (cross-slice canaries).
 * ═══════════════════════════════════════════════════════════════════════ */

console.log('Section Q — R4.7.4 Projects sidebar row UI physically retired');

const Q_ARCHIVE_PATH = `${R47_ROOT}/0F2a-projects-ui/projects-sidebar-rows.js`;
const Q_EXTRACTED_DOC = `${R47_ROOT}/0F2a-projects-ui/extracted-from-0F2a.md`;
const Q_README = `${R47_ROOT}/0F2a-projects-ui/README.md`;
const Q_PATH_MAP = `${R47_ROOT}/original-path-map.md`;

check('Q.archive: projects-sidebar-rows.js exists and is non-empty', () => {
  assert.ok(fs.existsSync(abs(Q_ARCHIVE_PATH)),
    `${Q_ARCHIVE_PATH} not found`);
  const stat = fs.statSync(abs(Q_ARCHIVE_PATH));
  assert.ok(stat.size > 6000,
    `${Q_ARCHIVE_PATH} suspiciously small (${stat.size} bytes); expected the 4-block archive`);
});

check('Q.archive: projects-sidebar-rows.js declares all 4 blocks', () => {
  const src = fs.readFileSync(abs(Q_ARCHIVE_PATH), 'utf8');
  assert.match(src, /Block 1 of 4 — R4\.6\.3 per-element org gate/);
  assert.match(src, /Block 2 of 4 — UI_installProjectTitleContainerStyle/);
  assert.match(src, /Block 3 of 4 — UI_markProjectTitleRows/);
  assert.match(src, /Block 4 of 4 — UI_applyProjectsNativeControls/);
});

check('Q.source: 0F2a contains R4.7.4 breadcrumbs at each removal site', () => {
  const src = SRC['0F2a'];
  /* Block 1 breadcrumb (R4.6.3 per-element gate). */
  assert.match(src, /R4\.7\.4 — R4\.6\.3 per-element org gate retired/);
  /* Block 2 + 3 + 4 breadcrumb (combined, since they're contiguous in
   * the source at the bottom). */
  assert.match(src, /R4\.7\.4 — UI_installProjectTitleContainerStyle/);
  assert.match(src, /UI_applyProjectsNativeControls body retired/);
  /* Each breadcrumb cites the archive file. */
  const breadcrumbCount = (src.match(/retired-features\/native-library-ui\/0F2a-projects-ui\/projects-sidebar-rows\.js/g) || []).length;
  assert.ok(breadcrumbCount >= 2,
    `0F2a should cite projects-sidebar-rows.js at least 2× (top + bottom); found ${breadcrumbCount}`);
});

check('Q.source: 0F2a no longer defines fully-retired sidebar surfaces', () => {
  const src = SRC['0F2a'];
  assert.equal(/^\s*const R46_ORG_SELECTORS\s*=/m.test(src), false,
    '0F2a still declares R46_ORG_SELECTORS — should have been moved (R4.6.3 gate retired)');
  assert.equal(/^\s*function syncR46OrgElements\b/m.test(src), false,
    '0F2a still defines syncR46OrgElements — R4.6.3 gate should have been moved');
  assert.equal(/^\s*function installR46OrgCssGate\b/m.test(src), false,
    '0F2a still defines installR46OrgCssGate — R4.6.3 gate should have been moved');
  assert.equal(/^\s*function UI_installProjectTitleContainerStyle\b/m.test(src), false,
    '0F2a still defines UI_installProjectTitleContainerStyle — should have been moved');
  assert.equal(/^\s*function UI_markProjectTitleRows\b/m.test(src), false,
    '0F2a still defines UI_markProjectTitleRows — should have been moved');
});

check('Q.source: 0F2a UI_applyProjectsNativeControls is now a no-op stub', () => {
  const src = SRC['0F2a'];
  /* The function name stays for MOD API forwarding, but its body
   * must be a no-op. */
  const m = src.match(/function UI_applyProjectsNativeControls\s*\([^)]*\)\s*\{([\s\S]{0,200})\}/);
  assert.ok(m, 'UI_applyProjectsNativeControls function declaration not found');
  const body = m[1];
  /* Body must NOT contain the original sidebar interception code. */
  assert.equal(/UI_markProjectTitleRows\s*\(/.test(body), false,
    'UI_applyProjectsNativeControls body still calls UI_markProjectTitleRows — body not fully removed');
  assert.equal(/__h2oProjectsMoreBound/.test(body), false,
    'UI_applyProjectsNativeControls body still references __h2oProjectsMoreBound — body not fully removed');
  assert.equal(/projectsSection\.addEventListener/.test(body), false,
    'UI_applyProjectsNativeControls body still attaches click listener — body not fully removed');
  /* The R4.7.4 no-op marker should be present. */
  assert.match(body, /no-op \(R4\.7\.4\)/);
});

check('Q.source: 0F2a still defines projects data-layer entrypoints', () => {
  const src = SRC['0F2a'];
  /* Fetch interception */
  assert.match(src, /function OBS_hookProjectsNativeFetchCaptureOnce\b/,
    '0F2a missing OBS_hookProjectsNativeFetchCaptureOnce — fetch interception required');
  assert.match(src, /async function PROJECTS_fetchAllProjects\b/,
    '0F2a missing PROJECTS_fetchAllProjects — projects fetch required');
  assert.match(src, /async function PROJECTS_fetchNativePage\b/,
    '0F2a missing PROJECTS_fetchNativePage — native-page fetch required');
  /* Cache + store */
  assert.match(src, /function PROJECTS_readStore\b/,
    '0F2a missing PROJECTS_readStore — projects cache required');
  assert.match(src, /function PROJECTS_writeStore\b/,
    '0F2a missing PROJECTS_writeStore — projects cache required');
  /* Reconcile */
  assert.match(src, /function PROJECTS_reconcileStoreSnapshot\b/,
    '0F2a missing PROJECTS_reconcileStoreSnapshot — projects reconcile required');
  assert.match(src, /function PROJECTS_reconcileDropdownRows\b/,
    '0F2a missing PROJECTS_reconcileDropdownRows — dropdown reconcile required');
  /* Harvest */
  assert.match(src, /async function PROJECTS_autoharvestNativeDropdown\b/,
    '0F2a missing PROJECTS_autoharvestNativeDropdown — harvest required');
  /* More-button helpers + document-level override (the behavioral
   * meaning of the retired UI_applyProjectsNativeControls more-row
   * interception). */
  assert.match(src, /function PROJECTS_eventTargetsMoreRow\b/);
  assert.match(src, /function PROJECTS_suppressNativeMoreEvent\b/);
  assert.match(src, /function PROJECTS_openMorePageFromEvent\b/);
  assert.match(src, /function OBS_hookProjectsMorePageOverrideOnce\b/,
    '0F2a missing OBS_hookProjectsMorePageOverrideOnce — document-level more override required');
  /* Canonical store observer */
  assert.match(src, /function OBS_hookProjectsCanonicalStoreOnce\b/,
    '0F2a missing OBS_hookProjectsCanonicalStoreOnce — store observer required');
});

check('Q.source: 0F2a data-layer entrypoints are NOT gated by deprecation flags', () => {
  /* Re-verify Section E's invariant scoped to R4.7.4's touched
   * neighborhood. */
  const DATA_LAYER = [
    'OBS_hookProjectsNativeFetchCaptureOnce',
    'OBS_hookProjectsMorePageOverrideOnce',
    'OBS_hookProjectsCanonicalStoreOnce',
    'PROJECTS_fetchAllProjects',
    'PROJECTS_readStore',
    'PROJECTS_writeStore',
    'PROJECTS_reconcileStoreSnapshot',
  ];
  for (const fn of DATA_LAYER) {
    const body = functionBody(SRC['0F2a'], fn);
    if (!body) continue;
    assert.equal(/isNativeWorkspaceUiEnabled\s*\(/.test(body), false,
      `${fn} must not gate on workspace UI flag`);
    assert.equal(/isNativeOrganizationUiEnabled\s*\(/.test(body), false,
      `${fn} must not gate on organization UI flag`);
    assert.equal(/isNativeCaptureOnlyMode\s*\(/.test(body), false,
      `${fn} must not gate on capture-only flag`);
  }
});

check('Q.size: 0F2a shrank measurably vs pre-R4.7.4', () => {
  /* Pre-R4.7.4 baseline (post-R4.6.4): 2531 lines. After R4.7.4
   * we observed 2356 lines (~175 fewer). Anything appreciably
   * above 2500 lines means a removal failed. */
  const lines = SRC['0F2a'].split(/\n/).length;
  assert.ok(lines < 2500,
    `0F2a line count ${lines} suggests R4.7.4 removals didn't actually apply (expected < 2500)`);
  assert.ok(lines > 1800,
    `0F2a line count ${lines} suspiciously small — over-aggressive deletion?`);
});

check('Q.doc: extracted-from-0F2a.md exists and records line ranges + commit placeholder', () => {
  assert.ok(fs.existsSync(abs(Q_EXTRACTED_DOC)),
    `${Q_EXTRACTED_DOC} not found`);
  const doc = fs.readFileSync(abs(Q_EXTRACTED_DOC), 'utf8');
  assert.match(doc, /R4\.7\.4/);
  assert.match(doc, /[Ee]xtracted from 0F2a/);
  /* All 3 moved block ranges + 1 stub range. */
  assert.match(doc, /112[–-]166/);
  assert.match(doc, /2145[–-]2237/);
  assert.match(doc, /2239[–-]2249/);
  assert.match(doc, /2251[–-]2295/);
  /* Stub disposition. */
  assert.match(doc, /UI_applyProjectsNativeControls/);
  assert.match(doc, /[Ss]tub/);
  /* Commit placeholder. */
  assert.match(doc, /commit hash/i);
  /* Boundary invariants. */
  assert.match(doc, /0F5a/);
  assert.match(doc, /273099/);
  /* Rollback. */
  assert.match(doc, /[Rr]ollback/);
});

check('Q.doc: 0F2a-projects-ui README reports R4.7.4 RETIRED status', () => {
  const doc = fs.readFileSync(abs(Q_README), 'utf8');
  /* No longer scaffolding. */
  assert.equal(/scaffolding only — no code moved/i.test(doc), false,
    '0F2a-projects-ui README still says "scaffolding only" — should reflect R4.7.4 retirement');
  /* Reports RETIRED status. */
  assert.match(doc, /RETIRED/);
  /* References the 4 blocks. */
  assert.match(doc, /Block 1/);
  assert.match(doc, /Block 2/);
  assert.match(doc, /Block 3/);
  assert.match(doc, /Block 4/);
  /* Studio replacement: S0Z1g. */
  assert.match(doc, /S0Z1g/);
});

check('Q.doc: original-path-map.md records R4.7.4 moves', () => {
  const doc = fs.readFileSync(abs(Q_PATH_MAP), 'utf8');
  /* Concrete entries cite 0F2a + the archive file. */
  assert.match(doc, /0F2a\b/);
  assert.match(doc, /[Pp]rojects/);
  assert.match(doc, /projects-sidebar-rows\.js/);
  /* All moved block line ranges. */
  assert.match(doc, /112[–-]166/);
  assert.match(doc, /2145[–-]2237/);
  assert.match(doc, /2239[–-]2249/);
  /* Slice tag. */
  assert.match(doc, /R4\.7\.4/);
});

check('Q.invariants: capture path untouched (re-verify post-R4.7.4)', () => {
  assert.match(SRC['0F3a'], /function ENGINE_injectAddToLibrary\b/);
  assert.match(SRC['0F3a'], /function ENGINE_injectAddToFolder\b/);
  assert.match(SRC['0F1j'], /(?:async\s+)?function\s+addToLibrary\b/);
  assert.match(SRC['0F1j'], /(?:async\s+)?function\s+saveToFolder\b/);
  assert.match(SRC['0F1j'], /(?:async\s+)?function\s+openLinkedChat\b/);
});

check('Q.invariants: 0F5a byte-exact (re-verify post-R4.7.4)', () => {
  const stat = fs.statSync(abs(FILES['0F5a']));
  assert.equal(stat.size, 273099,
    `0F5a size changed during R4.7.4: ${stat.size} vs baseline 273099 — Tag extraction must not be touched`);
});

check('Q.invariants: R4.7.2 + R4.7.3 invariants still hold (cross-slice canary)', () => {
  /* R4.7.2 — 0F4a stub */
  assert.match(SRC['0F4a'], /R4\.7\.2 — R4\.6\.3 per-element org gate retired/);
  assert.match(SRC['0F4a'], /function buildCategoriesSection\s*\([^)]*\)\s*\{\s*return null/);
  /* R4.7.3 — 0F6a stubs */
  assert.match(SRC['0F6a'], /R4\.7\.3 — R4\.6\.3 per-element org gate retired/);
  assert.match(SRC['0F6a'], /function buildLabelsSection\s*\([^)]*\)\s*\{\s*return null/);
  /* R4.7.3 CRUD still defined */
  assert.match(SRC['0F6a'], /^\s*function createLabel\s*\(/m);
  assert.match(SRC['0F6a'], /^\s*function renameLabel\s*\(/m);
  assert.match(SRC['0F6a'], /^\s*function deleteLabel\s*\(/m);
});


/* ════════════════════════════════════════════════════════════════════════
 * Section R — R4.7.5 Native Library Workspace UI + Insights retired
 * ═══════════════════════════════════════════════════════════════════════ */

console.log('Section R — R4.7.5 Workspace UI + Insights retired');

const R_1B_ARCHIVE = R47_ROOT + '/0F1b-library-workspace/library-workspace-ui.js';
const R_1B_EXTRACTED = R47_ROOT + '/0F1b-library-workspace/extracted-from-0F1b.md';
const R_1B_README = R47_ROOT + '/0F1b-library-workspace/README.md';
const R_1D_ARCHIVE = R47_ROOT + '/0F1d-library-insights/0F1d-original.js';
const R_1D_EXTRACTED = R47_ROOT + '/0F1d-library-insights/extracted-from-0F1d.md';
const R_1D_README = R47_ROOT + '/0F1d-library-insights/README.md';
const R_PATH_MAP = R47_ROOT + '/original-path-map.md';

check('R.archive: 0F1b library-workspace-ui.js exists and preserves full original source', () => {
  assert.ok(fs.existsSync(abs(R_1B_ARCHIVE)), R_1B_ARCHIVE + ' not found');
  const src = fs.readFileSync(abs(R_1B_ARCHIVE), 'utf8');
  assert.match(src, /Block 1 of 6/);
  assert.match(src, /Block 6 of 6/);
  assert.match(src, /function mountPage\(page\)/);
  assert.match(src, /function renderWorkspaceBody\b/);
  assert.match(src, /function ensureTopLibraryButton\b/);
  assert.match(src, /function ensureRailLibraryButton\b/);
  assert.ok(src.split(/\n/).length > 4800, '0F1b archive should preserve the full original implementation');
});

check('R.archive: 0F1d-original.js exists and preserves full original renderer', () => {
  assert.ok(fs.existsSync(abs(R_1D_ARCHIVE)), R_1D_ARCHIVE + ' not found');
  const src = fs.readFileSync(abs(R_1D_ARCHIVE), 'utf8');
  assert.match(src, /Block 1 of 1 — Entire 0F1d Explorer \+ Analytics/);
  assert.match(src, /function renderExplorer\b/);
  assert.match(src, /function renderAnalytics\b/);
  assert.match(src, /function ensureStyle\b/);
  assert.ok(src.split(/\n/).length > 1400, '0F1d archive should preserve the full original implementation');
});

check('R.source: 0F1b live source is a compact retired stub', () => {
  const lines = SRC['0F1b'].split(/\n/).length;
  assert.ok(lines < 350, '0F1b live line count ' + lines + ' expected compact stub after R4.7.5');
  assert.match(SRC['0F1b'], /R4\.7\.5 — Native Library Workspace UI retired/);
  assert.match(SRC['0F1b'], /retired-features\/native-library-ui\/0F1b-library-workspace\/library-workspace-ui\.js/);
});

check('R.source: 0F1b no longer defines retired UI renderers', () => {
  const src = SRC['0F1b'];
  for (const symbol of [
    'buildR46DeprecationBanner',
    'applyR46BodyAttrs',
    'syncR46WorkspaceElements',
    'installR46WorkspaceCssGate',
    'ensureTopLibraryButton',
    'ensureRailLibraryButton',
    'mountPage',
    'makeWorkspacePage',
    'renderWorkspaceBody',
    'renderDashboard',
    'renderOverview',
    'renderOrganize',
    'renderInsightsTab',
  ]) {
    assert.equal(new RegExp('^\\s*function ' + symbol + '\\b', 'm').test(src), false,
      '0F1b still defines retired UI function ' + symbol);
  }
});

check('R.source: 0F1b keeps diagnostic helpers and deprecation namespace', () => {
  assert.match(SRC['0F1b'], /function isNativeWorkspaceUiEnabled\s*\(\s*\)/);
  assert.match(SRC['0F1b'], /function isNativeOrganizationUiEnabled\s*\(\s*\)/);
  assert.match(SRC['0F1b'], /function isNativeCaptureOnlyMode\s*\(\s*\)/);
  assert.match(SRC['0F1b'], /H2O\.deprecation\.native\['0F1b'\]/);
  assert.match(SRC['0F1b'], /function selfCheck\s*\(\s*\)/);
});

check('R.source: 0F1b compatibility API is no-op retired, not UI-injecting', () => {
  assert.match(SRC['0F1b'], /const owner = \{/);
  assert.match(SRC['0F1b'], /openWorkspace\(opts = \{\}\)[\s\S]*retiredResult\('openWorkspace'/);
  assert.match(SRC['0F1b'], /ensureTopLibraryButton\(reason = 'api'\)[\s\S]*retiredResult\('ensureTopLibraryButton'/);
  assert.match(SRC['0F1b'], /ensureRailLibraryButton\(reason = 'api'\)[\s\S]*retiredResult\('ensureRailLibraryButton'/);
  assert.equal(/D\.createElement\(/.test(STRIPPED['0F1b']), false,
    '0F1b live stub should not create DOM elements');
});

check('R.source: 0F1b registers owner/service only, not page/route', () => {
  assert.match(SRC['0F1b'], /registerOwner\?\.\('library-workspace'/);
  assert.match(SRC['0F1b'], /registerService\?\.\('library-workspace'/);
  assert.equal(/registerPage\?\.\(/.test(SRC['0F1b']), false);
  assert.equal(/registerRoute\?\.\(/.test(SRC['0F1b']), false);
});

check('R.source: 0F1d live source is a compact retired stub', () => {
  const lines = SRC['0F1d'].split(/\n/).length;
  assert.ok(lines < 180, '0F1d live line count ' + lines + ' expected compact stub after R4.7.5');
  assert.match(SRC['0F1d'], /R4\.7\.5 — 0F1d Library Insights retired in full/);
  assert.match(SRC['0F1d'], /retired-features\/native-library-ui\/0F1d-library-insights\/0F1d-original\.js/);
});

check('R.source: 0F1d no longer exposes Explorer or Analytics render APIs', () => {
  assert.equal(/renderExplorer\s*\(/.test(STRIPPED['0F1d']), false,
    '0F1d live source still references renderExplorer');
  assert.equal(/renderAnalytics\s*\(/.test(STRIPPED['0F1d']), false,
    '0F1d live source still references renderAnalytics');
  assert.equal(/function ensureStyle\b/.test(SRC['0F1d']), false,
    '0F1d live source still defines ensureStyle');
  assert.equal(/D\.createElement\(/.test(STRIPPED['0F1d']), false,
    '0F1d live stub should not create DOM elements');
});

check('R.source: 0F1d keeps diagnostics + no-op refresh only', () => {
  assert.match(SRC['0F1d'], /H2O\.LibraryInsightsBootDiag/);
  assert.match(SRC['0F1d'], /MOD\.refresh = refresh/);
  assert.match(SRC['0F1d'], /MOD\.selfCheck = selfCheck/);
  assert.match(SRC['0F1d'], /registeredOwner/);
  assert.match(SRC['0F1d'], /registeredService/);
});

check('R.doc: 0F1b extracted doc records R4.7.5 ranges and boundaries', () => {
  assert.ok(fs.existsSync(abs(R_1B_EXTRACTED)), R_1B_EXTRACTED + ' not found');
  const doc = fs.readFileSync(abs(R_1B_EXTRACTED), 'utf8');
  assert.match(doc, /R4\.7\.5/);
  for (const range of ['108-196', '198-265', '956-2468', '2469-2784', '2800-3658', '3666-4881']) {
    assert.ok(doc.includes(range), '0F1b extracted doc missing range ' + range);
  }
  assert.match(doc, /0F3a Folders/);
  assert.match(doc, /0F5a/);
  assert.match(doc, /0D3\/3X|0D3 and 3X/);
  assert.match(doc, /Studio files/);
});

check('R.doc: 0F1d extracted doc records entire-file move', () => {
  assert.ok(fs.existsSync(abs(R_1D_EXTRACTED)), R_1D_EXTRACTED + ' not found');
  const doc = fs.readFileSync(abs(R_1D_EXTRACTED), 'utf8');
  assert.match(doc, /R4\.7\.5/);
  assert.match(doc, /1-1445/);
  assert.match(doc, /Entire Explorer \+ Analytics/);
  assert.match(doc, /renderExplorer/);
  assert.match(doc, /renderAnalytics/);
  assert.match(doc, /0F1c Library Index/);
});

check('R.doc: 0F1b README reports R4.7.5 RETIRED status + replacements', () => {
  assert.ok(fs.existsSync(abs(R_1B_README)), R_1B_README + ' not found');
  const doc = fs.readFileSync(abs(R_1B_README), 'utf8');
  assert.equal(/scaffolding only — no code moved/i.test(doc), false);
  assert.match(doc, /R4\.7\.5/);
  assert.match(doc, /RETIRED/);
  assert.match(doc, /Desktop Studio/);
  assert.match(doc, /S0F1d/);
  assert.match(doc, /S0Z1g/);
  assert.match(doc, /0F3a Folders/);
  assert.match(doc, /0F5a/);
});

check('R.doc: 0F1d README reports R4.7.5 RETIRED status + replacement', () => {
  assert.ok(fs.existsSync(abs(R_1D_README)), R_1D_README + ' not found');
  const doc = fs.readFileSync(abs(R_1D_README), 'utf8');
  assert.equal(/scaffolding only — no code moved/i.test(doc), false);
  assert.match(doc, /R4\.7\.5/);
  assert.match(doc, /RETIRED/);
  assert.match(doc, /S0F1d/);
  assert.match(doc, /0F1c Library Index/);
  assert.match(doc, /0F3a Folders/);
});

check('R.doc: original-path-map.md records R4.7.5 moves', () => {
  const doc = fs.readFileSync(abs(R_PATH_MAP), 'utf8');
  assert.match(doc, /R4\.7\.5 moves the Native Library Workspace UI/);
  assert.match(doc, /library-workspace-ui\.js/);
  assert.match(doc, /0F1d-original\.js/);
  assert.match(doc, /Folders are not in R4\.7\.5 scope/);
  assert.match(doc, /956-2468/);
  assert.match(doc, /1-1445/);
});

check('R.invariants: 0F3a Folders untouched by R4.7.5', () => {
  assert.match(SRC['0F3a'], /function ENGINE_injectAddToLibrary\b/);
  assert.match(SRC['0F3a'], /function ENGINE_injectAddToFolder\b/);
  assert.match(SRC['0F3a'], /function installR46OrgCssGate\b/);
  assert.match(SRC['0F3a'], /function syncR46OrgElements\b/);
});

check('R.invariants: 0F5a byte-exact after R4.7.5', () => {
  const stat = fs.statSync(abs(FILES['0F5a']));
  assert.equal(stat.size, 273099,
    '0F5a size changed during R4.7.5: ' + stat.size + ' vs baseline 273099');
});

check('R.invariants: capture business logic still present after R4.7.5', () => {
  assert.match(SRC['0F1j'], /(?:async\s+)?function\s+addToLibrary\b/);
  assert.match(SRC['0F1j'], /(?:async\s+)?function\s+saveToFolder\b/);
  assert.match(SRC['0F1j'], /(?:async\s+)?function\s+openLinkedChat\b/);
});

check('R.invariants: 0F2a projects data layer still active after R4.7.5', () => {
  assert.match(SRC['0F2a'], /function OBS_hookProjectsNativeFetchCaptureOnce\b/);
  assert.match(SRC['0F2a'], /async function PROJECTS_fetchAllProjects\b/);
  assert.match(SRC['0F2a'], /function PROJECTS_reconcileStoreSnapshot\b/);
  assert.match(SRC['0F2a'], /function OBS_hookProjectsMorePageOverrideOnce\b/);
});

check('R.invariants: R4.7.2/R4.7.3/R4.7.4 retirements remain intact', () => {
  assert.match(SRC['0F4a'], /R4\.7\.2 — R4\.6\.3 per-element org gate retired/);
  assert.match(SRC['0F6a'], /R4\.7\.3 — R4\.6\.3 per-element org gate retired/);
  assert.match(SRC['0F2a'], /R4\.7\.4 — R4\.6\.3 per-element org gate retired/);
  assert.match(SRC['0F2a'], /function UI_applyProjectsNativeControls\s*\([^)]*\)\s*\{\s*\/\* no-op \(R4\.7\.4\) \*\//);
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
