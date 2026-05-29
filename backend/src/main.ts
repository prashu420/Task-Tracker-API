import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // All routes live under /api (keeps room for docs, future versioning, etc.).
  app.setGlobalPrefix('api');

  // Consistent error envelope for every endpoint.
  app.useGlobalFilters(new AllExceptionsFilter());

  // Validate + sanitise all incoming DTOs. `whitelist` strips unknown props,
  // `forbidNonWhitelisted` rejects them, `transform` coerces to DTO types. The
  // custom factory tags validation failures with the VALIDATION_ERROR code.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: (errors) => {
        const messages = errors.flatMap((e) =>
          Object.values(e.constraints ?? {}),
        );
        return new BadRequestException({
          code: 'VALIDATION_ERROR',
          message: messages,
        });
      },
    }),
  );

  // Let Nest run onModuleDestroy hooks on SIGTERM/SIGINT so Prisma and Redis
  // close their connections cleanly when the container stops.
  app.enableShutdownHooks();

  const config = app.get(ConfigService);
  const port = Number(config.get('PORT', 3000));
  await app.listen(port);
}
void bootstrap();
