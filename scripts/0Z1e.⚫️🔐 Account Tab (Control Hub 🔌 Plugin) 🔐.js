// ==UserScript==
// @h2o-id             0z1e.account.tab.control.hub.plugin
// @name               0Z1e.⚫️🔐 Account Tab (Control Hub 🔌 Plugin) 🔐
// @namespace          H2O.Premium.CGX.account.tab.control.hub.plugin
// @author             HumamDev
// @version            0.1.0
// @revision           001
// @build              260502-000000
// @description        Registers the Account and Security controls into Control Hub via plugin API.
// @match              https://chatgpt.com/*
// @run-at             document-idle
// @grant              none
// ==/UserScript==

(() => {
  'use strict';

  const W = window;
  const TOPW = W.top || W;
  const D = document;
  const H2O = (TOPW.H2O = TOPW.H2O || {});
  if (W !== TOPW) W.H2O = H2O;

  const EV_CHUB_READY_V1 = 'h2o.ev:prm:cgx:cntrlhb:ready:v1';
  const MARK = '__H2O_CHUB_ACCOUNT_TAB_PLUGIN_V010__';

  if (W[MARK]) return;
  W[MARK] = true;

  let LAST_API = null;
  let IDENTITY_UNSUB = null;
  let BILLING_UNSUB = null;
  let CLS = 'cgxui-cnhb';
  let PASSWORD_CHANGE_FEEDBACK = null;
  let ACCOUNT_SUBTAB = 'identity';
  let BILLING_REFRESH_IN_FLIGHT = false;
  let BILLING_REFRESH_REQUESTED = false;

  function getApi() {
    try {
      const root = TOPW.H2O || W.H2O;
      if (!root) return null;

      const isHubApi = (api) => api && typeof api.registerPlugin === 'function';
      const fast = [
        root?.CH?.cnhb,
        root?.CHUB?.cnhb,
        root?.CGX?.cnhb,
        root?.CH?.cntrlhb,
        root?.CHUB?.cntrlhb,
        root?.CHUB?.chub,
        root?.CGX?.cntrlhb,
        root?.CGX?.chub,
      ];

      for (const node of fast) {
        const api = node?.api;
        if (isHubApi(api)) return api;
      }

      for (const tok of Object.keys(root)) {
        const bucket = root[tok];
        if (!bucket || typeof bucket !== 'object') continue;
        for (const pid of Object.keys(bucket)) {
          const api = bucket?.[pid]?.api;
          if (isHubApi(api)) return api;
        }
      }
    } catch {}
    return null;
  }

  function safeCall(_label, fn) {
    try { return fn(); } catch {}
    return undefined;
  }

  function invalidate(api = LAST_API) {
    if (!api || typeof api.invalidate !== 'function') return;
    try { W.setTimeout(() => api.invalidate(), 0); } catch {}
  }

  function identityApi() {
    return safeCall('identity.api', () => W.H2O?.Identity) || null;
  }

  function billingApi() {
    return safeCall('billing.api', () => W.H2O?.Billing) || null;
  }

  function statusLabel(status) {
    const MAP = {
      anonymous_local: 'Signed out / local mode',
      email_pending: 'Email code sent / waiting for verification',
      recovery_code_pending: 'Recovery code sent / waiting for verification',
      email_confirmation_pending: 'Email confirmation pending',
      password_reset_email_sent: 'Password reset email sent',
      password_update_required: 'Password update required',
      verified_no_profile: 'Email verified - profile and workspace not completed',
      profile_ready: 'Profile ready',
      sync_ready: 'Account ready / synced',
      auth_error: 'Auth error',
    };
    return MAP[status] || (status ? String(status) : 'Unknown');
  }

  function statusHelp(status) {
    const MAP = {
      anonymous_local: 'Signed out or using local-only identity state.',
      email_pending: 'Email code has been requested and verification is pending.',
      recovery_code_pending: 'A recovery sign-in code has been requested. Set a new password after verifying the code.',
      email_confirmation_pending: 'Check your email to confirm your account, then sign in with your password.',
      password_reset_email_sent: 'If an account exists for that address, a password reset email has been sent.',
      password_update_required: 'Password recovery is verified. Set a new password before returning to the synced account.',
      verified_no_profile: 'Email is verified. Open onboarding to complete profile and workspace.',
      profile_ready: 'Local profile and workspace are ready.',
      sync_ready: 'Account profile and workspace are synced. You stay signed in on this browser until you sign out or your session is revoked.',
      auth_error: 'A safe identity error is available below.',
    };
    return MAP[status] || 'Identity state is unavailable.';
  }

  function renderInfoList(items) {
    const rows = Array.isArray(items) ? items.filter((item) => item && item.value != null && String(item.value).trim() !== '') : [];
    const root = D.createElement('div');
    root.className = `${CLS}-infoList`;
    if (!rows.length) return root;

    for (const item of rows) {
      const row = D.createElement('div');
      row.className = `${CLS}-infoLine`;

      const key = D.createElement('span');
      key.className = `${CLS}-infoKey`;
      key.textContent = item.label || 'Info';

      const value = D.createElement('span');
      value.className = `${CLS}-infoVal`;
      value.textContent = String(item.value || '');

      row.append(key, value);
      root.appendChild(row);
    }
    return root;
  }

  function renderStatus() {
    const api = identityApi();
    if (!api) {
      return renderInfoList([
        { label: 'Status', value: 'H2O.Identity not loaded' },
        { label: 'Note', value: 'Identity Core script may not be active.' },
      ]);
    }

    const d = safeCall('identity.diag', () => api.diag?.()) || {};
    const snap = safeCall('identity.snapshot', () => api.getSnapshot?.()) || {};
    const ws = safeCall('identity.workspace', () => api.getWorkspace?.()) || null;

    const status = d.status || snap.status || 'unknown';
    const rows = [];

    rows.push({ label: 'Status', value: statusLabel(status) });
    rows.push({ label: 'State', value: statusHelp(status) });
    if (d.mode) rows.push({ label: 'Mode', value: d.mode });
    if (d.provider) rows.push({ label: 'Provider', value: d.provider });
    if (d.credentialState || snap.credentialState) {
      const credentialState = String(d.credentialState || snap.credentialState || 'unknown');
      const credentialProvider = String(d.credentialProvider || snap.credentialProvider || 'unknown');
      const credentialLabel = credentialState === 'complete'
        ? (credentialProvider === 'google'
          ? 'Google sign-in'
          : (credentialProvider === 'multiple' ? 'Password + Google' : 'Password set'))
        : (credentialState === 'required' ? 'Password setup required' : 'Password status unknown');
      rows.push({ label: 'Credential', value: credentialLabel });
    }

    if (d.pendingEmail) {
      rows.push({ label: 'Email (pending)', value: d.pendingEmail });
    } else if (d.profileEmail) {
      rows.push({ label: 'Email', value: d.profileEmail });
    }

    if (d.hasProfile) {
      const profile = safeCall('identity.profile', () => api.getProfile?.()) || null;
      if (profile?.displayName) rows.push({ label: 'Display name', value: profile.displayName });
    }

    if (ws?.name) rows.push({ label: 'Workspace', value: ws.name });
    if (ws?.id) {
      const idStr = String(ws.id);
      rows.push({ label: 'Workspace ID', value: idStr.length > 28 ? idStr.slice(0, 28) + '...' : idStr });
    }

    rows.push({ label: 'Onboarding', value: d.onboardingCompleted ? 'Completed' : 'Not completed' });

    if (snap.updatedAt) {
      try { rows.push({ label: 'Last updated', value: new Date(snap.updatedAt).toLocaleString() }); } catch {}
    }

    if (status === 'auth_error' && d.lastError) {
      rows.push({ label: 'Error', value: String(d.lastError.code || d.lastError.message || 'Auth error') });
    }

    return renderInfoList(rows);
  }

  async function openOnboardingAction() {
    const api = identityApi();
    if (!api?.openOnboarding) return { message: 'Onboarding is unavailable.' };
    const win = await safeCall('identity.openOnboarding', () => api.openOnboarding());
    invalidate();
    return win
      ? { message: 'Onboarding page opened.' }
      : { message: 'Could not open onboarding. Ensure the H2O extension is active.' };
  }

  function showFirstRunPromptAction() {
    const api = W.H2O?.IdentityFirstRunPrompt || null;
    if (!api?.forceShow) return { message: 'First-run setup prompt is unavailable.' };
    const out = safeCall('identityFirstRunPrompt.forceShow', () => api.forceShow('control-hub'));
    invalidate();
    return out?.ok || out?.visible
      ? { message: 'Setup prompt shown.' }
      : { message: 'Setup prompt could not be shown. Ensure the first-run prompt script is enabled.' };
  }

  async function refreshAction() {
    const api = identityApi();
    if (!api) return { message: 'H2O.Identity not available.' };
    if (typeof api.refreshSession === 'function') {
      await safeCall('identity.refreshSession', () => api.refreshSession());
    }
    invalidate();
    return { message: 'Identity refreshed.' };
  }

  async function signOutAction() {
    const api = identityApi();
    if (!api?.signOut) return { message: 'Sign out unavailable.' };
    if (!W.confirm('Sign out of H2O Identity on this device?')) return { message: 'Canceled.' };
    await safeCall('identity.signOut', () => api.signOut());
    invalidate();
    return { message: 'Identity signed out and reset locally.' };
  }

  async function refreshBillingAction() {
    const api = billingApi();
    if (!api?.refreshEntitlement) return { message: 'Billing module not loaded.' };
    const out = await safeCall('billing.refreshEntitlement', () => api.refreshEntitlement({
      source: 'control-hub-account-billing',
      force: true,
    }));
    invalidate();
    return out?.ok === false
      ? { message: 'Could not refresh billing status.' }
      : { message: 'Billing status refreshed.' };
  }

  function openBillingSubscriptionAction() {
    const api = billingApi();
    if (!api?.openSubscriptionModal) return { message: 'Subscription modal is unavailable.' };
    const out = safeCall('billing.openSubscriptionModal', () => api.openSubscriptionModal({
      source: 'control-hub-account-billing',
    }));
    invalidate();
    return out?.ok
      ? { message: 'Subscription modal opened.' }
      : { message: 'Subscription modal could not be opened.' };
  }

  async function openBillingPortalAction() {
    const api = billingApi();
    if (!api?.openCustomerPortal) return { message: 'Customer Portal is unavailable.' };
    const out = await safeCall('billing.openCustomerPortal', () => api.openCustomerPortal({
      source: 'control-hub-account-billing',
    }));
    invalidate();
    return out?.ok === false
      ? { message: 'Could not open Customer Portal.' }
      : { message: 'Customer Portal opened.' };
  }

  function isProviderReady(snap, diag) {
    const status = String(diag?.status || snap?.status || '');
    return status === 'sync_ready'
      && String(diag?.mode || snap?.mode || '') === 'provider_backed'
      && String(diag?.provider || snap?.provider || '') === 'supabase';
  }

  function makeTextField(labelText, value, options = {}) {
    const wrap = D.createElement('label');
    wrap.className = `${CLS}-acctField`;
    const label = D.createElement('span');
    label.textContent = labelText;
    const input = D.createElement('input');
    input.type = options.type || 'text';
    input.value = value || '';
    input.autocomplete = options.autocomplete || 'off';
    input.spellcheck = false;
    if (options.placeholder) input.placeholder = options.placeholder;
    if (options.maxLength) input.maxLength = options.maxLength;
    wrap.append(label, input);
    return { wrap, input };
  }

  function makePasswordField(labelText, autocomplete) {
    const row = D.createElement('div');
    row.className = `${CLS}-acctPasswordRow`;
    const field = makeTextField(labelText, '', {
      type: 'password',
      autocomplete: autocomplete || 'off',
      maxLength: 1024,
    });
    const toggle = D.createElement('button');
    toggle.type = 'button';
    toggle.className = `${CLS}-acctTinyBtn`;
    toggle.textContent = 'Show';
    toggle.addEventListener('click', (evt) => {
      evt.preventDefault();
      field.input.type = field.input.type === 'password' ? 'text' : 'password';
      toggle.textContent = field.input.type === 'password' ? 'Show' : 'Hide';
    }, true);
    row.append(field.wrap, toggle);
    return { row, input: field.input };
  }

  function setPasswordChangeFeedback(message, tone = 'info') {
    const text = String(message || '').trim();
    PASSWORD_CHANGE_FEEDBACK = text ? { message: text, tone: String(tone || 'info') } : null;
  }

  function applyPasswordChangeFeedback(el) {
    if (!el || !PASSWORD_CHANGE_FEEDBACK?.message) return;
    el.textContent = PASSWORD_CHANGE_FEEDBACK.message;
    el.dataset.tone = PASSWORD_CHANGE_FEEDBACK.tone || 'info';
  }

  function renderSecuritySettings() {
    const api = identityApi();
    const root = D.createElement('div');
    root.className = `${CLS}-acctSecurity`;
    if (!api) {
      root.textContent = 'H2O.Identity is not available.';
      return root;
    }

    const snap = safeCall('identity.snapshot', () => api.getSnapshot?.()) || {};
    const diag = safeCall('identity.diag', () => api.diag?.()) || {};
    const ready = isProviderReady(snap, diag);
    const profile = safeCall('identity.profile', () => api.getProfile?.()) || snap.profile || null;
    const workspace = safeCall('identity.workspace', () => api.getWorkspace?.()) || snap.workspace || null;
    const credentialProvider = String(diag.credentialProvider || snap.credentialProvider || 'unknown');

    if (!ready) {
      const note = D.createElement('div');
      note.className = `${CLS}-acctNote`;
      note.textContent = 'Sign in and complete onboarding to manage account and security settings.';
      root.appendChild(note);
      return root;
    }

    if (profile) {
      const section = D.createElement('section');
      section.className = `${CLS}-acctSection`;
      const title = D.createElement('h4');
      title.textContent = 'Profile';
      const displayName = makeTextField('Display name', profile.displayName || '', {
        maxLength: 64,
        autocomplete: 'name',
      });
      const avatarColor = makeTextField('Avatar color', profile.avatarColor || '', {
        maxLength: 32,
      });
      const status = D.createElement('span');
      status.className = `${CLS}-acctStatus`;
      const save = D.createElement('button');
      save.type = 'button';
      save.className = `${CLS}-actionBtn primary`;
      save.textContent = 'Save profile';
      save.addEventListener('click', async (evt) => {
        evt.preventDefault();
        save.disabled = true;
        status.textContent = 'Saving profile...';
        try {
          const result = await api.updateProfile?.({
            displayName: displayName.input.value,
            avatarColor: avatarColor.input.value,
          });
          status.textContent = result?.status === 'auth_error'
            ? 'Could not save profile.'
            : 'Profile saved.';
        } catch (_) {
          status.textContent = 'Could not save profile.';
        } finally {
          save.disabled = false;
          invalidate();
        }
      }, true);
      const actions = D.createElement('div');
      actions.className = `${CLS}-acctActions`;
      actions.append(save, status);
      section.append(title, displayName.wrap, avatarColor.wrap, actions);
      root.appendChild(section);
    }

    if (workspace) {
      const section = D.createElement('section');
      section.className = `${CLS}-acctSection`;
      const title = D.createElement('h4');
      title.textContent = 'Workspace';
      const workspaceName = makeTextField('Workspace name', workspace.name || '', {
        maxLength: 64,
      });
      const status = D.createElement('span');
      status.className = `${CLS}-acctStatus`;
      const save = D.createElement('button');
      save.type = 'button';
      save.className = `${CLS}-actionBtn primary`;
      save.textContent = 'Rename workspace';
      save.addEventListener('click', async (evt) => {
        evt.preventDefault();
        save.disabled = true;
        status.textContent = 'Renaming workspace...';
        try {
          const result = await api.renameWorkspace?.({ workspaceName: workspaceName.input.value });
          status.textContent = result?.status === 'auth_error'
            ? 'Could not rename workspace.'
            : 'Workspace renamed.';
        } catch (_) {
          status.textContent = 'Could not rename workspace.';
        } finally {
          save.disabled = false;
          invalidate();
        }
      }, true);
      const actions = D.createElement('div');
      actions.className = `${CLS}-acctActions`;
      actions.append(save, status);
      section.append(title, workspaceName.wrap, actions);
      root.appendChild(section);
    }

    const security = D.createElement('section');
    security.className = `${CLS}-acctSection`;
    const securityTitle = D.createElement('h4');
    securityTitle.textContent = 'Security';
    security.appendChild(securityTitle);
    if (credentialProvider === 'password' || credentialProvider === 'multiple') {
      const current = makePasswordField('Current password', 'current-password');
      const next = makePasswordField('New password', 'new-password');
      const confirm = makePasswordField('Confirm new password', 'new-password');
      const status = D.createElement('span');
      status.className = `${CLS}-acctStatus`;
      status.setAttribute('aria-live', 'polite');
      applyPasswordChangeFeedback(status);
      const clearFeedbackOnEdit = () => {
        if (!PASSWORD_CHANGE_FEEDBACK) return;
        setPasswordChangeFeedback('');
        status.textContent = '';
        delete status.dataset.tone;
      };
      current.input.addEventListener('input', clearFeedbackOnEdit, true);
      next.input.addEventListener('input', clearFeedbackOnEdit, true);
      confirm.input.addEventListener('input', clearFeedbackOnEdit, true);
      const save = D.createElement('button');
      save.type = 'button';
      save.className = `${CLS}-actionBtn primary`;
      save.textContent = 'Change password';
      save.addEventListener('click', async (evt) => {
        evt.preventDefault();
        const nextValue = next.input.value || '';
        const confirmValue = confirm.input.value || '';
        if (nextValue.length < 12 || !nextValue.trim()) {
          setPasswordChangeFeedback('Use a stronger password.', 'error');
          status.textContent = 'Use a stronger password.';
          status.dataset.tone = 'error';
          return;
        }
        if (nextValue !== confirmValue) {
          setPasswordChangeFeedback('Passwords do not match.', 'error');
          status.textContent = 'Passwords do not match.';
          status.dataset.tone = 'error';
          return;
        }
        save.disabled = true;
        status.textContent = 'Changing password...';
        status.dataset.tone = 'info';
        try {
          const result = await api.changePassword?.({
            currentPassword: current.input.value,
            password: nextValue,
          });
          const ok = result?.status !== 'auth_error' && result?.ok !== false;
          const message = ok
            ? 'Password changed.'
            : 'Current password or new password was not accepted.';
          setPasswordChangeFeedback(message, ok ? 'success' : 'error');
          status.textContent = message;
          status.dataset.tone = ok ? 'success' : 'error';
        } catch (_) {
          const message = 'Current password or new password was not accepted.';
          setPasswordChangeFeedback(message, 'error');
          status.textContent = message;
          status.dataset.tone = 'error';
        } finally {
          current.input.value = '';
          next.input.value = '';
          confirm.input.value = '';
          save.disabled = false;
          invalidate();
        }
      }, true);
      const actions = D.createElement('div');
      actions.className = `${CLS}-acctActions`;
      actions.append(save, status);
      security.append(current.row, next.row, confirm.row, actions);
    } else if (credentialProvider === 'google') {
      const note = D.createElement('div');
      note.className = `${CLS}-acctNote`;
      note.textContent = 'Google sign-in is connected. Add password is deferred.';
      security.appendChild(note);
    } else {
      const note = D.createElement('div');
      note.className = `${CLS}-acctNote`;
      note.textContent = 'Credential status is not ready for password changes.';
      security.appendChild(note);
    }
    root.appendChild(security);

    return root;
  }

  function renderAccountSettings() {
    const root = D.createElement('div');
    root.className = `${CLS}-acctShell`;

    const tabs = D.createElement('div');
    tabs.className = `${CLS}-acctSubtabs`;
    tabs.setAttribute('role', 'tablist');
    tabs.setAttribute('aria-label', 'Account settings sections');
    [
      ['identity', 'Identity'],
      ['billing', 'Billing & Subscription'],
    ].forEach(([key, label]) => {
      const btn = D.createElement('button');
      btn.type = 'button';
      btn.className = `${CLS}-acctSubtab`;
      btn.textContent = label;
      btn.setAttribute('role', 'tab');
      btn.setAttribute('aria-selected', ACCOUNT_SUBTAB === key ? 'true' : 'false');
      btn.addEventListener('click', (evt) => {
        evt.preventDefault();
        setAccountSubtab(key);
      }, true);
      tabs.appendChild(btn);
    });

    const body = D.createElement('div');
    body.className = `${CLS}-acctSubtabBody`;
    body.setAttribute('role', 'tabpanel');
    if (ACCOUNT_SUBTAB === 'billing') {
      body.appendChild(renderBillingSubtab());
      requestBillingRefreshOnce();
    } else {
      body.appendChild(renderIdentitySubtab());
    }

    root.append(tabs, body);
    return root;
  }

  function setAccountSubtab(key) {
    const previous = ACCOUNT_SUBTAB;
    ACCOUNT_SUBTAB = key === 'billing' ? 'billing' : 'identity';
    if (ACCOUNT_SUBTAB !== previous) BILLING_REFRESH_REQUESTED = false;
    if (ACCOUNT_SUBTAB === 'billing') requestBillingRefreshOnce();
    invalidate();
  }

  function renderIdentitySubtab() {
    const root = D.createElement('div');
    root.className = `${CLS}-acctStack`;
    root.append(
      renderAccountSection('Identity', 'Safe H2O identity state. Provider sessions and tokens stay background-owned.', renderStatus()),
      renderAccountActionSection('Onboarding', 'Open the onboarding page to set up or review your account profile.', [
        { label: 'Open Onboarding', primary: true, action: openOnboardingAction },
      ]),
      renderAccountSection('Account & Security', 'Edit safe account details and change password for password-backed accounts.', renderSecuritySettings()),
      renderAccountActionSection('Testing', 'Force-show the soft first-run setup prompt for local/dev testing.', [
        { label: 'Show Setup Prompt', action: showFirstRunPromptAction },
      ]),
      renderAccountActionSection('Session', 'Re-read the current background-owned identity state from storage.', [
        { label: 'Refresh Identity', action: refreshAction },
      ]),
      renderAccountActionSection('Reset', 'Signs out locally and clears background-owned provider session material when present.', [
        { label: 'Sign Out', action: signOutAction },
      ]),
    );
    return root;
  }

  function renderBillingSubtab() {
    const api = billingApi();
    const root = D.createElement('div');
    root.className = `${CLS}-acctStack`;
    if (!api?.selfCheck) {
      root.appendChild(renderAccountSection(
        'Billing & Subscription',
        'Billing module not loaded.',
        renderInfoList([{ label: 'Status', value: 'Billing module not loaded' }]),
      ));
      return root;
    }

    const self = safeCall('billing.selfCheck', () => api.selfCheck()) || {};
    const entitlement = self.entitlement && typeof self.entitlement === 'object' ? self.entitlement : {};
    const lastErrorCode = safeBillingErrorCode(self.lastRefreshError);
    const rows = [
      { label: 'Tier', value: safeField(entitlement.tier || 'free') },
      { label: 'Premium enabled', value: entitlement.premiumEnabled === true ? 'true' : 'false' },
      { label: 'Subscription status', value: safeField(entitlement.subscriptionStatus || 'none') },
      { label: 'Current period end', value: formatDateTime(entitlement.currentPeriodEnd) || 'none' },
      { label: 'Valid until', value: formatDateTime(entitlement.validUntil) || 'none' },
      { label: 'Cancel at period end', value: entitlement.cancelAtPeriodEnd === true ? 'true' : 'false' },
      { label: 'Checkout available', value: self.checkoutAvailable === true ? 'true' : 'false' },
      { label: 'Portal available', value: self.portalAvailable === true ? 'true' : 'false' },
      { label: 'Last refresh', value: formatDateTime(self.lastRefreshAt) || 'none' },
      { label: 'Last refresh error', value: lastErrorCode || 'none' },
    ];

    root.appendChild(renderAccountSection(
      'Billing & Subscription',
      'Safe billing state from H2O.Billing. Entitlement writes stay webhook-owned.',
      renderInfoList(rows),
    ));

    const canManage = canManageBilling(self);
    root.appendChild(renderAccountActionSection('Billing actions', 'Use Stripe-hosted billing surfaces. No tokens or secrets are exposed to the page.', [
      { label: 'Refresh billing status', primary: true, action: refreshBillingAction },
      { label: 'Open subscription modal', action: openBillingSubscriptionAction },
      { label: 'Manage subscription', action: openBillingPortalAction, disabled: !canManage },
    ]));
    return root;
  }

  function renderAccountSection(titleText, helpText, content) {
    const section = D.createElement('section');
    section.className = `${CLS}-acctSection`;
    const title = D.createElement('h4');
    title.textContent = titleText;
    section.appendChild(title);
    if (helpText) {
      const help = D.createElement('div');
      help.className = `${CLS}-acctNote`;
      help.textContent = helpText;
      section.appendChild(help);
    }
    if (content) section.appendChild(content);
    return section;
  }

  function renderAccountActionSection(titleText, helpText, buttons) {
    const section = renderAccountSection(titleText, helpText, null);
    const actions = D.createElement('div');
    actions.className = `${CLS}-acctActions`;
    const status = D.createElement('span');
    status.className = `${CLS}-acctStatus`;
    status.setAttribute('aria-live', 'polite');

    (Array.isArray(buttons) ? buttons : []).forEach((btnDef) => {
      const btn = D.createElement('button');
      btn.type = 'button';
      btn.className = `${CLS}-actionBtn${btnDef.primary ? ' primary' : ''}`;
      btn.textContent = btnDef.label || 'Run';
      if (btnDef.disabled) btn.disabled = true;
      btn.addEventListener('click', async (evt) => {
        evt.preventDefault();
        if (typeof btnDef.action !== 'function') {
          status.textContent = 'No handler.';
          return;
        }
        btn.disabled = true;
        status.textContent = 'Working...';
        try {
          const result = await Promise.resolve(btnDef.action());
          status.textContent = String(result?.message || result?.msg || '');
        } catch (_) {
          status.textContent = 'Action failed.';
        } finally {
          btn.disabled = !!btnDef.disabled;
        }
      }, true);
      actions.appendChild(btn);
    });

    actions.appendChild(status);
    section.appendChild(actions);
    return section;
  }

  function requestBillingRefreshOnce() {
    if (BILLING_REFRESH_IN_FLIGHT || BILLING_REFRESH_REQUESTED) return;
    const api = billingApi();
    if (!api?.refreshEntitlement) return;
    BILLING_REFRESH_REQUESTED = true;
    BILLING_REFRESH_IN_FLIGHT = true;
    Promise.resolve()
      .then(() => api.refreshEntitlement({ source: 'control-hub-account-billing', force: false }))
      .catch(() => null)
      .finally(() => {
        BILLING_REFRESH_IN_FLIGHT = false;
        invalidate();
      });
  }

  function canManageBilling(self) {
    if (self?.portalAvailable !== true) return false;
    const entitlement = self.entitlement && typeof self.entitlement === 'object' ? self.entitlement : {};
    const status = String(entitlement.subscriptionStatus || '').toLowerCase();
    return entitlement.premiumEnabled === true
      || String(entitlement.tier || '').toLowerCase() === 'pro'
      || ['active', 'trialing', 'past_due', 'unpaid', 'canceled'].includes(status);
  }

  function safeBillingErrorCode(error) {
    if (!error || typeof error !== 'object') return '';
    return safeField(error.errorCode || error.code || '');
  }

  function safeField(value) {
    return String(value ?? '')
      .trim()
      .replace(/[^a-z0-9_:.@/-]/gi, '')
      .slice(0, 80);
  }

  function formatDateTime(value) {
    if (!value) return '';
    const date = new Date(String(value));
    if (!Number.isFinite(date.getTime())) return '';
    try { return date.toLocaleString(); } catch {}
    return date.toISOString();
  }

  function openSubscriptionAction() {
    const api = W.H2O?.Billing || null;
    if (!api?.openSubscriptionModal) return { message: 'Subscription modal is unavailable.' };
    const out = safeCall('billing.openSubscriptionModal', () => api.openSubscriptionModal({ source: 'control-hub' }));
    invalidate();
    return out?.ok
      ? { message: 'Subscription modal opened.' }
      : { message: 'Subscription modal could not be opened.' };
  }

  function accountCssText(skin = {}) {
    const skinCls = skin.CLS || CLS || 'cgxui-cnhb';
    const panelSel = skin.panelSel || `[data-cgxui="${skin.UI_CHUB_PANEL || 'cnhb-panel'}"][data-cgxui-owner="${skin.SkID || 'cnhb'}"]`;
    return `
${panelSel} .${skinCls}-acctSecurity{
  display:grid;
  gap:12px;
  width:min(100%, 680px);
  max-width:100%;
}
${panelSel} .${skinCls}-acctShell,
${panelSel} .${skinCls}-acctStack{
  display:grid;
  gap:12px;
  width:min(100%, 720px);
  max-width:100%;
}
${panelSel} .${skinCls}-acctSubtabs{
  display:flex;
  gap:8px;
  flex-wrap:wrap;
}
${panelSel} .${skinCls}-acctSubtab{
  min-height:32px;
  padding:0 12px;
  border-radius:999px;
  border:1px solid rgba(255,255,255,.14);
  background:rgba(255,255,255,.07);
  color:rgba(255,255,255,.76);
  font-size:12px;
  font-weight:650;
  cursor:pointer;
}
${panelSel} .${skinCls}-acctSubtab[aria-selected="true"]{
  border-color:rgba(245,156,26,.46);
  background:linear-gradient(135deg, rgba(255,245,192,.16), rgba(245,156,26,.12));
  color:#fff5cf;
}
${panelSel} .${skinCls}-acctSubtabBody{
  min-width:0;
}
${panelSel} .${skinCls}-acctSection{
  display:grid;
  gap:10px;
  padding:10px 12px;
  border-radius:12px;
  border:1px solid rgba(255,255,255,.10);
  background:linear-gradient(135deg, rgba(255,255,255,.055), rgba(255,255,255,.025));
}
${panelSel} .${skinCls}-acctSection h4{
  margin:0;
  font-size:12px;
  letter-spacing:.08em;
  text-transform:uppercase;
  color:rgba(255,255,255,.76);
}
${panelSel} .${skinCls}-acctField{
  display:grid;
  gap:5px;
  min-width:0;
}
${panelSel} .${skinCls}-acctField span{
  font-size:11px;
  color:rgba(255,255,255,.72);
}
${panelSel} .${skinCls}-acctField input{
  width:100%;
  min-width:0;
  box-sizing:border-box;
  border-radius:10px;
  border:1px solid rgba(255,255,255,.14);
  background:rgba(255,255,255,.06);
  color:#f4f6fb;
  padding:8px 10px;
  font-size:12px;
  outline:none;
}
${panelSel} .${skinCls}-acctField input:focus{
  border-color:rgba(120,210,255,.62);
  box-shadow:0 0 0 2px rgba(56,189,248,.12);
}
${panelSel} .${skinCls}-acctPasswordRow{
  display:grid;
  grid-template-columns:minmax(0, 1fr) auto;
  gap:8px;
  align-items:end;
}
${panelSel} .${skinCls}-acctTinyBtn{
  min-width:64px;
  height:34px;
  border-radius:10px;
  border:1px solid rgba(255,255,255,.14);
  background:rgba(255,255,255,.08);
  color:#f4f6fb;
  cursor:pointer;
}
${panelSel} .${skinCls}-acctActions{
  display:flex;
  align-items:center;
  gap:10px;
  flex-wrap:wrap;
}
${panelSel} .${skinCls}-acctStatus,
${panelSel} .${skinCls}-acctNote{
  font-size:11px;
  color:rgba(255,255,255,.72);
  line-height:1.45;
}
${panelSel} .${skinCls}-acctStatus[data-tone="success"]{
  color:rgba(134,239,172,.96);
}
${panelSel} .${skinCls}-acctStatus[data-tone="error"]{
  color:rgba(252,165,165,.96);
}
`;
  }

  function getControls() {
    return [
      {
        type: 'custom',
        key: 'accountSettings',
        label: 'Account Settings',
        group: 'Account',
        help: 'Identity and billing live side by side here, but their internals remain separate.',
        stackBelowLabel: true,
        render() { return renderAccountSettings(); },
      },
    ];
  }

  function bindIdentityInvalidation(api) {
    if (IDENTITY_UNSUB) return;
    const idApi = safeCall('identity.subscribe', () => W.H2O?.Identity);
    if (!idApi?.onChange) return;
    IDENTITY_UNSUB = safeCall('identity.onChange', () => idApi.onChange(() => invalidate(api))) || null;
  }

  function bindBillingInvalidation(api) {
    if (BILLING_UNSUB) return;
    const billApi = safeCall('billing.subscribe', () => W.H2O?.Billing);
    if (!billApi?.onChange) return;
    BILLING_UNSUB = safeCall('billing.onChange', () => billApi.onChange(() => invalidate(api))) || null;
  }

  function register() {
    const api = getApi();
    if (!api?.registerPlugin) return false;
    if (api === LAST_API) {
      bindIdentityInvalidation(api);
      bindBillingInvalidation(api);
      return true;
    }

    try {
      if (IDENTITY_UNSUB) {
        try { IDENTITY_UNSUB(); } catch {}
        IDENTITY_UNSUB = null;
      }
      if (BILLING_UNSUB) {
        try { BILLING_UNSUB(); } catch {}
        BILLING_UNSUB = null;
      }
      const skin = typeof api.getSkin === 'function' ? api.getSkin() : null;
      CLS = skin?.CLS || CLS;
      api.registerPlugin({
        key: 'account',
        title: 'Account',
        cssText: accountCssText,
        getControls,
      });
      LAST_API = api;
      bindIdentityInvalidation(api);
      bindBillingInvalidation(api);
      invalidate(api);
      return true;
    } catch (e) {
      try { console.warn('[H2O AccountTab] register failed', e); } catch {}
      return false;
    }
  }

  register();
  W.addEventListener(EV_CHUB_READY_V1, register, true);
  W.addEventListener('billing:ready', () => {
    bindBillingInvalidation(LAST_API);
    if (ACCOUNT_SUBTAB === 'billing') BILLING_REFRESH_REQUESTED = false;
    invalidate();
  }, true);
  W.addEventListener('billing:changed', () => invalidate(), true);
  W.addEventListener('billing:entitlement:refreshing', () => invalidate(), true);

  if (!LAST_API) {
    let tries = 0;
    const timer = W.setInterval(() => {
      tries += 1;
      if (register() || tries > 80) {
        try { W.clearInterval(timer); } catch {}
      }
    }, 250);
  }
})();
