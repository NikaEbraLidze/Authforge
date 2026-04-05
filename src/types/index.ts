export interface IdentityUser {
  id: string;
  username: string;
  email: string;
  passwordHash: string;
  emailConfirmed: boolean;
  securityStamp: string;
  lockoutEnabled: boolean;
  lockoutEnd: Date | null;
  accessFailedCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface IdentityRole {
  id: string;
  name: string;
  createdAt: Date;
}

export interface IdentityResult {
  success: boolean;
  errors?: string[];
}

export interface TokenPayload {
  sub: string;
  email: string;
  roles: string[];
  stamp: string;
  iat: number;
  exp: number;
}

export interface AuthforgeConfig {
  db: {
    client: 'pg' | 'mysql2' | 'sqlite3';
    connection: string | Record<string, unknown>;
  };
  jwt: {
    secret: string;
    expiresIn?: string;
    refreshExpiresIn?: string;
  };
  bcrypt?: {
    rounds?: number;
  };
  lockout?: {
    maxAttempts?: number;
    durationMinutes?: number;
  };
  tablePrefix?: string;
  passwordHasher?: IPasswordHasher;
  emailService?: IEmailService;
}

export type TokenType = 'email_verification' | 'password_reset' | 'refresh_token';

export interface CreateUserData {
  username: string;
  email: string;
  password: string;
}

export interface SaveTokenData {
  userId: string;
  type: TokenType;
  tokenHash: string;
  expiresAt: Date;
}

export interface UserToken {
  id: string;
  userId: string;
  type: TokenType;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
}

// Re-export interfaces for convenience
import type { IPasswordHasher } from '../interfaces/IPasswordHasher';
import type { IEmailService } from '../interfaces/IEmailService';
export type { IPasswordHasher, IEmailService };
