import { useState, type FormEvent } from "react";
import {
  ArrowPathIcon,
  CheckIcon,
  MinusIcon,
  UserPlusIcon,
  UserGroupIcon,
} from "@heroicons/react/24/outline";
import type {
  InviteWorkspaceMemberResponse,
  PilotRole,
  WorkspaceMember,
} from "@examate/contracts";
import { Panel } from "./AcademicPanels";
import { WorkspaceRoleBadge } from "./WorkspaceBadges";
import { useLanguage, useTr } from "./i18n";
import { useMembers } from "./use-members";
import "./members-panel.css";

const ROLES: readonly PilotRole[] = ["manager", "member", "viewer"];

/** What each role may do, as the server enforces it. */
export const PERMISSIONS: ReadonlyArray<{
  label: string;
  allowed: Record<PilotRole, boolean>;
}> = [
  {
    label:
      "See courses, tasks, exams, revision items, expenses and shared documents",
    allowed: { manager: true, member: true, viewer: true },
  },
  {
    label: "Ask the Assistant and use Study Coach",
    allowed: { manager: true, member: true, viewer: true },
  },
  {
    label: "Add and edit tasks, exams, revision items and expenses",
    allowed: { manager: true, member: true, viewer: false },
  },
  {
    label: "Upload, index and re-assign shared documents",
    allowed: { manager: true, member: true, viewer: false },
  },
  {
    label: "Delete exams, revision items, expenses and documents",
    allowed: { manager: true, member: false, viewer: false },
  },
  {
    label: "See AI usage for the workspace",
    allowed: { manager: true, member: false, viewer: false },
  },
  {
    label: "Manage members and roles",
    allowed: { manager: true, member: false, viewer: false },
  },
];

function shortId(userId: string) {
  return userId.slice(0, 8);
}

export function MembersPanel() {
  const tr = useTr();
  const { mode } = useLanguage();
  const members = useMembers();
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<PilotRole>("member");
  const [grantRoles, setGrantRoles] = useState<Record<string, PilotRole>>({});
  const [notice, setNotice] = useState("");
  const data = members.data;
  const me = data?.me;
  const manager = me?.role === "manager";
  const locale = mode === "en" ? "en-GB" : "vi-VN";
  const when = (value: string | null) =>
    value ? new Date(value).toLocaleString(locale) : "—";

  const roleName = (role: PilotRole) =>
    role === "manager"
      ? tr("Manager")
      : role === "member"
        ? tr("Member")
        : tr("Viewer");
  const nameOf = (member: WorkspaceMember) =>
    member.displayName ||
    member.email ||
    tr("Member {id}", { id: shortId(member.userId) });

  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice("");
    const address = email.trim();
    const result = await members.invite(address, inviteRole);
    if (!result) return;
    setEmail("");
    setNotice(inviteNotice(result.status, address));
  }

  function inviteNotice(
    status: InviteWorkspaceMemberResponse["status"],
    address: string,
  ) {
    if (status === "granted")
      return tr("{email} had already signed in and now has access.", {
        email: address,
      });
    if (status === "reactivated")
      return tr("{email} has access again.", { email: address });
    return tr(
      "Invitation saved for {email}. They join as soon as they sign in with that address.",
      { email: address },
    );
  }

  return (
    <>
      <Panel title={tr("Your access")} icon={<UserGroupIcon />}>
        {me ? (
          <p className="members-self">
            <WorkspaceRoleBadge role={me.role} />
            <span>
              {me.role === "manager"
                ? tr(
                    "You can manage members and roles, and you can change or delete shared records.",
                  )
                : me.role === "member"
                  ? tr(
                      "You can add and edit shared records and documents. Only a manager can delete them or change roles.",
                    )
                  : tr(
                      "You can read everything shared in this workspace. Ask a manager if you need to edit.",
                    )}
            </span>
          </p>
        ) : members.loading ? (
          <p role="status" aria-busy="true" className="empty-message">
            {tr("Loading members…")}
          </p>
        ) : null}
        <div className="members-scroll">
          <table className="members-matrix">
            <caption>{tr("What each role can do")}</caption>
            <thead>
              <tr>
                <th scope="col">{tr("Action")}</th>
                {ROLES.map((role) => (
                  <th scope="col" key={role} data-current={me?.role === role}>
                    {roleName(role)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PERMISSIONS.map((row) => (
                <tr key={row.label}>
                  <th scope="row">{tr(row.label)}</th>
                  {ROLES.map((role) => (
                    <td key={role} data-current={me?.role === role}>
                      {row.allowed[role] ? (
                        <>
                          <CheckIcon aria-hidden="true" />
                          <span className="sr-only">{tr("Allowed")}</span>
                        </>
                      ) : (
                        <>
                          <MinusIcon
                            className="members-no"
                            aria-hidden="true"
                          />
                          <span className="sr-only">{tr("Not allowed")}</span>
                        </>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="members-scope">
          <p>
            <strong>{tr("Shared by the whole group")}</strong>{" "}
            {tr(
              "Courses, tasks, exams, revision plans, expenses and uploaded documents. Every active member sees what the others upload.",
            )}
          </p>
          <p>
            <strong>{tr("Private to each person")}</strong>{" "}
            {tr(
              "Assistant conversations, Study Coach quizzes and flashcards, and your own quick notes.",
            )}
          </p>
        </div>
      </Panel>

      <Panel title={tr("Group members")} icon={<UserGroupIcon />}>
        {members.error && (
          <p role="alert" className="error-message">
            {tr(members.error)}
            <button
              type="button"
              className="text-button"
              onClick={() => {
                members.clearError();
                void members.reload();
              }}
            >
              <ArrowPathIcon /> {tr("Reload members")}
            </button>
          </p>
        )}
        {notice && (
          <p role="status" className="page-note">
            {notice}
          </p>
        )}
        {data && !data.available && (
          <p role="status" className="page-note">
            {tr(
              "Member management is not switched on for this server yet. The roles above still apply; ask the person who runs the server to apply the members update.",
            )}
          </p>
        )}
        {data?.available && (
          <>
            <ul className="members-list" aria-busy={members.loading}>
              {data.members.map((member) => (
                <li
                  key={member.userId}
                  data-active={member.active}
                  data-self={member.isSelf}
                >
                  <div className="members-identity">
                    <strong>{nameOf(member)}</strong>
                    {member.isSelf && (
                      <span className="members-you">{tr("You")}</span>
                    )}
                    {manager && member.email && member.displayName && (
                      <span className="members-email">{member.email}</span>
                    )}
                    <span className="members-meta">
                      {member.active ? tr("Active") : tr("Switched off")}
                      {" · "}
                      {tr("Last seen")} {when(member.lastSeenAt)}
                    </span>
                  </div>
                  {manager ? (
                    <div className="members-controls">
                      <label>
                        <span className="sr-only">
                          {tr("Role of {name}", { name: nameOf(member) })}
                        </span>
                        <select
                          value={member.role}
                          disabled={members.busy}
                          aria-label={tr("Role of {name}", {
                            name: nameOf(member),
                          })}
                          onChange={(event) =>
                            void members.update(member.userId, {
                              role: event.target.value as PilotRole,
                            })
                          }
                        >
                          {ROLES.map((role) => (
                            <option key={role} value={role}>
                              {roleName(role)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        type="button"
                        className="secondary-button"
                        disabled={members.busy || member.isSelf}
                        onClick={() =>
                          void members.update(member.userId, {
                            active: !member.active,
                          })
                        }
                      >
                        {member.active
                          ? tr("Switch off")
                          : tr("Switch back on")}
                      </button>
                    </div>
                  ) : (
                    <WorkspaceRoleBadge role={member.role} />
                  )}
                </li>
              ))}
            </ul>
            {manager && (
              <>
                {data.requests.length > 0 && (
                  <section
                    className="members-block"
                    aria-label={tr("Signed in and waiting for access")}
                  >
                    <h3>{tr("Signed in and waiting for access")}</h3>
                    <ul className="members-list">
                      {data.requests.map((request) => (
                        <li key={request.userId}>
                          <div className="members-identity">
                            <strong>
                              {request.displayName || request.email}
                            </strong>
                            {request.displayName && (
                              <span className="members-email">
                                {request.email}
                              </span>
                            )}
                            <span className="members-meta">
                              {tr("Last seen")} {when(request.lastSeenAt)}
                            </span>
                          </div>
                          <div className="members-controls">
                            <select
                              value={grantRoles[request.userId] ?? "viewer"}
                              disabled={members.busy}
                              aria-label={tr("Role for {name}", {
                                name: request.displayName || request.email,
                              })}
                              onChange={(event) =>
                                setGrantRoles({
                                  ...grantRoles,
                                  [request.userId]: event.target
                                    .value as PilotRole,
                                })
                              }
                            >
                              {ROLES.map((role) => (
                                <option key={role} value={role}>
                                  {roleName(role)}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              className="primary-button"
                              disabled={members.busy}
                              onClick={() =>
                                void members.grant(
                                  request.userId,
                                  grantRoles[request.userId] ?? "viewer",
                                )
                              }
                            >
                              {tr("Give access")}
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                <section
                  className="members-block"
                  aria-label={tr("Add a member")}
                >
                  <h3>{tr("Add a member")}</h3>
                  <p className="page-note">
                    {tr(
                      "Enter the e-mail address they sign in with. They join with the role you pick as soon as they sign in; nothing is sent by e-mail.",
                    )}
                  </p>
                  <form
                    className="members-invite"
                    onSubmit={(e) => void invite(e)}
                  >
                    <label>
                      {tr("E-mail address")}
                      <input
                        type="email"
                        required
                        maxLength={254}
                        autoComplete="off"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        placeholder="ten@example.com"
                      />
                    </label>
                    <label>
                      {tr("Role")}
                      <select
                        value={inviteRole}
                        onChange={(event) =>
                          setInviteRole(event.target.value as PilotRole)
                        }
                      >
                        {ROLES.map((role) => (
                          <option key={role} value={role}>
                            {roleName(role)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      className="primary-button"
                      disabled={members.busy || !email.trim()}
                    >
                      <UserPlusIcon />
                      {members.busy ? tr("Saving…") : tr("Add member")}
                    </button>
                  </form>
                </section>

                {data.invitations.length > 0 && (
                  <section
                    className="members-block"
                    aria-label={tr("Invitations waiting")}
                  >
                    <h3>{tr("Invitations waiting")}</h3>
                    <ul className="members-list">
                      {data.invitations.map((invitation) => (
                        <li key={invitation.id}>
                          <div className="members-identity">
                            <strong>{invitation.email}</strong>
                            <span className="members-meta">
                              {tr("Expires")} {when(invitation.expiresAt)}
                            </span>
                          </div>
                          <div className="members-controls">
                            <WorkspaceRoleBadge role={invitation.role} />
                            <button
                              type="button"
                              className="secondary-button"
                              disabled={members.busy}
                              aria-label={tr("Revoke invitation for {email}", {
                                email: invitation.email,
                              })}
                              onClick={() => void members.revoke(invitation.id)}
                            >
                              {tr("Revoke")}
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
              </>
            )}
          </>
        )}
        {!data && members.loading && (
          <p role="status" aria-busy="true" className="empty-message">
            {tr("Loading members…")}
          </p>
        )}
      </Panel>
    </>
  );
}
