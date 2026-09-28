import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { appConfig } from "../config/config.js";
import { log } from "../common/log.js";

@Injectable()
export class StorageService {
  private readonly config = appConfig().storage;

  private async response(path: string, init: RequestInit = {}) {
    try {
      const response = await fetch(`${this.config.url}/storage/v1${path}`, {
        ...init,
        redirect: "error",
        headers: {
          apikey: this.config.key,
          ...(this.config.key.startsWith("sb_secret_")
            ? {}
            : { Authorization: `Bearer ${this.config.key}` }),
          ...init.headers,
        },
        signal: AbortSignal.timeout(this.config.timeout),
      });
      if (!response.ok) {
        log("error", "storage.request_failed", { status: response.status });
        await response.body?.cancel();
        throw new Error("Storage rejected request");
      }
      return response;
    } catch {
      // Never return provider bodies, keys, URLs or transport errors to the browser.
      throw new ServiceUnavailableException({
        code: "STORAGE_UNAVAILABLE",
        message: "Document storage is unavailable. Please retry.",
      });
    }
  }

  private async request(path: string, init: RequestInit = {}) {
    const response = await this.response(path, init);
    try {
      return await response.json();
    } catch {
      throw new ServiceUnavailableException({
        code: "STORAGE_UNAVAILABLE",
        message: "Document storage is unavailable. Please retry.",
      });
    }
  }

  async assertPrivateBucket() {
    const bucket = await this.request(`/bucket/${this.config.bucket}`);
    if (bucket.public !== false) {
      log("error", "storage.bucket_not_private");
      throw new ServiceUnavailableException({
        code: "STORAGE_CONFIGURATION",
        message: "Storage bucket must be private.",
      });
    }
  }

  async upload(key: string, buffer: Buffer) {
    await this.assertPrivateBucket();
    await this.request(`/object/${this.config.bucket}/${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/pdf", "x-upsert": "false" },
      body: new Uint8Array(buffer),
    });
  }

  async downloadBuffer(key: string) {
    await this.assertPrivateBucket();
    const response = await this.response(
      `/object/${this.config.bucket}/${key}`,
    );
    const declaredSize = Number(response.headers.get("content-length"));
    const maxBytes = 10 * 1024 * 1024;
    if (Number.isFinite(declaredSize) && declaredSize > maxBytes) {
      await response.body?.cancel();
      throw new ServiceUnavailableException({
        code: "STORAGE_UNAVAILABLE",
        message: "Document storage is unavailable. Please retry.",
      });
    }
    const reader = response.body?.getReader();
    if (!reader)
      throw new ServiceUnavailableException({
        code: "STORAGE_UNAVAILABLE",
        message: "Document storage is unavailable. Please retry.",
      });
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > maxBytes) {
          await reader.cancel();
          throw new Error("Storage object exceeds PDF size limit");
        }
        chunks.push(value);
      }
      return Buffer.concat(chunks, size);
    } catch {
      throw new ServiceUnavailableException({
        code: "STORAGE_UNAVAILABLE",
        message: "Document storage is unavailable. Please retry.",
      });
    }
  }

  async remove(key: string) {
    // Bulk remove is idempotent for an already absent key, allowing delete retry.
    await this.request(`/object/${this.config.bucket}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prefixes: [key] }),
    });
  }

  async signedDownload(key: string, name: string) {
    await this.assertPrivateBucket();
    const result = await this.request(
      `/object/sign/${this.config.bucket}/${key}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expiresIn: 60 }),
      },
    );
    if (
      typeof result.signedURL !== "string" ||
      !result.signedURL.startsWith("/object/sign/")
    )
      throw new ServiceUnavailableException(
        "Storage returned an invalid download response",
      );
    const url = new URL(`${this.config.url}/storage/v1${result.signedURL}`);
    url.searchParams.set("download", name);
    return { url: url.toString(), expiresIn: 60 };
  }
}
