// Identity Phase 5.0F — Mobile Google OAuth validator.
//
// Asserts the mobile provider, IdentityContext, account-identity surface, and
// mobileConfig wire the Phase 5.0F dormant Google OAuth flow correctly.
//
// What this validator enforces:
//   - mobileConfig.ts exports GOOGLE_OAUTH_VERIFIED. Phase A lands with
//     `false`; activation flips to `true` in a separate gated commit.
//   - MobileSupabaseProvider.ts implements async signInWithGoogle().
//   - signInWithGoogle is the ONLY mobile-source call site for
//     client.auth.signInWithOAuth, client.auth.exchangeCodeForSession, and
//     WebBrowser.openAuthSessionAsync.
//   - The redirect URI is the exact constant
//     `studiomobile://identity/oauth/google` and lives only in
//     MobileSupabaseProvider.ts.
//   - `expo-web-browser` is imported only in MobileSupabaseProvider.ts.
//   - IdentityContext.tsx exposes signInWithGoogle via runAction.
//   - account-identity.tsx renders "Continue with Google" only when
//     GOOGLE_OAUTH_VERIFIED is true (within ~800 chars after the gate).
//   - identity-debug.tsx and settings.tsx remain free of OAuth references
//     (regression check protecting the 5.0B identity-debug wall).
//   - The mobile-bundle anti-leak guard is extended to forbid console.* of
//     plaintext OAuth tokens / codes / state values.

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

function assert(cond, msg) {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exit(1);
  }
}

function extractAsyncMethod(source, name) {
  const re = new RegExp(`async\\s+${name}\\s*\\([^)]*\\)\\s*:\\s*[^{]*\\{`);
  const match = re.exec(source);
  if (!match) return "";
  let depth = 1;
  const start = match.index + match[0].length;
  let i = start;
  while (i < source.length && depth > 0) {
    const ch = source[i];
    if (ch === "{") depth++;
    else if (ch === "}") depth--;
    i++;
  }
  return source.slice(start, i - 1);
}

const MOBILE_SRC_REL = "apps/studio-mobile/src";
const PROVIDER_REL = "apps/studio-mobile/src/identity/MobileSupabaseProvider.ts";
const CONTEXT_REL = "apps/studio-mobile/src/identity/IdentityContext.tsx";
const ACCOUNT_REL = "apps/studio-mobile/src/app/account-identity.tsx";
const CONFIG_REL = "apps/studio-mobile/src/identity/mobileConfig.ts";
const SECURESTORE_REL = "apps/studio-mobile/src/identity/secureStore.ts";
const SETTINGS_REL = "apps/studio-mobile/src/app/settings.tsx";
const IDENTITY_DEBUG_REL = "apps/studio-mobile/src/app/identity-debug.tsx";
const CORE_CONTRACTS_REL = "packages/identity-core/src/contracts.ts";
const MOCK_PROVIDER_REL = "packages/identity-core/src/mock-provider.ts";

const provider = read(PROVIDER_REL);
const context = read(CONTEXT_REL);
const accountIdentity = read(ACCOUNT_REL);
const mobileConfig = read(CONFIG_REL);
const secureStore = readOptional(SECURESTORE_REL);
const settings = readOptional(SETTINGS_REL);
const identityDebug = readOptional(IDENTITY_DEBUG_REL);
const contracts = read(CORE_CONTRACTS_REL);
const mockProvider = read(MOCK_PROVIDER_REL);

const REDIRECT_URI = "studiomobile://identity/oauth/google";

// ─── 1. mobileConfig exports GOOGLE_OAUTH_VERIFIED ─────────────────────────

const flagMatch = mobileConfig.match(/export\s+const\s+GOOGLE_OAUTH_VERIFIED\s*=\s*(true|false)/);
assert(
  flagMatch,
  "mobileConfig.ts must export GOOGLE_OAUTH_VERIFIED as a boolean literal"
);

// ─── 2. identity-core contract + mock stub ─────────────────────────────────

assert(
  /\bsignInWithGoogle\s*\(\s*\)\s*:\s*Promise<IdentitySnapshot>/.test(contracts),
  "identity-core contracts must declare signInWithGoogle(): Promise<IdentitySnapshot> on IdentityProvider"
);
assert(
  /async\s+signInWithGoogle\s*\(\s*\)\s*:\s*Promise<IdentitySnapshot>/.test(mockProvider),
  "MockLocalIdentityProvider must implement async signInWithGoogle(): Promise<IdentitySnapshot>"
);
assert(
  /identity\/oauth-not-supported/.test(mockProvider),
  "MockLocalIdentityProvider.signInWithGoogle must return identity/oauth-not-supported"
);

// ─── 3. Provider method exists ─────────────────────────────────────────────

const signInWithGoogleBody = extractAsyncMethod(provider, "signInWithGoogle");
assert(
  signInWithGoogleBody.length > 0,
  "MobileSupabaseProvider must define async signInWithGoogle(): Promise<IdentitySnapshot>"
);

// ─── 4. SDK + WebBrowser calls only inside signInWithGoogle ────────────────

const oauthCalls = [
  ["client.auth.signInWithOAuth(", /\bclient\.auth\.signInWithOAuth\s*\(/g],
  ["client.auth.exchangeCodeForSession(", /\bclient\.auth\.exchangeCodeForSession\s*\(/g],
  ["WebBrowser.openAuthSessionAsync(", /\bWebBrowser\.openAuthSessionAsync\s*\(/g],
];
for (const [label, re] of oauthCalls) {
  const allMatches = [...provider.matchAll(re)];
  assert(
    allMatches.length === 1,
    `${label} must appear exactly once in MobileSupabaseProvider.ts (found ${allMatches.length})`
  );
  assert(
    signInWithGoogleBody.includes(label),
    `${label} must appear inside signInWithGoogle`
  );
}

// ─── 5. signInWithOAuth call uses provider:'google' + skipBrowserRedirect:true + redirectTo ─

assert(
  /provider\s*:\s*['"]google['"]/.test(signInWithGoogleBody),
  "signInWithGoogle must pass provider: 'google' to signInWithOAuth"
);
assert(
  /skipBrowserRedirect\s*:\s*true/.test(signInWithGoogleBody),
  "signInWithGoogle must pass skipBrowserRedirect: true so WebBrowser.openAuthSessionAsync owns the redirect"
);
assert(
  /redirectTo\s*:\s*MOBILE_OAUTH_REDIRECT_URI\b/.test(signInWithGoogleBody),
  "signInWithGoogle must pass redirectTo: MOBILE_OAUTH_REDIRECT_URI"
);

// ─── 6. Redirect URI constant lives only in MobileSupabaseProvider.ts ──────

const redirectInProvider = (provider.match(new RegExp(REDIRECT_URI.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length;
assert(
  redirectInProvider === 1,
  `MobileSupabaseProvider.ts must include the redirect URI literal '${REDIRECT_URI}' exactly once`
);
const redirectInContext = (context.match(new RegExp(REDIRECT_URI.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length;
const redirectInAccount = (accountIdentity.match(new RegExp(REDIRECT_URI.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length;
const redirectInConfig = (mobileConfig.match(new RegExp(REDIRECT_URI.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length;
assert(
  redirectInContext === 0 && redirectInAccount === 0 && redirectInConfig === 0,
  `redirect URI '${REDIRECT_URI}' must not appear in IdentityContext, account-identity, or mobileConfig`
);

// ─── 7. expo-web-browser import ownership ───────────────────────────────────

const importRe = /from\s+['"]expo-web-browser['"]|require\s*\(\s*['"]expo-web-browser['"]\s*\)/;
const filesToCheck = [
  ["IdentityContext.tsx", context],
  ["account-identity.tsx", accountIdentity],
  ["mobileConfig.ts", mobileConfig],
  ["secureStore.ts", secureStore],
];
assert(
  importRe.test(provider),
  "MobileSupabaseProvider.ts must import expo-web-browser (it owns the OAuth flow)"
);
for (const [label, src] of filesToCheck) {
  assert(
    !importRe.test(src),
    `${label} must not import expo-web-browser (only MobileSupabaseProvider.ts is allowed)`
  );
}

// ─── 8. Mobile-bundle anti-leak — extends 5.0E posture for OAuth secrets ───
// Forbid console.* of plaintext OAuth tokens / codes / state-shaped names.
// The check fires on the same word-boundary-anchored arg-content scan as the
// 5.0E check, but with OAuth-specific identifiers added.

const mobileBundle = [provider, accountIdentity, secureStore, context, mobileConfig].join("\n");
assert(
  !/console\.(log|warn|error|debug|info)\s*\([^)]*\b(oauthCode|authCode|oauthState|oauthUrl|providerToken|provider_token|id_token|idToken)\b/.test(mobileBundle),
  "mobile source must not console.* plaintext OAuth tokens/codes/state values"
);

// ─── 9. signInWithGoogle return shape must not echo raw tokens/session/user ─

assert(
  !/return\s+\{[\s\S]{0,400}\b(rawSession|rawUser|access_token|refresh_token|provider_token|id_token)\s*:/.test(signInWithGoogleBody),
  "signInWithGoogle must not return raw token / session / user fields"
);

// ─── 10. IdentityContext exposes signInWithGoogle ──────────────────────────

assert(
  /\bsignInWithGoogle\s*:\s*\(\s*\)\s*=>\s*Promise<IdentitySnapshot>/.test(context)
    || /\bsignInWithGoogle\s*\(\s*\)\s*:\s*Promise<IdentitySnapshot>/.test(context),
  "IdentityContext must declare signInWithGoogle on IdentityContextValue"
);
assert(
  /signInWithGoogle\s*=\s*useCallback\s*\(/.test(context),
  "IdentityContext must define signInWithGoogle via useCallback so it routes through runAction"
);
assert(
  /identityProvider\.signInWithGoogle\s*\(\s*\)/.test(context),
  "IdentityContext signInWithGoogle must call identityProvider.signInWithGoogle()"
);

// ─── 11. account-identity gates the OAuth button on GOOGLE_OAUTH_VERIFIED ──

assert(
  /import\s+\{[^}]*GOOGLE_OAUTH_VERIFIED[^}]*\}\s+from\s+['"][^'"]*mobileConfig['"]/.test(accountIdentity),
  "account-identity.tsx must import GOOGLE_OAUTH_VERIFIED from mobileConfig"
);
const continueIdx = accountIdentity.indexOf("Continue with Google");
assert(
  continueIdx !== -1,
  'account-identity.tsx must render a "Continue with Google" label'
);
const guardWindow = accountIdentity.slice(Math.max(0, continueIdx - 800), continueIdx);
assert(
  /GOOGLE_OAUTH_VERIFIED/.test(guardWindow),
  '"Continue with Google" button must be guarded by GOOGLE_OAUTH_VERIFIED within the enclosing JSX'
);
assert(
  /identity\.signInWithGoogle\s*\(\s*\)/.test(accountIdentity),
  "account-identity.tsx must invoke identity.signInWithGoogle() from the OAuth button"
);

// ─── 12. identity-debug + settings remain free of OAuth references ─────────

const oauthRefRe = /\b(OAuth|oauth|signInWithOAuth|exchangeCodeForSession|signInWithGoogle|GOOGLE_OAUTH_VERIFIED)\b/;
assert(
  !oauthRefRe.test(identityDebug),
  "identity-debug.tsx must not reference OAuth / signInWithGoogle (5.0B identity-debug wall regression)"
);
assert(
  !oauthRefRe.test(settings),
  "settings.tsx must not reference OAuth / signInWithGoogle"
);

// ─── 13. No raw token-shaped strings echoed elsewhere in the OAuth method ──

assert(
  !/access_token\s*:\s*[^,\n}]+,[\s\S]{0,200}console\./.test(signInWithGoogleBody),
  "signInWithGoogle must not log access_token alongside other fields"
);

console.log("PASS: Identity Phase 5.0F mobile Google OAuth validator");
