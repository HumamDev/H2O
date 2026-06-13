#!/usr/bin/env node
// F16 Library Sync production release gate.
// Thin orchestrator only: runs existing validators and aggregates results.

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const NODE = process.execPath;
const VERSION = '0.1.0-f16.5.b';
const SCHEMA = 'h2o.desktop.sync.library-production-release-gate.v1';

const args = new Set(process.argv.slice(2));
const jsonMode = args.has('--json');
const approveStaged = args.has('--approve-staged');
const heavyRequested = args.has('--heavy') || process.env.F16_SOAK_HEAVY === '1' || process.env.F16_STRESS_HEAVY === '1';
const cargoRequested = args.has('--cargo');
const studioAttested = args.has('--studio-attested');

const DEFAULT_GROUPS = [
  {
    group: 'F15 closure',
    commands: [
      ['validate-f15-library-closure', ['tools/validation/sync/validate-f15-library-closure.mjs']],
      ['validate-f15-library-sync-proof', ['tools/validation/sync/validate-f15-library-sync-proof.mjs']],
      ['validate-f15-cutover', ['tools/validation/sync/validate-f15-cutover.mjs']],
      ['validate-f15-bulk-migration', ['tools/validation/sync/validate-f15-bulk-migration.mjs']],
      ['validate-f15-library-conflict-contract', ['tools/validation/sync/validate-f15-library-conflict-contract.mjs']],
      ['validate-f15-folder-binding-absorption', ['tools/validation/sync/validate-f15-folder-binding-absorption.mjs']],
      ['validate-f15-library-sync-ui', ['tools/validation/sync/validate-f15-library-sync-ui.mjs']]
    ]
  },
  {
    group: 'F16 hardening',
    commands: [
      ['validate-f16-library-conflict-runtime', ['tools/validation/sync/validate-f16-library-conflict-runtime.mjs']],
      ['validate-f16-library-multipeer-soak', ['tools/validation/sync/validate-f16-library-multipeer-soak.mjs']],
      ['validate-f16-library-performance-stress', ['tools/validation/sync/validate-f16-library-performance-stress.mjs']],
      ['validate-f16-folder-bindings-trigger-decision', ['tools/validation/sync/validate-f16-folder-bindings-trigger-decision.mjs']]
    ]
  },
  {
    group: 'Parity',
    commands: [
      ['validate-f7-folder-metadata-hash-parity', ['tools/validation/sync/validate-f7-folder-metadata-hash-parity.mjs']]
    ]
  },
  {
    group: 'Cross-platform',
    commands: [
      ['run-cross-platform-repo-scan', ['tools/validation/cross-platform/run-cross-platform-repo-scan.mjs']],
      ['validate-cross-platform-envelope', ['tools/validation/cross-platform/validate-cross-platform-envelope.mjs']]
    ]
  }
];

const OPTIONAL_COMMANDS = [
  {
    name: 'heavy-soak',
    group: 'Optional',
    args: ['tools/validation/sync/validate-f16-library-multipeer-soak.mjs'],
    env: { F16_SOAK_HEAVY: '1' },
    enabled: heavyRequested,
    skippedWarning: 'release-gate-heavy-soak-not-run'
  },
  {
    name: 'heavy-stress',
    group: 'Optional',
    args: ['tools/validation/sync/validate-f16-library-performance-stress.mjs'],
    env: { F16_STRESS_HEAVY: '1' },
    enabled: heavyRequested,
    skippedWarning: 'release-gate-heavy-stress-not-run'
  },
  {
    name: 'cargo-check',
    group: 'Optional',
    command: 'cargo',
    args: ['check'],
    cwd: path.join(REPO_ROOT, 'apps/studio/desktop/src-tauri'),
    enabled: cargoRequested,
    skippedWarning: 'release-gate-cargo-check-not-run'
  }
];

function run(command) {
  const executable = command.command || NODE;
  const childArgs = command.command ? command.args : command.args;
  const env = { ...process.env, ...(command.env || {}) };
  const result = spawnSync(executable, childArgs, {
    cwd: command.cwd || REPO_ROOT,
    env,
    encoding: 'utf8'
  });
  return {
    name: command.name,
    group: command.group,
    command: commandText(executable, childArgs, command.env),
    ok: result.status === 0 && !result.error,
    status: result.status,
    signal: result.signal,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    error: result.error ? result.error.message : null
  };
}

function commandText(executable, childArgs, env) {
  const envPrefix = env ? `${Object.entries(env).map(([key, value]) => `${key}=${value}`).join(' ')} ` : '';
  const commandName = executable === NODE ? 'node' : executable;
  return `${envPrefix}${commandName} ${childArgs.join(' ')}`;
}

function parseGitState() {
  const result = spawnSync('git', ['status', '--porcelain'], {
    cwd: REPO_ROOT,
    encoding: 'utf8'
  });
  const lines = (result.stdout || '').split(/\r?\n/).filter(Boolean);
  const staged = [];
  const unstaged = [];
  for (const line of lines) {
    const indexStatus = line.slice(0, 1);
    const worktreeStatus = line.slice(1, 2);
    const file = line.slice(3);
    if (line.startsWith('??')) {
      unstaged.push(file);
      continue;
    }
    if (indexStatus && indexStatus !== ' ') staged.push(file);
    if (worktreeStatus && worktreeStatus !== ' ') unstaged.push(file);
  }
  return {
    ok: result.status === 0 && !result.error,
    raw: lines,
    staged,
    unstaged,
    hasStaged: staged.length > 0,
    hasUnstaged: unstaged.length > 0
  };
}

function blockerForCheck(check) {
  if (check.name === 'validate-f7-folder-metadata-hash-parity') return 'release-gate-f7-parity-regression';
  if (check.name === 'run-cross-platform-repo-scan' || check.name === 'validate-cross-platform-envelope') {
    return 'release-gate-cross-platform-scan-failed';
  }
  if (check.name === 'validate-f16-library-conflict-runtime') return 'release-gate-conflict-runtime-unavailable';
  if (check.name === 'validate-f16-library-multipeer-soak' || check.name === 'heavy-soak') return 'release-gate-soak-proof-failed';
  if (check.name === 'validate-f16-library-performance-stress' || check.name === 'heavy-stress') return 'release-gate-performance-anomaly-miss';
  if (check.name === 'validate-f16-folder-bindings-trigger-decision') return 'release-gate-folder-trigger-proof-failed';
  return `release-gate-default-validator-failed:${check.name}`;
}

function summarizeOutput(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-8);
}

function emitHuman(output) {
  console.log('\n== F16 Library production release gate ===========================');
  console.log(`Verdict: ${output.verdict}`);
  console.log(`Default checks: ${output.passCount}/${output.defaultCheckCount} passed, ${output.failCount} failed`);
  console.log(`Warnings: ${output.warnings.length}`);
  console.log(`Blockers: ${output.blockers.length}`);
  console.log('');

  for (const group of DEFAULT_GROUPS) {
    console.log(`-- ${group.group} ------------------------------------------------`);
    for (const check of output.checks.filter((entry) => entry.group === group.group)) {
      console.log(`${check.ok ? 'OK' : 'FAIL'} ${check.name}`);
      if (!check.ok) {
        for (const line of check.stderrSummary.concat(check.stdoutSummary)) {
          console.log(`  ${line}`);
        }
      }
    }
    console.log('');
  }

  console.log('-- Optional ------------------------------------------------');
  for (const check of output.optional.checks) {
    if (check.skipped) {
      console.log(`SKIP ${check.name}`);
    } else {
      console.log(`${check.ok ? 'OK' : 'FAIL'} ${check.name}`);
    }
  }
  console.log('');

  if (output.warnings.length) {
    console.log('Warnings:');
    for (const warning of output.warnings) console.log(`- ${warning}`);
  }
  if (output.blockers.length) {
    console.log('Blockers:');
    for (const blocker of output.blockers) console.log(`- ${blocker}`);
  }
}

const gitState = parseGitState();
const blockers = [];
const warnings = [];

if (gitState.hasUnstaged) warnings.push('release-gate-unrelated-unstaged-wip');
if (gitState.hasStaged && !approveStaged) blockers.push('release-gate-staged-files-not-approved');

const checks = [];
for (const group of DEFAULT_GROUPS) {
  for (const [name, commandArgs] of group.commands) {
    const result = run({ name, group: group.group, args: commandArgs });
    if (!result.ok) blockers.push(blockerForCheck(result));
    checks.push({
      name: result.name,
      group: result.group,
      command: result.command,
      ok: result.ok,
      status: result.status,
      signal: result.signal,
      error: result.error,
      stdoutSummary: summarizeOutput(result.stdout),
      stderrSummary: summarizeOutput(result.stderr)
    });
  }
}

const optionalChecks = [];
for (const optional of OPTIONAL_COMMANDS) {
  if (!optional.enabled) {
    warnings.push(optional.skippedWarning);
    optionalChecks.push({
      name: optional.name,
      group: optional.group,
      skipped: true,
      warning: optional.skippedWarning
    });
    continue;
  }
  const result = run(optional);
  if (!result.ok) blockers.push(blockerForCheck(result));
  optionalChecks.push({
    name: result.name,
    group: result.group,
    command: result.command,
    ok: result.ok,
    skipped: false,
    status: result.status,
    signal: result.signal,
    error: result.error,
    stdoutSummary: summarizeOutput(result.stdout),
    stderrSummary: summarizeOutput(result.stderr)
  });
}

if (!studioAttested) warnings.push('release-gate-studio-runtime-not-attested');

const passCount = checks.filter((check) => check.ok).length;
const failCount = checks.length - passCount;
const skippedCount = optionalChecks.filter((check) => check.skipped).length;
const verdict = blockers.length
  ? 'RELEASE NOT READY'
  : warnings.length
    ? 'RELEASE CONDITIONALLY READY'
    : 'RELEASE READY';

const output = {
  schema: SCHEMA,
  version: VERSION,
  verdict,
  ok: blockers.length === 0,
  gitState,
  checks,
  defaultCheckCount: checks.length,
  passCount,
  failCount,
  skippedCount,
  blockers: Array.from(new Set(blockers)),
  warnings: Array.from(new Set(warnings)),
  optional: {
    heavyRequested,
    cargoRequested,
    studioAttested,
    checks: optionalChecks
  },
  observedAtIso: new Date().toISOString()
};

if (jsonMode) {
  console.log(JSON.stringify(output, null, 2));
} else {
  emitHuman(output);
}

process.exit(output.ok ? 0 : 1);
