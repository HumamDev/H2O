import { StyleSheet, Text, View } from "react-native";

import type {
  MobileReadOnlySyncApplyEventsSection,
  MobileReadOnlySyncEvidenceSection,
  MobileReadOnlySyncEvidenceView,
} from "./latest-bundle-sync-evidence-view-model";

export type ReadOnlySyncEvidenceStatusProps = {
  evidence: MobileReadOnlySyncEvidenceView;
};

export function ReadOnlySyncEvidenceStatus({ evidence }: ReadOnlySyncEvidenceStatusProps) {
  return (
    <View style={styles.root}>
      <View style={styles.headerCard}>
        <View style={styles.headerRow}>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>Read-only sync evidence</Text>
            <Text style={styles.title}>Sync evidence status</Text>
            <Text style={styles.subtitle}>
              Display only — no decisions, deletes, restores, or apply actions.
            </Text>
          </View>
          <View style={styles.readOnlyBadge}>
            <Text style={styles.readOnlyBadgeText}>Read-only</Text>
          </View>
        </View>
      </View>

      <EvidenceSection title="Tombstone evidence" section={evidence.tombstones} />
      <EvidenceSection
        title="Conflict evidence"
        section={evidence.conflicts}
        unavailableLabel="Unavailable in this bundle"
      />
      <ApplyEventSection section={evidence.applyEvents} />

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Capabilities</Text>
        <View style={styles.chipRow}>
          <CapabilityChip label="read-only" />
          <CapabilityChip label="no-write-back" />
          <CapabilityChip label="no-decisions" />
          <CapabilityChip label="no-apply" />
        </View>
      </View>

      <CodeList title="View warnings" codes={evidence.warnings.map((warning) => warning.code)} />
    </View>
  );
}

function EvidenceSection({
  title,
  section,
  unavailableLabel = "Unavailable in this bundle",
}: {
  title: string;
  section: MobileReadOnlySyncEvidenceSection;
  unavailableLabel?: string;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <AvailabilityPill available={section.available} unavailableLabel={unavailableLabel} />
      </View>
      <View style={styles.metricGrid}>
        <Metric label="available" value={section.available ? "yes" : "no"} />
        <Metric label="total" value={String(section.total)} />
      </View>
      <CodeList title="Warnings" codes={section.warnings.map((warning) => warning.code)} />
    </View>
  );
}

function ApplyEventSection({ section }: { section: MobileReadOnlySyncApplyEventsSection }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Apply-event evidence</Text>
        <AvailabilityPill available={section.available} unavailableLabel="Unavailable in this bundle" />
      </View>
      <View style={styles.metricGrid}>
        <Metric label="available" value={section.available ? "yes" : "no"} />
        <Metric label="total" value={String(section.total)} />
        <Metric label="capped" value={section.capped === true ? "yes" : "no"} />
        <Metric label="skipped malformed" value={String(section.skippedMalformed ?? 0)} />
      </View>
      <CodeList title="Warnings" codes={section.warnings.map((warning) => warning.code)} />
    </View>
  );
}

function AvailabilityPill({ available, unavailableLabel }: { available: boolean; unavailableLabel: string }) {
  return (
    <View style={[styles.availabilityPill, available ? styles.availablePill : styles.unavailablePill]}>
      <Text style={[styles.availabilityText, available ? styles.availableText : styles.unavailableText]}>
        {available ? "Available" : unavailableLabel}
      </Text>
    </View>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

function CapabilityChip({ label }: { label: string }) {
  return (
    <View style={styles.capabilityChip}>
      <Text style={styles.capabilityChipText}>{label}</Text>
    </View>
  );
}

function CodeList({ title, codes }: { title: string; codes: string[] }) {
  return (
    <View style={styles.codeBlock}>
      <Text style={styles.codeTitle}>{title}</Text>
      {codes.length === 0 ? (
        <Text style={styles.codeEmpty}>No warning codes.</Text>
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
    padding: 16,
  },
  headerCard: {
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#C8D3E2",
    backgroundColor: "#F5F8FC",
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
  readOnlyBadge: {
    borderRadius: 999,
    backgroundColor: "#DBEAFE",
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  readOnlyBadgeText: {
    color: "#1D4ED8",
    fontSize: 12,
    fontWeight: "800",
  },
  section: {
    gap: 10,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#DFE7F1",
    backgroundColor: "#FFFFFF",
    padding: 14,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  sectionTitle: {
    flex: 1,
    color: "#475569",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  availabilityPill: {
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  availablePill: {
    backgroundColor: "#DCFCE7",
  },
  unavailablePill: {
    backgroundColor: "#F1F5F9",
  },
  availabilityText: {
    fontSize: 11,
    fontWeight: "800",
  },
  availableText: {
    color: "#166534",
  },
  unavailableText: {
    color: "#475569",
  },
  metricGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  metric: {
    minWidth: 124,
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
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  capabilityChip: {
    borderRadius: 999,
    backgroundColor: "#DCFCE7",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  capabilityChipText: {
    color: "#166534",
    fontSize: 12,
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
