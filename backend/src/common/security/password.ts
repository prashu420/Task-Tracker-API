import * as argon2 from 'argon2';

/**
 * Centralised password hashing so auth and user-provisioning share one policy.
 * argon2id is the OWASP-recommended algorithm: memory-hard, so it resists
 * GPU/ASIC brute-forcing far better than bcrypt.
 */
export function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, { type: argon2.argon2id });
}

export function verifyPassword(hash: string, plain: string): Promise<boolean> {
  return argon2.verify(hash, plain);
}
