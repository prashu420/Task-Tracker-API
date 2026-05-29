import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthUser } from '../../common/types/auth-user';
import { JwtPayload } from '../auth.types';

/**
 * Validates the access token on protected routes. Passport verifies the
 * signature + expiry before `validate` runs; we just map the verified claims
 * onto the AuthUser that handlers and guards consume via `req.user`.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
    });
  }

  validate(payload: JwtPayload): AuthUser {
    return {
      userId: payload.sub,
      organizationId: payload.organizationId,
      role: payload.role,
    };
  }
}
