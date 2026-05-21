import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Genre } from './genre.entity';

@Injectable()
export class GenresService {
  constructor(
    @InjectRepository(Genre)
    private readonly repo: Repository<Genre>,
  ) {}

  // ~20 rows total — no pagination warranted. Alphabetical sort is the
  // friendliest default; TMDB's tmdb_id ordering is meaningless to clients.
  findAll(): Promise<Genre[]> {
    return this.repo.find({ order: { name: 'ASC' } });
  }
}
