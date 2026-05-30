import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma, Priority, Role, Task, TaskStatus } from '@prisma/client';
import { AuthUser } from '../common/types/auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { ListTasksDto } from './dto/list-tasks.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { TaskCacheService } from './task-cache.service';
import { canTransition } from './task-status';

export interface TaskListResult {
  data: Task[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: TaskCacheService,
  ) {}

  async create(user: AuthUser, dto: CreateTaskDto): Promise<Task> {
    await this.assertProjectInOrg(user.organizationId, dto.projectId);
    if (dto.assigneeId) {
      await this.assertAssigneeInOrg(user.organizationId, dto.assigneeId);
    }

    const task = await this.prisma.task.create({
      data: {
        title: dto.title,
        description: dto.description,
        priority: dto.priority ?? Priority.MEDIUM,
        projectId: dto.projectId,
        assigneeId: dto.assigneeId,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        organizationId: user.organizationId,
      },
    });

    await this.cache.invalidateAssignee(task.assigneeId);
    return task;
  }

  /**
   * Paginated, filtered list. MEMBERs are always scoped to their own tasks.
   * Cache-aside: results are cached only when the list is scoped to a single
   * assignee (a MEMBER's own list, or an ADMIN/MANAGER filtering by assigneeId),
   * which keeps invalidation precise — a task write touches exactly one or two
   * assignees. Org-wide listings are not cached.
   */
  async list(user: AuthUser, query: ListTasksDto): Promise<TaskListResult> {
    const cacheAssignee =
      user.role === Role.MEMBER ? user.userId : query.assigneeId;
    const cacheKey = cacheAssignee
      ? this.cache.buildKey(user.organizationId, cacheAssignee, query)
      : null;

    if (cacheKey) {
      const cached = await this.cache.get<TaskListResult>(cacheKey);
      if (cached) return cached;
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const where: Prisma.TaskWhereInput = {
      organizationId: user.organizationId,
    };
    if (user.role === Role.MEMBER) {
      where.assigneeId = user.userId; // members only ever see their own tasks
    } else if (query.assigneeId) {
      where.assigneeId = query.assigneeId;
    }
    if (query.status) where.status = query.status;
    if (query.priority) where.priority = query.priority;

    const [data, total] = await this.prisma.$transaction([
      this.prisma.task.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.task.count({ where }),
    ]);

    const result: TaskListResult = {
      data,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };

    if (cacheKey && cacheAssignee) {
      await this.cache.set(cacheKey, cacheAssignee, result);
    }
    return result;
  }

  /**
   * Update editable fields. Only ADMIN/MANAGER may (re)assign a task — a MEMBER
   * can edit the task they own but not hand it to someone else.
   */
  async update(user: AuthUser, task: Task, dto: UpdateTaskDto): Promise<Task> {
    if (dto.assigneeId !== undefined) {
      if (user.role === Role.MEMBER) {
        throw new ForbiddenException({
          code: 'FORBIDDEN',
          message: 'Members cannot reassign tasks',
        });
      }
      await this.assertAssigneeInOrg(user.organizationId, dto.assigneeId);
    }

    const updated = await this.prisma.task.update({
      where: { id: task.id },
      data: {
        title: dto.title,
        description: dto.description,
        priority: dto.priority,
        assigneeId: dto.assigneeId,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
      },
    });

    // Always refresh the old assignee's cache; on reassignment refresh the new
    // one too, so neither sees a stale list.
    await this.cache.invalidateAssignee(task.assigneeId);
    if (dto.assigneeId !== undefined && dto.assigneeId !== task.assigneeId) {
      await this.cache.invalidateAssignee(dto.assigneeId);
    }
    return updated;
  }

  /** Advance status through the state machine; stamp completedAt on DONE. */
  async transition(task: Task, to: TaskStatus): Promise<Task> {
    if (!canTransition(task.status, to)) {
      throw new UnprocessableEntityException({
        code: 'INVALID_STATUS_TRANSITION',
        message: `Cannot move a task from ${task.status} to ${to}`,
      });
    }

    const updated = await this.prisma.task.update({
      where: { id: task.id },
      data: {
        status: to,
        completedAt: to === TaskStatus.DONE ? new Date() : task.completedAt,
      },
    });

    await this.cache.invalidateAssignee(task.assigneeId);
    return updated;
  }

  async remove(task: Task): Promise<void> {
    await this.prisma.task.delete({ where: { id: task.id } });
    await this.cache.invalidateAssignee(task.assigneeId);
  }

  // ── helpers ────────────────────────────────────────────────────────────────

  private async assertProjectInOrg(organizationId: string, projectId: string) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, organizationId },
      select: { id: true },
    });
    if (!project) {
      throw new BadRequestException({
        code: 'INVALID_PROJECT',
        message: 'Project not found in your organization',
      });
    }
  }

  private async assertAssigneeInOrg(organizationId: string, userId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, organizationId },
      select: { id: true },
    });
    if (!user) {
      throw new BadRequestException({
        code: 'INVALID_ASSIGNEE',
        message: 'Assignee is not a member of your organization',
      });
    }
  }
}
