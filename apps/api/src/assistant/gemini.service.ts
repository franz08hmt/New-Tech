import { ApiError, GoogleGenAI } from "@google/genai";
import { Injectable } from "@nestjs/common";
import { log } from "../common/log.js";
import { geminiConfig } from "../config/config.js";
import { AssistantError } from "./assistant.types.js";
import type {
  AssistantGeneration,
  AssistantProvider,
  AssistantStatus,
} from "./assistant.types.js";

@Injectable()
export class GeminiService implements AssistantProvider {
  private readonly config = geminiConfig();
  private client?: GoogleGenAI;

  get model() {
    return this.config.model;
  }

  status(): AssistantStatus {
    const common = {
      provider: "google" as const,
      mode: "llm" as const,
      ragEnabled: false as const,
      credentialsExposedToClient: false as const,
    };
    return this.config.configured
      ? { ...common, status: "ready", model: this.model }
      : { ...common, status: "not_configured" };
  }

  async generate(input: AssistantGeneration): Promise<string> {
    const startedAt = Date.now();
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      if (!this.config.apiKey) throw new AssistantError("not_configured");
      // Lazy initialization keeps status/startup independent of the SDK/network.
      this.client ??= new GoogleGenAI({
        apiKey: this.config.apiKey,
        vertexai: false,
        httpOptions: { retryOptions: { attempts: 1 } },
      });
      const timeout = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          // Abort the transport as well as bounding the caller's wait.
          controller.abort();
          reject(new AssistantError("timeout"));
        }, this.config.timeoutMs);
      });
      const response = await Promise.race([
        this.client.models.generateContent({
          model: this.model,
          contents: [
            { role: "user", parts: input.userParts.map((text) => ({ text })) },
          ],
          config: {
            systemInstruction: input.systemInstruction,
            maxOutputTokens: this.config.maxOutputTokens,
            candidateCount: 1,
            responseModalities: ["TEXT"],
            abortSignal: controller.signal,
            httpOptions: { retryOptions: { attempts: 1 } },
          },
        }),
        timeout,
      ]);
      const answer = response.text?.trim();
      if (!answer || answer.includes(this.config.apiKey))
        throw new AssistantError("upstream");
      log("info", "assistant.request.completed", {
        model: this.model,
        durationMs: Date.now() - startedAt,
        outcome: "success",
      });
      return answer;
    } catch (error: unknown) {
      const failure = this.normalizeError(error, controller.signal.aborted);
      log("error", "assistant.request.failed", {
        model: this.model,
        durationMs: Date.now() - startedAt,
        outcome: "failure",
        errorType: failure.kind,
      });
      // Never preserve SDK messages, causes, headers or response bodies.
      throw failure;
    } finally {
      clearTimeout(timer);
    }
  }

  private normalizeError(error: unknown, timedOut: boolean): AssistantError {
    if (timedOut) return new AssistantError("timeout");
    if (error instanceof AssistantError) return error;
    if (error instanceof ApiError) {
      if ([408, 504].includes(error.status))
        return new AssistantError("timeout");
      if (error.status === 429) return new AssistantError("quota");
      if ([401, 403].includes(error.status))
        return new AssistantError("authentication");
      // Gemini may report invalid credentials as 400; keep this unavailable.
      if ([400, 503].includes(error.status))
        return new AssistantError("unavailable");
    }
    return new AssistantError("upstream");
  }
}
