const VIEW_SCHEMA = "h2o.mobile.readonly-library-view.v1";
const SNAPSHOT_DETAIL_SCHEMA = "h2o.mobile.readonly-snapshot-detail.v1";
const FULL_BUNDLE_SCHEMA = "h2o.studio.fullBundle.v2";
const FOLDER_STATE_KEY = "h2o:prm:cgx:fldrs:state:data:v1";

export type MobileReadOnlyViewWarning = {
  code: string;
};

export type MobileReadOnlyLibraryView = {
  schema: typeof VIEW_SCHEMA;
  readOnly: true;
  chats: Array<{
    idPresent: boolean;
    titlePreview?: string;
    snapshotCount: number;
    folderCount: number;
  }>;
  folders: Array<{
    idPresent: boolean;
    namePreview?: string;
    itemCount: number;
    colorPresent: boolean;
  }>;
  snapshots: Array<{
    idPresent: boolean;
    chatIdPresent: boolean;
    createdAtPresent: boolean;
  }>;
  diagnostics: {
    sourceSchemaPresent: boolean;
    checksumVerified?: boolean;
    exportedAtPresent: boolean;
    sourcePeerPresent: boolean;
  };
  warnings: MobileReadOnlyViewWarning[];
};

export type BuildMobileReadOnlyBundleViewOptions = {
  checksumVerified?: boolean;
};

export type MobileReadOnlySnapshotMessage = {
  role: "user" | "assistant" | "system" | "unknown";
  orderPresent: boolean;
  createdAtPresent: boolean;
  textPresent: boolean;
  text: string;
};

export type MobileReadOnlySnapshotDetail = {
  schema: typeof SNAPSHOT_DETAIL_SCHEMA;
  readOnly: true;
  snapshotFound: boolean;
  titlePreview?: string;
  createdAtPresent: boolean;
  contentPresent: boolean;
  contentKind: "turns";
  messageCount: number;
  messages: MobileReadOnlySnapshotMessage[];
  warnings: MobileReadOnlyViewWarning[];
};

export type BuildMobileReadOnlySnapshotDetailOptions = {
  snapshotIndex?: number;
  snapshotTitle?: string;
};

export function buildMobileReadOnlyBundleView(
  bundleOrReadResult: unknown,
  options: BuildMobileReadOnlyBundleViewOptions = {},
): MobileReadOnlyLibraryView {
  const bundle = unwrapBundle(bundleOrReadResult);
  const view = createEmptyView(options);

  if (!isRecord(bundle)) {
    addWarning(view, "bundle-schema-unsupported");
    return view;
  }

  populateDiagnostics(view, bundle, options);

  if (bundle.schema !== FULL_BUNDLE_SCHEMA) {
    addWarning(view, "bundle-schema-unsupported");
    return view;
  }

  const folderEvidence = readFolderEvidence(view, bundle);
  const chatEvidence = readChatEvidence(view, bundle, folderEvidence.folderIdsByTargetId);

  view.folders = folderEvidence.folders;
  view.chats = chatEvidence.chats;
  view.snapshots = chatEvidence.snapshots;

  applySummaryFallbacks(view, bundle, {
    usedChatArchive: chatEvidence.usedChatArchive,
    usedFolderState: folderEvidence.usedFolderState,
  });

  return view;
}

export function buildMobileReadOnlySnapshotDetail(
  bundleOrReadResult: unknown,
  options: BuildMobileReadOnlySnapshotDetailOptions = {},
): MobileReadOnlySnapshotDetail {
  const bundle = unwrapBundle(bundleOrReadResult);
  const detail = createEmptySnapshotDetail();

  if (!isRecord(bundle)) {
    addSnapshotWarning(detail, "bundle-schema-unsupported");
    return detail;
  }

  if (bundle.schema !== FULL_BUNDLE_SCHEMA) {
    addSnapshotWarning(detail, "bundle-schema-unsupported");
    return detail;
  }

  const snapshots = flattenSnapshotEvidence(bundle);
  const snapshotIndex = normalizeSnapshotIndex(options.snapshotIndex);
  const selected = snapshots[snapshotIndex];
  if (!selected) {
    addSnapshotWarning(detail, "snapshot-not-found");
    return detail;
  }

  detail.snapshotFound = true;
  const titlePreview = firstNonEmptyString(options.snapshotTitle, selected.title, selected.name);
  if (titlePreview) {
    detail.titlePreview = titlePreview;
  }
  detail.createdAtPresent = hasNonEmptyString(selected.createdAt) || hasNonEmptyString(selected.created_at);

  const messages = selected.messages;
  if (!Array.isArray(messages)) {
    addSnapshotWarning(detail, "snapshot-messages-malformed");
    return detail;
  }

  detail.messages = messages.map(readSnapshotMessage);
  detail.messageCount = detail.messages.length;
  detail.contentPresent = detail.messages.some((message) => message.textPresent);
  if (!detail.contentPresent && detail.messageCount > 0) {
    addSnapshotWarning(detail, "snapshot-message-text-missing");
  }

  return detail;
}

function createEmptySnapshotDetail(): MobileReadOnlySnapshotDetail {
  return {
    schema: SNAPSHOT_DETAIL_SCHEMA,
    readOnly: true,
    snapshotFound: false,
    createdAtPresent: false,
    contentPresent: false,
    contentKind: "turns",
    messageCount: 0,
    messages: [],
    warnings: [],
  };
}

function flattenSnapshotEvidence(bundle: Record<string, unknown>): Record<string, unknown>[] {
  if (!isRecord(bundle.chatArchive)) {
    return [];
  }
  const chatRows = arrayAt(bundle.chatArchive, "chats");
  if (!chatRows) {
    return [];
  }

  const snapshots: Record<string, unknown>[] = [];
  for (const chat of chatRows) {
    if (!isRecord(chat)) {
      continue;
    }
    const chatSnapshots = arrayAt(chat, "snapshots") ?? arrayAt(chat, "savedSnapshots") ?? [];
    for (const snapshot of chatSnapshots) {
      if (isRecord(snapshot)) {
        snapshots.push(snapshot);
      }
    }
  }
  return snapshots;
}

function normalizeSnapshotIndex(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return 0;
  }
  return Math.floor(value);
}

function readSnapshotMessage(message: unknown): MobileReadOnlySnapshotMessage {
  if (!isRecord(message)) {
    return {
      role: "unknown",
      orderPresent: false,
      createdAtPresent: false,
      textPresent: false,
      text: "",
    };
  }

  const text = typeof message.text === "string" ? message.text : "";
  return {
    role: normalizeSnapshotRole(message.role),
    orderPresent: message.order !== undefined && message.order !== null,
    createdAtPresent: message.createdAt !== undefined && message.createdAt !== null,
    textPresent: text.length > 0,
    text,
  };
}

function normalizeSnapshotRole(value: unknown): MobileReadOnlySnapshotMessage["role"] {
  const role = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (role === "user" || role === "assistant" || role === "system") {
    return role;
  }
  return "unknown";
}

function addSnapshotWarning(detail: MobileReadOnlySnapshotDetail, code: string): void {
  if (!detail.warnings.some((warning) => warning.code === code)) {
    detail.warnings.push({ code });
  }
}

function createEmptyView(options: BuildMobileReadOnlyBundleViewOptions): MobileReadOnlyLibraryView {
  const diagnostics: MobileReadOnlyLibraryView["diagnostics"] = {
    sourceSchemaPresent: false,
    exportedAtPresent: false,
    sourcePeerPresent: false,
  };
  if (typeof options.checksumVerified === "boolean") {
    diagnostics.checksumVerified = options.checksumVerified;
  }

  return {
    schema: VIEW_SCHEMA,
    readOnly: true,
    chats: [],
    folders: [],
    snapshots: [],
    diagnostics,
    warnings: [],
  };
}

function unwrapBundle(input: unknown): unknown {
  if (isRecord(input) && input.ok === true && "bundle" in input) {
    return input.bundle;
  }
  return input;
}

function populateDiagnostics(
  view: MobileReadOnlyLibraryView,
  bundle: Record<string, unknown>,
  options: BuildMobileReadOnlyBundleViewOptions,
): void {
  view.diagnostics.sourceSchemaPresent = typeof bundle.schema === "string" && bundle.schema.length > 0;
  view.diagnostics.exportedAtPresent = typeof bundle.exportedAt === "string" && bundle.exportedAt.length > 0;
  view.diagnostics.sourcePeerPresent = hasSourcePeerPresence(bundle);
  if (typeof options.checksumVerified === "boolean") {
    view.diagnostics.checksumVerified = options.checksumVerified;
  }
}

function readFolderEvidence(
  view: MobileReadOnlyLibraryView,
  bundle: Record<string, unknown>,
): {
  folders: MobileReadOnlyLibraryView["folders"];
  folderIdsByTargetId: Map<string, Set<string>>;
  usedFolderState: boolean;
} {
  const chromeStorageLocal = bundle.chromeStorageLocal;
  if (!isRecord(chromeStorageLocal)) {
    addWarning(view, "bundle-chrome-storage-local-missing");
    return { folders: [], folderIdsByTargetId: new Map(), usedFolderState: false };
  }

  const folderState = parsePossiblyStringifiedRecord(chromeStorageLocal[FOLDER_STATE_KEY]);
  if (!folderState) {
    addWarning(view, "bundle-folder-state-missing");
    return { folders: [], folderIdsByTargetId: new Map(), usedFolderState: false };
  }

  const folders = readFoldersFromFolderState(folderState);
  const memberships = readFolderMemberships(folderState);
  return {
    folders: folders.map((folder) => ({
      idPresent: folder.idPresent,
      ...(folder.namePreview ? { namePreview: folder.namePreview } : {}),
      itemCount: memberships.itemCountsByFolderId.get(folder.rawId ?? "") ?? 0,
      colorPresent: folder.colorPresent,
    })),
    folderIdsByTargetId: memberships.folderIdsByTargetId,
    usedFolderState: true,
  };
}

function readFoldersFromFolderState(folderState: Record<string, unknown>): Array<{
  rawId?: string;
  idPresent: boolean;
  namePreview?: string;
  colorPresent: boolean;
}> {
  const folders = arrayAt(folderState, "folders") ?? arrayAt(folderState, "folderMetadata") ?? [];
  return folders.map((folder) => {
    if (!isRecord(folder)) {
      return {
        idPresent: false,
        colorPresent: false,
      };
    }
    const rawId = firstNonEmptyString(folder.id, folder.folderId, folder.folder_id);
    const namePreview = firstNonEmptyString(folder.name, folder.title);
    return {
      ...(rawId ? { rawId } : {}),
      idPresent: Boolean(rawId),
      ...(namePreview ? { namePreview } : {}),
      colorPresent: hasNonEmptyString(folder.color) || hasNonEmptyString(folder.iconColor),
    };
  });
}

function readFolderMemberships(folderState: Record<string, unknown>): {
  itemCountsByFolderId: Map<string, number>;
  folderIdsByTargetId: Map<string, Set<string>>;
} {
  const itemCountsByFolderId = new Map<string, number>();
  const folderIdsByTargetId = new Map<string, Set<string>>();

  const items = folderState.items;
  if (isRecord(items)) {
    for (const [folderId, value] of Object.entries(items)) {
      const memberIds = Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
      itemCountsByFolderId.set(folderId, memberIds.length);
      for (const memberId of memberIds) {
        addFolderTarget(folderIdsByTargetId, memberId, folderId);
      }
    }
  }

  const memberships =
    arrayAt(folderState, "folderMemberships") ??
    arrayAt(folderState, "memberships") ??
    arrayAt(folderState, "folderBindings");
  if (memberships) {
    for (const membership of memberships) {
      if (!isRecord(membership)) {
        continue;
      }
      const folderId = firstNonEmptyString(membership.folderId, membership.folder_id);
      const chatId = firstNonEmptyString(membership.chatId, membership.chat_id, membership.itemId, membership.item_id);
      if (folderId) {
        itemCountsByFolderId.set(folderId, (itemCountsByFolderId.get(folderId) ?? 0) + 1);
      }
      if (chatId && folderId) {
        addFolderTarget(folderIdsByTargetId, chatId, folderId);
      }
    }
  }

  return { itemCountsByFolderId, folderIdsByTargetId };
}

function readChatEvidence(
  view: MobileReadOnlyLibraryView,
  bundle: Record<string, unknown>,
  folderIdsByTargetId: Map<string, Set<string>>,
): {
  chats: MobileReadOnlyLibraryView["chats"];
  snapshots: MobileReadOnlyLibraryView["snapshots"];
  usedChatArchive: boolean;
} {
  if (bundle.chatArchive === undefined) {
    addWarning(view, "bundle-chat-archive-missing");
    return { chats: [], snapshots: [], usedChatArchive: false };
  }
  if (!isRecord(bundle.chatArchive)) {
    addWarning(view, "bundle-chat-archive-malformed");
    return { chats: [], snapshots: [], usedChatArchive: false };
  }

  const chatRows = arrayAt(bundle.chatArchive, "chats");
  if (!chatRows) {
    addWarning(view, "bundle-chat-list-missing");
    return { chats: [], snapshots: [], usedChatArchive: false };
  }

  const snapshots: MobileReadOnlyLibraryView["snapshots"] = [];
  const chats = chatRows.map((chat) => {
    if (!isRecord(chat)) {
      return {
        idPresent: false,
        snapshotCount: 0,
        folderCount: 0,
      };
    }

    const chatId = firstNonEmptyString(chat.chatId, chat.id, chat.chat_id);
    const chatSnapshots = arrayAt(chat, "snapshots") ?? arrayAt(chat, "savedSnapshots") ?? [];
    for (const snapshot of chatSnapshots) {
      snapshots.push(readSnapshot(snapshot, chatId));
    }
    const chatFolderIds = new Set<string>();
    if (chatId) {
      addAll(chatFolderIds, folderIdsByTargetId.get(chatId));
    }
    for (const snapshot of chatSnapshots) {
      if (!isRecord(snapshot)) {
        continue;
      }
      const snapshotId = firstNonEmptyString(snapshot.snapshotId, snapshot.id, snapshot.snapshot_id);
      if (snapshotId) {
        addAll(chatFolderIds, folderIdsByTargetId.get(snapshotId));
      }
    }

    const titlePreview = firstNonEmptyString(chat.title, chat.name) ?? firstSnapshotTitle(chatSnapshots);
    return {
      idPresent: Boolean(chatId),
      ...(titlePreview ? { titlePreview } : {}),
      snapshotCount: chatSnapshots.length,
      folderCount: chatFolderIds.size,
    };
  });

  return { chats, snapshots, usedChatArchive: true };
}

function addFolderTarget(targets: Map<string, Set<string>>, targetId: string, folderId: string): void {
  for (const key of targetKeyVariants(targetId)) {
    const existing = targets.get(key) ?? new Set<string>();
    existing.add(folderId);
    targets.set(key, existing);
  }
}

function addAll(target: Set<string>, values: Set<string> | undefined): void {
  if (!values) {
    return;
  }
  for (const value of values) {
    target.add(value);
  }
}

function targetKeyVariants(targetId: string): string[] {
  const trimmed = targetId.trim();
  if (!trimmed) {
    return [];
  }
  const variants = new Set<string>([trimmed]);
  if (trimmed.startsWith("/c/")) {
    variants.add(trimmed.slice("/c/".length));
  } else {
    variants.add(`/c/${trimmed}`);
  }
  return [...variants];
}

function readSnapshot(snapshot: unknown, fallbackChatId?: string): MobileReadOnlyLibraryView["snapshots"][number] {
  if (!isRecord(snapshot)) {
    return {
      idPresent: false,
      chatIdPresent: Boolean(fallbackChatId),
      createdAtPresent: false,
    };
  }

  const snapshotId = firstNonEmptyString(snapshot.snapshotId, snapshot.id, snapshot.snapshot_id);
  const chatId = firstNonEmptyString(snapshot.chatId, snapshot.chat_id) ?? fallbackChatId;
  return {
    idPresent: Boolean(snapshotId),
    chatIdPresent: Boolean(chatId),
    createdAtPresent: hasNonEmptyString(snapshot.createdAt) || hasNonEmptyString(snapshot.created_at),
  };
}

function firstSnapshotTitle(snapshots: unknown[]): string | undefined {
  for (const snapshot of snapshots) {
    if (!isRecord(snapshot)) {
      continue;
    }
    const title = firstNonEmptyString(snapshot.title, snapshot.name);
    if (title) {
      return title;
    }
  }
  return undefined;
}

function applySummaryFallbacks(
  view: MobileReadOnlyLibraryView,
  bundle: Record<string, unknown>,
  usage: { usedChatArchive: boolean; usedFolderState: boolean },
): void {
  if (!usage.usedChatArchive) {
    view.chats = makePlaceholderChats(fallbackCount(bundle, ["summary", "chats"], ["summary", "chatCount"]));
    view.snapshots = makePlaceholderSnapshots(
      fallbackCount(bundle, ["summary", "snapshots"], ["summary", "snapshotCount"]),
    );
  }

  if (!usage.usedFolderState) {
    view.folders = makePlaceholderFolders(fallbackCount(bundle, ["summary", "folders"], ["summary", "folderCount"]));
  }
}

function makePlaceholderChats(count: number): MobileReadOnlyLibraryView["chats"] {
  return Array.from({ length: count }, () => ({
    idPresent: false,
    snapshotCount: 0,
    folderCount: 0,
  }));
}

function makePlaceholderFolders(count: number): MobileReadOnlyLibraryView["folders"] {
  return Array.from({ length: count }, () => ({
    idPresent: false,
    itemCount: 0,
    colorPresent: false,
  }));
}

function makePlaceholderSnapshots(count: number): MobileReadOnlyLibraryView["snapshots"] {
  return Array.from({ length: count }, () => ({
    idPresent: false,
    chatIdPresent: false,
    createdAtPresent: false,
  }));
}

function hasSourcePeerPresence(bundle: Record<string, unknown>): boolean {
  if (hasNonEmptyString(bundle.sourcePeerId) || hasNonEmptyString(bundle.sourceSyncPeerId)) {
    return true;
  }
  if (hasNonEmptyString(bundle.sourcePeer) || isRecord(bundle.sourcePeer) || isRecord(bundle.source)) {
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
    const count = safeNumber(valueAtPath(bundle, path));
    if (count !== null) {
      return count;
    }
  }
  return 0;
}

function addWarning(view: MobileReadOnlyLibraryView, code: string): void {
  if (!view.warnings.some((warning) => warning.code === code)) {
    view.warnings.push({ code });
  }
}

function firstNonEmptyString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }
  return undefined;
}

function hasNonEmptyString(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function arrayAt(record: Record<string, unknown>, key: string): unknown[] | null {
  const value = record[key];
  return Array.isArray(value) ? value : null;
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
