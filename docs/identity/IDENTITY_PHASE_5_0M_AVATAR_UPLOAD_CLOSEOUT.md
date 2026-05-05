# Phase 5.0M — Mobile Profile Avatar Upload (Closeout)

**Status: DRAFT — pending migration apply and live QA.**

This doc captures the dormant 5.0M-A implementation as it stands in the working tree on 2026-05-05. The migration has not been applied to any Supabase project; the live-iPhone QA matrix has not been run. Once both complete, flip `AVATAR_UPLOAD_VERIFIED` to `true`, re-run validation, and finalize this doc with the activation timestamp + QA findings.

---

## Summary

5.0M-A lands a fully-wired but dormant profile-avatar-upload surface for the mobile app. Users on a TestFlight build with the activation flag flipped can pick a photo from their library, see it as their account avatar across the app, replace it, or remove it back to the colored-initials fallback. Browser parity is intentionally deferred; the `IdentityProvider` contract carries a `setAvatarPath` method that other providers stub as `identity/avatar-not-supported`.

The implementation follows the same dormant-then-activate pattern as 5.0F (Google OAuth), 5.0G (Apple Sign-In), and 5.0I (Mobile Billing): all code paths are present and type-checked, the activation gate (`AVATAR_UPLOAD_VERIFIED`) ships at `false`, and the UI hides the new controls until the gate flips.

---

## Schema / Storage changes

Migration: [`supabase/migrations/202605050001_identity_profile_avatar_path.sql`](../../supabase/migrations/202605050001_identity_profile_avatar_path.sql).

| Object | Change |
|---|---|
| `public.profiles.avatar_path` | New nullable `text` column. |
| `profiles_avatar_path_format` CHECK | Constrains the value to `^avatars/<lower-uuid>/profile_<digits>\.jpg$` or NULL. |
| Storage bucket `avatars` | New public bucket. `file_size_limit = 2 * 1024 * 1024`, `allowed_mime_types = ['image/jpeg']`. |
| Storage policy `avatars_owner_insert` | INSERT for `authenticated` only when `(storage.foldername(name))[1] = auth.uid()::text`. |
| Storage policy `avatars_owner_update` | UPDATE for `authenticated` with both `using` and `with check` enforcing the same folder/UID match — blocks an attacker from moving an existing object into another user's folder. |
| Storage policy `avatars_owner_delete` | DELETE for `authenticated` with the same folder/UID match. |
| SELECT on the bucket | Implicit via `bucket.public = true`; the mobile client renders straight from the public URL without per-request signing. |
| RPC `public.update_identity_avatar_path(p_avatar_path text)` | New SECURITY DEFINER function. Validates path format + folder ownership server-side, updates `profiles.avatar_path` for the caller, returns `{ avatarPath }`. Revoked from `anon, public`; granted to `authenticated`. |
| RPC `public.load_identity_state` | Recreated to include `avatar_path` in the profile sub-object. All other fields (id, display_name, avatar_color, onboarding_completed, created_at, updated_at, workspace, role, credential_state, credential_provider) are byte-identical to the prior 202605010005 definition. |

Migration is idempotent: `add column if not exists`, `do $$ ... if not exists` for the constraint, `on conflict (id) do nothing` for the bucket, `drop policy if exists` before each `create policy`, `create or replace function` for both RPCs. Re-runnable against either the existing dev project or a fresh prod project.

### Defense-in-depth on tenant isolation

A user cannot persist or upload an avatar pointing at another user's folder. Four independent checks gate the path:

1. Storage policies enforce `auth.uid()::text = (storage.foldername(name))[1]` on INSERT/UPDATE/DELETE.
2. `update_identity_avatar_path` RPC re-checks the regex.
3. `update_identity_avatar_path` RPC re-checks `split_part(p_avatar_path, '/', 2) = auth.uid()::text`.
4. `profiles_avatar_path_format` CHECK constraint enforces the regex on the table itself, so even a server-side write that bypassed the RPC could not insert a malformed value.

---

## Mobile implementation

| Concern | Implementation |
|---|---|
| Activation flag | `AVATAR_UPLOAD_VERIFIED = false` in [`apps/studio-mobile/src/identity/mobileConfig.ts`](../../apps/studio-mobile/src/identity/mobileConfig.ts). Hides Change/Remove controls until flipped. |
| Image source | Library only. `expo-image-picker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 1 })`. No camera. |
| Permission gate | `ImagePicker.requestMediaLibraryPermissionsAsync()` before opening the picker. Friendly error `avatar/permission-denied` directs the user to Settings on denial. |
| Resize | `expo-image-manipulator.manipulateAsync` to **512×512** square. |
| Compression | JPEG, **quality 0.8**. Typical output 30–150 KB. |
| Size cap | **2 MB** client-side (`AVATAR_MAX_BYTES = 2 * 1024 * 1024`) plus matching bucket-level limit. |
| Output format | JPEG only — bucket `allowed_mime_types`, manipulator `SaveFormat.JPEG`, path regex `\.jpg`. |
| Upload | Raw `fetch` POST to `/storage/v1/object/avatars/<uid>/profile_<ts>.jpg` with `Authorization: Bearer <jwt>`, `apikey`, `Content-Type: image/jpeg`, `Cache-Control: max-age=3600`, `x-upsert: false`. Body is the manipulator's output read via `fetch(file://).arrayBuffer()`. |
| Metadata commit | `identity.setAvatarPath(path)` → `MobileSupabaseProvider.setAvatarPath` → `update_identity_avatar_path` RPC. `failSoft` on RPC error so a failed update preserves signed-in status. |
| Avatar component | [`apps/studio-mobile/src/components/common/UserAvatar.tsx`](../../apps/studio-mobile/src/components/common/UserAvatar.tsx). Renders an `Image` when an image URI resolves; on `onError` falls back to the colored-initials affordance for the duration of the render. Self-contained palette + initials computation. |
| Resolver hook | [`apps/studio-mobile/src/identity/useResolvedAvatar.ts`](../../apps/studio-mobile/src/identity/useResolvedAvatar.ts). Returns `{ kind: 'image', uri }` (preferring a transient local override during in-flight upload, falling back to `buildAvatarPublicUrl(avatar_path)`) or `{ kind: 'color', color: avatar_color }`. |
| Pending preview | `pendingAvatarUri` in `account-identity.tsx` flips the resolver to the picker output for the brief upload window so the UI feels instantaneous. |
| Color fallback | `profile.avatar_color` (slug) remains the perpetual fallback; users who never upload see the existing colored initials, and Remove returns them to it. The bucket-level path regex prevents an empty/invalid path from rendering as a "broken" avatar. |
| Remove flow | `handleRemoveAvatar` captures `previousPath` + `accessToken` BEFORE clearing, calls `identity.setAvatarPath(null)`, then on success best-effort calls `deleteAvatarObject({ path, accessToken })` to remove the now-orphaned Storage file. Failure of the delete is swallowed inside the helper — the user-facing Remove already succeeded. |
| Replace flow | `uploadAvatarFromLocalUri` invokes the same `deleteAvatarObject` helper for the prior path after a successful new upload. One code path for both Remove and Replace orphan cleanup. |

### SDK boundary

`avatarUpload.ts` uses raw `fetch` against the Storage REST API. It does NOT import `@supabase/supabase-js`. The Phase 5.0B mobile-alignment rule (only `MobileSupabaseProvider.ts` may import the Supabase JS SDK) is preserved. Validator enforces this.

### Identity ↔ Avatar Upload boundary

The upload helper is provider-agnostic — it takes `{ uri, userId, accessToken, previousPath }` and resolves to `{ path }`. Identity surface state lives behind `setAvatarPath`. UI orchestrates the two phases. A failed Storage upload never leaves a stale DB pointer; a failed RPC never leaves orphan metadata pointing at a working object.

---

## Security / Privacy

- **No raw image data persisted in the profile.** `profiles.avatar_path` stores a path string only. The image bytes live in the public Storage bucket; the DB never sees them.
- **No tokens, paths, full URLs, user IDs, or image bytes are logged.** `grep console.* avatarUpload.ts useResolvedAvatar.ts UserAvatar.tsx` returns zero hits. Error messages quote upload status code + Storage's response text only — no caller-supplied data.
- **No camera permission requested.** `NSCameraUsageDescription` is intentionally absent from both `Info.plist` and `app.json`. Library-only is enough for v1 and narrows the App Review surface.
- **Photo Library permission only.** `NSPhotoLibraryUsageDescription` present in [`Info.plist`](../../apps/studio-mobile/ios/H2OStudio/Info.plist) and mirrored in [`app.json`](../../apps/studio-mobile/app.json). Wording: "Cockpit Pro needs access to your photo library so you can choose a profile picture." — single-purpose, no over-claim.
- **EXIF metadata mostly stripped.** Re-encoding a picked photo through `expo-image-manipulator` to JPEG drops most EXIF on iOS (orientation is consumed and applied during the resize; GPS/camera/timestamp tags are not propagated by the manipulator). Not a hard guarantee — a future hardening pass could explicitly assert via `metadata: false` if the manipulator surfaces it.
- **Public bucket means public URLs.** Anyone with the URL can read the image. Acceptable for a profile picture (the user opts in by uploading). The path-as-source-of-truth design (decision 3 of the plan) means a future flip to private+signed URLs is a client-only change.
- **Owner-only writes.** Four-layer enforcement (storage policies, RPC regex, RPC folder check, table CHECK) blocks any cross-tenant write or invalid path.
- **No leakage in identity-debug.** [`identity-debug.tsx`](../../apps/studio-mobile/src/app/identity-debug.tsx) renders only masked email + status — it does not serialize `profile.avatar_path`. Confirmed via `grep avatar`.

---

## Validator

[`tools/validation/identity/validate-mobile-avatar-upload.mjs`](../../tools/validation/identity/validate-mobile-avatar-upload.mjs). Wired into the release-gate orchestrator at [`tools/validation/identity/run-identity-release-gate.mjs`](../../tools/validation/identity/run-identity-release-gate.mjs) (run + syntax-check entries).

What it covers (~55 assertions across 13 sections):

1. **Migration shape.** Column + check constraint + bucket insert + 3 storage policies + RPC + load_identity_state extension. Regex literals match the locked path format. SECURITY DEFINER on the RPC. Grants/revokes correct.
2. **Activation flag.** `AVATAR_UPLOAD_VERIFIED` is a boolean literal (true/false).
3. **identity-core contract.** `H2OProfile.avatarPath`, `IdentityProvider.setAvatarPath`, `IdentityChangeSource | 'setAvatarPath'`.
4. **Mock provider.** Stub returning `identity/avatar-not-supported`.
5. **MobileSupabaseProvider.** Implements `setAvatarPath`, calls `update_identity_avatar_path`, parses `avatar_path` from the response, uses `failSoft`.
6. **IdentityContext.** Exposes `setAvatarPath` through `IdentityContextValue`, wires it via `runAction`.
7. **avatarUpload helper.** Exports `uploadAvatarFromLocalUri`, `deleteAvatarObject`, `buildAvatarPublicUrl`, `AvatarUploadError`. Locked constants `AVATAR_RESIZE_PX = 512`, `AVATAR_JPEG_QUALITY = 0.8`, `AVATAR_MAX_BYTES = 2 * 1024 * 1024`. Imports `expo-image-manipulator`. Uses `/storage/v1/object/`. Cache-Control is `max-age=3600` (rejects bare `'3600'`). `userId` is lowercased before path build. Does NOT import `@supabase/supabase-js`.
8. **useResolvedAvatar.** Exports the hook + `ResolvedAvatar` type, uses `buildAvatarPublicUrl`.
9. **UserAvatar component.** Exports the component, consumes the hook, renders `<Image>` with `onError` fallback. Re-exported from `components/common/index.ts`.
10. **account-identity wiring.** Imports `UserAvatar`, `uploadAvatarFromLocalUri`, `deleteAvatarObject`, `AVATAR_UPLOAD_VERIFIED`, `expo-image-picker`. Renders `<UserAvatar />`. Change/Remove gated by `AVATAR_UPLOAD_VERIFIED`. Calls `requestMediaLibraryPermissionsAsync` + `launchImageLibraryAsync`. Uses SDK 55-form `mediaTypes: ['images']` (rejects deprecated `MediaTypeOptions.Images`). `handleRemoveAvatar` invokes `deleteAvatarObject` after `setAvatarPath(null)`. Friendly error map carries `avatar/permission-denied` and `avatar/upload-failed` copy.
11. **Native + app.json permissions.** `NSPhotoLibraryUsageDescription` present in both, `NSCameraUsageDescription` absent from both.
12. **SDK boundary regression.** `avatarUpload.ts`, `useResolvedAvatar.ts`, `UserAvatar.tsx` must NOT import `@supabase/supabase-js`.
13. **Package deps.** `expo-image-picker` and `expo-image-manipulator` are listed in `apps/studio-mobile/package.json`.

---

## QA matrix (all rows **PENDING**)

Performed on a real iPhone, signed dev/internal build, with `AVATAR_UPLOAD_VERIFIED` temporarily flipped to `true` locally (do NOT commit the flip until all rows pass). Migration must be applied to the target Supabase project first.

| # | Step | Status |
|---|---|---|
| 1 | **Choose image.** Open Account screen → "Add photo" → picker presents the iOS Photos UI cropped to square via `allowsEditing: true, aspect: [1, 1]`. | PENDING |
| 2 | **Permission prompt.** First Add on a fresh install triggers the iOS Photo Library prompt. The wording matches `NSPhotoLibraryUsageDescription`. Allow → picker proceeds. Deny → friendly error directs to Settings. | PENDING |
| 3 | **Upload / save.** Pick a photo → spinner → image appears in the avatar block within ~1–3s on Wi-Fi. Inspect Storage in the Supabase dashboard: `avatars/<uuid>/profile_<ts>.jpg` exists. `profiles.avatar_path` row matches. | PENDING |
| 4 | **Reload persistence.** Force-quit + relaunch → avatar reloads from `load_identity_state`. No flicker on the colored fallback before the image appears (path is in the snapshot from boot). | PENDING |
| 5 | **Remove image.** Tap Remove → image disappears, colored initials return. `profiles.avatar_path` is NULL. The previously-uploaded Storage object is gone within a few seconds (best-effort delete fired during Remove). | PENDING |
| 6 | **Replace image.** Tap Change → pick a different photo. New file appears at a new timestamp; the previous file is gone (best-effort delete confirmed). Only ONE file remains in `avatars/<uuid>/`. | PENDING |
| 7 | **Offline failure.** Airplane mode → tap Add photo → pick → upload fails → friendly error: "Couldn't upload the photo. Check your connection and try again." Profile avatar reverts to whatever it was before. Toggle airplane off, retry → succeeds. | PENDING |
| 8 | **Oversized image.** Pick a multi-megabyte photo (e.g., a 12MP capture). After client resize+compress, the file should be well under 2 MB. If a contrived test reaches the cap, friendly error: "That photo is too large after compression. Try a smaller image." | PENDING |
| 9 | **Image load fallback.** Simulate a Storage 404 (e.g., manually delete the object in the dashboard, then reload the screen). `<Image>` `onError` flips the avatar back to colored initials for the duration of the render. App stays usable. | PENDING |
| 10 | **Storage cleanup.** After steps 5 and 6, only the most recent (or zero) file remains under `avatars/<uuid>/` in the Storage dashboard. Repeat Add → Remove → Add → Remove cycles a few times. The folder count stays bounded. | PENDING |

Additional smoke checks (also PENDING): theme toggle (Light / Dark / Cockpit) renders avatar identically; sign-out + sign-in as a different account shows the correct avatar with no leakage; concurrent foreground touch + Add does not deadlock or duplicate uploads.

---

## Blockers

1. **Migration not applied.** `supabase db push` (or dashboard SQL editor) against the target project must run first. Without it, the RPC and bucket do not exist; the upload will fail with a 404; `setAvatarPath` will fail with `PGRST202` (function not found). Apply order:
   - Apply `202605050001_identity_profile_avatar_path.sql`.
   - Verify `profiles.avatar_path` column + `profiles_avatar_path_format` CHECK in Tables.
   - Verify the `avatars` bucket exists, is public, has 2MB cap and `image/jpeg` MIME allow-list in Storage → Buckets.
   - Verify three `avatars_owner_*` policies in Storage → Policies.
   - Verify `update_identity_avatar_path` exists in Database → Functions.
   - Smoke: `select public.update_identity_avatar_path(null);` from a signed-in `authenticated` session should return `{"avatarPath": null}`.
2. **Pod install / native rebuild may be needed.** Both new deps (`expo-image-picker`, `expo-image-manipulator`) installed cleanly via `npx expo install` and did NOT touch `Podfile.lock`. The first dev/EAS build that consumes them will rebuild the iOS bundle automatically. If running locally, `cd apps/studio-mobile/ios && pod install` is a safe no-op confirmation step.
3. **Live QA pending.** All 10 rows above are PENDING. The activation flag stays at `false` until every row passes on a real iPhone.
4. **Apple Developer / TestFlight access** — orthogonal to this milestone (5.0H tracks it). 5.0M does not require a TestFlight build for QA; a dev build via `npx expo run:ios` against a paired iPhone is sufficient.

---

## Activation note

`AVATAR_UPLOAD_VERIFIED` is currently `false` and will remain so until QA passes. Activation is a **one-line flag flip** in [`apps/studio-mobile/src/identity/mobileConfig.ts`](../../apps/studio-mobile/src/identity/mobileConfig.ts):

```diff
-export const AVATAR_UPLOAD_VERIFIED = false;
+export const AVATAR_UPLOAD_VERIFIED = true;
```

After flipping:

1. `cd apps/studio-mobile && npx tsc --noEmit` — must remain clean.
2. `node tools/validation/identity/validate-mobile-avatar-upload.mjs` — must still PASS (the validator accepts either boolean literal).
3. `node tools/validation/identity/run-identity-release-gate.mjs` — must pass (subject to off-limits parallel work not blocking the gate).
4. Replace this DRAFT marker at the top of this doc with the activation timestamp + commit hash + the QA-step results table updated to PASS rows.

No other code changes should be required at activation. If anything else is needed, that's a sign QA found a real bug — fix it as a 5.0M-A follow-up before flipping.
