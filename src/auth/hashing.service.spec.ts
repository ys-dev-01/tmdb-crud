import { HashingService } from './hashing.service';

describe('HashingService', () => {
  // Argon2id at OWASP 2026 params is intentionally slow; default 5s isn't enough.
  jest.setTimeout(30_000);
  const service = new HashingService();

  it('hashes a password into an argon2id-formatted string', async () => {
    const hash = await service.hash('correct horse battery staple');
    // Self-documenting prefix: $argon2id$v=19$m=65536,t=3,p=1$<salt>$<digest>
    expect(hash).toMatch(/^\$argon2id\$v=19\$m=65536,t=3,p=1\$/);
  });

  it('verify() returns true for the matching password', async () => {
    const hash = await service.hash('s3cret_pa55phrase');
    expect(await service.verify(hash, 's3cret_pa55phrase')).toBe(true);
  });

  it('verify() returns false for any other password', async () => {
    const hash = await service.hash('s3cret_pa55phrase');
    expect(await service.verify(hash, 'wrong_password')).toBe(false);
  });

  it('produces a different hash each time (random salt)', async () => {
    const a = await service.hash('same_password');
    const b = await service.hash('same_password');
    expect(a).not.toBe(b);
    // Both still verify against the same input.
    expect(await service.verify(a, 'same_password')).toBe(true);
    expect(await service.verify(b, 'same_password')).toBe(true);
  });
});
