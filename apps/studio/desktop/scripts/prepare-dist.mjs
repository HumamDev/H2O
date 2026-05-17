#!/usr/bin/env node
/* prepare-dist.mjs
 *
 * Copies the built Studio assets from
 *   h2o-source/build/chrome-ext-prod/surfaces/studio/
 * into
 *   h2o-source/apps/studio/desktop/dist/
 * so that Tauri's `frontendDist` can serve them.
 *
 * Pre-condition: you have already run from h2o-source/:
 *   npm run dev:rebuild
 *   npm run dev:all
 *   node tools/product/extension/build-chrome-live-extension.mjs
 * so that build/chrome-ext-prod/surfaces/studio/ exists and is current.
 *
 * ── Filename sanitization (M1 fix) ──────────────────────────────────
 * Studio's source files use spaces + emojis in their filenames, e.g.
 *   "S0F1c. 🎬 Library Index - Studio.js"
 * Tauri V2's `tauri://` asset protocol does not reliably resolve URL-
 * encoded multi-byte unicode in paths — for any path it can't resolve
 * it serves the redirector index.html as an SPA-style fallback. The
 * browser then tries to parse HTML as JS and fails silently, leaving
 * the feature module's globals (H2O.LibraryIndex, H2O.LibraryCore,
 * H2O.ChatRegistry, etc.) unregistered.
 *
 * Workaround: sanitize every filename in dist/ down to ASCII-only
 * characters (strip unicode, replace runs of whitespace/punctuation
 * with hyphens), and rewrite `<script src="...">` references in
 * dist/studio.html to match the new names. The MV3 build is unaffected
 * because it copies from the same source separately and never touches
 * dist/. The Studio source tree (surfaces/studio/) is also untouched —
 * this transform is applied only to the Tauri snapshot.
 *
 * The `redirector` index.html at dist/ root immediately replace()s
 * into studio.html so the platform.tauri.js adapter (loaded as a
 * script tag inside studio.html) registers in the page that actually
 * renders Studio.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Phase 0G-1 migration: repo-level path constants come from tools/paths.mjs.
// `here` and `desktopRoot` remain script-relative so this prepare-dist tool
// stays robust to relocation INSIDE apps/studio/desktop/ (e.g. moving the
// scripts/ subdirectory). The repo-level constants (REPO_ROOT, the prod
// extension build dir, and surfaces/studio dir) come from paths.mjs so that
// future migrations that rename those folders only need to update paths.mjs.
// Behavior verified byte-identical via dist/ content shasum compared against
// two pre-refactor reference runs.
//
// Phase 6B (2026-05-17): folder moved from apps/studio-desktop/ to
// apps/studio/desktop/, adding one extra nesting level. Import path
// adjusted from '../../../tools/paths.mjs' (3 levels) to
// '../../../../tools/paths.mjs' (4 levels) to compensate.
import {
  REPO_ROOT,
  SURFACES_STUDIO_DIR,
  extensionBuildDir,
} from '../../../../tools/paths.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(here, '..');

// Local aliases preserve pre-Phase-0G-1 variable names. Each resolves to the
// same value as before under the standard invocation (no H2O_SRC_DIR override):
//   repoRoot    === REPO_ROOT                                            (<repo>/)
//   studioBuilt === path.join(extensionBuildDir('prod'),'surfaces','studio')
//                                                                        (<repo>/build/chrome-ext-prod/surfaces/studio/)
// `dist` keeps its original script-relative compute (<desktopRoot>/dist).
const repoRoot = REPO_ROOT;
const studioBuilt = path.join(extensionBuildDir('prod'), 'surfaces', 'studio');
const dist = path.join(desktopRoot, 'dist');

if (!fs.existsSync(studioBuilt)) {
  console.error(`[prepare-dist] missing built Studio assets at:\n  ${studioBuilt}`);
  console.error('[prepare-dist] from h2o-source/ run:');
  console.error('  npm run dev:rebuild && npm run dev:all && node tools/product/extension/build-chrome-live-extension.mjs');
  process.exit(1);
}

/* Staleness guard.
 *
 * The build artifacts at build/chrome-ext-prod/surfaces/studio/ are produced
 * by a SEPARATE chain (`npm run dev:all` + `chrome-live-extension.mjs`) that
 * this script does NOT trigger. If you edit Studio source under
 * surfaces/studio/ and run `npm run tauri:dev` without re-running that
 * chain, prepare-dist will silently copy a STALE snapshot into dist/, the
 * Tauri window will load the pre-edit Studio code, and you'll spend time
 * debugging "why didn't my fix take effect" symptoms.
 *
 * This guard compares the newest mtime under surfaces/studio/ against the
 * newest mtime under build/chrome-ext-prod/surfaces/studio/. If the source
 * is newer, the build is stale — fail with a clear message that says
 * exactly what to run.
 *
 * To bypass (e.g., you intentionally want to use the existing build),
 * set SKIP_STALENESS_CHECK=1 in the environment.
 */
function newestMtimeRecursive(dir) {
  let newest = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    /* Ignore .DS_Store and other dotfiles — never load-bearing for the build. */
    if (entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      newest = Math.max(newest, newestMtimeRecursive(full));
    } else {
      try {
        const m = fs.statSync(full).mtimeMs;
        if (m > newest) newest = m;
      } catch (_) { /* skip unreadable */ }
    }
  }
  return newest;
}

if (process.env.SKIP_STALENESS_CHECK !== '1') {
  // Phase 0G-1: SURFACES_STUDIO_DIR is imported from tools/paths.mjs and
  // resolves to <REPO_ROOT>/surfaces/studio — byte-identical to the previous
  // `path.join(repoRoot, 'surfaces', 'studio')` under standard invocation.
  const studioSource = SURFACES_STUDIO_DIR;
  if (fs.existsSync(studioSource)) {
    const sourceMtime = newestMtimeRecursive(studioSource);
    const buildMtime = newestMtimeRecursive(studioBuilt);
    if (sourceMtime > buildMtime) {
      const sourceWhen = new Date(sourceMtime).toISOString();
      const buildWhen = new Date(buildMtime).toISOString();
      console.error('[prepare-dist] STALE BUILD DETECTED');
      console.error(`  newest source mtime: ${sourceWhen}  (surfaces/studio/)`);
      console.error(`  newest build  mtime: ${buildWhen}  (build/chrome-ext-prod/surfaces/studio/)`);
      console.error('');
      console.error('  Studio source is newer than the bundled build. If you proceed, Tauri will');
      console.error('  load a pre-edit snapshot of Studio and any recent changes will not take');
      console.error('  effect. From h2o-source/ run:');
      console.error('');
      console.error('    npm run dev:rebuild');
      console.error('    npm run dev:all');
      console.error('    node tools/product/extension/build-chrome-live-extension.mjs');
      console.error('');
      console.error('  Then re-run `npm run tauri:dev`.');
      console.error('');
      console.error('  To force-skip this check (intentional stale build): SKIP_STALENESS_CHECK=1 npm run tauri:dev');
      process.exit(2);
    }
  }
}

/* HTML files whose `<script src="...">` references need to be rewritten
 * after files are renamed. Only studio.html in M1; broaden if other
 * HTML files start referencing renamed assets. */
const HTML_FILES_TO_REWRITE = ['studio.html'];

/* Rename map: original basename → safe basename. Populated during copy;
 * consumed during HTML rewrite. */
const renameMap = new Map();

/* Sanitize a basename to ASCII-only characters Tauri's asset protocol
 * can serve reliably. Keeps the extension intact.
 *
 * Pass-through if the name is already ASCII-safe (uses only letters,
 * digits, `_`, `-`, `.`). This preserves filenames like `platform.mv3.js`
 * and `studio.html` whose subdir-prefixed `<script src=...>` references
 * the rewriter wouldn't catch (the rewriter matches bare basenames
 * only). Files with unicode/whitespace/other punctuation (i.e. all
 * S-prefixed feature scripts whose names contain a film-strip emoji
 * plus spaces) get sanitized. */
function sanitizeBasename(name) {
  if (/^[A-Za-z0-9._-]+$/.test(name)) return name;
  const dotIdx = name.lastIndexOf('.');
  const base = dotIdx > 0 ? name.slice(0, dotIdx) : name;
  const ext = dotIdx > 0 ? name.slice(dotIdx) : '';
  /* Replace any run of non-[A-Za-z0-9_-] with a single hyphen.
   * `.` is excluded from the allowed set inside the sanitizer branch
   * because the source filenames use `. ` as the module-ID separator
   * (e.g. `S0F1c. 🎬 Library Index - ...`); collapsing the period into
   * a hyphen along with the surrounding whitespace gives the cleanest
   * result (`S0F1c-Library-Index-Studio.js`). */
  let safe = base.replace(/[^A-Za-z0-9_-]+/g, '-');
  /* Collapse consecutive hyphens; strip leading/trailing. */
  safe = safe.replace(/-{2,}/g, '-').replace(/^-+|-+$/g, '');
  /* Pathological edge case: the entire base sanitizes to empty. */
  if (!safe) safe = '_';
  return safe + ext;
}

/* Recursive copy that preserves directory structure but sanitizes
 * filename basenames. Records non-trivial renames into renameMap. */
function copyRecursive(src, dst) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dst, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      copyRecursive(path.join(src, entry), path.join(dst, entry));
    }
  } else {
    const origName = path.basename(src);
    const safeName = sanitizeBasename(origName);
    let finalDst = dst;
    if (safeName !== origName) {
      finalDst = path.join(path.dirname(dst), safeName);
      /* Collision detection: if a different source already mapped to
       * this safe name, that's a real bug. Crash loudly. */
      const prior = renameMap.get(origName);
      if (prior && prior !== safeName) {
        throw new Error(`prepare-dist: rename collision: '${origName}' → '${safeName}' but already mapped to '${prior}'`);
      }
      renameMap.set(origName, safeName);
    }
    fs.copyFileSync(src, finalDst);
  }
}

/* Count files for a sanity-check report. */
function countFiles(dir) {
  let n = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) n += countFiles(full);
    else n += 1;
  }
  return n;
}

/* Rewrite <script src="..."> (and similar `src=` URLs) in dist HTML
 * files according to renameMap. We use literal string replace rather
 * than regex to avoid edge cases with unicode-in-source. */
function rewriteHtmlReferences(htmlPath) {
  if (!fs.existsSync(htmlPath)) return 0;
  let html = fs.readFileSync(htmlPath, 'utf8');
  let edits = 0;
  for (const [orig, safe] of renameMap) {
    /* `src="./<orig>"` and `src="<orig>"` are the two patterns
     * studio.html uses for these script tags. Replace both forms. */
    const a = `src="./${orig}"`;
    const aNew = `src="./${safe}"`;
    if (html.includes(a)) {
      html = html.split(a).join(aNew);
      edits += 1;
    }
    const b = `src="${orig}"`;
    const bNew = `src="${safe}"`;
    if (html.includes(b)) {
      html = html.split(b).join(bNew);
      edits += 1;
    }
  }
  if (edits > 0) fs.writeFileSync(htmlPath, html);
  return edits;
}

/* Clear dist/ each run so stale files from a prior Studio bundle don't
 * leak through. Cheap because the copy is bounded by build/ output size. */
fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });

copyRecursive(studioBuilt, dist);

/* Rewrite HTML references after all files are copied + renames known. */
let totalHtmlEdits = 0;
for (const htmlName of HTML_FILES_TO_REWRITE) {
  totalHtmlEdits += rewriteHtmlReferences(path.join(dist, htmlName));
}

/* Emit a redirector at dist/index.html. Tauri's window URL points at
 * `studio.html` directly via tauri.conf.json's app.windows[].url, so
 * this redirector is a defensive default for any access path that
 * lands at `/` (e.g. via DevTools navigation). */
const indexHtml = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>H2O Studio</title>
<script>window.location.replace('./studio.html' + (window.location.hash || ''));</script>
</head>
<body><p>Loading H2O Studio…</p></body>
</html>
`;
fs.writeFileSync(path.join(dist, 'index.html'), indexHtml);

const fileCount = countFiles(dist);
console.log(`[prepare-dist] copied ${fileCount} files into ${path.relative(repoRoot, dist)}/`);
if (renameMap.size > 0) {
  console.log(`[prepare-dist] sanitized ${renameMap.size} filenames for Tauri asset compatibility`);
  console.log(`[prepare-dist] rewrote ${totalHtmlEdits} src= references in HTML`);
}
