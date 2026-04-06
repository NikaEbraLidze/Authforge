/**
 * JWT authentication guard for NestJS.
 *
 * Validates the Bearer token from the Authorization header using
 * Authforge's TokenService, then optionally checks role requirements
 * set by the @Roles() decorator.
 *
 * Usage:
 * - Per-route: `@UseGuards(AuthforgeGuard)`
 * - Globally: register as APP_GUARD in your module providers
 *
 * The guard attaches the validated TokenPayload to `request.user`,
 * following the NestJS convention. Use @CurrentUser() to extract it.
 */

import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ITokenService } from '../../interfaces/ITokenService';
import { AUTHFORGE_TOKEN_SERVICE } from './tokens';
import { ROLES_KEY } from './decorators/Roles';

@Injectable()
export class AuthforgeGuard implements CanActivate {
  constructor(
    @Inject(AUTHFORGE_TOKEN_SERVICE)
    private readonly tokenService: ITokenService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = this.extractToken(request);

    if (!token) {
      return false;
    }

    const payload = await this.tokenService.validateAccessToken(token);
    if (!payload) {
      return false;
    }

    // Attach payload to request — @CurrentUser() reads from here
    request.user = payload;

    // Check role requirements if @Roles() decorator is present
    const requiredRoles = this.reflector.getAllAndOverride<string[] | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    return requiredRoles.some((role) => payload.roles.includes(role));
  }

  /** Extract Bearer token from the Authorization header. */
  private extractToken(request: { headers: Record<string, string | undefined> }): string | null {
    const auth = request.headers['authorization'] ?? request.headers['Authorization'];
    if (!auth) return null;

    const [scheme, token] = auth.split(' ');
    if (scheme !== 'Bearer' || !token) return null;

    return token;
  }
}
