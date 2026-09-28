import { ApiError, GoogleGenAI } from "@google/genai";
import { Injectable } from "@nestjs/common";
import { log } from "../common/log.js";
import { geminiEmbeddingConfig } from "../config/config.js";

export type EmbeddingFailure =
  | "not_configured"
  | "invalid_input"
  | "invalid_response"
  | "timeout"
  | "quota"
  | "authentication"
  | "unavailable"
  | "upstream";

export class EmbeddingError extends Error {
  constructor(readonly kind: EmbeddingFailure) {
    super("Embedding request failed.");
  }
}

@Injectable()
export class GeminiEmbeddingService {
  private readonly config = geminiEmbeddingConfig();
  private client?: GoogleGenAI;

  get model() {
    return this.config.model;
  }

  get dimensions() {
    return this.config.dimensions;
  }

  async embedDocuments(title: string, texts: string[]): Promise<number[][]> {
    const normalizedTitle = title.trim();
    if (!normalizedTitle || normalizedTitle.length > 255)
      throw new EmbeddingError("invalid_input");
    return this.embed("RETRIEVAL_DOCUMENT", texts, normalizedTitle);
  }

  async embedQuery(text: string): Promise<number[]> {
    const [embedding] = await this.embed("RETRIEVAL_QUERY", [text]);
    return embedding;
  }

  private async embed(
    taskType: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY",
    texts: string[],
    title?: string,
  ) {
    const startedAt = Date.now();
    if (
      texts.length === 0 ||
      texts.some((text) => !text.trim() || text.length > 20_000)
    )
      throw new EmbeddingError("invalid_input");

    try {
      if (!this.config.apiKey) throw new EmbeddingError("not_configured");
      this.client ??= new GoogleGenAI({
        apiKey: this.config.apiKey,
        vertexai: false,
        httpOptions: { retryOptions: { attempts: 1 } },
      });

      const embeddings: number[][] = [];
      for (
        let start = 0;
        start < texts.length;
        start += this.config.batchSize
      ) {
        const batch = texts.slice(start, start + this.config.batchSize);
        embeddings.push(...(await this.embedBatch(taskType, batch, title)));
      }
      log("info", "embedding.request.completed", {
        model: this.model,
        taskType,
        inputCount: texts.length,
        batchCount: Math.ceil(texts.length / this.config.batchSize),
        durationMs: Date.now() - startedAt,
        outcome: "success",
      });
      return embeddings;
    } catch (error: unknown) {
      const failure = this.normalizeError(error);
      log("error", "embedding.request.failed", {
        model: this.model,
        taskType,
        inputCount: texts.length,
        durationMs: Date.now() - startedAt,
        outcome: "failure",
        errorType: failure.kind,
      });
      throw failure;
    }
  }

  private async embedBatch(
    taskType: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY",
    texts: string[],
    title?: string,
  ) {
    const controller = new AbortController();
    let timedOut = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const timeout = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          timedOut = true;
          controller.abort();
          reject(new EmbeddingError("timeout"));
        }, this.config.timeoutMs);
      });
      const response = await Promise.race([
        this.client!.models.embedContent({
          model: this.model,
          contents: texts.map((text) => ({
            role: "user",
            parts: [{ text }],
          })),
          config: {
            taskType,
            ...(title ? { title } : {}),
            outputDimensionality: this.dimensions,
            abortSignal: controller.signal,
            httpOptions: { retryOptions: { attempts: 1 } },
          },
        }),
        timeout,
      ]);
      if (response.embeddings?.length !== texts.length)
        throw new EmbeddingError("invalid_response");
      return response.embeddings.map((item) =>
        this.validateAndNormalize(item.values),
      );
    } catch (error: unknown) {
      throw this.normalizeError(error, timedOut);
    } finally {
      clearTimeout(timer);
    }
  }

  private validateAndNormalize(values?: number[]) {
    if (
      !values ||
      values.length !== this.dimensions ||
      values.some((value) => !Number.isFinite(value))
    )
      throw new EmbeddingError("invalid_response");
    let squaredMagnitude = 0;
    for (const value of values) squaredMagnitude += value * value;
    if (!Number.isFinite(squaredMagnitude) || squaredMagnitude === 0)
      throw new EmbeddingError("invalid_response");

    if (this.model === "gemini-embedding-001" && this.dimensions < 3072) {
      const magnitude = Math.sqrt(squaredMagnitude);
      return values.map((value) => value / magnitude);
    }
    return [...values];
  }

  private normalizeError(error: unknown, timedOut = false): EmbeddingError {
    if (timedOut) return new EmbeddingError("timeout");
    if (error instanceof EmbeddingError) return error;
    if (error instanceof ApiError) {
      if ([408, 504].includes(error.status))
        return new EmbeddingError("timeout");
      if (error.status === 429) return new EmbeddingError("quota");
      if ([401, 403].includes(error.status))
        return new EmbeddingError("authentication");
      if ([400, 503].includes(error.status))
        return new EmbeddingError("unavailable");
    }
    return new EmbeddingError("upstream");
  }
}
