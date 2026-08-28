// Smoke for the studio.html -> pack-manifest script-ref drift guard.
// Exercises the pure + disk helpers exported from ../pack-studio.mjs:
//   parseStudioHtmlScriptRefs / studioHtmlRefsMissingFrom / studioHtmlMissingFromAllowlist
//
// Run: node tools/product/studio/__smoke__/pack-refcheck.smoke.mjs
// Exit code is non-zero on any failure.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseStudioHtmlScriptRefs,
  studioHtmlRefsMissingFrom,
  studioHtmlMissingFromAllowlist,
  ARCHIVE_WORKBENCH_SOURCE_FILES,
  ARCHIVE_WORKBENCH_OUT_FILES,
  archiveWorkbenchSourceDir,
} from '../pack-studio.mjs';

// __smoke__ -> studio -> product -> tools -> <repo root>
const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(here, '..', '..', '..', '..');

let fail = 0;
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const assert = (c, m, got) => {
  if (!c) { console.error('FAIL:', m, '| got:', JSON.stringify(got)); fail++; }
  else console.log('PASS:', m);
};

console.log('= pack-refcheck smoke =');

// Synthetic studio.html exercising: ./ prefix, ?query, single/double quotes,
// attr-before-src (type="module"), inline block, <img>, and every skipped scheme.
const HTML = `
<script src="./studio.js?v=2.5.35"></script>
<script src='./overlay/overlay-serializer.studio.js'></script>
<script type="module" src="./dock/tabs/finder.tab.studio.js"></script>
<script src="https://cdn.example.com/lib.js"></script>
<script src="//cdn.example.com/proto-rel.js"></script>
<script src="chrome-extension://abc/y.js"></script>
<script src="data:text/javascript,1"></script>
<script>console.log('inline, no src');</script>
<img src="./not-a-script.png">
`;

// 1 — parse extracts exactly the 3 local refs, normalized; skips non-local/inline/img
assert(
  eq(parseStudioHtmlScriptRefs(HTML), ['studio.js', 'overlay/overlay-serializer.studio.js', 'dock/tabs/finder.tab.studio.js']),
  '1. parse local script refs correctly',
  parseStudioHtmlScriptRefs(HTML),
);

// 2 — all covered -> []
assert(
  eq(studioHtmlRefsMissingFrom(HTML, ['studio.js', 'overlay/overlay-serializer.studio.js', 'dock/tabs/finder.tab.studio.js']), []),
  '2. all covered returns []',
);

// 3 — one missing -> exactly that ref
assert(
  eq(studioHtmlRefsMissingFrom(HTML, ['studio.js', 'overlay/overlay-serializer.studio.js']), ['dock/tabs/finder.tab.studio.js']),
  '3. one missing ref returns exactly that ref',
);

// 4 — non-local schemes never appear as "missing" even with an empty allowlist
assert(
  eq(studioHtmlRefsMissingFrom(
    `<script src="https://x/a.js"></script><script src="//y/b.js"></script><script src="data:,1"></script><script src="chrome-extension://z/c.js"></script>`,
    [],
  ), []),
  '4. non-local refs are skipped',
);

// 5 — real tree: every studio.html script ref is packed (overlay + dock/tabs gaps fixed)
const realMissing = studioHtmlMissingFromAllowlist(REPO);
assert(eq(realMissing, []), '5. real tree returns []', realMissing);

// 6 — negative control: guard catches the historical overlay-export gap when
//     that entry is removed from the allowlist
const realHtml = readFileSync(path.join(archiveWorkbenchSourceDir(REPO), 'studio.html'), 'utf8');
const probe = 'overlay/overlay-serializer.studio.js';
const reduced = ARCHIVE_WORKBENCH_SOURCE_FILES.filter((n) => n !== probe);
assert(
  studioHtmlRefsMissingFrom(realHtml, reduced).includes(probe),
  '6. negative control catches missing overlay/overlay-serializer.studio.js',
  studioHtmlRefsMissingFrom(realHtml, reduced),
);

// 7-9 — index-paired Saved-Chat modules must retain semantic identity.
const savedChatModules = [
  'ingestion/saved-chat-coverage.tauri.js',
  'ingestion/saved-chat-archive-diagnostics.tauri.js',
];
const hasSameNameMapping = (sourceFiles, outFiles, name) => {
  const sourceIndex = sourceFiles.indexOf(name);
  return sourceIndex >= 0 && outFiles[sourceIndex] === name;
};

for (const name of savedChatModules) {
  assert(
    hasSameNameMapping(ARCHIVE_WORKBENCH_SOURCE_FILES, ARCHIVE_WORKBENCH_OUT_FILES, name),
    `7-8. Saved-Chat source maps to same-named output: ${name}`,
  );
}

const swappedSavedChatOutFiles = ARCHIVE_WORKBENCH_OUT_FILES.slice();
const coverageOutIndex = swappedSavedChatOutFiles.indexOf(savedChatModules[0]);
const diagnosticsOutIndex = swappedSavedChatOutFiles.indexOf(savedChatModules[1]);
[swappedSavedChatOutFiles[coverageOutIndex], swappedSavedChatOutFiles[diagnosticsOutIndex]] =
  [swappedSavedChatOutFiles[diagnosticsOutIndex], swappedSavedChatOutFiles[coverageOutIndex]];
assert(
  savedChatModules.some((name) => !hasSameNameMapping(
    ARCHIVE_WORKBENCH_SOURCE_FILES,
    swappedSavedChatOutFiles,
    name,
  )),
  '9. negative control rejects a deliberate Saved-Chat output swap',
);

console.log(fail ? `\nFAILED (${fail})` : '\nALL PASS');
process.exitCode = fail ? 1 : 0;
