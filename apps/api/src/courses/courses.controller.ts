import { Controller, Get, Param, Query, Req } from "@nestjs/common";
import { CourseSlugDto } from "./course-slug.dto.js";
import { CourseSearchQueryDto } from "./course-search-query.dto.js";
import { CoursesService } from "./courses.service.js";
import type { AuthRequest } from "../auth/auth.service.js";

@Controller("courses")
export class CoursesController {
  constructor(private readonly courses: CoursesService) {}

  @Get("search")
  search(@Query() query: CourseSearchQueryDto, @Req() req: AuthRequest) {
    return this.courses.search(req.principal, query);
  }

  @Get()
  list(@Req() req: AuthRequest) {
    return this.courses.list(req.principal);
  }

  @Get(":slug")
  getBySlug(@Param() input: CourseSlugDto, @Req() req: AuthRequest) {
    return this.courses.getBySlug(input.slug, req.principal);
  }
}
