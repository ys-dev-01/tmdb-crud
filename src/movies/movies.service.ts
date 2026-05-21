import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Cache } from 'cache-manager';
import { Repository } from 'typeorm';
import { buildPaginator } from 'typeorm-cursor-pagination';
import { Genre } from '../genres/genre.entity';
import { MovieGenre } from './movie-genre.entity';
import {
  MOVIES_CACHE_TTL_JITTER_MS,
  MOVIES_CACHE_TTL_MS,
  MOVIES_LIST_DEFAULT_LIMIT,
  MOVIES_RATING_VERSION_DEFAULT,
  MOVIES_RATING_VERSION_KEY,
} from './movies.constants';
import { Movie } from './movie.entity';
import { ListMoviesQueryDto } from './dto/list-movies.query.dto';
import { MovieDetailDto } from './dto/movie-detail.dto';
import { MovieListItemDto } from './dto/movie-list-item.dto';
import { PaginatedMoviesDto } from './dto/paginated-movies.dto';
import { SearchMoviesQueryDto } from './dto/search-movies.query.dto';
import { SearchResultDto } from './dto/search-result.dto';

/**
 * Read-side for movies.
 *
 * Avg rating: read from the denormalized rating_sum / rating_count columns
 * on the movies row. O(1) — no JOIN, no AVG aggregate. The ratings write
 * path (PR #8) maintains these counters transactionally.
 *
 * Pagination: cursor-based via the typeorm-cursor-pagination package.
 * Compound paginationKey ['popularity', 'id'] — popularity for the
 * user-meaningful sort, id as tiebreaker so two equally-popular movies
 * land on stable pages.
 *
 * Genre filter: EXISTS subquery with OR semantics — a movie matches if
 * any of its genres is in the filter set. EXISTS short-circuits and
 * doesn't multiply rows, unlike a naive JOIN + DISTINCT.
 *
 * Caching: all three read endpoints cache-aside via the global
 * CACHE_MANAGER. Keys are deterministic from the query params; TTL is
 * 5 minutes plus per-key jitter so dozens of entries don't expire in the
 * same second after a cold start.
 */
@Injectable()
export class MoviesService {
  constructor(
    @InjectRepository(Movie) private readonly repo: Repository<Movie>,
    @InjectRepository(Genre) private readonly genreRepo: Repository<Genre>,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  // Random jitter added to each cache.set TTL. Spreads re-fetches so
  // dozens of keys don't expire at the same second after a cold start.
  private ttlMs(): number {
    return (
      MOVIES_CACHE_TTL_MS +
      Math.floor(Math.random() * MOVIES_CACHE_TTL_JITTER_MS)
    );
  }

  /**
   * Current "version" of the list/search cache namespace. Bumped by
   * RatingsService on every write; old cache entries (still under the
   * previous version prefix) become unreachable and TTL out on their
   * own. Cheap O(1) invalidation of a whole wildcarded key namespace.
   *
   * Defaults to `'0'` before any rating write has bumped it — that way
   * cold-start readers all share the same namespace.
   */
  private async cacheVersion(): Promise<string> {
    const v = await this.cache.get<string>(MOVIES_RATING_VERSION_KEY);
    return v ?? MOVIES_RATING_VERSION_DEFAULT;
  }

  async findMany(query: ListMoviesQueryDto): Promise<PaginatedMoviesDto> {
    const limit = query.limit ?? MOVIES_LIST_DEFAULT_LIMIT;
    const genreIds = query.genreIds
      ?.split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const version = await this.cacheVersion();
    const cacheKey = `movies:list:v${version}:${limit}:${query.cursor ?? ''}:${genreIds?.join(',') ?? ''}`;
    const cached = await this.cache.get<PaginatedMoviesDto>(cacheKey);
    if (cached) return cached;

    const qb = this.repo.createQueryBuilder('m');

    if (genreIds && genreIds.length > 0) {
      qb.andWhere(
        'EXISTS (SELECT 1 FROM movie_genres mg WHERE mg.movie_id = m.id AND mg.genre_id IN (:...genreIds))',
        { genreIds },
      );
    }

    const paginator = buildPaginator({
      entity: Movie,
      alias: 'm',
      paginationKeys: ['popularity', 'id'],
      query: {
        limit,
        order: 'DESC',
        afterCursor: query.cursor,
      },
    });

    const { data, cursor } = await paginator.paginate(qb);

    const result: PaginatedMoviesDto = {
      data: data.map((m) => MovieListItemDto.from(m)),
      meta: {
        nextCursor: cursor.afterCursor,
        hasMore: cursor.afterCursor !== null,
      },
    };
    await this.cache.set(cacheKey, result, this.ttlMs());
    return result;
  }

  async findOne(id: string): Promise<MovieDetailDto> {
    const cacheKey = `movies:detail:${id}`;
    const cached = await this.cache.get<MovieDetailDto>(cacheKey);
    if (cached) return cached;

    const movie = await this.repo.findOne({ where: { id } });
    if (!movie) throw new NotFoundException(`Movie ${id} not found`);

    // Embed the genre rows for this movie. Two queries instead of one with
    // a JOIN: avoids row-multiplication and keeps the response shape
    // independent of the FK direction.
    const genres = await this.genreRepo
      .createQueryBuilder('g')
      .innerJoin(MovieGenre, 'mg', 'mg.genre_id = g.id')
      .where('mg.movie_id = :movieId', { movieId: movie.id })
      .orderBy('g.name', 'ASC')
      .getMany();

    const result = MovieDetailDto.fromWithGenres(movie, genres);
    await this.cache.set(cacheKey, result, this.ttlMs());
    return result;
  }

  /**
   * Substring search against movie titles. The WHERE clause uses ILIKE
   * on the trigram-GIN-indexed `title` column; Postgres picks the index
   * once the pattern has ≥ 2 chars (enforced by the DTO).
   *
   * Ordered by popularity DESC, id ASC — users searching "venom" want
   * the popular Venom first, not the most-exact title match.
   */
  async search(query: SearchMoviesQueryDto): Promise<SearchResultDto> {
    const limit = query.limit ?? MOVIES_LIST_DEFAULT_LIMIT;
    const genreIds = query.genreIds
      ?.split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const version = await this.cacheVersion();
    // Lowercased q so 'mario' and 'Mario' share a cache key — ILIKE is
    // case-insensitive on the DB side, so they return identical rows.
    const cacheKey = `movies:search:v${version}:${query.q.toLowerCase()}:${limit}:${genreIds?.join(',') ?? ''}`;
    const cached = await this.cache.get<SearchResultDto>(cacheKey);
    if (cached) return cached;

    const qb = this.repo
      .createQueryBuilder('m')
      .where('m.title ILIKE :pattern', { pattern: `%${query.q}%` });

    if (genreIds && genreIds.length > 0) {
      qb.andWhere(
        'EXISTS (SELECT 1 FROM movie_genres mg WHERE mg.movie_id = m.id AND mg.genre_id IN (:...genreIds))',
        { genreIds },
      );
    }

    const [movies, total] = await qb
      .orderBy('m.popularity', 'DESC')
      .addOrderBy('m.id', 'ASC')
      .limit(limit)
      .getManyAndCount();

    const result: SearchResultDto = {
      data: movies.map((m) => MovieListItemDto.from(m)),
      total,
    };
    await this.cache.set(cacheKey, result, this.ttlMs());
    return result;
  }
}
