/**
 * F10.2.2 / CP-2 — blocker code drift.
 *
 * Hard-fails:
 *   CP-2.1 — A string literal used as a blocker code is not in
 *            BLOCKER_CODES.
 *
 * Warnings:
 *   CP-W.1 — A blocker code declared in BLOCKER_CODES is not emitted
 *            by any non-helper file (orphan code).
 *
 * Detection scope: we only flag literals that *look like* a blocker
 * code (kebab-case, with one of the F10.2 blocker prefixes) AND occur
 * in a known blocker-code context (array element of a `blockers` field
 * / push into a `blockers` array / `BlockerCode` cast). The helper
 * package's constants array (FOREVER_NO_FIELD_NAMES, BLOCKER_CODES
 * itself) is excluded from the dirty-codes check by skipping the
 * file `packages/cross-platform-envelope/src/constants.ts`.
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

const SCAN_NAME = 'scan-blocker-code-drift';
const RULE_UNKNOWN_CODE = 'CP-2.1';
const WARN_ORPHAN_CODE = 'CP-W.1';

// Known prefixes for blocker-code literals. A kebab-case string with
// one of these prefixes is considered a candidate.
const BLOCKER_PREFIXES = [
  'platform-',
  'capability-',
  'surface-',
  'mobile-',
  'native-extension-',
  'envelope-',
  'operation-',
  'delete-',
  'local-only-',
  'payload-',
  'stale-',
];

function looksLikeBlockerCode(s) {
  if (typeof s !== 'string') return false;
  if (s.length < 8) return false;
  if (!/^[a-z][a-z0-9-]+$/.test(s)) return false;
  if (!s.includes('-')) return false;
  return BLOCKER_PREFIXES.some((p) => s.startsWith(p));
}

/**
 * Returns true if the literal is in a blocker-code context — i.e. it is
 * inside an array literal assigned/initialized to a property named
 * `blockers` / `blocker`, OR passed as a `BlockerCode` argument.
 */
function isInBlockerContext(node) {
  // Walk up parents to find context.
  let p = node.parent;
  for (let i = 0; i < 8 && p; i++) {
    if (ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p) || ts.isBindingElement(p)) {
      const name = p.name && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) ? p.name.text : null;
      if (name === 'blockers' || name === 'blocker') return true;
    }
    if (ts.isCallExpression(p)) {
      // `result.blockers.push("...")` pattern
      const expr = p.expression;
      if (ts.isPropertyAccessExpression(expr)) {
        if (expr.name.text === 'push' || expr.name.text === 'includes') {
          const target = expr.expression;
          if (ts.isPropertyAccessExpression(target) && target.name.text === 'blockers') return true;
          if (ts.isIdentifier(target) && /[Bb]lockers?$/.test(target.text)) return true;
        }
      }
    }
    if (ts.isAsExpression(p) || ts.isTypeAssertionExpression(p)) {
      const t = p.type;
      if (t && ts.isTypeReferenceNode(t) && ts.isIdentifier(t.typeName) && t.typeName.text === 'BlockerCode') {
        return true;
      }
    }
    p = p.parent;
  }
  return false;
}

export function scanText(content, repoRel, codes, allowlist) {
  const findings = [];
  const emitted = new Set();
  if (repoRel.endsWith('packages/cross-platform-envelope/src/constants.ts')) {
    return { findings, emitted };
  }
  const sourceFile = parseSource(repoRel, content);
  const lines = content.split('\n');
  walkAst(sourceFile, (node) => {
    if (!ts.isStringLiteral(node) && !ts.isNoSubstitutionTemplateLiteral(node)) return;
    const value = node.text;
    if (!looksLikeBlockerCode(value)) return;
    if (!isInBlockerContext(node)) return;
    emitted.add(value);
    if (codes.has(value)) return;
    const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    const lineNo = line + 1;
    if (isAllowedByList(RULE_UNKNOWN_CODE, repoRel, allowlist)) return;
    if (findInlineAllow(lines, lineNo, RULE_UNKNOWN_CODE)) return;
    findings.push(
      makeFinding({
        rule: RULE_UNKNOWN_CODE,
        path: repoRel,
        line: lineNo,
        message: `blocker code "${value}" is not in BLOCKER_CODES`,
      }),
    );
  });
  return { findings, emitted };
}

/**
 * A file is in scope for blocker-code drift detection iff it has
 * envelope context. We use this to suppress false positives on
 * unrelated UI / domain code that happens to use a `blockers:` array
 * with its own vocabulary (e.g. folder-delete UI codes like
 * `delete-confirmation-required`).
 */
function hasEnvelopeContext(content) {
  return (
    content.includes('h2o.crossPlatform.envelope.v1') ||
    content.includes('@h2o/cross-platform-envelope') ||
    content.includes('BlockerCode')
  );
}

export function scan({ allowlist = loadAllowlist() } = {}) {
  const start = Date.now();
  const helper = loadCrossPlatformEnvelopeHelper();
  const codes = new Set(helper.BLOCKER_CODES);
  const files = walkFiles(SCOPE_TS_JS_ALL_INCLUDING_TOOLS);
  const findings = [];
  const allEmitted = new Set();
  for (const repoRel of files) {
    const content = readRepoFile(repoRel);
    if (!hasEnvelopeContext(content)) continue;
    if (!BLOCKER_PREFIXES.some((p) => content.includes(`'${p}`) || content.includes(`"${p}`))) {
      continue;
    }
    const { findings: f, emitted } = scanText(content, repoRel, codes, allowlist);
    findings.push(...f);
    for (const e of emitted) allEmitted.add(e);
  }
  // Orphan check: codes declared but never used.
  const warnings = [];
  for (const code of codes) {
    if (!allEmitted.has(code)) {
      warnings.push(
        makeFinding({
          rule: WARN_ORPHAN_CODE,
          path: 'packages/cross-platform-envelope/src/constants.ts',
          line: null,
          message: `blocker code "${code}" is declared but never emitted by any scanned file`,
        }),
      );
    }
  }
  return makeReport({
    scanName: SCAN_NAME,
    ruleIds: [RULE_UNKNOWN_CODE, WARN_ORPHAN_CODE],
    findings,
    warnings,
    durationMs: Date.now() - start,
  });
}

// ── self-test ──────────────────────────────────────────────────────────

const CLEAN_FIXTURE = `
const r = { blockers: ['platform-not-authorized-for-kind'] };
`;

const DIRTY_FIXTURE = `
const r = { blockers: ['platform-not-an-actual-code'] };
`;

export function selfTest() {
  const helper = loadCrossPlatformEnvelopeHelper();
  const codes = new Set(helper.BLOCKER_CODES);
  const empty = { exceptions: [] };
  const cleanResult = scanText(CLEAN_FIXTURE, 'fixture-clean.ts', codes, empty);
  const dirtyResult = scanText(DIRTY_FIXTURE, 'fixture-dirty.ts', codes, empty);
  return {
    clean: cleanResult.findings.length === 0,
    dirty: dirtyResult.findings.some((f) => f.rule === RULE_UNKNOWN_CODE),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const st = selfTest();
  console.log('scan-blocker-code-drift self-test:', st);
  if (!st.clean || !st.dirty) {
    console.error('self-test FAILED');
    process.exit(1);
  }
  const r = scan();
  console.log(JSON.stringify(r, null, 2));
  if (r.findings.length > 0) process.exit(1);
}
