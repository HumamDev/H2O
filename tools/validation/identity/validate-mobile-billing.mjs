// Mobile Billing validator (Phase 5.0I-A).
//
// Asserts the dormant mobile billing surface is wired correctly and that the
// Identity ↔ Billing boundary is preserved.
//
// What this validator enforces:
//   - billingConfig.ts exports MOBILE_BILLING_VERIFIED as a boolean literal.
//     Phase 5.0I-A lands with `false`; activation flips to `true` in a
//     separate gated commit.
//   - No Stripe SDK / Stripe API client is imported anywhere in mobile.
//   - No Stripe secret key / service-role key references exist in mobile.
//   - MobileBillingProvider uses the get_current_entitlement RPC and the two
//     Edge Functions (create-checkout-session, create-customer-portal-session).
//   - Checkout / portal URLs are validated against the Stripe host allow-list
//     before being passed to WebBrowser.openBrowserAsync.
//   - Settings Subscription/Billing row is gated by MOBILE_BILLING_VERIFIED.
//   - /account-billing route exists.
//   - BillingContext provider + useBilling hook exist.
//   - Entitlement state is memory-only — no writeSnapshot / writeSecureItem /
//     writeRefreshToken / sanitizeForPersistence calls from the billing module.
//   - No raw Stripe URLs are logged.
//   - identity-core IdentityProvider contract has NO billing methods on it.
//   - identity-debug.tsx is free of billing references (5.0B identity-debug
//     wall regression check).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

function read(rel) {
  return fs.readFileSync(path.join(REPO_ROOT, rel), "utf8");
}

function readOptional(rel) {
  try {
    return fs.readFileSync(path.join(REPO_ROOT, rel), "utf8");
  } catch {
    return "";
  }
}

function assert(cond, msg) {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exit(1);
  }
}

const BILLING_CONFIG_REL = "apps/studio-mobile/src/billing/billingConfig.ts";
const BILLING_PROVIDER_REL = "apps/studio-mobile/src/billing/MobileBillingProvider.ts";
const BILLING_CONTEXT_REL = "apps/studio-mobile/src/billing/BillingContext.tsx";
const SETTINGS_REL = "apps/studio-mobile/src/app/settings.tsx";
const LAYOUT_REL = "apps/studio-mobile/src/app/_layout.tsx";
const ACCOUNT_BILLING_REL = "apps/studio-mobile/src/app/account-billing.tsx";
const ACCOUNT_IDENTITY_REL = "apps/studio-mobile/src/app/account-identity.tsx";
const IDENTITY_DEBUG_REL = "apps/studio-mobile/src/app/identity-debug.tsx";
const IDENTITY_CONTEXT_REL = "apps/studio-mobile/src/identity/IdentityContext.tsx";
const IDENTITY_CORE_CONTRACTS_REL = "packages/identity-core/src/contracts.ts";
const IDENTITY_PROVIDER_REL = "apps/studio-mobile/src/identity/MobileSupabaseProvider.ts";
const PACKAGE_JSON_REL = "apps/studio-mobile/package.json";

const billingConfig = read(BILLING_CONFIG_REL);
const billingProvider = read(BILLING_PROVIDER_REL);
const billingContext = read(BILLING_CONTEXT_REL);
const settings = read(SETTINGS_REL);
const layout = read(LAYOUT_REL);
const accountBilling = read(ACCOUNT_BILLING_REL);
const accountIdentity = read(ACCOUNT_IDENTITY_REL);
const identityDebug = readOptional(IDENTITY_DEBUG_REL);
const identityContext = read(IDENTITY_CONTEXT_REL);
const identityContracts = read(IDENTITY_CORE_CONTRACTS_REL);
const identityProvider = read(IDENTITY_PROVIDER_REL);
const packageJson = read(PACKAGE_JSON_REL);

// ─── 1. MOBILE_BILLING_VERIFIED is a boolean literal ────────────────────────

const flagMatch = billingConfig.match(/export\s+const\s+MOBILE_BILLING_VERIFIED\s*=\s*(true|false)/);
assert(
  flagMatch,
  "billingConfig.ts must export MOBILE_BILLING_VERIFIED as a boolean literal"
);

// ─── 2. No Stripe SDK / Stripe API client in mobile ─────────────────────────

const mobileBundle = [
  billingConfig,
  billingProvider,
  billingContext,
  accountBilling,
  settings,
  layout,
  identityContext,
  identityProvider,
].join("\n");

const stripeSdkImportRe = /from\s+['"](stripe|@stripe\/[^'"]+)['"]|require\s*\(\s*['"](stripe|@stripe\/[^'"]+)['"]\s*\)/;
assert(
  !stripeSdkImportRe.test(mobileBundle),
  "mobile source must NOT import the Stripe SDK or @stripe/* packages — Stripe-hosted Checkout/Portal URLs only, opened via WebBrowser"
);

assert(
  !/"@?stripe[\/-]/.test(packageJson) || /"expo"/.test(packageJson),
  "studio-mobile/package.json must not declare @stripe/* dependencies (Stripe SDK is server-side only)"
);

// Heuristic: package.json should not list any 'stripe' or '@stripe/...' dep.
const pkgStripeMatch = packageJson.match(/"(@stripe\/[^"]+|stripe)"\s*:/);
assert(
  !pkgStripeMatch,
  `studio-mobile/package.json must not list any Stripe package as dependency (found: ${pkgStripeMatch?.[1] || "none"})`
);

// ─── 3. No Stripe secret / service-role references in mobile ────────────────

assert(
  !/\b(STRIPE_SECRET_KEY|stripe_secret_key|sk_test_|sk_live_|SUPABASE_SERVICE_ROLE_KEY|service_role)\b/i.test(mobileBundle),
  "mobile source must not reference Stripe secret keys or Supabase service-role keys"
);

// ─── 4. Provider uses RPC + Edge Functions ──────────────────────────────────

assert(
  /\bclient\.rpc\s*\(\s*['"`]get_current_entitlement['"`]\s*\)/.test(billingProvider)
    || /['"]get_current_entitlement['"]/.test(billingProvider),
  "MobileBillingProvider must call the get_current_entitlement RPC"
);
assert(
  /['"]create-checkout-session['"]/.test(billingProvider),
  "MobileBillingProvider must reference the create-checkout-session Edge Function"
);
assert(
  /['"]create-customer-portal-session['"]/.test(billingProvider),
  "MobileBillingProvider must reference the create-customer-portal-session Edge Function"
);
assert(
  /async\s+getCurrentEntitlement\s*\(\s*\)/.test(billingProvider),
  "MobileBillingProvider must define async getCurrentEntitlement()"
);
assert(
  /async\s+createCheckoutSession\s*\(/.test(billingProvider),
  "MobileBillingProvider must define async createCheckoutSession(planKey)"
);
assert(
  /async\s+createCustomerPortalSession\s*\(\s*\)/.test(billingProvider),
  "MobileBillingProvider must define async createCustomerPortalSession()"
);

// ─── 5. Checkout / portal URL allow-list checks ────────────────────────────

assert(
  /isValidStripeCheckoutUrl/.test(billingConfig)
    && /isValidStripePortalUrl/.test(billingConfig),
  "billingConfig.ts must export isValidStripeCheckoutUrl and isValidStripePortalUrl helpers"
);
assert(
  /https:\/\/checkout\.stripe\.com\//.test(billingConfig),
  "billingConfig.ts must hardcode the https://checkout.stripe.com/ allow-list prefix"
);
assert(
  /https:\/\/billing\.stripe\.com\//.test(billingConfig),
  "billingConfig.ts must hardcode the https://billing.stripe.com/ allow-list prefix"
);
assert(
  /isValidStripeCheckoutUrl\s*\(/.test(billingProvider) || /isValidStripeCheckoutUrl\s*\(/.test(billingContext),
  "Checkout URL validation (isValidStripeCheckoutUrl) must be called before opening the URL"
);
assert(
  /isValidStripePortalUrl\s*\(/.test(billingProvider) || /isValidStripePortalUrl\s*\(/.test(billingContext),
  "Portal URL validation (isValidStripePortalUrl) must be called before opening the URL"
);

// ─── 6. Settings row gated by MOBILE_BILLING_VERIFIED ──────────────────────

assert(
  /import\s+\{[^}]*MOBILE_BILLING_VERIFIED[^}]*\}\s+from\s+['"][^'"]*billingConfig['"]/.test(settings),
  "settings.tsx must import MOBILE_BILLING_VERIFIED from billingConfig"
);
const billingRowIdx = settings.indexOf("Subscription/Billing");
assert(
  billingRowIdx !== -1,
  "settings.tsx must render a 'Subscription/Billing' row"
);
const guardWindow = settings.slice(Math.max(0, billingRowIdx - 1200), billingRowIdx + 1200);
assert(
  /MOBILE_BILLING_VERIFIED/.test(guardWindow),
  "Subscription/Billing row in settings.tsx must be gated by MOBILE_BILLING_VERIFIED within the enclosing JSX"
);

// ─── 7. /account-billing route exists ───────────────────────────────────────

assert(
  /name="account-billing"/.test(layout),
  "_layout.tsx must register the account-billing Stack.Screen"
);
assert(
  /'\/account-billing'/.test(settings) || /"\/account-billing"/.test(settings),
  "settings.tsx must router.push to /account-billing"
);
assert(
  accountBilling.length > 0,
  "apps/studio-mobile/src/app/account-billing.tsx must exist"
);
assert(
  /export\s+default\s+function\s+AccountBillingScreen/.test(accountBilling),
  "account-billing.tsx must export default AccountBillingScreen component"
);

// ─── 8. BillingContext + useBilling hook ────────────────────────────────────

assert(
  /export\s+function\s+BillingProvider/.test(billingContext),
  "BillingContext.tsx must export BillingProvider"
);
assert(
  /export\s+function\s+useBilling/.test(billingContext),
  "BillingContext.tsx must export useBilling hook"
);
assert(
  /<BillingProvider>/.test(layout),
  "_layout.tsx must wrap children in <BillingProvider>"
);

// ─── 9. Entitlement is memory-only — no mobileStorage persistence ───────────

const billingModuleSource = [billingConfig, billingProvider, billingContext, accountBilling].join("\n");

const persistenceRe = /\b(writeSnapshot|writeRefreshToken|writeDeviceToken|sanitizeForPersistence|writeSessionMeta|AsyncStorage\.setItem|SecureStore\.setItemAsync)\b/;
assert(
  !persistenceRe.test(billingModuleSource),
  "billing module must NOT call any persistence helper (writeSnapshot, writeRefreshToken, sanitizeForPersistence, AsyncStorage.setItem, SecureStore.setItemAsync) — entitlement is memory-only"
);

// ─── 10. No raw Stripe URLs logged ──────────────────────────────────────────

assert(
  !/console\.(log|warn|error|debug|info)\s*\([^)]*https:\/\/(checkout|billing)\.stripe\.com/.test(mobileBundle),
  "mobile source must NOT log raw Stripe Checkout / Portal URLs (they may contain session-bound tokens in query strings)"
);

assert(
  !/console\.(log|warn|error|debug|info)\s*\([^)]*\b(stripe_customer_id|stripe_subscription_id|customer_id|subscription_id)\b/.test(mobileBundle),
  "mobile source must NOT log Stripe customer/subscription IDs"
);

// ─── 11. No billing methods on identity-core IdentityProvider contract ─────

assert(
  !/\b(getCurrentEntitlement|createCheckoutSession|createCustomerPortalSession|startCheckout|openCustomerPortal)\s*\(/.test(identityContracts),
  "identity-core/contracts.ts IdentityProvider interface must NOT declare any billing methods (Identity ↔ Billing boundary)"
);

// ─── 12. BillingContext consumes identity via getAccessToken (not direct provider access) ─

assert(
  !/from\s+['"][^'"]*MobileSupabaseProvider['"]/.test(billingContext)
    && !/MobileSupabaseProvider/.test(billingContext),
  "BillingContext must NOT import MobileSupabaseProvider directly — token access goes through useIdentity().getAccessToken"
);
assert(
  /useIdentity\s*\(\s*\)/.test(billingContext)
    && /getAccessToken/.test(billingContext),
  "BillingContext must consume identity via useIdentity() and getAccessToken callback"
);

// ─── 13. WebBrowser usage for opening Stripe URLs ──────────────────────────

assert(
  /WebBrowser\.openBrowserAsync\s*\(/.test(billingContext),
  "BillingContext must use WebBrowser.openBrowserAsync to open Stripe URLs (in-app SFSafariViewController)"
);

// ─── 14. AppState foreground refresh ───────────────────────────────────────

assert(
  /AppState\.addEventListener\s*\(\s*['"]change['"]/.test(billingContext),
  "BillingContext must listen for AppState 'change' events to refresh entitlement on foreground"
);
assert(
  /['"]active['"]/.test(billingContext),
  "BillingContext AppState handler must trigger on 'active' transitions"
);

// ─── 15. identity-debug.tsx free of billing references (5.0B wall regression) ─

const billingRefRe = /\b(MOBILE_BILLING_VERIFIED|useBilling|BillingProvider|BillingContext|MobileBillingProvider|startCheckout|openCustomerPortal|get_current_entitlement|create-checkout-session|create-customer-portal-session)\b/;
assert(
  !billingRefRe.test(identityDebug),
  "identity-debug.tsx must NOT reference any billing surface (5.0B identity-debug wall regression check)"
);

// ─── 16. account-billing screen gates Upgrade/Manage on MOBILE_BILLING_VERIFIED ─

assert(
  /import\s+\{[^}]*MOBILE_BILLING_VERIFIED[^}]*\}\s+from\s+['"][^'"]*billingConfig['"]/.test(accountBilling),
  "account-billing.tsx must import MOBILE_BILLING_VERIFIED from billingConfig"
);
assert(
  /MOBILE_BILLING_VERIFIED\s*&&/.test(accountBilling),
  "account-billing.tsx must gate Upgrade/Manage actions on MOBILE_BILLING_VERIFIED"
);

console.log("PASS: Mobile billing validator");
