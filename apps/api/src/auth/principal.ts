import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import type { PilotPrincipal, PilotAuthErrorCode } from "@examate/contracts";
import { uuid } from "./auth-config.js";

// This is a fail-closed shape check, not authentication. Controllers supply only
// req.principal populated by PilotAuthGuard; never DTO/header/query identity.
export function requirePrincipal(
  principal: PilotPrincipal | undefined,
): PilotPrincipal {
  if (
    !principal ||
    !uuid.test(principal.userId) ||
    !uuid.test(principal.workspaceId) ||
    !["manager", "member", "viewer"].includes(principal.role)
  ) {
    throw new UnauthorizedException({
      code: "AUTH_REQUIRED" satisfies PilotAuthErrorCode,
      message: "Bạn cần đăng nhập lại để tiếp tục nhé.",
    });
  }
  return principal;
}
export function requireTaskWrite(
  principal: PilotPrincipal | undefined,
): PilotPrincipal {
  const verified = requirePrincipal(principal);
  if (verified.role === "viewer")
    throw new ForbiddenException({
      code: "ROLE_FORBIDDEN" satisfies PilotAuthErrorCode,
      message:
        "Bạn đang có quyền xem. Nhờ thành viên hoặc người quản lý cập nhật công việc này nhé.",
    });
  return verified;
}
