import { Cache } from 'cache-manager';
import { Repository } from 'typeorm';
import { GenresService } from './genres.service';
import { Genre } from './genre.entity';

describe('GenresService', () => {
  let repo: jest.Mocked<Pick<Repository<Genre>, 'find'>>;
  let cache: jest.Mocked<Pick<Cache, 'get' | 'set'>>;
  let service: GenresService;

  beforeEach(() => {
    repo = { find: jest.fn() };
    cache = { get: jest.fn(), set: jest.fn() };
    service = new GenresService(
      repo as unknown as Repository<Genre>,
      cache as unknown as Cache,
    );
  });

  describe('findAll', () => {
    const rows: Genre[] = [
      { id: '1', tmdbId: 28, name: 'Action' } as Genre,
      { id: '2', tmdbId: 18, name: 'Drama' } as Genre,
    ];

    it('cache miss: queries DB, populates cache with 24h TTL, returns rows', async () => {
      cache.get.mockResolvedValue(undefined);
      repo.find.mockResolvedValue(rows);

      const result = await service.findAll();

      expect(cache.get).toHaveBeenCalledWith('genres:list');
      expect(repo.find).toHaveBeenCalledWith({ order: { name: 'ASC' } });
      expect(cache.set).toHaveBeenCalledWith(
        'genres:list',
        rows,
        24 * 60 * 60 * 1000,
      );
      expect(result).toBe(rows);
    });

    it('cache hit: returns cached value WITHOUT querying DB', async () => {
      cache.get.mockResolvedValue(rows);

      const result = await service.findAll();

      expect(cache.get).toHaveBeenCalledWith('genres:list');
      expect(repo.find).not.toHaveBeenCalled();
      expect(cache.set).not.toHaveBeenCalled();
      expect(result).toBe(rows);
    });

    it('empty result: still cached so we do not hit DB twice on rapid hits', async () => {
      cache.get.mockResolvedValue(undefined);
      repo.find.mockResolvedValue([]);

      const result = await service.findAll();

      expect(result).toEqual([]);
      expect(cache.set).toHaveBeenCalledWith(
        'genres:list',
        [],
        24 * 60 * 60 * 1000,
      );
    });
  });
});
