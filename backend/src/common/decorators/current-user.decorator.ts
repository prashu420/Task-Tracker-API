import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { AuthUser } from '../types/auth-user';

/**
 * Injects the authenticated user (or one of its fields) into a handler:
 *   @CurrentUser() user: AuthUser
 *   @CurrentUser('userId') userId: string
 */
export const CurrentUser = createParamDecorator(
  (field: keyof AuthUser | undefined, ctx: ExecutionContext) => {
    const request = ctx
      .switchToHttp()
      .getRequest<Request & { user?: AuthUser }>();
    const user = request.user;
    return field ? user?.[field] : user;
  },
);
