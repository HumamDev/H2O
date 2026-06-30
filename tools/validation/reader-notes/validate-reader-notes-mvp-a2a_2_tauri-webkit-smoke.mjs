#!/usr/bin/env node
// Generator + static validator for Studio Reader & Notes MVP-A2a.2c.1.
//
// This does not execute Tauri/WebKit. It creates a pasteable DevTools console
// harness that embeds the real A2a.1/A2a.2a resolver sources, rewrites only the
// IIFE footer so those modules install into a private sandbox object, and checks
// that the generated harness preserves the no-runtime-wiring boundary.

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..', '..', '..');

const CORE_REL = 'src-surfaces-base/studio/reader-notes/anchor-resolver.studio.js';
const DOM_REL = 'src-surfaces-base/studio/reader-notes/anchor-resolver-dom.studio.js';
const STUDIO_HTML_REL = 'src-surfaces-base/studio/studio.html';
const PACK_REL = 'tools/product/studio/pack-studio.mjs';
const EVIDENCE_REL = 'release-evidence/2026-06-30/reader-notes-a2a2c-tauri-webkit-smoke.md';
const OUTPUT_PATH = '/private/tmp/h2o-reader-notes-a2a2c-tauri-webkit-console-smoke.js';
const FOOTER = "})(typeof globalThis !== 'undefined' ? globalThis : this);";
const FOOTER_REWRITE = '})(sandbox);';

const FORBIDDEN_HARNESS_PATTERNS = [
  { label: 'eval', re: /\beval\s*\(/ },
  { label: 'new Function', re: /\bnew\s+Function\b/ },
  { label: 'localStorage', re: /\blocalStorage\b/ },
  { label: 'sessionStorage', re: /\bsessionStorage\b/ },
  { label: 'indexedDB', re: /\bindexedDB\b/ },
  { label: 'chrome.storage', re: /\bchrome\s*\.\s*storage\b/ },
  { label: 'direct assignment to window.H2O', re: /window\s*\.\s*H2O\s*=/ },
  { label: 'document.createRange patch', re: /document\s*\.\s*createRange\s*=/ },
  { label: 'appendChild', re: /\bappendChild\s*\(/ },
];

const FORBIDDEN_UNWIRED_TOKENS = [
  'anchor-resolver.studio.js',
  'anchor-resolver-dom.studio.js',
];

function read(rel) {
  const full = path.join(REPO_ROOT, rel);
  assert.ok(fs.existsSync(full), `${rel} must exist`);
  return fs.readFileSync(full, 'utf8');
}

function rewriteFooter(source, rel) {
  const index = source.lastIndexOf(FOOTER);
  assert.ok(index >= 0, `${rel} must contain expected footer`);
  assert.equal(source.indexOf(FOOTER), index, `${rel} must contain expected footer exactly once`);
  return `${source.slice(0, index)}${FOOTER_REWRITE}${source.slice(index + FOOTER.length)}`;
}

function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function assertNoConflictMarkers(rel, text) {
  assert.ok(!/^<<<<<<< /m.test(text), `${rel} contains conflict marker`);
  assert.ok(!/^=======/m.test(text), `${rel} contains conflict marker`);
  assert.ok(!/^>>>>>>> /m.test(text), `${rel} contains conflict marker`);
}

function buildHarness(coreSource, domSource) {
  const core = rewriteFooter(coreSource, CORE_REL);
  const dom = rewriteFooter(domSource, DOM_REL);

  return `(function h2oReaderNotesA2a2cTauriWebKitSmoke() {
  'use strict';

  const SCHEMA = 'h2o.readerNotes.a2a2c.tauriWebKitSmoke.result.v1';
  const FLAG_KEY = 'studio.readerNotes.anchorResolver.enabled';
  const flags = Object.create(null);
  const flagWrites = [];
  const assertions = [];
  const failures = [];
  const notes = [
    'A2a.2c.1 manual Tauri/WebKit console harness.',
    'Resolver sources install into a private sandbox object, not the live Studio namespace.',
    'Detached roots are used; display:none checks prove DOM text-node inclusion, not rendered visibility.',
  ];

  const liveDescriptorBefore = Object.getOwnPropertyDescriptor(window, 'H2O');
  const liveReaderKeysBefore = (function snapshotReaderKeys() {
    try {
      const h2o = liveDescriptorBefore && liveDescriptorBefore.value;
      const rn = h2o && h2o.Studio && h2o.Studio.readerNotes;
      return rn && typeof rn === 'object' ? Object.keys(rn).sort() : null;
    } catch (_) {
      return null;
    }
  }());
  const bodyChildCountBefore = document.body ? document.body.childNodes.length : null;

  const sandbox = {
    H2O: {
      flags: {
        get(key, fallback) {
          return Object.prototype.hasOwnProperty.call(flags, key) ? flags[key] : fallback;
        },
        set(key, value) {
          flagWrites.push({ key: String(key), value: value });
        },
      },
      Studio: {
        readerNotes: {},
      },
    },
  };

  function add(name, ok, details) {
    const entry = { name: String(name), ok: ok === true };
    if (details !== undefined) entry.details = details;
    assertions.push(entry);
    if (!entry.ok) failures.push(entry);
  }
  function setFlag(value) {
    flags[FLAG_KEY] = value;
  }
  function collectTextNodes(root) {
    const nodes = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (node.nodeValue.length > 0) nodes.push(node);
    }
    return nodes;
  }
  function snapshot(root) {
    return {
      textContent: root.textContent,
      textNodeCount: collectTextNodes(root).length,
      markCount: root.querySelectorAll('mark,[data-overlay-inline]').length,
      html: root.innerHTML,
    };
  }
  function sameSnapshot(a, b) {
    return a.textContent === b.textContent
      && a.textNodeCount === b.textNodeCount
      && a.markCount === b.markCount
      && a.html === b.html;
  }
  function makeDetachedRoot() {
    const root = document.createElement('section');
    root.innerHTML = 'alpha <span style="display:none">hidden</span> <span>beta</span> gamma';
    return root;
  }
  function highlight(exact) {
    return { kind: 'highlight', raw: { anchors: { textQuote: { exact } } } };
  }
  function descriptorSame(before, after) {
    if (!before && !after) return true;
    if (!before || !after) return false;
    return before.value === after.value
      && before.get === after.get
      && before.set === after.set
      && before.writable === after.writable
      && before.enumerable === after.enumerable
      && before.configurable === after.configurable;
  }
  function readerKeysSame(before) {
    try {
      const h2o = window.H2O;
      const rn = h2o && h2o.Studio && h2o.Studio.readerNotes;
      const after = rn && typeof rn === 'object' ? Object.keys(rn).sort() : null;
      return JSON.stringify(before) === JSON.stringify(after);
    } catch (_) {
      return before === null;
    }
  }
  function plainTamper(flat, start, end) {
    return {
      plain: flat.plain.slice(0, start) + 'X'.repeat(end - start) + flat.plain.slice(end),
      map: flat.map,
      length: flat.length,
      root: flat.root,
    };
  }

  try {
    // A2a.1 core source installs into sandbox.H2O only.
${core.split('\n').map((line) => `    ${line}`).join('\n')}

    // A2a.2a DOM wrapper source installs into sandbox.H2O only.
${dom.split('\n').map((line) => `    ${line}`).join('\n')}

    const coreApi = sandbox.H2O.Studio.readerNotes.anchorResolver;
    const domApi = sandbox.H2O.Studio.readerNotes.anchorResolverDom;
    add('A2a.1 core installs into private sandbox', !!coreApi && coreApi.__installed === true);
    add('A2a.2a DOM wrapper installs into private sandbox', !!domApi && domApi.__installed === true);

    const disabledRoot = makeDetachedRoot();
    setFlag(false);
    const disabled = domApi.resolveHighlight(highlight('beta'), disabledRoot);
    add('disabled mock flag returns orphaned null range', disabled.status === 'orphaned' && disabled.range === null && disabled.reason === 'disabled', disabled);

    setFlag(true);
    const root = makeDetachedRoot();
    const flat = domApi.flattenRoot(root);
    add('enabled mock flag allows resolution', domApi.isEnabled() === true);
    add('flattenRoot includes all non-empty text nodes', flat.map.length === 5, { nodes: flat.map.map((seg) => seg.node.nodeValue) });
    add('whitespace-only text nodes are included', flat.map.some((seg) => seg.node.nodeValue === ' '));
    add('display none text is included', flat.plain.includes('hidden'));
    add('exact text is preserved', flat.plain === 'alpha hidden beta gamma', { plain: flat.plain });
    add('no separators are inserted', flat.plain === collectTextNodes(root).map((node) => node.nodeValue).join(''));

    const beforeSingle = snapshot(root);
    const single = domApi.resolveHighlight(highlight('hidden'), root);
    const afterSingle = snapshot(root);
    add('Range.toString works inside one text node', single.status === 'anchored' && !!single.range && single.range.toString() === 'hidden', {
      status: single.status,
      span: single.span,
      text: single.range ? single.range.toString() : null,
    });
    add('single-node result returns span beside range', !!single.span && !!single.range);
    add('single-node resolution does not mutate detached DOM', sameSnapshot(beforeSingle, afterSingle), { beforeSingle, afterSingle });

    const beforeCross = snapshot(root);
    const cross = domApi.resolveHighlight(highlight('hidden beta'), root);
    const afterCross = snapshot(root);
    add('Range.toString works across multiple text nodes', cross.status === 'anchored' && !!cross.range && cross.range.toString() === 'hidden beta', {
      status: cross.status,
      span: cross.span,
      text: cross.range ? cross.range.toString() : null,
    });
    add('cross-node result returns span beside range', !!cross.span && !!cross.range);
    add('cross-node resolution does not mutate detached DOM', sameSnapshot(beforeCross, afterCross), { beforeCross, afterCross });

    const tamperedFlat = plainTamper(flat, 6, 12);
    const mismatchRange = domApi.spanToRange({ start: 6, end: 12 }, tamperedFlat);
    add('content mismatch downgrades range materialization safely', mismatchRange === null, { status: 'orphaned', range: null, reason: 'range-unavailable' });

    const xpath = domApi.resolveHighlight({ kind: 'highlight', raw: { anchors: { xpath: { startXPath: './/span' } } } }, root);
    add('XPath-only anchor remains deferred and unresolved', xpath.status === 'orphaned' && xpath.range === null && xpath.diagnostics && xpath.diagnostics.xpathDeferred === true, xpath);
    add('mock flag recorder saw no writes', flagWrites.length === 0, { flagWrites });

    const liveDescriptorAfter = Object.getOwnPropertyDescriptor(window, 'H2O');
    add('live uppercase Studio namespace descriptor unchanged', descriptorSame(liveDescriptorBefore, liveDescriptorAfter));
    add('live readerNotes keys unchanged if present', readerKeysSame(liveReaderKeysBefore), { before: liveReaderKeysBefore });
    add('live document body child count unchanged', bodyChildCountBefore === (document.body ? document.body.childNodes.length : null), {
      before: bodyChildCountBefore,
      after: document.body ? document.body.childNodes.length : null,
    });
  } catch (error) {
    add('harness did not throw', false, { error: String(error && (error.stack || error.message) || error) });
  }

  const result = {
    schema: SCHEMA,
    ok: failures.length === 0,
    status: failures.length === 0 ? 'tauri-webkit-smoke-passed' : 'tauri-webkit-smoke-failed',
    assertionCount: assertions.length,
    failures,
    assertions,
    userAgent: navigator.userAgent,
    timestamp: new Date().toISOString(),
    notes,
  };

  window.h2o = window.h2o || {};
  window.h2o.readerNotes = window.h2o.readerNotes || {};
  window.h2o.readerNotes.a2a2c = window.h2o.readerNotes.a2a2c || {};
  window.h2o.readerNotes.a2a2c.tauriWebKitSmoke = { result };
  console.log(JSON.stringify(result, null, 2));
  return result;
}());`;
}

function validateGeneratedHarness(harness) {
  for (const item of FORBIDDEN_HARNESS_PATTERNS) {
    assert.ok(!item.re.test(harness), `generated harness must not contain ${item.label}`);
  }
  assert.ok(harness.includes(FOOTER_REWRITE), 'generated harness must contain sandbox footer rewrite');
  assert.ok(!harness.includes(FOOTER), 'generated harness must not contain original global footer');
  assert.ok(harness.includes('const sandbox = {'), 'generated harness must create private sandbox');
  assert.ok(harness.includes('sandbox.H2O.Studio.readerNotes.anchorResolver'), 'generated harness must inspect sandbox core API');
  assert.ok(harness.includes('sandbox.H2O.Studio.readerNotes.anchorResolverDom'), 'generated harness must inspect sandbox DOM API');
  assert.ok(harness.includes('makeDetachedRoot'), 'generated harness must use detached root helper');
  assert.ok(harness.includes('plainTamper'), 'generated harness must test content-equality mismatch without patching Range APIs');
  assert.ok(harness.includes('window.h2o.readerNotes.a2a2c.tauriWebKitSmoke'), 'generated harness must expose lowercase capture result');
}

function validateBoundaryFiles() {
  const html = read(STUDIO_HTML_REL);
  const pack = read(PACK_REL);
  for (const token of FORBIDDEN_UNWIRED_TOKENS) {
    assert.ok(!html.includes(token), `studio.html must not load ${token}`);
    assert.ok(!pack.includes(token), `pack-studio.mjs must not include ${token}`);
  }
  assertNoConflictMarkers(STUDIO_HTML_REL, html);
  assertNoConflictMarkers(PACK_REL, pack);
}

function main() {
  const coreSource = read(CORE_REL);
  const domSource = read(DOM_REL);
  const evidence = read(EVIDENCE_REL);

  assertNoConflictMarkers(CORE_REL, coreSource);
  assertNoConflictMarkers(DOM_REL, domSource);
  assert.ok(evidence.includes('WebKit gate status: OPEN'), 'evidence doc must keep gate open');
  assert.ok(evidence.includes('does not claim a WebKit PASS'), 'evidence doc must not claim WebKit proof');
  assert.ok(evidence.includes('npm run tauri:dev'), 'evidence doc must include operator launch command');
  assert.ok(evidence.includes('h2o.readerNotes.a2a2c.tauriWebKitSmoke.result.v1'), 'evidence doc must include expected result schema');

  const harness = buildHarness(coreSource, domSource);
  validateGeneratedHarness(harness);
  validateBoundaryFiles();

  try {
    fs.writeFileSync(OUTPUT_PATH, harness, 'utf8');
  } catch (error) {
    throw new Error(`failed to write ${OUTPUT_PATH}: ${String(error && error.message || error)}`);
  }

  console.log(JSON.stringify({
    schema: 'h2o.readerNotes.a2a2c.tauriWebKitSmoke.generator.v1',
    ok: true,
    status: 'tauri-webkit-console-harness-generated',
    outputPath: OUTPUT_PATH,
    sha256: sha256(harness),
    bytes: Buffer.byteLength(harness, 'utf8'),
    operatorSteps: [
      'cd /Users/hobayda/H2OCode/repos/h2o-platforms/cockpit-pro/h2o-cp-source/apps/studio/desktop',
      'npm run tauri:dev',
      'Open Tauri DevTools.',
      `Paste the contents of ${OUTPUT_PATH} into the Console.`,
      'Capture the returned JSON in release-evidence/2026-06-30/reader-notes-a2a2c-tauri-webkit-smoke.md.',
    ],
    boundaries: {
      noRuntimeWiring: true,
      privateSandbox: true,
      noEval: true,
      noNewFunction: true,
      noStorage: true,
      noXPathImplementation: true,
      noA1Integration: true,
      noTauriSourceChange: true,
    },
  }, null, 2));
}

main();
