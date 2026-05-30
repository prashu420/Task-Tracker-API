import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Role, User } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import { hashPassword, verifyPassword } from '../common/security/password';
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

    const passwordHash = await hashPassword(dto.password);

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

    const ok = await verifyPassword(user.passwordHash, dto.password);
    if (!ok) throw invalid;

    return this.issueTokens(user);
  }

  /**
   * Rotate a refresh token: the presented token is revoked and a new one is
   * issued in the same family, so each refresh token is single-use.
   *
   * Reuse detection: presenting an already-revoked token means it was rotated
   * out earlier (or logged out) — a sign the token was stolen and replayed. We
   * respond by revoking the entire family, forcing every session from that
   * login to re-authenticate.
   */
  async refresh(rawToken: string): Promise<AuthTokens> {
    const invalid = new UnauthorizedException({
      code: 'INVALID_REFRESH_TOKEN',
      message: 'Refresh token is invalid or expired',
    });

    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: this.sha256(rawToken) },
    });
    if (!stored) throw invalid;

    if (stored.revokedAt) {
      await this.revokeFamily(stored.family);
      throw invalid;
    }

    if (stored.expiresAt.getTime() < Date.now()) throw invalid;

    const user = await this.prisma.user.findUnique({
      where: { id: stored.userId },
    });
    if (!user) throw invalid;

    // Revoke the old token and create its replacement atomically.
    const next = this.buildRefreshToken(user.id, stored.family);
    await this.prisma.$transaction([
      this.prisma.refreshToken.update({
        where: { id: stored.id },
        data: { revokedAt: new Date() },
      }),
      this.prisma.refreshToken.create({ data: next.data }),
    ]);

    const accessToken = await this.signAccessToken({
      sub: user.id,
      organizationId: user.organizationId,
      role: user.role,
    });
    return { accessToken, refreshToken: next.raw };
  }

  /** Revoke the whole family behind a refresh token (idempotent). */
  async logout(rawToken: string): Promise<void> {
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: this.sha256(rawToken) },
    });
    if (stored) await this.revokeFamily(stored.family);
  }

  // ── token helpers ─────────────────────────────────────────────────────────

  /** Sign a short-lived access JWT and mint a fresh refresh token (new family). */
  private async issueTokens(user: User): Promise<AuthTokens> {
    const accessToken = await this.signAccessToken({
      sub: user.id,
      organizationId: user.organizationId,
      role: user.role,
    });

    const refresh = this.buildRefreshToken(user.id);
    await this.prisma.refreshToken.create({ data: refresh.data });

    return { accessToken, refreshToken: refresh.raw };
  }

  private async signAccessToken(payload: JwtPayload): Promise<string> {
    const accessTtlSeconds = Math.floor(
      parseDurationToMs(this.config.getOrThrow<string>('JWT_ACCESS_TTL')) / 1000,
    );
    return this.jwt.signAsync(payload, {
      secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn: accessTtlSeconds,
    });
  }

  /**
   * Build (but don't persist) a refresh token. Refresh tokens are opaque random
   * strings, not JWTs: we store only their sha-256 hash, so a DB leak can't be
   * replayed, and persistence lets us revoke/rotate them (which a stateless JWT
   * cannot support). `family` ties a rotation chain to one login. Returns the
   * raw token (handed to the client) plus the row to persist.
   */
  private buildRefreshToken(userId: string, family?: string) {
    const raw = randomBytes(48).toString('hex');
    const ttlMs = parseDurationToMs(
      this.config.getOrThrow<string>('JWT_REFRESH_TTL'),
    );
    return {
      raw,
      data: {
        userId,
        tokenHash: this.sha256(raw),
        family: family ?? randomBytes(16).toString('hex'),
        expiresAt: new Date(Date.now() + ttlMs),
      },
    };
  }

  /** Mark every still-active token in a family as revoked. */
  private async revokeFamily(family: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { family, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private sha256(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }
}
