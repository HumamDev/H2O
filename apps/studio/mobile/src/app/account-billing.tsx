import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useBilling } from '@/billing/BillingContext';
import {
  MOBILE_BILLING_VERIFIED,
  PLAN_KEY_PRO_MONTHLY,
  PLAN_KEY_PRO_YEARLY,
  type BillingPlanKey,
} from '@/billing/billingConfig';
import {
  COCKPIT_BG,
  COCKPIT_BG_HOVER,
  COCKPIT_BG_RAISED,
  COCKPIT_CYAN,
  COCKPIT_EMBER,
  COCKPIT_HAIR,
  COCKPIT_HAIR_STRONG,
  COCKPIT_INK,
  COCKPIT_INK_DIM,
  COCKPIT_INK_FAINT,
} from '@/components/cockpit/tokens';
import { useTopBarMetrics } from '@/components/navigation/AppTopBar';
import { useIdentity } from '@/identity/IdentityContext';
import { useTheme } from '@/hooks/use-theme';
import { spacing, typography } from '@/theme';

type SymbolName = React.ComponentProps<typeof SymbolView>['name'];
type BusyAction = 'refresh' | 'checkout_monthly' | 'checkout_yearly' | 'portal' | null;

const FRIENDLY_BILLING_ERRORS: Record<string, string> = {
  'billing/provider-not-configured': 'Subscription service is not available right now.',
  'billing/provider-network-failed': 'Network error. Check your connection.',
  'billing/session-required': 'Sign in to manage your subscription.',
  'billing/entitlement-failed': "Couldn't refresh subscription status. Try again.",
  'billing/checkout-failed': "Couldn't start checkout. Try again.",
  'billing/checkout-url-invalid': 'Checkout returned an unexpected response.',
  'billing/checkout-already-pending': 'A checkout is already in progress. Complete it first.',
  'billing/subscription-already-active': 'You already have an active subscription.',
  'billing/checkout-price-not-configured': 'This plan is not available right now.',
  'billing/invalid-plan-key': 'Invalid plan selection.',
  'billing/portal-failed': "Couldn't open billing portal. Try again.",
  'billing/portal-url-invalid': 'Billing portal returned an unexpected response.',
  'billing/customer-not-found': 'No subscription on file yet.',
};

function friendlyBillingError(code: string | undefined): string | null {
  if (!code) return null;
  return FRIENDLY_BILLING_ERRORS[code] ?? 'Something went wrong. Try again.';
}

function formatRenewalDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return null;
  try {
    return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(ts));
  } catch {
    return new Date(ts).toLocaleDateString();
  }
}

function formatSyncedAgo(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return null;
  const seconds = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (seconds < 5) return 'Just now';
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return formatRenewalDate(iso);
}

function canManageBilling(entitlement: { premiumEnabled?: boolean; tier?: string; subscriptionStatus?: string | null } | null): boolean {
  if (!entitlement) return false;
  if (entitlement.premiumEnabled === true) return true;
  if (entitlement.tier === 'pro') return true;
  const status = String(entitlement.subscriptionStatus ?? '').toLowerCase();
  return ['active', 'trialing', 'past_due', 'unpaid', 'canceled'].includes(status);
}

export default function AccountBillingScreen() {
  const th = useTheme();
  const identity = useIdentity();
  const billing = useBilling();
  const { contentTopPadding, contentBottomPadding } = useTopBarMetrics();

  const [busy, setBusy] = useState<BusyAction>(null);

  const styles = useMemo(() => StyleSheet.create({
    safe: { flex: 1, backgroundColor: th.background },
    content: { padding: spacing.md, gap: spacing.lg },
    section: { gap: spacing.sm },
    sectionLabel: {
      ...typography.caption,
      color: COCKPIT_INK_DIM,
      letterSpacing: 1,
      textTransform: 'uppercase',
    },
    card: {
      backgroundColor: COCKPIT_BG_RAISED,
      borderRadius: 16,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: COCKPIT_HAIR,
      padding: spacing.md,
      gap: spacing.sm,
    },
    planRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    planLabel: { ...typography.title, color: COCKPIT_INK, fontSize: 24 },
    pill: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 999,
      backgroundColor: COCKPIT_BG_HOVER,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: COCKPIT_HAIR_STRONG,
    },
    pillActive: { backgroundColor: COCKPIT_EMBER, borderColor: COCKPIT_EMBER },
    pillText: { ...typography.caption, color: COCKPIT_INK, fontWeight: '700', letterSpacing: 0.5 },
    pillTextActive: { color: '#fff' },
    subtitle: { ...typography.body, color: COCKPIT_INK_DIM },
    button: {
      minHeight: 46,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: spacing.sm,
      borderRadius: 10,
      paddingHorizontal: spacing.md,
      paddingVertical: 12,
    },
    primaryButton: { backgroundColor: COCKPIT_EMBER },
    primaryButtonText: { ...typography.body, color: '#fff', fontWeight: '700' },
    secondaryButton: {
      backgroundColor: COCKPIT_BG_HOVER,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: COCKPIT_HAIR_STRONG,
    },
    secondaryButtonText: { ...typography.body, color: COCKPIT_INK, fontWeight: '700' },
    buttonDisabled: { opacity: 0.5 },
    refreshRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
    metaText: { ...typography.caption, color: COCKPIT_INK_FAINT },
    errorBanner: {
      borderRadius: 10,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: '#E15554',
      backgroundColor: 'rgba(225, 85, 84, 0.08)',
      padding: spacing.md,
    },
    errorText: { ...typography.body, color: '#E15554' },
    signedOutCard: {
      backgroundColor: COCKPIT_BG_RAISED,
      borderRadius: 16,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: COCKPIT_HAIR,
      padding: spacing.lg,
      alignItems: 'center',
      gap: spacing.md,
    },
    signedOutTitle: { ...typography.title, color: COCKPIT_INK, fontSize: 20 },
    signedOutSubtitle: { ...typography.body, color: COCKPIT_INK_DIM, textAlign: 'center' },
    linkText: { ...typography.body, color: COCKPIT_CYAN, fontWeight: '600' },
  }), [th.background]);

  const handleRefresh = useCallback(async () => {
    if (busy) return;
    setBusy('refresh');
    try {
      await billing.refreshEntitlementForced();
    } finally {
      setBusy(null);
    }
  }, [billing, busy]);

  const handleCheckout = useCallback(
    async (planKey: BillingPlanKey) => {
      if (busy) return;
      setBusy(planKey === PLAN_KEY_PRO_MONTHLY ? 'checkout_monthly' : 'checkout_yearly');
      try {
        await billing.startCheckout(planKey);
      } finally {
        setBusy(null);
      }
    },
    [billing, busy]
  );

  const handleManage = useCallback(async () => {
    if (busy) return;
    setBusy('portal');
    try {
      await billing.openCustomerPortal();
    } finally {
      setBusy(null);
    }
  }, [billing, busy]);

  // Signed-out view: redirect-friendly empty state.
  if (!identity.isSignedIn) {
    return (
      <SafeAreaView style={styles.safe} edges={[]}>
        <ScrollView contentContainerStyle={[styles.content, { paddingTop: contentTopPadding, paddingBottom: contentBottomPadding }]}>
          <View style={styles.signedOutCard}>
            <SymbolView
              name={{ ios: 'creditcard', android: 'credit_card', web: 'credit_card' } as SymbolName}
              size={36}
              weight="semibold"
              tintColor={COCKPIT_INK_DIM}
            />
            <Text style={styles.signedOutTitle}>Sign in to manage subscription</Text>
            <Text style={styles.signedOutSubtitle}>
              Your subscription is tied to your account. Sign in to view or change your plan.
            </Text>
            <TouchableOpacity onPress={() => router.push('/account-identity')} activeOpacity={0.7}>
              <Text style={styles.linkText}>Go to sign-in</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  const entitlement = billing.entitlement;
  const tier = entitlement?.tier ?? 'free';
  const status = String(entitlement?.subscriptionStatus ?? '').toLowerCase();
  const cancelAtPeriodEnd = entitlement?.cancelAtPeriodEnd === true;
  const renewalDate = formatRenewalDate(entitlement?.currentPeriodEnd);
  const trialEndDate = formatRenewalDate(entitlement?.validUntil);
  const syncedAgo = formatSyncedAgo(entitlement?.syncedAt);

  const showUpgrade = MOBILE_BILLING_VERIFIED
    && tier === 'free'
    && status !== 'past_due'
    && status !== 'unpaid';
  const showManage = MOBILE_BILLING_VERIFIED && canManageBilling(entitlement);

  let pillLabel = 'FREE';
  let pillActive = false;
  let planSubtitle: string;
  if (tier === 'pro') {
    pillActive = !cancelAtPeriodEnd && (status === 'active' || status === 'trialing');
    if (status === 'trialing') {
      pillLabel = 'TRIAL';
      planSubtitle = trialEndDate ? `Trial ends on ${trialEndDate}` : 'Trial active';
    } else if (cancelAtPeriodEnd) {
      pillLabel = 'ENDING';
      planSubtitle = renewalDate ? `Access ends on ${renewalDate}` : 'Subscription ending';
    } else if (status === 'past_due') {
      pillLabel = 'PAYMENT ISSUE';
      planSubtitle = 'Manage billing to keep access.';
    } else if (status === 'unpaid') {
      pillLabel = 'UNPAID';
      planSubtitle = 'Resolve in Manage billing.';
    } else if (status === 'active') {
      pillLabel = 'ACTIVE';
      planSubtitle = renewalDate ? `Renews on ${renewalDate}` : 'Subscription active';
    } else {
      pillLabel = 'PRO';
      planSubtitle = 'Subscription active.';
    }
  } else if (status === 'canceled') {
    pillLabel = 'CANCELED';
    planSubtitle = 'Subscription canceled.';
  } else {
    pillLabel = 'FREE';
    planSubtitle = 'Upgrade to unlock all features.';
  }

  const errorCopy = friendlyBillingError(billing.lastError?.code);

  return (
    <SafeAreaView style={styles.safe} edges={[]}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: contentTopPadding, paddingBottom: contentBottomPadding }]}>
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Plan</Text>
          <View style={styles.card}>
            <View style={styles.planRow}>
              <Text style={styles.planLabel}>{tier === 'pro' ? 'Pro' : 'Free'}</Text>
              <View style={[styles.pill, pillActive && styles.pillActive]}>
                <Text style={[styles.pillText, pillActive && styles.pillTextActive]}>{pillLabel}</Text>
              </View>
            </View>
            <Text style={styles.subtitle}>{planSubtitle}</Text>
          </View>
        </View>

        {(showUpgrade || showManage) ? (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Actions</Text>
            <View style={styles.card}>
              {showUpgrade ? (
                <>
                  <TouchableOpacity
                    style={[styles.button, styles.primaryButton, Boolean(busy) && styles.buttonDisabled]}
                    onPress={() => handleCheckout(PLAN_KEY_PRO_MONTHLY)}
                    activeOpacity={0.7}
                    disabled={Boolean(busy)}
                    accessibilityLabel="Upgrade to Pro Monthly">
                    {busy === 'checkout_monthly' ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.primaryButtonText}>Upgrade Monthly</Text>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.button, styles.secondaryButton, Boolean(busy) && styles.buttonDisabled]}
                    onPress={() => handleCheckout(PLAN_KEY_PRO_YEARLY)}
                    activeOpacity={0.7}
                    disabled={Boolean(busy)}
                    accessibilityLabel="Upgrade to Pro Yearly">
                    {busy === 'checkout_yearly' ? (
                      <ActivityIndicator color={COCKPIT_INK} />
                    ) : (
                      <Text style={styles.secondaryButtonText}>Upgrade Yearly</Text>
                    )}
                  </TouchableOpacity>
                </>
              ) : null}
              {showManage ? (
                <TouchableOpacity
                  style={[styles.button, styles.secondaryButton, Boolean(busy) && styles.buttonDisabled]}
                  onPress={handleManage}
                  activeOpacity={0.7}
                  disabled={Boolean(busy)}
                  accessibilityLabel="Manage subscription">
                  {busy === 'portal' ? (
                    <ActivityIndicator color={COCKPIT_INK} />
                  ) : (
                    <Text style={styles.secondaryButtonText}>Manage Subscription</Text>
                  )}
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        ) : null}

        {errorCopy ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{errorCopy}</Text>
          </View>
        ) : null}

        <View style={styles.section}>
          <View style={styles.card}>
            <View style={styles.refreshRow}>
              <Text style={styles.metaText}>
                {billing.loading ? 'Refreshing…' : syncedAgo ? `Last synced ${syncedAgo}` : 'Not synced yet'}
              </Text>
              <TouchableOpacity
                onPress={handleRefresh}
                activeOpacity={0.7}
                disabled={Boolean(busy)}
                accessibilityLabel="Refresh subscription status">
                <Text style={[styles.linkText, Boolean(busy) && styles.buttonDisabled]}>
                  {busy === 'refresh' ? 'Refreshing…' : 'Refresh'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
