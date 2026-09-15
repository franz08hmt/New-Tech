import { useCallback, useEffect, useState } from "react";
import { api, type Exam } from "./api";

export interface ExamsState {
  exams: Exam[];
  loading: boolean;
  busy: boolean;
  error: string | null;
  reload: () => void;
  create: (input: {
    courseId: string;
    topic: string;
    examDate: string;
    examTime: string;
    room: string;
    revisionNote?: string;
  }) => Promise<boolean>;
  remove: (id: string) => Promise<boolean>;
}

export function useExams(): ExamsState {
  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requestNumber, setRequestNumber] = useState(0);

  const reload = useCallback(() => setRequestNumber((value) => value + 1), []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    void api
      .listExams()
      .then((result) => {
        if (active) setExams(result);
      })
      .catch(() => {
        if (active) {
          setExams([]);
          setError(
            "Chưa xem được lịch thi. Có thể kết nối đang trục trặc một chút, thử lại giúp mình nhé.",
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [requestNumber]);

  const create = useCallback<ExamsState["create"]>(async (input) => {
    setBusy(true);
    setError(null);
    try {
      const created = await api.createExam(input);
      // Insert in place instead of refetching: the list is ordered by date and
      // time, and keeping that order here means the new exam lands where the
      // server would have put it.
      setExams((current) =>
        [...current, created].sort((a, b) =>
          `${a.exam_date} ${a.exam_time}`.localeCompare(
            `${b.exam_date} ${b.exam_time}`,
          ),
        ),
      );
      return true;
    } catch {
      setError("Chưa lưu được kỳ thi này. Xem lại thông tin rồi thử lại nhé.");
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  const remove = useCallback<ExamsState["remove"]>(async (id) => {
    setBusy(true);
    setError(null);
    try {
      await api.deleteExam(id);
      setExams((current) => current.filter((exam) => exam.id !== id));
      return true;
    } catch {
      setError("Chưa xoá được kỳ thi này. Thử lại một lần nữa nhé.");
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  return { exams, loading, busy, error, reload, create, remove };
}

/**
 * Whole days from today to the exam, counted on calendar days rather than
 * elapsed hours so an exam tomorrow morning reads as "1 day" regardless of
 * what time it is now.
 */
export function daysUntil(examDate: string, today = new Date()): number {
  const [year, month, day] = examDate.split("-").map(Number);
  const target = Date.UTC(year, (month ?? 1) - 1, day ?? 1);
  const start = Date.UTC(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );
  return Math.round((target - start) / 86_400_000);
}

export function countdownLabel(days: number): string {
  if (days === 0) return "Hôm nay";
  if (days === 1) return "Ngày mai";
  if (days > 0) return `Còn ${days} ngày`;
  if (days === -1) return "Hôm qua";
  return `${Math.abs(days)} ngày trước`;
}
