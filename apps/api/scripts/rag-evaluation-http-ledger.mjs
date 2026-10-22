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
 * `<dir>/<planSha256>/` is APPEND-ONLY:
 *   lock.<n>.json          reservation record number n (n = 1, 2, 3 ...), created
 *                          exclusively with `wx` and never changed afterwards;
 *   release.<n>.json       marker: record n ended with every response received;
 *   unknown.<n>.json       marker: record n ended with an outcome unknown after
 *                          dispatch (or a runner exception);
 *   <runId>.intent.json    written and synced BEFORE the first generation POST;
 *   <runId>.outcome.json   completed or unknown_after_dispatch.
 *
 * Invariants:
 * - I1 No operation deletes, renames or overwrites a ledger file. There is no
 *   shared mutable path such as "active.json", so a delayed operation of one run
 *   can never act on the record of another through a name they both resolve.
 * - I2 The reservation is the record with the highest n. Ownership passes ONLY by
 *   the exclusive creation of lock.<n+1>.json, which at most one creator can win
 *   for a given n+1 (acquisition and takeover are the same atomic step).
 * - I3 A marker is addressed to one record number and written by that record's
 *   owner, who knows its number; it can only affect that record. A superseded
 *   owner that finishes late therefore only annotates its own old record.
 * - I4 The latest record is active unless release.<n> exists. A crash leaves no
 *   marker, so the plan stays closed. Nothing is decided from a clock.
 * - I5 Decisions use a directory listing that can only be stale in one direction:
 *   markers and records are only ever added, so a stale view can refuse a run that
 *   could have proceeded, never admit one that must wait; the exclusive create of
 *   the next number is the single point that decides a race.
 *
 * Recovery policy:
 * - a run that ended with every response received writes release.<n>; the next
 *   run needs no takeover but must acknowledge every earlier run in its history;
 * - an unknown outcome writes unknown.<n>; a later run needs --rerun-acknowledged
 *   naming that run (the operator checks the server's own records first);
 * - a crash leaves record n with no marker; it can be taken over only with the
 *   acknowledgement AND proof the holder is gone (same host, pid not alive);
 * - a holder that is alive can never be taken over, with or without an
 *   acknowledgement; a refused or failed attempt before dispatch writes
 *   release.<n> for its own record and leaves no history;
 * - any read or write failure, an unreadable or half-written record, or a record
 *   in the former single-file layout (active.json) refuses the dispatch.
 */
const RUN_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const unavailable = () => new HttpEvaluationError(LEDGER_UNAVAILABLE);
const reserved = () => new HttpEvaluationError(PLAN_RESERVED);
const number = (n) => String(n).padStart(10, "0");
const MAX_ATTEMPTS = 5;

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
  const file = (name) => resolve(planDir, name);

  async function exclusive(path, text) {
    const handle = await fs.open(path, "wx");
    try {
      await handle.writeFile(text);
      await handle.sync();
    } finally {
      await handle.close();
    }
  }
  /** The directory as it is now; only a missing directory means "empty". */
  async function listing() {
    let names;
    try {
      names = await fs.readdir(planDir);
    } catch (error) {
      if (error.code === "ENOENT") return { latest: 0, names: new Set() };
      throw unavailable();
    }
    let latest = 0;
    for (const name of names) {
      const match = /^lock[.](\d{10})[.]json$/.exec(name);
      if (match) latest = Math.max(latest, Number(match[1]));
    }
    return { latest, names: new Set(names) };
  }
  async function readRecord(n) {
    try {
      const record = JSON.parse(
        await fs.readFile(file(`lock.${number(n)}.json`), "utf8"),
      );
      if (
        !RUN_ID.test(record.runId) ||
        record.seq !== n ||
        typeof record.pid !== "number"
      )
        throw new Error("shape");
      return record;
    } catch {
      // Unreadable, half-written or missing: never guess, never treat as free.
      throw unavailable();
    }
  }
  /** The active reservation, or null when the latest record has been released. */
  async function holderOf(view) {
    // A reservation left by the former single-file layout is not understood here.
    if (view.names.has("active.json")) throw reserved();
    if (
      view.latest === 0 ||
      view.names.has(`release.${number(view.latest)}.json`)
    )
      return null;
    const record = await readRecord(view.latest);
    return {
      ...record,
      state: view.names.has(`unknown.${number(view.latest)}.json`)
        ? "finished_unknown"
        : "dispatching",
    };
  }
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
            ? /^([0-9a-f-]{36})[.]intent[.]json$/i.exec(name)
            : // Entries written before the reservation layout existed.
              new RegExp(`^${planSha256}[.]([0-9a-f-]{36})[.]json$`, "i").exec(
                name,
              );
        if (intent && RUN_ID.test(intent[1])) ids.push(intent[1].toLowerCase());
      }
    }
    return ids;
  }
  function canTakeOver(holder, acknowledged) {
    if (!acknowledged.includes(holder.runId.toLowerCase())) return false;
    if (holder.state === "finished_unknown") return true;
    // A run that never finished: only if it is demonstrably not running here.
    return holder.host === hostname() && !isProcessAlive(holder.pid);
  }
  async function marker(kind, n, runId) {
    await exclusive(
      file(`${kind}.${number(n)}.json`),
      JSON.stringify({ kind, seq: n, runId, at: new Date().toISOString() }) +
        "\n",
    );
  }

  return {
    /** The active reservation (runId, state, seq) or null; read-only. */
    async inspect() {
      const holder = await holderOf(await listing());
      return holder
        ? { runId: holder.runId, state: holder.state, seq: holder.seq }
        : null;
    },

    /** Fail-fast check before any credential is read; the reservation decides. */
    async precheck({ acknowledged }) {
      const holder = await holderOf(await listing());
      if (holder && !canTakeOver(holder, acknowledged)) throw reserved();
      const prior = await history();
      if (prior.some((id) => !acknowledged.includes(id)))
        throw new HttpEvaluationError(PLAN_ALREADY_EXECUTED);
    },

    /**
     * Takes the plan's reservation by creating the next record exclusively,
     * rechecks the history under it and records the execution intent durably.
     * Only then may a POST be sent.
     */
    async reserve({ runId, acknowledged }) {
      try {
        await fs.mkdir(planDir, { recursive: true });
      } catch {
        throw unavailable();
      }
      const startedAt = new Date().toISOString();
      let seq = 0;
      for (let attempt = 0; attempt < MAX_ATTEMPTS && !seq; attempt++) {
        const view = await listing();
        const holder = await holderOf(view);
        if (holder && !canTakeOver(holder, acknowledged)) throw reserved();
        const next = view.latest + 1;
        try {
          await exclusive(
            file(`lock.${number(next)}.json`),
            JSON.stringify({
              seq: next,
              runId,
              pid: process.pid,
              host: hostname(),
              startedAt,
              // Which record this one replaced, kept as evidence of a takeover.
              supersedes: holder ? holder.runId : null,
            }) + "\n",
          );
          seq = next;
        } catch (error) {
          // Another creator won this number: look again, never overwrite.
          if (error.code !== "EEXIST") throw unavailable();
        }
      }
      if (!seq) throw reserved();

      try {
        const prior = await history();
        if (prior.some((id) => !acknowledged.includes(id)))
          throw new HttpEvaluationError(PLAN_ALREADY_EXECUTED);
        try {
          await exclusive(
            file(`${runId}.intent.json`),
            JSON.stringify({
              planSha256,
              runId,
              seq,
              startedAt,
              pid: process.pid,
              host: hostname(),
              acknowledged,
            }) + "\n",
          );
        } catch {
          throw unavailable();
        }
      } catch (error) {
        // Nothing was dispatched: end only our own record, append-only.
        await marker("release", seq, runId).catch(() => {});
        throw error;
      }

      return {
        runId,
        seq,
        /**
         * Records the outcome, then marks our own record: release.<seq> only when
         * every response was received, unknown.<seq> otherwise. It touches no
         * other record, however late it runs.
         */
        async finish({ outcome }) {
          const result = { outcomeRecorded: false, released: false };
          try {
            await exclusive(
              file(`${runId}.outcome.json`),
              JSON.stringify({
                planSha256,
                runId,
                seq,
                status: outcome,
                finishedAt: new Date().toISOString(),
              }) + "\n",
            );
            result.outcomeRecorded = true;
          } catch {
            return result; // no marker: the plan stays closed
          }
          try {
            await marker(
              outcome === "completed" ? "release" : "unknown",
              seq,
              runId,
            );
            result.released = outcome === "completed";
          } catch {
            /* No marker was written: the reservation stays and the plan is closed. */
          }
          return result;
        },
      };
    },
  };
}
