const DIAGNOSTIC_SCHEMA = "h2o.mobile.bundle-reader.diagnostic.v1";
const FULL_BUNDLE_SCHEMA = "h2o.studio.fullBundle.v2";
const FOLDER_STATE_KEY = "h2o:prm:cgx:fldrs:state:data:v1";

export type MobileBundleTextSourceKind = "latest-json" | "pasted-json";
export type MobileBundleSourceKind = MobileBundleTextSourceKind | "memory";

export type MobileBundleInput =
  | { text: string; sourceKind?: MobileBundleTextSourceKind }
  | { bundle: unknown; sourceKind?: "memory" };

export type DiagnoseMobileSyncBundleOptions = {
  verifyChecksum?: boolean;
  sha256Hex?: (text: string) => string | Promise<string>;
};

export type MobileBundleDiagnosticCode = {
  code: string;
};

export type MobileBundleDiagnostic = {
  schema: typeof DIAGNOSTIC_SCHEMA;
  ok: boolean;
  redacted: true;
  readOnly: true;
  source: {
    kind: MobileBundleSourceKind;
    schemaPresent: boolean;
    checksumPresent: boolean;
    checksumVerified: boolean;
    sourcePeerPresent: boolean;
    exportedAtPresent: boolean;
    exportSchemaVersionPresent: boolean;
    exportIdPresent: boolean;
    sequenceNumberPresent: boolean;
    previousExportIdPresent: boolean;
  };
  counts: {
    chats: number;
    snapshots: number;
    folders: number;
    folderMemberships: number;
    labels: number;
    categories: number;
    conflicts: number;
    tombstones: number;
    applyEvents: number;
  };
  capabilities: ["read-only"];
  blockers: MobileBundleDiagnosticCode[];
  warnings: MobileBundleDiagnosticCode[];
};

type ReadMobileSyncBundleResult =
  | {
      ok: true;
      bundle: unknown;
      sourceKind: MobileBundleSourceKind;
      text?: string;
    }
  | {
      ok: false;
      sourceKind: MobileBundleSourceKind;
      blocker: MobileBundleDiagnosticCode;
    };

export function readMobileSyncBundle(input: MobileBundleInput): ReadMobileSyncBundleResult {
  if (!input || typeof input !== "object") {
    return {
      ok: false,
      sourceKind: "latest-json",
      blocker: { code: "bundle-input-missing" },
    };
  }

  if ("text" in input) {
    const sourceKind = input.sourceKind ?? "latest-json";
    if (typeof input.text !== "string" || input.text.trim().length === 0) {
      return {
        ok: false,
        sourceKind,
        blocker: { code: "bundle-input-missing" },
      };
    }

    try {
      return {
        ok: true,
        bundle: JSON.parse(input.text),
        sourceKind,
        text: input.text,
      };
    } catch {
      return {
        ok: false,
        sourceKind,
        blocker: { code: "bundle-json-invalid" },
      };
    }
  }

  if ("bundle" in input) {
    if (input.bundle === null || input.bundle === undefined) {
      return {
        ok: false,
        sourceKind: input.sourceKind ?? "memory",
        blocker: { code: "bundle-input-missing" },
      };
    }

    return {
      ok: true,
      bundle: input.bundle,
      sourceKind: input.sourceKind ?? "memory",
    };
  }

  return {
    ok: false,
    sourceKind: "latest-json",
    blocker: { code: "bundle-input-missing" },
  };
}

export function validateMobileSyncBundle(bundle: unknown): {
  ok: boolean;
  schemaPresent: boolean;
  blocker?: MobileBundleDiagnosticCode;
} {
  if (!isRecord(bundle)) {
    return {
      ok: false,
      schemaPresent: false,
      blocker: { code: "bundle-schema-unsupported" },
    };
  }

  const schemaPresent = typeof bundle.schema === "string" && bundle.schema.length > 0;
  if (bundle.schema !== FULL_BUNDLE_SCHEMA) {
    return {
      ok: false,
      schemaPresent,
      blocker: { code: "bundle-schema-unsupported" },
    };
  }

  return { ok: true, schemaPresent };
}

export async function diagnoseMobileSyncBundle(
  input: MobileBundleInput,
  options: DiagnoseMobileSyncBundleOptions = {},
): Promise<MobileBundleDiagnostic> {
  const read = readMobileSyncBundle(input);
  const diagnostic = createBaseDiagnostic(read.sourceKind);

  if (read.ok === false) {
    addCode(diagnostic.blockers, read.blocker.code);
    diagnostic.ok = false;
    return diagnostic;
  }

  const bundle = read.bundle;
  if (!isRecord(bundle)) {
    addCode(diagnostic.blockers, "bundle-schema-unsupported");
    diagnostic.ok = false;
    return diagnostic;
  }

  populateEnvelopePresence(diagnostic, bundle);

  const validation = validateMobileSyncBundle(bundle);
  if (!validation.ok) {
    addCode(diagnostic.blockers, validation.blocker?.code ?? "bundle-schema-unsupported");
    diagnostic.ok = false;
    return diagnostic;
  }

  countChatArchive(diagnostic, bundle);
  countFolderState(diagnostic, bundle);
  countLibraryKv(diagnostic, bundle);
  countTombstones(diagnostic, bundle);
  countApplyEvents(diagnostic, bundle);
  countConflicts(diagnostic, bundle);

  if (options.verifyChecksum === true) {
    await verifyBundleChecksum(diagnostic, bundle, read, options);
  }

  diagnostic.ok = diagnostic.blockers.length === 0;
  return diagnostic;
}

function createBaseDiagnostic(sourceKind: MobileBundleSourceKind): MobileBundleDiagnostic {
  return {
    schema: DIAGNOSTIC_SCHEMA,
    ok: true,
    redacted: true,
    readOnly: true,
    source: {
      kind: sourceKind,
      schemaPresent: false,
      checksumPresent: false,
      checksumVerified: false,
      sourcePeerPresent: false,
      exportedAtPresent: false,
      exportSchemaVersionPresent: false,
      exportIdPresent: false,
      sequenceNumberPresent: false,
      previousExportIdPresent: false,
    },
    counts: {
      chats: 0,
      snapshots: 0,
      folders: 0,
      folderMemberships: 0,
      labels: 0,
      categories: 0,
      conflicts: 0,
      tombstones: 0,
      applyEvents: 0,
    },
    capabilities: ["read-only"],
    blockers: [],
    warnings: [],
  };
}

function populateEnvelopePresence(diagnostic: MobileBundleDiagnostic, bundle: Record<string, unknown>): void {
  diagnostic.source.schemaPresent = typeof bundle.schema === "string" && bundle.schema.length > 0;
  diagnostic.source.checksumPresent = typeof bundle.contentSha256 === "string" && bundle.contentSha256.length > 0;
  diagnostic.source.exportedAtPresent = typeof bundle.exportedAt === "string" && bundle.exportedAt.length > 0;
  diagnostic.source.exportSchemaVersionPresent =
    typeof bundle.exportSchemaVersion === "string" || typeof bundle.exportSchemaVersion === "number";
  diagnostic.source.exportIdPresent = typeof bundle.exportId === "string" && bundle.exportId.length > 0;
  diagnostic.source.sequenceNumberPresent = typeof bundle.sequenceNumber === "number";
  diagnostic.source.previousExportIdPresent =
    typeof bundle.previousExportId === "string" && bundle.previousExportId.length > 0;
  diagnostic.source.sourcePeerPresent = hasSourcePeerPresence(bundle);
}

function hasSourcePeerPresence(bundle: Record<string, unknown>): boolean {
  if (typeof bundle.sourcePeerId === "string" && bundle.sourcePeerId.length > 0) {
    return true;
  }
  if (typeof bundle.sourceSyncPeerId === "string" && bundle.sourceSyncPeerId.length > 0) {
    return true;
  }
  if (typeof bundle.sourcePeer === "string" && bundle.sourcePeer.length > 0) {
    return true;
  }
  if (isRecord(bundle.sourcePeer) || isRecord(bundle.source)) {
    return true;
  }
  if (isRecord(bundle.diagnostics) && isRecord(bundle.diagnostics.desktopExport)) {
    const desktopExport = bundle.diagnostics.desktopExport;
    return (
      desktopExport.sourcePeerPresent === true ||
      desktopExport.peerPresent === true ||
      desktopExport.sourcePeerIdPresent === true
    );
  }
  return false;
}

function countChatArchive(diagnostic: MobileBundleDiagnostic, bundle: Record<string, unknown>): void {
  const chatArchive = bundle.chatArchive;
  if (chatArchive === undefined) {
    addCode(diagnostic.warnings, "bundle-chat-archive-missing");
    diagnostic.counts.chats = fallbackCount(bundle, ["summary", "chats"], ["summary", "chatCount"]);
    diagnostic.counts.snapshots = fallbackCount(bundle, ["summary", "snapshots"], ["summary", "snapshotCount"]);
    return;
  }
  if (!isRecord(chatArchive)) {
    addCode(diagnostic.warnings, "bundle-chat-archive-malformed");
    return;
  }

  const chats = arrayAt(chatArchive, "chats");
  if (chats) {
    diagnostic.counts.chats = chats.length;
    diagnostic.counts.snapshots = countSnapshotsFromChats(chats);
  } else {
    addCode(diagnostic.warnings, "bundle-chat-list-missing");
    diagnostic.counts.chats = fallbackCount(bundle, ["summary", "chats"], ["summary", "chatCount"]);
    diagnostic.counts.snapshots = fallbackCount(bundle, ["summary", "snapshots"], ["summary", "snapshotCount"]);
  }

  const catalogs = valueAt(chatArchive, "catalogs");
  if (isRecord(catalogs)) {
    const labels = arrayAt(catalogs, "labels");
    const categories = arrayAt(catalogs, "categories");
    if (labels) {
      diagnostic.counts.labels = labels.length;
    }
    if (categories) {
      diagnostic.counts.categories = categories.length;
    }
  }
}

function countSnapshotsFromChats(chats: unknown[]): number {
  let total = 0;
  for (const chat of chats) {
    if (!isRecord(chat)) {
      continue;
    }
    const snapshots = arrayAt(chat, "snapshots") ?? arrayAt(chat, "savedSnapshots");
    if (snapshots) {
      total += snapshots.length;
    }
  }
  return total;
}

function countFolderState(diagnostic: MobileBundleDiagnostic, bundle: Record<string, unknown>): void {
  const chromeStorageLocal = valueAt(bundle, "chromeStorageLocal");
  if (!isRecord(chromeStorageLocal)) {
    addCode(diagnostic.warnings, "bundle-chrome-storage-local-missing");
    diagnostic.counts.folders = fallbackCount(bundle, ["summary", "folders"], ["summary", "folderCount"]);
    diagnostic.counts.folderMemberships = fallbackCount(
      bundle,
      ["summary", "folderMemberships"],
      ["summary", "folderBindingCount"],
    );
    return;
  }

  const rawFolderState = chromeStorageLocal[FOLDER_STATE_KEY];
  const folderState = parsePossiblyStringifiedRecord(rawFolderState);
  if (!folderState) {
    addCode(diagnostic.warnings, "bundle-folder-state-missing");
    diagnostic.counts.folders = fallbackCount(bundle, ["summary", "folders"], ["summary", "folderCount"]);
    diagnostic.counts.folderMemberships = fallbackCount(
      bundle,
      ["summary", "folderMemberships"],
      ["summary", "folderBindingCount"],
    );
    return;
  }

  const folders = arrayAt(folderState, "folders") ?? arrayAt(folderState, "folderMetadata");
  if (folders) {
    diagnostic.counts.folders = folders.length;
  }

  const memberships =
    arrayAt(folderState, "folderMemberships") ??
    arrayAt(folderState, "memberships") ??
    arrayAt(folderState, "folderBindings");
  if (memberships) {
    diagnostic.counts.folderMemberships = memberships.length;
  } else {
    const items = valueAt(folderState, "items");
    if (isRecord(items)) {
      diagnostic.counts.folderMemberships = countRecordArrayValues(items);
    }
  }
}

function countLibraryKv(diagnostic: MobileBundleDiagnostic, bundle: Record<string, unknown>): void {
  const libraryKv = valueAt(bundle, "libraryKv");
  if (libraryKv === undefined) {
    return;
  }
  if (Array.isArray(libraryKv)) {
    return;
  }
  if (!isRecord(libraryKv)) {
    addCode(diagnostic.warnings, "bundle-library-kv-malformed");
    return;
  }

  if (diagnostic.counts.labels === 0) {
    diagnostic.counts.labels = countCatalogLikeSection(libraryKv, "labels");
  }
  if (diagnostic.counts.categories === 0) {
    diagnostic.counts.categories = countCatalogLikeSection(libraryKv, "categories");
  }
  if (diagnostic.counts.folderMemberships === 0) {
    diagnostic.counts.folderMemberships = countCatalogLikeSection(libraryKv, "folderBindings");
  }
}

function countCatalogLikeSection(record: Record<string, unknown>, key: string): number {
  const direct = arrayAt(record, key);
  if (direct) {
    return direct.length;
  }
  const nested = valueAt(record, key);
  if (isRecord(nested)) {
    const values = Object.values(nested);
    if (values.every((value) => isRecord(value))) {
      return values.length;
    }
  }
  return 0;
}

function countTombstones(diagnostic: MobileBundleDiagnostic, bundle: Record<string, unknown>): void {
  const tombstones = valueAt(bundle, "tombstones");
  if (tombstones === undefined) {
    diagnostic.counts.tombstones = fallbackCount(
      bundle,
      ["summary", "tombstones"],
      ["summary", "tombstoneCount"],
      ["diagnostics", "desktopExport", "tombstones", "total"],
    );
    return;
  }
  if (Array.isArray(tombstones)) {
    diagnostic.counts.tombstones = tombstones.length;
    return;
  }
  if (isRecord(tombstones)) {
    diagnostic.counts.tombstones = safeNumber(tombstones.total) ?? countRecordArrayValues(tombstones);
    return;
  }
  addCode(diagnostic.warnings, "bundle-tombstones-malformed");
}

function countApplyEvents(diagnostic: MobileBundleDiagnostic, bundle: Record<string, unknown>): void {
  const syncApplyEvents = valueAt(bundle, "syncApplyEvents");
  if (syncApplyEvents === undefined) {
    diagnostic.counts.applyEvents = fallbackCount(bundle, ["summary", "applyEvents"], ["summary", "applyEventCount"]);
    return;
  }
  if (!isRecord(syncApplyEvents)) {
    addCode(diagnostic.warnings, "bundle-sync-apply-events-malformed");
    return;
  }
  diagnostic.counts.applyEvents = safeNumber(syncApplyEvents.total) ?? arrayAt(syncApplyEvents, "events")?.length ?? 0;
}

function countConflicts(diagnostic: MobileBundleDiagnostic, bundle: Record<string, unknown>): void {
  const syncConflicts = valueAt(bundle, "syncConflicts") ?? valueAt(bundle, "conflicts");
  if (syncConflicts === undefined) {
    diagnostic.counts.conflicts = fallbackCount(bundle, ["summary", "conflicts"], ["summary", "conflictCount"]);
    return;
  }
  if (Array.isArray(syncConflicts)) {
    diagnostic.counts.conflicts = syncConflicts.length;
    return;
  }
  if (isRecord(syncConflicts)) {
    diagnostic.counts.conflicts = safeNumber(syncConflicts.total) ?? arrayAt(syncConflicts, "items")?.length ?? 0;
    return;
  }
  addCode(diagnostic.warnings, "bundle-conflicts-malformed");
}

async function verifyBundleChecksum(
  diagnostic: MobileBundleDiagnostic,
  bundle: Record<string, unknown>,
  read: Extract<ReadMobileSyncBundleResult, { ok: true }>,
  options: DiagnoseMobileSyncBundleOptions,
): Promise<void> {
  const contentSha256 = typeof bundle.contentSha256 === "string" ? bundle.contentSha256.trim() : "";
  if (!contentSha256) {
    addCode(diagnostic.warnings, "bundle-checksum-unavailable");
    return;
  }
  if (!options.sha256Hex) {
    addCode(diagnostic.warnings, "bundle-checksum-verifier-unavailable");
    return;
  }

  const checksumText = buildChecksumText(bundle);
  const digest = await options.sha256Hex(checksumText);
  if (normalizeSha256Digest(digest) === normalizeSha256Digest(contentSha256)) {
    diagnostic.source.checksumVerified = true;
    return;
  }

  if (read.sourceKind === "latest-json") {
    addCode(diagnostic.blockers, "bundle-checksum-mismatch");
  } else {
    addCode(diagnostic.warnings, "bundle-checksum-mismatch");
  }
}

function buildChecksumText(bundle: Record<string, unknown>): string {
  const { contentSha256: _contentSha256, ...bundleWithoutChecksum } = bundle;
  return `${JSON.stringify(bundleWithoutChecksum, null, 2)}\n`;
}

function normalizeSha256Digest(value: string): string {
  const trimmed = value.trim().toLowerCase();
  return trimmed.startsWith("sha256:") ? trimmed.slice("sha256:".length) : trimmed;
}

function parsePossiblyStringifiedRecord(value: unknown): Record<string, unknown> | null {
  if (isRecord(value)) {
    return value;
  }
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }
  try {
    const parsed = JSON.parse(value);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function fallbackCount(bundle: Record<string, unknown>, ...paths: string[][]): number {
  for (const path of paths) {
    const value = valueAtPath(bundle, path);
    const count = safeNumber(value);
    if (count !== null) {
      return count;
    }
  }
  return 0;
}

function countRecordArrayValues(record: Record<string, unknown>): number {
  let total = 0;
  for (const value of Object.values(record)) {
    if (Array.isArray(value)) {
      total += value.length;
    }
  }
  return total;
}

function addCode(list: MobileBundleDiagnosticCode[], code: string): void {
  if (!list.some((item) => item.code === code)) {
    list.push({ code });
  }
}

function arrayAt(record: Record<string, unknown>, key: string): unknown[] | null {
  const value = record[key];
  return Array.isArray(value) ? value : null;
}

function valueAt(record: Record<string, unknown>, key: string): unknown {
  return record[key];
}

function valueAtPath(record: Record<string, unknown>, path: string[]): unknown {
  let current: unknown = record;
  for (const part of path) {
    if (!isRecord(current)) {
      return undefined;
    }
    current = current[part];
  }
  return current;
}

function safeNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.trunc(value) : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
