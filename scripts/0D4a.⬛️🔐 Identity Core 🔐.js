// ==UserScript==
// @name         H2O Identity Core
// @namespace    h2o.identity
// @version      1.1.1
// @description  Phase 1/2 identity facade, local/mock onboarding state, and safe diagnostics for H2O.
// @match        https://chatgpt.com/*
// @grant        none
// ==/UserScript==

(function bootH2OIdentityCore(global) {
  'use strict';

  const VERSION = '0.1.0';
  const OWNER = 'identity-core';
  const EVENT_CHANGE = 'h2o:identity:changed';
  const EVENT_READY = 'h2o:identity:ready';
  const STORAGE_PREFIX = 'h2o:prm:cgx:identity:v1';
  const STORAGE_KEYS = Object.freeze({
    SNAPSHOT: `${STORAGE_PREFIX}:snapshot`,
    AUDIT: `${STORAGE_PREFIX}:audit`
  });

  const STATES = Object.freeze({
    ANONYMOUS_LOCAL: 'anonymous_local',
    EMAIL_PENDING: 'email_pending',
    RECOVERY_CODE_PENDING: 'recovery_code_pending',
    EMAIL_CONFIRMATION_PENDING: 'email_confirmation_pending',
    PASSWORD_RESET_EMAIL_SENT: 'password_reset_email_sent',
    PASSWORD_UPDATE_REQUIRED: 'password_update_required',
    VERIFIED_NO_PROFILE: 'verified_no_profile',
    PROFILE_READY: 'profile_ready',
    SYNC_READY: 'sync_ready',
    AUTH_ERROR: 'auth_error'
  });

  const PROFILE_AVATAR_PALETTE = Object.freeze(['violet', 'blue', 'cyan', 'green', 'amber', 'pink']);
  const PROFILE_AVATAR_HEX_TO_SLUG = Object.freeze({
    '#7c3aed': 'violet',
    '#2563eb': 'blue',
    '#0891b2': 'cyan',
    '#059669': 'green',
    '#d97706': 'amber',
    '#db2777': 'pink',
  });

  const BRIDGE_MSG_SW = 'h2o-ext-identity:v1';
  const BRIDGE_MSG_REQ = 'h2o-ext-identity:v1:req';
  const BRIDGE_MSG_RES = 'h2o-ext-identity:v1:res';
  const BRIDGE_MSG_PUSH = 'h2o-ext-identity:v1:push';
  const BRIDGE_STORAGE_SNAPSHOT_KEY = 'h2oIdentityMockSnapshotV1';
  const BRIDGE_TIMEOUT_MS = 1800;
  const SAFE_BRIDGE_ERROR_MESSAGES = Object.freeze({
    'identity/provider-rate-limited': 'Too many email requests. Wait a bit before trying again.',
    'identity/password-invalid': 'Email or password did not match.',
    'identity/password-weak': 'Use a stronger password.',
    'identity/password-current-invalid': 'Current password or new password was not accepted.',
    'identity/password-update-session-missing': 'Your recovery session is missing. Request a new code.',
    'identity/password-update-failed': 'Could not update password. Try again.',
    'identity/password-update-requires-recent-code': 'Request a new code, then set your password again.',
    'identity/password-update-marker-unavailable': 'Could not preserve recovery state. Request a new code.',
    'identity/credential-status-session-missing': 'Your verified session is missing. Sign in again.',
    'identity/credential-status-provider-unavailable': 'Password setup status is unavailable. Try again.',
    'identity/credential-status-invalid-source': 'Password setup status could not be updated.',
    'identity/credential-status-response-malformed': 'Password setup status response was not usable.',
    'identity/credential-status-update-failed': 'Could not confirm password setup. Try again.',
    'identity/password-mismatch': 'Passwords do not match.',
    'identity/email-not-confirmed': 'Confirm your email, then sign in.',
    'identity/account-not-found': 'No account found. Create an account first.',
    'identity/account-already-exists': 'Account already exists. Sign in instead.',
    'identity/password-auth-extension-page-required': 'Open the H2O Identity window to use password sign-in.',
    'identity/provider-auth-unavailable': 'Provider authentication is unavailable. Try again after refreshing.',
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
    'identity/onboarding-response-malformed': 'Provider onboarding returned an unexpected safe response. Try again.',
    'identity/provider-request-failed': 'The provider request failed. Try again.',
    'identity/provider-network-failed': 'Provider network failed. Check your connection and try again.',
    'identity/provider-rejected': 'The provider rejected the request. Try again.',
    'identity/provider-response-malformed': 'The provider response was incomplete. Try again.',
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
    'identity/account-update-invalid-input': 'Check the account details and try again.',
    'identity/account-update-session-missing': 'Your verified session is missing. Sign in again.',
    'identity/account-update-provider-unavailable': 'Account update is unavailable.',
    'identity/account-update-response-malformed': 'Account update response was not usable.',
    'identity/account-update-network-failed': 'Provider network failed. Check your connection and try again.',
    'identity/account-update-rejected': 'Account update was rejected.',
    'identity/account-update-not-found': 'Account profile or workspace was not found.',
    'identity/account-update-failed': 'Account update failed. Try again.',
    'identity/invalid-email': 'Enter a valid email address.'
  });
  let bridgeWriteTimer = 0;

  const ALLOWED_TRANSITIONS = Object.freeze({
    anonymous_local: ['anonymous_local', 'email_pending', 'recovery_code_pending', 'email_confirmation_pending', 'password_reset_email_sent', 'password_update_required', 'verified_no_profile', 'sync_ready', 'profile_ready', 'auth_error'],
    email_pending: ['email_pending', 'verified_no_profile', 'anonymous_local', 'auth_error'],
    recovery_code_pending: ['recovery_code_pending', 'password_update_required', 'anonymous_local', 'auth_error'],
    email_confirmation_pending: ['email_confirmation_pending', 'anonymous_local', 'email_pending', 'verified_no_profile', 'sync_ready', 'auth_error'],
    password_reset_email_sent: ['password_reset_email_sent', 'anonymous_local', 'email_pending', 'recovery_code_pending', 'verified_no_profile', 'sync_ready', 'auth_error'],
    password_update_required: ['password_update_required', 'verified_no_profile', 'sync_ready', 'anonymous_local', 'auth_error'],
    verified_no_profile: ['verified_no_profile', 'profile_ready', 'anonymous_local', 'auth_error'],
    profile_ready: ['profile_ready', 'sync_ready', 'anonymous_local', 'auth_error'],
    sync_ready: ['sync_ready', 'profile_ready', 'anonymous_local', 'auth_error'],
    auth_error: ['anonymous_local', 'email_pending', 'verified_no_profile', 'profile_ready', 'sync_ready', 'password_update_required', 'auth_error']
  });

  const H2O = (global.H2O = global.H2O || {});
  const existing = H2O.Identity;

  if (existing && existing.__owner === OWNER && semverGte(existing.version, VERSION)) {
    dispatchReady(existing);
    return;
  }

  const listeners = new Set();
  const audit = loadAudit();
  let snapshot = normalizeSnapshot(readJson(STORAGE_KEYS.SNAPSHOT));

  const api = Object.freeze({
    __owner: OWNER,
    version: VERSION,
    STATES,
    STORAGE_KEYS,

    getState,
    getSnapshot,
    onChange,
    signInWithEmailCode,
    signInWithEmail,
    signUpWithPassword,
    verifySignupEmailCode,
    resendSignupConfirmation,
    signInWithPassword,
    signInWithGoogle,
    requestPasswordReset,
    requestPasswordRecoveryCode,
    verifyPasswordRecoveryCode,
    updatePasswordAfterRecovery,
    resendVerification,
    verifyEmailCode,
    handleVerificationCallback,
    createInitialWorkspace,
    enterLocalMode,
    refreshSession,
    signOut,
    getProfile,
    updateProfile,
    getWorkspace,
    renameWorkspace,
    changePassword,
    openOnboarding,
    diag,
    selfCheck
  });

  H2O.Identity = api;
  persistAndNotify('boot', snapshot, snapshot, { silentSameRef: true });
  dispatchReady(api);
  tryHydrateFromBridge();
  listenForBridgePush();

  function getState() {
    return snapshot.status;
  }

  function getSnapshot() {
    return clone(snapshot);
  }

  function getProfile() {
    return clone(snapshot.profile || null);
  }

  function getWorkspace() {
    return clone(snapshot.workspace || null);
  }

  function onChange(callback) {
    if (typeof callback !== 'function') return noop;
    listeners.add(callback);

    try {
      callback({ source: 'boot', previous: getSnapshot(), current: getSnapshot() });
    } catch (error) {
      safeWarn('Identity onChange listener failed during immediate emit.', error);
    }

    return function unsubscribe() {
      listeners.delete(callback);
    };
  }

  async function signInWithEmailCode(email, opts = {}) {
    try {
      const normalizedEmail = assertValidEmail(email);
      const providerBridge = await getBridgeProviderStatus();
      if (providerBridge.providerBacked) {
        const response = await sendBridgeRaw('identity:request-email-otp', { email: normalizedEmail });
        if (!response || response.ok !== true) {
          return failFromBridge('signInWithEmailCode', response, 'identity/request-email-otp-failed');
        }
        applyProviderBridgeFallbackState('signInWithEmailCode', {
          status: STATES.EMAIL_PENDING,
          mode: 'provider_backed',
          provider: 'supabase',
          pendingEmail: null,
          credentialState: 'unknown',
          credentialProvider: 'unknown',
          emailVerified: false,
          emailMasked: response.emailMasked || null,
          pendingEmailMasked: response.pendingEmailMasked || response.emailMasked || null,
          profile: null,
          workspace: null,
          onboardingCompleted: false,
          syncReady: false
        });
        return getSnapshot();
      }

      // Notify background adapter (Phase 2.9+). Fire-and-forget; local transition
      // remains the authority when provider-backed mode is inactive/unavailable.
      sendBridge('identity:request-email-otp', { email: normalizedEmail });
      const previous = snapshot;
      const next = transition(previous, STATES.EMAIL_PENDING, {
        pendingEmail: normalizedEmail,
        emailVerified: false,
        mode: 'local_dev',
        provider: 'mock_local',
        profile: null,
        workspace: null,
        onboardingCompleted: false
      });

      persistAndNotify('signInWithEmailCode', previous, next, {
        note: `Mock OTP requested for ${maskEmail(normalizedEmail)}.`,
        source: opts.source || null
      });
      return getSnapshot();
    } catch (error) {
      return fail('signInWithEmailCode', error, 'identity/sign-in-failed');
    }
  }

  async function signInWithEmail(email, opts = {}) {
    return signInWithEmailCode(email, opts);
  }

  async function signUpWithPassword(input = {}) {
    try {
      const normalizedEmail = assertValidEmail(input.email);
      const password = normalizePasswordInput(input.password);
      requireExtensionPageForPasswordAuth();
      const providerBridge = await getBridgeProviderStatus();
      if (!providerBridge.providerBacked) {
        throw createError('identity/operation-not-permitted-in-phase', 'Password sign-up requires provider-backed identity.');
      }
      const response = await sendBridgeRaw('identity:sign-up-with-password', { email: normalizedEmail, password });
      if (!response || response.ok !== true) {
        return failFromBridge('signUpWithPassword', response, 'identity/provider-rejected');
      }
      await applyPasswordAuthBridgeState('signUpWithPassword', response);
      return getSnapshot();
    } catch (error) {
      return fail('signUpWithPassword', error, 'identity/provider-rejected');
    }
  }

  async function verifySignupEmailCode(input = {}) {
    try {
      const code = String(input.code || '').trim();
      if (!code) throw createError('identity/missing-code', 'Enter a verification code.');
      requireExtensionPageForPasswordAuth();
      const providerBridge = await getBridgeProviderStatus();
      if (!providerBridge.providerBacked) {
        throw createError('identity/operation-not-permitted-in-phase', 'Signup confirmation requires provider-backed identity.');
      }
      const response = await sendBridgeRaw('identity:verify-signup-email-code', { code });
      if (!response || response.ok !== true) {
        return failSignupConfirmationFromBridge('verifySignupEmailCode', response, 'identity/verify-code-failed');
      }
      await applyPasswordAuthBridgeState('verifySignupEmailCode', response);
      return getSnapshot();
    } catch (error) {
      return failSignupConfirmation('verifySignupEmailCode', error, 'identity/verify-code-failed');
    }
  }

  async function resendSignupConfirmation() {
    try {
      requireExtensionPageForPasswordAuth();
      const providerBridge = await getBridgeProviderStatus();
      if (!providerBridge.providerBacked) {
        throw createError('identity/operation-not-permitted-in-phase', 'Signup confirmation requires provider-backed identity.');
      }
      const response = await sendBridgeRaw('identity:resend-signup-confirmation');
      if (!response || response.ok !== true) {
        return failSignupConfirmationFromBridge('resendSignupConfirmation', response, 'identity/provider-request-failed');
      }
      await applyPasswordAuthBridgeState('resendSignupConfirmation', response);
      return getSnapshot();
    } catch (error) {
      return failSignupConfirmation('resendSignupConfirmation', error, 'identity/provider-request-failed');
    }
  }

  async function signInWithPassword(input = {}) {
    try {
      const normalizedEmail = assertValidEmail(input.email);
      const password = normalizePasswordInput(input.password);
      requireExtensionPageForPasswordAuth();
      const providerBridge = await getBridgeProviderStatus();
      if (!providerBridge.providerBacked) {
        throw createError('identity/operation-not-permitted-in-phase', 'Password sign-in requires provider-backed identity.');
      }
      const response = await sendBridgeRaw('identity:sign-in-with-password', { email: normalizedEmail, password });
      if (!response || response.ok !== true) {
        return failFromBridge('signInWithPassword', response, 'identity/provider-rejected');
      }
      await applyPasswordAuthBridgeState('signInWithPassword', response);
      return getSnapshot();
    } catch (error) {
      return fail('signInWithPassword', error, 'identity/provider-rejected');
    }
  }

  async function signInWithGoogle() {
    try {
      requireExtensionPageForPasswordAuth();
      const providerBridge = await getBridgeProviderStatus();
      if (!providerBridge.providerBacked) {
        throw createError('identity/operation-not-permitted-in-phase', 'Google sign-in requires provider-backed identity.');
      }
      if (providerBridge.providerConfigStatus?.capabilities?.oauth !== true) {
        throw createError('identity/oauth-not-enabled', 'Google sign-in is not enabled for this build.');
      }
      const response = await sendBridgeRaw('identity:sign-in-with-google', {});
      if (!response || response.ok !== true) {
        return failFromBridge('signInWithGoogle', response, 'identity/oauth-failed');
      }
      await applyPasswordAuthBridgeState('signInWithGoogle', response);
      return getSnapshot();
    } catch (error) {
      return fail('signInWithGoogle', error, 'identity/oauth-failed');
    }
  }

  async function requestPasswordReset(email) {
    try {
      const normalizedEmail = assertValidEmail(email);
      requireExtensionPageForPasswordAuth();
      const providerBridge = await getBridgeProviderStatus();
      if (!providerBridge.providerBacked) {
        throw createError('identity/operation-not-permitted-in-phase', 'Password reset requires provider-backed identity.');
      }
      const response = await sendBridgeRaw('identity:request-password-reset', { email: normalizedEmail });
      if (!response || response.ok !== true) {
        return failFromBridge('requestPasswordReset', response, 'identity/provider-request-failed');
      }
      await applyProviderBridgeState('requestPasswordReset', {
        status: STATES.PASSWORD_RESET_EMAIL_SENT,
        mode: 'provider_backed',
        provider: 'supabase',
        pendingEmail: null,
        emailMasked: response.emailMasked || maskEmail(normalizedEmail),
        pendingEmailMasked: response.emailMasked || maskEmail(normalizedEmail),
        emailVerified: false,
        profile: null,
        workspace: null,
        onboardingCompleted: false,
        syncReady: false
      });
      return getSnapshot();
    } catch (error) {
      return fail('requestPasswordReset', error, 'identity/provider-request-failed');
    }
  }

  async function requestPasswordRecoveryCode(email) {
    try {
      const normalizedEmail = assertValidEmail(email);
      requireExtensionPageForPasswordAuth();
      const providerBridge = await getBridgeProviderStatus();
      if (!providerBridge.providerBacked) {
        throw createError('identity/operation-not-permitted-in-phase', 'Password recovery requires provider-backed identity.');
      }
      const response = await sendBridgeRaw('identity:request-password-recovery-code', { email: normalizedEmail });
      if (!response || response.ok !== true) {
        return failFromBridge('requestPasswordRecoveryCode', response, 'identity/provider-request-failed');
      }
      applyProviderBridgeFallbackState('requestPasswordRecoveryCode', {
        status: STATES.RECOVERY_CODE_PENDING,
        mode: 'provider_backed',
        provider: 'supabase',
        pendingEmail: null,
        emailMasked: response.emailMasked || maskEmail(normalizedEmail),
        pendingEmailMasked: response.pendingEmailMasked || response.emailMasked || maskEmail(normalizedEmail),
        emailVerified: false,
        profile: null,
        workspace: null,
        onboardingCompleted: false,
        syncReady: false
      });
      return getSnapshot();
    } catch (error) {
      return fail('requestPasswordRecoveryCode', error, 'identity/provider-request-failed');
    }
  }

  async function verifyPasswordRecoveryCode(input = {}) {
    try {
      const code = String(input.code || '').trim();
      if (!code) throw createError('identity/missing-code', 'Enter a verification code.');
      requireExtensionPageForPasswordAuth();
      const providerBridge = await getBridgeProviderStatus();
      if (!providerBridge.providerBacked) {
        throw createError('identity/operation-not-permitted-in-phase', 'Password recovery requires provider-backed identity.');
      }
      const response = await sendBridgeRaw('identity:verify-password-recovery-code', { code });
      if (!response || response.ok !== true) {
        return failFromBridge('verifyPasswordRecoveryCode', response, 'identity/verify-code-failed');
      }
      await applyPasswordAuthBridgeState('verifyPasswordRecoveryCode', response);
      return getSnapshot();
    } catch (error) {
      return fail('verifyPasswordRecoveryCode', error, 'identity/verify-code-failed');
    }
  }

  async function updatePasswordAfterRecovery(input = {}) {
    try {
      const password = normalizeStrongPasswordInput(input.password);
      requireExtensionPageForPasswordAuth();
      const providerBridge = await getBridgeProviderStatus();
      if (!providerBridge.providerBacked) {
        throw createError('identity/operation-not-permitted-in-phase', 'Password update requires provider-backed identity.');
      }
      const response = await sendBridgeRaw('identity:update-password-after-recovery', { password });
      if (!response || response.ok !== true) {
        return failPasswordUpdateFromBridge('updatePasswordAfterRecovery', response, 'identity/password-update-failed');
      }
      await applyPasswordAuthBridgeState('updatePasswordAfterRecovery', response);
      return getSnapshot();
    } catch (error) {
      return failPasswordUpdate('updatePasswordAfterRecovery', error, 'identity/password-update-failed');
    }
  }

  async function resendVerification(email) {
    try {
      const normalizedEmail = assertValidEmail(email || snapshot.pendingEmail || '');
      const previous = snapshot;
      const next = transition(previous, STATES.EMAIL_PENDING, {
        pendingEmail: normalizedEmail,
        emailVerified: false
      });

      persistAndNotify('resendVerification', previous, next, {
        note: `Mock verification resent for ${maskEmail(normalizedEmail)}.`
      });
      return getSnapshot();
    } catch (error) {
      return fail('resendVerification', error, 'identity/resend-failed');
    }
  }

  async function verifyEmailCode(input = {}) {
    try {
      const code = String(input.code || '').trim();
      if (!code) throw createError('identity/missing-code', 'Enter a verification code.');

      const providerBridge = await getBridgeProviderStatus();
      if (providerBridge.providerBacked) {
        const response = await sendBridgeRaw('identity:verify-email-otp', { code });
        if (!response || response.ok !== true) {
          return failFromBridge('verifyEmailCode', response, 'identity/verify-code-failed');
        }
        await applyPasswordAuthBridgeState('verifyEmailCode', response);
        return getSnapshot();
      }

      const email = assertValidEmail(input.email || snapshot.pendingEmail || '');
      // Notify background adapter (Phase 2.9+). Fire-and-forget in local/mock mode.
      sendBridge('identity:verify-email-otp', { email, code });
      const previous = snapshot;
      const next = transition(previous, STATES.VERIFIED_NO_PROFILE, {
        pendingEmail: email,
        emailVerified: true
      });

      persistAndNotify('verifyEmailCode', previous, next, {
        note: `Mock email verified for ${maskEmail(email)}.`
      });
      return getSnapshot();
    } catch (error) {
      return fail('verifyEmailCode', error, 'identity/verify-code-failed');
    }
  }

  async function handleVerificationCallback(urlOrLocation) {
    try {
      const callbackUrl = parseMaybeUrl(urlOrLocation || global.location?.href);
      const emailFromUrl = callbackUrl?.searchParams?.get('email');
      const email = assertValidEmail(emailFromUrl || snapshot.pendingEmail || '');
      const previous = snapshot;
      const next = transition(previous, STATES.VERIFIED_NO_PROFILE, {
        pendingEmail: email,
        emailVerified: true
      });

      persistAndNotify('handleVerificationCallback', previous, next, {
        note: `Mock callback accepted for ${maskEmail(email)}.`
      });
      return getSnapshot();
    } catch (error) {
      return fail('handleVerificationCallback', error, 'identity/callback-failed');
    }
  }

  async function createInitialWorkspace(input = {}) {
    try {
      const providerBridge = await getBridgeProviderStatus();
      const existingProviderReadyState = isProviderSyncReadyState(providerBridge.derivedState)
        ? providerBridge.derivedState
        : (isProviderSyncReadyState(snapshot) ? snapshot : null);
      if (existingProviderReadyState) {
        await applyExistingProviderReadyState(existingProviderReadyState);
        return getSnapshot();
      }
      if (providerBridge.providerBacked) {
        const currentProviderStatus = String(providerBridge.derivedState?.status || snapshot.status || '');
        if (currentProviderStatus === STATES.PASSWORD_UPDATE_REQUIRED || snapshot.status === STATES.PASSWORD_UPDATE_REQUIRED) {
          return failPasswordUpdate(
            'createInitialWorkspace',
            createError('identity/password-update-required', 'Set a new password before continuing.'),
            'identity/password-update-required'
          );
        }
        const currentCredentialState = normalizeCredentialState(
          providerBridge.derivedState?.credentialState || snapshot.credentialState
        );
        if (currentCredentialState !== 'complete') {
          return failPasswordUpdate(
            'createInitialWorkspace',
            createError('identity/password-update-required', 'Set a new password before continuing.'),
            'identity/password-update-required'
          );
        }
        const onboardingInput = normalizeProviderOnboardingInput(input);
        if (!onboardingInput) {
          throw createError('identity/onboarding-invalid-input', 'Enter a display name, avatar color, and workspace name.');
        }
        const response = await sendBridgeRaw('identity:complete-onboarding', onboardingInput);
        if (!response || response.ok !== true) {
          return failFromBridge('createInitialWorkspace', response, 'identity/onboarding-failed');
        }
        await applyProviderBridgeState('createInitialWorkspace', {
          status: STATES.SYNC_READY,
          mode: 'provider_backed',
          provider: 'supabase',
          pendingEmail: null,
          credentialState: 'complete',
          credentialProvider: normalizeCredentialProvider(response.credentialProvider || snapshot.credentialProvider),
          emailVerified: true,
          profile: response.profile || null,
          workspace: response.workspace || null,
          onboardingCompleted: true,
          syncReady: true
        });
        return getSnapshot();
      }

      const email = assertValidEmail(input.email || snapshot.pendingEmail || snapshot.profile?.email || 'local-user@h2o.local');
      const displayName = normalizeDisplayName(input.displayName, email);
      // Notify background adapter atomically (Phase 2.9+): single message eliminates
      // the concurrent-handler race between create-profile and create-workspace.
      // Fire-and-forget; local factory remains the authority for Phase 2.9.
      sendBridge('identity:complete-onboarding', {
        displayName,
        avatarColor: input.avatarColor || '',
        workspaceName: normalizeWorkspaceName(input.workspaceName, displayName)
      });
      const { profile, workspace } = createProfileAndWorkspace({
        email,
        displayName,
        workspaceName: input.workspaceName,
        avatarColor: input.avatarColor
      });

      const previous = snapshot;
      const next = transition(previous, STATES.PROFILE_READY, {
        pendingEmail: null,
        emailVerified: true,
        profile,
        workspace,
        onboardingCompleted: true
      });

      persistAndNotify('createInitialWorkspace', previous, next, {
        note: `Local profile created for ${maskEmail(email)}.`
      });
      return getSnapshot();
    } catch (error) {
      return fail('createInitialWorkspace', error, 'identity/profile-create-failed');
    }
  }

  async function enterLocalMode(input = {}) {
    const email = input.email || `local-${Date.now().toString(36)}@h2o.local`;
    const previous = snapshot;

    try {
      const { profile, workspace } = createProfileAndWorkspace({
        email,
        displayName: input.displayName || 'Local H2O User',
        workspaceName: input.workspaceName || 'Local H2O Workspace',
        avatarColor: input.avatarColor
      });
      const next = transition(previous, STATES.PROFILE_READY, {
        pendingEmail: null,
        emailVerified: true,
        profile,
        workspace,
        onboardingCompleted: true
      });

      persistAndNotify('enterLocalMode', previous, next, {
        note: 'Entered local mock profile mode.'
      });
      return getSnapshot();
    } catch (error) {
      return fail('enterLocalMode', error, 'identity/local-mode-failed');
    }
  }

  async function refreshSession() {
    // Pull latest shared snapshot from background first (Phase 2.9+).
    try {
      const res = await sendBridge('identity:get-snapshot');
      if (res && res.snapshot && typeof res.snapshot === 'object') {
        applySharedSnapshot(res.snapshot);
        return getSnapshot();
      }
      if (res && Object.prototype.hasOwnProperty.call(res, 'snapshot') && !res.snapshot && isProviderOwnedSnapshot(snapshot)) {
        applySharedSnapshot(null);
        return getSnapshot();
      }
    } catch (_) {}
    // Fallback: local refresh only.
    sendBridge('identity:refresh-session');
    const previous = snapshot;
    const next = normalizeSnapshot({ ...snapshot, updatedAt: nowIso() });
    persistAndNotify('refreshSession', previous, next, { note: 'Mock session refreshed (local).' });
    return getSnapshot();
  }

  async function signOut() {
    // identity:sign-out clears both the mock adapter runtime and the snapshot key.
    await sendBridge('identity:sign-out');
    const previous = snapshot;
    const next = createInitialSnapshot();
    persistAndNotify('signOut', previous, next, { note: 'Identity reset to anonymous local mode.' });
    // Cancel any pending debounced bridge write so clear wins.
    if (bridgeWriteTimer) { clearTimeout(bridgeWriteTimer); bridgeWriteTimer = 0; }
    return getSnapshot();
  }

  async function updateProfile(patch = {}) {
    try {
      if (!snapshot.profile) throw createError('identity/no-profile', 'No profile exists to update.');
      const providerBridge = await getBridgeProviderStatus();
      if (providerBridge.providerBacked && snapshot.mode === 'provider_backed' && snapshot.provider === 'supabase') {
        const providerInput = normalizeProviderProfileUpdateInput(patch);
        if (!providerInput) {
          throw createError('identity/account-update-invalid-input', 'Check the account details and try again.');
        }
        const response = await sendBridgeRaw('identity:update-profile', providerInput);
        if (!response || response.ok !== true) {
          return failFromBridge('updateProfile', response, 'identity/account-update-failed');
        }
        await applyPasswordAuthBridgeState('updateProfile', response);
        return getSnapshot();
      }
      const cleanPatch = sanitizeProfilePatch(patch);
      const previous = snapshot;
      const profile = { ...snapshot.profile, ...cleanPatch, updatedAt: nowIso() };
      const next = transition(previous, previous.status, {
        profile,
        onboardingCompleted: Boolean(profile.onboardingCompleted)
      });

      persistAndNotify('updateProfile', previous, next, { note: 'Profile updated.' });
      return getSnapshot();
    } catch (error) {
      return fail('updateProfile', error, 'identity/profile-update-failed');
    }
  }

  async function renameWorkspace(input = {}) {
    try {
      if (!snapshot.workspace) throw createError('identity/account-update-not-found', 'No workspace exists to update.');
      const providerBridge = await getBridgeProviderStatus();
      if (providerBridge.providerBacked && snapshot.mode === 'provider_backed' && snapshot.provider === 'supabase') {
        const workspaceName = normalizeProviderWorkspaceName(input.workspaceName);
        if (!workspaceName) {
          throw createError('identity/account-update-invalid-input', 'Check the workspace name and try again.');
        }
        const response = await sendBridgeRaw('identity:rename-workspace', { workspaceName });
        if (!response || response.ok !== true) {
          return failFromBridge('renameWorkspace', response, 'identity/account-update-failed');
        }
        await applyPasswordAuthBridgeState('renameWorkspace', response);
        return getSnapshot();
      }
      const workspaceName = normalizeWorkspaceName(input.workspaceName, snapshot.profile?.displayName || 'H2O');
      const previous = snapshot;
      const workspace = { ...snapshot.workspace, name: workspaceName, updatedAt: nowIso() };
      const next = transition(previous, previous.status, { workspace });
      persistAndNotify('renameWorkspace', previous, next, { note: 'Workspace renamed.' });
      return getSnapshot();
    } catch (error) {
      return fail('renameWorkspace', error, 'identity/account-update-failed');
    }
  }

  async function changePassword(input = {}) {
    try {
      const currentPassword = normalizePasswordInput(input.currentPassword);
      const password = normalizeStrongPasswordInput(input.password);
      const provider = normalizeCredentialProvider(snapshot.credentialProvider);
      if (provider !== 'password' && provider !== 'multiple') {
        throw createError('identity/operation-not-permitted-in-phase', 'Password change is available for password-backed accounts only.');
      }
      const providerBridge = await getBridgeProviderStatus();
      if (!providerBridge.providerBacked) {
        throw createError('identity/operation-not-permitted-in-phase', 'Password change requires provider-backed identity.');
      }
      const response = await sendBridgeRaw('identity:change-password', { currentPassword, password });
      if (!response || response.ok !== true) {
        return failPasswordUpdateFromBridge('changePassword', response, 'identity/password-current-invalid');
      }
      await applyPasswordAuthBridgeState('changePassword', response);
      return getSnapshot();
    } catch (error) {
      return failPasswordUpdate('changePassword', error, 'identity/password-current-invalid');
    }
  }

  async function openOnboarding(options = {}) {
    const target  = options.target  || 'h2o-identity-onboarding';
    const features = options.features || 'popup=yes,width=980,height=760,noopener=no,noreferrer=no';

    // Explicit caller-supplied URL — open directly (synchronous, no blocker risk).
    if (options.url) {
      return openWindowDirect(String(options.url), target, features);
    }

    // Extension-page context: chrome.runtime.getURL is available directly.
    // window.open() here is fine — no async gap before the call.
    try {
      if (global.chrome?.runtime?.getURL) {
        const url = global.chrome.runtime.getURL('surfaces/identity/identity.html');
        if (typeof url === 'string' && url.startsWith('chrome-extension://')) {
          return openWindowDirect(url, target, features);
        }
      }
    } catch (_) {}

    // Page context (ChatGPT tab): window.open() after await is blocked by Chrome's
    // popup blocker because the user gesture is consumed by the time the Promise
    // resolves. Ask the background to open the window via chrome.windows.create,
    // which has no gesture restriction.
    try {
      const res = await sendBridge('identity:open-onboarding');
      if (res?.ok) {
        recordAudit('openOnboarding', snapshot, { opened: true, url: 'chrome-extension://*' });
        return true;
      }
    } catch (_) {}

    safeWarn('H2O Identity onboarding could not be opened. Ensure the H2O extension is active.');
    return null;
  }

  function openWindowDirect(url, target, features) {
    try {
      const opened = global.open(url, target, features);
      recordAudit('openOnboarding', snapshot, { opened: Boolean(opened), url: sanitizeUrlForDiag(url) });
      return opened || true;
    } catch (error) {
      safeWarn('Failed to open H2O Identity onboarding surface.', error);
      return null;
    }
  }

  function diag() {
    return {
      owner: OWNER,
      version: VERSION,
      status: snapshot.status,
      mode: snapshot.mode,
      provider: snapshot.provider,
      pendingEmail: maskEmail(snapshot.pendingEmail),
      hasProfile: Boolean(snapshot.profile),
      profileEmail: maskEmail(snapshot.profile?.email),
      hasWorkspace: Boolean(snapshot.workspace),
      onboardingCompleted: Boolean(snapshot.onboardingCompleted),
      credentialState: normalizeCredentialState(snapshot.credentialState),
      credentialProvider: normalizeCredentialProvider(snapshot.credentialProvider),
      emailVerified: Boolean(snapshot.emailVerified),
      lastError: snapshot.lastError ? { ...snapshot.lastError, detail: undefined } : null,
      listenerCount: listeners.size,
      storage: {
        available: storageAvailable(),
        key: STORAGE_KEYS.SNAPSHOT
      },
      capabilities: {
        emailMagicLink: false,
        emailOtp: true,
        profileRead: true,
        profileWrite: true,
        persistentSession: snapshot.mode === 'provider_backed' && snapshot.provider === 'supabase',
        cloudSync: false
      },
      audit: audit.slice(-8).map(entry => ({ ...entry, pendingEmail: maskEmail(entry.pendingEmail) }))
    };
  }

  function selfCheck() {
    const checks = {
      hasH2O: Boolean(global.H2O),
      installed: global.H2O?.Identity === api,
      storageAvailable: storageAvailable(),
      publicApi: [
        'getState',
        'getSnapshot',
        'onChange',
        'signInWithEmailCode',
        'signInWithEmail',
        'signUpWithPassword',
        'verifySignupEmailCode',
        'resendSignupConfirmation',
        'signInWithPassword',
        'signInWithGoogle',
        'requestPasswordReset',
        'requestPasswordRecoveryCode',
        'verifyPasswordRecoveryCode',
        'updatePasswordAfterRecovery',
        'resendVerification',
        'verifyEmailCode',
        'handleVerificationCallback',
        'createInitialWorkspace',
        'enterLocalMode',
        'refreshSession',
        'signOut',
        'getProfile',
        'updateProfile',
        'getWorkspace',
        'renameWorkspace',
        'changePassword',
        'openOnboarding',
        'diag'
      ].every(name => typeof api[name] === 'function'),
      noTokenSurface: !JSON.stringify(snapshot).toLowerCase().includes('token')
    };

    return {
      ok: Object.values(checks).every(Boolean),
      checks,
      diag: diag()
    };
  }

  function persistAndNotify(source, previous, next, meta = {}) {
    snapshot = normalizeSnapshot(next);
    writeJson(STORAGE_KEYS.SNAPSHOT, snapshot);
    recordAudit(source, snapshot, meta);

    if (meta.silentSameRef && previous === next) return;

    if (meta.skipBridgeWrite !== true) scheduleBridgeWrite(snapshot);

    const event = {
      source,
      previous: clone(previous),
      current: clone(snapshot)
    };

    for (const listener of Array.from(listeners)) {
      try {
        listener(event);
      } catch (error) {
        safeWarn('Identity listener failed.', error);
      }
    }

    try {
      global.dispatchEvent(new CustomEvent(EVENT_CHANGE, { detail: event }));
    } catch (error) {
      safeWarn('Identity change event dispatch failed.', error);
    }
  }

  function dispatchReady(identityApi) {
    try {
      global.dispatchEvent(new CustomEvent(EVENT_READY, { detail: { api: identityApi, version: VERSION } }));
    } catch (error) {
      safeWarn('Identity ready event dispatch failed.', error);
    }
  }

  function fail(source, error, fallbackCode) {
    const identityError = normalizeError(error, fallbackCode);
    const previous = snapshot;
    const next = transition(previous, STATES.AUTH_ERROR, { lastError: identityError });
    persistAndNotify(source, previous, next, { error: identityError.code });
    return getSnapshot();
  }

  function failFromBridge(source, response, fallbackCode) {
    const code = normalizeBridgeErrorCode(response?.errorCode || response?.code || response?.error, fallbackCode);
    const message = normalizeBridgeErrorMessage(response?.errorMessage || response?.message, code);
    return fail(source, createError(code, message), fallbackCode);
  }

  function failSignupConfirmationFromBridge(source, response, fallbackCode) {
    const code = normalizeBridgeErrorCode(response?.errorCode || response?.code || response?.error, fallbackCode);
    const message = normalizeBridgeErrorMessage(response?.errorMessage || response?.message, code);
    return failSignupConfirmation(source, createError(code, message), fallbackCode);
  }

  function failPasswordUpdateFromBridge(source, response, fallbackCode) {
    const code = normalizeBridgeErrorCode(response?.errorCode || response?.code || response?.error, fallbackCode);
    const message = normalizeBridgeErrorMessage(response?.errorMessage || response?.message, code);
    return failPasswordUpdate(source, createError(code, message), fallbackCode);
  }

  function failSignupConfirmation(source, error, fallbackCode) {
    const identityError = normalizeError(error, fallbackCode);
    const previous = snapshot;
    const keepPending = previous.status === STATES.EMAIL_CONFIRMATION_PENDING;
    const next = normalizeSnapshot({
      ...previous,
      status: keepPending ? STATES.EMAIL_CONFIRMATION_PENDING : STATES.AUTH_ERROR,
      mode: keepPending ? 'provider_backed' : previous.mode,
      provider: keepPending ? 'supabase' : previous.provider,
      pendingEmail: null,
      emailVerified: false,
      profile: null,
      workspace: null,
      onboardingCompleted: false,
      syncReady: false,
      lastError: identityError,
      updatedAt: nowIso()
    });
    persistAndNotify(source, previous, next, { error: identityError.code });
    return getSnapshot();
  }

  function failPasswordUpdate(source, error, fallbackCode) {
    const identityError = normalizeError(error, fallbackCode);
    const previous = snapshot;
    const keepRequired = previous.status === STATES.PASSWORD_UPDATE_REQUIRED;
    const next = normalizeSnapshot({
      ...previous,
      status: keepRequired ? STATES.PASSWORD_UPDATE_REQUIRED : STATES.AUTH_ERROR,
      mode: keepRequired ? 'provider_backed' : previous.mode,
      provider: keepRequired ? 'supabase' : previous.provider,
      pendingEmail: null,
      emailVerified: keepRequired ? true : previous.emailVerified,
      profile: keepRequired ? null : previous.profile,
      workspace: keepRequired ? null : previous.workspace,
      onboardingCompleted: false,
      syncReady: false,
      lastError: identityError,
      updatedAt: nowIso()
    });
    persistAndNotify(source, previous, next, { error: identityError.code });
    return getSnapshot();
  }

  function normalizeBridgeErrorCode(input, fallbackCode) {
    const code = String(input || '').trim().toLowerCase().replace(/[^a-z0-9_/-]/g, '').slice(0, 96);
    return code || fallbackCode || 'identity/operation-failed';
  }

  function normalizeBridgeErrorMessage(input, code) {
    if (code && SAFE_BRIDGE_ERROR_MESSAGES[code]) return SAFE_BRIDGE_ERROR_MESSAGES[code];
    void input;
    return 'Identity operation failed.';
  }

  function transition(previous, nextStatus, patch = {}) {
    if (!canTransition(previous.status, nextStatus)) {
      return {
        ...previous,
        status: STATES.AUTH_ERROR,
        lastError: createError(
          'identity/invalid-transition',
          `Invalid identity transition: ${previous.status} -> ${nextStatus}`,
          { from: previous.status, to: nextStatus }
        ),
        updatedAt: nowIso()
      };
    }

    const next = {
      ...previous,
      ...patch,
      status: nextStatus,
      version: VERSION,
      mode: patch.mode || previous.mode || 'local_dev',
      provider: patch.provider || previous.provider || 'mock_local',
      updatedAt: nowIso()
    };

    next.emailVerified = Boolean(
      patch.emailVerified ||
      next.profile?.emailVerified ||
      nextStatus === STATES.VERIFIED_NO_PROFILE ||
      nextStatus === STATES.PROFILE_READY ||
      nextStatus === STATES.SYNC_READY
    );
    next.onboardingCompleted = Boolean(next.profile?.onboardingCompleted || nextStatus === STATES.PROFILE_READY || nextStatus === STATES.SYNC_READY);
    if (nextStatus !== STATES.AUTH_ERROR) next.lastError = null;

    return normalizeSnapshot(next);
  }

  function canTransition(from, to) {
    return Boolean(ALLOWED_TRANSITIONS[from]?.includes(to));
  }

  function createInitialSnapshot() {
    return {
      version: VERSION,
      status: STATES.ANONYMOUS_LOCAL,
      mode: 'local_dev',
      provider: 'mock_local',
      pendingEmail: null,
      emailVerified: false,
      profile: null,
      workspace: null,
      onboardingCompleted: false,
      credentialState: 'unknown',
      credentialProvider: 'unknown',
      lastError: null,
      updatedAt: nowIso()
    };
  }

  function normalizeSnapshot(value) {
    const base = createInitialSnapshot();
    if (!value || typeof value !== 'object') return base;

    const status = Object.values(STATES).includes(value.status) ? value.status : base.status;
    return {
      ...base,
      ...value,
      version: VERSION,
      status,
      mode: value.mode === 'provider_backed' ? 'provider_backed' : 'local_dev',
      provider: value.provider || 'mock_local',
      pendingEmail: value.pendingEmail || null,
      credentialState: normalizeCredentialState(value.credentialState),
      credentialProvider: normalizeCredentialProvider(value.credentialProvider),
      emailVerified: Boolean(value.emailVerified || value.profile?.emailVerified),
      profile: value.profile && typeof value.profile === 'object' ? value.profile : null,
      workspace: value.workspace && typeof value.workspace === 'object' ? value.workspace : null,
      onboardingCompleted: Boolean(value.onboardingCompleted || value.profile?.onboardingCompleted),
      lastError: value.lastError || null,
      updatedAt: value.updatedAt || nowIso()
    };
  }

  function normalizeCredentialState(input) {
    const value = String(input || '').trim().toLowerCase();
    if (value === 'complete' || value === 'required' || value === 'unknown') return value;
    return 'unknown';
  }

  function normalizeCredentialProvider(input) {
    const value = String(input || '').trim().toLowerCase();
    if (value === 'password' || value === 'google' || value === 'multiple' || value === 'unknown') return value;
    return 'unknown';
  }

  function isProviderOwnedSnapshot(value) {
    if (!value || typeof value !== 'object') return false;
    return value.mode === 'provider_backed'
      || value.provider === 'supabase'
      || value.status === STATES.RECOVERY_CODE_PENDING
      || value.status === STATES.EMAIL_CONFIRMATION_PENDING
      || value.status === STATES.PASSWORD_UPDATE_REQUIRED
      || value.status === STATES.PASSWORD_RESET_EMAIL_SENT;
  }

  function createProfileAndWorkspace(input) {
    const email = assertValidEmail(input.email || 'local-user@h2o.local');
    const userId = makeId('local_user');
    const workspaceId = makeId('workspace');
    const displayName = normalizeDisplayName(input.displayName, email);
    const timestamp = nowIso();

    const workspace = {
      id: workspaceId,
      ownerUserId: userId,
      name: normalizeWorkspaceName(input.workspaceName, displayName),
      origin: 'local_mock',
      createdAt: timestamp,
      updatedAt: timestamp
    };

    const profile = {
      id: makeId('profile'),
      userId,
      email,
      emailVerified: true,
      displayName,
      avatarColor: normalizeAvatarColor(input.avatarColor) || pickAvatarColor(email),
      workspaceId,
      onboardingCompleted: true,
      createdAt: timestamp,
      updatedAt: timestamp
    };

    return { profile, workspace };
  }

  function sanitizeProfilePatch(patch) {
    const clean = {};
    if (typeof patch.displayName === 'string') {
      const displayName = patch.displayName.trim().replace(/\s+/g, ' ').slice(0, 80);
      if (displayName) clean.displayName = displayName;
    }
    if (typeof patch.avatarColor === 'string') {
      const avatarColor = normalizeAvatarColor(patch.avatarColor);
      if (avatarColor) clean.avatarColor = avatarColor;
    }
    if (typeof patch.onboardingCompleted === 'boolean') clean.onboardingCompleted = patch.onboardingCompleted;
    return clean;
  }

  function assertValidEmail(input) {
    const email = normalizeEmail(input);
    if (email.length < 6 || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      throw createError('identity/invalid-email', 'Enter a valid email address.', { input: String(input || '').slice(0, 80) });
    }
    return email;
  }

  function normalizePasswordInput(input) {
    const password = typeof input === 'string' ? input : '';
    if (password.length < 6 || password.length > 1024) {
      throw createError('identity/password-invalid', 'Enter your email and password.');
    }
    return password;
  }

  function normalizeStrongPasswordInput(input) {
    const password = typeof input === 'string' ? input : '';
    if (password.length < 12 || password.length > 1024 || !password.trim()) {
      throw createError('identity/password-weak', 'Use a stronger password.');
    }
    return password;
  }

  function requireExtensionPageForPasswordAuth() {
    if (isExtensionPageContext()) return true;
    throw createError('identity/password-auth-extension-page-required', 'Open the H2O Identity window to use password sign-in.');
  }

  function normalizeEmail(input) {
    return String(input || '').trim().toLowerCase();
  }

  function normalizeDisplayName(input, email) {
    const clean = String(input || '').trim().replace(/\s+/g, ' ');
    if (clean) return clean.slice(0, 80);
    const localPart = String(email || '').split('@')[0] || 'Local H2O User';
    return localPart.replace(/[._-]+/g, ' ').replace(/\b\w/g, char => char.toUpperCase()).slice(0, 80);
  }

  function normalizeWorkspaceName(input, displayName) {
    const clean = String(input || '').trim().replace(/\s+/g, ' ');
    if (clean) return clean.slice(0, 80);
    return displayName ? `${displayName}'s Workspace` : 'H2O Workspace';
  }

  function normalizeProviderOnboardingInput(input = {}) {
    const displayName = String(input.displayName || '').trim().replace(/\s+/g, ' ');
    const workspaceName = String(input.workspaceName || '').trim().replace(/\s+/g, ' ');
    const avatarColor = normalizeAvatarColor(input.avatarColor);
    if (displayName.length < 1 || displayName.length > 64) return null;
    if (workspaceName.length < 1 || workspaceName.length > 64) return null;
    if (!avatarColor) return null;
    return { displayName, avatarColor, workspaceName };
  }

  function normalizeProviderProfileUpdateInput(input = {}) {
    const displayName = String(input.displayName || '').trim().replace(/\s+/g, ' ');
    const avatarColor = normalizeAvatarColor(input.avatarColor);
    if (displayName.length < 1 || displayName.length > 64) return null;
    if (!avatarColor) return null;
    return { displayName, avatarColor };
  }

  function normalizeProviderWorkspaceName(input) {
    const workspaceName = String(input || '').trim().replace(/\s+/g, ' ');
    return workspaceName.length >= 1 && workspaceName.length <= 64 ? workspaceName : '';
  }

  function normalizeAvatarColor(input) {
    const clean = String(input || '').trim().toLowerCase();
    if (!clean) return '';
    if (PROFILE_AVATAR_PALETTE.includes(clean)) return clean;
    return PROFILE_AVATAR_HEX_TO_SLUG[clean] || '';
  }

  function pickAvatarColor(seed) {
    let hash = 0;
    for (let index = 0; index < String(seed).length; index += 1) {
      hash = (hash * 31 + String(seed).charCodeAt(index)) >>> 0;
    }
    return PROFILE_AVATAR_PALETTE[hash % PROFILE_AVATAR_PALETTE.length];
  }

  function makeId(prefix) {
    const safePrefix = String(prefix || 'id').replace(/[^a-z0-9_-]/gi, '').toLowerCase() || 'id';
    if (global.crypto?.randomUUID) return `${safePrefix}_${global.crypto.randomUUID().replace(/-/g, '').slice(0, 18)}`;
    return `${safePrefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
  }

  function createError(code, message, detail) {
    return { code, message, detail, at: nowIso() };
  }

  function normalizeError(error, fallbackCode) {
    if (error && typeof error === 'object' && error.code && error.message) {
      return { code: String(error.code), message: String(error.message), detail: error.detail, at: error.at || nowIso() };
    }
    return createError(fallbackCode, error instanceof Error ? error.message : 'Identity operation failed.', error);
  }

  // resolveOnboardingUrl is no longer used: URL resolution is now inline in
  // openOnboarding() so that chrome.runtime.getURL / openWindowDirect can be called
  // before any await, and the page-context path delegates opening to the background.

  function parseMaybeUrl(value) {
    try {
      if (!value) return null;
      if (value instanceof URL) return value;
      if (typeof Location !== 'undefined' && value instanceof Location) return new URL(value.href);
      return new URL(String(value), 'https://local.h2o.invalid');
    } catch (_) {
      return null;
    }
  }

  function sanitizeUrlForDiag(url) {
    try {
      const parsed = new URL(String(url), global.location?.origin || 'https://local.h2o.invalid');
      parsed.search = '';
      parsed.hash = '';
      return parsed.toString();
    } catch (_) {
      return '[unavailable]';
    }
  }

  function maskEmail(email) {
    if (!email) return null;
    const normalized = normalizeEmail(email);
    const parts = normalized.split('@');
    if (parts.length !== 2) return '***';
    const [name, domain] = parts;
    const visible = name.length <= 2 ? name[0] || '*' : `${name[0]}${name[name.length - 1]}`;
    return `${visible}***@${domain}`;
  }

  function recordAudit(source, currentSnapshot, meta = {}) {
    audit.push({
      at: nowIso(),
      source,
      status: currentSnapshot.status,
      pendingEmail: currentSnapshot.pendingEmail || null,
      hasProfile: Boolean(currentSnapshot.profile),
      meta: sanitizeAuditMeta(meta)
    });
    while (audit.length > 30) audit.shift();
    writeJson(STORAGE_KEYS.AUDIT, audit);
  }

  function sanitizeAuditMeta(meta) {
    const clean = {};
    for (const [key, value] of Object.entries(meta || {})) {
      if (/token|secret|password|refresh/i.test(key)) continue;
      clean[key] = typeof value === 'string' ? value.slice(0, 240) : value;
    }
    return clean;
  }

  function loadAudit() {
    const value = readJson(STORAGE_KEYS.AUDIT);
    return Array.isArray(value) ? value.slice(-30) : [];
  }

  function readJson(key) {
    try {
      const raw = global.localStorage?.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }

  function writeJson(key, value) {
    try {
      global.localStorage?.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      safeWarn(`Failed to write identity storage key ${key}.`, error);
      return false;
    }
  }

  function storageAvailable() {
    try {
      const key = `${STORAGE_PREFIX}:probe`;
      global.localStorage?.setItem(key, '1');
      global.localStorage?.removeItem(key);
      return true;
    } catch (_) {
      return false;
    }
  }

  function clone(value) {
    if (typeof global.structuredClone === 'function') return global.structuredClone(value);
    return JSON.parse(JSON.stringify(value));
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function noop() {}

  function safeWarn(message, error) {
    try {
      console.warn(`[H2O Identity] ${message}`, error || '');
    } catch (_) {
      // noop
    }
  }

  function semverGte(left, right) {
    const a = String(left || '0.0.0').split('.').map(Number);
    const b = String(right || '0.0.0').split('.').map(Number);
    for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
      const ai = a[index] || 0;
      const bi = b[index] || 0;
      if (ai > bi) return true;
      if (ai < bi) return false;
    }
    return true;
  }

  // ── Extension bridge (Phase 2.6) ─────────────────────────────────────────
  // Persists the mock identity snapshot to chrome.storage.local via the
  // extension background so all contexts (ChatGPT tab, onboarding popup)
  // share the same state. Falls back silently to localStorage if unavailable.

  function isExtensionPageContext() {
    try { return String(global.location?.protocol || '') === 'chrome-extension:'; } catch { return false; }
  }

  function sendBridgeDirect(action, extra) {
    return new Promise((resolve) => {
      try {
        global.chrome.runtime.sendMessage(
          { type: BRIDGE_MSG_SW, req: { action, ...extra } },
          (resp) => {
            if (global.chrome?.runtime?.lastError) { resolve(null); return; }
            resolve(resp && resp.ok ? resp : null);
          }
        );
      } catch (_) { resolve(null); }
    });
  }

  function sendBridgeDirectRaw(action, extra) {
    return new Promise((resolve) => {
      try {
        global.chrome.runtime.sendMessage(
          { type: BRIDGE_MSG_SW, req: { action, ...extra } },
          (resp) => {
            if (global.chrome?.runtime?.lastError) { resolve(null); return; }
            resolve(resp || null);
          }
        );
      } catch (_) { resolve(null); }
    });
  }

  function sendBridgeRelay(action, extra) {
    return new Promise((resolve) => {
      const id = 'h2oid_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 9);
      let done = false;
      const finish = (v) => {
        if (done) return;
        done = true;
        global.removeEventListener('message', onMsg, false);
        resolve(v);
      };
      const timer = setTimeout(() => finish(null), BRIDGE_TIMEOUT_MS);
      const onMsg = (ev) => {
        if (ev.source !== global) return;
        const d = ev.data;
        if (!d || d.type !== BRIDGE_MSG_RES || d.id !== id) return;
        clearTimeout(timer);
        finish(d.ok ? d : null);
      };
      global.addEventListener('message', onMsg, false);
      try {
        global.postMessage({ type: BRIDGE_MSG_REQ, id, req: { action, ...extra } }, '*');
      } catch (_) { clearTimeout(timer); finish(null); }
    });
  }

  function sendBridgeRelayRaw(action, extra) {
    return new Promise((resolve) => {
      const id = 'h2oid_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 9);
      let done = false;
      const finish = (v) => {
        if (done) return;
        done = true;
        global.removeEventListener('message', onMsg, false);
        resolve(v);
      };
      const timer = setTimeout(() => finish(null), BRIDGE_TIMEOUT_MS);
      const onMsg = (ev) => {
        if (ev.source !== global) return;
        const d = ev.data;
        if (!d || d.type !== BRIDGE_MSG_RES || d.id !== id) return;
        clearTimeout(timer);
        finish(d || null);
      };
      global.addEventListener('message', onMsg, false);
      try {
        global.postMessage({ type: BRIDGE_MSG_REQ, id, req: { action, ...extra } }, '*');
      } catch (_) { clearTimeout(timer); finish(null); }
    });
  }

  function sendBridge(action, extra) {
    return (isExtensionPageContext() ? sendBridgeDirect(action, extra) : sendBridgeRelay(action, extra))
      .catch(() => null);
  }

  function sendBridgeRaw(action, extra) {
    return (isExtensionPageContext() ? sendBridgeDirectRaw(action, extra) : sendBridgeRelayRaw(action, extra))
      .catch(() => null);
  }

  async function getBridgeProviderStatus() {
    const res = await sendBridgeRaw('identity:get-derived-state');
    const derivedState = res && res.ok !== false && res.derivedState && typeof res.derivedState === 'object'
      ? res.derivedState
      : null;
    const cfg = derivedState?.providerConfigStatus && typeof derivedState.providerConfigStatus === 'object'
      ? derivedState.providerConfigStatus
      : null;
    const providerBacked = Boolean(
      cfg &&
      cfg.providerKind === 'supabase' &&
      cfg.providerMode === 'provider_backed'
    );
    return { providerBacked, derivedState, providerConfigStatus: cfg };
  }

  function isProviderSyncReadyState(value) {
    const src = value && typeof value === 'object' ? value : null;
    return Boolean(
      src &&
      src.status === STATES.SYNC_READY &&
      src.mode === 'provider_backed' &&
      src.provider === 'supabase' &&
      normalizeCredentialState(src.credentialState) === 'complete' &&
      src.profile && typeof src.profile === 'object' &&
      src.workspace && typeof src.workspace === 'object'
    );
  }

  function providerSyncReadyPatch(value) {
    if (!isProviderSyncReadyState(value)) return null;
    return {
      status: STATES.SYNC_READY,
      mode: 'provider_backed',
      provider: 'supabase',
      providerKind: 'supabase',
      pendingEmail: null,
      pendingEmailMasked: null,
      emailVerified: true,
      emailMasked: value.emailMasked || snapshot.emailMasked || null,
      userIdMasked: value.userIdMasked || snapshot.userIdMasked || null,
      sessionExpiresAt: value.sessionExpiresAt || snapshot.sessionExpiresAt || null,
      credentialState: 'complete',
      credentialProvider: normalizeCredentialProvider(value.credentialProvider || snapshot.credentialProvider),
      profile: clone(value.profile),
      workspace: clone(value.workspace),
      onboardingCompleted: true,
      syncReady: true,
      lastError: null,
      updatedAt: value.updatedAt || nowIso()
    };
  }

  async function applyExistingProviderReadyState(value) {
    const patch = providerSyncReadyPatch(value);
    if (!patch) return false;
    const pulled = await pullLatestBridgeIdentityState();
    if (pulled && isProviderSyncReadyState(snapshot)) return true;
    const previous = snapshot;
    const next = normalizeSnapshot({
      ...snapshot,
      ...patch
    });
    persistAndNotify('createInitialWorkspace:already-sync-ready', previous, next, {
      source: 'provider-bridge',
      note: 'Provider-backed account already has a synced profile/workspace.'
    });
    return true;
  }

  async function pullLatestBridgeIdentityState() {
    const snapRes = await sendBridgeRaw('identity:get-snapshot');
    if (snapRes && snapRes.ok !== false && snapRes.snapshot && typeof snapRes.snapshot === 'object') {
      const status = String(snapRes.snapshot.status || '');
      if (status && status !== STATES.ANONYMOUS_LOCAL) return applySharedSnapshot(snapRes.snapshot) === true;
    }
    const derivedRes = await sendBridgeRaw('identity:get-derived-state');
    if (derivedRes && derivedRes.ok !== false && derivedRes.derivedState && typeof derivedRes.derivedState === 'object') {
      const status = String(derivedRes.derivedState.status || '');
      if (status && status !== STATES.ANONYMOUS_LOCAL) return applySharedSnapshot(derivedRes.derivedState) === true;
    }
    return false;
  }

  async function applyProviderBridgeState(source, fallbackPatch) {
    const pulled = await pullLatestBridgeIdentityState();
    if (pulled) return getSnapshot();
    return applyProviderBridgeFallbackState(source, fallbackPatch);
  }

  function applyProviderBridgeFallbackState(source, fallbackPatch) {
    const previous = snapshot;
    const next = normalizeSnapshot({
      ...snapshot,
      ...fallbackPatch,
      lastError: null,
      updatedAt: nowIso()
    });
    persistAndNotify(source, previous, next, { source: 'provider-bridge', skipBridgeWrite: true });
    return getSnapshot();
  }

  async function applyPasswordAuthBridgeState(source, response) {
    const nextStatus = String(response?.nextStatus || '').trim();
    if (nextStatus === STATES.RECOVERY_CODE_PENDING) {
      return applyProviderBridgeState(source, {
        status: STATES.RECOVERY_CODE_PENDING,
        mode: 'provider_backed',
        provider: 'supabase',
        credentialState: 'unknown',
        credentialProvider: normalizeCredentialProvider(response.credentialProvider),
        pendingEmail: null,
        emailVerified: false,
        emailMasked: response.emailMasked || response.pendingEmailMasked || snapshot.emailMasked || null,
        pendingEmailMasked: response.pendingEmailMasked || response.emailMasked || snapshot.pendingEmailMasked || null,
        profile: null,
        workspace: null,
        onboardingCompleted: false,
        syncReady: false
      });
    }
    if (nextStatus === STATES.PASSWORD_UPDATE_REQUIRED) {
      return applyProviderBridgeState(source, {
        status: STATES.PASSWORD_UPDATE_REQUIRED,
        mode: 'provider_backed',
        provider: 'supabase',
        credentialState: 'required',
        credentialProvider: normalizeCredentialProvider(response.credentialProvider || snapshot.credentialProvider),
        pendingEmail: null,
        emailVerified: true,
        emailMasked: response.emailMasked || snapshot.emailMasked || null,
        pendingEmailMasked: response.emailMasked || snapshot.pendingEmailMasked || null,
        sessionExpiresAt: response.sessionExpiresAt || snapshot.sessionExpiresAt || null,
        userIdMasked: response.userIdMasked || snapshot.userIdMasked || null,
        profile: null,
        workspace: null,
        onboardingCompleted: false,
        syncReady: false
      });
    }
    if (nextStatus === STATES.EMAIL_CONFIRMATION_PENDING) {
      return applyProviderBridgeState(source, {
        status: STATES.EMAIL_CONFIRMATION_PENDING,
        mode: 'provider_backed',
        provider: 'supabase',
        credentialState: 'unknown',
        credentialProvider: normalizeCredentialProvider(response.credentialProvider),
        pendingEmail: null,
        emailVerified: false,
        emailMasked: response.emailMasked || response.pendingEmailMasked || snapshot.emailMasked || null,
        pendingEmailMasked: response.pendingEmailMasked || response.emailMasked || snapshot.pendingEmailMasked || null,
        profile: null,
        workspace: null,
        onboardingCompleted: false,
        syncReady: false
      });
    }
    if (nextStatus === STATES.SYNC_READY) {
      return applyProviderBridgeState(source, {
        status: STATES.SYNC_READY,
        mode: 'provider_backed',
        provider: 'supabase',
        credentialState: 'complete',
        credentialProvider: normalizeCredentialProvider(response.credentialProvider),
        pendingEmail: null,
        emailVerified: true,
        emailMasked: response.emailMasked || snapshot.emailMasked || null,
        pendingEmailMasked: response.emailMasked || snapshot.pendingEmailMasked || null,
        sessionExpiresAt: response.sessionExpiresAt || snapshot.sessionExpiresAt || null,
        userIdMasked: response.userIdMasked || snapshot.userIdMasked || null,
        profile: response.profile || null,
        workspace: response.workspace || null,
        onboardingCompleted: true,
        syncReady: true
      });
    }
    return applyProviderBridgeState(source, {
      status: STATES.VERIFIED_NO_PROFILE,
      mode: 'provider_backed',
      provider: 'supabase',
      credentialState: normalizeCredentialState(response.credentialState),
      credentialProvider: normalizeCredentialProvider(response.credentialProvider),
      pendingEmail: null,
      emailVerified: true,
      emailMasked: response.emailMasked || snapshot.emailMasked || null,
      pendingEmailMasked: response.emailMasked || snapshot.pendingEmailMasked || null,
      sessionExpiresAt: response.sessionExpiresAt || snapshot.sessionExpiresAt || null,
      userIdMasked: response.userIdMasked || snapshot.userIdMasked || null,
      profile: null,
      workspace: null,
      onboardingCompleted: false,
      syncReady: false
    });
  }

  function scheduleBridgeWrite(snap) {
    if (bridgeWriteTimer) clearTimeout(bridgeWriteTimer);
    bridgeWriteTimer = setTimeout(async () => {
      bridgeWriteTimer = 0;
      const safe = sanitizeForBridge(snap);
      if (safe) await sendBridge('identity:set-snapshot', { snapshot: safe });
    }, 80);
  }

  function cancelBridgeWrite() {
    if (!bridgeWriteTimer) return;
    clearTimeout(bridgeWriteTimer);
    bridgeWriteTimer = 0;
  }

  function sanitizeForBridge(snap) {
    if (!snap || typeof snap !== 'object') return null;
    const clean = {};
    for (const [k, v] of Object.entries(snap)) {
      if (/token|secret|password|refresh/i.test(k)) continue;
      clean[k] = v;
    }
    return clean;
  }

  async function tryHydrateFromBridge() {
    try {
      const res = await sendBridge('identity:get-snapshot');
      if (!res) return;
      if (Object.prototype.hasOwnProperty.call(res, 'snapshot') && (!res.snapshot || typeof res.snapshot !== 'object')) {
        if (isProviderOwnedSnapshot(snapshot)) applySharedSnapshot(null);
        return;
      }
      const bridgeSnap = res.snapshot;
      if (!Object.values(STATES).includes(bridgeSnap.status)) return;
      // Hydrate if bridge has a non-anonymous state (user has an account in another context)
      // OR if bridge is strictly newer (more recent activity elsewhere).
      const bridgeIsRicher = bridgeSnap.status !== STATES.ANONYMOUS_LOCAL;
      const bridgeIsNewer = (bridgeSnap.updatedAt || '') > (snapshot.updatedAt || '');
      const bridgeIsAnonymous = bridgeSnap.status === STATES.ANONYMOUS_LOCAL;
      const localIsProviderOwned = isProviderOwnedSnapshot(snapshot);
      if (!bridgeIsRicher && !bridgeIsNewer && !(bridgeIsAnonymous && localIsProviderOwned)) return;
      snapshot = normalizeSnapshot(bridgeSnap);
      writeJson(STORAGE_KEYS.SNAPSHOT, snapshot);
      recordAudit('bridge-hydrate', snapshot, { bridgeAt: bridgeSnap.updatedAt });
      const event = { source: 'bridge-hydrate', previous: null, current: clone(snapshot) };
      for (const listener of Array.from(listeners)) {
        try { listener(event); } catch (error) { safeWarn('Identity listener failed on bridge hydrate.', error); }
      }
      try { global.dispatchEvent(new CustomEvent(EVENT_CHANGE, { detail: event })); } catch (_) {}
    } catch (error) {
      safeWarn('Identity bridge hydration failed.', error);
    }
  }

  function applySharedSnapshot(incoming) {
    try {
      if (!incoming || typeof incoming !== 'object') {
        // null/falsy push → sign-out reset from another context.
        const previous = snapshot;
        cancelBridgeWrite();
        snapshot = normalizeSnapshot(createInitialSnapshot());
        writeJson(STORAGE_KEYS.SNAPSHOT, snapshot);
        recordAudit('bridge-push-reset', snapshot, {});
        const event = { source: 'bridge-push', previous: clone(previous), current: clone(snapshot) };
        for (const listener of Array.from(listeners)) {
          try { listener(event); } catch (error) { safeWarn('Identity listener failed on bridge-push-reset.', error); }
        }
        try { global.dispatchEvent(new CustomEvent(EVENT_CHANGE, { detail: event })); } catch (_) {}
        return true;
      }

      if (!Object.values(STATES).includes(incoming.status)) return false;
      const stripped = sanitizeForBridge(incoming);
      if (!stripped) return false;
      const incomingNorm = normalizeSnapshot(stripped);

      // Only apply if incoming is richer than anonymous, or is newer, or local is still anonymous.
      const incomingIsRicher = incomingNorm.status !== STATES.ANONYMOUS_LOCAL;
      const incomingIsNewer = (incomingNorm.updatedAt || '') > (snapshot.updatedAt || '');
      const localIsAnonymous = snapshot.status === STATES.ANONYMOUS_LOCAL;
      const incomingIsAnonymous = incomingNorm.status === STATES.ANONYMOUS_LOCAL;
      const localIsProviderOwned = isProviderOwnedSnapshot(snapshot);
      if (!incomingIsRicher && !incomingIsNewer && !localIsAnonymous && !(incomingIsAnonymous && localIsProviderOwned)) return false;

      const previous = snapshot;
      if (incomingIsAnonymous) cancelBridgeWrite();
      snapshot = incomingNorm;
      writeJson(STORAGE_KEYS.SNAPSHOT, snapshot);
      recordAudit('bridge-push', snapshot, { from: previous.status, to: snapshot.status });
      const event = { source: 'bridge-push', previous: clone(previous), current: clone(snapshot) };
      for (const listener of Array.from(listeners)) {
        try { listener(event); } catch (error) { safeWarn('Identity listener failed on bridge-push.', error); }
      }
      try { global.dispatchEvent(new CustomEvent(EVENT_CHANGE, { detail: event })); } catch (_) {}
      return true;
    } catch (error) {
      safeWarn('Identity bridge push apply failed.', error);
      return false;
    }
  }

  function listenForBridgePush() {
    global.addEventListener('message', (ev) => {
      if (ev.source !== global) return;
      const d = ev.data;
      if (!d || d.type !== BRIDGE_MSG_PUSH) return;
      applySharedSnapshot(d.snapshot);
    }, false);
    try {
      const runtime = global.chrome && global.chrome.runtime;
      if (runtime && runtime.onMessage && typeof runtime.onMessage.addListener === 'function') {
        runtime.onMessage.addListener((msg) => {
          if (!msg || msg.type !== BRIDGE_MSG_PUSH) return undefined;
          applySharedSnapshot(msg.snapshot);
          return undefined;
        });
      }
    } catch (_) {}
    try {
      const storage = global.chrome && global.chrome.storage;
      if (storage && storage.onChanged && typeof storage.onChanged.addListener === 'function') {
        storage.onChanged.addListener((changes, areaName) => {
          if (areaName !== 'local' || !changes || !Object.prototype.hasOwnProperty.call(changes, BRIDGE_STORAGE_SNAPSHOT_KEY)) return;
          const change = changes[BRIDGE_STORAGE_SNAPSHOT_KEY];
          if (change && change.newValue && typeof change.newValue === 'object') {
            applySharedSnapshot(change.newValue);
            return;
          }
          applySharedSnapshot(null);
        });
      }
    } catch (_) {}
  }
})(typeof unsafeWindow !== 'undefined' ? unsafeWindow : window);
