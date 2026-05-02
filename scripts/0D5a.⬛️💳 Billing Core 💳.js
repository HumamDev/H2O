// ==UserScript==
// @h2o-id             0d5a.billing.core
// @name               0D5a.⬛️💳 Billing Core 💳
// @namespace          H2O.Premium.CGX.billing.core
// @author             HumamDev
// @version            0.2.0
// @revision           002
// @build              260501-000000
// @description        Billing Core: display-only subscription plan API and billing:* event surface. No checkout, portal, entitlement writes, or secret handling.
// @match              https://chatgpt.com/*
// @run-at             document-idle
// @grant              none
// ==/UserScript==

(() => {
  'use strict';

  const W = window;
  const D = document;
  const H2O = (W.H2O = W.H2O || {});

  const OWNER = 'billing-core';
  const VERSION = '0.2.0';

  const EVENT_READY = 'billing:ready';
  const EVENT_CHANGED = 'billing:changed';
  const EVENT_MODAL_OPEN_REQUEST = 'billing:modal:open-request';
  const EVENT_MODAL_CLOSE_REQUEST = 'billing:modal:close-request';
  const EVENT_CHECKOUT_REQUESTED = 'billing:checkout:requested';
  const EVENT_PORTAL_REQUESTED = 'billing:portal:requested';
  const EVENT_ENTITLEMENT_REFRESHING = 'billing:entitlement:refreshing';
  const EVENT_ERROR = 'billing:error';

  const MSG_BILLING_REQ = 'h2o-ext-billing:v1:req';
  const MSG_BILLING_RES = 'h2o-ext-billing:v1:res';
  const CHECKOUT_ACTION = 'billing:create-checkout-session';
  const ENTITLEMENT_ACTION = 'billing:get-current-entitlement';
  const PORTAL_ACTION = 'billing:create-customer-portal-session';
  const CHECKOUT_URL_PREFIX = 'https://checkout.stripe.com/';
  const PORTAL_URL_PREFIX = 'https://billing.stripe.com/';
  const CHECKOUT_TIMEOUT_MS = 30000;
  const REFRESH_THROTTLE_MS = 30000;
  const BOOT_REFRESH_DELAY_MS = 1500;
  const CHECKOUT_PLAN_KEYS = new Set(['pro_monthly', 'pro_yearly']);
  const SAFE_ERROR_CODES = new Set([
    'billing/invalid-plan-key',
    'billing/session-required',
    'billing/provider-unavailable',
    'billing/checkout-failed',
    'billing/checkout-url-invalid',
    'billing/checkout-already-pending',
    'billing/entitlement-failed',
    'billing/subscription-already-active',
    'billing/customer-not-found',
    'billing/portal-failed',
    'billing/portal-url-invalid',
  ]);

  const FALLBACK_ENTITLEMENT = Object.freeze({
    tier: 'free',
    premiumEnabled: false,
    subscriptionStatus: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    validUntil: null,
    syncedAt: null,
  });

  const PLANS = Object.freeze([
    Object.freeze({
      key: 'free',
      label: 'Free',
      cadence: 'Current access',
      priceLabel: '$0',
      summary: 'Local H2O workspace tools with no subscription checkout.',
      stateLabel: 'Current plan',
      actionLabel: 'Current plan',
      actionEnabled: false,
    }),
    Object.freeze({
      key: 'pro_monthly',
      label: 'Pro Monthly',
      cadence: 'Monthly',
      priceLabel: 'Monthly plan',
      summary: 'Premium workspace subscription through Stripe Checkout.',
      stateLabel: 'Available',
      actionLabel: 'Continue to Checkout',
      actionEnabled: true,
    }),
    Object.freeze({
      key: 'pro_yearly',
      label: 'Pro Yearly',
      cadence: 'Yearly',
      priceLabel: 'Yearly plan',
      summary: 'Annual premium workspace subscription through Stripe Checkout.',
      stateLabel: 'Available',
      actionLabel: 'Continue to Checkout',
      actionEnabled: true,
    }),
  ]);

  const listeners = new Set();
  let currentEntitlement = { ...FALLBACK_ENTITLEMENT };
  let lastRefreshAt = null;
  let refreshInFlight = null;
  let lastRefreshError = null;
  let lastPortalOpenedAt = null;
  let refreshTriggersBound = false;
  let bootRefreshTimer = 0;

  const existing = H2O.Billing;
  if (existing && existing.__owner === OWNER && typeof existing.dispose === 'function') {
    try { existing.dispose('reload'); } catch {}
  }

  const api = {
    __owner: OWNER,
    version: VERSION,
    getPlans,
    refreshEntitlement,
    getCurrentEntitlement,
    openSubscriptionModal,
    closeSubscriptionModal,
    startCheckout,
    openCustomerPortal,
    onChange,
    selfCheck,
    dispose,
  };

  H2O.Billing = api;
  bindRefreshTriggers();
  emit(EVENT_READY, { version: VERSION });
  notify('ready', { version: VERSION });

  function getPlans() {
    return PLANS.map((plan) => planForEntitlement(plan, currentEntitlement));
  }

  function getCurrentEntitlement(opts = {}) {
    return refreshEntitlement({ ...(opts && typeof opts === 'object' ? opts : {}), force: true });
  }

  async function refreshEntitlement(opts = {}) {
    const src = opts && typeof opts === 'object' ? opts : {};
    const detail = sanitizeSourceDetail(src);
    const force = src.force === true;
    if (refreshInFlight) return refreshInFlight;
    if (!force && !shouldRefreshNow()) {
      return { ...currentEntitlement };
    }

    emit(EVENT_ENTITLEMENT_REFRESHING, { ...detail, refreshing: true });
    notify('entitlement-refreshing', { ...detail, refreshing: true });

    refreshInFlight = (async () => {
      const result = await requestBillingBridge({ action: ENTITLEMENT_ACTION });
      lastRefreshAt = new Date().toISOString();

      if (result && result.ok === true) {
        const entitlement = normalizeEntitlement(result.entitlement || result);
        lastRefreshError = null;
        const changed = updateCurrentEntitlement(entitlement, detail.source || 'api');
        if (!changed) {
          const unchangedDetail = {
            reason: detail.source || 'api',
            entitlement: { ...currentEntitlement },
            unchanged: true,
          };
          emit(EVENT_CHANGED, unchangedDetail);
          notify('entitlement-refreshed', unchangedDetail);
        }
        return { ...currentEntitlement };
      }

      const error = safeError(result && result.errorCode, result && result.errorMessage);
      lastRefreshError = sanitizeRefreshError(error, detail.source || 'api');
      emit(EVENT_ERROR, {
        code: error.errorCode,
        message: error.errorMessage || '',
        refresh: true,
        quiet: true,
      });
      notify('error', { code: error.errorCode, refresh: true, quiet: true });
      return { ...currentEntitlement, ok: false, errorCode: error.errorCode, errorMessage: error.errorMessage };
    })();

    try {
      return await refreshInFlight;
    } finally {
      refreshInFlight = null;
    }
  }

  function shouldRefreshNow() {
    const now = Date.now();
    const lastRefreshMs = Date.parse(lastRefreshAt || '');
    const lastPortalMs = Date.parse(lastPortalOpenedAt || '');
    if (Number.isFinite(lastPortalMs) && (!Number.isFinite(lastRefreshMs) || lastRefreshMs < lastPortalMs)) return true;
    if (!Number.isFinite(lastRefreshMs)) return true;
    return now - lastRefreshMs >= REFRESH_THROTTLE_MS;
  }

  function bindRefreshTriggers() {
    if (refreshTriggersBound) return;
    refreshTriggersBound = true;
    W.addEventListener('focus', onRefreshFocus, true);
    W.addEventListener('pageshow', onRefreshPageShow, true);
    D.addEventListener('visibilitychange', onRefreshVisibilityChange, true);
    bootRefreshTimer = W.setTimeout(() => {
      refreshEntitlement({ source: 'boot' }).catch(() => {});
    }, BOOT_REFRESH_DELAY_MS);
  }

  function unbindRefreshTriggers() {
    if (!refreshTriggersBound) return;
    refreshTriggersBound = false;
    W.removeEventListener('focus', onRefreshFocus, true);
    W.removeEventListener('pageshow', onRefreshPageShow, true);
    D.removeEventListener('visibilitychange', onRefreshVisibilityChange, true);
    if (bootRefreshTimer) {
      W.clearTimeout(bootRefreshTimer);
      bootRefreshTimer = 0;
    }
  }

  function onRefreshFocus() {
    refreshEntitlement({ source: 'focus' }).catch(() => {});
  }

  function onRefreshPageShow() {
    refreshEntitlement({ source: 'pageshow' }).catch(() => {});
  }

  function onRefreshVisibilityChange() {
    if (D.visibilityState !== 'visible') return;
    refreshEntitlement({ source: 'visibility' }).catch(() => {});
  }

  function sanitizeRefreshError(error, source) {
    const src = error && typeof error === 'object' ? error : {};
    const out = {
      errorCode: SAFE_ERROR_CODES.has(String(src.errorCode || '').trim())
        ? String(src.errorCode || '').trim()
        : 'billing/entitlement-failed',
      source: sanitizeText(source || 'api', 48),
      at: new Date().toISOString(),
    };
    const message = String(src.errorMessage || '').trim();
    if (message) out.errorMessage = message.slice(0, 180);
    return out;
  }

  function openSubscriptionModal(opts = {}) {
    const detail = sanitizeSourceDetail(opts);
    emit(EVENT_MODAL_OPEN_REQUEST, detail);
    notify('modal-open-request', detail);
    return { ok: true, requested: true };
  }

  function closeSubscriptionModal(reason = 'api') {
    const detail = { reason: sanitizeReason(reason) };
    emit(EVENT_MODAL_CLOSE_REQUEST, detail);
    notify('modal-close-request', detail);
    return { ok: true, requested: true };
  }

  async function startCheckout(planKey, opts = {}) {
    const key = normalizeCheckoutPlanKey(planKey);
    if (!key) {
      const error = safeError('billing/invalid-plan-key');
      emit(EVENT_ERROR, { code: error.errorCode, planKey: sanitizeText(planKey, 64) });
      notify('error', { code: error.errorCode, planKey: sanitizeText(planKey, 64) });
      return error;
    }
    const detail = {
      ...sanitizeSourceDetail(opts),
      planKey: key,
      available: true,
    };
    emit(EVENT_CHECKOUT_REQUESTED, detail);
    notify('checkout-requested', detail);

    const result = await requestBillingBridge({
      action: CHECKOUT_ACTION,
      planKey: key,
    });
    if (!result || result.ok !== true) {
      const error = safeError(result && result.errorCode, result && result.errorMessage);
      emit(EVENT_ERROR, { code: error.errorCode, message: error.errorMessage || '', planKey: key });
      notify('error', { code: error.errorCode, planKey: key });
      return error;
    }

    const url = normalizeCheckoutUrl(result.url);
    if (!url) {
      const error = safeError('billing/checkout-url-invalid');
      emit(EVENT_ERROR, { code: error.errorCode, planKey: key });
      notify('error', { code: error.errorCode, planKey: key });
      return error;
    }

    try {
      W.location.assign(url);
    } catch {
      const error = safeError('billing/checkout-failed');
      emit(EVENT_ERROR, { code: error.errorCode, planKey: key });
      notify('error', { code: error.errorCode, planKey: key });
      return error;
    }
    return { ok: true, url };
  }

  async function openCustomerPortal(opts = {}) {
    const detail = {
      ...sanitizeSourceDetail(opts),
      available: true,
    };
    emit(EVENT_PORTAL_REQUESTED, detail);
    notify('portal-requested', detail);

    const result = await requestBillingBridge({ action: PORTAL_ACTION });
    if (!result || result.ok !== true) {
      const error = safeError(result && result.errorCode, result && result.errorMessage);
      emit(EVENT_ERROR, { code: error.errorCode, message: error.errorMessage || '' });
      notify('error', { code: error.errorCode });
      return error;
    }

    const url = normalizePortalUrl(result.url);
    if (!url) {
      const error = safeError('billing/portal-url-invalid');
      emit(EVENT_ERROR, { code: error.errorCode });
      notify('error', { code: error.errorCode });
      return error;
    }

    try {
      lastPortalOpenedAt = new Date().toISOString();
      W.location.assign(url);
    } catch {
      const error = safeError('billing/portal-failed');
      emit(EVENT_ERROR, { code: error.errorCode });
      notify('error', { code: error.errorCode });
      return error;
    }
    return { ok: true, url };
  }

  function onChange(listener) {
    if (typeof listener !== 'function') return () => {};
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function selfCheck() {
    return {
      ok: H2O.Billing === api,
      version: VERSION,
      planKeys: PLANS.map((plan) => plan.key),
      entitlement: { ...currentEntitlement },
      checkoutAvailable: true,
      portalAvailable: true,
      bridgeAvailable: typeof W.postMessage === 'function',
      exposesWindowAlias: false,
      lastRefreshAt,
      refreshInFlight: Boolean(refreshInFlight),
      lastRefreshError: lastRefreshError ? { ...lastRefreshError } : null,
      lastPortalOpenedAt,
    };
  }

  function dispose(reason = 'dispose') {
    unbindRefreshTriggers();
    if (H2O.Billing === api) {
      try { delete H2O.Billing; } catch { H2O.Billing = null; }
    }
    listeners.clear();
    emit(EVENT_CHANGED, { reason: sanitizeReason(reason), disposed: true });
  }

  function notify(type, detail) {
    const event = {
      type,
      detail: detail && typeof detail === 'object' ? { ...detail } : {},
      at: new Date().toISOString(),
    };
    for (const listener of Array.from(listeners)) {
      try { listener(event); } catch {}
    }
  }

  function emit(name, detail = {}) {
    try {
      W.dispatchEvent(new CustomEvent(name, {
        detail: detail && typeof detail === 'object' ? { ...detail } : {},
      }));
    } catch {}
  }

  function requestBillingBridge(req) {
    return new Promise((resolve) => {
      const id = `billing-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
      let settled = false;
      let timer = 0;
      const finish = (out) => {
        if (settled) return;
        settled = true;
        try { W.removeEventListener('message', onMessage, false); } catch {}
        if (timer) {
          try { W.clearTimeout(timer); } catch {}
        }
        resolve(out);
      };
      const onMessage = (ev) => {
        if (ev.source !== W) return;
        const data = ev.data;
        if (!data || data.type !== MSG_BILLING_RES || data.id !== id) return;
        finish(data);
      };
      try {
        W.addEventListener('message', onMessage, false);
        timer = W.setTimeout(() => {
          finish(safeError('billing/provider-unavailable', 'billing-stage/core-bridge-timeout'));
        }, CHECKOUT_TIMEOUT_MS);
        const bridgeReq = {
          action: String(req && req.action || ''),
        };
        if (req && Object.prototype.hasOwnProperty.call(req, 'planKey')) {
          bridgeReq.planKey = String(req.planKey || '');
        }
        W.postMessage({
          type: MSG_BILLING_REQ,
          id,
          req: bridgeReq,
        }, '*');
      } catch {
        finish(safeError('billing/provider-unavailable', 'billing-stage/core-bridge-post-failed'));
      }
    });
  }

  function safeError(errorCode, errorMessage = '') {
    const normalizedCode = normalizeBillingErrorCode(errorCode, errorMessage);
    const code = SAFE_ERROR_CODES.has(normalizedCode)
      ? normalizedCode
      : 'billing/checkout-failed';
    const out = { ok: false, errorCode: code };
    const message = String(errorMessage || '').trim();
    if (message) out.errorMessage = message.slice(0, 180);
    return out;
  }

  function normalizeBillingErrorCode(errorCode, errorMessage = '') {
    const code = String(errorCode || '').trim();
    const message = String(errorMessage || '').trim();
    if (code === 'billing/checkout-failed' && /status=409\b/.test(message) && /error=subscription_already_active\b/.test(message)) {
      return 'billing/subscription-already-active';
    }
    if (code === 'billing/checkout-failed' && /status=409\b/.test(message) && /error=checkout_already_pending\b/.test(message)) {
      return 'billing/checkout-already-pending';
    }
    return code;
  }

  function normalizeCheckoutPlanKey(planKey) {
    const key = String(planKey || '').trim();
    return CHECKOUT_PLAN_KEYS.has(key) ? key : '';
  }

  function normalizeCheckoutUrl(url) {
    const value = String(url || '').trim();
    return value.startsWith(CHECKOUT_URL_PREFIX) ? value : '';
  }

  function normalizePortalUrl(url) {
    const value = String(url || '').trim();
    return value.startsWith(PORTAL_URL_PREFIX) ? value : '';
  }

  function normalizeEntitlement(input) {
    const src = input && typeof input === 'object' ? input : {};
    return {
      tier: String(src.tier || 'free').trim() === 'pro' ? 'pro' : 'free',
      premiumEnabled: src.premiumEnabled === true,
      subscriptionStatus: src.subscriptionStatus == null ? null : sanitizeText(src.subscriptionStatus, 64),
      currentPeriodEnd: normalizeNullableIso(src.currentPeriodEnd),
      cancelAtPeriodEnd: src.cancelAtPeriodEnd === true,
      validUntil: normalizeNullableIso(src.validUntil),
      syncedAt: normalizeNullableIso(src.syncedAt),
    };
  }

  function updateCurrentEntitlement(next, reason = 'refresh') {
    const normalized = normalizeEntitlement(next);
    const previous = currentEntitlement;
    currentEntitlement = normalized;
    if (JSON.stringify(previous) === JSON.stringify(normalized)) return false;
    const detail = {
      reason: sanitizeText(reason, 64),
      entitlement: { ...normalized },
    };
    emit(EVENT_CHANGED, detail);
    notify('entitlement-changed', detail);
    return true;
  }

  function planForEntitlement(plan, entitlement) {
    const out = { ...plan };
    const key = String(out.key || '');
    const premium = entitlement && entitlement.premiumEnabled === true;
    if (key === 'free') {
      out.stateLabel = premium ? 'Available' : 'Current plan';
      out.actionLabel = premium ? 'Free' : 'Current plan';
      out.actionEnabled = false;
    } else if (key === 'pro_monthly' || key === 'pro_yearly') {
      if (premium) {
        out.stateLabel = 'Pro active';
        out.actionLabel = 'Current plan';
        out.actionEnabled = false;
      }
    }
    return out;
  }

  function normalizeNullableIso(value) {
    if (value == null || value === '') return null;
    const text = String(value || '').trim();
    const ms = Date.parse(text);
    return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
  }

  function normalizePlanKey(planKey) {
    const key = String(planKey || '').trim();
    return PLANS.some((plan) => plan.key === key) ? key : '';
  }

  function sanitizeSourceDetail(opts = {}) {
    const src = opts && typeof opts === 'object' ? opts : {};
    return {
      source: sanitizeText(src.source || 'api', 48),
    };
  }

  function sanitizeReason(reason) {
    return sanitizeText(reason || 'api', 64);
  }

  function sanitizeText(value, max) {
    return String(value || '')
      .trim()
      .replace(/[^a-z0-9_:.@/-]/gi, '')
      .slice(0, max || 64) || 'unknown';
  }
})();
