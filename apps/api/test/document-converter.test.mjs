import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  validateSource,
  externalRelationshipsAllowed,
  ConversionError,
} from "../../../infra/document-converter/convert.mjs";
import { documentUploadFormat } from "@examate/contracts/document-formats";

test("document allowlist shares browser MIME aliases without accepting renamed PDF or executables", () => {
  for (const [name, mime, expected] of [
    ["A.MD", "", "md"],
    ["a.doc", "application/msword", "doc"],
    ["a.docx", "application/octet-stream", "docx"],
    ["a.pdf", "text/plain", undefined],
    ["x.exe", "application/pdf", undefined],
    ["x.docm", "application/msword", undefined],
  ])
    assert.equal(documentUploadFormat(name, mime), expected);
});
test("text is strict UTF-8, nonempty, bounded and contains no binary controls", () => {
  assert.equal(
    validateSource(
      "md",
      Buffer.from("# Tiến trình\n<script>alert(1)</script>"),
    ),
    "# Tiến trình\n<script>alert(1)</script>",
  );
  for (const bytes of [
    Buffer.from([0xff]),
    Buffer.from(" \n"),
    Buffer.from("a\0b"),
    Buffer.alloc(10 * 1024 * 1024 + 1, 65),
  ])
    assert.throws(() => validateSource("txt", bytes), ConversionError);
});
test("Word formats require their real containers, not HTML/RTF renamed to Word", () => {
  for (const format of ["doc", "docx"])
    for (const value of ["<html>Word</html>", "{\\rtf1 text}", "%PDF-1.4"])
      assert.throws(
        () => validateSource(format, Buffer.from(value)),
        ConversionError,
      );
});
test("real DOCX fixture is accepted; damaged ZIP sizes and external relationships fail closed", () => {
  const bytes = readFileSync(
    new URL("./fixtures/document-formats/notes.docx", import.meta.url),
  );
  assert.equal(validateSource("docx", bytes), undefined);
  const corrupt = Buffer.from(bytes);
  corrupt.writeUInt32LE(0xffffffff, corrupt.length - 6);
  assert.throws(() => validateSource("docx", corrupt), ConversionError);
  const external = readFileSync(
    new URL("./fixtures/document-formats/external.docx", import.meta.url),
  );
  assert.throws(() => validateSource("docx", external), ConversionError);
});
test("an ordinary http(s)/mailto hyperlink is accepted, anything else external still fails closed", () => {
  const hyperlink = readFileSync(
    new URL("./fixtures/document-formats/hyperlink.docx", import.meta.url),
  );
  assert.equal(validateSource("docx", hyperlink), undefined);
  const rel = (type, target) =>
    `<Relationships><Relationship Id="r1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${type}" Target="${target}" TargetMode="External"/></Relationships>`;
  for (const [type, target, allowed] of [
    ["hyperlink", "https://example.com/page", true],
    ["hyperlink", "http://example.com/page", true],
    ["hyperlink", "mailto:someone@example.com", true],
    ["hyperlink", "file:///C:/secret.txt", false],
    ["hyperlink", "javascript:alert(1)", false],
    ["image", "https://example.com/pixel.png", false],
    ["attachedTemplate", "https://example.com/t.dotm", false],
    ["oleObject", "https://example.com/object", false],
    ["subDocument", "https://example.com/part.docx", false],
  ])
    assert.equal(
      externalRelationshipsAllowed(rel(type, target)),
      allowed,
      `${type} ${target}`,
    );
  assert.equal(
    externalRelationshipsAllowed(
      '<Relationships><Relationship Id="r1" Type="x/styles" Target="styles.xml"/></Relationships>',
    ),
    true,
  );
});
