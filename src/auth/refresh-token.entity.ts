import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../users/user.entity';

@Entity('refresh_tokens')
export class RefreshToken {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @Column({ name: 'user_id', type: 'bigint' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  // sha256 hex digest of the raw token. Raw token only ever leaves the server in the response body.
  @Column({ name: 'token_hash', type: 'varchar', length: 64, unique: true })
  tokenHash: string;

  // Generated at login (crypto.randomUUID()); copied forward on rotation.
  // Reuse detection revokes every token in the family.
  @Column({ name: 'family_id', type: 'uuid' })
  familyId: string;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  @Column({ name: 'replaced_by', type: 'bigint', nullable: true })
  replacedBy: string | null;

  // Self-FK so the generator emits the constraint. SET NULL on delete: if the
  // forward link in the chain is purged, upstream tokens drop the back-pointer
  // rather than cascading. We never .find({ relations: ['replacedByToken'] }) —
  // this is purely for the FK; reads stay on the scalar `replacedBy` column.
  @ManyToOne(() => RefreshToken, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'replaced_by' })
  replacedByToken: RefreshToken | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
