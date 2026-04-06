// Types
export type {
  IdentityUser,
  IdentityRole,
  IdentityResult,
  TokenPayload,
  AuthforgeConfig,
  TokenType,
  CreateUserData,
  SaveTokenData,
  UserToken,
} from './types';

// Interfaces
export type {
  IPasswordHasher,
  IUserStore,
  IRoleStore,
  ITokenService,
  IEmailService,
} from './interfaces';

// Core
export { UserManager } from './core/UserManager';
export type { LockoutConfig } from './core/UserManager';
export { RoleManager } from './core/RoleManager';
export { PasswordHasher } from './core/PasswordHasher';
export { TokenService } from './core/TokenService';

// Stores
export { KnexUserStore } from './stores/knex/KnexUserStore';
export { KnexRoleStore } from './stores/knex/KnexRoleStore';

// Migrations
export { createTables } from './migrations/tables';
