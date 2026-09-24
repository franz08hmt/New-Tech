import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { AssistantChatDto } from "./assistant-chat.dto.js";
import { AssistantController } from "./assistant.controller.js";
import { AssistantService } from "./assistant.service.js";
import type { AssistantProvider, AssistantStatus } from "./assistant.types.js";

function fixture(status: AssistantStatus) {
  const provider: AssistantProvider = {
    model: "gemini-2.5-flash",
    status: () => status,
    generate: vi.fn().mockResolvedValue("Study in small steps."),
  };
  const service = new AssistantService(provider);
  return { service, controller: new AssistantController(service) };
}

const common = {
  provider: "google",
  mode: "llm",
  ragEnabled: false,
  credentialsExposedToClient: false,
} as const;

describe("AssistantController", () => {
  it.each([
    { ...common, status: "not_configured" as const },
    { ...common, status: "ready" as const, model: "gemini-2.5-flash" },
  ])("reports $status without credentials", (status) => {
    expect(fixture(status).controller.status()).toEqual(status);
  });

  it("delegates the transformed DTO to the service", async () => {
    const { service, controller } = fixture({
      ...common,
      status: "not_configured",
    });
    const chat = vi.spyOn(service, "chat");
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    });
    const input: AssistantChatDto = await pipe.transform(
      {
        message: "  Help me study  ",
        pageContext: { pageId: "tasks", pageName: "Tasks" },
      },
      { type: "body", metatype: AssistantChatDto },
    );
    await expect(controller.chat(input)).resolves.toEqual({
      answer: "Study in small steps.",
      provider: "google",
      model: "gemini-2.5-flash",
      ragEnabled: false,
    });
    expect(input).toBeInstanceOf(AssistantChatDto);
    expect(chat).toHaveBeenCalledWith({
      message: "Help me study",
      pageContext: { pageId: "tasks", pageName: "Tasks" },
    });
  });
});
