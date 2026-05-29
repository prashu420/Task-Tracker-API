import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * Owns a single ioredis connection for the app. We use ioredis directly (rather
 * than a cache-manager abstraction) because the task-list cache needs explicit
 * control over key sets and pipelined invalidation — see the tasks cache layer.
 */
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client!: Redis;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    this.client = new Redis({
      host: this.config.get<string>('REDIS_HOST', 'localhost'),
      port: Number(this.config.get('REDIS_PORT', 6379)),
      // Fail fast instead of queueing commands forever if Redis is unreachable;
      // the cache is an optimization, never a hard dependency for correctness.
      maxRetriesPerRequest: 2,
    });

    this.client.on('error', (err) =>
      this.logger.error(`Redis connection error: ${err.message}`),
    );
  }

  /** Raw client for callers that need pipelines / multi-key operations. */
  getClient(): Redis {
    return this.client;
  }

  async onModuleDestroy(): Promise<void> {
    await this.client?.quit();
  }
}
