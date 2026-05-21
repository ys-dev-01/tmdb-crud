import { Repository } from 'typeorm';
import { GenresSyncService } from './genres.sync';
import { Genre } from './genre.entity';
import { TmdbClient } from '../tmdb/tmdb.client';
import { TmdbError } from '../tmdb/tmdb.error';

// QueryBuilder chain stub: each method returns `this` until execute() resolves.
function makeQbStub() {
  const execute = jest.fn().mockResolvedValue(undefined);
  const orUpdate = jest.fn().mockReturnValue({ execute });
  const values = jest.fn().mockReturnValue({ orUpdate });
  const into = jest.fn().mockReturnValue({ values });
  const insert = jest.fn().mockReturnValue({ into });
  const createQueryBuilder = jest.fn().mockReturnValue({ insert });
  return { createQueryBuilder, insert, into, values, orUpdate, execute };
}

describe('GenresSyncService', () => {
  let tmdb: jest.Mocked<Pick<TmdbClient, 'fetchGenres'>>;
  let qb: ReturnType<typeof makeQbStub>;
  let repo: jest.Mocked<Pick<Repository<Genre>, 'createQueryBuilder'>>;
  let service: GenresSyncService;

  beforeEach(() => {
    tmdb = { fetchGenres: jest.fn() };
    qb = makeQbStub();
    repo = { createQueryBuilder: qb.createQueryBuilder };
    service = new GenresSyncService(
      tmdb as unknown as TmdbClient,
      repo as unknown as Repository<Genre>,
    );
  });

  describe('sync', () => {
    it('maps TMDB genres into upsert rows and runs ON CONFLICT DO UPDATE', async () => {
      tmdb.fetchGenres.mockResolvedValue({
        genres: [
          { id: 28, name: 'Action' },
          { id: 35, name: 'Comedy' },
        ],
      });

      const count = await service.sync();

      expect(count).toBe(2);
      expect(qb.values).toHaveBeenCalledWith([
        { tmdbId: 28, name: 'Action' },
        { tmdbId: 35, name: 'Comedy' },
      ]);
      expect(qb.orUpdate).toHaveBeenCalledWith(['name'], ['tmdb_id']);
      expect(qb.execute).toHaveBeenCalledTimes(1);
    });

    it('skips the upsert when TMDB returns zero genres', async () => {
      tmdb.fetchGenres.mockResolvedValue({ genres: [] });

      const count = await service.sync();

      expect(count).toBe(0);
      expect(qb.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('propagates TmdbError from the client', async () => {
      tmdb.fetchGenres.mockRejectedValue(
        new TmdbError('TMDB /genre/movie/list responded 500', 500),
      );

      await expect(service.sync()).rejects.toBeInstanceOf(TmdbError);
      expect(qb.createQueryBuilder).not.toHaveBeenCalled();
    });
  });

  describe('onApplicationBootstrap', () => {
    it('swallows sync failures so app boot continues', async () => {
      tmdb.fetchGenres.mockRejectedValue(new TmdbError('unreachable'));

      await expect(service.onApplicationBootstrap()).resolves.toBeUndefined();
    });
  });
});
