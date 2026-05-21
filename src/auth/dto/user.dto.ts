import { ApiProperty } from '@nestjs/swagger';
import { User } from '../../users/user.entity';

/**
 * Response shape from /auth/me. Drops password_hash and timestamps —
 * the API surface should never expose hashes, and creation/update times
 * are noise for the caller.
 */
export class UserDto {
  @ApiProperty({ example: '1' })
  id: string;

  @ApiProperty({ example: 'user@example.com' })
  email: string;

  static from(user: User): UserDto {
    const dto = new UserDto();
    dto.id = user.id;
    dto.email = user.email;
    return dto;
  }
}
