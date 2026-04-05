import { IdentityRole } from '../types';

export interface IRoleStore {
  create(name: string): Promise<IdentityRole>;
  findById(id: string): Promise<IdentityRole | null>;
  findByName(name: string): Promise<IdentityRole | null>;
  delete(id: string): Promise<void>;
  addToUser(userId: string, roleId: string): Promise<void>;
  removeFromUser(userId: string, roleId: string): Promise<void>;
  getRolesForUser(userId: string): Promise<IdentityRole[]>;
  isInRole(userId: string, roleName: string): Promise<boolean>;
}
