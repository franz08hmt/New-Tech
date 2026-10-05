import { describe, expect, it } from "vitest";
import {
  classifyQuestion,
  matchCourse,
  matchDocument,
  normalize,
} from "./workspace-intent.js";

const courses = [
  { id: "c1", slug: "cs-201", name: "Công nghệ phần mềm", code: "CS 201" },
  { id: "c2", slug: "ma-101", name: "Giải tích", code: "MA 101" },
];

describe("workspace intent", () => {
  it("reads accents, đ and punctuation the same way", () => {
    expect(normalize("KỲ THI: Đề cương!")).toBe("ky thi de cuong");
  });

  it.each([
    // Without accents "thì" is "thi"; it must not turn a task question into an exam one.
    ["Nếu vậy thì task nào đã quá hạn?", "tasks"],
    ["Cho mình chi tiết kỳ thi sắp tới", "exams"],
    ["Bài đầu tiên cần ôn là gì?", "study_plans"],
    ["Ôn thi môn Giải tích còn gì?", "study_plans"],
    ["Tổng chi tiêu của môn CS 201?", "expenses"],
    ["Tài liệu này thuộc môn nào?", "documents"],
    ["Có những môn học nào?", "courses"],
  ])("classifies %s as %s", (question, topic) => {
    expect(classifyQuestion(question).topic).toBe(topic);
  });

  it.each([
    // English "on" is not "ôn": these are not about revising.
    ["Which exams are on Friday?", "exams"],
    ["Are there any tasks on the list?", "tasks"],
    ["Ôn lại chương 2 xong chưa?", "study_plans"],
  ])("does not mistake English 'on' for revising: %s", (question, topic) => {
    expect(classifyQuestion(question).topic).toBe(topic);
  });

  it.each([
    ["Task nào đã hoàn thành?", true],
    ["Task nào đã xong rồi?", true],
    ["Which tasks are done?", true],
    ["Task nào chưa hoàn thành?", false],
    ["Task nào chưa xong?", false],
    ["Việc ôn nào đã xong?", true],
  ])("tells finished from unfinished: %s", (question, done) => {
    expect(classifyQuestion(question).done).toBe(done);
  });

  it("does not take a question about done work as a request to change it", () => {
    expect(classifyQuestion("Task nào đã hoàn thành?").topic).toBe("tasks");
    expect(classifyQuestion("Đánh dấu task demo là xong").topic).toBe("write");
  });

  it("matches a course by name, code with or without its space, or slug", () => {
    for (const question of [
      "Kỳ thi môn Công nghệ phần mềm",
      "Kỳ thi CS 201",
      "Kỳ thi CS201",
      "Kỳ thi cs-201",
    ])
      expect(matchCourse(question, courses)).toMatchObject({
        kind: "matched",
        course: { id: "c1" },
      });
  });

  it("reports two named courses as ambiguous and an unknown one as unknown", () => {
    expect(matchCourse("Kỳ thi CS 201 và MA 101", courses).kind).toBe(
      "ambiguous",
    );
    expect(matchCourse("Kỳ thi môn Hóa học", courses)).toEqual({
      kind: "unknown",
      mentioned: "hoa hoc",
    });
  });

  it("falls back to the course on screen only when none is named", () => {
    expect(matchCourse("Kỳ thi sắp tới?", courses, "c2")).toMatchObject({
      kind: "matched",
      course: { id: "c2" },
      fromPage: true,
    });
    expect(matchCourse("Kỳ thi CS 201?", courses, "c2")).toMatchObject({
      course: { id: "c1" },
      fromPage: false,
    });
  });

  it("matches a document by file name, and never two at once", () => {
    const documents = [{ name: "de-cuong.pdf" }, { name: "ghi-chu.pdf" }];
    expect(matchDocument("de-cuong.pdf thuộc môn nào", documents)).toBe(
      documents[0],
    );
    expect(matchDocument("de-cuong và ghi-chu", documents)).toBeUndefined();
  });
});
