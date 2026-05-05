// Phase 5.0M — single resolution point for "what avatar should I render?"
// Returns either an image URI (preferring a transient local override during
// in-flight uploads, falling back to the public Storage URL of the persisted
// avatar_path) or a color slug for the initials affordance.
//
// Consumers should treat the result as opaque and let UserAvatar render it.

import { useMemo } from 'react';

import { useIdentity } from './IdentityContext';
import { buildAvatarPublicUrl } from './avatarUpload';

export type ResolvedAvatar =
  | { kind: 'image'; uri: string }
  | { kind: 'color'; color: string | null };

export interface UseResolvedAvatarOptions {
  // Optional local URI to display instead of the persisted path — set this
  // to the picker output during the brief upload window so the UI feels
  // instantaneous. Cleared by the caller once setAvatarPath resolves.
  pendingLocalUri?: string | null;
}

export function useResolvedAvatar(options?: UseResolvedAvatarOptions): ResolvedAvatar {
  const identity = useIdentity();
  const pendingLocalUri = options?.pendingLocalUri ?? null;
  const avatarPath = identity.snapshot.profile?.avatarPath ?? null;
  const avatarColor = identity.snapshot.profile?.avatarColor ?? null;

  return useMemo<ResolvedAvatar>(() => {
    if (pendingLocalUri) {
      return { kind: 'image', uri: pendingLocalUri };
    }
    const publicUrl = buildAvatarPublicUrl(avatarPath);
    if (publicUrl) {
      return { kind: 'image', uri: publicUrl };
    }
    return { kind: 'color', color: avatarColor };
  }, [pendingLocalUri, avatarPath, avatarColor]);
}
