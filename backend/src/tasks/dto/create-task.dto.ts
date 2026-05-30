import { Priority } from '@prisma/client';
import {
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { IsFutureDate } from '../../common/validators/is-future-date.validator';

export class CreateTaskDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsEnum(Priority, { message: 'priority must be one of LOW, MEDIUM, HIGH' })
  priority?: Priority;

  @IsUUID('4', { message: 'projectId must be a valid id' })
  projectId: string;

  @IsOptional()
  @IsUUID('4', { message: 'assigneeId must be a valid id' })
  assigneeId?: string;

  @IsOptional()
  @IsISO8601({}, { message: 'dueDate must be an ISO-8601 date' })
  @IsFutureDate()
  dueDate?: string;
}
