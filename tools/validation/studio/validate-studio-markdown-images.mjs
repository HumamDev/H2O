#!/usr/bin/env node
// Focused fidelity validator for Studio canonical-renderer Markdown and images.
//
// Loads the real Renderer Markdown helpers into a node:vm sandbox. Pattern
// matches the existing string + AST-light validator style in
// tools/validation/studio/ (no jsdom, no bundler).
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
//   9. Representative headings, quotes, lists, code, tables, Unicode, empty
//      content, and multiline paragraphs retain the supported base fidelity.
//  10. Empty link labels never create unnamed keyboard focus targets.
//  11. Known Markdown table headers retain explicit column-header semantics.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..', '..', '..');
const RENDERER_JS_REL = 'src-surfaces-base/studio/renderer/chat-renderer.studio.js';
const RENDERER_JS_ABS = path.join(REPO_ROOT, RENDERER_JS_REL);

// Extract function source by name. These Renderer helpers contain balanced
// braces in strings/regex/template literals, so a naive brace counter yields
// the correct body. A future incompatible edit surfaces as a VM SyntaxError.
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

const source = fs.readFileSync(RENDERER_JS_ABS, 'utf8');
const helperNames = [
  'esc',
  'normalizeSafeMarkdownHref',
  'normalizeSafeImageSrc',
  'normalizeImageAlt',
  'renderInlineMarkdown',
  'countMarkdownIndent',
  'parseMarkdownListLine',
  'renderMarkdownList',
  'splitMarkdownTableRow',
  'parseMarkdownTableAlign',
  'parseMarkdownTableStart',
  'renderMarkdownTable',
  'renderTextAsChatGPTBlocks',
];
const helperSource = helperNames.map((name) => extractFunction(source, name)).join('\n');

// Node's global URL is already a WHATWG URL.
const sandbox = { URL };
vm.createContext(sandbox);
vm.runInContext(helperSource, sandbox);

const render = (input) => vm.runInContext(`renderInlineMarkdown(${JSON.stringify(input)})`, sandbox);
const renderBlocks = (input) => vm.runInContext(`renderTextAsChatGPTBlocks(${JSON.stringify(input)})`, sandbox);

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

// ── 15. mailto remains valid for links, not image sources ──────────────────
check('mailto: URL is rejected as an image source', () => {
  const out = render('![mailto](mailto:user@example.com)');
  assert.ok(!out.includes('<img'), `unexpected <img> in: ${out}`);
  assert.ok(!/<script|javascript:/i.test(out), `unsafe leak: ${out}`);
});

// ── 16. Empty alt renders as empty alt attribute (valid HTML) ───────────────
check('empty alt is allowed and stays empty', () => {
  const out = render('![](https://e.com/x.png)');
  assert.ok(out.includes('alt=""'));
  assert.ok(out.includes('<img'));
  assert.equal(vm.runInContext('normalizeImageAlt(null)', sandbox), '',
    'missing captured alt text must not be replaced with a fabricated description');
});

// ── 17. Empty content retains the stable base message body ─────────────────
check('empty content renders a stable empty paragraph', () => {
  assert.equal(renderBlocks(''), '<p></p>');
});

// ── 18. Unicode, emoji, and mixed RTL text survive normal text handling ────
check('Unicode, emoji, and mixed RTL content are preserved', () => {
  const input = 'مرحبا 😀 שלום — café';
  const out = renderBlocks(input);
  assert.ok(out.includes(input), `Unicode content changed: ${out}`);
});

// ── 19. Heading/rule/quote block structure ─────────────────────────────────
check('headings, horizontal rule, and blockquote render structurally', () => {
  const out = renderBlocks('# H1\n\n## H2\n\n### H3\n\n---\n\n> quoted **bold**');
  assert.ok(out.includes('<h1>H1</h1>'));
  assert.ok(out.includes('<h2>H2</h2>'));
  assert.ok(out.includes('<h3>H3</h3>'));
  assert.ok(out.includes('<hr>'));
  assert.ok(out.includes('<blockquote><p>quoted <strong>bold</strong></p></blockquote>'));
});

// ── 20. Ordered/unordered nested lists ─────────────────────────────────────
check('ordered and unordered nested lists retain hierarchy', () => {
  const out = renderBlocks('- parent\n  1. first\n  2. second\n- sibling');
  assert.match(out, /^<ul><li>parent<ol><li>first<\/li><li>second<\/li><\/ol><\/li><li>sibling<\/li><\/ul>$/);
});

// ── 21. Supported inline formatting combinations ───────────────────────────
check('bold, italic, code, and links compose inline', () => {
  const out = renderBlocks('**bold** and *italic* with `a < b` and [link](https://example.com)');
  assert.ok(out.includes('<strong>bold</strong>'));
  assert.ok(out.includes('<em>italic</em>'));
  assert.ok(out.includes('<code>a &lt; b</code>'));
  assert.ok(out.includes('<a href="https://example.com"'));
});

check('empty link labels stay literal instead of creating unnamed links', () => {
  const out = renderBlocks('[](https://example.com) and [   ](https://example.org)');
  assert.ok(!out.includes('<a '), `unexpected unnamed link in: ${out}`);
  assert.ok(out.includes('https://example.com'));
  assert.ok(out.includes('https://example.org'));
});

// ── 22. Fenced code preserves whitespace and escapes executable text ───────
check('fenced code preserves whitespace, language, and escaped HTML text', () => {
  const out = renderBlocks('```js<script>\n  const x = "<script>&";  \nlong_line_without_breaks_1234567890\n```');
  assert.ok(out.includes('<div class="wbCodeLang">js&lt;script&gt;</div>'));
  assert.ok(out.includes('  const x = &quot;&lt;script&gt;&amp;&quot;;  '));
  assert.ok(out.includes('long_line_without_breaks_1234567890'));
  assert.ok(!out.includes('<script>'));
});

// ── 23. Tables retain columns/rows and escape special content ──────────────
check('tables render headers, body rows, alignment, and escaped cells', () => {
  const out = renderBlocks('| Name | Value |\n| --- | ---: |\n| a\\|b | <script>& |');
  assert.ok(out.includes('<table><thead><tr>'));
  assert.ok(out.includes('<th scope="col">Name</th>'));
  assert.ok(out.includes('<th scope="col" style="text-align:right">Value</th>'));
  assert.ok(out.includes('<td>a|b</td>'));
  assert.ok(out.includes('<td style="text-align:right">&lt;script&gt;&amp;</td>'));
  assert.ok(!out.includes('<script>'));
});

// ── 24. Multiline paragraphs remain deterministic ─────────────────────────
check('multiline paragraphs retain supported paragraph boundaries', () => {
  assert.equal(renderBlocks('first line\nsecond line\n\nthird'), '<p>first line second line</p><p>third</p>');
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
