#!/usr/bin/env node
/* prepare-dist.mjs
 *
 * Copies the built Studio assets from
 *   h2o-source/build/chrome-ext-prod/surfaces/studio/
 * into
 *   h2o-source/apps/studio-desktop/dist/
 * so that Tauri's `frontendDist` can serve them.
 *
 * Run as the `prebuild` step of `npm run tauri:dev` / `tauri:build`.
 *
 * Pre-condition: you have already run from h2o-source/:
 *   npm run dev:rebuild
 *   npm run dev:all
 *   node tools/product/extension/build-chrome-live-extension.mjs
 * so that build/chrome-ext-prod/surfaces/studio/ exists and is current.
 *
 * The script also emits a tiny `index.html` at the root of dist/ that
 * redirects to studio.html. Tauri's window can point at studio.html
 * directly via tauri.conf.json's app.windows[].url, but having an
 * index.html at the dist root keeps things conventional and lets us
 * debug via the standard route too.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(here, '..');
const repoRoot = path.resolve(desktopRoot, '..', '..');
const studioBuilt = path.join(
  repoRoot,
  'build',
  'chrome-ext-prod',
  'surfaces',
  'studio',
);
const dist = path.join(desktopRoot, 'dist');

if (!fs.existsSync(studioBuilt)) {
  console.error(`[prepare-dist] missing built Studio assets at:\n  ${studioBuilt}`);
  console.error('[prepare-dist] from h2o-source/ run:');
  console.error('  npm run dev:rebuild && npm run dev:all && node tools/product/extension/build-chrome-live-extension.mjs');
  process.exit(1);
}

/* Recursive copy that preserves directory structure. */
function copyRecursive(src, dst) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dst, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      copyRecursive(path.join(src, entry), path.join(dst, entry));
    }
  } else {
    fs.copyFileSync(src, dst);
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

/* Clear dist/ each run so stale files from a prior Studio bundle don't
 * leak through. Cheap because the copy is bounded by build/ output size. */
fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });

copyRecursive(studioBuilt, dist);

/* Emit a redirector at dist/index.html. Tauri loads this first; it
 * immediately replace()s into studio.html so the platform.tauri.js
 * adapter (loaded as a script tag inside studio.html) registers in
 * the page that actually renders Studio. */
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
