(function bootH2OIdentitySurface(global, document) {
  'use strict';

  const $ = selector => document.querySelector(selector);

  const refs = {
    title: $('#h2oi-step-title'),
    badge: $('#h2oi-state-badge'),
    alert: $('#h2oi-alert'),
    authModes: $('#h2oi-auth-modes'),
    modeSignIn: $('#h2oi-auth-sign-in'),
    modeCreate: $('#h2oi-auth-create'),
    signInForm: $('#h2oi-signin-form'),
    signInEmail: $('#h2oi-signin-email'),
    signInPassword: $('#h2oi-signin-password'),
    signInPasswordToggle: $('#h2oi-signin-password-toggle'),
    googleSignIn: $('#h2oi-google-sign-in'),
    send: $('#h2oi-send'),
    passwordSignIn: $('#h2oi-password-sign-in'),
    recoverySend: $('#h2oi-recovery-send'),
    createForm: $('#h2oi-create-form'),
    createEmail: $('#h2oi-create-email'),
    createPassword: $('#h2oi-create-password'),
    createPasswordToggle: $('#h2oi-create-password-toggle'),
    createConfirm: $('#h2oi-create-confirm'),
    createConfirmToggle: $('#h2oi-create-confirm-toggle'),
    passwordStrength: $('#h2oi-password-strength'),
    googleCreate: $('#h2oi-google-create'),
    passwordSignUp: $('#h2oi-password-sign-up'),
    resetPanel: $('#h2oi-reset-panel'),
    resetEmail: $('#h2oi-reset-email'),
    resetTabLink: $('#h2oi-reset-tab-link'),
    passwordReset: $('#h2oi-password-reset'),
    confirmationPanel: $('#h2oi-confirmation-panel'),
    confirmationCode: $('#h2oi-confirmation-code'),
    confirmationVerify: $('#h2oi-confirmation-verify'),
    confirmationResend: $('#h2oi-confirmation-resend'),
    pendingPanel: $('#h2oi-pending-panel'),
    pendingTitle: $('#h2oi-pending-title'),
    pendingCopy: $('#h2oi-pending-copy'),
    pendingCodeLabel: $('#h2oi-pending-code-label'),
    verify: $('#h2oi-verify'),
    otpCode: $('#h2oi-otp-code'),
    resend: $('#h2oi-resend'),
    pendingBack: $('#h2oi-pending-back'),
    setPasswordForm: $('#h2oi-set-password-form'),
    setPassword: $('#h2oi-set-password'),
    setPasswordToggle: $('#h2oi-set-password-toggle'),
    setConfirm: $('#h2oi-set-confirm'),
    setConfirmToggle: $('#h2oi-set-confirm-toggle'),
    setPasswordStrength: $('#h2oi-set-password-strength'),
    setPasswordSubmit: $('#h2oi-set-password-submit'),
    setPasswordBack: $('#h2oi-set-password-back'),
    setPasswordStartOver: $('#h2oi-set-password-start-over'),
    profileForm: $('#h2oi-profile-form'),
    displayName: $('#h2oi-display-name'),
    avatarColor: $('#h2oi-avatar-color'),
    workspaceName: $('#h2oi-workspace-name'),
    complete: $('#h2oi-complete'),
    readyPanel: $('#h2oi-ready-panel'),
    readyCopy: $('#h2oi-ready-copy'),
    close: $('#h2oi-close'),
    reset: $('#h2oi-reset'),
    localMode: $('#h2oi-local-mode'),
    startOver: $('#h2oi-start-over'),
    diagToggle: $('#h2oi-diag-toggle'),
    diag: $('#h2oi-diag'),
    steps: Array.from(document.querySelectorAll('.h2oi-steps [data-step]'))
  };

  const ACTION_LABELS = Object.freeze({
    send: { idle: 'Send email code', busy: 'Sending…' },
    googleSignIn: { idle: 'Continue with Google', busy: 'Opening Google…' },
    googleCreate: { idle: 'Continue with Google', busy: 'Opening Google…' },
    recoverySend: { idle: 'Send sign-in code to recover access', busy: 'Sending…' },
    passwordSignIn: { idle: 'Sign in', busy: 'Signing in…' },
    passwordSignUp: { idle: 'Create account', busy: 'Creating…' },
    passwordReset: { idle: 'Send reset email', busy: 'Sending…' },
    confirmationVerify: { idle: 'Confirm email', busy: 'Confirming…' },
    confirmationResend: { idle: 'Resend code', busy: 'Resending…' },
    verify: { idle: 'Verify email', busy: 'Verifying…' },
    setPassword: { idle: 'Set new password', busy: 'Updating…' },
    resend: { idle: 'Reset pending email', busy: 'Resetting…' },
    complete: { idle: 'Create profile and workspace', busy: 'Creating…' },
    local: { idle: 'Create local-only profile instead', busy: 'Creating local profile…' },
    back: { idle: 'Back to sign in', busy: 'Resetting…' },
    startOver: { idle: 'Start over', busy: 'Resetting…' },
    reset: { idle: 'Sign out / reset identity', busy: 'Signing out…' }
  });

  const ERROR_MESSAGES = Object.freeze({
    'identity/provider-rate-limited': 'Too many email requests. Wait a bit before trying again.',
    'identity/password-invalid': 'Email or password did not match.',
    'identity/password-weak': 'Use a stronger password.',
    'identity/password-update-session-missing': 'Your recovery session is missing. Request a new code.',
    'identity/password-update-failed': 'Could not update password. Try again.',
    'identity/password-update-requires-recent-code': 'Request a new code, then set your password again.',
    'identity/password-update-marker-unavailable': 'Could not preserve recovery state. Request a new code.',
    'identity/credential-status-session-missing': 'Your sign-in session is missing. Start over and sign in again.',
    'identity/credential-status-provider-unavailable': 'Password setup status is unavailable. Try again.',
    'identity/credential-status-invalid-source': 'Password setup status could not be updated.',
    'identity/credential-status-response-malformed': 'Password setup status response was not usable.',
    'identity/credential-status-update-failed': 'Could not confirm password setup. Try again.',
    'identity/password-too-short': 'Use at least 12 characters.',
    'identity/password-too-common': 'Use a stronger password.',
    'identity/password-too-similar': 'Use a password that is different from your email.',
    'identity/password-mismatch': 'Passwords do not match.',
    'identity/email-not-confirmed': 'Confirm your email, then sign in.',
    'identity/account-not-found': 'No account found. Create an account first.',
    'identity/account-already-exists': 'Account already exists. Sign in instead.',
    'identity/invalid-otp-code': 'Enter the code from your email.',
    'identity/missing-code': 'Enter the code from your email.',
    'identity/otp-invalid': 'That code did not match. Try again.',
    'identity/otp-expired': 'That code expired. Request a new one.',
    'identity/permission-not-ready': 'Provider permission is not granted. Use the Dev Controls popup to grant it.',
    'identity/network-not-ready': 'Provider network is not ready. Check permission and config.',
    'identity/network-not-enabled': 'Provider network is not enabled for this build.',
    'identity/onboarding-invalid-input': 'Check display name, avatar color, and workspace name.',
    'identity/onboarding-session-missing': 'Your verified session is missing. Sign in again.',
    'identity/onboarding-password-update-required': 'Set a new password before continuing.',
    'identity/password-update-required': 'Set a new password before continuing.',
    'identity/onboarding-failed': 'Could not complete onboarding. Try again.',
    'identity/onboarding-network-failed': 'Provider network failed. Check your connection and try again.',
    'identity/onboarding-provider-unavailable': 'Provider onboarding is unavailable. Try again after refreshing.',
    'identity/provider-auth-unavailable': 'Provider authentication is unavailable. Try again after refreshing.',
    'identity/provider-request-failed': 'The provider request failed. Try again.',
    'identity/provider-network-failed': 'Provider network failed. Check your connection and try again.',
    'identity/provider-rejected': 'The provider rejected the request. Try again.',
    'identity/oauth-not-enabled': 'Google sign-in is not enabled for this build.',
    'identity/oauth-provider-unavailable': 'Google sign-in is unavailable.',
    'identity/oauth-permission-unavailable': 'Chrome identity permission is unavailable.',
    'identity/oauth-redirect-invalid': 'Google sign-in redirect is not configured.',
    'identity/oauth-cancelled': 'Google sign-in was cancelled.',
    'identity/oauth-callback-invalid': 'Google sign-in callback was not usable.',
    'identity/oauth-callback-missing-code': 'Google sign-in did not return a code.',
    'identity/oauth-response-malformed': 'Google sign-in response was not usable.',
    'identity/oauth-exchange-failed': 'Google sign-in could not complete.',
    'identity/oauth-failed': 'Google sign-in failed.',
    'identity/invalid-email': 'Enter a valid email address.'
  });

  let activeAction = null;
  let authMode = 'signIn';
  let resetExpanded = false;

  const identity = resolveIdentity();

  if (!identity) {
    showFatal('H2O.Identity is not available. Make sure 0D4a Identity Core is loaded before identity.js.');
    return;
  }

  wireEvents(identity);
  identity.onChange(() => render(identity));
  render(identity);

  function wireEvents(api) {
    refs.modeSignIn?.addEventListener('click', () => {
      authMode = 'signIn';
      resetExpanded = false;
      clearAlert();
      render(api);
    });

    refs.modeCreate?.addEventListener('click', () => {
      authMode = 'create';
      resetExpanded = false;
      clearAlert();
      render(api);
    });

    refs.signInPasswordToggle?.addEventListener('click', () => togglePasswordVisibility(refs.signInPassword, refs.signInPasswordToggle));
    refs.createPasswordToggle?.addEventListener('click', () => togglePasswordVisibility(refs.createPassword, refs.createPasswordToggle));
    refs.createConfirmToggle?.addEventListener('click', () => togglePasswordVisibility(refs.createConfirm, refs.createConfirmToggle));
    refs.setPasswordToggle?.addEventListener('click', () => togglePasswordVisibility(refs.setPassword, refs.setPasswordToggle));
    refs.setConfirmToggle?.addEventListener('click', () => togglePasswordVisibility(refs.setConfirm, refs.setConfirmToggle));
    refs.createPassword?.addEventListener('input', () => renderPasswordStrength());
    refs.createEmail?.addEventListener('input', () => renderPasswordStrength());
    refs.setPassword?.addEventListener('input', () => renderPasswordStrength());
    refs.signInEmail?.addEventListener('input', () => renderPasswordStrength());

    refs.signInForm?.addEventListener('submit', async event => {
      event.preventDefault();
      clearAlert();
      try {
        await run('passwordSignIn', () => api.signInWithPassword({
          email: refs.signInEmail.value,
          password: refs.signInPassword.value
        }));
      } finally {
        clearPasswordFields();
      }
    });

    refs.googleSignIn?.addEventListener('click', async () => {
      clearAlert();
      try {
        await run('googleSignIn', () => api.signInWithGoogle());
      } finally {
        clearPasswordFields();
      }
    });

    refs.send?.addEventListener('click', async () => {
      clearAlert();
      try {
        await run('send', () => {
          const method = typeof api.signInWithEmailCode === 'function' ? api.signInWithEmailCode : api.signInWithEmail;
          return method.call(api, refs.signInEmail.value, { source: 'identity-surface' });
        });
      } finally {
        clearPasswordFields();
      }
    });

    refs.resetTabLink?.addEventListener('click', () => {
      authMode = 'signIn';
      resetExpanded = !resetExpanded;
      clearAlert();
      const email = firstAuthEmail();
      if (email && refs.resetEmail && !refs.resetEmail.value) refs.resetEmail.value = email;
      render(api);
    });

    refs.recoverySend?.addEventListener('click', async () => {
      clearAlert();
      try {
        await run('recoverySend', () => api.requestPasswordRecoveryCode(refs.signInEmail.value || firstAuthEmail()));
      } finally {
        clearPasswordFields();
      }
    });

    refs.createForm?.addEventListener('submit', async event => {
      event.preventDefault();
      clearAlert();
      const strength = evaluatePasswordStrength(refs.createPassword?.value || '', refs.createEmail?.value || '');
      if (!strength.ok) {
        showAlert(ERROR_MESSAGES[strength.errorCode] || ERROR_MESSAGES['identity/password-weak']);
        renderPasswordStrength();
        clearPasswordFields();
        return;
      }
      if ((refs.createPassword?.value || '') !== (refs.createConfirm?.value || '')) {
        showAlert(ERROR_MESSAGES['identity/password-mismatch']);
        clearPasswordFields();
        return;
      }
      try {
        await run('passwordSignUp', () => api.signUpWithPassword({
          email: refs.createEmail.value,
          password: refs.createPassword.value
        }));
      } finally {
        clearPasswordFields();
      }
    });

    refs.googleCreate?.addEventListener('click', async () => {
      clearAlert();
      try {
        await run('googleCreate', () => api.signInWithGoogle());
      } finally {
        clearPasswordFields();
      }
    });

    refs.passwordReset?.addEventListener('click', async () => {
      clearAlert();
      try {
        await run('passwordReset', () => api.requestPasswordReset(refs.resetEmail.value || firstAuthEmail()));
      } finally {
        clearPasswordFields();
      }
    });

    refs.verify?.addEventListener('click', async () => {
      clearAlert();
      try {
        await run('verify', () => {
          const status = api.getSnapshot().status;
          if (status === 'recovery_code_pending' && typeof api.verifyPasswordRecoveryCode === 'function') {
            return api.verifyPasswordRecoveryCode({ code: refs.otpCode?.value || '' });
          }
          return api.verifyEmailCode({ code: refs.otpCode?.value || '' });
        });
      } finally {
        if (refs.otpCode) refs.otpCode.value = '';
      }
    });

    refs.resend?.addEventListener('click', async () => {
      clearAlert();
      const snapshot = api.getSnapshot();
      if (snapshot.status === 'recovery_code_pending' && typeof api.requestPasswordRecoveryCode === 'function') {
        await run('recoverySend', () => api.requestPasswordRecoveryCode(refs.signInEmail.value || firstAuthEmail()));
        return;
      }
      await run('resend', () => api.resendVerification(firstAuthEmail() || snapshot.pendingEmail));
    });

    refs.pendingBack?.addEventListener('click', async () => {
      await restartIdentityFlow(api, 'back');
    });

    refs.confirmationVerify?.addEventListener('click', async () => {
      clearAlert();
      try {
        await run('confirmationVerify', () => api.verifySignupEmailCode({ code: refs.confirmationCode?.value || '' }));
      } finally {
        if (refs.confirmationCode) refs.confirmationCode.value = '';
      }
    });

    refs.confirmationResend?.addEventListener('click', async () => {
      clearAlert();
      await run('confirmationResend', () => api.resendSignupConfirmation());
    });

    refs.setPasswordForm?.addEventListener('submit', async event => {
      event.preventDefault();
      clearAlert();
      const strength = evaluatePasswordStrength(refs.setPassword?.value || '', firstAuthEmail());
      if (!strength.ok) {
        showAlert(ERROR_MESSAGES[strength.errorCode] || ERROR_MESSAGES['identity/password-weak']);
        renderPasswordStrength();
        clearPasswordFields();
        return;
      }
      if ((refs.setPassword?.value || '') !== (refs.setConfirm?.value || '')) {
        showAlert(ERROR_MESSAGES['identity/password-mismatch']);
        clearPasswordFields();
        return;
      }
      try {
        await run('setPassword', () => api.updatePasswordAfterRecovery({ password: refs.setPassword.value }));
      } finally {
        clearPasswordFields();
      }
    });

    refs.setPasswordBack?.addEventListener('click', async () => {
      await restartIdentityFlow(api, 'back');
    });

    refs.setPasswordStartOver?.addEventListener('click', async () => {
      await restartIdentityFlow(api, 'startOver');
    });

    refs.profileForm?.addEventListener('submit', async event => {
      event.preventDefault();
      clearAlert();
      if (isProviderSyncReady(api.getSnapshot())) {
        render(api);
        return;
      }
      await run('complete', () => {
        const snapshot = api.getSnapshot();
        return api.createInitialWorkspace({
          email: snapshot.pendingEmail || firstAuthEmail(),
          displayName: refs.displayName.value,
          avatarColor: refs.avatarColor?.value || 'violet',
          workspaceName: refs.workspaceName.value
        });
      });
    });

    refs.localMode?.addEventListener('click', async () => {
      clearAlert();
      await run('local', () => api.enterLocalMode({
        displayName: refs.displayName.value || 'Local H2O User',
        workspaceName: refs.workspaceName.value || 'Local H2O Workspace'
      }));
    });

    refs.close?.addEventListener('click', () => {
      try {
        global.close();
      } catch (_) {
        // ignored
      }
    });

    refs.reset?.addEventListener('click', async () => {
      clearAlert();
      await run('reset', () => api.signOut());
    });

    refs.startOver?.addEventListener('click', async () => {
      await restartIdentityFlow(api, 'startOver');
    });

    refs.diagToggle?.addEventListener('click', () => {
      const expanded = refs.diagToggle.getAttribute('aria-expanded') === 'true';
      refs.diagToggle.setAttribute('aria-expanded', String(!expanded));
      refs.diag.hidden = expanded;
      renderDiag(api);
    });
  }

  function firstAuthEmail() {
    return refs.signInEmail?.value
      || refs.createEmail?.value
      || refs.resetEmail?.value
      || '';
  }

  function clearPasswordFields() {
    for (const input of [refs.signInPassword, refs.createPassword, refs.createConfirm, refs.setPassword, refs.setConfirm]) {
      if (input) input.value = '';
    }
    resetPasswordVisibility();
    renderPasswordStrength();
  }

  function clearTransientFields() {
    clearPasswordFields();
    if (refs.otpCode) refs.otpCode.value = '';
    if (refs.confirmationCode) refs.confirmationCode.value = '';
  }

  async function restartIdentityFlow(api, action) {
    clearAlert();
    authMode = 'signIn';
    resetExpanded = false;
    clearTransientFields();
    await run(action || 'startOver', () => api.signOut());
    render(api);
    try { refs.signInEmail?.focus(); } catch (_) {}
  }

  function togglePasswordVisibility(input, button) {
    if (!input || !button) return;
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    button.textContent = show ? 'Hide' : 'Show';
    button.setAttribute('aria-pressed', String(show));
  }

  function resetPasswordVisibility() {
    for (const [input, button] of [
      [refs.signInPassword, refs.signInPasswordToggle],
      [refs.createPassword, refs.createPasswordToggle],
      [refs.createConfirm, refs.createConfirmToggle],
      [refs.setPassword, refs.setPasswordToggle],
      [refs.setConfirm, refs.setConfirmToggle]
    ]) {
      if (input) input.type = 'password';
      if (button) {
        button.textContent = 'Show';
        button.setAttribute('aria-pressed', 'false');
      }
    }
  }

  function evaluatePasswordStrength(password, email) {
    const value = String(password || '');
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const lower = value.toLowerCase();
    const emailLocal = normalizedEmail.split('@')[0] || '';
    const common = new Set([
      'passwordpassword',
      'password1234',
      'password12345',
      'qwertyqwerty',
      'qwerty123456',
      'letmeinletmein',
      'welcome12345',
      'adminadmin123',
      'h2oh2oh2oh2o'
    ]);
    const hasLower = /[a-z]/.test(value);
    const hasUpper = /[A-Z]/.test(value);
    const hasNumber = /[0-9]/.test(value);
    const hasOther = /[^A-Za-z0-9]/.test(value);
    const varietyCount = [hasLower, hasUpper, hasNumber, hasOther].filter(Boolean).length;
    const rules = {
      length: value.length >= 12,
      email: Boolean(value.trim()) && lower !== normalizedEmail && (!emailLocal || lower !== emailLocal),
      common: Boolean(value.trim()) && !common.has(lower) && !/^(.)(\1){11,}$/.test(value),
      variety: varietyCount >= 2
    };
    if (!rules.length) return { ok: false, errorCode: 'identity/password-too-short', rules, score: scorePasswordRules(rules) };
    if (!rules.email) return { ok: false, errorCode: 'identity/password-too-similar', rules, score: scorePasswordRules(rules) };
    if (!rules.common || !rules.variety) return { ok: false, errorCode: 'identity/password-too-common', rules, score: scorePasswordRules(rules) };
    return { ok: true, rules, score: scorePasswordRules(rules) };
  }

  function scorePasswordRules(rules) {
    return Object.values(rules || {}).filter(Boolean).length;
  }

  function renderPasswordStrength() {
    const groups = [
      [refs.passwordStrength, refs.createPassword?.value || '', refs.createEmail?.value || ''],
      [refs.setPasswordStrength, refs.setPassword?.value || '', firstAuthEmail()]
    ];
    for (const [container, password, email] of groups) {
      if (!container) continue;
      const strength = evaluatePasswordStrength(password, email);
      container.dataset.score = String(strength.score || 0);
      for (const item of Array.from(container.querySelectorAll('[data-rule]'))) {
        const rule = item.dataset.rule;
        item.classList.toggle('is-ok', Boolean(strength.rules?.[rule]));
      }
    }
  }

  async function run(action, task) {
    if (activeAction) return;
    activeAction = action || 'action';
    updateControls(identity.getSnapshot());
    try {
      const snapshot = await task();
      if (snapshot?.lastError) showAlert(formatIdentityError(snapshot.lastError));
    } catch (error) {
      showAlert(formatIdentityError(error));
    } finally {
      activeAction = null;
      updateControls(identity.getSnapshot());
    }
  }

  function render(api) {
    const snapshot = api.getSnapshot();
    const status = snapshot.status;

    refs.badge.textContent = statusLabel(status);
    refs.confirmationPanel.hidden = status !== 'email_confirmation_pending';
    refs.pendingPanel.hidden = status !== 'email_pending' && status !== 'recovery_code_pending';
    refs.setPasswordForm.hidden = status !== 'password_update_required';
    refs.profileForm.hidden = status !== 'verified_no_profile';
    refs.readyPanel.hidden = status !== 'profile_ready' && status !== 'sync_ready';

    if (snapshot.pendingEmail) {
      if (refs.signInEmail && !refs.signInEmail.value) refs.signInEmail.value = snapshot.pendingEmail;
      if (refs.createEmail && !refs.createEmail.value) refs.createEmail.value = snapshot.pendingEmail;
      if (refs.resetEmail && !refs.resetEmail.value) refs.resetEmail.value = snapshot.pendingEmail;
    }
    if (snapshot.profile && refs.displayName && !refs.displayName.value) refs.displayName.value = snapshot.profile.displayName || '';
    if (snapshot.profile && refs.avatarColor && !refs.avatarColor.value) refs.avatarColor.value = snapshot.profile.avatarColor || 'violet';
    if (snapshot.workspace && refs.workspaceName && !refs.workspaceName.value) refs.workspaceName.value = snapshot.workspace.name || '';
    renderPendingPanel(status);

    const copy = makeTitle(snapshot);
    refs.title.textContent = copy.title;
    if (refs.readyCopy) refs.readyCopy.textContent = copy.body || '';

    if (snapshot.lastError) showAlert(formatIdentityError(snapshot.lastError));
    else clearAlert();

    if (snapshot.profile && snapshot.workspace) {
      const summary = `${snapshot.profile.displayName} · ${snapshot.workspace.name}`;
      refs.readyCopy.textContent = isProviderBacked(snapshot)
        ? `${summary}. You stay signed in on this browser until you sign out or your session is revoked.`
        : summary;
    }

    renderSteps(status);
    renderAuthMode(status);
    renderPasswordStrength();
    updateControls(snapshot);
    renderDiag(api);
  }

  function renderSteps(status) {
    const order = ['anonymous_local', 'email_pending', 'verified_no_profile', 'profile_ready'];
    const statusForStep = status === 'sync_ready'
      ? 'profile_ready'
      : (status === 'recovery_code_pending' ? 'email_pending' : (status === 'password_update_required' ? 'verified_no_profile' : status));
    const activeIndex = Math.max(0, order.indexOf(statusForStep));

    for (const step of refs.steps) {
      const stepIndex = order.indexOf(step.dataset.step);
      step.classList.toggle('is-active', stepIndex === activeIndex);
      step.classList.toggle('is-done', stepIndex >= 0 && stepIndex < activeIndex);
    }
  }

  function renderDiag(api) {
    if (!refs.diag || refs.diag.hidden) return;
    refs.diag.textContent = JSON.stringify(api.diag(), null, 2);
  }

  function makeTitle(snapshot) {
    const status = snapshot?.status || 'anonymous_local';
    const providerBacked = isProviderBacked(snapshot);
    switch (status) {
      case 'email_pending':
        return { title: 'Enter your email code.', body: providerBacked ? 'Email code sent. Waiting for verification.' : 'Waiting for local email verification.' };
      case 'recovery_code_pending':
        return { title: 'Recover access with an email code.', body: 'Enter the sign-in code from your email, then set a new password.' };
      case 'email_confirmation_pending':
        return { title: 'Confirm your email.', body: 'Check your email and enter the confirmation code. If your email uses a confirmation link, confirm it and then sign in.' };
      case 'password_reset_email_sent':
        return { title: 'Check your email.', body: 'If an account exists for that address, a password reset email has been sent.' };
      case 'password_update_required':
        return { title: 'Set a new password.', body: 'Set a new password before continuing to your synced account.' };
      case 'verified_no_profile':
        return { title: 'Create your H2O profile.', body: 'Email verified. Profile and workspace setup is not completed.' };
      case 'sync_ready':
        return { title: 'Your account is ready.', body: 'Account profile and workspace are synced. You stay signed in on this browser until you sign out or your session is revoked.' };
      case 'profile_ready':
        return { title: 'Your local profile is ready.', body: 'Local profile and workspace are ready.' };
      case 'auth_error':
        return { title: 'Something needs attention.', body: 'The last identity action returned a safe error.' };
      case 'anonymous_local':
      default:
        return { title: 'Start with your email.', body: 'Signed out or using anonymous local state.' };
    }
  }

  function updateControls(snapshot) {
    const busy = Boolean(activeAction);
    const status = snapshot?.status || 'anonymous_local';
    const providerBacked = isProviderBacked(snapshot);
    const authAvailable = status === 'anonymous_local' || status === 'auth_error' || status === 'password_reset_email_sent';
    setBusy(refs.signInForm, activeAction === 'send' || activeAction === 'passwordSignIn' || activeAction === 'googleSignIn');
    setBusy(refs.createForm, activeAction === 'passwordSignUp' || activeAction === 'googleCreate');
    setBusy(refs.resetPanel, activeAction === 'passwordReset');
    setBusy(refs.pendingPanel, activeAction === 'verify' || activeAction === 'resend' || activeAction === 'recoverySend');
    setBusy(refs.confirmationPanel, activeAction === 'confirmationVerify' || activeAction === 'confirmationResend');
    setBusy(refs.setPasswordForm, activeAction === 'setPassword');
    setBusy(refs.profileForm, activeAction === 'complete');
    setButtonState(refs.send, 'send', busy, !authAvailable);
    setButtonState(refs.googleSignIn, 'googleSignIn', busy, !authAvailable || typeof identity.signInWithGoogle !== 'function');
    setButtonState(refs.recoverySend, 'recoverySend', busy, !canShowRecoveryAction(snapshot));
    setButtonState(refs.passwordSignIn, 'passwordSignIn', busy, !authAvailable);
    setButtonState(refs.googleCreate, 'googleCreate', busy, !authAvailable || typeof identity.signInWithGoogle !== 'function');
    setButtonState(refs.passwordSignUp, 'passwordSignUp', busy, !authAvailable);
    setButtonState(refs.passwordReset, 'passwordReset', busy, !authAvailable);
    setButtonState(refs.verify, 'verify', busy, status !== 'email_pending' && status !== 'recovery_code_pending');
    setButtonState(refs.resend, 'resend', busy, status !== 'email_pending' && status !== 'recovery_code_pending');
    setButtonState(refs.pendingBack, 'back', busy, status !== 'email_pending' && status !== 'recovery_code_pending');
    setButtonState(refs.confirmationVerify, 'confirmationVerify', busy, status !== 'email_confirmation_pending');
    setButtonState(refs.confirmationResend, 'confirmationResend', busy, status !== 'email_confirmation_pending');
    setButtonState(refs.setPasswordSubmit, 'setPassword', busy, status !== 'password_update_required');
    setButtonState(refs.setPasswordBack, 'back', busy, status !== 'password_update_required');
    setButtonState(refs.setPasswordStartOver, 'startOver', busy, status !== 'password_update_required');
    setButtonState(refs.complete, 'complete', busy, status !== 'verified_no_profile');
    setButtonState(refs.reset, 'reset', busy, status !== 'profile_ready' && status !== 'sync_ready');
    setButtonState(refs.localMode, 'local', busy, providerBacked || (status !== 'anonymous_local' && status !== 'auth_error'));
    setButtonState(refs.startOver, 'startOver', busy, !canStartOver(status));
    if (refs.localMode) refs.localMode.hidden = providerBacked || (status !== 'anonymous_local' && status !== 'auth_error');
    if (refs.startOver) refs.startOver.hidden = !canStartOver(status);
    if (!busy && refs.verify) refs.verify.textContent = status === 'recovery_code_pending' ? 'Verify recovery code' : 'Verify email';
    if (!busy && refs.resend) refs.resend.textContent = status === 'recovery_code_pending' ? 'Send new recovery code' : 'Reset pending email';
    const disableFields = busy;
    for (const input of [
      refs.signInEmail,
      refs.signInPassword,
      refs.createEmail,
      refs.createPassword,
      refs.createConfirm,
      refs.resetEmail,
      refs.otpCode,
      refs.confirmationCode,
      refs.setPassword,
      refs.setConfirm,
      refs.displayName,
      refs.avatarColor,
      refs.workspaceName
    ]) {
      if (input) input.disabled = disableFields;
    }
    for (const button of [refs.signInPasswordToggle, refs.createPasswordToggle, refs.createConfirmToggle, refs.setPasswordToggle, refs.setConfirmToggle]) {
      if (button) button.disabled = disableFields;
    }
    if (refs.recoverySend) refs.recoverySend.hidden = !canShowRecoveryAction(snapshot);
  }

  function renderAuthMode(status) {
    const authAvailable = status === 'anonymous_local' || status === 'auth_error' || status === 'password_reset_email_sent';
    const codePending = status === 'email_pending' || status === 'recovery_code_pending';
    if (codePending) authMode = 'signIn';
    if (refs.authModes) refs.authModes.hidden = !(authAvailable || codePending);
    if (refs.signInForm) refs.signInForm.hidden = !(authAvailable && authMode === 'signIn');
    if (refs.createForm) refs.createForm.hidden = !(authAvailable && authMode === 'create');
    if (refs.resetPanel) refs.resetPanel.hidden = !(authAvailable && authMode === 'signIn' && resetExpanded);
    refs.modeSignIn?.classList.toggle('is-active', authMode === 'signIn');
    refs.modeCreate?.classList.toggle('is-active', authMode === 'create');
    if (refs.modeSignIn) refs.modeSignIn.disabled = codePending;
    if (refs.modeCreate) refs.modeCreate.disabled = codePending;
    if (refs.resetTabLink) refs.resetTabLink.textContent = resetExpanded ? 'Hide reset' : 'Reset password';
  }

  function renderPendingPanel(status) {
    const recoveryPending = status === 'recovery_code_pending';
    if (refs.pendingTitle) {
      refs.pendingTitle.textContent = recoveryPending
        ? 'Enter the recovery code sent to your email.'
        : 'Enter your email code.';
    }
    if (refs.pendingCopy) {
      refs.pendingCopy.textContent = recoveryPending
        ? 'Enter the code sent to your email. After verification you will set a new password before continuing.'
        : 'Enter the verification code from your email. Local-only setup accepts a non-empty code when provider mode is not active.';
    }
    if (refs.pendingCodeLabel) {
      refs.pendingCodeLabel.textContent = recoveryPending ? 'Recovery code' : 'Verification code';
    }
  }

  function canShowRecoveryAction(snapshot) {
    return Boolean(
      snapshot &&
      (snapshot.status === 'auth_error' || snapshot.status === 'anonymous_local') &&
      snapshot.lastError &&
      snapshot.lastError.code === 'identity/password-invalid'
    );
  }

  function canStartOver(status) {
    return !['anonymous_local', 'profile_ready', 'sync_ready'].includes(status);
  }

  function setBusy(element, on) {
    if (!element) return;
    element.setAttribute('aria-busy', on ? 'true' : 'false');
  }

  function setButtonState(button, action, busy, unavailable) {
    if (!button) return;
    const labels = ACTION_LABELS[action] || {};
    const isThisAction = activeAction === action;
    button.textContent = isThisAction ? (labels.busy || 'Working…') : (labels.idle || button.textContent);
    button.disabled = Boolean(busy || unavailable);
    button.classList.toggle('is-busy', isThisAction);
  }

  function statusLabel(status) {
    switch (status) {
      case 'email_pending':
        return 'email pending';
      case 'recovery_code_pending':
        return 'recovery code pending';
      case 'email_confirmation_pending':
        return 'confirm email';
      case 'password_reset_email_sent':
        return 'reset email sent';
      case 'password_update_required':
        return 'set password';
      case 'verified_no_profile':
        return 'email verified';
      case 'profile_ready':
        return 'local profile ready';
      case 'sync_ready':
        return 'account ready';
      case 'auth_error':
        return 'needs attention';
      case 'anonymous_local':
      default:
        return 'signed out';
    }
  }

  function isProviderBacked(snapshot) {
    return snapshot?.mode === 'provider_backed';
  }

  function isProviderSyncReady(snapshot) {
    return Boolean(
      isProviderBacked(snapshot) &&
      snapshot.status === 'sync_ready' &&
      snapshot.profile && typeof snapshot.profile === 'object' &&
      snapshot.workspace && typeof snapshot.workspace === 'object'
    );
  }

  function formatIdentityError(error) {
    const code = String(error?.code || error?.errorCode || '').trim();
    if (code && ERROR_MESSAGES[code]) return ERROR_MESSAGES[code];
    if (code && code.startsWith('identity/')) return 'Identity operation failed. Try again.';
    return 'Identity operation failed. Try again.';
  }

  function showAlert(message) {
    if (!refs.alert) return;
    refs.alert.textContent = message;
    refs.alert.hidden = false;
  }

  function clearAlert() {
    if (!refs.alert) return;
    refs.alert.hidden = true;
    refs.alert.textContent = '';
  }

  function showFatal(message) {
    document.body.innerHTML = `<main class="h2oi-shell"><section class="h2oi-card"><h1>Identity surface could not start</h1><p class="h2oi-copy"></p></section></main>`;
    document.querySelector('.h2oi-copy').textContent = message;
  }

  function resolveIdentity() {
    if (global.H2O?.Identity) return global.H2O.Identity;

    try {
      if (global.opener?.H2O?.Identity) return global.opener.H2O.Identity;
    } catch (_) {
      // Cross-origin opener access can fail; local packaged surface should load its own core script.
    }

    return null;
  }
})(window, document);
