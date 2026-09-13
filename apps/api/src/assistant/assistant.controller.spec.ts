import { describe, expect, it } from "vitest";
import { AssistantController } from "./assistant.controller.js";

describe("AssistantController", () => {
  it("reports the safe fallback while AI is disabled", () => {
    const controller = new AssistantController();

    expect(controller.status()).toEqual(
      expect.objectContaining({
        status: "not_configured",
        mode: "preview",
        credentialsExposedToClient: false,
        fallback: "tasks_and_documents",
      }),
    );
  });
});
