import { IsString, Matches, MaxLength } from "class-validator";

export class CourseSlugDto {
  @IsString()
  @MaxLength(80)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  slug!: string;
}
