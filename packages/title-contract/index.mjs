export const SCHEMA_VERSION = 2;

export const TITLE_PROVENANCE = Object.freeze({
  UNKNOWN: "unknown",
  LEGACY: "legacy",
  COMPATIBILITY: "compatibility",
  IMPORT: "import",
  STORE: "store",
  AUTO_SUGGESTION: "auto-suggestion",
  STUDIO_USER: "studio-user",
  EXPLICIT_USER: "explicit-user",
  NATIVE_OBSERVED: "native-observed",
  NATIVE_CONFIRMED: "native-confirmed",
});

export const EMOJI_PROVENANCE = Object.freeze({
  UNKNOWN: "unknown",
  LEGACY: "legacy",
  COMPATIBILITY: "compatibility",
  IMPORT: "import",
  STORE: "store",
  AUTO_SUGGESTION: "auto-suggestion",
  STUDIO_USER: "studio-user",
  EXPLICIT_USER: "explicit-user",
});

export const BASE_PRIORITY = Object.freeze({
  [TITLE_PROVENANCE.UNKNOWN]: 0,
  [TITLE_PROVENANCE.LEGACY]: 10,
  [TITLE_PROVENANCE.COMPATIBILITY]: 20,
  [TITLE_PROVENANCE.IMPORT]: 30,
  [TITLE_PROVENANCE.STORE]: 40,
  [TITLE_PROVENANCE.AUTO_SUGGESTION]: 50,
  [TITLE_PROVENANCE.STUDIO_USER]: 80,
  [TITLE_PROVENANCE.EXPLICIT_USER]: 90,
  [TITLE_PROVENANCE.NATIVE_OBSERVED]: 95,
  [TITLE_PROVENANCE.NATIVE_CONFIRMED]: 100,
});

export const EMOJI_PRIORITY = Object.freeze({
  [EMOJI_PROVENANCE.UNKNOWN]: 0,
  [EMOJI_PROVENANCE.LEGACY]: 10,
  [EMOJI_PROVENANCE.COMPATIBILITY]: 20,
  [EMOJI_PROVENANCE.IMPORT]: 30,
  [EMOJI_PROVENANCE.STORE]: 40,
  [EMOJI_PROVENANCE.AUTO_SUGGESTION]: 50,
  [EMOJI_PROVENANCE.STUDIO_USER]: 80,
  [EMOJI_PROVENANCE.EXPLICIT_USER]: 90,
});

const canonicalRecords = new WeakSet();
const mintAuthorities = new WeakSet();
const persistenceEvidence = new WeakSet();
const BAD = Symbol("bad-data-property");
const LIMIT = Object.freeze({
  chatId: 256,
  title: 512,
  emoji: 64,
  actorId: 96,
  operationId: 128,
  surface: 48,
  backend: 64,
  receiptId: 768,
  route: 2048,
  error: 96,
});
const MIGRATION_STATES = new Set([
  "idle", "candidate-normalized", "write-pending", "written",
  "readback-verified", "receipt-persisted", "delete-eligible", "deleted", "failed",
]);
const RENAME_STATES = new Set([
  "idle", "preparing", "pending", "superseded", "confirmed", "failed", "rolledBack", "reconcile",
]);
const PERSISTED_TITLE_RECORD_KEYS = new Set([
  "version", "chatId", "baseTitle", "source", "priority", "confidence",
  "emoji", "emojiSource", "emojiPriority", "emojiConfidence", "updatedAt", "emojiUpdatedAt",
]);
const TITLE_BOOT_CACHE_KEYS = new Set(["version", "chatId", "state", "updatedAt", "expiresAt"]);

function isPlainObject(value) {
  if (value === null || typeof value !== "object") return false;
  try {
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  } catch {
    return false;
  }
}

function ownData(object, key, required = false) {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(object, key);
    if (!descriptor) return required ? BAD : undefined;
    if (!("value" in descriptor) || descriptor.get || descriptor.set) return BAD;
    return descriptor.value;
  } catch {
    return BAD;
  }
}

function onlyKeys(object, allowlist) {
  try {
    return Reflect.ownKeys(object).every((key) => typeof key === "string" && allowlist.has(key));
  } catch {
    return false;
  }
}

function boundedString(value, max, { empty = false } = {}) {
  return typeof value === "string" && value.length <= max && (empty || value.length > 0);
}

function safeInteger(value, minimum = 0) {
  return Number.isSafeInteger(value) && value >= minimum;
}

function supportedPersistedVersion(value) {
  return value === 1 || value === "1.0.0";
}

function normalizeWhitespace(value) {
  return typeof value === "string" ? value.trim().replace(/\s+/gu, " ") : "";
}

function validPersistedChatId(value) {
  return boundedString(value, LIMIT.chatId) &&
    !/^g-p-/iu.test(value) &&
    /^[a-z0-9][a-z0-9_-]{7,255}$/iu.test(value);
}

function validPersistedSource(value) {
  return boundedString(value, LIMIT.surface) && /^[a-z0-9][a-z0-9:._-]*$/iu.test(value);
}

function deepFreeze(value, seen = new WeakSet()) {
  if (!value || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor && "value" in descriptor) deepFreeze(descriptor.value, seen);
  }
  return Object.freeze(value);
}

function frozenArray(values) {
  return Object.freeze([...values]);
}

function safeStringArray(raw, max = LIMIT.backend) {
  if (raw === undefined) return frozenArray([]);
  if (!Array.isArray(raw)) return null;
  let length;
  try { length = raw.length; } catch { return null; }
  if (!safeInteger(length) || length > 64) return null;
  const result = [];
  for (let index = 0; index < length; index += 1) {
    const value = ownData(raw, String(index), true);
    if (!boundedString(value, max)) return null;
    result.push(value);
  }
  return frozenArray(result);
}

function normalizeVersion(raw, fallbackActor = "unknown") {
  if (!isPlainObject(raw) || !onlyKeys(raw, new Set(["counter", "actorId"]))) return null;
  const counter = ownData(raw, "counter", true);
  const actorId = ownData(raw, "actorId", true);
  if (!safeInteger(counter) || !boundedString(actorId, LIMIT.actorId)) return null;
  return Object.freeze({ counter, actorId: actorId || fallbackActor });
}

function defaultVersion(actorId = "unknown") {
  return Object.freeze({ counter: 0, actorId });
}

function normalizeDurability(raw) {
  if (raw === undefined || raw === null) {
    return deepFreeze({ durable: false, succeededBackends: [], failedBackends: [], requiredBackendSatisfied: false, errorKind: null });
  }
  const keys = new Set(["durable", "succeededBackends", "failedBackends", "requiredBackendSatisfied", "errorKind"]);
  if (!isPlainObject(raw) || !onlyKeys(raw, keys)) return null;
  const durable = ownData(raw, "durable");
  const required = ownData(raw, "requiredBackendSatisfied");
  const errorKind = ownData(raw, "errorKind");
  const succeeded = safeStringArray(ownData(raw, "succeededBackends"));
  const failed = safeStringArray(ownData(raw, "failedBackends"));
  if ((durable !== undefined && typeof durable !== "boolean") ||
      (required !== undefined && typeof required !== "boolean") ||
      (errorKind !== undefined && errorKind !== null && !boundedString(errorKind, LIMIT.error)) ||
      !succeeded || !failed) return null;
  return deepFreeze({
    durable: durable === true,
    succeededBackends: succeeded,
    failedBackends: failed,
    requiredBackendSatisfied: required === true,
    errorKind: errorKind ?? null,
  });
}

function normalizeMigrationSnapshot(raw) {
  if (raw === undefined || raw === null) return deepFreeze({ state: "idle", receipt: null });
  if (!isPlainObject(raw) || !onlyKeys(raw, new Set(["state", "receipt"]))) return null;
  const state = ownData(raw, "state", true);
  const receipt = ownData(raw, "receipt");
  if (!MIGRATION_STATES.has(state) || (receipt !== undefined && receipt !== null && !isPlainObject(receipt))) return null;
  return deepFreeze({ state, receipt: null });
}

function expectedPriority(kind, source) {
  const table = kind === "title" ? BASE_PRIORITY : EMOJI_PRIORITY;
  return Object.prototype.hasOwnProperty.call(table, source) ? table[source] : null;
}

function cloneConfirmation(raw) {
  const keys = new Set(["operationId", "confirmedValue", "confirmedAt", "adapterReceiptId", "routeGeneration"]);
  if (!isPlainObject(raw) || !onlyKeys(raw, keys)) return null;
  const operationId = ownData(raw, "operationId", true);
  const confirmedValue = ownData(raw, "confirmedValue", true);
  const confirmedAt = ownData(raw, "confirmedAt", true);
  const adapterReceiptId = ownData(raw, "adapterReceiptId", true);
  const routeGeneration = ownData(raw, "routeGeneration", true);
  if (!boundedString(operationId, LIMIT.operationId) || !boundedString(confirmedValue, LIMIT.title) ||
      !safeInteger(confirmedAt) || !boundedString(adapterReceiptId, LIMIT.receiptId) ||
      !safeInteger(routeGeneration)) return null;
  return deepFreeze({ operationId, confirmedValue, confirmedAt, adapterReceiptId, routeGeneration });
}

function fieldShape(raw, kind, { stripConfirmation = true } = {}) {
  const keys = new Set(["value", "tombstone", "source", "priority", "confidence", "version", "routeGeneration", "operationId", "updatedAt"]);
  if (kind === "title") keys.add("nativeConfirmation");
  if (!isPlainObject(raw) || !onlyKeys(raw, keys)) return null;
  let value = ownData(raw, "value", true);
  const tombstone = ownData(raw, "tombstone", true);
  const claimedSource = ownData(raw, "source", true);
  const claimedPriority = ownData(raw, "priority");
  const confidence = ownData(raw, "confidence", true);
  const version = normalizeVersion(ownData(raw, "version", true));
  const routeGeneration = ownData(raw, "routeGeneration", true);
  const operationId = ownData(raw, "operationId");
  const updatedAt = ownData(raw, "updatedAt", true);
  const nativeRaw = kind === "title" ? ownData(raw, "nativeConfirmation") : undefined;
  if ([value, tombstone, claimedSource, confidence, routeGeneration, operationId, updatedAt, nativeRaw].includes(BAD)) return null;
  const stripsClaimedNativeAuthority = kind === "title" && stripConfirmation && claimedSource === TITLE_PROVENANCE.NATIVE_CONFIRMED;
  const source = stripsClaimedNativeAuthority ? TITLE_PROVENANCE.UNKNOWN : claimedSource;
  if (kind === "emoji" && value === "") value = null;
  const valueMax = kind === "title" ? LIMIT.title : LIMIT.emoji;
  if (value !== null && !boundedString(value, valueMax)) return null;
  if (typeof tombstone !== "boolean" || (tombstone && value !== null) || (kind === "title" && tombstone)) return null;
  const priority = expectedPriority(kind, source);
  if (priority === null || (!stripsClaimedNativeAuthority && claimedPriority !== undefined && claimedPriority !== priority)) return null;
  if (typeof confidence !== "number" || !Number.isFinite(confidence) || confidence < 0 || confidence > 1 ||
      !version || !safeInteger(routeGeneration) ||
      (operationId !== undefined && operationId !== null && !boundedString(operationId, LIMIT.operationId)) ||
      !safeInteger(updatedAt)) return null;
  let nativeConfirmation = null;
  if (kind === "title" && !stripConfirmation && nativeRaw !== undefined && nativeRaw !== null) {
    nativeConfirmation = cloneConfirmation(nativeRaw);
    if (!nativeConfirmation) return null;
  }
  return deepFreeze({
    value,
    tombstone,
    source,
    priority,
    confidence,
    version,
    routeGeneration,
    operationId: operationId ?? null,
    updatedAt,
    ...(kind === "title" ? { nativeConfirmation } : {}),
  });
}

export function normalizeField(raw, kind = "title") {
  if (kind !== "title" && kind !== "emoji") return null;
  try { return fieldShape(raw, kind, { stripConfirmation: true }); } catch { return null; }
}

function legacyField(value, kind) {
  if (kind === "emoji" && value === "") value = null;
  if (value !== null && !boundedString(value, kind === "title" ? LIMIT.title : LIMIT.emoji)) return null;
  const source = kind === "title" ? TITLE_PROVENANCE.LEGACY : EMOJI_PROVENANCE.LEGACY;
  return deepFreeze({
    value,
    tombstone: false,
    source,
    priority: expectedPriority(kind, source),
    confidence: 0,
    version: defaultVersion("legacy"),
    routeGeneration: 0,
    operationId: null,
    updatedAt: 0,
    ...(kind === "title" ? { nativeConfirmation: null } : {}),
  });
}

function brandRecord(record) {
  deepFreeze(record);
  canonicalRecords.add(record);
  return record;
}

function makeRecord(parts) {
  return brandRecord({
    schemaVersion: SCHEMA_VERSION,
    chatId: parts.chatId,
    title: parts.title,
    emoji: parts.emoji,
    writerSurface: parts.writerSurface,
    recordUpdatedAt: parts.recordUpdatedAt,
    durability: parts.durability,
    migration: parts.migration,
  });
}

export function normalizeRecord(raw) {
  try {
    const keys = new Set(["schemaVersion", "version", "chatId", "title", "emoji", "writerSurface", "recordUpdatedAt", "durability", "migration"]);
    if (!isPlainObject(raw) || !onlyKeys(raw, keys)) return null;
    const schemaVersion = ownData(raw, "schemaVersion");
    const legacyVersion = ownData(raw, "version");
    const chatId = ownData(raw, "chatId", true);
    const titleRaw = ownData(raw, "title", true);
    const emojiRaw = ownData(raw, "emoji", true);
    const writerSurface = ownData(raw, "writerSurface");
    const recordUpdatedAt = ownData(raw, "recordUpdatedAt");
    const durability = normalizeDurability(ownData(raw, "durability"));
    const migration = normalizeMigrationSnapshot(ownData(raw, "migration"));
    if ([schemaVersion, legacyVersion, chatId, titleRaw, emojiRaw, writerSurface, recordUpdatedAt].includes(BAD) ||
        !boundedString(chatId, LIMIT.chatId) || !durability || !migration) return null;
    const surface = writerSurface === undefined ? "unknown" : writerSurface;
    const updatedAt = recordUpdatedAt === undefined ? 0 : recordUpdatedAt;
    if (!boundedString(surface, LIMIT.surface) || !safeInteger(updatedAt)) return null;
    let title;
    let emoji;
    if (schemaVersion === SCHEMA_VERSION) {
      if (legacyVersion !== undefined) return null;
      title = normalizeField(titleRaw, "title");
      emoji = normalizeField(emojiRaw, "emoji");
    } else if (schemaVersion === undefined && (legacyVersion === 1 || legacyVersion === "1.0.0")) {
      title = legacyField(titleRaw, "title");
      emoji = legacyField(emojiRaw, "emoji");
    } else {
      return null;
    }
    if (!title || !emoji) return null;
    return makeRecord({ chatId, title, emoji, writerSurface: surface, recordUpdatedAt: updatedAt, durability, migration });
  } catch {
    return null;
  }
}

export function validateRecord(raw) {
  return normalizeRecord(raw) !== null;
}

export function normalizePersistedTitleRecordV1(raw) {
  try {
    if (!isPlainObject(raw) || !onlyKeys(raw, PERSISTED_TITLE_RECORD_KEYS)) return null;
    const present = new Set(Reflect.ownKeys(raw));
    const version = ownData(raw, "version", true);
    const rawChatId = ownData(raw, "chatId", true);
    if (version === BAD || rawChatId === BAD || !supportedPersistedVersion(version) || typeof rawChatId !== "string") return null;
    const chatId = rawChatId.trim();
    if (!validPersistedChatId(chatId)) return null;

    const titleKeys = ["baseTitle", "source", "priority", "confidence", "updatedAt"];
    const emojiKeys = ["emoji", "emojiSource", "emojiPriority", "emojiConfidence", "emojiUpdatedAt"];
    const hasTitle = present.has("baseTitle");
    const hasEmoji = present.has("emoji");
    if (!hasTitle && !hasEmoji) return null;
    if (!hasTitle && titleKeys.some((key) => key !== "baseTitle" && present.has(key))) return null;
    if (!hasEmoji && emojiKeys.some((key) => key !== "emoji" && present.has(key))) return null;

    const result = { version, chatId };
    for (const key of [...titleKeys, ...emojiKeys]) {
      if (!present.has(key)) continue;
      const value = ownData(raw, key, true);
      if (value === BAD) return null;
      if (key === "baseTitle") {
        if (typeof value !== "string" || value.length > LIMIT.title) return null;
        result.baseTitle = sanitizeNativeTitle(value);
      } else if (key === "emoji") {
        if (value !== null && typeof value !== "string") return null;
        const emoji = value === null ? "" : value.trim();
        if (emoji.length > LIMIT.emoji) return null;
        result.emoji = emoji || null;
      } else if (key === "source" || key === "emojiSource") {
        if (typeof value !== "string") return null;
        const source = value.trim();
        if (!validPersistedSource(source)) return null;
        result[key] = source;
      } else if (key === "priority" || key === "emojiPriority" || key === "updatedAt" || key === "emojiUpdatedAt") {
        if (!safeInteger(value)) return null;
        result[key] = value;
      } else {
        if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) return null;
        result[key] = value;
      }
    }
    return deepFreeze(result);
  } catch {
    return null;
  }
}

export function normalizeTitleBootCacheV1(raw) {
  try {
    if (!isPlainObject(raw) || !onlyKeys(raw, TITLE_BOOT_CACHE_KEYS)) return null;
    const version = ownData(raw, "version", true);
    const rawChatId = ownData(raw, "chatId", true);
    const stateRaw = ownData(raw, "state", true);
    const updatedAt = ownData(raw, "updatedAt", true);
    const expiresAt = ownData(raw, "expiresAt", true);
    if ([version, rawChatId, stateRaw, updatedAt, expiresAt].includes(BAD) ||
        !supportedPersistedVersion(version) || typeof rawChatId !== "string" ||
        !safeInteger(updatedAt) || !safeInteger(expiresAt) || expiresAt <= updatedAt) return null;
    const chatId = rawChatId.trim();
    if (!validPersistedChatId(chatId)) return null;
    const state = normalizePersistedTitleRecordV1(stateRaw);
    if (!state || state.chatId !== chatId) return null;
    return deepFreeze({ version, chatId, state, updatedAt, expiresAt });
  } catch {
    return null;
  }
}

function isDeepFrozen(value, seen = new WeakSet()) {
  if (!value || typeof value !== "object" || seen.has(value)) return true;
  if (!Object.isFrozen(value)) return false;
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor) || !isDeepFrozen(descriptor.value, seen)) return false;
  }
  return true;
}

function validCanonicalField(field, kind) {
  const normalized = fieldShape(field, kind, { stripConfirmation: false });
  if (!normalized) return false;
  const keys = kind === "title"
    ? ["value", "tombstone", "source", "priority", "confidence", "version", "routeGeneration", "operationId", "updatedAt", "nativeConfirmation"]
    : ["value", "tombstone", "source", "priority", "confidence", "version", "routeGeneration", "operationId", "updatedAt"];
  return keys.every((key) => Object.is(field[key], normalized[key]) || (key === "version" &&
    field.version.counter === normalized.version.counter && field.version.actorId === normalized.version.actorId) ||
    (key === "nativeConfirmation" && JSON.stringify(field.nativeConfirmation) === JSON.stringify(normalized.nativeConfirmation)));
}

export function validateCanonicalRecord(record) {
  try {
    if (!canonicalRecords.has(record) || !isDeepFrozen(record) || record.schemaVersion !== SCHEMA_VERSION) return false;
    if (!boundedString(record.chatId, LIMIT.chatId) || !boundedString(record.writerSurface, LIMIT.surface) || !safeInteger(record.recordUpdatedAt)) return false;
    if (!validCanonicalField(record.title, "title") || !validCanonicalField(record.emoji, "emoji")) return false;
    if (!record.durability || !record.migration || !isDeepFrozen(record.durability) || !isDeepFrozen(record.migration)) return false;
    return true;
  } catch {
    return false;
  }
}

function evidenceReceiptIds(evidence) {
  return persistenceEvidence.has(evidence) ? evidence.adapterReceiptIds : frozenArray([]);
}

export function verifyNativeConfirmation(confirmation, context = {}) {
  const clean = cloneConfirmation(confirmation);
  if (!clean || !isPlainObject(context)) return false;
  const trustedIds = context.trustedAdapterReceiptIds ?? evidenceReceiptIds(context.persistenceEvidence);
  const superseded = Array.isArray(context.supersededOperationIds) ? context.supersededOperationIds : [];
  const now = safeInteger(context.now) ? context.now : clean.confirmedAt;
  const maxAgeMs = safeInteger(context.maxAgeMs) ? context.maxAgeMs : 24 * 60 * 60 * 1000;
  return boundedString(context.chatId, LIMIT.chatId) &&
    context.chatId === context.expectedChatId &&
    clean.operationId === context.latestPendingOperationId &&
    clean.routeGeneration === context.expectedRouteGeneration &&
    Array.isArray(trustedIds) && trustedIds.includes(clean.adapterReceiptId) &&
    !superseded.includes(clean.operationId) &&
    clean.confirmedAt <= now && clean.confirmedAt >= now - maxAgeMs &&
    (context.confirmedValue === undefined || clean.confirmedValue === context.confirmedValue);
}

export function hydrateCanonicalRecord(persistedRaw, trustedEvidence, context = {}) {
  const normalized = normalizeRecord(persistedRaw);
  if (!normalized || !persistenceEvidence.has(trustedEvidence) || !trustedEvidence.durable || !trustedEvidence.requiredBackendSatisfied) return normalized;
  try {
    const titleRaw = ownData(persistedRaw, "title", true);
    const confirmationRaw = isPlainObject(titleRaw) ? ownData(titleRaw, "nativeConfirmation") : null;
    const confirmation = cloneConfirmation(confirmationRaw);
    if (!confirmation || !verifyNativeConfirmation(confirmation, {
      ...context,
      chatId: normalized.chatId,
      expectedChatId: context.expectedChatId ?? normalized.chatId,
      confirmedValue: normalized.title.value,
      persistenceEvidence: trustedEvidence,
    })) return normalized;
    const title = deepFreeze({
      ...normalized.title,
      source: TITLE_PROVENANCE.NATIVE_CONFIRMED,
      priority: BASE_PRIORITY[TITLE_PROVENANCE.NATIVE_CONFIRMED],
      nativeConfirmation: confirmation,
    });
    return makeRecord({ ...normalized, title });
  } catch {
    return normalized;
  }
}

export function fieldStatus(field) {
  if (!field || typeof field !== "object") return "unknown";
  if (field.value === null && field.tombstone === true) return "tombstone";
  if (field.value !== null && field.tombstone === false) return "present";
  return "unknown";
}

export function compareFieldVersionCounter(a, b) {
  if (!a || !b || !safeInteger(a.counter) || !safeInteger(b.counter)) throw new TypeError("invalid field version");
  return a.counter === b.counter ? 0 : a.counter > b.counter ? 1 : -1;
}

function compareFieldAuthority(a, b) {
  const version = compareFieldVersionCounter(a.version, b.version);
  if (version) return version;
  if (a.priority !== b.priority) return a.priority > b.priority ? 1 : -1;
  if (a.updatedAt !== b.updatedAt) return a.updatedAt > b.updatedAt ? 1 : -1;
  return a.version.actorId === b.version.actorId ? 0 : a.version.actorId > b.version.actorId ? 1 : -1;
}

function sameField(a, b, kind) {
  return a.value === b.value && a.tombstone === b.tombstone && a.source === b.source &&
    a.priority === b.priority && a.confidence === b.confidence &&
    a.version.counter === b.version.counter && a.version.actorId === b.version.actorId &&
    a.routeGeneration === b.routeGeneration && a.operationId === b.operationId && a.updatedAt === b.updatedAt &&
    (kind !== "title" || JSON.stringify(a.nativeConfirmation) === JSON.stringify(b.nativeConfirmation));
}

function mergeField(current, incomingRaw, kind, context = {}) {
  const incoming = fieldShape(incomingRaw, kind, { stripConfirmation: true });
  if (!incoming || !validCanonicalField(current, kind)) return current;
  if (context.currentChatId && context.incomingChatId && context.currentChatId !== context.incomingChatId) return current;
  const currentStatus = fieldStatus(current);
  const incomingStatus = fieldStatus(incoming);
  if (kind === "title" && (incoming.tombstone || incoming.value === "")) return current;
  if (incomingStatus === "unknown" && currentStatus !== "unknown") return current;
  if (currentStatus === "unknown" && incomingStatus !== "unknown") return incoming;
  if (incomingStatus === "unknown") return current;
  if (compareFieldAuthority(incoming, current) <= 0) return current;
  return sameField(current, incoming, kind) ? current : incoming;
}

export function mergeTitleField(current, incoming, context = {}) {
  return mergeField(current, incoming, "title", context);
}

export function mergeEmojiField(current, incoming, context = {}) {
  return mergeField(current, incoming, "emoji", context);
}

export function mergeRecord(currentCanonical, incomingRaw, context = {}) {
  if (!validateCanonicalRecord(currentCanonical)) throw new TypeError("current record is not canonical");
  const incoming = normalizeRecord(incomingRaw);
  if (!incoming || incoming.chatId !== currentCanonical.chatId) return currentCanonical;
  const mergeContext = { ...context, currentChatId: currentCanonical.chatId, incomingChatId: incoming.chatId };
  const title = mergeTitleField(currentCanonical.title, incoming.title, mergeContext);
  const emoji = mergeEmojiField(currentCanonical.emoji, incoming.emoji, mergeContext);
  if (title === currentCanonical.title && emoji === currentCanonical.emoji) return currentCanonical;
  return makeRecord({
    ...currentCanonical,
    title,
    emoji,
    writerSurface: incoming.writerSurface,
    recordUpdatedAt: Math.max(currentCanonical.recordUpdatedAt, incoming.recordUpdatedAt),
  });
}

export function createMintAuthority(actorId, actorKind) {
  if (!boundedString(actorId, LIMIT.actorId) || !["coordinator", "native-adapter", "user-intent", "studio-user"].includes(actorKind)) {
    throw new TypeError("invalid mint authority");
  }
  const authority = Object.freeze({ actorId, actorKind });
  mintAuthorities.add(authority);
  return authority;
}

export function nextFieldVersion(observedVersions, mintCapability) {
  if (!mintAuthorities.has(mintCapability)) throw new TypeError("valid mint capability required");
  if (!Array.isArray(observedVersions)) throw new TypeError("observedVersions must be an array");
  let maximum = 0;
  for (const observed of observedVersions) {
    const version = observed?.version ?? observed;
    if (!version || !safeInteger(version.counter)) throw new TypeError("invalid observed version");
    maximum = Math.max(maximum, version.counter);
  }
  if (maximum === Number.MAX_SAFE_INTEGER) throw new RangeError("field version overflow");
  return Object.freeze({ counter: maximum + 1, actorId: mintCapability.actorId });
}

export function applyTrustedNativeConfirmation(currentCanonical, confirmation, context, mintCapability) {
  if (!validateCanonicalRecord(currentCanonical)) throw new TypeError("current record is not canonical");
  const verified = verifyNativeConfirmation(confirmation, {
    ...context,
    chatId: currentCanonical.chatId,
    expectedChatId: context?.expectedChatId ?? currentCanonical.chatId,
  });
  if (!verified || !mintAuthorities.has(mintCapability)) return currentCanonical;
  const clean = cloneConfirmation(confirmation);
  const version = nextFieldVersion([currentCanonical.title.version, ...(context?.observedVersions ?? [])], mintCapability);
  const title = deepFreeze({
    value: clean.confirmedValue,
    tombstone: false,
    source: TITLE_PROVENANCE.NATIVE_CONFIRMED,
    priority: BASE_PRIORITY[TITLE_PROVENANCE.NATIVE_CONFIRMED],
    confidence: 1,
    version,
    routeGeneration: clean.routeGeneration,
    operationId: clean.operationId,
    updatedAt: clean.confirmedAt,
    nativeConfirmation: clean,
  });
  return makeRecord({ ...currentCanonical, title, recordUpdatedAt: Math.max(currentCanonical.recordUpdatedAt, clean.confirmedAt) });
}

export function createRenameOperation(input) {
  if (!isPlainObject(input)) throw new TypeError("rename input required");
  const provenance = input.provenance ?? TITLE_PROVENANCE.EXPLICIT_USER;
  if (!boundedString(input.chatId, LIMIT.chatId) || !boundedString(input.operationId, LIMIT.operationId) ||
      !boundedString(input.requestedTitle, LIMIT.title) || input.requestedTitle.trim().length === 0 ||
      (input.expectedPreviousTitle !== null && !boundedString(input.expectedPreviousTitle, LIMIT.title, { empty: true })) ||
      !safeInteger(input.routeGeneration) || !safeInteger(input.startedAt) ||
      ![TITLE_PROVENANCE.EXPLICIT_USER, TITLE_PROVENANCE.STUDIO_USER].includes(provenance)) {
    throw new TypeError("invalid rename operation");
  }
  return deepFreeze({
    chatId: input.chatId,
    operationId: input.operationId,
    requestedTitle: input.requestedTitle.trim(),
    expectedPreviousTitle: input.expectedPreviousTitle,
    routeGeneration: input.routeGeneration,
    startedAt: input.startedAt,
    provenance,
  });
}

function renameState(state = null) {
  if (state && RENAME_STATES.has(state.state)) return state;
  return deepFreeze({ state: "idle", active: null, supersededOperationIds: [], error: null, confirmation: null });
}

export function reduceRename(previous, event) {
  const state = renameState(previous);
  if (!isPlainObject(event) || !boundedString(event.type, 32)) return state;
  if (event.type === "start") {
    const operation = createRenameOperation(event.operation);
    const superseded = state.active && state.active.operationId !== operation.operationId
      ? [...state.supersededOperationIds, state.active.operationId]
      : [...state.supersededOperationIds];
    return deepFreeze({ state: "preparing", active: operation, supersededOperationIds: superseded, error: null, confirmation: null });
  }
  if (!state.active || (event.operationId && event.operationId !== state.active.operationId)) return state;
  if (event.type === "prepared" || event.type === "dispatched") return deepFreeze({ ...state, state: "pending" });
  if (event.type === "supersede") return deepFreeze({ ...state, state: "superseded" });
  if (event.type === "route-change" && event.routeGeneration !== state.active.routeGeneration) return deepFreeze({ ...state, state: "reconcile" });
  if (event.type === "response") {
    if (event.routeGeneration !== undefined && event.routeGeneration !== state.active.routeGeneration) return deepFreeze({ ...state, state: "reconcile" });
    if (event.ok !== true) return deepFreeze({ ...state, state: "failed", error: { kind: event.errorKind ?? "http" } });
    return state;
  }
  if (event.type === "confirmed") {
    const trustedConfirmation = cloneConfirmation(event.confirmation);
    return trustedConfirmation ? deepFreeze({ ...state, state: "confirmed", confirmation: trustedConfirmation, error: null }) : state;
  }
  if (["timeout", "http-error", "auth-error", "conflict"].includes(event.type)) {
    return deepFreeze({ ...state, state: "failed", error: { kind: event.type } });
  }
  if (event.type === "rollback") {
    const kind = boundedString(event.error?.kind, LIMIT.error) ? event.error.kind : "rollback";
    return deepFreeze({ ...state, state: "rolledBack", error: { kind } });
  }
  if (event.type === "reconcile") return deepFreeze({ ...state, state: "reconcile" });
  return state;
}

export function isRTL(value) {
  return typeof value === "string" && /[\u0590-\u05FF\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFC]/u.test(value);
}

export function sanitizeNativeTitle(value) {
  return normalizeWhitespace(value).replace(/\s*[-\u2013\u2014]\s*chatgpt$/iu, "").trim();
}

export function formatDisplayTitle(baseTitle, emoji) {
  const title = typeof baseTitle === "string" ? baseTitle.trim().replace(/\s+/gu, " ") : "";
  const mark = typeof emoji === "string" ? emoji.trim() : "";
  const dir = isRTL(title) ? "rtl" : "ltr";
  if (!mark) return Object.freeze({ text: title, dir });
  return Object.freeze({ text: dir === "rtl" ? `${title} ${mark}`.trim() : `${mark} ${title}`.trim(), dir });
}

function codePointToken(value, index) {
  if (index < 0 || index >= value.length) return null;
  const codePoint = value.codePointAt(index);
  if (codePoint === undefined) return null;
  return { codePoint, width: codePoint > 0xFFFF ? 2 : 1 };
}

function extendedPictographicToken(value, index) {
  const token = codePointToken(value, index);
  if (!token) return null;
  return /^\p{Extended_Pictographic}$/u.test(value.slice(index, index + token.width)) ? token : null;
}

function consumeOptionalEmojiComponents(value, index) {
  let cursor = index;
  if (codePointToken(value, cursor)?.codePoint === 0xFE0F) cursor += 1;
  const modifier = codePointToken(value, cursor)?.codePoint;
  if (modifier >= 0x1F3FB && modifier <= 0x1F3FF) cursor += 2;
  return cursor;
}

function consumePictographicComponent(value, index) {
  const base = extendedPictographicToken(value, index);
  return base ? consumeOptionalEmojiComponents(value, index + base.width) : -1;
}

function consumeSupportedEmojiSequence(value, index = 0) {
  const first = codePointToken(value, index);
  if (!first) return -1;

  if (first.codePoint >= 0x1F1E6 && first.codePoint <= 0x1F1FF) {
    const second = codePointToken(value, index + first.width);
    return second && second.codePoint >= 0x1F1E6 && second.codePoint <= 0x1F1FF
      ? index + first.width + second.width
      : -1;
  }

  if (/^[#*0-9]$/u.test(value[index])) {
    let cursor = index + 1;
    if (codePointToken(value, cursor)?.codePoint === 0xFE0F) cursor += 1;
    return codePointToken(value, cursor)?.codePoint === 0x20E3 ? cursor + 1 : -1;
  }

  let cursor = consumePictographicComponent(value, index);
  if (cursor < 0) return -1;
  while (codePointToken(value, cursor)?.codePoint === 0x200D) {
    cursor = consumePictographicComponent(value, cursor + 1);
    if (cursor < 0) return -1;
  }
  return cursor;
}

function selectedEmojiSequence(value) {
  if (typeof value !== "string") return "";
  const clean = value.trim();
  if (!clean || clean.length > LIMIT.emoji) return "";
  return consumeSupportedEmojiSequence(clean) === clean.length ? clean : "";
}

function startsWithSelectedSequence(title, selected, start, end) {
  if (start + selected.length > end || !title.startsWith(selected, start)) return false;
  return consumeSupportedEmojiSequence(title, start) === start + selected.length;
}

function endsWithSelectedSequence(title, selected, start, end) {
  const candidate = end - selected.length;
  if (candidate < start || title.slice(candidate, end) !== selected) return false;
  return title[candidate - 1] !== "\u200D" &&
    consumeSupportedEmojiSequence(title, candidate) === end;
}

function stripSelectedEmojiEdges(title, selected) {
  if (!title || !selected) return title;
  let start = 0;
  let end = title.length;
  while (startsWithSelectedSequence(title, selected, start, end)) {
    start += selected.length;
    while (title[start] === " ") start += 1;
  }
  while (endsWithSelectedSequence(title, selected, start, end)) {
    end -= selected.length;
    while (title[end - 1] === " ") end -= 1;
  }
  return title.slice(start, end);
}

export function formatNativeDisplayTitle(baseTitle, emoji) {
  const sanitized = sanitizeNativeTitle(baseTitle);
  const selected = selectedEmojiSequence(emoji);
  const title = stripSelectedEmojiEdges(sanitized, selected);
  const dir = isRTL(title) ? "rtl" : "ltr";
  if (!selected) return Object.freeze({ text: title, dir });
  return Object.freeze({
    text: dir === "rtl" ? `${title} ${selected}`.trim() : `${selected} ${title}`.trim(),
    dir,
  });
}

export function normalizeRoute(pathname, previousSnapshot = null) {
  if (typeof pathname !== "string" || pathname.length === 0 || pathname.length > LIMIT.route) return null;
  const clean = pathname.split(/[?#]/u, 1)[0];
  const chat = clean.match(/^\/c\/([^/]+)\/?$/u);
  const projectChat = clean.match(/^\/g\/([^/]+)\/c\/([^/]+)\/?$/u);
  const internal = /^\/(?:h2o|internal)(?:\/|$)/u.test(clean);
  let kind = "other", chatId = null, projectId = null, surface = "native", shape = "/other";
  if (chat) { kind = "chat"; chatId = chat[1]; shape = "/c/#id"; }
  else if (projectChat) { kind = "project-chat"; projectId = projectChat[1]; chatId = projectChat[2]; shape = "/g/#project/c/#id"; }
  else if (clean === "/" || clean === "") { kind = "home"; shape = "/"; }
  if ((chatId && !boundedString(chatId, LIMIT.chatId)) || (projectId && !boundedString(projectId, LIMIT.chatId))) return null;
  const routeKey = kind === "chat" ? `c:${chatId}` : kind === "project-chat" ? `g:${projectId}:c:${chatId}` : clean.slice(0, LIMIT.route);
  const previousGeneration = safeInteger(previousSnapshot?.generation) ? previousSnapshot.generation : 0;
  const generation = previousSnapshot && previousSnapshot.routeKey === routeKey ? previousGeneration : previousGeneration + 1;
  return deepFreeze({ kind, chatId, projectId, surface, routeKey, generation, internalH2O: internal, pathnameShape: shape });
}

function deliveryRevision(incoming) {
  if (safeInteger(incoming)) return incoming;
  if (!isPlainObject(incoming)) return null;
  const revision = ownData(incoming, "revision", true);
  return safeInteger(revision) ? revision : null;
}

export function acceptDeliveryRevision(lastAccepted, incoming) {
  const revision = deliveryRevision(incoming);
  const last = lastAccepted === null || lastAccepted === undefined ? -1 : lastAccepted;
  if (!safeInteger(last, -1) || revision === null) return deepFreeze({ accepted: false, revision: null, reason: "malformed" });
  if (revision <= last) return deepFreeze({ accepted: false, revision, reason: "duplicate-or-stale" });
  return deepFreeze({ accepted: true, revision, reason: "accepted" });
}

export function reduceDeliveryGate(previous, event) {
  const state = previous && safeInteger(previous.lastAcceptedRevision, -1)
    ? previous
    : deepFreeze({ lastAcceptedRevision: -1, acceptedCount: 0 });
  const result = acceptDeliveryRevision(state.lastAcceptedRevision, event);
  if (!result.accepted) return state;
  return deepFreeze({ lastAcceptedRevision: result.revision, acceptedCount: state.acceptedCount + 1 });
}

export function summarizeDurableWrites(results, policy = {}) {
  if (!Array.isArray(results)) throw new TypeError("settled results must be an array");
  const required = new Set(Array.isArray(policy.requiredBackends) ? policy.requiredBackends : []);
  const succeeded = [], failed = [], durableSucceeded = new Set();
  for (const result of results) {
    if (!isPlainObject(result) || !boundedString(result.backend, LIMIT.backend)) continue;
    const fulfilled = result.status === "fulfilled" && result.value?.ok !== false;
    if (fulfilled) {
      succeeded.push(result.backend);
      if (result.durable === true || result.value?.durable === true) durableSucceeded.add(result.backend);
    } else failed.push(result.backend);
  }
  const requiredBackendSatisfied = [...required].every((backend) => durableSucceeded.has(backend));
  const durable = durableSucceeded.size > 0 && requiredBackendSatisfied;
  const ok = durable && failed.every((backend) => !required.has(backend));
  const summary = deepFreeze({
    ok,
    durable,
    succeededBackends: succeeded,
    failedBackends: failed,
    requiredBackendSatisfied,
    errorKind: ok ? null : succeeded.length === 0 ? "all-attempts-failed" : durable ? "required-backend-failed" : "not-durable",
    candidateHash: boundedString(policy.candidateHash, 256) ? policy.candidateHash : null,
    chatId: boundedString(policy.chatId, LIMIT.chatId) ? policy.chatId : null,
    migrationKind: boundedString(policy.migrationKind, 64) ? policy.migrationKind : null,
    verifiedAt: safeInteger(policy.verifiedAt) ? policy.verifiedAt : null,
    adapterReceiptIds: safeStringArray(policy.adapterReceiptIds, LIMIT.receiptId) ?? frozenArray([]),
  });
  persistenceEvidence.add(summary);
  return summary;
}

function receiptId(migrationKind, chatId, candidateHash) {
  return `title-migration-v1:${migrationKind}:${chatId}:${candidateHash}`;
}

export function makeReceipt(input) {
  if (!isPlainObject(input)) throw new TypeError("invalid receipt input");
  const migrationKind = ownData(input, "migrationKind", true);
  const chatId = ownData(input, "chatId", true);
  const candidateHash = ownData(input, "candidateHash", true);
  const backend = ownData(input, "backend", true);
  const durable = ownData(input, "durable", true);
  const verifiedAt = ownData(input, "verifiedAt", true);
  if (!boundedString(migrationKind, 64) || !boundedString(chatId, LIMIT.chatId) ||
      !boundedString(candidateHash, 256) || !boundedString(backend, LIMIT.backend) ||
      durable !== true || !safeInteger(verifiedAt)) throw new TypeError("invalid receipt input");
  return deepFreeze({
    schema: "h2o.title-migration-receipt.v1",
    receiptId: receiptId(migrationKind, chatId, candidateHash),
    migrationKind,
    chatId,
    candidateHash,
    durable: true,
    backend,
    verifiedAt,
  });
}

function cloneReceipt(receipt) {
  if (!verifyReceipt(receipt)) return null;
  try {
    return makeReceipt({
      migrationKind: ownData(receipt, "migrationKind", true),
      chatId: ownData(receipt, "chatId", true),
      candidateHash: ownData(receipt, "candidateHash", true),
      backend: ownData(receipt, "backend", true),
      durable: ownData(receipt, "durable", true),
      verifiedAt: ownData(receipt, "verifiedAt", true),
    });
  } catch {
    return null;
  }
}

export function verifyReceipt(receipt, expected = {}) {
  if (!isPlainObject(receipt)) return false;
  const keys = new Set(["schema", "receiptId", "migrationKind", "chatId", "candidateHash", "durable", "backend", "verifiedAt"]);
  if (!onlyKeys(receipt, keys)) return false;
  const clean = {};
  for (const key of keys) { clean[key] = ownData(receipt, key, true); if (clean[key] === BAD) return false; }
  if (clean.schema !== "h2o.title-migration-receipt.v1" || clean.durable !== true ||
      !boundedString(clean.migrationKind, 64) || !boundedString(clean.chatId, LIMIT.chatId) ||
      !boundedString(clean.candidateHash, 256) || !boundedString(clean.backend, LIMIT.backend) || !safeInteger(clean.verifiedAt) ||
      clean.receiptId !== receiptId(clean.migrationKind, clean.chatId, clean.candidateHash)) return false;
  if (expected.chatId !== undefined && clean.chatId !== expected.chatId) return false;
  if (expected.migrationKind !== undefined && clean.migrationKind !== expected.migrationKind) return false;
  if (expected.candidateHash !== undefined && clean.candidateHash !== expected.candidateHash) return false;
  if (Array.isArray(expected.acceptableBackends) && !expected.acceptableBackends.includes(clean.backend)) return false;
  const now = safeInteger(expected.now) ? expected.now : clean.verifiedAt;
  const maxAgeMs = safeInteger(expected.maxAgeMs) ? expected.maxAgeMs : 24 * 60 * 60 * 1000;
  return clean.verifiedAt <= now && clean.verifiedAt >= now - maxAgeMs;
}

function migrationBase(state = null) {
  if (state && MIGRATION_STATES.has(state.state)) return state;
  return deepFreeze({ state: "idle", chatId: null, migrationKind: null, candidateHash: null, receipt: null, error: null });
}

export function reduceMigration(previous, event) {
  const state = migrationBase(previous);
  if (state.state === "deleted" || !isPlainObject(event)) return state;
  switch (event.type) {
    case "candidate-normalized":
      if (!boundedString(event.chatId, LIMIT.chatId) || !boundedString(event.migrationKind, 64) || !boundedString(event.candidateHash, 256)) return state;
      return deepFreeze({ state: "candidate-normalized", chatId: event.chatId, migrationKind: event.migrationKind, candidateHash: event.candidateHash, receipt: null, error: null });
    case "write-pending": return state.state === "candidate-normalized" ? deepFreeze({ ...state, state: "write-pending" }) : state;
    case "written": return state.state === "write-pending" && event.durable === true ? deepFreeze({ ...state, state: "written" }) : state;
    case "readback-verified": return state.state === "written" && event.matches === true ? deepFreeze({ ...state, state: "readback-verified" }) : state;
    case "receipt-persisted": {
      const receipt = cloneReceipt(event.receipt);
      return state.state === "readback-verified" && receipt ? deepFreeze({ ...state, state: "receipt-persisted", receipt }) : state;
    }
    case "delete": return state.state === "delete-eligible" ? deepFreeze({ ...state, state: "deleted" }) : state;
    case "failed": return deepFreeze({ ...state, state: "failed", error: { kind: event.errorKind ?? "unknown" } });
    default: return state;
  }
}

function evidenceMatches(evidence, expected, receipt) {
  return persistenceEvidence.has(evidence) && evidence.ok && evidence.durable && evidence.requiredBackendSatisfied &&
    evidence.chatId === expected.chatId && evidence.migrationKind === expected.migrationKind &&
    evidence.candidateHash === expected.candidateHash &&
    (evidence.verifiedAt === null || evidence.verifiedAt >= receipt.verifiedAt);
}

export function applyTrustedPersistedReceipt(previous, receipt, evidence) {
  const state = migrationBase(previous);
  const expected = { chatId: state.chatId, migrationKind: state.migrationKind, candidateHash: state.candidateHash, acceptableBackends: evidence?.succeededBackends };
  const cleanReceipt = cloneReceipt(receipt);
  if (!["receipt-persisted", "readback-verified"].includes(state.state) || !cleanReceipt || !verifyReceipt(cleanReceipt, expected) || !evidenceMatches(evidence, expected, cleanReceipt)) return state;
  return deepFreeze({ ...state, state: "delete-eligible", receipt: cleanReceipt });
}

export function canDeleteLegacy(state) {
  return Boolean(state && state.state === "delete-eligible");
}

export function resumeMigration(previous, receipt, evidence, expected) {
  const state = migrationBase(previous);
  if (state.state === "deleted") return state;
  const cleanReceipt = cloneReceipt(receipt);
  if (!cleanReceipt || !verifyReceipt(cleanReceipt, expected) || !evidenceMatches(evidence, expected, cleanReceipt)) return state;
  const resumed = deepFreeze({ ...state, chatId: expected.chatId, migrationKind: expected.migrationKind, candidateHash: expected.candidateHash, state: "receipt-persisted", receipt: cleanReceipt });
  return applyTrustedPersistedReceipt(resumed, cleanReceipt, evidence);
}

export function createLifecycleScope() {
  const cleanups = [];
  const errors = [];
  let destroyed = false;
  const api = {
    register(cleanup) {
      if (typeof cleanup !== "function") throw new TypeError("cleanup must be a function");
      if (destroyed) {
        try { cleanup(); } catch (error) { errors.push(error); }
        return () => {};
      }
      const entry = { cleanup, active: true };
      cleanups.push(entry);
      return () => {
        if (!entry.active) return;
        entry.active = false;
        try { cleanup(); } catch (error) { errors.push(error); }
      };
    },
    destroy() {
      if (destroyed) return frozenArray(errors);
      destroyed = true;
      for (let index = cleanups.length - 1; index >= 0; index -= 1) {
        const entry = cleanups[index];
        if (!entry.active) continue;
        entry.active = false;
        try { entry.cleanup(); } catch (error) { errors.push(error); }
      }
      return frozenArray(errors);
    },
    get destroyed() { return destroyed; },
    get size() { return cleanups.filter((entry) => entry.active).length; },
    get errors() { return frozenArray(errors); },
  };
  return Object.freeze(api);
}

export function createLifecycleOwner() {
  let active = null;
  let activeIdentity = null;
  const api = {
    install(identity, installer) {
      if (typeof identity === "function" && installer === undefined) { installer = identity; identity = installer; }
      if (active && identity === activeIdentity) return active;
      if (typeof installer !== "function") throw new TypeError("installer must be a function");
      const candidate = createLifecycleScope();
      try { installer(candidate); } catch (error) { candidate.destroy(); throw error; }
      const previous = active;
      active = candidate;
      activeIdentity = identity;
      previous?.destroy();
      return candidate;
    },
    destroy() {
      if (!active) return frozenArray([]);
      const current = active;
      active = null;
      activeIdentity = null;
      return current.destroy();
    },
    get active() { return active; },
  };
  return Object.freeze(api);
}
