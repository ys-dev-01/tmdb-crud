import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import { randomBytes, createHash, randomUUID } from 'crypto';
import ms, { StringValue } from 'ms';
import { RefreshToken } from './refresh-token.entity';

/**
 * Issue / validate / revoke refresh tokens.
 *
 * Tokens are opaque random strings (256 bits, hex-encoded). We store only
 * the sha256 hash; the raw token leaves the server in the response body
 * once and never again. A DB compromise alone can't enable replay.
 *
 * sha256 (not Argon2id) is correct here: tokens are high-entropy and
 * collision/preimage attacks on sha256 are astronomically expensive,
 * while every /auth/refresh needs fast verification on the hot path.
 *
 * Rotation: validateAndConsume() marks the presented token revoked
 * inside the same DB transaction as it returns the user id. The caller
 * (AuthService) then issues a fresh token. The old token is single-use.
 *
 * family_id is set but reuse-detection logic is NOT implemented in this
 * scope — every issued token gets a fresh family. Wiring family-based
 * reuse detection (revoking the whole family when a revoked token is
 * presented) is a future enhancement; the column is already in the schema.
 */
@Injectable()
export class RefreshTokensService {
  private readonly refreshTtlMs: number;

  constructor(
    @InjectRepository(RefreshToken)
    private readonly repo: Repository<RefreshToken>,
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
  ) {
    const ttl = (this.config.get<string>('JWT_REFRESH_TTL') ??
      '7d') as StringValue;
    this.refreshTtlMs = ms(ttl);
  }

  /**
   * Issues a new refresh token for the given user.
   * Returns the plaintext token (caller sends to client).
   */
  async issue(userId: string): Promise<string> {
    const raw = randomBytes(32).toString('hex');
    await this.repo.insert({
      userId,
      tokenHash: this.hash(raw),
      familyId: randomUUID(),
      expiresAt: new Date(Date.now() + this.refreshTtlMs),
    });
    return raw;
  }

  /**
   * Validates the presented raw token, marks it revoked, and returns the
   * owning user id. Atomic — if two concurrent calls present the same
   * token, only one wins; the loser sees revoked_at set and 401s.
   *
   * Throws UnauthorizedException for: unknown token, revoked token, expired token.
   */
  async validateAndConsume(rawToken: string): Promise<string> {
    const tokenHash = this.hash(rawToken);
    return this.dataSource.transaction(async (tx) => {
      const row = await tx
        .createQueryBuilder(RefreshToken, 't')
        .setLock('pessimistic_write')
        .where('t.token_hash = :tokenHash', { tokenHash })
        .getOne();

      if (!row || row.revokedAt || row.expiresAt < new Date()) {
        throw new UnauthorizedException('Invalid refresh token');
      }
      await tx.update(RefreshToken, { id: row.id }, { revokedAt: new Date() });
      return row.userId;
    });
  }

  /**
   * Idempotent: revoking a missing/already-revoked token is a no-op.
   * Used by /auth/logout.
   */
  async revoke(rawToken: string): Promise<void> {
    // IsNull() generates `revoked_at IS NULL`. Passing `undefined` would
    // generate `revoked_at = NULL`, which is always UNKNOWN in SQL and
    // matches zero rows (silently no-ops for active tokens).
    await this.repo.update(
      { tokenHash: this.hash(rawToken), revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
  }

  private hash(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }
}
