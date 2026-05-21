import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  // Validates every incoming request body against its DTO's class-validator
  // decorators. whitelist + forbidNonWhitelisted strips/rejects unknown
  // fields so clients can't smuggle extra properties (e.g., `isAdmin: true`).
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  // OpenAPI / Swagger UI at /api, spec JSON at /api-json
  const swaggerConfig = new DocumentBuilder()
    .setTitle('TMDB CRUD API')
    .setDescription(
      'NestJS service that mirrors TMDB data and adds user-owned features (ratings, watchlist, favorites) with JWT auth.',
    )
    .setVersion('1.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'access-token',
    )
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api', app, document);

  const port = config.get<number>('PORT') ?? 8080;
  await app.listen(port);
}

bootstrap().catch((err) => {
  console.error('Failed to bootstrap NestJS app', err);
  process.exit(1);
});
