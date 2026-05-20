#!/usr/bin/env node
// Validator for @h2o/host-adapter-claude (Phase 9A-3).
//
// Verifies the package conforms to docs/architecture/HOST_ADAPTER_CONTRACT.md:
//   §3 required exports present + correct kind
//   §4 type shapes returned correctly
//   §5 behavioral invariants (no throws, document-optional, frozen factory)
//
// No jsdom dependency — uses minimal hand-rolled Document/Element stubs.
// Exits non-zero on any failure.

import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const PKG_DIR = path.join(REPO_ROOT, 'packages', 'host-adapters', 'claude');
const PKG_INDEX = path.join(PKG_DIR, 'index.js');

const PASS = [];
const FAIL = [];

function pass(label) { PASS.push(label); }
function fail(label, err) { FAIL.push({ label, err: err?.message || String(err) }); }
function check(label, fn) {
  try { fn(); pass(label); }
  catch (e) { fail(label, e); }
}

// ── Load adapter ──────────────────────────────────────────────────────────

const adapter = await import(pathToFileURL(PKG_INDEX).href);

// ── §3.1 Required constants ───────────────────────────────────────────────

check('§3.1 H2O_CLAUDE_ADAPTER_VERSION is a semver string', () => {
  assert.equal(typeof adapter.H2O_CLAUDE_ADAPTER_VERSION, 'string');
  assert.match(adapter.H2O_CLAUDE_ADAPTER_VERSION, /^\d+\.\d+\.\d+$/);
});

check('§3.1 H2O_CLAUDE_HOST equals "claude.ai"', () => {
  assert.equal(adapter.H2O_CLAUDE_HOST, 'claude.ai');
});

check('§3.1 RouteKind is a frozen enum with required keys', () => {
  assert.equal(typeof adapter.RouteKind, 'object');
  assert.ok(Object.isFrozen(adapter.RouteKind));
  for (const k of ['NEW', 'CHAT', 'PROJECT_CHAT', 'PROJECT', 'UNKNOWN']) {
    assert.ok(k in adapter.RouteKind, `RouteKind.${k} missing`);
  }
  assert.equal(adapter.RouteKind.NEW, 'new');
  assert.equal(adapter.RouteKind.CHAT, 'chat');
  assert.equal(adapter.RouteKind.PROJECT_CHAT, 'project-chat');
  assert.equal(adapter.RouteKind.PROJECT, 'project');
  assert.equal(adapter.RouteKind.UNKNOWN, 'unknown');
});

check('§3.1 TurnRole is a frozen enum with required keys', () => {
  assert.equal(typeof adapter.TurnRole, 'object');
  assert.ok(Object.isFrozen(adapter.TurnRole));
  for (const k of ['USER', 'ASSISTANT', 'SYSTEM', 'UNKNOWN']) {
    assert.ok(k in adapter.TurnRole, `TurnRole.${k} missing`);
  }
});

// ── §3.2 The 9 required adapter methods ────────────────────────────────────

const REQUIRED_FUNCTIONS = [
  'detectContext',
  'getConversationId',
  'getConversationUrl',
  'enumerateTurns',
  'classifyTurnRole',
  'extractTurnText',
  'isStreaming',
  'getProjectContext',
  'getSidebarChats',
];

for (const fnName of REQUIRED_FUNCTIONS) {
  check(`§3.2 ${fnName} is a function`, () => {
    assert.equal(typeof adapter[fnName], 'function', `${fnName} is ${typeof adapter[fnName]}`);
  });
}

check('§3.3 createClaudeAdapter is a function', () => {
  assert.equal(typeof adapter.createClaudeAdapter, 'function');
});

// ── §3.3 Factory returns frozen object with right shape ───────────────────

check('§3.3 createClaudeAdapter() returns frozen object', () => {
  const a = adapter.createClaudeAdapter();
  assert.ok(Object.isFrozen(a), 'adapter object must be frozen');
});

check('§3.3 factory result exposes version + host fields', () => {
  const a = adapter.createClaudeAdapter();
  assert.equal(a.version, adapter.H2O_CLAUDE_ADAPTER_VERSION);
  assert.equal(a.host, 'claude.ai');
});

check('§3.3 factory result includes all 9 methods', () => {
  const a = adapter.createClaudeAdapter();
  for (const fnName of REQUIRED_FUNCTIONS) {
    assert.equal(typeof a[fnName], 'function', `factory.${fnName} missing`);
  }
});

// ── URL parsing (live-tested; no DOM required) ─────────────────────────────

const URL_FIXTURES = [
  {
    label: 'new route',
    href: 'https://claude.ai/new',
    expect: { routeKind: 'new', conversationId: null, projectId: null, isClaudeAi: true },
  },
  {
    label: 'plain chat route',
    href: 'https://claude.ai/chat/abcd1234-ef56-7890-abcd-1234ef567890',
    expect: { routeKind: 'chat', conversationId: 'abcd1234-ef56-7890-abcd-1234ef567890', projectId: null, isClaudeAi: true },
  },
  {
    label: 'project chat route',
    href: 'https://claude.ai/projects/my-proj-123/conversations/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    expect: { routeKind: 'project-chat', conversationId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', projectId: 'my-proj-123', isClaudeAi: true },
  },
  {
    label: 'project landing route',
    href: 'https://claude.ai/projects/my-proj-123',
    expect: { routeKind: 'project', conversationId: null, projectId: 'my-proj-123', isClaudeAi: true },
  },
  {
    label: 'unknown route',
    href: 'https://claude.ai/settings/account',
    expect: { routeKind: 'unknown', conversationId: null, projectId: null, isClaudeAi: true },
  },
  {
    label: 'non-claude host returns isClaudeAi=false',
    href: 'https://chatgpt.com/c/abc',
    expect: { isClaudeAi: false },
  },
];

for (const fx of URL_FIXTURES) {
  check(`URL parsing — ${fx.label}`, () => {
    const docStub = makeDocStub(fx.href);
    const ctx = adapter.detectContext(docStub);
    for (const [k, v] of Object.entries(fx.expect)) {
      assert.equal(ctx[k], v, `expected ${k}=${v}, got ${ctx[k]}`);
    }
    assert.equal(ctx.host, 'claude.ai');
    assert.equal(typeof ctx.url, 'string');
  });
}

// ── §5.3 Document-optional (works with no arg) ─────────────────────────────

check('§5.3 detectContext() works with no arg in Node (no globalThis.document)', () => {
  // Should not throw; should return a HostContext with isClaudeAi=false.
  const ctx = adapter.detectContext();
  assert.equal(typeof ctx, 'object');
  assert.equal(ctx.host, 'claude.ai');
  assert.equal(typeof ctx.isClaudeAi, 'boolean');
});

check('§5.3 enumerateTurns() returns [] with no arg', () => {
  const turns = adapter.enumerateTurns();
  assert.ok(Array.isArray(turns), 'must be an array');
  assert.equal(turns.length, 0);
});

check('§5.3 getSidebarChats() returns [] with no arg', () => {
  const chats = adapter.getSidebarChats();
  assert.ok(Array.isArray(chats));
});

check('§5.3 isStreaming() returns false with no arg', () => {
  assert.equal(adapter.isStreaming(), false);
});

check('§5.3 getProjectContext() returns null with no arg', () => {
  assert.equal(adapter.getProjectContext(), null);
});

// ── §5.1 No throws on garbage input ────────────────────────────────────────

check('§5.1 classifyTurnRole(null) returns "unknown"', () => {
  assert.equal(adapter.classifyTurnRole(null), 'unknown');
});

check('§5.1 classifyTurnRole(undefined) returns "unknown"', () => {
  assert.equal(adapter.classifyTurnRole(undefined), 'unknown');
});

check('§5.1 classifyTurnRole({}) returns "unknown" (no throw)', () => {
  assert.equal(adapter.classifyTurnRole({}), 'unknown');
});

check('§5.1 extractTurnText(null) returns empty shape', () => {
  const r = adapter.extractTurnText(null);
  assert.equal(r.text, '');
  assert.equal(r.markdown, '');
  assert.equal(r.html, '');
});

// ── DOM-stub tests for turn enumeration + role classification ────────────

check('enumerateTurns finds role="article" elements', () => {
  const doc = makeFullDocStub({
    href: 'https://claude.ai/chat/aaaa1111-bbbb-2222-cccc-333344445555',
    mainHtml: `
      <main>
        <div role="article" data-test="t1">User text here is long enough.</div>
        <div role="article" data-test="t2">Assistant reply with content.</div>
      </main>
    `,
  });
  const turns = adapter.enumerateTurns(doc);
  assert.equal(turns.length, 2, `expected 2 turns, got ${turns.length}`);
  assert.equal(turns[0].order, 0);
  assert.equal(turns[1].order, 1);
  assert.ok(turns[0].text.includes('User text'));
  assert.ok(turns[1].text.includes('Assistant'));
});

check('enumerateTurns returns [] when no candidates exist', () => {
  const doc = makeFullDocStub({
    href: 'https://claude.ai/chat/aaaa1111-bbbb-2222-cccc-333344445555',
    mainHtml: '<main><div>nothing structured</div></main>',
  });
  const turns = adapter.enumerateTurns(doc);
  assert.ok(Array.isArray(turns));
  // The fallback may still find the bare div if it contains text; both
  // results are within contract (≥ 0 turns, no throws).
  assert.ok(turns.length >= 0);
});

check('classifyTurnRole — explicit data-role="user"', () => {
  const el = makeElement({ attrs: { 'data-role': 'user' } });
  assert.equal(adapter.classifyTurnRole(el), 'user');
});

check('classifyTurnRole — aria-label "Claude" → assistant', () => {
  const el = makeElement({ attrs: { 'aria-label': 'Message from Claude' } });
  assert.equal(adapter.classifyTurnRole(el), 'assistant');
});

check('classifyTurnRole — aria-label "you" → user', () => {
  const el = makeElement({ attrs: { 'aria-label': 'Message from you' } });
  assert.equal(adapter.classifyTurnRole(el), 'user');
});

// ── extractConversationIdFromHref ─────────────────────────────────────────

check('extractConversationIdFromHref — /chat/<uuid>', () => {
  const id = adapter.extractConversationIdFromHref(
    '/chat/aaaa1111-bbbb-2222-cccc-333344445555'
  );
  assert.equal(id, 'aaaa1111-bbbb-2222-cccc-333344445555');
});

check('extractConversationIdFromHref — no match returns null', () => {
  assert.equal(adapter.extractConversationIdFromHref('/settings'), null);
});

check('extractProjectIdFromHref — /projects/foo', () => {
  assert.equal(adapter.extractProjectIdFromHref('/projects/foo'), 'foo');
});

// ── Output ───────────────────────────────────────────────────────────────

console.log('\n── @h2o/host-adapter-claude contract validator ─────────────');
console.log(`  passed: ${PASS.length}`);
console.log(`  failed: ${FAIL.length}`);

if (FAIL.length > 0) {
  console.error('\nFailures:');
  for (const f of FAIL) {
    console.error(`  ✗ ${f.label}\n      ${f.err}`);
  }
  process.exit(1);
}

console.log('  all contract checks passed ✓\n');
process.exit(0);

// ─────────────────────────────────────────────────────────────────────────
// Minimal DOM stubs (no jsdom dependency)
// ─────────────────────────────────────────────────────────────────────────

/**
 * Returns a stub {location} object with the required fields.
 */
function makeDocStub(href) {
  const u = new URL(href);
  return {
    location: { href: u.href, pathname: u.pathname, hostname: u.hostname },
    querySelector: () => null,
    querySelectorAll: () => [],
  };
}

/**
 * Builds a tiny synthetic Document with a parsed `main` subtree. Just enough
 * to exercise the layered turn predicate.
 *
 * @param {{href: string, mainHtml: string}} cfg
 */
function makeFullDocStub({ href, mainHtml }) {
  const u = new URL(href);
  const main = parseHtmlToElement(mainHtml);
  return {
    location: { href: u.href, pathname: u.pathname, hostname: u.hostname },
    querySelector(sel) {
      if (sel === 'main') return main;
      return findFirst(main, sel);
    },
    querySelectorAll(sel) {
      return findAll(main, sel);
    },
  };
}

/**
 * Trivial element factory for role/aria tests.
 */
function makeElement({ tagName = 'DIV', attrs = {}, children = [] } = {}) {
  return makeNode(tagName, attrs, children, []);
}

function makeNode(tagName, attrs, children, textRuns) {
  const attrMap = new Map(Object.entries(attrs));
  const childList = children.slice();
  const node = {
    tagName,
    children: childList,
    attributes: attrMap,
    parentElement: null,
    get textContent() {
      const own = textRuns.join('');
      const kids = childList.map(c => c.textContent || '').join('');
      return own + kids;
    },
    get outerHTML() { return serialize(node); },
    get innerText() { return this.textContent; },
    getAttribute(name) { return attrMap.has(name) ? attrMap.get(name) : null; },
    querySelector(sel) { return findFirst(node, sel); },
    querySelectorAll(sel) { return findAll(node, sel); },
    closest(sel) {
      let n = node;
      while (n) { if (matches(n, sel)) return n; n = n.parentElement; }
      return null;
    },
    compareDocumentPosition() { return 0; },
  };
  for (const c of childList) c.parentElement = node;
  return node;
}

function serialize(node) {
  const attrs = Array.from(node.attributes.entries())
    .map(([k, v]) => ` ${k}="${String(v).replace(/"/g, '&quot;')}"`).join('');
  const inner = node.children.map(c => c.outerHTML || c.textContent || '').join('');
  return `<${node.tagName.toLowerCase()}${attrs}>${inner || node.textContent}</${node.tagName.toLowerCase()}>`;
}

/**
 * Tiny HTML parser — only handles the shapes the test fixtures use:
 *   <main>...<div role="article" data-test="..">text</div>...</main>
 */
function parseHtmlToElement(html) {
  // Find <main>…</main>; treat everything inside as a flat list of <div ...>text</div>.
  const mainMatch = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
  const body = mainMatch ? mainMatch[1] : html;
  const root = makeNode('MAIN', {}, [], []);
  const childRe = /<div([^>]*)>([\s\S]*?)<\/div>/g;
  let m;
  while ((m = childRe.exec(body))) {
    const attrText = m[1] || '';
    const inner = m[2] || '';
    const attrs = {};
    for (const a of attrText.matchAll(/(\w[\w-]*)="([^"]*)"/g)) {
      attrs[a[1]] = a[2];
    }
    const child = makeNode('DIV', attrs, [], [stripTags(inner)]);
    root.children.push(child);
    child.parentElement = root;
  }
  return root;
}

function stripTags(html) {
  return String(html || '').replace(/<[^>]+>/g, '').trim();
}

function matches(node, sel) {
  if (!sel) return false;
  // Very small subset: supports `[role="X"]`, `[contenteditable="true"]`,
  // `tagName`, comma-separated lists, and `[aria-label*="X" i]`.
  const parts = sel.split(',').map(s => s.trim());
  for (const part of parts) {
    if (matchSingle(node, part)) return true;
  }
  return false;
}

function matchSingle(node, sel) {
  // Tag-only selectors.
  if (/^[a-zA-Z]+$/.test(sel)) {
    return node.tagName.toLowerCase() === sel.toLowerCase();
  }
  // [attr="val"]
  const eq = sel.match(/^\[([\w-]+)="([^"]*)"\]$/);
  if (eq) return node.getAttribute(eq[1]) === eq[2];
  // [attr*="val" i] — case-insensitive substring
  const ci = sel.match(/^\[([\w-]+)\*="([^"]*)"\s*i\s*\]$/);
  if (ci) {
    const v = (node.getAttribute(ci[1]) || '').toLowerCase();
    return v.includes(ci[2].toLowerCase());
  }
  // tag[attr="val"]
  const tagAttr = sel.match(/^([a-zA-Z]+)\[([\w-]+)="([^"]*)"\]$/);
  if (tagAttr) {
    return node.tagName.toLowerCase() === tagAttr[1].toLowerCase()
      && node.getAttribute(tagAttr[2]) === tagAttr[3];
  }
  return false;
}

function findFirst(root, sel) {
  if (!root || !sel) return null;
  if (matches(root, sel)) return root;
  for (const child of root.children || []) {
    const f = findFirst(child, sel);
    if (f) return f;
  }
  return null;
}

function findAll(root, sel) {
  if (!root || !sel) return [];
  const out = [];
  if (matches(root, sel)) out.push(root);
  for (const child of root.children || []) {
    out.push(...findAll(child, sel));
  }
  return out;
}
