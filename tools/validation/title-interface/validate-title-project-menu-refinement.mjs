#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), '../../..');
const titlePath = path.join(repoRoot, 'src-runtime-base/9C1a.🟤📌 Title Under Input bar 📌.js');
const source = fs.readFileSync(titlePath, 'utf8');

function extractFunction(name) {
  const marker = `function ${name}(`;
  const start = source.indexOf(marker);
  assert.ok(start >= 0, `${name} declaration missing`);
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    else if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`${name} body is unterminated`);
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

// Container-derived width: 48 px per side at normal widths, reduced to 8%
// per side on narrow composer containers. No viewport calculation drives it.
const visibleTitleRule = source.match(/\.ho-tab-title-under-input\s*\{([\s\S]*?)\n\s*\}/)?.[1] || '';
assert.match(visibleTitleRule, /align-self:\s*stretch;/, 'the visible title surface must stretch within the composer container');
assert.match(visibleTitleRule, /margin-inline:\s*min\(48px,\s*8%\);/, 'the visible title surface needs responsive inline insets');
assert.match(visibleTitleRule, /width:\s*auto;/, 'the visible title surface width must derive from its container');
assert.match(visibleTitleRule, /max-width:\s*none;/, 'a legacy viewport cap must not defeat container-derived sizing');
assert.doesNotMatch(visibleTitleRule, /width:\s*100%/, 'the visible title surface must not combine full width with inline margins');

const geometrySandbox = { Math };
geometrySandbox.globalThis = geometrySandbox;
vm.createContext(geometrySandbox);
vm.runInContext(
  `${extractFunction('clamp')}\n${extractFunction('computeAnchoredMenuPosition')}\n` +
  'globalThis.position = computeAnchoredMenuPosition;',
  geometrySandbox,
  { filename: titlePath }
);
const position = geometrySandbox.position;
const viewport = { left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600 };

{
  const point = plain(position(
    { left: 300, right: 320, top: 100, bottom: 120 },
    { width: 200, height: 160 },
    viewport,
    'below'
  ));
  assert.deepEqual(point, { left: 120, top: 127, side: 'below', maxHeight: 465 }, 'an upper trigger deterministically places a fitting menu 7 px below');
}

{
  const point = plain(position(
    { left: 730, right: 750, top: 500, bottom: 520 },
    { width: 220, height: 150 },
    viewport,
    'below'
  ));
  assert.equal(point.side, 'above', 'menu flips above when below space is insufficient');
  assert.equal(point.top, 343, 'flipped menu retains a 7 px trigger gap');
  assert.equal(point.left, 530, 'flipped menu remains trigger-right-aligned');
  assert.equal(point.maxHeight, 485, 'above placement exposes its stable available-height constraint');
}

{
  const point = plain(position(
    { left: 1, right: 12, top: 2, bottom: 20 },
    { width: 260, height: 180 },
    viewport,
    'below'
  ));
  assert.equal(point.left, 8, 'menu clamps to the viewport left padding');
  assert.equal(point.top, 27, 'menu stays below when room is available');
}

{
  const anchor = { left: 380, right: 400, top: 330, bottom: 350 };
  const natural = plain(position(anchor, { width: 220, height: 700 }, viewport, 'below'));
  assert.equal(natural.side, 'above', 'when neither side fits, the side with more room is chosen once');
  assert.equal(natural.maxHeight, 315, 'a too-tall popup is constrained to the chosen side');
  assert.equal(natural.top, 8, 'the constrained popup remains inside the viewport top padding');
  assert.ok(natural.top + natural.maxHeight <= viewport.bottom - 8, 'the constrained popup remains inside usable viewport bounds');

  const consequence = plain(position(anchor, { width: 220, height: natural.maxHeight }, viewport, 'below'));
  assert.equal(consequence.side, natural.side, 'the style-imposed height constraint cannot alternate placement on the next equivalent cycle');
}

assert.match(source, /positionMenu\(menu,\s*anchor\s*\|\|\s*labelEl\)/, 'title menu positions from the actual trigger');
assert.match(source, /availableWidth = Math\.max\(40,[\s\S]*menu\.style\.maxWidth = `\$\{availableWidth\}px`/,
  'menus fit the actual visual viewport before their coordinates are clamped');
assert.match(source, /menu\.getBoundingClientRect\(\)\.width > availableWidth[\s\S]*menu\.style\.minWidth = '0'/,
  'responsive fitting overrides CSS minimum widths on exceptionally narrow viewports');
assert.match(source, /menu\.style\.maxHeight = 'none';[\s\S]*computeAnchoredMenuPosition\(ar, mr, viewport, placement\)[\s\S]*menu\.style\.maxHeight = `\$\{point\.maxHeight\}px`/,
  'each reposition measures natural height before applying the chosen side constraint once');
assert.match(source, /const injectedOwner = norm\(btn\.getAttribute\?\.\('data-cgxui'\)/,
  'deduplication preserves externally injected actions whose cloned data-action matches their anchor');
assert.match(source, /function markTitleOwnedMenu\(menu\)[\s\S]*menu\.setAttribute\('data-cgxui-owner',\s*'9C1a'\)/,
  'Title popups identify themselves as H2O-owned so unrelated native-viewer positioners ignore them');
assert.equal((source.match(/markTitleOwnedMenu\((?:menu|picker|popup)\);/g) || []).length, 4,
  'every Title menu, picker, and confirmation popup uses the ownership marker');
assert.match(source, /W\.addEventListener\('scroll',\s*onGeometry/, 'open menus track page/composer scrolling');
assert.match(source, /W\.addEventListener\('resize',\s*onGeometry/, 'open menus track viewport resizing');
assert.match(source, /scheduleOpenMenuPositions\(\)/, 'DOM/layout changes request anchored repositioning');

const projectSandbox = { Map, String };
projectSandbox.globalThis = projectSandbox;
vm.createContext(projectSandbox);
vm.runInContext(
  `${extractFunction('canonicalProjectRows')}\n` +
  'globalThis.rows = canonicalProjectRows;',
  projectSandbox,
  { filename: titlePath }
);

{
  let readCalls = 0;
  let fastCalls = 0;
  const rows = plain(projectSandbox.rows({
    readStore() {
      readCalls += 1;
      return {
        bestRows: [{ id: 'p1', title: 'One' }, { id: 'p2', title: 'Two' }],
        rows: [{ id: 'p1', title: 'Duplicate One' }],
      };
    },
    owner: {
      loadRowsFast() {
        fastCalls += 1;
        return [{ id: 'p2', title: 'Two' }, { id: 'p3', title: 'Three' }];
      },
    },
  }));
  assert.equal(readCalls, 1, 'project picker reads canonical H2O.Projects state');
  assert.equal(fastCalls, 1, 'project picker includes canonical fast rows');
  assert.deepEqual(rows.map((row) => row.id), ['p1', 'p2', 'p3'], 'every canonical project ID is represented exactly once');
}

assert.match(source, /return W\.H2O\?\.Projects \|\|/, 'the picker prefers the canonical H2O.Projects public authority');

const chooserSource = extractFunction('openProjectChooser');
assert.match(chooserSource, /const projects = canonicalProjectRows\(api\)/,
  'project choices derive only from canonical Projects records');
assert.match(chooserSource, /picker\.dataset\.hoProjectChoiceSurface = '1'/,
  'the private project-choice surface has an explicit Title-owned marker');
assert.match(chooserSource, /picker\.setAttribute\('role',\s*'listbox'\)/,
  'the project picker is a choice list, not a generic action menu eligible for native-menu injection');
assert.match(chooserSource, /button\.setAttribute\('role',\s*'option'\)/,
  'every selectable project row is exposed as a project option');
assert.match(chooserSource, /button\.dataset\.hoProjectChoice = '1'[\s\S]*button\.dataset\.projectId = project\.id/,
  'every selectable project option carries its canonical project ID');
assert.match(chooserSource, /projects\.forEach\(\(project\) => \{[\s\S]*picker\.appendChild\(button\)/,
  'one rendered project option is appended for every canonical deduplicated project');
assert.doesNotMatch(chooserSource, /Add to Library|Save to Folder|Add label|Add to folder|Rename/,
  'generic non-project actions cannot be authored as project choices');

const interactionSandbox = { Promise, String };
interactionSandbox.globalThis = interactionSandbox;
vm.createContext(interactionSandbox);
vm.runInContext(
  `${extractFunction('createProjectMoveInteraction')}\n` +
  'globalThis.createInteraction = createProjectMoveInteraction;',
  interactionSandbox,
  { filename: titlePath }
);
const createInteraction = interactionSandbox.createInteraction;

{
  let calls = 0;
  const interaction = createInteraction(async () => { calls += 1; return { ok: true }; });
  interaction.select({ id: 'p1', name: 'One' });
  assert.equal(calls, 0, 'selecting a project does not move immediately');
  assert.equal(interaction.cancel(), true);
  assert.equal(calls, 0, 'Cancel performs zero mutations');
  interaction.select({ id: 'p1', name: 'One' });
  assert.equal(interaction.escape(), true);
  assert.equal(calls, 0, 'Escape performs zero mutations');
}

{
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const invocations = [];
  const interaction = createInteraction((args) => { invocations.push(plain(args)); return gate; });
  interaction.select({ id: 'p1', name: 'One' });
  const first = interaction.confirm('chat-1');
  const duplicate = await interaction.confirm('chat-1');
  assert.equal(duplicate.status, 'move-pending', 'pending state blocks duplicate submission');
  assert.equal(invocations.length, 1, 'Move invokes the canonical API exactly once');
  assert.deepEqual(invocations[0], { chatId: 'chat-1', projectId: 'p1', source: 'title-under-input' }, 'Move uses the exact public API contract');
  release({ ok: true, status: 'moved' });
  assert.equal((await first).ok, true);
}

{
  const interaction = createInteraction(async () => ({ ok: false, status: 'persistence-unconfirmed', error: 'Not moved' }));
  interaction.select({ id: 'p1', name: 'One' });
  const result = await interaction.confirm('chat-1');
  assert.equal(result.ok, false, 'failed move remains a failure');
  assert.equal(result.error, 'Not moved', 'failure detail remains available to the visible error surface');
}

assert.match(source, /if \(result\?\.ok === true\) \{[\s\S]*closeTitleMenu\(true\);[\s\S]*refreshSoon\('project-moved'\)/, 'success closes the menu chain and refreshes presentation');
assert.match(source, /errorEl\.textContent = result\?\.error \|\| 'Could not move this chat\. Please try again\.'/,
  'failure shows a compact error and does not enter the success path');
assert.match(source, /item\.action === 'rename'\)[\s\S]*startInlineEdit\(\)/, 'existing Rename action remains wired');
assert.match(source, /item\.action === 'add-label'\)[\s\S]*openLabelAssign\(\)/, 'existing Add label action remains wired');
assert.match(source, /item\.action === 'add-folder'\)[\s\S]*openFolderChooser\(/, 'existing Add to folder action remains wired');
assert.doesNotMatch(source, /openNativeMoveToProject|clickNativeMenuItem|findConversationOptionsButton/, 'Title must not duplicate Projects persistence automation');

for (const [target, type] of [
  ['D', 'pointerdown'], ['D', 'keydown'], ['W', 'resize'], ['W', 'scroll'],
]) {
  assert.match(source, new RegExp(`${target}\\.addEventListener\\('${type}'`), `${target} ${type} listener must be installed`);
  assert.match(source, new RegExp(`${target}\\.removeEventListener\\('${type}'`), `${target} ${type} listener must be removed`);
}
assert.match(source, /visualViewport\?\.addEventListener\?\.\('resize'/, 'visual viewport resize listener is installed');
assert.match(source, /visualViewport\?\.removeEventListener\?\.\('resize'/, 'visual viewport resize listener is removed');
assert.match(source, /menuCleanup = \[\];/, 'repeated close cycles clear listener cleanup callbacks');
assert.match(source, /menuPositions\.clear\(\)/, 'repeated close cycles clear anchored menu state');

console.log('validate-title-project-menu-refinement: ok');
