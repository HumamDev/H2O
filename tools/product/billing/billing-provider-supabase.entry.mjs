(() => {
  "use strict";

  const VERSION = "0.1.0";
  const CHECKOUT_ACTION = "billing:create-checkout-session";
  const ENTITLEMENT_ACTION = "billing:get-current-entitlement";
  const PORTAL_ACTION = "billing:create-customer-portal-session";
  const CHECKOUT_URL_PREFIX = "https://checkout.stripe.com/";
  const PORTAL_URL_PREFIX = "https://billing.stripe.com/";
  const VALID_PLAN_KEYS = new Set(["pro_monthly", "pro_yearly"]);

  function safeError(errorCode, errorMessage = "") {
    const code = String(errorCode || "").trim();
    const out = {
      ok: false,
      errorCode: code || "billing/checkout-failed",
    };
    const message = String(errorMessage || "").trim();
    if (message) out.errorMessage = message.slice(0, 180);
    return out;
  }

  function normalizeProjectUrl(value) {
    const text = String(value || "").trim();
    try {
      const parsed = new URL(text);
      if (parsed.protocol !== "https:" || !/^[a-z0-9-]+\.supabase\.co$/i.test(parsed.hostname)) return "";
      return parsed.origin;
    } catch (_) {
      return "";
    }
  }

  function normalizeAccessToken(value) {
    const token = String(value || "").trim();
    if (!token || token.length > 16384 || /[\s<>]/.test(token)) return "";
    return token;
  }

  function normalizePublicClient(value) {
    const token = String(value || "").trim();
    if (!token || token.length > 4096 || /[\s<>]/.test(token)) return "";
    return token;
  }

  function normalizePlanKey(value) {
    const planKey = String(value || "").trim();
    return VALID_PLAN_KEYS.has(planKey) ? planKey : "";
  }

  function normalizeCheckoutUrl(value) {
    const url = String(value || "").trim();
    return url.startsWith(CHECKOUT_URL_PREFIX) ? url : "";
  }

  function normalizePortalUrl(value) {
    const url = String(value || "").trim();
    return url.startsWith(PORTAL_URL_PREFIX) ? url : "";
  }

  function sanitizeBackendError(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_/-]/g, "")
      .slice(0, 96) || "unknown";
  }

  function isSubscriptionAlreadyActiveError(status, upstreamCode) {
    return Number(status || 0) === 409 && String(upstreamCode || "") === "subscription_already_active";
  }

  function normalizeNullableIso(value) {
    if (value == null || value === "") return null;
    const text = String(value || "").trim();
    const ms = Date.parse(text);
    return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
  }

  function normalizeEntitlement(input) {
    const src = input && typeof input === "object" && !Array.isArray(input) ? input : {};
    return {
      tier: String(src.tier || "free").trim() === "pro" ? "pro" : "free",
      premiumEnabled: src.premiumEnabled === true,
      subscriptionStatus: src.subscriptionStatus == null
        ? null
        : String(src.subscriptionStatus || "").trim().replace(/[^a-z0-9_:-]/gi, "").slice(0, 64) || null,
      currentPeriodEnd: normalizeNullableIso(src.currentPeriodEnd),
      cancelAtPeriodEnd: src.cancelAtPeriodEnd === true,
      validUntil: normalizeNullableIso(src.validUntil),
      syncedAt: normalizeNullableIso(src.syncedAt),
    };
  }

  function makeAuthHeaders(accessToken, publicClient = "") {
    const headers = {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    };
    if (publicClient) headers.apikey = publicClient;
    return headers;
  }

  async function createCheckoutSession(input = {}) {
    const src = input && typeof input === "object" ? input : {};
    const action = String(src.action || CHECKOUT_ACTION).trim();
    if (action !== CHECKOUT_ACTION) return safeError("billing/provider-unavailable");

    const planKey = normalizePlanKey(src.planKey);
    if (!planKey) return safeError("billing/invalid-plan-key");

    const projectUrl = normalizeProjectUrl(src.projectUrl);
    const publicClient = normalizePublicClient(src.publicClient);
    const accessToken = normalizeAccessToken(src.accessToken);
    if (!projectUrl) return safeError("billing/provider-unavailable", "billing-stage/provider-project-url-missing");
    if (!accessToken) return safeError("billing/session-required", "billing-stage/provider-access-token-missing");

    const headers = makeAuthHeaders(accessToken, publicClient);

    let response = null;
    try {
      response = await fetch(`${projectUrl}/functions/v1/create-checkout-session`, {
        method: "POST",
        headers,
        body: JSON.stringify({ planKey }),
      });
    } catch (_) {
      return safeError("billing/checkout-failed", "billing-stage/provider-fetch-failed");
    }

    let payload = null;
    try {
      payload = await response.json();
    } catch (_) {
      payload = null;
    }

    if (!response || !response.ok) {
      const status = response ? Number(response.status || 0) : 0;
      const upstreamCode = payload && typeof payload === "object"
        ? sanitizeBackendError(payload.errorCode || payload.error)
        : "unknown";
      if (response && response.status === 401) return safeError("billing/session-required", "billing-stage/provider-edge-unauthorized");
      if (upstreamCode === "invalid_plan_key") return safeError("billing/invalid-plan-key");
      if (upstreamCode === "checkout_already_pending") return safeError("billing/checkout-already-pending");
      if (isSubscriptionAlreadyActiveError(status, upstreamCode)) return safeError("billing/subscription-already-active");
      return safeError(
        "billing/checkout-failed",
        `billing-stage/provider-edge-non-ok status=${status} error=${upstreamCode}`
      );
    }

    const url = normalizeCheckoutUrl(payload && payload.url);
    if (!url) return safeError("billing/checkout-url-invalid", "billing-stage/provider-checkout-url-invalid");
    return { ok: true, url };
  }

  async function getCurrentEntitlement(input = {}) {
    const src = input && typeof input === "object" ? input : {};
    const action = String(src.action || ENTITLEMENT_ACTION).trim();
    if (action !== ENTITLEMENT_ACTION) return safeError("billing/provider-unavailable");

    const projectUrl = normalizeProjectUrl(src.projectUrl);
    const publicClient = normalizePublicClient(src.publicClient);
    const accessToken = normalizeAccessToken(src.accessToken);
    if (!projectUrl) return safeError("billing/provider-unavailable", "billing-stage/provider-project-url-missing");
    if (!accessToken) return safeError("billing/session-required", "billing-stage/provider-access-token-missing");

    let response = null;
    try {
      response = await fetch(`${projectUrl}/rest/v1/rpc/get_current_entitlement`, {
        method: "POST",
        headers: makeAuthHeaders(accessToken, publicClient),
        body: "{}",
      });
    } catch (_) {
      return safeError("billing/entitlement-failed", "billing-stage/provider-entitlement-fetch-failed");
    }

    let payload = null;
    try {
      payload = await response.json();
    } catch (_) {
      payload = null;
    }

    if (!response || !response.ok) {
      const status = response ? Number(response.status || 0) : 0;
      const upstreamCode = payload && typeof payload === "object"
        ? sanitizeBackendError(payload.errorCode || payload.code || payload.error || payload.message)
        : "unknown";
      if (response && response.status === 401) {
        return safeError("billing/session-required", "billing-stage/provider-entitlement-unauthorized");
      }
      return safeError(
        "billing/entitlement-failed",
        `billing-stage/provider-entitlement-non-ok status=${status} error=${upstreamCode}`
      );
    }

    return {
      ok: true,
      entitlement: normalizeEntitlement(payload),
    };
  }

  async function createCustomerPortalSession(input = {}) {
    const src = input && typeof input === "object" ? input : {};
    const action = String(src.action || PORTAL_ACTION).trim();
    if (action !== PORTAL_ACTION) return safeError("billing/provider-unavailable");

    const projectUrl = normalizeProjectUrl(src.projectUrl);
    const publicClient = normalizePublicClient(src.publicClient);
    const accessToken = normalizeAccessToken(src.accessToken);
    if (!projectUrl) return safeError("billing/provider-unavailable", "billing-stage/provider-project-url-missing");
    if (!accessToken) return safeError("billing/session-required", "billing-stage/provider-access-token-missing");

    let response = null;
    try {
      response = await fetch(`${projectUrl}/functions/v1/create-customer-portal-session`, {
        method: "POST",
        headers: makeAuthHeaders(accessToken, publicClient),
        body: "{}",
      });
    } catch (_) {
      return safeError("billing/portal-failed", "billing-stage/provider-portal-fetch-failed");
    }

    let payload = null;
    try {
      payload = await response.json();
    } catch (_) {
      payload = null;
    }

    if (!response || !response.ok) {
      const status = response ? Number(response.status || 0) : 0;
      const upstreamCode = payload && typeof payload === "object"
        ? sanitizeBackendError(payload.errorCode || payload.error)
        : "unknown";
      if (response && response.status === 401) {
        return safeError(
          "billing/session-required",
          `billing-stage/provider-portal-non-ok status=${status} error=${upstreamCode}`
        );
      }
      if (upstreamCode === "billing/customer-not-found") return safeError("billing/customer-not-found");
      return safeError(
        "billing/portal-failed",
        `billing-stage/provider-portal-non-ok status=${status} error=${upstreamCode}`
      );
    }

    const url = normalizePortalUrl(payload && payload.url);
    if (!url) return safeError("billing/portal-url-invalid", "billing-stage/provider-portal-url-invalid");
    return { ok: true, url };
  }

  globalThis.H2O_BILLING_PROVIDER_BUNDLE_PROBE = Object.freeze({
    ok: true,
    kind: "supabase-billing-provider",
    version: VERSION,
    supportedActions: Object.freeze([CHECKOUT_ACTION, ENTITLEMENT_ACTION, PORTAL_ACTION]),
    createCheckoutSession,
    getCurrentEntitlement,
    createCustomerPortalSession,
  });
})();
