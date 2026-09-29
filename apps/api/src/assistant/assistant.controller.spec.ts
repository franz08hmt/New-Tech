import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { AssistantChatDto } from "./assistant-chat.dto.js";
import { AssistantController } from "./assistant.controller.js";
import { AssistantService } from "./assistant.service.js";
import type { AssistantProvider, AssistantStatus } from "./assistant.types.js";
import type { WorkspaceAssistantService } from "./workspace-assistant.service.js";

function fixture(status: AssistantStatus) {
  const provider: AssistantProvider = {
    model: "gemini-2.5-flash",
    status: () => status,
    generate: vi.fn().mockResolvedValue(
      JSON.stringify({
        answerable: true,
        answer: "Study in small steps [S1].",
        citationIds: ["S1"],
      }),
    ),
  };
  const retrieval = {
    retrieve: vi.fn().mockResolvedValue({
      promptVersion: "rag-v1",
      context: "evidence",
      evidence: [],
      citations: [
        {
          sourceId: "S1",
          chunkId: "11111111-1111-4111-8111-111111111111",
          documentId: "22222222-2222-4222-8222-222222222222",
          title: "study.pdf",
          page: 1,
          chunkIndex: 0,
        },
      ],
    }),
  };
  const service = new AssistantService(provider, retrieval as never);
  const workspace = {
    chat: vi.fn().mockResolvedValue({ mode: "workspace" }),
  };
  return {
    service,
    provider,
    workspace,
    controller: new AssistantController(
      service,
      workspace as unknown as WorkspaceAssistantService,
    ),
  };
}

const common = {
  provider: "google",
  modes: ["general", "documents"],
  ragEnabled: true,
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
      answer: "Study in small steps [S1].",
      answerable: true,
      reasonCode: "ANSWER_GENERATED",
      citations: [
        {
          sourceId: "S1",
          chunkId: "11111111-1111-4111-8111-111111111111",
          documentId: "22222222-2222-4222-8222-222222222222",
          title: "study.pdf",
          page: 1,
          chunkIndex: 0,
        },
      ],
      provider: "google",
      model: "gemini-2.5-flash",
      mode: "documents",
      ragEnabled: true,
      promptVersion: "rag-v1",
    });
    expect(input).toBeInstanceOf(AssistantChatDto);
    expect(chat).toHaveBeenCalledWith({
      message: "Help me study",
      pageContext: { pageId: "tasks", pageName: "Tasks" },
    });
  });

  it("accepts both modes, rejects an unknown mode, and allows legacy requests", async () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    });
    await expect(
      pipe.transform(
        { message: "General question", mode: "general" },
        { type: "body", metatype: AssistantChatDto },
      ),
    ).resolves.toMatchObject({ mode: "general" });
    await expect(
      pipe.transform(
        { message: "Legacy document question" },
        { type: "body", metatype: AssistantChatDto },
      ),
    ).resolves.toMatchObject({ message: "Legacy document question" });
    await expect(
      pipe.transform(
        { message: "Bad mode", mode: "anything" },
        { type: "body", metatype: AssistantChatDto },
      ),
    ).rejects.toThrow();
    await expect(
      pipe.transform(
        { message: "Task nào chưa xong?", mode: "workspace" },
        { type: "body", metatype: AssistantChatDto },
      ),
    ).resolves.toMatchObject({ mode: "workspace" });
  });

  it("answers workspace questions from the workspace service, never the model", async () => {
    const { service, provider, workspace, controller } = fixture({
      ...common,
      status: "ready",
      model: "gemini-2.5-flash",
    });
    const chat = vi.spyOn(service, "chat");
    const input = {
      message: "Task nào chưa xong?",
      mode: "workspace" as const,
    };

    await expect(controller.chat(input)).resolves.toEqual({
      mode: "workspace",
    });
    expect(workspace.chat).toHaveBeenCalledWith(input);
    expect(chat).not.toHaveBeenCalled();
    expect(provider.generate).not.toHaveBeenCalled();
  });

  it("keeps general and document questions on the existing service", async () => {
    const { service, workspace, controller } = fixture({
      ...common,
      status: "ready",
      model: "gemini-2.5-flash",
    });
    const chat = vi.spyOn(service, "chat");
    await controller.chat({ message: "Study tips?", mode: "general" });
    await controller.chat({ message: "What is due?", mode: "documents" });
    await controller.chat({ message: "Legacy request" });

    expect(chat).toHaveBeenCalledTimes(3);
    expect(workspace.chat).not.toHaveBeenCalled();
  });
});
