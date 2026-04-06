import { UserManager } from '@/core/UserManager';
import { IUserStore } from '@/interfaces/IUserStore';
import { IRoleStore } from '@/interfaces/IRoleStore';
import { IPasswordHasher } from '@/interfaces/IPasswordHasher';
import { ITokenService } from '@/interfaces/ITokenService';
import { IEmailService } from '@/interfaces/IEmailService';
import { sha256 } from '@/utils/crypto';
import {
  createMockUserStore,
  createMockRoleStore,
  createMockPasswordHasher,
  createMockTokenService,
  createMockEmailService,
  createMockUser,
  createMockRole,
  createMockToken,
  VALID_PASSWORD,
  WEAK_PASSWORDS,
} from '../helpers/mockFactories';

describe('UserManager', () => {
  let mockUserStore: jest.Mocked<IUserStore>;
  let mockRoleStore: jest.Mocked<IRoleStore>;
  let mockPasswordHasher: jest.Mocked<IPasswordHasher>;
  let mockTokenService: jest.Mocked<ITokenService>;
  let mockEmailService: jest.Mocked<IEmailService>;
  let userManager: UserManager;

  beforeEach(() => {
    mockUserStore = createMockUserStore();
    mockRoleStore = createMockRoleStore();
    mockPasswordHasher = createMockPasswordHasher();
    mockTokenService = createMockTokenService();
    mockEmailService = createMockEmailService();
    userManager = new UserManager(
      mockUserStore,
      mockRoleStore,
      mockPasswordHasher,
      mockTokenService,
      mockEmailService,
      { maxAttempts: 3, durationMinutes: 15 },
    );
  });

  // ── createUser ──────────────────────────────────────────────────

  describe('createUser', () => {
    it('should create user with valid data', async () => {
      const result = await userManager.createUser({
        username: 'newuser',
        email: 'new@example.com',
        password: VALID_PASSWORD,
      });

      expect(result.success).toBe(true);
      expect(result.user).toBeDefined();
      expect(mockPasswordHasher.hash).toHaveBeenCalledWith(VALID_PASSWORD);
      expect(mockUserStore.create).toHaveBeenCalled();
    });

    it('should normalize email to lowercase', async () => {
      await userManager.createUser({
        username: 'newuser',
        email: 'USER@EXAMPLE.COM',
        password: VALID_PASSWORD,
      });

      expect(mockUserStore.findByEmail).toHaveBeenCalledWith('user@example.com');
    });

    it('should return error for invalid email format', async () => {
      const result = await userManager.createUser({
        username: 'newuser',
        email: 'not-an-email',
        password: VALID_PASSWORD,
      });

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Invalid email format.');
    });

    it('should return error for password shorter than 8 characters', async () => {
      const result = await userManager.createUser({
        username: 'newuser',
        email: 'new@example.com',
        password: WEAK_PASSWORDS.tooShort,
      });

      expect(result.success).toBe(false);
      expect(result.errors!.some((e) => e.includes('at least 8 characters'))).toBe(true);
    });

    it('should return error for password without uppercase letter', async () => {
      const result = await userManager.createUser({
        username: 'newuser',
        email: 'new@example.com',
        password: WEAK_PASSWORDS.noUpper,
      });

      expect(result.success).toBe(false);
      expect(result.errors!.some((e) => e.includes('uppercase'))).toBe(true);
    });

    it('should return error for password without lowercase letter', async () => {
      const result = await userManager.createUser({
        username: 'newuser',
        email: 'new@example.com',
        password: WEAK_PASSWORDS.noLower,
      });

      expect(result.success).toBe(false);
      expect(result.errors!.some((e) => e.includes('lowercase'))).toBe(true);
    });

    it('should return error for password without digit', async () => {
      const result = await userManager.createUser({
        username: 'newuser',
        email: 'new@example.com',
        password: WEAK_PASSWORDS.noDigit,
      });

      expect(result.success).toBe(false);
      expect(result.errors!.some((e) => e.includes('digit'))).toBe(true);
    });

    it('should return multiple password errors at once', async () => {
      const result = await userManager.createUser({
        username: 'newuser',
        email: 'new@example.com',
        password: 'short',
      });

      expect(result.success).toBe(false);
      expect(result.errors!.length).toBeGreaterThan(1);
    });

    it('should return error when email already exists', async () => {
      mockUserStore.findByEmail.mockResolvedValue(createMockUser());

      const result = await userManager.createUser({
        username: 'newuser',
        email: 'taken@example.com',
        password: VALID_PASSWORD,
      });

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Email is already registered.');
    });

    it('should return error when username already exists', async () => {
      mockUserStore.findByUsername.mockResolvedValue(createMockUser());

      const result = await userManager.createUser({
        username: 'takenuser',
        email: 'new@example.com',
        password: VALID_PASSWORD,
      });

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Username is already taken.');
    });
  });

  // ── Lookup ──────────────────────────────────────────────────────

  describe('findById', () => {
    it('should delegate to userStore.findById', async () => {
      const user = createMockUser();
      mockUserStore.findById.mockResolvedValue(user);

      const result = await userManager.findById(user.id);
      expect(result).toEqual(user);
    });

    it('should return null when user not found', async () => {
      const result = await userManager.findById('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('findByEmail', () => {
    it('should normalize email to lowercase before querying', async () => {
      await userManager.findByEmail('USER@EXAMPLE.COM');
      expect(mockUserStore.findByEmail).toHaveBeenCalledWith('user@example.com');
    });
  });

  describe('findByUsername', () => {
    it('should delegate to userStore.findByUsername', async () => {
      await userManager.findByUsername('testuser');
      expect(mockUserStore.findByUsername).toHaveBeenCalledWith('testuser');
    });
  });

  // ── signIn ──────────────────────────────────────────────────────

  describe('signIn', () => {
    it('should return tokens and user on successful authentication', async () => {
      const user = createMockUser();
      mockUserStore.findByEmail.mockResolvedValue(user);
      mockPasswordHasher.verify.mockResolvedValue(true);
      mockRoleStore.getRolesForUser.mockResolvedValue([createMockRole()]);
      mockTokenService.generateAccessToken.mockResolvedValue('access-jwt');
      mockTokenService.generateRefreshToken.mockResolvedValue('refresh-hex');

      const result = await userManager.signIn('test@example.com', VALID_PASSWORD);

      expect(result.success).toBe(true);
      expect(result.accessToken).toBe('access-jwt');
      expect(result.refreshToken).toBe('refresh-hex');
      expect(result.user).toEqual(user);
    });

    it('should return error for non-existent email', async () => {
      mockUserStore.findByEmail.mockResolvedValue(null);

      const result = await userManager.signIn('noone@example.com', VALID_PASSWORD);

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Invalid email or password.');
    });

    it('should check lockout BEFORE verifying password', async () => {
      const lockedUser = createMockUser({
        lockoutEnabled: true,
        lockoutEnd: new Date(Date.now() + 60000), // Locked for 1 more minute
      });
      mockUserStore.findByEmail.mockResolvedValue(lockedUser);

      const result = await userManager.signIn('test@example.com', VALID_PASSWORD);

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Account is locked. Please try again later.');
      // Critical: password hasher should NEVER be called for locked accounts
      expect(mockPasswordHasher.verify).not.toHaveBeenCalled();
    });

    it('should increment failed count on wrong password', async () => {
      const user = createMockUser();
      mockUserStore.findByEmail.mockResolvedValue(user);
      // incrementAccessFailedCount internally calls findById
      mockUserStore.findById.mockResolvedValue(user);
      mockPasswordHasher.verify.mockResolvedValue(false);

      await userManager.signIn('test@example.com', 'wrong');

      expect(mockUserStore.update).toHaveBeenCalledWith(
        user.id,
        expect.objectContaining({ accessFailedCount: 1 }),
      );
    });

    it('should reset failed count on successful sign-in when count was > 0', async () => {
      const user = createMockUser({ accessFailedCount: 2 });
      mockUserStore.findByEmail.mockResolvedValue(user);
      mockPasswordHasher.verify.mockResolvedValue(true);
      mockRoleStore.getRolesForUser.mockResolvedValue([]);

      await userManager.signIn('test@example.com', VALID_PASSWORD);

      expect(mockUserStore.update).toHaveBeenCalledWith(user.id, { accessFailedCount: 0 });
    });

    it('should fetch roles and pass role names to generateAccessToken', async () => {
      const user = createMockUser();
      const roles = [
        createMockRole({ name: 'admin' }),
        createMockRole({ id: 'r2', name: 'editor' }),
      ];
      mockUserStore.findByEmail.mockResolvedValue(user);
      mockPasswordHasher.verify.mockResolvedValue(true);
      mockRoleStore.getRolesForUser.mockResolvedValue(roles);

      await userManager.signIn('test@example.com', VALID_PASSWORD);

      expect(mockTokenService.generateAccessToken).toHaveBeenCalledWith(
        user,
        ['admin', 'editor'],
      );
    });

    it('should normalize email to lowercase', async () => {
      mockUserStore.findByEmail.mockResolvedValue(null);

      await userManager.signIn('USER@EXAMPLE.COM', VALID_PASSWORD);

      expect(mockUserStore.findByEmail).toHaveBeenCalledWith('user@example.com');
    });
  });

  // ── signOut ─────────────────────────────────────────────────────

  describe('signOut', () => {
    it('should delegate to tokenService.revokeRefreshToken', async () => {
      await userManager.signOut('refresh-token');
      expect(mockTokenService.revokeRefreshToken).toHaveBeenCalledWith('refresh-token');
    });
  });

  // ── refreshTokens ──────────────────────────────────────────────

  describe('refreshTokens', () => {
    it('should return new token pair for valid refresh token', async () => {
      const user = createMockUser();
      mockTokenService.validateRefreshToken.mockResolvedValue(user.id);
      mockUserStore.findById.mockResolvedValue(user);
      mockRoleStore.getRolesForUser.mockResolvedValue([]);
      mockTokenService.generateAccessToken.mockResolvedValue('new-access');
      mockTokenService.generateRefreshToken.mockResolvedValue('new-refresh');

      const result = await userManager.refreshTokens('old-refresh');

      expect(result.success).toBe(true);
      expect(result.accessToken).toBe('new-access');
      expect(result.refreshToken).toBe('new-refresh');
    });

    it('should return error for invalid refresh token', async () => {
      mockTokenService.validateRefreshToken.mockResolvedValue(null);

      const result = await userManager.refreshTokens('invalid');

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Invalid or expired refresh token.');
    });

    it('should return error when user not found after token validation', async () => {
      mockTokenService.validateRefreshToken.mockResolvedValue('user-id');
      mockUserStore.findById.mockResolvedValue(null);

      const result = await userManager.refreshTokens('valid-token');

      expect(result.success).toBe(false);
      expect(result.errors).toContain('User not found.');
    });
  });

  // ── checkPassword ──────────────────────────────────────────────

  describe('checkPassword', () => {
    it('should delegate to passwordHasher.verify', async () => {
      const user = createMockUser();
      mockPasswordHasher.verify.mockResolvedValue(true);

      const result = await userManager.checkPassword(user, VALID_PASSWORD);

      expect(result).toBe(true);
      expect(mockPasswordHasher.verify).toHaveBeenCalledWith(VALID_PASSWORD, user.passwordHash);
    });
  });

  // ── changePassword ─────────────────────────────────────────────

  describe('changePassword', () => {
    it('should update hash and regenerate securityStamp on success', async () => {
      const user = createMockUser();
      mockUserStore.findById.mockResolvedValue(user);
      mockPasswordHasher.verify.mockResolvedValue(true);
      mockPasswordHasher.hash.mockResolvedValue('new-hash');

      const result = await userManager.changePassword(user.id, 'OldPass1', 'NewSecure1');

      expect(result.success).toBe(true);
      expect(mockUserStore.update).toHaveBeenCalledWith(
        user.id,
        expect.objectContaining({
          passwordHash: 'new-hash',
          securityStamp: expect.any(String),
        }),
      );
    });

    it('should return error when user not found', async () => {
      mockUserStore.findById.mockResolvedValue(null);

      const result = await userManager.changePassword('missing', 'old', 'new');

      expect(result.success).toBe(false);
      expect(result.errors).toContain('User not found.');
    });

    it('should return error when current password is incorrect', async () => {
      mockUserStore.findById.mockResolvedValue(createMockUser());
      mockPasswordHasher.verify.mockResolvedValue(false);

      const result = await userManager.changePassword('id', 'wrong', 'NewSecure1');

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Current password is incorrect.');
    });

    it('should validate new password strength', async () => {
      mockUserStore.findById.mockResolvedValue(createMockUser());
      mockPasswordHasher.verify.mockResolvedValue(true);

      const result = await userManager.changePassword('id', 'OldPass1', 'weak');

      expect(result.success).toBe(false);
      expect(result.errors!.length).toBeGreaterThan(0);
    });
  });

  // ── generatePasswordResetToken ─────────────────────────────────

  describe('generatePasswordResetToken', () => {
    it('should save a hashed token with type password_reset', async () => {
      const user = createMockUser();
      mockUserStore.findById.mockResolvedValue(user);

      const rawToken = await userManager.generatePasswordResetToken(user.id);

      expect(mockUserStore.saveToken).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: user.id,
          type: 'password_reset',
          tokenHash: sha256(rawToken),
        }),
      );
    });

    it('should return a raw hex token string', async () => {
      mockUserStore.findById.mockResolvedValue(createMockUser());

      const rawToken = await userManager.generatePasswordResetToken('id');

      expect(rawToken).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should send email when emailService is configured', async () => {
      const user = createMockUser();
      mockUserStore.findById.mockResolvedValue(user);

      await userManager.generatePasswordResetToken(user.id);

      expect(mockEmailService.sendPasswordResetEmail).toHaveBeenCalledWith(
        user.email,
        expect.any(String),
      );
    });

    it('should not throw when emailService is not configured', async () => {
      const managerNoEmail = new UserManager(
        mockUserStore,
        mockRoleStore,
        mockPasswordHasher,
        mockTokenService,
        undefined,
      );
      mockUserStore.findById.mockResolvedValue(createMockUser());

      await expect(
        managerNoEmail.generatePasswordResetToken('id'),
      ).resolves.toBeDefined();
    });
  });

  // ── resetPassword ──────────────────────────────────────────────

  describe('resetPassword', () => {
    it('should update password, regenerate stamp, and consume token on success', async () => {
      const rawToken = 'a'.repeat(64);
      const storedToken = createMockToken({
        type: 'password_reset',
        tokenHash: sha256(rawToken),
      });
      mockUserStore.findToken.mockResolvedValue(storedToken);
      mockPasswordHasher.hash.mockResolvedValue('new-hash');

      const result = await userManager.resetPassword('user-id', rawToken, 'NewSecure1');

      expect(result.success).toBe(true);
      expect(mockUserStore.update).toHaveBeenCalledWith(
        'user-id',
        expect.objectContaining({
          passwordHash: 'new-hash',
          securityStamp: expect.any(String),
        }),
      );
      expect(mockUserStore.consumeToken).toHaveBeenCalledWith(storedToken.id);
    });

    it('should return error when no stored token found', async () => {
      mockUserStore.findToken.mockResolvedValue(null);

      const result = await userManager.resetPassword('user-id', 'token', 'NewSecure1');

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Invalid or expired reset token.');
    });

    it('should return error when token hash does not match', async () => {
      const storedToken = createMockToken({
        type: 'password_reset',
        tokenHash: 'different-hash',
      });
      mockUserStore.findToken.mockResolvedValue(storedToken);

      const result = await userManager.resetPassword('user-id', 'wrong-token', 'NewSecure1');

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Invalid or expired reset token.');
    });

    it('should validate new password strength', async () => {
      const rawToken = 'a'.repeat(64);
      const storedToken = createMockToken({
        type: 'password_reset',
        tokenHash: sha256(rawToken),
      });
      mockUserStore.findToken.mockResolvedValue(storedToken);

      const result = await userManager.resetPassword('user-id', rawToken, 'weak');

      expect(result.success).toBe(false);
      expect(result.errors!.length).toBeGreaterThan(0);
    });
  });

  // ── generateEmailConfirmationToken ─────────────────────────────

  describe('generateEmailConfirmationToken', () => {
    it('should save a hashed token with type email_verification', async () => {
      const user = createMockUser();
      mockUserStore.findById.mockResolvedValue(user);

      const rawToken = await userManager.generateEmailConfirmationToken(user.id);

      expect(mockUserStore.saveToken).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: user.id,
          type: 'email_verification',
          tokenHash: sha256(rawToken),
        }),
      );
    });

    it('should send email when emailService is configured', async () => {
      const user = createMockUser();
      mockUserStore.findById.mockResolvedValue(user);

      await userManager.generateEmailConfirmationToken(user.id);

      expect(mockEmailService.sendVerificationEmail).toHaveBeenCalledWith(
        user.email,
        expect.any(String),
      );
    });

    it('should not throw when emailService is not configured', async () => {
      const managerNoEmail = new UserManager(
        mockUserStore,
        mockRoleStore,
        mockPasswordHasher,
        mockTokenService,
        undefined,
      );
      mockUserStore.findById.mockResolvedValue(createMockUser());

      await expect(
        managerNoEmail.generateEmailConfirmationToken('id'),
      ).resolves.toBeDefined();
    });
  });

  // ── confirmEmail ───────────────────────────────────────────────

  describe('confirmEmail', () => {
    it('should set emailConfirmed to true and consume token', async () => {
      const rawToken = 'a'.repeat(64);
      const storedToken = createMockToken({
        type: 'email_verification',
        tokenHash: sha256(rawToken),
      });
      mockUserStore.findToken.mockResolvedValue(storedToken);

      const result = await userManager.confirmEmail('user-id', rawToken);

      expect(result.success).toBe(true);
      expect(mockUserStore.update).toHaveBeenCalledWith('user-id', { emailConfirmed: true });
      expect(mockUserStore.consumeToken).toHaveBeenCalledWith(storedToken.id);
    });

    it('should return error when no stored token found', async () => {
      mockUserStore.findToken.mockResolvedValue(null);

      const result = await userManager.confirmEmail('user-id', 'token');

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Invalid or expired verification token.');
    });

    it('should return error when token hash does not match', async () => {
      const storedToken = createMockToken({
        type: 'email_verification',
        tokenHash: 'different-hash',
      });
      mockUserStore.findToken.mockResolvedValue(storedToken);

      const result = await userManager.confirmEmail('user-id', 'wrong');

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Invalid or expired verification token.');
    });
  });

  // ── isLockedOut ────────────────────────────────────────────────

  describe('isLockedOut', () => {
    it('should return false when lockoutEnabled is false', () => {
      const user = createMockUser({ lockoutEnabled: false });
      expect(userManager.isLockedOut(user)).toBe(false);
    });

    it('should return false when lockoutEnd is null', () => {
      const user = createMockUser({ lockoutEnabled: true, lockoutEnd: null });
      expect(userManager.isLockedOut(user)).toBe(false);
    });

    it('should return false when lockoutEnd is in the past', () => {
      const user = createMockUser({
        lockoutEnabled: true,
        lockoutEnd: new Date(Date.now() - 1000),
      });
      expect(userManager.isLockedOut(user)).toBe(false);
    });

    it('should return true when lockoutEnabled and lockoutEnd is in the future', () => {
      const user = createMockUser({
        lockoutEnabled: true,
        lockoutEnd: new Date(Date.now() + 60000),
      });
      expect(userManager.isLockedOut(user)).toBe(true);
    });
  });

  // ── incrementAccessFailedCount ─────────────────────────────────

  describe('incrementAccessFailedCount', () => {
    it('should increment the count by 1', async () => {
      const user = createMockUser({ accessFailedCount: 1 });
      mockUserStore.findById.mockResolvedValue(user);

      await userManager.incrementAccessFailedCount(user.id);

      expect(mockUserStore.update).toHaveBeenCalledWith(
        user.id,
        expect.objectContaining({ accessFailedCount: 2 }),
      );
    });

    it('should lock the account when count reaches maxAttempts', async () => {
      // maxAttempts is 3, current count is 2 → next increment locks
      const user = createMockUser({ accessFailedCount: 2 });
      mockUserStore.findById.mockResolvedValue(user);

      await userManager.incrementAccessFailedCount(user.id);

      expect(mockUserStore.update).toHaveBeenCalledWith(
        user.id,
        expect.objectContaining({
          accessFailedCount: 3,
          lockoutEnd: expect.any(Date),
        }),
      );
    });

    it('should not lock when lockoutEnabled is false even at max attempts', async () => {
      const user = createMockUser({
        accessFailedCount: 2,
        lockoutEnabled: false,
      });
      mockUserStore.findById.mockResolvedValue(user);

      await userManager.incrementAccessFailedCount(user.id);

      expect(mockUserStore.update).toHaveBeenCalledWith(
        user.id,
        { accessFailedCount: 3 },
      );
    });

    it('should do nothing when user not found', async () => {
      mockUserStore.findById.mockResolvedValue(null);

      await userManager.incrementAccessFailedCount('missing');

      expect(mockUserStore.update).not.toHaveBeenCalled();
    });
  });

  // ── Other lockout methods ──────────────────────────────────────

  describe('resetAccessFailedCount', () => {
    it('should set accessFailedCount to 0', async () => {
      await userManager.resetAccessFailedCount('user-id');

      expect(mockUserStore.update).toHaveBeenCalledWith('user-id', { accessFailedCount: 0 });
    });
  });

  describe('lockoutUser', () => {
    it('should set lockoutEnd to the provided date', async () => {
      const until = new Date(Date.now() + 3600000);

      await userManager.lockoutUser('user-id', until);

      expect(mockUserStore.update).toHaveBeenCalledWith('user-id', { lockoutEnd: until });
    });
  });

  describe('unlockUser', () => {
    it('should set lockoutEnd to null and accessFailedCount to 0', async () => {
      await userManager.unlockUser('user-id');

      expect(mockUserStore.update).toHaveBeenCalledWith('user-id', {
        lockoutEnd: null,
        accessFailedCount: 0,
      });
    });
  });
});
