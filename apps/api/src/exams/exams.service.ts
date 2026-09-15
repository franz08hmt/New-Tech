import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { DatabaseService } from "../database/database.service.js";
import type { CreateExamDto } from "./create-exam.dto.js";
import type { ExamRecord } from "./exam.types.js";

/**
 * exam_date and exam_time are formatted in SQL rather than handed to the pg
 * driver's type parsers. A DATE comes back as a JS Date, which JSON.stringify
 * then writes as a UTC timestamp — so a 21 September exam can reach the browser
 * as "2026-09-20T17:00:00.000Z" east of Greenwich. Formatting here keeps the
 * calendar day and the wall-clock time exactly as they were entered.
 */
const EXAM_COLUMNS = `e.id,
  e.course_id,
  c.slug AS course_slug,
  c.name AS course_name,
  c.code AS course_code,
  e.topic,
  to_char(e.exam_date, 'YYYY-MM-DD') AS exam_date,
  to_char(e.exam_time, 'HH24:MI') AS exam_time,
  e.room,
  e.revision_note,
  e.created_at,
  e.updated_at`;

@Injectable()
export class ExamsService {
  constructor(private readonly database: DatabaseService) {}

  async list() {
    const result = await this.database.query<ExamRecord>(
      `SELECT ${EXAM_COLUMNS}
       FROM exams e
       JOIN courses c ON c.id = e.course_id
       ORDER BY e.exam_date, e.exam_time, c.code`,
    );
    return result.rows;
  }

  async create(input: CreateExamDto) {
    const result = await this.database
      .query<ExamRecord>(
        `WITH inserted AS (
           INSERT INTO exams (course_id, topic, exam_date, exam_time, room, revision_note)
           VALUES ($1, $2, $3::date, $4::time, $5, $6)
           RETURNING *
         )
         SELECT ${EXAM_COLUMNS}
         FROM inserted e
         JOIN courses c ON c.id = e.course_id`,
        [
          input.courseId,
          input.topic,
          input.examDate,
          input.examTime,
          input.room,
          input.revisionNote ?? null,
        ],
      )
      .catch((error: unknown) => {
        // The foreign key is the only way a well-formed request can fail, and
        // it means the course id does not exist: that is the caller's mistake,
        // not a server fault, so it must not surface as a 500.
        if (
          error &&
          typeof error === "object" &&
          (error as { code?: string }).code === "23503"
        ) {
          throw new BadRequestException({
            code: "COURSE_NOT_FOUND",
            message: "Môn học này không còn trong danh sách nữa.",
          });
        }
        throw error;
      });
    return result.rows[0];
  }

  async remove(id: string) {
    const result = await this.database.query(
      "DELETE FROM exams WHERE id = $1",
      [id],
    );
    if (!result.rowCount) {
      throw new NotFoundException({
        code: "EXAM_NOT_FOUND",
        message: "Kỳ thi này không còn nữa, có thể ai đó đã xoá trước rồi.",
      });
    }
  }
}
