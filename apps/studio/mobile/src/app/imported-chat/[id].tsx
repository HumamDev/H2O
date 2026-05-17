import { useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTopBarMetrics } from '@/components/navigation/AppTopBar';
import { useTheme } from '@/hooks/use-theme';
import { useRouteGuard } from '@/identity/useRouteGuard';
import { getImportedChatById, subscribe, updateImportedChat } from '@/state/imported-chats';
import { spacing, typography } from '@/theme';
import type { ImportedChat, ImportedTurn } from '@/types/import-chatgpt-link';
import { relativeTime } from '@/utils/date';
import {
  createFetchController,
  fetchHtml,
  parseSharedChatMetadata,
} from '@/utils/fetch-shared-chat-metadata';
import {
  extractTranscriptFromHtml,
  type TranscriptDebugInfo,
} from '@/utils/fetch-shared-chat-transcript';

type Th = ReturnType<typeof useTheme>;

export default function ImportedChatScreen() {
  const guard = useRouteGuard('sync_ready');
  const { id, autoFetch } = useLocalSearchParams<{ id: string; autoFetch?: string | string[] }>();

  const chat = useSyncExternalStore(subscribe, () => getImportedChatById(id));
  const [transcriptDebug, setTranscriptDebug] = useState<TranscriptDebugInfo | null>(null);
  const lastAutoFetchKeyRef = useRef<string | null>(null);
  const th = useTheme();
  const { contentTopPadding, contentBottomPadding } = useTopBarMetrics();
  const styles = useMemo(
    () => createStyles(th, contentTopPadding, contentBottomPadding),
    [contentBottomPadding, contentTopPadding, th.scheme],
  );

  if (!chat) {
    return (
      <View style={styles.safe}>
        <SafeAreaView style={styles.center} edges={['bottom']}>
          <Text style={styles.notFoundText}>Chat not found.</Text>
          <Text style={styles.notFoundHint}>It may have been lost after an app restart.</Text>
        </SafeAreaView>
      </View>
    );
  }

  const fetchStatus = chat.fetchStatus ?? 'idle';
  const isLoading = fetchStatus === 'loading';
  const displayTitle = chat.fetchedTitle ?? chat.title;
  const displaySnippet = chat.fetchedSnippet ?? chat.snippet;
  const hasTranscript = (chat.transcript?.turns?.length ?? 0) > 0;
  const autoFetchKey = Array.isArray(autoFetch) ? autoFetch[0] : autoFetch;

  const handleFetch = useCallback(async () => {
    if (isLoading) return;

    const priorTranscript = chat.transcript;
    const sourceUrl = chat.sourceUrl;

    updateImportedChat(id, {
      fetchStatus: 'loading',
      fetchError: undefined,
      transcriptStatus: 'loading',
      transcriptError: undefined,
    });

    const { controller, clear } = createFetchController();
    try {
      const html = await fetchHtml(sourceUrl, controller.signal);
      const now = new Date().toISOString();

      const meta = parseSharedChatMetadata(html);
      const metaUpdates: Partial<ImportedChat> = {
        fetchStatus: 'success',
        lastFetchedAt: now,
        fetchError: undefined,
      };
      if (meta.title)   metaUpdates.fetchedTitle   = meta.title;
      if (meta.snippet) metaUpdates.fetchedSnippet = meta.snippet;

      const { turns, title: chatGPTTitle, debugInfo } = await extractTranscriptFromHtml(html, sourceUrl);
      const txUpdates: Partial<ImportedChat> = {};
      if (chatGPTTitle) txUpdates.fetchedChatGPTTitle = chatGPTTitle;
      if (turns.length > 0) {
        txUpdates.transcript          = { turns };
        txUpdates.transcriptStatus    = 'success';
        txUpdates.transcriptFetchedAt = now;
        txUpdates.transcriptError     = undefined;
        setTranscriptDebug(null);
      } else {
        txUpdates.transcriptStatus = 'error';
        txUpdates.transcriptError  = 'No conversation content found on this page.';
        if (priorTranscript) txUpdates.transcript = priorTranscript;
        setTranscriptDebug(debugInfo);
      }

      updateImportedChat(id, { ...metaUpdates, ...txUpdates });
    } catch (err) {
      const isTimeout = err instanceof Error && err.name === 'AbortError';
      const msg = isTimeout ? 'Request timed out.' : 'Could not fetch content.';
      updateImportedChat(id, {
        fetchStatus: 'error',
        fetchError: msg,
        transcriptStatus: 'error',
        transcriptError: msg,
        transcript: priorTranscript,
      });
    } finally {
      clear();
    }
  }, [chat.sourceUrl, chat.transcript, id, isLoading]);

  useEffect(() => {
    if (!autoFetchKey) return;

    const currentKey = `${id}:${autoFetchKey}`;
    if (lastAutoFetchKeyRef.current === currentKey) return;

    lastAutoFetchKeyRef.current = currentKey;
    void handleFetch();
  }, [autoFetchKey, handleFetch, id]);

  const metaBlock = (
    <View style={styles.metaBlock}>
      <Row label="Source"   value={chat.sourceUrl} th={th} />
      <Row label="Imported" value={relativeTime(chat.importedAt)} th={th} />
      {chat.lastFetchedAt ? (
        <Row label="Fetched" value={relativeTime(chat.lastFetchedAt)} th={th} />
      ) : null}
      <Row label="Type" value={chat.sourceType} th={th} />
    </View>
  );

  const descriptionBlock = (
    <View style={styles.sectionBlock}>
      <Text style={styles.sectionLabel}>Description</Text>
      <Text style={styles.snippet}>{displaySnippet}</Text>
    </View>
  );

  const fetchBlock = (
    <View style={styles.fetchBlock}>
      <TouchableOpacity
        style={[styles.fetchButton, isLoading && styles.fetchButtonDisabled]}
        activeOpacity={0.8}
        onPress={handleFetch}
        disabled={isLoading}
      >
        {isLoading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.fetchButtonText}>
            {fetchStatus === 'success' ? 'Re-fetch content' : 'Fetch content'}
          </Text>
        )}
      </TouchableOpacity>
      <FetchBanner chat={chat} th={th} />
    </View>
  );

  if (guard) return guard;
  if (hasTranscript) {
    return (
      <View style={styles.safe}>
        <ScrollView
          contentContainerStyle={styles.content}
          contentInsetAdjustmentBehavior="never"
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.title}>{displayTitle}</Text>
          <TranscriptSection chat={chat} debugInfo={transcriptDebug} th={th} />
          <View style={styles.detailsSection}>
            <Text style={styles.sectionLabel}>Details</Text>
            {fetchBlock}
            {metaBlock}
            {descriptionBlock}
          </View>
        </ScrollView>
        <SafeAreaView edges={['bottom']} />
      </View>
    );
  }

  return (
    <View style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="never"
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>{displayTitle}</Text>
        {metaBlock}
        {descriptionBlock}
        {fetchBlock}
        <TranscriptSection chat={chat} debugInfo={transcriptDebug} th={th} />
      </ScrollView>
      <SafeAreaView edges={['bottom']} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function FetchBanner({ chat, th }: { chat: ImportedChat; th: Th }) {
  const status = chat.fetchStatus ?? 'idle';
  const hasMeta = !!(chat.fetchedTitle || chat.fetchedSnippet);

  const mutedStyle: object = { ...typography.caption, color: th.textSecondary, fontStyle: 'italic', textAlign: 'center', paddingVertical: spacing.xs };

  if (!status || status === 'idle') {
    return <Text style={mutedStyle}>Tap "Fetch content" to load the page title, description, and conversation.</Text>;
  }
  if (status === 'loading') {
    return <Text style={mutedStyle}>Fetching content…</Text>;
  }
  if (status === 'error') {
    return <Text style={{ ...typography.caption, color: '#d32f2f', textAlign: 'center', paddingVertical: spacing.xs }}>{chat.fetchError ?? 'Fetch failed.'}</Text>;
  }
  return (
    <Text style={{ ...typography.caption, color: '#1a9e6e', textAlign: 'center', paddingVertical: spacing.xs }}>
      {hasMeta ? 'Metadata fetched.' : 'No page metadata found.'}
    </Text>
  );
}

function TranscriptSection({
  chat,
  debugInfo,
  th,
}: {
  chat: ImportedChat;
  debugInfo: TranscriptDebugInfo | null;
  th: Th;
}) {
  const status = chat.transcriptStatus;
  if (!status || status === 'idle') return null;

  const turns = chat.transcript?.turns ?? [];
  const labelStyle = { ...typography.caption, fontWeight: '700' as const, color: th.textSecondary, textTransform: 'uppercase' as const, letterSpacing: 0.8, marginBottom: spacing.sm };

  return (
    <View style={{ gap: spacing.xs }}>
      <Text style={labelStyle}>Conversation</Text>

      {status === 'loading' && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xs }}>
          <ActivityIndicator size="small" color="#208AEF" />
          <Text style={{ ...typography.caption, color: th.textSecondary, fontStyle: 'italic' }}>Loading conversation…</Text>
        </View>
      )}

      {status === 'error' && (
        <Text style={{ ...typography.caption, color: '#d32f2f', textAlign: 'center', paddingVertical: spacing.xs }}>
          {chat.transcriptError ?? 'Could not extract conversation.'}
        </Text>
      )}

      {status === 'error' && debugInfo && <DebugPanel info={debugInfo} />}

      {status === 'success' && turns.length === 0 && (
        <Text style={{ ...typography.caption, color: th.textSecondary, fontStyle: 'italic', textAlign: 'center', paddingVertical: spacing.xs }}>
          No conversation turns found.
        </Text>
      )}

      {turns.map((turn) => (
        <TurnBlock key={turn.id} turn={turn} th={th} />
      ))}
    </View>
  );
}

function TurnBlock({ turn, th }: { turn: ImportedTurn; th: Th }) {
  const paragraphs = cleanTurnText(turn.text)
    .split('\n\n')
    .map(p => p.trim())
    .filter(p => p.length > 0);

  if (turn.role === 'user') {
    // Right-aligned chat bubble — mirrors the ChatGPT mobile user bubble style.
    const bubbleBg = th.scheme === 'dark' ? '#1e3a5f' : '#208AEF';
    return (
      <View style={{ alignItems: 'flex-end', marginBottom: spacing.sm }}>
        <View style={{
          backgroundColor: bubbleBg,
          borderRadius: 18,
          borderBottomRightRadius: 4,
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm + 2,
          maxWidth: '85%',
        }}>
          {paragraphs.map((para, i) => (
            <Text key={i} style={{ color: '#fff', fontSize: 15, lineHeight: 22 }}>{para}</Text>
          ))}
        </View>
      </View>
    );
  }

  if (turn.role === 'assistant') {
    // Plain text on screen background — like ChatGPT's assistant view.
    return (
      <View style={{ marginBottom: spacing.lg }}>
        <Text style={{ fontSize: 10, fontWeight: '700', color: th.textSecondary, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: spacing.xs }}>
          ChatGPT
        </Text>
        <View style={{ gap: spacing.sm }}>
          {paragraphs.map((para, i) => (
            <Text key={i} style={{ color: th.text, fontSize: 15, lineHeight: 22 }}>{para}</Text>
          ))}
        </View>
      </View>
    );
  }

  // System / unknown — subtle muted card.
  return (
    <View style={{
      backgroundColor: th.backgroundElement,
      borderRadius: 8,
      padding: spacing.md,
      gap: spacing.xs,
      borderLeftWidth: 2,
      borderLeftColor: th.textSecondary,
      marginBottom: spacing.sm,
    }}>
      <Text style={{ fontSize: 10, fontWeight: '700', color: th.textSecondary, textTransform: 'uppercase', letterSpacing: 0.6 }}>
        {roleLabel(turn.role)}
      </Text>
      <View style={{ gap: spacing.sm }}>
        {paragraphs.map((para, i) => (
          <Text key={i} style={{ color: th.text, fontSize: 15, lineHeight: 22 }}>{para}</Text>
        ))}
      </View>
    </View>
  );
}

function cleanTurnText(raw: string): string {
  let t = raw;
  t = t.replace(/\u3010[^\u3011]*\u3011/g, '');
  t = t.replace(/^#{1,6} +/gm, '');
  t = t.replace(/\*\*([^*\n]+)\*\*/g, '$1');
  t = t.replace(/^[ \t]*(?:[-_*][ \t]*){3,}[ \t]*$/gm, '');
  t = t.replace(/\n{3,}/g, '\n\n');
  return t.trim();
}

function roleLabel(role: ImportedTurn['role']): string {
  switch (role) {
    case 'user':      return 'You';
    case 'assistant': return 'ChatGPT';
    case 'system':    return 'System';
    default:          return 'Unknown';
  }
}

function Row({ label, value, th }: { label: string; value: string; th: Th }) {
  return (
    <View style={{
      flexDirection: 'row',
      alignItems: 'flex-start',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm + 2,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: th.backgroundSelected,
      gap: spacing.sm,
    }}>
      <Text style={{ ...typography.caption, fontWeight: '700', color: th.textSecondary, width: 72, flexShrink: 0, marginTop: 2 }}>
        {label}
      </Text>
      <Text style={{ flex: 1, ...typography.body, color: th.text }} numberOfLines={2}>{value}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Debug panel — shown only when transcript extraction fails, hardcoded dark
// ---------------------------------------------------------------------------

function DebugPanel({ info }: { info: TranscriptDebugInfo }) {
  const kwEntries = Object.entries(info.keywords);
  return (
    <View style={debugStyles.panel}>
      <Text style={debugStyles.title}>[ DEBUG — transcript extraction signals ]</Text>
      <DebugRow label="direct probe"   value={info.directProbeTried ? 'tried' : 'not tried'} />
      {info.directProbeUrl && <DebugRow label="probe url" value={info.directProbeUrl} />}
      {info.directProbeStatus !== null && <DebugRow label="probe status" value={String(info.directProbeStatus)} />}
      <DebugRow label="probe result" value={info.directProbeResult} />
      {info.directProbeJsonKeys && <DebugRow label="probe JSON keys" value={info.directProbeJsonKeys.join(', ')} />}
      <DebugRow label="__NEXT_DATA__"     value={info.hasNextData ? 'YES' : 'NO'} />
      <DebugRow label="ld+json"           value={info.hasLdJson ? 'YES' : 'NO'} />
      <DebugRow label="data-message-role" value={info.hasDataMessageRole ? 'YES' : 'NO'} />
      <DebugRow label="script tags"       value={String(info.scriptCount)} />
      <DebugRow label="JSON script tags"  value={String(info.jsonScriptCount)} />
      {info.otherJsonScriptIds.length > 0 && <DebugRow label="other JSON script IDs" value={info.otherJsonScriptIds.join(', ')} />}
      {kwEntries.length > 0 && <DebugRow label="keyword hits" value={kwEntries.map(([k, n]) => `${k}:${n}`).join('  ')} />}
      {info.clientBootstrapTopKeys && <DebugRow label="client-bootstrap keys" value={info.clientBootstrapTopKeys.join(', ')} />}
      {info.clientBootstrapTurnPath && <DebugRow label="cb turn path" value={info.clientBootstrapTurnPath} />}
      {info.nextDataPagePropsKeys && <DebugRow label="pageProps keys" value={info.nextDataPagePropsKeys.join(', ')} />}
      {info.nextDataConvKeys && <DebugRow label="convData keys" value={info.nextDataConvKeys.join(', ')} />}
      {info.clientBootstrapPreview && (
        <View style={debugStyles.previewBlock}>
          <Text style={debugStyles.label}>client-bootstrap preview (first 300 chars):</Text>
          <Text style={debugStyles.preview}>{info.clientBootstrapPreview}</Text>
        </View>
      )}
      {info.nextDataPreview && (
        <View style={debugStyles.previewBlock}>
          <Text style={debugStyles.label}>__NEXT_DATA__ preview (first 300 chars):</Text>
          <Text style={debugStyles.preview}>{info.nextDataPreview}</Text>
        </View>
      )}
      {info.dataRoleSnippet && (
        <View style={debugStyles.previewBlock}>
          <Text style={debugStyles.label}>data-message-author-role snippet:</Text>
          <Text style={debugStyles.preview}>{info.dataRoleSnippet}</Text>
        </View>
      )}
      {info.scriptSrcs.length > 0 && (
        <View style={debugStyles.previewBlock}>
          <Text style={debugStyles.label}>external script srcs:</Text>
          {info.scriptSrcs.map((s, i) => <Text key={i} style={debugStyles.preview}>{s}</Text>)}
        </View>
      )}
      {info.resourceUrlsWithKeywords.length > 0 && (
        <View style={debugStyles.previewBlock}>
          <Text style={debugStyles.label}>resource URLs with keywords:</Text>
          {info.resourceUrlsWithKeywords.map((s, i) => <Text key={i} style={debugStyles.preview}>{s}</Text>)}
        </View>
      )}
      {info.inlineEndpointHints.length > 0 && (
        <View style={debugStyles.previewBlock}>
          <Text style={debugStyles.label}>inline endpoint hints:</Text>
          {info.inlineEndpointHints.map((s, i) => <Text key={i} style={debugStyles.preview}>{s}</Text>)}
        </View>
      )}
      {info.shareIdOccurrences !== null && (
        <View style={debugStyles.previewBlock}>
          <Text style={debugStyles.label}>{`share-ID occurrences (${info.shareIdOccurrences.length}):`}</Text>
          {info.shareIdOccurrences.map((s, i) => <Text key={i} style={debugStyles.preview}>{s}</Text>)}
        </View>
      )}
      {info.keywordContextPreviews.length > 0 && (
        <View style={debugStyles.previewBlock}>
          <Text style={debugStyles.label}>keyword context previews:</Text>
          {info.keywordContextPreviews.map(({ keyword, preview }, i) => (
            <Text key={i} style={debugStyles.preview}>{`[${keyword}] ${preview}`}</Text>
          ))}
        </View>
      )}
      {info.escapedJsonHints.length > 0 && (
        <View style={debugStyles.previewBlock}>
          <Text style={debugStyles.label}>escaped-JSON hints:</Text>
          {info.escapedJsonHints.map((s, i) => <Text key={i} style={debugStyles.preview}>{s}</Text>)}
        </View>
      )}
      <DebugRow label="backend-api ref" value={info.hasBackendApiRef ? 'YES' : 'NO'} />
      {info.appBundleSrcs.length > 0 && (
        <View style={debugStyles.previewBlock}>
          <Text style={debugStyles.label}>app bundle srcs:</Text>
          {info.appBundleSrcs.map((s, i) => <Text key={i} style={debugStyles.preview}>{s}</Text>)}
        </View>
      )}
      {info.inlineFetchHints.length > 0 && (
        <View style={debugStyles.previewBlock}>
          <Text style={debugStyles.label}>inline fetch/XHR hints:</Text>
          {info.inlineFetchHints.map((s, i) => <Text key={i} style={debugStyles.preview}>{s}</Text>)}
        </View>
      )}
    </View>
  );
}

function DebugRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={debugStyles.row}>
      <Text style={debugStyles.label}>{label}:</Text>
      <Text style={debugStyles.value}>{value}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Style factory — recreated only when the color scheme changes
// ---------------------------------------------------------------------------

function createStyles(th: Th, contentTopPadding: number, contentBottomPadding: number) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: th.background },
    content: {
      paddingHorizontal: spacing.md,
      paddingTop: contentTopPadding,
      paddingBottom: contentBottomPadding,
      gap: spacing.md,
    },

    center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg, gap: spacing.sm },
    notFoundText: { ...typography.title, color: th.text },
    notFoundHint: { ...typography.body, color: th.textSecondary, textAlign: 'center' },

    title: { ...typography.title, color: th.text, marginBottom: spacing.xs },

    metaBlock: {
      backgroundColor: th.backgroundElement,
      borderRadius: 10,
      overflow: 'hidden',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: th.backgroundSelected,
    },

    sectionBlock: { gap: spacing.sm },
    detailsSection: {
      gap: spacing.md,
      paddingTop: spacing.sm,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: th.backgroundSelected,
    },
    sectionLabel: {
      ...typography.caption,
      fontWeight: '700',
      color: th.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },
    snippet: { ...typography.body, color: th.text, lineHeight: 22 },

    fetchBlock: { gap: spacing.sm },
    fetchButton: { backgroundColor: '#208AEF', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
    fetchButtonDisabled: { opacity: 0.6 },
    fetchButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  });
}

// Debug panel uses hardcoded dark colors — it's always rendered as a dark overlay.
const debugStyles = StyleSheet.create({
  panel: { backgroundColor: '#1a1a2e', borderRadius: 8, padding: spacing.md, gap: 6, borderLeftWidth: 3, borderLeftColor: '#f0a500' },
  title: { fontSize: 10, fontWeight: '700', color: '#f0a500', fontFamily: 'monospace', marginBottom: 4 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  label: { fontSize: 10, color: '#8888aa', fontFamily: 'monospace' },
  value: { fontSize: 10, color: '#ccddff', fontFamily: 'monospace', flexShrink: 1, flexWrap: 'wrap' },
  previewBlock: { gap: 2, marginTop: 4 },
  preview: { fontSize: 9, color: '#aaccff', fontFamily: 'monospace', lineHeight: 14 },
});
