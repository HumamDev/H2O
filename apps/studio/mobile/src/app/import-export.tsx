import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTopBarMetrics } from '@/components/navigation/AppTopBar';
import { exportArchiveBundle } from '@/exporters/archive-bundle';
import { useRouteGuard } from '@/identity/useRouteGuard';
import { mergeArchiveBundleIntoStore, normalizeArchiveBundle } from '@/importers/archive-bundle';
import { getArchiveStoreSnapshot, replaceArchiveStore } from '@/state/archive';
import { loadWebDAVSyncSettings, type WebDAVSyncSettingsInput } from '@/storage/sync-creds';
import {
  pullArchiveFromWebDAV,
  pushArchiveToWebDAV,
  testWebDAVConnection,
} from '@/sync';
import { colors, spacing, typography } from '@/theme';
import type { ArchiveImportReport } from '@/types/archive';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ImportPhase = 'idle' | 'running' | 'done' | 'error';
type ExportPhase = 'idle' | 'running' | 'done' | 'error';
type WebDAVPhase = 'idle' | 'running' | 'done' | 'error';
type WebDAVAction = 'test' | 'pull' | 'push';

interface WebDAVFormState {
  serverUrl: string;
  username: string;
  password: string;
  rootPath: string;
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function ImportExportScreen() {
  const guard = useRouteGuard('sync_ready');
  const { contentTopPadding, contentBottomPadding } = useTopBarMetrics();

  const [jsonInput, setJsonInput] = useState('');
  const [importPhase, setImportPhase] = useState<ImportPhase>('idle');
  const [importError, setImportError] = useState<string | null>(null);
  const [importReport, setImportReport] = useState<ArchiveImportReport | null>(null);

  const [exportPhase, setExportPhase] = useState<ExportPhase>('idle');
  const [exportError, setExportError] = useState<string | null>(null);

  const [webdavForm, setWebdavForm] = useState<WebDAVFormState>({
    serverUrl: '',
    username: '',
    password: '',
    rootPath: 'H2O',
  });
  const [webdavPhase, setWebdavPhase] = useState<WebDAVPhase>('idle');
  const [webdavAction, setWebdavAction] = useState<WebDAVAction | null>(null);
  const [webdavMessage, setWebdavMessage] = useState<string | null>(null);
  const [webdavReport, setWebdavReport] = useState<ArchiveImportReport | null>(null);

  useEffect(() => {
    let alive = true;
    loadWebDAVSyncSettings().then(settings => {
      if (!alive) return;
      setWebdavForm({
        serverUrl: settings.serverUrl,
        username: settings.username,
        password: settings.password,
        rootPath: settings.rootPath || 'H2O',
      });
    }).catch(() => { /* keep empty form */ });
    return () => { alive = false; };
  }, []);

  const handleImport = useCallback(() => {
    const raw = jsonInput.trim();
    if (!raw) {
      setImportError('Paste a JSON bundle first.');
      return;
    }

    setImportPhase('running');
    setImportError(null);
    setImportReport(null);

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      setImportError('Invalid JSON — could not parse the pasted content.');
      setImportPhase('error');
      return;
    }

    const validation = normalizeArchiveBundle(parsed);
    if (!validation.ok) {
      setImportError(validation.errors.map(e => e.message).join(' '));
      setImportPhase('error');
      return;
    }

    const { bundle } = validation;
    const currentStore = getArchiveStoreSnapshot();
    const { store: nextStore, report } = mergeArchiveBundleIntoStore(currentStore, bundle);

    replaceArchiveStore(nextStore, { persist: true });

    setImportReport(report);
    setImportPhase('done');
    setJsonInput('');
  }, [jsonInput]);

  const handleExport = useCallback(async () => {
    setExportPhase('running');
    setExportError(null);
    try {
      const store = getArchiveStoreSnapshot();
      const bundle = exportArchiveBundle(store);
      const json = JSON.stringify(bundle, null, 2);
      const filename = `h2o_archive_${new Date().toISOString().slice(0, 10)}.json`;
      await Share.share({ message: json, title: filename });
      setExportPhase('done');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Export failed.';
      setExportError(msg);
      setExportPhase('error');
    }
  }, []);

  const updateWebdavField = useCallback((key: keyof WebDAVFormState, value: string) => {
    setWebdavForm(current => ({ ...current, [key]: value }));
    if (webdavPhase !== 'idle') setWebdavPhase('idle');
    if (webdavMessage) setWebdavMessage(null);
    if (webdavReport) setWebdavReport(null);
  }, [webdavMessage, webdavPhase, webdavReport]);

  const webdavSettings = useCallback((): WebDAVSyncSettingsInput => ({
    serverUrl: webdavForm.serverUrl,
    username: webdavForm.username,
    password: webdavForm.password,
    rootPath: webdavForm.rootPath,
  }), [webdavForm]);

  const runWebdavAction = useCallback(async (action: WebDAVAction) => {
    setWebdavAction(action);
    setWebdavPhase('running');
    setWebdavMessage(null);
    setWebdavReport(null);

    try {
      if (action === 'test') {
        const result = await testWebDAVConnection(webdavSettings());
        setWebdavMessage(`Connection verified. Remote folder returned HTTP ${result.status}.`);
      } else if (action === 'pull') {
        const result = await pullArchiveFromWebDAV(webdavSettings());
        const skipped = result.report.skippedDuplicateSnapshots +
          result.report.skippedEmptySnapshots +
          result.report.skippedMalformedSnapshots;
        setWebdavReport(result.report);
        setWebdavMessage(
          `Pulled h2o-archive.json and merged ${result.report.importedChats} chats, ` +
          `${result.report.importedSnapshots} new snapshots, ${result.report.replacedSnapshots} replaced, ${skipped} skipped.`,
        );
      } else {
        const result = await pushArchiveToWebDAV(webdavSettings());
        setWebdavMessage(`Pushed ${result.chatCount} chats to h2o-archive.json.`);
      }
      setWebdavPhase('done');
    } catch (err) {
      setWebdavMessage(err instanceof Error ? err.message : 'WebDAV sync failed.');
      setWebdavPhase('error');
    } finally {
      setWebdavAction(null);
    }
  }, [webdavSettings]);

  if (guard) return guard;
  return (
    <SafeAreaView style={styles.safe} edges={[]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingTop: contentTopPadding, paddingBottom: contentBottomPadding },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          {/* ---------------------------------------------------------------- */}
          {/* Import section                                                    */}
          {/* ---------------------------------------------------------------- */}
          <Text style={styles.sectionHeading}>Import Archive Bundle</Text>
          <Text style={styles.hint}>
            Paste a <Text style={styles.mono}>h2o.chatArchive.bundle.v1</Text> JSON bundle.
            Chats are merged into the local archive.
          </Text>

          <TextInput
            style={styles.jsonInput}
            placeholder={'{ "schema": "h2o.chatArchive.bundle.v1", ... }'}
            placeholderTextColor={colors.textMuted}
            value={jsonInput}
            onChangeText={text => {
              setJsonInput(text);
              if (importError) setImportError(null);
              if (importPhase !== 'idle') setImportPhase('idle');
            }}
            multiline
            autoCapitalize="none"
            autoCorrect={false}
            scrollEnabled
          />

          {importError ? <Text style={styles.errorText}>{importError}</Text> : null}

          <TouchableOpacity
            style={[styles.button, importPhase === 'running' && styles.buttonDisabled]}
            onPress={handleImport}
            disabled={importPhase === 'running'}
            activeOpacity={0.8}
          >
            {importPhase === 'running' ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Import</Text>
            )}
          </TouchableOpacity>

          {importPhase === 'done' && importReport ? (
            <ImportResultCard report={importReport} />
          ) : null}

          {/* ---------------------------------------------------------------- */}
          {/* Export section                                                    */}
          {/* ---------------------------------------------------------------- */}
          <View style={styles.divider} />

          <Text style={styles.sectionHeading}>Export Archive Bundle</Text>
          <Text style={styles.hint}>
            Export the full local archive as a{' '}
            <Text style={styles.mono}>h2o.chatArchive.bundle.v1</Text> JSON bundle.
          </Text>

          <TouchableOpacity
            style={[styles.button, exportPhase === 'running' && styles.buttonDisabled]}
            onPress={handleExport}
            disabled={exportPhase === 'running'}
            activeOpacity={0.8}
          >
            {exportPhase === 'running' ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Export</Text>
            )}
          </TouchableOpacity>

          {exportPhase === 'done' ? (
            <Text style={styles.successText}>Shared via native share sheet.</Text>
          ) : null}
          {exportPhase === 'error' && exportError ? (
            <Text style={styles.errorText}>{exportError}</Text>
          ) : null}

          {/* ---------------------------------------------------------------- */}
          {/* WebDAV section                                                    */}
          {/* ---------------------------------------------------------------- */}
          <View style={styles.divider} />

          <Text style={styles.sectionHeading}>WebDAV Sync</Text>
          <Text style={styles.hint}>
            Pull or push the canonical <Text style={styles.mono}>h2o-archive.json</Text>{' '}
            archive bundle manually.
          </Text>

          <LabeledInput
            label="WebDAV URL"
            value={webdavForm.serverUrl}
            onChangeText={value => updateWebdavField('serverUrl', value)}
            placeholder="https://app.koofr.net/dav/Koofr"
            keyboardType="url"
          />
          <LabeledInput
            label="Username"
            value={webdavForm.username}
            onChangeText={value => updateWebdavField('username', value)}
            placeholder="name@example.com"
            autoComplete="username"
          />
          <LabeledInput
            label="Password"
            value={webdavForm.password}
            onChangeText={value => updateWebdavField('password', value)}
            placeholder="App password"
            secureTextEntry
            autoComplete="password"
          />
          <LabeledInput
            label="Folder"
            value={webdavForm.rootPath}
            onChangeText={value => updateWebdavField('rootPath', value)}
            placeholder="H2O"
          />

          <View style={styles.syncActions}>
            <SyncButton
              label="Test"
              running={webdavAction === 'test'}
              disabled={webdavPhase === 'running'}
              onPress={() => runWebdavAction('test')}
            />
            <SyncButton
              label="Pull"
              running={webdavAction === 'pull'}
              disabled={webdavPhase === 'running'}
              onPress={() => runWebdavAction('pull')}
            />
            <SyncButton
              label="Push"
              running={webdavAction === 'push'}
              disabled={webdavPhase === 'running'}
              onPress={() => runWebdavAction('push')}
            />
          </View>

          {webdavMessage && webdavPhase === 'done' ? (
            <Text style={styles.successText}>{webdavMessage}</Text>
          ) : null}
          {webdavMessage && webdavPhase === 'error' ? (
            <Text style={styles.errorText}>{webdavMessage}</Text>
          ) : null}
          {webdavPhase === 'done' && webdavReport ? (
            <ImportResultCard report={webdavReport} title="Pull complete" />
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Import result card
// ---------------------------------------------------------------------------

function LabeledInput({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  keyboardType,
  autoComplete,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  secureTextEntry?: boolean;
  keyboardType?: 'default' | 'url';
  autoComplete?: 'username' | 'password';
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={styles.textInput}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        autoComplete={autoComplete}
        autoCapitalize="none"
        autoCorrect={false}
      />
    </View>
  );
}

function SyncButton({
  label,
  running,
  disabled,
  onPress,
}: {
  label: string;
  running: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.button, styles.syncButton, disabled && styles.buttonDisabled]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.8}
    >
      {running ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{label}</Text>}
    </TouchableOpacity>
  );
}

function ImportResultCard({ report, title = 'Import complete' }: { report: ArchiveImportReport; title?: string }) {
  const warningCount = report.warnings.length;
  const errorCount = report.errors.length;
  const totalSkipped = report.skippedDuplicateSnapshots + report.skippedEmptySnapshots + report.skippedMalformedSnapshots;

  return (
    <View style={styles.resultCard}>
      <Text style={styles.resultTitle}>{title}</Text>
      <ResultRow label="Chats processed" value={report.importedChats} />
      <ResultRow label="New snapshots" value={report.importedSnapshots} />
      {report.replacedSnapshots > 0 ? (
        <ResultRow label="Replaced snapshots" value={report.replacedSnapshots} />
      ) : null}
      {totalSkipped > 0 ? (
        <ResultRow label="Skipped (duplicates / empty)" value={totalSkipped} />
      ) : null}
      {warningCount > 0 ? (
        <ResultRow label="Warnings" value={warningCount} muted />
      ) : null}
      {errorCount > 0 ? (
        <ResultRow label="Errors" value={errorCount} muted />
      ) : null}
    </View>
  );
}

function ResultRow({ label, value, muted }: { label: string; value: number; muted?: boolean }) {
  return (
    <View style={styles.resultRow}>
      <Text style={[styles.resultLabel, muted && styles.resultLabelMuted]}>{label}</Text>
      <Text style={[styles.resultValue, muted && styles.resultValueMuted]}>{value}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  content: {
    padding: spacing.lg,
    gap: spacing.md,
  },

  sectionHeading: {
    ...typography.title,
    fontSize: 18,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  hint: {
    ...typography.body,
    color: colors.textMuted,
    lineHeight: 20,
  },
  mono: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 13,
    color: colors.text,
  },

  jsonInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
    fontSize: 13,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    color: colors.text,
    backgroundColor: colors.surface,
    height: 140,
    textAlignVertical: 'top',
  },
  field: {
    gap: spacing.xs,
  },
  fieldLabel: {
    ...typography.caption,
    color: colors.text,
    fontWeight: '600',
  },
  textInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    fontSize: 15,
    color: colors.text,
    backgroundColor: colors.surface,
  },

  button: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  syncActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  syncButton: {
    flex: 1,
  },

  errorText: { fontSize: 13, color: '#d32f2f' },
  successText: { fontSize: 13, color: '#1a9e6e' },

  divider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    marginVertical: spacing.sm,
  },

  resultCard: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.xs,
  },
  resultTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1a9e6e',
    marginBottom: spacing.xs,
  },
  resultRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  resultLabel: { ...typography.body, color: colors.text },
  resultLabelMuted: { color: colors.textMuted },
  resultValue: { ...typography.body, fontWeight: '600', color: colors.text },
  resultValueMuted: { color: colors.textMuted },
});
