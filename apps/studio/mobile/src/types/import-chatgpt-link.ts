export interface ImportedTurn {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'unknown';
  text: string;
}

export interface ImportedTranscript {
  turns: ImportedTurn[];
}

export interface ImportedChat {
  id: string;
  /** Share token extracted from sourceUrl — primary dedupe key. */
  shareId?: string;
  sourceUrl: string;
  title: string;       // synthesized at import time
  snippet: string;     // synthesized at import time
  importedAt: string;  // ISO 8601
  sourceType: 'chatgpt-shared-link';
  // Phase 2A — populated after "Fetch content"
  fetchStatus?: 'idle' | 'loading' | 'success' | 'error';
  /** Exact title from ChatGPT shared-conversation payload when available. */
  fetchedChatGPTTitle?: string;
  fetchedTitle?: string;
  fetchedSnippet?: string;
  fetchError?: string;
  lastFetchedAt?: string;  // ISO 8601
  // Phase 2B — transcript extraction
  transcriptStatus?: 'idle' | 'loading' | 'success' | 'error';
  transcriptError?: string;
  transcriptFetchedAt?: string; // ISO 8601
  transcript?: ImportedTranscript;
  // Compatibility marker for one-time promotion into canonical archive storage.
  archivePromotedAt?: string;
  archiveChatId?: string;
}
