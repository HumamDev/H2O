// Mobile release-config validator (Phase 5.0H Tier 1D).
//
// Strict static check that the mobile app is configured for production
// distribution: non-placeholder bundle identifier and App Group, build-number
// declared, export-compliance flag set, deployment target aligned, EAS Build
// profiles in place, and per-profile Supabase env keys declared.
//
// Designed to run as a release-gate item ALONGSIDE the Tier 2 bundle/App Group
// rename. Until that rename lands, this validator is **expected to fail** on
// the placeholder bundle and App Group — that is the design. The validator is
// **not yet wired** into run-identity-release-gate.mjs; wiring happens in Tier
// 2B atomically with the bundle rename.
//
// Failure mode: collect ALL failures and print a single FAIL summary so the
// reader sees every production-readiness gap at once, rather than fixing them
// one fail-fast iteration at a time. This deviates from the fail-fast pattern
// used by other identity validators on purpose: this validator is a planning
// gate, not a regression gate.

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
    return null;
  }
}

const APP_JSON_REL = "apps/studio-mobile/app.json";
const EAS_JSON_REL = "apps/studio-mobile/eas.json";
const INFO_PLIST_REL = "apps/studio-mobile/ios/H2OStudio/Info.plist";
const MAIN_ENTITLEMENTS_REL = "apps/studio-mobile/ios/H2OStudio/H2OStudio.entitlements";
const SHARE_ENTITLEMENTS_REL = "apps/studio-mobile/ios/H2OShareExtension/H2OShareExtension.entitlements";

const PLACEHOLDER_BUNDLE = "com.anonymous.studio-mobile";
const PLACEHOLDER_APP_GROUP = "group.com.anonymous.studio-mobile";
const REQUIRED_DEPLOYMENT_TARGET = "15.1";

const failures = [];

function fail(msg) {
  failures.push(msg);
}

function check(cond, msg) {
  if (!cond) fail(msg);
}

// ─── 1. app.json structural + iOS production-readiness ────────────────────

const appJsonText = read(APP_JSON_REL);
let appJson = null;
try {
  appJson = JSON.parse(appJsonText);
} catch (err) {
  fail(`app.json is not valid JSON: ${err instanceof Error ? err.message : String(err)}`);
}

const expo = appJson?.expo;
if (!expo || typeof expo !== "object") {
  fail("app.json must have a top-level 'expo' object");
}
const ios = expo?.ios;
if (!ios || typeof ios !== "object") {
  fail("app.json must have an 'expo.ios' object");
}

if (ios && typeof ios === "object") {
  check(
    typeof ios.bundleIdentifier === "string" && ios.bundleIdentifier.length > 0,
    "app.json expo.ios.bundleIdentifier must be a non-empty string"
  );
  check(
    ios.bundleIdentifier !== PLACEHOLDER_BUNDLE,
    `app.json expo.ios.bundleIdentifier must not be the placeholder '${PLACEHOLDER_BUNDLE}' — production reverse-DNS bundle (e.g. com.cockpitpro.studio) required`
  );

  check(
    typeof ios.buildNumber === "string" && /^\d+$/.test(ios.buildNumber),
    "app.json expo.ios.buildNumber must be a string of digits (e.g. '1') — required for TestFlight upload"
  );

  check(
    typeof ios.supportsTablet === "boolean",
    "app.json expo.ios.supportsTablet must be set explicitly as a boolean (avoid the default-true ambiguity)"
  );

  const iosConfig = ios.config;
  if (!iosConfig || typeof iosConfig !== "object") {
    fail("app.json expo.ios.config must exist as an object containing usesNonExemptEncryption");
  } else {
    check(
      iosConfig.usesNonExemptEncryption === false,
      "app.json expo.ios.config.usesNonExemptEncryption must be boolean false (claims the standard Mass Market export-compliance exemption)"
    );
  }
}

// ─── 2. Info.plist export-compliance + deployment target ──────────────────

const infoPlist = read(INFO_PLIST_REL);

check(
  /<key>ITSAppUsesNonExemptEncryption<\/key>\s*<false\s*\/>/.test(infoPlist),
  "Info.plist must contain <key>ITSAppUsesNonExemptEncryption</key><false/> (mirrors app.json claim; required by App Store Connect upload)"
);

const minSysMatch = infoPlist.match(/<key>LSMinimumSystemVersion<\/key>\s*<string>([^<]+)<\/string>/);
if (!minSysMatch) {
  fail("Info.plist must declare LSMinimumSystemVersion");
} else {
  check(
    minSysMatch[1] === REQUIRED_DEPLOYMENT_TARGET,
    `Info.plist LSMinimumSystemVersion must be '${REQUIRED_DEPLOYMENT_TARGET}' to match Podfile target; found '${minSysMatch[1]}'`
  );
}

check(
  /<key>CFBundleShortVersionString<\/key>/.test(infoPlist),
  "Info.plist must declare CFBundleShortVersionString"
);
check(
  /<key>CFBundleVersion<\/key>/.test(infoPlist),
  "Info.plist must declare CFBundleVersion"
);

// ─── 3. eas.json structure + Supabase env per profile ─────────────────────

const easJsonText = readOptional(EAS_JSON_REL);
let easJson = null;
if (easJsonText === null) {
  fail("eas.json must exist at apps/studio-mobile/eas.json");
} else {
  try {
    easJson = JSON.parse(easJsonText);
  } catch (err) {
    fail(`eas.json is not valid JSON: ${err instanceof Error ? err.message : String(err)}`);
  }
}

const buildProfiles = easJson?.build;
if (!buildProfiles || typeof buildProfiles !== "object") {
  if (easJson) fail("eas.json must have a 'build' object containing iOS profiles");
} else {
  for (const profile of ["development", "internal", "production"]) {
    if (!buildProfiles[profile] || typeof buildProfiles[profile] !== "object") {
      fail(`eas.json build.${profile} profile is required`);
    }
  }
  for (const profile of ["internal", "production"]) {
    const env = buildProfiles[profile]?.env;
    if (!env || typeof env !== "object") {
      fail(`eas.json build.${profile}.env must exist (value may be empty until prod Supabase is provisioned)`);
    } else {
      check(
        "EXPO_PUBLIC_SUPABASE_URL" in env,
        `eas.json build.${profile}.env must declare EXPO_PUBLIC_SUPABASE_URL key`
      );
      check(
        "EXPO_PUBLIC_SUPABASE_ANON_KEY" in env,
        `eas.json build.${profile}.env must declare EXPO_PUBLIC_SUPABASE_ANON_KEY key`
      );
    }
  }
}

// ─── 4. Entitlements: App Group rename + Apple Sign-In carry-over ─────────

const mainEntitlements = read(MAIN_ENTITLEMENTS_REL);
const shareEntitlements = read(SHARE_ENTITLEMENTS_REL);

check(
  !mainEntitlements.includes(PLACEHOLDER_APP_GROUP),
  `H2OStudio.entitlements must not contain placeholder App Group '${PLACEHOLDER_APP_GROUP}' — production App Group (e.g. group.com.cockpitpro.studio) required`
);
check(
  !shareEntitlements.includes(PLACEHOLDER_APP_GROUP),
  `H2OShareExtension.entitlements must not contain placeholder App Group '${PLACEHOLDER_APP_GROUP}' — production App Group (e.g. group.com.cockpitpro.studio) required`
);

const mainGroupMatch = mainEntitlements.match(
  /<key>com\.apple\.security\.application-groups<\/key>[\s\S]*?<string>([^<]+)<\/string>/
);
const shareGroupMatch = shareEntitlements.match(
  /<key>com\.apple\.security\.application-groups<\/key>[\s\S]*?<string>([^<]+)<\/string>/
);
if (!mainGroupMatch) {
  fail("H2OStudio.entitlements must declare com.apple.security.application-groups");
}
if (!shareGroupMatch) {
  fail("H2OShareExtension.entitlements must declare com.apple.security.application-groups");
}
if (mainGroupMatch && shareGroupMatch) {
  check(
    mainGroupMatch[1] === shareGroupMatch[1],
    `Main app and share extension App Groups must match exactly (main='${mainGroupMatch[1]}', share='${shareGroupMatch[1]}')`
  );
}

// Phase 5.0G-A regression check: the applesignin entitlement must persist
// through the Tier 2 native sweep.
check(
  /<key>com\.apple\.developer\.applesignin<\/key>/.test(mainEntitlements),
  "H2OStudio.entitlements must retain <key>com.apple.developer.applesignin</key> (Phase 5.0G-A regression check; required by Sign in with Apple)"
);

// ─── Final report ─────────────────────────────────────────────────────────

if (failures.length > 0) {
  console.error(`FAIL: Mobile release-config validator — ${failures.length} check(s) failed:`);
  for (const msg of failures) {
    console.error(`  • ${msg}`);
  }
  process.exit(1);
}
console.log("PASS: Mobile release-config validator");
