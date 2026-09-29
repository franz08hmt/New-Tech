/*
 * Reading a workspace question: which fixed question it is, and which course
 * it is about. Pure functions over the question text, so every rule here is
 * testable on its own and nothing a record says can change what is asked.
 *
 * Matching runs on a normalised copy — lower case, Vietnamese accents
 * removed, đ → d, punctuation as spaces — so "Kỳ thi", "ky thi" and
 * "KỲ THI!" read the same.
 */

export function normalize(text: string) {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export type WorkspaceTopic =
  | "write"
  | "notes"
  | "study_plans"
  | "exams"
  | "expenses"
  | "tasks"
  | "documents"
  | "courses"
  | "unknown";

// A question that opens with an action verb, or names one that only ever
// means changing data, is a request to write — which this mode never does.
const WRITE_OPENING =
  /^(?:hay |giup (?:toi|minh|em) |lam on |vui long |please )?(?:tao|them|xoa|sua|cap nhat|danh dau|doi ten|create|add|delete|remove|update|edit|mark|rename)\b/;
const WRITE_ANYWHERE = /\b(?:danh dau|xoa|xoa bo|create|delete|remove)\b/;
const NOTES = /\b(?:ghi chu|quick notes?|sticky notes?|notes?)\b/;
// Checked before exams: "ôn thi" is revising, not sitting the exam.
const STUDY_PLANS =
  /\b(?:on tap|can on|viec can on|ke hoach on|ke hoach|study plans?|lich on|on thi|on)\b/;
// Never "thi" alone: without accents it is also "thì", one of the most common
// words in Vietnamese.
const EXAMS =
  /\b(?:ky thi|lich thi|bai thi|ngay thi|mon thi|sap thi|thi khi nao|khi nao thi|thi giua ky|thi cuoi ky|kiem tra|exams?|midterm|final)\b/;
// Whole phrases only: "chi" alone also starts "chi tiết", "tiền" ends "đầu tiên".
const EXPENSES =
  /\b(?:khoan chi|chi tieu|chi phi|da chi|tong chi|ton bao nhieu|het bao nhieu|bao nhieu tien|so tien|tong tien|expenses?|spent|spending|ngan sach|budget)\b/;
const TASKS =
  /\b(?:tasks?|viec can lam|cong viec|nhiem vu|to ?dos?|viec chua xong|viec nao)\b/;
const DOCUMENTS = /\b(?:tai lieu|files?|pdf|documents?)\b/;
const COURSES =
  /\b(?:mon hoc nao|nhung mon|cac mon|danh sach mon|bao nhieu mon|courses?|mon nao)\b/;
const OVERDUE =
  /\b(?:qua han|tre han|tre|tre hen|overdue|het han|da qua han)\b/;

export function classifyQuestion(question: string): {
  topic: WorkspaceTopic;
  overdue: boolean;
} {
  const text = normalize(question);
  const overdue = OVERDUE.test(text);
  const topic: WorkspaceTopic =
    WRITE_OPENING.test(text) || WRITE_ANYWHERE.test(text)
      ? "write"
      : NOTES.test(text)
        ? "notes"
        : STUDY_PLANS.test(text)
          ? "study_plans"
          : EXAMS.test(text)
            ? "exams"
            : EXPENSES.test(text)
              ? "expenses"
              : TASKS.test(text)
                ? "tasks"
                : DOCUMENTS.test(text)
                  ? "documents"
                  : COURSES.test(text)
                    ? "courses"
                    : "unknown";
  return { topic, overdue };
}

/** "môn …" in the question: a course is being named, known or not. */
export function mentionsCourse(question: string) {
  return /\bmon\b/.test(normalize(question));
}

export interface CourseRef {
  id: string;
  slug: string;
  name: string;
  code: string;
}

/**
 * Which course the question is about.
 *
 * A course counts as named when its name, code or slug appears in the
 * question. Two different courses named at once is ambiguous rather than a
 * guess. "môn X" that matches nothing is reported as unknown, so a typo is
 * never quietly answered for some other course. With nothing named, the
 * course the student is viewing — sent by the page — is used, and said so.
 */
export function matchCourse<T extends CourseRef>(
  question: string,
  courses: T[],
  pageCourseId?: string | null,
):
  | { kind: "matched"; course: T; fromPage: boolean }
  | { kind: "ambiguous"; courses: T[] }
  | { kind: "unknown"; mentioned: string }
  | { kind: "none" } {
  const text = ` ${normalize(question)} `;
  const compact = text.replace(/ /g, "");
  const named = courses.filter((course) => {
    const name = normalize(course.name);
    const code = normalize(course.code);
    const slug = normalize(course.slug.replace(/-/g, " "));
    return (
      (name && text.includes(` ${name} `)) ||
      (code && text.includes(` ${code} `)) ||
      (code && compact.includes(code.replace(/ /g, ""))) ||
      (slug && text.includes(` ${slug} `))
    );
  });
  if (named.length === 1)
    return { kind: "matched", course: named[0], fromPage: false };
  if (named.length > 1) return { kind: "ambiguous", courses: named };

  const mention =
    /\bmon(?: hoc)? (?!nao\b|nay\b|do\b|gi\b|hoc\b|cua\b)([a-z0-9]+(?: [a-z0-9]+)?)/.exec(
      text,
    );
  if (mention) return { kind: "unknown", mentioned: mention[1] };

  const onPage = pageCourseId
    ? courses.find((course) => course.id === pageCourseId)
    : undefined;
  if (onPage) return { kind: "matched", course: onPage, fromPage: true };
  return { kind: "none" };
}

/** A document named in the question, by its file name with or without .pdf. */
export function matchDocument<T extends { name: string }>(
  question: string,
  documents: T[],
): T | undefined {
  const text = ` ${normalize(question)} `;
  const named = documents.filter((document) => {
    const full = normalize(document.name);
    const bare = normalize(document.name.replace(/\.pdf$/i, ""));
    return (
      (full && text.includes(` ${full} `)) ||
      (bare.length >= 4 && text.includes(` ${bare} `))
    );
  });
  return named.length === 1 ? named[0] : undefined;
}
