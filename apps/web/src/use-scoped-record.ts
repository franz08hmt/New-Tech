import { useEffect, useRef, useState } from "react";
import { tl } from "./i18n";

interface LookupState<RecordType> {
  key: string;
  loading: boolean;
  record: RecordType | null;
  error: string | null;
}

/** Scoped deep-link lookup that drops responses when target or principal moves. */
export function useScopedRecord<RecordType>(
  identity: string,
  id: string | undefined,
  listLoaded: boolean,
  alreadyListed: boolean,
  load: (id: string, signal: AbortSignal) => Promise<RecordType>,
  reloadToken = 0,
) {
  const key = JSON.stringify([identity, id ?? ""]);
  const [state, setState] = useState<LookupState<RecordType> | null>(null);
  const revision = useRef(0);
  const lookupAllowed = Boolean(id && identity && listLoaded && !alreadyListed);
  const [availability, setAvailability] = useState({
    key,
    lookupAllowed,
    generation: 0,
  });

  // A lookup result is valid only for the current interval in which the target
  // is absent from the page. Bump synchronously during render on either edge
  // so stale data is hidden before an effect can run, including when the
  // target later leaves the page again.
  if (
    availability.key !== key ||
    availability.lookupAllowed !== lookupAllowed
  ) {
    setAvailability({
      key,
      lookupAllowed,
      generation: availability.generation + 1,
    });
  }
  const requestKey = JSON.stringify([
    key,
    reloadToken,
    availability.generation,
  ]);

  useEffect(() => {
    const currentRevision = ++revision.current;
    if (!lookupAllowed || !id) return;
    const controller = new AbortController();
    setState({ key: requestKey, loading: true, record: null, error: null });
    void load(id, controller.signal)
      .then((record) => {
        if (controller.signal.aborted || revision.current !== currentRevision)
          return;
        setState({ key: requestKey, loading: false, record, error: null });
      })
      .catch(() => {
        if (controller.signal.aborted || revision.current !== currentRevision)
          return;
        setState({
          key: requestKey,
          loading: false,
          record: null,
          error: tl("This item is not available in the current workspace."),
        });
      });
    return () => {
      controller.abort();
      if (revision.current === currentRevision) revision.current++;
    };
  }, [id, load, lookupAllowed, requestKey]);

  const current = state?.key === requestKey ? state : null;
  return {
    record: lookupAllowed ? (current?.record ?? null) : null,
    loading: Boolean(lookupAllowed && (current?.loading ?? true)),
    error: lookupAllowed ? (current?.error ?? null) : null,
  };
}
