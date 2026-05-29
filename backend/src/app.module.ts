import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    // Global config: reads .env once and caches it; injectable as ConfigService.
    ConfigModule.forRoot({ isGlobal: true, cache: true }),
    PrismaModule,
    RedisModule,
    HealthModule,
    AuthModule,
  ],
})
export class AppModule {}
