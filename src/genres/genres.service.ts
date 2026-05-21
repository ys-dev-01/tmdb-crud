import { Inject, Injectable } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { InjectRepository } from '@nestjs/typeorm';
import type { Cache } from 'cache-manager';
import { Repository } from 'typeorm';
import { Genre } from './genre.entity';

const GENRES_LIST_KEY = 'genres:list';
// TMDB's genre catalog is effectively static (changes maybe yearly).
// 24h TTL is aggressive but safe — worst case: one-day-stale name.
const GENRES_LIST_TTL_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class GenresService {
  constructor(
    @InjectRepository(Genre)
    private readonly repo: Repository<Genre>,
    @Inject(CACHE_MANAGER)
    private readonly cache: Cache,
  ) {}

  // Cache-aside: try Redis first; on miss, hit Postgres and populate
  // the cache. Alphabetical sort is the friendliest default for callers.
  async findAll(): Promise<Genre[]> {
    const cached = await this.cache.get<Genre[]>(GENRES_LIST_KEY);
    if (cached) return cached;

    const rows = await this.repo.find({ order: { name: 'ASC' } });
    await this.cache.set(GENRES_LIST_KEY, rows, GENRES_LIST_TTL_MS);
    return rows;
  }
}
