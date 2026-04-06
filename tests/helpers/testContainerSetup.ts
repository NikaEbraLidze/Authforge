/**
 * Testcontainers PostgreSQL setup for Authforge integration tests.
 *
 * Provides a reusable lifecycle helper that starts a PostgreSQL container,
 * creates a Knex instance, runs migrations, and supports table truncation
 * between tests for isolation.
 */

import { GenericContainer, StartedTestContainer, Wait } from 'testcontainers';
import knex, { Knex } from 'knex';
import { createTables } from '@/migrations/tables';

const PG_USER = 'authforge_test';
const PG_PASSWORD = 'authforge_test';
const PG_DB = 'authforge_test';

export interface TestContainerContext {
  knex: Knex;
  container: StartedTestContainer;
}

/**
 * Start a PostgreSQL container and return a configured Knex instance.
 * Runs createTables() to set up the schema.
 */
export async function startPostgresContainer(): Promise<TestContainerContext> {
  const container = await new GenericContainer('postgres:16-alpine')
    .withEnvironment({
      POSTGRES_USER: PG_USER,
      POSTGRES_PASSWORD: PG_PASSWORD,
      POSTGRES_DB: PG_DB,
    })
    .withExposedPorts(5432)
    .withWaitStrategy(Wait.forLogMessage('database system is ready to accept connections', 2))
    .start();

  const knexInstance = knex({
    client: 'pg',
    connection: {
      host: container.getHost(),
      port: container.getMappedPort(5432),
      user: PG_USER,
      password: PG_PASSWORD,
      database: PG_DB,
    },
  });

  await createTables(knexInstance);

  return { knex: knexInstance, container };
}

/**
 * Destroy the Knex connection pool and stop the container.
 */
export async function stopPostgresContainer(ctx: TestContainerContext): Promise<void> {
  await ctx.knex.destroy();
  await ctx.container.stop();
}

/**
 * Truncate all Authforge tables with CASCADE for test isolation.
 * Safe to call between tests — order doesn't matter with CASCADE.
 */
export async function truncateAll(knexInstance: Knex, tablePrefix = 'authforge_'): Promise<void> {
  await knexInstance.raw(`
    TRUNCATE TABLE
      ${tablePrefix}user_tokens,
      ${tablePrefix}user_roles,
      ${tablePrefix}roles,
      ${tablePrefix}users
    CASCADE
  `);
}
