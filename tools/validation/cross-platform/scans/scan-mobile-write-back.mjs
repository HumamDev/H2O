/**
 * F10.2.2 / CP-6 — mobile write-back paths.
 *
 * Hard-fails:
 *   CP-6.1 — SQL `INSERT INTO` / `UPDATE ... SET` / `DELETE FROM` /
 *            `drop table` in apps/studio/mobile/**
 *   CP-6.2 — Quoted kind literal `'applyEvent'` or `'proposal'` in
 *            apps/studio/mobile/**
 *   CP-6.3 — Exported function whose name matches
 *            ^(apply|commit|mutate|writeBack)\w*
 */

import {
  SCOPE_MOBILE,
  findInlineAllow,
  isAllowedByList,
  loadAllowlist,
  makeFinding,
  makeReport,
  parseSource,
  readRepoFile,
  walkAst,
  walkFiles,
} from './util.mjs';
import ts from 'typescript';

const SCAN_NAME = 'scan-mobile-write-back';
const RULE_SQL = 'CP-6.1';
const RULE_KIND_LITERAL = 'CP-6.2';
const RULE_EXPORT_NAME = 'CP-6.3';

const SQL_RE = /\b(?:INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM|DROP\s+TABLE)\b/i;
const KIND_RE = /(?:'applyEvent'|"applyEvent"|'proposal'|"proposal")/;
const EXPORT_NAME_RE = /^(apply|commit|mutate|writeBack)\w*/;

export function scanText(content, repoRel, allowlist) {
  const findings = [];
  const lines = content.split('\n');

  // CP-6.1 SQL writes.
  for (let i = 0; i < lines.length; i++) {
    if (SQL_RE.test(lines[i])) {
      if (isAllowedByList(RULE_SQL, repoRel, allowlist)) break;
      if (findInlineAllow(lines, i + 1, RULE_SQL)) continue;
      findings.push(
        makeFinding({
          rule: RULE_SQL,
          path: repoRel,
          line: i + 1,
          message: `mobile SQL write detected: ${lines[i].trim().slice(0, 120)}`,
        }),
      );
    }
  }

  // CP-6.2 forbidden kind literals.
  for (let i = 0; i < lines.length; i++) {
    if (KIND_RE.test(lines[i])) {
      if (isAllowedByList(RULE_KIND_LITERAL, repoRel, allowlist)) break;
      if (findInlineAllow(lines, i + 1, RULE_KIND_LITERAL)) continue;
      findings.push(
        makeFinding({
          rule: RULE_KIND_LITERAL,
          path: repoRel,
          line: i + 1,
          message: `mobile carries forbidden kind literal: ${lines[i].trim().slice(0, 120)}`,
        }),
      );
    }
  }

  // CP-6.3 forbidden exported function names.
  if (repoRel.endsWith('.ts') || repoRel.endsWith('.tsx') || repoRel.endsWith('.mjs') || repoRel.endsWith('.js') || repoRel.endsWith('.jsx')) {
    const sourceFile = parseSource(repoRel, content);
    ts.forEachChild(sourceFile, (stmt) => {
      const checkName = (name, pos) => {
        if (!EXPORT_NAME_RE.test(name)) return;
        const { line } = sourceFile.getLineAndCharacterOfPosition(pos);
        const lineNo = line + 1;
        if (isAllowedByList(RULE_EXPORT_NAME, repoRel, allowlist)) return;
        if (findInlineAllow(lines, lineNo, RULE_EXPORT_NAME)) return;
        findings.push(
          makeFinding({
            rule: RULE_EXPORT_NAME,
            path: repoRel,
            line: lineNo,
            message: `mobile exports forbidden writeback-like function name "${name}"`,
          }),
        );
      };
      const exported = (stmt.modifiers || []).some(
        (m) => m.kind === ts.SyntaxKind.ExportKeyword,
      );
      if (!exported) return;
      if (ts.isFunctionDeclaration(stmt) && stmt.name) {
        checkName(stmt.name.text, stmt.name.getStart(sourceFile));
      }
      if (ts.isVariableStatement(stmt)) {
        for (const decl of stmt.declarationList.declarations) {
          if (!ts.isIdentifier(decl.name)) continue;
          if (!decl.initializer) continue;
          if (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer)) {
            checkName(decl.name.text, decl.name.getStart(sourceFile));
          }
        }
      }
    });
  }

  return findings;
}

export function scan({ allowlist = loadAllowlist() } = {}) {
  const start = Date.now();
  const files = walkFiles(SCOPE_MOBILE);
  const findings = [];
  for (const repoRel of files) {
    const content = readRepoFile(repoRel);
    findings.push(...scanText(content, repoRel, allowlist));
  }
  return makeReport({
    scanName: SCAN_NAME,
    ruleIds: [RULE_SQL, RULE_KIND_LITERAL, RULE_EXPORT_NAME],
    findings,
    warnings: [],
    durationMs: Date.now() - start,
  });
}

// ── self-test ──────────────────────────────────────────────────────────

const CLEAN_FIXTURE = `
export function readCacheMetadata() { return null; }
const counts = { applyEvents: 0 };
`;

const DIRTY_SQL = `
const q = "INSERT INTO chats VALUES (?)";
`;

const DIRTY_KIND = `
const k = 'applyEvent';
`;

const DIRTY_EXPORT = `
export function applyTombstone() {}
`;

export function selfTest() {
  const empty = { exceptions: [] };
  return {
    clean: scanText(CLEAN_FIXTURE, 'apps/studio/mobile/src/x.ts', empty).length === 0,
    sql: scanText(DIRTY_SQL, 'apps/studio/mobile/src/y.ts', empty).some((f) => f.rule === RULE_SQL),
    kind: scanText(DIRTY_KIND, 'apps/studio/mobile/src/z.ts', empty).some((f) => f.rule === RULE_KIND_LITERAL),
    exportName: scanText(DIRTY_EXPORT, 'apps/studio/mobile/src/w.ts', empty).some((f) => f.rule === RULE_EXPORT_NAME),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const st = selfTest();
  console.log('scan-mobile-write-back self-test:', st);
  if (!st.clean || !st.sql || !st.kind || !st.exportName) {
    console.error('self-test FAILED');
    process.exit(1);
  }
  const r = scan();
  console.log(JSON.stringify(r, null, 2));
  if (r.findings.length > 0) process.exit(1);
}
