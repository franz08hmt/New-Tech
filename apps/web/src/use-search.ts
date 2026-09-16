import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api";
import { CATEGORY_LABELS } from "./use-expenses";

export type HitKind =
  "course" | "exam" | "plan" | "document" | "expense" | "task";

export interface SearchHit {
  key: string;
  kind: HitKind;
  label: string;
  detail: string;
  href: string;
}

/** Group captions, in the order the results are shown. */
export const KIND_LABELS: Record<HitKind, string> = {
  course: "Môn học",
  exam: "Kỳ thi",
  plan: "Việc cần ôn",
  document: "Tài liệu",
  expense: "Khoản chi",
  task: "Công việc",
};

const KIND_ORDER: HitKind[] = [
  "course",
  "exam",
  "plan",
  "document",
  "expense",
  "task",
];

const MAX_HITS = 12;

/**
 * Folds text down to something two people typing the same thing will match on.
 *
 * Diacritics go, so "thuat toan" finds "thuật toán" — that is how most people
 * type in a hurry. NFD splits an accented letter into base plus combining
 * mark and the range below drops the marks; đ has no decomposition, so it is
 * mapped by hand.
 *
 * Every run of punctuation then becomes a single space, which is what lets a
 * typed phrase reach a filename: "thuat toan" matches
 * "de-cuong-thuat-toan.pdf", where the words are joined by hyphens rather
 * than spaces.
 */
function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const money = new Intl.NumberFormat("vi-VN");

interface Loaded {
  hits: SearchHit[];
}

/**
 * Searches everything in the workspace from the sidebar.
 *
 * The lists are fetched once, the first time something is actually typed, and
 * kept for the rest of the session. Fetching on mount would make every page
 * load six requests for a box most visits never touch; fetching on each
 * keystroke would be worse still.
 */
export function useWorkspaceSearch(query: string) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wanted = query.trim().length >= 2;

  // Whether the one fetch has been started, and whether the component is still
  // around to receive it.
  //
  // Both are refs rather than state, and the effect depends only on `wanted`.
  // An earlier version guarded on `loading` and listed it as a dependency: the
  // effect set loading, React tore that same effect down to re-run it, the
  // cleanup marked the in-flight request as abandoned, and the results never
  // arrived — the panel sat on "Đang tải" for good.
  const started = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    // Set on the way in, not only cleared on the way out. StrictMode mounts,
    // unmounts and mounts again in development: with the flag only cleared by
    // the cleanup, it stayed false after that second mount and every result
    // was discarded on arrival — the panel sat on "Đang tìm…" forever.
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!wanted || started.current) return;
    started.current = true;
    setLoading(true);
    setError(null);
    void Promise.all([
      api.listCourses(),
      api.listExams(),
      api.listStudyPlans(),
      api.listDocuments(),
      api.listExpenses(),
      api.listTasks(),
    ])
      .then(([courses, exams, plans, documents, expenses, tasks]) => {
        if (!mounted.current) return;
        const hits: SearchHit[] = [
          ...courses.map((course) => ({
            key: `course-${course.id}`,
            kind: "course" as const,
            label: course.name,
            detail: `${course.code} · ${course.detail}`,
            href: `#courses/${course.slug}`,
          })),
          ...exams.map((exam) => ({
            key: `exam-${exam.id}`,
            kind: "exam" as const,
            label: exam.topic,
            detail: `${exam.course_name} · ${exam.exam_date} · ${exam.room}`,
            href: "#exams",
          })),
          ...plans.map((plan) => ({
            key: `plan-${plan.id}`,
            kind: "plan" as const,
            label: plan.title,
            detail: plan.course_name,
            href: "#study-plan",
          })),
          ...documents.map((document) => ({
            key: `document-${document.id}`,
            kind: "document" as const,
            label: document.name,
            detail: document.course_name ?? "Chưa gắn môn nào",
            href: "#documents",
          })),
          ...expenses.map((expense) => ({
            key: `expense-${expense.id}`,
            kind: "expense" as const,
            label: expense.description,
            detail: `${money.format(expense.amount)} ₫ · ${
              CATEGORY_LABELS[expense.category]
            }${expense.course_code ? ` · ${expense.course_code}` : ""}`,
            href: "#finances",
          })),
          ...tasks.map((task) => ({
            key: `task-${task.id}`,
            kind: "task" as const,
            label: task.title,
            detail: task.owner_name ?? "Chưa giao cho ai",
            href: "#tasks",
          })),
        ];
        setLoaded({ hits });
      })
      .catch(() => {
        // Cleared so the next keystroke tries again rather than leaving the
        // box permanently unable to search.
        started.current = false;
        if (mounted.current)
          setError("Chưa tìm được lúc này. Kiểm tra kết nối rồi thử lại nhé.");
      })
      .finally(() => {
        if (mounted.current) setLoading(false);
      });
  }, [wanted]);

  const results = useMemo(() => {
    if (!wanted || !loaded) return [];
    const needle = fold(query.trim());
    // Matches on the name and on the supporting line, so "CS 201" finds every
    // exam of that course, not only things whose title contains the code.
    const matched = loaded.hits.filter(
      (hit) =>
        fold(hit.label).includes(needle) || fold(hit.detail).includes(needle),
    );
    matched.sort(
      (a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind),
    );
    return matched.slice(0, MAX_HITS);
  }, [wanted, loaded, query]);

  const groups = useMemo(() => {
    const byKind = new Map<HitKind, SearchHit[]>();
    for (const hit of results) {
      const list = byKind.get(hit.kind);
      if (list) list.push(hit);
      else byKind.set(hit.kind, [hit]);
    }
    return [...byKind.entries()];
  }, [results]);

  return {
    groups,
    total: results.length,
    searching: wanted,
    loading,
    error,
    truncated: Boolean(loaded) && results.length === MAX_HITS,
  };
}
