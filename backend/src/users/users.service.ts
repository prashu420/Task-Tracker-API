import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { hashPassword } from '../common/security/password';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';

// Never expose passwordHash; this projection is the public shape of a user.
const PUBLIC_USER = {
  id: true,
  name: true,
  email: true,
  role: true,
  organizationId: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /** ADMIN provisions a user inside their own organization. */
  async create(organizationId: string, dto: CreateUserDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException({
        code: 'EMAIL_TAKEN',
        message: 'An account with this email already exists',
      });
    }

    return this.prisma.user.create({
      data: {
        name: dto.name,
        email: dto.email,
        role: dto.role,
        passwordHash: await hashPassword(dto.password),
        organizationId,
      },
      select: PUBLIC_USER,
    });
  }

  /** List members of the caller's organization (org-scoped). */
  list(organizationId: string) {
    return this.prisma.user.findMany({
      where: { organizationId },
      select: PUBLIC_USER,
      orderBy: { createdAt: 'asc' },
    });
  }
}
