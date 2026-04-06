/**
 * Express Request type augmentation for Authforge.
 *
 * Adds `req.authforge` (TokenPayload) to the Express Request interface.
 * Uses `authforge` instead of `user` to avoid conflicts with Passport.js,
 * which owns the `req.user` property by convention.
 */

import { TokenPayload } from '../../types';

declare global {
  namespace Express {
    interface Request {
      authforge?: TokenPayload;
    }
  }
}
