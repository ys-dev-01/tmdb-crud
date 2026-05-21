import { MigrationInterface, QueryRunner } from 'typeorm';

export class PopularityFloat1779372111210 implements MigrationInterface {
  name = 'PopularityFloat1779372111210';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "movies" DROP COLUMN "popularity"`);
    await queryRunner.query(
      `ALTER TABLE "movies" ADD "popularity" double precision`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "movies" DROP COLUMN "popularity"`);
    await queryRunner.query(
      `ALTER TABLE "movies" ADD "popularity" numeric(8,3)`,
    );
  }
}
