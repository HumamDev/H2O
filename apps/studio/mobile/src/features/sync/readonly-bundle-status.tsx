import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import type { MobileBundleDiagnostic } from "./latest-bundle-reader";
import type { MobileReadOnlyLibraryView } from "./latest-bundle-view-model";

export type ReadOnlyBundleStatusProps = {
  diagnostic: MobileBundleDiagnostic | null;
  view: MobileReadOnlyLibraryView | null;
};

export function ReadOnlyBundleStatus({ diagnostic, view }: ReadOnlyBundleStatusProps) {
  const counts = readStatusCounts(diagnostic, view);
  const source = readSourceStatus(diagnostic, view);
  const blockers = diagnostic?.blockers.map((blocker) => blocker.code) ?? [];
  const warnings = [
    ...(diagnostic?.warnings.map((warning) => warning.code) ?? []),
    ...(view?.warnings.map((warning) => warning.code) ?? []),
  ];

  return (
    <View style={styles.root}>
      <View style={styles.headerRow}>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>Read-only status</Text>
          <Text style={styles.title}>Bundle diagnostics</Text>
          <Text style={styles.subtitle}>
            Preview only — bundle content is not saved, imported, synced, or written back.
          </Text>
        </View>
        <View style={styles.modeBadge}>
          <Text style={styles.modeBadgeText}>Read-only</Text>
        </View>
      </View>

      <StatusSection title="Mode">
        <View style={styles.chipRow}>
          <StatusChip label="read-only" tone="safe" />
          <StatusChip label="no-write-back" tone="safe" />
          <StatusChip label="no-webdav" tone="safe" />
          <StatusChip label="no-archive-store" tone="safe" />
        </View>
      </StatusSection>

      <StatusSection title="Bundle source">
        <View style={styles.grid}>
          <StatusMetric label="schema" value={source.schemaPresent ? "present" : "missing"} />
          <StatusMetric label="exported at" value={source.exportedAtPresent ? "present" : "missing"} />
          <StatusMetric label="source peer" value={source.sourcePeerPresent ? "present" : "missing"} />
          <StatusMetric label="checksum" value={source.checksumPresent ? "present" : "missing"} />
          <StatusMetric label="checksum verified" value={source.checksumVerified ? "yes" : "no"} />
        </View>
      </StatusSection>

      <StatusSection title="Content counts">
        <View style={styles.grid}>
          <StatusMetric label="chats" value={String(counts.chats)} />
          <StatusMetric label="snapshots" value={String(counts.snapshots)} />
          <StatusMetric label="folders" value={String(counts.folders)} />
          <StatusMetric label="folder memberships" value={String(counts.folderMemberships)} />
          <StatusMetric label="labels" value={String(counts.labels)} />
          <StatusMetric label="categories" value={String(counts.categories)} />
        </View>
      </StatusSection>

      <StatusSection title="Sync evidence">
        <View style={styles.grid}>
          <StatusMetric label="tombstones" value={String(counts.tombstones)} />
          <StatusMetric label="conflicts" value={String(counts.conflicts)} />
          <StatusMetric label="apply events" value={String(counts.applyEvents)} />
        </View>
      </StatusSection>

      <StatusSection title="Validation result">
        <CodeList title="Blockers" codes={blockers} emptyLabel="No blockers." />
        <CodeList title="Warnings" codes={warnings} emptyLabel="No warnings." />
      </StatusSection>
    </View>
  );
}

function readStatusCounts(
  diagnostic: MobileBundleDiagnostic | null,
  view: MobileReadOnlyLibraryView | null,
): MobileBundleDiagnostic["counts"] {
  if (diagnostic) {
    return diagnostic.counts;
  }
  return {
    chats: view?.chats.length ?? 0,
    snapshots: view?.snapshots.length ?? 0,
    folders: view?.folders.length ?? 0,
    folderMemberships: 0,
    labels: 0,
    categories: 0,
    conflicts: 0,
    tombstones: 0,
    applyEvents: 0,
  };
}

function readSourceStatus(
  diagnostic: MobileBundleDiagnostic | null,
  view: MobileReadOnlyLibraryView | null,
): {
  schemaPresent: boolean;
  exportedAtPresent: boolean;
  sourcePeerPresent: boolean;
  checksumPresent: boolean;
  checksumVerified: boolean;
} {
  return {
    schemaPresent: diagnostic?.source.schemaPresent ?? view?.diagnostics.sourceSchemaPresent ?? false,
    exportedAtPresent: diagnostic?.source.exportedAtPresent ?? view?.diagnostics.exportedAtPresent ?? false,
    sourcePeerPresent: diagnostic?.source.sourcePeerPresent ?? view?.diagnostics.sourcePeerPresent ?? false,
    checksumPresent: diagnostic?.source.checksumPresent ?? false,
    checksumVerified: diagnostic?.source.checksumVerified ?? view?.diagnostics.checksumVerified ?? false,
  };
}

function StatusSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function StatusMetric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

function StatusChip({ label, tone }: { label: string; tone: "safe" | "neutral" }) {
  return (
    <View style={[styles.chip, tone === "safe" ? styles.chipSafe : styles.chipNeutral]}>
      <Text style={[styles.chipText, tone === "safe" ? styles.chipTextSafe : styles.chipTextNeutral]}>
        {label}
      </Text>
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
        codes.map((code, index) => (
          <View key={`${code}-${index}`} style={styles.codePill}>
            <Text style={styles.codeText}>{code}</Text>
          </View>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: 14,
    marginHorizontal: 16,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#C8D3E2",
    backgroundColor: "#FFFFFF",
    padding: 16,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  headerCopy: {
    flex: 1,
    gap: 4,
  },
  eyebrow: {
    color: "#1D4ED8",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.7,
    textTransform: "uppercase",
  },
  title: {
    color: "#132238",
    fontSize: 20,
    fontWeight: "800",
  },
  subtitle: {
    color: "#4C5F77",
    fontSize: 13,
    lineHeight: 19,
  },
  modeBadge: {
    borderRadius: 999,
    backgroundColor: "#DCFCE7",
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  modeBadgeText: {
    color: "#166534",
    fontSize: 12,
    fontWeight: "800",
  },
  section: {
    gap: 8,
  },
  sectionTitle: {
    color: "#475569",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  chipSafe: {
    backgroundColor: "#DCFCE7",
  },
  chipNeutral: {
    backgroundColor: "#F1F5F9",
  },
  chipText: {
    fontSize: 12,
    fontWeight: "800",
  },
  chipTextSafe: {
    color: "#166534",
  },
  chipTextNeutral: {
    color: "#475569",
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  metric: {
    minWidth: 128,
    flexGrow: 1,
    borderRadius: 12,
    backgroundColor: "#F8FAFC",
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  metricLabel: {
    color: "#64748B",
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  metricValue: {
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
});
