import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UsersService } from '../users/users.service';
import { User } from '../users/user.entity';

interface JwtPayload {
  sub: string;
  iat?: number;
  exp?: number;
}

/**
 * Validates Bearer JWTs on incoming requests.
 *
 * Passport calls validate() after the signature is verified — we then
 * look up the user from payload.sub. Returning a truthy value attaches
 * it to request.user; throwing yields a 401 from the guard.
 *
 * Looking up the user on every request (one indexed PK query) catches
 * the "JWT issued before user was deleted" case. Stale tokens fail
 * closed.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly users: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET')!,
    });
  }

  async validate(payload: JwtPayload): Promise<User> {
    const user = await this.users.findById(payload.sub);
    if (!user) throw new UnauthorizedException();
    return user;
  }
}
