/**
 * F10.2.2 / CP-8 — forever-no field names in envelope payload examples.
 *
 * Hard-fails:
 *   CP-8.1 — Object literal tagged with the envelope schema (anywhere
 *            in the nested tree) contains a key in FOREVER_NO_FIELD_NAMES.
 *   CP-8.2 — Same scope, key ends in `Token` (case-insensitive) but is
 *            not literally `previewToken`.
 *
 * Critical false-positive control: only flags keys inside object
 * literals whose root is an envelope-tagged literal. The
 * FOREVER_NO_FIELD_NAMES array declaration in the helper package is
 * NOT flagged because those strings appear as array elements, not as
 * object keys.
 */

import {
  SCOPE_TS_JS_ALL_INCLUDING_TOOLS,
  findInlineAllow,
  isAllowedByList,
  isEnvelopeLiteral,
  loadAllowlist,
  loadCrossPlatformEnvelopeHelper,
  makeFinding,
  makeReport,
  parseSource,
  readRepoFile,
  walkAst,
  walkFiles,
  walkObjectLiteralKeys,
} from './util.mjs';

const SCAN_NAME = 'scan-forever-no-fields';
const RULE_FOREVER_NO = 'CP-8.1';
const RULE_TOKEN = 'CP-8.2';

export function scanText(content, repoRel, foreverNo, allowlist) {
  const findings = [];
  const sourceFile = parseSource(repoRel, content);
  const lines = content.split('\n');
  walkAst(sourceFile, (node) => {
    if (!isEnvelopeLiteral(node)) return;
    walkObjectLiteralKeys(node, sourceFile, ({ name, line }) => {
      if (foreverNo.has(name)) {
        addFinding({
          rule: RULE_FOREVER_NO,
          path: repoRel,
          line,
          message: `forever-no field name "${name}" appears inside an envelope-tagged literal`,
        });
        return;
      }
      if (name !== 'previewToken' && /token$/i.test(name)) {
        addFinding({
          rule: RULE_TOKEN,
          path: repoRel,
          line,
          message: `forbidden token-family field name "${name}" appears inside an envelope-tagged literal (only "previewToken" is permitted)`,
        });
      }
    });
  });
  function addFinding({ rule, path, line, message }) {
    if (isAllowedByList(rule, path, allowlist)) return;
    if (findInlineAllow(lines, line, rule)) return;
    findings.push(makeFinding({ rule, path, line, message }));
  }
  return findings;
}

export function scan({ allowlist = loadAllowlist() } = {}) {
  const start = Date.now();
  const helper = loadCrossPlatformEnvelopeHelper();
  const foreverNo = new Set(helper.FOREVER_NO_FIELD_NAMES);
  const files = walkFiles(SCOPE_TS_JS_ALL_INCLUDING_TOOLS);
  const findings = [];
  for (const repoRel of files) {
    const content = readRepoFile(repoRel);
    if (!content.includes('h2o.crossPlatform.envelope.v1')) continue;
    findings.push(...scanText(content, repoRel, foreverNo, allowlist));
  }
  return makeReport({
    scanName: SCAN_NAME,
    ruleIds: [RULE_FOREVER_NO, RULE_TOKEN],
    findings,
    warnings: [],
    durationMs: Date.now() - start,
  });
}

// ── self-test ──────────────────────────────────────────────────────────

const CLEAN_FIXTURE = `
const env = {
  schema: "h2o.crossPlatform.envelope.v1",
  kind: "preview",
  payload: { predicateVersion: "v1", previewToken: "ptok1:abc" },
};
`;

const DIRTY_FOREVER_NO = `
const env = {
  schema: "h2o.crossPlatform.envelope.v1",
  kind: "evidence",
  payload: { observationKind: "x", content: "leaked chat body" },
};
`;

const DIRTY_TOKEN = `
const env = {
  schema: "h2o.crossPlatform.envelope.v1",
  kind: "applyEvent",
  payload: { accessToken: "leaked" },
};
`;

export function selfTest() {
  const helper = loadCrossPlatformEnvelopeHelper();
  const foreverNo = new Set(helper.FOREVER_NO_FIELD_NAMES);
  const empty = { exceptions: [] };
  return {
    clean: scanText(CLEAN_FIXTURE, 'fixture-clean.ts', foreverNo, empty).length === 0,
    foreverNo: scanText(DIRTY_FOREVER_NO, 'fixture-dirty.ts', foreverNo, empty).some(
      (f) => f.rule === RULE_FOREVER_NO,
    ),
    token: scanText(DIRTY_TOKEN, 'fixture-token.ts', foreverNo, empty).some(
      (f) => f.rule === RULE_TOKEN,
    ),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const st = selfTest();
  console.log('scan-forever-no-fields self-test:', st);
  if (!st.clean || !st.foreverNo || !st.token) {
    console.error('self-test FAILED');
    process.exit(1);
  }
  const r = scan();
  console.log(JSON.stringify(r, null, 2));
  if (r.findings.length > 0) process.exit(1);
}
