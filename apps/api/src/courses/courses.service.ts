import { Injectable, NotFoundException } from "@nestjs/common";
import { DatabaseService } from "../database/database.service.js";
import type { CourseRecord } from "./course.types.js";

const COURSE_COLUMNS = `id, slug, name, code, detail, progress, tone, cover, cover_alt,
  outline, outcomes, assessment, created_at, updated_at`;

@Injectable()
export class CoursesService {
  constructor(private readonly database: DatabaseService) {}

  async list() {
    const result = await this.database.query<CourseRecord>(
      `SELECT ${COURSE_COLUMNS}
       FROM courses
       ORDER BY code`,
    );
    return result.rows;
  }

  async getBySlug(slug: string) {
    const result = await this.database.query<CourseRecord>(
      `SELECT ${COURSE_COLUMNS}
       FROM courses
       WHERE slug = $1`,
      [slug],
    );
    const course = result.rows[0];
    if (!course) {
      throw new NotFoundException({
        code: "COURSE_NOT_FOUND",
        message: "Không tìm thấy môn học này. Có thể đường dẫn đã thay đổi.",
      });
    }
    return course;
  }
}
