/**
 * Knex-based implementation of IRoleStore.
 *
 * Handles role CRUD and user-role assignment through the junction table.
 * Joins through `user_roles` to resolve role membership queries.
 *
 * FK CASCADE on the junction table means deleting a role automatically
 * removes all user-role assignments — no manual cleanup needed.
 */

import { Knex } from 'knex';
import { v4 as uuidv4 } from 'uuid';
import { IRoleStore } from '../../interfaces/IRoleStore';
import { IdentityRole } from '../../types';
import { mapFromDb, tableName, ROLE_COLUMN_MAP } from '../../utils/columnMapper';

export class KnexRoleStore implements IRoleStore {
  constructor(
    private readonly knex: Knex,
    private readonly tablePrefix: string = 'authforge_',
  ) {}

  private get roles(): string {
    return tableName('roles', this.tablePrefix);
  }

  private get userRoles(): string {
    return tableName('user_roles', this.tablePrefix);
  }

  async create(name: string): Promise<IdentityRole> {
    const role: IdentityRole = {
      id: uuidv4(),
      name,
      createdAt: new Date(),
    };

    await this.knex(this.roles).insert({
      id: role.id,
      name: role.name,
      created_at: role.createdAt,
    });

    return role;
  }

  async findById(id: string): Promise<IdentityRole | null> {
    const row = await this.knex(this.roles).where('id', id).first();
    return row ? mapFromDb<IdentityRole>(row as Record<string, unknown>, ROLE_COLUMN_MAP) : null;
  }

  async findByName(name: string): Promise<IdentityRole | null> {
    const row = await this.knex(this.roles).where('name', name).first();
    return row ? mapFromDb<IdentityRole>(row as Record<string, unknown>, ROLE_COLUMN_MAP) : null;
  }

  async delete(id: string): Promise<void> {
    // FK CASCADE on user_roles handles cleanup of assignments
    await this.knex(this.roles).where('id', id).del();
  }

  /**
   * Assign a role to a user via the junction table.
   * Throws on duplicate assignment (composite PK violation) — this is
   * intentional, as assigning a role twice is a programming error.
   */
  async addToUser(userId: string, roleId: string): Promise<void> {
    await this.knex(this.userRoles).insert({
      user_id: userId,
      role_id: roleId,
    });
  }

  async removeFromUser(userId: string, roleId: string): Promise<void> {
    await this.knex(this.userRoles).where({ user_id: userId, role_id: roleId }).del();
  }

  /**
   * Get all roles assigned to a user by joining through the junction table.
   * Returns an empty array if the user has no roles.
   */
  async getRolesForUser(userId: string): Promise<IdentityRole[]> {
    const rows = await this.knex(this.roles)
      .join(this.userRoles, `${this.roles}.id`, `${this.userRoles}.role_id`)
      .where(`${this.userRoles}.user_id`, userId)
      .select(`${this.roles}.*`);

    return rows.map((row) =>
      mapFromDb<IdentityRole>(row as Record<string, unknown>, ROLE_COLUMN_MAP),
    );
  }

  /**
   * Check if a user has a specific role by name.
   * Joins roles → user_roles and checks for a matching row.
   */
  async isInRole(userId: string, roleName: string): Promise<boolean> {
    const row = await this.knex(this.roles)
      .join(this.userRoles, `${this.roles}.id`, `${this.userRoles}.role_id`)
      .where(`${this.userRoles}.user_id`, userId)
      .andWhere(`${this.roles}.name`, roleName)
      .first();

    return !!row;
  }
}
