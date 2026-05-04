import type {
  ChangePasswordInput,
  DeviceSession,
  IdentityErrorShape,
  IdentityProvider as IdentityProviderContract,
  IdentityPublicState,
  IdentitySnapshot,
  InitialWorkspaceInput,
  ListDeviceSessionsResult,
  ProfilePatch,
  ProviderCapabilities,
  RegisterDeviceSessionInput,
  SignInEmailInput,
  SignInPasswordInput,
  SignUpPasswordInput,
  VerifyEmailCodeInput,
} from '@h2o/identity-core';
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

import { BOOT_RESTORE_TIMEOUT_MS } from './mobileConfig';
import { MobileSupabaseProvider } from './MobileSupabaseProvider';

export type IdentityBootStatus = 'booting' | 'restoring' | 'ready' | 'timed_out' | 'error';

export interface IdentityContextValue {
  snapshot: IdentitySnapshot;
  status: IdentityPublicState;
  bootStatus: IdentityBootStatus;
  isReady: boolean;
  isSignedIn: boolean;
  error: IdentityErrorShape | null;
  capabilities: ProviderCapabilities;
  signInWithEmail(input: SignInEmailInput): Promise<IdentitySnapshot>;
  verifyEmailCode(input: VerifyEmailCodeInput): Promise<IdentitySnapshot>;
  signUpWithPassword(input: SignUpPasswordInput): Promise<IdentitySnapshot>;
  verifySignupCode(input: VerifyEmailCodeInput): Promise<IdentitySnapshot>;
  signInWithPassword(input: SignInPasswordInput): Promise<IdentitySnapshot>;
  refreshSession(): Promise<IdentitySnapshot>;
  signOut(): Promise<IdentitySnapshot>;
  createInitialWorkspace(input: InitialWorkspaceInput): Promise<IdentitySnapshot>;
  updateProfile(patch: ProfilePatch): Promise<IdentitySnapshot>;
  changePassword(input: ChangePasswordInput): Promise<IdentitySnapshot>;
  requestRecoveryCode(email: string): Promise<IdentitySnapshot>;
  verifyRecoveryCode(input: VerifyEmailCodeInput): Promise<IdentitySnapshot>;
  setPasswordAfterRecovery(password: string): Promise<IdentitySnapshot>;
  renameWorkspace(name: string): Promise<IdentitySnapshot>;
  registerDeviceSession(input: RegisterDeviceSessionInput): Promise<DeviceSession | null>;
  touchDeviceSession(): Promise<DeviceSession | null>;
  listDeviceSessions(): Promise<ListDeviceSessionsResult>;
}

const IdentityContext = createContext<IdentityContextValue | null>(null);

const EXPECTED_BOOT_MISS_CODES = new Set([
  'identity/no-refresh-token',
  'identity/provider-not-configured',
]);

const SIGNED_IN_STATES = new Set<IdentityPublicState>([
  'verified_no_profile',
  'profile_ready',
  'sync_ready',
]);

export function isExpectedBootMiss(snapshot: IdentitySnapshot): boolean {
  return snapshot.status === 'auth_error' && EXPECTED_BOOT_MISS_CODES.has(snapshot.lastError?.code ?? '');
}

function isTerminalBootStatus(status: IdentityBootStatus): boolean {
  return status === 'ready' || status === 'timed_out' || status === 'error';
}

function bootTimeout(): Promise<'timeout'> {
  return new Promise((resolve) => {
    setTimeout(() => resolve('timeout'), BOOT_RESTORE_TIMEOUT_MS);
  });
}

interface IdentityProviderProps {
  children: ReactNode;
}

export function IdentityProvider({ children }: IdentityProviderProps) {
  const providerRef = useRef<MobileSupabaseProvider | null>(null);
  if (!providerRef.current) {
    providerRef.current = new MobileSupabaseProvider();
  }

  const provider = providerRef.current;
  const [snapshot, setSnapshot] = useState<IdentitySnapshot>(() => provider.getSnapshot());
  const [bootStatus, setBootStatus] = useState<IdentityBootStatus>('booting');
  const [bootMissNormalized, setBootMissNormalized] = useState(false);

  const commitProviderSnapshot = useCallback((): IdentitySnapshot => {
    const nextSnapshot = providerRef.current?.getSnapshot() ?? snapshot;
    setSnapshot(nextSnapshot);
    return nextSnapshot;
  }, [snapshot]);

  const runAction = useCallback(
    async (operation: (identityProvider: IdentityProviderContract) => Promise<IdentitySnapshot>) => {
      const identityProvider = providerRef.current;
      if (!identityProvider) return snapshot;

      try {
        await operation(identityProvider);
      } catch {
        // Provider methods own snapshot-level error shaping. Keep this boundary silent.
      }

      setBootMissNormalized(false);
      setBootStatus('ready');
      return commitProviderSnapshot();
    },
    [commitProviderSnapshot, snapshot]
  );

  useEffect(() => {
    let active = true;

    setBootStatus('restoring');

    const refresh = async (): Promise<'refreshed'> => {
      await provider.refreshSession();
      return 'refreshed';
    };

    Promise.race([refresh(), bootTimeout()])
      .then((result) => {
        if (!active) return;

        const nextSnapshot = provider.getSnapshot();
        setSnapshot(nextSnapshot);

        if (result === 'timeout') {
          setBootMissNormalized(false);
          setBootStatus('timed_out');
          return;
        }

        const expectedBootMiss = isExpectedBootMiss(nextSnapshot);
        setBootMissNormalized(expectedBootMiss);
        setBootStatus(
          expectedBootMiss ? 'ready' : nextSnapshot.status === 'auth_error' ? 'error' : 'ready'
        );
      })
      .catch(() => {
        if (!active) return;
        setBootMissNormalized(false);
        setSnapshot(provider.getSnapshot());
        setBootStatus('error');
      });

    return () => {
      active = false;
    };
  }, [provider]);

  const signInWithEmail = useCallback(
    (input: SignInEmailInput) => runAction((identityProvider) => identityProvider.signInWithEmail(input)),
    [runAction]
  );

  const verifyEmailCode = useCallback(
    (input: VerifyEmailCodeInput) => runAction((identityProvider) => identityProvider.verifyEmailCode(input)),
    [runAction]
  );

  const signUpWithPassword = useCallback(
    (input: SignUpPasswordInput) => runAction((identityProvider) => identityProvider.signUpWithPassword(input)),
    [runAction]
  );

  const verifySignupCode = useCallback(
    (input: VerifyEmailCodeInput) => runAction((identityProvider) => identityProvider.verifySignupCode(input)),
    [runAction]
  );

  const signInWithPassword = useCallback(
    (input: SignInPasswordInput) => runAction((identityProvider) => identityProvider.signInWithPassword(input)),
    [runAction]
  );

  const refreshSession = useCallback(
    () => runAction((identityProvider) => identityProvider.refreshSession()),
    [runAction]
  );

  const signOut = useCallback(
    () => runAction((identityProvider) => identityProvider.signOut()),
    [runAction]
  );

  const createInitialWorkspace = useCallback(
    (input: InitialWorkspaceInput) =>
      runAction((identityProvider) => identityProvider.createInitialWorkspace(input)),
    [runAction]
  );

  const updateProfile = useCallback(
    (patch: ProfilePatch) => runAction((identityProvider) => identityProvider.updateProfile(patch)),
    [runAction]
  );

  const changePassword = useCallback(
    (input: ChangePasswordInput) => runAction((identityProvider) => identityProvider.changePassword(input)),
    [runAction]
  );

  const requestRecoveryCode = useCallback(
    (email: string) => runAction((identityProvider) => identityProvider.requestRecoveryCode(email)),
    [runAction]
  );

  const verifyRecoveryCode = useCallback(
    (input: VerifyEmailCodeInput) => runAction((identityProvider) => identityProvider.verifyRecoveryCode(input)),
    [runAction]
  );

  const setPasswordAfterRecovery = useCallback(
    (password: string) =>
      runAction((identityProvider) => identityProvider.setPasswordAfterRecovery(password)),
    [runAction]
  );

  const renameWorkspace = useCallback(
    (name: string) => runAction((identityProvider) => identityProvider.renameWorkspace(name)),
    [runAction]
  );

  // Device-session passthroughs. These return domain types rather than
  // IdentitySnapshot, so they bypass the runAction snapshot-commit wrapper.
  // All three are best-effort on the provider side (resolve to null / empty).
  const registerDeviceSession = useCallback(
    async (input: RegisterDeviceSessionInput): Promise<DeviceSession | null> => {
      const identityProvider = providerRef.current;
      if (!identityProvider) return null;
      return identityProvider.registerDeviceSession(input);
    },
    []
  );

  const touchDeviceSession = useCallback(async (): Promise<DeviceSession | null> => {
    const identityProvider = providerRef.current;
    if (!identityProvider) return null;
    return identityProvider.touchDeviceSession();
  }, []);

  const listDeviceSessions = useCallback(async (): Promise<ListDeviceSessionsResult> => {
    const identityProvider = providerRef.current;
    if (!identityProvider) return { sessions: [], currentSessionId: null };
    return identityProvider.listDeviceSessions();
  }, []);

  // AppState foreground touch — when the app returns to active, ping the
  // server so last_seen_at on this device's row stays current. The provider
  // rate-limits (10 min) so this is cheap on rapid backgrounding cycles.
  useEffect(() => {
    const handleChange = (next: AppStateStatus) => {
      if (next !== 'active') return;
      void touchDeviceSession();
    };
    const sub = AppState.addEventListener('change', handleChange);
    return () => {
      sub.remove();
    };
  }, [touchDeviceSession]);

  const normalizedBootMiss = bootMissNormalized && isExpectedBootMiss(snapshot);
  const value = useMemo<IdentityContextValue>(() => {
    const isReady = isTerminalBootStatus(bootStatus);
    const isSignedIn = !normalizedBootMiss && SIGNED_IN_STATES.has(snapshot.status);
    const error = normalizedBootMiss ? null : (snapshot.lastError ?? null);

    return {
      snapshot,
      status: snapshot.status,
      bootStatus,
      isReady,
      isSignedIn,
      error,
      capabilities: provider.capabilities,
      signInWithEmail,
      verifyEmailCode,
      signUpWithPassword,
      verifySignupCode,
      signInWithPassword,
      refreshSession,
      signOut,
      createInitialWorkspace,
      updateProfile,
      changePassword,
      requestRecoveryCode,
      verifyRecoveryCode,
      setPasswordAfterRecovery,
      renameWorkspace,
      registerDeviceSession,
      touchDeviceSession,
      listDeviceSessions,
    };
  }, [
    bootStatus,
    changePassword,
    createInitialWorkspace,
    listDeviceSessions,
    normalizedBootMiss,
    provider.capabilities,
    refreshSession,
    registerDeviceSession,
    renameWorkspace,
    requestRecoveryCode,
    setPasswordAfterRecovery,
    signInWithEmail,
    signInWithPassword,
    signOut,
    signUpWithPassword,
    snapshot,
    touchDeviceSession,
    updateProfile,
    verifyEmailCode,
    verifyRecoveryCode,
    verifySignupCode,
  ]);

  return <IdentityContext.Provider value={value}>{children}</IdentityContext.Provider>;
}

export function useOptionalIdentity(): IdentityContextValue | null {
  return useContext(IdentityContext);
}

export function useIdentity(): IdentityContextValue {
  const value = useOptionalIdentity();
  if (!value) {
    throw new Error('useIdentity must be used within IdentityProvider.');
  }
  return value;
}
