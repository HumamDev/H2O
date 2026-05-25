import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import type { MobileReadOnlyBundleCacheMetadata } from "./readonly-bundle-cache";

export type ReadOnlyBundleCacheStatusValue =
  | "idle"
  | "loaded"
  | "missing"
  | "malformed"
  | "cleared";

export type ReadOnlyBundleCacheStatusProps = {
  metadata: MobileReadOnlyBundleCacheMetadata | null;
  status: ReadOnlyBundleCacheStatusValue;
  warnings: Array<{ code: string }>;
  onSaveMetadata?: () => void;
  onClearCache?: () => void;
  canSaveMetadata?: boolean;
};

export function ReadOnlyBundleCacheStatus({
  metadata,
  status,
  warnings,
  onSaveMetadata,
  onClearCache,
  canSaveMetadata = false,
}: ReadOnlyBundleCacheStatusProps) {
  const canClear = Boolean(onClearCache && (metadata || status === "malformed"));

  return (
    <View style={styles.root}>
      <View style={styles.headerRow}>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>Metadata cache only</Text>
          <Text style={styles.title}>Read-only cache status</Text>
          <Text style={styles.subtitle}>
            Only counts/status are cached. Bundle content is not cached.
          </Text>
        </View>
        <View style={styles.modeBadge}>
          <Text style={styles.modeBadgeText}>Non-authoritative</Text>
        </View>
      </View>

      <View style={styles.chipRow}>
        <StatusChip label={`cache-${status}`} />
        <StatusChip label="read-only" />
        <StatusChip label="no-bundle-content" />
        <StatusChip label="no-write-back" />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Cached source</Text>
        <View style={styles.grid}>
          <Metric label="cached at" value={metadata?.cachedAt ?? "none"} />
          <Metric label="source kind" value={metadata?.sourceKind ?? "none"} />
          <Metric label="schema" value={metadata?.sourceSchemaPresent ? "present" : "missing"} />
          <Metric label="exported at" value={metadata?.exportedAtPresent ? "present" : "missing"} />
          <Metric label="source peer" value={metadata?.sourcePeerPresent ? "present" : "missing"} />
          <Metric label="checksum" value={metadata?.checksumPresent ? "present" : "missing"} />
          <Metric label="checksum verified" value={metadata?.checksumVerified ? "yes" : "no"} />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Cached counts</Text>
        <View style={styles.grid}>
          <Metric label="chats" value={String(metadata?.counts.chats ?? 0)} />
          <Metric label="snapshots" value={String(metadata?.counts.snapshots ?? 0)} />
          <Metric label="folders" value={String(metadata?.counts.folders ?? 0)} />
          <Metric label="folder memberships" value={String(metadata?.counts.folderMemberships ?? 0)} />
          <Metric label="labels" value={String(metadata?.counts.labels ?? 0)} />
          <Metric label="categories" value={String(metadata?.counts.categories ?? 0)} />
          <Metric label="tombstones" value={String(metadata?.counts.tombstones ?? 0)} />
          <Metric label="conflicts" value={String(metadata?.counts.conflicts ?? 0)} />
          <Metric label="apply events" value={String(metadata?.counts.applyEvents ?? 0)} />
        </View>
      </View>

      <CodeList
        title="Cache warning codes"
        codes={[...warnings, ...(metadata?.warnings ?? [])].map((warning) => warning.code)}
      />

      <Text style={styles.reminder}>
        Paste a bundle again to view library and snapshots. Cached metadata cannot restore bundle content.
      </Text>

      <View style={styles.actionRow}>
        {onSaveMetadata ? (
          <TouchableOpacity
            style={[styles.actionButton, !canSaveMetadata && styles.actionButtonDisabled]}
            activeOpacity={0.82}
            disabled={!canSaveMetadata}
            onPress={onSaveMetadata}
          >
            <Text style={styles.actionButtonText}>Save metadata cache</Text>
          </TouchableOpacity>
        ) : null}
        {onClearCache ? (
          <TouchableOpacity
            style={[styles.clearButton, !canClear && styles.actionButtonDisabled]}
            activeOpacity={0.82}
            disabled={!canClear}
            onPress={onClearCache}
          >
            <Text style={styles.clearButtonText}>Clear read-only cache</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

function StatusChip({ label }: { label: string }) {
  return (
    <View style={styles.chip}>
      <Text style={styles.chipText}>{label}</Text>
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

function CodeList({ title, codes }: { title: string; codes: string[] }) {
  const uniqueCodes = Array.from(new Set(codes));

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {uniqueCodes.length === 0 ? (
        <Text style={styles.codeEmpty}>No cache warning codes.</Text>
      ) : (
        uniqueCodes.map((code, index) => (
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
    backgroundColor: "#E0F2FE",
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  modeBadgeText: {
    color: "#075985",
    fontSize: 12,
    fontWeight: "800",
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    borderRadius: 999,
    backgroundColor: "#F1F5F9",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  chipText: {
    color: "#475569",
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
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  metric: {
    minWidth: 130,
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
  reminder: {
    color: "#64748B",
    fontSize: 13,
    lineHeight: 19,
  },
  actionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  actionButton: {
    borderRadius: 12,
    backgroundColor: "#2563EB",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  actionButtonDisabled: {
    opacity: 0.45,
  },
  actionButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800",
  },
  clearButton: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#CBD5E1",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  clearButtonText: {
    color: "#475569",
    fontSize: 13,
    fontWeight: "800",
  },
});
