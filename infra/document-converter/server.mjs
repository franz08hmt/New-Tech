import { createServer } from "node:http";
import { convert, ConversionError, MAX_BYTES } from "./convert.mjs";

let busy = false;
const server = createServer(async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "GET" && req.url === "/health") {
    res.end("ok");
    return;
  }
  const url = new URL(req.url, "http://converter.invalid");
  if (
    req.method !== "POST" ||
    url.pathname !== "/convert" ||
    url.searchParams.getAll("format").length !== 1 ||
    [...url.searchParams.keys()].some((key) => key !== "format")
  ) {
    res.writeHead(400);
    res.end();
    return;
  }
  if (busy) {
    res.writeHead(503);
    res.end();
    return;
  }
  busy = true;
  const controller = new AbortController();
  const deadline = setTimeout(() => {
    controller.abort();
    if (!req.complete) req.destroy();
  }, 35_000);
  const disconnect = () => {
    if (!res.writableEnded) controller.abort();
  };
  res.on("close", disconnect);
  try {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      if (controller.signal.aborted)
        throw new ConversionError(504, "DOCUMENT_CONVERSION_TIMEOUT");
      size += chunk.length;
      if (size > MAX_BYTES)
        throw new ConversionError(413, "DOCUMENT_CONVERSION_TOO_LARGE");
      chunks.push(chunk);
    }
    const result = await convert(
      url.searchParams.get("format"),
      Buffer.concat(chunks),
      controller.signal,
    );
    if (!controller.signal.aborted) {
      res.writeHead(200, {
        "Content-Type": "application/pdf",
        "Content-Length": result.length,
      });
      res.end(result);
    }
  } catch (error) {
    if (!res.destroyed) {
      res.writeHead(error instanceof ConversionError ? error.status : 422);
      res.end(
        JSON.stringify({
          code:
            error instanceof ConversionError
              ? error.message
              : "DOCUMENT_CONVERSION_INVALID",
        }),
      );
    }
  } finally {
    clearTimeout(deadline);
    res.off("close", disconnect);
    busy = false;
  }
});
server.requestTimeout = 40_000;
server.headersTimeout = 10_000;
server.maxConnections = 8;
server.listen(3010, "0.0.0.0");
