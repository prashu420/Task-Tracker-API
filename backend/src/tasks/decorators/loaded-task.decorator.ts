import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Task } from '@prisma/client';
import { Request } from 'express';

/**
 * Returns the task that TaskAccessGuard loaded onto the request, avoiding a
 * second DB lookup in the handler. Only valid on routes guarded by it.
 */
export const LoadedTask = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Task => {
    const request = ctx.switchToHttp().getRequest<Request & { task: Task }>();
    return request.task;
  },
);
