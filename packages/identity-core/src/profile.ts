import type { H2OProfile, H2OWorkspace, InitialWorkspaceInput } from './contracts';
import { assertValidEmail, nowIso } from './state-machine';

const DEFAULT_AVATAR_COLORS = ['violet', 'blue', 'cyan', 'green', 'amber', 'pink'] as const;
const LEGACY_AVATAR_COLOR_MAP: Record<string, typeof DEFAULT_AVATAR_COLORS[number]> = {
  '#7c3aed': 'violet',
  '#2563eb': 'blue',
  '#0891b2': 'cyan',
  '#059669': 'green',
  '#d97706': 'amber',
  '#db2777': 'pink',
};

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

export function normalizeAvatarColor(input?: string): string {
  const clean = String(input || '').trim().toLowerCase();
  if (!clean) return '';
  if ((DEFAULT_AVATAR_COLORS as readonly string[]).includes(clean)) return clean;
  return LEGACY_AVATAR_COLOR_MAP[clean] || '';
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
    avatarColor: normalizeAvatarColor(input.avatarColor) || pickAvatarColor(email),
    workspaceId,
    onboardingCompleted: true,
    createdAt: timestamp,
    updatedAt: timestamp
  };

  return { profile, workspace };
}
