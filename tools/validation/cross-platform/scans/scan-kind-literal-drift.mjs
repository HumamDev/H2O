/**
 * F10.2.2 / CP-1 — envelope kind literal drift.
 *
 * Flags object literals tagged with `schema: "h2o.crossPlatform.envelope.v1"`
 * whose `kind` property is missing or is a value not in the canonical
 * ENVELOPE_KINDS set imported from @h2o/cross-platform-envelope.
 *
 * Pure scan. AST-based to avoid false positives on the bare word
 * "evidence" / "preview" etc.
 */

import {
  REPO_ROOT,
  SCOPE_TS_JS_ALL_INCLUDING_TOOLS,
  findInlineAllow,
  isAllowedByList,
  loadAllowlist,
  loadCrossPlatformEnvelopeHelper,
  makeFinding,
  makeReport,
  parseSource,
  readRepoFile,
  walkAst,
  walkFiles,
} from './util.mjs';
import ts from 'typescript';

const SCAN_NAME = 'scan-kind-literal-drift';
const RULE_KIND_NOT_IN_SET = 'CP-1.1';
const RULE_KIND_MISSING = 'CP-1.2';

export function scanText(content, repoRel, kinds, allowlist) {
  const findings = [];
  const sourceFile = parseSource(repoRel, content);
  const lines = content.split('\n');
  walkAst(sourceFile, (node) => {
    if (!ts.isObjectLiteralExpression(node)) return;
    let isEnvelope = false;
    let kindProp = null;
    let kindLine = null;
    let kindValueText = null;
    for (const prop of node.properties) {
      if (!ts.isPropertyAssignment(prop)) continue;
      if (!ts.isIdentifier(prop.name) && !ts.isStringLiteral(prop.name)) continue;
      const name = prop.name.text;
      if (name === 'schema' && ts.isStringLiteral(prop.initializer)) {
        if (prop.initializer.text === 'h2o.crossPlatform.envelope.v1') {
          isEnvelope = true;
        }
      } else if (name === 'kind') {
        kindProp = prop;
        const { line } = sourceFile.getLineAndCharacterOfPosition(prop.getStart(sourceFile));
        kindLine = line + 1;
        if (ts.isStringLiteral(prop.initializer) || ts.isNoSubstitutionTemplateLiteral(prop.initializer)) {
          kindValueText = prop.initializer.text;
        }
      }
    }
    if (!isEnvelope) return;
    if (!kindProp) {
      const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
      const lineNo = line + 1;
      addFinding({
        rule: RULE_KIND_MISSING,
        path: repoRel,
        line: lineNo,
        message: 'envelope-tagged object literal is missing a `kind` property',
      });
      return;
    }
    if (kindValueText == null) {
      // Non-literal kind (variable / expression); skip without flag.
      return;
    }
    if (!kinds.has(kindValueText)) {
      addFinding({
        rule: RULE_KIND_NOT_IN_SET,
        path: repoRel,
        line: kindLine,
        message: `kind: "${kindValueText}" is not in ENVELOPE_KINDS`,
      });
    }
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
  const kinds = new Set(helper.ENVELOPE_KINDS);
  const files = walkFiles(SCOPE_TS_JS_ALL_INCLUDING_TOOLS);
  const findings = [];
  for (const repoRel of files) {
    const content = readRepoFile(repoRel);
    if (!content.includes('h2o.crossPlatform.envelope.v1')) continue;
    findings.push(...scanText(content, repoRel, kinds, allowlist));
  }
  return makeReport({
    scanName: SCAN_NAME,
    ruleIds: [RULE_KIND_NOT_IN_SET, RULE_KIND_MISSING],
    findings,
    warnings: [],
    durationMs: Date.now() - start,
  });
}

// ── self-test ──────────────────────────────────────────────────────────

const CLEAN_FIXTURE = `
const env = {
  schema: "h2o.crossPlatform.envelope.v1",
  kind: "evidence",
};
`;

const DIRTY_FIXTURE = `
const env = {
  schema: "h2o.crossPlatform.envelope.v1",
  kind: "applyevent",
};
`;

const MISSING_KIND_FIXTURE = `
const env = {
  schema: "h2o.crossPlatform.envelope.v1",
};
`;

export function selfTest() {
  const helper = loadCrossPlatformEnvelopeHelper();
  const kinds = new Set(helper.ENVELOPE_KINDS);
  const empty = { exceptions: [] };
  const cleanFindings = scanText(CLEAN_FIXTURE, 'fixture-clean.ts', kinds, empty);
  const dirtyFindings = scanText(DIRTY_FIXTURE, 'fixture-dirty.ts', kinds, empty);
  const missingFindings = scanText(MISSING_KIND_FIXTURE, 'fixture-missing.ts', kinds, empty);
  return {
    clean: cleanFindings.length === 0,
    dirty: dirtyFindings.some((f) => f.rule === RULE_KIND_NOT_IN_SET),
    missing: missingFindings.some((f) => f.rule === RULE_KIND_MISSING),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const st = selfTest();
  console.log('scan-kind-literal-drift self-test:', st);
  if (!st.clean || !st.dirty || !st.missing) {
    console.error('self-test FAILED');
    process.exit(1);
  }
  const r = scan();
  console.log(JSON.stringify(r, null, 2));
  if (r.findings.length > 0) process.exit(1);
}
