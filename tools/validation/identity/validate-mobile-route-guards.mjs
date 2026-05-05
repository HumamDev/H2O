// Mobile route-guard validator (Phase 5.0K).
//
// Asserts that every mobile screen which should be gated against unauthorized
// access calls `useRouteGuard` with the correct level, and that public /
// special routes do NOT call it. Mirrors the protection table locked in
// during 5.0K design.
//
// Levels:
//   - 'sync_ready' — must be signed in AND snapshot.status === 'sync_ready'
//   - 'signed_in'  — must be signed in (snapshot.status not checked)
//   - 'public'     — accessible regardless of auth state (no hook call)
//
// Exempt routes (NOT required to call useRouteGuard, AND must NOT import it):
//   - index.tsx           — already gates via its own <Redirect> logic
//   - account-identity.tsx — public; signed-out entry point
//   - onboarding.tsx       — owns its own status-aware redirect
//   - account-billing.tsx  — has a built-in signed-out empty-state
//   - _layout.tsx          — root layout, never a screen
//
// The validator also asserts the hook itself is shaped correctly.

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

const failures = [];
function fail(msg) { failures.push(msg); }
function check(cond, msg) { if (!cond) fail(msg); }

// ─── 1. Hook shape ─────────────────────────────────────────────────────────

const HOOK_REL = "apps/studio-mobile/src/identity/useRouteGuard.tsx";
const hookSource = readOptional(HOOK_REL);
if (hookSource === null) {
  fail(`${HOOK_REL} must exist`);
} else {
  check(
    /export\s+type\s+RouteGuardLevel\s*=\s*['"]public['"]\s*\|\s*['"]signed_in['"]\s*\|\s*['"]sync_ready['"]/.test(hookSource),
    "useRouteGuard.tsx must export type RouteGuardLevel = 'public' | 'signed_in' | 'sync_ready'"
  );
  check(
    /export\s+function\s+useRouteGuard\s*\(\s*level\s*:\s*RouteGuardLevel\s*\)/.test(hookSource),
    "useRouteGuard.tsx must export function useRouteGuard(level: RouteGuardLevel)"
  );
  check(
    /<CockpitSplash\s*\/>/.test(hookSource),
    "useRouteGuard must return <CockpitSplash /> when identity is not ready"
  );
  check(
    /<Redirect\s+href=["']\/account-identity["']/.test(hookSource),
    "useRouteGuard must redirect signed-out users to /account-identity"
  );
  check(
    /<Redirect\s+href=["']\/onboarding["']/.test(hookSource),
    "useRouteGuard must redirect signed-in non-sync_ready users to /onboarding"
  );
  check(
    /useIdentity\s*\(\s*\)/.test(hookSource),
    "useRouteGuard must read identity state via useIdentity()"
  );
}

// ─── 2. Protected routes — must call useRouteGuard with the correct level ─

const PROTECTED_ROUTES = {
  // sync_ready
  "apps/studio-mobile/src/app/library.tsx": "sync_ready",
  "apps/studio-mobile/src/app/pinned.tsx": "sync_ready",
  "apps/studio-mobile/src/app/archived.tsx": "sync_ready",
  "apps/studio-mobile/src/app/search.tsx": "sync_ready",
  "apps/studio-mobile/src/app/tags.tsx": "sync_ready",
  "apps/studio-mobile/src/app/folders/index.tsx": "sync_ready",
  "apps/studio-mobile/src/app/folders/[id].tsx": "sync_ready",
  "apps/studio-mobile/src/app/chat/[id].tsx": "sync_ready",
  "apps/studio-mobile/src/app/imported-chat/[id].tsx": "sync_ready",
  "apps/studio-mobile/src/app/import-chatgpt-link.tsx": "sync_ready",
  "apps/studio-mobile/src/app/import-export.tsx": "sync_ready",
  // signed_in
  "apps/studio-mobile/src/app/menu.tsx": "signed_in",
  "apps/studio-mobile/src/app/settings.tsx": "signed_in",
  "apps/studio-mobile/src/app/debug.tsx": "signed_in",
  "apps/studio-mobile/src/app/identity-debug.tsx": "signed_in",
};

const IMPORT_RE = /import\s+\{[^}]*\buseRouteGuard\b[^}]*\}\s+from\s+['"]@\/identity\/useRouteGuard['"]/;
const EARLY_RETURN_RE = /if\s*\(\s*guard\s*\)\s*return\s+guard\s*;?/;

for (const [rel, level] of Object.entries(PROTECTED_ROUTES)) {
  const src = readOptional(rel);
  if (src === null) {
    fail(`${rel} must exist`);
    continue;
  }
  check(
    IMPORT_RE.test(src),
    `${rel} must import useRouteGuard from '@/identity/useRouteGuard'`
  );
  const callRe = new RegExp(`useRouteGuard\\s*\\(\\s*['"]${level}['"]\\s*\\)`);
  check(
    callRe.test(src),
    `${rel} must call useRouteGuard('${level}')`
  );
  check(
    EARLY_RETURN_RE.test(src),
    `${rel} must include the early-return idiom 'if (guard) return guard;'`
  );
  // Defense-in-depth: the level passed must match the table exactly. If the
  // file calls a DIFFERENT level (e.g., 'public' on a sync_ready route), flag
  // it explicitly even if the right-level call also exists.
  const otherLevels = ["public", "signed_in", "sync_ready"].filter((l) => l !== level);
  for (const other of otherLevels) {
    const otherRe = new RegExp(`useRouteGuard\\s*\\(\\s*['"]${other}['"]\\s*\\)`);
    check(
      !otherRe.test(src),
      `${rel} must not call useRouteGuard('${other}') — expected level is '${level}'`
    );
  }
}

// ─── 3. Exempt routes — must NOT import or call useRouteGuard ──────────────

const EXEMPT_ROUTES = [
  "apps/studio-mobile/src/app/index.tsx",
  "apps/studio-mobile/src/app/account-identity.tsx",
  "apps/studio-mobile/src/app/onboarding.tsx",
  "apps/studio-mobile/src/app/account-billing.tsx",
  "apps/studio-mobile/src/app/_layout.tsx",
];

for (const rel of EXEMPT_ROUTES) {
  const src = readOptional(rel);
  if (src === null) {
    fail(`${rel} must exist (exempt routes are tracked here for regression coverage)`);
    continue;
  }
  check(
    !IMPORT_RE.test(src),
    `${rel} must NOT import useRouteGuard — this route is exempt by design (handles its own guard or is public). If guarding is needed here, update the validator's PROTECTED_ROUTES table.`
  );
}

// ─── Final report ──────────────────────────────────────────────────────────

if (failures.length > 0) {
  console.error(`FAIL: Mobile route-guard validator — ${failures.length} check(s) failed:`);
  for (const msg of failures) console.error(`  • ${msg}`);
  process.exit(1);
}
console.log("PASS: Mobile route-guard validator");
