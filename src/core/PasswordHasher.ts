/**
 * Default password hasher using bcrypt.
 *
 * Implements IPasswordHasher with industry-standard bcrypt hashing.
 * Bcrypt auto-generates a unique salt per hash, so two identical
 * passwords produce different hashes — protecting against rainbow tables.
 *
 * Consumers can swap this for argon2, scrypt, etc. by implementing
 * IPasswordHasher and passing it via AuthforgeConfig.passwordHasher.
 */

import bcrypt from 'bcrypt';
import { IPasswordHasher } from '../interfaces/IPasswordHasher';

export class PasswordHasher implements IPasswordHasher {
  /** Default 12 rounds balances security vs. performance (~250ms on modern hardware) */
  private readonly rounds: number;

  constructor(rounds: number = 12) {
    this.rounds = rounds;
  }

  /**
   * Hash a plaintext password with bcrypt.
   * The returned string includes the algorithm, cost factor, salt, and hash —
   * everything needed for future verification.
   */
  async hash(password: string): Promise<string> {
    return bcrypt.hash(password, this.rounds);
  }

  /**
   * Verify a plaintext password against a stored bcrypt hash.
   * Uses constant-time comparison internally to prevent timing attacks.
   */
  async verify(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }
}
