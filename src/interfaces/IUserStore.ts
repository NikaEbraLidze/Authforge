import { CreateUserData, IdentityUser, SaveTokenData, TokenType, UserToken } from '../types';

export interface IUserStore {
  create(data: CreateUserData & { passwordHash: string }): Promise<IdentityUser>;
  findById(id: string): Promise<IdentityUser | null>;
  findByEmail(email: string): Promise<IdentityUser | null>;
  findByUsername(username: string): Promise<IdentityUser | null>;
  update(id: string, data: Partial<IdentityUser>): Promise<void>;
  delete(id: string): Promise<void>;
  saveToken(data: SaveTokenData): Promise<string>;
  findToken(userId: string, type: TokenType): Promise<UserToken | null>;
  consumeToken(tokenId: string): Promise<void>;
}
