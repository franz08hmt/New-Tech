import "reflect-metadata";
import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import type { ExecutionContext } from "@nestjs/common";
import { Subject } from "rxjs";
import { afterEach, expect, it, vi } from "vitest";
import { SpeechAdmissionInterceptor } from "./speech.controller.js";
import type { SpeechService } from "./speech.service.js";

afterEach(() => vi.useRealTimers());

it("keeps the Docker proxy STT wait above its request deadline without extending other APIs", () => {
  const nginx = readFileSync(
    new URL("../../../../infra/nginx/default.conf", import.meta.url),
    "utf8",
  );
  const speech = nginx.match(
    /location = \/api\/speech\/transcriptions\s*\{([^}]+)\}/,
  )?.[1];
  expect(speech).toMatch(/proxy_read_timeout 180s;/);
  expect(speech).toMatch(/proxy_set_header X-Forwarded-For \$remote_addr;/);
  expect(nginx.match(/location \/api\/\s*\{([^}]+)\}/)?.[1]).toMatch(
    /proxy_read_timeout 60s;/,
  );
});

it.each([true, false])(
  "bounds STT processing=%s at 150 seconds and releases admission once",
  async (processing) => {
    vi.useFakeTimers();
    const req = Object.assign(new EventEmitter(), {
      speechProcessing: processing,
      speechSignal: undefined as AbortSignal | undefined,
      destroy: vi.fn(),
    });
    const res = Object.assign(new EventEmitter(), { writableEnded: false });
    const release = vi.fn();
    const speech = {
      admit: vi.fn(async () => release),
      requestDeadlineMs: vi.fn(() => 150000),
    } as unknown as SpeechService;
    const context = {
      switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
    } as unknown as ExecutionContext;
    const work = new Subject<void>();
    const output = await new SpeechAdmissionInterceptor(speech).intercept(
      context,
      { handle: () => work },
    );
    const subscription = output.subscribe();
    await vi.advanceTimersByTimeAsync(149999);
    expect(req.speechSignal?.aborted).toBe(false);
    expect(release).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(req.speechSignal?.aborted).toBe(true);
    expect(req.speechSignal?.reason.name).toBe("TimeoutError");
    if (processing) {
      // Native work retains admission until its cancellation has settled.
      expect(release).not.toHaveBeenCalled();
      expect(req.destroy).not.toHaveBeenCalled();
    } else expect(req.destroy).toHaveBeenCalledOnce();
    subscription.unsubscribe();
    expect(release).toHaveBeenCalledOnce();
    expect(req.listenerCount("aborted")).toBe(0);
    expect(res.listenerCount("close")).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  },
);
