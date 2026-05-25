import * as Crypto from "expo-crypto";
import { useState } from "react";
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
  buildMobileReadOnlySnapshotDetail,
  buildMobileReadOnlyBundleView,
  diagnoseMobileSyncBundle,
  readMobileSyncBundle,
  ReadOnlyBundleDisplay,
  ReadOnlySnapshotReader,
  type MobileBundleDiagnostic,
  type MobileReadOnlyLibraryView,
} from "../features/sync";

type PreviewPhase = "idle" | "running" | "ready" | "blocked";

async function sha256Hex(text: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, text);
}

export default function ReadOnlyBundleRoute() {
  const [inputText, setInputText] = useState("");
  const [phase, setPhase] = useState<PreviewPhase>("idle");
  const [diagnostic, setDiagnostic] = useState<MobileBundleDiagnostic | null>(null);
  const [bundle, setBundle] = useState<unknown | null>(null);
  const [view, setView] = useState<MobileReadOnlyLibraryView | null>(null);
  const [selectedSnapshotIndex, setSelectedSnapshotIndex] = useState<number | null>(null);

  async function previewBundle() {
    setPhase("running");
    setDiagnostic(null);
    setBundle(null);
    setView(null);
    setSelectedSnapshotIndex(null);

    const nextDiagnostic = await diagnoseMobileSyncBundle(
      { text: inputText, sourceKind: "pasted-json" },
      { verifyChecksum: true, sha256Hex },
    );
    setDiagnostic(nextDiagnostic);

    if (nextDiagnostic.blockers.length > 0) {
      setPhase("blocked");
      setBundle(null);
      setSelectedSnapshotIndex(null);
      return;
    }

    const read = readMobileSyncBundle({ text: inputText, sourceKind: "pasted-json" });
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

  const snapshotDetail =
    bundle && selectedSnapshotIndex !== null
      ? buildMobileReadOnlySnapshotDetail(bundle, { snapshotIndex: selectedSnapshotIndex })
      : null;

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
            Preview only — nothing is saved, imported, synced, or written back.
          </Text>
        </View>

        <View style={styles.inputCard}>
          <Text style={styles.sectionTitle}>Paste latest.json</Text>
          <Text style={styles.helpText}>
            Paste a Desktop latest.json bundle to validate it in memory and render a read-only preview.
          </Text>
          <TextInput
            style={styles.input}
            value={inputText}
            onChangeText={(text) => {
              setInputText(text);
              if (phase !== "idle") {
                setPhase("idle");
                setDiagnostic(null);
                setBundle(null);
                setView(null);
                setSelectedSnapshotIndex(null);
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
            onPress={previewBundle}
          >
            {phase === "running" ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.previewButtonText}>Preview bundle</Text>
            )}
          </TouchableOpacity>
        </View>

        <DiagnosticSummary diagnostic={diagnostic} phase={phase} />

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
            <ReadOnlyBundleDisplay view={view} />
            <SnapshotSelectionSection view={view} onSelectSnapshot={setSelectedSnapshotIndex} />
          </>
        ) : (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No bundle preview loaded</Text>
            <Text style={styles.emptyText}>
              Paste a bundle and tap Preview bundle. This route does not save or import the data.
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
}: {
  diagnostic: MobileBundleDiagnostic | null;
  phase: PreviewPhase;
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
        <SummaryItem label="schema" value={diagnostic.source.schemaPresent ? "present" : "missing"} />
        <SummaryItem label="exported at" value={diagnostic.source.exportedAtPresent ? "present" : "missing"} />
        <SummaryItem label="source peer" value={diagnostic.source.sourcePeerPresent ? "present" : "missing"} />
        <SummaryItem
          label="checksum"
          value={diagnostic.source.checksumVerified ? "verified" : diagnostic.source.checksumPresent ? "present" : "missing"}
        />
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
