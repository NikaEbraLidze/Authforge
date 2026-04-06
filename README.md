# Authforge

ASP.NET Core Identity-inspired authentication and user management for Node.js.

[![npm version](https://img.shields.io/npm/v/authforge)](https://www.npmjs.com/package/authforge)
[![license](https://img.shields.io/npm/l/authforge)](./LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3+-blue)](https://www.typescriptlang.org/)
[![node](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org/)

## Features

Authforge brings the familiar `UserManager` / `RoleManager` pattern from .NET to Node.js with first-class TypeScript support and an interface-first architecture.

- **User management** — registration, sign-in, password reset, email confirmation
- **Role-based access control** — role CRUD, user-role assignment, role checks
- **JWT access tokens** with short-lived expiry and automatic refresh token rotation
- **bcrypt password hashing** with configurable rounds (default 12)
- **Account lockout** after configurable failed login attempts
- **Express middleware** adapter — drop-in authentication and role guards
- **NestJS dynamic module** adapter — guards, decorators, and DI integration
- **PostgreSQL** via Knex with idempotent table creation
- **security_stamp validation** — password changes instantly invalidate all sessions
- **Interface-first design** — swap any component (hasher, store, email service)

## Installation

```bash
npm install authforge pg
```

For Express projects:

```bash
npm install express
```

For NestJS projects:

```bash
npm install @nestjs/common @nestjs/core reflect-metadata
```

## Quick Start (Express)

```typescript
import express from 'express';
import { createTables } from 'authforge';
import { createAuthforge } from 'authforge/express';

const app = express();
app.use(express.json());

const auth = createAuthforge({
  db: { client: 'pg', connection: process.env.DATABASE_URL! },
  jwt: { secret: process.env.JWT_SECRET! },
});

// Create tables on startup (idempotent — safe to call every time)
await createTables(auth.knex);

// Validate JWT on every request (attaches payload to req.authforge)
app.use(auth.authenticate);

// Register
app.post('/register', async (req, res) => {
  const result = await auth.userManager.createUser(req.body);
  res.status(result.success ? 201 : 400).json(result);
});

// Sign in — returns { accessToken, refreshToken, user }
app.post('/login', async (req, res) => {
  const result = await auth.userManager.signIn(req.body.email, req.body.password);
  res.status(result.success ? 200 : 401).json(result);
});

// Protected route — req.authforge contains the TokenPayload
app.get('/profile', auth.requireAuth, (req, res) => {
  res.json({ userId: req.authforge!.sub, email: req.authforge!.email });
});

// Role-restricted route
app.get('/admin', auth.requireRoles('admin'), (req, res) => {
  res.json({ message: 'Welcome, admin.' });
});

app.listen(3000);
```

> **Note:** Authforge uses `req.authforge` (not `req.user`) to avoid conflicts with Passport.js.

## Quick Start (NestJS)

### Module Setup

```typescript
import { Module } from '@nestjs/common';
import { AuthforgeModule } from 'authforge/nestjs';

@Module({
  imports: [
    AuthforgeModule.forRoot({
      db: { client: 'pg', connection: process.env.DATABASE_URL! },
      jwt: { secret: process.env.JWT_SECRET! },
    }),
  ],
})
export class AppModule {}
```

For async configuration (e.g., from `ConfigService`), use `AuthforgeModule.forRootAsync()`:

```typescript
AuthforgeModule.forRootAsync({
  imports: [ConfigModule],
  inject: [ConfigService],
  useFactory: (config: ConfigService) => ({
    db: { client: 'pg', connection: config.get('DATABASE_URL') },
    jwt: { secret: config.get('JWT_SECRET') },
  }),
})
```

### Controller Usage

```typescript
import { Controller, Get, Post, Body, Inject, UseGuards } from '@nestjs/common';
import { UserManager } from 'authforge';
import {
  AUTHFORGE_USER_MANAGER,
  AuthforgeGuard,
  Roles,
  CurrentUser,
} from 'authforge/nestjs';
import { TokenPayload } from 'authforge';

@Controller()
export class AppController {
  constructor(
    @Inject(AUTHFORGE_USER_MANAGER) private userManager: UserManager,
  ) {}

  @Post('register')
  async register(@Body() body: { username: string; email: string; password: string }) {
    return this.userManager.createUser(body);
  }

  @UseGuards(AuthforgeGuard)
  @Get('profile')
  getProfile(@CurrentUser() user: TokenPayload) {
    return { userId: user.sub, email: user.email };
  }

  @Roles('admin')
  @UseGuards(AuthforgeGuard)
  @Get('admin')
  adminOnly(@CurrentUser('sub') userId: string) {
    return { message: 'Welcome, admin.', userId };
  }
}
```

## Configuration

| Property | Type | Default | Description |
| --- | --- | --- | --- |
| `db.client` | `'pg'` | **required** | Database client |
| `db.connection` | `string \| object` | **required** | Connection string or config object |
| `jwt.secret` | `string` | **required** | JWT signing secret |
| `jwt.expiresIn` | `string` | `'15m'` | Access token lifetime |
| `jwt.refreshExpiresIn` | `string` | `'7d'` | Refresh token lifetime |
| `bcrypt.rounds` | `number` | `12` | bcrypt cost factor |
| `lockout.maxAttempts` | `number` | `5` | Failed attempts before lockout |
| `lockout.durationMinutes` | `number` | `15` | Lockout duration in minutes |
| `tablePrefix` | `string` | `'authforge_'` | Database table name prefix |
| `passwordHasher` | `IPasswordHasher` | built-in bcrypt | Custom password hasher implementation |
| `emailService` | `IEmailService` | none | Email provider for verification and reset |

## API Overview

### UserManager

- `createUser(data)` — register a new user
- `signIn(email, password)` — authenticate and return tokens
- `signOut(refreshToken)` — revoke a refresh token
- `refreshTokens(refreshToken)` — rotate the token pair
- `changePassword(userId, currentPassword, newPassword)` — change password, invalidates sessions
- `generatePasswordResetToken(userId)` — generate a one-time reset token
- `resetPassword(userId, token, newPassword)` — reset password via token
- `generateEmailConfirmationToken(userId)` — generate a verification token
- `confirmEmail(userId, token)` — verify email address
- `findById(id)` / `findByEmail(email)` / `findByUsername(username)` — look up users

### RoleManager

- `createRole(name)` / `deleteRole(roleId)` — manage roles
- `addToRole(userId, roleName)` / `removeFromRole(userId, roleName)` — assign roles
- `isInRole(userId, roleName)` — check membership
- `getRoles(userId)` — list a user's roles

All mutation methods return `IdentityResult` with `{ success, errors? }`. Expected failures (duplicate email, wrong password, etc.) never throw.

## Security

- **bcrypt password hashing** — 12 rounds by default, constant-time comparison
- **Tokens never stored raw** — SHA-256 hash stored in the database; raw token returned to the caller once
- **security_stamp in JWT** — every token validation checks the stamp against the database; password changes instantly invalidate all existing sessions
- **Refresh token rotation** — old token is atomically consumed on use; a new pair is issued
- **Account lockout** — checked before password verification to prevent timing-based enumeration
- **HS256 algorithm pinned** — prevents algorithm confusion attacks
- **No logging** — the library never calls `console.log`; passwords, tokens, and hashes are never leaked

## Database Setup

Authforge creates its tables automatically via `createTables()`. Call it once at startup:

```typescript
import { createTables } from 'authforge';

await createTables(knex);

// Or with a custom table prefix
await createTables(knex, 'myapp_');
```

Tables created (all prefixed with `authforge_` by default):

- **`authforge_users`** — user accounts with password hash, security stamp, lockout fields
- **`authforge_roles`** — role definitions
- **`authforge_user_roles`** — user-to-role assignments (junction table)
- **`authforge_user_tokens`** — email verification, password reset, and refresh tokens (hashed)

Tables use `CREATE TABLE IF NOT EXISTS` — safe to call on every app start. V1 targets PostgreSQL.

## Contributing

Contributions are welcome. Please open an issue first for major changes.

```bash
npm test                  # Run all tests
npm run test:unit         # Unit tests only
npm run test:integration  # Integration tests (requires Docker)
npm run lint              # Lint check
npm run format            # Format code
```

## License

[MIT](./LICENSE)
