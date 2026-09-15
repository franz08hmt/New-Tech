import { useCallback, useEffect, useState } from "react";
import { api, type Course } from "./api";

export interface CoursesState {
  courses: Course[];
  loading: boolean;
  error: string | null;
  retry: () => void;
}

export function useCourses(): CoursesState {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [requestNumber, setRequestNumber] = useState(0);

  const retry = useCallback(() => setRequestNumber((value) => value + 1), []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    void api
      .listCourses()
      .then((result) => {
        if (active) setCourses(result);
      })
      .catch(() => {
        if (active) {
          setCourses([]);
          setError(
            "Chưa tải được danh sách môn học. Có thể kết nối đang trục trặc một chút, thử lại giúp mình nhé.",
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

  return { courses, loading, error, retry };
}
