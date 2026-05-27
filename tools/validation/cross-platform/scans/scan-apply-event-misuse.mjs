/**
 * F10.2.2 / CP-5 — applyEvent command-like consumer usage.
 *
 * Hard-fail CP-5.1: a non-allowlisted file under apps/, src-surfaces-base/,
 * or src-runtime-base/ contains the QUOTED literal `'applyEvent'` or
 * `"applyEvent"` AND one of {INSERT, UPDATE, DELETE, .write(, .commit(,
 * .apply(, .dispatch(, mutate} within 80 lines.
 *
 * Critical false-positive control: the scan matches the QUOTED kind
 * literal only. Bare identifiers like `applyEvents` (audit counter
 * plural) and labels like "apply events" (with space) are NOT matched.
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

const SCAN_NAME = 'scan-apply-event-misuse';
const RULE = 'CP-5.1';

const APPLY_EVENT_RE = /(?:'applyEvent'|"applyEvent")/g;
const WRITE_KEYWORD_RE =
  /\b(?:INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM|\.write\s*\(|\.commit\s*\(|\.apply\s*\(|\.dispatch\s*\(|\bmutate[A-Z]\w*\s*\()/;
const PROXIMITY_LINES = 80;

export function scanText(content, repoRel, allowlist) {
  const findings = [];
  if (isAllowedByList(RULE, repoRel, allowlist)) return findings;
  const lines = content.split('\n');
  const applyEventLines = [];
  for (let i = 0; i < lines.length; i++) {
    if (APPLY_EVENT_RE.test(lines[i])) {
      applyEventLines.push(i + 1);
    }
    APPLY_EVENT_RE.lastIndex = 0;
  }
  if (applyEventLines.length === 0) return findings;
  // Find write-keyword lines.
  const writeLines = [];
  for (let i = 0; i < lines.length; i++) {
    if (WRITE_KEYWORD_RE.test(lines[i])) writeLines.push(i + 1);
  }
  if (writeLines.length === 0) return findings;
  for (const aLine of applyEventLines) {
    for (const wLine of writeLines) {
      if (Math.abs(aLine - wLine) <= PROXIMITY_LINES) {
        if (findInlineAllow(lines, aLine, RULE)) continue;
        findings.push(
          makeFinding({
            rule: RULE,
            path: repoRel,
            line: aLine,
            message: `'applyEvent' kind literal at line ${aLine} appears within ${PROXIMITY_LINES} lines of a write keyword at line ${wLine}`,
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
    if (!APPLY_EVENT_RE.test(content)) {
      APPLY_EVENT_RE.lastIndex = 0;
      continue;
    }
    APPLY_EVENT_RE.lastIndex = 0;
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
const counts = { applyEvents: 0 };  // plural identifier, not the kind
const label = "apply events";        // label with space
`;

const DIRTY_FIXTURE = `
if (env.kind === 'applyEvent') {
  await db.write({ ... });
}
`;

export function selfTest() {
  const empty = { exceptions: [] };
  return {
    clean: scanText(CLEAN_FIXTURE, 'apps/x.ts', empty).length === 0,
    dirty: scanText(DIRTY_FIXTURE, 'apps/y.ts', empty).some((f) => f.rule === RULE),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const st = selfTest();
  console.log('scan-apply-event-misuse self-test:', st);
  if (!st.clean || !st.dirty) {
    console.error('self-test FAILED');
    process.exit(1);
  }
  const r = scan();
  console.log(JSON.stringify(r, null, 2));
  if (r.findings.length > 0) process.exit(1);
}
