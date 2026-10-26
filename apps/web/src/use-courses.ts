import { useCallback, useContext, useEffect, useState } from "react";
import { api, type Course } from "./api";
import { PilotPrincipalContext } from "./PilotPrincipalContext";
import { tl } from "./i18n";

export interface CoursesState {
  courses: Course[];
  loading: boolean;
  error: string | null;
  retry: () => void;
}

/** Complete legacy list for the dashboard/gallery and course selectors only. */
export function useCourses(enabled = true): CoursesState {
  const principal = useContext(PilotPrincipalContext);
  const identity = principal
    ? `${principal.userId}:${principal.workspaceId}:${principal.role}`
    : "";
  const [snapshot, setSnapshot] = useState<{
    identity: string;
    courses: Course[];
    loading: boolean;
    error: string | null;
  }>({ identity, courses: [], loading: enabled, error: null });
  const [requestNumber, setRequestNumber] = useState(0);
  const retry = useCallback(() => setRequestNumber((value) => value + 1), []);

  useEffect(() => {
    if (!enabled || !identity) {
      setSnapshot({ identity, courses: [], loading: false, error: null });
      return;
    }
    const controller = new AbortController();
    setSnapshot((current) => ({
      identity,
      courses: current.identity === identity ? current.courses : [],
      loading: true,
      error: null,
    }));
    void api
      .listCourses(controller.signal)
      .then((courses) => {
        if (!controller.signal.aborted)
          setSnapshot({ identity, courses, loading: false, error: null });
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setSnapshot({
            identity,
            courses: [],
            loading: false,
            error: tl(
              "Courses could not be loaded. Check your connection and retry.",
            ),
          });
      });
    return () => controller.abort();
  }, [enabled, identity, requestNumber]);

  const current = snapshot.identity === identity ? snapshot : null;
  return {
    courses: current?.courses ?? [],
    loading: enabled && Boolean(identity) && (current?.loading ?? true),
    error: current?.error ?? null,
    retry,
  };
}
