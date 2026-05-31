import { Role } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/** Fields an ADMIN may change on an existing user. */
export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsEnum(Role, { message: 'role must be one of ADMIN, MANAGER, MEMBER' })
  role?: Role;
}
