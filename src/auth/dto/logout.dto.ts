import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class LogoutDto {
  @ApiProperty({
    description:
      'The refresh token to revoke. Logout is idempotent — revoking an already-revoked or unknown token returns 204.',
  })
  @IsString()
  @IsNotEmpty()
  refreshToken: string;
}
