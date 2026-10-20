import { useCallback, useContext, useState } from "react";
import type { Course } from "./api";
import { api } from "./api";
import { PilotPrincipalContext } from "./PilotPrincipalContext";
import { useScopedRecord } from "./use-scoped-record";

export interface CourseLookupState {
  course: Course | null;
  loading: boolean;
  error: string | null;
  retry: () => void;
}

export function useCourseLookup(slug?: string) {
  const principal = useContext(PilotPrincipalContext);
  const identity = principal
    ? `${principal.userId}:${principal.workspaceId}:${principal.role}`
    : "";
  const [retryVersion, setRetryVersion] = useState(0);
  const load = useCallback(
    (target: string, signal: AbortSignal) => api.getCourse(target, signal),
    [],
  );
  const lookup = useScopedRecord<Course>(
    identity,
    slug,
    Boolean(identity),
    false,
    load,
    retryVersion,
  );
  return {
    course: lookup.record,
    loading: lookup.loading,
    error: lookup.error,
    retry: () => setRetryVersion((current) => current + 1),
  };
}
