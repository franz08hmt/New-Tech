export type ProviderDeadlineEvent = { kind: "timeout" };

/** A deadline is an event, not a rejecting promise, so it is safe to exist
 * while an admission permit is still being acquired. */
export function createProviderDeadline(
  timeoutMs: number,
  onTimeout: () => void,
) {
  let expired = false;
  let resolveDeadline!: (event: ProviderDeadlineEvent) => void;
  const event = new Promise<ProviderDeadlineEvent>((resolve) => {
    resolveDeadline = resolve;
  });
  const timer = setTimeout(() => {
    expired = true;
    onTimeout();
    resolveDeadline({ kind: "timeout" });
  }, timeoutMs);
  return {
    event,
    hasExpired: () => expired,
    dispose: () => clearTimeout(timer),
  };
}

export type SettledProviderCall<T> =
  { kind: "response"; value: T } | { kind: "error"; error: unknown };

/** Converts rejection to a value immediately, before any racing await. */
export function settleProviderCall<T>(
  dispatch: () => T | PromiseLike<T>,
): Promise<SettledProviderCall<T>> {
  try {
    return Promise.resolve(dispatch()).then(
      (value): SettledProviderCall<T> => ({ kind: "response", value }),
      (error: unknown): SettledProviderCall<T> => ({ kind: "error", error }),
    );
  } catch (error: unknown) {
    return Promise.resolve({ kind: "error", error });
  }
}
