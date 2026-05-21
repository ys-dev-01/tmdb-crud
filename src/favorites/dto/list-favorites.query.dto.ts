import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import {
  FAVORITES_LIST_DEFAULT_LIMIT,
  FAVORITES_LIST_MAX_LIMIT,
} from '../favorites.constants';

export class ListFavoritesQueryDto {
  @ApiPropertyOptional({
    minimum: 1,
    maximum: FAVORITES_LIST_MAX_LIMIT,
    default: FAVORITES_LIST_DEFAULT_LIMIT,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(FAVORITES_LIST_MAX_LIMIT)
  limit?: number;

  @ApiPropertyOptional({
    description: 'Opaque cursor from `meta.nextCursor` of the prior page.',
  })
  @IsOptional()
  @IsString()
  cursor?: string;
}
