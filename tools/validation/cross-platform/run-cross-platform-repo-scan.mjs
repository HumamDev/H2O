#!/usr/bin/env node
/**
 * F10.2.2 — cross-platform envelope repo validation scan orchestrator.
 *
 * Runs all 9 scans in tools/validation/cross-platform/scans/ and
 * produces a consolidated report.
 *
 * Flags:
 *   --strict              promote warnings to hard-fail
 *   --scan <name>         run a single scan (e.g. scan-kind-literal-drift)
 *   --diff <ref>          override default staged-diff with HEAD..<ref>
 *                         for the lockfile-drift scan only
 *   --include-unstaged    add unstaged working-tree changes to the
 *                         lockfile-drift scan input set
 *   --json                emit consolidated report as JSON
 *   --help                show usage
 *
 * Exit codes:
 *   0  no hard-fail findings
 *   1  one or more findings (or warnings in --strict mode)
 *
 * Pure read-only. No mutation, no network, no install, no I/O outside
 * stdout/stderr.
 */

import { loadAllowlist } from './scans/util.mjs';

import { scan as scanKindLiteralDrift } from './scans/scan-kind-literal-drift.mjs';
import { scan as scanBlockerCodeDrift } from './scans/scan-blocker-code-drift.mjs';
import { scan as scanHelperForbiddenPatterns } from './scans/scan-helper-forbidden-patterns.mjs';
import { scan as scanApplyEventMisuse } from './scans/scan-apply-event-misuse.mjs';
import { scan as scanMobileWriteBack } from './scans/scan-mobile-write-back.mjs';
import { scan as scanCacheMetadataMisuse } from './scans/scan-cache-metadata-misuse.mjs';
import { scan as scanForeverNoFields } from './scans/scan-forever-no-fields.mjs';
import { scan as scanLockfileDrift } from './scans/scan-lockfile-drift.mjs';
import { scan as scanRuntimeImportGraph } from './scans/scan-runtime-import-graph.mjs';

const SCANS = {
  'scan-kind-literal-drift': scanKindLiteralDrift,
  'scan-blocker-code-drift': scanBlockerCodeDrift,
  'scan-helper-forbidden-patterns': scanHelperForbiddenPatterns,
  'scan-apply-event-misuse': scanApplyEventMisuse,
  'scan-mobile-write-back': scanMobileWriteBack,
  'scan-cache-metadata-misuse': scanCacheMetadataMisuse,
  'scan-forever-no-fields': scanForeverNoFields,
  'scan-lockfile-drift': scanLockfileDrift,
  'scan-runtime-import-graph': scanRuntimeImportGraph,
};

function parseArgs(argv) {
  const args = {
    strict: false,
    scan: null,
    diff: null,
    includeUnstaged: false,
    json: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--strict') args.strict = true;
    else if (a === '--scan') args.scan = argv[++i];
    else if (a === '--diff') args.diff = argv[++i];
    else if (a === '--include-unstaged') args.includeUnstaged = true;
    else if (a === '--json') args.json = true;
    else if (a === '--help' || a === '-h') args.help = true;
    else if (a.startsWith('--')) {
      console.error(`Unknown flag: ${a}`);
      process.exit(2);
    }
  }
  return args;
}

function printHelp() {
  console.log(`F10.2.2 cross-platform repo scan

Usage:
  node tools/validation/cross-platform/run-cross-platform-repo-scan.mjs [flags]

Flags:
  --strict              Promote warnings to hard-fail.
  --scan <name>         Run a single scan by name. Names:
                          ${Object.keys(SCANS).join('\n                          ')}
  --diff <ref>          Compare HEAD vs <ref> instead of staged diff for
                        lockfile-drift scan.
  --include-unstaged    Add unstaged working-tree changes to lockfile-drift
                        inspection set.
  --json                Emit consolidated report as JSON on stdout.
  --help, -h            Show this help.

Exit code:
  0 — no hard-fail findings (or --strict + no warnings)
  1 — one or more findings (or warnings in --strict mode)
`);
}

function fmtFinding(f) {
  const where = f.line != null ? `${f.path}:${f.line}` : f.path;
  return `  [${f.rule}] ${where}\n    ${f.message}`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    process.exit(0);
  }
  let allowlist;
  try {
    allowlist = loadAllowlist();
  } catch (e) {
    console.error(`Allowlist error: ${e.message}`);
    process.exit(2);
  }

  let scansToRun;
  if (args.scan) {
    if (!SCANS[args.scan]) {
      console.error(`Unknown scan: ${args.scan}`);
      console.error(`Known scans: ${Object.keys(SCANS).join(', ')}`);
      process.exit(2);
    }
    scansToRun = [[args.scan, SCANS[args.scan]]];
  } else {
    scansToRun = Object.entries(SCANS);
  }

  const reports = [];
  for (const [name, fn] of scansToRun) {
    const opts = { allowlist };
    if (name === 'scan-lockfile-drift') {
      if (args.diff) opts.diffMode = { mode: 'ref', ref: args.diff };
      opts.includeUnstaged = args.includeUnstaged;
    }
    let report;
    try {
      report = await fn(opts);
    } catch (e) {
      report = {
        scanName: name,
        ruleIds: [],
        findings: [
          {
            rule: 'scan-runtime-error',
            path: '(orchestrator)',
            line: null,
            message: `scan threw: ${e.message}`,
          },
        ],
        warnings: [],
        durationMs: 0,
        skippedReason: null,
      };
    }
    reports.push(report);
  }

  if (args.json) {
    const out = {
      schema: 'h2o.cross-platform.repo-scan.v1',
      strict: args.strict,
      reports,
    };
    console.log(JSON.stringify(out, null, 2));
  } else {
    console.log('F10.2.2 cross-platform repo scan');
    console.log('================================');
    for (const r of reports) {
      const ruleList = r.ruleIds.join(', ');
      const durMs = r.durationMs ?? 0;
      const status =
        r.findings.length === 0 && r.warnings.length === 0
          ? 'OK'
          : r.findings.length > 0
            ? `FAIL (${r.findings.length})`
            : `WARN (${r.warnings.length})`;
      const skipped = r.skippedReason ? ` [skipped: ${r.skippedReason}]` : '';
      console.log(`\n▸ ${r.scanName} — ${status} — ${durMs}ms${skipped}`);
      console.log(`  rules: ${ruleList}`);
      for (const f of r.findings) console.log(fmtFinding(f));
      for (const w of r.warnings) console.log(fmtFinding(w));
    }
    console.log('');
  }

  const totalFindings = reports.reduce((acc, r) => acc + r.findings.length, 0);
  const totalWarnings = reports.reduce((acc, r) => acc + r.warnings.length, 0);
  console.log(`Summary: ${totalFindings} findings, ${totalWarnings} warnings`);

  const failed = totalFindings > 0 || (args.strict && totalWarnings > 0);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
