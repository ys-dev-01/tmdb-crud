import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength } from 'class-validator';

// Identical shape to RegisterDto today; kept separate so future changes
// (e.g., add captcha on register) don't accidentally leak into login.
// No min-length check on login: rejecting "too short" on login leaks
// info about valid password lengths. Defer to argon2.verify which is
// constant-time regardless.
export class LoginDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  @MaxLength(255)
  email: string;

  @ApiProperty({ example: 'correct horse battery staple' })
  @IsString()
  @MaxLength(64)
  password: string;
}
