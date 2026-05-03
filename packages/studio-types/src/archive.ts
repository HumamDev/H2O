/**
 * Archive bundle v1 — canonical shared contract.
 *
 * This file is the single source of truth for the current on-disk and
 * over-the-wire format shared between Browser Studio and Mobile Studio.
 *
 * Do NOT modify to introduce a new schema shape here — open a separate
 * src/snapshot.ts evolution instead (see ConversationSnapshot for v2 direction).
 *
 * ─── Identity conventions ────────────────────────────────────────────────────
 *
 * chatgptId
 *   The native ChatGPT conversation UUID as it appears in the URL path
 *   (/c/<chatgptId> or /g/<projectId>/c/<chatgptId>).
 *   Written by Browser Studio live-captures into snapshot.meta.chatgptId.
 *   This is the stable, canonical identity of a ChatGPT conversation on
 *   chatgpt.com.
 *
 * shareId
 *   The ChatGPT share token extracted from a shared-link URL
 *   (chatgpt.com/share/<shareId>).
 *   Written by Mobile Studio during import into snapshot.meta.shareId.
 *   Primary dedup key for mobile-imported chats.
 *
 * chatId  (ArchiveChat.chatId)
 *   The archive-local identifier for a chat record.
 *   Browser-captured:  equals chatgptId directly (raw UUID from URL).
 *   Mobile-imported:   "imported-{stableId(shareId || localId)}".
 *   These two namespaces must not be assumed equal until explicit dedup
 *   logic reconciles them via chatgptId / shareId.
 *
 * snapshotId  (ArchiveSnapshot.snapshotId)
 *   Unique within a chatId.  Must be stable for digest-based dedup.
 *   Browser:         opaque extension-generated string.
 *   Mobile import:   "{chatId}:mobile-import".
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ─── Schema identifiers ───────────────────────────────────────────────────────

export const ARCHIVE_BUNDLE_SCHEMA = 'h2o.chatArchive.bundle.v1' as const;
export const MOBILE_ARCHIVE_STORE_SCHEMA = 'h2o.mobile.chatArchive.store.v1' as const;
export const ARCHIVE_DEFAULT_RETENTION_KEEP_LATEST = 30;

// ─── SnapshotMeta ─────────────────────────────────────────────────────────────

/**
 * Typed snapshot metadata — replaces the untyped `Record<string, unknown>` bag.
 *
 * Known fields are explicitly typed; the index signature preserves forward-
 * compatibility for fields not yet promoted here.
 */
export interface SnapshotMeta extends Record<string, unknown> {
  // ── Display ────────────────────────────────────────────────────────────────
  /** Human-readable conversation title for list display. */
  title?: string;
  /** Short preview text for list display (first 200–220 chars of content). */
  excerpt?: string;

  // ── Origin ─────────────────────────────────────────────────────────────────
  /**
   * Capture platform.
   *   'browser' = Browser Studio live-capture or extension.
   *   'mobile'  = Mobile Studio import.
   * Legacy values ('dom', 'legacy-migration') may appear in older bundles;
   * treat any value that is not 'mobile' as browser-origin when displaying.
   */
  source?: 'browser' | 'mobile' | string;
  /**
   * Capture method within the platform.
   *   'chatgpt-live-capture'  = Browser Studio DOM capture.
   *   'chatgpt-shared-link'   = Mobile import via share URL.
   */
  sourceType?: 'chatgpt-live-capture' | 'chatgpt-shared-link' | string;
  /**
   * Full URL of the source page at capture time (browser) or the
   * ChatGPT share link URL (mobile).
   * Browser Studio also writes the same value to the legacy `href` field
   * for backward compatibility — prefer `sourceUrl` for new code.
   */
  sourceUrl?: string;

  // ── Identity ───────────────────────────────────────────────────────────────
  /**
   * Native ChatGPT conversation UUID from the URL (/c/<chatgptId>).
   * Written by Browser Studio captures.
   * Enables cross-platform deduplication of the same conversation
   * regardless of the chatId prefix used by each platform.
   * Absent on snapshots captured before this field was introduced.
   */
  chatgptId?: string;
  /**
   * ChatGPT share token extracted from the share URL.
   * Written by Mobile Studio imports.
   * Primary dedup key for mobile-imported chats.
   */
  shareId?: string;

  // ── Timestamps (all ISO 8601 strings) ─────────────────────────────────────
  /**
   * When the snapshot was captured from the live DOM (browser) or when the
   * transcript was fetched from the ChatGPT API (mobile).
   */
  capturedAt?: string;
  /**
   * When the snapshot data was last modified (edit, tag change, folder move).
   * Set by both platforms on any mutation.
   */
  updatedAt?: string;
  /** When the chat was first imported (mobile only). */
  importedAt?: string;

  // ── Organization ───────────────────────────────────────────────────────────
  folderId?: string;
  folderName?: string;
  tags?: string[];
  category?: CategoryRecord | null;
  labels?: LabelAssignments;
  /** True when the chat has been manually moved to the archive section. */
  archived?: boolean;

  // ── Mobile fetch metadata ──────────────────────────────────────────────────
  /** Exact title string from the ChatGPT shared-chat API payload. */
  fetchedChatGPTTitle?: string;
  /** Normalized title derived from fetched content. */
  fetchedTitle?: string;
  /** Snippet/preview from fetched content. */
  fetchedSnippet?: string;

  // ── Browser-only rich capture metadata ────────────────────────────────────
  /** Full href of the page at capture time (legacy alias for sourceUrl). */
  href?: string;
}

// ─── ArchiveMessage ───────────────────────────────────────────────────────────

export interface ArchiveMessage extends Record<string, unknown> {
  /** Normalised role: 'user' | 'assistant' | 'system'. */
  role: string;
  /** Full markdown text of the turn. */
  text: string;
  /** 0-based sequential index within the snapshot. Auto-repaired on import. */
  order: number;
  /** Unix milliseconds. Null when unavailable (e.g. mobile imports). */
  createdAt: number | null;
  /** ISO 8601. Set when text was manually edited after capture. */
  editedAt?: string;
  /** Preserved original text before the first manual edit. */
  originalText?: string;
}

// ─── ArchiveChatIndex ─────────────────────────────────────────────────────────

export interface ArchiveChatIndex extends Record<string, unknown> {
  lastSnapshotId: string;
  lastCapturedAt: string;
  pinnedSnapshotIds: string[];
  retentionPolicy?: {
    /** Number of snapshots to keep. Clamped to [1, 1000]. Default: 30. */
    keepLatest: number;
    [key: string]: unknown;
  };
  lastDigest: string;
}

// ─── ArchiveSnapshot ─────────────────────────────────────────────────────────

export interface ArchiveSnapshot extends Record<string, unknown> {
  snapshotId: string;
  chatId: string;
  /** ISO 8601 capture timestamp. */
  createdAt: string;
  /** Schema version for the snapshot format. Currently always 1. */
  schemaVersion: number;
  messageCount: number;
  /** Content hash (SHA-256 hex or similar) for duplicate detection. */
  digest: string;
  meta: SnapshotMeta;
  messages: ArchiveMessage[];
}

// ─── ArchiveChat ─────────────────────────────────────────────────────────────

export interface ArchiveChat extends Record<string, unknown> {
  chatId: string;
  /** Browser only. 'live_first' | 'archive_first' | 'archive_only'. */
  bootMode?: string;
  /** Migration flag. True once a legacy snapshot has been promoted. */
  migrated?: boolean;
  chatIndex: ArchiveChatIndex;
  snapshots: ArchiveSnapshot[];
}

// ─── Labels ──────────────────────────────────────────────────────────────────

export type LabelType = 'workflow_status' | 'priority' | 'action' | 'context' | 'custom';

export interface LabelRecord extends Record<string, unknown> {
  id: string;
  name: string;
  type: LabelType;
  color: string;
  sortOrder: number;
  createdAt: string;
}

export interface LabelAssignments extends Record<string, unknown> {
  workflowStatusLabelId?: string;
  priorityLabelId?: string;
  actionLabelIds?: string[];
  contextLabelIds?: string[];
  customLabelIds?: string[];
}

// ─── Categories ──────────────────────────────────────────────────────────────

export interface CategoryRecord extends Record<string, unknown> {
  primaryCategoryId: string;
  secondaryCategoryId: string | null;
  source: 'system' | 'user';
  algorithmVersion: string | null;
  classifiedAt: string | null;
  overriddenAt: string | null;
  confidence: number | null;
}

export interface CategoryCatalogRecord extends Record<string, unknown> {
  id: string;
  name: string;
  description?: string;
  color?: string;
  sortOrder: number;
  createdAt: string;
  updatedAt?: string;
  status: 'active' | 'deprecated' | 'retired';
  replacementCategoryId: string | null;
  aliases: string[];
}

// ─── ArchiveBundleEnvelope ────────────────────────────────────────────────────

export interface ArchiveBundleEnvelope extends Record<string, unknown> {
  schema: typeof ARCHIVE_BUNDLE_SCHEMA;
  exportedAt: string;
  scope: 'chat' | 'all' | string;
  chatCount: number;
  chats: ArchiveChat[];
  catalogs?: {
    labels?: LabelRecord[];
    categories?: CategoryCatalogRecord[];
    [key: string]: unknown;
  };
}

// ─── MobileArchiveStore ───────────────────────────────────────────────────────

/**
 * The on-device store format used by Mobile Studio.
 * Not included in exported bundles — it wraps ArchiveBundleEnvelope content
 * with mobile-specific extras (folder index stored in bundleExtras).
 */
export interface MobileArchiveStore extends Record<string, unknown> {
  schema: typeof MOBILE_ARCHIVE_STORE_SCHEMA;
  updatedAt: string;
  bundleExtras: Record<string, unknown>;
  chats: ArchiveChat[];
}
