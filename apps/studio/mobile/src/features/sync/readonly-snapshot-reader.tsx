import { StyleSheet, Text, View } from "react-native";

import type {
  MobileReadOnlySnapshotDetail,
  MobileReadOnlySnapshotMessage,
} from "./latest-bundle-view-model";

export type ReadOnlySnapshotReaderProps = {
  detail: MobileReadOnlySnapshotDetail;
};

export function ReadOnlySnapshotReader({ detail }: ReadOnlySnapshotReaderProps) {
  return (
    <View style={styles.root}>
      <View style={styles.headerCard}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>Read-only snapshot</Text>
          <View style={styles.readOnlyBadge}>
            <Text style={styles.readOnlyBadgeText}>Read-only</Text>
          </View>
        </View>
        <Text style={styles.subtitle}>
          Snapshot content is displayed without edit, save, delete, restore, or sync controls.
        </Text>
      </View>

      {!detail.snapshotFound ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>Snapshot not found</Text>
          <Text style={styles.emptyText}>
            The selected read-only snapshot evidence is missing from the current bundle.
          </Text>
        </View>
      ) : (
        <>
          <View style={styles.metaCard}>
            <Text style={styles.metaTitle} numberOfLines={2}>
              {detail.titlePreview || "Untitled snapshot"}
            </Text>
            <View style={styles.metaGrid}>
              <MetaItem label="created at" value={detail.createdAtPresent ? "present" : "missing"} />
              <MetaItem label="content kind" value={detail.contentKind} />
              <MetaItem label="messages" value={String(detail.messageCount)} />
              <MetaItem label="content" value={detail.contentPresent ? "present" : "missing"} />
            </View>
          </View>

          <View style={styles.messageSection}>
            <Text style={styles.sectionTitle}>Messages</Text>
            {detail.messages.length === 0 ? (
              <Text style={styles.emptyText}>No message turns are available for this snapshot.</Text>
            ) : (
              detail.messages.map((message, index) => (
                <MessageRow key={`readonly-snapshot-message-${index}`} message={message} />
              ))
            )}
          </View>
        </>
      )}

      <View style={styles.warningSection}>
        <Text style={styles.sectionTitle}>Warnings</Text>
        {detail.warnings.length === 0 ? (
          <Text style={styles.emptyText}>No snapshot warnings.</Text>
        ) : (
          detail.warnings.map((warning) => (
            <View key={warning.code} style={styles.warningPill}>
              <Text style={styles.warningText}>{warning.code}</Text>
            </View>
          ))
        )}
      </View>
    </View>
  );
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metaItem}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{value}</Text>
    </View>
  );
}

function MessageRow({ message }: { message: MobileReadOnlySnapshotMessage }) {
  return (
    <View style={styles.messageRow}>
      <View style={styles.messageHeader}>
        <Text style={[styles.rolePill, roleStyle(message.role)]}>{message.role}</Text>
        <Text style={styles.messageMeta}>
          {message.createdAtPresent ? "createdAt present" : "createdAt missing"}
        </Text>
      </View>
      <Text style={message.textPresent ? styles.messageText : styles.emptyMessageText}>
        {message.textPresent ? message.text : "Empty message text."}
      </Text>
    </View>
  );
}

function roleStyle(role: MobileReadOnlySnapshotMessage["role"]) {
  if (role === "user") {
    return styles.roleUser;
  }
  if (role === "assistant") {
    return styles.roleAssistant;
  }
  if (role === "system") {
    return styles.roleSystem;
  }
  return styles.roleUnknown;
}

const styles = StyleSheet.create({
  root: {
    gap: 16,
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
  emptyCard: {
    gap: 6,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#DFE7F1",
    backgroundColor: "#FFFFFF",
    padding: 14,
  },
  emptyTitle: {
    color: "#172033",
    fontSize: 16,
    fontWeight: "800",
  },
  emptyText: {
    color: "#64748B",
    fontSize: 13,
    fontStyle: "italic",
    lineHeight: 19,
  },
  metaCard: {
    gap: 12,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#DFE7F1",
    backgroundColor: "#FFFFFF",
    padding: 14,
  },
  metaTitle: {
    color: "#172033",
    fontSize: 17,
    fontWeight: "800",
    lineHeight: 23,
  },
  metaGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  metaItem: {
    minWidth: 126,
    flexGrow: 1,
    borderRadius: 12,
    backgroundColor: "#F8FAFC",
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  metaLabel: {
    color: "#64748B",
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  metaValue: {
    marginTop: 3,
    color: "#172033",
    fontSize: 14,
    fontWeight: "800",
  },
  messageSection: {
    gap: 10,
  },
  sectionTitle: {
    color: "#475569",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  messageRow: {
    gap: 9,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
    padding: 12,
  },
  messageHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  rolePill: {
    overflow: "hidden",
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4,
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  roleUser: {
    backgroundColor: "#DBEAFE",
    color: "#1D4ED8",
  },
  roleAssistant: {
    backgroundColor: "#DCFCE7",
    color: "#166534",
  },
  roleSystem: {
    backgroundColor: "#FEF3C7",
    color: "#92400E",
  },
  roleUnknown: {
    backgroundColor: "#F1F5F9",
    color: "#475569",
  },
  messageMeta: {
    flexShrink: 1,
    color: "#64748B",
    fontSize: 11,
    fontWeight: "600",
  },
  messageText: {
    color: "#172033",
    fontSize: 14,
    lineHeight: 21,
  },
  emptyMessageText: {
    color: "#64748B",
    fontSize: 13,
    fontStyle: "italic",
    lineHeight: 19,
  },
  warningSection: {
    gap: 8,
  },
  warningPill: {
    alignSelf: "flex-start",
    borderRadius: 10,
    backgroundColor: "#FEF3C7",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  warningText: {
    color: "#92400E",
    fontSize: 12,
    fontWeight: "700",
  },
});
