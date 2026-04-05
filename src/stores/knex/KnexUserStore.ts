/**
 * Knex-based implementation of IUserStore.
 *
 * Handles all user and user-token CRUD against a relational database via Knex.
 * Column names are mapped between TypeScript camelCase and DB snake_case using
 * explicit column maps — no magic string manipulation.
 *
 * Token storage: tokens are stored pre-hashed (SHA-256 happens in TokenService
 * before calling saveToken). This store never sees raw token values.
 */

import { Knex } from 'knex';
import { v4 as uuidv4 } from 'uuid';
import { IUserStore } from '../../interfaces/IUserStore';
import {
  CreateUserData,
  IdentityUser,
  SaveTokenData,
  TokenType,
  UserToken,
} from '../../types';
import {
  mapToDb,
  mapFromDb,
  tableName,
  USER_COLUMN_MAP,
  TOKEN_COLUMN_MAP,
} from '../../utils/columnMapper';

export class KnexUserStore implements IUserStore {
  constructor(
    private readonly knex: Knex,
    private readonly tablePrefix: string = 'authforge_',
  ) {}

  /** Prefixed users table name */
  private get users(): string {
    return tableName('users', this.tablePrefix);
  }

  /** Prefixed user_tokens table name */
  private get userTokens(): string {
    return tableName('user_tokens', this.tablePrefix);
  }

  /**
   * Create a new user record.
   *
   * Generates UUID and security_stamp in the application layer (not DB)
   * for portability across database engines. The `password` field from
   * CreateUserData is deliberately excluded — only the pre-hashed
   * `passwordHash` is written to the database.
   */
  async create(data: CreateUserData & { passwordHash: string }): Promise<IdentityUser> {
    const now = new Date();
    const user: IdentityUser = {
      id: uuidv4(),
      username: data.username,
      email: data.email,
      passwordHash: data.passwordHash,
      emailConfirmed: false,
      securityStamp: uuidv4(),
      lockoutEnabled: true,
      lockoutEnd: null,
      accessFailedCount: 0,
      createdAt: now,
      updatedAt: now,
    };

    const dbRow = mapToDb(user as unknown as Record<string, unknown>, USER_COLUMN_MAP);
    await this.knex(this.users).insert(dbRow);

    return user;
  }

  async findById(id: string): Promise<IdentityUser | null> {
    const row = await this.knex(this.users).where('id', id).first();
    // Knex returns undefined for no match; normalize to null per interface contract
    return row ? mapFromDb<IdentityUser>(row as Record<string, unknown>, USER_COLUMN_MAP) : null;
  }

  async findByEmail(email: string): Promise<IdentityUser | null> {
    const row = await this.knex(this.users).where('email', email).first();
    return row ? mapFromDb<IdentityUser>(row as Record<string, unknown>, USER_COLUMN_MAP) : null;
  }

  async findByUsername(username: string): Promise<IdentityUser | null> {
    const row = await this.knex(this.users).where('username', username).first();
    return row ? mapFromDb<IdentityUser>(row as Record<string, unknown>, USER_COLUMN_MAP) : null;
  }

  /**
   * Partial update of a user record.
   * Automatically sets `updatedAt` to the current timestamp.
   */
  async update(id: string, data: Partial<IdentityUser>): Promise<void> {
    const withTimestamp = { ...data, updatedAt: new Date() };
    const dbData = mapToDb(
      withTimestamp as unknown as Record<string, unknown>,
      USER_COLUMN_MAP,
    );
    await this.knex(this.users).where('id', id).update(dbData);
  }

  async delete(id: string): Promise<void> {
    // FK CASCADE handles cleanup of user_roles and user_tokens
    await this.knex(this.users).where('id', id).del();
  }

  /**
   * Store a pre-hashed token in the database.
   * Returns the generated token record ID (not the raw token — that's
   * managed by the caller, typically TokenService).
   */
  async saveToken(data: SaveTokenData): Promise<string> {
    const id = uuidv4();
    const row = {
      id,
      user_id: data.userId,
      type: data.type,
      token_hash: data.tokenHash,
      expires_at: data.expiresAt,
      created_at: new Date(),
    };
    await this.knex(this.userTokens).insert(row);
    return id;
  }

  /**
   * Find the most recent valid (unconsumed, unexpired) token for a user by type.
   * Used for email verification and password reset flows where the userId is known.
   */
  async findToken(userId: string, type: TokenType): Promise<UserToken | null> {
    const row = await this.knex(this.userTokens)
      .where({ user_id: userId, type })
      .whereNull('used_at')
      .where('expires_at', '>', new Date())
      .orderBy('created_at', 'desc')
      .first();

    return row
      ? mapFromDb<UserToken>(row as Record<string, unknown>, TOKEN_COLUMN_MAP)
      : null;
  }

  /**
   * Find a valid token by its SHA-256 hash.
   * Used for refresh token validation where the userId is not known upfront —
   * the caller only has the raw token, hashes it, and looks up by hash.
   */
  async findTokenByHash(tokenHash: string): Promise<UserToken | null> {
    const row = await this.knex(this.userTokens)
      .where({ token_hash: tokenHash })
      .whereNull('used_at')
      .where('expires_at', '>', new Date())
      .first();

    return row
      ? mapFromDb<UserToken>(row as Record<string, unknown>, TOKEN_COLUMN_MAP)
      : null;
  }

  /**
   * Atomically mark a token as consumed by setting `used_at`.
   *
   * The WHERE clause includes `used_at IS NULL` so that concurrent requests
   * racing to consume the same token will have at most one succeed —
   * the second UPDATE matches zero rows and returns false.
   *
   * Returns true if the token was consumed, false if it was already used.
   */
  async consumeToken(tokenId: string): Promise<boolean> {
    const affectedRows = await this.knex(this.userTokens)
      .where('id', tokenId)
      .whereNull('used_at')
      .update({ used_at: new Date() });

    return affectedRows > 0;
  }
}
