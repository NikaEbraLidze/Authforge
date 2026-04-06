import { Knex } from 'knex';
import { KnexUserStore } from '@/stores/knex/KnexUserStore';
import { CreateUserData } from '@/types';
import {
  startPostgresContainer,
  stopPostgresContainer,
  truncateAll,
  TestContainerContext,
} from '../helpers/testContainerSetup';

const TEST_USER: CreateUserData & { passwordHash: string } = {
  username: 'testuser',
  email: 'test@example.com',
  password: 'SecurePass1',
  passwordHash: '$2b$04$fakehash',
};

describe('KnexUserStore (integration)', () => {
  let ctx: TestContainerContext;
  let knexInstance: Knex;
  let userStore: KnexUserStore;

  beforeAll(async () => {
    ctx = await startPostgresContainer();
    knexInstance = ctx.knex;
    userStore = new KnexUserStore(knexInstance);
  }, 60_000);

  afterAll(async () => {
    await stopPostgresContainer(ctx);
  });

  beforeEach(async () => {
    await truncateAll(knexInstance);
  });

  /** Helper to create a user with optional overrides */
  async function createTestUser(overrides?: Partial<CreateUserData & { passwordHash: string }>) {
    return userStore.create({ ...TEST_USER, ...overrides });
  }

  // ── create ──────────────────────────────────────────────────────

  describe('create', () => {
    it('should insert a user and return it with generated id, securityStamp, timestamps', async () => {
      const user = await createTestUser();

      expect(user.id).toBeDefined();
      expect(user.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
      expect(user.securityStamp).toBeDefined();
      expect(user.createdAt).toBeInstanceOf(Date);
      expect(user.updatedAt).toBeInstanceOf(Date);
    });

    it('should set emailConfirmed to false by default', async () => {
      const user = await createTestUser();
      expect(user.emailConfirmed).toBe(false);
    });

    it('should set lockoutEnabled to true by default', async () => {
      const user = await createTestUser();
      expect(user.lockoutEnabled).toBe(true);
    });

    it('should throw on duplicate email', async () => {
      await createTestUser();
      await expect(
        createTestUser({ username: 'other' }),
      ).rejects.toThrow();
    });

    it('should throw on duplicate username', async () => {
      await createTestUser();
      await expect(
        createTestUser({ email: 'other@example.com' }),
      ).rejects.toThrow();
    });
  });

  // ── findById ────────────────────────────────────────────────────

  describe('findById', () => {
    it('should return the user when found', async () => {
      const created = await createTestUser();
      const found = await userStore.findById(created.id);

      expect(found).not.toBeNull();
      expect(found!.id).toBe(created.id);
      expect(found!.username).toBe('testuser');
    });

    it('should return null when id does not exist', async () => {
      const found = await userStore.findById('00000000-0000-0000-0000-000000000000');
      expect(found).toBeNull();
    });

    it('should correctly map all snake_case columns to camelCase', async () => {
      const created = await createTestUser();
      const found = await userStore.findById(created.id);

      expect(found).not.toBeNull();
      expect(found!.passwordHash).toBe(TEST_USER.passwordHash);
      expect(found!.emailConfirmed).toBe(false);
      expect(found!.securityStamp).toBeDefined();
      expect(found!.lockoutEnabled).toBe(true);
      expect(found!.lockoutEnd).toBeNull();
      expect(found!.accessFailedCount).toBe(0);
      expect(found!.createdAt).toBeInstanceOf(Date);
      expect(found!.updatedAt).toBeInstanceOf(Date);
    });
  });

  // ── findByEmail ─────────────────────────────────────────────────

  describe('findByEmail', () => {
    it('should return the user matching the email', async () => {
      await createTestUser();
      const found = await userStore.findByEmail('test@example.com');
      expect(found).not.toBeNull();
      expect(found!.email).toBe('test@example.com');
    });

    it('should return null when email not found', async () => {
      const found = await userStore.findByEmail('nonexistent@example.com');
      expect(found).toBeNull();
    });
  });

  // ── findByUsername ──────────────────────────────────────────────

  describe('findByUsername', () => {
    it('should return the user matching the username', async () => {
      await createTestUser();
      const found = await userStore.findByUsername('testuser');
      expect(found).not.toBeNull();
      expect(found!.username).toBe('testuser');
    });

    it('should return null when username not found', async () => {
      const found = await userStore.findByUsername('nonexistent');
      expect(found).toBeNull();
    });
  });

  // ── update ──────────────────────────────────────────────────────

  describe('update', () => {
    it('should update specified fields only', async () => {
      const user = await createTestUser();
      await userStore.update(user.id, { emailConfirmed: true });

      const updated = await userStore.findById(user.id);
      expect(updated!.emailConfirmed).toBe(true);
      expect(updated!.username).toBe('testuser'); // unchanged
    });

    it('should update the updatedAt timestamp automatically', async () => {
      const user = await createTestUser();
      const originalUpdatedAt = user.updatedAt;

      // Small delay to ensure timestamp differs
      await new Promise((r) => setTimeout(r, 50));
      await userStore.update(user.id, { emailConfirmed: true });

      const updated = await userStore.findById(user.id);
      expect(updated!.updatedAt.getTime()).toBeGreaterThan(originalUpdatedAt.getTime());
    });

    it('should update passwordHash and securityStamp together', async () => {
      const user = await createTestUser();
      await userStore.update(user.id, {
        passwordHash: 'new-hash',
        securityStamp: 'new-stamp',
      });

      const updated = await userStore.findById(user.id);
      expect(updated!.passwordHash).toBe('new-hash');
      expect(updated!.securityStamp).toBe('new-stamp');
    });

    it('should set and then clear lockoutEnd', async () => {
      const user = await createTestUser();
      const lockoutDate = new Date(Date.now() + 3600000);

      await userStore.update(user.id, { lockoutEnd: lockoutDate });
      let updated = await userStore.findById(user.id);
      expect(updated!.lockoutEnd).not.toBeNull();

      await userStore.update(user.id, { lockoutEnd: null });
      updated = await userStore.findById(user.id);
      expect(updated!.lockoutEnd).toBeNull();
    });
  });

  // ── delete ──────────────────────────────────────────────────────

  describe('delete', () => {
    it('should remove the user record', async () => {
      const user = await createTestUser();
      await userStore.delete(user.id);

      const found = await userStore.findById(user.id);
      expect(found).toBeNull();
    });

    it('should cascade-delete associated tokens', async () => {
      const user = await createTestUser();
      await userStore.saveToken({
        userId: user.id,
        type: 'password_reset',
        tokenHash: 'hash123',
        expiresAt: new Date(Date.now() + 60000),
      });

      await userStore.delete(user.id);

      // Verify token is gone
      const tokenRow = await knexInstance('authforge_user_tokens')
        .where('user_id', user.id)
        .first();
      expect(tokenRow).toBeUndefined();
    });

    it('should not throw when deleting non-existent user', async () => {
      await expect(
        userStore.delete('00000000-0000-0000-0000-000000000000'),
      ).resolves.toBeUndefined();
    });
  });

  // ── Token operations ────────────────────────────────────────────

  describe('saveToken', () => {
    it('should insert a token record and return the generated id', async () => {
      const user = await createTestUser();
      const tokenId = await userStore.saveToken({
        userId: user.id,
        type: 'password_reset',
        tokenHash: 'hash123',
        expiresAt: new Date(Date.now() + 60000),
      });

      expect(tokenId).toBeDefined();
      expect(tokenId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
    });
  });

  describe('findToken', () => {
    it('should return the most recent valid token for a user and type', async () => {
      const user = await createTestUser();
      await userStore.saveToken({
        userId: user.id,
        type: 'password_reset',
        tokenHash: 'hash-old',
        expiresAt: new Date(Date.now() + 60000),
      });
      // Small delay so the second token has a later created_at
      await new Promise((r) => setTimeout(r, 50));
      await userStore.saveToken({
        userId: user.id,
        type: 'password_reset',
        tokenHash: 'hash-new',
        expiresAt: new Date(Date.now() + 60000),
      });

      const token = await userStore.findToken(user.id, 'password_reset');
      expect(token).not.toBeNull();
      expect(token!.tokenHash).toBe('hash-new');
    });

    it('should not return consumed tokens', async () => {
      const user = await createTestUser();
      const tokenId = await userStore.saveToken({
        userId: user.id,
        type: 'password_reset',
        tokenHash: 'hash123',
        expiresAt: new Date(Date.now() + 60000),
      });

      await userStore.consumeToken(tokenId);

      const token = await userStore.findToken(user.id, 'password_reset');
      expect(token).toBeNull();
    });

    it('should not return expired tokens', async () => {
      const user = await createTestUser();
      await userStore.saveToken({
        userId: user.id,
        type: 'password_reset',
        tokenHash: 'hash123',
        expiresAt: new Date(Date.now() - 1000), // Already expired
      });

      const token = await userStore.findToken(user.id, 'password_reset');
      expect(token).toBeNull();
    });

    it('should return null when no matching token exists', async () => {
      const user = await createTestUser();
      const token = await userStore.findToken(user.id, 'password_reset');
      expect(token).toBeNull();
    });
  });

  describe('findTokenByHash', () => {
    it('should return the token matching the hash', async () => {
      const user = await createTestUser();
      await userStore.saveToken({
        userId: user.id,
        type: 'refresh_token',
        tokenHash: 'unique-hash',
        expiresAt: new Date(Date.now() + 60000),
      });

      const token = await userStore.findTokenByHash('unique-hash');
      expect(token).not.toBeNull();
      expect(token!.tokenHash).toBe('unique-hash');
      expect(token!.userId).toBe(user.id);
    });

    it('should not return consumed tokens', async () => {
      const user = await createTestUser();
      const tokenId = await userStore.saveToken({
        userId: user.id,
        type: 'refresh_token',
        tokenHash: 'hash-consumed',
        expiresAt: new Date(Date.now() + 60000),
      });

      await userStore.consumeToken(tokenId);

      const token = await userStore.findTokenByHash('hash-consumed');
      expect(token).toBeNull();
    });

    it('should not return expired tokens', async () => {
      const user = await createTestUser();
      await userStore.saveToken({
        userId: user.id,
        type: 'refresh_token',
        tokenHash: 'hash-expired',
        expiresAt: new Date(Date.now() - 1000),
      });

      const token = await userStore.findTokenByHash('hash-expired');
      expect(token).toBeNull();
    });

    it('should return null when hash not found', async () => {
      const token = await userStore.findTokenByHash('nonexistent');
      expect(token).toBeNull();
    });
  });

  describe('consumeToken', () => {
    it('should set used_at and return true on first call', async () => {
      const user = await createTestUser();
      const tokenId = await userStore.saveToken({
        userId: user.id,
        type: 'password_reset',
        tokenHash: 'hash-consume',
        expiresAt: new Date(Date.now() + 60000),
      });

      const result = await userStore.consumeToken(tokenId);
      expect(result).toBe(true);
    });

    it('should return false on second call (atomic single-use)', async () => {
      const user = await createTestUser();
      const tokenId = await userStore.saveToken({
        userId: user.id,
        type: 'password_reset',
        tokenHash: 'hash-double',
        expiresAt: new Date(Date.now() + 60000),
      });

      const first = await userStore.consumeToken(tokenId);
      const second = await userStore.consumeToken(tokenId);

      expect(first).toBe(true);
      expect(second).toBe(false);
    });

    it('should return false for non-existent token id', async () => {
      const result = await userStore.consumeToken('00000000-0000-0000-0000-000000000000');
      expect(result).toBe(false);
    });
  });
});
