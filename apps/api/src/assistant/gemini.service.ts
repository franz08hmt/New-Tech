import { ApiError, GoogleGenAI } from "@google/genai";
import { Injectable, Optional } from "@nestjs/common";
import { log } from "../common/log.js";
import { geminiConfig } from "../config/config.js";
import {
  AiUsageService,
  classifyProviderOutcome,
  type ProviderCallToken,
} from "./ai-usage.service.js";
import { safeAiAdmissionError } from "./ai-admission.service.js";
import {
  createProviderDeadline,
  settleProviderCall,
} from "./provider-lifecycle.js";
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

  constructor(@Optional() private readonly usage?: AiUsageService) {}

  get model() {
    return this.config.model;
  }

  status(): AssistantStatus {
    const common = {
      provider: "google" as const,
      modes: ["general", "documents"] as ("general" | "documents")[],
      ragEnabled: true as const,
      credentialsExposedToClient: false as const,
    };
    return this.config.configured
      ? { ...common, status: "ready", model: this.model }
      : { ...common, status: "not_configured" };
  }

  async generate(input: AssistantGeneration): Promise<string> {
    const startedAt = Date.now();
    const controller = new AbortController();
    let deadline: ReturnType<typeof createProviderDeadline> | undefined;
    let providerCall: ProviderCallToken | undefined;
    let providerCallFinished = false;
    let permitAuthorized = false;
    let providerDispatched = false;
    try {
      if (!this.config.apiKey) throw new AssistantError("not_configured");
      // Lazy initialization keeps status/startup independent of the SDK/network.
      this.client ??= new GoogleGenAI({
        apiKey: this.config.apiKey,
        vertexai: false,
        httpOptions: { retryOptions: { attempts: 1 } },
      });
      deadline = createProviderDeadline(this.config.timeoutMs, () =>
        controller.abort(),
      );
      providerCall = this.usage?.startProviderCall({
        type: "generation",
        provider: "google",
        model: this.model,
        prompt: input.prompt,
      });
      await this.usage?.authorizeProviderCall(providerCall);
      permitAuthorized = true;
      if (deadline.hasExpired()) {
        this.usage?.discardProviderCallBeforeDispatch(providerCall);
        providerCallFinished = true;
        throw new AssistantError("timeout");
      }
      providerDispatched = true;
      const result = await Promise.race([
        settleProviderCall(() =>
          this.client!.models.generateContent({
            model: this.model,
            contents: [
              ...(input.conversation ?? []).map(({ role, text }) => ({
                role,
                parts: [{ text }],
              })),
              {
                role: "user",
                parts: input.userParts.map((text) => ({ text })),
              },
            ],
            config: {
              systemInstruction: input.systemInstruction,
              maxOutputTokens: this.config.maxOutputTokens,
              candidateCount: 1,
              responseModalities: ["TEXT"],
              ...(input.responseMimeType
                ? { responseMimeType: input.responseMimeType }
                : {}),
              ...(input.responseJsonSchema
                ? { responseJsonSchema: input.responseJsonSchema }
                : {}),
              abortSignal: controller.signal,
              httpOptions: { retryOptions: { attempts: 1 } },
            },
          }),
        ),
        deadline.event,
      ]);
      if (result.kind === "timeout") throw new AssistantError("timeout");
      if (result.kind === "error") throw result.error;
      const response = result.value;
      if (response.modelVersion)
        this.usage?.updateProviderModel(providerCall, response.modelVersion);
      this.usage?.finishProviderCall(
        providerCall,
        "success",
        response.usageMetadata,
      );
      providerCallFinished = true;
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
      const admissionError = safeAiAdmissionError(error);
      if (admissionError) throw admissionError;
      if (permitAuthorized && !providerDispatched && !providerCallFinished) {
        this.usage?.discardProviderCallBeforeDispatch(providerCall);
        providerCallFinished = true;
      }
      const failure = this.normalizeError(error, controller.signal.aborted);
      if (permitAuthorized && providerDispatched && !providerCallFinished)
        this.usage?.finishProviderCall(
          providerCall,
          classifyProviderOutcome(failure),
          undefined,
          error instanceof ApiError,
        );
      log("error", "assistant.request.failed", {
        model: this.model,
        durationMs: Date.now() - startedAt,
        outcome: "failure",
        errorType: failure.kind,
      });
      // Never preserve SDK messages, causes, headers or response bodies.
      throw failure;
    } finally {
      deadline?.dispose();
    }
  }

  async *generateStream(
    input: AssistantGeneration,
    signal?: AbortSignal,
  ): AsyncGenerator<string> {
    const startedAt = Date.now();
    const controller = new AbortController();
    let deadline: ReturnType<typeof createProviderDeadline> | undefined;
    let providerCall: ProviderCallToken | undefined;
    let providerCallFinished = false;
    let permitAuthorized = false;
    let providerDispatched = false;
    let streamUsage: unknown;
    const forwardAbort = () => controller.abort();
    let resolveInterrupted!: (event: { kind: "interrupted" }) => void;
    const interrupted = new Promise<{ kind: "interrupted" }>((resolve) => {
      resolveInterrupted = resolve;
    });
    const notifyInterrupted = () => resolveInterrupted({ kind: "interrupted" });
    signal?.addEventListener("abort", forwardAbort, { once: true });
    controller.signal.addEventListener("abort", notifyInterrupted, {
      once: true,
    });

    try {
      if (!this.config.apiKey) throw new AssistantError("not_configured");
      if (signal?.aborted)
        throw new DOMException("Request cancelled", "AbortError");
      this.client ??= new GoogleGenAI({
        apiKey: this.config.apiKey,
        vertexai: false,
        httpOptions: { retryOptions: { attempts: 1 } },
      });
      deadline = createProviderDeadline(this.config.timeoutMs, () =>
        controller.abort(),
      );

      providerCall = this.usage?.startProviderCall({
        type: "generation_stream",
        provider: "google",
        model: this.model,
        prompt: input.prompt,
      });
      await this.usage?.authorizeProviderCall(providerCall);
      permitAuthorized = true;
      if (deadline.hasExpired()) {
        this.usage?.discardProviderCallBeforeDispatch(providerCall);
        providerCallFinished = true;
        throw new AssistantError("timeout");
      }
      if (signal?.aborted) {
        this.usage?.discardProviderCallBeforeDispatch(providerCall);
        providerCallFinished = true;
        throw new DOMException("Request cancelled", "AbortError");
      }

      providerDispatched = true;
      const streamResult = await Promise.race([
        settleProviderCall(() =>
          this.client!.models.generateContentStream({
            model: this.model,
            contents: [
              ...(input.conversation ?? []).map(({ role, text }) => ({
                role,
                parts: [{ text }],
              })),
              {
                role: "user",
                parts: input.userParts.map((text) => ({ text })),
              },
            ],
            config: {
              systemInstruction: input.systemInstruction,
              maxOutputTokens: this.config.maxOutputTokens,
              candidateCount: 1,
              responseModalities: ["TEXT"],
              ...(input.responseMimeType
                ? { responseMimeType: input.responseMimeType }
                : {}),
              ...(input.responseJsonSchema
                ? { responseJsonSchema: input.responseJsonSchema }
                : {}),
              abortSignal: controller.signal,
              httpOptions: { retryOptions: { attempts: 1 } },
            },
          }),
        ),
        interrupted,
      ]);
      if (streamResult.kind === "interrupted")
        throw deadline.hasExpired()
          ? new AssistantError("timeout")
          : new DOMException("Request cancelled", "AbortError");
      if (streamResult.kind === "error") throw streamResult.error;
      const stream = streamResult.value;
      const iterator = stream[Symbol.asyncIterator]();
      let complete = false;
      let providerReadFailed = false;
      let answer = "";
      let pending = "";
      let lastChunkHasUsageMetadata = false;
      try {
        while (true) {
          let next: Awaited<ReturnType<typeof iterator.next>>;
          try {
            const result = await Promise.race([
              settleProviderCall(() => iterator.next()),
              interrupted,
            ]);
            if (result.kind === "interrupted")
              throw deadline?.hasExpired()
                ? new AssistantError("timeout")
                : new DOMException("Request cancelled", "AbortError");
            if (result.kind === "error") throw result.error;
            next = result.value;
          } catch (error) {
            providerReadFailed = true;
            throw error;
          }
          if (next.done) {
            complete = true;
            this.usage?.finishProviderCall(
              providerCall,
              lastChunkHasUsageMetadata &&
                providerCall?.call.usage.status === "complete"
                ? "success"
                : "unknown",
              streamUsage,
              true,
            );
            providerCallFinished = true;
            break;
          }
          if (next.value.usageMetadata !== undefined) {
            // Streaming APIs may repeat cumulative usage on multiple chunks;
            // the latest snapshot replaces the prior one and is never summed.
            streamUsage = next.value.usageMetadata;
            this.usage?.updateProviderUsage(providerCall, streamUsage);
          }
          if (next.value.modelVersion)
            this.usage?.updateProviderModel(
              providerCall,
              next.value.modelVersion,
            );
          lastChunkHasUsageMetadata = next.value.usageMetadata !== undefined;
          const delta = next.value.text ?? "";
          if (!delta) continue;
          answer += delta;
          pending += delta;
          if (answer.includes(this.config.apiKey))
            throw new AssistantError("upstream");
          // Keep only a suffix that could still become the start of the API
          // key. This prevents a credential split across provider chunks from
          // leaking while allowing ordinary first tokens to reach the UI
          // immediately instead of buffering almost the whole key length.
          let possibleKeyPrefixLength = 0;
          for (
            let length = Math.min(
              pending.length,
              this.config.apiKey.length - 1,
            );
            length > 0;
            length--
          ) {
            if (this.config.apiKey.startsWith(pending.slice(-length))) {
              possibleKeyPrefixLength = length;
              break;
            }
          }
          const safeLength = pending.length - possibleKeyPrefixLength;
          if (safeLength > 0) {
            yield pending.slice(0, safeLength);
            pending = pending.slice(safeLength);
          }
        }
      } finally {
        if (!complete) {
          // Returning the SDK iterator only releases its reader lock. Abort
          // the HTTP transport as well when the consumer rejects or stops.
          controller.abort();
          if (!providerReadFailed) {
            this.usage?.finishProviderCall(
              providerCall,
              deadline?.hasExpired() ? "timeout" : "cancelled",
              streamUsage,
            );
            providerCallFinished = true;
          }
          try {
            // An upstream iterator may ignore cancellation. Handle cleanup
            // failures without letting its return block our timeout/abort.
            void Promise.resolve(iterator.return?.(undefined as never)).catch(
              () => {},
            );
          } catch {
            // Cleanup must not replace the original generation failure.
          }
        }
      }
      if (signal?.aborted)
        throw new DOMException("Request cancelled", "AbortError");
      if (!answer.trim() || answer.includes(this.config.apiKey))
        throw new AssistantError("upstream");
      if (pending) yield pending;
      log("info", "assistant.request.completed", {
        model: this.model,
        durationMs: Date.now() - startedAt,
        outcome: "success",
        streaming: true,
      });
    } catch (error: unknown) {
      const admissionError = safeAiAdmissionError(error);
      if (admissionError) throw admissionError;
      if (permitAuthorized && !providerDispatched && !providerCallFinished) {
        this.usage?.discardProviderCallBeforeDispatch(providerCall);
        providerCallFinished = true;
      }
      if (signal?.aborted) {
        if (permitAuthorized && providerDispatched && !providerCallFinished)
          this.usage?.finishProviderCall(
            providerCall,
            "cancelled",
            streamUsage,
          );
        throw new DOMException("Request cancelled", "AbortError");
      }
      const failure = this.normalizeError(
        error,
        deadline?.hasExpired() ?? false,
      );
      if (permitAuthorized && providerDispatched && !providerCallFinished)
        this.usage?.finishProviderCall(
          providerCall,
          classifyProviderOutcome(failure),
          streamUsage,
          error instanceof ApiError,
        );
      log("error", "assistant.request.failed", {
        model: this.model,
        durationMs: Date.now() - startedAt,
        outcome: "failure",
        errorType: failure.kind,
        streaming: true,
      });
      throw failure;
    } finally {
      deadline?.dispose();
      signal?.removeEventListener("abort", forwardAbort);
      controller.signal.removeEventListener("abort", notifyInterrupted);
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
