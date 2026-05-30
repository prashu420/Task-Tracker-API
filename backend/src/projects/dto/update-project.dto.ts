import { PartialType } from '@nestjs/swagger';
import { CreateProjectDto } from './create-project.dto';

/** All fields optional — same validation rules as create. */
export class UpdateProjectDto extends PartialType(CreateProjectDto) {}
