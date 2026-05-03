import type { IdentitySnapshot } from '@h2o/identity-core';

export const IDENTITY_NO_TOKEN_SURFACE_RE =
  /access_token|refresh_token|provider_token|provider_refresh_token|rawSession|rawUser|rawEmail|providerIdentity|identity_data|currentPassword|current_password|newPassword|confirmPassword|owner_user_id|deleted_at|password|token|secret|credential/i;

export function findUnsafeIdentityKeys(
  obj: unknown,
  path = 'root',
  out: string[] = []
): string[] {
  if (!obj || typeof obj !== 'object') return out;
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const p = `${path}.${k}`;
    if (IDENTITY_NO_TOKEN_SURFACE_RE.test(k)) out.push(p);
    if (v && typeof v === 'object') findUnsafeIdentityKeys(v, p, out);
  }
  return out;
}

export function selfCheckIdentitySnapshot(snapshot: IdentitySnapshot): { ok: boolean; violations: string[] } {
  const violations = findUnsafeIdentityKeys(snapshot);
  return { ok: violations.length === 0, violations };
}
