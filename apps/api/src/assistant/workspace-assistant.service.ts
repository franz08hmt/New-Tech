import { BadRequestException, Injectable } from "@nestjs/common";
import type {
  AssistantWorkspaceIntent,
  AssistantWorkspaceSource,
} from "@examate/contracts";
import { log } from "../common/log.js";
import type { AssistantChatDto } from "./assistant-chat.dto.js";
import type { WorkspaceAnswer } from "./assistant.types.js";
import {
  classifyQuestion,
  matchCourse,
  matchDocument,
  mentionsCourse,
} from "./workspace-intent.js";
import {
  formatDay,
  formatVnd,
  oneLine,
  workspaceNow,
} from "./workspace-format.js";
import {
  EXPENSE_LIMIT,
  ROW_LIMIT,
  WorkspaceRecordsService,
  type CourseRow,
  type StudyPlanFilter,
  type TaskFilter,
} from "./workspace-records.service.js";

/*
 * "Hỏi workspace": questions about the records stored in this shared demo
 * workspace, answered by fixed read-only queries and fixed sentences.
 *
 * No model is involved, deliberately. Counting, filtering by status, comparing
 * days and adding up money are done here, in code that can be tested — not
 * asked of an LLM that might get them almost right. The same property makes
 * a record's own text harmless: a task titled "ignore previous instructions"
 * is printed as a title and can steer nothing, because nothing here reads
 * record text as anything but data.
 *
 * Each answer lists the records it rests on. They are sources, not PDF
 * citations: a kind and an id, which the web app turns into a link to the
 * record's own page.
 */

const PROMPT_VERSION = "workspace-v1";
/** Listed in the answer; the rest are counted, not dropped silently. */
const SHOWN = 10;

type Clock = { date: string; time: string };
type Draft = Pick<
  WorkspaceAnswer,
  "answer" | "answerable" | "workspaceIntent" | "workspaceSources"
>;

const EXAMPLES = [
  "“Task nào chưa xong?” hoặc “Task nào đã quá hạn?”",
  "“Kỳ thi sắp tới của môn … là khi nào?”",
  "“Việc cần ôn nào của môn … đã quá hạn?”",
  "“Tổng chi của môn … là bao nhiêu?”",
  "“Môn … có những tài liệu nào?” hoặc “Workspace có những môn học nào?”",
];

const TASK_STATUS: Record<string, string> = {
  todo: "Chưa bắt đầu",
  in_progress: "Đang làm",
  done: "Đã xong",
};

function courseLabel(course: { name: string; code: string }) {
  return `${oneLine(course.name)} (${oneLine(course.code)})`;
}

function courseSource(course: CourseRow): AssistantWorkspaceSource {
  return {
    kind: "course",
    id: course.id,
    slug: course.slug,
    label: courseLabel(course),
  };
}

function bullets(lines: string[], total: number) {
  const shown = lines.slice(0, SHOWN).map((line) => `- ${line}`);
  if (total > SHOWN) shown.push(`- … và ${total - SHOWN} mục khác.`);
  return shown.join("\n");
}

/**
 * Said whenever more rows matched than were read, so that no count and no
 * "there are none" is ever stated beyond what was actually checked.
 */
function partialNote(page: string) {
  return `Danh sách chưa đầy đủ: có hơn ${ROW_LIMIT} bản ghi phù hợp và mình chỉ đọc ${ROW_LIMIT} bản ghi đầu tiên. Xem đầy đủ ở trang ${page}.`;
}

function count(n: number, truncated: boolean) {
  return truncated ? `ít nhất ${n}` : `${n}`;
}

function limits(
  intent: AssistantWorkspaceIntent,
  answer: string,
  sources: AssistantWorkspaceSource[] = [],
): Draft {
  return {
    answer,
    answerable: false,
    workspaceIntent: intent,
    workspaceSources: sources,
  };
}

@Injectable()
export class WorkspaceAssistantService {
  /** Overridable in tests; "today" is always read through it. */
  now = () => new Date();

  constructor(private readonly records: WorkspaceRecordsService) {}

  async chat(input: AssistantChatDto): Promise<WorkspaceAnswer> {
    if ((input.operation && input.operation !== "question") || input.documentId)
      throw new BadRequestException({
        code: "WORKSPACE_QUESTION_ONLY",
        message:
          "Workspace mode answers questions only; it takes no document or operation.",
      });

    const startedAt = Date.now();
    const clock = workspaceNow(this.now());
    try {
      const draft = await this.answer(input, clock);
      const result: WorkspaceAnswer = {
        ...draft,
        answer: draft.answerable
          ? `${draft.answer}\n\nTính theo ngày ${formatDay(clock.date)} (giờ Việt Nam), từ dữ liệu đang lưu trong workspace demo dùng chung — không qua AI.`
          : draft.answer,
        reasonCode: draft.answerable
          ? "WORKSPACE_ANSWER"
          : "WORKSPACE_UNSUPPORTED",
        citations: [],
        provider: "workspace",
        model: "database",
        mode: "workspace",
        ragEnabled: false,
        promptVersion: PROMPT_VERSION,
        asOf: clock.date,
      };
      // Counts and codes only: no question, no record text.
      log("info", "assistant.chat.completed", {
        mode: "workspace",
        operation: "question",
        reasonCode: result.reasonCode,
        workspaceIntent: result.workspaceIntent,
        sourceCount: result.workspaceSources.length,
        durationMs: Date.now() - startedAt,
      });
      return result;
    } catch (error: unknown) {
      const response = (
        error as { getResponse?: () => unknown }
      )?.getResponse?.();
      log("error", "assistant.chat.failed", {
        mode: "workspace",
        operation: "question",
        reasonCode:
          (response as { code?: unknown } | undefined)?.code ??
          "INTERNAL_ERROR",
        durationMs: Date.now() - startedAt,
      });
      throw error;
    }
  }

  private async answer(input: AssistantChatDto, clock: Clock): Promise<Draft> {
    const { topic, overdue, done } = classifyQuestion(input.message);

    // Checked before anything is read: there is no write path to reach.
    if (topic === "write")
      return limits(
        "write_refused",
        "Chế độ Hỏi workspace chỉ đọc dữ liệu, nên mình không tạo, sửa, xóa hay đánh dấu hoàn thành bất cứ thứ gì qua chat. Bạn có thể làm việc đó ở trang tương ứng: Tasks, Exams, Study plan, Finances hoặc Documents.",
      );
    if (topic === "notes")
      return limits(
        "notes_unavailable",
        "Ghi chú nhanh (Quick notes) chỉ được lưu trong trình duyệt của bạn; máy chủ không đọc được chúng, nên mình không trả lời về nội dung ghi chú. Bạn có thể xem trực tiếp ở Dashboard.",
      );
    if (topic === "tasks") return this.tasks(input, overdue, done, clock);
    if (topic === "exams") return this.exams(input, clock);
    if (topic === "study_plans")
      return this.studyPlans(input, overdue, done, clock);
    if (topic === "expenses") return this.expenses(input);
    if (topic === "documents") return this.documents(input);
    if (topic === "courses") return this.courses();
    return limits(
      "unsupported",
      `Câu hỏi này nằm ngoài những gì mình tra được trong dữ liệu workspace, nên mình không đoán. Bạn có thể hỏi, ví dụ:\n${EXAMPLES.map((example) => `- ${example}`).join("\n")}`,
    );
  }

  /**
   * The course a question is about, or the answer to give when there is no
   * single one: unknown, ambiguous, or — when `required` — not named at all.
   */
  private async course(input: AssistantChatDto, required: string | null) {
    const courses = await this.records.courses();
    const match = matchCourse(input.message, courses, input.courseId);
    const listed = courses.map(courseSource);
    if (match.kind === "unknown")
      return {
        stop: limits(
          "course_not_found",
          `Không tìm thấy môn “${match.mentioned}” trong workspace, nên mình không trả lời thay cho một môn khác. Các môn hiện có được liệt kê bên dưới.`,
          listed,
        ),
      };
    if (match.kind === "ambiguous")
      return {
        stop: limits(
          "course_ambiguous",
          `Câu hỏi nhắc tới nhiều môn cùng lúc (${match.courses.map(courseLabel).join(", ")}). Hãy hỏi lại cho từng môn một.`,
          match.courses.map(courseSource),
        ),
      };
    if (match.kind === "none" && required)
      return { stop: limits("course_required", required, listed) };
    return {
      course: match.kind === "matched" ? match.course : null,
      fromPage: match.kind === "matched" && match.fromPage,
    };
  }

  private async tasks(
    input: AssistantChatDto,
    overdue: boolean,
    done: boolean,
    clock: Clock,
  ): Promise<Draft> {
    // Tasks have no course in the schema. Naming one is refused rather than
    // guessed from a title, an owner or a PDF.
    const courses = await this.records.courses();
    if (
      mentionsCourse(input.message) ||
      matchCourse(input.message, courses).kind === "matched"
    )
      return limits(
        "tasks_by_course_unsupported",
        "Task trong workspace là một danh sách chung và không được gắn với môn học nào, nên mình không thể nói task nào thuộc một môn mà không đoán. Bạn có thể hỏi “Task nào chưa xong?” để xem cả danh sách, hoặc hỏi việc cần ôn của môn đó trong kế hoạch ôn tập.",
      );

    // Filtered in the query, so non-matching rows never use up the limit, and
    // checked again here so the answer is right even if a query returns more
    // than it was asked for.
    const filter: TaskFilter = done
      ? { state: "done" }
      : overdue
        ? { state: "open", dueBefore: clock.date }
        : { state: "open" };
    const found = await this.records.tasks(filter);
    const tasks = found.rows.filter((task) =>
      done
        ? task.status === "done"
        : task.status !== "done" &&
          (!overdue || (task.due_date !== null && task.due_date < clock.date)),
    );
    const intent = done
      ? "tasks_done"
      : overdue
        ? "tasks_overdue"
        : "tasks_open";
    const what = done ? "đã xong" : overdue ? "đã quá hạn" : "chưa xong";
    if (tasks.length === 0 && !found.truncated)
      return {
        answer: `Không có task nào ${what} trong danh sách chung của workspace.`,
        answerable: true,
        workspaceIntent: intent,
        workspaceSources: [],
      };

    const detail = (task: (typeof tasks)[number]) =>
      [
        TASK_STATUS[task.status],
        task.due_date ? `hạn ${formatDay(task.due_date)}` : "chưa có hạn",
      ].join(" · ");
    const parts = [
      `Có ${count(tasks.length, found.truncated)} task ${what} trong danh sách chung (task không gắn với môn học nào):\n${bullets(
        tasks.map((task) => `${oneLine(task.title)} — ${detail(task)}`),
        tasks.length,
      )}`,
    ];
    if (found.truncated) parts.push(partialNote("Tasks"));
    return {
      answer: parts.join("\n\n"),
      answerable: true,
      workspaceIntent: intent,
      workspaceSources: tasks.slice(0, SHOWN).map((task) => ({
        kind: "task",
        id: task.id,
        label: oneLine(task.title),
        detail: detail(task),
      })),
    };
  }

  private async exams(input: AssistantChatDto, clock: Clock): Promise<Draft> {
    const scope = await this.course(input, null);
    if (scope.stop) return scope.stop;
    const found = await this.records.exams(scope.course?.id ?? null, clock);
    type Exam = (typeof found.upcoming.rows)[number];
    // An exam is upcoming until the minute it starts, in Vietnamese time —
    // decided in the query, and checked again here.
    const started = (exam: Exam) =>
      exam.exam_date < clock.date ||
      (exam.exam_date === clock.date && exam.exam_time < clock.time);
    const upcoming = found.upcoming.rows.filter((exam) => !started(exam));
    const latestPast =
      found.latestPast && started(found.latestPast) ? found.latestPast : null;
    const truncated = found.upcoming.truncated;
    const where = scope.course
      ? ` của môn ${courseLabel(scope.course)}${scope.fromPage ? " (môn đang mở)" : ""}`
      : " trong workspace";
    const when = (exam: Exam) =>
      `${formatDay(exam.exam_date)} ${exam.exam_time} · ${oneLine(exam.room)}`;
    const line = (exam: Exam) =>
      `${oneLine(exam.topic)}${scope.course ? "" : ` — ${courseLabel({ name: exam.course_name, code: exam.course_code })}`} — ${when(exam)}`;

    const parts = [
      upcoming.length
        ? `${truncated ? `Có ít nhất ${upcoming.length} kỳ thi sắp tới` : "Kỳ thi sắp tới"}${where}:\n${bullets(upcoming.map(line), upcoming.length)}`
        : truncated
          ? `Mình chưa đọc được đầy đủ các kỳ thi sắp tới${where}.`
          : `Không có kỳ thi sắp tới nào${where}.`,
    ];
    if (truncated) parts.push(partialNote("Exams"));
    if (latestPast) parts.push(`Kỳ thi gần nhất đã qua: ${line(latestPast)}.`);

    return {
      answer: parts.join("\n\n"),
      answerable: true,
      workspaceIntent: "exams_upcoming",
      workspaceSources: [
        ...upcoming.slice(0, SHOWN).map((exam) => ({
          kind: "exam" as const,
          id: exam.id,
          label: oneLine(exam.topic),
          detail: `Sắp tới · ${when(exam)}`,
        })),
        ...(latestPast
          ? [
              {
                kind: "exam" as const,
                id: latestPast.id,
                label: oneLine(latestPast.topic),
                detail: `Đã qua · ${when(latestPast)}`,
              },
            ]
          : []),
      ],
    };
  }

  private async studyPlans(
    input: AssistantChatDto,
    overdue: boolean,
    done: boolean,
    clock: Clock,
  ): Promise<Draft> {
    const scope = await this.course(input, null);
    if (scope.stop) return scope.stop;
    const filter: StudyPlanFilter = done
      ? { state: "completed" }
      : overdue
        ? { state: "open", dueBefore: clock.date }
        : { state: "open" };
    const found = await this.records.studyPlans(
      scope.course?.id ?? null,
      filter,
    );
    // Done is done: a completed item is never open, and so never overdue.
    const plans = found.rows.filter((plan) =>
      done
        ? plan.completed
        : !plan.completed &&
          (!overdue || (plan.due_date !== null && plan.due_date < clock.date)),
    );
    const intent = done
      ? "study_plans_done"
      : overdue
        ? "study_plans_overdue"
        : "study_plans_open";
    const what = done
      ? "đã hoàn thành"
      : overdue
        ? "đã quá hạn"
        : "chưa hoàn thành";
    const where = scope.course
      ? ` của môn ${courseLabel(scope.course)}${scope.fromPage ? " (môn đang mở)" : ""}`
      : "";
    if (plans.length === 0 && !found.truncated)
      return {
        answer: `Không có việc cần ôn nào ${what}${where}.`,
        answerable: true,
        workspaceIntent: intent,
        workspaceSources: [],
      };

    const detail = (plan: (typeof plans)[number]) =>
      [
        scope.course
          ? null
          : courseLabel({ name: plan.course_name, code: plan.course_code }),
        plan.due_date ? `hạn ${formatDay(plan.due_date)}` : "chưa có hạn",
      ]
        .filter(Boolean)
        .join(" · ");
    const parts = [
      `Có ${count(plans.length, found.truncated)} việc cần ôn ${what}${where}:\n${bullets(
        plans.map((plan) => `${oneLine(plan.title)} — ${detail(plan)}`),
        plans.length,
      )}`,
    ];
    if (found.truncated) parts.push(partialNote("Study plan"));
    return {
      answer: parts.join("\n\n"),
      answerable: true,
      workspaceIntent: intent,
      workspaceSources: plans.slice(0, SHOWN).map((plan) => ({
        kind: "study_plan",
        id: plan.id,
        label: oneLine(plan.title),
        detail: detail(plan),
      })),
    };
  }

  private async expenses(input: AssistantChatDto): Promise<Draft> {
    const scope = await this.course(
      input,
      "Bạn muốn tính tổng chi cho môn nào? Mình chỉ cộng các khoản chi đã được gắn với đúng môn đó; các môn hiện có được liệt kê bên dưới.",
    );
    if (scope.stop) return scope.stop;
    const course = scope.course!;
    const rows = await this.records.courseExpenses(course.id);
    if (rows.length >= EXPENSE_LIMIT)
      return limits(
        "expenses_total",
        `Môn ${courseLabel(course)} có quá nhiều khoản chi để mình cộng chính xác ở đây. Hãy xem tổng trong trang Finances.`,
      );
    // Checked again here, not only in SQL: a row of another course, or of no
    // course, must never reach this total.
    const own = rows
      .filter((row) => row.course_id === course.id)
      .sort((a, b) => b.spent_on.localeCompare(a.spent_on));
    const total = own.reduce((sum, row) => sum + row.amount, 0);
    if (!Number.isSafeInteger(total))
      return limits(
        "expenses_total",
        "Tổng chi vượt quá phạm vi mình tính chính xác được. Hãy xem trong trang Finances.",
      );
    const unassigned = await this.records.unassignedExpenseCount();
    const where = `môn ${courseLabel(course)}${scope.fromPage ? " (môn đang mở)" : ""}`;
    const detail = (row: (typeof own)[number]) =>
      `${formatVnd(row.amount)} · ${formatDay(row.spent_on)}`;
    const parts = [
      own.length
        ? `Tổng chi cho ${where}: ${formatVnd(total)}, từ ${own.length} khoản chi:\n${bullets(
            own.map((row) => `${oneLine(row.description)} — ${detail(row)}`),
            own.length,
          )}`
        : `Chưa có khoản chi nào được gắn với ${where}, nên tổng là ${formatVnd(0)}.`,
    ];
    if (unassigned > 0)
      parts.push(
        `Có ${unassigned} khoản chi chưa gắn môn nào; chúng không được tính vào tổng này.`,
      );
    return {
      answer: parts.join("\n\n"),
      answerable: true,
      workspaceIntent: "expenses_total",
      workspaceSources: own.slice(0, SHOWN).map((row) => ({
        kind: "expense",
        id: row.id,
        label: oneLine(row.description),
        detail: detail(row),
      })),
    };
  }

  private async documents(input: AssistantChatDto): Promise<Draft> {
    const found = await this.records.documents();
    const documents = found.rows;
    const named = matchDocument(input.message, documents);
    if (named) {
      const sources: AssistantWorkspaceSource[] = [
        { kind: "document", id: named.id, label: oneLine(named.name) },
      ];
      if (
        named.course_id &&
        named.course_slug &&
        named.course_name &&
        named.course_code
      )
        sources.push({
          kind: "course",
          id: named.course_id,
          slug: named.course_slug,
          label: courseLabel({
            name: named.course_name,
            code: named.course_code,
          }),
        });
      return {
        answer:
          named.course_name && named.course_code
            ? `Trong workspace, tài liệu “${oneLine(named.name)}” được gắn với môn ${courseLabel({ name: named.course_name, code: named.course_code })}. Đây là thông tin đã lưu khi gán tài liệu cho môn, không phải nội dung đọc từ PDF.`
            : `Trong workspace, tài liệu “${oneLine(named.name)}” chưa được gắn với môn học nào. Đây là thông tin đã lưu, không phải nội dung đọc từ PDF.`,
        answerable: true,
        workspaceIntent: "document_course",
        workspaceSources: sources,
      };
    }

    const scope = await this.course(
      input,
      "Bạn muốn xem tài liệu của môn nào, hay hỏi về một tài liệu cụ thể theo tên file? Các môn hiện có được liệt kê bên dưới.",
    );
    if (scope.stop) return scope.stop;
    const course = scope.course!;
    const filed = documents.filter(
      (document) => document.course_id === course.id,
    );
    const where = `môn ${courseLabel(course)}${scope.fromPage ? " (môn đang mở)" : ""}`;
    if (filed.length === 0 && !found.truncated)
      return {
        answer: `Chưa có tài liệu nào được gắn với ${where}.`,
        answerable: true,
        workspaceIntent: "course_documents",
        workspaceSources: [],
      };
    const indexed = (document: (typeof filed)[number]) =>
      document.processing_status === "ready"
        ? "đã lập chỉ mục"
        : "chưa lập chỉ mục";
    return {
      answer: `${found.truncated ? partialNote("Documents") + "\n\n" : ""}Có ${count(filed.length, found.truncated)} tài liệu được gắn với ${where} (theo thông tin đã lưu, không phải nội dung PDF):\n${bullets(
        filed.map(
          (document) => `${oneLine(document.name)} — ${indexed(document)}`,
        ),
        filed.length,
      )}`,
      answerable: true,
      workspaceIntent: "course_documents",
      workspaceSources: filed.slice(0, SHOWN).map((document) => ({
        kind: "document",
        id: document.id,
        label: oneLine(document.name),
        detail: indexed(document),
      })),
    };
  }

  private async courses(): Promise<Draft> {
    const courses = await this.records.courses();
    if (courses.length === 0)
      return {
        answer: "Workspace hiện chưa có môn học nào.",
        answerable: true,
        workspaceIntent: "courses_list",
        workspaceSources: [],
      };
    return {
      answer: `Workspace có ${courses.length} môn học:\n${bullets(
        courses.map(courseLabel),
        courses.length,
      )}\n\nThông tin môn học trong workspace demo là dữ liệu minh họa.`,
      answerable: true,
      workspaceIntent: "courses_list",
      workspaceSources: courses.slice(0, SHOWN).map(courseSource),
    };
  }
}
