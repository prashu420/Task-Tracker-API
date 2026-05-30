import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../redis/redis.service';
import { ListTasksDto } from './dto/list-tasks.dto';

/**
 * Cache-aside layer for the per-assignee task list.
 *
 * Keys:
 *   tasks:org:{org}:assignee:{assignee}:{filter}  -> a cached list page (TTL)
 *   tasks:keys:assignee:{assignee}                -> SET of that assignee's keys
 *
 * The tracking SET is what makes invalidation cheap: to drop every cached page
 * for an assignee we read the set and delete those exact keys, rather than a
 * `KEYS tasks:*` scan, which is O(N) over the whole keyspace and blocks Redis in
 * production. TTL is only a safety net — correctness comes from invalidating on
 * write. All operations are best-effort: a Redis failure degrades to hitting the
 * database, never an error to the client.
 */
@Injectable()
export class TaskCacheService {
  private readonly logger = new Logger(TaskCacheService.name);
  private readonly ttl: number;

  constructor(
    private readonly redis: RedisService,
    config: ConfigService,
  ) {
    this.ttl = Number(config.get('TASK_CACHE_TTL', 60));
  }

  buildKey(orgId: string, assigneeId: string, query: ListTasksDto): string {
    const filter = [
      `page=${query.page ?? 1}`,
      `limit=${query.limit ?? 20}`,
      `status=${query.status ?? ''}`,
      `priority=${query.priority ?? ''}`,
    ].join('&');
    return `tasks:org:${orgId}:assignee:${assigneeId}:${filter}`;
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const raw = await this.redis.getClient().get(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch (err) {
      this.logger.warn(`cache get failed: ${(err as Error).message}`);
      return null;
    }
  }

  async set(key: string, assigneeId: string, value: unknown): Promise<void> {
    try {
      const setKey = this.trackingSet(assigneeId);
      await this.redis
        .getClient()
        .multi()
        .set(key, JSON.stringify(value), 'EX', this.ttl)
        .sadd(setKey, key)
        // Bound the index's lifetime in case invalidation never fires for it.
        .expire(setKey, this.ttl * 10)
        .exec();
    } catch (err) {
      this.logger.warn(`cache set failed: ${(err as Error).message}`);
    }
  }

  /** Drop every cached list page for an assignee (O(pages), no KEYS scan). */
  async invalidateAssignee(assigneeId: string | null | undefined): Promise<void> {
    if (!assigneeId) return;
    try {
      const client = this.redis.getClient();
      const setKey = this.trackingSet(assigneeId);
      const keys = await client.smembers(setKey);
      await client.del(...keys, setKey);
    } catch (err) {
      this.logger.warn(`cache invalidate failed: ${(err as Error).message}`);
    }
  }

  private trackingSet(assigneeId: string): string {
    return `tasks:keys:assignee:${assigneeId}`;
  }
}
