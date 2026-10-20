import { describe, expect, it, vi } from "vitest";
import { BadRequestException } from "@nestjs/common";
import { WorkspaceSearchService } from "./workspace-search.service.js";
import type { DatabaseTransaction } from "../database/database.service.js";
import type { PilotPrincipal } from "@examate/contracts";

const principal: PilotPrincipal = {
  userId: "11111111-1111-4111-8111-111111111111",
  workspaceId: "22222222-2222-4222-8222-222222222222",
  role: "manager",
};

describe("WorkspaceSearchService", () => {
  it("authorizes on the same transaction and keeps an explicit workspace predicate on all six sources", async () => {
    const tx = {
      query: vi.fn(async () => ({ rows: [{ total: 0, items: [] }] })),
    } as unknown as DatabaseTransaction;
    const database = {
      workspaceTransaction: vi.fn(
        async (
          _principal: PilotPrincipal,
          work: (tx: DatabaseTransaction) => unknown,
        ) => work(tx),
      ),
      query: vi.fn(() => {
        throw new Error("search may not bypass workspaceTransaction");
      }),
    };
    const access = {
      authorize: vi.fn(async (_principal, _action, sameTx) => {
        expect(sameTx).toBe(tx);
        return principal;
      }),
    };
    const service = new WorkspaceSearchService(
      database as never,
      access as never,
    );

    const result = await service.search(principal, {
      q: "thuật-toán_%",
      kind: "all",
      sort: "label",
      direction: "desc",
      page: 2,
      pageSize: 12,
    });

    expect(result).toEqual({
      items: [],
      page: 2,
      pageSize: 12,
      total: 0,
      totalPages: 0,
    });
    expect(database.workspaceTransaction).toHaveBeenCalledWith(
      principal,
      expect.any(Function),
    );
    expect(access.authorize).toHaveBeenCalledTimes(1);
    expect(tx.query).toHaveBeenCalledTimes(1);
    expect(database.query).not.toHaveBeenCalled();
    const [sql, values] = vi.mocked(tx.query).mock.calls[0];
    expect(sql.match(/WHERE\s+[a-z]\.workspace_id\s*=\s*\$1/gi)).toHaveLength(
      6,
    );
    expect(sql).toContain("c.workspace_id = e.workspace_id");
    expect(sql).toContain("c.workspace_id = p.workspace_id");
    expect(sql).toContain("c.workspace_id = d.workspace_id");
    expect(sql).toContain("c.workspace_id = e.workspace_id");
    expect(sql).toContain("LIMIT $4 OFFSET $5");
    expect(sql).toContain("lower(label) DESC");
    expect(values).toEqual([
      principal.workspaceId,
      "%thuat toan%",
      "all",
      12,
      12,
    ]);
  });

  it("rejects a query folded to empty before opening a business workspace transaction", async () => {
    const database = {
      workspaceTransaction: vi.fn(async () => {
        throw new Error("unsupported query must not open a transaction");
      }),
      query: vi.fn(() => {
        throw new Error("search must not run a global query");
      }),
    };
    const access = { authorize: vi.fn() };
    const service = new WorkspaceSearchService(
      database as never,
      access as never,
    );
    let caught: unknown;
    try {
      await service.search(principal, { q: "你好" });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(BadRequestException);
    const badRequest = caught as BadRequestException;
    expect(badRequest.getStatus()).toBe(400);
    expect(badRequest.getResponse()).toEqual({
      code: "SEARCH_QUERY_UNSUPPORTED",
      message: "Từ khóa không có ký tự tìm kiếm phù hợp.",
    });
    expect(database.workspaceTransaction).not.toHaveBeenCalled();
    expect(database.query).not.toHaveBeenCalled();
    expect(access.authorize).not.toHaveBeenCalled();
  });
});
