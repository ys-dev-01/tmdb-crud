/**
 * Integration test for RefreshTokensService — the transactional rotation core.
 *
 * Why integration (not unit): the contract is "concurrent consume of the same
 * token returns to exactly one caller". That guarantee is implemented by a
 * SELECT ... FOR UPDATE inside a transaction. A unit test with a mocked repo
 * proves only that the code calls the right methods; it can't prove the lock
 * actually serializes contenders. Postgres has to be real.
 *
 * Mocks: only ConfigService (returns JWT_REFRESH_TTL). DataSource and repo
 * are real, pointing at a testcontainer.
 */
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { User } from '../../src/users/user.entity';
import { RefreshToken } from '../../src/auth/refresh-token.entity';
import { RefreshTokensService } from '../../src/auth/refresh-tokens.service';
import {
  startPostgres,
  PostgresTestContext,
} from '../utils/postgres-container';

describe('RefreshTokensService (integration)', () => {
  let ctx: PostgresTestContext;
  let userRepo: Repository<User>;
  let tokenRepo: Repository<RefreshToken>;
  let service: RefreshTokensService;
  let user: User;

  beforeAll(async () => {
    ctx = await startPostgres();
    userRepo = ctx.dataSource.getRepository(User);
    tokenRepo = ctx.dataSource.getRepository(RefreshToken);
    const config = {
      get: (key: string) => (key === 'JWT_REFRESH_TTL' ? '7d' : undefined),
    } as unknown as ConfigService;
    service = new RefreshTokensService(tokenRepo, ctx.dataSource, config);
  });

  afterAll(async () => {
    await ctx?.stop();
  });

  beforeEach(async () => {
    await ctx.dataSource.query(
      'TRUNCATE TABLE refresh_tokens, users RESTART IDENTITY CASCADE',
    );
    user = await userRepo.save(
      userRepo.create({ email: 'test@example.com', passwordHash: 'x' }),
    );
  });

  describe('issue', () => {
    it('returns a 64-char hex token and persists exactly one row', async () => {
      const raw = await service.issue(user.id);

      expect(raw).toMatch(/^[0-9a-f]{64}$/);
      const rows = await tokenRepo.find();
      expect(rows).toHaveLength(1);
      expect(rows[0].userId).toBe(user.id);
      expect(rows[0].revokedAt).toBeNull();
    });
  });

  describe('validateAndConsume', () => {
    it('happy path: returns userId, marks token revoked', async () => {
      const raw = await service.issue(user.id);

      const result = await service.validateAndConsume(raw);

      expect(result).toBe(user.id);
      const row = await tokenRepo.findOneBy({ userId: user.id });
      expect(row?.revokedAt).not.toBeNull();
    });

    it('replay: consuming the same token twice fails the second call', async () => {
      const raw = await service.issue(user.id);

      await service.validateAndConsume(raw);

      await expect(service.validateAndConsume(raw)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('unknown token: rejects with UnauthorizedException', async () => {
      await expect(
        service.validateAndConsume('a'.repeat(64)),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('expired token: rejects with UnauthorizedException', async () => {
      const raw = await service.issue(user.id);
      // Backdate the expiry directly — we don't expose a way to issue an expired token.
      await tokenRepo.update(
        { userId: user.id },
        { expiresAt: new Date(Date.now() - 1000) },
      );

      await expect(service.validateAndConsume(raw)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('concurrent consume: exactly one Promise.all caller wins, the other 401s', async () => {
      const raw = await service.issue(user.id);

      const results = await Promise.allSettled([
        service.validateAndConsume(raw),
        service.validateAndConsume(raw),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(rejected[0].reason).toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('revoke', () => {
    it('marks an active token revoked', async () => {
      const raw = await service.issue(user.id);

      await service.revoke(raw);

      const row = await tokenRepo.findOneBy({ userId: user.id });
      expect(row?.revokedAt).not.toBeNull();
    });

    it('is idempotent: revoking an unknown token does not throw', async () => {
      await expect(service.revoke('z'.repeat(64))).resolves.toBeUndefined();
    });

    it('is idempotent: revoking an already-revoked token does not throw', async () => {
      const raw = await service.issue(user.id);
      await service.revoke(raw);

      await expect(service.revoke(raw)).resolves.toBeUndefined();
    });
  });
});
