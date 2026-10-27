import { AssistantError } from "./assistant.types.js";
import { isSourceId, scanSourceMarkers } from "./source-markers.js";

/** Bounded per-call policy; does not change global config, quota or retry counts. */
export const GROUNDED_OUTPUT_TOKENS = 4096;
export const GROUNDED_THINKING_TOKENS = 256;
export const GROUNDED_JSON_INSTRUCTION = `

OUTPUT_CONTRACT_V2:
Return exactly one complete JSON object with answerable and blocks; no Markdown fences, preamble or trailing text.
Each block has text and sourceIds. Keep a concise answer in at most 12 blocks, each text at most 500 characters. Do not attempt to transcribe an entire long document. If asked for that, clearly say this is a bounded overview/excerpt and refer to the source PDF for the complete text.
For an answerable response, every block must have at least one sourceId from the supplied evidence/source catalog. Put plain content in text, without inline source markers, document URLs or a separate citationIds field.
The server derives citationIds and renders inline markers from the same block sourceIds. Do not produce those two representations yourself.
For a refusal, answerable is false and there is exactly one block with a nonempty explanation and empty sourceIds.
Before finishing, check the JSON is closed and every factual block is grounded in its attached sources.`;

export function groundedAnswerSchema(sourceIds: readonly string[]) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["answerable", "blocks"],
    propertyOrdering: ["answerable", "blocks"],
    properties: {
      answerable: { type: "boolean" },
      blocks: {
        type: "array",
        minItems: 1,
        maxItems: 12,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["text", "sourceIds"],
          propertyOrdering: ["text", "sourceIds"],
          properties: {
            text: { type: "string", minLength: 1, maxLength: 600 },
            sourceIds: {
              type: "array",
              maxItems: 5,
              items: { type: "string", enum: [...new Set(sourceIds)] },
            },
          },
        },
      },
    },
  };
}

/** Internal v2 wire format; public response/receipts and legacy validation stay intact. */
export function renderGroundedBlocks(
  value: Record<string, unknown>,
): Record<string, unknown> {
  const invalid = (): never => {
    throw new AssistantError("upstream", "answer_shape_invalid");
  };
  if (
    Object.keys(value).sort().join(",") !== "answerable,blocks" ||
    typeof value.answerable !== "boolean" ||
    !Array.isArray(value.blocks) ||
    value.blocks.length < 1 ||
    value.blocks.length > 12 ||
    (!value.answerable && value.blocks.length !== 1)
  )
    return invalid();
  const text: string[] = [],
    ids: string[] = [];
  for (const block of value.blocks) {
    if (
      !block ||
      typeof block !== "object" ||
      Array.isArray(block) ||
      Object.keys(block).sort().join(",") !== "sourceIds,text" ||
      typeof block.text !== "string" ||
      !block.text.trim() ||
      block.text.length > 600 ||
      !Array.isArray(block.sourceIds) ||
      block.sourceIds.length > 5 ||
      !block.sourceIds.every(isSourceId) ||
      (value.answerable
        ? !block.sourceIds.length
        : block.sourceIds.length !== 0)
    )
      return invalid();
    if (new Set(block.sourceIds).size !== block.sourceIds.length)
      throw new AssistantError("upstream", "citation_ids_duplicate");
    if (scanSourceMarkers(block.text).sourceLike.length)
      throw new AssistantError("upstream", "source_marker_malformed");
    const sources = block.sourceIds as string[];
    ids.push(...sources);
    text.push(
      block.text.trim() +
        (sources.length ? " " + sources.map((id) => `[${id}]`).join(" ") : ""),
    );
  }
  return {
    answerable: value.answerable,
    answer: text.join("\n\n"),
    citationIds: [...new Set(ids)],
  };
}
