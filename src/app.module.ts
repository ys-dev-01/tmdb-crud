import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { CacheModule } from '@nestjs/cache-manager';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { Keyv } from 'keyv';
import KeyvRedis from '@keyv/redis';
import { envValidationSchema } from './config/env.validation';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { GenresModule } from './genres/genres.module';
import { MoviesModule } from './movies/movies.module';
import { RatingsModule } from './ratings/ratings.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: envValidationSchema,
      validationOptions: {
        abortEarly: false,
      },
    }),
    // Powers @Cron decorators (used by MoviesSyncService for daily refresh).
    ScheduleModule.forRoot(),
    // Global cache backed by Redis via Keyv. Feature modules inject
    // `CACHE_MANAGER` for cache-aside read-through. allkeys-lru on the
    // Redis side bounds memory; the app treats cache strictly as a
    // performance layer, never a system of record.
    CacheModule.registerAsync({
      isGlobal: true,
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        stores: [
          new Keyv({
            store: new KeyvRedis(
              `redis://${config.get<string>('REDIS_HOST')}:${config.get<number>('REDIS_PORT')}`,
            ),
          }),
        ],
      }),
    }),
    DatabaseModule,
    HealthModule,
    // GenresModule MUST be imported before MoviesModule. NestJS fires
    // OnApplicationBootstrap in module-import order, and the movies sync
    // needs genres in the DB to translate genre_ids → our PKs.
    GenresModule,
    MoviesModule,
    RatingsModule,
    AuthModule,
  ],
  controllers: [],
  providers: [
    // Apply JwtAuthGuard to every route. Endpoints opt out with @Public().
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
