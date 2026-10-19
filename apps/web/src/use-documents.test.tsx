import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, type StoredDocument } from "./api";
import { useDocuments } from "./use-documents";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((accept, fail) => {
    resolve = accept;
    reject = fail;
  });
  return { promise, resolve, reject };
}

const documentRow = (name: string): StoredDocument => ({
  id: name,
  name: `${name}.pdf`,
  media_type: "application/pdf",
  size_bytes: 1,
  storage_status: "stored",
  processing_status: "ready",
  index_quality: null,
  course_id: null,
  course_name: null,
  course_code: null,
  course_slug: null,
  created_at: "2026-10-19T00:00:00.000Z",
  updated_at: "2026-10-19T00:00:00.000Z",
});

function DocumentsProbe() {
  const state = useDocuments();
  return (
    <>
      <output aria-label="Loaded documents">
        {state.documents.map((item) => item.name).join(",")}
      </output>
      <button onClick={state.reload}>Refresh</button>
    </>
  );
}

function SessionDocuments({ identity }: { identity: string }) {
  return (
    <div key={identity}>
      <DocumentsProbe />
    </div>
  );
}

describe("Assistant document list freshness", () => {
  beforeEach(() => {
    vi.spyOn(api, "listDocuments");
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("ignores an older list response that resolves after a newer refresh", async () => {
    const oldRead = deferred<StoredDocument[]>();
    const newRead = deferred<StoredDocument[]>();
    vi.mocked(api.listDocuments)
      .mockReturnValueOnce(oldRead.promise)
      .mockReturnValueOnce(newRead.promise);

    render(<DocumentsProbe />);
    await waitFor(() => expect(api.listDocuments).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() => expect(api.listDocuments).toHaveBeenCalledTimes(2));

    await act(async () => newRead.resolve([documentRow("new")]));
    expect(screen.getByLabelText("Loaded documents")).toHaveTextContent(
      "new.pdf",
    );
    await act(async () => oldRead.resolve([documentRow("old")]));
    expect(screen.getByLabelText("Loaded documents")).toHaveTextContent(
      "new.pdf",
    );
    expect(screen.getByLabelText("Loaded documents")).not.toHaveTextContent(
      "old.pdf",
    );
  });

  it("does not apply a response from a prior account/workspace view", async () => {
    const oldRead = deferred<StoredDocument[]>();
    vi.mocked(api.listDocuments)
      .mockReturnValueOnce(oldRead.promise)
      .mockResolvedValueOnce([documentRow("current-session")]);

    const rendered = render(
      <SessionDocuments identity="account-a/workspace-a" />,
    );
    await waitFor(() => expect(api.listDocuments).toHaveBeenCalledTimes(1));
    rendered.rerender(<SessionDocuments identity="account-b/workspace-b" />);
    expect(await screen.findByText("current-session.pdf")).toBeInTheDocument();

    await act(async () => oldRead.resolve([documentRow("previous-session")]));
    expect(screen.getByLabelText("Loaded documents")).toHaveTextContent(
      "current-session.pdf",
    );
    expect(screen.getByLabelText("Loaded documents")).not.toHaveTextContent(
      "previous-session.pdf",
    );
  });
});
