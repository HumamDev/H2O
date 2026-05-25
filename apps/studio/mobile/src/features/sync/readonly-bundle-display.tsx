import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import type { MobileReadOnlyLibraryView } from "./latest-bundle-view-model";

export type ReadOnlyBundleDisplayProps = {
  view: MobileReadOnlyLibraryView;
};

export function ReadOnlyBundleDisplay({ view }: ReadOnlyBundleDisplayProps) {
  return (
    <View style={styles.root}>
      <View style={styles.headerCard}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>Read-only bundle</Text>
          <View style={styles.readOnlyBadge}>
            <Text style={styles.readOnlyBadgeText}>Read-only</Text>
          </View>
        </View>
        <Text style={styles.subtitle}>
          Desktop latest.json evidence is displayed without archive-store writes,
          sync actions, or edit controls.
        </Text>
      </View>

      <DiagnosticsBlock view={view} />

      <Section title="Library" empty={view.chats.length === 0} emptyLabel="No chats in this bundle.">
        {view.chats.map((chat, index) => (
          <View key={`readonly-chat-${index}`} style={styles.row}>
            <View style={styles.rowBody}>
              <Text style={styles.rowTitle} numberOfLines={1}>
                {chat.titlePreview || "Untitled chat"}
              </Text>
              <Text style={styles.rowMeta}>
                {formatCount(chat.snapshotCount, "snapshot")} · {formatCount(chat.folderCount, "folder")}
              </Text>
            </View>
            <StaticPill label="View only" />
          </View>
        ))}
      </Section>

      <Section title="Folders" empty={view.folders.length === 0} emptyLabel="No folders in this bundle.">
        {view.folders.map((folder, index) => (
          <View key={`readonly-folder-${index}`} style={styles.row}>
            <View style={styles.folderGlyph} />
            <View style={styles.rowBody}>
              <Text style={styles.rowTitle} numberOfLines={1}>
                {folder.namePreview || "Untitled folder"}
              </Text>
              <Text style={styles.rowMeta}>
                {formatCount(folder.itemCount, "item")} · {folder.colorPresent ? "color present" : "default color"}
              </Text>
            </View>
            <StaticPill label="Locked" />
          </View>
        ))}
      </Section>

      <Section
        title="Warnings"
        empty={view.warnings.length === 0}
        emptyLabel="No bundle view warnings."
      >
        {view.warnings.map((warning) => (
          <View key={warning.code} style={styles.warningRow}>
            <Text style={styles.warningCode}>{warning.code}</Text>
          </View>
        ))}
      </Section>
    </View>
  );
}

function DiagnosticsBlock({ view }: { view: MobileReadOnlyLibraryView }) {
  const diagnostics = [
    ["source schema", view.diagnostics.sourceSchemaPresent ? "present" : "missing"],
    ["exported at", view.diagnostics.exportedAtPresent ? "present" : "missing"],
    ["source peer", view.diagnostics.sourcePeerPresent ? "present" : "missing"],
    ["checksum verified", view.diagnostics.checksumVerified ? "yes" : "no"],
  ] as const;

  return (
    <View style={styles.diagnosticsCard}>
      <Text style={styles.sectionTitle}>Bundle diagnostics</Text>
      <View style={styles.diagnosticsGrid}>
        {diagnostics.map(([label, value]) => (
          <View key={label} style={styles.diagnosticItem}>
            <Text style={styles.diagnosticLabel}>{label}</Text>
            <Text style={[styles.diagnosticValue, isPositiveDiagnosticValue(value) ? styles.diagnosticYes : styles.diagnosticNo]}>
              {value}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function isPositiveDiagnosticValue(value: string): boolean {
  return value === "present" || value === "yes";
}

function Section({
  title,
  empty,
  emptyLabel,
  children,
}: {
  title: string;
  empty: boolean;
  emptyLabel: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {empty ? <Text style={styles.emptyText}>{emptyLabel}</Text> : children}
    </View>
  );
}

function StaticPill({ label }: { label: string }) {
  return (
    <View style={styles.staticPill}>
      <Text style={styles.staticPillText}>{label}</Text>
    </View>
  );
}

function formatCount(count: number, label: string): string {
  return `${count} ${label}${count === 1 ? "" : "s"}`;
}

const styles = StyleSheet.create({
  root: {
    gap: 18,
    padding: 16,
  },
  headerCard: {
    gap: 8,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#C8D3E2",
    backgroundColor: "#F5F8FC",
    padding: 16,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  title: {
    flex: 1,
    color: "#132238",
    fontSize: 20,
    fontWeight: "700",
  },
  subtitle: {
    color: "#4C5F77",
    fontSize: 13,
    lineHeight: 19,
  },
  readOnlyBadge: {
    borderRadius: 999,
    backgroundColor: "#DBEAFE",
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  readOnlyBadgeText: {
    color: "#1D4ED8",
    fontSize: 12,
    fontWeight: "700",
  },
  diagnosticsCard: {
    gap: 12,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#DFE7F1",
    padding: 14,
  },
  diagnosticsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  diagnosticItem: {
    minWidth: 130,
    flexGrow: 1,
    borderRadius: 12,
    backgroundColor: "#F8FAFC",
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  diagnosticLabel: {
    color: "#64748B",
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
  },
  diagnosticValue: {
    marginTop: 3,
    fontSize: 14,
    fontWeight: "700",
  },
  diagnosticYes: {
    color: "#166534",
  },
  diagnosticNo: {
    color: "#991B1B",
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
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  rowBody: {
    flex: 1,
    gap: 3,
  },
  rowTitle: {
    color: "#172033",
    fontSize: 15,
    fontWeight: "700",
  },
  rowMeta: {
    color: "#64748B",
    fontSize: 12,
    lineHeight: 17,
  },
  folderGlyph: {
    width: 26,
    height: 20,
    borderRadius: 6,
    backgroundColor: "#CBD5E1",
  },
  staticPill: {
    borderRadius: 999,
    backgroundColor: "#F1F5F9",
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  staticPillText: {
    color: "#475569",
    fontSize: 11,
    fontWeight: "700",
  },
  warningRow: {
    borderRadius: 12,
    backgroundColor: "#FEF3C7",
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  warningCode: {
    color: "#92400E",
    fontSize: 12,
    fontWeight: "700",
  },
  emptyText: {
    color: "#64748B",
    fontSize: 13,
    fontStyle: "italic",
    lineHeight: 19,
  },
});
