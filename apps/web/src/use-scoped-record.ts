import { useEffect, useRef, useState } from "react";

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

  useEffect(() => {
    const currentRevision = ++revision.current;
    if (!id || !identity || !listLoaded || alreadyListed) return;
    const controller = new AbortController();
    setState({ key, loading: true, record: null, error: null });
    void load(id, controller.signal)
      .then((record) => {
        if (controller.signal.aborted || revision.current !== currentRevision)
          return;
        setState({ key, loading: false, record, error: null });
      })
      .catch(() => {
        if (controller.signal.aborted || revision.current !== currentRevision)
          return;
        setState({
          key,
          loading: false,
          record: null,
          error: "This item is not available in the current workspace.",
        });
      });
    return () => {
      controller.abort();
      if (revision.current === currentRevision) revision.current++;
    };
  }, [alreadyListed, id, identity, key, listLoaded, load, reloadToken]);

  const current = state?.key === key ? state : null;
  return {
    record: current?.record ?? null,
    loading: Boolean(
      id &&
      identity &&
      listLoaded &&
      !alreadyListed &&
      (current?.loading ?? true),
    ),
    error: current?.error ?? null,
  };
}
