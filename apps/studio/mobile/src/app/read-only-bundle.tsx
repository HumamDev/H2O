import * as Crypto from "expo-crypto";
import * as DocumentPicker from "expo-document-picker";
import { readAsStringAsync } from "expo-file-system/legacy";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  buildReadOnlyBundleCacheMetadata,
  buildMobileReadOnlySnapshotDetail,
  buildMobileReadOnlySyncEvidenceView,
  buildMobileReadOnlyBundleView,
  clearReadOnlyBundleCacheMetadata,
  diagnoseMobileSyncBundle,
  loadReadOnlyBundleCacheMetadata,
  readMobileSyncBundle,
  ReadOnlyBundleCacheStatus,
  ReadOnlyBundleDisplay,
  ReadOnlyBundleStatus,
  ReadOnlySnapshotReader,
  ReadOnlySyncEvidenceStatus,
  saveReadOnlyBundleCacheMetadata,
  type MobileBundleDiagnostic,
  type MobileReadOnlyBundleCacheMetadata,
  type MobileReadOnlyLibraryView,
  type ReadOnlyBundleCacheStatusValue,
} from "../features/sync";

type PreviewPhase = "idle" | "running" | "ready" | "blocked";
type PreviewSourceKind = "pasted-json" | "latest-json";

async function sha256Hex(text: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, text);
}

export default function ReadOnlyBundleRoute() {
  const [inputText, setInputText] = useState("");
  const [sourceKind, setSourceKind] = useState<PreviewSourceKind>("pasted-json");
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [phase, setPhase] = useState<PreviewPhase>("idle");
  const [diagnostic, setDiagnostic] = useState<MobileBundleDiagnostic | null>(null);
  const [bundle, setBundle] = useState<unknown | null>(null);
  const [view, setView] = useState<MobileReadOnlyLibraryView | null>(null);
  const [selectedSnapshotIndex, setSelectedSnapshotIndex] = useState<number | null>(null);
  const [cacheMetadata, setCacheMetadata] = useState<MobileReadOnlyBundleCacheMetadata | null>(null);
  const [cacheStatus, setCacheStatus] = useState<ReadOnlyBundleCacheStatusValue>("idle");
  const [cacheWarnings, setCacheWarnings] = useState<Array<{ code: string }>>([]);

  useEffect(() => {
    let mounted = true;

    async function loadMetadataCache() {
      const result = await loadReadOnlyBundleCacheMetadata();
      if (!mounted) {
        return;
      }
      setCacheWarnings(result.warnings);
      if (result.found && result.metadata) {
        setCacheMetadata(result.metadata);
        setCacheStatus("loaded");
        return;
      }
      setCacheMetadata(null);
      setCacheStatus(result.ok ? "missing" : "malformed");
    }

    loadMetadataCache();

    return () => {
      mounted = false;
    };
  }, []);

  function resetPreviewState() {
    setDiagnostic(null);
    setBundle(null);
    setView(null);
    setSelectedSnapshotIndex(null);
  }

  async function previewCurrentInput() {
    setSourceKind("pasted-json");
    setSelectedFileName(null);
    await previewBundleText(inputText, "pasted-json");
  }

  async function previewBundleText(text: string, previewSourceKind: PreviewSourceKind) {
    setPhase("running");
    resetPreviewState();

    const nextDiagnostic = await diagnoseMobileSyncBundle(
      { text, sourceKind: previewSourceKind },
      { verifyChecksum: true, sha256Hex },
    );
    setDiagnostic(nextDiagnostic);

    if (nextDiagnostic.blockers.length > 0) {
      setPhase("blocked");
      setBundle(null);
      setSelectedSnapshotIndex(null);
      return;
    }

    const read = readMobileSyncBundle({ text, sourceKind: previewSourceKind });
    if (read.ok === false) {
      setPhase("blocked");
      setBundle(null);
      setSelectedSnapshotIndex(null);
      return;
    }

    setBundle(read.bundle);
    setView(
      buildMobileReadOnlyBundleView(read.bundle, {
        checksumVerified: nextDiagnostic.source.checksumVerified,
      }),
    );
    setSelectedSnapshotIndex(null);
    setPhase("ready");
  }

  async function chooseFileToPreview() {
    const previousPhase = phase;
    setPhase("running");

    let result: DocumentPicker.DocumentPickerResult;
    try {
      result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: false,
        multiple: false,
        type: ["application/json", "text/json", "text/plain", "*/*"],
      });
    } catch {
      setPhase(previousPhase);
      return;
    }

    if (result.canceled) {
      setPhase(previousPhase);
      return;
    }

    const asset = result.assets[0];
    if (!asset) {
      resetPreviewState();
      setSelectedFileName(null);
      setPhase("blocked");
      return;
    }

    let text: string;
    try {
      text = await readAsStringAsync(asset.uri);
    } catch {
      resetPreviewState();
      setSelectedFileName(asset.name || null);
      setPhase("blocked");
      return;
    }

    setInputText("");
    setSourceKind("latest-json");
    setSelectedFileName(asset.name || "selected latest.json");
    await previewBundleText(text, "latest-json");
  }

  async function saveMetadataCache() {
    if (!diagnostic || diagnostic.blockers.length > 0) {
      return;
    }

    const metadata = buildReadOnlyBundleCacheMetadata({
      diagnostic,
      sourceKind,
    });
    const result = await saveReadOnlyBundleCacheMetadata(metadata);
    setCacheWarnings(result.warnings);
    if (result.ok) {
      setCacheMetadata(metadata);
      setCacheStatus("loaded");
    }
  }

  async function clearMetadataCache() {
    const result = await clearReadOnlyBundleCacheMetadata();
    setCacheWarnings(result.warnings);
    if (result.ok) {
      setCacheMetadata(null);
      setCacheStatus("cleared");
    }
  }

  const snapshotDetail =
    bundle && selectedSnapshotIndex !== null
      ? buildMobileReadOnlySnapshotDetail(bundle, { snapshotIndex: selectedSnapshotIndex })
      : null;
  const syncEvidence = bundle ? buildMobileReadOnlySyncEvidenceView(bundle) : null;
  const canSaveMetadata = Boolean(diagnostic && diagnostic.blockers.length === 0 && phase === "ready");

  return (
    <SafeAreaView style={styles.safe} edges={[]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.routeHeader}>
          <Text style={styles.routeEyebrow}>F9 read-only preview</Text>
          <Text style={styles.routeTitle}>Read-only bundle</Text>
          <Text style={styles.routeCopy}>
            Preview only — bundle content is not saved, imported, synced, or written back.
          </Text>
        </View>

        <View style={styles.inputCard}>
          <Text style={styles.sectionTitle}>Preview latest.json file</Text>
          <Text style={styles.helpText}>
            Choose a local Desktop latest.json file for read-only preview. Nothing is saved, imported,
            synced, or written back.
          </Text>
          {selectedFileName ? (
            <View style={styles.fileLoadedBox}>
              <Text style={styles.selectedFileText}>Selected file: {selectedFileName}</Text>
              <Text style={styles.fileLoadedText}>
                Raw file JSON is hidden after selection. The file is held only in memory for this
                read-only preview.
              </Text>
            </View>
          ) : (
            <Text style={styles.codeEmpty}>No file selected.</Text>
          )}
          <TouchableOpacity
            style={[styles.secondaryButton, phase === "running" && styles.previewButtonDisabled]}
            activeOpacity={0.8}
            disabled={phase === "running"}
            onPress={chooseFileToPreview}
          >
            {phase === "running" ? (
              <ActivityIndicator color="#1D4ED8" />
            ) : (
              <Text style={styles.secondaryButtonText}>Choose file to preview</Text>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.inputCard}>
          <Text style={styles.sectionTitle}>Paste latest.json</Text>
          <Text style={styles.helpText}>
            {selectedFileName
              ? "Paste bundle JSON here to switch to pasted preview. File preview JSON stays hidden by default."
              : "Paste a Desktop latest.json bundle to validate it in memory and render a read-only preview."}
          </Text>
          <TextInput
            style={styles.input}
            value={inputText}
            onChangeText={(text) => {
              setInputText(text);
              setSourceKind("pasted-json");
              setSelectedFileName(null);
              if (phase !== "idle") {
                setPhase("idle");
                resetPreviewState();
              }
            }}
            placeholder={'{ "schema": "h2o.studio.fullBundle.v2", ... }'}
            placeholderTextColor="#7A8CA5"
            multiline
            autoCapitalize="none"
            autoCorrect={false}
            scrollEnabled
            textAlignVertical="top"
          />
          <TouchableOpacity
            style={[styles.previewButton, phase === "running" && styles.previewButtonDisabled]}
            activeOpacity={0.8}
            disabled={phase === "running"}
            onPress={previewCurrentInput}
          >
            {phase === "running" ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.previewButtonText}>Preview bundle</Text>
            )}
          </TouchableOpacity>
        </View>

        <DiagnosticSummary
          diagnostic={diagnostic}
          phase={phase}
          selectedFileName={selectedFileName}
          sourceKind={sourceKind}
        />
        <ReadOnlyBundleCacheStatus
          metadata={cacheMetadata}
          status={cacheStatus}
          warnings={cacheWarnings}
          canSaveMetadata={canSaveMetadata}
          onSaveMetadata={saveMetadataCache}
          onClearCache={clearMetadataCache}
        />
        <ReadOnlyBundleStatus diagnostic={diagnostic} view={view} />

        {snapshotDetail ? (
          <View style={styles.snapshotPreviewArea}>
            <TouchableOpacity
              style={styles.backButton}
              activeOpacity={0.8}
              onPress={() => setSelectedSnapshotIndex(null)}
            >
              <Text style={styles.backButtonText}>Back to read-only bundle</Text>
            </TouchableOpacity>
            <ReadOnlySnapshotReader detail={snapshotDetail} />
          </View>
        ) : view ? (
          <>
            {syncEvidence ? <ReadOnlySyncEvidenceStatus evidence={syncEvidence} /> : null}
            <ReadOnlyBundleDisplay view={view} />
            <SnapshotSelectionSection view={view} onSelectSnapshot={setSelectedSnapshotIndex} />
          </>
        ) : (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No bundle preview loaded</Text>
            <Text style={styles.emptyText}>
              Choose a latest.json file or paste bundle JSON to preview it. Preview only — nothing is
              saved, imported, synced, or written back.
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function SnapshotSelectionSection({
  view,
  onSelectSnapshot,
}: {
  view: MobileReadOnlyLibraryView;
  onSelectSnapshot: (snapshotIndex: number) => void;
}) {
  return (
    <View style={styles.snapshotListCard}>
      <Text style={styles.sectionTitle}>Snapshots</Text>
      <Text style={styles.helpText}>
        Select a snapshot for local read-only viewing. This stays in this preview and does not write back.
      </Text>
      {view.snapshots.length === 0 ? (
        <Text style={styles.codeEmpty}>No snapshot evidence is available in this bundle.</Text>
      ) : (
        view.snapshots.map((snapshot, index) => (
          <TouchableOpacity
            key={`readonly-snapshot-select-${index}`}
            style={styles.snapshotRow}
            activeOpacity={0.82}
            onPress={() => onSelectSnapshot(index)}
          >
            <View style={styles.snapshotRowCopy}>
              <Text style={styles.snapshotRowTitle}>Snapshot {index + 1}</Text>
              <Text style={styles.snapshotRowMeta}>
                chat id {snapshot.chatIdPresent ? "present" : "missing"} · created at{" "}
                {snapshot.createdAtPresent ? "present" : "missing"}
              </Text>
            </View>
            <Text style={styles.snapshotRowAction}>View snapshot</Text>
          </TouchableOpacity>
        ))
      )}
    </View>
  );
}

function DiagnosticSummary({
  diagnostic,
  phase,
  selectedFileName,
  sourceKind,
}: {
  diagnostic: MobileBundleDiagnostic | null;
  phase: PreviewPhase;
  selectedFileName: string | null;
  sourceKind: PreviewSourceKind;
}) {
  if (!diagnostic) {
    return null;
  }

  return (
    <View style={styles.summaryCard}>
      <View style={styles.summaryHeader}>
        <Text style={styles.sectionTitle}>Validation summary</Text>
        <Text style={[styles.phaseText, phase === "ready" ? styles.phaseReady : styles.phaseBlocked]}>
          {phase === "ready" ? "ready" : phase}
        </Text>
      </View>
      <View style={styles.summaryGrid}>
        <SummaryItem label="source" value={sourceKind === "latest-json" ? "file preview" : "pasted JSON"} />
        {sourceKind === "latest-json" && selectedFileName ? (
          <SummaryItem label="file" value={selectedFileName} />
        ) : null}
        <SummaryItem label="schema" value={diagnostic.source.schemaPresent ? "present" : "missing"} />
        <SummaryItem label="exported at" value={diagnostic.source.exportedAtPresent ? "present" : "missing"} />
        <SummaryItem label="source peer" value={diagnostic.source.sourcePeerPresent ? "present" : "missing"} />
        <SummaryItem label="checksum present" value={diagnostic.source.checksumPresent ? "yes" : "no"} />
        <SummaryItem label="checksum verified" value={diagnostic.source.checksumVerified ? "yes" : "no"} />
        <SummaryItem label="chats" value={String(diagnostic.counts.chats)} />
        <SummaryItem label="snapshots" value={String(diagnostic.counts.snapshots)} />
        <SummaryItem label="folders" value={String(diagnostic.counts.folders)} />
        <SummaryItem label="tombstones" value={String(diagnostic.counts.tombstones)} />
        <SummaryItem label="apply events" value={String(diagnostic.counts.applyEvents)} />
      </View>
      <CodeList title="Blockers" codes={diagnostic.blockers.map((blocker) => blocker.code)} emptyLabel="No blockers." />
      <CodeList title="Warnings" codes={diagnostic.warnings.map((warning) => warning.code)} emptyLabel="No warnings." />
    </View>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryItem}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );
}

function CodeList({
  title,
  codes,
  emptyLabel,
}: {
  title: string;
  codes: string[];
  emptyLabel: string;
}) {
  return (
    <View style={styles.codeBlock}>
      <Text style={styles.codeTitle}>{title}</Text>
      {codes.length === 0 ? (
        <Text style={styles.codeEmpty}>{emptyLabel}</Text>
      ) : (
        codes.map((code) => (
          <View key={code} style={styles.codePill}>
            <Text style={styles.codeText}>{code}</Text>
          </View>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#EEF4FB",
  },
  scroll: {
    flex: 1,
  },
  content: {
    gap: 16,
    paddingTop: 24,
    paddingBottom: 40,
  },
  routeHeader: {
    gap: 6,
    paddingHorizontal: 16,
    paddingBottom: 2,
  },
  routeEyebrow: {
    color: "#1D4ED8",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.7,
    textTransform: "uppercase",
  },
  routeTitle: {
    color: "#132238",
    fontSize: 26,
    fontWeight: "800",
  },
  routeCopy: {
    color: "#4C5F77",
    fontSize: 14,
    lineHeight: 20,
  },
  inputCard: {
    gap: 10,
    marginHorizontal: 16,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#D7E1EE",
    backgroundColor: "#FFFFFF",
    padding: 14,
  },
  sectionTitle: {
    color: "#475569",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  helpText: {
    color: "#64748B",
    fontSize: 13,
    lineHeight: 19,
  },
  selectedFileText: {
    borderRadius: 12,
    backgroundColor: "#EFF6FF",
    color: "#1E3A8A",
    fontSize: 13,
    fontWeight: "700",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  fileLoadedBox: {
    gap: 6,
  },
  fileLoadedText: {
    color: "#475569",
    fontSize: 12,
    lineHeight: 17,
  },
  input: {
    minHeight: 160,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#CBD5E1",
    backgroundColor: "#F8FAFC",
    color: "#132238",
    fontSize: 12,
    lineHeight: 18,
    padding: 12,
  },
  previewButton: {
    alignItems: "center",
    borderRadius: 14,
    backgroundColor: "#2563EB",
    paddingVertical: 12,
  },
  previewButtonDisabled: {
    opacity: 0.7,
  },
  previewButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
  },
  secondaryButton: {
    alignItems: "center",
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#93C5FD",
    backgroundColor: "#EFF6FF",
    paddingVertical: 12,
  },
  secondaryButtonText: {
    color: "#1D4ED8",
    fontSize: 15,
    fontWeight: "800",
  },
  summaryCard: {
    gap: 12,
    marginHorizontal: 16,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#D7E1EE",
    backgroundColor: "#FFFFFF",
    padding: 14,
  },
  summaryHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  phaseText: {
    borderRadius: 999,
    overflow: "hidden",
    paddingHorizontal: 9,
    paddingVertical: 4,
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  phaseReady: {
    backgroundColor: "#15803D",
  },
  phaseBlocked: {
    backgroundColor: "#B45309",
  },
  summaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  summaryItem: {
    minWidth: 130,
    flexGrow: 1,
    borderRadius: 12,
    backgroundColor: "#F8FAFC",
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  summaryLabel: {
    color: "#64748B",
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  summaryValue: {
    marginTop: 3,
    color: "#172033",
    fontSize: 14,
    fontWeight: "800",
  },
  codeBlock: {
    gap: 6,
  },
  codeTitle: {
    color: "#64748B",
    fontSize: 12,
    fontWeight: "800",
  },
  codePill: {
    alignSelf: "flex-start",
    borderRadius: 10,
    backgroundColor: "#F1F5F9",
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  codeText: {
    color: "#475569",
    fontSize: 12,
    fontWeight: "700",
  },
  codeEmpty: {
    color: "#64748B",
    fontSize: 13,
    fontStyle: "italic",
  },
  emptyCard: {
    gap: 6,
    marginHorizontal: 16,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#D7E1EE",
    backgroundColor: "#FFFFFF",
    padding: 16,
  },
  emptyTitle: {
    color: "#172033",
    fontSize: 16,
    fontWeight: "800",
  },
  emptyText: {
    color: "#64748B",
    fontSize: 13,
    lineHeight: 19,
  },
  snapshotListCard: {
    gap: 10,
    marginHorizontal: 16,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#D7E1EE",
    backgroundColor: "#FFFFFF",
    padding: 14,
  },
  snapshotRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E2E8F0",
    backgroundColor: "#F8FAFC",
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  snapshotRowCopy: {
    flex: 1,
    gap: 3,
  },
  snapshotRowTitle: {
    color: "#172033",
    fontSize: 14,
    fontWeight: "800",
  },
  snapshotRowMeta: {
    color: "#64748B",
    fontSize: 12,
    lineHeight: 17,
  },
  snapshotRowAction: {
    color: "#1D4ED8",
    fontSize: 12,
    fontWeight: "800",
  },
  snapshotPreviewArea: {
    gap: 12,
  },
  backButton: {
    alignSelf: "flex-start",
    marginHorizontal: 16,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#BFD0E5",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  backButtonText: {
    color: "#1D4ED8",
    fontSize: 13,
    fontWeight: "800",
  },
});
