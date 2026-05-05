// Identity Phase 5.0G — Mobile Apple Sign-In validator.
//
// Asserts the mobile provider, IdentityContext, account-identity surface, and
// mobileConfig wire the Phase 5.0G dormant Apple Sign-In flow correctly.
//
// What this validator enforces:
//   - mobileConfig.ts exports APPLE_OAUTH_VERIFIED. Phase A lands with
//     `false`; activation flips to `true` in a separate gated commit.
//   - identity-core declares signInWithApple on IdentityProvider; mock provider
//     stub returns identity/apple-not-supported.
//   - MobileSupabaseProvider.ts implements async signInWithApple().
//   - signInWithApple is the ONLY mobile-source call site for
//     AppleAuthentication.signInAsync and client.auth.signInWithIdToken.
//   - The signInWithIdToken call passes provider:'apple', a token value, and
//     a nonce value (the plain nonce — Supabase verifies SHA-256 against the
//     identity-token claim).
//   - The plain nonce is generated via Crypto.getRandomBytesAsync inside
//     signInWithApple, and SHA-256 hashed via Crypto.digestStringAsync with
//     HEX encoding (matching Apple's nonce-claim format).
//   - `expo-apple-authentication` is imported only in MobileSupabaseProvider.ts.
//   - `expo-apple-authentication` is declared in studio-mobile/package.json.
//   - IdentityContext.tsx exposes signInWithApple via runAction.
//   - account-identity.tsx renders "Continue with Apple" only when
//     APPLE_OAUTH_VERIFIED is true AND Platform.OS === 'ios' (within ~800
//     chars before the gate).
//   - identity-debug.tsx and settings.tsx remain free of Apple references
//     (regression check protecting the 5.0B identity-debug wall).
//   - The mobile-bundle anti-leak guard is extended to forbid console.* of
//     plaintext Apple identity tokens / nonces / authorization codes.
//   - signInWithApple return shape does not echo raw tokens / session / user.
//   - app.json does not trip the 5.0B assertNoOauthCallbackConfig regex
//     (`usesAppleSignIn` is fine — no oauth/callback/redirect/scheme match).

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

const PROVIDER_REL = "apps/studio-mobile/src/identity/MobileSupabaseProvider.ts";
const CONTEXT_REL = "apps/studio-mobile/src/identity/IdentityContext.tsx";
const ACCOUNT_REL = "apps/studio-mobile/src/app/account-identity.tsx";
const CONFIG_REL = "apps/studio-mobile/src/identity/mobileConfig.ts";
const SECURESTORE_REL = "apps/studio-mobile/src/identity/secureStore.ts";
const SETTINGS_REL = "apps/studio-mobile/src/app/settings.tsx";
const IDENTITY_DEBUG_REL = "apps/studio-mobile/src/app/identity-debug.tsx";
const CORE_CONTRACTS_REL = "packages/identity-core/src/contracts.ts";
const MOCK_PROVIDER_REL = "packages/identity-core/src/mock-provider.ts";
const PACKAGE_JSON_REL = "apps/studio-mobile/package.json";
const APP_JSON_REL = "apps/studio-mobile/app.json";

const provider = read(PROVIDER_REL);
const context = read(CONTEXT_REL);
const accountIdentity = read(ACCOUNT_REL);
const mobileConfig = read(CONFIG_REL);
const secureStore = readOptional(SECURESTORE_REL);
const settings = readOptional(SETTINGS_REL);
const identityDebug = readOptional(IDENTITY_DEBUG_REL);
const contracts = read(CORE_CONTRACTS_REL);
const mockProvider = read(MOCK_PROVIDER_REL);
const packageJson = read(PACKAGE_JSON_REL);
const appJson = read(APP_JSON_REL);

// ─── 1. mobileConfig exports APPLE_OAUTH_VERIFIED ──────────────────────────

const flagMatch = mobileConfig.match(/export\s+const\s+APPLE_OAUTH_VERIFIED\s*=\s*(true|false)/);
assert(
  flagMatch,
  "mobileConfig.ts must export APPLE_OAUTH_VERIFIED as a boolean literal"
);

// ─── 2. identity-core contract + IdentityChangeSource + mock stub ──────────

assert(
  /\bsignInWithApple\s*\(\s*\)\s*:\s*Promise<IdentitySnapshot>/.test(contracts),
  "identity-core contracts must declare signInWithApple(): Promise<IdentitySnapshot> on IdentityProvider"
);
assert(
  /'signInWithApple'/.test(contracts),
  "identity-core IdentityChangeSource union must include 'signInWithApple'"
);
assert(
  /async\s+signInWithApple\s*\(\s*\)\s*:\s*Promise<IdentitySnapshot>/.test(mockProvider),
  "MockLocalIdentityProvider must implement async signInWithApple(): Promise<IdentitySnapshot>"
);
assert(
  /identity\/apple-not-supported/.test(mockProvider),
  "MockLocalIdentityProvider.signInWithApple must return identity/apple-not-supported"
);

// ─── 3. Provider method exists ─────────────────────────────────────────────

const signInWithAppleBody = extractAsyncMethod(provider, "signInWithApple");
assert(
  signInWithAppleBody.length > 0,
  "MobileSupabaseProvider must define async signInWithApple(): Promise<IdentitySnapshot>"
);

// ─── 4. SDK calls only inside signInWithApple ──────────────────────────────

const appleCalls = [
  ["AppleAuthentication.signInAsync(", /\bAppleAuthentication\.signInAsync\s*\(/g],
  ["client.auth.signInWithIdToken(", /\bclient\.auth\.signInWithIdToken\s*\(/g],
];
for (const [label, re] of appleCalls) {
  const allMatches = [...provider.matchAll(re)];
  assert(
    allMatches.length === 1,
    `${label} must appear exactly once in MobileSupabaseProvider.ts (found ${allMatches.length})`
  );
  assert(
    signInWithAppleBody.includes(label),
    `${label} must appear inside signInWithApple`
  );
}

// ─── 5. signInWithIdToken call uses provider:'apple', token, nonce ─────────

assert(
  /provider\s*:\s*['"]apple['"]/.test(signInWithAppleBody),
  "signInWithApple must pass provider: 'apple' to signInWithIdToken"
);
assert(
  /\btoken\s*:/.test(signInWithAppleBody),
  "signInWithApple must pass a token field to signInWithIdToken (the Apple identityToken)"
);
assert(
  /\bnonce\s*:/.test(signInWithAppleBody),
  "signInWithApple must pass a nonce field to signInWithIdToken (the plain nonce; Supabase verifies SHA-256 against the JWT claim)"
);

// ─── 6. Nonce generation + hash inside signInWithApple ─────────────────────

assert(
  /Crypto\.getRandomBytesAsync\s*\(/.test(signInWithAppleBody),
  "signInWithApple must generate the plain nonce via Crypto.getRandomBytesAsync"
);
assert(
  /Crypto\.digestStringAsync\s*\(/.test(signInWithAppleBody),
  "signInWithApple must hash the nonce via Crypto.digestStringAsync"
);
assert(
  /Crypto\.CryptoDigestAlgorithm\.SHA256/.test(signInWithAppleBody),
  "signInWithApple nonce hash must use Crypto.CryptoDigestAlgorithm.SHA256"
);
assert(
  /Crypto\.CryptoEncoding\.HEX/.test(signInWithAppleBody),
  "signInWithApple nonce hash must use Crypto.CryptoEncoding.HEX (Apple's nonce claim is hex)"
);

// ─── 7. No WebCrypto subtle calls anywhere in mobile source ────────────────

const mobileBundle = [provider, accountIdentity, secureStore, context, mobileConfig].join("\n");
assert(
  !/\bcrypto\.subtle\./.test(mobileBundle),
  "mobile source must not use crypto.subtle.* (Hermes lacks WebCrypto on iOS — use expo-crypto)"
);

// ─── 8. expo-apple-authentication import ownership ─────────────────────────

const appleImportRe = /from\s+['"]expo-apple-authentication['"]|require\s*\(\s*['"]expo-apple-authentication['"]\s*\)/;
assert(
  appleImportRe.test(provider),
  "MobileSupabaseProvider.ts must import expo-apple-authentication (it owns the Apple flow)"
);
const appleImportSites = [
  ["IdentityContext.tsx", context],
  ["account-identity.tsx", accountIdentity],
  ["mobileConfig.ts", mobileConfig],
  ["secureStore.ts", secureStore],
];
for (const [label, src] of appleImportSites) {
  assert(
    !appleImportRe.test(src),
    `${label} must not import expo-apple-authentication (only MobileSupabaseProvider.ts is allowed)`
  );
}

// ─── 9. expo-apple-authentication declared in package.json ─────────────────

assert(
  /"expo-apple-authentication"\s*:\s*"[^"]+"/.test(packageJson),
  "studio-mobile/package.json must declare expo-apple-authentication as a dependency"
);

// ─── 10. Mobile-bundle anti-leak — Apple-specific identifiers ──────────────
// Forbid console.* of plaintext Apple identity tokens / authorization codes /
// nonces / private-relay markers. Same posture as 5.0E/5.0F, extended.

assert(
  !/console\.(log|warn|error|debug|info)\s*\([^)]*\b(identityToken|authorizationCode|appleNonce|appleIdToken|applePrivateRelay|id_token)\b/.test(mobileBundle),
  "mobile source must not console.* plaintext Apple identity tokens / nonces / authorization codes"
);

// ─── 11. signInWithApple return shape must not echo raw tokens/session/user ─

assert(
  !/return\s+\{[\s\S]{0,400}\b(rawSession|rawUser|access_token|refresh_token|provider_token|id_token|identityToken|authorizationCode)\s*:/.test(signInWithAppleBody),
  "signInWithApple must not return raw token / session / user / identity-token fields"
);

// ─── 12. IdentityContext exposes signInWithApple ───────────────────────────

assert(
  /\bsignInWithApple\s*:\s*\(\s*\)\s*=>\s*Promise<IdentitySnapshot>/.test(context)
    || /\bsignInWithApple\s*\(\s*\)\s*:\s*Promise<IdentitySnapshot>/.test(context),
  "IdentityContext must declare signInWithApple on IdentityContextValue"
);
assert(
  /signInWithApple\s*=\s*useCallback\s*\(/.test(context),
  "IdentityContext must define signInWithApple via useCallback so it routes through runAction"
);
assert(
  /identityProvider\.signInWithApple\s*\(\s*\)/.test(context),
  "IdentityContext signInWithApple must call identityProvider.signInWithApple()"
);

// ─── 13. account-identity gates the Apple button on flag + iOS ─────────────

assert(
  /import\s+\{[^}]*APPLE_OAUTH_VERIFIED[^}]*\}\s+from\s+['"][^'"]*mobileConfig['"]/.test(accountIdentity),
  "account-identity.tsx must import APPLE_OAUTH_VERIFIED from mobileConfig"
);
const continueIdx = accountIdentity.indexOf("Continue with Apple");
assert(
  continueIdx !== -1,
  'account-identity.tsx must render a "Continue with Apple" label'
);
const guardWindow = accountIdentity.slice(Math.max(0, continueIdx - 800), continueIdx);
assert(
  /APPLE_OAUTH_VERIFIED/.test(guardWindow),
  '"Continue with Apple" button must be guarded by APPLE_OAUTH_VERIFIED within the enclosing JSX'
);
assert(
  /Platform\.OS\s*===\s*['"]ios['"]/.test(guardWindow),
  '"Continue with Apple" button must additionally gate on Platform.OS === \'ios\' (Apple Sign-In is iOS-only)'
);
assert(
  /identity\.signInWithApple\s*\(\s*\)/.test(accountIdentity),
  "account-identity.tsx must invoke identity.signInWithApple() from the Apple button"
);

// ─── 14. identity-debug + settings remain free of Apple references ─────────

const appleRefRe = /\b(AppleAuthentication|signInWithApple|APPLE_OAUTH_VERIFIED|expo-apple-authentication)\b/;
assert(
  !appleRefRe.test(identityDebug),
  "identity-debug.tsx must not reference AppleAuthentication / signInWithApple (5.0B identity-debug wall regression)"
);
assert(
  !appleRefRe.test(settings),
  "settings.tsx must not reference AppleAuthentication / signInWithApple"
);

// ─── 15. app.json does not trip the 5.0B oauth/callback regex ──────────────
// The 5.0B assertNoOauthCallbackConfig validator forbids `\boauth\b`,
// `\bcallback\b`, `\bredirect\b`, and `\bscheme\b` (the last one excluding
// the top-level "scheme" Expo key) in `app.json`. `usesAppleSignIn` does not
// match any of these terms; this check ensures a future careless edit doesn't
// regress the wall while wiring 5.0G.

const appJsonOauthRefs = appJson.match(/\b(oauth|callback|redirect)\b/gi);
assert(
  !appJsonOauthRefs,
  `app.json must not contain oauth/callback/redirect references (found: ${appJsonOauthRefs?.join(", ") || "none"}) — regression of 5.0B wall`
);

// ─── 16. signInWithApple uses storeSession + fireAndForgetRegisterDevice + load_identity_state ─
// Sanity: the post-auth pipeline is reused, not re-implemented. Same posture
// as 5.0F's signInWithGoogle.

assert(
  /\bthis\.storeSession\s*\(/.test(signInWithAppleBody),
  "signInWithApple must reuse this.storeSession (refresh→SecureStore, access→memory)"
);
assert(
  /\bthis\.fireAndForgetRegisterDevice\s*\(\s*\)/.test(signInWithAppleBody),
  "signInWithApple must call this.fireAndForgetRegisterDevice() to register the device session"
);
assert(
  /['"]load_identity_state['"]/.test(signInWithAppleBody),
  "signInWithApple must call the load_identity_state RPC after Supabase signInWithIdToken succeeds"
);

console.log("PASS: Identity Phase 5.0G mobile Apple sign-in validator");
