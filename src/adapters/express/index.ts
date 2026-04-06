// Apply Express Request type augmentation
import './types';

export {
  createAuthforge,
  createAuthMiddleware,
  requireAuth,
  requireRoles,
} from './authforgeMiddleware';

export type { AuthforgeExpressInstance } from './authforgeMiddleware';
