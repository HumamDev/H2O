// TODO: Sync feature — background sync to remote, conflict resolution, delta updates
// TODO: sync later — not needed for local-only v1
export {
  buildReadOnlyBundleCacheMetadata,
  clearReadOnlyBundleCacheMetadata,
  loadReadOnlyBundleCacheMetadata,
  saveReadOnlyBundleCacheMetadata,
} from "./readonly-bundle-cache";
export {
  diagnoseMobileSyncBundle,
  readMobileSyncBundle,
  validateMobileSyncBundle,
} from "./latest-bundle-reader";
export {
  buildMobileReadOnlyBundleView,
  buildMobileReadOnlySnapshotDetail,
} from "./latest-bundle-view-model";
export { buildMobileReadOnlySyncEvidenceView } from "./latest-bundle-sync-evidence-view-model";
export { ReadOnlyBundleCacheStatus } from "./readonly-bundle-cache-status";
export { ReadOnlyBundleDisplay } from "./readonly-bundle-display";
export { ReadOnlyBundleStatus } from "./readonly-bundle-status";
export { ReadOnlySnapshotReader } from "./readonly-snapshot-reader";
export { ReadOnlySyncEvidenceStatus } from "./readonly-sync-evidence-status";
export type {
  MobileReadOnlyBundleCacheMetadata,
  MobileReadOnlyBundleCacheSourceKind,
  MobileReadOnlyBundleCacheWarning,
} from "./readonly-bundle-cache";
export type {
  ReadOnlyBundleCacheStatusProps,
  ReadOnlyBundleCacheStatusValue,
} from "./readonly-bundle-cache-status";
export type {
  DiagnoseMobileSyncBundleOptions,
  MobileBundleDiagnostic,
  MobileBundleDiagnosticCode,
  MobileBundleInput,
  MobileBundleSourceKind,
  MobileBundleTextSourceKind,
} from "./latest-bundle-reader";
export type {
  BuildMobileReadOnlyBundleViewOptions,
  BuildMobileReadOnlySnapshotDetailOptions,
  MobileReadOnlyLibraryView,
  MobileReadOnlySnapshotDetail,
  MobileReadOnlySnapshotMessage,
  MobileReadOnlyViewWarning,
} from "./latest-bundle-view-model";
export type {
  MobileReadOnlySyncApplyEventsSection,
  MobileReadOnlySyncEvidenceSection,
  MobileReadOnlySyncEvidenceView,
  MobileReadOnlySyncEvidenceWarning,
} from "./latest-bundle-sync-evidence-view-model";
export type { ReadOnlyBundleDisplayProps } from "./readonly-bundle-display";
export type { ReadOnlyBundleStatusProps } from "./readonly-bundle-status";
export type { ReadOnlySnapshotReaderProps } from "./readonly-snapshot-reader";
export type { ReadOnlySyncEvidenceStatusProps } from "./readonly-sync-evidence-status";
