import { Module } from '@nestjs/common';
import { TaskAccessGuard } from './guards/task-access.guard';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';

@Module({
  controllers: [TasksController],
  providers: [TasksService, TaskAccessGuard],
})
export class TasksModule {}
