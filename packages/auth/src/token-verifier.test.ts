import { generateKeyPair, SignJWT } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';
import { AuthenticationError, createAuth0TokenVerifier } from './token-verifier.js';

const issuer = 'https://voiceforge.test/';
const audience = 'https://api.voiceforge.test';
let privateKey: Awaited<ReturnType<typeof generateKeyPair>>['privateKey'];
let publicKey: Awaited<ReturnType<typeof generateKeyPair>>['publicKey'];
let resolver: Parameters<typeof createAuth0TokenVerifier>[1];

beforeAll(async () => {
  const pair = await generateKeyPair('RS256');
  privateKey = pair.privateKey;
  publicKey = pair.publicKey;
  resolver = async () => publicKey;
});

async function token(overrides: { issuer?: string; audience?: string; expiresIn?: string } = {}) {
  return new SignJWT({ email: 'worker@example.com', email_verified: true })
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
    .setSubject('auth0|worker')
    .setIssuer(overrides.issuer ?? issuer)
    .setAudience(overrides.audience ?? audience)
    .setIssuedAt()
    .setExpirationTime(overrides.expiresIn ?? '5m')
    .sign(privateKey);
}

describe('Auth0 token verifier', () => {
  it('validates signature, issuer, audience, expiry, and identity claims', async () => {
    const verifier = createAuth0TokenVerifier({ issuer, audience }, resolver);
    await expect(verifier.verify(await token())).resolves.toEqual({
      subject: 'auth0|worker', email: 'worker@example.com', emailVerified: true,
    });
  });

  it('rejects the wrong audience and expired tokens without leaking details', async () => {
    const verifier = createAuth0TokenVerifier({ issuer, audience }, resolver);
    await expect(verifier.verify(await token({ audience: 'wrong' }))).rejects.toBeInstanceOf(AuthenticationError);
    await expect(verifier.verify(await token({ expiresIn: '-1s' }))).rejects.toThrow('invalid or expired');
  });
});
