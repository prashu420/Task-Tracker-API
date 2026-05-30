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
import { canTransition } from './task-status';

@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService) {}

  async create(user: AuthUser, dto: CreateTaskDto): Promise<Task> {
    await this.assertProjectInOrg(user.organizationId, dto.projectId);
    if (dto.assigneeId) {
      await this.assertAssigneeInOrg(user.organizationId, dto.assigneeId);
    }

    return this.prisma.task.create({
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
  }

  /** Paginated, filtered list. MEMBERs are always scoped to their own tasks. */
  async list(user: AuthUser, query: ListTasksDto) {
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

    return {
      data,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
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

    return this.prisma.task.update({
      where: { id: task.id },
      data: {
        title: dto.title,
        description: dto.description,
        priority: dto.priority,
        assigneeId: dto.assigneeId,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
      },
    });
  }

  /** Advance status through the state machine; stamp completedAt on DONE. */
  async transition(task: Task, to: TaskStatus): Promise<Task> {
    if (!canTransition(task.status, to)) {
      throw new UnprocessableEntityException({
        code: 'INVALID_STATUS_TRANSITION',
        message: `Cannot move a task from ${task.status} to ${to}`,
      });
    }

    return this.prisma.task.update({
      where: { id: task.id },
      data: {
        status: to,
        completedAt: to === TaskStatus.DONE ? new Date() : task.completedAt,
      },
    });
  }

  async remove(taskId: string): Promise<void> {
    await this.prisma.task.delete({ where: { id: taskId } });
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
