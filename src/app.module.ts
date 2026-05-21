import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { CacheModule } from '@nestjs/cache-manager';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Keyv } from 'keyv';
import KeyvRedis from '@keyv/redis';
import { envValidationSchema } from './config/env.validation';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { GenresModule } from './genres/genres.module';
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
    GenresModule,
    AuthModule,
  ],
  controllers: [],
  providers: [
    // Apply JwtAuthGuard to every route. Endpoints opt out with @Public().
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
