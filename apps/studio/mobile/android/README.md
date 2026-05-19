# apps/studio/mobile/android — FUTURE EXPO-MANAGED ANDROID NATIVE PROJECT

**This folder is a placeholder. Only this README is tracked; the rest
of `android/` does not exist on disk yet.**

When the project needs an Android build, the operator runs:

```sh
cd apps/studio/mobile
npx expo prebuild --platform android
```

…which will populate `android/` with a Gradle / Android-Studio-managed
native project — the same way `ios/` was populated for the iOS side.

## What goes here when it's generated

The same **hybrid source/generated pattern** as
[`apps/studio/mobile/ios/`](../ios/README.md):

### ✅ Tracked source (edit these freely)

- `android/build.gradle`, `android/settings.gradle`, `android/gradle.properties`
- `android/app/build.gradle`
- `android/app/src/main/AndroidManifest.xml`
- `android/app/src/main/java/.../MainActivity.kt`, `MainApplication.kt`
- `android/app/src/main/res/` (icons, splash, strings)
- `android/gradle/wrapper/gradle-wrapper.properties`
- Per-flavor manifests / source folders if added

### ❌ Generated (gitignored)

- `android/build/` — Gradle intermediate outputs
- `android/app/build/` — Gradle per-module outputs
- `android/.gradle/` — Gradle daemon cache
- `android/local.properties` — Per-machine SDK paths
- Signing material (`*.keystore`, `*.jks`, `*.p8`, `*.p12`, `*.key`,
  `*.mobileprovision`) — never commit; load via env or EAS Secret

These ignore rules are already declared in:

- root `.gitignore` — `apps/**/android/build/`, `apps/**/android/.gradle/`,
  `apps/**/android/app/build/`
- `apps/studio/mobile/.gitignore` — `/android/**` (with a
  `!/android/README.md` exception so this placeholder stays tracked)
- `apps/studio/mobile/.gitignore` — generic native-secret rules
  (`*.jks`, `*.p8`, `*.p12`, `*.key`, `*.mobileprovision`)

## Why this README is tracked even though /android/** is ignored

`apps/studio/mobile/.gitignore` excludes the whole `android/` subtree to
keep the unbuilt tree quiet:

```gitignore
/android/**
!/android/README.md
```

The `!/android/README.md` exception keeps this boundary doc tracked so
the source/generated pattern is visible BEFORE the first
`expo prebuild` run rather than after.

## What to do at first `expo prebuild --platform android`

When `expo prebuild --platform android` first runs and populates this
folder, the operator should:

1. Inspect the generated source (manifest, build.gradle, MainActivity, etc.).
2. Narrow `apps/studio/mobile/.gitignore` from `/android/**` to the
   specific generated subdirs (e.g. `/android/build/`,
   `/android/app/build/`, `/android/.gradle/`, `/android/local.properties`) —
   mirroring the curated tracking used for `ios/`.
3. Re-add the now-tracked source files (manifest, Gradle scripts,
   `app/src/main/java/.../*.kt`, etc.) to git.
4. Update this README from "placeholder" to "live folder docs."

## Where to read more

- [`../README.md`](../README.md) — Studio Mobile app overview
- [`../ios/README.md`](../ios/README.md) — iOS managed native project (parallel structure)
