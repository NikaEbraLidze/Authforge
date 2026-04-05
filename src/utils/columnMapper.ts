/**
 * Column mapping utilities for converting between TypeScript camelCase
 * properties and PostgreSQL snake_case column names.
 *
 * Uses explicit column maps (not regex-based conversion) so mappings are
 * auditable and type-safe. Each entity has its own map to prevent
 * accidental cross-entity key collisions.
 */

/** Mapping from camelCase TypeScript key → snake_case DB column */
export type ColumnMap = Record<string, string>;

// ── Entity Column Maps ───────────────────────────────────────────────

export const USER_COLUMN_MAP: ColumnMap = {
  id: 'id',
  username: 'username',
  email: 'email',
  passwordHash: 'password_hash',
  emailConfirmed: 'email_confirmed',
  securityStamp: 'security_stamp',
  lockoutEnabled: 'lockout_enabled',
  lockoutEnd: 'lockout_end',
  accessFailedCount: 'access_failed_count',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
};

export const ROLE_COLUMN_MAP: ColumnMap = {
  id: 'id',
  name: 'name',
  createdAt: 'created_at',
};

export const TOKEN_COLUMN_MAP: ColumnMap = {
  id: 'id',
  userId: 'user_id',
  type: 'type',
  tokenHash: 'token_hash',
  expiresAt: 'expires_at',
  usedAt: 'used_at',
  createdAt: 'created_at',
};

// ── Conversion Functions ─────────────────────────────────────────────

/**
 * Convert a camelCase object to snake_case DB columns using an explicit map.
 * Keys not present in the map are silently dropped to prevent
 * writing unexpected columns to the database.
 */
export function mapToDb(
  data: Record<string, unknown>,
  columnMap: ColumnMap,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [camelKey, value] of Object.entries(data)) {
    const dbColumn = columnMap[camelKey];
    if (dbColumn !== undefined && value !== undefined) {
      result[dbColumn] = value;
    }
  }
  return result;
}

/**
 * Convert a snake_case DB row to a camelCase TypeScript object.
 * Builds a reverse map from the provided column map so that
 * only known columns are included in the result.
 */
export function mapFromDb<T>(
  row: Record<string, unknown>,
  columnMap: ColumnMap,
): T {
  // Build reverse map: snake_case → camelCase
  const reverseMap: Record<string, string> = {};
  for (const [camelKey, dbColumn] of Object.entries(columnMap)) {
    reverseMap[dbColumn] = camelKey;
  }

  const result: Record<string, unknown> = {};
  for (const [dbColumn, value] of Object.entries(row)) {
    const camelKey = reverseMap[dbColumn];
    if (camelKey !== undefined) {
      result[camelKey] = value;
    }
  }
  return result as T;
}

// ── Table Name Helper ────────────────────────────────────────────────

/**
 * Build a prefixed table name.
 * Centralizes prefix logic so it's applied consistently across
 * migrations, stores, and FK references.
 */
export function tableName(name: string, prefix: string): string {
  return `${prefix}${name}`;
}
