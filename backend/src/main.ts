import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // All routes live under /api (keeps room for docs, future versioning, etc.).
  app.setGlobalPrefix('api');

  // OpenAPI / Swagger UI at /api/docs. The documented paths already include the
  // global /api prefix, so no server override is needed. addBearerAuth wires the
  // Authorize button for JWTs.
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Team Task Tracker API')
    .setDescription(
      'Team-based task tracker: JWT auth with refresh rotation, RBAC, ' +
        'task state machine, and Redis-cached task lists.',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

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
  // Bind 0.0.0.0 so the server is reachable from outside its container.
  await app.listen(port, '0.0.0.0');
}
void bootstrap();
