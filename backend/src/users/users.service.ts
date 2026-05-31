import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { hashPassword } from '../common/security/password';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

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

  /** Update a user's name/role within the caller's organization. */
  async update(organizationId: string, id: string, dto: UpdateUserDto) {
    await this.assertInOrg(organizationId, id);
    return this.prisma.user.update({
      where: { id },
      data: { name: dto.name, role: dto.role },
      select: PUBLIC_USER,
    });
  }

  /** Remove a user from the caller's organization (cannot remove yourself). */
  async remove(organizationId: string, id: string, requesterId: string) {
    if (id === requesterId) {
      throw new BadRequestException({
        code: 'INVALID_OPERATION',
        message: 'You cannot delete your own account',
      });
    }
    await this.assertInOrg(organizationId, id);
    await this.prisma.user.delete({ where: { id } });
  }

  /** Existence check scoped to the org — cross-org ids look like 404s. */
  private async assertInOrg(organizationId: string, id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, organizationId },
      select: { id: true },
    });
    if (!user) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'User not found' });
    }
  }
}
