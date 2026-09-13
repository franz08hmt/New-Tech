import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { appConfig } from "../config/config.js";
import { log } from "../common/log.js";

@Injectable()
export class StorageService {
  private readonly config = appConfig().storage;

  private async request(path: string, init: RequestInit = {}) {
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
      return await response.json();
    } catch {
      // Never return provider bodies, keys, URLs or transport errors to the browser.
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
