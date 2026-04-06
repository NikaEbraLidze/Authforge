/**
 * @CurrentUser() parameter decorator for extracting the authenticated user.
 *
 * Reads the TokenPayload attached to the request by AuthforgeGuard.
 * Optionally accepts a property key to extract a single field.
 *
 * @example
 * ```typescript
 * // Full payload
 * @Get('me')
 * getMe(@CurrentUser() user: TokenPayload) { return user; }
 *
 * // Single field
 * @Get('me/id')
 * getMyId(@CurrentUser('sub') userId: string) { return userId; }
 * ```
 */

import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { TokenPayload } from '../../../types';

export const CurrentUser = createParamDecorator(
  (data: keyof TokenPayload | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as TokenPayload | undefined;
    return data ? user?.[data] : user;
  },
);
