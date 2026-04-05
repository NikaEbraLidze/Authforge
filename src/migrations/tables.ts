/**
 * Idempotent database migration for Authforge tables.
 *
 * Creates all required tables (users, roles, user_roles, user_tokens) in
 * foreign-key dependency order. Each table is guarded by `hasTable()` so
 * calling this function multiple times is safe — it only creates what's missing.
 *
 * Consumers call this once at app startup (or via a setup script) and pass
 * their Knex instance. No CLI migration tooling is needed.
 */

import { Knex } from 'knex';
import { tableName } from '../utils/columnMapper';

const DEFAULT_PREFIX = 'authforge_';

/**
 * Create all Authforge tables if they don't already exist.
 *
 * Tables are created in FK-dependency order:
 * 1. users (no FK dependencies)
 * 2. roles (no FK dependencies)
 * 3. user_roles (FKs → users, roles)
 * 4. user_tokens (FK → users)
 *
 * @param knex - A configured Knex instance
 * @param tablePrefix - Optional prefix for table names (default: 'authforge_')
 */
export async function createTables(
  knex: Knex,
  tablePrefix: string = DEFAULT_PREFIX,
): Promise<void> {
  const usersTable = tableName('users', tablePrefix);
  const rolesTable = tableName('roles', tablePrefix);
  const userRolesTable = tableName('user_roles', tablePrefix);
  const userTokensTable = tableName('user_tokens', tablePrefix);

  // ── 1. Users table ───────────────────────────────────────────────
  if (!(await knex.schema.hasTable(usersTable))) {
    await knex.schema.createTable(usersTable, (table) => {
      table.uuid('id').primary();
      table.string('username', 256).unique().notNullable();
      table.string('email', 256).unique().notNullable();
      table.text('password_hash').notNullable();
      table.boolean('email_confirmed').notNullable().defaultTo(false);
      // security_stamp is regenerated on every password change;
      // embedded in JWTs to detect stale tokens after credential rotation
      table.uuid('security_stamp').notNullable();
      table.boolean('lockout_enabled').notNullable().defaultTo(true);
      table.timestamp('lockout_end', { useTz: true }).nullable();
      table.integer('access_failed_count').notNullable().defaultTo(0);
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    });
  }

  // ── 2. Roles table ──────────────────────────────────────────────
  if (!(await knex.schema.hasTable(rolesTable))) {
    await knex.schema.createTable(rolesTable, (table) => {
      table.uuid('id').primary();
      table.string('name', 256).unique().notNullable();
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    });
  }

  // ── 3. User-Roles junction table ────────────────────────────────
  // Composite primary key enforces one-assignment-per-role-per-user.
  // CASCADE deletes ensure cleanup when a user or role is removed.
  if (!(await knex.schema.hasTable(userRolesTable))) {
    await knex.schema.createTable(userRolesTable, (table) => {
      table.uuid('user_id').notNullable().references('id').inTable(usersTable).onDelete('CASCADE');
      table.uuid('role_id').notNullable().references('id').inTable(rolesTable).onDelete('CASCADE');
      table.primary(['user_id', 'role_id']);
    });
  }

  // ── 4. User tokens table ────────────────────────────────────────
  // Stores hashed tokens for email verification, password reset, and refresh tokens.
  // Raw tokens are NEVER stored — only SHA-256 hashes.
  // `used_at` marks single-use consumption; reuse is rejected.
  if (!(await knex.schema.hasTable(userTokensTable))) {
    await knex.schema.createTable(userTokensTable, (table) => {
      table.uuid('id').primary();
      table.uuid('user_id').notNullable().references('id').inTable(usersTable).onDelete('CASCADE');
      table.string('type', 64).notNullable(); // 'email_verification' | 'password_reset' | 'refresh_token'
      table.text('token_hash').notNullable();
      table.timestamp('expires_at', { useTz: true }).notNullable();
      table.timestamp('used_at', { useTz: true }).nullable();
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

      // Index for efficient lookups by hash (used by findTokenByHash in refresh token validation)
      table.index('token_hash');
    });
  }
}
