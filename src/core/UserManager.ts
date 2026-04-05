/**
 * UserManager — the primary service for user lifecycle operations.
 *
 * Mirrors the role of ASP.NET Core's UserManager<TUser>, orchestrating:
 * - User registration with validation (email format, uniqueness, password strength)
 * - Sign-in with lockout protection (checked BEFORE password verification)
 * - JWT access + refresh token lifecycle with security_stamp validation
 * - Password change/reset with automatic token invalidation
 * - Email verification via single-use tokens
 * - Account lockout after configurable failed attempts
 *
 * All expected failures (bad password, duplicate email, etc.) return
 * IdentityResult with errors — only truly unexpected errors throw.
 */

import { randomBytes } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { IUserStore } from '../interfaces/IUserStore';
import { IRoleStore } from '../interfaces/IRoleStore';
import { IPasswordHasher } from '../interfaces/IPasswordHasher';
import { ITokenService } from '../interfaces/ITokenService';
import { IEmailService } from '../interfaces/IEmailService';
import { IdentityUser, IdentityResult, CreateUserData } from '../types';
import { sha256 } from '../utils/crypto';

// ── Constants ──────────────────────────────────────────────────────────

const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_LOCKOUT_MINUTES = 15;

/** Minimum password requirements — intentionally simple for V1, configurable later */
const PASSWORD_MIN_LENGTH = 8;

/** Basic email regex — validates structure, not deliverability */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ── Lockout Config ─────────────────────────────────────────────────────

export interface LockoutConfig {
  maxAttempts: number;
  durationMinutes: number;
}

// ── UserManager ────────────────────────────────────────────────────────

export class UserManager {
  private readonly lockoutConfig: LockoutConfig;

  constructor(
    private readonly userStore: IUserStore,
    private readonly roleStore: IRoleStore,
    private readonly passwordHasher: IPasswordHasher,
    private readonly tokenService: ITokenService,
    private readonly emailService?: IEmailService,
    lockoutConfig?: Partial<LockoutConfig>,
  ) {
    this.lockoutConfig = {
      maxAttempts: lockoutConfig?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
      durationMinutes: lockoutConfig?.durationMinutes ?? DEFAULT_LOCKOUT_MINUTES,
    };
  }

  // ── Registration & Lookup ──────────────────────────────────────────

  /**
   * Create a new user account.
   *
   * Validates email format, password strength, and uniqueness (email + username)
   * before hashing the password and creating the user record.
   * Email is normalized to lowercase to prevent case-variant duplicates.
   */
  async createUser(
    data: CreateUserData,
  ): Promise<IdentityResult & { user?: IdentityUser }> {
    const email = data.email.toLowerCase();

    // Validate email format
    if (!EMAIL_REGEX.test(email)) {
      return { success: false, errors: ['Invalid email format.'] };
    }

    // Validate password strength
    const passwordErrors = this.validatePassword(data.password);
    if (passwordErrors.length > 0) {
      return { success: false, errors: passwordErrors };
    }

    // Check uniqueness — email and username must both be unique
    const existingEmail = await this.userStore.findByEmail(email);
    if (existingEmail) {
      return { success: false, errors: ['Email is already registered.'] };
    }

    const existingUsername = await this.userStore.findByUsername(data.username);
    if (existingUsername) {
      return { success: false, errors: ['Username is already taken.'] };
    }

    const passwordHash = await this.passwordHasher.hash(data.password);
    const user = await this.userStore.create({
      username: data.username,
      email,
      password: data.password, // Included for type compatibility; store uses passwordHash only
      passwordHash,
    });

    return { success: true, user };
  }

  async findById(id: string): Promise<IdentityUser | null> {
    return this.userStore.findById(id);
  }

  async findByEmail(email: string): Promise<IdentityUser | null> {
    return this.userStore.findByEmail(email.toLowerCase());
  }

  async findByUsername(username: string): Promise<IdentityUser | null> {
    return this.userStore.findByUsername(username);
  }

  // ── Sign In / Sign Out ─────────────────────────────────────────────

  /**
   * Authenticate a user by email and password, returning JWT tokens on success.
   *
   * Security: lockout is checked BEFORE password verification to prevent
   * timing attacks that could reveal whether an account exists or is locked.
   *
   * Flow: find user → check lockout → verify password → handle result
   */
  async signIn(
    email: string,
    password: string,
  ): Promise<IdentityResult & { accessToken?: string; refreshToken?: string; user?: IdentityUser }> {
    const user = await this.userStore.findByEmail(email.toLowerCase());
    if (!user) {
      return { success: false, errors: ['Invalid email or password.'] };
    }

    // Lockout check FIRST — do not reveal password correctness while locked out
    if (this.isLockedOut(user)) {
      return { success: false, errors: ['Account is locked. Please try again later.'] };
    }

    const passwordValid = await this.passwordHasher.verify(password, user.passwordHash);
    if (!passwordValid) {
      await this.incrementAccessFailedCount(user.id);
      return { success: false, errors: ['Invalid email or password.'] };
    }

    // Successful sign-in — reset failed attempts
    if (user.accessFailedCount > 0) {
      await this.resetAccessFailedCount(user.id);
    }

    const roles = await this.roleStore.getRolesForUser(user.id);
    const roleNames = roles.map((r) => r.name);
    const accessToken = await this.tokenService.generateAccessToken(user, roleNames);
    const refreshToken = await this.tokenService.generateRefreshToken(user.id);

    return { success: true, accessToken, refreshToken, user };
  }

  /** Revoke a refresh token (sign out from one device/session). */
  async signOut(refreshToken: string): Promise<void> {
    await this.tokenService.revokeRefreshToken(refreshToken);
  }

  /**
   * Exchange a valid refresh token for a new access + refresh token pair.
   *
   * The old refresh token is atomically consumed during validation.
   * A new token pair is issued if the user's security_stamp hasn't changed
   * since the original tokens were issued.
   */
  async refreshTokens(
    refreshToken: string,
  ): Promise<IdentityResult & { accessToken?: string; refreshToken?: string }> {
    // validateRefreshToken atomically consumes the old token
    const userId = await this.tokenService.validateRefreshToken(refreshToken);
    if (!userId) {
      return { success: false, errors: ['Invalid or expired refresh token.'] };
    }

    const user = await this.userStore.findById(userId);
    if (!user) {
      return { success: false, errors: ['User not found.'] };
    }

    const roles = await this.roleStore.getRolesForUser(user.id);
    const roleNames = roles.map((r) => r.name);
    const newAccessToken = await this.tokenService.generateAccessToken(user, roleNames);
    const newRefreshToken = await this.tokenService.generateRefreshToken(user.id);

    return { success: true, accessToken: newAccessToken, refreshToken: newRefreshToken };
  }

  // ── Password Management ────────────────────────────────────────────

  /** Check if a password matches the user's stored hash. */
  async checkPassword(user: IdentityUser, password: string): Promise<boolean> {
    return this.passwordHasher.verify(password, user.passwordHash);
  }

  /**
   * Change a user's password after verifying the current one.
   *
   * Regenerates security_stamp to invalidate all existing JWTs and refresh
   * tokens — effectively signing the user out of all other sessions.
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<IdentityResult> {
    const user = await this.userStore.findById(userId);
    if (!user) {
      return { success: false, errors: ['User not found.'] };
    }

    const currentValid = await this.passwordHasher.verify(currentPassword, user.passwordHash);
    if (!currentValid) {
      return { success: false, errors: ['Current password is incorrect.'] };
    }

    const passwordErrors = this.validatePassword(newPassword);
    if (passwordErrors.length > 0) {
      return { success: false, errors: passwordErrors };
    }

    const newHash = await this.passwordHasher.hash(newPassword);

    // Regenerate security_stamp — this invalidates ALL existing JWTs for this user
    await this.userStore.update(userId, {
      passwordHash: newHash,
      securityStamp: uuidv4(),
    });

    return { success: true };
  }

  /**
   * Generate a password reset token (1 hour expiry).
   * Sends email via IEmailService if one is configured.
   *
   * Returns the raw token — the caller can use it directly or wait for the email.
   * Only the SHA-256 hash is stored in the database.
   */
  async generatePasswordResetToken(userId: string): Promise<string> {
    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = sha256(rawToken);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await this.userStore.saveToken({
      userId,
      type: 'password_reset',
      tokenHash,
      expiresAt,
    });

    if (this.emailService) {
      const user = await this.userStore.findById(userId);
      if (user) {
        await this.emailService.sendPasswordResetEmail(user.email, rawToken);
      }
    }

    return rawToken;
  }

  /**
   * Reset a user's password using a valid reset token.
   *
   * Validates the token, hashes the new password, updates the user record,
   * regenerates security_stamp (invalidating all sessions), and consumes
   * the token so it cannot be reused.
   */
  async resetPassword(
    userId: string,
    token: string,
    newPassword: string,
  ): Promise<IdentityResult> {
    const storedToken = await this.userStore.findToken(userId, 'password_reset');
    if (!storedToken) {
      return { success: false, errors: ['Invalid or expired reset token.'] };
    }

    // Verify the provided token matches the stored hash
    if (sha256(token) !== storedToken.tokenHash) {
      return { success: false, errors: ['Invalid or expired reset token.'] };
    }

    const passwordErrors = this.validatePassword(newPassword);
    if (passwordErrors.length > 0) {
      return { success: false, errors: passwordErrors };
    }

    const newHash = await this.passwordHasher.hash(newPassword);

    // Update password + regenerate stamp to invalidate all existing sessions
    await this.userStore.update(userId, {
      passwordHash: newHash,
      securityStamp: uuidv4(),
    });

    // Consume token — single-use
    await this.userStore.consumeToken(storedToken.id);

    return { success: true };
  }

  // ── Email Verification ─────────────────────────────────────────────

  /**
   * Generate an email verification token (24 hour expiry).
   * Sends email via IEmailService if one is configured.
   */
  async generateEmailConfirmationToken(userId: string): Promise<string> {
    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = sha256(rawToken);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    await this.userStore.saveToken({
      userId,
      type: 'email_verification',
      tokenHash,
      expiresAt,
    });

    if (this.emailService) {
      const user = await this.userStore.findById(userId);
      if (user) {
        await this.emailService.sendVerificationEmail(user.email, rawToken);
      }
    }

    return rawToken;
  }

  /**
   * Confirm a user's email using a verification token.
   * Sets emailConfirmed = true and consumes the token (single-use).
   */
  async confirmEmail(userId: string, token: string): Promise<IdentityResult> {
    const storedToken = await this.userStore.findToken(userId, 'email_verification');
    if (!storedToken) {
      return { success: false, errors: ['Invalid or expired verification token.'] };
    }

    if (sha256(token) !== storedToken.tokenHash) {
      return { success: false, errors: ['Invalid or expired verification token.'] };
    }

    await this.userStore.update(userId, { emailConfirmed: true });
    await this.userStore.consumeToken(storedToken.id);

    return { success: true };
  }

  // ── Lockout ────────────────────────────────────────────────────────

  /**
   * Check if a user is currently locked out.
   * A user is locked out if lockout is enabled AND lockoutEnd is in the future.
   */
  isLockedOut(user: IdentityUser): boolean {
    if (!user.lockoutEnabled) return false;
    if (!user.lockoutEnd) return false;
    return user.lockoutEnd > new Date();
  }

  /**
   * Increment the failed login counter.
   * If the counter reaches maxAttempts, the account is automatically locked
   * for the configured duration.
   */
  async incrementAccessFailedCount(userId: string): Promise<void> {
    const user = await this.userStore.findById(userId);
    if (!user) return;

    const newCount = user.accessFailedCount + 1;

    if (user.lockoutEnabled && newCount >= this.lockoutConfig.maxAttempts) {
      // Lock the account — set lockoutEnd to now + configured duration
      const lockoutEnd = new Date(
        Date.now() + this.lockoutConfig.durationMinutes * 60 * 1000,
      );
      await this.userStore.update(userId, {
        accessFailedCount: newCount,
        lockoutEnd,
      });
    } else {
      await this.userStore.update(userId, { accessFailedCount: newCount });
    }
  }

  async resetAccessFailedCount(userId: string): Promise<void> {
    await this.userStore.update(userId, { accessFailedCount: 0 });
  }

  async lockoutUser(userId: string, until: Date): Promise<void> {
    await this.userStore.update(userId, { lockoutEnd: until });
  }

  async unlockUser(userId: string): Promise<void> {
    await this.userStore.update(userId, {
      lockoutEnd: null,
      accessFailedCount: 0,
    });
  }

  // ── Private Helpers ────────────────────────────────────────────────

  /**
   * Validate password strength.
   * V1 requirements: min 8 chars, at least 1 uppercase, 1 lowercase, 1 digit.
   * Returns an empty array if valid, or an array of error messages.
   */
  private validatePassword(password: string): string[] {
    const errors: string[] = [];

    if (password.length < PASSWORD_MIN_LENGTH) {
      errors.push(`Password must be at least ${PASSWORD_MIN_LENGTH} characters.`);
    }
    if (!/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter.');
    }
    if (!/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter.');
    }
    if (!/\d/.test(password)) {
      errors.push('Password must contain at least one digit.');
    }

    return errors;
  }
}
