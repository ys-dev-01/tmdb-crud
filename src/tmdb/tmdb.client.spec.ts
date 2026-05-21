/**
 * Unit tests for TmdbClient.
 *
 * Mocks axios and axios-retry at the module boundary so we can assert:
 * - onModuleInit wires the axios instance with the configured baseURL,
 *   timeout, and api_key param
 * - fetchGenres calls the documented TMDB path with the language param
 * - both error branches in toTmdbError (axios vs non-axios) wrap in TmdbError
 *
 * The retry behavior itself isn't asserted — that's library config; the
 * value here is that axiosRetry is called at all and that the error path
 * does the right wrapping when retries are exhausted.
 */
jest.mock('axios');
jest.mock('axios-retry');

import axios, { AxiosInstance } from 'axios';
import axiosRetry from 'axios-retry';
import { ConfigService } from '@nestjs/config';
import { TmdbClient } from './tmdb.client';
import { TmdbError } from './tmdb.error';

const mockAxiosCreate = axios.create as jest.MockedFunction<
  typeof axios.create
>;
const mockIsAxiosError = axios.isAxiosError as unknown as jest.Mock;
const mockAxiosRetry = axiosRetry as unknown as jest.Mock;

describe('TmdbClient', () => {
  let mockHttp: { get: jest.Mock };
  let client: TmdbClient;

  beforeEach(() => {
    jest.clearAllMocks();
    mockHttp = { get: jest.fn() };
    mockAxiosCreate.mockReturnValue(mockHttp as unknown as AxiosInstance);

    const config = {
      get: (key: string) =>
        key === 'TMDB_BASE_URL'
          ? 'https://api.themoviedb.org/3'
          : key === 'TMDB_API_KEY'
            ? 'test-key'
            : undefined,
    } as unknown as ConfigService;

    client = new TmdbClient(config);
    client.onModuleInit();
  });

  describe('onModuleInit', () => {
    it('creates the axios instance with baseURL, 10s timeout, api_key param', () => {
      expect(mockAxiosCreate).toHaveBeenCalledWith({
        baseURL: 'https://api.themoviedb.org/3',
        timeout: 10_000,
        params: { api_key: 'test-key' },
      });
    });

    it('configures axiosRetry on the instance', () => {
      expect(mockAxiosRetry).toHaveBeenCalledTimes(1);
      // First arg is the instance, second is the retry options object.
      const [instance, opts] = mockAxiosRetry.mock.calls[0] as [
        unknown,
        { retries: number; retryCondition: (e: unknown) => boolean },
      ];
      expect(instance).toBe(mockHttp);
      expect(opts.retries).toBe(3);
    });
  });

  describe('fetchGenres', () => {
    it('GETs /genre/movie/list with language=en-US and returns the body', async () => {
      const data = { genres: [{ id: 28, name: 'Action' }] };
      mockHttp.get.mockResolvedValue({ data });

      const result = await client.fetchGenres();

      expect(mockHttp.get).toHaveBeenCalledWith('/genre/movie/list', {
        params: { language: 'en-US' },
      });
      expect(result).toEqual(data);
    });

    it('wraps an axios error (with response.status) in TmdbError', async () => {
      mockIsAxiosError.mockReturnValue(true);
      mockHttp.get.mockRejectedValue({
        isAxiosError: true,
        response: { status: 500 },
        message: 'boom',
      });

      await expect(client.fetchGenres()).rejects.toBeInstanceOf(TmdbError);
    });

    it('wraps an axios network error (no response) in TmdbError', async () => {
      mockIsAxiosError.mockReturnValue(true);
      mockHttp.get.mockRejectedValue({
        isAxiosError: true,
        message: 'ECONNREFUSED',
      });

      await expect(client.fetchGenres()).rejects.toBeInstanceOf(TmdbError);
    });

    it('wraps a non-axios Error in TmdbError', async () => {
      mockIsAxiosError.mockReturnValue(false);
      mockHttp.get.mockRejectedValue(new Error('unknown'));

      await expect(client.fetchGenres()).rejects.toBeInstanceOf(TmdbError);
    });

    it('wraps a non-Error throw value in TmdbError', async () => {
      mockIsAxiosError.mockReturnValue(false);
      mockHttp.get.mockRejectedValue('plain string');

      await expect(client.fetchGenres()).rejects.toBeInstanceOf(TmdbError);
    });
  });
});
