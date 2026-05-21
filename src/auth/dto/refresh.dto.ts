import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class RefreshDto {
  @ApiProperty({
    description:
      'The refresh token issued by /auth/login or a previous /auth/refresh call.',
  })
  @IsString()
  @IsNotEmpty()
  refreshToken: string;
}
