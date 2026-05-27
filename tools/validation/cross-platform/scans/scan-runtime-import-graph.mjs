/**
 * F10.2.2 / CP-10 — suspicious imports of @h2o/cross-platform-envelope
 * from runtime apply/write paths.
 *
 * Hard-fail CP-10.1: any file outside tools/validation/ that imports
 * `@h2o/cross-platform-envelope`.
 *
 * Until F10.3 explicitly authorizes bridge importers, runtime files
 * have NO legitimate reason to import the helper. The helper is for
 * validation tooling only.
 */

import {
  SCOPE_RUNTIME,
  findInlineAllow,
  isAllowedByList,
  loadAllowlist,
  makeFinding,
  makeReport,
  readRepoFile,
  walkFiles,
} from './util.mjs';

const SCAN_NAME = 'scan-runtime-import-graph';
const RULE = 'CP-10.1';

const STATIC_IMPORT_RE = /\bfrom\s+['"]@h2o\/cross-platform-envelope['"]/;
const REQUIRE_RE = /\brequire\s*\(\s*['"]@h2o\/cross-platform-envelope['"]\s*\)/;
const DYNAMIC_IMPORT_RE = /\bimport\s*\(\s*['"]@h2o\/cross-platform-envelope['"]\s*\)/;

export function scanText(content, repoRel, allowlist) {
  const findings = [];
  if (isAllowedByList(RULE, repoRel, allowlist)) return findings;
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const matches =
      STATIC_IMPORT_RE.test(line) || REQUIRE_RE.test(line) || DYNAMIC_IMPORT_RE.test(line);
    if (!matches) continue;
    if (findInlineAllow(lines, i + 1, RULE)) continue;
    findings.push(
      makeFinding({
        rule: RULE,
        path: repoRel,
        line: i + 1,
        message: `runtime import of @h2o/cross-platform-envelope (not authorized until F10.3 bridge phase)`,
      }),
    );
  }
  return findings;
}

export function scan({ allowlist = loadAllowlist() } = {}) {
  const start = Date.now();
  const files = walkFiles(SCOPE_RUNTIME);
  const findings = [];
  for (const repoRel of files) {
    const content = readRepoFile(repoRel);
    if (!content.includes('@h2o/cross-platform-envelope')) continue;
    findings.push(...scanText(content, repoRel, allowlist));
  }
  return makeReport({
    scanName: SCAN_NAME,
    ruleIds: [RULE],
    findings,
    warnings: [],
    durationMs: Date.now() - start,
  });
}

// ── self-test ──────────────────────────────────────────────────────────

const CLEAN_FIXTURE = `
import { something } from './other';
`;

const DIRTY_STATIC = `
import { validateEnvelopeBase } from '@h2o/cross-platform-envelope';
`;

const DIRTY_DYNAMIC = `
const m = await import('@h2o/cross-platform-envelope');
`;

const DIRTY_REQUIRE = `
const m = require('@h2o/cross-platform-envelope');
`;

export function selfTest() {
  const empty = { exceptions: [] };
  return {
    clean: scanText(CLEAN_FIXTURE, 'apps/x.ts', empty).length === 0,
    staticImport: scanText(DIRTY_STATIC, 'apps/y.ts', empty).some((f) => f.rule === RULE),
    dynamicImport: scanText(DIRTY_DYNAMIC, 'apps/z.ts', empty).some((f) => f.rule === RULE),
    requireImport: scanText(DIRTY_REQUIRE, 'apps/w.ts', empty).some((f) => f.rule === RULE),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const st = selfTest();
  console.log('scan-runtime-import-graph self-test:', st);
  const allPass = Object.values(st).every(Boolean);
  if (!allPass) {
    console.error('self-test FAILED');
    process.exit(1);
  }
  const r = scan();
  console.log(JSON.stringify(r, null, 2));
  if (r.findings.length > 0) process.exit(1);
}
