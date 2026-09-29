import type {
  AssistantChatResponse,
  AssistantStatus,
} from "@examate/contracts";

export type { AssistantStatus };
/** What AssistantService answers: general chat and document RAG. */
export type AssistantAnswer = Exclude<
  AssistantChatResponse,
  { mode: "workspace" }
>;
/** What the read-only workspace assistant answers; no model involved. */
export type WorkspaceAnswer = Extract<
  AssistantChatResponse,
  { mode: "workspace" }
>;

export interface AssistantGeneration {
  systemInstruction: string;
  userParts: string[];
  responseMimeType?: "application/json";
  responseJsonSchema?: unknown;
}

export interface AssistantProvider {
  readonly model: string;
  status(): AssistantStatus;
  generate(input: AssistantGeneration): Promise<string>;
}

export type AssistantFailure =
  | "not_configured"
  | "timeout"
  | "quota"
  | "authentication"
  | "unavailable"
  | "upstream";

// Only normalized failure categories cross the provider boundary.
/**
 * Which check refused a model answer that came back successfully. Internal
 * and log-only: a fixed code, never the answer text, so it is safe to write
 * down and says exactly which rule a 502 came from.
 */
export type AnswerRejection =
  | "answer_not_json"
  | "answer_not_object"
  | "answer_shape_invalid"
  | "citation_ids_duplicate"
  | "citation_ids_missing"
  | "source_marker_malformed"
  | "source_marker_missing"
  | "source_marker_mismatch"
  | "citation_not_in_evidence"
  | "unanswerable_with_citations"
  | "summary_section_unanswerable"
  | "summary_unanswerable";

export class AssistantError extends Error {
  constructor(
    readonly kind: AssistantFailure,
    readonly rejection?: AnswerRejection,
  ) {
    super("AI assistant request failed.");
  }
}
