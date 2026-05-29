import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Registration bootstraps a new tenant: it creates an Organization and its first
 * ADMIN user. Additional MANAGER/MEMBER users are then provisioned by the ADMIN
 * (see users module) — they do not self-register. This keeps org membership and
 * role assignment under the organization's control.
 */
export class RegisterDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  organizationName: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @IsEmail({}, { message: 'email must be a valid email address' })
  email: string;

  @IsString()
  @MinLength(8, { message: 'password must be at least 8 characters' })
  @MaxLength(128)
  password: string;
}
