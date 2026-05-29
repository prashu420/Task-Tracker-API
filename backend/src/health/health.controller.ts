import {
  Controller,
  Get,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

/**
 * Liveness/readiness probe. Gives a reviewer something to hit immediately after
 * `docker compose up`, and lets orchestrators know when both backing stores are
 * actually reachable (not just when the process started).
 */
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Get()
  async check() {
    // Probe both in parallel; allSettled so one failure still reports the other.
    const [db, cache] = await Promise.allSettled([
      this.prisma.$queryRaw`SELECT 1`,
      this.redis.getClient().ping(),
    ]);

    const services = {
      database: db.status === 'fulfilled' ? 'up' : 'down',
      redis: cache.status === 'fulfilled' ? 'up' : 'down',
    };
    const payload = {
      status: 'ok',
      services,
      timestamp: new Date().toISOString(),
    };

    // Return 503 if anything is down so health checks fail loudly.
    if (services.database === 'down' || services.redis === 'down') {
      throw new ServiceUnavailableException({ ...payload, status: 'degraded' });
    }
    return payload;
  }
}
