import { uuid } from "../dist/auth/auth-config.js";
import {
  isMain,
  pilotConnection,
  PilotCliError,
  reportFailure,
  withReadOnly,
} from "./pilot-cli-common.mjs";

const roles = ["manager", "member", "viewer"];
function validate(options) {
  if (
    !["grant", "list", "revoke"].includes(options.operation) ||
    !uuid.test(options.workspaceId ?? "") ||
    !/^[a-z0-9]{20}$/.test(options.projectRef ?? "")
  )
    throw new PilotCliError(
      "Membership operation, workspace UUID or target configuration is invalid.",
    );
  if (options.operation !== "list" && !uuid.test(options.userId ?? ""))
    throw new PilotCliError("A valid user UUID is required.");
  if (options.operation === "grant" && !roles.includes(options.role))
    throw new PilotCliError("Role must be manager, member or viewer.");
  if (
    typeof options.apply !== "boolean" ||
    typeof options.createWorkspace !== "boolean" ||
    (options.createWorkspace && options.operation !== "grant") ||
    (options.apply && options.operation === "list")
  )
    throw new PilotCliError(
      "Invalid apply/workspace creation flags for this operation.",
    );
  if (options.apply && options.confirmProject !== options.projectRef)
    throw new PilotCliError(
      "Applying requires the exact target project confirmation. Nothing was changed.",
    );
}

export async function runPilotMembership(client, input) {
  const options = { apply: false, createWorkspace: false, ...input };
  validate(options);
  const work = async () => {
    // Apply locks the user against deletion and the workspace against concurrent deactivation.
    if (options.operation !== "list") {
      const user = await client.query(
        `SELECT 1 FROM auth.users WHERE id=$1${options.apply ? " FOR KEY SHARE" : ""}`,
        [options.userId],
      );
      if (!user.rows.length)
        throw new PilotCliError(
          "This user does not exist in Auth. Create/check the user manually first.",
        );
    }
    if (options.apply && options.createWorkspace)
      await client.query(
        "INSERT INTO public.workspaces(id) VALUES($1) ON CONFLICT(id) DO NOTHING",
        [options.workspaceId],
      );
    const workspace = await client.query(
      `SELECT active FROM public.workspaces WHERE id=$1${options.apply ? " FOR UPDATE" : ""}`,
      [options.workspaceId],
    );
    const workspaceExists = workspace.rows.length > 0;
    if (!workspaceExists && !options.createWorkspace)
      throw new PilotCliError(
        "Workspace does not exist. Grant requires an explicit --create-workspace decision.",
      );
    if (
      workspaceExists &&
      options.operation === "grant" &&
      !workspace.rows[0].active
    )
      throw new PilotCliError(
        "Workspace is inactive. Grant refused; it will not be reactivated automatically.",
      );
    const result = {
      operation: options.operation,
      dryRun: !options.apply,
      applied: options.apply,
      workspaceExists,
      ...(options.operation !== "list" ? { userExists: true } : {}),
    };
    if (options.operation === "list") {
      result.counts = (
        await client.query(
          "SELECT role,active,count(*)::int AS count FROM public.workspace_memberships WHERE workspace_id=$1 GROUP BY role,active ORDER BY role,active",
          [options.workspaceId],
        )
      ).rows;
    } else if (options.operation === "grant") {
      result.role = options.role;
      result.willCreateWorkspace = !workspaceExists;
      result.plan = "Upsert one membership; set selected role and active=true.";
      if (options.apply)
        await client.query(
          `INSERT INTO public.workspace_memberships(workspace_id,user_id,role,active) VALUES($1,$2,$3,true)
          ON CONFLICT(workspace_id,user_id) DO UPDATE SET role=EXCLUDED.role,active=true`,
          [options.workspaceId, options.userId, options.role],
        );
    } else {
      result.plan =
        "Deactivate only this user membership; preserve history and Auth user.";
      if (options.apply)
        result.changed =
          (
            await client.query(
              "UPDATE public.workspace_memberships SET active=false WHERE workspace_id=$1 AND user_id=$2 AND active=true",
              [options.workspaceId, options.userId],
            )
          ).rowCount > 0;
      else
        result.membershipActive =
          (
            await client.query(
              "SELECT active FROM public.workspace_memberships WHERE workspace_id=$1 AND user_id=$2",
              [options.workspaceId, options.userId],
            )
          ).rows[0]?.active === true;
    }
    return result;
  };
  try {
    if (!options.apply) return await withReadOnly(client, work);
    await client.query("BEGIN");
    try {
      const result = await work();
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  } catch (error) {
    if (error instanceof PilotCliError) throw error;
    throw new PilotCliError(
      "Membership check/change failed; transaction outcome may be unknown. Verify this membership privately before retrying; check database permissions/schema.",
    );
  }
}

export function parseMembershipArgs(args) {
  const [operation, ...flags] = args;
  const options = { operation, apply: false, createWorkspace: false };
  const seen = new Set();
  for (const flag of flags) {
    const match = /^--(user|role|confirm-project)=(.+)$/.exec(flag);
    const name = match?.[1] ?? flag;
    if (seen.has(name)) throw new PilotCliError("Duplicate CLI flag.");
    seen.add(name);
    if (match)
      options[
        { user: "userId", role: "role", "confirm-project": "confirmProject" }[
          name
        ]
      ] = match[2];
    else if (flag === "--apply") options.apply = true;
    else if (flag === "--create-workspace") options.createWorkspace = true;
    else
      throw new PilotCliError(
        "Unknown or malformed CLI flag. See PILOT-B1-RUNBOOK.md for the accepted syntax.",
      );
  }
  if (
    (operation !== "grant" && options.role !== undefined) ||
    (operation === "list" && options.userId !== undefined)
  )
    throw new PilotCliError("User/role flags do not match this operation.");
  return options;
}

async function main() {
  const args = parseMembershipArgs(process.argv.slice(2));
  // Connection is selected once; confirmation is against that actual maintenance endpoint, not a display origin.
  const { pool, target } = pilotConnection({
    maintenance: true,
    readOnly: !args.apply,
  });
  try {
    const options = {
      ...args,
      workspaceId: process.env.PILOT_WORKSPACE_ID,
      projectRef: target.projectRef,
    };
    validate(options); // Before opening a database socket.
    const client = await pool.connect();
    try {
      console.log(
        JSON.stringify(
          {
            target: { maskedProjectRef: target.maskedProjectRef },
            ...(await runPilotMembership(client, options)),
          },
          null,
          2,
        ),
      );
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}
if (isMain(import.meta.url)) main().catch(reportFailure);
