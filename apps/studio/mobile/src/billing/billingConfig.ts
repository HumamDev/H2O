// Phase 5.0I mobile billing — dormant by default. Flip to true ONLY after the
// live-iPhone QA matrix passes (see Phase 5.0I closeout doc, future commit).
// While false, the Settings → Subscription/Billing row stays disabled and the
// /account-billing screen is unreachable from UI. The provider + context exist
// in source but are inert without this flag.
export const MOBILE_BILLING_VERIFIED = false;

// Backend-defined plan keys. The create-checkout-session Edge Function
// validates planKey against this same allow-list server-side; mobile mirrors
// it to fail fast and to populate UI button labels.
export const PLAN_KEY_PRO_MONTHLY = 'pro_monthly' as const;
export const PLAN_KEY_PRO_YEARLY = 'pro_yearly' as const;
export type BillingPlanKey = typeof PLAN_KEY_PRO_MONTHLY | typeof PLAN_KEY_PRO_YEARLY;

export function isBillingPlanKey(value: unknown): value is BillingPlanKey {
  return value === PLAN_KEY_PRO_MONTHLY || value === PLAN_KEY_PRO_YEARLY;
}

// Stripe URL allow-list. The Edge Functions return `{ url }` payloads pointing
// at Stripe-hosted Checkout / Customer Portal. Mobile validates each URL
// against the corresponding host prefix BEFORE handing it to
// WebBrowser.openBrowserAsync — anything failing the prefix check is treated
// as a server bug and surfaces as identity/billing-checkout-url-invalid or
// identity/billing-portal-url-invalid (so QA + the validator can detect any
// regression in the Edge Function response shape).
const CHECKOUT_URL_PREFIX = 'https://checkout.stripe.com/';
const PORTAL_URL_PREFIX = 'https://billing.stripe.com/';

export function isValidStripeCheckoutUrl(url: unknown): url is string {
  return typeof url === 'string' && url.startsWith(CHECKOUT_URL_PREFIX);
}

export function isValidStripePortalUrl(url: unknown): url is string {
  return typeof url === 'string' && url.startsWith(PORTAL_URL_PREFIX);
}

// Refresh throttle — entitlement is recomputed at most once per this window
// across all triggers (boot, AppState foreground, post-portal). Mirrors the
// browser Billing Core's REFRESH_THROTTLE_MS (30 s).
export const BILLING_REFRESH_THROTTLE_MS = 30 * 1000;
