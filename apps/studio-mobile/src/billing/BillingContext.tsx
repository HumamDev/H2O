import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import * as WebBrowser from 'expo-web-browser';

import { useIdentity } from '@/identity/IdentityContext';
import {
  BILLING_REFRESH_THROTTLE_MS,
  isValidStripeCheckoutUrl,
  isValidStripePortalUrl,
  type BillingPlanKey,
} from './billingConfig';
import {
  MobileBillingProvider,
  type BillingErrorShape,
  type EntitlementSnapshot,
} from './MobileBillingProvider';

// Phase 5.0I — billing React context. Owns entitlement state in memory only;
// nothing here is persisted to AsyncStorage / SecureStore / mobileStorage.
// The 5.0I validator enforces that no entitlement data flows through any
// existing identity persistence helper.

export interface BillingContextValue {
  entitlement: EntitlementSnapshot | null;
  loading: boolean;
  lastError: BillingErrorShape | null;
  /** Manually re-fetch entitlement. Throttled per BILLING_REFRESH_THROTTLE_MS. */
  refreshEntitlement(): Promise<void>;
  /** Force a refresh ignoring the throttle (used after portal/checkout returns). */
  refreshEntitlementForced(): Promise<void>;
  startCheckout(planKey: BillingPlanKey): Promise<{ ok: boolean; errorCode?: string }>;
  openCustomerPortal(): Promise<{ ok: boolean; errorCode?: string }>;
}

const BillingContext = createContext<BillingContextValue | null>(null);

function isBillingError(value: unknown): value is BillingErrorShape {
  return Boolean(value && typeof value === 'object' && 'code' in value && 'message' in value);
}

interface BillingProviderProps {
  children: ReactNode;
}

export function BillingProvider({ children }: BillingProviderProps) {
  const identity = useIdentity();

  // Stable callback into IdentityContext for token-at-call-time. Captured into
  // a ref so the provider instance is created once and survives sign-in/out
  // transitions without rebuild churn.
  const tokenGetterRef = useRef<() => string | null>(identity.getAccessToken);
  tokenGetterRef.current = identity.getAccessToken;

  const providerRef = useRef<MobileBillingProvider | null>(null);
  if (!providerRef.current) {
    providerRef.current = new MobileBillingProvider({
      getAccessToken: () => tokenGetterRef.current(),
    });
  }

  const [entitlement, setEntitlement] = useState<EntitlementSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastError, setLastError] = useState<BillingErrorShape | null>(null);

  const lastRefreshAtRef = useRef<number>(0);
  const refreshInFlightRef = useRef<Promise<void> | null>(null);

  const performRefresh = useCallback(async (): Promise<void> => {
    const provider = providerRef.current;
    if (!provider) return;

    const token = tokenGetterRef.current();
    if (!token) {
      setEntitlement(null);
      setLastError(null);
      setLoading(false);
      lastRefreshAtRef.current = 0;
      return;
    }

    setLoading(true);
    try {
      const next = await provider.getCurrentEntitlement();
      setEntitlement(next);
      setLastError(null);
      lastRefreshAtRef.current = Date.now();
    } catch (error) {
      if (isBillingError(error)) {
        setLastError(error);
      } else {
        setLastError({
          code: 'billing/entitlement-failed',
          message: 'Could not refresh subscription status.',
        });
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshEntitlementForced = useCallback(async (): Promise<void> => {
    if (refreshInFlightRef.current) {
      try { await refreshInFlightRef.current; } catch { /* ignore */ }
      return;
    }
    const promise = performRefresh();
    refreshInFlightRef.current = promise;
    try { await promise; } finally { refreshInFlightRef.current = null; }
  }, [performRefresh]);

  const refreshEntitlement = useCallback(async (): Promise<void> => {
    const last = lastRefreshAtRef.current;
    if (last > 0 && Date.now() - last < BILLING_REFRESH_THROTTLE_MS) {
      return;
    }
    await refreshEntitlementForced();
  }, [refreshEntitlementForced]);

  // Boot: refresh once after identity reaches a terminal state and the user
  // is signed in. On sign-out, clear local entitlement immediately so the UI
  // never reads stale Pro state.
  useEffect(() => {
    if (!identity.isReady) return;
    if (!identity.isSignedIn) {
      setEntitlement(null);
      setLastError(null);
      lastRefreshAtRef.current = 0;
      return;
    }
    void refreshEntitlement();
  }, [identity.isReady, identity.isSignedIn, refreshEntitlement]);

  // Foreground refresh — when the app returns to active, re-check entitlement
  // (covers "user just paid in Stripe Checkout / changed plan in Portal and
  // came back to the app"). Throttled like the boot path.
  useEffect(() => {
    const handleChange = (next: AppStateStatus) => {
      if (next !== 'active') return;
      if (!identity.isSignedIn) return;
      void refreshEntitlement();
    };
    const sub = AppState.addEventListener('change', handleChange);
    return () => { sub.remove(); };
  }, [identity.isSignedIn, refreshEntitlement]);

  const startCheckout = useCallback(
    async (planKey: BillingPlanKey): Promise<{ ok: boolean; errorCode?: string }> => {
      const provider = providerRef.current;
      if (!provider) return { ok: false, errorCode: 'billing/provider-not-configured' };

      try {
        const { url } = await provider.createCheckoutSession(planKey);
        if (!isValidStripeCheckoutUrl(url)) {
          setLastError({ code: 'billing/checkout-url-invalid', message: 'Checkout returned an unexpected response.' });
          return { ok: false, errorCode: 'billing/checkout-url-invalid' };
        }
        // Open Stripe-hosted Checkout in SFSafariViewController. User dismisses
        // when payment completes (or cancels) — AppState foreground triggers
        // refreshEntitlement to pick up webhook-driven state changes.
        await WebBrowser.openBrowserAsync(url, { dismissButtonStyle: 'close' });
        // After dismissal, force an immediate refresh (bypass throttle) since
        // the webhook may have just updated entitlement server-side.
        await refreshEntitlementForced();
        setLastError(null);
        return { ok: true };
      } catch (error) {
        if (isBillingError(error)) {
          setLastError(error);
          // Auto-redirect to Portal on subscription_already_active per the
          // backend's `action: 'open_portal'` hint — mirrors the browser
          // Subscription Modal's behavior on the same code.
          if (error.action === 'open_portal') {
            try { await openCustomerPortalInternal(); } catch { /* surface original error only */ }
          }
          return { ok: false, errorCode: error.code };
        }
        setLastError({ code: 'billing/checkout-failed', message: "Couldn't start checkout. Try again." });
        return { ok: false, errorCode: 'billing/checkout-failed' };
      }
    },
    [refreshEntitlementForced]
  );

  // Internal portal open — used both by the explicit openCustomerPortal call
  // and by startCheckout's auto-redirect on subscription_already_active.
  const openCustomerPortalInternal = useCallback(async (): Promise<{ ok: boolean; errorCode?: string }> => {
    const provider = providerRef.current;
    if (!provider) return { ok: false, errorCode: 'billing/provider-not-configured' };

    try {
      const { url } = await provider.createCustomerPortalSession();
      if (!isValidStripePortalUrl(url)) {
        setLastError({ code: 'billing/portal-url-invalid', message: 'Billing portal returned an unexpected response.' });
        return { ok: false, errorCode: 'billing/portal-url-invalid' };
      }
      await WebBrowser.openBrowserAsync(url, { dismissButtonStyle: 'close' });
      await refreshEntitlementForced();
      setLastError(null);
      return { ok: true };
    } catch (error) {
      if (isBillingError(error)) {
        setLastError(error);
        return { ok: false, errorCode: error.code };
      }
      setLastError({ code: 'billing/portal-failed', message: "Couldn't open billing portal. Try again." });
      return { ok: false, errorCode: 'billing/portal-failed' };
    }
  }, [refreshEntitlementForced]);

  const openCustomerPortal = openCustomerPortalInternal;

  const value = useMemo<BillingContextValue>(
    () => ({
      entitlement,
      loading,
      lastError,
      refreshEntitlement,
      refreshEntitlementForced,
      startCheckout,
      openCustomerPortal,
    }),
    [
      entitlement,
      lastError,
      loading,
      openCustomerPortal,
      refreshEntitlement,
      refreshEntitlementForced,
      startCheckout,
    ]
  );

  return <BillingContext.Provider value={value}>{children}</BillingContext.Provider>;
}

export function useOptionalBilling(): BillingContextValue | null {
  return useContext(BillingContext);
}

export function useBilling(): BillingContextValue {
  const value = useOptionalBilling();
  if (!value) {
    throw new Error('useBilling must be used within BillingProvider.');
  }
  return value;
}
