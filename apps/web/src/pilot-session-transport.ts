import type { PilotSessionResponse } from "@examate/contracts";

// Auth GETs can set cookies. React discarding stale JSON cannot undo those
// cookies, so share pending reads across component lifetimes in this tab.
let revision = 0;
let tail: Promise<void> | undefined;
let session:
  { revision: number; response: Promise<PilotSessionResponse> } | undefined;

function enqueue<T>(send: () => Promise<T>): Promise<T> {
  const response = tail ? tail.then(send) : send();
  // A failed request releases the queue; no operation is retried here.
  const finished = response.then(
    () => {},
    () => {},
  );
  tail = finished;
  void finished.then(() => {
    if (tail === finished) tail = undefined;
  });
  return response;
}

export function readPilotSession(send: () => Promise<PilotSessionResponse>) {
  if (session?.revision === revision) return session.response;
  const response = enqueue(send);
  session = { revision, response };
  const release = () => {
    if (session?.response === response) session = undefined;
  };
  void response.then(release, release);
  return response;
}

export function changePilotSession<T>(send: () => Promise<T>) {
  // A read requested after login/logout/refresh must observe that transition,
  // rather than share the pending response from before it. Serialization also
  // makes earlier Set-Cookie arrive before the mutation rotates/deletes it.
  invalidatePilotSession();
  return enqueue(send);
}

/** Future verification must not consume identity from before a revocation. */
export function invalidatePilotSession() {
  revision++;
}
