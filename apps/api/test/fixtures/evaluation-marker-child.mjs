import { promises as fs } from "node:fs";
import { createPlanLedger } from "../../scripts/rag-evaluation-http-ledger.mjs";

// Test process only. IPC barriers permit an actual crash at a precise boundary.
const config = JSON.parse(process.env.F09_MARKER_CHILD);
process.on("message", () => {}); // Keep the IPC channel alive while at the barrier.
const pause = async () => {
  process.send({ boundary: config.boundary });
  await new Promise(() => {});
};
const injected = {
  ...fs,
  open: async (path, ...args) => {
    const handle = await fs.open(path, ...args);
    if (!/(?:release|unknown)[.]\d+[.]json$/.test(String(path))) return handle;
    return {
      writeFile: (text) => handle.writeFile(text),
      close: () => handle.close(),
      sync: async () => {
        await handle.sync();
        if (config.boundary === "synced") await pause();
      },
    };
  },
  link: async (from, to) => {
    await fs.link(from, to);
    if (config.boundary === "published") await pause();
  },
};
const ledger = createPlanLedger({ ...config, fs: injected });
const lease = await ledger.reserve({ runId: config.runId, acknowledged: [] });
await lease.finish({ outcome: config.outcome });
process.exit(0);
