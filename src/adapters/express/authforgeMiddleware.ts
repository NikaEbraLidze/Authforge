/**
 * Express middleware and helpers for Authforge authentication.
 *
 * Provides two usage patterns:
 *
 * 1. **All-in-one factory** — `createAuthforge(config)` wires up all services
 *    and returns pre-bound middleware alongside the managers:
 *    ```typescript
 *    const auth = createAuthforge(config);
 *    app.use(auth.authenticate);
 *    app.get('/protected', auth.requireAuth, handler);
 *    app.get('/admin', auth.requireRoles('admin'), handler);
 *    ```
 *
 * 2. **Standalone middleware** — `createAuthMiddleware(tokenService)` for
 *    consumers who wire their own services:
 *    ```typescript
 *    const authenticate = createAuthMiddleware(tokenService);
 *    app.use(authenticate);
 *    ```
 *
 * The authenticate middleware attaches the validated TokenPayload to
 * `req.authforge` (not `req.user`) to avoid Passport.js conflicts.
 * It always calls next() — unauthenticated requests pass through
 * without `req.authforge` set. Use `requireAuth` to enforce authentication.
 */

import { Request, Response, NextFunction } from 'express';
import { AuthforgeConfig } from '../../types';
import { ITokenService } from '../../interfaces/ITokenService';
import { createAuthforgeServices, AuthforgeServices } from '../createAuthforgeServices';
import { UserManager } from '../../core/UserManager';
import { RoleManager } from '../../core/RoleManager';

// Ensure type augmentation is applied
import './types';

export interface AuthforgeExpressInstance {
  userManager: UserManager;
  roleManager: RoleManager;
  tokenService: ITokenService;
  knex: AuthforgeServices['knex'];
  /** Middleware that validates JWT and attaches payload to req.authforge */
  authenticate: (req: Request, res: Response, next: NextFunction) => void;
  /** Middleware that rejects unauthenticated requests with 401 */
  requireAuth: (req: Request, res: Response, next: NextFunction) => void;
  /** Middleware factory that rejects requests without required roles with 403 */
  requireRoles: (...roles: string[]) => (req: Request, res: Response, next: NextFunction) => void;
}

/**
 * All-in-one factory: create the full Authforge service graph and
 * return pre-bound Express middleware alongside the managers.
 */
export function createAuthforge(config: AuthforgeConfig): AuthforgeExpressInstance {
  const services = createAuthforgeServices(config);
  const authenticate = createAuthMiddleware(services.tokenService);

  return {
    userManager: services.userManager,
    roleManager: services.roleManager,
    tokenService: services.tokenService,
    knex: services.knex,
    authenticate,
    requireAuth,
    requireRoles,
  };
}

/**
 * Create JWT authentication middleware for a given token service.
 *
 * Extracts the Bearer token from the Authorization header, validates it,
 * and attaches the TokenPayload to `req.authforge`. Always calls next() —
 * missing or invalid tokens result in req.authforge being undefined.
 */
export function createAuthMiddleware(
  tokenService: ITokenService,
): (req: Request, res: Response, next: NextFunction) => void {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const token = extractToken(req);

    if (token) {
      const payload = await tokenService.validateAccessToken(token);
      if (payload) {
        req.authforge = payload;
      }
    }

    next();
  };
}

/**
 * Middleware that requires authentication.
 * Returns 401 if req.authforge is not set (i.e., no valid JWT was provided).
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.authforge) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }
  next();
}

/**
 * Middleware factory that requires the authenticated user to have
 * at least one of the specified roles.
 *
 * Returns 401 if not authenticated, 403 if the user lacks all required roles.
 */
export function requireRoles(
  ...roles: string[]
): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.authforge) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    const hasRole = roles.some((role) => req.authforge!.roles.includes(role));
    if (!hasRole) {
      res.status(403).json({ error: 'Insufficient permissions.' });
      return;
    }

    next();
  };
}

/** Extract Bearer token from the Authorization header. */
function extractToken(req: Request): string | null {
  const auth = req.headers.authorization;
  if (!auth) return null;

  const [scheme, token] = auth.split(' ');
  if (scheme !== 'Bearer' || !token) return null;

  return token;
}
