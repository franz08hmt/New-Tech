import { Controller, Get, Param } from "@nestjs/common";
import { CourseSlugDto } from "./course-slug.dto.js";
import { CoursesService } from "./courses.service.js";

@Controller("courses")
export class CoursesController {
  constructor(private readonly courses: CoursesService) {}

  @Get()
  list() {
    return this.courses.list();
  }

  @Get(":slug")
  getBySlug(@Param() input: CourseSlugDto) {
    return this.courses.getBySlug(input.slug);
  }
}
