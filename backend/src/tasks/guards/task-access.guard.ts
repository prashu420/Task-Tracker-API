import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role, Task } from '@prisma/client';
import { Request } from 'express';
import { AuthUser } from '../../common/types/auth-user';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Resource-level authorization for a single task (the row-level half of RBAC):
 *  - loads the task scoped to the caller's organization (cross-org → 404),
 *  - ADMIN/MANAGER may act on any task in their org,
 *  - MEMBER may act only on tasks assigned to them,
 *  - stashes the loaded task on the request so handlers don't re-query it.
 *
 * Role-only rules (who may create/delete) stay in @Roles; this guard adds the
 * "is it *yours*" check that a role alone can't express.
 */
@Injectable()
export class TaskAccessGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<Request & { user: AuthUser; task?: Task }>();
    const user = request.user;
    const taskId = String(request.params.id);

    const task = await this.prisma.task.findFirst({
      where: { id: taskId, organizationId: user.organizationId },
    });
    if (!task) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Task not found',
      });
    }

    if (user.role === Role.MEMBER && task.assigneeId !== user.userId) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'You can only access tasks assigned to you',
      });
    }

    request.task = task;
    return true;
  }
}
