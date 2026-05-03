export const BOOT_RESTORE_TIMEOUT_MS = 4000;

export const RECOVERY_FLOW_VERIFIED = false;

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
