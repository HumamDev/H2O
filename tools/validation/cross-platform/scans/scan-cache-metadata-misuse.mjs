/**
 * F10.2.2 / CP-7 — cacheMetadata authority / write misuse.
 *
 * Hard-fail CP-7.1: a file under apps/, src-surfaces-base/, or
 * src-runtime-base/ contains the QUOTED literal `'cacheMetadata'` or
 * `"cacheMetadata"` AND a write/apply keyword within 50 lines.
 *
 * Critical false-positive control: matches the QUOTED kind literal
 * only. Bare identifiers like `cacheMetadata` (a useState variable
 * name in apps/studio/mobile/src/app/read-only-bundle.tsx) are NOT
 * matched.
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

const SCAN_NAME = 'scan-cache-metadata-misuse';
const RULE = 'CP-7.1';

const CACHE_META_RE = /(?:'cacheMetadata'|"cacheMetadata")/g;
const WRITE_KEYWORD_RE =
  /\b(?:INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM|\.apply\s*\(|\.commit\s*\(|\.dispatch\s*\()/;
const PROXIMITY_LINES = 50;

export function scanText(content, repoRel, allowlist) {
  const findings = [];
  if (isAllowedByList(RULE, repoRel, allowlist)) return findings;
  const lines = content.split('\n');
  const cacheLines = [];
  for (let i = 0; i < lines.length; i++) {
    if (CACHE_META_RE.test(lines[i])) cacheLines.push(i + 1);
    CACHE_META_RE.lastIndex = 0;
  }
  if (cacheLines.length === 0) return findings;
  const writeLines = [];
  for (let i = 0; i < lines.length; i++) {
    if (WRITE_KEYWORD_RE.test(lines[i])) writeLines.push(i + 1);
  }
  if (writeLines.length === 0) return findings;
  for (const cLine of cacheLines) {
    for (const wLine of writeLines) {
      if (Math.abs(cLine - wLine) <= PROXIMITY_LINES) {
        if (findInlineAllow(lines, cLine, RULE)) continue;
        findings.push(
          makeFinding({
            rule: RULE,
            path: repoRel,
            line: cLine,
            message: `'cacheMetadata' kind literal at line ${cLine} appears within ${PROXIMITY_LINES} lines of write keyword at line ${wLine}`,
          }),
        );
        break;
      }
    }
  }
  return findings;
}

export function scan({ allowlist = loadAllowlist() } = {}) {
  const start = Date.now();
  const files = walkFiles(SCOPE_RUNTIME);
  const findings = [];
  for (const repoRel of files) {
    const content = readRepoFile(repoRel);
    if (!CACHE_META_RE.test(content)) {
      CACHE_META_RE.lastIndex = 0;
      continue;
    }
    CACHE_META_RE.lastIndex = 0;
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
const [cacheMetadata, setCacheMetadata] = useState(null);
return <Status metadata={cacheMetadata} />;
`;

const DIRTY_FIXTURE = `
if (env.kind === 'cacheMetadata') {
  await db.apply(env.payload);
}
`;

export function selfTest() {
  const empty = { exceptions: [] };
  return {
    clean: scanText(CLEAN_FIXTURE, 'apps/x.tsx', empty).length === 0,
    dirty: scanText(DIRTY_FIXTURE, 'apps/y.ts', empty).some((f) => f.rule === RULE),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const st = selfTest();
  console.log('scan-cache-metadata-misuse self-test:', st);
  if (!st.clean || !st.dirty) {
    console.error('self-test FAILED');
    process.exit(1);
  }
  const r = scan();
  console.log(JSON.stringify(r, null, 2));
  if (r.findings.length > 0) process.exit(1);
}
