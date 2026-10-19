import { describe, expect, it, vi } from "vitest";
import { AiUsageService, classifyAiOutcome } from "./ai-usage.service.js";

const principal = {
  userId: "11111111-1111-4111-8111-111111111111",
  workspaceId: "22222222-2222-4222-8222-222222222222",
  role: "member" as const,
};
const descriptor = {
  operation: "assistant_question" as const,
  mode: "documents" as const,
  prompt: { id: "assistant.documents.question" as const, version: "rag-v1" },
};

function fixture(failPersist = false) {
  const calls: Array<{ sql: string; values: unknown[] }> = [];
  const tx = {
    query: vi.fn(async (sql: string, values: unknown[] = []) => {
      calls.push({ sql, values });
      if (failPersist)
        throw Object.assign(new Error("secret sentinel"), { code: "XX001" });
      return { rows: [], rowCount: 1 };
    }),
  };
  const database = {
    workspaceTransaction: vi.fn(
      async (candidate: unknown, work: (tx: unknown) => Promise<unknown>) => {
        expect(candidate).toBe(principal);
        return work(tx);
      },
    ),
  };
  const access = {
    authorize: vi.fn(
      async (_candidate: unknown, action: string, sameTx: unknown) => {
        expect(action).toBe("read");
        expect(sameTx).toBe(tx);
        return principal;
      },
    ),
  };
  return {
    service: new AiUsageService(database as never, access as never),
    calls,
    tx,
    database,
    access,
  };
}

describe("AiUsageService", () => {
  it("persists one scoped operation and each provider attempt without request content", async () => {
    const f = fixture();
    const result = await f.service.runOperation(
      principal,
      descriptor,
      async () => {
        const generation = f.service.startProviderCall({
          type: "generation",
          provider: "google",
          model: "gemini-2.5-flash",
          prompt: descriptor.prompt,
        });
        f.service.finishProviderCall(generation, "success", {
          promptTokenCount: 1_000_000,
          totalTokenCount: 1_000_010,
        });
        const embed = f.service.startProviderCall({
          type: "embedding_query",
          provider: "google",
          model: "gemini-embedding-001",
        });
        f.service.finishProviderCall(embed, "success");
        return "document/private/question sentinel";
      },
    );

    expect(result).toBe("document/private/question sentinel");
    expect(f.database.workspaceTransaction).toHaveBeenCalledOnce();
    expect(f.access.authorize).toHaveBeenCalledOnce();
    expect(f.calls).toHaveLength(3);
    expect(f.calls[1].sql).toContain("INSERT INTO public.ai_usage_operations");
    expect(f.calls[1].values.slice(2, 10)).toEqual([
      principal.workspaceId,
      principal.userId,
      "assistant_question",
      "documents",
      "assistant.documents.question",
      "rag-v1",
      "success",
      2,
    ]);
    const savedCalls = JSON.parse(String(f.calls[2].values[0])) as Array<
      Record<string, unknown>
    >;
    expect(savedCalls).toHaveLength(2);
    expect(savedCalls[0]).toMatchObject({
      model: "gemini-2.5-flash",
      call_type: "generation",
      outcome: "success",
      usage_status: "complete",
      input_tokens: 1_000_000,
      output_tokens: 10,
      total_tokens: 1_000_010,
      cost_status: "estimated",
      currency: "USD",
    });
    expect(savedCalls[1]).toMatchObject({
      call_type: "embedding_query",
      usage_status: "missing",
      input_tokens: null,
      total_tokens: null,
      cost_status: "unknown_usage",
      estimated_cost: null,
    });
    expect(JSON.stringify(f.calls)).not.toContain(
      "document/private/question sentinel",
    );
  });

  it("records provider success separately when application validation rejects the answer", async () => {
    const f = fixture();
    const rejection = Object.assign(new Error("private answer"), {
      rejection: "citation_invalid",
    });
    await expect(
      f.service.runOperation(principal, descriptor, async () => {
        const call = f.service.startProviderCall({
          type: "generation",
          provider: "google",
          model: "gemini-2.5-flash",
          prompt: descriptor.prompt,
        });
        f.service.finishProviderCall(call, "success", {
          promptTokenCount: 10,
          totalTokenCount: 15,
        });
        throw rejection;
      }),
    ).rejects.toBe(rejection);
    const operation = f.calls[1].values;
    const calls = JSON.parse(String(f.calls[2].values[0])) as Array<
      Record<string, unknown>
    >;
    expect(operation[8]).toBe("rejected");
    expect(calls[0].outcome).toBe("success");
    expect(JSON.stringify(f.calls)).not.toContain("private answer");
  });

  it("uses the sanitized provider model version for pricing and persistence", async () => {
    const f = fixture();
    await f.service.runOperation(principal, descriptor, async () => {
      const call = f.service.startProviderCall({
        type: "generation",
        provider: "google",
        model: "gemini-2.5-flash",
      });
      f.service.updateProviderModel(call, "gemini-2.5-flash-001");
      f.service.finishProviderCall(call, "success", {
        promptTokenCount: 10,
        totalTokenCount: 15,
      });
      return "synthetic answer";
    });
    const calls = JSON.parse(String(f.calls[2].values[0])) as Array<
      Record<string, unknown>
    >;
    expect(calls[0]).toMatchObject({
      model: "gemini-2.5-flash-001",
      cost_status: "unknown_price",
      estimated_cost: null,
    });
  });

  it("stores zero provider calls for a workspace SQL operation without inventing usage", async () => {
    const f = fixture();
    await f.service.runOperation(
      principal,
      { operation: "assistant_course_info", mode: "workspace" },
      async () => "workspace result",
    );
    expect(f.calls).toHaveLength(2);
    expect(f.calls[0].sql).toContain("SET LOCAL statement_timeout");
    expect(f.calls[1].values[8]).toBe("success");
    expect(f.calls[1].values[9]).toBe(0);
  });

  it("keeps a missing-final-usage stream outcome unknown", async () => {
    const f = fixture();
    await f.service.runOperation(principal, descriptor, async () => {
      const stream = f.service.startProviderCall({
        type: "generation_stream",
        provider: "google",
        model: "gemini-2.5-flash",
        prompt: descriptor.prompt,
      });
      f.service.finishProviderCall(stream, "unknown");
      return "answer delivered, provider usage absent";
    });
    expect(f.calls[1].values[8]).toBe("unknown");
    const calls = JSON.parse(String(f.calls[2].values[0])) as Array<
      Record<string, unknown>
    >;
    expect(calls[0]).toMatchObject({
      outcome: "unknown",
      usage_status: "missing",
      input_tokens: null,
      output_tokens: null,
      total_tokens: null,
    });
  });

  it("classifies the existing OCR timeout code without recording raw errors", () => {
    expect(classifyAiOutcome({ code: "OCR_TIMEOUT" })).toBe("timeout");
  });

  it("does not fabricate attribution for direct calls without a principal", async () => {
    const f = fixture();
    await expect(
      f.service.runOperation(undefined, descriptor, async () => "ok"),
    ).resolves.toBe("ok");
    expect(f.database.workspaceTransaction).not.toHaveBeenCalled();
  });

  it("does not alter an already determined answer when telemetry persistence fails", async () => {
    const f = fixture(true);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await expect(
      f.service.runOperation(
        principal,
        descriptor,
        async () => "still returned",
      ),
    ).resolves.toBe("still returned");
    expect(log).toHaveBeenCalledOnce();
    const serialized = String(log.mock.calls[0][0]);
    expect(serialized).toContain("ai.usage.persistence_failed");
    expect(serialized).not.toContain("secret sentinel");
    expect(serialized).not.toContain("still returned");
    log.mockRestore();
  });

  it("does not let telemetry logging failure replace the business result", async () => {
    const f = fixture(true);
    const log = vi.spyOn(console, "log").mockImplementation(() => {
      throw new Error("synthetic logger failure");
    });
    await expect(
      f.service.runOperation(
        principal,
        descriptor,
        async () => "business result",
      ),
    ).resolves.toBe("business result");
    log.mockRestore();
  });
});
