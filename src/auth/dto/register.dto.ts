import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  @MaxLength(255)
  email: string;

  // OWASP 2026: 8-64 chars, no mandatory complexity rules.
  // Length is the strongest defense; complexity rules nudge users to
  // predictable patterns (Password1!, Spring2024!, etc.).
  @ApiProperty({
    example: 'correct horse battery staple',
    minLength: 8,
    maxLength: 64,
  })
  @IsString()
  @MinLength(8)
  @MaxLength(64)
  password: string;
}
