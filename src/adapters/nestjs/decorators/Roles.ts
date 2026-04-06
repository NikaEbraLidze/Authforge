/**
 * @Roles() metadata decorator for role-based access control.
 *
 * Sets required roles on a handler or controller. AuthforgeGuard reads
 * this metadata via Reflector and verifies the authenticated user has
 * at least one of the specified roles.
 *
 * @example
 * ```typescript
 * @Roles('admin', 'editor')
 * @UseGuards(AuthforgeGuard)
 * @Get('protected')
 * getProtected() { ... }
 * ```
 */

import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'authforge_roles';

export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
