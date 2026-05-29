import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Protects routes with the JWT access-token strategy. Applied per-controller or
 * globally; it populates `req.user` (AuthUser) on success and 401s otherwise.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
