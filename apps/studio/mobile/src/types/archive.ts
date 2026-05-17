/**
 * Archive bundle v1 types — Mobile Studio local copy.
 *
 * SYNC TARGET: packages/studio-types/src/archive.ts
 * Keep this file structurally identical to the shared package.
 * When the workspace dependency on @h2o-studio/types is wired up,
 * this file can be replaced with a re-export from that package.
 */

export const ARCHIVE_BUNDLE_SCHEMA = 'h2o.chatArchive.bundle.v1' as const;
export const MOBILE_ARCHIVE_STORE_SCHEMA = 'h2o.mobile.chatArchive.store.v1' as const;
export const ARCHIVE_DEFAULT_RETENTION_KEEP_LATEST = 30;

export type ArchiveJsonObject = Record<string, unknown>;

export type ArchiveBundleScope = 'chat' | 'all' | string;

/**
 * Typed snapshot metadata fields for the current bundle-v1 format.
 *
 * Identity conventions:
 *  chatgptId  — Native ChatGPT conversation UUID from the URL (/c/<id>).
 *               Written by Browser Studio live-captures.
 *               Enables cross-platform dedup of the same conversation
 *               regardless of chatId prefix used by each platform.
 *  shareId    — ChatGPT share token from a shared-link URL.
 *               Written by Mobile Studio imports.
 *               Primary dedup key for mobile-imported chats.
 *  chatId     — Archive-local identifier (ArchiveChat.chatId).
 *               Browser-captured: equals chatgptId (raw UUID).
 *               Mobile-imported:  "imported-{stableId(shareId || localId)}".
 *  snapshotId — Unique within a chatId; must be stable for digest dedup.
 *               Browser: opaque extension-generated string.
 *               Mobile:  "{chatId}:mobile-import".
 */
export interface SnapshotMeta extends ArchiveJsonObject {
  // ── Display ────────────────────────────────────────────────────────────────
  title?: string;
  excerpt?: string;

  // ── Origin ─────────────────────────────────────────────────────────────────
  /**
   * 'browser' = Browser Studio live-capture or extension.
   * 'mobile'  = Mobile Studio import.
   * Older bundles may have 'dom' or 'legacy-migration'; treat non-'mobile' as browser.
   */
  source?: 'browser' | 'mobile' | string;
  /** 'chatgpt-live-capture' | 'chatgpt-shared-link' */
  sourceType?: 'chatgpt-live-capture' | 'chatgpt-shared-link' | string;
  /**
   * Full URL at capture time. Browser also writes the same value to `href`
   * for backward compatibility — prefer `sourceUrl` for new code.
   */
  sourceUrl?: string;

  // ── Identity ───────────────────────────────────────────────────────────────
  /** Native ChatGPT UUID from URL. Written by Browser Studio. */
  chatgptId?: string;
  /** ChatGPT share token. Written by Mobile Studio import. */
  shareId?: string;

  // ── Timestamps ─────────────────────────────────────────────────────────────
  capturedAt?: string;   // ISO 8601 — when DOM was captured / transcript fetched
  updatedAt?: string;    // ISO 8601 — last mutation (edit, tag, folder)
  importedAt?: string;   // ISO 8601 — first import (mobile only)

  // ── Origin (extended) ──────────────────────────────────────────────────────
  /**
   * 'browser' = Browser Studio live-capture or extension.
   * 'mobile'  = Mobile Studio import.
   * 'unknown' = Older bundles or unrecognised value.
   */
  originSource?: 'browser' | 'mobile' | 'unknown';
  originProjectRef?: {
    id: string;
    name: string;
  };

  // ── Organization ───────────────────────────────────────────────────────────
  folderId?: string;
  folderName?: string;
  /**
   * 'user' = folder was explicitly assigned by the user (never auto-overwrite).
   * 'auto' = derived from originProjectRef (safe to overwrite on sync).
   * Absent field is treated as 'user' on read.
   */
  folderBindingSource?: 'auto' | 'user';
  tags?: string[];
  keywords?: string[];
  archived?: boolean;
  category?: CategoryRecord | null;
  labels?: {
    workflowStatusLabelId?: string;
    priorityLabelId?: string;
    actionLabelIds?: string[];
    contextLabelIds?: string[];
    customLabelIds?: string[];
  };

  // ── Mobile fetch metadata ──────────────────────────────────────────────────
  fetchedChatGPTTitle?: string;
  fetchedTitle?: string;
  fetchedSnippet?: string;

  // ── Browser-only rich capture ──────────────────────────────────────────────
  /** Legacy alias for sourceUrl (kept for backward compat). */
  href?: string;
}

export interface ArchiveMessage extends ArchiveJsonObject {
  role: string;
  text: string;
  order: number;
  createdAt: number | null;
  /** ISO 8601. Set when text was manually edited after capture. */
  editedAt?: string;
  /** Preserved original text before the first manual edit. */
  originalText?: string;
}

export interface ArchiveChatIndex extends ArchiveJsonObject {
  lastSnapshotId: string;
  lastCapturedAt: string;
  pinnedSnapshotIds: string[];
  retentionPolicy?: {
    keepLatest: number;
    [key: string]: unknown;
  };
  lastDigest: string;
}

export interface ArchiveSnapshot extends ArchiveJsonObject {
  snapshotId: string;
  chatId: string;
  createdAt: string;
  schemaVersion: number;
  messageCount: number;
  digest: string;
  meta: ArchiveJsonObject;
  messages: ArchiveMessage[];
}

export interface ArchiveChat extends ArchiveJsonObject {
  chatId: string;
  bootMode?: string;
  migrated?: boolean;
  chatIndex: ArchiveChatIndex;
  snapshots: ArchiveSnapshot[];
}

export type LabelType = 'workflow_status' | 'priority' | 'action' | 'context' | 'custom';

export interface LabelRecord {
  id: string;
  name: string;
  type: LabelType;
  color: string;
  sortOrder: number;
  createdAt: string;
}

export interface CategoryRecord extends ArchiveJsonObject {
  primaryCategoryId: string;
  secondaryCategoryId: string | null;
  source: 'system' | 'user';
  algorithmVersion: string | null;
  classifiedAt: string | null;
  overriddenAt: string | null;
  confidence: number | null;
}

export interface CategoryCatalogRecord extends ArchiveJsonObject {
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

export interface ArchiveBundleEnvelope extends ArchiveJsonObject {
  schema: typeof ARCHIVE_BUNDLE_SCHEMA;
  exportedAt: string;
  scope: ArchiveBundleScope;
  chatCount: number;
  chats: ArchiveChat[];
  catalogs?: {
    labels?: LabelRecord[];
    categories?: CategoryCatalogRecord[];
  };
}

export interface MobileArchiveStore extends ArchiveJsonObject {
  schema: typeof MOBILE_ARCHIVE_STORE_SCHEMA;
  updatedAt: string;
  bundleExtras: ArchiveJsonObject;
  chats: ArchiveChat[];
}

export type ArchiveImportMode = 'merge' | 'overwrite';

export type ArchiveImportIssueCode =
  | 'invalid_bundle'
  | 'invalid_chat'
  | 'invalid_snapshot'
  | 'empty_snapshot'
  | 'duplicate_digest'
  | 'missing_messages'
  | 'coerced_field'
  | 'identity_merge';

export interface ArchiveImportIssue {
  code: ArchiveImportIssueCode;
  chatId?: string;
  snapshotId?: string;
  message: string;
}

export interface ArchiveImportReport {
  ok: boolean;
  mode: ArchiveImportMode;
  importedChats: number;
  importedSnapshots: number;
  replacedSnapshots: number;
  skippedDuplicateSnapshots: number;
  skippedEmptySnapshots: number;
  skippedMalformedSnapshots: number;
  /** Chats merged into an existing chat by chatgptId or shareId identity match. */
  identityMergedChats: number;
  warnings: ArchiveImportIssue[];
  errors: ArchiveImportIssue[];
}

export interface ArchiveMergeOptions {
  mode?: ArchiveImportMode;
  nowIso?: string;
}

export type ArchiveValidationResult =
  | { ok: true; bundle: ArchiveBundleEnvelope; warnings: ArchiveImportIssue[] }
  | { ok: false; errors: ArchiveImportIssue[] };
