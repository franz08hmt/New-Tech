// Child-process fixture only: never loads .env or starts dist/main.js.
import { fakeDependencies, httpApp } from "./helpers.mjs";
import { createServer } from "node:http";

let conversionCalls = 0;
const converter = createServer(async (req, res) => {
  for await (const _chunk of req) {
    /* consume only this synthetic fixture body */
  }
  conversionCalls++;
  res.writeHead(200, { "Content-Type": "application/pdf" });
  res.end("%PDF-1.4\nconversion-fixture\n%%EOF");
});
await new Promise((resolve) => converter.listen(0, "127.0.0.1", resolve));
process.env.DOCUMENT_CONVERTER_URL = `http://127.0.0.1:${converter.address().port}`;

const originalFetch = globalThis.fetch;
globalThis.fetch = (input, options) => {
  const url = new URL(typeof input === "string" ? input : (input.url ?? input));
  if (url.hostname !== "127.0.0.1")
    throw new Error("Cloud HTTP is forbidden in multipart regression");
  return originalFetch(input, options);
};
const fixture = fakeDependencies();
const forbidden = () => {
  throw new Error("AI/indexing is forbidden in multipart regression");
};
const server = await httpApp(
  fixture.database,
  fixture.storage,
  { chat: forbidden },
  { process: forbidden },
  { retrieve: forbidden },
);
server.app.getHttpServer().prependListener("request", (request) => {
  request.on("aborted", () => process.send?.({ type: "aborted" }));
});
process.on("message", async (message) => {
  if (message === "stats")
    process.send?.({
      type: "stats",
      uploadCalls: fixture.state.uploadCalls,
      documents: fixture.documents.size,
      objects: fixture.objects.size,
      conversionCalls,
    });
  if (message === "close") {
    await server.app.close();
    await new Promise((resolve) => converter.close(resolve));
    process.disconnect();
  }
});
process.send?.({
  type: "ready",
  base: server.base,
  trustProxy: server.app.getHttpAdapter().getInstance().get("trust proxy"),
});
