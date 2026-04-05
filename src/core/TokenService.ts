/**
 * JWT access token and refresh token lifecycle service.
 *
 * Implements ITokenService to handle:
 * - Access tokens: short-lived JWTs with security_stamp for invalidation
 * - Refresh tokens: long-lived opaque tokens stored as SHA-256 hashes
 *
 * Security model:
 * - Access tokens embed the user's security_stamp. On validation, the stamp
 *   is compared against the DB — if the user changed their password (which
 *   regenerates the stamp), all existing access tokens become invalid.
 * - Refresh tokens are random hex strings. Only their SHA-256 hash is stored.
 *   The raw token is returned once to the caller and never persisted.
 * - Refresh token rotation: the old token is consumed on use and a new one issued.
 */

import jwt, { SignOptions } from 'jsonwebtoken';
import { randomBytes } from 'crypto';
import { ITokenService } from '../interfaces/ITokenService';
import { IUserStore } from '../interfaces/IUserStore';
import { IdentityUser, TokenPayload } from '../types';
import { sha256 } from '../utils/crypto';

/** Supported time units for token expiry strings like '15m', '7d', '24h' */
const TIME_UNITS: Record<string, number> = {
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

/**
 * Parse a duration string (e.g. '15m', '7d', '24h') into a future Date.
 * Throws on invalid format — this is a programming error, not a user error.
 */
function parseExpiry(expiresIn: string): Date {
  const match = expiresIn.match(/^(\d+)([smhd])$/);
  if (!match) {
    throw new Error(`Invalid expiry format: "${expiresIn}". Expected format: <number><s|m|h|d>`);
  }
  const value = parseInt(match[1], 10);
  const unit = match[2];
  const ms = value * TIME_UNITS[unit];
  return new Date(Date.now() + ms);
}

export class TokenService implements ITokenService {
  constructor(
    private readonly jwtSecret: string,
    private readonly userStore: IUserStore,
    private readonly expiresIn: string = '15m',
    private readonly refreshExpiresIn: string = '7d',
  ) {}

  /**
   * Generate a signed JWT access token.
   *
   * The token includes the user's security_stamp so that password changes
   * (which regenerate the stamp) automatically invalidate all existing tokens.
   */
  async generateAccessToken(user: IdentityUser, roles: string[]): Promise<string> {
    const payload = {
      sub: user.id,
      email: user.email,
      roles,
      stamp: user.securityStamp,
    };

    // Pin algorithm to HS256 to prevent algorithm-agility attacks (e.g., alg:none, RSA/HMAC confusion)
    const options: SignOptions = {
      algorithm: 'HS256',
      expiresIn: this.expiresIn as SignOptions['expiresIn'],
    };
    return jwt.sign(payload, this.jwtSecret, options);
  }

  /**
   * Generate a cryptographically random refresh token.
   *
   * The raw token (32 random bytes as hex) is returned to the caller.
   * Only its SHA-256 hash is stored in the database — the raw value
   * is never persisted and cannot be recovered from the hash.
   */
  async generateRefreshToken(userId: string): Promise<string> {
    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = sha256(rawToken);
    const expiresAt = parseExpiry(this.refreshExpiresIn);

    await this.userStore.saveToken({
      userId,
      type: 'refresh_token',
      tokenHash,
      expiresAt,
    });

    return rawToken;
  }

  /**
   * Validate a JWT access token and check that the user's security_stamp
   * hasn't changed since the token was issued.
   *
   * Returns null for any validation failure (expired, malformed, stale stamp,
   * deleted user) — callers should treat null as "not authenticated".
   */
  async validateAccessToken(token: string): Promise<TokenPayload | null> {
    try {
      // Pin algorithms to prevent accepting tokens signed with unexpected algorithms
      const payload = jwt.verify(token, this.jwtSecret, {
        algorithms: ['HS256'],
      }) as TokenPayload;

      // Verify the user still exists and their security stamp hasn't rotated
      const user = await this.userStore.findById(payload.sub);
      if (!user) return null;

      // Stamp mismatch means the user changed their password or was otherwise
      // invalidated — reject the token even though it hasn't expired yet
      if (payload.stamp !== user.securityStamp) return null;

      return payload;
    } catch {
      // jwt.verify throws on expired, malformed, or invalid signature
      return null;
    }
  }

  /**
   * Validate a raw refresh token and return the associated userId.
   *
   * Finds the token by hash, then atomically consumes it (single-use).
   * If two parallel requests race to validate the same token, only one
   * will succeed — the atomic consumeToken (WHERE used_at IS NULL) ensures
   * the second request gets false and returns null.
   *
   * Returns null if the token is invalid, expired, or already consumed.
   */
  async validateRefreshToken(token: string): Promise<string | null> {
    const tokenHash = sha256(token);
    const storedToken = await this.userStore.findTokenByHash(tokenHash);

    if (!storedToken) return null;
    if (storedToken.expiresAt <= new Date()) return null;

    // Atomic consumption prevents race conditions: only one concurrent
    // request can successfully consume the token
    const consumed = await this.userStore.consumeToken(storedToken.id);
    if (!consumed) return null;

    return storedToken.userId;
  }

  /**
   * Revoke a refresh token by marking it as consumed.
   *
   * After revocation, the token cannot be used again — validateRefreshToken
   * will reject it because used_at is set.
   */
  async revokeRefreshToken(token: string): Promise<void> {
    const tokenHash = sha256(token);
    const storedToken = await this.userStore.findTokenByHash(tokenHash);

    if (storedToken) {
      await this.userStore.consumeToken(storedToken.id);
    }
  }
}
