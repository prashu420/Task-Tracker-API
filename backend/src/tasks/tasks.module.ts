import { Module } from '@nestjs/common';
import { TaskAccessGuard } from './guards/task-access.guard';
import { TaskCacheService } from './task-cache.service';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';

@Module({
  controllers: [TasksController],
  providers: [TasksService, TaskAccessGuard, TaskCacheService],
})
export class TasksModule {}
