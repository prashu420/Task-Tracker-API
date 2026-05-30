import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import type { Task } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import type { AuthUser } from '../common/types/auth-user';
import { LoadedTask } from './decorators/loaded-task.decorator';
import { CreateTaskDto } from './dto/create-task.dto';
import { ListTasksDto } from './dto/list-tasks.dto';
import { TransitionTaskDto } from './dto/transition-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { TaskAccessGuard } from './guards/task-access.guard';
import { TasksService } from './tasks.service';

@Controller('tasks')
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  // Only ADMIN/MANAGER create tasks (and assign them).
  @Post()
  @Roles(Role.ADMIN, Role.MANAGER)
  @HttpCode(HttpStatus.CREATED)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateTaskDto) {
    return this.tasks.create(user, dto);
  }

  // Any authenticated user; the service scopes MEMBERs to their own tasks.
  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: ListTasksDto) {
    return this.tasks.list(user, query);
  }

  // The remaining routes operate on a single task; TaskAccessGuard loads it,
  // enforces org + ownership, and hands it over via @LoadedTask.
  @Get(':id')
  @UseGuards(TaskAccessGuard)
  findOne(@LoadedTask() task: Task) {
    return task;
  }

  @Patch(':id')
  @UseGuards(TaskAccessGuard)
  update(
    @CurrentUser() user: AuthUser,
    @LoadedTask() task: Task,
    @Body() dto: UpdateTaskDto,
  ) {
    return this.tasks.update(user, task, dto);
  }

  // Status moves only through here, so the state machine is always enforced.
  // Access (assignee or MANAGER/ADMIN) is handled by TaskAccessGuard.
  @Patch(':id/status')
  @UseGuards(TaskAccessGuard)
  transition(@LoadedTask() task: Task, @Body() dto: TransitionTaskDto) {
    return this.tasks.transition(task, dto.status);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.MANAGER)
  @UseGuards(TaskAccessGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@LoadedTask() task: Task) {
    return this.tasks.remove(task);
  }
}
