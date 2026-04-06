import jwt from 'jsonwebtoken';
import { TokenService } from '@/core/TokenService';
import { sha256 } from '@/utils/crypto';
import {
  createMockUserStore,
  createMockUser,
} from '../helpers/mockFactories';
import { IUserStore } from '@/interfaces/IUserStore';
import { TokenPayload } from '@/types';

const JWT_SECRET = 'test-secret-key-at-least-32-chars!!';

describe('TokenService', () => {
  let mockUserStore: jest.Mocked<IUserStore>;
  let tokenService: TokenService;

  beforeEach(() => {
    mockUserStore = createMockUserStore();
    tokenService = new TokenService(JWT_SECRET, mockUserStore, '15m', '7d');
  });

  describe('generateAccessToken', () => {
    const user = createMockUser();
    const roles = ['admin', 'editor'];

    it('should return a valid JWT string', async () => {
      const token = await tokenService.generateAccessToken(user, roles);
      const parts = token.split('.');
      expect(parts).toHaveLength(3);
    });

    it('should include sub, email, roles, and stamp in the payload', async () => {
      const token = await tokenService.generateAccessToken(user, roles);
      const payload = jwt.decode(token) as TokenPayload;

      expect(payload.sub).toBe(user.id);
      expect(payload.email).toBe(user.email);
      expect(payload.roles).toEqual(roles);
      expect(payload.stamp).toBe(user.securityStamp);
    });

    it('should sign with HS256 algorithm', async () => {
      const token = await tokenService.generateAccessToken(user, roles);
      const header = JSON.parse(
        Buffer.from(token.split('.')[0], 'base64url').toString(),
      );
      expect(header.alg).toBe('HS256');
    });

    it('should set expiry matching the configured expiresIn', async () => {
      const token = await tokenService.generateAccessToken(user, roles);
      const payload = jwt.decode(token) as TokenPayload;
      // 15m = 900 seconds
      expect(payload.exp - payload.iat).toBe(900);
    });
  });

  describe('generateRefreshToken', () => {
    it('should return a 64-character hex string', async () => {
      const token = await tokenService.generateRefreshToken('user-id');
      expect(token).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should save the SHA-256 hash to the store, not the raw token', async () => {
      const token = await tokenService.generateRefreshToken('user-id');
      const expectedHash = sha256(token);

      expect(mockUserStore.saveToken).toHaveBeenCalledWith(
        expect.objectContaining({ tokenHash: expectedHash }),
      );
    });

    it('should save with type refresh_token', async () => {
      await tokenService.generateRefreshToken('user-id');

      expect(mockUserStore.saveToken).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'refresh_token' }),
      );
    });

    it('should save with the correct userId', async () => {
      await tokenService.generateRefreshToken('user-123');

      expect(mockUserStore.saveToken).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-123' }),
      );
    });

    it('should set expiresAt in the future', async () => {
      const before = Date.now();
      await tokenService.generateRefreshToken('user-id');
      const after = Date.now();

      const savedData = mockUserStore.saveToken.mock.calls[0][0];
      const expiresMs = savedData.expiresAt.getTime();

      // 7 days = 604800000 ms
      expect(expiresMs).toBeGreaterThanOrEqual(before + 604800000);
      expect(expiresMs).toBeLessThanOrEqual(after + 604800000);
    });
  });

  describe('validateAccessToken', () => {
    const user = createMockUser();

    it('should return TokenPayload for a valid token with matching stamp', async () => {
      mockUserStore.findById.mockResolvedValue(user);
      const token = await tokenService.generateAccessToken(user, ['admin']);

      const payload = await tokenService.validateAccessToken(token);

      expect(payload).not.toBeNull();
      expect(payload!.sub).toBe(user.id);
      expect(payload!.roles).toEqual(['admin']);
    });

    it('should return null for a token signed with wrong secret', async () => {
      const otherService = new TokenService('different-secret-key-32-chars!!', mockUserStore);
      const token = await otherService.generateAccessToken(user, []);

      const payload = await tokenService.validateAccessToken(token);
      expect(payload).toBeNull();
    });

    it('should return null for a malformed string', async () => {
      const payload = await tokenService.validateAccessToken('not.a.jwt');
      expect(payload).toBeNull();
    });

    it('should return null when user no longer exists', async () => {
      mockUserStore.findById.mockResolvedValue(null);
      const token = await tokenService.generateAccessToken(user, []);

      const payload = await tokenService.validateAccessToken(token);
      expect(payload).toBeNull();
    });

    it('should return null when security stamp has changed', async () => {
      const updatedUser = createMockUser({ securityStamp: 'new-stamp' });
      mockUserStore.findById.mockResolvedValue(updatedUser);

      const token = await tokenService.generateAccessToken(user, []);
      const payload = await tokenService.validateAccessToken(token);

      expect(payload).toBeNull();
    });

    it('should return null for an expired token', async () => {
      // Create a service with 0-second expiry
      const shortLivedService = new TokenService(JWT_SECRET, mockUserStore, '1s');
      mockUserStore.findById.mockResolvedValue(user);

      const token = await shortLivedService.generateAccessToken(user, []);

      // Wait for expiry
      await new Promise((resolve) => setTimeout(resolve, 1100));

      const payload = await tokenService.validateAccessToken(token);
      expect(payload).toBeNull();
    });
  });

  describe('validateRefreshToken', () => {
    it('should return userId for a valid token', async () => {
      const rawToken = 'a'.repeat(64);
      const storedToken = {
        id: 'token-1',
        userId: 'user-123',
        type: 'refresh_token' as const,
        tokenHash: sha256(rawToken),
        expiresAt: new Date(Date.now() + 60000),
        usedAt: null,
        createdAt: new Date(),
      };
      mockUserStore.findTokenByHash.mockResolvedValue(storedToken);
      mockUserStore.consumeToken.mockResolvedValue(true);

      const result = await tokenService.validateRefreshToken(rawToken);
      expect(result).toBe('user-123');
    });

    it('should return null when token hash is not found', async () => {
      mockUserStore.findTokenByHash.mockResolvedValue(null);

      const result = await tokenService.validateRefreshToken('nonexistent');
      expect(result).toBeNull();
    });

    it('should return null when token is expired', async () => {
      const storedToken = {
        id: 'token-1',
        userId: 'user-123',
        type: 'refresh_token' as const,
        tokenHash: 'hash',
        expiresAt: new Date(Date.now() - 1000), // Already expired
        usedAt: null,
        createdAt: new Date(),
      };
      mockUserStore.findTokenByHash.mockResolvedValue(storedToken);

      const result = await tokenService.validateRefreshToken('some-token');
      expect(result).toBeNull();
    });

    it('should return null when consumeToken returns false (already consumed)', async () => {
      const storedToken = {
        id: 'token-1',
        userId: 'user-123',
        type: 'refresh_token' as const,
        tokenHash: 'hash',
        expiresAt: new Date(Date.now() + 60000),
        usedAt: null,
        createdAt: new Date(),
      };
      mockUserStore.findTokenByHash.mockResolvedValue(storedToken);
      mockUserStore.consumeToken.mockResolvedValue(false);

      const result = await tokenService.validateRefreshToken('some-token');
      expect(result).toBeNull();
    });
  });

  describe('revokeRefreshToken', () => {
    it('should find the token by hash and consume it', async () => {
      const rawToken = 'b'.repeat(64);
      const storedToken = {
        id: 'token-1',
        userId: 'user-123',
        type: 'refresh_token' as const,
        tokenHash: sha256(rawToken),
        expiresAt: new Date(Date.now() + 60000),
        usedAt: null,
        createdAt: new Date(),
      };
      mockUserStore.findTokenByHash.mockResolvedValue(storedToken);

      await tokenService.revokeRefreshToken(rawToken);

      expect(mockUserStore.consumeToken).toHaveBeenCalledWith('token-1');
    });

    it('should silently succeed when token does not exist', async () => {
      mockUserStore.findTokenByHash.mockResolvedValue(null);

      await expect(
        tokenService.revokeRefreshToken('nonexistent'),
      ).resolves.toBeUndefined();
    });
  });
});
