import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Role, User } from '@prisma/client';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'crypto';
import { parseDurationToMs } from '../common/utils/duration';
import { PrismaService } from '../prisma/prisma.service';
import { AuthTokens, JwtPayload } from './auth.types';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  /** Create a new organization + its first ADMIN, then issue tokens. */
  async register(dto: RegisterDto): Promise<AuthTokens> {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException({
        code: 'EMAIL_TAKEN',
        message: 'An account with this email already exists',
      });
    }

    const passwordHash = await this.hashPassword(dto.password);

    // Org + admin must be created atomically — a half-created tenant is useless.
    const user = await this.prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: { name: dto.organizationName },
      });
      return tx.user.create({
        data: {
          email: dto.email,
          name: dto.name,
          passwordHash,
          role: Role.ADMIN,
          organizationId: org.id,
        },
      });
    });

    return this.issueTokens(user);
  }

  async login(dto: LoginDto): Promise<AuthTokens> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    // Same error whether the email is unknown or the password is wrong, so the
    // endpoint can't be used to enumerate which emails are registered.
    const invalid = new UnauthorizedException({
      code: 'INVALID_CREDENTIALS',
      message: 'Invalid email or password',
    });
    if (!user) throw invalid;

    const ok = await argon2.verify(user.passwordHash, dto.password);
    if (!ok) throw invalid;

    return this.issueTokens(user);
  }

  // ── token helpers ─────────────────────────────────────────────────────────

  /** Sign a short-lived access JWT and mint a fresh refresh token (new family). */
  private async issueTokens(user: User): Promise<AuthTokens> {
    const payload: JwtPayload = {
      sub: user.id,
      organizationId: user.organizationId,
      role: user.role,
    };

    const accessTtlSeconds = Math.floor(
      parseDurationToMs(this.config.getOrThrow<string>('JWT_ACCESS_TTL')) / 1000,
    );
    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn: accessTtlSeconds,
    });

    const refreshToken = await this.createRefreshToken(user.id);
    return { accessToken, refreshToken };
  }

  /**
   * Refresh tokens are opaque random strings, not JWTs: we store only their
   * sha-256 hash, so a DB leak can't be replayed, and persistence lets us revoke
   * and rotate them (which a stateless JWT cannot support). `family` ties a
   * rotation chain to one login so a replayed token can revoke the whole chain
   * (reuse detection — implemented with the /auth/refresh endpoint).
   */
  private async createRefreshToken(
    userId: string,
    family?: string,
  ): Promise<string> {
    const raw = randomBytes(48).toString('hex');
    const ttlMs = parseDurationToMs(
      this.config.getOrThrow<string>('JWT_REFRESH_TTL'),
    );

    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: this.sha256(raw),
        family: family ?? randomBytes(16).toString('hex'),
        expiresAt: new Date(Date.now() + ttlMs),
      },
    });

    return raw; // only the hash is persisted; the raw value lives client-side
  }

  private sha256(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  private async hashPassword(password: string): Promise<string> {
    return argon2.hash(password, { type: argon2.argon2id });
  }
}
