#!/usr/bin/env node
// Validator for the shared Studio HTML sanitizer (Phase C C3.1).
//
// Loads src-surfaces-base/studio/platform/html-sanitizer.js into a Node VM
// (surface-neutral; no Tauri, no DOM) and proves the public API, the hardened
// regex behavior (dangerous-tag strip incl. base/meta/form/svg/math, event-
// handler/srcdoc strip, unsafe-URL neutralization), safe-content preservation,
// and that no IO/sync/CAS slipped into the module.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..', '..', '..');
const MODULE_REL = 'src-surfaces-base/studio/platform/html-sanitizer.js';

const PASS = [];
const FAIL = [];
function check(label, fn) {
  try { fn(); PASS.push(label); console.log(`  ✓ ${label}`); }
  catch (e) { const m = e && e.message ? e.message : String(e); FAIL.push({ label, m }); console.log(`  ✗ ${label}`); console.log(`      ${m}`); }
}
function readRepo(rel) { return fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'); }

function loadSanitizer() {
  const context = { console };
  context.globalThis = context;
  const sandbox = vm.createContext(context);
  // No __TAURI__ / window in context: proves the module is surface-neutral
  // (installs without any Tauri/DOM global).
  vm.runInContext(readRepo(MODULE_REL), sandbox, { filename: MODULE_REL });
  const api = sandbox.H2O?.Studio?.html?.sanitize;
  if (!api) throw new Error('H2O.Studio.html.sanitize did not register');
  return api;
}

function main() {
  console.log('── Studio shared HTML sanitizer validator (C3.1) ────────');

  check('module is surface-neutral (no Tauri gate) and has no IO/sync/CAS', () => {
    const src = readRepo(MODULE_REL);
    assert.doesNotMatch(src, /detectTauri|__TAURI__|__TAURI_INTERNALS__/, 'sanitizer must not be Tauri-gated');
    assert.doesNotMatch(src, /plugin:fs|plugin:sql|writeFile|readFile|H2O\.Studio\.sync|webdav|import-bundle/i, 'no IO/sync/CAS allowed');
  });

  const s = loadSanitizer();

  check('exposes the required stable API', () => {
    for (const m of ['sanitizeHtml', 'escapeHtml', 'extractTextFromHtml', 'sanitizeUrl', 'isSafeUrl', 'diagnose']) {
      assert.equal(typeof s[m], 'function', `missing ${m}`);
    }
  });

  check('strips all dangerous tags (incl. base/meta/form/svg/math) but keeps siblings', () => {
    const tags = ['script', 'style', 'iframe', 'object', 'embed', 'base', 'meta', 'form', 'svg', 'math'];
    for (const tag of tags) {
      const out = s.sanitizeHtml(`<p>keep</p><${tag}>danger</${tag}>`);
      assert.doesNotMatch(out, new RegExp('<\\s*/?\\s*' + tag + '\\b', 'i'), `<${tag}> not stripped: ${out}`);
      assert.match(out, /<p>keep<\/p>/, `safe sibling dropped for ${tag}: ${out}`);
    }
  });

  check('strips inline event handlers and srcdoc', () => {
    assert.doesNotMatch(s.sanitizeHtml('<div onclick="evil()">x</div>'), /onclick/i);
    assert.doesNotMatch(s.sanitizeHtml('<div onmouseover="evil()">x</div>'), /onmouseover/i);
    assert.doesNotMatch(s.sanitizeHtml('<div srcdoc="evil">x</div>'), /srcdoc/i);
  });

  check('neutralizes unsafe URL schemes to "#"', () => {
    for (const bad of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'vbscript:x', 'data:text/html,<script>']) {
      const out = s.sanitizeHtml(`<a href="${bad}">x</a>`);
      assert.doesNotMatch(out, /javascript:|vbscript:|data:text\/html/i, `unsafe url survived: ${out}`);
      assert.match(out, /href="#"/, `expected neutralized href: ${out}`);
    }
  });

  check('preserves safe links (http/https/mailto)', () => {
    assert.match(s.sanitizeHtml('<a href="https://example.com">x</a>'), /href="https:\/\/example\.com"/);
    assert.match(s.sanitizeHtml('<a href="http://example.com">x</a>'), /href="http:\/\/example\.com"/);
    assert.match(s.sanitizeHtml('<a href="mailto:a@b.com">x</a>'), /href="mailto:a@b\.com"/);
  });

  check('preserves safe ChatGPT-like block/inline/table/code content', () => {
    const input = '<h2>T</h2><p>Hello <strong>bold</strong> <em>it</em> <span class="katex">x</span></p>'
      + '<ul><li>a</li></ul><blockquote>q</blockquote>'
      + '<table><thead><tr><th>h</th></tr></thead><tbody><tr><td>c</td></tr></tbody></table>'
      + '<pre><code>code()</code></pre>';
    const out = s.sanitizeHtml(input);
    for (const frag of ['<h2>', '<strong>bold</strong>', '<em>it</em>', '<span class="katex">', '<ul><li>a</li></ul>', '<blockquote>q</blockquote>', '<table>', '<th>h</th>', '<td>c</td>', '<pre><code>code()</code></pre>']) {
      assert.ok(out.includes(frag), `lost safe fragment ${frag}: ${out}`);
    }
  });

  check('escapeHtml escapes the five HTML metacharacters', () => {
    assert.equal(s.escapeHtml(`<a href="x" data='y'>&`), '&lt;a href=&quot;x&quot; data=&#39;y&#39;&gt;&amp;');
  });

  check('extractTextFromHtml yields readable text, drops tags, decodes entities, removes scripts', () => {
    assert.equal(s.extractTextFromHtml('<p>Hello <strong>world</strong></p>'), 'Hello world');
    assert.match(s.extractTextFromHtml('<p>a&amp;b&nbsp;c</p>'), /a&b c/);
    assert.doesNotMatch(s.extractTextFromHtml('<p>safe</p><script>alert(1)</script>'), /alert/);
  });

  check('sanitizeUrl / isSafeUrl classify correctly', () => {
    assert.equal(s.isSafeUrl('https://example.com'), true);
    assert.equal(s.isSafeUrl('javascript:alert(1)'), false);
    assert.equal(s.sanitizeUrl('https://example.com'), 'https://example.com');
    assert.equal(s.sanitizeUrl('javascript:alert(1)'), '#');
  });

  check('diagnose reports interim regex+CSP stance and extended strip list', () => {
    const d = s.diagnose();
    assert.equal(d.installed, true);
    assert.equal(d.domSanitizer, false);
    assert.match(d.mode, /regex/);
    for (const t of ['script', 'base', 'meta', 'form', 'svg', 'math']) {
      assert.ok([...d.strippedTags].includes(t), `diagnose strippedTags missing ${t}`);
    }
  });

  console.log('');
  console.log(`PASS ${PASS.length}`);
  if (FAIL.length) {
    console.log(`FAIL ${FAIL.length}`);
    for (const f of FAIL) console.log(`- ${f.label}: ${f.m}`);
    process.exitCode = 1;
  }
}

main();
