import createContextHook from '@nkzw/create-context-hook';
import * as AuthSession from 'expo-auth-session';
import * as SecureStore from 'expo-secure-store';
import { useCallback, useEffect, useMemo, useState } from 'react';

const domain = process.env.EXPO_PUBLIC_AUTH0_DOMAIN?.replace(/^https?:\/\//, '').replace(/\/$/, '');
const clientId = process.env.EXPO_PUBLIC_AUTH0_CLIENT_ID;
const audience = process.env.EXPO_PUBLIC_AUTH0_AUDIENCE;
const redirectUri = AuthSession.makeRedirectUri({ scheme: 'rork-app', path: 'auth/callback' });
const discovery = domain ? AuthSession.useAutoDiscovery(`https://${domain}`) : null;
const storageKey = 'voiceforge.auth.tokens';
type Tokens = { accessToken: string; refreshToken?: string; expiresAt: number };

export const [BackendAuthProvider, useBackendAuth] = createContextHook(() => {
  const [tokens, setTokens] = useState<Tokens | null>(null);
  const [loading, setLoading] = useState(true);
  const configured = Boolean(domain && clientId && audience);
  const [request, response, promptAsync] = AuthSession.useAuthRequest({
    clientId: clientId ?? 'unconfigured', redirectUri, responseType: AuthSession.ResponseType.Code,
    scopes: ['openid', 'profile', 'email', 'offline_access'], usePKCE: true,
    extraParams: audience ? { audience } : {},
  }, discovery);

  const persist = useCallback(async (next: Tokens | null) => {
    setTokens(next);
    if (next) await SecureStore.setItemAsync(storageKey, JSON.stringify(next));
    else await SecureStore.deleteItemAsync(storageKey);
  }, []);

  useEffect(() => { void SecureStore.getItemAsync(storageKey).then((value) => {
    if (value) setTokens(JSON.parse(value) as Tokens);
  }).finally(() => setLoading(false)); }, []);

  useEffect(() => {
    if (response?.type !== 'success' || !discovery || !clientId || !request?.codeVerifier) return;
    void AuthSession.exchangeCodeAsync({ clientId, code: response.params.code, redirectUri, extraParams: { code_verifier: request.codeVerifier } }, discovery)
      .then((result) => persist({ accessToken: result.accessToken, ...(result.refreshToken ? { refreshToken: result.refreshToken } : {}), expiresAt: Date.now() + (result.expiresIn ?? 3600) * 1000 }));
  }, [response, discovery, request?.codeVerifier, persist]);

  const accessToken = useCallback(async () => {
    if (!tokens) return null;
    if (tokens.expiresAt > Date.now() + 30_000) return tokens.accessToken;
    if (!tokens.refreshToken || !discovery || !clientId) { await persist(null); return null; }
    const result = await AuthSession.refreshAsync({ clientId, refreshToken: tokens.refreshToken }, discovery);
    const next: Tokens = { accessToken: result.accessToken, refreshToken: result.refreshToken ?? tokens.refreshToken, expiresAt: Date.now() + (result.expiresIn ?? 3600) * 1000 };
    await persist(next);
    return next.accessToken;
  }, [tokens, discovery, persist]);

  return useMemo(() => ({
    configured, loading, signedIn: Boolean(tokens), accessToken,
    signIn: async () => { if (configured && request) await promptAsync(); },
    signOut: async () => persist(null),
  }), [configured, loading, tokens, accessToken, request, promptAsync, persist]);
});
