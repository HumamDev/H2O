#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const VERSION = '0.1.0-f17.5.b';
const SCHEMA = 'h2o.release.evidence-bundle.v1';
const READY = 'RELEASE EVIDENCE READY';
const CONDITIONAL = 'RELEASE EVIDENCE CONDITIONAL';
const INCOMPLETE = 'RELEASE EVIDENCE INCOMPLETE';
const BLOCKED = 'RELEASE EVIDENCE BLOCKED';
const ROOT = process.cwd();

const EXPECTED_SCHEMAS = {
  gateLibrary: 'h2o.desktop.sync.library-production-release-gate.v1',
  secretAudit: 'h2o.release.secret-config-audit.v1',
  buildPackage: 'h2o.release.build-package-validation.v1',
  migrationRollback: 'h2o.release.migration-rollback-validation.v1'
};

const VALIDATOR_COMMANDS = [
  {
    key: 'gateLibrary',
    name: 'gate:library',
    command: 'npm',
    args: ['run', '--silent', 'gate:library', '--', '--json']
  },
  {
    key: 'secretAudit',
    name: 'audit:secrets',
    command: 'npm',
    args: ['run', '--silent', 'audit:secrets', '--', '--json']
  },
  {
    key: 'buildPackage',
    name: 'validate:build',
    command: 'npm',
    args: ['run', '--silent', 'validate:build', '--', '--json']
  },
  {
    key: 'migrationRollback',
    name: 'validate:migration',
    command: 'npm',
    args: ['run', '--silent', 'validate:migration', '--', '--json']
  }
];

const FORBIDDEN_BUNDLE_PATTERNS = [
  { code: 'evidence-bundle-raw-db-file-reference', re: /(?:^|["'\s])[^"'\s]*(?:\.db|\.sqlite)(?:["'\s]|$)/i },
  { code: 'evidence-bundle-raw-backup-reference', re: /(?:^|["'\s])[^"'\s]*\.bak(?:["'\s]|$)/i },
  { code: 'evidence-bundle-wal-shm-reference', re: /(?:^|["'\s])[^"'\s]*(?:-wal|-shm)(?:["'\s]|$)/i },
  { code: 'evidence-bundle-env-reference', re: /(?:^|["'\s])\.env(?:\.[^"'\s]+)?(?:["'\s]|$)/i },
  { code: 'evidence-bundle-local-config-reference', re: /config\/local\//i },
  { code: 'evidence-bundle-private-key', re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/ },
  { code: 'evidence-bundle-stripe-secret', re: /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}\b/ },
  { code: 'evidence-bundle-oauth-secret', re: /\bGOCSPX-[A-Za-z0-9_-]{16,}\b/ },
  { code: 'evidence-bundle-jwt-secret', re: /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/ }
];

function parseArgs(argv) {
  const args = {
    attestation: null,
    json: false,
    zip: false,
    dryRun: false,
    includeOptional: false
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--attestation') {
      args.attestation = argv[index + 1] || null;
      index += 1;
    } else if (arg === '--json') {
      args.json = true;
    } else if (arg === '--zip') {
      args.zip = true;
    } else if (arg === '--dry-run') {
      args.dryRun = true;
    } else if (arg === '--include-optional') {
      args.includeOptional = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ...(options.env || {}) }
  });
  return {
    command: `${command} ${args.join(' ')}`,
    ok: result.status === 0,
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    error: result.error ? String(result.error.message || result.error) : null
  };
}

function git(args) {
  const result = run('git', args);
  return result.ok ? result.stdout.trim() : '';
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function safeWriteJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function extractJson(stdout) {
  const text = String(stdout || '').trim();
  if (!text) {
    throw new Error('empty JSON output');
  }
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first < 0 || last < first) {
    throw new Error('JSON object not found in output');
  }
  return JSON.parse(text.slice(first, last + 1));
}

function isInsidePath(parent, candidate) {
  const parentAbs = path.resolve(parent);
  const candidateAbs = path.resolve(candidate);
  const rel = path.relative(parentAbs, candidateAbs);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

function defaultOutputDir(headShort) {
  return path.resolve(ROOT, '..', 'release-evidence', todayIsoDate(), headShort);
}

function ensureOutputOutsideRepo(outputDir) {
  if (isInsidePath(ROOT, outputDir)) {
    throw new Error(`Refusing to write evidence inside source tree: ${outputDir}`);
  }
}

function collectValidator(commandSpec) {
  const result = run(commandSpec.command, commandSpec.args);
  let parsed = null;
  const blockers = [];
  const warnings = [];
  if (!result.ok) {
    blockers.push(`evidence-bundle-validator-command-failed:${commandSpec.name}`);
  }
  try {
    parsed = extractJson(result.stdout);
  } catch (error) {
    blockers.push(`evidence-bundle-validator-json-missing:${commandSpec.name}`);
    warnings.push(String(error?.message || error));
  }
  if (parsed?.schema !== EXPECTED_SCHEMAS[commandSpec.key]) {
    blockers.push(`evidence-bundle-validator-schema-mismatch:${commandSpec.name}`);
  }
  return {
    key: commandSpec.key,
    name: commandSpec.name,
    command: result.command,
    ok: result.ok && blockers.length === 0,
    status: result.status,
    schema: parsed?.schema || null,
    parsed,
    stdout: result.stdout,
    stderrTail: result.stderr.trim().split('\n').filter(Boolean).slice(-8),
    blockers,
    warnings
  };
}

function summarizeFindings(findings) {
  if (!Array.isArray(findings)) return [];
  return findings.map((finding) => ({
    code: finding.code || finding.type || finding.rule || 'secret-audit-finding',
    severity: finding.severity || (finding.blocker ? 'blocker' : 'warning'),
    path: finding.path || finding.file || null,
    line: finding.line || null
  }));
}

function reduceSecretAudit(secretAudit) {
  if (!secretAudit) return null;
  return {
    schema: secretAudit.schema,
    version: secretAudit.version,
    verdict: secretAudit.verdict,
    ok: secretAudit.ok,
    filesScanned: secretAudit.filesScanned,
    findingCount: Array.isArray(secretAudit.findings) ? secretAudit.findings.length : secretAudit.findings,
    findings: summarizeFindings(secretAudit.findings),
    blockerCodes: Array.isArray(secretAudit.blockers) ? secretAudit.blockers.map(String) : [],
    warningCodes: Array.isArray(secretAudit.warnings) ? secretAudit.warnings.map(String) : [],
    allowlistEntriesConsulted: secretAudit.allowlistEntriesConsulted,
    gitignoreIntegrity: secretAudit.gitignoreIntegrity,
    artifactScan: secretAudit.artifactScan
  };
}

function summarizeValidatorOutput(key, parsed) {
  if (!parsed) return null;
  if (key === 'secretAudit') {
    return sanitizeForBundle(reduceSecretAudit(parsed));
  }
  return sanitizeForBundle(parsed);
}

function appVersion() {
  const desktopPackage = readJson(path.join(ROOT, 'apps/studio/desktop/package.json'));
  return desktopPackage.version || null;
}

function loadAttestation(attestationPath) {
  if (!attestationPath) return { value: null, sourcePath: null, missing: true };
  const resolved = path.resolve(ROOT, attestationPath);
  if (!fs.existsSync(resolved)) {
    return { value: null, sourcePath: resolved, missing: true };
  }
  return {
    value: readJson(resolved),
    sourcePath: resolved,
    missing: false
  };
}

function getPath(obj, paths) {
  for (const parts of paths) {
    let cursor = obj;
    for (const part of parts) {
      cursor = cursor?.[part];
    }
    if (cursor !== undefined && cursor !== null && cursor !== '') return cursor;
  }
  return null;
}

function validateAttestation(attestation, release) {
  const incompleteFields = [];
  const blockers = [];
  const warnings = [];
  if (!attestation) {
    incompleteFields.push('attestation');
    blockers.push('evidence-bundle-attestation-missing');
    return { incompleteFields, blockers, warnings };
  }

  const required = [
    ['operatorId', getPath(attestation, [['operatorId'], ['operator', 'id']])],
    ['operatorSignature', getPath(attestation, [['operatorSignature'], ['signature'], ['operator', 'signature']])],
    ['timestamp', getPath(attestation, [['timestamp'], ['observedAtIso'], ['attestedAtIso']])],
    ['headCommit', getPath(attestation, [['headCommit'], ['release', 'headCommit'], ['commitSha']])],
    ['appVersion', getPath(attestation, [['appVersion'], ['release', 'appVersion']])],
    ['platform', getPath(attestation, [['platform'], ['platform', 'os'], ['os']])],
    ['runtimeSmoke', getPath(attestation, [['runtimeSmoke'], ['runtime']])],
    ['devToolsProofs', getPath(attestation, [['devToolsProofs'], ['devtoolsProofs'], ['proofs']])],
    ['backup', getPath(attestation, [['backup'], ['backupAttestation']])],
    ['extension', getPath(attestation, [['extension'], ['extensionSmoke']])]
  ];

  for (const [name, value] of required) {
    if (value === null) incompleteFields.push(`attestation.${name}`);
  }

  const attestationHead = getPath(attestation, [['headCommit'], ['release', 'headCommit'], ['commitSha']]);
  if (attestationHead && attestationHead !== release.headCommit) {
    warnings.push('evidence-bundle-attestation-head-mismatch');
  }

  const runtimeVerdict = String(getPath(attestation, [['runtimeSmoke', 'verdict'], ['runtimeSmoke', 'status'], ['runtime', 'verdict']]) || '').toLowerCase();
  const runtimeOk = getPath(attestation, [['runtimeSmoke', 'ok'], ['runtime', 'ok']]);
  if (runtimeOk === false || runtimeVerdict.includes('fail') || runtimeVerdict.includes('block')) {
    blockers.push('evidence-bundle-runtime-smoke-failed');
  }

  const backupOk = getPath(attestation, [['backup', 'ok'], ['backupAttestation', 'ok']]);
  if (backupOk === false) {
    blockers.push('evidence-bundle-backup-attestation-failed');
  }

  const proofs = getPath(attestation, [['devToolsProofs'], ['devtoolsProofs'], ['proofs']]);
  const proofList = Array.isArray(proofs) ? proofs : Object.values(proofs || {});
  if (proofList.some((proof) => proof?.ok === false)) {
    blockers.push('evidence-bundle-devtools-proof-failed');
  }

  return { incompleteFields, blockers, warnings };
}

function reduceRuntimeSmoke(attestation) {
  if (!attestation) return null;
  const runtimeSmoke = getPath(attestation, [['runtimeSmoke'], ['runtime']]);
  const proofs = getPath(attestation, [['devToolsProofs'], ['devtoolsProofs'], ['proofs']]);
  return {
    runtimeSmoke: runtimeSmoke || null,
    devToolsProofs: reduceProofs(proofs)
  };
}

function reduceProofs(proofs) {
  if (!proofs) return null;
  const entries = Array.isArray(proofs)
    ? proofs.map((proof, index) => [proof.name || proof.caseId || `proof-${index + 1}`, proof])
    : Object.entries(proofs);
  return Object.fromEntries(entries.map(([name, proof]) => [name, {
    ok: proof?.ok,
    version: proof?.version,
    caseCount: proof?.caseCount ?? proof?.scenarioCount ?? proof?.phaseCount ?? null,
    passCount: proof?.passCount ?? null,
    failCount: proof?.failCount ?? null,
    realBusinessTableWritten: proof?.sideEffectSummary?.realBusinessTableWritten ?? proof?.sideEffectSummary?.realBusinessTableWrites ?? false,
    sideEffectSummary: proof?.sideEffectSummary || null
  }]));
}

function reduceBackup(attestation) {
  if (!attestation) return null;
  const backup = getPath(attestation, [['backup'], ['backupAttestation']]);
  if (!backup) return null;
  return {
    ok: backup.ok,
    backupPath: backup.backupPath || backup.path || null,
    manifestHash: backup.manifestHash || backup.sha256 || backup.manifest?.sha256 || null,
    manifest: backup.manifest ? {
      size: backup.manifest.size,
      mtime: backup.manifest.mtime,
      sha256: backup.manifest.sha256,
      sourceAppVersion: backup.manifest.sourceAppVersion,
      targetAppVersion: backup.manifest.targetAppVersion,
      observedAtIso: backup.manifest.observedAtIso,
      sidecarCount: backup.manifest.sidecarCount
    } : null
  };
}

function reduceExtension(attestation) {
  if (!attestation) return null;
  const extension = getPath(attestation, [['extension'], ['extensionSmoke']]);
  if (!extension) return null;
  return {
    shipped: extension.shipped === true,
    result: extension.result || extension.verdict || null,
    ok: extension.ok,
    variant: extension.variant || null,
    nativeChatGptOk: extension.nativeChatGptOk,
    oauthOk: extension.oauthOk
  };
}

function validatorBlockersAndWarnings(collected) {
  const blockers = [];
  const warnings = [];
  for (const item of Object.values(collected)) {
    blockers.push(...item.blockers);
    warnings.push(...item.warnings);
    const parsed = item.parsed;
    if (Array.isArray(parsed?.blockers)) {
      blockers.push(...parsed.blockers.map((code) => `validator:${item.name}:${code}`));
    }
    if (Array.isArray(parsed?.warnings)) {
      warnings.push(...parsed.warnings.map((code) => `validator:${item.name}:${code}`));
    }
    if (parsed?.ok === false) {
      blockers.push(`evidence-bundle-validator-not-ok:${item.name}`);
    }
  }
  return { blockers, warnings };
}

function sanitizeForBundle(value) {
  if (Array.isArray(value)) return value.map(sanitizeForBundle);
  if (!value || typeof value !== 'object') {
    if (typeof value !== 'string') return value;
    if (/\.(?:db|sqlite|bak)(?:$|[?#])/i.test(value) || /(?:-wal|-shm)(?:$|[?#])/i.test(value)) {
      return '[redacted-db-or-backup-path]';
    }
    if (/config\/local\//i.test(value) || /(?:^|\/)\.env(?:\.|$)/i.test(value)) {
      return '[redacted-private-config-path]';
    }
    return value;
  }
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sanitizeForBundle(item)]));
}

function scanBundle(value) {
  const hits = new Set();
  function visit(node, trail = []) {
    if (Array.isArray(node)) {
      node.forEach((item, index) => visit(item, [...trail, String(index)]));
      return;
    }
    if (node && typeof node === 'object') {
      Object.entries(node).forEach(([key, item]) => visit(item, [...trail, key]));
      return;
    }
    if (typeof node !== 'string') return;
    const keyPath = trail.join('.');
    const isAllowedBackupPath = keyPath === 'backup.backupPath';
    for (const pattern of FORBIDDEN_BUNDLE_PATTERNS) {
      if (isAllowedBackupPath && ['evidence-bundle-raw-db-file-reference', 'evidence-bundle-raw-backup-reference'].includes(pattern.code)) {
        continue;
      }
      if (pattern.re.test(node)) hits.add(pattern.code);
    }
  }
  visit(value);
  return Array.from(hits);
}

function computeRollup({ collected, attestationCheck, bundleScanHits, outputInsideRepo }) {
  const fromValidators = validatorBlockersAndWarnings(collected);
  const blockers = [
    ...fromValidators.blockers,
    ...attestationCheck.blockers,
    ...bundleScanHits.map((code) => `evidence-bundle-redaction-failed:${code}`)
  ];
  if (outputInsideRepo) {
    blockers.push('evidence-bundle-output-inside-source-tree');
  }

  const warnings = [
    ...fromValidators.warnings,
    ...attestationCheck.warnings,
    'evidence-bundle-optional-heavy-cargo-tauri-not-included'
  ];

  const incompleteFields = [...attestationCheck.incompleteFields];
  let verdict = READY;
  if (blockers.some((code) => !code.includes('attestation-missing'))) {
    verdict = BLOCKED;
  } else if (incompleteFields.length > 0) {
    verdict = INCOMPLETE;
  } else if (warnings.length > 0 || blockers.length > 0) {
    verdict = CONDITIONAL;
  }
  return {
    verdict,
    blockers: Array.from(new Set(blockers)),
    warnings: Array.from(new Set(warnings)),
    incompleteFields: Array.from(new Set(incompleteFields))
  };
}

function buildMarkdownReport(bundle) {
  const lines = [];
  lines.push('# F17 Release Evidence Bundle');
  lines.push('');
  lines.push(`- Schema: \`${bundle.schema}\``);
  lines.push(`- Version: \`${bundle.version}\``);
  lines.push(`- Generated: \`${bundle.generatedAtIso}\``);
  lines.push(`- HEAD: \`${bundle.release.headCommit}\``);
  lines.push(`- Branch: \`${bundle.release.branch}\``);
  lines.push(`- App version: \`${bundle.release.appVersion}\``);
  lines.push(`- Verdict: **${bundle.rollup.verdict}**`);
  lines.push(`- Blockers: ${bundle.rollup.blockers.length}`);
  lines.push(`- Warnings: ${bundle.rollup.warnings.length}`);
  lines.push(`- Incomplete fields: ${bundle.rollup.incompleteFields.length}`);
  lines.push('');
  lines.push('## Validators');
  for (const [key, value] of Object.entries(bundle.validators)) {
    lines.push(`- ${key}: \`${value?.verdict || value?.schema || 'missing'}\``);
  }
  lines.push('');
  lines.push('## Rollup Blockers');
  lines.push(...(bundle.rollup.blockers.length ? bundle.rollup.blockers.map((item) => `- ${item}`) : ['- none']));
  lines.push('');
  lines.push('## Rollup Warnings');
  lines.push(...(bundle.rollup.warnings.length ? bundle.rollup.warnings.map((item) => `- ${item}`) : ['- none']));
  lines.push('');
  return `${lines.join('\n')}\n`;
}

function writeBundle({ outputDir, bundle, validatorJson, zip }) {
  ensureOutputOutsideRepo(outputDir);
  fs.mkdirSync(outputDir, { recursive: true });
  const validatorDir = path.join(outputDir, 'validators');
  fs.mkdirSync(validatorDir, { recursive: true });

  safeWriteJson(path.join(outputDir, 'evidence-bundle.json'), bundle);
  fs.writeFileSync(path.join(outputDir, 'evidence-report.md'), buildMarkdownReport(bundle));
  for (const [key, value] of Object.entries(validatorJson)) {
    safeWriteJson(path.join(validatorDir, `${key}.json`), value);
  }

  let zipResult = null;
  if (zip) {
    const zipName = `evidence-${bundle.release.headShortSha}-${todayIsoDate()}.zip`;
    const zipPath = path.join(outputDir, zipName);
    const result = run('zip', ['-qr', zipPath, 'evidence-bundle.json', 'evidence-report.md', 'validators'], { cwd: outputDir });
    zipResult = {
      path: zipPath,
      ok: result.ok,
      status: result.status,
      error: result.error,
      stderrTail: result.stderr.trim().split('\n').filter(Boolean).slice(-8)
    };
  }
  return { outputDir, zipResult };
}

function main() {
  const startedAt = new Date().toISOString();
  const args = parseArgs(process.argv.slice(2));
  const headCommit = git(['rev-parse', 'HEAD']);
  const headShortSha = headCommit.slice(0, 7);
  const branch = git(['branch', '--show-current']) || 'detached';
  const status = git(['status', '--porcelain']);
  const staged = git(['diff', '--cached', '--name-only']);
  const release = {
    headCommit,
    headShortSha,
    appVersion: appVersion(),
    branch,
    treeClean: status.length === 0,
    stagedApproved: staged.length === 0
  };
  const platform = {
    os: os.platform(),
    arch: os.arch(),
    node: process.version,
    operatorId: null
  };
  const outputDir = defaultOutputDir(headShortSha);
  const outputInsideRepo = isInsidePath(ROOT, outputDir);
  const collectedEntries = VALIDATOR_COMMANDS.map(collectValidator);
  const collected = Object.fromEntries(collectedEntries.map((item) => [item.key, item]));
  const validatorJson = Object.fromEntries(collectedEntries.map((item) => [item.key, sanitizeForBundle(item.parsed || { error: item.blockers })]));
  const validators = Object.fromEntries(collectedEntries.map((item) => [item.key, summarizeValidatorOutput(item.key, item.parsed)]));

  const attestation = loadAttestation(args.attestation);
  if (attestation.value) {
    platform.operatorId = getPath(attestation.value, [['operatorId'], ['operator', 'id']]);
  }
  const attestationCheck = validateAttestation(attestation.value, release);
  const runtime = reduceRuntimeSmoke(attestation.value);
  const bundleBase = {
    schema: SCHEMA,
    version: VERSION,
    generatedAtIso: startedAt,
    release,
    platform,
    validators,
    runtimeSmoke: runtime?.runtimeSmoke || null,
    devToolsProofs: runtime?.devToolsProofs || null,
    backup: reduceBackup(attestation.value),
    extension: reduceExtension(attestation.value),
    attestation: {
      sourcePath: attestation.sourcePath,
      present: !attestation.missing,
      complete: attestationCheck.incompleteFields.length === 0
    },
    optional: {
      includeOptional: args.includeOptional,
      zipRequested: args.zip,
      dryRun: args.dryRun
    },
    rollup: {
      verdict: READY,
      blockers: [],
      warnings: [],
      incompleteFields: []
    },
    observedAtIso: new Date().toISOString()
  };

  const bundleScanHits = scanBundle(bundleBase);
  bundleBase.rollup = computeRollup({
    collected,
    attestationCheck,
    bundleScanHits,
    outputInsideRepo
  });

  const writeResult = args.dryRun
    ? { outputDir, zipResult: null, dryRun: true }
    : writeBundle({ outputDir, bundle: bundleBase, validatorJson, zip: args.zip });

  const result = {
    ...bundleBase,
    output: {
      directory: outputDir,
      dryRun: args.dryRun,
      written: !args.dryRun,
      zip: writeResult.zipResult || null
    }
  };

  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`F17 Evidence Bundle: ${result.rollup.verdict}`);
    console.log(`schema: ${result.schema}`);
    console.log(`version: ${result.version}`);
    console.log(`output: ${outputDir}${args.dryRun ? ' (dry-run)' : ''}`);
    console.log(`validators: ${collectedEntries.filter((item) => item.ok).length}/${collectedEntries.length} captured`);
    console.log(`blockers: ${result.rollup.blockers.length}`);
    console.log(`warnings: ${result.rollup.warnings.length}`);
    console.log(`incomplete fields: ${result.rollup.incompleteFields.length}`);
    if (result.rollup.blockers.length) {
      console.log('\nBlockers:');
      for (const blocker of result.rollup.blockers) console.log(`- ${blocker}`);
    }
    if (result.rollup.warnings.length) {
      console.log('\nWarnings:');
      for (const warning of result.rollup.warnings) console.log(`- ${warning}`);
    }
  }

  process.exit(result.rollup.verdict === BLOCKED ? 1 : 0);
}

try {
  main();
} catch (error) {
  const result = {
    schema: SCHEMA,
    version: VERSION,
    rollup: {
      verdict: BLOCKED,
      blockers: [String(error?.message || error)],
      warnings: [],
      incompleteFields: []
    },
    observedAtIso: new Date().toISOString()
  };
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.error(`F17 Evidence Bundle: ${BLOCKED}`);
    console.error(String(error?.message || error));
  }
  process.exit(1);
}
