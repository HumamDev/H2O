export const BOOT_RESTORE_TIMEOUT_MS = 4000;

export const RECOVERY_FLOW_VERIFIED = true;

// Phase 5.0F mobile Google OAuth — dormant by default. Flip to true ONLY after
// the live-iPhone QA matrix passes (see Phase 5.0F closeout doc, future commit).
// While false, the "Continue with Google" button is hidden in the signed-out
// view; the provider method exists but is unreachable from the UI.
export const GOOGLE_OAUTH_VERIFIED = true;

// Phase 5.0G mobile Apple Sign-In — dormant by default. Flip to true ONLY after
// the live-iPhone QA matrix passes (see Phase 5.0G closeout doc, future commit).
// While false, the "Continue with Apple" button is hidden in the signed-out
// view; the provider method exists but is unreachable from the UI. The button
// is additionally gated on Platform.OS === 'ios' since expo-apple-authentication
// is iOS-only.
export const APPLE_OAUTH_VERIFIED = false;

const _url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const _anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

export interface MobileSupabaseConfig {
  url: string;
  anonKey: string;
}

export function hasMobileSupabaseConfig(): boolean {
  return Boolean(_url && _anonKey);
}

export function getMobileSupabaseConfig(): MobileSupabaseConfig | null {
  if (!hasMobileSupabaseConfig()) return null;
  return { url: _url, anonKey: _anonKey };
}
