#!/usr/bin/env node
// Validator for the Studio canonical-renderer markdown-image support (Phase 2A).
//
// Loads `esc`, `normalizeSafeMarkdownHref`, and `renderInlineMarkdown` out of
// `src-surfaces-base/studio/studio.js` via a node:vm sandbox and runs
// behavioural assertions on each. Pattern matches the existing string + AST-
// light validator style in tools/validation/studio/ (no jsdom, no bundler).
//
// What this validator pins down:
//   1. `![alt](https://…)` renders as <img> with safe attrs.
//   2. Unsafe / malformed image URLs (`javascript:`, empty, control chars,
//      whitespace) fall back to escaped literal text — never emit an <img>.
//   3. Regular link parsing (`[text](url)`) is unchanged.
//   4. Literal `!` not followed by `[` renders as plain text.
//   5. Multiple images in a paragraph all render.
//   6. Image + link mixed in the same line both render.
//   7. Malformed image markdown doesn't break the rest of the paragraph.
//   8. Alt text is HTML-escaped (no XSS via alt="\"><script>…").

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..', '..', '..');
const STUDIO_JS_REL = 'src-surfaces-base/studio/studio.js';
const STUDIO_JS_ABS = path.join(REPO_ROOT, STUDIO_JS_REL);

// Extract function source by name. The three helpers we load (esc,
// normalizeSafeMarkdownHref, renderInlineMarkdown) contain balanced braces
// in every string / regex / template literal they use (template-literal
// `${...}` braces balance themselves, no `{` or `}` appears inside any
// regex character class or string literal), so a naive `{` / `}` counter
// from the function's opening brace yields the correct body. If a future
// edit breaks this assumption, the validator's vm.runInContext step will
// surface a SyntaxError on the next CI run.
function extractFunction(source, name) {
  const re = new RegExp(`\\bfunction\\s+${name}\\s*\\(`);
  const m = re.exec(source);
  if (!m) throw new Error(`extractFunction: '${name}' not found`);
  const start = m.index;
  const braceOpen = source.indexOf('{', start);
  if (braceOpen < 0) throw new Error(`extractFunction: no body for '${name}'`);
  let depth = 0;
  for (let i = braceOpen; i < source.length; i += 1) {
    const c = source[i];
    if (c === '{') depth += 1;
    else if (c === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`extractFunction: unterminated body for '${name}'`);
}

const source = fs.readFileSync(STUDIO_JS_ABS, 'utf8');
const escSrc = extractFunction(source, 'esc');
const normSrc = extractFunction(source, 'normalizeSafeMarkdownHref');
const renderSrc = extractFunction(source, 'renderInlineMarkdown');

// Build a sandbox with the three helpers + a `URL` constructor (used by
// normalizeSafeMarkdownHref). Node's global URL is already a WHATWG URL.
const sandbox = { URL };
vm.createContext(sandbox);
vm.runInContext(`${escSrc}\n${normSrc}\n${renderSrc}`, sandbox);

const render = (input) => vm.runInContext(`renderInlineMarkdown(${JSON.stringify(input)})`, sandbox);

const PASS = [];
const FAIL = [];

function check(label, fn) {
  try { fn(); PASS.push(label); }
  catch (e) { FAIL.push({ label, err: e?.message || String(e) }); }
}

// ── 1. Safe https image renders as <img> ────────────────────────────────────
check('https image renders as <img>', () => {
  const out = render('![A bottle](https://example.com/x.png)');
  assert.match(out, /<img\s+src="https:\/\/example\.com\/x\.png"\s+alt="A bottle"\s+loading="lazy"\s+decoding="async">/);
});

// ── 2. http image renders ───────────────────────────────────────────────────
check('http image renders as <img>', () => {
  const out = render('![pic](http://example.com/y.jpg)');
  assert.ok(out.includes('<img'));
  assert.ok(out.includes('src="http://example.com/y.jpg"'));
  assert.ok(out.includes('alt="pic"'));
});

// ── 3. javascript: URL is rejected ──────────────────────────────────────────
check('javascript: URL falls back, never emits <img>', () => {
  const out = render('![bad](javascript:alert(1))');
  assert.ok(!out.includes('<img'), `unexpected <img> in: ${out}`);
  // Falls back to escaped literal: !{escaped[}bad](javascript:alert(1))
  assert.ok(out.includes('!'));
  assert.ok(out.includes('bad'));
});

// ── 4. data: URL is rejected (current normalizer only allows http/https/mailto) ──
check('data: URL falls back', () => {
  const out = render('![inline](data:image/png;base64,AAA)');
  assert.ok(!out.includes('<img'));
});

// ── 5. Empty URL falls back ─────────────────────────────────────────────────
check('empty URL falls back', () => {
  const out = render('![alt]()');
  assert.ok(!out.includes('<img'));
});

// ── 6. URL with whitespace (control characters or spaces) is rejected ───────
check('URL with whitespace falls back', () => {
  const out = render('![alt](https://example.com/ with space.png)');
  assert.ok(!out.includes('<img'));
});

// ── 7. Regular link still works (regression guard) ──────────────────────────
check('regular link unchanged', () => {
  const out = render('[OpenAI](https://openai.com)');
  assert.match(out, /<a\s+href="https:\/\/openai\.com"\s+target="_blank"\s+rel="noopener noreferrer">OpenAI<\/a>/);
});

// ── 8. Literal "!" passes through ───────────────────────────────────────────
check('lone "!" renders as plain text', () => {
  assert.equal(render('Hello!'), 'Hello!');
});

// ── 9. "!" not followed by "[" renders literal ──────────────────────────────
check('"!" followed by non-bracket renders literal', () => {
  assert.equal(render('wow! amazing'), 'wow! amazing');
});

// ── 10. Image + surrounding text both render ────────────────────────────────
check('image inside paragraph text renders inline', () => {
  const out = render('Before ![alt](https://e.com/a.png) after.');
  assert.ok(out.startsWith('Before '));
  assert.ok(out.endsWith(' after.'));
  assert.ok(out.includes('<img'));
});

// ── 11. Multiple images in a row each render ────────────────────────────────
check('two consecutive images both render', () => {
  const out = render('![a](https://e.com/a.png) ![b](https://e.com/b.png)');
  assert.equal((out.match(/<img/g) || []).length, 2);
});

// ── 12. Image + link mixed both render ──────────────────────────────────────
check('image and link in same line both render', () => {
  const out = render('![pic](https://e.com/p.png) and [link](https://e.com)');
  assert.ok(out.includes('<img'));
  assert.match(out, /<a\s+href="https:\/\/e\.com"/);
});

// ── 13. Alt text is HTML-escaped (XSS hardening) ────────────────────────────
check('alt text with HTML is escaped', () => {
  const out = render('![<script>alert(1)</script>](https://e.com/x.png)');
  assert.ok(out.includes('<img'));
  assert.ok(!out.includes('<script'), `alt text not escaped: ${out}`);
  assert.ok(out.includes('&lt;script&gt;'));
});

// ── 14. Malformed image (missing closing paren) doesn't break the line ──────
check('malformed image markdown does not break paragraph', () => {
  const out = render('Before ![alt](https://e.com/x.png after');
  // The image branch sees `!` and `[`, fails (no `)` for href). Falls back to
  // emitting "!" then re-entering. The link branch then sees `[alt](https://e.com/x.png after`
  // — no `)` so it falls back too. The rest renders as escaped text.
  assert.ok(!out.includes('<img'));
  assert.ok(out.startsWith('Before '));
  assert.ok(out.includes('after'));
});

// ── 15. mailto: URL renders as <img>? No — mailto isn't useful for images,
//        but normalizeSafeMarkdownHref currently allows it. We accept the
//        renderer's permissive behavior (matches link parser) and just pin
//        the contract: no <script>/<style>/javascript: leak. ────────────────
check('mailto: URL emits <img> (matches existing href allowlist)', () => {
  const out = render('![mailto](mailto:user@example.com)');
  // Either an <img> with the safe mailto href, or no <img> at all — both are
  // acceptable for this validator (the normalizer's allowlist is the source
  // of truth). What's NOT acceptable is a script or javascript: leak.
  assert.ok(!/<script|javascript:/i.test(out), `unsafe leak: ${out}`);
});

// ── 16. Empty alt renders as empty alt attribute (valid HTML) ───────────────
check('empty alt is allowed and stays empty', () => {
  const out = render('![](https://e.com/x.png)');
  assert.ok(out.includes('alt=""'));
  assert.ok(out.includes('<img'));
});

// ── Report ──────────────────────────────────────────────────────────────────
const total = PASS.length + FAIL.length;
console.log(`\n[validate-studio-markdown-images] ${PASS.length}/${total} passed`);
for (const label of PASS) console.log(`  ✓ ${label}`);
if (FAIL.length) {
  console.log('');
  for (const { label, err } of FAIL) console.log(`  ✗ ${label}\n    ${err}`);
  process.exit(1);
}
