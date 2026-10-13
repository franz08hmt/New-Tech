import { fork } from "node:child_process";
import { once } from "node:events";

export async function runtimeProcess(mode, values = {}) {
  // Deliberately exclude inherited credentials, NODE_OPTIONS and dotenv loaders.
  const env = Object.fromEntries(
    ["PATH", "SystemRoot", "TEMP", "TMP"].flatMap((key) =>
      process.env[key] ? [[key, process.env[key]]] : [],
    ),
  );
  for (const [key, value] of Object.entries(values)) {
    if (
      !["HOST", "TRUSTED_PROXY_IP", "PUBLIC_ORIGIN", "NODE_ENV"].includes(key)
    )
      throw new Error("Unexpected runtime test environment variable");
    if (value !== undefined) env[key] = value;
  }
  const child = fork(
    new URL("./runtime-test-worker.mjs", import.meta.url),
    [mode],
    {
      env,
      execArgv: [],
      stdio: ["ignore", "ignore", "pipe", "ipc"],
    },
  );
  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  const exited = once(child, "exit");
  function message(timeout = 15000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => finish(new Error("Runtime fixture timed out")),
        timeout,
      );
      const onMessage = (value) => finish(null, value);
      const onExit = () =>
        finish(new Error("Runtime fixture exited without a result: " + stderr));
      function finish(error, value) {
        clearTimeout(timer);
        child.off("message", onMessage);
        child.off("exit", onExit);
        error ? reject(error) : resolve(value);
      }
      child.once("message", onMessage);
      child.once("exit", onExit);
    });
  }
  try {
    const first = await message();
    return {
      first,
      exited,
      get stderr() {
        return stderr;
      },
      async call(command) {
        const reply = message();
        child.send(command);
        return reply;
      },
      async close() {
        if (child.exitCode !== null || child.signalCode !== null) return;
        // Terminal results disconnect themselves; do not race them with a send.
        if (first.type !== "ready") {
          await exited;
          return;
        }
        const timer = setTimeout(() => child.kill(), 3000);
        if (child.connected) child.send({ type: "close" });
        else child.kill();
        await exited;
        clearTimeout(timer);
      },
    };
  } catch (error) {
    child.kill();
    await exited;
    throw error;
  }
}

export async function withRuntime(mode, values, run) {
  const worker = await runtimeProcess(mode, values);
  try {
    return await run(worker);
  } finally {
    await worker.close();
  }
}
