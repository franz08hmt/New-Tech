import { spawn } from "node:child_process";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  stat,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { inflateRawSync } from "node:zlib";

export const MAX_BYTES = 10 * 1024 * 1024;
export class ConversionError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
  }
}
const invalid = () => {
  throw new ConversionError(422, "DOCUMENT_CONVERSION_INVALID");
};

/** Read bounded ZIP metadata/relationship text, never extract arbitrary paths. */
function checkDocx(bytes) {
  if (bytes.readUInt32LE(0) !== 0x04034b50) invalid();
  let end = -1;
  for (let n = bytes.length - 22; n >= Math.max(0, bytes.length - 65557); n--) {
    if (bytes.readUInt32LE(n) === 0x06054b50) {
      end = n;
      break;
    }
  }
  if (end < 0 || bytes.readUInt16LE(end + 4) || bytes.readUInt16LE(end + 6))
    invalid();
  const count = bytes.readUInt16LE(end + 10);
  if (!count || count > 1024) invalid();
  let offset = bytes.readUInt32LE(end + 16),
    expanded = 0;
  const names = new Set();
  for (let i = 0; i < count; i++) {
    if (offset + 46 > end || bytes.readUInt32LE(offset) !== 0x02014b50)
      invalid();
    const flags = bytes.readUInt16LE(offset + 8),
      method = bytes.readUInt16LE(offset + 10);
    const packed = bytes.readUInt32LE(offset + 20),
      size = bytes.readUInt32LE(offset + 24);
    const length = bytes.readUInt16LE(offset + 28),
      extra = bytes.readUInt16LE(offset + 30),
      comment = bytes.readUInt16LE(offset + 32);
    if (
      offset + 46 + length + extra + comment > end ||
      flags & 1 ||
      ![0, 8].includes(method)
    )
      invalid();
    const name = bytes
      .subarray(offset + 46, offset + 46 + length)
      .toString("utf8");
    expanded += size;
    if (
      names.has(name) ||
      /(^\/|\\|(^|\/)\.\.\/|vba|activex|embeddings)/i.test(name) ||
      size > 20 * 1024 * 1024 ||
      expanded > 50 * 1024 * 1024 ||
      size > Math.max(4096, packed * 200)
    )
      invalid();
    names.add(name);
    if (name.endsWith(".rels") || name === "[Content_Types].xml") {
      const local = bytes.readUInt32LE(offset + 42);
      if (local + 30 > bytes.length || bytes.readUInt32LE(local) !== 0x04034b50)
        invalid();
      const start =
        local +
        30 +
        bytes.readUInt16LE(local + 26) +
        bytes.readUInt16LE(local + 28);
      if (start + packed > bytes.length || size > 1024 * 1024) invalid();
      const chunk = bytes.subarray(start, start + packed);
      const text = (
        method === 8
          ? inflateRawSync(chunk, { maxOutputLength: 1024 * 1024 })
          : chunk
      ).toString("utf8");
      // Fail closed on external relationships, DTD/entity obfuscation and macros.
      if (
        /<!DOCTYPE|<!ENTITY|TargetMode\s*=\s*["']External|macroEnabled|vbaProject/i.test(
          text,
        )
      )
        invalid();
    }
    offset += 46 + length + extra + comment;
  }
  if (!names.has("[Content_Types].xml") || !names.has("word/document.xml"))
    invalid();
}

export function validateSource(format, bytes) {
  if (!["doc", "docx", "md", "txt"].includes(format))
    throw new ConversionError(415, "DOCUMENT_FORMAT_UNSUPPORTED");
  if (!bytes.length || bytes.length > MAX_BYTES)
    throw new ConversionError(413, "DOCUMENT_SIZE_INVALID");
  try {
    if (format === "docx") {
      if (bytes.length < 22) invalid();
      checkDocx(bytes);
    }
    if (
      format === "doc" &&
      (!bytes.subarray(0, 8).equals(Buffer.from("d0cf11e0a1b11ae1", "hex")) ||
        !bytes.includes(Buffer.from("WordDocument", "utf16le")))
    )
      invalid();
    if (format === "md" || format === "txt") {
      const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      if (
        !text.trim() ||
        text.length > 2_000_000 ||
        /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text)
      )
        invalid();
      return text;
    }
  } catch {
    invalid();
  }
}

function office(args, signal) {
  return new Promise((resolveWork, reject) => {
    let failure;
    const child = spawn("soffice", args, {
      stdio: "ignore",
      detached: process.platform !== "win32",
      env: {
        PATH: process.env.PATH,
        HOME: tmpdir(),
        LANG: "C.UTF-8",
        SAL_USE_VCLPLUGIN: "svp",
      },
    });
    let force;
    const kill = (sig) => {
      try {
        if (process.platform !== "win32" && child.pid)
          process.kill(-child.pid, sig);
        else child.kill(sig);
      } catch {}
    };
    const stop = () => {
      failure = new ConversionError(
        signal.aborted ? 504 : 422,
        "DOCUMENT_CONVERSION_TIMEOUT",
      );
      kill("SIGTERM");
      force = setTimeout(() => kill("SIGKILL"), 250);
    };
    signal.addEventListener("abort", stop, { once: true });
    if (signal.aborted) stop();
    child.once("error", () => {
      failure = new ConversionError(503, "DOCUMENT_CONVERSION_UNAVAILABLE");
    });
    child.once("close", (code) => {
      clearTimeout(force);
      signal.removeEventListener("abort", stop);
      if (failure) {
        kill("SIGKILL");
        reject(failure);
      } else if (code !== 0)
        reject(new ConversionError(422, "DOCUMENT_CONVERSION_INVALID"));
      else resolveWork();
    });
  });
}

export async function convert(
  format,
  bytes,
  signal = AbortSignal.timeout(35_000),
) {
  const text = validateSource(format, bytes);
  const prefix = join(tmpdir(), "examate-convert-");
  const directory = await mkdtemp(prefix);
  try {
    const profile = join(directory, "profile"),
      out = join(directory, "out");
    await mkdir(join(profile, "user"), { recursive: true });
    await mkdir(out);
    // LibreOffice's supported user profile: macros disabled, no trusted paths.
    await writeFile(
      join(profile, "user", "registrymodifications.xcu"),
      `<?xml version="1.0"?><oor:items xmlns:oor="http://openoffice.org/2001/registry"><item oor:path="/org.openoffice.Office.Common/Security/Scripting"><prop oor:name="MacroSecurityLevel" oor:op="fuse"><value>3</value></prop><prop oor:name="DisableMacrosExecution" oor:op="fuse"><value>true</value></prop><prop oor:name="SecureURL" oor:op="fuse"><value/></prop></item><item oor:path="/org.openoffice.Office.Writer/Content/Update"><prop oor:name="Link" oor:op="fuse"><value>0</value></prop></item></oor:items>`,
    );
    const extension = text === undefined ? format : "html";
    const input = join(directory, `source.${extension}`);
    const safe = text
      ?.replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
    await writeFile(
      input,
      text === undefined
        ? bytes
        : `<!doctype html><html><head><meta charset="utf-8"><style>@page{size:A4;margin:20mm}body{font-family:'DejaVu Sans';font-size:11pt}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-family:inherit}</style></head><body><pre>${safe}</pre></body></html>`,
    );
    await office(
      [
        `-env:UserInstallation=${pathToFileURL(profile).href}`,
        "--headless",
        "--nologo",
        "--nodefault",
        "--nofirststartwizard",
        "--norestore",
        "--convert-to",
        "pdf:writer_pdf_Export",
        "--outdir",
        out,
        input,
      ],
      signal,
    );
    const pdf = join(out, "source.pdf");
    const size = (await stat(pdf)).size;
    if (size > MAX_BYTES)
      throw new ConversionError(413, "DOCUMENT_CONVERSION_TOO_LARGE");
    const result = await readFile(pdf);
    if (!result.subarray(0, 5).equals(Buffer.from("%PDF-"))) invalid();
    return result;
  } catch (error) {
    if (error instanceof ConversionError) throw error;
    throw new ConversionError(422, "DOCUMENT_CONVERSION_INVALID");
  } finally {
    const target = resolve(directory);
    if (
      !target.startsWith(resolve(tmpdir()) + sep) ||
      !target.startsWith(resolve(prefix))
    )
      throw Error("Invalid owned conversion directory");
    await rm(target, { recursive: true, force: true });
  }
}
