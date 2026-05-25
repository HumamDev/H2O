import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  ReadOnlyBundleDisplay,
  type MobileReadOnlyLibraryView,
} from "../features/sync";

const MOCK_READ_ONLY_VIEW: MobileReadOnlyLibraryView = {
  schema: "h2o.mobile.readonly-library-view.v1",
  readOnly: true,
  chats: [
    {
      idPresent: true,
      titlePreview: "Planning notes",
      snapshotCount: 2,
      folderCount: 1,
    },
    {
      idPresent: true,
      titlePreview: "Research follow-up",
      snapshotCount: 1,
      folderCount: 0,
    },
  ],
  folders: [
    {
      idPresent: true,
      namePreview: "Workstream",
      itemCount: 2,
      colorPresent: true,
    },
    {
      idPresent: true,
      namePreview: "Reference",
      itemCount: 0,
      colorPresent: false,
    },
  ],
  snapshots: [
    {
      idPresent: true,
      chatIdPresent: true,
      createdAtPresent: true,
    },
  ],
  diagnostics: {
    sourceSchemaPresent: true,
    checksumVerified: true,
    exportedAtPresent: true,
    sourcePeerPresent: true,
  },
  warnings: [{ code: "mock-read-only-route" }],
};

export default function ReadOnlyBundleRoute() {
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
            This screen is read-only. It does not edit, sync, or write back.
          </Text>
        </View>
        <ReadOnlyBundleDisplay view={MOCK_READ_ONLY_VIEW} />
      </ScrollView>
    </SafeAreaView>
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
    paddingTop: 24,
    paddingBottom: 40,
  },
  routeHeader: {
    gap: 6,
    paddingHorizontal: 16,
    paddingBottom: 8,
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
});
