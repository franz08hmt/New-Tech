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
            "Courses are unavailable. Chưa lấy được danh sách môn học; hãy kiểm tra API rồi thử lại.",
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
