import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { buildPaginator } from 'typeorm-cursor-pagination';
import { MOVIES_LIST_DEFAULT_LIMIT } from './movies.constants';
import { Movie } from './movie.entity';
import { ListMoviesQueryDto } from './dto/list-movies.query.dto';
import { MovieListItemDto } from './dto/movie-list-item.dto';
import { PaginatedMoviesDto } from './dto/paginated-movies.dto';

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
 * land on stable pages. The library handles base64 encoding of the
 * cursor and constructing the WHERE (popularity, id) < (cursorPop, cursorId)
 * tuple comparison.
 *
 * Genre filter: EXISTS subquery with OR semantics — a movie matches if
 * any of its genres is in the filter set. EXISTS short-circuits and
 * doesn't multiply rows, unlike a naive JOIN + DISTINCT.
 */
@Injectable()
export class MoviesService {
  constructor(
    @InjectRepository(Movie) private readonly repo: Repository<Movie>,
  ) {}

  async findMany(query: ListMoviesQueryDto): Promise<PaginatedMoviesDto> {
    const limit = query.limit ?? MOVIES_LIST_DEFAULT_LIMIT;
    const genreIds = query.genreIds
      ?.split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const qb = this.repo.createQueryBuilder('m');

    if (genreIds && genreIds.length > 0) {
      qb.andWhere(
        'EXISTS (SELECT 1 FROM movie_genres mg WHERE mg.movie_id = m.id AND mg.genre_id IN (:...genreIds))',
        { genreIds },
      );
    }

    // Compound key (popularity, id): popularity is the user-meaningful sort,
    // id breaks ties so two equally-popular movies land on stable pages. See
    // Movie.popularity for the TS-reflection caveat that made this possible.
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

    return {
      data: data.map((m) => MovieListItemDto.from(m)),
      meta: {
        nextCursor: cursor.afterCursor,
        hasMore: cursor.afterCursor !== null,
      },
    };
  }
}
