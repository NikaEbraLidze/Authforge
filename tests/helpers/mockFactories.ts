/**
 * Shared mock factories for Authforge unit tests.
 *
 * Provides factory functions for test data and mock implementations
 * of all interfaces. Each mock returns jest.fn() stubs with sensible
 * defaults that can be overridden per test.
 */

import { IUserStore } from '@/interfaces/IUserStore';
import { IRoleStore } from '@/interfaces/IRoleStore';
import { IPasswordHasher } from '@/interfaces/IPasswordHasher';
import { ITokenService } from '@/interfaces/ITokenService';
import { IEmailService } from '@/interfaces/IEmailService';
import {
  IdentityUser,
  IdentityRole,
  UserToken,
} from '@/types';

// ── Test Constants ──────────────────────────────────────────────────

/** Password that passes all validation rules (8+ chars, upper, lower, digit) */
export const VALID_PASSWORD = 'SecurePass1';

/** Named examples that each fail exactly one validation rule */
export const WEAK_PASSWORDS = {
  tooShort: 'Abc1',
  noUpper: 'securepass1',
  noLower: 'SECUREPASS1',
  noDigit: 'SecurePass',
};

const FIXED_DATE = new Date('2025-01-01T00:00:00Z');
const FIXED_UUID = '550e8400-e29b-41d4-a716-446655440000';

// ── Data Factories ──────────────────────────────────────────────────

export function createMockUser(overrides?: Partial<IdentityUser>): IdentityUser {
  return {
    id: FIXED_UUID,
    username: 'testuser',
    email: 'test@example.com',
    passwordHash: '$2b$04$hashedpassword',
    emailConfirmed: false,
    securityStamp: 'stamp-0001',
    lockoutEnabled: true,
    lockoutEnd: null,
    accessFailedCount: 0,
    createdAt: FIXED_DATE,
    updatedAt: FIXED_DATE,
    ...overrides,
  };
}

export function createMockRole(overrides?: Partial<IdentityRole>): IdentityRole {
  return {
    id: 'role-0001',
    name: 'admin',
    createdAt: FIXED_DATE,
    ...overrides,
  };
}

export function createMockToken(overrides?: Partial<UserToken>): UserToken {
  return {
    id: 'token-0001',
    userId: FIXED_UUID,
    type: 'password_reset',
    tokenHash: 'abc123hash',
    expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour from now
    usedAt: null,
    createdAt: FIXED_DATE,
    ...overrides,
  };
}

// ── Mock Store/Service Factories ────────────────────────────────────

export function createMockUserStore(): jest.Mocked<IUserStore> {
  return {
    create: jest.fn().mockResolvedValue(createMockUser()),
    findById: jest.fn().mockResolvedValue(null),
    findByEmail: jest.fn().mockResolvedValue(null),
    findByUsername: jest.fn().mockResolvedValue(null),
    update: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(undefined),
    saveToken: jest.fn().mockResolvedValue('token-id'),
    findToken: jest.fn().mockResolvedValue(null),
    findTokenByHash: jest.fn().mockResolvedValue(null),
    consumeToken: jest.fn().mockResolvedValue(true),
  };
}

export function createMockRoleStore(): jest.Mocked<IRoleStore> {
  return {
    create: jest.fn().mockResolvedValue(createMockRole()),
    findById: jest.fn().mockResolvedValue(null),
    findByName: jest.fn().mockResolvedValue(null),
    delete: jest.fn().mockResolvedValue(undefined),
    addToUser: jest.fn().mockResolvedValue(undefined),
    removeFromUser: jest.fn().mockResolvedValue(undefined),
    getRolesForUser: jest.fn().mockResolvedValue([]),
    isInRole: jest.fn().mockResolvedValue(false),
  };
}

export function createMockPasswordHasher(): jest.Mocked<IPasswordHasher> {
  return {
    hash: jest.fn().mockResolvedValue('hashed_password'),
    verify: jest.fn().mockResolvedValue(true),
  };
}

export function createMockTokenService(): jest.Mocked<ITokenService> {
  return {
    generateAccessToken: jest.fn().mockResolvedValue('access_token'),
    generateRefreshToken: jest.fn().mockResolvedValue('refresh_token'),
    validateAccessToken: jest.fn().mockResolvedValue(null),
    validateRefreshToken: jest.fn().mockResolvedValue(null),
    revokeRefreshToken: jest.fn().mockResolvedValue(undefined),
  };
}

export function createMockEmailService(): jest.Mocked<IEmailService> {
  return {
    sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
    sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
  };
}
