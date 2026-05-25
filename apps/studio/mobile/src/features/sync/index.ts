// TODO: Sync feature — background sync to remote, conflict resolution, delta updates
// TODO: sync later — not needed for local-only v1
export {
  diagnoseMobileSyncBundle,
  readMobileSyncBundle,
  validateMobileSyncBundle,
} from "./latest-bundle-reader";
export {
  buildMobileReadOnlyBundleView,
  buildMobileReadOnlySnapshotDetail,
} from "./latest-bundle-view-model";
export { ReadOnlyBundleDisplay } from "./readonly-bundle-display";
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
export type { ReadOnlyBundleDisplayProps } from "./readonly-bundle-display";
