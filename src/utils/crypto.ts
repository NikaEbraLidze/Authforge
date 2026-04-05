/**
 * Cryptographic utility functions.
 *
 * Provides SHA-256 hashing used across the library for token storage.
 * Raw tokens are never stored — only their SHA-256 hashes go to the database.
 */

import { createHash } from 'crypto';

/**
 * Compute a SHA-256 hex digest of the input string.
 *
 * Used for hashing refresh tokens, email verification tokens, and
 * password reset tokens before storing them in the database.
 * The raw token is returned to the caller once and never persisted.
 */
export function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}
