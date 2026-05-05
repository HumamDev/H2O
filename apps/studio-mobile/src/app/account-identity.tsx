import { SymbolView } from 'expo-symbols';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { DeviceSession, DeviceSessionSurface } from '@h2o/identity-core';

import { useTopBarMetrics } from '@/components/navigation/AppTopBar';
import { useIdentity } from '@/identity/IdentityContext';
import { GOOGLE_OAUTH_VERIFIED, RECOVERY_FLOW_VERIFIED } from '@/identity/mobileConfig';
import { useTheme } from '@/hooks/use-theme';
import { spacing, typography } from '@/theme';

const PRIMARY = '#208AEF';
const DANGER = '#E15554';

// Cockpit Pro signed-out palette — warm-charcoal premium dark, scoped to the
// signed-out branch only. The signed-in branch keeps the existing system
// theme colors via useTheme().
const COCKPIT_BG = '#1B1B19';
const COCKPIT_BG_RAISED = '#262624';
const COCKPIT_BG_HOVER = '#2D2D2A';
const COCKPIT_HAIR = 'rgba(255,255,255,0.09)';
const COCKPIT_HAIR_STRONG = 'rgba(255,255,255,0.14)';
const COCKPIT_INK = '#ECEAE3';
const COCKPIT_INK_MUTED = '#C9C6BD';
const COCKPIT_INK_DIM = '#8F8C82';
const COCKPIT_INK_FAINT = '#5F5C54';
const COCKPIT_COBALT = '#5B7BC9';
const COCKPIT_CYAN = '#8AAAD6';
const COCKPIT_CYAN_SOFT = 'rgba(138,170,214,0.12)';
const COCKPIT_EMBER = '#D97757';
const COCKPIT_EMBER_SOFT = 'rgba(217,119,87,0.14)';

// Inline brand mark — composes a SymbolView (scope/crosshair) inside a tinted
// circular medallion. Avoids a new react-native-svg dependency for v1.
function CockpitMark({ size }: { size: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: COCKPIT_BG_RAISED,
        borderWidth: 1,
        borderColor: 'rgba(138,170,214,0.32)',
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: COCKPIT_COBALT,
        shadowOpacity: 0.28,
        shadowRadius: 22,
        shadowOffset: { width: 0, height: 0 },
      }}>
      <SymbolView
        name={{ ios: 'scope', android: 'gps_fixed', web: 'gps_fixed' }}
        size={Math.round(size * 0.5)}
        weight="regular"
        tintColor={COCKPIT_CYAN}
      />
    </View>
  );
}

// Local 6-swatch palette for the profile-edit avatar picker.
// IMPORTANT: the Supabase profiles.avatar_color column is constrained to
// slugs matching ^[a-z0-9][a-z0-9_-]{0,31}$ (see migration
// 202604300001_identity_profile_workspace_rls.sql). The picker therefore
// stores/sends the slug (entry.key) and renders the hex (entry.color) only
// for visual purposes.
const PROFILE_AVATAR_PALETTE = [
  { key: 'violet', color: '#7C3AED' },
  { key: 'blue',   color: '#2563EB' },
  { key: 'cyan',   color: '#0891B2' },
  { key: 'green',  color: '#059669' },
  { key: 'amber',  color: '#D97706' },
  { key: 'pink',   color: '#DB2777' },
] as const;

function resolveAvatarSwatch(slug: string | null | undefined): string | null {
  if (!slug) return null;
  const trimmed = slug.trim();
  if (!trimmed) return null;
  const entry = PROFILE_AVATAR_PALETTE.find((e) => e.key === trimmed);
  return entry ? entry.color : null;
}

type SymbolName = React.ComponentProps<typeof SymbolView>['name'];
type SignInTab = 'sign_in' | 'create_account';
type SignInMode = 'password' | 'code';
type PendingCodeKind = 'sign_in' | 'sign_up';

const SUPPRESSED_ERROR_CODES = new Set<string>([
  'identity/no-refresh-token',
  'identity/provider-not-configured',
  'identity/recovery-flow-not-verified',
  'identity/change-password-deferred',
  'identity/callback-not-supported',
]);

const FRIENDLY_ERRORS: Record<string, string> = {
  'identity/invalid-email': 'Enter a valid email address.',
  'identity/missing-email': 'Enter an email address.',
  'identity/missing-password': 'Enter a password.',
  'identity/missing-code': 'Enter the verification code.',
  'identity/sign-in-email-failed': "Couldn't request a code. Try again.",
  'identity/verify-email-failed': "Couldn't verify the code. It may have expired.",
  'identity/sign-up-failed': "Couldn't create the account. Try a different email.",
  'identity/verify-signup-failed': "Couldn't verify the code. It may have expired.",
  'identity/sign-in-password-failed': 'Sign in failed. Check your email and password.',
  'identity/sign-in-failed': 'Sign in failed. Check your email and password.',
  'identity/refresh-session-failed': "Couldn't restore your session. Please sign in again.",
  'identity/no-session': 'Please sign in to continue.',
  'identity/no-profile': 'Profile is unavailable.',
  'identity/snapshot-leak': 'Session is invalid. Please sign in again.',
  // Change-password specific:
  'identity/missing-current-password': 'Enter your current password.',
  'identity/missing-new-password': 'Enter a new password.',
  'identity/password-too-short': 'New password must be at least 8 characters.',
  'identity/password-mismatch': "New password and confirmation don't match.",
  'identity/password-same-as-current': 'New password must be different from current.',
  'identity/password-current-invalid': 'Your current password is incorrect.',
  'identity/password-weak': 'New password is too weak. Try a longer one.',
  'identity/password-update-requires-recent-code': 'For security, sign in again and try once more.',
  'identity/password-update-session-missing': 'Your session expired. Please sign in again.',
  'identity/password-update-failed': "Couldn't update password. Try again.",
  'identity/provider-rate-limited': 'Too many attempts. Wait a moment, then try again.',
  'identity/provider-network-failed': 'Network error. Check your connection.',
  'identity/provider-rejected': 'Request rejected. Try again later.',
  // Recovery (5.0D) specific:
  'identity/recovery-state-invalid': 'Start the recovery flow again from your email.',
  'identity/request-recovery-failed': "Couldn't request a code. Try again in a moment.",
  'identity/verify-recovery-failed': "That code didn't work. Try requesting a new one.",
  'identity/recovery-code-expired': 'Your code expired. Request a new one.',
  'identity/recovery-email-not-registered': 'This email is not registered. Please enter a registered email or sign up.',
  // Profile edit specific:
  'identity/missing-display-name': 'Enter a display name.',
  'identity/update-profile-failed': "Couldn't update your profile. Try again.",
  // Workspace rename specific:
  'identity/missing-workspace-name': 'Enter a workspace name.',
  'identity/rename-workspace-failed': "Couldn't update workspace name. Try again.",
  // Google OAuth (5.0F) specific:
  'identity/oauth-cancelled': 'Google sign-in was cancelled.',
  'identity/oauth-failed': "Couldn't sign in with Google. Try again.",
  'identity/oauth-exchange-failed': "Google sign-in didn't complete. Try again.",
  'identity/oauth-callback-invalid': 'Google sign-in returned an invalid response.',
  'identity/oauth-callback-parse-failed': 'Google callback could not be parsed.',
  'identity/oauth-callback-error-without-code': 'Google returned an OAuth error.',
  'identity/oauth-callback-no-code-no-error': 'Google callback had no code or error.',
  'identity/oauth-provider-unavailable': 'Google sign-in is not available right now.',
  'identity/oauth-not-supported': 'Google sign-in is not available in this build.',
};

function friendlyErrorCopy(code: string | null | undefined): string | null {
  if (!code) return null;
  if (SUPPRESSED_ERROR_CODES.has(code)) return null;
  return FRIENDLY_ERRORS[code] ?? 'Something went wrong. Try again.';
}

function surfaceIcon(surface: DeviceSessionSurface): SymbolName {
  switch (surface) {
    case 'ios_app':
      return { ios: 'iphone', android: 'phone_iphone', web: 'phone_iphone' };
    case 'android_app':
      return { ios: 'iphone', android: 'phone_android', web: 'phone_android' };
    case 'chrome_extension':
    case 'firefox_extension':
    case 'web':
      return { ios: 'globe', android: 'public', web: 'public' };
    case 'desktop_mac':
      return { ios: 'desktopcomputer', android: 'computer', web: 'computer' };
    case 'desktop_windows':
      return { ios: 'pc', android: 'computer', web: 'computer' };
    default:
      return { ios: 'iphone', android: 'phone_iphone', web: 'phone_iphone' };
  }
}

function formatLastActive(iso: string): string {
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return 'Just now';
  const seconds = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 86400 * 7) return `${Math.floor(seconds / 86400)}d ago`;
  return new Date(ts).toLocaleDateString();
}

function initialsOf(displayName?: string | null, email?: string | null): string {
  const source = (displayName?.trim() || email?.trim() || '').replace(/[^A-Za-z0-9 ]/g, ' ').trim();
  if (!source) return '•';
  const parts = source.split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

export default function AccountIdentityScreen() {
  const th = useTheme();
  const identity = useIdentity();
  const { contentTopPadding, contentBottomPadding } = useTopBarMetrics();

  const [tab, setTab] = useState<SignInTab>('sign_in');
  const [mode, setMode] = useState<SignInMode>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const passwordRef = useRef<TextInput>(null);

  // Change-password form state (signed-in only)
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [localChangePasswordError, setLocalChangePasswordError] = useState<string | null>(null);
  const [changePasswordSubmitted, setChangePasswordSubmitted] = useState(false);
  const [changePasswordSuccess, setChangePasswordSuccess] = useState(false);
  const newPasswordRef = useRef<TextInput>(null);
  const confirmPasswordRef = useRef<TextInput>(null);
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Workspace edit state (signed-in only)
  const [showEditWorkspace, setShowEditWorkspace] = useState(false);
  const [editWorkspaceName, setEditWorkspaceName] = useState('');
  const [localWorkspaceError, setLocalWorkspaceError] = useState<string | null>(null);
  const [workspaceEditSuccess, setWorkspaceEditSuccess] = useState(false);
  const editWorkspaceNameRef = useRef<TextInput>(null);
  const workspaceSuccessTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Recovery form state (signed-out only; gated on RECOVERY_FLOW_VERIFIED)
  const [recoveryStage, setRecoveryStage] = useState<'request' | 'verify' | 'set_password' | null>(null);
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [recoveryNewPassword, setRecoveryNewPassword] = useState('');
  const [recoveryConfirmPassword, setRecoveryConfirmPassword] = useState('');
  const [localRecoveryError, setLocalRecoveryError] = useState<string | null>(null);
  const recoveryNewPasswordRef = useRef<TextInput>(null);
  const recoveryConfirmPasswordRef = useRef<TextInput>(null);

  // Profile edit state (signed-in only)
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editAvatarColor, setEditAvatarColor] = useState<string>('');
  const [localProfileError, setLocalProfileError] = useState<string | null>(null);
  const [profileEditSuccess, setProfileEditSuccess] = useState(false);
  const editDisplayNameRef = useRef<TextInput>(null);
  const profileSuccessTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Active sessions state (signed-in only).
  const [sessions, setSessions] = useState<DeviceSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [sessionsLoadedOnce, setSessionsLoadedOnce] = useState(false);

  const snapshot = identity.snapshot;
  const pendingCodeKind: PendingCodeKind | null =
    snapshot.status === 'email_pending'
      ? 'sign_in'
      : snapshot.status === 'email_confirmation_pending'
        ? 'sign_up'
        : null;

  useEffect(() => {
    if (identity.isSignedIn) {
      setEmail('');
      setPassword('');
      setCode('');
      setMode('password');
      setTab('sign_in');
    } else {
      // signed out — clear change-password state too
      setShowChangePassword(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      setLocalChangePasswordError(null);
      setChangePasswordSubmitted(false);
      setChangePasswordSuccess(false);
      // also clear recovery state on sign-out
      setRecoveryStage(null);
      setRecoveryEmail('');
      setRecoveryCode('');
      setRecoveryNewPassword('');
      setRecoveryConfirmPassword('');
      setLocalRecoveryError(null);
      // also clear profile-edit state on sign-out
      setShowEditProfile(false);
      setEditDisplayName('');
      setEditAvatarColor('');
      setLocalProfileError(null);
      setProfileEditSuccess(false);
      // also clear workspace-edit state on sign-out
      setShowEditWorkspace(false);
      setEditWorkspaceName('');
      setLocalWorkspaceError(null);
      setWorkspaceEditSuccess(false);
      // also clear active-sessions state on sign-out
      setSessions([]);
      setCurrentSessionId(null);
      setSessionsLoading(false);
      setSessionsError(null);
      setSessionsLoadedOnce(false);
    }
  }, [identity.isSignedIn]);

  useEffect(() => {
    return () => {
      if (successTimerRef.current) {
        clearTimeout(successTimerRef.current);
        successTimerRef.current = null;
      }
      if (profileSuccessTimerRef.current) {
        clearTimeout(profileSuccessTimerRef.current);
        profileSuccessTimerRef.current = null;
      }
      if (workspaceSuccessTimerRef.current) {
        clearTimeout(workspaceSuccessTimerRef.current);
        workspaceSuccessTimerRef.current = null;
      }
    };
  }, []);

  const { listDeviceSessions, isSignedIn: identityIsSignedIn } = identity;

  const refreshSessions = useCallback(async () => {
    setSessionsLoading(true);
    setSessionsError(null);
    try {
      const result = await listDeviceSessions();
      setSessions(result.sessions);
      setCurrentSessionId(result.currentSessionId);
      if (result.sessions.length === 0) {
        setSessionsError("Couldn't load active sessions. Tap refresh to retry.");
      }
    } catch {
      setSessionsError("Couldn't load active sessions. Tap refresh to retry.");
    } finally {
      setSessionsLoading(false);
      setSessionsLoadedOnce(true);
    }
  }, [listDeviceSessions]);

  useEffect(() => {
    if (!identityIsSignedIn) return;
    void refreshSessions();
  }, [identityIsSignedIn, refreshSessions]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        safe: { flex: 1, backgroundColor: th.background },
        kav: { flex: 1 },
        content: { padding: spacing.md, gap: spacing.lg },
        centered: {
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          gap: spacing.sm,
        },
        checkingLabel: { ...typography.body, color: th.textSecondary },

        accountPanel: {
          backgroundColor: th.backgroundElement,
          borderRadius: 28,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: th.backgroundSelected,
          padding: spacing.lg,
          gap: spacing.md,
        },
        accountTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
        avatar: {
          width: 64,
          height: 64,
          borderRadius: 32,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: th.backgroundSelected,
        },
        avatarInitials: { fontSize: 22, fontWeight: '700' },
        accountText: { flex: 1, gap: 3 },
        accountTitle: { ...typography.title, color: th.text },
        accountSubtitle: { ...typography.body, color: th.textSecondary },
        statusPill: {
          paddingHorizontal: 10,
          paddingVertical: 6,
          borderRadius: 999,
          backgroundColor: th.backgroundSelected,
          alignSelf: 'flex-start',
        },
        statusPillText: { ...typography.caption, color: th.text, fontWeight: '600' },

        section: { gap: spacing.xs },
        sectionLabel: {
          fontSize: 11,
          fontWeight: '600',
          letterSpacing: 0.6,
          color: th.textSecondary,
          paddingHorizontal: spacing.xs,
        },
        sectionHelp: {
          fontSize: 12,
          lineHeight: 17,
          color: th.textSecondary,
          paddingHorizontal: spacing.xs,
          marginTop: -2,
        },
        card: {
          backgroundColor: th.backgroundElement,
          borderRadius: 16,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: th.backgroundSelected,
          overflow: 'hidden',
        },
        row: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
          paddingHorizontal: spacing.md,
          paddingVertical: 14,
          minHeight: 68,
        },
        rowDisabled: { opacity: 0.72 },
        rowIconWrap: {
          width: 38,
          height: 38,
          borderRadius: 19,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: th.scheme === 'light' ? '#fff' : th.backgroundSelected,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: th.backgroundSelected,
        },
        rowBody: { flex: 1, gap: 3 },
        rowTitle: { ...typography.body, color: th.text, fontWeight: '600' },
        rowSubtitle: { fontSize: 12, lineHeight: 17, color: th.textSecondary },
        rowTrailing: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.xs,
          flexShrink: 0,
          maxWidth: '55%',
        },
        rowTrailingText: { ...typography.caption, color: th.textSecondary, fontWeight: '600' },
        rowValue: { ...typography.body, color: th.text, textAlign: 'right' },
        separator: {
          height: StyleSheet.hairlineWidth,
          backgroundColor: th.backgroundSelected,
          marginLeft: spacing.md,
        },

        activePill: {
          paddingHorizontal: 10,
          paddingVertical: 4,
          borderRadius: 999,
          backgroundColor: th.accent,
        },
        activePillText: { ...typography.caption, color: '#fff', fontWeight: '700' },

        currentDevicePill: {
          paddingHorizontal: 10,
          paddingVertical: 4,
          borderRadius: 999,
          backgroundColor: th.accentSoft,
        },
        currentDevicePillText: { ...typography.caption, color: th.accent, fontWeight: '700' },
        sessionsRefreshButton: {
          alignSelf: 'flex-start',
          paddingHorizontal: spacing.md,
          paddingVertical: 8,
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.xs,
        },
        sessionsRefreshText: { ...typography.caption, color: th.accent, fontWeight: '600' },

        hero: { gap: spacing.xs },
        heroTitle: { ...typography.title, color: th.text, fontSize: 26 },
        heroSubtitle: { ...typography.body, color: th.textSecondary, lineHeight: 21 },

        tabs: {
          flexDirection: 'row',
          backgroundColor: th.backgroundElement,
          borderRadius: 12,
          padding: 4,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: th.backgroundSelected,
        },
        tabsBusy: { opacity: 0.5 },
        tabButton: {
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          paddingVertical: 10,
          borderRadius: 9,
        },
        tabButtonActive: {
          backgroundColor: th.scheme === 'light' ? '#fff' : th.backgroundSelected,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: th.backgroundSelected,
          shadowColor: '#000',
          shadowOpacity: 0.08,
          shadowRadius: 4,
          shadowOffset: { width: 0, height: 1 },
          elevation: 1,
        },
        tabButtonText: { ...typography.body, color: th.textSecondary, fontWeight: '600' },
        tabButtonTextActive: { color: th.text },

        formCard: {
          backgroundColor: th.backgroundElement,
          borderRadius: 16,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: th.backgroundSelected,
          padding: spacing.md,
          gap: spacing.md,
        },
        field: { gap: 6 },
        fieldLabel: {
          ...typography.caption,
          color: th.textSecondary,
          fontWeight: '600',
          letterSpacing: 0.5,
        },
        input: {
          ...typography.body,
          color: th.text,
          backgroundColor: th.background,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: th.backgroundSelected,
          borderRadius: 10,
          paddingHorizontal: spacing.md,
          paddingVertical: 14,
        },
        pendingEmail: { ...typography.body, color: th.text },

        primaryButton: {
          minHeight: 46,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: th.accent,
          borderRadius: 10,
          paddingHorizontal: spacing.md,
          paddingVertical: 12,
        },
        buttonDisabled: { opacity: 0.5 },
        primaryButtonText: { ...typography.body, color: '#fff', fontWeight: '700' },
        oauthButton: {
          minHeight: 46,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          gap: spacing.sm,
          backgroundColor: th.scheme === 'light' ? '#fff' : th.backgroundElement,
          borderRadius: 10,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: th.backgroundSelected,
          paddingHorizontal: spacing.md,
          paddingVertical: 12,
        },
        oauthButtonText: { ...typography.body, color: th.text, fontWeight: '700' },
        oauthGlyphCircle: {
          width: 22,
          height: 22,
          borderRadius: 11,
          backgroundColor: th.backgroundSelected,
          alignItems: 'center',
          justifyContent: 'center',
        },
        oauthGlyphLetter: {
          fontSize: 13,
          fontWeight: '800',
          color: th.text,
        },
        oauthDivider: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.sm,
          paddingVertical: spacing.xs,
        },
        oauthDividerLine: {
          flex: 1,
          height: StyleSheet.hairlineWidth,
          backgroundColor: th.backgroundSelected,
        },
        oauthDividerText: {
          ...typography.caption,
          color: th.textSecondary,
        },
        linkButton: { paddingVertical: 6, alignItems: 'center' },
        linkButtonText: { ...typography.caption, color: th.accent, fontWeight: '600' },
        linkButtonTextNeutral: {
          ...typography.caption,
          color: th.textSecondary,
          fontWeight: '600',
        },

        errorBanner: {
          backgroundColor: th.scheme === 'light' ? '#FDECEC' : '#3A1E1E',
          borderRadius: 10,
          padding: spacing.md,
        },
        errorBannerText: {
          ...typography.body,
          color: th.scheme === 'light' ? '#A12727' : '#F4B4B4',
        },
        successBanner: {
          backgroundColor: th.scheme === 'light' ? '#E5F8E9' : '#1F3A23',
          borderRadius: 10,
          padding: spacing.md,
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.sm,
        },
        successBannerText: {
          ...typography.body,
          color: th.scheme === 'light' ? '#0F7B2C' : '#9AD8A4',
          fontWeight: '600',
        },

        swatchRow: {
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: spacing.sm,
        },
        swatch: {
          width: 36,
          height: 36,
          borderRadius: 18,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: th.backgroundSelected,
        },
        swatchSelected: {
          borderWidth: 3,
          borderColor: th.accent,
        },

        noticeCard: {
          backgroundColor: th.backgroundElement,
          borderRadius: 12,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: th.backgroundSelected,
          padding: spacing.md,
          gap: spacing.xs,
        },
        noticeTitle: { ...typography.body, color: th.text, fontWeight: '600' },
        noticeBody: { fontSize: 12, lineHeight: 17, color: th.textSecondary },

        signOutButton: {
          minHeight: 46,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: th.backgroundElement,
          borderRadius: 10,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: th.backgroundSelected,
          paddingHorizontal: spacing.md,
          paddingVertical: 12,
        },
        signOutButtonText: { ...typography.body, color: DANGER, fontWeight: '700' },

        footerText: {
          ...typography.caption,
          color: th.textSecondary,
          textAlign: 'center',
          paddingHorizontal: spacing.md,
        },

        securityForm: {
          padding: spacing.md,
          gap: spacing.md,
          backgroundColor: th.background,
        },
      }),
    [th.accent, th.accentSoft, th.background, th.backgroundElement, th.backgroundSelected, th.scheme, th.text, th.textSecondary]
  );

  async function runAction(label: string, action: () => Promise<unknown>) {
    if (busy) return;
    setBusy(label);
    try {
      await action();
    } finally {
      setBusy(null);
    }
  }

  function renderRow(opts: {
    icon: SymbolName;
    title: string;
    subtitle?: string;
    trailing?: string;
    trailingNode?: React.ReactNode;
    value?: string;
    onPress?: () => void;
    disabled?: boolean;
    isLast?: boolean;
  }) {
    const {
      icon,
      title,
      subtitle,
      trailing,
      trailingNode,
      value,
      onPress,
      disabled = false,
      isLast = false,
    } = opts;
    const inner = (
      <>
        <View style={styles.rowIconWrap}>
          <SymbolView
            name={icon}
            size={20}
            weight="semibold"
            tintColor={disabled ? th.textSecondary : th.text}
          />
        </View>
        <View style={styles.rowBody}>
          <Text style={styles.rowTitle}>{title}</Text>
          {subtitle ? (
            <Text style={styles.rowSubtitle} numberOfLines={2}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        <View style={styles.rowTrailing}>
          {value ? (
            <Text style={styles.rowValue} numberOfLines={1}>
              {value}
            </Text>
          ) : null}
          {trailingNode
            ? trailingNode
            : trailing
              ? <Text style={styles.rowTrailingText}>{trailing}</Text>
              : null}
        </View>
      </>
    );
    return (
      <React.Fragment>
        {onPress ? (
          <TouchableOpacity
            style={[styles.row, disabled && styles.rowDisabled]}
            onPress={onPress}
            activeOpacity={0.6}
            disabled={disabled}>
            {inner}
          </TouchableOpacity>
        ) : (
          <View style={[styles.row, disabled && styles.rowDisabled]}>{inner}</View>
        )}
        {!isLast && <View style={styles.separator} />}
      </React.Fragment>
    );
  }

  // ── Boot gate ─────────────────────────────────────────────────────────────
  if (!identity.isReady) {
    return (
      <SafeAreaView style={styles.safe} edges={[]}>
        <View
          style={[
            styles.centered,
            { paddingTop: contentTopPadding, paddingBottom: contentBottomPadding },
          ]}>
          <ActivityIndicator color={th.text} />
          <Text style={styles.checkingLabel}>Checking sign-in…</Text>
        </View>
      </SafeAreaView>
    );
  }

  const errorCopy = friendlyErrorCopy(identity.error?.code);

  // ── Signed-in view ────────────────────────────────────────────────────────
  if (identity.isSignedIn) {
    const profile = snapshot.profile;
    const workspace = snapshot.workspace;
    const displayName = profile?.displayName || 'Your account';
    const realEmail = profile?.email || snapshot.pendingEmail || '';
    const initials = initialsOf(profile?.displayName, realEmail);
    // profile.avatarColor is a slug (per Supabase schema); map slug → hex for rendering.
    // Unknown / missing slugs fall back to the scheme-aware neutral background so the
    // header never renders an arbitrary CSS-color-name accidentally.
    const avatarHex = resolveAvatarSwatch(profile?.avatarColor);
    const avatarBg = avatarHex ?? (th.scheme === 'light' ? '#fff' : th.backgroundSelected);
    const avatarInitialsColor = avatarHex ? '#fff' : th.text;

    const canSubmitChangePassword = Boolean(
      currentPassword.trim() && newPassword.trim() && confirmNewPassword.trim()
    );
    const formErrorCode =
      localChangePasswordError ?? (changePasswordSubmitted ? identity.error?.code ?? null : null);
    const formErrorCopy = friendlyErrorCopy(formErrorCode);

    function toggleChangePassword() {
      setShowChangePassword((prev) => {
        const next = !prev;
        if (next) {
          // opening — fresh slate
          setCurrentPassword('');
          setNewPassword('');
          setConfirmNewPassword('');
          setLocalChangePasswordError(null);
          setChangePasswordSubmitted(false);
          setChangePasswordSuccess(false);
        }
        return next;
      });
    }

    function cancelChangePassword() {
      setShowChangePassword(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      setLocalChangePasswordError(null);
      setChangePasswordSubmitted(false);
    }

    function onChangeAnyPasswordField() {
      if (localChangePasswordError) setLocalChangePasswordError(null);
      if (changePasswordSubmitted) setChangePasswordSubmitted(false);
    }

    async function submitChangePassword() {
      if (busy) return;

      // Client-side validation — fail fast without a provider call.
      if (!currentPassword.trim()) {
        setLocalChangePasswordError('identity/missing-current-password');
        setChangePasswordSubmitted(true);
        return;
      }
      if (!newPassword.trim()) {
        setLocalChangePasswordError('identity/missing-new-password');
        setChangePasswordSubmitted(true);
        return;
      }
      if (newPassword.length < 8) {
        setLocalChangePasswordError('identity/password-too-short');
        setChangePasswordSubmitted(true);
        return;
      }
      if (newPassword === currentPassword) {
        setLocalChangePasswordError('identity/password-same-as-current');
        setChangePasswordSubmitted(true);
        return;
      }
      if (newPassword !== confirmNewPassword) {
        setLocalChangePasswordError('identity/password-mismatch');
        setChangePasswordSubmitted(true);
        return;
      }

      setLocalChangePasswordError(null);
      setChangePasswordSubmitted(true);
      setBusy('change_password');
      try {
        const result = await identity.changePassword({
          currentPassword,
          newPassword,
        });
        if (result.lastError) {
          // Provider failed; identity.error reflects it. Stay on the form.
          return;
        }
        // Success
        setShowChangePassword(false);
        setCurrentPassword('');
        setNewPassword('');
        setConfirmNewPassword('');
        setChangePasswordSubmitted(false);
        setChangePasswordSuccess(true);
        if (successTimerRef.current) clearTimeout(successTimerRef.current);
        successTimerRef.current = setTimeout(() => setChangePasswordSuccess(false), 4000);
      } finally {
        setBusy(null);
      }
    }

    // ── Profile edit handlers ─────────────────────────────────────────────

    function toggleEditProfile() {
      setShowEditProfile((prev) => {
        const next = !prev;
        if (next) {
          // Opening: pre-fill from current profile. The RPC requires a non-empty
          // palette slug for avatar_color even on display-name-only edits, so we
          // always seed editAvatarColor with a valid slug — either the user's
          // current slug if it's in our palette, or the first palette entry as
          // a safe default.
          const currentSlug = (profile?.avatarColor || '').trim();
          const inPalette = PROFILE_AVATAR_PALETTE.some((e) => e.key === currentSlug);
          const seedSlug = inPalette ? currentSlug : PROFILE_AVATAR_PALETTE[0].key;
          setEditDisplayName(profile?.displayName || '');
          setEditAvatarColor(seedSlug);
          setLocalProfileError(null);
          setProfileEditSuccess(false);
        }
        return next;
      });
    }

    function cancelEditProfile() {
      setShowEditProfile(false);
      setEditDisplayName('');
      setEditAvatarColor('');
      setLocalProfileError(null);
    }

    function onChangeAnyProfileField() {
      if (localProfileError) setLocalProfileError(null);
    }

    function toggleEditWorkspace() {
      setShowEditWorkspace((prev) => {
        const next = !prev;
        if (next) {
          setEditWorkspaceName(workspace?.name || '');
          setLocalWorkspaceError(null);
          setWorkspaceEditSuccess(false);
        }
        return next;
      });
    }

    function cancelEditWorkspace() {
      setShowEditWorkspace(false);
      setEditWorkspaceName('');
      setLocalWorkspaceError(null);
    }

    function onChangeAnyWorkspaceField() {
      if (localWorkspaceError) setLocalWorkspaceError(null);
    }

    async function submitEditWorkspace() {
      if (busy) return;

      const trimmed = editWorkspaceName.trim();
      if (!trimmed) {
        setLocalWorkspaceError('identity/missing-workspace-name');
        return;
      }
      const noChange = trimmed === (workspace?.name ?? '');
      if (noChange) return;

      setLocalWorkspaceError(null);
      setBusy('edit_workspace');
      try {
        const result = await identity.renameWorkspace(trimmed);
        if (result.lastError) return;
        setShowEditWorkspace(false);
        setEditWorkspaceName('');
        setWorkspaceEditSuccess(true);
        if (workspaceSuccessTimerRef.current) clearTimeout(workspaceSuccessTimerRef.current);
        workspaceSuccessTimerRef.current = setTimeout(() => setWorkspaceEditSuccess(false), 4000);
      } finally {
        setBusy(null);
      }
    }

    async function submitEditProfile() {
      if (busy) return;

      const trimmed = editDisplayName.trim();
      if (!trimmed) {
        setLocalProfileError('identity/missing-display-name');
        return;
      }
      // editAvatarColor is guaranteed to be a palette slug because toggleEditProfile
      // seeds it from the palette and the picker only sets palette keys. Defensive
      // fallback is the first palette entry (shouldn't be reachable in practice).
      const slug = editAvatarColor || PROFILE_AVATAR_PALETTE[0].key;

      // No-op guard — Save button disabled-state should also catch this.
      const noChange =
        trimmed === (profile?.displayName ?? '') &&
        slug === (profile?.avatarColor ?? '');
      if (noChange) return;

      setLocalProfileError(null);
      setBusy('edit_profile');
      try {
        const result = await identity.updateProfile({
          displayName: trimmed,
          avatarColor: slug,
        });
        if (result.lastError) {
          // Provider failed; identity.error reflects it. Stay on the form;
          // failSoft preserves signed-in status.
          return;
        }
        // Success
        setShowEditProfile(false);
        setEditDisplayName('');
        setEditAvatarColor('');
        setProfileEditSuccess(true);
        if (profileSuccessTimerRef.current) clearTimeout(profileSuccessTimerRef.current);
        profileSuccessTimerRef.current = setTimeout(() => setProfileEditSuccess(false), 4000);
      } finally {
        setBusy(null);
      }
    }

    return (
      <SafeAreaView style={styles.safe} edges={[]}>
        <KeyboardAvoidingView
          style={styles.kav}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={contentTopPadding}>
          <ScrollView
            contentContainerStyle={[
              styles.content,
              { paddingTop: contentTopPadding, paddingBottom: contentBottomPadding },
            ]}
            keyboardShouldPersistTaps="handled">
            <View style={styles.accountPanel}>
              <View style={styles.accountTop}>
                <View style={[styles.avatar, { backgroundColor: avatarBg }]}>
                  <Text style={[styles.avatarInitials, { color: avatarInitialsColor }]}>
                    {initials}
                  </Text>
                </View>
                <View style={styles.accountText}>
                  <Text style={styles.accountTitle} numberOfLines={1}>
                    {displayName}
                  </Text>
                  <Text style={styles.accountSubtitle} numberOfLines={1}>
                    {realEmail || 'No email on file'}
                  </Text>
                </View>
              </View>
              <View style={styles.statusPill}>
                <Text style={styles.statusPillText}>Signed in</Text>
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionLabel}>PROFILE</Text>
              <View style={styles.card}>
                {profile ? (
                  <>
                    {renderRow({
                      icon: { ios: 'pencil', android: 'edit', web: 'edit' },
                      title: 'Edit profile',
                      subtitle: showEditProfile
                        ? 'Update your display name and avatar color.'
                        : 'Change your display name or avatar color.',
                      trailingNode: (
                        <SymbolView
                          name={
                            showEditProfile
                              ? { ios: 'chevron.up', android: 'expand_less', web: 'expand_less' }
                              : { ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }
                          }
                          size={14}
                          weight="semibold"
                          tintColor={th.textSecondary}
                        />
                      ),
                      onPress: toggleEditProfile,
                    })}
                    {showEditProfile ? (
                      <View style={styles.securityForm}>
                        <View style={styles.field}>
                          <Text style={styles.fieldLabel}>DISPLAY NAME</Text>
                          <TextInput
                            ref={editDisplayNameRef}
                            style={styles.input}
                            value={editDisplayName}
                            onChangeText={(v) => {
                              setEditDisplayName(v);
                              onChangeAnyProfileField();
                            }}
                            placeholder="Your name"
                            placeholderTextColor={th.textSecondary}
                            autoCapitalize="words"
                            autoCorrect={false}
                            maxLength={80}
                            editable={!busy}
                            accessibilityLabel="Display name"
                            returnKeyType="done"
                            onSubmitEditing={submitEditProfile}
                          />
                        </View>
                        <View style={styles.field}>
                          <Text style={styles.fieldLabel}>AVATAR COLOR</Text>
                          <View style={styles.swatchRow}>
                            {PROFILE_AVATAR_PALETTE.map((entry) => (
                              <TouchableOpacity
                                key={entry.key}
                                accessibilityLabel={`Avatar color ${entry.key}`}
                                accessibilityRole="button"
                                onPress={() => {
                                  setEditAvatarColor(entry.key);
                                  onChangeAnyProfileField();
                                }}
                                activeOpacity={0.7}
                                disabled={Boolean(busy)}>
                                <View
                                  style={[
                                    styles.swatch,
                                    { backgroundColor: entry.color },
                                    editAvatarColor === entry.key && styles.swatchSelected,
                                  ]}
                                />
                              </TouchableOpacity>
                            ))}
                          </View>
                        </View>

                        {(() => {
                          const code = localProfileError ?? identity.error?.code ?? null;
                          const copy = friendlyErrorCopy(code);
                          return copy ? (
                            <View style={styles.errorBanner}>
                              <Text style={styles.errorBannerText}>{copy}</Text>
                            </View>
                          ) : null;
                        })()}

                        {(() => {
                          const trimmed = editDisplayName.trim();
                          const noChange =
                            trimmed === (profile?.displayName ?? '') &&
                            editAvatarColor === (profile?.avatarColor ?? '');
                          const canSubmitProfile = Boolean(trimmed) && !noChange;
                          return (
                            <TouchableOpacity
                              style={[
                                styles.primaryButton,
                                (Boolean(busy) || !canSubmitProfile) && styles.buttonDisabled,
                              ]}
                              onPress={submitEditProfile}
                              activeOpacity={0.7}
                              disabled={Boolean(busy) || !canSubmitProfile}>
                              {busy === 'edit_profile' ? (
                                <ActivityIndicator color="#fff" />
                              ) : (
                                <Text style={styles.primaryButtonText}>Update profile</Text>
                              )}
                            </TouchableOpacity>
                          );
                        })()}

                        <TouchableOpacity
                          style={styles.linkButton}
                          onPress={cancelEditProfile}
                          activeOpacity={0.6}
                          disabled={Boolean(busy)}>
                          <Text style={styles.linkButtonTextNeutral}>Cancel</Text>
                        </TouchableOpacity>
                      </View>
                    ) : null}
                    {renderRow({
                      icon: { ios: 'person.fill', android: 'person', web: 'person' },
                      title: 'Display Name',
                      value: profile.displayName || '—',
                    })}
                    {renderRow({
                      icon: { ios: 'envelope.fill', android: 'mail', web: 'mail' },
                      title: 'Email',
                      value: realEmail || '—',
                    })}
                    {renderRow({
                      icon: { ios: 'pencil', android: 'edit', web: 'edit' },
                      title: 'Edit workspace',
                      subtitle: showEditWorkspace
                        ? 'Update your workspace name.'
                        : 'Change your workspace name.',
                      trailingNode: (
                        <SymbolView
                          name={
                            showEditWorkspace
                              ? { ios: 'chevron.up', android: 'expand_less', web: 'expand_less' }
                              : { ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }
                          }
                          size={14}
                          weight="semibold"
                          tintColor={th.textSecondary}
                        />
                      ),
                      onPress: toggleEditWorkspace,
                    })}
                    {showEditWorkspace ? (
                      <View style={styles.securityForm}>
                        <View style={styles.field}>
                          <Text style={styles.fieldLabel}>WORKSPACE NAME</Text>
                          <TextInput
                            ref={editWorkspaceNameRef}
                            style={styles.input}
                            value={editWorkspaceName}
                            onChangeText={(v) => {
                              setEditWorkspaceName(v);
                              onChangeAnyWorkspaceField();
                            }}
                            placeholder="Workspace name"
                            placeholderTextColor={th.textSecondary}
                            autoCapitalize="words"
                            autoCorrect={false}
                            maxLength={64}
                            editable={!busy}
                            accessibilityLabel="Workspace name"
                            returnKeyType="done"
                            onSubmitEditing={submitEditWorkspace}
                          />
                        </View>

                        {(() => {
                          const code = localWorkspaceError ?? identity.error?.code ?? null;
                          const copy = friendlyErrorCopy(code);
                          return copy ? (
                            <View style={styles.errorBanner}>
                              <Text style={styles.errorBannerText}>{copy}</Text>
                            </View>
                          ) : null;
                        })()}

                        {(() => {
                          const trimmed = editWorkspaceName.trim();
                          const noChange = trimmed === (workspace?.name ?? '');
                          const canSubmitWorkspace = Boolean(trimmed) && !noChange;
                          return (
                            <TouchableOpacity
                              style={[
                                styles.primaryButton,
                                (Boolean(busy) || !canSubmitWorkspace) && styles.buttonDisabled,
                              ]}
                              onPress={submitEditWorkspace}
                              activeOpacity={0.7}
                              disabled={Boolean(busy) || !canSubmitWorkspace}>
                              {busy === 'edit_workspace' ? (
                                <ActivityIndicator color="#fff" />
                              ) : (
                                <Text style={styles.primaryButtonText}>Update workspace</Text>
                              )}
                            </TouchableOpacity>
                          );
                        })()}

                        <TouchableOpacity
                          style={styles.linkButton}
                          onPress={cancelEditWorkspace}
                          activeOpacity={0.6}
                          disabled={Boolean(busy)}>
                          <Text style={styles.linkButtonTextNeutral}>Cancel</Text>
                        </TouchableOpacity>
                      </View>
                    ) : null}
                    {renderRow({
                      icon: { ios: 'square.stack.3d.up.fill', android: 'workspaces', web: 'workspaces' },
                      title: 'Workspace',
                      value: workspace?.name || 'Personal',
                      isLast: true,
                    })}
                  </>
                ) : (
                  renderRow({
                    icon: {
                      ios: 'person.crop.circle.badge.questionmark',
                      android: 'help_outline',
                      web: 'help_outline',
                    },
                    title: 'Profile setup pending',
                    subtitle: 'Your profile will appear here once setup completes.',
                    isLast: true,
                  })
                )}
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionLabel}>SIGN-IN METHOD</Text>
              <View style={styles.card}>
                {renderRow({
                  icon: { ios: 'key.fill', android: 'vpn_key', web: 'key' },
                  title: 'Email + Password',
                  subtitle: 'Currently in use',
                  trailingNode: (
                    <View style={styles.activePill}>
                      <Text style={styles.activePillText}>Active</Text>
                    </View>
                  ),
                })}
                {renderRow({
                  icon: { ios: 'plus.circle', android: 'add_circle', web: 'add_circle' },
                  title: 'Other sign-in methods',
                  subtitle: 'Coming later',
                  trailing: 'Soon',
                  disabled: true,
                  isLast: true,
                })}
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionLabel}>SECURITY</Text>
              <View style={styles.card}>
                {renderRow({
                  icon: { ios: 'lock.rotation', android: 'lock_reset', web: 'lock' },
                  title: 'Change password',
                  subtitle: showChangePassword
                    ? 'Enter your current and new password.'
                    : 'Keep your account secure.',
                  trailingNode: (
                    <SymbolView
                      name={
                        showChangePassword
                          ? { ios: 'chevron.up', android: 'expand_less', web: 'expand_less' }
                          : { ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }
                      }
                      size={14}
                      weight="semibold"
                      tintColor={th.textSecondary}
                    />
                  ),
                  onPress: toggleChangePassword,
                  isLast: !showChangePassword,
                })}
                {showChangePassword ? (
                  <View style={styles.securityForm}>
                    <View style={styles.field}>
                      <Text style={styles.fieldLabel}>CURRENT PASSWORD</Text>
                      <TextInput
                        style={styles.input}
                        value={currentPassword}
                        onChangeText={(v) => {
                          setCurrentPassword(v);
                          onChangeAnyPasswordField();
                        }}
                        placeholder="Your current password"
                        placeholderTextColor={th.textSecondary}
                        autoCapitalize="none"
                        autoCorrect={false}
                        secureTextEntry
                        textContentType="password"
                        editable={!busy}
                        accessibilityLabel="Current password"
                        returnKeyType="next"
                        onSubmitEditing={() => newPasswordRef.current?.focus()}
                      />
                    </View>
                    <View style={styles.field}>
                      <Text style={styles.fieldLabel}>NEW PASSWORD</Text>
                      <TextInput
                        ref={newPasswordRef}
                        style={styles.input}
                        value={newPassword}
                        onChangeText={(v) => {
                          setNewPassword(v);
                          onChangeAnyPasswordField();
                        }}
                        placeholder="At least 8 characters"
                        placeholderTextColor={th.textSecondary}
                        autoCapitalize="none"
                        autoCorrect={false}
                        secureTextEntry
                        textContentType="newPassword"
                        editable={!busy}
                        accessibilityLabel="New password"
                        returnKeyType="next"
                        onSubmitEditing={() => confirmPasswordRef.current?.focus()}
                      />
                    </View>
                    <View style={styles.field}>
                      <Text style={styles.fieldLabel}>CONFIRM NEW PASSWORD</Text>
                      <TextInput
                        ref={confirmPasswordRef}
                        style={styles.input}
                        value={confirmNewPassword}
                        onChangeText={(v) => {
                          setConfirmNewPassword(v);
                          onChangeAnyPasswordField();
                        }}
                        placeholder="Re-enter new password"
                        placeholderTextColor={th.textSecondary}
                        autoCapitalize="none"
                        autoCorrect={false}
                        secureTextEntry
                        textContentType="newPassword"
                        editable={!busy}
                        accessibilityLabel="Confirm new password"
                        returnKeyType="go"
                        onSubmitEditing={submitChangePassword}
                      />
                    </View>

                    {formErrorCopy ? (
                      <View style={styles.errorBanner}>
                        <Text style={styles.errorBannerText}>{formErrorCopy}</Text>
                      </View>
                    ) : null}

                    <TouchableOpacity
                      style={[
                        styles.primaryButton,
                        (Boolean(busy) || !canSubmitChangePassword) && styles.buttonDisabled,
                      ]}
                      onPress={submitChangePassword}
                      activeOpacity={0.7}
                      disabled={Boolean(busy) || !canSubmitChangePassword}>
                      {busy === 'change_password' ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <Text style={styles.primaryButtonText}>Update password</Text>
                      )}
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.linkButton}
                      onPress={cancelChangePassword}
                      activeOpacity={0.6}
                      disabled={Boolean(busy)}>
                      <Text style={styles.linkButtonTextNeutral}>Cancel</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionLabel}>ACTIVE SESSIONS</Text>
              <Text style={styles.sectionHelp}>Where you're signed in.</Text>
              <View style={styles.card}>
                {!sessionsLoadedOnce && sessionsLoading ? (
                  <View style={styles.row}>
                    <View style={styles.rowIconWrap}>
                      <ActivityIndicator color={th.text} />
                    </View>
                    <View style={styles.rowBody}>
                      <Text style={styles.rowSubtitle}>Loading active sessions…</Text>
                    </View>
                  </View>
                ) : sessions.length === 0 ? (
                  <View style={styles.row}>
                    <View style={styles.rowIconWrap}>
                      <SymbolView
                        name={{ ios: 'exclamationmark.triangle', android: 'error_outline', web: 'error_outline' }}
                        size={20}
                        weight="semibold"
                        tintColor={th.textSecondary}
                      />
                    </View>
                    <View style={styles.rowBody}>
                      <Text style={styles.rowTitle}>Couldn't load active sessions</Text>
                      <Text style={styles.rowSubtitle}>
                        We couldn't reach the server. Tap refresh to try again.
                      </Text>
                    </View>
                  </View>
                ) : (
                  sessions.map((session, index) => {
                    const isLast = index === sessions.length - 1;
                    const isCurrent = currentSessionId === session.id;
                    return (
                      <React.Fragment key={session.id}>
                        <View style={styles.row}>
                          <View style={styles.rowIconWrap}>
                            <SymbolView
                              name={surfaceIcon(session.surface)}
                              size={20}
                              weight="semibold"
                              tintColor={th.text}
                            />
                          </View>
                          <View style={styles.rowBody}>
                            <Text style={styles.rowTitle}>{session.label}</Text>
                            <Text style={styles.rowSubtitle}>
                              Last active {formatLastActive(session.lastSeenAt)}
                            </Text>
                          </View>
                          <View style={styles.rowTrailing}>
                            {isCurrent ? (
                              <View style={styles.currentDevicePill}>
                                <Text style={styles.currentDevicePillText}>This device</Text>
                              </View>
                            ) : null}
                          </View>
                        </View>
                        {!isLast && <View style={styles.separator} />}
                      </React.Fragment>
                    );
                  })
                )}
              </View>
              <TouchableOpacity
                style={styles.sessionsRefreshButton}
                onPress={() => {
                  void refreshSessions();
                }}
                activeOpacity={0.6}
                disabled={sessionsLoading}>
                {sessionsLoading ? (
                  <ActivityIndicator size="small" color={th.accent} />
                ) : (
                  <SymbolView
                    name={{ ios: 'arrow.clockwise', android: 'refresh', web: 'refresh' }}
                    size={14}
                    weight="semibold"
                    tintColor={th.accent}
                  />
                )}
                <Text style={styles.sessionsRefreshText}>Refresh</Text>
              </TouchableOpacity>
            </View>

            {changePasswordSuccess && !showChangePassword ? (
              <View style={styles.successBanner}>
                <SymbolView
                  name={{ ios: 'checkmark.circle.fill', android: 'check_circle', web: 'check_circle' }}
                  size={18}
                  weight="semibold"
                  tintColor={th.scheme === 'light' ? '#0F7B2C' : '#9AD8A4'}
                />
                <Text style={styles.successBannerText}>Password updated</Text>
              </View>
            ) : null}

            {profileEditSuccess && !showEditProfile ? (
              <View style={styles.successBanner}>
                <SymbolView
                  name={{ ios: 'checkmark.circle.fill', android: 'check_circle', web: 'check_circle' }}
                  size={18}
                  weight="semibold"
                  tintColor={th.scheme === 'light' ? '#0F7B2C' : '#9AD8A4'}
                />
                <Text style={styles.successBannerText}>Profile updated</Text>
              </View>
            ) : null}

            {workspaceEditSuccess && !showEditWorkspace ? (
              <View style={styles.successBanner}>
                <SymbolView
                  name={{ ios: 'checkmark.circle.fill', android: 'check_circle', web: 'check_circle' }}
                  size={18}
                  weight="semibold"
                  tintColor={th.scheme === 'light' ? '#0F7B2C' : '#9AD8A4'}
                />
                <Text style={styles.successBannerText}>Workspace updated</Text>
              </View>
            ) : null}

            {!showChangePassword && errorCopy ? (
              <View style={styles.errorBanner}>
                <Text style={styles.errorBannerText}>{errorCopy}</Text>
              </View>
            ) : null}

            <TouchableOpacity
              style={[styles.signOutButton, busy === 'signOut' && styles.buttonDisabled]}
              onPress={() => runAction('signOut', () => identity.signOut())}
              activeOpacity={0.7}
              disabled={Boolean(busy)}>
              {busy === 'signOut' ? (
                <ActivityIndicator color={DANGER} />
              ) : (
                <Text style={styles.signOutButtonText}>Sign out</Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // ── Signed-out: pending verify-code panel ─────────────────────────────────
  if (pendingCodeKind) {
    const targetEmail = snapshot.pendingEmail || email;
    const verifyLabel =
      pendingCodeKind === 'sign_up' ? 'Verify and create account' : 'Verify and sign in';
    const verifyAction = () =>
      pendingCodeKind === 'sign_up'
        ? identity.verifySignupCode({ email: targetEmail, code })
        : identity.verifyEmailCode({ email: targetEmail, code });

    function trySubmitVerify() {
      if (busy || !code.trim()) return;
      runAction('verify', verifyAction);
    }

    async function cancelPending() {
      setEmail('');
      setPassword('');
      setCode('');
      await runAction('cancel', () => identity.signOut());
    }

    // (Recovery panel handlers + render branch are defined at component scope below;
    // verify-code panel cannot reach them but doesn't need to.)

    return (
      <SafeAreaView style={styles.safe} edges={[]}>
        <KeyboardAvoidingView
          style={styles.kav}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={contentTopPadding}>
          <ScrollView
            contentContainerStyle={[
              styles.content,
              { paddingTop: contentTopPadding, paddingBottom: contentBottomPadding },
            ]}
            keyboardShouldPersistTaps="handled">
            <View style={styles.hero}>
              <Text style={styles.heroTitle}>Check your email</Text>
              <Text style={styles.heroSubtitle}>
                We sent a verification code to {targetEmail || 'your email'}. Enter it below to{' '}
                {pendingCodeKind === 'sign_up' ? 'finish creating your account' : 'sign in'}.
              </Text>
            </View>

            <View style={styles.formCard}>
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>EMAIL</Text>
                <Text style={styles.pendingEmail}>{targetEmail || '—'}</Text>
              </View>
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>CODE</Text>
                <TextInput
                  style={styles.input}
                  value={code}
                  onChangeText={setCode}
                  placeholder="6-digit code"
                  placeholderTextColor={th.textSecondary}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="number-pad"
                  textContentType="oneTimeCode"
                  editable={!busy}
                  accessibilityLabel="Verification code"
                  returnKeyType="go"
                  onSubmitEditing={trySubmitVerify}
                />
              </View>

              {errorCopy ? (
                <View style={styles.errorBanner}>
                  <Text style={styles.errorBannerText}>{errorCopy}</Text>
                </View>
              ) : null}

              <TouchableOpacity
                style={[
                  styles.primaryButton,
                  (Boolean(busy) || !code.trim()) && styles.buttonDisabled,
                ]}
                onPress={trySubmitVerify}
                activeOpacity={0.7}
                disabled={Boolean(busy) || !code.trim()}>
                {busy === 'verify' ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryButtonText}>{verifyLabel}</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.linkButton}
                onPress={cancelPending}
                activeOpacity={0.6}
                disabled={Boolean(busy)}>
                <Text style={styles.linkButtonTextNeutral}>Use a different email</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.footerText}>
              The code may take a moment to arrive. Check your spam folder if needed.
            </Text>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // ── Signed-out: recovery panel (3 stages, gated on RECOVERY_FLOW_VERIFIED) ─

  function openRecoveryRequest() {
    setRecoveryStage('request');
    setRecoveryEmail(email);
    setRecoveryCode('');
    setRecoveryNewPassword('');
    setRecoveryConfirmPassword('');
    setLocalRecoveryError(null);
  }

  async function cancelRecovery() {
    const wasInRecoveryState = snapshot.status === 'recovery_code_pending';
    setRecoveryStage(null);
    setRecoveryEmail('');
    setRecoveryCode('');
    setRecoveryNewPassword('');
    setRecoveryConfirmPassword('');
    setLocalRecoveryError(null);
    if (wasInRecoveryState) {
      await runAction('cancel_recovery', () => identity.signOut());
    }
  }

  function onChangeAnyRecoveryField() {
    if (localRecoveryError) setLocalRecoveryError(null);
  }

  async function submitRecoveryRequest() {
    if (busy) return;
    setLocalRecoveryError(null);
    if (!recoveryEmail.trim()) {
      setLocalRecoveryError('identity/missing-email');
      return;
    }
    setBusy('recovery_request');
    try {
      const result = await identity.requestRecoveryCode(recoveryEmail);
      if (result.lastError) return;
      setRecoveryStage('verify');
    } finally {
      setBusy(null);
    }
  }

  async function submitRecoveryVerify() {
    if (busy) return;
    setLocalRecoveryError(null);
    if (!recoveryCode.trim()) {
      setLocalRecoveryError('identity/missing-code');
      return;
    }
    setBusy('recovery_verify');
    try {
      const result = await identity.verifyRecoveryCode({ email: recoveryEmail, code: recoveryCode });
      if (result.lastError) return;
      setRecoveryStage('set_password');
      setRecoveryCode('');
    } finally {
      setBusy(null);
    }
  }

  async function submitRecoverySetPassword() {
    if (busy) return;
    setLocalRecoveryError(null);
    if (!recoveryNewPassword.trim()) {
      setLocalRecoveryError('identity/missing-new-password');
      return;
    }
    if (recoveryNewPassword.length < 8) {
      setLocalRecoveryError('identity/password-too-short');
      return;
    }
    if (recoveryNewPassword !== recoveryConfirmPassword) {
      setLocalRecoveryError('identity/password-mismatch');
      return;
    }
    setBusy('recovery_set_password');
    try {
      const result = await identity.setPasswordAfterRecovery(recoveryNewPassword);
      if (result.lastError) return;
      // Success: snapshot transitions to signed-in; useEffect resets recovery state.
    } finally {
      setBusy(null);
    }
  }

  if (recoveryStage !== null) {
    const recoveryFormErrorCode = localRecoveryError ?? identity.error?.code ?? null;
    const recoveryFormErrorCopy = friendlyErrorCopy(recoveryFormErrorCode);

    const heroNode = recoveryStage === 'request' ? (
      <View style={styles.hero}>
        <Text style={styles.heroTitle}>Reset your password</Text>
        <Text style={styles.heroSubtitle}>
          Enter the email associated with your account.
        </Text>
      </View>
    ) : recoveryStage === 'verify' ? (
      <View style={styles.hero}>
        <Text style={styles.heroTitle}>Check your email</Text>
        <Text style={styles.heroSubtitle}>
          If that email is registered, we've sent a recovery code. Enter it below.
        </Text>
      </View>
    ) : (
      <View style={styles.hero}>
        <Text style={styles.heroTitle}>Set a new password</Text>
        <Text style={styles.heroSubtitle}>
          Choose a password you haven't used before.
        </Text>
      </View>
    );

    const primaryRecoveryLabel =
      recoveryStage === 'request' ? 'Send recovery code' :
      recoveryStage === 'verify' ? 'Verify code' :
      'Update password';
    const primaryRecoveryAction =
      recoveryStage === 'request' ? submitRecoveryRequest :
      recoveryStage === 'verify' ? submitRecoveryVerify :
      submitRecoverySetPassword;
    const primaryRecoveryBusy =
      (recoveryStage === 'request' && busy === 'recovery_request') ||
      (recoveryStage === 'verify' && busy === 'recovery_verify') ||
      (recoveryStage === 'set_password' && busy === 'recovery_set_password');
    const canSubmitRecovery =
      recoveryStage === 'request' ? Boolean(recoveryEmail.trim()) :
      recoveryStage === 'verify' ? Boolean(recoveryCode.trim()) :
      Boolean(recoveryNewPassword.trim() && recoveryConfirmPassword.trim());

    return (
      <SafeAreaView style={styles.safe} edges={[]}>
        <KeyboardAvoidingView
          style={styles.kav}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={contentTopPadding}>
          <ScrollView
            contentContainerStyle={[
              styles.content,
              { paddingTop: contentTopPadding, paddingBottom: contentBottomPadding },
            ]}
            keyboardShouldPersistTaps="handled">
            {heroNode}

            <View style={styles.formCard}>
              {recoveryStage === 'request' ? (
                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>EMAIL</Text>
                  <TextInput
                    style={styles.input}
                    value={recoveryEmail}
                    onChangeText={(v) => {
                      setRecoveryEmail(v);
                      onChangeAnyRecoveryField();
                    }}
                    placeholder="you@example.com"
                    placeholderTextColor={th.textSecondary}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="email-address"
                    textContentType="emailAddress"
                    editable={!busy}
                    accessibilityLabel="Recovery email"
                    returnKeyType="go"
                    onSubmitEditing={submitRecoveryRequest}
                  />
                </View>
              ) : null}

              {recoveryStage === 'verify' ? (
                <>
                  <View style={styles.field}>
                    <Text style={styles.fieldLabel}>EMAIL</Text>
                    <Text style={styles.pendingEmail}>{recoveryEmail || '—'}</Text>
                  </View>
                  <View style={styles.field}>
                    <Text style={styles.fieldLabel}>CODE</Text>
                    <TextInput
                      style={styles.input}
                      value={recoveryCode}
                      onChangeText={(v) => {
                        setRecoveryCode(v);
                        onChangeAnyRecoveryField();
                      }}
                      placeholder="6-digit code"
                      placeholderTextColor={th.textSecondary}
                      autoCapitalize="none"
                      autoCorrect={false}
                      keyboardType="number-pad"
                      textContentType="oneTimeCode"
                      editable={!busy}
                      accessibilityLabel="Recovery code"
                      returnKeyType="go"
                      onSubmitEditing={submitRecoveryVerify}
                    />
                  </View>
                </>
              ) : null}

              {recoveryStage === 'set_password' ? (
                <>
                  <View style={styles.field}>
                    <Text style={styles.fieldLabel}>NEW PASSWORD</Text>
                    <TextInput
                      ref={recoveryNewPasswordRef}
                      style={styles.input}
                      value={recoveryNewPassword}
                      onChangeText={(v) => {
                        setRecoveryNewPassword(v);
                        onChangeAnyRecoveryField();
                      }}
                      placeholder="At least 8 characters"
                      placeholderTextColor={th.textSecondary}
                      autoCapitalize="none"
                      autoCorrect={false}
                      secureTextEntry
                      textContentType="newPassword"
                      editable={!busy}
                      accessibilityLabel="New password"
                      returnKeyType="next"
                      onSubmitEditing={() => recoveryConfirmPasswordRef.current?.focus()}
                    />
                  </View>
                  <View style={styles.field}>
                    <Text style={styles.fieldLabel}>CONFIRM NEW PASSWORD</Text>
                    <TextInput
                      ref={recoveryConfirmPasswordRef}
                      style={styles.input}
                      value={recoveryConfirmPassword}
                      onChangeText={(v) => {
                        setRecoveryConfirmPassword(v);
                        onChangeAnyRecoveryField();
                      }}
                      placeholder="Re-enter new password"
                      placeholderTextColor={th.textSecondary}
                      autoCapitalize="none"
                      autoCorrect={false}
                      secureTextEntry
                      textContentType="newPassword"
                      editable={!busy}
                      accessibilityLabel="Confirm new password"
                      returnKeyType="go"
                      onSubmitEditing={submitRecoverySetPassword}
                    />
                  </View>
                </>
              ) : null}

              {recoveryFormErrorCopy ? (
                <View style={styles.errorBanner}>
                  <Text style={styles.errorBannerText}>{recoveryFormErrorCopy}</Text>
                </View>
              ) : null}

              <TouchableOpacity
                style={[
                  styles.primaryButton,
                  (Boolean(busy) || !canSubmitRecovery) && styles.buttonDisabled,
                ]}
                onPress={primaryRecoveryAction}
                activeOpacity={0.7}
                disabled={Boolean(busy) || !canSubmitRecovery}>
                {primaryRecoveryBusy ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryButtonText}>{primaryRecoveryLabel}</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.linkButton}
                onPress={cancelRecovery}
                activeOpacity={0.6}
                disabled={Boolean(busy)}>
                <Text style={styles.linkButtonTextNeutral}>Cancel</Text>
              </TouchableOpacity>
            </View>

            {recoveryStage === 'verify' ? (
              <Text style={styles.footerText}>
                The code may take a moment to arrive. Check your spam folder if needed.
              </Text>
            ) : null}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // ── Signed-out: tab form ───────────────────────────────────────────────────
  const isSignInTab = tab === 'sign_in';
  const isPasswordMode = mode === 'password';
  const showPasswordField = !isSignInTab || isPasswordMode;
  const canSubmit = isSignInTab
    ? isPasswordMode
      ? Boolean(email.trim() && password.trim())
      : Boolean(email.trim())
    : Boolean(email.trim() && password.trim());
  const primaryLabel = isSignInTab
    ? isPasswordMode
      ? 'Sign in'
      : 'Send code'
    : 'Create account';
  const primaryAction = () => {
    if (isSignInTab) {
      if (isPasswordMode) return identity.signInWithPassword({ email, password });
      return identity.signInWithEmail({ email });
    }
    return identity.signUpWithPassword({ email, password });
  };

  function trySubmitPrimary() {
    if (busy || !canSubmit) return;
    runAction('primary', primaryAction);
  }

  function selectTab(next: SignInTab) {
    setTab(next);
    setMode('password');
    setCode('');
  }

  function handleEmailSubmitEditing() {
    if (showPasswordField) {
      passwordRef.current?.focus();
    } else {
      trySubmitPrimary();
    }
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: COCKPIT_BG }]} edges={[]}>
      <KeyboardAvoidingView
        style={styles.kav}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={contentTopPadding}>
        <ScrollView
          contentContainerStyle={[
            styles.content,
            {
              paddingTop: contentTopPadding,
              paddingBottom: contentBottomPadding,
              backgroundColor: COCKPIT_BG,
            },
          ]}
          keyboardShouldPersistTaps="handled">
          {/* Cockpit Pro hero — brand mark + wordmark + tagline */}
          <View
            style={{
              alignItems: 'center',
              gap: spacing.md,
              paddingTop: spacing.lg,
              paddingBottom: spacing.sm,
            }}>
            <CockpitMark size={84} />
            <Text
              style={{
                color: COCKPIT_INK,
                fontSize: 28,
                fontWeight: '500',
                letterSpacing: -0.5,
              }}>
              Cockpit <Text style={{ color: COCKPIT_EMBER }}>Pro</Text>
            </Text>
            <Text
              style={{
                color: COCKPIT_INK_MUTED,
                fontSize: 17,
                lineHeight: 23,
                textAlign: 'center',
                maxWidth: 300,
                fontWeight: '400',
              }}>
              Your AI workspace,{'\n'}organized like a cockpit.
            </Text>
          </View>

          {/* Eyebrow + heading + subhead */}
          <View style={{ gap: spacing.xs, paddingHorizontal: spacing.xs }}>
            <Text
              style={{
                color: COCKPIT_CYAN,
                fontSize: 11,
                fontWeight: '600',
                letterSpacing: 1.4,
                textTransform: 'uppercase',
              }}>
              {isSignInTab ? 'Welcome back' : 'Get started'}
            </Text>
            <Text
              style={{
                color: COCKPIT_INK,
                fontSize: 24,
                fontWeight: '500',
                letterSpacing: -0.5,
                lineHeight: 28,
              }}>
              {isSignInTab ? 'Sign in to your cockpit.' : 'Create your cockpit.'}
            </Text>
            <Text style={{ color: COCKPIT_INK_DIM, fontSize: 14, lineHeight: 20 }}>
              {isSignInTab
                ? 'Your conversations, projects, and folders are right where you left them.'
                : 'Capture, structure, and navigate every conversation from one calm command center.'}
            </Text>
          </View>

          <View
            style={[
              styles.tabs,
              busy && styles.tabsBusy,
              { backgroundColor: COCKPIT_BG_RAISED, borderColor: COCKPIT_HAIR },
            ]}>
            <TouchableOpacity
              style={[
                styles.tabButton,
                isSignInTab && {
                  backgroundColor: COCKPIT_BG_HOVER,
                  borderWidth: 1,
                  borderColor: COCKPIT_HAIR_STRONG,
                },
              ]}
              onPress={() => selectTab('sign_in')}
              activeOpacity={0.7}
              disabled={Boolean(busy)}>
              <Text
                style={[
                  styles.tabButtonText,
                  { color: isSignInTab ? COCKPIT_INK : COCKPIT_INK_DIM },
                ]}>
                Sign in
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.tabButton,
                !isSignInTab && {
                  backgroundColor: COCKPIT_BG_HOVER,
                  borderWidth: 1,
                  borderColor: COCKPIT_HAIR_STRONG,
                },
              ]}
              onPress={() => selectTab('create_account')}
              activeOpacity={0.7}
              disabled={Boolean(busy)}>
              <Text
                style={[
                  styles.tabButtonText,
                  { color: !isSignInTab ? COCKPIT_INK : COCKPIT_INK_DIM },
                ]}>
                Create account
              </Text>
            </TouchableOpacity>
          </View>

          <View
            style={[
              styles.formCard,
              { backgroundColor: COCKPIT_BG_RAISED, borderColor: COCKPIT_HAIR },
            ]}>
            {GOOGLE_OAUTH_VERIFIED ? (
              <>
                <TouchableOpacity
                  style={[
                    styles.oauthButton,
                    {
                      backgroundColor: COCKPIT_BG_HOVER,
                      borderColor: COCKPIT_HAIR_STRONG,
                    },
                    Boolean(busy) && styles.buttonDisabled,
                  ]}
                  onPress={() => runAction('google_oauth', () => identity.signInWithGoogle())}
                  activeOpacity={0.7}
                  disabled={Boolean(busy)}
                  accessibilityLabel="Continue with Google">
                  {busy === 'google_oauth' ? (
                    <ActivityIndicator color={COCKPIT_INK} />
                  ) : (
                    <>
                      <View
                        style={[
                          styles.oauthGlyphCircle,
                          {
                            backgroundColor: COCKPIT_BG_RAISED,
                            borderColor: COCKPIT_HAIR_STRONG,
                          },
                        ]}>
                        <Text style={[styles.oauthGlyphLetter, { color: COCKPIT_INK }]}>G</Text>
                      </View>
                      <Text style={[styles.oauthButtonText, { color: COCKPIT_INK }]}>
                        Continue with Google
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
                <View style={styles.oauthDivider}>
                  <View
                    style={[styles.oauthDividerLine, { backgroundColor: COCKPIT_HAIR }]}
                  />
                  <Text style={[styles.oauthDividerText, { color: COCKPIT_INK_DIM }]}>
                    or use email
                  </Text>
                  <View
                    style={[styles.oauthDividerLine, { backgroundColor: COCKPIT_HAIR }]}
                  />
                </View>
              </>
            ) : null}
            <View style={styles.field}>
              <Text style={[styles.fieldLabel, { color: COCKPIT_INK_DIM }]}>EMAIL</Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: COCKPIT_BG,
                    borderColor: COCKPIT_HAIR,
                    color: COCKPIT_INK,
                  },
                ]}
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                placeholderTextColor={COCKPIT_INK_FAINT}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                textContentType="emailAddress"
                editable={!busy}
                accessibilityLabel="Email address"
                returnKeyType={showPasswordField ? 'next' : 'go'}
                onSubmitEditing={handleEmailSubmitEditing}
              />
            </View>

            {showPasswordField ? (
              <View style={styles.field}>
                <Text style={[styles.fieldLabel, { color: COCKPIT_INK_DIM }]}>PASSWORD</Text>
                <TextInput
                  ref={passwordRef}
                  style={[
                    styles.input,
                    {
                      backgroundColor: COCKPIT_BG,
                      borderColor: COCKPIT_HAIR,
                      color: COCKPIT_INK,
                    },
                  ]}
                  value={password}
                  onChangeText={setPassword}
                  placeholder={isSignInTab ? 'Your password' : 'At least 8 characters'}
                  placeholderTextColor={COCKPIT_INK_FAINT}
                  autoCapitalize="none"
                  autoCorrect={false}
                  secureTextEntry
                  textContentType={isSignInTab ? 'password' : 'newPassword'}
                  editable={!busy}
                  accessibilityLabel="Password"
                  returnKeyType="go"
                  onSubmitEditing={trySubmitPrimary}
                />
              </View>
            ) : null}

            {errorCopy ? (
              <View style={styles.errorBanner}>
                <Text style={styles.errorBannerText}>{errorCopy}</Text>
              </View>
            ) : null}

            <TouchableOpacity
              style={[
                styles.primaryButton,
                { backgroundColor: COCKPIT_EMBER },
                (!canSubmit || Boolean(busy)) && styles.buttonDisabled,
              ]}
              onPress={trySubmitPrimary}
              activeOpacity={0.7}
              disabled={!canSubmit || Boolean(busy)}>
              {busy === 'primary' ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryButtonText}>{primaryLabel}</Text>
              )}
            </TouchableOpacity>

            {isSignInTab ? (
              <TouchableOpacity
                style={styles.linkButton}
                onPress={() => {
                  setMode(isPasswordMode ? 'code' : 'password');
                  setCode('');
                }}
                activeOpacity={0.6}
                disabled={Boolean(busy)}>
                <Text style={[styles.linkButtonText, { color: COCKPIT_CYAN }]}>
                  {isPasswordMode ? 'Use email code instead' : 'Use password instead'}
                </Text>
              </TouchableOpacity>
            ) : null}

            {RECOVERY_FLOW_VERIFIED && isSignInTab && isPasswordMode ? (
              <TouchableOpacity
                style={styles.linkButton}
                onPress={openRecoveryRequest}
                activeOpacity={0.6}
                disabled={Boolean(busy)}>
                <Text
                  style={[styles.linkButtonTextNeutral, { color: COCKPIT_INK_DIM }]}>
                  Forgot password?
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
