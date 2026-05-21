import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { QueryFailedError } from 'typeorm';
import { AuthService } from './auth.service';
import { HashingService } from './hashing.service';
import { RefreshTokensService } from './refresh-tokens.service';
import { UsersService } from '../users/users.service';
import { User } from '../users/user.entity';

describe('AuthService', () => {
  let users: jest.Mocked<UsersService>;
  let hashing: jest.Mocked<HashingService>;
  let refreshTokens: jest.Mocked<RefreshTokensService>;
  let jwt: jest.Mocked<JwtService>;
  let config: jest.Mocked<Pick<ConfigService, 'get'>>;
  let service: AuthService;

  beforeEach(() => {
    users = {
      findByEmail: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
    } as unknown as jest.Mocked<UsersService>;

    hashing = {
      hash: jest.fn().mockResolvedValue('hashed_password'),
      verify: jest.fn(),
    } as unknown as jest.Mocked<HashingService>;

    refreshTokens = {
      issue: jest.fn().mockResolvedValue('refresh_token_plaintext'),
      validateAndConsume: jest.fn(),
      revoke: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<RefreshTokensService>;

    jwt = {
      signAsync: jest.fn().mockResolvedValue('signed.jwt.token'),
    } as unknown as jest.Mocked<JwtService>;

    config = {
      get: jest
        .fn()
        .mockImplementation((key: string) =>
          key === 'JWT_ACCESS_TTL' ? '15m' : undefined,
        ),
    };

    service = new AuthService(
      users,
      hashing,
      refreshTokens,
      jwt,
      config as unknown as ConfigService,
    );
  });

  const fakeUser: User = {
    id: '42',
    email: 'user@example.com',
    passwordHash: 'hashed_password',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  describe('register', () => {
    it('hashes the password and creates the user, returning tokens', async () => {
      users.create.mockResolvedValue(fakeUser);

      const result = await service.register({
        email: 'user@example.com',
        password: 'secret password',
      });

      expect(hashing.hash).toHaveBeenCalledWith('secret password');
      expect(users.create).toHaveBeenCalledWith({
        email: 'user@example.com',
        passwordHash: 'hashed_password',
      });
      expect(result).toEqual({
        accessToken: 'signed.jwt.token',
        refreshToken: 'refresh_token_plaintext',
        accessTokenExpiresIn: 900,
      });
    });

    it('translates Postgres unique_violation to ConflictException', async () => {
      const err = new QueryFailedError(
        'INSERT INTO users',
        [],
        new Error('duplicate key'),
      );
      // QueryFailedError exposes driverError with the pg code.
      (err as unknown as { driverError: { code: string } }).driverError = {
        code: '23505',
      };
      users.create.mockRejectedValue(err);

      await expect(
        service.register({
          email: 'user@example.com',
          password: 'secret password',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('login', () => {
    it('issues tokens for valid credentials', async () => {
      users.findByEmail.mockResolvedValue(fakeUser);
      hashing.verify.mockResolvedValue(true);

      const result = await service.login({
        email: 'user@example.com',
        password: 'secret password',
      });

      expect(hashing.verify).toHaveBeenCalledWith(
        'hashed_password',
        'secret password',
      );
      expect(result.accessToken).toBe('signed.jwt.token');
      expect(result.refreshToken).toBe('refresh_token_plaintext');
    });

    it('returns the same 401 for unknown email and bad password', async () => {
      users.findByEmail.mockResolvedValueOnce(null);
      await expect(
        service.login({ email: 'missing@example.com', password: 'whatever' }),
      ).rejects.toThrow(
        expect.objectContaining({
          message: 'Invalid credentials',
          status: 401,
        }),
      );

      users.findByEmail.mockResolvedValueOnce(fakeUser);
      hashing.verify.mockResolvedValueOnce(false);
      await expect(
        service.login({ email: 'user@example.com', password: 'wrong' }),
      ).rejects.toThrow(
        expect.objectContaining({
          message: 'Invalid credentials',
          status: 401,
        }),
      );
    });
  });

  describe('refresh', () => {
    it('consumes the presented token and issues a fresh pair', async () => {
      refreshTokens.validateAndConsume.mockResolvedValue('42');
      users.findById.mockResolvedValue(fakeUser);

      const result = await service.refresh('old_refresh_token');

      expect(refreshTokens.validateAndConsume).toHaveBeenCalledWith(
        'old_refresh_token',
      );
      expect(refreshTokens.issue).toHaveBeenCalledWith('42');
      expect(result.refreshToken).toBe('refresh_token_plaintext');
      expect(result.accessToken).toBe('signed.jwt.token');
    });

    it('throws 401 when the user from the token no longer exists', async () => {
      refreshTokens.validateAndConsume.mockResolvedValue('42');
      users.findById.mockResolvedValue(null);

      await expect(service.refresh('old_token')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('propagates 401 when validateAndConsume rejects', async () => {
      refreshTokens.validateAndConsume.mockRejectedValue(
        new UnauthorizedException('Invalid refresh token'),
      );

      await expect(service.refresh('replayed_token')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });

  describe('logout', () => {
    it('delegates to refreshTokens.revoke and returns void', async () => {
      const result = await service.logout('any_token');
      expect(refreshTokens.revoke).toHaveBeenCalledWith('any_token');
      expect(result).toBeUndefined();
    });
  });
});
