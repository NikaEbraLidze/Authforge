/**
 * NestJS dynamic module for Authforge.
 *
 * Provides `forRoot()` and `forRootAsync()` static methods to wire up
 * the full Authforge service graph (stores, hasher, token service,
 * UserManager, RoleManager) and register them as injectable providers.
 *
 * The module is global — import it once in your AppModule and all
 * Authforge services are available throughout the application via
 * their injection tokens (AUTHFORGE_USER_MANAGER, etc.).
 *
 * The module destroys the Knex connection pool on application shutdown.
 *
 * @example
 * ```typescript
 * // Synchronous config
 * @Module({
 *   imports: [AuthforgeModule.forRoot({ db: { ... }, jwt: { ... } })],
 * })
 * export class AppModule {}
 *
 * // Async config (e.g., from ConfigService)
 * @Module({
 *   imports: [
 *     AuthforgeModule.forRootAsync({
 *       imports: [ConfigModule],
 *       inject: [ConfigService],
 *       useFactory: (configService: ConfigService) => ({
 *         db: { client: 'pg', connection: configService.get('DATABASE_URL') },
 *         jwt: { secret: configService.get('JWT_SECRET') },
 *       }),
 *     }),
 *   ],
 * })
 * export class AppModule {}
 * ```
 */

import {
  DynamicModule,
  Global,
  Module,
  OnModuleDestroy,
  Provider,
} from '@nestjs/common';
import { Knex } from 'knex';
import { AuthforgeConfig } from '../../types';
import { createAuthforgeServices, AuthforgeServices } from '../createAuthforgeServices';
import {
  AUTHFORGE_USER_MANAGER,
  AUTHFORGE_ROLE_MANAGER,
  AUTHFORGE_TOKEN_SERVICE,
  AUTHFORGE_KNEX,
} from './tokens';
import { AuthforgeGuard } from './AuthforgeGuard';

/** Internal token for the services container — used by OnModuleDestroy */
const AUTHFORGE_SERVICES = 'AUTHFORGE_SERVICES';

export interface AuthforgeModuleAsyncOptions {
  imports?: DynamicModule['imports'];
  inject?: Provider[] | string[];
  useFactory: (...args: unknown[]) => AuthforgeConfig | Promise<AuthforgeConfig>;
}

@Global()
@Module({})
export class AuthforgeModule implements OnModuleDestroy {
  private knex: Knex | null = null;

  /** Synchronous configuration — config is available at import time. */
  static forRoot(config: AuthforgeConfig): DynamicModule {
    const services = createAuthforgeServices(config);

    return {
      module: AuthforgeModule,
      providers: [
        { provide: AUTHFORGE_SERVICES, useValue: services },
        { provide: AUTHFORGE_KNEX, useValue: services.knex },
        { provide: AUTHFORGE_USER_MANAGER, useValue: services.userManager },
        { provide: AUTHFORGE_ROLE_MANAGER, useValue: services.roleManager },
        { provide: AUTHFORGE_TOKEN_SERVICE, useValue: services.tokenService },
        AuthforgeGuard,
      ],
      exports: [
        AUTHFORGE_KNEX,
        AUTHFORGE_USER_MANAGER,
        AUTHFORGE_ROLE_MANAGER,
        AUTHFORGE_TOKEN_SERVICE,
        AuthforgeGuard,
      ],
    };
  }

  /**
   * Asynchronous configuration — config is resolved via a factory function.
   * Useful when config depends on other NestJS modules (e.g., ConfigService).
   */
  static forRootAsync(options: AuthforgeModuleAsyncOptions): DynamicModule {
    const servicesProvider: Provider = {
      provide: AUTHFORGE_SERVICES,
      useFactory: async (...args: unknown[]) => {
        const config = await options.useFactory(...args);
        return createAuthforgeServices(config);
      },
      inject: (options.inject as string[]) ?? [],
    };

    return {
      module: AuthforgeModule,
      imports: options.imports ?? [],
      providers: [
        servicesProvider,
        {
          provide: AUTHFORGE_KNEX,
          useFactory: (services: AuthforgeServices) => services.knex,
          inject: [AUTHFORGE_SERVICES],
        },
        {
          provide: AUTHFORGE_USER_MANAGER,
          useFactory: (services: AuthforgeServices) => services.userManager,
          inject: [AUTHFORGE_SERVICES],
        },
        {
          provide: AUTHFORGE_ROLE_MANAGER,
          useFactory: (services: AuthforgeServices) => services.roleManager,
          inject: [AUTHFORGE_SERVICES],
        },
        {
          provide: AUTHFORGE_TOKEN_SERVICE,
          useFactory: (services: AuthforgeServices) => services.tokenService,
          inject: [AUTHFORGE_SERVICES],
        },
        AuthforgeGuard,
      ],
      exports: [
        AUTHFORGE_KNEX,
        AUTHFORGE_USER_MANAGER,
        AUTHFORGE_ROLE_MANAGER,
        AUTHFORGE_TOKEN_SERVICE,
        AuthforgeGuard,
      ],
    };
  }

  /**
   * Clean up the Knex connection pool when the NestJS application shuts down.
   * Injected via the AUTHFORGE_SERVICES token set by forRoot/forRootAsync.
   */
  async onModuleDestroy(): Promise<void> {
    if (this.knex) {
      await this.knex.destroy();
    }
  }
}
