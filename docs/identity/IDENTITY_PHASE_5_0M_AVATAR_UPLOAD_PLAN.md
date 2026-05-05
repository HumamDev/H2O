# Phase 5.0M — Mobile Profile Avatar Upload (Plan)

## Status

**Task A — dormant implementation:** ✅ landed, dormant.
`AVATAR_UPLOAD_VERIFIED = false` in `apps/studio-mobile/src/identity/mobileConfig.ts`.
Code present but Change/Remove controls are hidden in the account screen until the flag flips.

**Task B — activation:** pending live-iPhone QA. Single-line flag flip + closeout doc; no code changes expected.

## Why this milestone

Through Phase 5.0L the only avatar affordance has been the colored-initials swatch (`profile.avatar_color`). The full identity stack (5.0F Google, 5.0G Apple, 5.0K route guards) is feature-complete; the obvious next polish is letting users replace the initials with a real profile picture. Mobile-first because:

- The mobile app is the single surface heading toward TestFlight (5.0H milestone).
- `expo-image-picker` + `expo-image-manipulator` give us a clean native pipeline (no browser File API divergence).
- Picking a photo on a phone is the dominant real-world flow for setting a profile picture; doing this on the browser later is a strict subset.

Browser parity is intentionally deferred — `IdentityProvider.setAvatarPath` is on the contract, but the browser provider stub raises `identity/avatar-not-supported` until a follow-up phase wires DnD/picker into the Control Hub.

## Locked decisions (14)

1. **Phase number:** 5.0M.
2. **Storage bucket:** public Supabase Storage bucket `avatars`. Public so the mobile client can render via stable URLs without per-request signing — the path-as-source-of-truth design (decision 3) means a future flip to private+signed URLs is a client-only change.
3. **Source of truth:** `profiles.avatar_path` stores ONLY the storage object path, never the public URL. The mobile client constructs the URL at render time.
4. **Path format:** `avatars/<user_uuid>/profile_<timestamp>.jpg`. Timestamped filenames bucket cleanly across replacements; the client deletes the previous file (best-effort) after a successful upload.
5. **Avatar color is the perpetual fallback.** Removing the uploaded image (`avatar_path → null`) returns the user to the colored-initials affordance — they can never end up with no avatar visible.
6. **Render order:** image first (when `avatar_path` is set and the URL loads), color initials fallback (when no path OR the image fails to load).
7. **Picker scope:** library only via `ImagePicker.launchImageLibraryAsync`. No camera in this milestone — narrower permission surface, fewer App Review questions.
8. **Activation flag:** `AVATAR_UPLOAD_VERIFIED` in `mobileConfig.ts`. Default `false`. Flip to `true` only after live-iPhone QA.
9. **Output format:** JPEG only. The bucket's `allowed_mime_types` enforces this server-side; the manipulator pipeline emits JPEG; the path regex requires `.jpg`.
10. **Resize:** 512×512 square (matches the Apple-style profile picture grid; 1× the typical render size on iOS at 64pt).
11. **JPEG quality:** 0.8 — the standard "good enough" point. Typical output: 30–150 KB.
12. **Upload cap:** 2 MB. Bucket-level limit + client-side guard after compression. With (10) + (11), a real photo will never approach the cap.
13. **Identity-state RPC:** `load_identity_state` extended to return `avatar_path` in the profile sub-object. Mobile reads it on every refresh / boot — single source of truth.
14. **No auto-import.** Google / Apple sign-in do NOT seed `avatar_path` from the OAuth provider's avatar URL. Users opt in explicitly via the Change button.

## Architecture (one-page)

```
┌─────────────────────────────────────────────────────────────────────────┐
│ AccountIdentityScreen (signed-in view)                                  │
│   ┌──────────────┐   ┌─────────────────────────────────┐                │
│   │  UserAvatar  │   │ Change ▸  Remove ▸              │ AVATAR_UPLOAD_ │
│   │   size=64    │   │ (gated by AVATAR_UPLOAD_VERIFIED)│ VERIFIED ?    │
│   └──────────────┘   └─────────────────────────────────┘                │
│        │                                                                 │
│        ▼ useResolvedAvatar()                                             │
│   ┌─────────────────────────────────────────────────┐                    │
│   │ pendingLocalUri ? local file://                 │                    │
│   │   else avatar_path ? buildAvatarPublicUrl()     │                    │
│   │     else { kind: 'color', color: avatar_color } │                    │
│   └─────────────────────────────────────────────────┘                    │
└─────────────────────────────────────────────────────────────────────────┘

           Change / Add photo                              Remove
                │                                             │
                ▼                                             ▼
   ImagePicker.requestMediaLibraryPermissionsAsync        identity.setAvatarPath(null)
                │
                ▼
   ImagePicker.launchImageLibraryAsync({ allowsEditing, aspect: [1,1] })
                │
                ▼
   uploadAvatarFromLocalUri({ uri, userId, accessToken, previousPath })
       1. ImageManipulator.manipulateAsync — 512×512, JPEG q=0.8
       2. fetch(file://).arrayBuffer()  →  size guard (2 MB)
       3. POST /storage/v1/object/avatars/<uid>/profile_<ts>.jpg
            (Content-Type: image/jpeg, x-upsert: false)
       4. DELETE /storage/v1/object/<previousPath>  (best-effort)
                │
                ▼ returns { path }
   identity.setAvatarPath(path)
       → MobileSupabaseProvider.setAvatarPath
       → RPC: update_identity_avatar_path(p_avatar_path)
       → server validates regex + folder ownership
       → snapshot.profile.avatarPath updated
       → writeSnapshot (best-effort persist)
```

### Failure-isolated two-phase contract

- **Storage upload first, RPC second.** A failed Storage upload never leaves a stale DB pointer; a failed RPC never leaves orphan metadata pointing at an existing object.
- **failSoft on RPC error.** A failed avatar update preserves signed-in status (would otherwise flip to `auth_error` and effectively log the user out).
- **Best-effort previous-file delete.** If the delete fails, the bucket retains an orphan; the new path is already live on the row, so the user sees the new image. Cleanup can be addressed in a future milestone via a server-side reaper.

### SDK boundary

`avatarUpload.ts` uses raw `fetch` against the Storage REST API (NOT `@supabase/supabase-js`). This preserves the 5.0B mobile-alignment rule that only `MobileSupabaseProvider.ts` may import the Supabase JS SDK. Validator enforces this.

## Files touched

### Code

- `supabase/migrations/202605050001_identity_profile_avatar_path.sql` — **new.** Column + check, bucket, 3 storage policies, `update_identity_avatar_path` RPC, updated `load_identity_state`.
- `packages/identity-core/src/contracts.ts` — `H2OProfile.avatarPath?: string | null`; `IdentityProvider.setAvatarPath(path)`; `IdentityChangeSource | 'setAvatarPath'`.
- `packages/identity-core/src/mock-provider.ts` — `setAvatarPath` stub returning `identity/avatar-not-supported`.
- `apps/studio-mobile/src/identity/mobileConfig.ts` — `AVATAR_UPLOAD_VERIFIED = false`.
- `apps/studio-mobile/src/identity/MobileSupabaseProvider.ts` — `setAvatarPath()` method calling the RPC; `normalizeRpcProfile` extracts `avatar_path` from the snapshot.
- `apps/studio-mobile/src/identity/IdentityContext.tsx` — exposes `setAvatarPath` through `IdentityContextValue`.
- `apps/studio-mobile/src/identity/avatarUpload.ts` — **new.** `uploadAvatarFromLocalUri`, `buildAvatarPublicUrl`, locked constants, `AvatarUploadError`.
- `apps/studio-mobile/src/identity/useResolvedAvatar.ts` — **new.** `useResolvedAvatar` hook + `ResolvedAvatar` discriminated union.
- `apps/studio-mobile/src/components/common/UserAvatar.tsx` — **new.** Image with onError fallback to colored initials.
- `apps/studio-mobile/src/components/common/index.ts` — re-export `UserAvatar`.
- `apps/studio-mobile/src/app/account-identity.tsx` — replace inline `<View style={styles.avatar}>` with `<UserAvatar>`; add Change/Remove controls + handlers; friendly-error map entries; remove unused `initialsOf` and `resolveAvatarSwatch` (now lived inside UserAvatar).

### Native + config

- `apps/studio-mobile/ios/H2OStudio/Info.plist` — add `NSPhotoLibraryUsageDescription`.
- `apps/studio-mobile/app.json` — mirror `ios.infoPlist.NSPhotoLibraryUsageDescription`.
- `apps/studio-mobile/package.json` + `package-lock.json` — `expo-image-picker ~55.0.20`, `expo-image-manipulator ~55.0.16`.
- `Podfile.lock` — unchanged (both deps are JS-only; no new pods).

### Validation / docs

- `tools/validation/identity/validate-mobile-avatar-upload.mjs` — **new.** Asserts the migration shape, the contract additions, the provider/context wiring, the helper constants, the SDK boundary, the picker calls, the AVATAR_UPLOAD_VERIFIED gate, the permission strings, and the deps.
- `tools/validation/identity/run-identity-release-gate.mjs` — register the new validator + its `--check` syntax pass.
- `docs/identity/IDENTITY_PHASE_5_0M_AVATAR_UPLOAD_PLAN.md` — **this doc.**

## Validation

```bash
# Targeted:
node tools/validation/identity/validate-mobile-avatar-upload.mjs

# Mobile type check:
cd apps/studio-mobile && npx tsc --noEmit

# Full release gate:
node tools/validation/identity/run-identity-release-gate.mjs
```

## QA plan (Task B — flag flip)

Performed on a real iPhone, signed dev/internal build. All steps must pass before flipping `AVATAR_UPLOAD_VERIFIED = true`.

1. Cold install → email signup → sync_ready home → Account screen. Avatar block shows colored initials, Change/Remove hidden (flag still false in this build — sanity check).
2. Flip flag locally to true (do NOT commit) → reload. Account screen now shows "Add photo".
3. Tap "Add photo". iOS prompts for Photos permission. Allow → picker opens.
4. Pick a photo, crop → upload spinner → image appears in the avatar block. `device_sessions.last_seen_at` updated naturally on background return; no spurious sign-out.
5. Inspect Storage in the Supabase dashboard → `avatars/<uuid>/profile_<ts>.jpg` exists. `profiles.avatar_path` row matches.
6. Tap Change → pick a different photo. New file appears at a new timestamp; previous file is gone (best-effort delete confirmed).
7. Tap Remove → confirm prompt → image disappears, colored initials return. `profiles.avatar_path` is NULL. The most-recent storage object remains until the next upload's delete sweeps it (acceptable, will be addressed via a server reaper later).
8. Deny Photos permission on a fresh device → tap "Add photo" → friendly error: "Photo library access is required. Enable it in Settings → Cockpit Pro → Photos."
9. Airplane mode → tap "Add photo" → pick → upload fails → friendly error: "Couldn't upload the photo. Check your connection and try again." Profile avatar reverts to whatever it was before. Toggle airplane off, retry → succeeds.
10. Force-quit + relaunch → avatar reloads from `load_identity_state`. No flicker on the colored fallback before the image appears (the path is in the snapshot from boot).
11. Sign out → sign in as a different account → avatar block reflects that user's `avatar_path` (or initials if none). No leakage of the previous user's image.
12. Toggle Light / Dark / Cockpit appearance with avatar set → image renders identically (no theme-tint regression).

If any step fails, do NOT flip the flag — open a Task A follow-up.

## Activation (Task B)

After full QA passes:

1. `apps/studio-mobile/src/identity/mobileConfig.ts` → `AVATAR_UPLOAD_VERIFIED = true`.
2. `node tools/validation/identity/validate-mobile-avatar-upload.mjs` (still passes — flag is a boolean literal either way).
3. `node tools/validation/identity/run-identity-release-gate.mjs`.
4. New closeout doc: `docs/identity/IDENTITY_PHASE_5_0M_AVATAR_UPLOAD_CLOSEOUT.md`.

## Out of scope

- Browser / Control Hub avatar upload (deferred — `IdentityProvider.setAvatarPath` is on the contract; the Control Hub provider can implement it later).
- Camera capture (`launchCameraAsync`) — would require `NSCameraUsageDescription` + extra App Review surface. Library-only is enough for v1.
- Image cropping beyond `allowsEditing: true` (the picker's built-in square crop is what we ship).
- Server-side orphan reaper for the `avatars` bucket. Best-effort client delete plus the timestamped path is good enough until the bucket has thousands of orphans, which it won't for a long time.
- Auto-importing OAuth provider avatars (Apple/Google). Users opt in explicitly.
- WebP / HEIC output. JPEG only — App Review-friendly + universal client support.
- Animated avatars / GIFs.

## Risks

- **Storage REST API behavioral drift.** We use raw `fetch` against `/storage/v1/object/<bucket>/<path>` rather than `client.storage.from(...).upload(...)`. If Supabase changes the REST endpoint shape, the SDK would absorb it but raw fetch wouldn't. Mitigation: covered by the live-QA matrix; if it ever breaks, falling back to the SDK is a single import + ~20 lines.
- **`fetch(file://).arrayBuffer()` cross-platform reliability.** Works in Hermes/Expo SDK 55 today. If a future RN upgrade breaks file:// fetch, we'd need to add `expo-file-system` for a `readAsStringAsync({ encoding: 'base64' })` path. Not a regression risk in this milestone — mentioned only as a known dependency on RN's fetch behavior.
- **Permission UX on iOS.** First denial means subsequent attempts can't re-prompt — only Settings → app → Photos toggle. The friendly error directs the user there. If we see drop-off here, a follow-up could deep-link via `Linking.openSettings()`.
- **Public bucket = public URLs.** Anyone with the URL can read the image. Acceptable for a profile picture (not PII beyond what the user chose to share). If we ever store private avatars, flip the bucket to private and the client to signed URLs — schema-free change because `avatar_path` is path-not-URL.
- **Avatar lookalike attacks.** A user could upload a photo of someone else as their avatar. Out of scope to prevent here; a Trust & Safety surface (report/moderation) is a separate milestone if it ever becomes load-bearing.
