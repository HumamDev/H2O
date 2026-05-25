// TODO: Sync feature — background sync to remote, conflict resolution, delta updates
// TODO: sync later — not needed for local-only v1
export {
  diagnoseMobileSyncBundle,
  readMobileSyncBundle,
  validateMobileSyncBundle,
} from "./latest-bundle-reader";
export { buildMobileReadOnlyBundleView } from "./latest-bundle-view-model";
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
  MobileReadOnlyLibraryView,
  MobileReadOnlyViewWarning,
} from "./latest-bundle-view-model";
