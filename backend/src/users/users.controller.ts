import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './users.service';

/**
 * User management is ADMIN-only. The class-level @Roles guard enforces this for
 * every route — the controller methods carry no role-checking logic themselves.
 * The org id is taken from the authenticated ADMIN, so a user can only ever be
 * created in / listed from the caller's own organization.
 */
@Controller('users')
@Roles(Role.ADMIN)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @CurrentUser('organizationId') organizationId: string,
    @Body() dto: CreateUserDto,
  ) {
    return this.users.create(organizationId, dto);
  }

  @Get()
  list(@CurrentUser('organizationId') organizationId: string) {
    return this.users.list(organizationId);
  }

  @Patch(':id')
  update(
    @CurrentUser('organizationId') organizationId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.users.update(organizationId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser('organizationId') organizationId: string,
    @CurrentUser('userId') requesterId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.users.remove(organizationId, id, requesterId);
  }
}
