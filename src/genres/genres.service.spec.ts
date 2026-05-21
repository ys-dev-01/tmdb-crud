import { Repository } from 'typeorm';
import { GenresService } from './genres.service';
import { Genre } from './genre.entity';

describe('GenresService', () => {
  let repo: jest.Mocked<Pick<Repository<Genre>, 'find'>>;
  let service: GenresService;

  beforeEach(() => {
    repo = { find: jest.fn() };
    service = new GenresService(repo as unknown as Repository<Genre>);
  });

  describe('findAll', () => {
    it('returns rows alphabetically by name', async () => {
      const rows: Genre[] = [
        { id: '1', tmdbId: 28, name: 'Action' } as Genre,
        { id: '2', tmdbId: 18, name: 'Drama' } as Genre,
      ];
      repo.find.mockResolvedValue(rows);

      const result = await service.findAll();

      expect(repo.find).toHaveBeenCalledWith({ order: { name: 'ASC' } });
      expect(result).toBe(rows);
    });

    it('returns an empty array when the table is empty', async () => {
      repo.find.mockResolvedValue([]);

      const result = await service.findAll();

      expect(result).toEqual([]);
    });
  });
});
