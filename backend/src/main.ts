import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // All routes live under /api (keeps room for docs, future versioning, etc.).
  app.setGlobalPrefix('api');

  // Let Nest run onModuleDestroy hooks on SIGTERM/SIGINT so Prisma and Redis
  // close their connections cleanly when the container stops.
  app.enableShutdownHooks();

  const config = app.get(ConfigService);
  const port = Number(config.get('PORT', 3000));
  await app.listen(port);
}
void bootstrap();
