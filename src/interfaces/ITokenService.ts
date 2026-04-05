import { IdentityUser, TokenPayload } from '../types';

export interface ITokenService {
  generateAccessToken(user: IdentityUser, roles: string[]): Promise<string>;
  generateRefreshToken(userId: string): Promise<string>;
  validateAccessToken(token: string): Promise<TokenPayload | null>;
  validateRefreshToken(token: string): Promise<string | null>;
  revokeRefreshToken(token: string): Promise<void>;
}
