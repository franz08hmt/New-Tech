import { promises as defaultFs } from "node:fs";
import { hostname as osHostname } from "node:os";
import { resolve } from "node:path";
import {
  HttpEvaluationError,
  LEDGER_UNAVAILABLE,
  PLAN_ALREADY_EXECUTED,
  PLAN_RESERVED,
} from "./rag-evaluation-http-lib.mjs";

/**
 * Execution ledger of one approved plan, on the local filesystem.
 *
 * `<dir>/<planSha256>/` holds
 *   active.json            the reservation: exclusive create, so one holder at a
 *                          time across processes; its state is dispatching,
 *                          finished or finished_unknown;
 *   <runId>.intent.json    written and synced BEFORE the first generation POST;
 *   <runId>.outcome.json   completed or unknown_after_dispatch;
 *   superseded-*.json      a reservation an operator took over; kept as evidence.
 *
 * Recovery policy (nothing expires and nothing is cleared by a clock):
 * - before dispatch (reservation taken, no intent): a failed or refused attempt
 *   removes only its own reservation and leaves no history;
 * - after dispatch, run still active: the reservation is held; a rerun, even an
 *   acknowledged one, is refused while its holder process is alive;
 * - a run that ended with every response fully received: outcome completed, the
 *   reservation is released, history keeps the intent and outcome;
 * - a crash, or an outcome unknown after dispatch: the reservation stays. A new
 *   run needs --rerun-acknowledged naming that run, and for a run that never
 *   finished its holder must also be provably gone (same host, pid not alive);
 *   the old reservation moves to superseded-* and its intent stays;
 * - every earlier run, finished or not, must be acknowledged for a rerun.
 * Any read or write failure refuses the dispatch; it is never an empty ledger.
 */
const RUN_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const unavailable = () => new HttpEvaluationError(LEDGER_UNAVAILABLE);

function processAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
}

export function createPlanLedger({
  dir,
  planSha256,
  fs = defaultFs,
  hostname = osHostname,
  isProcessAlive = processAlive,
}) {
  const planDir = resolve(dir, planSha256);
  const lockPath = resolve(planDir, "active.json");
  const takeoverPath = resolve(planDir, "takeover.json");

  async function exclusive(path, text) {
    const handle = await fs.open(path, "wx");
    try {
      await handle.writeFile(text);
      await handle.sync();
    } finally {
      await handle.close();
    }
  }
  async function readLock() {
    let text;
    try {
      text = await fs.readFile(lockPath, "utf8");
    } catch (error) {
      if (error.code === "ENOENT") return null;
      throw unavailable();
    }
    try {
      const holder = JSON.parse(text);
      if (!RUN_ID.test(holder.runId) || typeof holder.state !== "string")
        throw new Error("shape");
      return holder;
    } catch {
      throw unavailable();
    }
  }
  // Only a missing directory means "no history"; anything else is unknown.
  async function history() {
    const ids = [];
    for (const folder of [planDir, dir]) {
      let names;
      try {
        names = await fs.readdir(folder);
      } catch (error) {
        if (error.code === "ENOENT") continue;
        throw unavailable();
      }
      for (const name of names) {
        const intent =
          folder === planDir
            ? /^([0-9a-f-]{36})\.intent\.json$/i.exec(name)
            : // Entries written before the reservation layout existed.
              new RegExp(`^${planSha256}\\.([0-9a-f-]{36})\\.json$`, "i").exec(
                name,
              );
        if (intent && RUN_ID.test(intent[1])) ids.push(intent[1].toLowerCase());
      }
    }
    return ids;
  }
  function canTakeOver(holder, acknowledged) {
    if (!acknowledged.includes(holder.runId.toLowerCase())) return false;
    if (holder.state === "finished" || holder.state === "finished_unknown")
      return true;
    // A run that never finished: only if it is demonstrably not running here.
    return holder.host === hostname() && !isProcessAlive(holder.pid);
  }
  async function dropOwnLock(runId) {
    try {
      const mine = await readLock();
      if (mine?.runId === runId) await fs.unlink(lockPath);
    } catch {
      /* A lock that cannot be removed stays and keeps the plan closed. */
    }
  }
  async function replaceLock(lock) {
    const temporary = `${lockPath}.${lock.runId}.tmp`;
    await exclusive(temporary, JSON.stringify(lock) + "\n");
    try {
      await fs.rename(temporary, lockPath);
    } catch (error) {
      await fs.unlink(temporary).catch(() => {});
      throw error;
    }
  }

  async function tryCreate(lock) {
    try {
      await exclusive(lockPath, JSON.stringify(lock) + "\n");
      return true;
    } catch (error) {
      if (error.code === "EEXIST") return false;
      throw unavailable();
    }
  }
  // Takeovers are serialised, and the holder is re-read under that guard, so two
  // operators cannot both claim the same stale reservation.
  async function takeOver(holder, runId) {
    try {
      await exclusive(takeoverPath, JSON.stringify({ runId }) + "\n");
    } catch (error) {
      throw error.code === "EEXIST"
        ? new HttpEvaluationError(PLAN_RESERVED)
        : unavailable();
    }
    try {
      const current = await readLock();
      if (current && current.runId !== holder.runId)
        throw new HttpEvaluationError(PLAN_RESERVED);
      if (current)
        await fs.rename(
          lockPath,
          resolve(
            planDir,
            `superseded-${holder.runId}-${runId}-${Date.now()}.json`,
          ),
        );
    } catch (error) {
      if (error instanceof HttpEvaluationError) throw error;
      if (error.code !== "ENOENT") throw unavailable();
    } finally {
      await fs.unlink(takeoverPath).catch(() => {});
    }
  }

  return {
    /** Fail-fast check before any credential is read; the reservation decides. */
    async precheck({ acknowledged }) {
      const holder = await readLock();
      if (holder && !canTakeOver(holder, acknowledged))
        throw new HttpEvaluationError(PLAN_RESERVED);
      const prior = await history();
      if (prior.some((id) => !acknowledged.includes(id)))
        throw new HttpEvaluationError(PLAN_ALREADY_EXECUTED);
    },

    /**
     * Takes the plan's single reservation, rechecks the history under it and
     * records the execution intent durably. Only then may a POST be sent.
     */
    async reserve({ runId, acknowledged }) {
      try {
        await fs.mkdir(planDir, { recursive: true });
      } catch {
        throw unavailable();
      }
      const lock = {
        runId,
        pid: process.pid,
        host: hostname(),
        state: "dispatching",
        startedAt: new Date().toISOString(),
      };
      let owned = false;
      for (let attempt = 0; attempt < 3 && !owned; attempt++) {
        if (await tryCreate(lock)) {
          owned = true;
          break;
        }
        const holder = await readLock();
        if (!holder) continue; // released meanwhile: try the exclusive create again
        if (!canTakeOver(holder, acknowledged))
          throw new HttpEvaluationError(PLAN_RESERVED);
        await takeOver(holder, runId);
      }
      if (!owned) throw new HttpEvaluationError(PLAN_RESERVED);

      try {
        const prior = await history();
        if (prior.some((id) => !acknowledged.includes(id)))
          throw new HttpEvaluationError(PLAN_ALREADY_EXECUTED);
        try {
          await exclusive(
            resolve(planDir, `${runId}.intent.json`),
            JSON.stringify({
              planSha256,
              runId,
              startedAt: lock.startedAt,
              pid: lock.pid,
              host: lock.host,
              acknowledged,
            }) + "\n",
          );
        } catch {
          throw unavailable();
        }
      } catch (error) {
        // Nothing was dispatched: give back only our own reservation.
        await dropOwnLock(runId);
        throw error;
      }

      return {
        runId,
        /** Records the outcome; releases the reservation only if it is ours and
         * every response was completely received. */
        async finish({ outcome }) {
          const result = { outcomeRecorded: false, released: false };
          try {
            await exclusive(
              resolve(planDir, `${runId}.outcome.json`),
              JSON.stringify({
                planSha256,
                runId,
                status: outcome,
                finishedAt: new Date().toISOString(),
              }) + "\n",
            );
            result.outcomeRecorded = true;
          } catch {
            return result; // the reservation stays: the plan remains closed
          }
          try {
            const mine = await readLock();
            if (!mine || mine.runId !== runId) return result; // superseded
            await replaceLock({
              ...mine,
              state: outcome === "completed" ? "finished" : "finished_unknown",
            });
            if (outcome === "completed") {
              await fs.unlink(lockPath);
              result.released = true;
            }
          } catch {
            /* The reservation stays; a later run needs an acknowledgement. */
          }
          return result;
        },
      };
    },
  };
}
