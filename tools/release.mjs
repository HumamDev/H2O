#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const TOOL_FILE = fileURLToPath(import.meta.url);
const TOOL_DIR = path.dirname(TOOL_FILE);
const REPO_ROOT = path.resolve(TOOL_DIR, "..");
const CHANGELOG_DIR = path.join(REPO_ROOT, "scripts");
const VERSIONS_CSV_PATH = path.join(REPO_ROOT, "versions.csv");

const USERSCRIPT_HEADER_RE = /\/\/\s*==UserScript==[\s\S]*?\/\/\s*==\/UserScript==/;
const SAFE_ID_RE = /^[a-z0-9._-]+$/;
const CC_SUBJECT_RE = /^([a-z]+)(?:\(([^()\r\n]+)\))?(!)?:\s+(.+)$/;
const CSV_HEADER = "\"date\",\"script_id\",\"version\",\"bump\",\"summary\",\"commit_sha\"";
const BUMP_PRIORITY = Object.freeze({ patch: 1, minor: 2, major: 3 });
const GIT_LOG_FORMAT = "%H%x1f%s%x1f%b%x1e";

let semver;

try {
  semver = await loadSemver();
  await main();
} catch (err) {
  fatal(err);
}

async function loadSemver() {
  try {
    const mod = await import("semver");
    return mod.default || mod;
  } catch {
    throw new Error("Missing dependency \"semver\". Run `npm install` before `npm run release`.");
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  ensureGitRepo();
  const headSha = requireHeadCommit();
  const allTags = listGitTags();

  const sourceDir = pickScriptSourceDir();
  const scripts = discoverScripts(sourceDir);
  if (!scripts.length) {
    throw new Error(`No .user.js scripts found in ${displayPath(sourceDir)}.`);
  }

  const scriptById = new Map();
  for (const script of scripts) {
    if (scriptById.has(script.scriptId)) {
      const prev = scriptById.get(script.scriptId);
      throw new Error(
        `Duplicate scriptId "${script.scriptId}" from ${displayPath(prev.filePath)} and ${displayPath(script.filePath)}.`,
      );
    }
    scriptById.set(script.scriptId, script);
  }

  let receiptsByScript = null;
  if (args.mode === "file") {
    receiptsByScript = loadBumpReceipts(scriptById);
  }

  const logCache = new Map();
  const releaseDate = new Date().toISOString().slice(0, 10);
  const planned = [];

  for (const script of scripts) {
    const lastRelease = findLatestReleaseTag(allTags, script.scriptId);
    const decision =
      args.mode === "file"
        ? buildDecisionFromReceipts(script, receiptsByScript, headSha)
        : buildDecisionFromCommits(script, lastRelease, logCache);

    if (!decision) continue;

    const nextVersion = computeNextVersion(script.versionInfo.baseVersion, decision.bump);
    const tagName = `${script.scriptId}-${nextVersion}`;
    if (allTags.includes(tagName)) {
      throw new Error(`Tag already exists: ${tagName}`);
    }

    planned.push({
      ...script,
      mode: args.mode,
      receipts: decision.receipts || null,
      bump: decision.bump,
      notes: decision.notes,
      sourceCommitSha: decision.sourceCommitSha,
      nextVersion,
      tagName,
      lastTag: lastRelease ? lastRelease.tag : null,
      releaseDate,
    });
  }

  if (!planned.length) {
    if (args.dryRun) {
      console.log(`[dry-run] mode=${args.mode} source=${displayPath(sourceDir)} candidates=0`);
      console.log("[dry-run] nothing to release");
      return;
    }
    console.log("nothing to release");
    return;
  }

  if (args.dryRun) {
    printDryRunPlan(planned, args, sourceDir);
    return;
  }

  ensureDir(CHANGELOG_DIR);

  console.log(
    `[release] mode=${args.mode} source=${displayPath(sourceDir)} candidates=${planned.length}`,
  );

  for (const release of planned) {
    applyRelease(release);
    allTags.push(release.tagName);
  }

  console.log(`[release] done (${planned.length} script${planned.length === 1 ? "" : "s"})`);
}

function parseArgs(argv) {
  let mode = "commits";
  let dryRun = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
    if (arg === "--mode") {
      const next = argv[i + 1];
      if (!next) throw new Error("Missing value after --mode");
      mode = String(next).trim();
      i += 1;
      continue;
    }
    if (arg.startsWith("--mode=")) {
      mode = String(arg.slice("--mode=".length)).trim();
      continue;
    }
    if (arg === "--dry-run" || arg === "--dry") {
      dryRun = true;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  if (mode !== "commits" && mode !== "file") {
    throw new Error(`Invalid mode "${mode}". Expected "commits" or "file".`);
  }

  return { mode, dryRun };
}

function printHelp() {
  console.log("Usage: npm run release [-- --mode=commits|file] [--dry-run|--dry]");
}

function ensureGitRepo() {
  try {
    const inside = runGit(["rev-parse", "--is-inside-work-tree"]).stdout.trim();
    if (inside !== "true") {
      throw new Error("not a git work tree");
    }
  } catch {
    throw new Error("Not a git repository. Run `git init` and create an initial commit first.");
  }
}

function requireHeadCommit() {
  try {
    return runGit(["rev-parse", "HEAD"]).stdout.trim();
  } catch {
    throw new Error("Git repository has no commits yet. Create an initial commit before releasing.");
  }
}

function listGitTags() {
  const out = runGit(["tag", "--list"]).stdout;
  return out
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function pickScriptSourceDir() {
  const scriptsDir = path.join(REPO_ROOT, "scripts");
  if (fs.existsSync(scriptsDir) && fs.statSync(scriptsDir).isDirectory()) {
    const entries = fs.readdirSync(scriptsDir, { withFileTypes: true });
    const hasUserScripts = entries.some((e) => e.isFile() && e.name.endsWith(".user.js"));
    if (hasUserScripts) return scriptsDir;
  }
  return REPO_ROOT;
}

function discoverScripts(sourceDir) {
  const entries = fs.readdirSync(sourceDir, { withFileTypes: true });
  const out = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!entry.name.endsWith(".user.js")) continue;
    const filePath = path.join(sourceDir, entry.name);
    out.push(readScriptDescriptor(filePath));
  }
  out.sort((a, b) => a.scriptId.localeCompare(b.scriptId));
  return out;
}

function readScriptDescriptor(filePath) {
  const fileText = fs.readFileSync(filePath, "utf8");
  const headerMatch = fileText.match(USERSCRIPT_HEADER_RE);
  if (!headerMatch || headerMatch.index == null) {
    throw new Error(`Missing userscript header in ${displayPath(filePath)}.`);
  }
  const headerText = headerMatch[0];

  const versionMatch = headerText.match(/^\/\/\s*@version\s+(.+?)\s*$/m);
  if (!versionMatch) {
    throw new Error(`Missing // @version in ${displayPath(filePath)}.`);
  }
  const rawVersion = String(versionMatch[1]).trim();
  const versionInfo = parseCurrentVersion(rawVersion, filePath);

  const idMatch = headerText.match(/^\/\/\s*@h2o-id\s+(.+?)\s*$/m);
  let scriptId;
  let hasHeaderId = false;
  if (idMatch) {
    hasHeaderId = true;
    scriptId = String(idMatch[1]).trim();
    if (!SAFE_ID_RE.test(scriptId)) {
      throw new Error(
        `Invalid @h2o-id "${scriptId}" in ${displayPath(filePath)}. Use lowercase [a-z0-9._-] only.`,
      );
    }
  } else {
    scriptId = deriveScriptIdFromFileName(path.basename(filePath));
    if (!scriptId) {
      throw new Error(`Could not derive scriptId from filename: ${displayPath(filePath)}.`);
    }
  }

  return {
    filePath,
    fileName: path.basename(filePath),
    scriptId,
    hasHeaderId,
    versionInfo,
  };
}

function parseCurrentVersion(rawVersion, filePath) {
  const strict = semver.valid(rawVersion);
  if (strict) {
    const parsed = semver.parse(strict);
    if (!parsed) {
      throw new Error(`Unable to parse version "${rawVersion}" in ${displayPath(filePath)}.`);
    }
    return {
      rawVersion,
      parsedVersion: strict,
      baseVersion: `${parsed.major}.${parsed.minor}.${parsed.patch}`,
      wasLegacyCoerced: false,
    };
  }

  const isLegacyNumeric = /^\d+$/.test(rawVersion) || /^\d+\.\d+$/.test(rawVersion);
  if (isLegacyNumeric) {
    const coerced = semver.coerce(rawVersion);
    if (!coerced) {
      throw new Error(`Unable to coerce legacy version "${rawVersion}" in ${displayPath(filePath)}.`);
    }
    return {
      rawVersion,
      parsedVersion: coerced.version,
      baseVersion: coerced.version,
      wasLegacyCoerced: true,
    };
  }

  throw new Error(
    `Invalid @version "${rawVersion}" in ${displayPath(filePath)}. Expected SemVer (X.Y.Z) or legacy X / X.Y.`,
  );
}

function deriveScriptIdFromFileName(fileName) {
  const stem = fileName.replace(/\.user\.js$/i, "");
  return stem
    .normalize("NFKD")
    .toLowerCase()
    .replace(/\s+/g, ".")
    .replace(/[^a-z0-9._-]+/g, "")
    .replace(/\.+/g, ".")
    .replace(/^\.+|\.+$/g, "");
}

function findLatestReleaseTag(allTags, scriptId) {
  const prefix = `${scriptId}-`;
  let best = null;
  for (const tag of allTags) {
    // Exact prefix match only; non-semver suffixes are ignored below.
    if (!tag.startsWith(prefix)) continue;
    const versionPart = tag.slice(prefix.length);
    const valid = semver.valid(versionPart);
    if (!valid) continue;
    if (!best || semver.gt(valid, best.version)) {
      best = { tag, version: valid };
    }
  }
  return best;
}

function buildDecisionFromCommits(script, lastRelease, logCache) {
  const rangeSpec = lastRelease ? `${lastRelease.tag}..HEAD` : "HEAD";
  const commits = getGitCommits(rangeSpec, logCache);

  const matches = [];
  for (const commit of commits) {
    const bump = classifyCommitForScript(commit, script.scriptId);
    if (!bump) continue;
    matches.push({
      bump,
      commit,
    });
  }

  if (!matches.length) return null;

  const bump = highestBump(matches.map((m) => m.bump));
  const notes = matches.map((m) => `${m.commit.subject} (${m.commit.shortSha})`);

  return {
    bump,
    notes,
    sourceCommitSha: matches[0].commit.sha,
  };
}

function getGitCommits(rangeSpec, logCache) {
  if (logCache.has(rangeSpec)) return logCache.get(rangeSpec);

  const out = runGit(["log", "--no-decorate", `--format=${GIT_LOG_FORMAT}`, rangeSpec]).stdout;
  const commits = parseGitLogOutput(out);
  logCache.set(rangeSpec, commits);
  return commits;
}

function parseGitLogOutput(text) {
  const records = text.split("\x1e");
  const commits = [];
  for (const rawRecord of records) {
    const record = rawRecord.replace(/\s+$/g, "");
    if (!record) continue;
    const parts = record.split("\x1f");
    const sha = String(parts[0] || "").trim();
    const subject = String(parts[1] || "").trim();
    const body = String(parts.slice(2).join("\x1f") || "");
    if (!sha) continue;
    commits.push({
      sha,
      shortSha: sha.slice(0, 7),
      subject,
      body,
    });
  }
  return commits;
}

function classifyCommitForScript(commit, scriptId) {
  const match = commit.subject.match(CC_SUBJECT_RE);
  if (!match) return null;

  const type = String(match[1] || "").toLowerCase();
  const scope = match[2] ? String(match[2]).trim() : "";
  const bang = Boolean(match[3]);

  if (scope !== scriptId) return null;

  if (hasBreakingChange(commit.body)) {
    return "major";
  }

  if (type === "feat" && bang) {
    return "major";
  }

  if (type === "feat") {
    return "minor";
  }

  if (type === "fix" || type === "perf" || type === "refactor" || type === "style") {
    return "patch";
  }

  return null;
}

function hasBreakingChange(body) {
  return /(^|\r?\n)BREAKING CHANGE:\s+/m.test(body);
}

function highestBump(bumps) {
  let best = null;
  for (const bump of bumps) {
    if (!best || BUMP_PRIORITY[bump] > BUMP_PRIORITY[best]) {
      best = bump;
    }
  }
  return best;
}

function buildDecisionFromReceipts(script, receiptsByScript, headSha) {
  const receipts = receiptsByScript.get(script.scriptId);
  if (!receipts || receipts.length === 0) return null;

  const bump = highestBump(receipts.map((r) => r.bump));
  const notes = receipts.map((r) => r.summary);
  return {
    bump,
    notes,
    receipts: receipts.slice(),
    sourceCommitSha: headSha,
  };
}

function loadBumpReceipts(scriptById) {
  const bumpDir = path.join(REPO_ROOT, ".bump");
  const byScript = new Map();

  if (!fs.existsSync(bumpDir)) return byScript;
  if (!fs.statSync(bumpDir).isDirectory()) {
    throw new Error(`${displayPath(bumpDir)} exists but is not a directory.`);
  }

  const receiptRe = /^(\d{4}-\d{2}-\d{2})_(.+)_(major|minor|patch)\.md$/;
  const entries = fs.readdirSync(bumpDir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const m = entry.name.match(receiptRe);
    if (!m) continue;

    const [, , scriptId, bump] = m;
    if (!SAFE_ID_RE.test(scriptId)) {
      throw new Error(`Invalid scriptId in receipt filename: ${entry.name}`);
    }
    if (!scriptById.has(scriptId)) {
      throw new Error(`Receipt ${entry.name} references unknown scriptId "${scriptId}".`);
    }

    const filePath = path.join(bumpDir, entry.name);
    const fileText = fs.readFileSync(filePath, "utf8");
    const summary = String(fileText.split(/\r?\n/)[0] || "").trim() || `(empty receipt ${entry.name})`;

    if (!byScript.has(scriptId)) byScript.set(scriptId, []);
    byScript.get(scriptId).push({
      fileName: entry.name,
      filePath,
      scriptId,
      bump,
      summary,
    });
  }

  return byScript;
}

function computeNextVersion(baseVersion, bump) {
  const next = semver.inc(baseVersion, bump);
  if (!next) {
    throw new Error(`Failed to compute ${bump} bump from ${baseVersion}.`);
  }
  return next;
}

function applyRelease(release) {
  const changeInfo = rewriteUserscriptVersionAndId(release.filePath, release.scriptId, release.nextVersion);

  const changelogPath = path.join(CHANGELOG_DIR, `${release.scriptId}.CHANGELOG.md`);
  appendScriptChangelog(changelogPath, release.scriptId, release.nextVersion, release.notes);

  appendVersionsCsvRow({
    date: release.releaseDate,
    script_id: release.scriptId,
    version: release.nextVersion,
    bump: release.bump,
    summary: summarizeNotes(release.notes),
    commit_sha: release.sourceCommitSha,
  });

  const relScript = toRepoRel(release.filePath);
  const relChangelog = toRepoRel(changelogPath);
  const relCsv = toRepoRel(VERSIONS_CSV_PATH);

  runGit(["add", "--", relScript, relChangelog, relCsv]);
  runGit(["commit", "-m", `chore(release:${release.scriptId}): ${release.nextVersion}`]);
  runGit(["tag", release.tagName]);
  if (release.mode === "file" && Array.isArray(release.receipts) && release.receipts.length > 0) {
    moveAppliedReceipts(release.scriptId, release.receipts);
  }

  const idMsg = changeInfo.insertedH2oId ? " +@h2o-id" : "";
  console.log(
    `[release] ${release.scriptId}: ${release.versionInfo.rawVersion} -> ${release.nextVersion} (${release.bump}, ${release.notes.length} note${release.notes.length === 1 ? "" : "s"})${idMsg} tag=${release.tagName}`,
  );
}

function rewriteUserscriptVersionAndId(filePath, scriptId, nextVersion) {
  const text = fs.readFileSync(filePath, "utf8");
  const headerMatch = text.match(USERSCRIPT_HEADER_RE);
  if (!headerMatch || headerMatch.index == null) {
    throw new Error(`Missing userscript header in ${displayPath(filePath)} during release.`);
  }

  const newline = detectNewline(text);
  const header = headerMatch[0];
  let nextHeader = header;

  const idMatch = header.match(/^\/\/\s*@h2o-id\s+(.+?)\s*$/m);
  let insertedH2oId = false;
  if (idMatch) {
    const currentId = String(idMatch[1]).trim();
    if (currentId !== scriptId) {
      throw new Error(
        `Script ID mismatch in ${displayPath(filePath)}. Header has "${currentId}" but planned release uses "${scriptId}".`,
      );
    }
  } else {
    insertedH2oId = true;
    const insertLine = `// @h2o-id      ${scriptId}`;
    if (/^\/\/\s*==UserScript==\s*$/m.test(nextHeader)) {
      nextHeader = nextHeader.replace(
        /(^\/\/\s*==UserScript==\s*$)/m,
        (_line) => `${_line}${newline}${insertLine}`,
      );
    } else {
      throw new Error(`Could not find // ==UserScript== line in ${displayPath(filePath)}.`);
    }
  }

  if (!/^\/\/\s*@version\s+.+$/m.test(nextHeader)) {
    throw new Error(`Missing // @version in ${displayPath(filePath)} during release.`);
  }
  nextHeader = nextHeader.replace(
    /^(\s*\/\/\s*@version\s+)(\S+)(.*)$/m,
    (_full, prefix, _oldValue, suffix) => `${prefix}${nextVersion}${suffix}`,
  );

  if (nextHeader === header) {
    throw new Error(`No header changes produced for ${displayPath(filePath)}.`);
  }

  const start = headerMatch.index;
  const end = start + header.length;
  const nextText = `${text.slice(0, start)}${nextHeader}${text.slice(end)}`;
  fs.writeFileSync(filePath, nextText);

  return { insertedH2oId };
}

function appendScriptChangelog(changelogPath, scriptId, version, notes) {
  ensureDir(path.dirname(changelogPath));
  const exists = fs.existsSync(changelogPath);
  let text = exists ? fs.readFileSync(changelogPath, "utf8") : "";
  const newline = detectNewline(text || "\n");

  if (!exists) {
    text = `# ${scriptId} changelog${newline}${newline}`;
  } else if (text.length > 0 && !text.endsWith("\n") && !text.endsWith("\r\n")) {
    text += newline;
  }

  text += `## ${version}${newline}`;
  for (const note of notes) {
    text += `- ${note}${newline}`;
  }
  text += newline;

  fs.writeFileSync(changelogPath, text);
}

function appendVersionsCsvRow(row) {
  const fields = ["date", "script_id", "version", "bump", "summary", "commit_sha"];
  const line = fields.map((key) => csvField(row[key])).join(",");
  const exists = fs.existsSync(VERSIONS_CSV_PATH);

  if (!exists) {
    fs.writeFileSync(VERSIONS_CSV_PATH, `${CSV_HEADER}\n${line}\n`);
    return;
  }

  let text = fs.readFileSync(VERSIONS_CSV_PATH, "utf8");
  const firstLine = String(text.split(/\r?\n/, 1)[0] || "");
  if (firstLine !== CSV_HEADER) {
    throw new Error(`versions.csv header mismatch in ${displayPath(VERSIONS_CSV_PATH)}.`);
  }

  if (text.length > 0 && !text.endsWith("\n") && !text.endsWith("\r\n")) {
    text += "\n";
  }
  text += `${line}\n`;
  fs.writeFileSync(VERSIONS_CSV_PATH, text);
}

function printDryRunPlan(planned, args, sourceDir) {
  console.log(`[dry-run] mode=${args.mode} source=${displayPath(sourceDir)} candidates=${planned.length}`);
  for (const release of planned) {
    console.log(
      `[dry-run] ${release.scriptId}: ${release.versionInfo.rawVersion} -> ${release.nextVersion} (${release.bump}) tag=${release.tagName} notes=${release.notes.length}`,
    );
  }
}

function moveAppliedReceipts(scriptId, receipts) {
  const appliedDir = path.join(REPO_ROOT, ".bump", "_applied");
  ensureDir(appliedDir);

  for (const receipt of receipts) {
    const srcPath = receipt && receipt.filePath ? receipt.filePath : path.join(REPO_ROOT, ".bump", String(receipt?.fileName || ""));
    const fileName = receipt && receipt.fileName ? receipt.fileName : path.basename(srcPath);
    const dstPath = path.join(appliedDir, fileName);

    if (!fs.existsSync(srcPath)) {
      throw new Error(
        `Failed to move applied receipt for ${scriptId}: source missing ${displayPath(srcPath)}.`,
      );
    }
    if (fs.existsSync(dstPath)) {
      throw new Error(
        `Failed to move applied receipt for ${scriptId}: destination exists ${displayPath(dstPath)}.`,
      );
    }

    try {
      fs.renameSync(srcPath, dstPath);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(
        `Failed to move applied receipt for ${scriptId}: ${displayPath(srcPath)} -> ${displayPath(dstPath)} (${msg})`,
      );
    }
  }
}

function summarizeNotes(notes) {
  if (!notes || notes.length === 0) return "";
  if (notes.length === 1) return notes[0];
  return `${notes[0]} (+${notes.length - 1} more)`;
}

function csvField(value) {
  const s = String(value ?? "").replace(/\r?\n/g, " ").replace(/"/g, "\"\"");
  return `"${s}"`;
}

function detectNewline(text) {
  return text.includes("\r\n") ? "\r\n" : "\n";
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function toRepoRel(absPath) {
  const rel = path.relative(REPO_ROOT, absPath);
  if (!rel || rel === "") return ".";
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error(`Path is outside repo root: ${absPath}`);
  }
  return rel;
}

function displayPath(absPath) {
  const rel = path.relative(REPO_ROOT, absPath);
  if (!rel || rel === "") return ".";
  return rel;
}

function runGit(args) {
  const result = spawnSync("git", args, {
    cwd: REPO_ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.error) {
    throw new Error(`Failed to run git ${quoteArgs(args)}: ${result.error.message}`);
  }

  if (result.status !== 0) {
    const stderr = String(result.stderr || "").trim();
    const stdout = String(result.stdout || "").trim();
    const detail = stderr || stdout || `exit ${result.status}`;
    throw new Error(`git ${quoteArgs(args)} failed: ${detail}`);
  }

  return {
    stdout: String(result.stdout || ""),
    stderr: String(result.stderr || ""),
  };
}

function quoteArgs(args) {
  return args
    .map((a) => (/\s/.test(a) ? JSON.stringify(a) : a))
    .join(" ");
}

function fatal(err) {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`[release] ERROR: ${msg}`);
  if (err instanceof Error && err.stack && process.env.H2O_RELEASE_DEBUG) {
    console.error(err.stack);
  }
  process.exit(1);
}
