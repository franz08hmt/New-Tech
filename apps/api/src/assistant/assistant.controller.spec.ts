import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { AssistantChatDto } from "./assistant-chat.dto.js";
import { AssistantController } from "./assistant.controller.js";
import { AssistantService } from "./assistant.service.js";
import { DocumentAccessService } from "../documents/document-access.service.js";
import type { AssistantProvider, AssistantStatus } from "./assistant.types.js";
import type { WorkspaceAssistantService } from "./workspace-assistant.service.js";
import type { AnswerReceiptService } from "./answer-receipt.service.js";
const principal = {
  userId: "11111111-1111-4111-8111-111111111111",
  workspaceId: "22222222-2222-4222-8222-222222222222",
  role: "member" as const,
};

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
    generateStream: vi.fn(async function* () {
      yield "A live general answer arrives ";
      yield "in multiple chunks.";
    }),
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
  const service = new AssistantService(
    provider,
    retrieval as never,
    new DocumentAccessService({
      membership: vi.fn().mockResolvedValue("member"),
    } as never),
  );
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
      {
        verifyHistory: vi.fn().mockResolvedValue(undefined),
        issue: vi
          .fn()
          .mockResolvedValue("77777777-7777-4777-8777-777777777777"),
      } as unknown as AnswerReceiptService,
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
    await expect(
      controller.chat(input, { principal } as never),
    ).resolves.toEqual({
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
    expect(chat).toHaveBeenCalledWith(
      {
        message: "Help me study",
        pageContext: { pageId: "tasks", pageName: "Tasks" },
      },
      principal,
    );
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

    await expect(
      controller.chat(input, { principal } as never),
    ).resolves.toEqual({
      mode: "workspace",
    });
    expect(workspace.chat).toHaveBeenCalledWith(input, principal);
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
    await controller.chat({ message: "Study tips?", mode: "general" }, {
      principal,
    } as never);
    await controller.chat({ message: "What is due?", mode: "documents" }, {
      principal,
    } as never);
    await controller.chat({ message: "Legacy request" }, {
      principal,
    } as never);

    expect(chat).toHaveBeenCalledTimes(3);
    expect(workspace.chat).not.toHaveBeenCalled();
  });

  it("writes SSE deltas and the final answer receipt without changing the JSON route", async () => {
    const { controller, provider } = fixture({
      ...common,
      status: "ready",
      model: "gemini-2.5-flash",
    });
    class FakeResponse extends EventEmitter {
      statusCode = 0;
      writableEnded = false;
      destroyed = false;
      readonly headers = new Map<string, string>();
      readonly chunks: string[] = [];
      status(code: number) {
        this.statusCode = code;
        return this;
      }
      setHeader(name: string, value: string) {
        this.headers.set(name, value);
      }
      write(chunk: string) {
        this.chunks.push(chunk);
        return true;
      }
      flushHeaders() {}
      end() {
        this.writableEnded = true;
      }
    }
    const response = new FakeResponse();
    const request = Object.assign(new EventEmitter(), { principal });

    await controller.streamChat(
      { message: "Give me a study plan", mode: "general" },
      request as never,
      response as never,
    );

    const events = response.chunks.map((chunk) =>
      JSON.parse(chunk.replace(/^data: /, "").trim()),
    );
    expect(response.statusCode).toBe(200);
    expect(response.headers.get("Content-Type")).toBe(
      "text/event-stream; charset=utf-8",
    );
    expect(response.headers.get("X-Accel-Buffering")).toBe("no");
    expect(events.map((event) => event.type)).toEqual([
      "start",
      "status",
      "delta",
      "delta",
      "done",
    ]);
    expect(events[1]).toEqual({ type: "status", stage: "generating" });
    expect(events[2].text).toBe("A live general answer arrives ");
    expect(events[4]).toMatchObject({
      type: "done",
      answerId: "77777777-7777-4777-8777-777777777777",
      response: {
        mode: "general",
        answer: "A live general answer arrives in multiple chunks.",
      },
    });
    expect(provider.generateStream).toHaveBeenCalledOnce();
  });

  it("aborts generation and does not send a done event after the client disconnects", async () => {
    const { controller, provider } = fixture({
      ...common,
      status: "ready",
      model: "gemini-2.5-flash",
    });
    class DisconnectingResponse extends EventEmitter {
      writableEnded = false;
      destroyed = false;
      readonly chunks: string[] = [];
      status() {
        return this;
      }
      setHeader() {}
      write(chunk: string) {
        this.chunks.push(chunk);
        if (chunk.includes('"type":"delta"')) {
          this.destroyed = true;
          this.emit("close");
        }
        return true;
      }
      flushHeaders() {}
      end() {
        this.writableEnded = true;
      }
    }
    const response = new DisconnectingResponse();
    const request = Object.assign(new EventEmitter(), { principal });

    await controller.streamChat(
      { message: "Give me a study plan", mode: "general" },
      request as never,
      response as never,
    );

    expect(vi.mocked(provider.generateStream!).mock.calls[0][1]?.aborted).toBe(
      true,
    );
    const events = response.chunks.map((chunk) =>
      JSON.parse(chunk.replace(/^data: /, "").trim()),
    );
    expect(events.map((event) => event.type)).toEqual([
      "start",
      "status",
      "delta",
    ]);
  });

  it("streams document RAG while removing unverified citation markers from live deltas", async () => {
    const { controller, provider, workspace, service } = fixture({
      ...common,
      status: "ready",
      model: "gemini-2.5-flash",
    });
    vi.mocked(provider.generateStream!).mockImplementationOnce(
      async function* () {
        yield '{"answerable":true,"answer":"Study in small steps ';
        yield "[S1].";
        yield '","citationIds":["S1"]}';
      },
    );
    class FakeResponse extends EventEmitter {
      writableEnded = false;
      destroyed = false;
      readonly chunks: string[] = [];
      status() {
        return this;
      }
      setHeader() {}
      write(chunk: string) {
        this.chunks.push(chunk);
        return true;
      }
      flushHeaders() {}
      end() {
        this.writableEnded = true;
      }
    }
    const response = new FakeResponse();
    const request = Object.assign(new EventEmitter(), { principal });
    await controller.streamChat(
      { message: "How should I study?", mode: "documents" },
      request as never,
      response as never,
    );
    const events = response.chunks.map((chunk) =>
      JSON.parse(chunk.replace(/^data: /, "").trim()),
    );
    expect(events.map((event) => event.type)).toEqual([
      "start",
      "status",
      "status",
      "delta",
      "delta",
      "done",
    ]);
    expect(events.slice(1, 3)).toEqual([
      { type: "status", stage: "retrieving" },
      { type: "status", stage: "generating" },
    ]);
    expect(events[3].text + events[4].text).toBe("Study in small steps .");
    expect(events[5]).toMatchObject({
      type: "done",
      response: {
        mode: "documents",
        answer: "Study in small steps [S1].",
        citations: [{ sourceId: "S1", title: "study.pdf" }],
      },
    });
    expect(workspace.chat).not.toHaveBeenCalled();
  });

  it("streams workspace lookups as progress plus the complete read-only result", async () => {
    const { controller, workspace } = fixture({
      ...common,
      status: "ready",
      model: "gemini-2.5-flash",
    });
    workspace.chat.mockResolvedValueOnce({
      answer: "There are 2 open tasks.",
      answerable: true,
      reasonCode: "WORKSPACE_ANSWER",
      citations: [],
      provider: "workspace",
      model: "database",
      mode: "workspace",
      ragEnabled: false,
      promptVersion: "workspace-v1",
      workspaceIntent: "tasks_open",
      workspaceSources: [],
      asOf: "2026-10-18",
    });
    class FakeResponse extends EventEmitter {
      writableEnded = false;
      destroyed = false;
      readonly chunks: string[] = [];
      status() {
        return this;
      }
      setHeader() {}
      write(chunk: string) {
        this.chunks.push(chunk);
        return true;
      }
      flushHeaders() {}
      end() {
        this.writableEnded = true;
      }
    }
    const response = new FakeResponse();
    const request = Object.assign(new EventEmitter(), { principal });
    await controller.streamChat(
      { message: "What tasks are open?", mode: "workspace" },
      request as never,
      response as never,
    );
    const events = response.chunks.map((chunk) =>
      JSON.parse(chunk.replace(/^data: /, "").trim()),
    );
    expect(events.map((event) => event.type)).toEqual([
      "start",
      "status",
      "done",
    ]);
    expect(events[1]).toEqual({
      type: "status",
      stage: "querying_workspace",
    });
    expect(events[2].response).toMatchObject({
      mode: "workspace",
      answer: "There are 2 open tasks.",
    });
    expect(workspace.chat).toHaveBeenCalledOnce();
  });

  it("rejects non-question operations before opening an SSE response", async () => {
    const { controller, provider } = fixture({
      ...common,
      status: "ready",
      model: "gemini-2.5-flash",
    });
    const response = {
      status: vi.fn().mockReturnThis(),
      setHeader: vi.fn(),
      write: vi.fn(),
      end: vi.fn(),
      on: vi.fn().mockReturnThis(),
      off: vi.fn().mockReturnThis(),
      writableEnded: false,
      destroyed: false,
    };
    await expect(
      controller.streamChat(
        {
          message: "Summarize this PDF",
          mode: "documents",
          operation: "summarize",
          documentId: "22222222-2222-4222-8222-222222222222",
        },
        { principal } as never,
        response as never,
      ),
    ).rejects.toMatchObject({ status: 400 });
    expect(response.status).not.toHaveBeenCalled();
    expect(provider.generateStream).not.toHaveBeenCalled();
  });
});
