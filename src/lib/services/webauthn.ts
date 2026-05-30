/**
 * WebAuthn/Passkey Service for Screen Lock
 *
 * Provides registration and authentication flows for biometric/passkey authentication.
 * Uses @simplewebauthn/server for server-side operations.
 *
 * Key concepts:
 * - RP (Relying Party) = This application
 * - Credential = A passkey stored on user's device
 * - Challenge = Random bytes used to prevent replay attacks
 */

import {
  generateRegistrationOptions,
  generateAuthenticationOptions,
  verifyRegistrationResponse,
  verifyAuthenticationResponse,
  type VerifiedRegistrationResponse,
  type VerifiedAuthenticationResponse,
} from '@simplewebauthn/server';
import type {
  AuthenticatorTransportFuture,
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/types';
import { createChildLogger } from '@/lib/logger';

const log = createChildLogger({ module: 'webauthn' });

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Get WebAuthn configuration from environment variables.
 * These values identify your application to the authenticator.
 *
 * For production, set:
 *   WEBAUTHN_RP_ID=yourdomain.com
 *   WEBAUTHN_ORIGIN=https://yourdomain.com (can be comma-separated for multiple origins)
 */
function getConfig() {
  const rpName = process.env.WEBAUTHN_RP_NAME || 'Average Joe Trades';
  const rpId = process.env.WEBAUTHN_RP_ID || 'localhost';
  // Support multiple origins (comma-separated in env var)
  const originEnv = process.env.WEBAUTHN_ORIGIN || 'http://localhost:3000';
  const origins = originEnv.split(',').map(o => o.trim());

  return { rpName, rpId, origins };
}

// ============================================================================
// CHALLENGE MANAGEMENT
// ============================================================================

// In-memory challenge store (per-user, short-lived)
// In production with multiple servers, use Redis or database storage
const challengeStore = new Map<string, { challenge: string; expiresAt: number }>();

// Challenge expiration time (5 minutes)
const CHALLENGE_TTL_MS = 5 * 60 * 1000;

/**
 * Store a challenge for a user. Automatically expires after 5 minutes.
 */
export function storeChallenge(userId: string, challenge: string): void {
  challengeStore.set(userId, {
    challenge,
    expiresAt: Date.now() + CHALLENGE_TTL_MS,
  });

  // Schedule cleanup
  setTimeout(() => {
    const stored = challengeStore.get(userId);
    if (stored && stored.expiresAt <= Date.now()) {
      challengeStore.delete(userId);
    }
  }, CHALLENGE_TTL_MS + 1000);
}

/**
 * Retrieve and consume a challenge for a user.
 * Returns null if no valid challenge exists.
 */
export function consumeChallenge(userId: string): string | null {
  const stored = challengeStore.get(userId);

  if (!stored) {
    return null;
  }

  // Check expiration
  if (stored.expiresAt <= Date.now()) {
    challengeStore.delete(userId);
    return null;
  }

  // Consume the challenge (one-time use)
  challengeStore.delete(userId);
  return stored.challenge;
}

// ============================================================================
// REGISTRATION FLOW
// ============================================================================

/**
 * Credential data from database for exclusion during registration.
 */
export interface ExistingCredential {
  credentialId: string;
  transports?: string | null;
}

/**
 * Generate registration options for a new passkey.
 *
 * @param userId - Internal user ID
 * @param userEmail - User's email (used as display name)
 * @param existingCredentials - Previously registered credentials to exclude
 * @returns Options to pass to browser's startRegistration()
 */
export async function generatePasskeyRegistrationOptions(
  userId: string,
  userEmail: string,
  existingCredentials: ExistingCredential[] = []
): Promise<PublicKeyCredentialCreationOptionsJSON> {
  const { rpName, rpId } = getConfig();

  // Convert existing credentials to exclude format
  const excludeCredentials = existingCredentials.map((cred) => ({
    id: cred.credentialId,
    transports: cred.transports
      ? (JSON.parse(cred.transports) as AuthenticatorTransportFuture[])
      : undefined,
  }));

  const options = await generateRegistrationOptions({
    rpName,
    rpID: rpId,
    userName: userEmail,
    userDisplayName: userEmail.split('@')[0], // Use email prefix as display name
    // Allow both platform (fingerprint, Face ID) and roaming (NordPass, 1Password) authenticators
    authenticatorSelection: {
      residentKey: 'preferred', // Enable discoverable credentials where possible
      userVerification: 'preferred', // Request biometric verification
    },
    // Don't request attestation (simplifies verification)
    attestationType: 'none',
    // Exclude already registered credentials
    excludeCredentials,
    // Use reasonable timeout (2 minutes)
    timeout: 120000,
  });

  // Store challenge for later verification
  storeChallenge(userId, options.challenge);

  log.debug({ userId }, 'Generated passkey registration options');

  return options;
}

/**
 * Result of passkey registration verification.
 */
export interface PasskeyRegistrationResult {
  verified: boolean;
  credentialId: string;
  publicKey: string;
  counter: number;
  transports: string;
  credentialType: string;
}

/**
 * Error result for passkey registration.
 */
export interface PasskeyRegistrationError {
  error: true;
  reason: 'no_challenge' | 'verification_failed' | 'not_verified';
  message: string;
  details?: string;
}

/**
 * Verify a passkey registration response from the browser.
 *
 * @param userId - Internal user ID (for challenge lookup)
 * @param response - Registration response from browser
 * @returns Verification result with credential data, or error details
 */
export async function verifyPasskeyRegistration(
  userId: string,
  response: RegistrationResponseJSON
): Promise<PasskeyRegistrationResult | PasskeyRegistrationError> {
  const { rpId, origins } = getConfig();

  // Retrieve the stored challenge
  const expectedChallenge = consumeChallenge(userId);
  if (!expectedChallenge) {
    log.warn({ userId }, 'No valid challenge found for registration - may have expired or already been used');
    return {
      error: true,
      reason: 'no_challenge',
      message: 'Registration session expired. Please try again.',
    };
  }

  let verification: VerifiedRegistrationResponse;
  try {
    verification = await verifyRegistrationResponse({
      response,
      expectedChallenge,
      expectedOrigin: origins,
      expectedRPID: rpId,
      // Don't require user verification - allow password managers that don't support it
      requireUserVerification: false,
    });
  } catch (error) {
    // Extract more details for debugging
    const errorMsg = error instanceof Error ? error.message : String(error);
    log.error(
      { error: errorMsg, userId, rpId, origins, clientDataOrigin: response.response?.clientDataJSON ? 'present' : 'missing' },
      'Passkey registration verification failed'
    );
    return {
      error: true,
      reason: 'verification_failed',
      message: 'Passkey verification failed. The authenticator response was invalid.',
      details: errorMsg,
    };
  }

  const { verified, registrationInfo } = verification;

  if (!verified || !registrationInfo) {
    log.warn({ userId, verified }, 'Passkey registration not verified');
    return {
      error: true,
      reason: 'not_verified',
      message: 'Passkey could not be verified by the server.',
    };
  }

  const { credential, credentialType } = registrationInfo;

  // In newer versions of SimpleWebAuthn, id is already base64url string
  // publicKey is still Uint8Array
  const credentialId = typeof credential.id === 'string'
    ? credential.id
    : bufferToBase64URL(credential.id);
  const publicKey = credential.publicKey instanceof Uint8Array
    ? bufferToBase64URL(credential.publicKey)
    : credential.publicKey;

  // Get transports from the response
  const transports = JSON.stringify(response.response.transports || []);

  log.info({ userId, credentialId: credentialId.substring(0, 20) + '...' }, 'Passkey registered');

  return {
    verified: true,
    credentialId,
    publicKey,
    counter: credential.counter,
    transports,
    credentialType,
  };
}

// ============================================================================
// AUTHENTICATION FLOW
// ============================================================================

/**
 * Credential data from database for authentication.
 */
export interface StoredCredential {
  credentialId: string;
  publicKey: string;
  counter: number;
  transports?: string | null;
}

/**
 * Generate authentication options for passkey verification.
 *
 * @param userId - Internal user ID
 * @param credentials - User's registered credentials
 * @returns Options to pass to browser's startAuthentication()
 */
export async function generatePasskeyAuthOptions(
  userId: string,
  credentials: StoredCredential[]
): Promise<PublicKeyCredentialRequestOptionsJSON> {
  const { rpId } = getConfig();

  // Convert credentials to allowCredentials format
  const allowCredentials = credentials.map((cred) => ({
    id: cred.credentialId,
    transports: cred.transports
      ? (JSON.parse(cred.transports) as AuthenticatorTransportFuture[])
      : undefined,
  }));

  const options = await generateAuthenticationOptions({
    rpID: rpId,
    allowCredentials,
    userVerification: 'preferred',
    timeout: 60000, // 1 minute for unlock
  });

  // Store challenge for later verification
  storeChallenge(userId, options.challenge);

  log.debug({ userId, credentialCount: credentials.length }, 'Generated passkey auth options');

  return options;
}

/**
 * Result of passkey authentication verification.
 */
export interface PasskeyAuthResult {
  verified: boolean;
  credentialId: string;
  newCounter: number;
}

/**
 * Verify a passkey authentication response from the browser.
 *
 * @param userId - Internal user ID (for challenge lookup)
 * @param response - Authentication response from browser
 * @param credential - The stored credential that should match
 * @returns Verification result with updated counter
 */
export async function verifyPasskeyAuth(
  userId: string,
  response: AuthenticationResponseJSON,
  credential: StoredCredential
): Promise<PasskeyAuthResult | null> {
  const { rpId, origins } = getConfig();

  // Retrieve the stored challenge
  const expectedChallenge = consumeChallenge(userId);
  if (!expectedChallenge) {
    log.warn({ userId }, 'No valid challenge found for authentication - may have expired or already been used');
    return null;
  }

  let verification: VerifiedAuthenticationResponse;
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: origins,
      expectedRPID: rpId,
      credential: {
        id: credential.credentialId,
        publicKey: base64URLToBuffer(credential.publicKey),
        counter: credential.counter,
        transports: credential.transports
          ? (JSON.parse(credential.transports) as AuthenticatorTransportFuture[])
          : undefined,
      },
      // Don't require user verification - allow password managers that don't support it
      requireUserVerification: false,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    log.error({ error: errorMsg, userId, rpId, origins }, 'Passkey authentication verification failed');
    return null;
  }

  const { verified, authenticationInfo } = verification;

  if (!verified) {
    log.warn({ userId }, 'Passkey authentication not verified');
    return null;
  }

  log.info({ userId, credentialId: credential.credentialId.substring(0, 20) + '...' }, 'Passkey authenticated');

  return {
    verified: true,
    credentialId: credential.credentialId,
    newCounter: authenticationInfo.newCounter,
  };
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Convert a Uint8Array to base64url string.
 */
function bufferToBase64URL(buffer: Uint8Array): string {
  const base64 = Buffer.from(buffer).toString('base64');
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/**
 * Convert a base64url string to Uint8Array.
 */
function base64URLToBuffer(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const buffer = Buffer.from(base64 + padding, 'base64');
  // Create a proper ArrayBuffer-backed Uint8Array
  const arrayBuffer = new ArrayBuffer(buffer.length);
  const uint8 = new Uint8Array(arrayBuffer);
  buffer.copy(uint8);
  return uint8;
}
