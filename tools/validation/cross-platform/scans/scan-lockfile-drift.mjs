/**
 * F10.2.2 / CP-9 — lockfile / generated / build artifact drift.
 *
 * Default mode: scans `git diff --cached --name-only` (the STAGED set
 * only). This avoids picking up unrelated external WIP that has not
 * been staged.
 *
 * Optional: `--include-unstaged` adds `git diff --name-only` (working
 * tree vs index) into the inspection.
 * Optional: `--diff <ref>` compares HEAD vs the given ref instead.
 *
 * Hard-fails any of these paths:
 *   - package-lock.json / pnpm-lock.yaml / yarn.lock
 *   - Cargo.lock
 *   - Podfile.lock
 *   - dist/**, build/**, out/**, target/**
 *
 * Warning CP-W.5: no diff context available (skipped silently).
 */

import {
  findInlineAllow,
  gitStagedFiles,
  gitUnstagedFiles,
  isAllowedByList,
  loadAllowlist,
  makeFinding,
  makeReport,
} from './util.mjs';

const SCAN_NAME = 'scan-lockfile-drift';
const RULE = 'CP-9.1';
const WARN_NO_DIFF = 'CP-W.5';

const FORBIDDEN_PATH_PATTERNS = [
  /(?:^|\/)package-lock\.json$/,
  /(?:^|\/)pnpm-lock\.yaml$/,
  /(?:^|\/)yarn\.lock$/,
  /(?:^|\/)Cargo\.lock$/,
  /(?:^|\/)Podfile\.lock$/,
  /(?:^|\/)dist\//,
  /(?:^|\/)build\//,
  /(?:^|\/)out\//,
  /(?:^|\/)target\//,
];

function isForbidden(path) {
  return FORBIDDEN_PATH_PATTERNS.some((re) => re.test(path));
}

export function scan({
  allowlist = loadAllowlist(),
  diffMode = null,
  includeUnstaged = false,
} = {}) {
  const start = Date.now();
  const stagedFiles = gitStagedFiles(diffMode);
  if (stagedFiles == null) {
    return makeReport({
      scanName: SCAN_NAME,
      ruleIds: [RULE, WARN_NO_DIFF],
      findings: [],
      warnings: [
        makeFinding({
          rule: WARN_NO_DIFF,
          path: '<no-diff-context>',
          line: null,
          message: 'no git diff context available; lockfile/artifact drift scan skipped',
        }),
      ],
      durationMs: Date.now() - start,
      skippedReason: 'no-git-diff-context',
    });
  }
  let candidates = stagedFiles;
  if (includeUnstaged) {
    const unstaged = gitUnstagedFiles() ?? [];
    candidates = Array.from(new Set([...candidates, ...unstaged]));
  }
  const findings = [];
  for (const path of candidates) {
    if (!isForbidden(path)) continue;
    if (isAllowedByList(RULE, path, allowlist)) continue;
    findings.push(
      makeFinding({
        rule: RULE,
        path,
        line: null,
        message: `lockfile / generated / build-artifact change detected in ${
          includeUnstaged ? 'diff set' : 'staged diff'
        }: ${path}`,
      }),
    );
  }
  return makeReport({
    scanName: SCAN_NAME,
    ruleIds: [RULE, WARN_NO_DIFF],
    findings,
    warnings: [],
    durationMs: Date.now() - start,
  });
}

// ── self-test ──────────────────────────────────────────────────────────

export function selfTest() {
  return {
    forbiddenLockfile: isForbidden('package-lock.json'),
    forbiddenPnpm: isForbidden('pnpm-lock.yaml'),
    forbiddenCargo: isForbidden('apps/studio/desktop/src-tauri/Cargo.lock'),
    forbiddenDist: isForbidden('packages/foo/dist/index.js'),
    cleanSrc: !isForbidden('packages/cross-platform-envelope/src/types.ts'),
    cleanReadme: !isForbidden('README.md'),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const st = selfTest();
  console.log('scan-lockfile-drift self-test:', st);
  const allPass = Object.values(st).every(Boolean);
  if (!allPass) {
    console.error('self-test FAILED');
    process.exit(1);
  }
  const r = scan();
  console.log(JSON.stringify(r, null, 2));
  if (r.findings.length > 0) process.exit(1);
}
