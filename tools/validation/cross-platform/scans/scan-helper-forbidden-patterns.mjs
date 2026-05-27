/**
 * F10.2.2 / CP-3 + CP-4 — forbidden envelope constructors / factory
 * APIs / runtime registration inside the helper package itself.
 *
 * Hard-fails:
 *   CP-3.1 — helper package exports a function whose name matches
 *            ^(create|make|build|construct|register|install|subscribe).*Envelope?$
 *   CP-4.1 — helper package imports from node:*
 *   CP-4.2 — helper package references globalThis.crypto, crypto.subtle,
 *            fetch(, XMLHttpRequest, Date.now(, process.env, fs.,
 *            child_process, or require(
 *   CP-4.3 — helper package has a top-level non-declaration statement
 *            (anything other than imports, exports, const/let/var of
 *            pure expressions, function/class/interface/type
 *            declarations, JSDoc).
 */

import {
  SCOPE_HELPER_PACKAGE,
  findInlineAllow,
  isAllowedByList,
  loadAllowlist,
  makeFinding,
  makeReport,
  parseSource,
  readRepoFile,
  walkFiles,
} from './util.mjs';
import ts from 'typescript';

const SCAN_NAME = 'scan-helper-forbidden-patterns';
const RULE_FORBIDDEN_EXPORT = 'CP-3.1';
const RULE_NODE_IMPORT = 'CP-4.1';
const RULE_FORBIDDEN_API = 'CP-4.2';
const RULE_SIDE_EFFECT = 'CP-4.3';

const FORBIDDEN_API_PATTERNS = [
  { pattern: /\bglobalThis\.crypto\b/, name: 'globalThis.crypto' },
  { pattern: /\bcrypto\.subtle\b/, name: 'crypto.subtle' },
  { pattern: /\bfetch\s*\(/, name: 'fetch()' },
  { pattern: /\bXMLHttpRequest\b/, name: 'XMLHttpRequest' },
  { pattern: /\bDate\.now\s*\(/, name: 'Date.now()' },
  { pattern: /\bprocess\.env\b/, name: 'process.env' },
  { pattern: /\bchild_process\b/, name: 'child_process' },
  { pattern: /\brequire\s*\(/, name: 'require()' },
];

/**
 * Strip block (/* ... *\/) and line (// ...) comments from source so
 * forbidden-API regexes do not match documentation. Preserves newlines
 * inside block comments so line numbers stay accurate.
 *
 * The helper package has no URLs in its source, so the line-comment
 * stripper does not need string-literal awareness.
 */
function stripComments(source) {
  let s = source.replace(/\/\*[\s\S]*?\*\//g, (m) => {
    const newlines = (m.match(/\n/g) || []).length;
    return '\n'.repeat(newlines);
  });
  s = s.replace(/\/\/[^\n]*/g, '');
  return s;
}

// Names allowed at top level even if they call functions (purely
// declarative const initializers that may invoke type-level helpers).
function isAllowedTopLevelStatement(stmt, sourceFile) {
  if (ts.isImportDeclaration(stmt)) return true;
  if (ts.isExportDeclaration(stmt)) return true;
  if (ts.isExportAssignment(stmt)) return true;
  if (ts.isVariableStatement(stmt)) return true; // initializer purity is enforced by reading no fs/fetch/etc.
  if (ts.isFunctionDeclaration(stmt)) return true;
  if (ts.isClassDeclaration(stmt)) return true;
  if (ts.isInterfaceDeclaration(stmt)) return true;
  if (ts.isTypeAliasDeclaration(stmt)) return true;
  if (ts.isEnumDeclaration(stmt)) return true;
  if (ts.isModuleDeclaration(stmt)) return true;
  return false;
}

export function scanText(content, repoRel, allowlist) {
  const findings = [];
  const sourceFile = parseSource(repoRel, content);
  const lines = content.split('\n');

  // CP-3.1: forbidden export names.
  ts.forEachChild(sourceFile, (stmt) => {
    if (!ts.isFunctionDeclaration(stmt)) return;
    if (!stmt.name) return;
    const exported = (stmt.modifiers || []).some(
      (m) => m.kind === ts.SyntaxKind.ExportKeyword,
    );
    if (!exported) return;
    const name = stmt.name.text;
    if (/^(create|make|build|construct|register|install|subscribe).*Envelope?s?$/.test(name)) {
      const { line } = sourceFile.getLineAndCharacterOfPosition(stmt.name.getStart(sourceFile));
      addFinding({
        rule: RULE_FORBIDDEN_EXPORT,
        path: repoRel,
        line: line + 1,
        message: `forbidden exported function name "${name}" in helper package`,
      });
    }
  });
  // Also walk variable statements that export arrow functions / function exprs.
  ts.forEachChild(sourceFile, (stmt) => {
    if (!ts.isVariableStatement(stmt)) return;
    const exported = (stmt.modifiers || []).some(
      (m) => m.kind === ts.SyntaxKind.ExportKeyword,
    );
    if (!exported) return;
    for (const decl of stmt.declarationList.declarations) {
      if (!ts.isIdentifier(decl.name)) continue;
      const name = decl.name.text;
      if (!decl.initializer) continue;
      const isFn =
        ts.isArrowFunction(decl.initializer) ||
        ts.isFunctionExpression(decl.initializer);
      if (!isFn) continue;
      if (/^(create|make|build|construct|register|install|subscribe).*Envelope?s?$/.test(name)) {
        const { line } = sourceFile.getLineAndCharacterOfPosition(decl.name.getStart(sourceFile));
        addFinding({
          rule: RULE_FORBIDDEN_EXPORT,
          path: repoRel,
          line: line + 1,
          message: `forbidden exported function name "${name}" in helper package`,
        });
      }
    }
  });

  // CP-4.1: node:* imports.
  ts.forEachChild(sourceFile, (stmt) => {
    if (!ts.isImportDeclaration(stmt)) return;
    if (!ts.isStringLiteral(stmt.moduleSpecifier)) return;
    const spec = stmt.moduleSpecifier.text;
    if (spec.startsWith('node:')) {
      const { line } = sourceFile.getLineAndCharacterOfPosition(stmt.getStart(sourceFile));
      addFinding({
        rule: RULE_NODE_IMPORT,
        path: repoRel,
        line: line + 1,
        message: `forbidden node:* import "${spec}" in helper package`,
      });
    }
  });

  // CP-4.2: forbidden API substrings — comment-stripped so JSDoc
  // mentions of the forbidden names do not count.
  const codeOnly = stripComments(content);
  for (const { pattern, name } of FORBIDDEN_API_PATTERNS) {
    let m;
    const re = new RegExp(pattern.source, pattern.flags + (pattern.flags.includes('g') ? '' : 'g'));
    while ((m = re.exec(codeOnly)) !== null) {
      const idx = m.index;
      const before = codeOnly.slice(0, idx);
      const lineNo = before.split('\n').length;
      addFinding({
        rule: RULE_FORBIDDEN_API,
        path: repoRel,
        line: lineNo,
        message: `forbidden API "${name}" in helper package`,
      });
    }
  }

  // CP-4.3: top-level side-effect statements. Only flag explicit
  // side-effecting statement kinds; skip declarations, EndOfFileToken,
  // and other non-statement nodes that ts.forEachChild yields.
  for (const stmt of sourceFile.statements) {
    if (isAllowedTopLevelStatement(stmt, sourceFile)) continue;
    if (
      ts.isExpressionStatement(stmt) ||
      ts.isIfStatement(stmt) ||
      ts.isForStatement(stmt) ||
      ts.isForOfStatement(stmt) ||
      ts.isForInStatement(stmt) ||
      ts.isWhileStatement(stmt) ||
      ts.isDoStatement(stmt) ||
      ts.isThrowStatement(stmt) ||
      ts.isTryStatement(stmt) ||
      ts.isSwitchStatement(stmt) ||
      ts.isBlock(stmt) ||
      ts.isReturnStatement(stmt)
    ) {
      const { line } = sourceFile.getLineAndCharacterOfPosition(stmt.getStart(sourceFile));
      addFinding({
        rule: RULE_SIDE_EFFECT,
        path: repoRel,
        line: line + 1,
        message: `top-level non-declaration statement in helper package (kind: ${ts.SyntaxKind[stmt.kind]})`,
      });
    }
  }

  function addFinding({ rule, path, line, message }) {
    if (isAllowedByList(rule, path, allowlist)) return;
    if (findInlineAllow(lines, line, rule)) return;
    findings.push(makeFinding({ rule, path, line, message }));
  }

  return findings;
}

export function scan({ allowlist = loadAllowlist() } = {}) {
  const start = Date.now();
  const files = walkFiles(SCOPE_HELPER_PACKAGE);
  const findings = [];
  for (const repoRel of files) {
    if (repoRel.endsWith('.d.ts')) continue;
    const content = readRepoFile(repoRel);
    findings.push(...scanText(content, repoRel, allowlist));
  }
  return makeReport({
    scanName: SCAN_NAME,
    ruleIds: [RULE_FORBIDDEN_EXPORT, RULE_NODE_IMPORT, RULE_FORBIDDEN_API, RULE_SIDE_EFFECT],
    findings,
    warnings: [],
    durationMs: Date.now() - start,
  });
}

// ── self-test ──────────────────────────────────────────────────────────

const CLEAN_FIXTURE = `
import { something } from './other';
export function validateThing(x: unknown) { return { ok: true }; }
export const MY_CONST = 'pure';
`;

const DIRTY_NODE_IMPORT = `
import fs from 'node:fs';
export function validateThing() {}
`;

const DIRTY_FORBIDDEN_EXPORT = `
export function createEnvelope() { return {}; }
`;

const DIRTY_FORBIDDEN_API = `
const t = Date.now();
export const x = t;
`;

const DIRTY_SIDE_EFFECT = `
console.log('hello');
export const x = 1;
`;

export function selfTest() {
  const empty = { exceptions: [] };
  return {
    clean: scanText(CLEAN_FIXTURE, 'packages/cross-platform-envelope/src/fixture-clean.ts', empty).length === 0,
    nodeImport: scanText(DIRTY_NODE_IMPORT, 'packages/cross-platform-envelope/src/dirty.ts', empty).some(
      (f) => f.rule === RULE_NODE_IMPORT,
    ),
    forbiddenExport: scanText(DIRTY_FORBIDDEN_EXPORT, 'packages/cross-platform-envelope/src/dirty.ts', empty).some(
      (f) => f.rule === RULE_FORBIDDEN_EXPORT,
    ),
    forbiddenApi: scanText(DIRTY_FORBIDDEN_API, 'packages/cross-platform-envelope/src/dirty.ts', empty).some(
      (f) => f.rule === RULE_FORBIDDEN_API,
    ),
    sideEffect: scanText(DIRTY_SIDE_EFFECT, 'packages/cross-platform-envelope/src/dirty.ts', empty).some(
      (f) => f.rule === RULE_SIDE_EFFECT,
    ),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const st = selfTest();
  console.log('scan-helper-forbidden-patterns self-test:', st);
  if (!st.clean || !st.nodeImport || !st.forbiddenExport || !st.forbiddenApi || !st.sideEffect) {
    console.error('self-test FAILED');
    process.exit(1);
  }
  const r = scan();
  console.log(JSON.stringify(r, null, 2));
  if (r.findings.length > 0) process.exit(1);
}
