import { Knex } from 'knex';
import { v4 as uuidv4 } from 'uuid';
import { KnexRoleStore } from '@/stores/knex/KnexRoleStore';
import {
  startPostgresContainer,
  stopPostgresContainer,
  truncateAll,
  TestContainerContext,
} from '../helpers/testContainerSetup';

describe('KnexRoleStore (integration)', () => {
  let ctx: TestContainerContext;
  let knexInstance: Knex;
  let roleStore: KnexRoleStore;

  beforeAll(async () => {
    ctx = await startPostgresContainer();
    knexInstance = ctx.knex;
    roleStore = new KnexRoleStore(knexInstance);
  }, 60_000);

  afterAll(async () => {
    await stopPostgresContainer(ctx);
  });

  beforeEach(async () => {
    await truncateAll(knexInstance);
  });

  /** Insert a user directly via Knex (not via KnexUserStore) for FK requirements */
  async function insertTestUser(id?: string): Promise<string> {
    const userId = id ?? uuidv4();
    await knexInstance('authforge_users').insert({
      id: userId,
      username: `user-${userId.slice(0, 8)}`,
      email: `${userId.slice(0, 8)}@test.com`,
      password_hash: '$2b$04$fakehash',
      email_confirmed: false,
      security_stamp: uuidv4(),
      lockout_enabled: true,
      access_failed_count: 0,
      created_at: new Date(),
      updated_at: new Date(),
    });
    return userId;
  }

  // ── create ──────────────────────────────────────────────────────

  describe('create', () => {
    it('should insert a role and return it with generated id and createdAt', async () => {
      const role = await roleStore.create('admin');

      expect(role.id).toBeDefined();
      expect(role.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
      expect(role.name).toBe('admin');
      expect(role.createdAt).toBeInstanceOf(Date);
    });

    it('should throw on duplicate role name', async () => {
      await roleStore.create('admin');
      await expect(roleStore.create('admin')).rejects.toThrow();
    });
  });

  // ── findById ────────────────────────────────────────────────────

  describe('findById', () => {
    it('should return the role when found', async () => {
      const created = await roleStore.create('editor');
      const found = await roleStore.findById(created.id);

      expect(found).not.toBeNull();
      expect(found!.name).toBe('editor');
    });

    it('should return null when id does not exist', async () => {
      const found = await roleStore.findById('00000000-0000-0000-0000-000000000000');
      expect(found).toBeNull();
    });
  });

  // ── findByName ──────────────────────────────────────────────────

  describe('findByName', () => {
    it('should return the role matching the name', async () => {
      await roleStore.create('viewer');
      const found = await roleStore.findByName('viewer');

      expect(found).not.toBeNull();
      expect(found!.name).toBe('viewer');
    });

    it('should return null when name not found', async () => {
      const found = await roleStore.findByName('nonexistent');
      expect(found).toBeNull();
    });
  });

  // ── delete ──────────────────────────────────────────────────────

  describe('delete', () => {
    it('should remove the role record', async () => {
      const role = await roleStore.create('temp');
      await roleStore.delete(role.id);

      const found = await roleStore.findById(role.id);
      expect(found).toBeNull();
    });

    it('should cascade-delete user_roles assignments', async () => {
      const userId = await insertTestUser();
      const role = await roleStore.create('admin');
      await roleStore.addToUser(userId, role.id);

      await roleStore.delete(role.id);

      // Verify junction record is gone
      const row = await knexInstance('authforge_user_roles')
        .where({ user_id: userId, role_id: role.id })
        .first();
      expect(row).toBeUndefined();
    });

    it('should not throw when deleting non-existent role', async () => {
      await expect(
        roleStore.delete('00000000-0000-0000-0000-000000000000'),
      ).resolves.toBeUndefined();
    });
  });

  // ── addToUser ───────────────────────────────────────────────────

  describe('addToUser', () => {
    it('should create a user_roles junction record', async () => {
      const userId = await insertTestUser();
      const role = await roleStore.create('admin');

      await roleStore.addToUser(userId, role.id);

      const row = await knexInstance('authforge_user_roles')
        .where({ user_id: userId, role_id: role.id })
        .first();
      expect(row).toBeDefined();
    });

    it('should throw on duplicate assignment', async () => {
      const userId = await insertTestUser();
      const role = await roleStore.create('admin');

      await roleStore.addToUser(userId, role.id);
      await expect(roleStore.addToUser(userId, role.id)).rejects.toThrow();
    });
  });

  // ── removeFromUser ──────────────────────────────────────────────

  describe('removeFromUser', () => {
    it('should delete the junction record', async () => {
      const userId = await insertTestUser();
      const role = await roleStore.create('admin');
      await roleStore.addToUser(userId, role.id);

      await roleStore.removeFromUser(userId, role.id);

      const row = await knexInstance('authforge_user_roles')
        .where({ user_id: userId, role_id: role.id })
        .first();
      expect(row).toBeUndefined();
    });

    it('should not throw when removing non-existent assignment', async () => {
      const userId = await insertTestUser();
      const role = await roleStore.create('admin');

      await expect(
        roleStore.removeFromUser(userId, role.id),
      ).resolves.toBeUndefined();
    });
  });

  // ── getRolesForUser ─────────────────────────────────────────────

  describe('getRolesForUser', () => {
    it('should return all roles assigned to a user', async () => {
      const userId = await insertTestUser();
      const admin = await roleStore.create('admin');
      const editor = await roleStore.create('editor');
      await roleStore.addToUser(userId, admin.id);
      await roleStore.addToUser(userId, editor.id);

      const roles = await roleStore.getRolesForUser(userId);

      expect(roles).toHaveLength(2);
      const names = roles.map((r) => r.name).sort();
      expect(names).toEqual(['admin', 'editor']);
    });

    it('should return empty array when user has no roles', async () => {
      const userId = await insertTestUser();
      const roles = await roleStore.getRolesForUser(userId);
      expect(roles).toEqual([]);
    });

    it('should return multiple roles when user has several', async () => {
      const userId = await insertTestUser();
      for (const name of ['a', 'b', 'c']) {
        const role = await roleStore.create(name);
        await roleStore.addToUser(userId, role.id);
      }

      const roles = await roleStore.getRolesForUser(userId);
      expect(roles).toHaveLength(3);
    });
  });

  // ── isInRole ────────────────────────────────────────────────────

  describe('isInRole', () => {
    it('should return true when user has the role', async () => {
      const userId = await insertTestUser();
      const role = await roleStore.create('admin');
      await roleStore.addToUser(userId, role.id);

      const result = await roleStore.isInRole(userId, 'admin');
      expect(result).toBe(true);
    });

    it('should return false when user does not have the role', async () => {
      const userId = await insertTestUser();
      await roleStore.create('admin');

      const result = await roleStore.isInRole(userId, 'admin');
      expect(result).toBe(false);
    });

    it('should return false for a non-existent role name', async () => {
      const userId = await insertTestUser();

      const result = await roleStore.isInRole(userId, 'nonexistent');
      expect(result).toBe(false);
    });
  });
});
