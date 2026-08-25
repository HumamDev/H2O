#!/usr/bin/env node

/**
 * Read-only saved-chat storage measurement harness.
 *
 * This analysis tool measures copies and committed fixtures. It is not an
 * archive validator, a persistence authority, a migration, or a CI gate.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import childProcess from 'node:child_process';

const REPORT_SCHEMA = 'h2o.storageBaseline';
const REPORT_SCHEMA_VERSION = 1;
const PACKAGE_SCHEMA = 'h2o.savedChatPackage';
const FULL_BUNDLE_SCHEMAS = new Set([
  'h2o.studio.fullBundle.v2',
  'h2o.chatArchive.bundle.v1',
]);
const CORE_PACKAGE_FILES = new Set(['manifest.json', 'snapshot.json', 'chat.md', 'chat.html']);
const DB_TABLES = ['chats', 'snapshots', 'snapshot_turns', 'assets', 'snapshot_turn_assets'];
const DB_TURN_FIELDS = ['outer_html', 'text', 'meta_json'];
const SUPPORTED_CODECS = new Set(['gzip', 'zstd', 'brotli']);
const DEFAULT_CODECS = ['gzip', 'zstd', 'brotli'];
const PRECOMPRESSED_EXTENSIONS = new Set([
  '7z', 'aac', 'avif', 'br', 'bz2', 'flac', 'gif', 'gz', 'heic', 'heif',
  'jpeg', 'jpg', 'm4a', 'm4v', 'mov', 'mp3', 'mp4', 'ogg', 'opus', 'pdf',
  'png', 'rar', 'webm', 'webp', 'xz', 'zip', 'zst',
]);

function usage() {
  return [
    'Usage:',
    '  node tools/analysis/studio/measure-saved-chat-storage.mjs --package <dir> [--package <dir> ...] --out <report.json>',
    '  node tools/analysis/studio/measure-saved-chat-storage.mjs --db <copy.db> --cas <copy-dir> --sync <copy-dir> --out <report.json>',
    '',
    'Options: --package, --db, --cas, --sync, --out, --markdown, --baseline, --codecs',
  ].join('\n');
}

function fail(message) {
  throw new Error(message);
}

function parseArgs(argv) {
  const options = {
    packages: [],
    db: null,
    cas: null,
    sync: null,
    out: null,
    markdown: null,
    baseline: null,
    codecs: DEFAULT_CODECS.slice(),
  };
  const singular = new Set(['--db', '--cas', '--sync', '--out', '--markdown', '--baseline', '--codecs']);
  const seen = new Set();
  for (let i = 0; i < argv.length; i += 1) {
    const option = argv[i];
    if (option === '--help' || option === '-h') return { help: true };
    if (option !== '--package' && !singular.has(option)) fail(`unsupported option: ${option}`);
    if (i + 1 >= argv.length || argv[i + 1].startsWith('--')) fail(`missing value for ${option}`);
    const value = argv[++i];
    if (option === '--package') {
      options.packages.push(value);
      continue;
    }
    if (seen.has(option)) fail(`${option} may be supplied only once`);
    seen.add(option);
    const key = option.slice(2);
    if (key === 'codecs') {
      const codecs = value.split(',').map((part) => part.trim().toLowerCase()).filter(Boolean);
      if (!codecs.length) fail('--codecs must name at least one codec');
      for (const codec of codecs) {
        if (!SUPPORTED_CODECS.has(codec)) fail(`unsupported codec: ${codec}`);
      }
      options.codecs = [...new Set(codecs)];
    } else {
      options[key] = value;
    }
  }
  if (!options.out) fail('--out is required');
  if (!options.packages.length && !options.db && !options.cas && !options.sync) {
    fail('at least one of --package, --db, --cas, or --sync is required');
  }
  return options;
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) {
      if (typeof value[key] !== 'undefined') out[key] = canonicalize(value[key]);
    }
    return out;
  }
  return value;
}

function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

function sha256Buffer(buffer) {
  return `sha256-${crypto.createHash('sha256').update(buffer).digest('hex')}`;
}

function sha256Text(text) {
  return sha256Buffer(Buffer.from(String(text), 'utf8'));
}

function hashFile(filePath) {
  const hash = crypto.createHash('sha256');
  const fd = fs.openSync(filePath, 'r');
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  try {
    let bytesRead;
    do {
      bytesRead = fs.readSync(fd, buffer, 0, buffer.length, null);
      if (bytesRead) hash.update(buffer.subarray(0, bytesRead));
    } while (bytesRead);
  } finally {
    fs.closeSync(fd);
  }
  return `sha256-${hash.digest('hex')}`;
}

function byteLength(value) {
  return Buffer.byteLength(typeof value === 'string' ? value : '', 'utf8');
}

function round(value, digits = 6) {
  if (!Number.isFinite(value)) return null;
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function ratio(numerator, denominator) {
  return denominator > 0 ? round(numerator / denominator) : null;
}

function unavailable(reason) {
  return { status: 'unavailable', reason };
}

function normalizeSha(value) {
  const text = String(value ?? '').trim().toLowerCase();
  if (/^sha256-[0-9a-f]{64}$/.test(text)) return text;
  if (/^[0-9a-f]{64}$/.test(text)) return `sha256-${text}`;
  return '';
}

function safeSchemaIdentity(value) {
  const text = String(value ?? '').trim();
  return /^h2o\.[A-Za-z0-9._-]{1,123}$/.test(text) ? text : 'unrecognized';
}

function safeVersion(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const text = String(value ?? '').trim();
  return /^[A-Za-z0-9._-]{1,64}$/.test(text) ? text : null;
}

function realpathExistingPrefix(inputPath) {
  const absolute = path.resolve(inputPath);
  let cursor = absolute;
  const suffix = [];
  while (!fs.existsSync(cursor)) {
    const parent = path.dirname(cursor);
    if (parent === cursor) return absolute;
    suffix.unshift(path.basename(cursor));
    cursor = parent;
  }
  const resolved = fs.realpathSync.native(cursor);
  return path.resolve(resolved, ...suffix);
}

function isWithin(candidate, root) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function protectedRoots() {
  const home = os.homedir();
  return [
    path.join(home, 'Library', 'Application Support', 'org.h2o.studio.desktop'),
    path.join(home, 'H2O Studio Sync'),
    path.join(home, 'H2O Studio Exports'),
  ].map(realpathExistingPrefix);
}

function assertOutsideProtectedRoots(inputPath, label) {
  const resolved = realpathExistingPrefix(inputPath);
  for (const root of protectedRoots()) {
    if (isWithin(resolved, root)) fail(`${label} resolves under a protected live storage root`);
  }
  return resolved;
}

function inspectInput(inputPath, kind) {
  const resolved = assertOutsideProtectedRoots(inputPath, `${kind} input`);
  if (!fs.existsSync(resolved)) fail(`${kind} input does not exist: ${inputPath}`);
  const stat = fs.statSync(resolved);
  if (kind === 'db' || kind === 'baseline') {
    if (!stat.isFile()) fail(`${kind} input must be a regular file`);
  } else if (!stat.isDirectory()) {
    fail(`${kind} input must be a directory`);
  }
  if (kind === 'package' && !resolved.endsWith('.h2ochat')) fail('package input must end with .h2ochat');
  return resolved;
}

function inspectOutput(outputPath, label) {
  const resolved = assertOutsideProtectedRoots(outputPath, label);
  const parent = realpathExistingPrefix(path.dirname(resolved));
  if (!fs.existsSync(parent) || !fs.statSync(parent).isDirectory()) {
    fail(`${label} parent directory must already exist`);
  }
  if (fs.existsSync(resolved) && !fs.statSync(resolved).isFile()) fail(`${label} must be a regular file path`);
  return resolved;
}

function assertOutputAuthority(inputs, outputs) {
  if (outputs.markdown && outputs.markdown === outputs.out) fail('--out and --markdown must be different paths');
  const outputPaths = [outputs.out, outputs.markdown].filter(Boolean);
  for (const outputPath of outputPaths) {
    for (const input of inputs) {
      if (outputPath === input.path) fail('output path collides with an input path');
      if (input.kind === 'package' || input.kind === 'cas' || input.kind === 'sync') {
        if (isWithin(outputPath, input.path)) fail(`output path may not be inside a ${input.kind} input`);
      }
      if (input.kind === 'db' && isWithin(outputPath, path.dirname(input.path))) {
        fail('output path may not be inside the database input directory');
      }
    }
  }
}

function inventoryTree(root) {
  const rootReal = fs.realpathSync.native(root);
  const files = [];
  const visitedDirectories = new Set();

  function visit(directory, relativeDirectory) {
    const directoryReal = fs.realpathSync.native(directory);
    if (!isWithin(directoryReal, rootReal)) fail('input tree contains a directory symlink escaping its root');
    if (visitedDirectories.has(directoryReal)) fail('input tree contains a directory symlink cycle');
    visitedDirectories.add(directoryReal);
    const entries = fs.readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const fullPath = path.join(directory, entry.name);
      const relativePath = relativeDirectory ? path.join(relativeDirectory, entry.name) : entry.name;
      const lstat = fs.lstatSync(fullPath);
      if (lstat.isSymbolicLink()) {
        const target = fs.realpathSync.native(fullPath);
        if (!isWithin(target, rootReal)) fail('input tree contains a symlink escaping its root');
        const targetStat = fs.statSync(target);
        if (targetStat.isDirectory()) visit(target, relativePath);
        else if (targetStat.isFile()) files.push({ fullPath: target, relativePath, bytes: targetStat.size });
        else fail('input tree contains an unsupported symlink target');
      } else if (entry.isDirectory()) {
        visit(fullPath, relativePath);
      } else if (entry.isFile()) {
        files.push({ fullPath, relativePath, bytes: lstat.size });
      } else {
        fail('input tree contains an unsupported filesystem entry');
      }
    }
    visitedDirectories.delete(directoryReal);
  }

  visit(rootReal, '');
  return files.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

function parseJsonFile(filePath, label) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    fail(`${label} is malformed JSON: ${error.message}`);
  }
}

function hrtimeMs(start) {
  return Number(process.hrtime.bigint() - start) / 1e6;
}

function executableAvailable(command) {
  const pathValue = String(process.env.PATH ?? '');
  for (const directory of pathValue.split(path.delimiter).filter(Boolean)) {
    const candidate = path.join(directory, command);
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return true;
    } catch (_) {
      // Continue probing the already-configured PATH only.
    }
  }
  return false;
}

function codecCapabilities(requestedCodecs) {
  const out = {};
  for (const codec of requestedCodecs) {
    if (codec === 'gzip') {
      out.gzip = { status: 'available', implementation: 'node:zlib', level: 6 };
    } else if (codec === 'zstd') {
      out.zstd = executableAvailable('zstd')
        ? { status: 'available', implementation: 'external-binary', level: 3 }
        : unavailable('zstd-binary-not-found');
    } else if (codec === 'brotli') {
      out.brotli = executableAvailable('brotli')
        ? { status: 'available', implementation: 'external-binary', quality: 5 }
        : unavailable('brotli-binary-not-found');
    }
  }
  return out;
}

function runExternalCodec(codec, mode, input) {
  const maxBuffer = Math.max(1024 * 1024, input.length * 3 + 1024 * 1024);
  let args;
  if (codec === 'zstd') args = mode === 'compress' ? ['-q', '-c', '-3'] : ['-q', '-d', '-c'];
  else args = mode === 'compress' ? ['-q', '5', '-c'] : ['-d', '-c'];
  const result = childProcess.spawnSync(codec, args, {
    input,
    encoding: null,
    maxBuffer,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  if (result.error || result.status !== 0 || !Buffer.isBuffer(result.stdout)) {
    throw new Error(`${codec}-${mode}-failed`);
  }
  return result.stdout;
}

function benchmarkRepresentation(buffer, context, codecs, capabilities, timingSink) {
  const raw = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  const result = { rawBytes: raw.length, codecs: {} };
  for (const codec of codecs) {
    if (raw.length === 0) {
      result.codecs[codec] = unavailable('empty-representation');
      continue;
    }
    if (!capabilities[codec] || capabilities[codec].status !== 'available') {
      result.codecs[codec] = unavailable(capabilities[codec]?.reason || 'codec-unavailable');
      continue;
    }
    try {
      const compressStart = process.hrtime.bigint();
      const compressed = codec === 'gzip'
        ? zlib.gzipSync(raw, { level: 6, mtime: 0 })
        : runExternalCodec(codec, 'compress', raw);
      const compressMs = hrtimeMs(compressStart);
      const decompressStart = process.hrtime.bigint();
      const decoded = codec === 'gzip'
        ? zlib.gunzipSync(compressed)
        : runExternalCodec(codec, 'decompress', compressed);
      const decompressMs = hrtimeMs(decompressStart);
      const decodedEqualsOriginal = decoded.equals(raw);
      if (!decodedEqualsOriginal) fail(`${codec} decode did not reproduce the original bytes`);
      result.codecs[codec] = {
        status: 'available',
        compressedBytes: compressed.length,
        compressedToRawRatio: ratio(compressed.length, raw.length),
        rawToCompressedRatio: ratio(raw.length, compressed.length),
        spaceSavingsShare: round(1 - compressed.length / raw.length),
        decodedEqualsOriginal: true,
      };
      timingSink.push({
        scope: context.scope,
        representation: context.representation,
        codec,
        compressMs: round(compressMs, 3),
        decompressMs: round(decompressMs, 3),
      });
    } catch (error) {
      if (codec === 'gzip') throw error;
      result.codecs[codec] = unavailable('codec-execution-failed');
    }
  }
  return result;
}

function packageContentDuplication(snapshot, snapshotBytes) {
  if (!Array.isArray(snapshot?.messages)) return unavailable('snapshot-messages-array-missing');
  let availablePairCount = 0;
  let identicalPairCount = 0;
  let mismatchedPairCount = 0;
  let affectedMessageCount = 0;
  let duplicatedBytes = 0;
  let textDuplicatedBytes = 0;
  let htmlDuplicatedBytes = 0;

  for (const message of snapshot.messages) {
    if (!message || typeof message !== 'object') continue;
    let affected = false;
    const content = Array.isArray(message.content) ? message.content : [];
    const textEntry = content.find((entry) => entry && entry.type === 'text' && typeof entry.text === 'string');
    if (typeof message.contentText === 'string' && textEntry) {
      availablePairCount += 1;
      if (Buffer.from(message.contentText).equals(Buffer.from(textEntry.text))) {
        const bytes = byteLength(message.contentText);
        identicalPairCount += 1;
        textDuplicatedBytes += bytes;
        duplicatedBytes += bytes;
        affected = true;
      } else {
        mismatchedPairCount += 1;
      }
    }
    const htmlEntry = content.find((entry) => entry && entry.type === 'html' && typeof entry.html === 'string');
    if (typeof message.contentHtml === 'string' && htmlEntry) {
      availablePairCount += 1;
      if (Buffer.from(message.contentHtml).equals(Buffer.from(htmlEntry.html))) {
        const bytes = byteLength(message.contentHtml);
        identicalPairCount += 1;
        htmlDuplicatedBytes += bytes;
        duplicatedBytes += bytes;
        affected = true;
      } else {
        mismatchedPairCount += 1;
      }
    }
    if (affected) affectedMessageCount += 1;
  }
  if (!availablePairCount) return unavailable('no-content-body-pairs-present');
  return {
    status: 'available',
    availablePairCount,
    identicalPairCount,
    mismatchedPairCount,
    affectedMessageCount,
    duplicatedBytes,
    textDuplicatedBytes,
    htmlDuplicatedBytes,
    duplicateShareOfSnapshot: ratio(duplicatedBytes, snapshotBytes),
    duplicatePercentageOfSnapshot: snapshotBytes > 0 ? round(duplicatedBytes * 100 / snapshotBytes, 3) : null,
  };
}

function packageFileRecord(file) {
  const normalized = file.relativePath.split(path.sep).join('/');
  if (CORE_PACKAGE_FILES.has(normalized)) {
    return { kind: 'package-core', logicalName: normalized, bytes: file.bytes };
  }
  const identity = hashFile(file.fullPath);
  if (normalized.startsWith('assets/')) {
    const extension = path.extname(normalized).slice(1).toLowerCase();
    return {
      kind: 'asset-copy',
      identity,
      bytes: file.bytes,
      precompressed: PRECOMPRESSED_EXTENSIONS.has(extension),
    };
  }
  return { kind: 'other', identity, bytes: file.bytes };
}

/* DP-M03-E — gzip-v3 measurement compatibility.
 *
 * MEASUREMENT TOOLING ONLY. This is not product source, not a second product
 * codec, and owns no `.h2ochat` semantics; the governed WebKit codec remains the
 * sole product gzip authority. It exists so the existing semantic metrics can
 * inspect a self-describing gzip-v3 snapshot.
 *
 * Physical byte accounting is UNCHANGED: package/snapshot/manifest/asset/renderer
 * byte totals continue to come from actual on-disk sizes. Decoding is used only
 * for metrics that require semantic snapshot inspection.
 */
const V3_LOGICAL_SNAPSHOT_CAP_BYTES = 8 * 1024 * 1024;

function parseJsonBuffer(buffer, label) {
  try {
    return JSON.parse(buffer.toString('utf8'));
  } catch (error) {
    fail(`${label} is malformed JSON: ${error.message}`);
  }
}

function resolveSnapshotContent(snapshotFile, manifest) {
  const physicalBytes = fs.readFileSync(snapshotFile.fullPath);
  const descriptor = manifest && manifest.files ? manifest.files.snapshot : null;
  const encoding = String((descriptor && descriptor.encoding) ?? '').trim().toLowerCase();
  const isV3 = safeVersion(manifest?.schemaVersion) === 3;

  if (!isV3 || encoding === '' || encoding === 'identity') {
    if (isV3 && encoding !== '' && encoding !== 'identity') {
      fail(`unsupported v3 snapshot encoding: ${encoding}`);
    }
    return { encoding: encoding || null, physicalBytes, logicalBytes: physicalBytes, gzip: false };
  }
  if (encoding !== 'gzip') fail(`unsupported v3 snapshot encoding: ${encoding}`);

  const declaredPhysicalLength = descriptor.byteLength;
  if (!Number.isInteger(declaredPhysicalLength) || declaredPhysicalLength <= 0) {
    fail('gzip snapshot descriptor byteLength must be a positive integer');
  }
  if (physicalBytes.length !== declaredPhysicalLength) {
    fail(`gzip snapshot physical byteLength mismatch: descriptor ${declaredPhysicalLength}, on-disk ${physicalBytes.length}`);
  }
  const declaredPhysicalSha = normalizeSha(descriptor.sha256);
  if (!declaredPhysicalSha) fail('gzip snapshot descriptor sha256 is missing or malformed');
  const actualPhysicalSha = sha256Buffer(physicalBytes);
  if (actualPhysicalSha !== declaredPhysicalSha) {
    fail('gzip snapshot physical sha256 does not match its descriptor');
  }

  const declaredLogicalLength = descriptor.contentByteLength;
  if (!Number.isInteger(declaredLogicalLength) || declaredLogicalLength <= 0) {
    fail('gzip snapshot descriptor contentByteLength must be a positive integer');
  }
  if (declaredLogicalLength > V3_LOGICAL_SNAPSHOT_CAP_BYTES) {
    fail('gzip snapshot contentByteLength exceeds the governed v3 logical cap');
  }
  /* DP-M03-C: 0 < physicalByteLength < contentByteLength <= 8 MiB. */
  if (physicalBytes.length >= declaredLogicalLength) {
    fail(`gzip snapshot violates DP-M03-C: expected 0 < ${physicalBytes.length} < ${declaredLogicalLength}`);
  }
  const declaredLogicalSha = normalizeSha(descriptor.contentSha256);
  if (!declaredLogicalSha) fail('gzip snapshot descriptor contentSha256 is missing or malformed');

  /* Bounded decode: the pinned Node runtime enforces a hard output ceiling. */
  let logicalBytes;
  try {
    logicalBytes = zlib.gunzipSync(physicalBytes, { maxOutputLength: declaredLogicalLength });
  } catch (error) {
    fail(`gzip snapshot decode failed: ${error.message}`);
  }
  if (logicalBytes.length !== declaredLogicalLength) {
    fail(`decoded gzip snapshot byteLength ${logicalBytes.length} does not match contentByteLength ${declaredLogicalLength}`);
  }
  const actualLogicalSha = sha256Buffer(logicalBytes);
  if (actualLogicalSha !== declaredLogicalSha) {
    fail('decoded gzip snapshot sha256 does not match contentSha256');
  }
  return {
    encoding: 'gzip',
    physicalBytes,
    logicalBytes,
    gzip: true,
    physicalSha256: actualPhysicalSha,
    logicalSha256: actualLogicalSha,
  };
}

function measurePackage(packagePath, codecs, capabilities, timingSink) {
  const files = inventoryTree(packagePath);
  const byRelativePath = new Map(files.map((file) => [file.relativePath.split(path.sep).join('/'), file]));
  const manifestFile = byRelativePath.get('manifest.json');
  const snapshotFile = byRelativePath.get('snapshot.json');
  if (!manifestFile || !snapshotFile) fail('package shape requires manifest.json and snapshot.json');
  const manifest = parseJsonFile(manifestFile.fullPath, 'package manifest.json');
  const snapshotContent = resolveSnapshotContent(snapshotFile, manifest);
  const snapshot = parseJsonBuffer(snapshotContent.logicalBytes, 'package snapshot.json');
  if (!manifest || typeof manifest !== 'object' || !snapshot || typeof snapshot !== 'object') {
    fail('unsupported package shape: manifest and snapshot must be JSON objects');
  }
  const manifestSchema = safeSchemaIdentity(manifest.schema);
  if (manifestSchema !== PACKAGE_SCHEMA) fail('unsupported package manifest schema');
  if (!Array.isArray(snapshot.messages)) fail('unsupported package shape: snapshot.messages is required');

  const totalBytes = files.reduce((sum, file) => sum + file.bytes, 0);
  const snapshotBytes = snapshotFile.bytes;
  const markdownBytes = byRelativePath.get('chat.md')?.bytes ?? 0;
  const htmlBytes = byRelativePath.get('chat.html')?.bytes ?? 0;
  const assetFiles = files.filter((file) => file.relativePath.split(path.sep).join('/').startsWith('assets/'));
  const assetCopyBytes = assetFiles.reduce((sum, file) => sum + file.bytes, 0);
  const manifestContentHash = normalizeSha(manifest.contentHash);
  const packageIdentity = manifestContentHash || sha256Text(canonicalJson(
    files.map((file) => ({ bytes: file.bytes, digest: hashFile(file.fullPath) })),
  ));
  const compression = {};
  for (const logicalName of ['snapshot.json', 'chat.md', 'chat.html']) {
    const file = byRelativePath.get(logicalName);
    if (!file) {
      compression[logicalName] = unavailable(`${logicalName}-missing`);
      continue;
    }
    compression[logicalName] = benchmarkRepresentation(
      logicalName === 'snapshot.json' ? snapshotContent.logicalBytes : fs.readFileSync(file.fullPath),
      { scope: packageIdentity, representation: logicalName },
      codecs,
      capabilities,
      timingSink,
    );
  }

  const schemaVersion = safeVersion(manifest.schemaVersion ?? snapshot.schemaVersion);
  const explicitPayloadVersion = safeVersion(manifest.payloadVersion);
  const payloadVersion = explicitPayloadVersion ?? (schemaVersion === 1 ? 1 : null);
  const fileRecords = files.map(packageFileRecord).sort((left, right) => {
    const leftKey = `${left.logicalName || ''}:${left.kind}:${left.identity || ''}`;
    const rightKey = `${right.logicalName || ''}:${right.kind}:${right.identity || ''}`;
    return leftKey.localeCompare(rightKey);
  });
  const declaredAssets = Array.isArray(manifest.assets) ? manifest.assets : [];
  const messageAssetReferenceCount = snapshot.messages.reduce((sum, message) => (
    sum + (Array.isArray(message?.assetRefs) ? message.assetRefs.length : 0)
  ), 0);
  const internalAssets = declaredAssets.map((asset) => ({
    sha256: normalizeSha(asset?.sha256),
    bytes: Number.isFinite(asset?.byteLength) ? asset.byteLength : null,
    extension: String(asset?.ext ?? '').trim().toLowerCase(),
  })).filter((asset) => asset.sha256);

  return {
    report: {
      identity: packageIdentity,
      manifestSchema,
      snapshotSchema: safeSchemaIdentity(snapshot.schema),
      schemaVersion: schemaVersion ?? unavailable('schema-version-unavailable'),
      payloadVersion: payloadVersion ?? unavailable('payload-version-unavailable'),
      payloadVersionSource: explicitPayloadVersion !== null ? 'manifest' : (schemaVersion === 1 ? 'implicit-v1' : 'unavailable'),
      contentHash: manifestContentHash || unavailable('valid-content-hash-unavailable'),
      totalBytes,
      fileCount: files.length,
      perFileBytes: fileRecords,
      snapshotBytes,
      markdownBytes: byRelativePath.has('chat.md') ? markdownBytes : unavailable('chat-md-missing'),
      htmlBytes: byRelativePath.has('chat.html') ? htmlBytes : unavailable('chat-html-missing'),
      assetCopyBytes,
      assetCopyCount: assetFiles.length,
      declaredAssetCount: internalAssets.length,
      messageAssetReferenceCount,
      precompressedAssetCopyBytes: fileRecords.filter((file) => file.kind === 'asset-copy' && file.precompressed).reduce((sum, file) => sum + file.bytes, 0),
      derivedRendererBytes: markdownBytes + htmlBytes,
      derivedRendererShare: ratio(markdownBytes + htmlBytes, totalBytes),
      derivedRendererPercentage: totalBytes > 0 ? round((markdownBytes + htmlBytes) * 100 / totalBytes, 3) : null,
      ...(snapshotContent.gzip ? {
        snapshotEncoding: 'gzip',
        snapshotPhysicalSha256: snapshotContent.physicalSha256,
        snapshotLogicalBytes: snapshotContent.logicalBytes.length,
        snapshotLogicalSha256: snapshotContent.logicalSha256,
      } : {}),
      packageAmplificationRatio: ratio(totalBytes, snapshotBytes),
      packageAmplificationBasis: 'total-package-bytes/snapshot-json-bytes',
      contentArrayDuplication: packageContentDuplication(snapshot, snapshotContent.logicalBytes.length),
      compression,
    },
    internal: {
      declaredAssets: internalAssets,
      assetCopyBytes,
      messageAssetReferenceCount,
    },
  };
}

function tableExists(db, table) {
  return !!db.prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name = ?").get(table);
}

function tableColumns(db, table) {
  return new Set(db.prepare('SELECT name FROM pragma_table_info(?) ORDER BY cid').all(table).map((row) => String(row.name)));
}

function sqliteScalar(db, sql, field = 'value') {
  const row = db.prepare(sql).get();
  return row ? Number(row[field]) : null;
}

function immutableTurnHash(row) {
  const hash = crypto.createHash('sha256');
  for (const field of DB_TURN_FIELDS) {
    const buffer = Buffer.from(typeof row[field] === 'string' ? row[field] : '', 'utf8');
    const length = Buffer.allocUnsafe(8);
    length.writeBigUInt64BE(BigInt(buffer.length));
    hash.update(length);
    hash.update(buffer);
  }
  return hash.digest('hex');
}

function duplicateTurnMetrics(rows) {
  const groups = new Map();
  for (const row of rows) {
    const digest = immutableTurnHash(row);
    const bodyBytes = DB_TURN_FIELDS.reduce((sum, field) => sum + byteLength(row[field]), 0);
    if (!groups.has(digest)) groups.set(digest, { bodyBytes, snapshots: new Set(), chats: new Set() });
    const group = groups.get(digest);
    group.snapshots.add(String(row.snapshot_id ?? ''));
    group.chats.add(String(row.chat_id ?? ''));
  }
  let acrossSnapshotsBytes = 0;
  let acrossChatsBytes = 0;
  let acrossSnapshotsGroupCount = 0;
  let acrossChatsGroupCount = 0;
  for (const group of groups.values()) {
    if (group.snapshots.size > 1) {
      acrossSnapshotsGroupCount += 1;
      acrossSnapshotsBytes += (group.snapshots.size - 1) * group.bodyBytes;
    }
    const nonemptyChats = [...group.chats].filter(Boolean);
    if (nonemptyChats.length > 1) {
      acrossChatsGroupCount += 1;
      acrossChatsBytes += (nonemptyChats.length - 1) * group.bodyBytes;
    }
  }
  return {
    hashFields: DB_TURN_FIELDS.slice(),
    uniqueTurnBodyCount: groups.size,
    acrossSnapshots: { duplicatedBytes: acrossSnapshotsBytes, duplicateGroupCount: acrossSnapshotsGroupCount },
    acrossChats: { duplicatedBytes: acrossChatsBytes, duplicateGroupCount: acrossChatsGroupCount },
  };
}

function snapshotHistoryMetrics(rows, snapshotsAvailable) {
  if (!snapshotsAvailable) return unavailable('snapshot-chat-order-columns-unavailable');
  const chats = new Map();
  for (const row of rows) {
    const chatId = String(row.chat_id ?? '');
    const snapshotId = String(row.snapshot_id ?? '');
    if (!chatId || !snapshotId) continue;
    if (!chats.has(chatId)) chats.set(chatId, new Map());
    const snapshots = chats.get(chatId);
    if (!snapshots.has(snapshotId)) {
      snapshots.set(snapshotId, {
        snapshotId,
        capturedAt: Number(row.captured_at) || 0,
        turns: [],
      });
    }
    const digest = immutableTurnHash(row);
    snapshots.get(snapshotId).turns.push({
      digest,
      bodyBytes: DB_TURN_FIELDS.reduce((sum, field) => sum + byteLength(row[field]), 0),
    });
  }

  const histories = [];
  for (const [chatId, snapshotMap] of chats) {
    const snapshots = [...snapshotMap.values()].sort((left, right) => (
      left.capturedAt - right.capturedAt || left.snapshotId.localeCompare(right.snapshotId)
    ));
    const cumulativeLogicalBodies = new Map();
    let cumulativeTurnRows = 0;
    let cumulativeBodyBytes = 0;
    let previousLogicalTurns = new Set();
    const growthCurve = [];
    snapshots.forEach((snapshot, index) => {
      const currentLogicalBodies = new Map();
      let snapshotBodyBytes = 0;
      for (const turn of snapshot.turns) {
        snapshotBodyBytes += turn.bodyBytes;
        if (!currentLogicalBodies.has(turn.digest)) currentLogicalBodies.set(turn.digest, turn.bodyBytes);
        if (!cumulativeLogicalBodies.has(turn.digest)) cumulativeLogicalBodies.set(turn.digest, turn.bodyBytes);
      }
      const newEntries = [...currentLogicalBodies.entries()].filter(([digest]) => !previousLogicalTurns.has(digest));
      const repeatedEntries = snapshot.turns.filter((turn) => previousLogicalTurns.has(turn.digest));
      cumulativeTurnRows += snapshot.turns.length;
      cumulativeBodyBytes += snapshotBodyBytes;
      const distinctLogicalBytes = [...cumulativeLogicalBodies.values()].reduce((sum, bytes) => sum + bytes, 0);
      growthCurve.push({
        sequence: index + 1,
        snapshotTurnCount: snapshot.turns.length,
        snapshotBodyBytes,
        newLogicalTurnCountFromPrevious: newEntries.length,
        newLogicalTurnBytesFromPrevious: newEntries.reduce((sum, [, bytes]) => sum + bytes, 0),
        repeatedTurnBytesFromPrevious: repeatedEntries.reduce((sum, turn) => sum + turn.bodyBytes, 0),
        cumulativeTurnRows,
        cumulativeBodyBytes,
        cumulativeDistinctLogicalTurnCount: cumulativeLogicalBodies.size,
        cumulativeDuplicatedTurnBytes: cumulativeBodyBytes - distinctLogicalBytes,
      });
      previousLogicalTurns = new Set(currentLogicalBodies.keys());
    });
    const finalPoint = growthCurve.at(-1) || null;
    histories.push({
      chatIdentity: sha256Text(`chat:${chatId}`),
      snapshotCount: growthCurve.length,
      totalTurnsWritten: finalPoint?.cumulativeTurnRows ?? 0,
      distinctLogicalTurnCount: finalPoint?.cumulativeDistinctLogicalTurnCount ?? 0,
      duplicatedTurnBytes: finalPoint?.cumulativeDuplicatedTurnBytes ?? 0,
      finalAppendedLogicalTurnCount: finalPoint?.newLogicalTurnCountFromPrevious ?? 0,
      finalAppendedLogicalTurnBytes: finalPoint?.newLogicalTurnBytesFromPrevious ?? 0,
      growthCurve,
    });
  }
  histories.sort((left, right) => left.chatIdentity.localeCompare(right.chatIdentity));
  return {
    status: 'available',
    turnBodyFields: DB_TURN_FIELDS.slice(),
    chatHistoryCount: histories.length,
    histories,
  };
}

async function measureDatabase(dbPath, codecs, capabilities, timingSink) {
  let DatabaseSync;
  try {
    ({ DatabaseSync } = await import('node:sqlite'));
  } catch (_) {
    return { report: unavailable('node-sqlite-unavailable'), internal: null };
  }
  if (typeof DatabaseSync !== 'function') return { report: unavailable('node-sqlite-database-sync-unavailable'), internal: null };

  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const tables = {};
    const columnsByTable = new Map();
    for (const table of DB_TABLES) {
      if (!tableExists(db, table)) {
        tables[table] = unavailable('table-missing');
        continue;
      }
      columnsByTable.set(table, tableColumns(db, table));
      tables[table] = { status: 'available', rowCount: sqliteScalar(db, `SELECT COUNT(*) AS value FROM ${table}`) };
    }

    const turnFieldBytes = {};
    const turnCompression = {};
    let turnRows = [];
    const turnColumns = columnsByTable.get('snapshot_turns');
    if (turnColumns) {
      for (const field of DB_TURN_FIELDS) {
        if (!turnColumns.has(field)) {
          turnFieldBytes[field] = unavailable('column-missing');
        } else {
          turnFieldBytes[field] = {
            status: 'available',
            bytes: sqliteScalar(db, `SELECT COALESCE(SUM(length(CAST(${field} AS BLOB))), 0) AS value FROM snapshot_turns`),
          };
        }
      }
      const selectFields = DB_TURN_FIELDS.map((field) => turnColumns.has(field) ? `st.${field} AS ${field}` : `'' AS ${field}`);
      const snapshotsAvailable = columnsByTable.has('snapshots') && columnsByTable.get('snapshots').has('id') && columnsByTable.get('snapshots').has('chat_id');
      const join = snapshotsAvailable ? 'LEFT JOIN snapshots s ON s.id = st.snapshot_id' : '';
      const chatSelect = snapshotsAvailable ? 's.chat_id AS chat_id' : "'' AS chat_id";
      const capturedSelect = snapshotsAvailable ? 's.captured_at AS captured_at' : '0 AS captured_at';
      turnRows = db.prepare(`SELECT st.snapshot_id AS snapshot_id, st.turn_idx AS turn_idx, ${chatSelect}, ${capturedSelect}, ${selectFields.join(', ')} FROM snapshot_turns st ${join} ORDER BY captured_at, st.snapshot_id, st.turn_idx`).all();
      for (const field of DB_TURN_FIELDS) {
        if (!turnColumns.has(field)) {
          turnCompression[field] = unavailable('column-missing');
          continue;
        }
        const buffer = Buffer.concat(turnRows.map((row) => Buffer.from(typeof row[field] === 'string' ? row[field] : '', 'utf8')));
        turnCompression[field] = benchmarkRepresentation(
          buffer,
          { scope: 'sqlite-snapshot-turns', representation: field },
          codecs,
          capabilities,
          timingSink,
        );
      }
    } else {
      for (const field of DB_TURN_FIELDS) {
        turnFieldBytes[field] = unavailable('snapshot-turns-table-missing');
        turnCompression[field] = unavailable('snapshot-turns-table-missing');
      }
    }

    let duplicateTurns = unavailable('snapshot-turns-table-missing');
    let snapshotHistory = unavailable('snapshot-turns-table-missing');
    if (turnColumns) {
      duplicateTurns = duplicateTurnMetrics(turnRows);
      const snapshotsAvailable = columnsByTable.has('snapshots')
        && columnsByTable.get('snapshots').has('id')
        && columnsByTable.get('snapshots').has('chat_id')
        && columnsByTable.get('snapshots').has('captured_at');
      snapshotHistory = snapshotHistoryMetrics(turnRows, snapshotsAvailable);
    }

    let assetRegistry = null;
    const assetColumns = columnsByTable.get('assets');
    if (assetColumns && assetColumns.has('sha256')) {
      const refcountExpr = assetColumns.has('refcount') ? 'refcount' : '0 AS refcount';
      const byteSizeExpr = assetColumns.has('byte_size') ? 'byte_size' : '0 AS byte_size';
      const extExpr = assetColumns.has('ext') ? 'ext' : "'' AS ext";
      assetRegistry = db.prepare(`SELECT sha256, ${refcountExpr}, ${byteSizeExpr}, ${extExpr} FROM assets ORDER BY sha256`).all()
        .map((row) => ({
          sha256: normalizeSha(row.sha256),
          refcount: Number(row.refcount) || 0,
          byteSize: Number(row.byte_size) || 0,
          extension: String(row.ext ?? '').trim().toLowerCase(),
        })).filter((row) => row.sha256);
    }
    let assetJoinCounts = null;
    const joinColumns = columnsByTable.get('snapshot_turn_assets');
    if (joinColumns && joinColumns.has('sha256')) {
      assetJoinCounts = new Map(db.prepare('SELECT sha256, COUNT(*) AS reference_count FROM snapshot_turn_assets GROUP BY sha256 ORDER BY sha256').all()
        .map((row) => [normalizeSha(row.sha256), Number(row.reference_count) || 0]).filter(([sha]) => sha));
    }

    return {
      report: {
        status: 'available',
        mechanism: 'node:sqlite-read-only',
        identity: hashFile(dbPath),
        databaseFileBytes: fs.statSync(dbPath).size,
        tables,
        snapshotCount: tables.snapshots?.status === 'available' ? tables.snapshots.rowCount : unavailable('snapshots-table-missing'),
        turnCount: tables.snapshot_turns?.status === 'available' ? tables.snapshot_turns.rowCount : unavailable('snapshot-turns-table-missing'),
        turnFieldBytes,
        duplicateTurnBodies: duplicateTurns,
        snapshotHistory,
        pageMetrics: {
          pageSize: sqliteScalar(db, 'SELECT page_size AS value FROM pragma_page_size'),
          pageCount: sqliteScalar(db, 'SELECT page_count AS value FROM pragma_page_count'),
          freelistCount: sqliteScalar(db, 'SELECT freelist_count AS value FROM pragma_freelist_count'),
        },
        compression: turnCompression,
      },
      internal: { assetRegistry, assetJoinCounts },
    };
  } finally {
    db.close();
  }
}

function casIdentityFromRelativePath(relativePath) {
  const basename = path.basename(relativePath);
  const match = /^(sha256-)?([0-9a-f]{64})(?:\.[a-z0-9]+)?$/i.exec(basename);
  return match ? `sha256-${match[2].toLowerCase()}` : '';
}

function measureCas(casPath, databaseInternal, packagesInternal) {
  const files = inventoryTree(casPath);
  const objects = files.map((file) => {
    const relative = file.relativePath.split(path.sep).join('/');
    const identity = casIdentityFromRelativePath(relative);
    const firstPart = relative.split('/')[0]?.toLowerCase() || '';
    return {
      identity,
      bytes: file.bytes,
      shard: /^[0-9a-f]{2}$/.test(firstPart) ? firstPart : 'unrecognized',
    };
  });
  const totalBytes = objects.reduce((sum, object) => sum + object.bytes, 0);
  const distinctIdentities = new Set(objects.map((object) => object.identity).filter(Boolean));
  const shardMap = new Map();
  for (const object of objects) {
    const current = shardMap.get(object.shard) || { shard: object.shard, blobCount: 0, bytes: 0 };
    current.blobCount += 1;
    current.bytes += object.bytes;
    shardMap.set(object.shard, current);
  }

  const registry = databaseInternal?.assetRegistry;
  const joinCounts = databaseInternal?.assetJoinCounts;
  let databaseComparison = unavailable('database-asset-registry-unavailable');
  const extensionByIdentity = new Map();
  for (const item of packagesInternal) {
    for (const asset of item.declaredAssets) {
      if (asset.extension) extensionByIdentity.set(asset.sha256, asset.extension);
    }
  }
  if (Array.isArray(registry)) {
    for (const row of registry) {
      if (row.extension) extensionByIdentity.set(row.sha256, row.extension);
    }
  }
  let precompressedBlobCount = 0;
  let precompressedBytes = 0;
  for (const object of objects) {
    if (PRECOMPRESSED_EXTENSIONS.has(extensionByIdentity.get(object.identity))) {
      precompressedBlobCount += 1;
      precompressedBytes += object.bytes;
    }
  }
  if (Array.isArray(registry)) {
    const registryMap = new Map(registry.map((row) => [row.sha256, row]));
    const filesystemMap = new Map(objects.filter((object) => object.identity).map((object) => [object.identity, object]));
    let registryPresent = 0;
    let missingBodyCandidateCount = 0;
    let orphanCandidateCount = 0;
    for (const row of registry) {
      const object = filesystemMap.get(row.sha256);
      if (object) {
        registryPresent += 1;
      } else {
        missingBodyCandidateCount += 1;
      }
    }
    for (const [sha] of filesystemMap) {
      if (!registryMap.has(sha) || (joinCounts instanceof Map && (joinCounts.get(sha) || 0) === 0)) orphanCandidateCount += 1;
    }
    let refcountAgreement = unavailable('snapshot-turn-assets-join-unavailable');
    if (joinCounts instanceof Map) {
      let agreeingCount = 0;
      let mismatchCount = 0;
      for (const row of registry) {
        if (row.refcount === (joinCounts.get(row.sha256) || 0)) agreeingCount += 1;
        else mismatchCount += 1;
      }
      refcountAgreement = { status: 'available', agreeingCount, mismatchCount };
    }
    databaseComparison = {
      status: 'available',
      registryObjectCount: registry.length,
      registryPresentInFilesystemCount: registryPresent,
      filesystemObjectsWithoutRegistryCount: [...filesystemMap.keys()].filter((sha) => !registryMap.has(sha)).length,
      missingBodyCandidateCount,
      orphanCandidateCount,
      refcountVsJoin: refcountAgreement,
    };
  }

  const packageAssets = packagesInternal.flatMap((item) => item.declaredAssets);
  let packageComparison = unavailable('no-package-assets-to-compare');
  if (packageAssets.length) {
    const casMap = new Map(objects.filter((object) => object.identity).map((object) => [object.identity, object]));
    const unique = new Map(packageAssets.map((asset) => [asset.sha256, asset]));
    let presentInCasCount = 0;
    let missingInCasCount = 0;
    let comparableCasBytes = 0;
    for (const sha of unique.keys()) {
      const object = casMap.get(sha);
      if (object) {
        presentInCasCount += 1;
        comparableCasBytes += object.bytes;
      } else {
        missingInCasCount += 1;
      }
    }
    const packageAssetCopyBytes = packagesInternal.reduce((sum, item) => sum + item.assetCopyBytes, 0);
    const logicalAssetReferenceCount = packagesInternal.reduce((sum, item) => sum + item.messageAssetReferenceCount, 0);
    packageComparison = {
      status: 'available',
      logicalAssetReferenceCount,
      declaredAssetReferenceCount: packageAssets.length,
      declaredDistinctAssetCount: unique.size,
      presentInCasCount,
      missingInCasCount,
      packageAssetCopyBytes,
      comparableCasBytes,
      packageCopyToCasRatio: ratio(packageAssetCopyBytes, comparableCasBytes),
    };
  }

  return {
    status: 'available',
    blobCount: files.length,
    totalBytes,
    distinctHashObjectCount: distinctIdentities.size,
    unidentifiedObjectCount: objects.filter((object) => !object.identity).length,
    shardDistribution: [...shardMap.values()].sort((left, right) => left.shard.localeCompare(right.shard)),
    precompressed: extensionByIdentity.size
      ? {
          status: 'available',
          identifiedBlobCount: precompressedBlobCount,
          bytes: precompressedBytes,
          excludedFromCompressionRecommendation: true,
        }
      : unavailable('asset-type-metadata-unavailable-for-extensionless-cas'),
    databaseComparison,
    packageComparison,
  };
}

function snapshotsFromBundle(bundle) {
  if (bundle?.schema === 'h2o.studio.fullBundle.v2') {
    return Array.isArray(bundle?.chatArchive?.chats)
      ? bundle.chatArchive.chats.flatMap((chat) => Array.isArray(chat?.snapshots) ? chat.snapshots : [])
      : [];
  }
  if (bundle?.schema === 'h2o.chatArchive.bundle.v1') {
    return Array.isArray(bundle.chats)
      ? bundle.chats.flatMap((chat) => Array.isArray(chat?.snapshots) ? chat.snapshots : [])
      : [];
  }
  return [];
}

function measureSync(syncPath, codecs, capabilities, timingSink) {
  const files = inventoryTree(syncPath);
  const recognized = [];
  const messageBuffers = [];
  const richTurnBuffers = [];
  const bundleBuffers = [];
  const observedSchemaCounts = new Map();
  let messageTextCount = 0;
  let richTurnHtmlCount = 0;
  for (const file of files) {
    if (path.extname(file.relativePath).toLowerCase() !== '.json') continue;
    const buffer = fs.readFileSync(file.fullPath);
    let value;
    try {
      value = JSON.parse(buffer.toString('utf8'));
    } catch (error) {
      fail(`sync JSON is malformed: ${error.message}`);
    }
    const schema = safeSchemaIdentity(value?.schema);
    if (schema !== 'unrecognized') observedSchemaCounts.set(schema, (observedSchemaCounts.get(schema) || 0) + 1);
    if (!FULL_BUNDLE_SCHEMAS.has(schema)) continue;
    const snapshots = snapshotsFromBundle(value);
    let fileMessageBytes = 0;
    let fileRichTurnBytes = 0;
    let fileMessageCount = 0;
    let fileRichTurnCount = 0;
    for (const snapshot of snapshots) {
      const messages = Array.isArray(snapshot?.messages) ? snapshot.messages : [];
      for (const message of messages) {
        if (typeof message?.text !== 'string') continue;
        const body = Buffer.from(message.text, 'utf8');
        messageBuffers.push(body);
        fileMessageBytes += body.length;
        fileMessageCount += 1;
      }
      const richTurns = Array.isArray(snapshot?.meta?.richTurns) ? snapshot.meta.richTurns : [];
      for (const turn of richTurns) {
        if (typeof turn?.outerHTML !== 'string') continue;
        const body = Buffer.from(turn.outerHTML, 'utf8');
        richTurnBuffers.push(body);
        fileRichTurnBytes += body.length;
        fileRichTurnCount += 1;
      }
    }
    messageTextCount += fileMessageCount;
    richTurnHtmlCount += fileRichTurnCount;
    bundleBuffers.push(buffer);
    recognized.push({
      identity: sha256Buffer(buffer),
      schema,
      bytes: file.bytes,
      carriers: {
        messagesTextCarrier: { valueCount: fileMessageCount, bytes: fileMessageBytes },
        richTurnOuterHtml: { valueCount: fileRichTurnCount, bytes: fileRichTurnBytes },
      },
    });
  }
  recognized.sort((left, right) => left.identity.localeCompare(right.identity));
  const representationBuffers = {
    recognizedBundleFiles: Buffer.concat(bundleBuffers),
    messagesTextCarrier: Buffer.concat(messageBuffers),
    richTurnOuterHtml: Buffer.concat(richTurnBuffers),
  };
  const compression = {};
  for (const [name, buffer] of Object.entries(representationBuffers)) {
    compression[name] = benchmarkRepresentation(
      buffer,
      { scope: 'sync-projection', representation: name },
      codecs,
      capabilities,
      timingSink,
    );
  }
  return {
    status: 'available',
    fileCount: files.length,
    totalBytes: files.reduce((sum, file) => sum + file.bytes, 0),
    recognizedProjectionCount: recognized.length,
    observedSchemaIdentities: [...observedSchemaCounts.entries()]
      .map(([schema, fileCount]) => ({ schema, fileCount }))
      .sort((left, right) => left.schema.localeCompare(right.schema)),
    recognizedProjections: recognized,
    bodyCarriers: {
      messagesTextCarrier: { valueCount: messageTextCount, bytes: messageBuffers.reduce((sum, buffer) => sum + buffer.length, 0) },
      richTurnOuterHtml: { valueCount: richTurnHtmlCount, bytes: richTurnBuffers.reduce((sum, buffer) => sum + buffer.length, 0) },
    },
    compression,
  };
}

function aggregatePackages(packageReports) {
  const totalBytes = packageReports.reduce((sum, item) => sum + item.totalBytes, 0);
  const snapshotBytes = packageReports.reduce((sum, item) => sum + item.snapshotBytes, 0);
  const derivedRendererBytes = packageReports.reduce((sum, item) => sum + item.derivedRendererBytes, 0);
  const assetCopyBytes = packageReports.reduce((sum, item) => sum + item.assetCopyBytes, 0);
  const declaredAssetReferenceCount = packageReports.reduce((sum, item) => sum + item.declaredAssetCount, 0);
  const messageAssetReferenceCount = packageReports.reduce((sum, item) => sum + item.messageAssetReferenceCount, 0);
  const duplicatedBytes = packageReports.reduce((sum, item) => (
    sum + (item.contentArrayDuplication?.status === 'available' ? item.contentArrayDuplication.duplicatedBytes : 0)
  ), 0);
  return {
    packageCount: packageReports.length,
    totalBytes,
    snapshotBytes,
    derivedRendererBytes,
    derivedRendererShare: ratio(derivedRendererBytes, totalBytes),
    derivedRendererPercentage: totalBytes > 0 ? round(derivedRendererBytes * 100 / totalBytes, 3) : null,
    assetCopyBytes,
    declaredAssetReferenceCount,
    messageAssetReferenceCount,
    contentArrayDuplicatedBytes: duplicatedBytes,
    contentArrayDuplicateShareOfSnapshot: ratio(duplicatedBytes, snapshotBytes),
    contentArrayDuplicatePercentageOfSnapshot: snapshotBytes > 0 ? round(duplicatedBytes * 100 / snapshotBytes, 3) : null,
    packageAmplificationRatio: ratio(totalBytes, snapshotBytes),
    packageAmplificationBasis: 'total-package-bytes/snapshot-json-bytes',
  };
}

function numericLeaves(value, prefix = '', out = new Map()) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    out.set(prefix, value);
    return out;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => numericLeaves(item, `${prefix}[${index}]`, out));
    return out;
  }
  if (value && typeof value === 'object') {
    for (const key of Object.keys(value).sort()) numericLeaves(value[key], prefix ? `${prefix}.${key}` : key, out);
  }
  return out;
}

function compareBaseline(currentStable, baselineReport) {
  if (!baselineReport || baselineReport.schema !== REPORT_SCHEMA || baselineReport.schemaVersion !== REPORT_SCHEMA_VERSION) {
    return { status: 'incompatible', reason: 'baseline-report-schema-mismatch' };
  }
  if (!baselineReport.stable || typeof baselineReport.stable !== 'object') {
    return { status: 'incompatible', reason: 'baseline-stable-section-missing' };
  }
  const current = numericLeaves(currentStable);
  const baseline = numericLeaves(baselineReport.stable);
  const deltas = [];
  for (const metric of [...current.keys()].sort()) {
    if (!baseline.has(metric)) {
      deltas.push({ metric, status: 'unavailable', reason: 'metric-absent-from-baseline' });
      continue;
    }
    const currentValue = current.get(metric);
    const baselineValue = baseline.get(metric);
    deltas.push({
      metric,
      status: 'available',
      baseline: baselineValue,
      current: currentValue,
      absoluteDelta: round(currentValue - baselineValue),
      percentageDelta: baselineValue === 0 ? unavailable('zero-baseline-denominator') : round((currentValue - baselineValue) * 100 / baselineValue),
    });
  }
  return { status: 'compatible', numericDeltas: deltas };
}

function markdownReport(report) {
  const stable = report.stable;
  const lines = [
    '# Saved-chat storage measurement',
    '',
    `Stable SHA-256: \`${report.runMetadata.stableSha256}\``,
    '',
    '| Metric | Value |',
    '|---|---:|',
  ];
  if (stable.packageAggregate) {
    lines.push(`| Packages | ${stable.packageAggregate.packageCount} |`);
    lines.push(`| Package bytes | ${stable.packageAggregate.totalBytes} |`);
    lines.push(`| Snapshot bytes | ${stable.packageAggregate.snapshotBytes} |`);
    lines.push(`| Package amplification | ${stable.packageAggregate.packageAmplificationRatio ?? 'unavailable'} |`);
    lines.push(`| Derived renderer share | ${stable.packageAggregate.derivedRendererPercentage ?? 'unavailable'}% |`);
    lines.push(`| content[] duplicate share of snapshot | ${stable.packageAggregate.contentArrayDuplicatePercentageOfSnapshot ?? 'unavailable'}% |`);
  }
  if (stable.sqlite?.status === 'available') {
    lines.push(`| SQLite snapshots | ${stable.sqlite.snapshotCount} |`);
    lines.push(`| SQLite turns | ${stable.sqlite.turnCount} |`);
  }
  if (stable.cas?.status === 'available') {
    lines.push(`| CAS blobs | ${stable.cas.blobCount} |`);
    lines.push(`| CAS bytes | ${stable.cas.totalBytes} |`);
  }
  if (stable.sync?.status === 'available') {
    lines.push(`| Sync files | ${stable.sync.fileCount} |`);
    lines.push(`| Sync bytes | ${stable.sync.totalBytes} |`);
  }
  lines.push('', 'Stable measurements exclude generatedAt and timing data.', '');
  return lines.join('\n');
}

function validatePrivacyShape(report) {
  const serialized = canonicalJson(report);
  const forbiddenKeys = ['"title":', '"messageText":', '"contentText":', '"contentHtml":', '"sourceUrl":', '"conversationUrl":', '"sourceHref":', '"outerHTML":'];
  for (const token of forbiddenKeys) {
    if (serialized.includes(token)) fail(`privacy filter rejected report field ${token.slice(1, -2)}`);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  const totalStart = process.hrtime.bigint();
  const packagePaths = options.packages.map((item) => inspectInput(item, 'package'));
  if (new Set(packagePaths).size !== packagePaths.length) fail('duplicate package input resolves to the same path');
  const dbPath = options.db ? inspectInput(options.db, 'db') : null;
  const casPath = options.cas ? inspectInput(options.cas, 'cas') : null;
  const syncPath = options.sync ? inspectInput(options.sync, 'sync') : null;
  const baselinePath = options.baseline ? inspectInput(options.baseline, 'baseline') : null;
  const outPath = inspectOutput(options.out, '--out');
  const markdownPath = options.markdown ? inspectOutput(options.markdown, '--markdown') : null;
  const inputs = [
    ...packagePaths.map((item) => ({ kind: 'package', path: item })),
    ...(dbPath ? [{ kind: 'db', path: dbPath }] : []),
    ...(casPath ? [{ kind: 'cas', path: casPath }] : []),
    ...(syncPath ? [{ kind: 'sync', path: syncPath }] : []),
    ...(baselinePath ? [{ kind: 'baseline', path: baselinePath }] : []),
  ];
  assertOutputAuthority(inputs, { out: outPath, markdown: markdownPath });

  const timings = { compression: [], groups: {} };
  const capabilities = codecCapabilities(options.codecs);
  const stable = {
    inputKinds: {
      packageCount: packagePaths.length,
      sqlite: !!dbPath,
      cas: !!casPath,
      sync: !!syncPath,
      baseline: !!baselinePath,
    },
    codecs: capabilities,
    packages: [],
  };
  const packagesInternal = [];
  let groupStart = process.hrtime.bigint();
  for (const packagePath of packagePaths) {
    const measured = measurePackage(packagePath, options.codecs, capabilities, timings.compression);
    stable.packages.push(measured.report);
    packagesInternal.push(measured.internal);
  }
  stable.packages.sort((left, right) => left.identity.localeCompare(right.identity));
  timings.groups.packagesMs = round(hrtimeMs(groupStart), 3);
  if (stable.packages.length) stable.packageAggregate = aggregatePackages(stable.packages);

  let databaseInternal = null;
  if (dbPath) {
    groupStart = process.hrtime.bigint();
    const measured = await measureDatabase(dbPath, options.codecs, capabilities, timings.compression);
    stable.sqlite = measured.report;
    databaseInternal = measured.internal;
    timings.groups.sqliteMs = round(hrtimeMs(groupStart), 3);
  }
  if (casPath) {
    groupStart = process.hrtime.bigint();
    stable.cas = measureCas(casPath, databaseInternal, packagesInternal);
    timings.groups.casMs = round(hrtimeMs(groupStart), 3);
  }
  if (syncPath) {
    groupStart = process.hrtime.bigint();
    stable.sync = measureSync(syncPath, options.codecs, capabilities, timings.compression);
    timings.groups.syncMs = round(hrtimeMs(groupStart), 3);
  }
  if (baselinePath) {
    const baseline = parseJsonFile(baselinePath, 'baseline report');
    stable.baselineComparison = compareBaseline(stable, baseline);
  }

  const stableCanonical = canonicalJson(stable);
  const report = {
    schema: REPORT_SCHEMA,
    schemaVersion: REPORT_SCHEMA_VERSION,
    stable,
    runMetadata: {
      generatedAt: new Date().toISOString(),
      stableSerialization: 'canonical-json-sorted-object-keys',
      stableSha256: sha256Text(stableCanonical),
      environment: {
        nodeVersion: process.version,
        platform: process.platform,
        architecture: process.arch,
      },
      timings: {
        ...timings,
        totalMs: round(hrtimeMs(totalStart), 3),
      },
    },
  };
  validatePrivacyShape(report);
  fs.writeFileSync(outPath, `${JSON.stringify(canonicalize(report), null, 2)}\n`, { encoding: 'utf8' });
  if (markdownPath) fs.writeFileSync(markdownPath, markdownReport(report), { encoding: 'utf8' });
  process.stdout.write(`${report.runMetadata.stableSha256}\n`);
}

main().catch((error) => {
  process.stderr.write(`saved-chat storage measurement failed: ${error.message}\n`);
  process.exitCode = 1;
});
