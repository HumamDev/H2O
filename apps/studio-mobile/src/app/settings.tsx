import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import React, { useMemo, useSyncExternalStore } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTopBarMetrics } from '@/components/navigation/AppTopBar';
import { useIdentity } from '@/identity/IdentityContext';
import { useTheme } from '@/hooks/use-theme';
import {
  getAppearanceMode,
  getTopBarPosition,
  setAppearanceMode,
  setTopBarPosition,
  subscribeAppearance,
  subscribeTopBarPosition,
  type AppearanceMode,
  type TopBarPosition,
} from '@/state/appearance';
import { spacing, typography } from '@/theme';

const APPEARANCE_OPTIONS: { value: AppearanceMode; label: string; hint?: string }[] = [
  { value: 'cockpit', label: 'Cockpit Pro', hint: 'Warm-charcoal premium dark' },
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

const TOP_BAR_OPTIONS: { value: TopBarPosition; label: string; hint?: string }[] = [
  { value: 'standard', label: 'Standard', hint: 'Top of screen' },
  { value: 'reachable', label: 'Reachable', hint: 'Bottom screen app bar' },
];

type SymbolName = React.ComponentProps<typeof SymbolView>['name'];

type SettingsRowProps = {
  icon: SymbolName;
  title: string;
  subtitle?: string;
  trailing?: string;
  onPress?: () => void;
  disabled?: boolean;
};

function maskEmail(email?: string | null): string {
  if (!email) return 'Not signed in';
  const [name, domain] = String(email).trim().toLowerCase().split('@');
  if (!name || !domain) return 'Email present';
  const visible = name.length <= 2 ? name.slice(0, 1) : `${name[0]}${name[name.length - 1]}`;
  return `${visible}***@${domain}`;
}

export default function SettingsScreen() {
  const th = useTheme();
  const identity = useIdentity();
  const mode = useSyncExternalStore(subscribeAppearance, getAppearanceMode);
  const topBarPos = useSyncExternalStore(subscribeTopBarPosition, getTopBarPosition);
  const { contentTopPadding, contentBottomPadding } = useTopBarMetrics();

  const styles = useMemo(() => StyleSheet.create({
    safe: { flex: 1, backgroundColor: th.background },
    content: { padding: spacing.md, gap: spacing.lg },
    accountPanel: {
      backgroundColor: th.backgroundElement,
      borderRadius: 28,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: th.backgroundSelected,
      padding: spacing.lg,
      gap: spacing.md,
    },
    accountTop: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
    },
    accountIcon: {
      width: 56,
      height: 56,
      borderRadius: 28,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: th.scheme === 'light' ? '#fff' : th.backgroundSelected,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: th.backgroundSelected,
    },
    accountText: { flex: 1, gap: 3 },
    accountTitle: { ...typography.title, color: th.text, fontSize: 22 },
    accountSubtitle: { ...typography.body, color: th.textSecondary },
    accountMetaRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    statusPill: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
      backgroundColor: th.backgroundSelected,
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
    },
    rowTrailingText: { ...typography.caption, color: th.textSecondary, fontWeight: '600' },
    chevron: { fontSize: 20, color: th.textSecondary, lineHeight: 24 },
    option: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.md,
      paddingVertical: 13,
    },
    optionLeft: { flex: 1, gap: 2 },
    optionLabel: { ...typography.body, color: th.text },
    optionLabelSelected: { color: th.accent, fontWeight: '600' },
    optionHint: { fontSize: 12, color: th.textSecondary },
    checkDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: th.accent },
    separator: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: th.backgroundSelected,
      marginLeft: spacing.md,
    },
  }), [th.accent, th.background, th.backgroundElement, th.backgroundSelected, th.scheme, th.text, th.textSecondary]);

  const snapshot = identity.snapshot;
  const safeEmail = maskEmail(snapshot.profile?.email ?? snapshot.pendingEmail ?? null);
  const signedInLabel = identity.isSignedIn ? 'Signed in' : 'Signed out';
  const providerLabel = snapshot.provider || 'local';
  const accountSubtitle = identity.isSignedIn ? safeEmail : 'Connect an account to sync identity state.';

  function renderOptions<T extends string>(
    options: { value: T; label: string; hint?: string }[],
    current: T,
    onSelect: (v: T) => void,
  ) {
    return options.map(({ value, label, hint }, index) => {
      const selected = current === value;
      const isLast = index === options.length - 1;
      return (
        <React.Fragment key={value}>
          <TouchableOpacity style={styles.option} onPress={() => onSelect(value)} activeOpacity={0.6}>
            <View style={styles.optionLeft}>
              <Text style={[styles.optionLabel, selected && styles.optionLabelSelected]}>{label}</Text>
              {hint ? <Text style={styles.optionHint}>{hint}</Text> : null}
            </View>
            {selected && <View style={styles.checkDot} />}
          </TouchableOpacity>
          {!isLast && <View style={styles.separator} />}
        </React.Fragment>
      );
    });
  }

  function renderRow({ icon, title, subtitle, trailing, onPress, disabled = false }: SettingsRowProps) {
    const content = (
      <>
        <View style={styles.rowIconWrap}>
          <SymbolView name={icon} size={20} weight="semibold" tintColor={disabled ? th.textSecondary : th.text} />
        </View>
        <View style={styles.rowBody}>
          <Text style={styles.rowTitle}>{title}</Text>
          {subtitle ? <Text style={styles.rowSubtitle} numberOfLines={2}>{subtitle}</Text> : null}
        </View>
        <View style={styles.rowTrailing}>
          {trailing ? <Text style={styles.rowTrailingText}>{trailing}</Text> : null}
          {onPress ? <Text style={styles.chevron}>{'›'}</Text> : null}
        </View>
      </>
    );

    if (!onPress) {
      return <View style={[styles.row, disabled && styles.rowDisabled]}>{content}</View>;
    }

    return (
      <TouchableOpacity
        style={[styles.row, disabled && styles.rowDisabled]}
        onPress={onPress}
        activeOpacity={0.6}
        disabled={disabled}
      >
        {content}
      </TouchableOpacity>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={[]}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: contentTopPadding, paddingBottom: contentBottomPadding }]}>
        <View style={styles.accountPanel}>
          <View style={styles.accountTop}>
            <View style={styles.accountIcon}>
              <SymbolView
                name={{ ios: 'person.crop.circle.fill', android: 'account_circle', web: 'account_circle' }}
                size={32}
                weight="semibold"
                tintColor={th.text}
              />
            </View>
            <View style={styles.accountText}>
              <Text style={styles.accountTitle}>Account</Text>
              <Text style={styles.accountSubtitle} numberOfLines={2}>{accountSubtitle}</Text>
            </View>
          </View>
          <View style={styles.accountMetaRow}>
            <View style={styles.statusPill}>
              <Text style={styles.statusPillText}>{signedInLabel}</Text>
            </View>
            <View style={styles.statusPill}>
              <Text style={styles.statusPillText}>{snapshot.status}</Text>
            </View>
            <View style={styles.statusPill}>
              <Text style={styles.statusPillText}>{providerLabel}</Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>ACCOUNT</Text>
          <View style={styles.card}>
            {renderRow({
              icon: { ios: 'key.fill', android: 'vpn_key', web: 'key' },
              title: 'Identity & Sign-in',
              subtitle: identity.isSignedIn ? safeEmail : 'Sign in to sync your account.',
              trailing: signedInLabel,
              onPress: () => router.push('/account-identity'),
            })}
            <View style={styles.separator} />
            {renderRow({
              icon: { ios: 'creditcard.fill', android: 'credit_card', web: 'credit_card' },
              title: 'Subscription/Billing',
              subtitle: 'Plan management is not active in 5.0B-core.',
              trailing: 'Soon',
              disabled: true,
            })}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>APPEARANCE</Text>
          <View style={styles.card}>
            {renderOptions(APPEARANCE_OPTIONS, mode, setAppearanceMode)}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>TOP BAR</Text>
          <View style={styles.card}>
            {renderOptions(TOP_BAR_OPTIONS, topBarPos, setTopBarPosition)}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>DATA</Text>
          <View style={styles.card}>
            {renderRow({
              icon: { ios: 'link', android: 'link', web: 'link' },
              title: 'Import ChatGPT Link',
              subtitle: 'Add a conversation from a shared URL.',
              onPress: () => router.push('/import-chatgpt-link'),
            })}
            <View style={styles.separator} />
            {renderRow({
              icon: { ios: 'square.and.arrow.down.on.square.fill', android: 'import_export', web: 'import_export' },
              title: 'Import / Export',
              subtitle: 'Move local archive data in or out.',
              onPress: () => router.push('/import-export'),
            })}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>DEVELOPER / QA</Text>
          <View style={styles.card}>
            {renderRow({
              icon: { ios: 'wrench.and.screwdriver.fill', android: 'build', web: 'build' },
              title: 'Identity Debug',
              subtitle: '5.0B QA controls and safe identity status.',
              trailing: 'QA',
              onPress: () => router.push('/identity-debug'),
            })}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
