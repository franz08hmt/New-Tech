import { AsyncLocalStorage } from "node:async_hooks";

export const requestContext = new AsyncLocalStorage<{ requestId: string }>();
export function log(
  level: "info" | "error",
  event: string,
  fields: Record<string, unknown> = {},
) {
  console.log(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      event,
      requestId: requestContext.getStore()?.requestId,
      ...fields,
    }),
  );
}
export function errorCode(error: unknown): string {
  const code = (error as { code?: unknown })?.code;
  return typeof code === "string" && /^[A-Z0-9_]{1,50}$/.test(code)
    ? code
    : "UNCLASSIFIED";
}
