import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const TITLE_CONTRACT_BRIDGE_FILENAME = "title-contract-bridge.js";
export const TITLE_CONTRACT_BRIDGE_VERSION = "3";
export const TITLE_CONTRACT_BRIDGE_GENERATOR_VERSION = "3";

export const TITLE_CONTRACT_SOURCE_EXPORTS = Object.freeze([
  "BASE_PRIORITY",
  "EMOJI_PRIORITY",
  "EMOJI_PROVENANCE",
  "SCHEMA_VERSION",
  "TITLE_PROVENANCE",
  "acceptDeliveryRevision",
  "applyTrustedNativeConfirmation",
  "applyTrustedPersistedReceipt",
  "canDeleteLegacy",
  "compareFieldVersionCounter",
  "createLifecycleOwner",
  "createLifecycleScope",
  "createMintAuthority",
  "createRenameOperation",
  "fieldStatus",
  "formatDisplayTitle",
  "formatNativeDisplayTitle",
  "hydrateCanonicalRecord",
  "isRTL",
  "makeReceipt",
  "mergeEmojiField",
  "mergeRecord",
  "mergeTitleField",
  "nextFieldVersion",
  "normalizeField",
  "normalizePersistedTitleRecordV1",
  "normalizeRecord",
  "normalizeRoute",
  "normalizeTitleBootCacheV1",
  "reduceDeliveryGate",
  "reduceMigration",
  "reduceRename",
  "resumeMigration",
  "sanitizeNativeTitle",
  "summarizeDurableWrites",
  "validateCanonicalRecord",
  "validateRecord",
  "verifyNativeConfirmation",
  "verifyReceipt",
].sort());

export const TITLE_CONTRACT_PRIVILEGED_EXPORTS = Object.freeze([
  "applyTrustedNativeConfirmation",
  "applyTrustedPersistedReceipt",
  "createMintAuthority",
  "hydrateCanonicalRecord",
  "nextFieldVersion",
  "resumeMigration",
  "summarizeDurableWrites",
  "verifyNativeConfirmation",
].sort());

export const TITLE_CONTRACT_SOURCE_ONLY_EXPORTS = Object.freeze([
  "normalizePersistedTitleRecordV1",
  "normalizeTitleBootCacheV1",
].sort());

export const TITLE_CONTRACT_PUBLIC_EXPORTS = Object.freeze([
  "BASE_PRIORITY",
  "EMOJI_PRIORITY",
  "EMOJI_PROVENANCE",
  "SCHEMA_VERSION",
  "TITLE_PROVENANCE",
  "acceptDeliveryRevision",
  "canDeleteLegacy",
  "compareFieldVersionCounter",
  "createLifecycleOwner",
  "createLifecycleScope",
  "createRenameOperation",
  "fieldStatus",
  "formatDisplayTitle",
  "formatNativeDisplayTitle",
  "isRTL",
  "makeReceipt",
  "mergeEmojiField",
  "mergeRecord",
  "mergeTitleField",
  "normalizeField",
  "normalizeRecord",
  "normalizeRoute",
  "reduceDeliveryGate",
  "reduceMigration",
  "reduceRename",
  "sanitizeNativeTitle",
  "validateCanonicalRecord",
  "validateRecord",
  "verifyReceipt",
].sort());

const CONTRACT_RELATIVE_PATH = "packages/title-contract/index.mjs";
const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPOSITORY_ROOT = path.resolve(MODULE_DIR, "../../../../../..");
const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function normalizeExportClass(label, names) {
  if (!Array.isArray(names)) {
    throw new Error(`[H2O] Title contract bridge ${label} classification must be an array.`);
  }
  const normalized = names.map((name) => String(name)).sort();
  if (normalized.some((name) => !IDENTIFIER.test(name))) {
    throw new Error(`[H2O] Title contract bridge ${label} classification contains an invalid export name.`);
  }
  if (new Set(normalized).size !== normalized.length) {
    throw new Error(`[H2O] Title contract bridge ${label} classification contains duplicate exports.`);
  }
  return normalized;
}

export function validateTitleContractExportPartition({
  sourceExports = TITLE_CONTRACT_SOURCE_EXPORTS,
  publicExports = TITLE_CONTRACT_PUBLIC_EXPORTS,
  privilegedExports = TITLE_CONTRACT_PRIVILEGED_EXPORTS,
  sourceOnlyExports = TITLE_CONTRACT_SOURCE_ONLY_EXPORTS,
} = {}) {
  const source = normalizeExportClass("source", sourceExports);
  const publicNames = normalizeExportClass("public", publicExports);
  const privileged = normalizeExportClass("privileged", privilegedExports);
  const sourceOnly = normalizeExportClass("source-only", sourceOnlyExports);
  const classified = [...publicNames, ...privileged, ...sourceOnly];
  if (new Set(classified).size !== classified.length) {
    throw new Error("[H2O] Title contract bridge export classifications overlap.");
  }
  const classifiedSorted = classified.sort();
  if (JSON.stringify(classifiedSorted) !== JSON.stringify(source)) {
    const sourceSet = new Set(source);
    const classifiedSet = new Set(classifiedSorted);
    const missing = source.filter((name) => !classifiedSet.has(name));
    const unexpected = classifiedSorted.filter((name) => !sourceSet.has(name));
    throw new Error(
      `[H2O] Title contract bridge export partition mismatch: missing ${JSON.stringify(missing)}, unexpected ${JSON.stringify(unexpected)}.`,
    );
  }
  for (const [label, actual, expected] of [
    ["source", source, TITLE_CONTRACT_SOURCE_EXPORTS],
    ["public", publicNames, TITLE_CONTRACT_PUBLIC_EXPORTS],
    ["privileged", privileged, TITLE_CONTRACT_PRIVILEGED_EXPORTS],
    ["source-only", sourceOnly, TITLE_CONTRACT_SOURCE_ONLY_EXPORTS],
  ]) {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(`[H2O] Title contract bridge ${label} classification does not match the exact approved names.`);
    }
  }
  return Object.freeze({
    sourceExports: Object.freeze(source),
    publicExports: Object.freeze(publicNames),
    privilegedExports: Object.freeze(privileged),
    sourceOnlyExports: Object.freeze(sourceOnly),
  });
}

export function computeTitleContractPublicSurfaceDigest(
  publicExports = TITLE_CONTRACT_PUBLIC_EXPORTS,
) {
  const publicNames = normalizeExportClass("public", publicExports);
  return sha256(Buffer.from(`${publicNames.join("\n")}\n`, "utf8"));
}

const TITLE_CONTRACT_EXPORT_PARTITION = validateTitleContractExportPartition();

function maskStringsAndComments(source) {
  let state = "code";
  let escaped = false;
  let result = "";
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1] || "";
    if (state === "line") {
      if (char === "\n") { state = "code"; result += "\n"; } else result += " ";
      continue;
    }
    if (state === "block") {
      if (char === "*" && next === "/") { result += "  "; index += 1; state = "code"; }
      else result += char === "\n" ? "\n" : " ";
      continue;
    }
    if (state !== "code") {
      if (escaped) { escaped = false; result += " "; continue; }
      if (char === "\\") { escaped = true; result += " "; continue; }
      const closer = state === "single" ? "'" : state === "double" ? '"' : "`";
      if (char === closer) state = "code";
      result += char === "\n" ? "\n" : " ";
      continue;
    }
    if (char === "/" && next === "/") { result += "  "; index += 1; state = "line"; continue; }
    if (char === "/" && next === "*") { result += "  "; index += 1; state = "block"; continue; }
    if (char === "'") { result += " "; state = "single"; continue; }
    if (char === '"') { result += " "; state = "double"; continue; }
    if (char === "`") { result += " "; state = "template"; continue; }
    result += char;
  }
  return result;
}

function inspectGrammar(source) {
  const masked = maskStringsAndComments(source);
  if (/\bimport\b/u.test(masked)) {
    throw new Error("[H2O] Title contract bridge rejects import syntax.");
  }
  const sourceLines = source.split("\n");
  const maskedLines = masked.split("\n");
  const exports = [];
  const transformed = [];
  for (let index = 0; index < sourceLines.length; index += 1) {
    const line = sourceLines[index];
    const visible = maskedLines[index] || "";
    if (/^\s+export\b/u.test(visible)) {
      throw new Error(`[H2O] Title contract bridge rejects indented module syntax at line ${index + 1}.`);
    }
    if (!visible.startsWith("export")) {
      transformed.push(line);
      continue;
    }
    const declaration = line.match(/^export (?:const|function)\s+([A-Za-z_$][A-Za-z0-9_$]*)\b/u);
    if (!declaration || !IDENTIFIER.test(declaration[1])) {
      throw new Error(`[H2O] Title contract bridge rejects unsupported export syntax at line ${index + 1}.`);
    }
    exports.push(declaration[1]);
    transformed.push(line.slice("export ".length));
  }
  const unique = new Set(exports);
  if (unique.size !== exports.length) throw new Error("[H2O] Title contract bridge rejects duplicate export names.");
  const observed = [...unique].sort();
  if (JSON.stringify(observed) !== JSON.stringify(TITLE_CONTRACT_EXPORT_PARTITION.sourceExports)) {
    throw new Error(`[H2O] Title contract bridge export-set mismatch: expected ${TITLE_CONTRACT_EXPORT_PARTITION.sourceExports.length}, observed ${observed.length}.`);
  }
  return { transformedSource: transformed.join("\n"), exportNames: Object.freeze(observed) };
}

function literal(value) {
  return JSON.stringify(value);
}

function makeInstallationSource({ sourceSha256, repositoryHeadAtBuild, publicSurfaceDigest }) {
  const publicEntries = TITLE_CONTRACT_PUBLIC_EXPORTS.map((name) => `    ${name},`).join("\n");
  return `

  const __H2O_TITLE_CONTRACT_EXPECTED__ = Object.freeze({
    schemaVersion: 2,
    bridgeVersion: ${literal(TITLE_CONTRACT_BRIDGE_VERSION)},
    sourceSha256: ${literal(sourceSha256)},
    sourceExportCount: ${TITLE_CONTRACT_SOURCE_EXPORTS.length},
    publicExportCount: ${TITLE_CONTRACT_PUBLIC_EXPORTS.length},
    privilegedExportCount: ${TITLE_CONTRACT_PRIVILEGED_EXPORTS.length},
    sourceOnlyExportCount: ${TITLE_CONTRACT_SOURCE_ONLY_EXPORTS.length},
    publicSurfaceDigest: ${literal(publicSurfaceDigest)},
  });
  const __H2O_TITLE_CONTRACT_PUBLIC_KEYS__ = Object.freeze(${literal(TITLE_CONTRACT_PUBLIC_EXPORTS)});
  const __H2O_TITLE_CONTRACT_GLOBAL_STATUS_KEY__ = "__H2O_TITLE_CONTRACT_BRIDGE_STATUS_V3__";

  function __h2oOwnData(object, key) {
    try {
      const descriptor = Object.getOwnPropertyDescriptor(object, key);
      return descriptor && Object.prototype.hasOwnProperty.call(descriptor, "value")
        ? descriptor.value
        : undefined;
    } catch {
      return undefined;
    }
  }

  function __h2oOrdinaryObject(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    try {
      const prototype = Object.getPrototypeOf(value);
      return prototype === Object.prototype || prototype === null;
    } catch {
      return false;
    }
  }

  function __h2oIdentityResult(existing) {
    if (!__h2oOrdinaryObject(existing)) return "foreign-object";
    const identity = __h2oOwnData(existing, "identity");
    if (!__h2oOrdinaryObject(identity) || !Object.isFrozen(identity)) return "foreign-object";
    const schemaVersion = __h2oOwnData(identity, "schemaVersion");
    const bridgeVersion = __h2oOwnData(identity, "bridgeVersion");
    const sourceIdentity = __h2oOwnData(identity, "sourceSha256");
    const sourceExportCount = __h2oOwnData(identity, "sourceExportCount");
    const publicExportCount = __h2oOwnData(identity, "publicExportCount");
    const privilegedExportCount = __h2oOwnData(identity, "privilegedExportCount");
    const sourceOnlyExportCount = __h2oOwnData(identity, "sourceOnlyExportCount");
    const surfaceDigest = __h2oOwnData(identity, "publicSurfaceDigest");
    if (schemaVersion !== 2 || typeof bridgeVersion !== "string" ||
        typeof sourceIdentity !== "string" || typeof surfaceDigest !== "string") {
      return "foreign-object";
    }
    if (bridgeVersion !== __H2O_TITLE_CONTRACT_EXPECTED__.bridgeVersion ||
        sourceIdentity !== __H2O_TITLE_CONTRACT_EXPECTED__.sourceSha256 ||
        surfaceDigest !== __H2O_TITLE_CONTRACT_EXPECTED__.publicSurfaceDigest) {
      return "reload-required";
    }
    if (typeof sourceExportCount !== "number" || typeof publicExportCount !== "number" ||
        typeof privilegedExportCount !== "number" || typeof sourceOnlyExportCount !== "number") {
      return "foreign-object";
    }
    return sourceExportCount === __H2O_TITLE_CONTRACT_EXPECTED__.sourceExportCount &&
      publicExportCount === __H2O_TITLE_CONTRACT_EXPECTED__.publicExportCount &&
      privilegedExportCount === __H2O_TITLE_CONTRACT_EXPECTED__.privilegedExportCount &&
      sourceOnlyExportCount === __H2O_TITLE_CONTRACT_EXPECTED__.sourceOnlyExportCount
      ? "same-identity"
      : "reload-required";
  }

  function __h2oMakeBridgeStatus(result) {
    return Object.freeze({
      schemaVersion: 1,
      bridgeVersion: ${literal(TITLE_CONTRACT_BRIDGE_VERSION)},
      sourceSha256: __H2O_TITLE_CONTRACT_EXPECTED__.sourceSha256,
      result: String(result || "foreign-object").slice(0, 32),
    });
  }

  function __h2oDefineBoundedStatus(target, key, status) {
    try {
      const current = Object.getOwnPropertyDescriptor(target, key);
      if (!current || current.configurable === true) {
        Object.defineProperty(target, key, {
          value: status,
          writable: false,
          enumerable: false,
          configurable: true,
        });
        return true;
      }
    } catch {}
    return false;
  }

  function __h2oRecordBridgeStatus(h2o, result) {
    const status = __h2oMakeBridgeStatus(result);
    if (__h2oOrdinaryObject(h2o) &&
        __h2oDefineBoundedStatus(h2o, "TitleContractBridgeStatus", status)) {
      return status.result;
    }
    __h2oDefineBoundedStatus(globalThis, __H2O_TITLE_CONTRACT_GLOBAL_STATUS_KEY__, status);
    return status.result;
  }

  function __h2oResolveNamespace() {
    let descriptor;
    try { descriptor = Object.getOwnPropertyDescriptor(globalThis, "H2O"); }
    catch { return { h2o: null, result: "namespace-unavailable" }; }
    if (!descriptor) {
      const h2oNamespace = {};
      try {
        Object.defineProperty(globalThis, "H2O", {
          value: h2oNamespace,
          writable: true,
          enumerable: true,
          configurable: true,
        });
        return { h2o: h2oNamespace, result: "created" };
      } catch {
        return { h2o: null, result: "namespace-unavailable" };
      }
    }
    if (!Object.prototype.hasOwnProperty.call(descriptor, "value") ||
        descriptor.writable !== true || !__h2oOrdinaryObject(descriptor.value)) {
      return { h2o: null, result: "foreign-object" };
    }
    return { h2o: descriptor.value, result: "reused" };
  }

  function __h2oInstallTitleContract() {
    const namespace = __h2oResolveNamespace();
    const h2o = namespace.h2o;
    if (!h2o) return __h2oRecordBridgeStatus(null, namespace.result);
    let existingDescriptor;
    try { existingDescriptor = Object.getOwnPropertyDescriptor(h2o, "TitleContract"); }
    catch { return __h2oRecordBridgeStatus(h2o, "foreign-object"); }
    if (existingDescriptor) {
      if (!Object.prototype.hasOwnProperty.call(existingDescriptor, "value")) {
        return __h2oRecordBridgeStatus(h2o, "foreign-object");
      }
      const result = __h2oIdentityResult(existingDescriptor.value);
      __h2oRecordBridgeStatus(h2o, result);
      return result;
    }

    const identity = deepFreeze({
      schemaVersion: 2,
      bridgeVersion: ${literal(TITLE_CONTRACT_BRIDGE_VERSION)},
      sourceSha256: ${literal(sourceSha256)},
      sourceExportCount: ${TITLE_CONTRACT_SOURCE_EXPORTS.length},
      publicExportCount: ${TITLE_CONTRACT_PUBLIC_EXPORTS.length},
      privilegedExportCount: ${TITLE_CONTRACT_PRIVILEGED_EXPORTS.length},
      sourceOnlyExportCount: ${TITLE_CONTRACT_SOURCE_ONLY_EXPORTS.length},
      publicSurfaceKeys: __H2O_TITLE_CONTRACT_PUBLIC_KEYS__,
      publicSurfaceDigest: ${literal(publicSurfaceDigest)},
      generatorVersion: ${literal(TITLE_CONTRACT_BRIDGE_GENERATOR_VERSION)},
      repositoryHeadAtBuild: ${literal(repositoryHeadAtBuild)},
    });
    const bridge = deepFreeze({
      identity,
${publicEntries}
    });
    try {
      Object.defineProperty(h2o, "TitleContract", {
        value: bridge,
        writable: false,
        enumerable: false,
        configurable: false,
      });
    } catch {
      return __h2oRecordBridgeStatus(h2o, "foreign-object");
    }
    __h2oRecordBridgeStatus(h2o, "installed");
    return "installed";
  }

  __h2oInstallTitleContract();
})();
`;
}

export function transformTitleContractToClassicBridge({
  sourceBytes,
  committedSourceBytes = sourceBytes,
  repositoryHeadAtBuild,
} = {}) {
  const sourceBuffer = Buffer.isBuffer(sourceBytes) ? sourceBytes : Buffer.from(sourceBytes ?? "");
  const committedBuffer = Buffer.isBuffer(committedSourceBytes)
    ? committedSourceBytes
    : Buffer.from(committedSourceBytes ?? "");
  if (!sourceBuffer.equals(committedBuffer)) {
    throw new Error("[H2O] Title contract source differs from the committed HEAD blob.");
  }
  if (!/^[0-9a-f]{40}$/u.test(String(repositoryHeadAtBuild || ""))) {
    throw new Error("[H2O] Title contract bridge requires a full repository HEAD identity.");
  }
  const source = sourceBuffer.toString("utf8");
  if (!Buffer.from(source, "utf8").equals(sourceBuffer)) {
    throw new Error("[H2O] Title contract source must be valid UTF-8.");
  }
  const grammar = inspectGrammar(source);
  const sourceSha256 = sha256(sourceBuffer);
  const publicSurfaceDigest = computeTitleContractPublicSurfaceDigest();
  const code = `(() => {\n  "use strict";\n\n${grammar.transformedSource}${makeInstallationSource({
    sourceSha256,
    repositoryHeadAtBuild,
    publicSurfaceDigest,
  })}`;
  return Object.freeze({
    code,
    sourceSha256,
    sourceExportCount: grammar.exportNames.length,
    sourceExportNames: grammar.exportNames,
    publicSurfaceKeys: TITLE_CONTRACT_PUBLIC_EXPORTS,
    privilegedSurfaceKeys: TITLE_CONTRACT_PRIVILEGED_EXPORTS,
    sourceOnlySurfaceKeys: TITLE_CONTRACT_SOURCE_ONLY_EXPORTS,
    publicSurfaceDigest,
    repositoryHeadAtBuild,
    bridgeVersion: TITLE_CONTRACT_BRIDGE_VERSION,
    generatorVersion: TITLE_CONTRACT_BRIDGE_GENERATOR_VERSION,
  });
}

export function makeCanonicalTitleContractBridge({ repositoryRoot = DEFAULT_REPOSITORY_ROOT } = {}) {
  const root = path.resolve(repositoryRoot);
  const sourcePath = path.join(root, CONTRACT_RELATIVE_PATH);
  const repositoryHeadAtBuild = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim();
  const sourceBytes = fs.readFileSync(sourcePath);
  const committedSourceBytes = execFileSync("git", ["show", `HEAD:${CONTRACT_RELATIVE_PATH}`], {
    cwd: root,
    encoding: null,
    maxBuffer: 16 * 1024 * 1024,
  });
  return transformTitleContractToClassicBridge({
    sourceBytes,
    committedSourceBytes,
    repositoryHeadAtBuild,
  });
}
