import { useCallback, useEffect, useState } from "react";
import { api, type StudyPlan } from "./api";

export interface StudyPlansState {
  plans: StudyPlan[];
  loading: boolean;
  busy: boolean;
  error: string | null;
  reload: () => void;
  create: (input: {
    courseId: string;
    title: string;
    detail?: string;
    dueDate?: string;
    ownerName?: string;
  }) => Promise<boolean>;
  setCompletion: (id: string, completed: boolean) => Promise<boolean>;
  remove: (id: string) => Promise<boolean>;
}

/** One course and everything still to revise for it. */
export interface CourseGroup {
  slug: string;
  name: string;
  code: string;
  plans: StudyPlan[];
  done: number;
}

/**
 * Grouped by course rather than by status, because the question a student
 * actually asks is "what do I still have to do for this subject" — and it is
 * what makes the page explain itself at a glance.
 */
export function groupByCourse(plans: StudyPlan[]): CourseGroup[] {
  const groups = new Map<string, CourseGroup>();
  for (const plan of plans) {
    let group = groups.get(plan.course_id);
    if (!group) {
      group = {
        slug: plan.course_slug,
        name: plan.course_name,
        code: plan.course_code,
        plans: [],
        done: 0,
      };
      groups.set(plan.course_id, group);
    }
    group.plans.push(plan);
    if (plan.completed_at) group.done += 1;
  }
  return [...groups.values()];
}

export function useStudyPlans(): StudyPlansState {
  const [plans, setPlans] = useState<StudyPlan[]>([]);
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
      .listStudyPlans()
      .then((result) => {
        if (active) setPlans(result);
      })
      .catch(() => {
        if (active) {
          setPlans([]);
          setError(
            "Chưa xem được kế hoạch ôn tập. Có thể kết nối đang trục trặc một chút, thử lại giúp mình nhé.",
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

  const create = useCallback<StudyPlansState["create"]>(async (input) => {
    setBusy(true);
    setError(null);
    try {
      const created = await api.createStudyPlan(input);
      setPlans((current) => [...current, created]);
      return true;
    } catch {
      setError("Chưa lưu được việc này. Xem lại thông tin rồi thử lại nhé.");
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  const setCompletion = useCallback<StudyPlansState["setCompletion"]>(
    async (id, completed) => {
      setBusy(true);
      setError(null);
      try {
        const updated = await api.setStudyPlanCompletion(id, completed);
        setPlans((current) =>
          current.map((plan) => (plan.id === id ? updated : plan)),
        );
        return true;
      } catch {
        setError("Chưa đổi được trạng thái. Thử lại một lần nữa nhé.");
        return false;
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  const remove = useCallback<StudyPlansState["remove"]>(async (id) => {
    setBusy(true);
    setError(null);
    try {
      await api.deleteStudyPlan(id);
      setPlans((current) => current.filter((plan) => plan.id !== id));
      return true;
    } catch {
      setError("Chưa xoá được việc này. Thử lại một lần nữa nhé.");
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  return { plans, loading, busy, error, reload, create, setCompletion, remove };
}
