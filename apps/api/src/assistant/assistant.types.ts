import type {
  AssistantChatResponse,
  AssistantStatus,
} from "@examate/contracts";

export type { AssistantStatus };
export type AssistantAnswer = AssistantChatResponse;

export interface AssistantGeneration {
  systemInstruction: string;
  userParts: string[];
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
export class AssistantError extends Error {
  constructor(readonly kind: AssistantFailure) {
    super("AI assistant request failed.");
  }
}
