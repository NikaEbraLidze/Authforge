/**
 * RoleManager — role CRUD and user-role assignment service.
 *
 * Wraps IRoleStore operations with validation and structured error handling.
 * All expected failures (duplicate role, role not found, etc.) return
 * IdentityResult — never leaking raw database exceptions to callers.
 *
 * This is the consumer-facing API for role management. The underlying
 * IRoleStore handles the actual database operations.
 */

import { IRoleStore } from '../interfaces/IRoleStore';
import { IdentityResult, IdentityRole } from '../types';

export class RoleManager {
  constructor(private readonly roleStore: IRoleStore) {}

  /**
   * Create a new role.
   * Returns an error if a role with the same name already exists.
   */
  async createRole(name: string): Promise<IdentityResult & { role?: IdentityRole }> {
    const existing = await this.roleStore.findByName(name);
    if (existing) {
      return { success: false, errors: [`Role "${name}" already exists.`] };
    }

    const role = await this.roleStore.create(name);
    return { success: true, role };
  }

  /**
   * Delete a role by ID.
   * Returns an error if the role doesn't exist.
   * FK CASCADE on user_roles automatically removes all user assignments.
   */
  async deleteRole(roleId: string): Promise<IdentityResult> {
    const role = await this.roleStore.findById(roleId);
    if (!role) {
      return { success: false, errors: ['Role not found.'] };
    }

    await this.roleStore.delete(roleId);
    return { success: true };
  }

  /** Find a role by name. Returns null if not found. */
  async findByName(name: string): Promise<IdentityRole | null> {
    return this.roleStore.findByName(name);
  }

  /**
   * Assign a role to a user by role name.
   *
   * Validates that the role exists and the user isn't already assigned,
   * returning a structured error instead of letting the DB throw on
   * duplicate composite primary key violations.
   */
  async addToRole(userId: string, roleName: string): Promise<IdentityResult> {
    const role = await this.roleStore.findByName(roleName);
    if (!role) {
      return { success: false, errors: [`Role "${roleName}" not found.`] };
    }

    // Check before insert to avoid DB-level PK violation
    const alreadyAssigned = await this.roleStore.isInRole(userId, roleName);
    if (alreadyAssigned) {
      return { success: false, errors: [`User is already in role "${roleName}".`] };
    }

    await this.roleStore.addToUser(userId, role.id);
    return { success: true };
  }

  /**
   * Remove a role from a user by role name.
   * Returns an error if the role doesn't exist or the user isn't in that role.
   */
  async removeFromRole(userId: string, roleName: string): Promise<IdentityResult> {
    const role = await this.roleStore.findByName(roleName);
    if (!role) {
      return { success: false, errors: [`Role "${roleName}" not found.`] };
    }

    const isAssigned = await this.roleStore.isInRole(userId, roleName);
    if (!isAssigned) {
      return { success: false, errors: [`User is not in role "${roleName}".`] };
    }

    await this.roleStore.removeFromUser(userId, role.id);
    return { success: true };
  }

  /** Check if a user has a specific role. */
  async isInRole(userId: string, roleName: string): Promise<boolean> {
    return this.roleStore.isInRole(userId, roleName);
  }

  /** Get all roles assigned to a user. */
  async getRoles(userId: string): Promise<IdentityRole[]> {
    return this.roleStore.getRolesForUser(userId);
  }
}
