// Phase 5.0M — single render point for the user's profile avatar.
// Image (uploaded to public Storage) is preferred when present; the
// avatar_color slug is the perpetual fallback so users can never end up with
// no avatar visible. If the image fails to load (transient network, race
// after a delete), we fall back to the colored initials affordance for the
// duration of the render.

import { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';
import { useResolvedAvatar, type UseResolvedAvatarOptions } from '@/identity/useResolvedAvatar';

// Local 6-swatch palette mirroring PROFILE_AVATAR_PALETTE in
// account-identity.tsx and SIDEBAR_AVATAR_PALETTE in Sidebar.tsx.
// All three keep the same key→hex pairs intentionally — kept inline rather
// than centralized to avoid a refactor in this milestone.
const AVATAR_SWATCH_HEX: Record<string, string> = {
  violet: '#7C3AED',
  blue: '#2563EB',
  cyan: '#0891B2',
  green: '#059669',
  amber: '#D97706',
  pink: '#DB2777',
};

function resolveSwatch(slug: string | null | undefined): string | null {
  if (!slug) return null;
  return AVATAR_SWATCH_HEX[slug.trim()] ?? null;
}

function computeInitials(displayName?: string | null, email?: string | null): string {
  const source = (displayName?.trim() || email?.trim() || '').replace(/[^A-Za-z0-9 ]/g, ' ').trim();
  if (!source) return '•';
  const parts = source.split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

export interface UserAvatarProps extends UseResolvedAvatarOptions {
  size: number;
  displayName?: string | null;
  email?: string | null;
}

export function UserAvatar({ size, displayName, email, pendingLocalUri }: UserAvatarProps) {
  const th = useTheme();
  const resolved = useResolvedAvatar({ pendingLocalUri });
  const [imageFailed, setImageFailed] = useState(false);

  const initials = computeInitials(displayName, email);
  const radius = Math.round(size / 2);
  const fontSize = Math.max(12, Math.round(size * 0.4));

  const colorSlug = resolved.kind === 'color' ? resolved.color : null;
  const swatchHex = resolveSwatch(colorSlug);
  const fallbackBg = swatchHex ?? (th.scheme === 'light' ? '#fff' : th.backgroundSelected);
  const fallbackFg = swatchHex ? '#fff' : th.text;

  const showImage = resolved.kind === 'image' && !imageFailed;

  return (
    <View
      style={[
        styles.base,
        {
          width: size,
          height: size,
          borderRadius: radius,
          backgroundColor: fallbackBg,
        },
      ]}
      accessible
      accessibilityRole="image"
      accessibilityLabel={
        showImage
          ? `Profile picture for ${displayName || email || 'account'}`
          : `Avatar initials ${initials} for ${displayName || email || 'account'}`
      }>
      {showImage ? (
        <Image
          source={{ uri: resolved.uri }}
          style={[styles.image, { width: size, height: size, borderRadius: radius }]}
          onError={() => setImageFailed(true)}
        />
      ) : (
        <Text style={[styles.initials, { color: fallbackFg, fontSize }]}>
          {initials}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  image: {
    resizeMode: 'cover',
  },
  initials: {
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
