import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './user.entity';

/**
 * Pure data-access for the users table. No password hashing here — the
 * caller (AuthService) is responsible for hashing before .create() and
 * for verifying via HashingService after .findByEmail().
 */
@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly repo: Repository<User>,
  ) {}

  findByEmail(email: string): Promise<User | null> {
    return this.repo.findOne({ where: { email } });
  }

  findById(id: string): Promise<User | null> {
    return this.repo.findOne({ where: { id } });
  }

  create(input: { email: string; passwordHash: string }): Promise<User> {
    // .save() returns the persisted entity with id, created_at, updated_at populated.
    // UNIQUE(email) violations bubble up as QueryFailedError (code 23505) — caller
    // translates to ConflictException.
    return this.repo.save(this.repo.create(input));
  }
}
