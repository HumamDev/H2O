// ==UserScript==
// @h2o-id             0d5b.subscription.modal
// @name               0D5b.⚫️💳 Subscription Modal 💳
// @namespace          H2O.Premium.CGX.subscription.modal
// @author             HumamDev
// @version            0.1.0
// @revision           001
// @build              260501-000000
// @description        Subscription Modal: display-only Free/Pro plan picker shell. No checkout, portal, entitlement writes, or secret handling.
// @match              https://chatgpt.com/*
// @run-at             document-idle
// @grant              none
// ==/UserScript==

(() => {
  'use strict';

  const W = window;
  const D = document;
  const H2O = (W.H2O = W.H2O || {});

  const OWNER = 'subscription-modal';
  const VERSION = '0.1.0';

  const ROOT_ID = 'h2o-billing-modal-root';
  const STYLE_ID = 'h2o-billing-modal-style';
  const EVENT_OPEN_REQUEST = 'billing:modal:open-request';
  const EVENT_CLOSE_REQUEST = 'billing:modal:close-request';
  const EVENT_OPENED = 'billing:modal:opened';
  const EVENT_CLOSED = 'billing:modal:closed';
  const EVENT_CHECKOUT_REQUESTED = 'billing:checkout:requested';
  const EVENT_PORTAL_REQUESTED = 'billing:portal:requested';
  const EVENT_REFRESHING = 'billing:entitlement:refreshing';
  const EVENT_CHANGED = 'billing:changed';
  const EVENT_ERROR = 'billing:error';

  const state = {
    open: false,
    root: null,
    lastActive: null,
    listenersBound: false,
    message: '',
    refreshing: false,
    refreshError: false,
  };

  ensureStyle();
  bindListeners();

  function billingApi() {
    return H2O.Billing || null;
  }

  function bindListeners() {
    if (state.listenersBound) return;
    state.listenersBound = true;
    W.addEventListener(EVENT_OPEN_REQUEST, onOpenRequest, true);
    W.addEventListener(EVENT_CLOSE_REQUEST, onCloseRequest, true);
    W.addEventListener(EVENT_REFRESHING, onBillingRefreshing, true);
    W.addEventListener(EVENT_CHANGED, onBillingChanged, true);
    W.addEventListener(EVENT_ERROR, onBillingError, true);
    W.addEventListener('keydown', onKeyDown, true);
  }

  function onOpenRequest(event) {
    openModal(event?.detail || {});
  }

  function onCloseRequest(event) {
    closeModal(event?.detail?.reason || 'api');
  }

  function onKeyDown(event) {
    if (!state.open || event.key !== 'Escape') return;
    event.preventDefault();
    closeModal('escape');
  }

  function onBillingChanged() {
    if (!state.open) return;
    state.refreshing = false;
    state.refreshError = false;
    const root = state.root || D.getElementById(ROOT_ID);
    if (root) render(root);
  }

  function onBillingRefreshing() {
    if (!state.open) return;
    state.refreshing = true;
    state.refreshError = false;
    const root = state.root || D.getElementById(ROOT_ID);
    if (root) render(root);
  }

  function onBillingError(event) {
    if (!state.open || event?.detail?.refresh !== true) return;
    state.refreshing = false;
    state.refreshError = true;
    const root = state.root || D.getElementById(ROOT_ID);
    if (root) render(root);
  }

  function openModal(opts = {}) {
    state.lastActive = D.activeElement instanceof HTMLElement ? D.activeElement : null;
    const root = ensureRoot();
    render(root);
    refreshEntitlement(root);
    root.hidden = false;
    root.dataset.h2oState = 'open';
    state.open = true;
    focusClose(root);
    emit(EVENT_OPENED, { source: sanitizeText(opts.source || 'api', 48) });
    return { ok: true };
  }

  function closeModal(reason = 'api') {
    const root = state.root || D.getElementById(ROOT_ID);
    if (!root) return { ok: true, closed: false };
    root.hidden = true;
    root.dataset.h2oState = 'closed';
    state.open = false;
    restoreFocus();
    emit(EVENT_CLOSED, { reason: sanitizeText(reason, 64) });
    return { ok: true, closed: true };
  }

  function ensureRoot() {
    let root = D.getElementById(ROOT_ID);
    if (root) {
      state.root = root;
      return root;
    }

    root = D.createElement('div');
    root.id = ROOT_ID;
    root.className = 'h2o-billing-modal-root';
    root.dataset.h2oOwner = OWNER;
    root.dataset.h2oState = 'closed';
    root.hidden = true;

    root.addEventListener('click', (event) => {
      if (event.target === root) closeModal('backdrop');
    }, true);

    D.body.appendChild(root);
    state.root = root;
    return root;
  }

  function render(root) {
    const plans = getPlans();
    const entitlement = getEntitlement();
    const uiState = deriveSubscriptionUiState(entitlement, state.message);
    const planCards = plans.map((plan) => renderPlanCard(plan, uiState)).join('');
    const canManage = uiState.canManage === true || state.message === 'subscription-already-active';
    const manageControl = canManage
      ? '<button class="h2o-billing-manage" type="button">Manage subscription</button>'
      : '';
    const message = statusMessage(uiState);
    const refreshMessage = refreshStatusMessage();

    root.innerHTML = `
      <section class="h2o-billing-dialog" role="dialog" aria-modal="true" aria-labelledby="h2o-billing-title">
        <header class="h2o-billing-header">
          <div>
            <p class="h2o-billing-kicker">Subscription</p>
            <h2 id="h2o-billing-title">Choose your H2O plan</h2>
          </div>
          <button class="h2o-billing-close" type="button" aria-label="Close subscription modal">×</button>
        </header>
        <div class="h2o-billing-status">${escapeHtml(uiState.statusText)}</div>
        ${refreshMessage ? `<div class="h2o-billing-refresh">${escapeHtml(refreshMessage)}</div>` : ''}
        ${message ? `<div class="h2o-billing-message">${escapeHtml(message)}</div>` : ''}
        <div class="h2o-billing-plans">${planCards}</div>
        <footer class="h2o-billing-footer">
          <span>Premium access is based on webhook-synced entitlement state.</span>
          ${manageControl}
        </footer>
      </section>
    `;

    const close = root.querySelector('.h2o-billing-close');
    close?.addEventListener('click', () => closeModal('close-button'), true);

    root.querySelectorAll('[data-h2o-billing-plan]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.preventDefault();
        const planKey = String(button.getAttribute('data-h2o-billing-plan') || '');
        const latestUiState = deriveSubscriptionUiState(getEntitlement(), state.message);
        if ((planKey === 'pro_monthly' || planKey === 'pro_yearly') && latestUiState.checkoutAllowed !== true) {
          if (latestUiState.key === 'checkout_pending') state.message = 'checkout-already-pending';
          render(root);
          return;
        }
        emit(EVENT_CHECKOUT_REQUESTED, {
          planKey,
          source: 'subscription-modal',
          available: true,
        });
        const result = billingApi()?.startCheckout?.(planKey, { source: 'subscription-modal' });
        if (!result || typeof result.then !== 'function') return;
        result.then((out) => {
          if (out?.errorCode === 'billing/subscription-already-active') {
            state.message = 'subscription-already-active';
            render(root);
          }
          if (out?.errorCode === 'billing/checkout-already-pending') {
            state.message = 'checkout-already-pending';
            render(root);
          }
        }).catch(() => {});
      }, true);
    });

    const manage = root.querySelector('.h2o-billing-manage');
    manage?.addEventListener('click', (event) => {
      event.preventDefault();
      manage.disabled = true;
      emit(EVENT_PORTAL_REQUESTED, {
        source: 'subscription-modal',
        available: true,
      });
      const result = billingApi()?.openCustomerPortal?.({ source: 'subscription-modal' });
      if (!result || typeof result.then !== 'function') {
        manage.disabled = false;
        return;
      }
      result.then((out) => {
        if (out?.ok === false) manage.disabled = false;
      }).catch(() => {
        manage.disabled = false;
      });
    }, true);
  }

  function renderPlanCard(plan, uiState) {
    const key = String(plan.key || '');
    const isFree = key === 'free';
    const isPaid = key === 'pro_monthly' || key === 'pro_yearly';
    const freeCurrent = isFree && uiState.currentPlan === 'free';
    const current = freeCurrent;
    const paidDisabled = isPaid && uiState.checkoutAllowed !== true;
    const disabled = current || paidDisabled || plan.actionEnabled !== true;
    const stateLabel = planStateLabel(plan, uiState, current);
    const actionLabel = planActionLabel(plan, uiState, current, paidDisabled);
    return `
      <article class="h2o-billing-plan${current ? ' is-current' : ''}">
        <div class="h2o-billing-plan-top">
          <h3>${escapeHtml(plan.label || '')}</h3>
          <span>${escapeHtml(stateLabel)}</span>
        </div>
        <div class="h2o-billing-price">${escapeHtml(plan.priceLabel || '')}</div>
        <p>${escapeHtml(plan.summary || '')}</p>
        <button
          type="button"
          class="h2o-billing-plan-action"
          data-h2o-billing-plan="${escapeAttr(key)}"
          ${disabled ? 'disabled' : ''}
        >${escapeHtml(actionLabel)}</button>
      </article>
    `;
  }

  function getPlans() {
    const api = billingApi();
    try {
      const plans = api?.getPlans?.();
      return Array.isArray(plans) ? plans : fallbackPlans();
    } catch {
      return fallbackPlans();
    }
  }

  function getEntitlement() {
    const api = billingApi();
    try {
      const self = api?.selfCheck?.();
      return self?.entitlement || fallbackEntitlement();
    } catch {
      return fallbackEntitlement();
    }
  }

  function refreshEntitlement(root) {
    const api = billingApi();
    const refresh = typeof api?.refreshEntitlement === 'function'
      ? api.refreshEntitlement.bind(api)
      : api?.getCurrentEntitlement?.bind(api);
    state.refreshing = true;
    state.refreshError = false;
    if (root && D.contains(root)) render(root);
    const result = refresh?.({ source: 'subscription-modal', force: true });
    if (!result || typeof result.then !== 'function') {
      state.refreshing = false;
      state.refreshError = true;
      if (root && D.contains(root)) render(root);
      return;
    }
    result.then((out) => {
      if (!state.open) return;
      state.refreshing = false;
      state.refreshError = out?.ok === false;
      const entitlement = getEntitlement();
      if (entitlement?.premiumEnabled !== true && state.message === 'subscription-already-active') {
        state.message = '';
      }
      const currentRoot = state.root || root;
      if (currentRoot && D.contains(currentRoot)) render(currentRoot);
    }).catch(() => {
      if (!state.open) return;
      state.refreshing = false;
      state.refreshError = true;
      const currentRoot = state.root || root;
      if (currentRoot && D.contains(currentRoot)) render(currentRoot);
    });
  }

  function fallbackPlans() {
    return [
      { key: 'free', label: 'Free', priceLabel: '$0', summary: 'Local H2O workspace tools.', stateLabel: 'Current plan', actionLabel: 'Current plan', actionEnabled: false },
      { key: 'pro_monthly', label: 'Pro Monthly', priceLabel: 'Coming soon', summary: 'Planned premium workspace features.', stateLabel: 'Coming soon', actionLabel: 'Checkout unavailable', actionEnabled: false },
      { key: 'pro_yearly', label: 'Pro Yearly', priceLabel: 'Coming soon', summary: 'Planned annual premium access.', stateLabel: 'Coming soon', actionLabel: 'Checkout unavailable', actionEnabled: false },
    ];
  }

  function fallbackEntitlement() {
    return {
      tier: 'free',
      premiumEnabled: false,
      subscriptionStatus: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      validUntil: null,
      syncedAt: null,
    };
  }

  function deriveSubscriptionUiState(entitlement, transientMessage) {
    const base = deriveSubscriptionUiStateBase(entitlement);
    if (transientMessage === 'checkout-already-pending') {
      return {
        ...base,
        key: 'checkout_pending',
        checkoutAllowed: false,
        message: 'Checkout already started. Please complete it or try again in a few minutes.',
        paidActionLabel: 'Checkout started',
      };
    }
    if (transientMessage === 'subscription-already-active') {
      return {
        ...base,
        message: 'You already have an active subscription.',
      };
    }
    return base;
  }

  function deriveSubscriptionUiStateBase(entitlement) {
    const status = normalizeStatus(entitlement?.subscriptionStatus);
    const dateText = formatAccessDate(entitlement?.currentPeriodEnd || entitlement?.validUntil);

    if (status === 'trialing') {
      return {
        key: 'trialing',
        currentPlan: 'pro_unknown',
        checkoutAllowed: false,
        canManage: true,
        statusText: dateText ? `Trial active · Ends on ${dateText}` : 'Trial active',
        message: '',
        proStateLabel: 'Trial active',
        paidActionLabel: 'Trial active',
      };
    }

    if (status === 'past_due') {
      return {
        key: 'past_due',
        currentPlan: 'pro_unknown',
        checkoutAllowed: false,
        canManage: true,
        statusText: 'Payment issue · Manage billing',
        message: '',
        proStateLabel: 'Payment issue',
        paidActionLabel: 'Manage billing',
      };
    }

    if (status === 'unpaid') {
      return {
        key: 'unpaid',
        currentPlan: 'pro_unknown',
        checkoutAllowed: false,
        canManage: true,
        statusText: 'Subscription unpaid · Manage billing',
        message: '',
        proStateLabel: 'Unpaid',
        paidActionLabel: 'Manage billing',
      };
    }

    if (status === 'canceled') {
      return {
        key: 'canceled',
        currentPlan: 'free',
        checkoutAllowed: true,
        canManage: false,
        statusText: 'Subscription canceled',
        message: '',
        proStateLabel: '',
        paidActionLabel: '',
      };
    }

    if (status === 'active' || entitlement?.premiumEnabled === true) {
      const canceling = entitlement.cancelAtPeriodEnd === true;
      return {
        key: canceling ? 'pro_canceling' : 'pro_active',
        currentPlan: 'pro_unknown',
        checkoutAllowed: false,
        canManage: true,
        statusText: accessStatusText(canceling, dateText),
        message: '',
        proStateLabel: 'Pro active',
        paidActionLabel: 'Pro active',
      };
    }

    return {
      key: 'free',
      currentPlan: 'free',
      checkoutAllowed: true,
      canManage: false,
      statusText: 'Current access: Free',
      message: '',
      proStateLabel: '',
      paidActionLabel: '',
    };
  }

  function accessStatusText(canceling, dateText) {
    if (!dateText) return 'Pro active';
    return canceling
      ? `Pro active · Access ends on ${dateText}`
      : `Pro active · Renews on ${dateText}`;
  }

  function statusMessage(uiState) {
    return uiState?.message || '';
  }

  function planStateLabel(plan, uiState, current) {
    if (current) return 'Current plan';
    const key = String(plan.key || '');
    if ((key === 'pro_monthly' || key === 'pro_yearly') && uiState?.proStateLabel) {
      return uiState.proStateLabel;
    }
    return plan.stateLabel || '';
  }

  function planActionLabel(plan, uiState, current, paidDisabled) {
    if (current) return 'Current plan';
    const key = String(plan.key || '');
    if (paidDisabled && (key === 'pro_monthly' || key === 'pro_yearly')) {
      return uiState?.paidActionLabel || 'Checkout unavailable';
    }
    return plan.actionLabel || 'Checkout unavailable';
  }

  function normalizeStatus(value) {
    return String(value || '').trim().toLowerCase();
  }

  function refreshStatusMessage() {
    if (state.refreshing) return 'Updating billing status...';
    if (state.refreshError) return 'Could not refresh billing status.';
    return '';
  }

  function formatAccessDate(value) {
    if (!value) return '';
    const date = new Date(String(value));
    const ms = date.getTime();
    if (!Number.isFinite(ms)) return '';
    try {
      return new Intl.DateTimeFormat(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      }).format(date);
    } catch {
      return date.toISOString().slice(0, 10);
    }
  }

  function focusClose(root) {
    const close = root.querySelector('.h2o-billing-close');
    if (close && typeof close.focus === 'function') {
      W.setTimeout(() => close.focus(), 0);
    }
  }

  function restoreFocus() {
    const el = state.lastActive;
    state.lastActive = null;
    if (el && typeof el.focus === 'function' && D.contains(el)) {
      try { el.focus(); } catch {}
    }
  }

  function ensureStyle() {
    if (D.getElementById(STYLE_ID)) return;
    const style = D.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${ROOT_ID}[hidden] { display: none !important; }
      #${ROOT_ID} {
        position: fixed;
        inset: 0;
        z-index: 2147483646;
        display: grid;
        place-items: center;
        padding: 24px;
        background: rgba(10, 12, 16, 0.48);
        color: #eef2f6;
        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      #${ROOT_ID} .h2o-billing-dialog {
        width: min(760px, calc(100vw - 32px));
        max-height: min(720px, calc(100vh - 32px));
        overflow: auto;
        border: 1px solid rgba(255,255,255,0.18);
        border-radius: 8px;
        background: #171a20;
        box-shadow: 0 24px 80px rgba(0,0,0,0.46);
      }
      #${ROOT_ID} .h2o-billing-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 16px;
        padding: 22px 22px 12px;
        border-bottom: 1px solid rgba(255,255,255,0.1);
      }
      #${ROOT_ID} .h2o-billing-kicker {
        margin: 0 0 5px;
        color: #9fb4c8;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0;
        text-transform: uppercase;
      }
      #${ROOT_ID} h2 {
        margin: 0;
        font-size: 22px;
        line-height: 1.2;
        letter-spacing: 0;
      }
      #${ROOT_ID} .h2o-billing-close {
        width: 34px;
        height: 34px;
        border: 1px solid rgba(255,255,255,0.18);
        border-radius: 6px;
        background: rgba(255,255,255,0.08);
        color: #f5f7fa;
        font-size: 22px;
        line-height: 1;
        cursor: pointer;
      }
      #${ROOT_ID} .h2o-billing-status {
        margin: 16px 22px 0;
        padding: 10px 12px;
        border: 1px solid rgba(127, 163, 190, 0.24);
        border-radius: 6px;
        background: rgba(127, 163, 190, 0.08);
        color: #cbd8e3;
        font-size: 13px;
      }
      #${ROOT_ID} .h2o-billing-message {
        margin: 10px 22px 0;
        padding: 10px 12px;
        border: 1px solid rgba(116, 188, 137, 0.34);
        border-radius: 6px;
        background: rgba(116, 188, 137, 0.1);
        color: #d8f0de;
        font-size: 13px;
      }
      #${ROOT_ID} .h2o-billing-refresh {
        margin: 10px 22px 0;
        color: #9fb4c8;
        font-size: 12px;
        line-height: 1.35;
      }
      #${ROOT_ID} .h2o-billing-plans {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 12px;
        padding: 16px 22px 18px;
      }
      #${ROOT_ID} .h2o-billing-plan {
        min-height: 212px;
        display: flex;
        flex-direction: column;
        gap: 10px;
        padding: 14px;
        border: 1px solid rgba(255,255,255,0.14);
        border-radius: 8px;
        background: #20252d;
      }
      #${ROOT_ID} .h2o-billing-plan.is-current {
        border-color: rgba(116, 188, 137, 0.5);
      }
      #${ROOT_ID} .h2o-billing-plan-top {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 8px;
      }
      #${ROOT_ID} h3 {
        margin: 0;
        font-size: 16px;
        line-height: 1.25;
        letter-spacing: 0;
      }
      #${ROOT_ID} .h2o-billing-plan-top span {
        color: #9fb4c8;
        font-size: 11px;
        white-space: nowrap;
      }
      #${ROOT_ID} .h2o-billing-price {
        font-size: 20px;
        font-weight: 700;
        letter-spacing: 0;
      }
      #${ROOT_ID} .h2o-billing-plan p {
        flex: 1 1 auto;
        margin: 0;
        color: #c2ccd6;
        font-size: 13px;
        line-height: 1.45;
      }
      #${ROOT_ID} .h2o-billing-plan-action {
        min-height: 36px;
        border: 1px solid rgba(255,255,255,0.16);
        border-radius: 6px;
        background: rgba(255,255,255,0.1);
        color: #f4f7fa;
        font-weight: 700;
      }
      #${ROOT_ID} .h2o-billing-plan-action:disabled {
        cursor: not-allowed;
        opacity: 0.62;
      }
      #${ROOT_ID} .h2o-billing-footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 0 22px 20px;
        color: #9fb4c8;
        font-size: 12px;
        line-height: 1.4;
      }
      #${ROOT_ID} .h2o-billing-manage {
        min-height: 34px;
        padding: 0 12px;
        border: 1px solid rgba(255,255,255,0.18);
        border-radius: 6px;
        background: rgba(255,255,255,0.1);
        color: #f4f7fa;
        font-size: 12px;
        font-weight: 700;
        cursor: pointer;
        white-space: nowrap;
      }
      #${ROOT_ID} .h2o-billing-manage:disabled {
        cursor: progress;
        opacity: 0.68;
      }
      @media (max-width: 720px) {
        #${ROOT_ID} { padding: 16px; }
        #${ROOT_ID} .h2o-billing-plans { grid-template-columns: 1fr; }
        #${ROOT_ID} .h2o-billing-footer {
          align-items: stretch;
          flex-direction: column;
        }
      }
    `;
    D.head.appendChild(style);
  }

  function emit(name, detail = {}) {
    try {
      W.dispatchEvent(new CustomEvent(name, {
        detail: detail && typeof detail === 'object' ? { ...detail } : {},
      }));
    } catch {}
  }

  function sanitizeText(value, max) {
    return String(value || '')
      .trim()
      .replace(/[^a-z0-9_:.@/-]/gi, '')
      .slice(0, max || 64) || 'unknown';
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[ch]));
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/`/g, '&#96;');
  }
})();
