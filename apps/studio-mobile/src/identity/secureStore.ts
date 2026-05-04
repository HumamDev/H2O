const REFRESH_TOKEN_KEY = 'h2o.identity.provider.refresh.v1';
const DEVICE_TOKEN_KEY = 'h2o.identity.device.token.v1';

interface SecureStoreModule {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
}

let secureStorePromise: Promise<SecureStoreModule | null> | null = null;

async function getSecureStore(): Promise<SecureStoreModule | null> {
  if (!secureStorePromise) {
    secureStorePromise = import('expo-secure-store')
      .then((mod) => ({
        getItemAsync: mod.getItemAsync,
        setItemAsync: mod.setItemAsync,
        deleteItemAsync: mod.deleteItemAsync,
      }))
      .catch(() => null);
  }
  return secureStorePromise;
}

export async function readRefreshToken(): Promise<string | null> {
  const secureStore = await getSecureStore();
  if (!secureStore) return null;
  try {
    return await secureStore.getItemAsync(REFRESH_TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function writeRefreshToken(token: string): Promise<void> {
  const secureStore = await getSecureStore();
  if (!secureStore) return;
  try {
    await secureStore.setItemAsync(REFRESH_TOKEN_KEY, token);
  } catch {
    // SecureStore unavailable or locked; safe no-op for Expo Go fallback.
  }
}

export async function deleteRefreshToken(): Promise<void> {
  const secureStore = await getSecureStore();
  if (!secureStore) return;
  try {
    await secureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
  } catch {
    // Key already absent; safe to ignore.
  }
}

export async function readDeviceToken(): Promise<string | null> {
  const secureStore = await getSecureStore();
  if (!secureStore) return null;
  try {
    return await secureStore.getItemAsync(DEVICE_TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function writeDeviceToken(value: string): Promise<void> {
  const secureStore = await getSecureStore();
  if (!secureStore) return;
  try {
    await secureStore.setItemAsync(DEVICE_TOKEN_KEY, value);
  } catch {
    // SecureStore unavailable or locked; safe no-op for Expo Go fallback.
  }
}

export async function deleteDeviceToken(): Promise<void> {
  const secureStore = await getSecureStore();
  if (!secureStore) return;
  try {
    await secureStore.deleteItemAsync(DEVICE_TOKEN_KEY);
  } catch {
    // Key already absent; safe to ignore.
  }
}
