import { Global, Module } from '@nestjs/common';
import { RedisService } from './redis.service';

/** Global: one shared Redis connection injectable everywhere. */
@Global()
@Module({
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}
