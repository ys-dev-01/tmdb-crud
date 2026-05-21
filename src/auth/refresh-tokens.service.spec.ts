import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource, Repository } from 'typeorm';
import { createHash } from 'crypto';
import { RefreshTokensService } from './refresh-tokens.service';
import { RefreshToken } from './refresh-token.entity';

function sha256hex(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}

describe('RefreshTokensService', () => {
  let repo: jest.Mocked<Pick<Repository<RefreshToken>, 'insert' | 'update'>>;
  let dataSource: { transaction: jest.Mock };
  let config: { get: jest.Mock };
  let service: RefreshTokensService;
  let storedRow: RefreshToken | null;

  beforeEach(() => {
    storedRow = null;
    repo = {
      insert: jest.fn().mockImplementation((row: Partial<RefreshToken>) => {
        storedRow = { id: '1', ...row, revokedAt: null } as RefreshToken;
        return Promise.resolve({ identifiers: [{ id: '1' }] });
      }),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    dataSource = {
      transaction: jest.fn().mockImplementation(async (cb) => {
        const tx = {
          createQueryBuilder: () => ({
            setLock: () => ({
              where: () => ({
                getOne: () => Promise.resolve(storedRow),
              }),
            }),
          }),
          update: jest.fn().mockImplementation((_e, _w, patch) => {
            if (storedRow) Object.assign(storedRow, patch);
            return Promise.resolve({ affected: 1 });
          }),
        };
        return cb(tx);
      }),
    };

    config = {
      get: jest
        .fn()
        .mockImplementation((key: string) =>
          key === 'JWT_REFRESH_TTL' ? '7d' : undefined,
        ),
    };

    service = new RefreshTokensService(
      repo as unknown as Repository<RefreshToken>,
      dataSource as unknown as DataSource,
      config as unknown as ConfigService,
    );
  });

  describe('issue', () => {
    it('returns a 64-char hex token and stores its sha256 hash', async () => {
      const token = await service.issue('user-1');
      expect(token).toMatch(/^[a-f0-9]{64}$/);
      expect(repo.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          tokenHash: sha256hex(token),
        }),
      );
    });

    it('sets expires_at according to JWT_REFRESH_TTL', async () => {
      const before = Date.now();
      await service.issue('user-1');
      const after = Date.now();
      const inserted = repo.insert.mock.calls[0][0] as Partial<RefreshToken>;
      const exp = (inserted.expiresAt as Date).getTime();
      const sevenDays = 7 * 24 * 60 * 60 * 1000;
      expect(exp).toBeGreaterThanOrEqual(before + sevenDays - 10);
      expect(exp).toBeLessThanOrEqual(after + sevenDays + 10);
    });

    it('assigns a fresh family_id (UUID) per issue', async () => {
      await service.issue('user-1');
      await service.issue('user-1');
      const a = repo.insert.mock.calls[0][0] as Partial<RefreshToken>;
      const b = repo.insert.mock.calls[1][0] as Partial<RefreshToken>;
      expect(a.familyId).not.toEqual(b.familyId);
      expect(a.familyId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
    });
  });

  describe('validateAndConsume', () => {
    it('marks the token revoked and returns the user_id', async () => {
      const token = await service.issue('user-1');
      const userId = await service.validateAndConsume(token);
      expect(userId).toBe('user-1');
      expect(storedRow!.revokedAt).toBeInstanceOf(Date);
    });

    it('throws 401 for an unknown token', async () => {
      await expect(
        service.validateAndConsume('definitely_not_a_real_token'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('throws 401 when replaying a revoked token', async () => {
      const token = await service.issue('user-1');
      await service.validateAndConsume(token);
      await expect(service.validateAndConsume(token)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('throws 401 for an expired token', async () => {
      const token = await service.issue('user-1');
      // Force expiration by mutating the stored row.
      storedRow!.expiresAt = new Date(Date.now() - 1000);
      await expect(service.validateAndConsume(token)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });

  describe('revoke', () => {
    it('is idempotent — calling on a non-existent token does not throw', async () => {
      await expect(service.revoke('any_token')).resolves.toBeUndefined();
      expect(repo.update).toHaveBeenCalledWith(
        expect.objectContaining({ tokenHash: sha256hex('any_token') }),
        expect.objectContaining({ revokedAt: expect.any(Date) }),
      );
    });
  });
});
