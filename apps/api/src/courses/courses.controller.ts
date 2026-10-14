import { Controller, Get, Param, Req } from "@nestjs/common";
import { CourseSlugDto } from "./course-slug.dto.js";
import { CoursesService } from "./courses.service.js";
import type { AuthRequest } from "../auth/auth.service.js";

@Controller("courses")
export class CoursesController {
  constructor(private readonly courses: CoursesService) {}

  @Get()
  list(@Req() req: AuthRequest) {
    return this.courses.list(req.principal);
  }

  @Get(":slug")
  getBySlug(@Param() input: CourseSlugDto, @Req() req: AuthRequest) {
    return this.courses.getBySlug(input.slug, req.principal);
  }
}
