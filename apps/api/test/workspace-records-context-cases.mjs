// Synthetic, fixed-clock regression inputs shared by capture and verification.
import { clock } from "./academic-context-fixture.mjs";
export const workspaceQuestions = [
  ["tasks_open", "Task nào chưa xong?"],
  ["tasks_done", "Task nào đã xong?"],
  ["tasks_overdue", "Task nào quá hạn?"],
  ["exams_upcoming", "Kỳ thi nào sắp tới?"],
  ["study_plans_open", "Việc cần ôn nào chưa hoàn thành?"],
  ["study_plans_done", "Việc cần ôn nào đã hoàn thành?"],
  ["study_plans_overdue", "Việc cần ôn nào quá hạn?"],
  ["expenses_total", "Tổng chi là bao nhiêu?", true],
  ["courses_list", "Workspace có những môn học nào?"],
  ["document_course", "Tài liệu academic-a.pdf thuộc môn nào?"],
  ["course_documents", "Có tài liệu nào?", true],
];
export async function readRecords(records, p, course) {
  return {
    courses: await records.courses(p),
    tasksOpen: await records.tasks({ state: "open" }, p),
    tasksDone: await records.tasks({ state: "done" }, p),
    tasksOverdue: await records.tasks(
      { state: "open", dueBefore: clock.date },
      p,
    ),
    exams: await records.exams(course, clock, p),
    plansOpen: await records.studyPlans(course, { state: "open" }, p),
    plansDone: await records.studyPlans(course, { state: "completed" }, p),
    plansOverdue: await records.studyPlans(
      course,
      { state: "open", dueBefore: clock.date },
      p,
    ),
    expenses: await records.courseExpenses(course, p),
    unassigned: await records.unassignedExpenseCount(p),
    documents: await records.documents(p),
  };
}
