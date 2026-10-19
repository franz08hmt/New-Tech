import { assertTestDatabaseTarget } from "./test-database-target.mjs";
import { PilotCliError } from "./pilot-cli-common.mjs";

export const F02_ENTRY = "017_runtime_rls.sql";
export const F02_CAPABILITY_MARKER = "ExaMate F02-A managed runtime capability";

export function guardedLocalTarget(value) {
  const href = assertTestDatabaseTarget(value);
  const url = new URL(href);
  const databaseName = decodeURIComponent(url.pathname.slice(1));
  if (!/^[a-z][a-z0-9_]*_test$/.test(databaseName))
    throw new PilotCliError(
      "F02-A local tools accept only guarded *_test databases.",
    );
  return { href, databaseName };
}

export function validateLocalConfirmation(options, databaseName) {
  if (typeof options.apply !== "boolean")
    throw new PilotCliError("Invalid F02-A apply/rollback options.");
  if (options.apply && options.confirmDatabase !== databaseName)
    throw new PilotCliError(
      "F02-A write refused: exact disposable database confirmation is required.",
    );
}

export function parseF02Args(args) {
  const options = { apply: false };
  const seen = new Set();
  for (const arg of args) {
    const match = /^--confirm-database=([a-z][a-z0-9_]*_test)$/.exec(arg);
    const name = match ? "confirmation" : arg;
    if (seen.has(name))
      throw new PilotCliError("Duplicate F02-A command flag.");
    seen.add(name);
    if (arg === "--apply") options.apply = true;
    else if (match) options.confirmDatabase = match[1];
    else
      throw new PilotCliError(
        "Invalid F02-A arguments. See the local runbook.",
      );
  }
  return options;
}
