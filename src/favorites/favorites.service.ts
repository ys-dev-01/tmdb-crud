import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Cache } from 'cache-manager';
import { Repository } from 'typeorm';
import { buildPaginator } from 'typeorm-cursor-pagination';
import { Movie } from '../movies/movie.entity';
import { ListFavoritesQueryDto } from './dto/list-favorites.query.dto';
import { PaginatedFavoritesDto } from './dto/paginated-favorites.dto';
import { FavoriteItemDto } from './dto/favorite-item.dto';
import {
  FAVORITES_CACHE_TTL_JITTER_MS,
  FAVORITES_CACHE_TTL_MS,
  FAVORITES_LIST_DEFAULT_LIMIT,
  FAVORITES_VERSION_DEFAULT,
  FAVORITES_VERSION_KEY_PREFIX,
  FAVORITES_VERSION_TTL_MS,
} from './favorites.constants';
import { FavoriteEntry } from './favorite.entity';

/**
 * Per-user "movies I love" set. Mirrors WatchlistService's structure —
 * same composite PK, same idempotent set-membership ops, same
 * per-user version-bump cache invalidation. Kept as a separate module
 * because the semantics are independent (a movie can be in both
 * favorites and watchlist), and decoupling lets each evolve without
 * dragging the other along.
 */
@Injectable()
export class FavoritesService {
  constructor(
    @InjectRepository(FavoriteEntry)
    private readonly repo: Repository<FavoriteEntry>,
    @InjectRepository(Movie) private readonly movieRepo: Repository<Movie>,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  async add(userId: string, movieId: string): Promise<FavoriteItemDto> {
    const movie = await this.movieRepo.findOne({ where: { id: movieId } });
    if (!movie) {
      throw new NotFoundException(`Movie ${movieId} not found`);
    }

    await this.repo
      .createQueryBuilder()
      .insert()
      .into(FavoriteEntry)
      .values({ userId, movieId })
      .orIgnore()
      .execute();

    const entry = await this.repo.findOneByOrFail({ userId, movieId });

    await this.bumpVersion(userId);
    return FavoriteItemDto.fromEntry(entry, movie);
  }

  async remove(userId: string, movieId: string): Promise<void> {
    await this.repo.delete({ userId, movieId });
    await this.bumpVersion(userId);
  }

  async list(
    userId: string,
    query: ListFavoritesQueryDto,
  ): Promise<PaginatedFavoritesDto> {
    const limit = query.limit ?? FAVORITES_LIST_DEFAULT_LIMIT;
    const version = await this.getVersion(userId);
    const cacheKey = `favorites:${userId}:v${version}:${query.cursor ?? ''}:${limit}`;

    const cached = await this.cache.get<PaginatedFavoritesDto>(cacheKey);
    if (cached) return cached;

    const qb = this.repo
      .createQueryBuilder('f')
      .leftJoinAndSelect('f.movie', 'm')
      .where('f.user_id = :userId', { userId });

    const paginator = buildPaginator({
      entity: FavoriteEntry,
      alias: 'f',
      paginationKeys: ['addedAt', 'movieId'],
      query: {
        limit,
        order: 'DESC',
        afterCursor: query.cursor,
      },
    });

    const { data, cursor } = await paginator.paginate(qb);

    const result: PaginatedFavoritesDto = {
      data: data.map((entry) =>
        FavoriteItemDto.fromEntry(entry, entry.movie),
      ),
      meta: {
        nextCursor: cursor.afterCursor,
        hasMore: cursor.afterCursor !== null,
      },
    };

    await this.cache.set(cacheKey, result, this.ttlMs());
    return result;
  }

  private ttlMs(): number {
    return (
      FAVORITES_CACHE_TTL_MS +
      Math.floor(Math.random() * FAVORITES_CACHE_TTL_JITTER_MS)
    );
  }

  private versionKey(userId: string): string {
    return `${FAVORITES_VERSION_KEY_PREFIX}${userId}`;
  }

  private async getVersion(userId: string): Promise<string> {
    const v = await this.cache.get<string>(this.versionKey(userId));
    return v ?? FAVORITES_VERSION_DEFAULT;
  }

  private async bumpVersion(userId: string): Promise<void> {
    await this.cache.set(
      this.versionKey(userId),
      String(Date.now()),
      FAVORITES_VERSION_TTL_MS,
    );
  }
}
