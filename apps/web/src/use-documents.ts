import { useCallback, useEffect, useState } from "react";
import { api, type StoredDocument } from "./api";

export interface DocumentsState {
  documents: StoredDocument[];
  loading: boolean;
  busy: boolean;
  error: string | null;
  reload: () => void;
  setCourse: (id: string, courseId: string | null) => Promise<boolean>;
}

/**
 * A read-and-refile view of the document library.
 *
 * Deliberately narrower than DocumentsPanel, which also owns picking files,
 * the upload lifecycle and its retry path. Screens that only need to see what
 * is stored and move a file between subjects use this instead of carrying that
 * machinery around.
 */
export function useDocuments(): DocumentsState {
  const [documents, setDocuments] = useState<StoredDocument[]>([]);
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
      .listDocuments()
      .then((result) => {
        if (active) setDocuments(result);
      })
      .catch(() => {
        if (active) {
          setDocuments([]);
          setError(
            "Chưa xem được tài liệu. Có thể kết nối đang trục trặc một chút, thử lại giúp mình nhé.",
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

  const setCourse = useCallback<DocumentsState["setCourse"]>(
    async (id, courseId) => {
      setBusy(true);
      setError(null);
      try {
        const updated = await api.setDocumentCourse(id, courseId);
        setDocuments((current) =>
          current.map((item) => (item.id === id ? updated : item)),
        );
        return true;
      } catch {
        setError(
          "Chưa đổi được môn cho tài liệu này. Thử lại một lần nữa nhé.",
        );
        return false;
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  return { documents, loading, busy, error, reload, setCourse };
}
