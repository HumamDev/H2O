// Identity Phase 5.0E — Device sessions validator (v1).
//
// Asserts the migration's schema, RLS, and RPC shape match the v1 spec. Phase A
// (this file) only validates the migration file's content. Phase B will extend
// this validator to also assert mobile-side calls (provider RPC payload shape,
// no plaintext-token logging, etc.) once the mobile implementation lands.
//
// What is forbidden in v1 by spec:
//   - revoke_other_device_sessions (deferred until signOut scope='others' verified)
//   - any mobile-side console.* of plaintext device-token identifiers
//
// What is required:
//   - public.device_sessions table with the exact column set + CHECK constraints
//   - RLS enabled, owner-only SELECT/UPDATE policies
//   - 3 RPCs: register_device_session, touch_device_session, list_my_device_sessions
//   - Each RPC: SECURITY DEFINER, set search_path = public, references auth.uid()
//   - Each RPC: revoke from anon/public, grant execute to authenticated

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

const MIGRATION_REL = "supabase/migrations/202605040001_identity_device_sessions.sql";
const PROVIDER_REL = "apps/studio-mobile/src/identity/MobileSupabaseProvider.ts";
const ACCOUNT_REL = "apps/studio-mobile/src/app/account-identity.tsx";
const SECURESTORE_REL = "apps/studio-mobile/src/identity/secureStore.ts";
const BROWSER_PROVIDER_REL = "tools/product/identity/identity-provider-supabase.entry.mjs";
const BROWSER_BACKGROUND_REL = "tools/product/extension/chrome-live-background.mjs";

const migration = read(MIGRATION_REL);

// ─── Schema assertions ────────────────────────────────────────────────────

// 1. Table created with the right name + 7 expected columns.
assert(
  /create table if not exists public\.device_sessions/i.test(migration),
  "migration must create public.device_sessions"
);
for (const col of [
  "id",
  "user_id",
  "surface",
  "label",
  "device_token_hash",
  "created_at",
  "last_seen_at",
  "revoked_at",
]) {
  assert(
    new RegExp(`\\b${col}\\b`).test(migration),
    `migration must declare column ${col}`
  );
}

// 2. CHECK: surface allow-list contains the v1 slug + reserved future slugs.
assert(
  /constraint device_sessions_surface_allowed check/i.test(migration),
  "migration must define device_sessions_surface_allowed CHECK"
);
const REQUIRED_SLUGS = [
  "ios_app",
  "android_app",
  "chrome_extension",
  "firefox_extension",
  "desktop_mac",
  "desktop_windows",
  "web",
];
for (const slug of REQUIRED_SLUGS) {
  assert(
    new RegExp(`'${slug}'`).test(migration),
    `device_sessions surface allow-list must include '${slug}'`
  );
}

// 3. CHECK: label length 1..64.
assert(
  /constraint device_sessions_label_length check/i.test(migration),
  "migration must define device_sessions_label_length CHECK"
);
assert(
  /char_length\(btrim\(label\)\)\s+between\s+1\s+and\s+64/i.test(migration),
  "device_sessions_label_length must enforce 1..64 chars"
);

// 4. CHECK: token-hash format is 64-char lowercase hex.
assert(
  /constraint device_sessions_token_hash_format check/i.test(migration),
  "migration must define device_sessions_token_hash_format CHECK"
);
assert(
  /'\^\[0-9a-f\]\{64\}\$'/.test(migration),
  "device_sessions_token_hash_format must enforce ^[0-9a-f]{64}$"
);

// 5. UNIQUE (user_id, device_token_hash).
assert(
  /unique\s*\(\s*user_id\s*,\s*device_token_hash\s*\)/i.test(migration),
  "device_sessions must have UNIQUE (user_id, device_token_hash)"
);

// 6. RLS enabled + owner-only SELECT/UPDATE policies.
assert(
  /alter table public\.device_sessions enable row level security/i.test(migration),
  "RLS must be enabled on device_sessions"
);
assert(
  /create policy device_sessions_owner_select[\s\S]*?for select using \(\s*auth\.uid\(\)\s*=\s*user_id\s*\)/i.test(migration),
  "device_sessions must have owner-only SELECT policy"
);
assert(
  /create policy device_sessions_owner_update[\s\S]*?for update using \(\s*auth\.uid\(\)\s*=\s*user_id\s*\)/i.test(migration),
  "device_sessions must have owner-only UPDATE policy"
);
// No INSERT or DELETE policies — those operations only via SECURITY DEFINER RPCs.
assert(
  !/create policy[^;]*device_sessions[^;]*for insert/i.test(migration),
  "device_sessions must not grant a direct INSERT policy (use the RPC)"
);
assert(
  !/create policy[^;]*device_sessions[^;]*for delete/i.test(migration),
  "device_sessions must not grant a direct DELETE policy"
);

// ─── RPC assertions ───────────────────────────────────────────────────────

const RPCS_V1 = [
  { name: "register_device_session", paramTypes: "text, text, text" },
  { name: "touch_device_session", paramTypes: "text" },
  { name: "list_my_device_sessions", paramTypes: "" },
];

for (const rpc of RPCS_V1) {
  // Definition exists.
  assert(
    new RegExp(`create or replace function public\\.${rpc.name}\\b`, "i").test(migration),
    `migration must define ${rpc.name} function`
  );

  // Locate the function body (between the CREATE statement and the closing $$;).
  const fnStart = migration.search(new RegExp(`function public\\.${rpc.name}\\b`, "i"));
  assert(fnStart !== -1, `${rpc.name}: cannot locate function definition`);
  const fnEnd = migration.indexOf("$$;", fnStart);
  assert(fnEnd !== -1, `${rpc.name}: cannot locate end of function ($$;)`);
  const fnBlock = migration.slice(fnStart, fnEnd);

  assert(
    /security\s+definer/i.test(fnBlock),
    `${rpc.name} must be SECURITY DEFINER`
  );
  assert(
    /set\s+search_path\s*=\s*public/i.test(fnBlock),
    `${rpc.name} must set search_path = public`
  );
  assert(
    /auth\.uid\(\)/.test(fnBlock),
    `${rpc.name} must reference auth.uid() to scope owner`
  );

  // Grants: revoke from anon/public, grant execute to authenticated.
  const paramsForRegex = rpc.paramTypes
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .join("\\s*,\\s*");
  const paramsRe = paramsForRegex.length > 0 ? `\\(\\s*${paramsForRegex}\\s*\\)` : `\\(\\s*\\)`;

  assert(
    new RegExp(
      `revoke\\s+all\\s+on\\s+function\\s+public\\.${rpc.name}\\s*${paramsRe}\\s+from\\s+anon\\s*,\\s*public`,
      "i"
    ).test(migration),
    `${rpc.name} must revoke from anon, public`
  );
  assert(
    new RegExp(
      `grant\\s+execute\\s+on\\s+function\\s+public\\.${rpc.name}\\s*${paramsRe}\\s+to\\s+authenticated`,
      "i"
    ).test(migration),
    `${rpc.name} must grant execute to authenticated`
  );
}

// ─── Forbidden in v1 ──────────────────────────────────────────────────────

assert(
  !/\brevoke_other_device_sessions\b/.test(migration),
  "v1 migration must NOT define revoke_other_device_sessions (deferred until signOut scope='others' verified)"
);

// ─── Client-bundle anti-leak guard (mobile + browser surfaces) ──────────────
// Both the mobile and browser device-session paths must never console.* a
// plaintext device-token identifier. Phase B (mobile) and Phase C (browser
// extension) sources are bundled together for the check.

const provider = readOptional(PROVIDER_REL);
const accountIdentity = readOptional(ACCOUNT_REL);
const secureStore = readOptional(SECURESTORE_REL);
const browserProvider = readOptional(BROWSER_PROVIDER_REL);
const browserBackground = readOptional(BROWSER_BACKGROUND_REL);
const clientBundle = [
  provider, accountIdentity, secureStore,
  browserProvider, browserBackground,
].join("\n");

assert(
  !/console\.(log|warn|error|debug|info)\s*\([^)]*\b(deviceToken|tokenNonce|tokenPlain|device_token_plaintext)\b/.test(clientBundle),
  "client source must not console.* plaintext device-token identifiers"
);

// ─── Phase C (browser): registerDeviceSession wiring assertions ─────────────
// These run unconditionally; they require the browser provider + background to
// expose the Phase C registration path. If browser sources are unreadable
// (e.g., a fresh worktree), bail with a clear error rather than silently passing.

assert(
  browserProvider.length > 0,
  `browser provider entry must be readable at ${BROWSER_PROVIDER_REL}`
);
assert(
  browserBackground.length > 0,
  `browser background must be readable at ${BROWSER_BACKGROUND_REL}`
);

// (1) Provider entry must define registerDeviceSession and call the singular
// register_device_session RPC with the three p_-prefixed params matching the
// migration's SECURITY DEFINER function signature.
assert(
  /async\s+function\s+registerDeviceSession\s*\(/.test(browserProvider),
  "browser provider entry must define async function registerDeviceSession(...)"
);
assert(
  /\.rpc\s*\(\s*["']register_device_session["']/.test(browserProvider),
  "browser provider entry must call client.rpc('register_device_session', ...)"
);
for (const param of ["p_surface", "p_label", "p_device_token_hash"]) {
  assert(
    new RegExp(`\\b${param}\\s*:`).test(browserProvider),
    `browser provider entry register_device_session call must include ${param}`
  );
}
// Provider entry must be exported via the bundle probe so the background can
// reach it. Both the supportedPlannedOps list and the exported probe object
// need to mention registerDeviceSession.
assert(
  /supportedPlannedOps[\s\S]*?["']registerDeviceSession["']/.test(browserProvider),
  "browser provider entry adapterProbe.supportedPlannedOps must include 'registerDeviceSession'"
);
assert(
  /\bregisterDeviceSession\b\s*,?\s*\n[^}]*sdkImport/.test(browserProvider)
    || /probe\s*=\s*Object\.freeze\s*\(\s*\{[\s\S]*?\bregisterDeviceSession\b[\s\S]*?\}\s*\)/.test(browserProvider),
  "browser provider entry probe export must include registerDeviceSession"
);

// (2) Background must wire the runner, define the orchestrator, and hook into
// publishSafeRuntime. It must use chrome.storage.local (NOT sync, NOT session)
// for the device-token key.
assert(
  /\bregisterDeviceSessionRunner\b/.test(browserBackground),
  "background must declare identityProviderBundleProbeState.registerDeviceSessionRunner"
);
assert(
  /probe\.registerDeviceSession\b/.test(browserBackground),
  "background must load registerDeviceSessionRunner from probe.registerDeviceSession"
);
assert(
  /async\s+function\s+identityDeviceSession_register\s*\(/.test(browserBackground),
  "background must define async function identityDeviceSession_register(...)"
);
assert(
  /async\s+function\s+identityDeviceSession_ensureToken\s*\(/.test(browserBackground),
  "background must define async function identityDeviceSession_ensureToken(...)"
);
assert(
  /async\s+function\s+identityDeviceSession_hashToken\s*\(/.test(browserBackground),
  "background must define async function identityDeviceSession_hashToken(...)"
);
assert(
  /async\s+function\s+identityDeviceSession_deriveLabel\s*\(/.test(browserBackground),
  "background must define async function identityDeviceSession_deriveLabel(...)"
);

// Storage area: device-token key must be read/written via chrome.storage.local.
// Hard-block any reference to chrome.storage.sync or chrome.storage.session
// against the IDENTITY_DEVICE_TOKEN_KEY identifier.
const deviceTokenKeySource = browserBackground.match(
  /IDENTITY_DEVICE_TOKEN_KEY\s*=\s*["']([^"']+)["']/
);
assert(
  deviceTokenKeySource && deviceTokenKeySource[1] === "h2o.identity.device.token.v1",
  "background must define IDENTITY_DEVICE_TOKEN_KEY = 'h2o.identity.device.token.v1'"
);
// Token-helper functions must use chrome.storage.local exclusively. Pull the
// blocks for ensureToken + storage helpers and confirm they only mention
// chrome.storage.local. (We allow other parts of the file to reference sync /
// session for unrelated features — this is a scoped check.)
const deviceStorageBlock = (() => {
  const start = browserBackground.indexOf("// ─── Device sessions (Phase 5.0E browser registration)");
  if (start < 0) return "";
  // Take the next ~5000 chars as the device-session block. The block sits just
  // before identityProviderSession_publishSafeRuntime, which is unique.
  const end = browserBackground.indexOf("function identityProviderSession_publishSafeRuntime", start);
  if (end < 0) return browserBackground.slice(start);
  return browserBackground.slice(start, end);
})();
assert(
  deviceStorageBlock.length > 0,
  "background must contain a labelled device-session block"
);
assert(
  /chrome\.storage\.local\b/.test(deviceStorageBlock),
  "device-session block must use chrome.storage.local"
);
assert(
  !/chrome\.storage\.sync\b/.test(deviceStorageBlock),
  "device-session block must NOT use chrome.storage.sync"
);
assert(
  !/chrome\.storage\.session\b/.test(deviceStorageBlock),
  "device-session block must NOT use chrome.storage.session"
);

// Hook: identityDeviceSession_register must be called from publishSafeRuntime
// (or some other auth-success converging point that runs on rawSession).
const publishBlockIndex = browserBackground.indexOf(
  "function identityProviderSession_publishSafeRuntime"
);
assert(
  publishBlockIndex >= 0,
  "background must define identityProviderSession_publishSafeRuntime"
);
const publishBlock = browserBackground.slice(publishBlockIndex, publishBlockIndex + 4000);
assert(
  /identityDeviceSession_register\s*\(\s*opts\.rawSession\s*\)/.test(publishBlock),
  "publishSafeRuntime must invoke identityDeviceSession_register(opts.rawSession)"
);

console.log("PASS: Identity Phase 5.0E device sessions validator");
