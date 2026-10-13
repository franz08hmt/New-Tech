// Child-process fixture only: never loads .env or starts dist/main.js.
import { fakeDependencies, httpApp } from "./helpers.mjs";

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
    });
  if (message === "close") {
    await server.app.close();
    process.disconnect();
  }
});
process.send?.({
  type: "ready",
  base: server.base,
  trustProxy: server.app.getHttpAdapter().getInstance().get("trust proxy"),
});
