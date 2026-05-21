import { ApiProperty } from '@nestjs/swagger';

/**
 * Response shape from /auth/login, /auth/register, /auth/refresh.
 * Both tokens are returned in the JSON body. Clients are expected to
 * send the access token as `Authorization: Bearer <token>` and to store
 * the refresh token somewhere persistent (httpOnly cookie / secure storage)
 * and send it via POST body to /auth/refresh.
 */
export class TokensDto {
  @ApiProperty({
    description:
      'Short-lived JWT (HS256). Send as Authorization: Bearer <token>.',
  })
  accessToken: string;

  @ApiProperty({
    description:
      'Opaque random string (32 bytes hex). One-time use; rotated on every /auth/refresh call.',
  })
  refreshToken: string;

  @ApiProperty({
    description: 'Access token lifetime in seconds.',
    example: 900,
  })
  accessTokenExpiresIn: number;
}
