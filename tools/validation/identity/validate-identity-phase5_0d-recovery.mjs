// Identity Phase 5.0D mobile recovery validator.
//
// Asserts the post-implementation state of v1 email-code recovery on mobile:
//   - provider methods replaced (no longer inert stubs)
//   - request stage uses signInWithOtp({ shouldCreateUser: false })
//   - verify stage uses verifyOtp({ type: 'email' }) — NOT 'recovery'
//   - set-password stage uses updateUser({ password }) — NO current_password
//   - request/verify never write session/refresh token/session metadata
//     (scratch tokens stay in memory only until set-password promotes them)
//   - resetPasswordForEmail is forbidden anywhere in mobile source
//   - type:'recovery' / type:'recovery_code' is forbidden anywhere in mobile source
//   - UI "Forgot password?" link is gated on RECOVERY_FLOW_VERIFIED
//   - passwords / recovery scratch are never console-logged
//   - requestRecoveryCode does not branch on user-existence signals (anti-enumeration)
//
// Activation gating (flag=true requires live-inbox QA closeout ledger) is enforced
// in the relaxed assert-16 of the 5.0B mobile alignment validator, which runs
// alongside this validator in the identity release gate.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

function read(rel) {
  return fs.readFileSync(path.join(REPO_ROOT, rel), "utf8");
}

function assert(cond, msg) {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exit(1);
  }
}

// Extract the body of an async method by name. Returns the substring between
// the opening `{` after the signature and its matching `}`.
function extractBlockByName(source, name) {
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

// ─── Inputs ────────────────────────────────────────────────────────────────

const PROVIDER_REL = "apps/studio-mobile/src/identity/MobileSupabaseProvider.ts";
const ACCOUNT_REL = "apps/studio-mobile/src/app/account-identity.tsx";
const CONFIG_REL = "apps/studio-mobile/src/identity/mobileConfig.ts";
const CONTEXT_REL = "apps/studio-mobile/src/identity/IdentityContext.tsx";

const provider = read(PROVIDER_REL);
const accountIdentity = read(ACCOUNT_REL);
const mobileConfig = read(CONFIG_REL);
const identityContext = read(CONTEXT_REL);

// ─── Assert 1: provider stubs replaced ─────────────────────────────────────

for (const fnName of ["requestRecoveryCode", "verifyRecoveryCode", "setPasswordAfterRecovery"]) {
  const body = extractBlockByName(provider, fnName);
  assert(body.length > 0, `${fnName}: provider method body not found`);
  assert(
    !body.includes("identity/recovery-flow-not-verified"),
    `${fnName}: must no longer be the inert stub returning 'identity/recovery-flow-not-verified'`
  );
}

// ─── Assert 2: requestRecoveryCode uses signInWithOtp / shouldCreateUser:false / no token writes ─

{
  const body = extractBlockByName(provider, "requestRecoveryCode");
  assert(
    /signInWithOtp\s*\(/.test(body),
    "requestRecoveryCode must call client.auth.signInWithOtp(...)"
  );
  assert(
    /shouldCreateUser\s*:\s*false/.test(body),
    "requestRecoveryCode must pass shouldCreateUser: false to signInWithOtp"
  );
  assert(
    !/\bstoreSession\s*\(|\bwriteRefreshToken\s*\(|\bwriteSessionMeta\s*\(/.test(body),
    "requestRecoveryCode must not write session / refresh token / session metadata"
  );
}

// ─── Assert 3: verifyRecoveryCode uses verifyOtp(type:'email') / no token writes ──

{
  const body = extractBlockByName(provider, "verifyRecoveryCode");
  assert(
    /verifyOtp\s*\(/.test(body),
    "verifyRecoveryCode must call client.auth.verifyOtp(...)"
  );
  assert(
    /type\s*:\s*['"]email['"]/.test(body),
    "verifyRecoveryCode must pass type: 'email' to verifyOtp (must NOT use 'recovery')"
  );
  assert(
    !/type\s*:\s*['"]recovery['"]/.test(body),
    "verifyRecoveryCode must not pass type: 'recovery' to verifyOtp"
  );
  assert(
    !/\bstoreSession\s*\(|\bwriteRefreshToken\s*\(|\bwriteSessionMeta\s*\(/.test(body),
    "verifyRecoveryCode must not write session / refresh token / session metadata (recovery scratch must stay in memory until set-password)"
  );
}

// ─── Assert 4: setPasswordAfterRecovery uses updateUser without current_password ──

{
  const body = extractBlockByName(provider, "setPasswordAfterRecovery");
  assert(
    /updateUser\s*\(/.test(body),
    "setPasswordAfterRecovery must call client.auth.updateUser(...)"
  );
  assert(
    !/current_password\s*[:,]/.test(body),
    "setPasswordAfterRecovery must not pass current_password (recovery context cannot require old password)"
  );
  assert(
    /\bstoreSession\s*\(/.test(body),
    "setPasswordAfterRecovery must call storeSession on success to graduate the recovery scratch session to a normal persisted session"
  );
}

// ─── Assert 5: no resetPasswordForEmail anywhere in mobile source ──────────

const mobileBundle = [provider, accountIdentity, mobileConfig, identityContext].join("\n");
assert(
  !/resetPasswordForEmail/.test(mobileBundle),
  "resetPasswordForEmail is forbidden in mobile source (5.0D v1)"
);

// ─── Assert 6: no type:'recovery' / type:'recovery_code' anywhere in mobile source ─

assert(
  !/type\s*:\s*['"]recovery['"]|type\s*:\s*['"]recovery_code['"]/.test(mobileBundle),
  "type:'recovery' and type:'recovery_code' are forbidden in mobile source (5.0D v1)"
);

// ─── Assert 7: UI "Forgot password?" link gated on RECOVERY_FLOW_VERIFIED ──

{
  assert(
    /import\s+\{[^}]*RECOVERY_FLOW_VERIFIED[^}]*\}\s+from\s+['"][^'"]*mobileConfig['"]/.test(accountIdentity),
    "account-identity.tsx must import RECOVERY_FLOW_VERIFIED from mobileConfig"
  );
  const forgotIdx = accountIdentity.indexOf("Forgot password?");
  assert(forgotIdx !== -1, 'account-identity.tsx must render a "Forgot password?" link');
  // Look in the 800-char window before the literal for the gating identifier.
  const guardWindow = accountIdentity.slice(Math.max(0, forgotIdx - 800), forgotIdx);
  assert(
    /RECOVERY_FLOW_VERIFIED/.test(guardWindow),
    '"Forgot password?" link must be guarded by RECOVERY_FLOW_VERIFIED within the enclosing JSX'
  );
}

// ─── Assert 8: passwords / recovery scratch never console-logged ───────────

assert(
  !/console\.(log|warn|error|debug|info)\s*\([^)]*\b(currentPassword|newPassword|recoveryNewPassword|recoveryConfirmPassword)\b/.test(accountIdentity),
  "account-identity.tsx must not console.* password values"
);
assert(
  !/console\.(log|warn|error|debug|info)\s*\([^)]*\b(currentPassword|newPassword|recoveryAccessToken|recoveryRefreshToken)\b/.test(provider),
  "MobileSupabaseProvider.ts must not console.* password or recovery-scratch values"
);

// ─── Assert 9: anti-enumeration — requestRecoveryCode must not branch on user existence ──

{
  const body = extractBlockByName(provider, "requestRecoveryCode");
  // Strip comments before testing — comments may legitimately mention these terms
  // when explaining the anti-enumeration property; we care about CODE branches.
  const codeOnly = body
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
  assert(
    !/user[\s_-]?not[\s_-]?found|email[\s_-]?not[\s_-]?registered|unknown[\s_-]?email|no[\s_-]?such[\s_-]?user/i.test(codeOnly),
    "requestRecoveryCode must not branch on user-existence signals (anti-enumeration)"
  );
}

console.log("PASS: Identity Phase 5.0D mobile recovery validator");
