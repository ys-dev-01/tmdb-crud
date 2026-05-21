import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import ms, { StringValue } from 'ms';
import { QueryFailedError } from 'typeorm';
import { HashingService } from './hashing.service';
import { RefreshTokensService } from './refresh-tokens.service';
import { UsersService } from '../users/users.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { TokensDto } from './dto/tokens.dto';
import { User } from '../users/user.entity';

// Postgres error code for unique_violation — fired by UNIQUE(email).
const PG_UNIQUE_VIOLATION = '23505';

interface JwtPayload {
  sub: string;
}

@Injectable()
export class AuthService {
  private readonly accessTtlSeconds: number;

  constructor(
    private readonly users: UsersService,
    private readonly hashing: HashingService,
    private readonly refreshTokens: RefreshTokensService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {
    const ttl = (this.config.get<string>('JWT_ACCESS_TTL') ??
      '15m') as StringValue;
    this.accessTtlSeconds = Math.floor(ms(ttl) / 1000);
  }

  async register(dto: RegisterDto): Promise<TokensDto> {
    const passwordHash = await this.hashing.hash(dto.password);
    let user: User;
    try {
      user = await this.users.create({ email: dto.email, passwordHash });
    } catch (err) {
      if (
        err instanceof QueryFailedError &&
        (err.driverError as { code?: string }).code === PG_UNIQUE_VIOLATION
      ) {
        throw new ConflictException('Email already registered');
      }
      throw err;
    }
    return this.issueTokens(user);
  }

  async login(dto: LoginDto): Promise<TokensDto> {
    const user = await this.users.findByEmail(dto.email);
    // Same error for "user not found" and "bad password" to prevent
    // email enumeration via response timing/content.
    if (!user) throw new UnauthorizedException('Invalid credentials');
    const ok = await this.hashing.verify(user.passwordHash, dto.password);
    if (!ok) throw new UnauthorizedException('Invalid credentials');
    return this.issueTokens(user);
  }

  async refresh(rawToken: string): Promise<TokensDto> {
    // Atomic: validates the presented token AND marks it revoked.
    // Throws 401 for unknown/revoked/expired tokens.
    const userId = await this.refreshTokens.validateAndConsume(rawToken);
    const user = await this.users.findById(userId);
    if (!user) throw new UnauthorizedException('Invalid refresh token');
    return this.issueTokens(user);
  }

  async logout(rawToken: string): Promise<void> {
    await this.refreshTokens.revoke(rawToken);
  }

  private async issueTokens(user: User): Promise<TokensDto> {
    const payload: JwtPayload = { sub: user.id };
    const accessToken = await this.jwt.signAsync(payload);
    const refreshToken = await this.refreshTokens.issue(user.id);
    return {
      accessToken,
      refreshToken,
      accessTokenExpiresIn: this.accessTtlSeconds,
    };
  }
}
