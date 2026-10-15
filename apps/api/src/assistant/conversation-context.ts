import type { AssistantHistoryTurn } from "@examate/contracts";

export interface ConversationTurn {
  question: string;
  answer: string;
}

// This deliberately covers the validator's broad source-like pattern, not
// only valid [S1] markers. Historic questions cannot carry old labels either.
export function stripPriorSources(text: string): string {
  return text.replace(/\[S[^\]]*\]/g, "(nguồn ở lượt trước)");
}

export function buildConversationContext(
  history: readonly AssistantHistoryTurn[],
  budget: number,
) {
  const turns: ConversationTurn[] = [];
  let remaining = budget;
  let truncated = false;
  for (const item of [...history].reverse()) {
    const question = stripPriorSources(item.snapshot.request.question);
    const answer = stripPriorSources(item.snapshot.response.answer);
    if (question.length + answer.length <= remaining) {
      turns.unshift({ question, answer });
      remaining -= question.length + answer.length;
      continue;
    }
    truncated = true;
    // Drop oldest whole turns. If even the newest turn is oversized, retain a
    // clearly shortened context rather than discarding a long summary entirely.
    if (turns.length === 0) {
      const suffix = " (đã rút gọn)";
      const shortQuestion = safePrefix(
        question,
        Math.min(question.length, Math.floor(budget / 3)),
      );
      const shortAnswer =
        safePrefix(
          answer,
          Math.max(0, budget - shortQuestion.length - suffix.length),
        ) + suffix;
      turns.unshift({ question: shortQuestion, answer: shortAnswer });
    }
    break;
  }
  return { turns, truncated };
}

function safePrefix(text: string, limit: number): string {
  let result = text.slice(0, limit);
  // Do not leave half of the neutralized citation label or a surrogate pair.
  const label = "(nguồn ở lượt trước)";
  const start = result.lastIndexOf("(");
  if (
    start >= 0 &&
    label.startsWith(result.slice(start)) &&
    !result.endsWith(label)
  )
    result = result.slice(0, start);
  if (/[\uD800-\uDBFF]$/.test(result)) result = result.slice(0, -1);
  return result;
}

export function retrievalQuestion(
  current: string,
  turns: readonly ConversationTurn[],
): string {
  let result = current;
  let remaining = Math.min(2000, 4000 - current.length);
  const previous = turns.slice(-2);
  for (const [index, turn] of previous.entries()) {
    if (remaining <= 1) break;
    // Reserve at least half for the newest referent; unused older allocation
    // remains available to the newest. Keep chronological order in the query.
    const allocation =
      index === 0 && previous.length === 2
        ? Math.floor(remaining / 2)
        : remaining;
    const text = safePrefix(turn.question, allocation - 1);
    if (!text) continue;
    result += `\n${text}`;
    remaining -= text.length + 1;
  }
  return result;
}
