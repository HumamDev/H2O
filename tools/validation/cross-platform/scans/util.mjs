/**
 * F10.2.2 — shared scan utilities.
 *
 * Pure-Node ESM module. Provides:
 *   - Helper-package loader (esbuild + Module._compile)
 *   - Allowlist loader + match
 *   - Inline `// envelope-scan: allow CP-X.Y reason: ...` marker parser
 *   - File walker over scope globs
 *   - TypeScript AST parse + envelope-literal locator
 *   - Finding constructors
 *
 * No mutation of repo state. No network. No storage writes outside
 * process.stdout / process.stderr.
 */

import esbuild from 'esbuild';
import fs from 'node:fs';
import Module from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(__dirname, '../../../..');

export function repoPath(rel) {
  return path.join(REPO_ROOT, rel);
}

// ── Helper-package loader ─────────────────────────────────────────────

let helperCache = null;

/**
 * Loads `@h2o/cross-platform-envelope` by bundling its TypeScript entry
 * with esbuild and compiling the CJS output via Module._compile. Same
 * pattern as F10.2.1's validate-cross-platform-envelope.mjs.
 *
 * Returns the package's exports object. Memoized for the process
 * lifetime.
 */
export function loadCrossPlatformEnvelopeHelper() {
  if (helperCache) return helperCache;
  const entry = repoPath('packages/cross-platform-envelope/index.ts');
  const result = esbuild.buildSync({
    entryPoints: [entry],
    bundle: true,
    format: 'cjs',
    platform: 'neutral',
    mainFields: ['main'],
    target: ['es2020'],
    write: false,
  });
  const bundle = result.outputFiles[0].text;
  const m = new Module(entry);
  m.filename = entry;
  m.paths = Module._nodeModulePaths(path.dirname(entry));
  m._compile(bundle, entry);
  helperCache = m.exports;
  return helperCache;
}

// ── Allowlist ─────────────────────────────────────────────────────────

/**
 * Loads `tools/validation/cross-platform/allowlist.json`. Returns
 * `{ exceptions: [] }` if the file does not exist.
 */
export function loadAllowlist() {
  const file = repoPath('tools/validation/cross-platform/allowlist.json');
  if (!fs.existsSync(file)) {
    return { schema: 'h2o.cross-platform.envelope-scan-allowlist.v1', exceptions: [] };
  }
  try {
    const raw = fs.readFileSync(file, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.exceptions)) {
      throw new Error('allowlist.exceptions must be an array');
    }
    for (const ex of parsed.exceptions) {
      if (typeof ex.rule !== 'string') throw new Error('allowlist exception missing `rule`');
      if (typeof ex.path !== 'string') throw new Error('allowlist exception missing `path`');
      if (typeof ex.reason !== 'string' || ex.reason.length === 0) {
        throw new Error(`allowlist exception for ${ex.rule}@${ex.path} missing required \`reason\``);
      }
    }
    return parsed;
  } catch (e) {
    throw new Error(`Failed to load allowlist.json: ${e.message}`);
  }
}

/**
 * Returns true if the given rule + path is covered by an allowlist
 * exception. Path matching supports a single trailing `/**` suffix for
 * directory matching; otherwise it's an exact match on the repo-relative
 * path.
 */
export function isAllowedByList(rule, repoRelativePath, allowlist) {
  for (const ex of allowlist.exceptions) {
    if (ex.rule !== rule) continue;
    if (matchesAllowlistPath(repoRelativePath, ex.path)) {
      return ex;
    }
  }
  return null;
}

function matchesAllowlistPath(repoRel, pattern) {
  if (pattern.endsWith('/**')) {
    const prefix = pattern.slice(0, -3);
    return repoRel === prefix || repoRel.startsWith(prefix + '/');
  }
  return repoRel === pattern;
}

// ── Inline marker ─────────────────────────────────────────────────────

const INLINE_MARKER_RE =
  /envelope-scan:\s*allow\s+(CP-[A-Z]?[0-9]+(?:\.[0-9]+)?(?:\.[a-z0-9-]+)?)\s+reason:\s*(.+?)\s*$/;

/**
 * Returns the inline marker object `{ rule, reason }` if a comment on
 * line `lineNo` (1-based) or `lineNo - 1` carries an allow marker for
 * the given rule. Returns null otherwise.
 */
export function findInlineAllow(sourceLines, lineNo, rule) {
  const indicesToCheck = [lineNo - 1, lineNo - 2]; // current line + line above
  for (const idx of indicesToCheck) {
    if (idx < 0 || idx >= sourceLines.length) continue;
    const m = sourceLines[idx].match(INLINE_MARKER_RE);
    if (m && m[1] === rule) {
      return { rule: m[1], reason: m[2] };
    }
  }
  return null;
}

// ── File walker ───────────────────────────────────────────────────────

const DEFAULT_IGNORE_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'out',
  'target',
  '.next',
  '.cache',
  '.expo',
]);

/**
 * Walks the repo and returns repo-relative file paths matching any of
 * the given globs. Supports `**` for any-depth directory recursion and
 * `{ext1,ext2}` for extension alternation. Skips `node_modules`, `.git`,
 * generated dirs, and binary files.
 */
export function walkFiles(globs) {
  const compiled = globs.map(compileGlob);
  const matches = [];
  walkDir(REPO_ROOT, '', compiled, matches);
  return matches.sort();
}

function compileGlob(glob) {
  // Convert glob to a RegExp. Supports `**`, `*`, `?`, and `{a,b}`.
  let re = '';
  let i = 0;
  while (i < glob.length) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        re += '.*';
        i += 2;
        if (glob[i] === '/') i += 1;
      } else {
        re += '[^/]*';
        i += 1;
      }
    } else if (c === '?') {
      re += '[^/]';
      i += 1;
    } else if (c === '{') {
      const end = glob.indexOf('}', i);
      if (end < 0) {
        re += '\\{';
        i += 1;
      } else {
        const opts = glob.slice(i + 1, end).split(',');
        re += '(?:' + opts.map(escapeRegex).join('|') + ')';
        i = end + 1;
      }
    } else if (c === '.') {
      re += '\\.';
      i += 1;
    } else {
      re += escapeRegex(c);
      i += 1;
    }
  }
  return new RegExp('^' + re + '$');
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function walkDir(absBase, relBase, compiledGlobs, out) {
  let entries;
  try {
    entries = fs.readdirSync(absBase, { withFileTypes: true });
  } catch {
    return;
  }
  for (const ent of entries) {
    const relPath = relBase ? `${relBase}/${ent.name}` : ent.name;
    if (ent.isDirectory()) {
      if (DEFAULT_IGNORE_DIRS.has(ent.name)) continue;
      walkDir(path.join(absBase, ent.name), relPath, compiledGlobs, out);
    } else if (ent.isFile()) {
      for (const re of compiledGlobs) {
        if (re.test(relPath)) {
          out.push(relPath);
          break;
        }
      }
    }
  }
}

// ── TypeScript AST helpers ────────────────────────────────────────────

/**
 * Parses a TypeScript / JavaScript file via the bundled typescript
 * compiler API. Returns the SourceFile node. Throws nothing — on parse
 * error, returns an empty source file the caller can short-circuit on.
 */
export function parseSource(filePath, source) {
  const scriptKind = filePath.endsWith('.tsx')
    ? ts.ScriptKind.TSX
    : filePath.endsWith('.jsx')
      ? ts.ScriptKind.JSX
      : filePath.endsWith('.ts')
        ? ts.ScriptKind.TS
        : ts.ScriptKind.JS;
  return ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, scriptKind);
}

/**
 * Walks the source file and invokes `visitor(node)` on every node.
 */
export function walkAst(sourceFile, visitor) {
  function go(node) {
    visitor(node);
    ts.forEachChild(node, go);
  }
  go(sourceFile);
}

/**
 * Returns true if the object-literal node has a property `schema:` whose
 * value is the string literal `"h2o.crossPlatform.envelope.v1"`. Used by
 * scans that should only flag inside envelope objects.
 */
export function isEnvelopeLiteral(node) {
  if (!ts.isObjectLiteralExpression(node)) return false;
  for (const prop of node.properties) {
    if (!ts.isPropertyAssignment(prop)) continue;
    const name = propertyName(prop.name);
    if (name !== 'schema') continue;
    if (
      ts.isStringLiteral(prop.initializer) &&
      prop.initializer.text === 'h2o.crossPlatform.envelope.v1'
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Walks all PropertyAssignment children of an ObjectLiteralExpression
 * recursively (i.e. for nested object literals like `payload: { ... }`).
 * Invokes `visitor({ name, value, prop, line })` for each.
 */
export function walkObjectLiteralKeys(objLit, sourceFile, visitor) {
  function go(node) {
    if (!ts.isObjectLiteralExpression(node)) return;
    for (const prop of node.properties) {
      if (!ts.isPropertyAssignment(prop)) continue;
      const name = propertyName(prop.name);
      if (name == null) continue;
      const { line } = sourceFile.getLineAndCharacterOfPosition(prop.getStart(sourceFile));
      visitor({ name, value: prop.initializer, prop, line: line + 1 });
      go(prop.initializer);
    }
  }
  go(objLit);
}

function propertyName(name) {
  if (ts.isIdentifier(name)) return name.text;
  if (ts.isStringLiteral(name)) return name.text;
  if (ts.isNoSubstitutionTemplateLiteral(name)) return name.text;
  if (ts.isNumericLiteral(name)) return name.text;
  return null;
}

// ── Finding constructors ──────────────────────────────────────────────

export function makeFinding({ rule, path: filePath, line, column, message, snippet }) {
  return {
    rule,
    path: filePath,
    line: line ?? null,
    column: column ?? null,
    message,
    snippet: snippet ?? null,
  };
}

export function makeReport({ scanName, ruleIds, findings = [], warnings = [], durationMs, skippedReason = null }) {
  return {
    scanName,
    ruleIds,
    findings,
    warnings,
    durationMs,
    skippedReason,
  };
}

// ── git helpers ───────────────────────────────────────────────────────

import { execFileSync } from 'node:child_process';

/**
 * Returns the list of repo-relative paths in the staged diff (default)
 * or in HEAD..ref if `--diff <ref>` was specified.
 *
 * Throws if git is not available; returns null if no diff context can
 * be established (e.g. running outside a git checkout).
 */
export function gitStagedFiles(diffMode) {
  const args = diffMode?.mode === 'ref' ? ['diff', '--name-only', diffMode.ref] : ['diff', '--cached', '--name-only'];
  try {
    const out = execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8' });
    return out.split('\n').map((s) => s.trim()).filter((s) => s.length > 0);
  } catch (e) {
    return null;
  }
}

/**
 * Returns the list of unstaged modifications (working tree vs index).
 */
export function gitUnstagedFiles() {
  try {
    const out = execFileSync('git', ['diff', '--name-only'], { cwd: REPO_ROOT, encoding: 'utf8' });
    return out.split('\n').map((s) => s.trim()).filter((s) => s.length > 0);
  } catch (e) {
    return null;
  }
}

// ── Misc ──────────────────────────────────────────────────────────────

export function readRepoFile(repoRel) {
  return fs.readFileSync(path.join(REPO_ROOT, repoRel), 'utf8');
}

/**
 * Scope globs reused by multiple scans. Kept here so a single edit
 * updates every consumer.
 */
export const SCOPE_HELPER_PACKAGE = ['packages/cross-platform-envelope/**/*.{ts,tsx,js,mjs,jsx}'];
export const SCOPE_RUNTIME = [
  'apps/**/*.{ts,tsx,js,jsx,mjs}',
  'src-surfaces-base/**/*.{ts,js,mjs}',
  'src-runtime-base/**/*.{ts,js,mjs}',
];
export const SCOPE_MOBILE = ['apps/studio/mobile/**/*.{ts,tsx,js,mjs}'];
export const SCOPE_TS_JS_ALL_INCLUDING_TOOLS = [
  ...SCOPE_RUNTIME,
  'packages/**/*.{ts,tsx,js,jsx,mjs}',
  'tools/validation/**/*.{mjs,ts,js}',
];
export const SCOPE_DOCS = ['docs/systems/cross-platform/**/*.md', 'docs/systems/sync/**/*.md'];

/**
 * Quoted kind literal pattern. Matches `'<kind>'` or `"<kind>"` exactly.
 * Used by scans that should not match bare identifiers (e.g. variable
 * names like `cacheMetadata`).
 */
export function quotedKindLiteralPattern(kind) {
  return new RegExp(`(?:'${kind}'|"${kind}")`);
}
