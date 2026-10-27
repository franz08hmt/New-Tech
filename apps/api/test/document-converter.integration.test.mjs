// Requires the isolated local converter, never a cloud target or a provider.
import "reflect-metadata";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PdfTextExtractorService } from "../dist/documents/pdf-text-extractor.service.js";

const target = new URL(
  process.env.TEST_DOCUMENT_CONVERTER_URL ?? "http://invalid",
);
if (
  target.hostname !== "127.0.0.1" ||
  target.protocol !== "http:" ||
  target.username ||
  target.password ||
  target.pathname !== "/"
)
  throw Error("Require exact owned loopback TEST_DOCUMENT_CONVERTER_URL");
async function request(format, body) {
  return fetch(new URL(`/convert?format=${format}`, target), {
    method: "POST",
    body,
    signal: AbortSignal.timeout(45000),
  });
}
for (const format of ["doc", "docx", "md", "txt"])
  test(`real LibreOffice ${format} conversion produces Vietnamese PDF text and stable page metadata`, async () => {
    const bytes = await readFile(
      new URL(`./fixtures/document-formats/notes.${format}`, import.meta.url),
    );
    const response = await request(format, bytes);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "application/pdf");
    const pdf = Buffer.from(await response.arrayBuffer());
    assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
    const extracted = await new PdfTextExtractorService().extract(pdf);
    const text = extracted.map((p) => p.text).join(" ");
    assert.match(text, /process/i);
    assert.match(text, /Tiến trình/);
    if (format === "md") {
      assert.match(text, /<script>not executed<\/script>/);
      assert.match(text, /blocked\.invalid/);
    }
    assert.ok(extracted.length > 0);
  });
test("real LibreOffice converts a DOCX that contains an ordinary hyperlink", async () => {
  const response = await request(
    "docx",
    await readFile(
      new URL("./fixtures/document-formats/hyperlink.docx", import.meta.url),
    ),
  );
  assert.equal(response.status, 200);
  const pdf = Buffer.from(await response.arrayBuffer());
  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  const extracted = await new PdfTextExtractorService().extract(pdf);
  assert.match(extracted.map((p) => p.text).join(" "), /Example link/);
});
for (const [format, file] of [
  ["docx", "external.docx"],
  ["docx", "notes.md"],
  ["doc", "notes.txt"],
])
  test(`converter rejects invalid/external ${file} submitted as ${format}`, async () => {
    const response = await request(
      format,
      await readFile(
        new URL(`./fixtures/document-formats/${file}`, import.meta.url),
      ),
    );
    assert.equal(response.status, 422);
    assert.doesNotMatch(
      await response.text(),
      /\/tmp|source\.|stack|blocked\.invalid/,
    );
  });
test("invalid conversion does not poison the next request", async () => {
  assert.equal((await request("txt", Buffer.from([0xff]))).status, 422);
  assert.equal(
    (await request("txt", Buffer.from("Valid text after invalid input.")))
      .status,
    200,
  );
});
