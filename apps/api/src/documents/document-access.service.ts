import { ForbiddenException, Injectable } from "@nestjs/common";
import type { PilotPrincipal, PilotAuthErrorCode } from "@examate/contracts";
import { AuthStore } from "../auth/auth-store.js";
import {
  requireManager,
  requirePrincipal,
  requireRecordWrite,
} from "../auth/principal.js";
import type { DatabaseTransaction } from "../database/database.service.js";

type DocumentAction = "read" | "write" | "delete";

/** Request identity is supplied by the guard; long operations recheck membership
 * at side-effect boundaries, rather than caching a role at request start. */
@Injectable()
export class DocumentAccessService {
  constructor(private readonly auth: AuthStore) {}

  async authorize(
    principal: PilotPrincipal | undefined,
    action: DocumentAction = "read",
    tx?: DatabaseTransaction,
  ): Promise<PilotPrincipal> {
    const check =
      action === "delete"
        ? requireManager
        : action === "write"
          ? requireRecordWrite
          : requirePrincipal;
    const verified = check(principal);
    const role = await this.auth.membership(
      verified.workspaceId,
      verified.userId,
      tx,
    );
    if (!role)
      throw new ForbiddenException({
        code: "WORKSPACE_ACCESS_DENIED" satisfies PilotAuthErrorCode,
        message:
          "Bạn không còn quyền vào workspace này. Nhờ người quản lý kiểm tra lại nhé.",
      });
    return check({ ...verified, role });
  }
}
