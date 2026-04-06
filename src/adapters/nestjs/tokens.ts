/**
 * NestJS injection tokens for Authforge services.
 *
 * String-based tokens are used instead of class references because the core
 * classes live outside the NestJS DI container. Consumers inject services
 * via @Inject(AUTHFORGE_USER_MANAGER) etc.
 */

export const AUTHFORGE_USER_MANAGER = 'AUTHFORGE_USER_MANAGER';
export const AUTHFORGE_ROLE_MANAGER = 'AUTHFORGE_ROLE_MANAGER';
export const AUTHFORGE_TOKEN_SERVICE = 'AUTHFORGE_TOKEN_SERVICE';
export const AUTHFORGE_KNEX = 'AUTHFORGE_KNEX';
