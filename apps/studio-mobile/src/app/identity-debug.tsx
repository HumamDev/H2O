import React, { useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTopBarMetrics } from '@/components/navigation/AppTopBar';
import { useIdentity } from '@/identity/IdentityContext';
import { useTheme } from '@/hooks/use-theme';
import { spacing, typography } from '@/theme';

const PRIMARY = '#208AEF';

function maskEmail(email?: string | null): string {
  if (!email) return 'None';
  const [name, domain] = String(email).trim().toLowerCase().split('@');
  if (!name || !domain) return 'Present';
  const visible = name.length <= 2 ? name.slice(0, 1) : `${name[0]}${name[name.length - 1]}`;
  return `${visible}***@${domain}`;
}

export default function IdentityDebugScreen() {
  const th = useTheme();
  const identity = useIdentity();
  const { contentTopPadding, contentBottomPadding } = useTopBarMetrics();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [lastAction, setLastAction] = useState<string | null>(null);

  const styles = useMemo(() => StyleSheet.create({
    safe: { flex: 1, backgroundColor: th.background },
    content: { padding: spacing.md, gap: spacing.lg },
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
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: th.backgroundSelected,
      overflow: 'hidden',
    },
    separator: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: th.backgroundSelected,
      marginLeft: spacing.md,
    },
    statusRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: spacing.md,
      paddingHorizontal: spacing.md,
      paddingVertical: 10,
    },
    statusLabel: { ...typography.body, color: th.textSecondary, flexShrink: 0 },
    statusValue: { ...typography.body, color: th.text, flex: 1, textAlign: 'right' },
    statusValueMuted: { color: th.textSecondary },
    formBlock: { padding: spacing.md, gap: spacing.sm },
    input: {
      ...typography.body,
      color: th.text,
      backgroundColor: th.background,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: th.backgroundSelected,
      borderRadius: 8,
      paddingHorizontal: spacing.md,
      paddingVertical: 11,
    },
    buttonGrid: { gap: spacing.sm },
    actionButton: {
      minHeight: 42,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: PRIMARY,
      borderRadius: 8,
      paddingHorizontal: spacing.md,
      paddingVertical: 11,
    },
    actionButtonSecondary: { backgroundColor: th.backgroundSelected },
    actionButtonDisabled: { opacity: 0.5 },
    actionButtonText: { ...typography.body, color: '#fff', fontWeight: '600' },
    actionButtonTextSecondary: { color: th.text },
    qaFeedback: { ...typography.caption, color: th.textSecondary, paddingHorizontal: spacing.md },
    placeholderRow: {
      paddingHorizontal: spacing.md,
      paddingVertical: 13,
    },
    placeholderLabel: { ...typography.body, color: th.textSecondary },
  }), [th.background, th.backgroundElement, th.backgroundSelected, th.text, th.textSecondary]);

  const snapshot = identity.snapshot;
  const safeEmail = maskEmail(snapshot.profile?.email ?? snapshot.pendingEmail ?? null);
  const errorText = identity.error
    ? `${identity.error.code}: ${identity.error.message}`
    : 'None';

  async function runIdentityAction(label: string, action: () => Promise<unknown>) {
    if (busyAction) return;
    setBusyAction(label);
    setLastAction(`${label} started`);
    try {
      await action();
      setLastAction(`${label} completed`);
    } catch {
      setLastAction(`${label} failed`);
    } finally {
      setBusyAction(null);
    }
  }

  function renderStatusRow(label: string, value: string | boolean | null | undefined) {
    const text = typeof value === 'boolean' ? (value ? 'Yes' : 'No') : (value || 'None');
    return (
      <>
        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>{label}</Text>
          <Text style={[styles.statusValue, !value && styles.statusValueMuted]} numberOfLines={2}>
            {text}
          </Text>
        </View>
        <View style={styles.separator} />
      </>
    );
  }

  function renderIdentityButton(
    label: string,
    action: () => Promise<unknown>,
    variant: 'primary' | 'secondary' = 'primary',
    disabled = false,
  ) {
    const isBusy = busyAction === label;
    const isDisabled = Boolean(busyAction) || disabled;
    const secondary = variant === 'secondary';
    return (
      <TouchableOpacity
        style={[
          styles.actionButton,
          secondary && styles.actionButtonSecondary,
          isDisabled && styles.actionButtonDisabled,
        ]}
        onPress={() => runIdentityAction(label, action)}
        activeOpacity={0.7}
        disabled={isDisabled}>
        {isBusy ? (
          <ActivityIndicator color={secondary ? th.text : '#fff'} />
        ) : (
          <Text style={[styles.actionButtonText, secondary && styles.actionButtonTextSecondary]}>{label}</Text>
        )}
      </TouchableOpacity>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={[]}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: contentTopPadding, paddingBottom: contentBottomPadding }]}>
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>IDENTITY DEBUG</Text>
          <View style={styles.card}>
            {renderStatusRow('Boot', identity.bootStatus)}
            {renderStatusRow('Status', snapshot.status)}
            {renderStatusRow('Mode', snapshot.mode)}
            {renderStatusRow('Provider', snapshot.provider)}
            {renderStatusRow('Signed in', identity.isSignedIn)}
            {renderStatusRow('Email', safeEmail)}
            {renderStatusRow('Error', errorText)}

            <View style={styles.formBlock}>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="Email"
                placeholderTextColor={th.textSecondary}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                textContentType="emailAddress"
              />
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                placeholder="Password"
                placeholderTextColor={th.textSecondary}
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry
                textContentType="password"
              />
              <TextInput
                style={styles.input}
                value={code}
                onChangeText={setCode}
                placeholder="Code"
                placeholderTextColor={th.textSecondary}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="number-pad"
                textContentType="oneTimeCode"
              />

              <View style={styles.buttonGrid}>
                {renderIdentityButton('Sign in with password', () =>
                  identity.signInWithPassword({ email, password })
                )}
                {renderIdentityButton('Sign up with password', () =>
                  identity.signUpWithPassword({ email, password })
                )}
                {renderIdentityButton('Request email code', () =>
                  identity.signInWithEmail({ email })
                )}
                {renderIdentityButton('Verify sign-in code', () =>
                  identity.verifyEmailCode({ email, code })
                )}
                {renderIdentityButton('Verify sign-up code', () =>
                  identity.verifySignupCode({ email, code })
                )}
                {renderIdentityButton('Refresh identity', () => identity.refreshSession(), 'secondary')}
                {renderIdentityButton('Sign out', () => identity.signOut(), 'secondary')}
              </View>

              {lastAction ? <Text style={styles.qaFeedback}>{lastAction}</Text> : null}
            </View>

            <View style={styles.separator} />
            <View style={styles.placeholderRow}>
              <Text style={styles.placeholderLabel}>Recovery pending live inbox verification</Text>
            </View>
            <View style={styles.separator} />
            <View style={styles.placeholderRow}>
              <Text style={styles.placeholderLabel}>Password change deferred</Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
