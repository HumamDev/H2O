import type { H2OProfile, H2OWorkspace, InitialWorkspaceInput } from './contracts';
import { assertValidEmail, nowIso } from './state-machine';

const DEFAULT_AVATAR_COLORS = ['#7c3aed', '#2563eb', '#0891b2', '#059669', '#d97706', '#db2777'] as const;

export function makeIdentityId(prefix: string): string {
  const safePrefix = String(prefix || 'id').replace(/[^a-z0-9_-]/gi, '').toLowerCase() || 'id';
  const cryptoObj = globalThis.crypto;

  if (cryptoObj?.randomUUID) {
    return `${safePrefix}_${cryptoObj.randomUUID().replace(/-/g, '').slice(0, 18)}`;
  }

  const random = Math.random().toString(36).slice(2, 12);
  const time = Date.now().toString(36);
  return `${safePrefix}_${time}${random}`;
}

export function normalizeDisplayName(input?: string, email?: string): string {
  const clean = String(input || '').trim().replace(/\s+/g, ' ');
  if (clean) return clean.slice(0, 80);

  const localPart = String(email || '').split('@')[0]?.trim();
  if (localPart) {
    return localPart
      .replace(/[._-]+/g, ' ')
      .replace(/\b\w/g, char => char.toUpperCase())
      .slice(0, 80);
  }

  return 'Local H2O User';
}

export function normalizeWorkspaceName(input?: string, displayName?: string): string {
  const clean = String(input || '').trim().replace(/\s+/g, ' ');
  if (clean) return clean.slice(0, 80);
  return displayName ? `${displayName}'s Workspace` : 'H2O Workspace';
}

export function pickAvatarColor(seed: string): string {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }
  return DEFAULT_AVATAR_COLORS[hash % DEFAULT_AVATAR_COLORS.length];
}

export function createLocalProfileAndWorkspace(input: InitialWorkspaceInput): {
  profile: H2OProfile;
  workspace: H2OWorkspace;
} {
  const email = assertValidEmail(input.email || 'local-user@h2o.local');
  const userId = makeIdentityId('local_user');
  const workspaceId = makeIdentityId('workspace');
  const displayName = normalizeDisplayName(input.displayName, email);
  const timestamp = nowIso();

  const workspace: H2OWorkspace = {
    id: workspaceId,
    ownerUserId: userId,
    name: normalizeWorkspaceName(input.workspaceName, displayName),
    origin: 'local_mock',
    createdAt: timestamp,
    updatedAt: timestamp
  };

  const profile: H2OProfile = {
    id: makeIdentityId('profile'),
    userId,
    email,
    emailVerified: true,
    displayName,
    avatarColor: input.avatarColor || pickAvatarColor(email),
    workspaceId,
    onboardingCompleted: true,
    createdAt: timestamp,
    updatedAt: timestamp
  };

  return { profile, workspace };
}
