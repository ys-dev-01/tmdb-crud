import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance, isAxiosError } from 'axios';
import axiosRetry, {
  exponentialDelay,
  isNetworkOrIdempotentRequestError,
} from 'axios-retry';
import { TmdbError } from './tmdb.error';
import { TmdbDiscoverResponse, TmdbGenresResponse } from './tmdb.types';

@Injectable()
export class TmdbClient implements OnModuleInit {
  private readonly logger = new Logger(TmdbClient.name);
  private http!: AxiosInstance;

  constructor(private readonly config: ConfigService) {}

  // ConfigService is fully populated by the time OnModuleInit fires.
  // Building the axios instance here (not in the constructor) keeps env reads
  // out of the construction path and lets tests inject a mocked ConfigService.
  onModuleInit(): void {
    this.http = axios.create({
      baseURL: this.config.get<string>('TMDB_BASE_URL'),
      timeout: 10_000,
      params: { api_key: this.config.get<string>('TMDB_API_KEY') },
    });

    axiosRetry(this.http, {
      retries: 3,
      retryDelay: exponentialDelay,
      retryCondition: (err) =>
        // axios-retry's default: network errors + idempotent 5xx.
        // Also retry on 429 (rate limit) — TMDB throttles bursts.
        isNetworkOrIdempotentRequestError(err) || err.response?.status === 429,
    });
  }

  async fetchGenres(): Promise<TmdbGenresResponse> {
    return this.get<TmdbGenresResponse>('/genre/movie/list', {
      language: 'en-US',
    });
  }

  /**
   * Paginated movie listing. TMDB caps `page` at 500 (~10k movies total).
   * sort_by=popularity.desc keeps results stable enough for repeat syncs.
   */
  async fetchDiscoverMovies(page: number): Promise<TmdbDiscoverResponse> {
    return this.get<TmdbDiscoverResponse>('/discover/movie', {
      language: 'en-US',
      sort_by: 'popularity.desc',
      include_adult: 'false',
      page,
    });
  }

  private async get<T>(
    path: string,
    params?: Record<string, string | number>,
  ): Promise<T> {
    try {
      const response = await this.http.get<T>(path, { params });
      return response.data;
    } catch (err) {
      throw this.toTmdbError(err, path);
    }
  }

  private toTmdbError(err: unknown, path: string): TmdbError {
    if (isAxiosError(err)) {
      const status = err.response?.status;
      const msg = status
        ? `TMDB ${path} responded ${status}`
        : `TMDB ${path} unreachable: ${err.message}`;
      this.logger.error(msg);
      return new TmdbError(msg, status, err);
    }
    const fallback = err instanceof Error ? err.message : String(err);
    this.logger.error(`TMDB ${path} failed: ${fallback}`);
    return new TmdbError(`TMDB ${path} failed: ${fallback}`, undefined, err);
  }
}
