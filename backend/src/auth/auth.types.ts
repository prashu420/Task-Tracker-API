import { Role } from '@prisma/client';

/** Claims carried in the access-token JWT. */
export interface JwtPayload {
  sub: string; // user id
  organizationId: string;
  role: Role;
}

/** Shape returned to clients after register/login/refresh. */
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}
