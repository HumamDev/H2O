import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTopBarMetrics } from '@/components/navigation/AppTopBar';
import { promoteImportedChatToArchive } from '@/importers/imported-chat-archive';
import { colors, spacing, typography } from '@/theme';
import type { ImportedChat } from '@/types/import-chatgpt-link';
import {
  createFetchController,
  fetchHtml,
  parseSharedChatMetadata,
} from '@/utils/fetch-shared-chat-metadata';
import { extractTranscriptFromHtml } from '@/utils/fetch-shared-chat-transcript';
import {
  createImportedChatFromShareUrl,
  getIncomingChatGPTShareUrlParam,
} from '@/utils/chatgpt-link';

export default function ImportChatGPTLinkScreen() {
  const router = useRouter();
  const { url: urlParam } = useLocalSearchParams<{ url?: string | string[] }>();
  const { contentTopPadding, contentBottomPadding } = useTopBarMetrics();
  const [url, setUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const lastAutoImportedUrlRef = useRef<string | null>(null);

  const runImport = useCallback(async (rawUrl: string) => {
    setError(null);
    setImporting(true);
    try {
      const prepared = createImportedChatFromShareUrl(rawUrl);
      if (!prepared.ok) {
        setError(prepared.error);
        return;
      }

      let title: string | undefined;
      let snippet: string | undefined;
      let chat: ImportedChat = prepared.item;
      const { controller, clear } = createFetchController();
      try {
        const html = await fetchHtml(prepared.url.toString(), controller.signal);
        const now = new Date().toISOString();
        const meta = parseSharedChatMetadata(html);
        title = meta.title;
        snippet = meta.snippet;
        chat = {
          ...prepared.item,
          title: title || prepared.item.title,
          snippet: snippet || prepared.item.snippet,
          fetchedTitle: title,
          fetchedSnippet: snippet,
          fetchStatus: 'success',
          lastFetchedAt: now,
        };
        try {
          const { turns, title: chatGPTTitle } = await extractTranscriptFromHtml(html, prepared.url.toString());
          chat = {
            ...chat,
            fetchedChatGPTTitle: chatGPTTitle,
            transcriptStatus: turns.length > 0 ? 'success' : 'error',
            transcriptFetchedAt: turns.length > 0 ? now : undefined,
            transcriptError: turns.length > 0 ? undefined : 'No conversation content found on this page.',
            transcript: turns.length > 0 ? { turns } : undefined,
          };
        } catch {
          chat = {
            ...chat,
            transcriptStatus: 'error',
            transcriptError: 'Could not extract conversation.',
          };
        }
      } catch {
        // Best effort only — import must still work if metadata fetch fails.
      } finally {
        clear();
      }

      const promoted = await promoteImportedChatToArchive(chat);
      router.replace(`/chat/${promoted.chatId}`);
    } finally {
      setImporting(false);
    }
  }, [router]);

  useEffect(() => {
    const incomingUrl = getIncomingChatGPTShareUrlParam(urlParam);
    if (!incomingUrl) return;
    if (lastAutoImportedUrlRef.current === incomingUrl) return;

    lastAutoImportedUrlRef.current = incomingUrl;
    setUrl(incomingUrl);
    void runImport(incomingUrl);
  }, [runImport, urlParam]);

  function handleImport() {
    void runImport(url);
  }

  return (
    <SafeAreaView style={styles.safe} edges={[]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={[styles.container, { paddingTop: contentTopPadding, paddingBottom: contentBottomPadding }]}>
          <Text style={styles.heading}>Import a shared ChatGPT link</Text>
          <Text style={styles.hint}>
            Paste a link from chatgpt.com/share/… or chat.openai.com/share/…
          </Text>

          {importing && getIncomingChatGPTShareUrlParam(urlParam) ? (
            <Text style={styles.info}>Importing incoming shared link…</Text>
          ) : null}

          <TextInput
            style={styles.input}
            placeholder="https://chatgpt.com/share/..."
            placeholderTextColor={colors.textMuted}
            value={url}
            onChangeText={text => {
              setUrl(text);
              if (error) setError(null);
            }}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            returnKeyType="done"
            onSubmitEditing={handleImport}
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <TouchableOpacity
            style={[styles.button, importing && styles.buttonDisabled]}
            onPress={handleImport}
            disabled={importing}
            activeOpacity={0.8}
          >
            {importing ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Import</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  container: {
    flex: 1,
    padding: spacing.lg,
    gap: spacing.md,
    justifyContent: 'center',
  },
  heading: {
    ...typography.title,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  hint: {
    ...typography.body,
    color: colors.textMuted,
    marginBottom: spacing.sm,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
    fontSize: 15,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  error: {
    fontSize: 13,
    color: '#d32f2f',
  },
  info: {
    fontSize: 13,
    color: colors.textMuted,
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
