import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { User } from '../../users/user.entity';

/**
 * Extracts the authenticated User attached to the request by JwtStrategy.
 * Use in controllers as `@CurrentUser() user: User`.
 *
 * Source of truth for "who is calling" — never trust the request body,
 * URL params, or query string for user identity.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): User => {
    const request = ctx.switchToHttp().getRequest<{ user: User }>();
    return request.user;
  },
);
