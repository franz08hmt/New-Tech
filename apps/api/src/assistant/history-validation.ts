import type {
  AssistantChatRequest,
  AssistantHistoryTurn,
} from "@examate/contracts";
import { validSnapshot } from "../feedback/feedback-validation.js";

/** Run BEFORE class-transformer, which recursively walks otherwise unknown keys. */
export function boundedHistoryInput(value: unknown): boolean {
  const pending = [{ value, depth: 0 }];
  let nodes = 0;
  while (pending.length) {
    const item = pending.pop()!;
    if (++nodes > 6000 || item.depth > 12) return false;
    if (item.value !== null && typeof item.value === "object")
      for (const child of Object.values(item.value))
        pending.push({ value: child, depth: item.depth + 1 });
  }
  return true;
}

export function validHistory(
  value: unknown,
  input: AssistantChatRequest,
): value is AssistantHistoryTurn[] {
  if (
    !Array.isArray(value) ||
    value.length > 6 ||
    (input.operation ?? "question") !== "question" ||
    (input.mode === "workspace" && value.length > 0)
  )
    return false;
  try {
    if (!boundedHistoryInput(value)) return false;
    const serialized = JSON.stringify(value);
    if (
      serialized.length > 64000 ||
      Buffer.byteLength(serialized, "utf8") > 81920
    )
      return false;
    return value.every(
      (item) =>
        item !== null &&
        typeof item === "object" &&
        !Array.isArray(item) &&
        Object.keys(item).sort().join(",") === "receiptId,snapshot" &&
        typeof item.receiptId === "string" &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          item.receiptId,
        ) &&
        validSnapshot(item.snapshot),
    );
  } catch {
    // Malformed/deep input must be a safe 400, never a hashing stack overflow.
    return false;
  }
}
