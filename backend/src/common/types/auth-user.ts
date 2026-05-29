import { Role } from '@prisma/client';

/**
 * The authenticated principal attached to `req.user` by the JWT strategy.
 * organizationId and role travel in the access token so guards can authorize
 * without a database round-trip (access tokens are short-lived, so any staleness
 * is bounded — documented as a deliberate tradeoff in the README).
 */
export interface AuthUser {
  userId: string;
  organizationId: string;
  role: Role;
}
