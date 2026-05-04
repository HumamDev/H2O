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

// ─── Mobile-source anti-leak guard (Phase A: best-effort; Phase B: tighten) ─
// Even before Phase B lands, any handwritten code in the mobile tree must not
// console.* a plaintext device-token identifier. The check is vacuously true
// today (no such code yet) but locks the policy in.

const provider = readOptional(PROVIDER_REL);
const accountIdentity = readOptional(ACCOUNT_REL);
const secureStore = readOptional(SECURESTORE_REL);
const mobileBundle = [provider, accountIdentity, secureStore].join("\n");

assert(
  !/console\.(log|warn|error|debug|info)\s*\([^)]*\b(deviceToken|tokenNonce|tokenPlain|device_token_plaintext)\b/.test(mobileBundle),
  "mobile source must not console.* plaintext device-token identifiers"
);

console.log("PASS: Identity Phase 5.0E device sessions validator");
