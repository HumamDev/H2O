import { SymbolView } from 'expo-symbols';
import React, { useEffect, useMemo, useRef, useState } from 'react';
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

import { useTopBarMetrics } from '@/components/navigation/AppTopBar';
import { useIdentity } from '@/identity/IdentityContext';
import { RECOVERY_FLOW_VERIFIED } from '@/identity/mobileConfig';
import { useTheme } from '@/hooks/use-theme';
import { spacing, typography } from '@/theme';

const PRIMARY = '#208AEF';
const DANGER = '#E15554';

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
};

function friendlyErrorCopy(code: string | null | undefined): string | null {
  if (!code) return null;
  if (SUPPRESSED_ERROR_CODES.has(code)) return null;
  return FRIENDLY_ERRORS[code] ?? 'Something went wrong. Try again.';
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

  // Recovery form state (signed-out only; gated on RECOVERY_FLOW_VERIFIED)
  const [recoveryStage, setRecoveryStage] = useState<'request' | 'verify' | 'set_password' | null>(null);
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [recoveryNewPassword, setRecoveryNewPassword] = useState('');
  const [recoveryConfirmPassword, setRecoveryConfirmPassword] = useState('');
  const [localRecoveryError, setLocalRecoveryError] = useState<string | null>(null);
  const recoveryNewPasswordRef = useRef<TextInput>(null);
  const recoveryConfirmPasswordRef = useRef<TextInput>(null);

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
    }
  }, [identity.isSignedIn]);

  useEffect(() => {
    return () => {
      if (successTimerRef.current) {
        clearTimeout(successTimerRef.current);
        successTimerRef.current = null;
      }
    };
  }, []);

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
          backgroundColor: PRIMARY,
        },
        activePillText: { ...typography.caption, color: '#fff', fontWeight: '700' },

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
          backgroundColor: PRIMARY,
          borderRadius: 10,
          paddingHorizontal: spacing.md,
          paddingVertical: 12,
        },
        buttonDisabled: { opacity: 0.5 },
        primaryButtonText: { ...typography.body, color: '#fff', fontWeight: '700' },
        linkButton: { paddingVertical: 6, alignItems: 'center' },
        linkButtonText: { ...typography.caption, color: PRIMARY, fontWeight: '600' },
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
    [th.background, th.backgroundElement, th.backgroundSelected, th.scheme, th.text, th.textSecondary]
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
    const avatarColor = profile?.avatarColor && profile.avatarColor.trim() ? profile.avatarColor : null;
    const avatarBg = avatarColor ?? (th.scheme === 'light' ? '#fff' : th.backgroundSelected);
    const avatarInitialsColor = avatarColor ? '#fff' : th.text;

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

            <View style={styles.noticeCard}>
              <Text style={styles.noticeTitle}>Account recovery — coming soon</Text>
              <Text style={styles.noticeBody}>
                We're still building account recovery. For now, please save your password
                somewhere safe. When it ships, we'll send a reset code to{' '}
                {realEmail || 'your account email'}.
              </Text>
            </View>

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
            <Text style={styles.heroTitle}>Sign in to H2O Studio</Text>
            <Text style={styles.heroSubtitle}>
              Sync your account across devices and keep your conversations safe.
            </Text>
          </View>

          <View style={[styles.tabs, busy && styles.tabsBusy]}>
            <TouchableOpacity
              style={[styles.tabButton, isSignInTab && styles.tabButtonActive]}
              onPress={() => selectTab('sign_in')}
              activeOpacity={0.7}
              disabled={Boolean(busy)}>
              <Text style={[styles.tabButtonText, isSignInTab && styles.tabButtonTextActive]}>
                Sign in
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tabButton, !isSignInTab && styles.tabButtonActive]}
              onPress={() => selectTab('create_account')}
              activeOpacity={0.7}
              disabled={Boolean(busy)}>
              <Text style={[styles.tabButtonText, !isSignInTab && styles.tabButtonTextActive]}>
                Create account
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.formCard}>
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>EMAIL</Text>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                placeholderTextColor={th.textSecondary}
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
                <Text style={styles.fieldLabel}>PASSWORD</Text>
                <TextInput
                  ref={passwordRef}
                  style={styles.input}
                  value={password}
                  onChangeText={setPassword}
                  placeholder={isSignInTab ? 'Your password' : 'At least 8 characters'}
                  placeholderTextColor={th.textSecondary}
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
                <Text style={styles.linkButtonText}>
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
                <Text style={styles.linkButtonTextNeutral}>Forgot password?</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          <View style={styles.noticeCard}>
            <Text style={styles.noticeTitle}>Trouble signing in?</Text>
            <Text style={styles.noticeBody}>
              Account recovery is on its way. Until then, please save your password somewhere
              safe.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
