import type { IdentityProvider, ProviderCapabilities } from './contracts';

export const MOCK_LOCAL_CAPABILITIES: ProviderCapabilities = {
  emailMagicLink: false,
  emailOtp: true,
  profileRead: true,
  profileWrite: true,
  persistentSession: false,
  cloudSync: false
};

export function assertProviderShape(provider: IdentityProvider): IdentityProvider {
  const required: Array<keyof IdentityProvider> = [
    'kind',
    'mode',
    'capabilities',
    'signInWithEmail',
    'resendVerification',
    'verifyEmailCode',
    'handleVerificationCallback',
    'createInitialWorkspace',
    'refreshSession',
    'signOut',
    'getSnapshot',
    'updateProfile',
    'signInWithPassword',
    'signUpWithPassword',
    'verifySignupCode',
    'requestRecoveryCode',
    'verifyRecoveryCode',
    'setPasswordAfterRecovery',
    'changePassword'
  ];

  for (const key of required) {
    if (!(key in provider)) {
      throw new Error(`Invalid identity provider: missing ${String(key)}`);
    }
  }

  return provider;
}
