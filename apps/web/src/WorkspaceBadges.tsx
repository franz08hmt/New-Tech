import {
  ArrowPathIcon,
  CheckCircleIcon,
  ClockIcon,
  EyeIcon,
  ShieldCheckIcon,
  UserGroupIcon,
} from "@heroicons/react/24/outline";
import type { PilotPrincipal, TaskStatus } from "@examate/contracts";
import { useTr } from "./i18n";
import "./workspace-badges.css";

const roles = {
  manager: { label: "Manager · Người quản lý", Icon: ShieldCheckIcon },
  member: { label: "Member · Thành viên", Icon: UserGroupIcon },
  viewer: { label: "Viewer · Chỉ xem", Icon: EyeIcon },
};

/** Presentation only: the role comes from the already verified session. */
export function WorkspaceRoleBadge({ role }: { role: PilotPrincipal["role"] }) {
  const tr = useTr();
  const { label, Icon } = roles[role];
  return (
    <span className="workspace-role-badge" data-role={role}>
      <Icon aria-hidden="true" />
      <span>{tr(label)}</span>
    </span>
  );
}

const statuses = {
  todo: { label: "Chưa làm", Icon: ClockIcon },
  in_progress: { label: "Đang làm", Icon: ArrowPathIcon },
  done: { label: "Hoàn thành", Icon: CheckCircleIcon },
};

/** The server's task status remains the only source of truth. */
export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  const tr = useTr();
  const { label, Icon } = statuses[status];
  return (
    <span className="task-status-badge" data-status={status}>
      <Icon aria-hidden="true" />
      <span>{tr(label)}</span>
    </span>
  );
}
