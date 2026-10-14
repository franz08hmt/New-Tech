import { Injectable, NotFoundException } from "@nestjs/common";
import { DatabaseService } from "../database/database.service.js";
import type { CourseRecord } from "./course.types.js";
import type { PilotPrincipal } from "@examate/contracts";
import { requirePrincipal } from "../auth/principal.js";

const COURSE_COLUMNS = `id, slug, name, code, detail, progress, tone, cover, cover_alt,
  outline, outcomes, assessment, created_at, updated_at`;

@Injectable()
export class CoursesService {
  constructor(private readonly database: DatabaseService) {}

  async list(principal?: PilotPrincipal) {
    const { workspaceId } = requirePrincipal(principal);
    const result = await this.database.query<CourseRecord>(
      `SELECT ${COURSE_COLUMNS}
       FROM courses
       WHERE workspace_id = $1
       ORDER BY code`,
      [workspaceId],
    );
    return result.rows;
  }

  async getBySlug(slug: string, principal?: PilotPrincipal) {
    const { workspaceId } = requirePrincipal(principal);
    const result = await this.database.query<CourseRecord>(
      `SELECT ${COURSE_COLUMNS}
       FROM courses
       WHERE slug = $1 AND workspace_id = $2`,
      [slug, workspaceId],
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
