import { getMobileSupabaseConfig, type MobileSupabaseConfig } from '../identity/mobileConfig';
import {
  isBillingPlanKey,
  isValidStripeCheckoutUrl,
  isValidStripePortalUrl,
  type BillingPlanKey,
} from './billingConfig';

// Phase 5.0I mobile billing — backend client.
//
// Reads entitlement via the get_current_entitlement RPC (SECURITY DEFINER,
// granted to authenticated). Mobile cannot SELECT the underlying billing_*
// tables directly (RLS blocks it); the RPC is the single safe read path.
//
// Initiates checkout / portal via the create-checkout-session and
// create-customer-portal-session Edge Functions. Both require Authorization:
// Bearer <user-JWT> + apikey: <anon-key>. The Edge Functions sign Stripe
// requests on the server side; the Stripe secret key never reaches mobile.
//
// Strict separation from identity: this provider receives a `getAccessToken`
// callback at construction time. It does NOT import or reference
// MobileSupabaseProvider directly. The 5.0I validator enforces this boundary.
//
// Uses raw fetch() against PostgREST + Edge Functions instead of importing
// @supabase/supabase-js. The 5.0B mobile-alignment validator pins the SDK to
// MobileSupabaseProvider.ts as the sole import site; mirroring identity's
// posture means the billing surface stays SDK-free.

const BILLING_RPC_NAME = 'get_current_entitlement';
const CHECKOUT_FN_PATH = 'create-checkout-session';
const PORTAL_FN_PATH = 'create-customer-portal-session';

export interface EntitlementSnapshot {
  tier: 'free' | 'pro';
  premiumEnabled: boolean;
  subscriptionStatus: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  validUntil: string | null;
  syncedAt: string;
}

export interface BillingErrorShape {
  code: string;
  message: string;
  action?: 'open_portal';
}

export interface MobileBillingProviderDeps {
  /**
   * Returns the current Supabase access token, or null if signed out.
   * Read at call time (not captured at construction) so post-refresh tokens
   * are visible without re-instantiating the provider.
   */
  getAccessToken: () => string | null;
}

function nowIso(): string {
  return new Date().toISOString();
}

function freeDefaultEntitlement(): EntitlementSnapshot {
  return {
    tier: 'free',
    premiumEnabled: false,
    subscriptionStatus: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    validUntil: null,
    syncedAt: nowIso(),
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function pickString(record: Record<string, unknown> | null, ...keys: string[]): string | null {
  if (!record) return null;
  for (const key of keys) {
    const v = record[key];
    if (typeof v === 'string') {
      const t = v.trim();
      if (t) return t;
    }
  }
  return null;
}

function pickBoolean(record: Record<string, unknown> | null, fallback: boolean, ...keys: string[]): boolean {
  if (!record) return fallback;
  for (const key of keys) {
    if (typeof record[key] === 'boolean') return record[key] === true;
  }
  return fallback;
}

/**
 * Parses the get_current_entitlement RPC response into a strict
 * EntitlementSnapshot. Defaults to free when the RPC returns null or
 * partial data — defensive against future backend additions that mobile
 * doesn't yet understand.
 */
export function parseEntitlement(raw: unknown): EntitlementSnapshot {
  const record = asRecord(raw);
  if (!record) return freeDefaultEntitlement();

  const tierRaw = pickString(record, 'tier');
  const tier: 'free' | 'pro' = tierRaw === 'pro' ? 'pro' : 'free';

  return {
    tier,
    premiumEnabled: pickBoolean(record, false, 'premiumEnabled', 'premium_enabled'),
    subscriptionStatus: pickString(record, 'subscriptionStatus', 'subscription_status'),
    currentPeriodEnd: pickString(record, 'currentPeriodEnd', 'current_period_end'),
    cancelAtPeriodEnd: pickBoolean(record, false, 'cancelAtPeriodEnd', 'cancel_at_period_end'),
    validUntil: pickString(record, 'validUntil', 'valid_until'),
    syncedAt: pickString(record, 'syncedAt', 'synced_at') ?? nowIso(),
  };
}

function makeBillingError(code: string, message: string, action?: 'open_portal'): BillingErrorShape {
  return action ? { code, message, action } : { code, message };
}

export class MobileBillingProvider {
  private deps: MobileBillingProviderDeps;

  constructor(deps: MobileBillingProviderDeps) {
    this.deps = deps;
  }

  private getConfigOrThrow(): MobileSupabaseConfig {
    const config = getMobileSupabaseConfig();
    if (!config) {
      throw makeBillingError('billing/provider-not-configured', 'Supabase config is not available.');
    }
    return config;
  }

  /**
   * Reads entitlement via get_current_entitlement RPC. Calls the PostgREST
   * RPC endpoint directly via fetch (mobile bundle does not import the
   * Supabase SDK; the 5.0B mobile-alignment validator pins SDK ownership to
   * MobileSupabaseProvider.ts only). Returns null when signed out.
   */
  async getCurrentEntitlement(): Promise<EntitlementSnapshot | null> {
    const token = this.deps.getAccessToken();
    if (!token) return null;

    const config = this.getConfigOrThrow();
    const url = `${config.url}/rest/v1/rpc/${BILLING_RPC_NAME}`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: config.anonKey,
          'Content-Type': 'application/json',
        },
        body: '{}',
      });
    } catch {
      throw makeBillingError('billing/provider-network-failed', 'Network error. Check your connection.');
    }

    if (!response.ok) {
      throw makeBillingError(
        'billing/entitlement-failed',
        'Could not refresh subscription status.'
      );
    }

    let data: unknown;
    try {
      data = await response.json();
    } catch {
      throw makeBillingError(
        'billing/entitlement-failed',
        'Subscription status response was malformed.'
      );
    }
    return parseEntitlement(data);
  }

  /**
   * Calls the create-checkout-session Edge Function. Returns the validated
   * Stripe Checkout URL on success. Surfaces server-side error codes
   * including subscription_already_active (with action: 'open_portal' so the
   * UI can auto-redirect to Manage) and checkout_already_pending.
   */
  async createCheckoutSession(planKey: BillingPlanKey): Promise<{ url: string }> {
    if (!isBillingPlanKey(planKey)) {
      throw makeBillingError('billing/invalid-plan-key', 'Invalid plan selection.');
    }
    const token = this.deps.getAccessToken();
    if (!token) {
      throw makeBillingError('billing/session-required', 'Sign in to upgrade.');
    }

    const config = this.getConfigOrThrow();
    const url = `${config.url}/functions/v1/${CHECKOUT_FN_PATH}`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: config.anonKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ planKey }),
      });
    } catch {
      throw makeBillingError('billing/provider-network-failed', 'Network error. Check your connection.');
    }

    let payload: Record<string, unknown> | null = null;
    try {
      payload = (await response.json()) as Record<string, unknown>;
    } catch {
      throw makeBillingError('billing/checkout-failed', "Couldn't start checkout. Try again.");
    }

    if (!response.ok || payload?.ok !== true) {
      const code = pickString(payload, 'errorCode', 'error') ?? 'billing/checkout-failed';
      const action = pickString(payload, 'action');
      const friendly =
        code === 'subscription_already_active'
          ? 'You already have an active subscription.'
          : code === 'checkout_already_pending'
            ? 'A checkout is already in progress.'
            : "Couldn't start checkout. Try again.";
      throw makeBillingError(
        normalizeBillingErrorCode(code),
        friendly,
        action === 'open_portal' ? 'open_portal' : undefined
      );
    }

    const checkoutUrl = pickString(payload, 'url');
    if (!isValidStripeCheckoutUrl(checkoutUrl)) {
      throw makeBillingError('billing/checkout-url-invalid', 'Checkout returned an unexpected response.');
    }
    return { url: checkoutUrl };
  }

  /**
   * Calls the create-customer-portal-session Edge Function. Returns the
   * validated Stripe Customer Portal URL on success. Surfaces
   * billing/customer-not-found when the user has no Stripe customer record
   * yet (e.g., never started checkout).
   */
  async createCustomerPortalSession(): Promise<{ url: string }> {
    const token = this.deps.getAccessToken();
    if (!token) {
      throw makeBillingError('billing/session-required', 'Sign in to manage billing.');
    }

    const config = this.getConfigOrThrow();
    const url = `${config.url}/functions/v1/${PORTAL_FN_PATH}`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: config.anonKey,
          'Content-Type': 'application/json',
        },
        body: '{}',
      });
    } catch {
      throw makeBillingError('billing/provider-network-failed', 'Network error. Check your connection.');
    }

    let payload: Record<string, unknown> | null = null;
    try {
      payload = (await response.json()) as Record<string, unknown>;
    } catch {
      throw makeBillingError('billing/portal-failed', "Couldn't open billing portal. Try again.");
    }

    if (!response.ok || payload?.ok !== true) {
      const code = pickString(payload, 'errorCode', 'error') ?? 'billing/portal-failed';
      const friendly =
        code.includes('customer-not-found')
          ? 'No subscription on file yet.'
          : "Couldn't open billing portal. Try again.";
      throw makeBillingError(normalizeBillingErrorCode(code), friendly);
    }

    const portalUrl = pickString(payload, 'url');
    if (!isValidStripePortalUrl(portalUrl)) {
      throw makeBillingError('billing/portal-url-invalid', 'Billing portal returned an unexpected response.');
    }
    return { url: portalUrl };
  }
}

/**
 * Server-side error codes come in two shapes:
 * - bare strings like 'subscription_already_active', 'checkout_already_pending'
 * - already-namespaced 'billing/customer-not-found'
 * Normalize to the namespaced 'billing/...' form so UI mapping is consistent.
 */
function normalizeBillingErrorCode(code: string): string {
  if (code.startsWith('billing/')) return code;
  if (code === 'subscription_already_active') return 'billing/subscription-already-active';
  if (code === 'checkout_already_pending') return 'billing/checkout-already-pending';
  if (code === 'invalid_plan_key') return 'billing/invalid-plan-key';
  if (code === 'authentication_required' || code === 'missing_authorization') {
    return 'billing/session-required';
  }
  if (code === 'checkout_price_not_configured') return 'billing/checkout-price-not-configured';
  return 'billing/checkout-failed';
}
