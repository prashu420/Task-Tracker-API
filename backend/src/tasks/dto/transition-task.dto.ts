import { TaskStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class TransitionTaskDto {
  @IsEnum(TaskStatus, {
    message:
      'status must be one of TODO, IN_PROGRESS, IN_REVIEW, DONE, BLOCKED',
  })
  status: TaskStatus;
}
