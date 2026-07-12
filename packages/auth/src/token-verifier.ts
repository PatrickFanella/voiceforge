import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';

export interface AuthenticatedIdentity {
  subject: string;
  email?: string;
  emailVerified: boolean;
}

export interface TokenVerifier {
  verify(token: string): Promise<AuthenticatedIdentity>;
}

export interface Auth0Config {
  issuer: string;
  audience: string;
}

export class AuthenticationError extends Error {}

export function createAuth0TokenVerifier(config: Auth0Config, keyResolver?: JWTVerifyGetKey): TokenVerifier {
  const issuer = config.issuer.endsWith('/') ? config.issuer : `${config.issuer}/`;
  const keys = keyResolver ?? createRemoteJWKSet(new URL('.well-known/jwks.json', issuer));

  return {
    async verify(token) {
      try {
        const { payload } = await jwtVerify(token, keys, {
          issuer,
          audience: config.audience,
          algorithms: ['RS256'],
        });
        if (!payload.sub) throw new AuthenticationError('Token has no subject.');
        return {
          subject: payload.sub,
          ...(typeof payload.email === 'string' ? { email: payload.email } : {}),
          emailVerified: payload.email_verified === true,
        };
      } catch (error) {
        if (error instanceof AuthenticationError) throw error;
        throw new AuthenticationError('Access token is invalid or expired.');
      }
    },
  };
}
