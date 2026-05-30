/**
 * PIN Service for Screen Lock
 *
 * Provides secure PIN hashing and verification using Argon2id.
 * Argon2id is the OWASP recommended algorithm for password/PIN hashing in 2026,
 * providing resistance against GPU, ASIC, and side-channel attacks.
 *
 * Security features:
 * - Argon2id (hybrid mode combining Argon2i and Argon2d)
 * - Memory-hard to prevent GPU attacks
 * - Configurable parameters for security/performance balance
 * - Rate limiting should be applied at API level
 */

import { hash, verify, Options } from '@node-rs/argon2';
import { createChildLogger } from '@/lib/logger';

const log = createChildLogger({ module: 'pin' });

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Argon2id parameters for 2026.
 * These are conservative settings balancing security and UX (target ~200-300ms).
 *
 * OWASP 2026 recommendations:
 * - Memory: At least 19 MiB (19456 KiB)
 * - Iterations: At least 2
 * - Parallelism: 1 (single-threaded for most web apps)
 *
 * We use slightly higher values for better security:
 * - 32 MiB memory (32768 KiB)
 * - 3 iterations
 * - 1 parallel thread
 */
const ARGON2_OPTIONS: Options = {
  memoryCost: 32768, // 32 MiB in KiB
  timeCost: 3, // 3 iterations
  parallelism: 1, // Single thread
  outputLen: 32, // 256-bit hash output
};

// ============================================================================
// PIN VALIDATION
// ============================================================================

/**
 * Validate PIN format before hashing.
 * PINs must be 4-8 digits only.
 *
 * @param pin - PIN to validate
 * @returns Validation result with error message if invalid
 */
export function validatePinFormat(pin: string): { valid: boolean; error?: string } {
  // Check length
  if (pin.length < 4 || pin.length > 8) {
    return { valid: false, error: 'PIN must be 4-8 digits' };
  }

  // Check for digits only
  if (!/^\d+$/.test(pin)) {
    return { valid: false, error: 'PIN must contain only digits' };
  }

  // Check for common weak PINs
  const weakPins = [
    '0000',
    '1111',
    '2222',
    '3333',
    '4444',
    '5555',
    '6666',
    '7777',
    '8888',
    '9999',
    '1234',
    '4321',
    '0123',
    '1010',
    '2580', // Middle column
  ];

  if (weakPins.includes(pin)) {
    return { valid: false, error: 'PIN is too common. Please choose a stronger PIN.' };
  }

  // Check for sequential patterns
  if (isSequential(pin)) {
    return { valid: false, error: 'PIN cannot be sequential. Please choose a stronger PIN.' };
  }

  return { valid: true };
}

/**
 * Check if a PIN is sequential (ascending or descending).
 */
function isSequential(pin: string): boolean {
  let ascending = true;
  let descending = true;

  for (let i = 1; i < pin.length; i++) {
    const curr = parseInt(pin[i], 10);
    const prev = parseInt(pin[i - 1], 10);

    if (curr !== prev + 1) ascending = false;
    if (curr !== prev - 1) descending = false;
  }

  return ascending || descending;
}

// ============================================================================
// HASHING & VERIFICATION
// ============================================================================

/**
 * Hash a PIN using Argon2id.
 *
 * @param pin - The PIN to hash (4-8 digits)
 * @returns The Argon2id hash string (ready for storage)
 * @throws Error if PIN format is invalid
 */
export async function hashPin(pin: string): Promise<string> {
  // Validate format first
  const validation = validatePinFormat(pin);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const startTime = Date.now();

  const hashedPin = await hash(pin, ARGON2_OPTIONS);

  const duration = Date.now() - startTime;
  log.debug({ durationMs: duration }, 'PIN hashed');

  return hashedPin;
}

/**
 * Verify a PIN against a stored hash.
 *
 * @param pin - The PIN to verify
 * @param storedHash - The stored Argon2id hash
 * @returns True if the PIN matches, false otherwise
 */
export async function verifyPin(pin: string, storedHash: string): Promise<boolean> {
  // Quick format check (avoid expensive hash on obviously wrong input)
  if (!/^\d{4,8}$/.test(pin)) {
    return false;
  }

  const startTime = Date.now();

  const isValid = await verify(storedHash, pin);

  const duration = Date.now() - startTime;
  log.debug({ durationMs: duration, isValid }, 'PIN verified');

  return isValid;
}

// ============================================================================
// RATE LIMITING HELPERS
// ============================================================================

// In-memory rate limiter for PIN attempts (per user)
// In production with multiple servers, use Redis
const attemptStore = new Map<string, { attempts: number; lockedUntil: number }>();

// Rate limit configuration
const MAX_ATTEMPTS = 5; // Max failed attempts before lockout
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes
const ATTEMPT_WINDOW_MS = 5 * 60 * 1000; // 5 minute window

/**
 * Check if a user is currently locked out.
 *
 * @param userId - User ID to check
 * @returns True if locked out, with seconds remaining
 */
export function checkLockout(userId: string): { locked: boolean; remainingSeconds?: number } {
  const record = attemptStore.get(userId);

  if (!record) {
    return { locked: false };
  }

  if (record.lockedUntil > Date.now()) {
    const remainingSeconds = Math.ceil((record.lockedUntil - Date.now()) / 1000);
    return { locked: true, remainingSeconds };
  }

  // Lockout expired, reset
  attemptStore.delete(userId);
  return { locked: false };
}

/**
 * Record a failed PIN attempt.
 *
 * @param userId - User ID
 * @returns Current attempt count and whether user is now locked out
 */
export function recordFailedAttempt(userId: string): { attempts: number; lockedOut: boolean } {
  const now = Date.now();
  let record = attemptStore.get(userId);

  if (!record || now - record.lockedUntil > ATTEMPT_WINDOW_MS) {
    // Start fresh window
    record = { attempts: 1, lockedUntil: 0 };
  } else {
    record.attempts++;
  }

  // Check if we should lock out
  if (record.attempts >= MAX_ATTEMPTS) {
    record.lockedUntil = now + LOCKOUT_DURATION_MS;
    log.warn({ userId, attempts: record.attempts }, 'User locked out after too many PIN attempts');
  }

  attemptStore.set(userId, record);

  return {
    attempts: record.attempts,
    lockedOut: record.lockedUntil > now,
  };
}

/**
 * Reset failed attempts after successful authentication.
 *
 * @param userId - User ID
 */
export function resetAttempts(userId: string): void {
  attemptStore.delete(userId);
}
