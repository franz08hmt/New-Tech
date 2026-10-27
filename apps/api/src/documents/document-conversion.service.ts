import { HttpException, Injectable } from "@nestjs/common";
import {
  documentUploadFormat,
  MAX_DOCUMENT_UPLOAD_BYTES,
} from "@examate/contracts/document-formats";
import type { PdfFile } from "./documents.service.js";

function fail(status: number, code: string, message: string): never {
  throw new HttpException({ code, message }, status);
}

/** Local, isolated conversion only: no AI, Storage, DB, retries or raw errors. */
@Injectable()
export class DocumentConversionService {
  async toPdf(file: PdfFile): Promise<PdfFile> {
    const format = documentUploadFormat(file.originalname, file.mimetype);
    if (!format)
      fail(
        415,
        "DOCUMENT_FORMAT_UNSUPPORTED",
        "Chỉ nhận PDF, DOC, DOCX, Markdown hoặc TXT.",
      );
    if (format === "pdf") return file;
    const configured = process.env.DOCUMENT_CONVERTER_URL;
    if (!configured)
      fail(
        503,
        "DOCUMENT_CONVERSION_UNAVAILABLE",
        "Bộ chuyển tài liệu chưa sẵn sàng. Bạn có thể xuất PDF rồi tải lên.",
      );
    let endpoint: URL;
    try {
      endpoint = new URL(configured);
      if (
        endpoint.protocol !== "http:" ||
        !["document-converter", "127.0.0.1", "localhost", "[::1]"].includes(
          endpoint.hostname,
        ) ||
        endpoint.username ||
        endpoint.password ||
        endpoint.pathname !== "/" ||
        endpoint.search ||
        endpoint.hash
      )
        throw Error();
    } catch {
      fail(
        503,
        "DOCUMENT_CONVERSION_UNAVAILABLE",
        "Bộ chuyển tài liệu chưa sẵn sàng. Bạn có thể xuất PDF rồi tải lên.",
      );
    }
    endpoint.pathname = "/convert";
    endpoint.searchParams.set("format", format);
    const signal = AbortSignal.timeout(45_000);
    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        body: new Uint8Array(file.buffer),
        headers: { "Content-Type": "application/octet-stream" },
        signal,
        redirect: "error",
      });
      if (!response.ok) {
        await response.body?.cancel();
        if ([400, 413, 415, 422].includes(response.status))
          fail(
            422,
            "DOCUMENT_CONVERSION_INVALID",
            "Không đọc được tài liệu. Hãy dùng DOC/DOCX không mã hóa, hoặc Markdown/TXT UTF-8 hợp lệ.",
          );
        fail(
          response.status === 504 ? 504 : 503,
          "DOCUMENT_CONVERSION_UNAVAILABLE",
          "Chuyển tài liệu chưa hoàn tất. Chưa có bản nào được lưu; bạn có thể thử lại hoặc xuất PDF.",
        );
      }
      if (
        response.headers.get("content-type")?.split(";")[0] !==
          "application/pdf" ||
        !response.body
      )
        throw Error();
      const chunks: Buffer[] = [];
      let length = 0;
      const reader = response.body.getReader();
      try {
        while (true) {
          const part = await reader.read();
          if (part.done) break;
          length += part.value.byteLength;
          if (length > MAX_DOCUMENT_UPLOAD_BYTES)
            fail(
              413,
              "DOCUMENT_CONVERSION_TOO_LARGE",
              "Bản PDF sau chuyển đổi vượt 10 MiB. Hãy chia nhỏ tài liệu.",
            );
          chunks.push(Buffer.from(part.value));
        }
      } finally {
        await reader.cancel().catch(() => {});
      }
      const buffer = Buffer.concat(chunks);
      if (buffer.subarray(0, 5).toString("ascii") !== "%PDF-") throw Error();
      return {
        originalname: `${file.originalname}.pdf`,
        mimetype: "application/pdf",
        size: buffer.length,
        buffer,
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      fail(
        signal.aborted ? 504 : 503,
        signal.aborted
          ? "DOCUMENT_CONVERSION_TIMEOUT"
          : "DOCUMENT_CONVERSION_UNAVAILABLE",
        "Không chuyển được tài liệu lúc này. Chưa có bản nào được lưu; bạn có thể thử lại hoặc xuất PDF.",
      );
    }
  }
}
