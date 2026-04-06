/**
 * Shared service factory used by both NestJS and Express adapters.
 *
 * Takes an AuthforgeConfig and wires up the complete service graph:
 * Knex → Stores → Hasher/TokenService → UserManager/RoleManager.
 *
 * This is an internal utility — not exported from the public API.
 * Consumers interact with the framework-specific adapters instead.
 */

import knex, { Knex } from 'knex';
import { AuthforgeConfig } from '../types';
import { IPasswordHasher } from '../interfaces/IPasswordHasher';
import { ITokenService } from '../interfaces/ITokenService';
import { KnexUserStore } from '../stores/knex/KnexUserStore';
import { KnexRoleStore } from '../stores/knex/KnexRoleStore';
import { PasswordHasher } from '../core/PasswordHasher';
import { TokenService } from '../core/TokenService';
import { UserManager } from '../core/UserManager';
import { RoleManager } from '../core/RoleManager';

export interface AuthforgeServices {
  knex: Knex;
  userStore: KnexUserStore;
  roleStore: KnexRoleStore;
  passwordHasher: IPasswordHasher;
  tokenService: ITokenService;
  userManager: UserManager;
  roleManager: RoleManager;
}

/**
 * Create the full Authforge service graph from a config object.
 *
 * Knex connections are lazy — no database call happens until the first query.
 * This function is synchronous and safe to call during module initialization.
 */
export function createAuthforgeServices(config: AuthforgeConfig): AuthforgeServices {
  const knexInstance = knex({
    client: config.db.client,
    connection: config.db.connection,
  });

  const tablePrefix = config.tablePrefix ?? 'authforge_';
  const userStore = new KnexUserStore(knexInstance, tablePrefix);
  const roleStore = new KnexRoleStore(knexInstance, tablePrefix);

  const passwordHasher = config.passwordHasher ?? new PasswordHasher(config.bcrypt?.rounds);

  const tokenService = new TokenService(
    config.jwt.secret,
    userStore,
    config.jwt.expiresIn,
    config.jwt.refreshExpiresIn,
  );

  const userManager = new UserManager(
    userStore,
    roleStore,
    passwordHasher,
    tokenService,
    config.emailService,
    config.lockout,
  );

  const roleManager = new RoleManager(roleStore);

  return {
    knex: knexInstance,
    userStore,
    roleStore,
    passwordHasher,
    tokenService,
    userManager,
    roleManager,
  };
}
