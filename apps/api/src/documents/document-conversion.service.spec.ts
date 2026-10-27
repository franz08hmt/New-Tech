import { afterEach, expect, it, vi } from "vitest";
import { DocumentConversionService } from "./document-conversion.service.js";

const file = {
  originalname: "notes.md",
  mimetype: "text/markdown",
  buffer: Buffer.from("# Nội dung"),
  size: 14,
};
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
it("keeps PDF bytes and does not dispatch conversion", async () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  const pdf = { ...file, originalname: "a.pdf", mimetype: "application/pdf" };
  expect(await new DocumentConversionService().toPdf(pdf)).toBe(pdf);
  expect(fetch).not.toHaveBeenCalled();
});
it("fails safely if conversion is not configured or points outside its local service boundary", async () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  for (const url of [
    "",
    "https://outside.invalid",
    "http://document-converter:3010/private",
    "http://user:secret@document-converter:3010",
  ]) {
    vi.stubEnv("DOCUMENT_CONVERTER_URL", url);
    await expect(
      new DocumentConversionService().toPdf(file),
    ).rejects.toMatchObject({ status: 503 });
  }
  expect(fetch).not.toHaveBeenCalled();
});
it("converts once, preserves source extension and records canonical byte size", async () => {
  vi.stubEnv("DOCUMENT_CONVERTER_URL", "http://127.0.0.1:3010");
  const fetch = vi.fn().mockResolvedValue(
    new Response("%PDF-canonical", {
      headers: { "Content-Type": "application/pdf" },
    }),
  );
  vi.stubGlobal("fetch", fetch);
  const result = await new DocumentConversionService().toPdf(file);
  expect(result.originalname).toBe("notes.md.pdf");
  expect(result.size).toBe(result.buffer.length);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch.mock.calls[0][1]).toMatchObject({
    method: "POST",
    redirect: "error",
  });
});
it.each([503, 504, 422])(
  "does not retry worker HTTP %s or expose raw worker error",
  async (status) => {
    vi.stubEnv("DOCUMENT_CONVERTER_URL", "http://127.0.0.1:3010");
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response("PRIVATE_PATH_SQL", { status }));
    vi.stubGlobal("fetch", fetch);
    const result = await new DocumentConversionService()
      .toPdf(file)
      .catch((error: unknown) => error);
    expect(result).toMatchObject({ status });
    expect(JSON.stringify(result)).not.toContain("PRIVATE_PATH_SQL");
    expect(fetch).toHaveBeenCalledTimes(1);
  },
);
it("rejects non-PDF and oversized converter output", async () => {
  vi.stubEnv("DOCUMENT_CONVERTER_URL", "http://127.0.0.1:3010");
  for (const body of ["not-pdf", "%PDF-" + "x".repeat(10 * 1024 * 1024)]) {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(body, {
          headers: { "Content-Type": "application/pdf" },
        }),
      ),
    );
    await expect(
      new DocumentConversionService().toPdf(file),
    ).rejects.toBeDefined();
  }
});
