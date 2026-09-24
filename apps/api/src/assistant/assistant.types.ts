export type AssistantStatus = {
  provider: "google";
  mode: "llm";
  ragEnabled: false;
  credentialsExposedToClient: false;
} & ({ status: "ready"; model: string } | { status: "not_configured" });

export interface AssistantAnswer {
  answer: string;
  provider: "google";
  model: string;
  ragEnabled: false;
}

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
