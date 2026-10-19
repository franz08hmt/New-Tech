import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer as createHttpServer } from "node:http";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

test(
  "Vite callback proxy errors never log the authorization query",
  { timeout: 20000 },
  async (t) => {
    const messages = [];
    t.mock.method(console, "error", (...parts) =>
      messages.push(parts.join(" ")),
    );
    const upstream = createHttpServer((req) => req.socket.destroy());
    upstream.listen(0, "127.0.0.1");
    await once(upstream, "listening");
    let vite;
    try {
      const web = fileURLToPath(new URL("../../web/", import.meta.url));
      vite = await createServer({
        root: web,
        configFile: web + "vite.config.ts",
        envDir: false,
        server: {
          host: "127.0.0.1",
          port: 0,
          strictPort: false,
          hmr: false,
          proxy: { "/api": `http://127.0.0.1:${upstream.address().port}` },
        },
      });
      await vite.listen();
      const response = await fetch(
        `http://127.0.0.1:${vite.httpServer.address().port}/api/auth/google/callback?attempt=synthetic-proxy-attempt&code=synthetic-proxy-code`,
        { signal: AbortSignal.timeout(10000) },
      );
      assert.equal(response.status, 502);
      assert.ok(messages.length > 0, "the proxy failure is still diagnosable");
      assert.equal(
        messages.some((m) => /synthetic-proxy-|callback\?/.test(m)),
        false,
        "dev proxy must not log callback code/correlation/query",
      );
    } finally {
      await vite?.close();
      await new Promise((done) => upstream.close(done));
    }
  },
);
