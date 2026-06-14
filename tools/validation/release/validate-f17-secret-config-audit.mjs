#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { performance } from 'node:perf_hooks';

const VERSION = '0.1.0-f17.1.b';
const SCHEMA = 'h2o.release.secret-config-audit.v1';
const CLEAN = 'SECRET AUDIT CLEAN';
const WARNINGS = 'SECRET AUDIT WARNINGS';
const BLOCKED = 'SECRET AUDIT BLOCKED';
const ROOT = process.cwd();
const ALLOWLIST_PATH = 'tools/validation/release/secret-audit-allowlist.json';

const FLAGS = new Set(process.argv.slice(2));
const JSON_OUTPUT = FLAGS.has('--json');
const ARTIFACTS = FLAGS.has('--artifacts');

const BLOCKER_CODES = {
  COMMITTED_ENV: 'secret-audit-committed-env-file',
  SERVICE_ROLE: 'secret-audit-hardcoded-service-role',
  STRIPE_SECRET: 'secret-audit-hardcoded-stripe-secret',
  OAUTH_SECRET: 'secret-audit-hardcoded-oauth-client-secret',
  PRIVATE_KEY: 'secret-audit-private-key-material',
  TRACKED_BUILD: 'secret-audit-tracked-build-artifact',
  TRACKED_LOCAL_CONFIG: 'secret-audit-tracked-local-config',
  GITIGNORE_REMOVED: 'secret-audit-gitignore-rule-removed',
  ENTROPY: 'secret-audit-generic-high-entropy-secret'
};

const WARNING_CODES = {
  EXPO_CONFIG: 'secret-audit-expo-project-config-present',
  SUPABASE_ANON: 'secret-audit-supabase-anon-key-inline',
  SUPABASE_URL: 'secret-audit-supabase-url-inline',
  DEV_ENDPOINT: 'secret-audit-dev-endpoint-in-shippable',
  ALLOWLIST_STALE: 'secret-audit-allowlist-stale'
};

const SKIP_DIR_PREFIXES = [
  'node_modules/',
  'target/',
  '../archive/',
  '../meta/',
  '../changelog/'
];

const SOURCE_INCLUDE_PREFIXES = [
  'src-runtime-base/',
  'src-surfaces-base/',
  'apps/',
  'tools/',
  'supabase/',
  'config/'
];

const ROOT_CONFIG_FILES = new Set([
  '.gitignore',
  '.npmrc',
  '.yarnrc',
  'package.json',
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'Cargo.toml',
  'Cargo.lock',
  'tsconfig.json',
  'vite.config.js',
  'vite.config.ts'
]);

const LOCKFILE_NAMES = new Set([
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'Cargo.lock',
  'Podfile.lock'
]);

const BINARY_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.ico',
  '.icns',
  '.pdf',
  '.zip',
  '.gz',
  '.tgz',
  '.mp4',
  '.mov',
  '.woff',
  '.woff2',
  '.ttf',
  '.otf',
  '.wasm',
  '.dylib',
  '.so',
  '.dll',
  '.a',
  '.bin',
  '.sqlite',
  '.db'
]);

const SHIPPABLE_SURFACE_PREFIXES = [
  'src-runtime-base/',
  'src-surfaces-base/',
  'apps/studio/mobile/src/',
  'apps/site/src/',
  'apps/extensions/'
];

const ARTIFACT_ROOTS = [
  'apps/extensions',
  'build',
  'dist'
];

const PATTERNS = {
  STRIPE_SECRET: /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}\b/g,
  OAUTH_SECRET: /\bGOCSPX-[A-Za-z0-9_-]{16,}\b/g,
  PRIVATE_KEY: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g,
  JWT: /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/g,
  SUPABASE_URL: /https:\/\/[a-z0-9-]+\.supabase\.co\b/g,
  DEV_ENDPOINT: /\b(?:https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0)(?::\d+)?|https?:\/\/[A-Za-z0-9.-]*ngrok[A-Za-z0-9.-]*|https?:\/\/[A-Za-z0-9.-]*staging[A-Za-z0-9.-]*)\b/g,
  GENERIC_SECRET_ASSIGNMENT: /\b(?:secret|token|api[_-]?key|private[_-]?key|client[_-]?secret)\b[^=\n:]{0,40}[:=]\s*['"]([A-Za-z0-9_+./=-]{32,})['"]/gi
};

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed: ${result.stderr || result.stdout}`);
  }
  return result.stdout;
}

function toPosix(filePath) {
  return filePath.split(path.sep).join('/');
}

function gitTrackedFiles() {
  return run('git', ['ls-files'])
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function shouldIncludeSource(filePath) {
  if (SKIP_DIR_PREFIXES.some((prefix) => filePath.startsWith(prefix))) {
    return false;
  }
  if (LOCKFILE_NAMES.has(path.basename(filePath))) {
    return false;
  }
  return SOURCE_INCLUDE_PREFIXES.some((prefix) => filePath.startsWith(prefix)) || ROOT_CONFIG_FILES.has(filePath);
}

function shouldSkipTextRead(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return BINARY_EXTENSIONS.has(ext);
}

function safeReadText(filePath) {
  const abs = path.join(ROOT, filePath);
  const stat = fs.statSync(abs);
  if (!stat.isFile() || stat.size > 10 * 1024 * 1024 || shouldSkipTextRead(filePath)) {
    return null;
  }
  const buffer = fs.readFileSync(abs);
  if (buffer.includes(0)) {
    return null;
  }
  return buffer.toString('utf8');
}

function loadAllowlist() {
  const raw = fs.readFileSync(path.join(ROOT, ALLOWLIST_PATH), 'utf8');
  const parsed = JSON.parse(raw);
  const entries = Array.isArray(parsed.entries) ? parsed.entries : [];
  return entries.map((entry, index) => ({
    index,
    path: String(entry.path || ''),
    pattern: String(entry.pattern || ''),
    reason: String(entry.reason || ''),
    used: false
  }));
}

function pathMatchesAllowlist(entry, filePath) {
  if (entry.path.endsWith('/**')) {
    return filePath.startsWith(entry.path.slice(0, -3));
  }
  return filePath === entry.path;
}

function isAllowlisted(filePath, line, allowlist) {
  for (const entry of allowlist) {
    if (pathMatchesAllowlist(entry, filePath) && entry.pattern && line.includes(entry.pattern)) {
      entry.used = true;
      return true;
    }
  }
  return false;
}

function markAllowlistUsage(filePath, text, allowlist) {
  for (const entry of allowlist) {
    if (pathMatchesAllowlist(entry, filePath) && entry.pattern && text.includes(entry.pattern)) {
      entry.used = true;
    }
  }
}

function redact(value) {
  if (!value) {
    return '';
  }
  if (value.length <= 12) {
    return '[redacted]';
  }
  return `${value.slice(0, 4)}...[redacted]...${value.slice(-4)}`;
}

function finding({ severity, code, filePath, lineNumber = null, match = '', message }) {
  return {
    severity,
    code,
    path: filePath,
    line: lineNumber,
    match: redact(String(match)),
    message
  };
}

function addFinding(findings, candidate, line, allowlist) {
  if (candidate.path && line && isAllowlisted(candidate.path, line, allowlist)) {
    return;
  }
  findings.push(candidate);
}

function isEnvName(value) {
  return /^[A-Z][A-Z0-9_]{6,}$/.test(value);
}

function isExplicitTestSentinel(value) {
  return /should[_-]?not[_-]?be[_-]?stored/i.test(value);
}

function isScannerTaxonomyLiteral(value) {
  return /^secret-audit-[a-z0-9-]+$/.test(value);
}

function isServiceRoleJwt(line, token) {
  if (!token) {
    return false;
  }
  if (/Deno\.env\.get|process\.env|import\.meta\.env/.test(line)) {
    return false;
  }
  return /service[_-]?role/i.test(line);
}

function scanTextFile(filePath, text, allowlist, mode = 'source') {
  const findings = [];
  const lines = text.split(/\r?\n/);
  markAllowlistUsage(filePath, text, allowlist);

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    const checks = [
      [PATTERNS.STRIPE_SECRET, BLOCKER_CODES.STRIPE_SECRET, 'Hardcoded Stripe secret key literal is forbidden.'],
      [PATTERNS.OAUTH_SECRET, BLOCKER_CODES.OAUTH_SECRET, 'Hardcoded OAuth client secret literal is forbidden.'],
      [PATTERNS.PRIVATE_KEY, BLOCKER_CODES.PRIVATE_KEY, 'Private key material is forbidden in tracked or shipped files.']
    ];

    for (const [regex, code, message] of checks) {
      regex.lastIndex = 0;
      for (const match of line.matchAll(regex)) {
        addFinding(findings, finding({
          severity: 'blocker',
          code,
          filePath,
          lineNumber,
          match: match[0],
          message
        }), line, allowlist);
      }
    }

    PATTERNS.JWT.lastIndex = 0;
    for (const match of line.matchAll(PATTERNS.JWT)) {
      if (isServiceRoleJwt(line, match[0])) {
        addFinding(findings, finding({
          severity: 'blocker',
          code: BLOCKER_CODES.SERVICE_ROLE,
          filePath,
          lineNumber,
          match: match[0],
          message: 'Hardcoded Supabase service-role JWT-like token is forbidden.'
        }), line, allowlist);
      } else if (mode === 'source' && !isDesignatedPublicConfig(filePath)) {
        addFinding(findings, finding({
          severity: 'warning',
          code: WARNING_CODES.SUPABASE_ANON,
          filePath,
          lineNumber,
          match: match[0],
          message: 'Inline Supabase anon JWT-like token should be confined to designated public config.'
        }), line, allowlist);
      }
    }

    PATTERNS.SUPABASE_URL.lastIndex = 0;
    for (const match of line.matchAll(PATTERNS.SUPABASE_URL)) {
      if (mode === 'source' && !isDesignatedPublicConfig(filePath)) {
        addFinding(findings, finding({
          severity: 'warning',
          code: WARNING_CODES.SUPABASE_URL,
          filePath,
          lineNumber,
          match: match[0],
          message: 'Inline Supabase URL outside designated config should be reviewed before release.'
        }), line, allowlist);
      }
    }

    PATTERNS.DEV_ENDPOINT.lastIndex = 0;
    for (const match of line.matchAll(PATTERNS.DEV_ENDPOINT)) {
      if (isShippableSurface(filePath) && !line.includes('ipc.localhost')) {
        addFinding(findings, finding({
          severity: 'warning',
          code: WARNING_CODES.DEV_ENDPOINT,
          filePath,
          lineNumber,
          match: match[0],
          message: 'Development endpoint appears in a shippable surface.'
        }), line, allowlist);
      }
    }

    PATTERNS.GENERIC_SECRET_ASSIGNMENT.lastIndex = 0;
    for (const match of line.matchAll(PATTERNS.GENERIC_SECRET_ASSIGNMENT)) {
      const value = match[1] || '';
      if (
        isEnvName(value)
        || isExplicitTestSentinel(value)
        || isScannerTaxonomyLiteral(value)
        || /Deno\.env\.get|process\.env|import\.meta\.env/.test(line)
      ) {
        continue;
      }
      addFinding(findings, finding({
        severity: 'blocker',
        code: BLOCKER_CODES.ENTROPY,
        filePath,
        lineNumber,
        match: value,
        message: 'Credential-shaped high-entropy literal is forbidden outside the allowlist.'
      }), line, allowlist);
    }
  });

  return findings;
}

function isDesignatedPublicConfig(filePath) {
  return filePath.startsWith('config/') || filePath.endsWith('/mobileConfig.ts') || filePath.includes('/config/');
}

function isShippableSurface(filePath) {
  return SHIPPABLE_SURFACE_PREFIXES.some((prefix) => filePath.startsWith(prefix));
}

function trackedPathFindings(filePath) {
  const findings = [];
  const basename = path.basename(filePath);
  if (basename === '.env' || basename.startsWith('.env.') || /\.env(?:\..*)?\.local$/.test(filePath)) {
    findings.push(finding({
      severity: 'blocker',
      code: BLOCKER_CODES.COMMITTED_ENV,
      filePath,
      message: 'Tracked env files are forbidden in release source.'
    }));
  }
  if (/^config\/local\/.*\.local\.json$/.test(filePath)) {
    findings.push(finding({
      severity: 'blocker',
      code: BLOCKER_CODES.TRACKED_LOCAL_CONFIG,
      filePath,
      message: 'Tracked local config files are forbidden.'
    }));
  }
  if (/^(?:build\/|dist\/|apps\/extensions\/[^/]+\/(?:chrome|firefox)\/(?!README\.md$).+)/.test(filePath)) {
    findings.push(finding({
      severity: 'blocker',
      code: BLOCKER_CODES.TRACKED_BUILD,
      filePath,
      message: 'Tracked generated build artifact is forbidden in release source.'
    }));
  }
  if (/^apps\/[^/]+\/(?:eas\.json|app\.config\.[jt]s)$/.test(filePath) || /\/eas\.json$/.test(filePath)) {
    findings.push(finding({
      severity: 'warning',
      code: WARNING_CODES.EXPO_CONFIG,
      filePath,
      message: 'Expo/EAS project config is present and should be reviewed for release.'
    }));
  }
  return findings;
}

function checkGitignoreIntegrity() {
  const text = fs.existsSync(path.join(ROOT, '.gitignore'))
    ? fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8')
    : '';
  const rules = [
    {
      name: 'root-env',
      ok: text.includes('/.env')
    },
    {
      name: 'root-env-star',
      ok: text.includes('/.env.*')
    },
    {
      name: 'app-local-env',
      ok: text.includes('apps/**/.env*.local')
    },
    {
      name: 'config-local',
      ok: text.includes('config/local/') || text.includes('config/local/identity-provider.local.json')
    },
    {
      name: 'extension-artifacts',
      ok: text.includes('apps/extensions/chatgpt/chrome/**')
        || text.includes('apps/extensions/*/chrome/**')
        || text.includes('apps/extensions/claude/chrome/**')
    },
    {
      name: 'build-output',
      ok: text.includes('build/**') || text.includes('/dist') || text.includes('web-build')
    }
  ];
  const missing = rules.filter((rule) => !rule.ok).map((rule) => rule.name);
  return {
    ok: missing.length === 0,
    missing,
    checked: rules.map((rule) => rule.name)
  };
}

function walkFiles(dir) {
  const absDir = path.join(ROOT, dir);
  if (!fs.existsSync(absDir)) {
    return [];
  }
  const out = [];
  const stack = [absDir];
  while (stack.length) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const abs = path.join(current, entry.name);
      const rel = toPosix(path.relative(ROOT, abs));
      if (entry.isDirectory()) {
        if (rel.includes('/node_modules') || rel.includes('/target')) {
          continue;
        }
        stack.push(abs);
      } else if (entry.isFile()) {
        out.push(rel);
      }
    }
  }
  return out;
}

function scanArtifacts(allowlist) {
  const artifactFiles = ARTIFACT_ROOTS.flatMap((root) => walkFiles(root))
    .filter((filePath) => !shouldSkipTextRead(filePath));
  const findings = [];
  let filesScanned = 0;
  for (const filePath of artifactFiles) {
    const text = safeReadText(filePath);
    if (text == null) {
      continue;
    }
    filesScanned += 1;
    findings.push(...scanTextFile(filePath, text, allowlist, 'artifact')
      .filter((item) => item.severity === 'blocker'));
  }
  return {
    requested: ARTIFACTS,
    present: artifactFiles.length > 0,
    filesScanned,
    findings
  };
}

function runAudit() {
  const started = performance.now();
  const allowlist = loadAllowlist();
  const tracked = gitTrackedFiles();
  const sourceFiles = tracked.filter(shouldIncludeSource);
  const findings = [];
  let filesScanned = 0;

  for (const filePath of sourceFiles) {
    findings.push(...trackedPathFindings(filePath));
    const text = safeReadText(filePath);
    if (text == null) {
      continue;
    }
    filesScanned += 1;
    findings.push(...scanTextFile(filePath, text, allowlist, 'source'));
  }

  const gitignoreIntegrity = checkGitignoreIntegrity();
  for (const missing of gitignoreIntegrity.missing) {
    findings.push(finding({
      severity: 'blocker',
      code: BLOCKER_CODES.GITIGNORE_REMOVED,
      filePath: '.gitignore',
      match: missing,
      message: `Required gitignore protection is missing: ${missing}.`
    }));
  }

  for (const entry of allowlist) {
    if (!entry.used) {
      findings.push(finding({
        severity: 'warning',
        code: WARNING_CODES.ALLOWLIST_STALE,
        filePath: entry.path,
        match: entry.pattern,
        message: 'Allowlist entry did not match scanned source and may be stale.'
      }));
    }
  }

  const artifactScan = ARTIFACTS
    ? scanArtifacts(allowlist)
    : { requested: false, present: false, filesScanned: 0, findings: [] };
  findings.push(...artifactScan.findings);

  const blockers = findings.filter((item) => item.severity === 'blocker');
  const warnings = findings.filter((item) => item.severity === 'warning');
  const verdict = blockers.length > 0 ? BLOCKED : warnings.length > 0 ? WARNINGS : CLEAN;

  return {
    schema: SCHEMA,
    version: VERSION,
    verdict,
    ok: blockers.length === 0,
    filesScanned: filesScanned + artifactScan.filesScanned,
    findings,
    blockers: blockers.map((item) => item.code),
    warnings: warnings.map((item) => item.code),
    allowlistEntriesConsulted: allowlist.filter((entry) => entry.used).length,
    gitignoreIntegrity,
    artifactScan: {
      requested: artifactScan.requested,
      present: artifactScan.present,
      filesScanned: artifactScan.filesScanned
    },
    durationMs: Math.round(performance.now() - started),
    observedAtIso: new Date().toISOString()
  };
}

function printHuman(result) {
  console.log(`F17 Secret/Config Audit: ${result.verdict}`);
  console.log(`schema: ${result.schema}`);
  console.log(`version: ${result.version}`);
  console.log(`files scanned: ${result.filesScanned}`);
  console.log(`findings: ${result.findings.length}`);
  console.log(`blockers: ${result.blockers.length}`);
  console.log(`warnings: ${result.warnings.length}`);
  console.log(`allowlist entries consulted: ${result.allowlistEntriesConsulted}`);
  console.log(`gitignore integrity: ${result.gitignoreIntegrity.ok ? 'ok' : 'blocked'}`);
  console.log(`artifact scan: ${result.artifactScan.requested ? `${result.artifactScan.filesScanned} files` : 'not requested'}`);
  if (result.findings.length > 0) {
    console.log('');
    for (const item of result.findings.slice(0, 50)) {
      const where = item.line ? `${item.path}:${item.line}` : item.path;
      console.log(`${item.severity.toUpperCase()} ${item.code} ${where} ${item.message}`);
    }
    if (result.findings.length > 50) {
      console.log(`... ${result.findings.length - 50} additional findings omitted; use --json for full output.`);
    }
  }
}

const result = runAudit();
if (JSON_OUTPUT) {
  console.log(JSON.stringify(result, null, 2));
} else {
  printHuman(result);
}
process.exitCode = result.ok ? 0 : 1;
