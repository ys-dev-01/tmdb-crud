import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  // OpenAPI / Swagger UI at /api, spec JSON at /api-json
  const swaggerConfig = new DocumentBuilder()
    .setTitle('TMDB CRUD API')
    .setDescription(
      'NestJS service that mirrors TMDB data and adds user-owned features (ratings, watchlist, favorites) with JWT auth and Redis caching.',
    )
    .setVersion('1.0')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api', app, document);

  const port = config.get<number>('PORT') ?? 8080;
  await app.listen(port);
}
bootstrap();
