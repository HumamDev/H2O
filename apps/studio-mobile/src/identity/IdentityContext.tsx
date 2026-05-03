import type {
  ChangePasswordInput,
  IdentityErrorShape,
  IdentityProvider as IdentityProviderContract,
  IdentityPublicState,
  IdentitySnapshot,
  InitialWorkspaceInput,
  ProfilePatch,
  ProviderCapabilities,
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
    };
  }, [
    bootStatus,
    changePassword,
    createInitialWorkspace,
    normalizedBootMiss,
    provider.capabilities,
    refreshSession,
    requestRecoveryCode,
    setPasswordAfterRecovery,
    signInWithEmail,
    signInWithPassword,
    signOut,
    signUpWithPassword,
    snapshot,
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
