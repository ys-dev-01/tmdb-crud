import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get<string>('DB_HOST'),
        port: config.get<number>('DB_PORT'),
        username: config.get<string>('DB_USER'),
        password: config.get<string>('DB_PASSWORD'),
        database: config.get<string>('DB_NAME'),
        // Feature modules call TypeOrmModule.forFeature([Entity]) and those entities
        // are automatically picked up here. No global entities[] list to maintain.
        autoLoadEntities: true,
        // NEVER true in production. Migrations only.
        synchronize: false,
        // Don't auto-run migrations on app boot. Run explicitly via `npm run migration:run`.
        migrationsRun: false,
      }),
      inject: [ConfigService],
    }),
  ],
})
export class DatabaseModule {}
