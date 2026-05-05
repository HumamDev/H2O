// Mobile Avatar Upload validator (Phase 5.0M-A).
//
// Asserts the dormant mobile profile-avatar-upload surface is wired correctly.
// Activation flips AVATAR_UPLOAD_VERIFIED from false → true in a separate
// gated commit after live-iPhone QA passes.
//
// What this validator enforces:
//   - 202605050001 migration adds profiles.avatar_path + format check, the
//     'avatars' public Storage bucket (2MB, image/jpeg), three owner-only
//     storage policies, an update_identity_avatar_path RPC, and an updated
//     load_identity_state that returns avatar_path.
//   - mobileConfig exports AVATAR_UPLOAD_VERIFIED as a boolean literal.
//   - identity-core contracts: H2OProfile has avatarPath; IdentityProvider
//     has setAvatarPath; IdentityChangeSource includes 'setAvatarPath'.
//   - mock-provider stubs setAvatarPath with avatar-not-supported.
//   - MobileSupabaseProvider implements setAvatarPath calling the RPC, and
//     parses avatar_path from the RPC response into H2OProfile.
//   - IdentityContext exposes setAvatarPath through IdentityContextValue.
//   - avatarUpload.ts exports the upload helper and public-URL builder, with
//     locked-in constants (resize 512, q 0.8, cap 2 MB), uses raw fetch
//     against Storage REST (NOT @supabase/supabase-js), and uses
//     expo-image-manipulator.
//   - useResolvedAvatar.ts exports the hook and ResolvedAvatar type.
//   - UserAvatar component exists, uses useResolvedAvatar, and is re-exported
//     from components/common/index.ts.
//   - account-identity.tsx wires Change/Remove controls behind
//     AVATAR_UPLOAD_VERIFIED, calls the picker permission gate, and calls
//     identity.setAvatarPath in both flows.
//   - Native Info.plist + app.json carry NSPhotoLibraryUsageDescription.
//   - Library-only — no NSCameraUsageDescription anywhere (we never ask for
//     camera permission in 5.0M).
//   - SDK boundary preserved: @supabase/supabase-js only imported in
//     MobileSupabaseProvider.ts (5.0B mobile-alignment regression check).
//   - expo-image-picker + expo-image-manipulator are pinned in package.json.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

function read(rel) {
  return fs.readFileSync(path.join(REPO_ROOT, rel), "utf8");
}

function readOptional(rel) {
  try {
    return fs.readFileSync(path.join(REPO_ROOT, rel), "utf8");
  } catch {
    return "";
  }
}

const failures = [];
function fail(msg) { failures.push(msg); }
function check(cond, msg) { if (!cond) fail(msg); }

const MIGRATION_REL = "supabase/migrations/202605050001_identity_profile_avatar_path.sql";
const MOBILE_CONFIG_REL = "apps/studio-mobile/src/identity/mobileConfig.ts";
const CONTRACTS_REL = "packages/identity-core/src/contracts.ts";
const MOCK_PROVIDER_REL = "packages/identity-core/src/mock-provider.ts";
const PROVIDER_REL = "apps/studio-mobile/src/identity/MobileSupabaseProvider.ts";
const CONTEXT_REL = "apps/studio-mobile/src/identity/IdentityContext.tsx";
const AVATAR_UPLOAD_REL = "apps/studio-mobile/src/identity/avatarUpload.ts";
const RESOLVED_AVATAR_REL = "apps/studio-mobile/src/identity/useResolvedAvatar.ts";
const USER_AVATAR_REL = "apps/studio-mobile/src/components/common/UserAvatar.tsx";
const COMMON_INDEX_REL = "apps/studio-mobile/src/components/common/index.ts";
const ACCOUNT_IDENTITY_REL = "apps/studio-mobile/src/app/account-identity.tsx";
const INFO_PLIST_REL = "apps/studio-mobile/ios/H2OStudio/Info.plist";
const APP_JSON_REL = "apps/studio-mobile/app.json";
const PACKAGE_JSON_REL = "apps/studio-mobile/package.json";

// ─── 1. Migration ─────────────────────────────────────────────────────────

const migration = readOptional(MIGRATION_REL);
if (!migration) {
  fail(`${MIGRATION_REL} must exist`);
} else {
  check(
    /alter\s+table\s+public\.profiles[\s\S]*add\s+column\s+if\s+not\s+exists\s+avatar_path\s+text/i.test(migration),
    "migration must add nullable text column public.profiles.avatar_path"
  );
  check(
    /profiles_avatar_path_format/.test(migration),
    "migration must add the profiles_avatar_path_format CHECK constraint"
  );
  check(
    /\^avatars\/\[0-9a-f\]\{8\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{12\}\/profile_\[0-9\]\+\\\.jpg\$/.test(migration),
    "avatar_path CHECK regex must enforce avatars/<uuid>/profile_<timestamp>.jpg"
  );
  check(
    /insert\s+into\s+storage\.buckets[\s\S]*'avatars'[\s\S]*true[\s\S]*2\s*\*\s*1024\s*\*\s*1024[\s\S]*image\/jpeg/i.test(migration),
    "migration must insert public 'avatars' Storage bucket with 2MB cap and image/jpeg only"
  );
  for (const op of ["insert", "update", "delete"]) {
    const policyName = `avatars_owner_${op}`;
    check(
      new RegExp(`create\\s+policy\\s+["']${policyName}["']`, "i").test(migration),
      `migration must create storage policy ${policyName}`
    );
  }
  check(
    /storage\.foldername\s*\(\s*name\s*\)\s*\)\s*\[\s*1\s*\]/i.test(migration),
    "owner-only policies must match auth.uid()::text against (storage.foldername(name))[1]"
  );
  check(
    /create\s+or\s+replace\s+function\s+public\.update_identity_avatar_path/i.test(migration),
    "migration must define public.update_identity_avatar_path RPC"
  );
  check(
    /security\s+definer/i.test(migration),
    "update_identity_avatar_path must be SECURITY DEFINER"
  );
  check(
    /grant\s+execute\s+on\s+function\s+public\.update_identity_avatar_path[\s\S]*to\s+authenticated/i.test(migration),
    "update_identity_avatar_path must be granted to authenticated"
  );
  check(
    /revoke\s+all\s+on\s+function\s+public\.update_identity_avatar_path[\s\S]*from\s+anon\s*,\s*public/i.test(migration),
    "update_identity_avatar_path execute must be revoked from anon, public"
  );
  check(
    /create\s+or\s+replace\s+function\s+public\.load_identity_state/i.test(migration),
    "migration must update load_identity_state to surface avatar_path"
  );
  check(
    /'avatar_path'\s*,\s*v_profile\.avatar_path/.test(migration),
    "load_identity_state must include 'avatar_path' in the profile JSON object"
  );
}

// ─── 2. Mobile config flag ────────────────────────────────────────────────

const mobileConfig = readOptional(MOBILE_CONFIG_REL);
const flagMatch = mobileConfig.match(/export\s+const\s+AVATAR_UPLOAD_VERIFIED\s*=\s*(true|false)\s*;/);
check(
  flagMatch,
  "mobileConfig.ts must export AVATAR_UPLOAD_VERIFIED as a boolean literal"
);

// ─── 3. identity-core contracts ───────────────────────────────────────────

const contracts = readOptional(CONTRACTS_REL);
check(
  /avatarPath\?\s*:\s*string\s*\|\s*null/.test(contracts),
  "H2OProfile must declare optional avatarPath?: string | null"
);
check(
  /setAvatarPath\s*\(\s*path\s*:\s*string\s*\|\s*null\s*\)\s*:\s*Promise<IdentitySnapshot>/.test(contracts),
  "IdentityProvider must declare setAvatarPath(path: string | null): Promise<IdentitySnapshot>"
);
check(
  /\|\s*['"]setAvatarPath['"]/.test(contracts),
  "IdentityChangeSource union must include 'setAvatarPath'"
);

// ─── 4. mock-provider stub ────────────────────────────────────────────────

const mockProvider = readOptional(MOCK_PROVIDER_REL);
check(
  /async\s+setAvatarPath\s*\(/.test(mockProvider),
  "mock-provider.ts must implement async setAvatarPath()"
);
check(
  /identity\/avatar-not-supported/.test(mockProvider),
  "mock-provider setAvatarPath stub must surface identity/avatar-not-supported"
);

// ─── 5. MobileSupabaseProvider wires the RPC ──────────────────────────────

const provider = readOptional(PROVIDER_REL);
check(
  /async\s+setAvatarPath\s*\(\s*path\s*:\s*string\s*\|\s*null\s*\)/.test(provider),
  "MobileSupabaseProvider must implement async setAvatarPath(path: string | null)"
);
check(
  /['"]update_identity_avatar_path['"]/.test(provider),
  "MobileSupabaseProvider must call the update_identity_avatar_path RPC"
);
check(
  /p_avatar_path\s*:/.test(provider),
  "MobileSupabaseProvider must pass p_avatar_path as the RPC parameter"
);
check(
  /this\.stringField\s*\(\s*profile\s*,\s*['"]avatarPath['"]\s*,\s*['"]avatar_path['"]\s*\)/.test(provider),
  "MobileSupabaseProvider must parse avatar_path from the RPC response into H2OProfile.avatarPath"
);
check(
  /failSoft\s*\(\s*error\s*,\s*['"]identity\/set-avatar-path-failed['"]\s*\)/.test(provider),
  "MobileSupabaseProvider setAvatarPath must use failSoft (identity/set-avatar-path-failed) so a failed update preserves signed-in status"
);

// ─── 6. IdentityContext exposes setAvatarPath ─────────────────────────────

const context = readOptional(CONTEXT_REL);
check(
  /setAvatarPath\s*\(\s*path\s*:\s*string\s*\|\s*null\s*\)\s*:\s*Promise<IdentitySnapshot>/.test(context),
  "IdentityContextValue must declare setAvatarPath(path: string | null): Promise<IdentitySnapshot>"
);
check(
  /identityProvider\.setAvatarPath\s*\(/.test(context),
  "IdentityContext must call identityProvider.setAvatarPath via runAction"
);

// ─── 7. avatarUpload helper ───────────────────────────────────────────────

const avatarUpload = readOptional(AVATAR_UPLOAD_REL);
check(
  /export\s+async\s+function\s+uploadAvatarFromLocalUri\s*\(/.test(avatarUpload),
  "avatarUpload.ts must export async uploadAvatarFromLocalUri()"
);
check(
  /export\s+function\s+buildAvatarPublicUrl\s*\(/.test(avatarUpload),
  "avatarUpload.ts must export buildAvatarPublicUrl() for the public Storage URL"
);
check(
  /export\s+const\s+AVATAR_RESIZE_PX\s*=\s*512\b/.test(avatarUpload),
  "avatarUpload.ts must lock AVATAR_RESIZE_PX = 512"
);
check(
  /export\s+const\s+AVATAR_JPEG_QUALITY\s*=\s*0\.8\b/.test(avatarUpload),
  "avatarUpload.ts must lock AVATAR_JPEG_QUALITY = 0.8"
);
check(
  /export\s+const\s+AVATAR_MAX_BYTES\s*=\s*2\s*\*\s*1024\s*\*\s*1024/.test(avatarUpload),
  "avatarUpload.ts must lock AVATAR_MAX_BYTES = 2 * 1024 * 1024 (2 MB)"
);
check(
  /from\s+['"]expo-image-manipulator['"]/.test(avatarUpload),
  "avatarUpload.ts must import expo-image-manipulator"
);
check(
  /\/storage\/v1\/object\//.test(avatarUpload),
  "avatarUpload.ts must use the Supabase Storage REST endpoint /storage/v1/object/"
);
check(
  !/from\s+['"]@supabase\/supabase-js['"]/.test(avatarUpload),
  "avatarUpload.ts must NOT import @supabase/supabase-js (5.0B SDK boundary — only MobileSupabaseProvider may)"
);
check(
  /class\s+AvatarUploadError/.test(avatarUpload),
  "avatarUpload.ts must export the AvatarUploadError class for typed error codes"
);
check(
  /export\s+async\s+function\s+deleteAvatarObject\s*\(/.test(avatarUpload),
  "avatarUpload.ts must export async deleteAvatarObject() helper for best-effort orphan cleanup"
);
check(
  /['"]max-age=3600['"]/.test(avatarUpload) && !/Cache-Control['"]\s*:\s*['"]3600['"]/.test(avatarUpload),
  "avatarUpload.ts Cache-Control header must use 'max-age=3600' (the bare-number form is non-standard and ignored by most CDNs)"
);
check(
  /\.toLowerCase\s*\(\s*\)/.test(avatarUpload),
  "avatarUpload.ts must lowercase the userId when building the avatar path (matches storage policy + table CHECK regex which require lowercase hex UUID)"
);

// ─── 8. useResolvedAvatar hook ────────────────────────────────────────────

const resolved = readOptional(RESOLVED_AVATAR_REL);
check(
  /export\s+function\s+useResolvedAvatar\s*\(/.test(resolved),
  "useResolvedAvatar.ts must export the hook"
);
check(
  /export\s+type\s+ResolvedAvatar\s*=/.test(resolved),
  "useResolvedAvatar.ts must export ResolvedAvatar discriminated union"
);
check(
  /buildAvatarPublicUrl/.test(resolved),
  "useResolvedAvatar.ts must use buildAvatarPublicUrl for path → URL resolution"
);

// ─── 9. UserAvatar component ──────────────────────────────────────────────

const userAvatar = readOptional(USER_AVATAR_REL);
check(
  /export\s+function\s+UserAvatar\s*\(/.test(userAvatar),
  "UserAvatar.tsx must export the UserAvatar component"
);
check(
  /useResolvedAvatar/.test(userAvatar),
  "UserAvatar must consume useResolvedAvatar"
);
check(
  /Image\s+source=/.test(userAvatar) || /Image\s*\n\s*source=/.test(userAvatar),
  "UserAvatar must render an Image when an image URI is resolved"
);
check(
  /onError=/.test(userAvatar),
  "UserAvatar must handle Image onError to fall back to colored initials"
);

const commonIndex = readOptional(COMMON_INDEX_REL);
check(
  /UserAvatar/.test(commonIndex),
  "components/common/index.ts must re-export UserAvatar"
);

// ─── 10. account-identity wiring ──────────────────────────────────────────

const account = readOptional(ACCOUNT_IDENTITY_REL);
check(
  /import\s+\{[^}]*UserAvatar[^}]*\}\s+from\s+['"]@\/components\/common['"]/.test(account),
  "account-identity.tsx must import UserAvatar from @/components/common"
);
check(
  /import\s+\{[^}]*uploadAvatarFromLocalUri[^}]*\}\s+from\s+['"]@\/identity\/avatarUpload['"]/.test(account),
  "account-identity.tsx must import uploadAvatarFromLocalUri"
);
check(
  /import\s+\{[^}]*AVATAR_UPLOAD_VERIFIED[^}]*\}\s+from\s+['"]@\/identity\/mobileConfig['"]/.test(account),
  "account-identity.tsx must import AVATAR_UPLOAD_VERIFIED from mobileConfig"
);
check(
  /import\s+\*\s+as\s+ImagePicker\s+from\s+['"]expo-image-picker['"]/.test(account),
  "account-identity.tsx must import expo-image-picker for the library picker"
);
check(
  /<UserAvatar\b/.test(account),
  "account-identity.tsx must render <UserAvatar />"
);
check(
  /AVATAR_UPLOAD_VERIFIED\s*\?/.test(account),
  "Change/Remove controls in account-identity.tsx must be gated by AVATAR_UPLOAD_VERIFIED"
);
check(
  /requestMediaLibraryPermissionsAsync\s*\(\s*\)/.test(account),
  "account-identity.tsx must call ImagePicker.requestMediaLibraryPermissionsAsync as a permission gate"
);
check(
  /launchImageLibraryAsync\s*\(/.test(account),
  "account-identity.tsx must call ImagePicker.launchImageLibraryAsync (library only, no camera)"
);
check(
  !/MediaTypeOptions\.Images/.test(account),
  "account-identity.tsx must NOT use deprecated ImagePicker.MediaTypeOptions.Images — use mediaTypes: ['images'] (MediaType[]) for SDK 55"
);
check(
  /mediaTypes\s*:\s*\[\s*['"]images['"]\s*\]/.test(account),
  "account-identity.tsx picker call must pass mediaTypes: ['images'] (the SDK 55 MediaType[] form)"
);
check(
  /identity\.setAvatarPath\s*\(/.test(account),
  "account-identity.tsx must call identity.setAvatarPath after a successful upload (and on remove)"
);
check(
  /import\s+\{[^}]*deleteAvatarObject[^}]*\}\s+from\s+['"]@\/identity\/avatarUpload['"]/.test(account),
  "account-identity.tsx must import deleteAvatarObject (used by handleRemoveAvatar to best-effort clean the orphan Storage object)"
);
check(
  /handleRemoveAvatar[\s\S]*deleteAvatarObject\s*\(/.test(account),
  "handleRemoveAvatar must invoke deleteAvatarObject after a successful identity.setAvatarPath(null) so the prior file does not orphan in Storage"
);
check(
  /avatar\/permission-denied/.test(account),
  "account-identity.tsx friendly error map must include avatar/permission-denied copy"
);
check(
  /avatar\/upload-failed/.test(account),
  "account-identity.tsx friendly error map must include avatar/upload-failed copy"
);

// ─── 11. Native + app.json permission strings ─────────────────────────────

const infoPlist = readOptional(INFO_PLIST_REL);
check(
  /<key>NSPhotoLibraryUsageDescription<\/key>/.test(infoPlist),
  "ios/H2OStudio/Info.plist must include NSPhotoLibraryUsageDescription"
);
check(
  !/<key>NSCameraUsageDescription<\/key>/.test(infoPlist),
  "ios/H2OStudio/Info.plist must NOT include NSCameraUsageDescription (5.0M is library-only; do not request camera)"
);

const appJson = readOptional(APP_JSON_REL);
check(
  /"NSPhotoLibraryUsageDescription"\s*:/.test(appJson),
  "app.json ios.infoPlist must mirror NSPhotoLibraryUsageDescription"
);
check(
  !/"NSCameraUsageDescription"\s*:/.test(appJson),
  "app.json must NOT declare NSCameraUsageDescription (library-only)"
);

// ─── 12. SDK boundary regression — avatarUpload must not pull the SDK ─────

const SDK_RE = /from\s+['"]@supabase\/supabase-js['"]/;
const filesThatMustNotImportSDK = [
  AVATAR_UPLOAD_REL,
  RESOLVED_AVATAR_REL,
  USER_AVATAR_REL,
];
for (const rel of filesThatMustNotImportSDK) {
  check(
    !SDK_RE.test(readOptional(rel)),
    `${rel} must NOT import @supabase/supabase-js (5.0B SDK boundary regression)`
  );
}

// ─── 13. package.json deps ────────────────────────────────────────────────

const packageJson = readOptional(PACKAGE_JSON_REL);
check(
  /"expo-image-picker"\s*:/.test(packageJson),
  "studio-mobile/package.json must declare expo-image-picker"
);
check(
  /"expo-image-manipulator"\s*:/.test(packageJson),
  "studio-mobile/package.json must declare expo-image-manipulator"
);

// ─── Final report ─────────────────────────────────────────────────────────

if (failures.length > 0) {
  console.error(`FAIL: Mobile avatar-upload validator — ${failures.length} check(s) failed:`);
  for (const msg of failures) console.error(`  • ${msg}`);
  process.exit(1);
}
console.log("PASS: Mobile avatar-upload validator");
