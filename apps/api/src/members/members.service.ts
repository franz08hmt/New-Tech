import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import type {
  InviteWorkspaceMemberResponse,
  PilotPrincipal,
  PilotRole,
  UpdateWorkspaceMemberRequest,
  WorkspaceInvitation,
  WorkspaceMember,
  WorkspaceMemberErrorCode,
  WorkspaceMemberRequest,
  WorkspaceMembersResponse,
} from "@examate/contracts";
import { DatabaseService } from "../database/database.service.js";
import type { DatabaseTransaction } from "../database/database.service.js";
import { DocumentAccessService } from "../documents/document-access.service.js";

interface MemberRow {
  member_id: string;
  member_role: PilotRole;
  member_active: boolean;
  member_email: string | null;
  member_name: string | null;
  member_seen_at: Date | null;
  member_is_self: boolean;
}
interface RequestRow {
  request_id: string;
  request_email: string;
  request_name: string | null;
  request_seen_at: Date;
}
interface InvitationRow {
  invitation_id: string;
  invitation_email: string;
  invitation_role: PilotRole;
  invitation_created_at: Date;
  invitation_expires_at: Date;
}

const iso = (value: Date | string) => new Date(value).toISOString();

function problem(
  code: WorkspaceMemberErrorCode,
  message: string,
): { code: WorkspaceMemberErrorCode; message: string } {
  return { code, message };
}

/**
 * Member management is backed by migration 027. Until it is applied the page
 * still loads (`available: false`) and every change answers 503, so an older
 * database keeps working exactly as before.
 */
@Injectable()
export class MembersService {
  private installed: { value: boolean; until: number } | undefined;

  constructor(
    private readonly database: DatabaseService,
    private readonly access: DocumentAccessService,
  ) {}

  private async isInstalled(tx: DatabaseTransaction) {
    const now = Date.now();
    if (this.installed && this.installed.until > now)
      return this.installed.value;
    const result = await tx.query<{ ok: boolean }>(
      "SELECT to_regprocedure('public.examate_members_list()') IS NOT NULL AS ok",
    );
    const value = result.rows[0]?.ok === true;
    // A missing feature is rechecked soon so applying the migration needs no restart.
    this.installed = { value, until: now + (value ? 300_000 : 30_000) };
    return value;
  }

  private unavailable(): never {
    this.installed = undefined;
    throw new ServiceUnavailableException(
      problem(
        "MEMBERS_UNAVAILABLE",
        "Chức năng quản lý thành viên chưa được bật trên máy chủ này.",
      ),
    );
  }

  private translate(error: unknown): never {
    const code = (error as { code?: unknown })?.code;
    const message = (error as { message?: unknown })?.message;
    if (code === "42883" || code === "42P01") return this.unavailable();
    if (code === "P0001" && typeof message === "string")
      switch (message) {
        case "FORBIDDEN":
          throw new ForbiddenException(
            problem(
              "ROLE_FORBIDDEN",
              "Chỉ người quản lý workspace mới thay đổi được thành viên và quyền.",
            ),
          );
        case "LAST_MANAGER":
          throw new ConflictException(
            problem(
              "LAST_MANAGER",
              "Workspace phải còn ít nhất một người quản lý đang hoạt động.",
            ),
          );
        case "SELF_CHANGE":
          throw new ConflictException(
            problem(
              "SELF_CHANGE",
              "Bạn không thể tự tắt quyền của chính mình.",
            ),
          );
        case "ALREADY_MEMBER":
          throw new ConflictException(
            problem("ALREADY_MEMBER", "Người này đã là thành viên."),
          );
        case "NOT_FOUND":
          throw new NotFoundException(
            problem(
              "MEMBER_NOT_FOUND",
              "Không tìm thấy thành viên hoặc lời mời này.",
            ),
          );
        case "EMAIL_INVALID":
          throw new BadRequestException(
            problem("EMAIL_INVALID", "Địa chỉ email chưa hợp lệ."),
          );
        case "LIMIT_REACHED":
          throw new ConflictException(
            problem(
              "INVITATION_LIMIT",
              "Đã có 50 lời mời đang chờ. Hãy thu hồi bớt trước khi mời thêm.",
            ),
          );
        case "ROLE_INVALID":
          throw new BadRequestException(
            problem("ROLE_INVALID", "Vai trò không hợp lệ."),
          );
      }
    throw error;
  }

  /** Re-reads the caller's role inside the transaction, then insists on a manager. */
  private async asManager(
    principal: PilotPrincipal | undefined,
    tx: DatabaseTransaction,
  ) {
    const current = await this.access.authorize(principal, "read", tx);
    if (current.role !== "manager")
      throw new ForbiddenException(
        problem(
          "ROLE_FORBIDDEN",
          "Chỉ người quản lý workspace mới thay đổi được thành viên và quyền.",
        ),
      );
    if (!(await this.isInstalled(tx))) this.unavailable();
    return current;
  }

  async list(
    principal: PilotPrincipal | undefined,
  ): Promise<WorkspaceMembersResponse> {
    return this.database.workspaceTransaction(principal, async (tx) => {
      const current = await this.access.authorize(principal, "read", tx);
      const me = { userId: current.userId, role: current.role };
      if (!(await this.isInstalled(tx))) return { available: false, me };
      try {
        const members = await tx.query<MemberRow>(
          "SELECT * FROM public.examate_members_list()",
        );
        const manager = current.role === "manager";
        const requests = manager
          ? await tx.query<RequestRow>(
              "SELECT * FROM public.examate_member_requests()",
            )
          : { rows: [] as RequestRow[] };
        const invitations = manager
          ? await tx.query<InvitationRow>(
              "SELECT * FROM public.examate_invitations_list()",
            )
          : { rows: [] as InvitationRow[] };
        return {
          available: true as const,
          me,
          members: members.rows.map((row): WorkspaceMember => ({
            userId: row.member_id,
            role: row.member_role,
            active: row.member_active,
            displayName: row.member_name,
            email: row.member_email,
            lastSeenAt: row.member_seen_at ? iso(row.member_seen_at) : null,
            isSelf: row.member_is_self,
          })),
          requests: requests.rows.map((row): WorkspaceMemberRequest => ({
            userId: row.request_id,
            email: row.request_email,
            displayName: row.request_name,
            lastSeenAt: iso(row.request_seen_at),
          })),
          invitations: invitations.rows.map((row): WorkspaceInvitation => ({
            id: row.invitation_id,
            email: row.invitation_email,
            role: row.invitation_role,
            createdAt: iso(row.invitation_created_at),
            expiresAt: iso(row.invitation_expires_at),
          })),
        };
      } catch (error) {
        return this.translate(error);
      }
    });
  }

  async update(
    principal: PilotPrincipal | undefined,
    userId: string,
    input: UpdateWorkspaceMemberRequest,
  ) {
    if (input.role === undefined && input.active === undefined)
      throw new BadRequestException(
        problem("ROLE_INVALID", "Cần chọn vai trò hoặc trạng thái mới."),
      );
    return this.database.workspaceTransaction(principal, async (tx) => {
      await this.asManager(principal, tx);
      try {
        if (input.role !== undefined)
          await tx.query("SELECT public.examate_member_set_role($1,$2)", [
            userId,
            input.role,
          ]);
        if (input.active !== undefined)
          await tx.query("SELECT public.examate_member_set_active($1,$2)", [
            userId,
            input.active,
          ]);
      } catch (error) {
        this.translate(error);
      }
      return {
        userId,
        ...(input.role !== undefined ? { role: input.role } : {}),
        ...(input.active !== undefined ? { active: input.active } : {}),
      };
    });
  }

  async grant(
    principal: PilotPrincipal | undefined,
    userId: string,
    role: PilotRole,
  ) {
    return this.database.workspaceTransaction(principal, async (tx) => {
      await this.asManager(principal, tx);
      try {
        await tx.query("SELECT public.examate_member_grant($1,$2)", [
          userId,
          role,
        ]);
      } catch (error) {
        this.translate(error);
      }
      return { userId, role, active: true };
    });
  }

  async invite(
    principal: PilotPrincipal | undefined,
    email: string,
    role: PilotRole,
  ): Promise<InviteWorkspaceMemberResponse> {
    return this.database.workspaceTransaction(principal, async (tx) => {
      await this.asManager(principal, tx);
      try {
        const result = await tx.query<{ status: string }>(
          "SELECT public.examate_member_invite($1,$2) AS status",
          [email, role],
        );
        return {
          status: result.rows[0]
            .status as InviteWorkspaceMemberResponse["status"],
        };
      } catch (error) {
        return this.translate(error);
      }
    });
  }

  async revoke(principal: PilotPrincipal | undefined, invitationId: string) {
    return this.database.workspaceTransaction(principal, async (tx) => {
      await this.asManager(principal, tx);
      try {
        await tx.query("SELECT public.examate_invitation_revoke($1)", [
          invitationId,
        ]);
      } catch (error) {
        this.translate(error);
      }
      return { id: invitationId, revoked: true };
    });
  }
}
