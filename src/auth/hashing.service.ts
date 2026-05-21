import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';

/**
 * Password hashing wrapper around argon2id.
 *
 * Parameters per OWASP 2026 Password Storage Cheat Sheet:
 *   m = 65536 KiB (64 MiB memory cost)
 *   t = 3        (iterations)
 *   p = 1        (parallelism)
 *
 * Memory-hardness makes GPU/ASIC attacks expensive. Argon2id (the
 * hybrid variant) is the OWASP first-choice recommendation.
 *
 * The hash string self-documents: algorithm name, version, params,
 * salt, and digest are all encoded in one string, so verify() doesn't
 * need any external context.
 */
@Injectable()
export class HashingService {
  private readonly options: argon2.Options = {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 1,
  };

  hash(password: string): Promise<string> {
    return argon2.hash(password, this.options);
  }

  verify(hash: string, password: string): Promise<boolean> {
    return argon2.verify(hash, password);
  }
}
