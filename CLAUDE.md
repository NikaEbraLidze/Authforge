# Authforge — Claude Code Instructions

## What This Is

Authforge is an npm library (not an app) that provides ASP.NET Core Identity-style authentication and user management for Node.js. Written in TypeScript, targeting Node >= 18.

## Commands

```bash
npm run build          # Compile TypeScript (tsconfig.build.json)
npm test               # Run all tests
npm run test:unit      # Unit tests only
npm run test:integration  # Integration tests (requires Docker for Testcontainers)
npm run lint           # ESLint check
npm run lint:fix       # ESLint autofix
npm run format         # Prettier format
npm run format:check   # Prettier check
```

## Architecture

- **This is a library, not an application.** Every public export is part of the consumer API. Treat all exports as a public contract.
- **Interface-first design.** All components have a corresponding interface in `src/interfaces/`. Implementations depend on interfaces, never on concrete classes.
- **Knex is the query builder**, not an ORM. Write raw-ish SQL through Knex's builder. No Knex migrations CLI — we do programmatic `CREATE TABLE IF NOT EXISTS` in `src/migrations/tables.ts`.
- **Framework adapters** (`src/adapters/`) wrap core logic for NestJS and Express. Core logic must never import from adapters. Adapters import from core.

## Code Conventions

- **TypeScript strict mode.** No `any` unless absolutely unavoidable (and add a comment explaining why).
- **No default exports.** Always use named exports.
- **Barrel exports** via `index.ts` files. The root `src/index.ts` is the public API surface.
- **Naming:** PascalCase for classes/interfaces/types, camelCase for functions/variables, UPPER_SNAKE for constants.
- **Interface naming:** Prefix with `I` (e.g., `IUserStore`, `IPasswordHasher`).
- **File naming:** PascalCase for files containing a class/interface (e.g., `UserManager.ts`), camelCase for utility files.
- **Error handling:** Return `IdentityResult` with `{ success: false, errors: [...] }` — do NOT throw for expected failures (invalid password, duplicate email, etc.). Only throw for truly unexpected errors.
- **Async/await** throughout. No callbacks, no `.then()` chains.
- **Single responsibility:** Each file exports one primary class or interface.

## Comments

- Add comments for **why**, not **what**. The code should be self-explanatory for _what_ it does.
- Every file must have a **top-level doc comment** explaining the module's purpose and role in the system.
- Add comments for: security-critical decisions, non-obvious business logic, interface contract notes, and any workaround or trade-off.
- Do NOT over-comment obvious code (e.g., `// increment counter` above `count++`).
- Use `/** JSDoc */` for public classes, methods, and exported functions. Use `//` for inline clarifications.

## Git & Commits

- **Commit after each logical step** in the build order (e.g., after completing migrations, after completing PasswordHasher, etc.).
- **Commit message format:** `<type>(<scope>): <short description>` — types: `feat`, `fix`, `refactor`, `docs`, `chore`, `test`.
- **Scope** = the module or area (e.g., `migrations`, `core`, `stores`, `adapters`, `types`).
- **Examples:** `feat(migrations): add idempotent table creation`, `feat(core): implement bcrypt PasswordHasher`.
- Keep commits atomic — one logical change per commit.

## Database

- All tables prefixed with `authforge_` (configurable via `tablePrefix`).
- PostgreSQL is the V1 target. Use standard SQL where possible for future multi-DB support.
- Column names use `snake_case` in the DB, mapped to `camelCase` in TypeScript types.
- UUIDs for all primary keys (v4, generated in app layer).

## Security Rules

- **Never store raw tokens.** SHA-256 hash goes to DB; raw token returned to caller once.
- **Never log passwords, tokens, or hashes.**
- **bcrypt for passwords** (12 rounds default). Salt is automatic.
- **security_stamp** in JWT payload — validate on every protected request to detect stale tokens.
- **Refresh token rotation:** old token consumed on use, new one issued.
- **Lockout logic** must be checked before password verification, not after.

## Testing

- **Unit tests:** `tests/unit/` — test core logic with mocked stores/services.
- **Integration tests:** `tests/integration/` — test Knex stores against real PostgreSQL via Testcontainers. No mocks for DB layer.
- **Jest** with `ts-jest`. Config in `jest.config.ts`.
- Test files mirror source: `UserManager.test.ts` tests `UserManager.ts`.

## Build Order (V1)

Follow this order when implementing. Each step builds on the previous:

1. ~~Project setup (package.json, tsconfig, etc.)~~ DONE
2. ~~Types (`src/types/index.ts`)~~ DONE
3. ~~Interfaces (`src/interfaces/`)~~ DONE
4. Migrations (`src/migrations/tables.ts`)
5. PasswordHasher (`src/core/PasswordHasher.ts`)
6. TokenService (`src/core/TokenService.ts`)
7. KnexUserStore (`src/stores/knex/KnexUserStore.ts`)
8. KnexRoleStore (`src/stores/knex/KnexRoleStore.ts`)
9. UserManager (`src/core/UserManager.ts`)
10. RoleManager (`src/core/RoleManager.ts`)
11. NestJS adapter (`src/adapters/nestjs/`)
12. Express adapter (`src/adapters/express/`)
13. Barrel export (`src/index.ts`) — uncomment as implementations land
14. Unit tests (`tests/unit/`)
15. Integration tests (`tests/integration/`)
16. README.md

## Do NOT

- Add dependencies without asking. The dependency list is intentional.
- Create `.env` files or hardcode secrets.
- Use `console.log` for anything. This is a library — consumers control logging.
- Add features beyond the V1 spec without discussion.
- Use `class-validator`, `class-transformer`, or decorators in core logic (only in NestJS adapter if needed).
