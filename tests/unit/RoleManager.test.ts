import { RoleManager } from '@/core/RoleManager';
import { IRoleStore } from '@/interfaces/IRoleStore';
import {
  createMockRoleStore,
  createMockRole,
} from '../helpers/mockFactories';

describe('RoleManager', () => {
  let mockRoleStore: jest.Mocked<IRoleStore>;
  let roleManager: RoleManager;

  beforeEach(() => {
    mockRoleStore = createMockRoleStore();
    roleManager = new RoleManager(mockRoleStore);
  });

  describe('createRole', () => {
    it('should create and return role when name is unique', async () => {
      mockRoleStore.findByName.mockResolvedValue(null);
      const role = createMockRole({ name: 'editor' });
      mockRoleStore.create.mockResolvedValue(role);

      const result = await roleManager.createRole('editor');

      expect(result.success).toBe(true);
      expect(result.role).toEqual(role);
      expect(mockRoleStore.create).toHaveBeenCalledWith('editor');
    });

    it('should return error when role name already exists', async () => {
      mockRoleStore.findByName.mockResolvedValue(createMockRole());

      const result = await roleManager.createRole('admin');

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Role "admin" already exists.');
      expect(mockRoleStore.create).not.toHaveBeenCalled();
    });
  });

  describe('deleteRole', () => {
    it('should delete role when it exists', async () => {
      const role = createMockRole();
      mockRoleStore.findById.mockResolvedValue(role);

      const result = await roleManager.deleteRole(role.id);

      expect(result.success).toBe(true);
      expect(mockRoleStore.delete).toHaveBeenCalledWith(role.id);
    });

    it('should return error when role not found', async () => {
      mockRoleStore.findById.mockResolvedValue(null);

      const result = await roleManager.deleteRole('nonexistent');

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Role not found.');
      expect(mockRoleStore.delete).not.toHaveBeenCalled();
    });
  });

  describe('findByName', () => {
    it('should delegate to roleStore.findByName', async () => {
      const role = createMockRole();
      mockRoleStore.findByName.mockResolvedValue(role);

      const result = await roleManager.findByName('admin');

      expect(result).toEqual(role);
      expect(mockRoleStore.findByName).toHaveBeenCalledWith('admin');
    });

    it('should return null when role not found', async () => {
      mockRoleStore.findByName.mockResolvedValue(null);

      const result = await roleManager.findByName('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('addToRole', () => {
    it('should find role, check assignment, then call addToUser', async () => {
      const role = createMockRole();
      mockRoleStore.findByName.mockResolvedValue(role);
      mockRoleStore.isInRole.mockResolvedValue(false);

      const result = await roleManager.addToRole('user-1', 'admin');

      expect(result.success).toBe(true);
      expect(mockRoleStore.addToUser).toHaveBeenCalledWith('user-1', role.id);
    });

    it('should return error when role does not exist', async () => {
      mockRoleStore.findByName.mockResolvedValue(null);

      const result = await roleManager.addToRole('user-1', 'nonexistent');

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Role "nonexistent" not found.');
    });

    it('should return error when user is already in role', async () => {
      mockRoleStore.findByName.mockResolvedValue(createMockRole());
      mockRoleStore.isInRole.mockResolvedValue(true);

      const result = await roleManager.addToRole('user-1', 'admin');

      expect(result.success).toBe(false);
      expect(result.errors).toContain('User is already in role "admin".');
      expect(mockRoleStore.addToUser).not.toHaveBeenCalled();
    });
  });

  describe('removeFromRole', () => {
    it('should find role, check assignment, then call removeFromUser', async () => {
      const role = createMockRole();
      mockRoleStore.findByName.mockResolvedValue(role);
      mockRoleStore.isInRole.mockResolvedValue(true);

      const result = await roleManager.removeFromRole('user-1', 'admin');

      expect(result.success).toBe(true);
      expect(mockRoleStore.removeFromUser).toHaveBeenCalledWith('user-1', role.id);
    });

    it('should return error when role does not exist', async () => {
      mockRoleStore.findByName.mockResolvedValue(null);

      const result = await roleManager.removeFromRole('user-1', 'nonexistent');

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Role "nonexistent" not found.');
    });

    it('should return error when user is not in role', async () => {
      mockRoleStore.findByName.mockResolvedValue(createMockRole());
      mockRoleStore.isInRole.mockResolvedValue(false);

      const result = await roleManager.removeFromRole('user-1', 'admin');

      expect(result.success).toBe(false);
      expect(result.errors).toContain('User is not in role "admin".');
      expect(mockRoleStore.removeFromUser).not.toHaveBeenCalled();
    });
  });

  describe('isInRole', () => {
    it('should delegate to roleStore.isInRole', async () => {
      mockRoleStore.isInRole.mockResolvedValue(true);

      const result = await roleManager.isInRole('user-1', 'admin');

      expect(result).toBe(true);
      expect(mockRoleStore.isInRole).toHaveBeenCalledWith('user-1', 'admin');
    });
  });

  describe('getRoles', () => {
    it('should delegate to roleStore.getRolesForUser', async () => {
      const roles = [createMockRole(), createMockRole({ id: 'role-2', name: 'editor' })];
      mockRoleStore.getRolesForUser.mockResolvedValue(roles);

      const result = await roleManager.getRoles('user-1');

      expect(result).toEqual(roles);
      expect(mockRoleStore.getRolesForUser).toHaveBeenCalledWith('user-1');
    });

    it('should return empty array when user has no roles', async () => {
      mockRoleStore.getRolesForUser.mockResolvedValue([]);

      const result = await roleManager.getRoles('user-1');

      expect(result).toEqual([]);
    });
  });
});
