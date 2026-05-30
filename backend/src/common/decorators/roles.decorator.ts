import { SetMetadata } from '@nestjs/common';
import { Role } from '@prisma/client';

export const ROLES_KEY = 'roles';

/**
 * Declares the roles allowed to reach a route or controller. Read by RolesGuard,
 * so authorization lives in metadata + a guard — never in controller bodies.
 *   @Roles(Role.ADMIN, Role.MANAGER)
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
