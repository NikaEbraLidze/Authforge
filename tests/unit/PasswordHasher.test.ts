import { PasswordHasher } from '@/core/PasswordHasher';

describe('PasswordHasher', () => {
  let hasher: PasswordHasher;

  beforeEach(() => {
    // 4 rounds for fast tests (~10ms per hash instead of ~250ms at 12 rounds)
    hasher = new PasswordHasher(4);
  });

  describe('hash', () => {
    it('should return a bcrypt hash string', async () => {
      const hash = await hasher.hash('password');
      expect(hash).toMatch(/^\$2[aby]\$/);
    });

    it('should produce different hashes for the same password (unique salt)', async () => {
      const hash1 = await hasher.hash('password');
      const hash2 = await hasher.hash('password');
      expect(hash1).not.toBe(hash2);
    });

    it('should respect the configured round count', async () => {
      const hash = await hasher.hash('password');
      // bcrypt hash format: $2b$<rounds>$...
      expect(hash).toContain('$04$');
    });
  });

  describe('verify', () => {
    it('should return true for a password matching its hash', async () => {
      const hash = await hasher.hash('MyPassword1');
      const result = await hasher.verify('MyPassword1', hash);
      expect(result).toBe(true);
    });

    it('should return false for an incorrect password', async () => {
      const hash = await hasher.hash('MyPassword1');
      const result = await hasher.verify('WrongPassword', hash);
      expect(result).toBe(false);
    });

    it('should return false for an empty string against a valid hash', async () => {
      const hash = await hasher.hash('MyPassword1');
      const result = await hasher.verify('', hash);
      expect(result).toBe(false);
    });
  });
});
