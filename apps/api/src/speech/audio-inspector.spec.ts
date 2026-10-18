import "reflect-metadata";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { spawn } from "node:child_process";
import { runAudioTool } from "./audio-inspector.js";

vi.mock("node:child_process", () => ({ spawn: vi.fn() }));

class StubbornMediaProcess extends EventEmitter {
  stdout = new PassThrough();
  exitCode: number | null = null;
  signalCode: NodeJS.Signals | null = null;
  killed = false;
  signals: NodeJS.Signals[] = [];

  kill(signal: NodeJS.Signals = "SIGTERM") {
    this.killed = true;
    this.signals.push(signal);
    if (signal === "SIGKILL") this.close(null, signal);
    return true;
  }

  close(code: number | null, signal: NodeJS.Signals | null = null) {
    this.exitCode = code;
    this.signalCode = signal;
    this.emit("close", code, signal);
  }
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.resetAllMocks();
});

describe("media process termination", () => {
  it.each([
    ["timeout", "STT_MEDIA_TIMEOUT"],
    ["cancel", "STT_CANCELLED"],
    ["output limit", "STT_AUDIO_TOO_LONG"],
  ])("force kills a process ignoring SIGTERM after %s", async (cause, code) => {
    const child = new StubbornMediaProcess();
    vi.mocked(spawn).mockReturnValue(
      child as unknown as ReturnType<typeof spawn>,
    );
    const controller = new AbortController();
    let settled = false;
    const pending = runAudioTool("ffmpeg", [], controller.signal, 4).finally(
      () => {
        settled = true;
      },
    );
    const rejection = expect(pending).rejects.toMatchObject({
      response: { code },
    });

    if (cause === "timeout") await vi.advanceTimersByTimeAsync(7000);
    else if (cause === "cancel") controller.abort();
    else {
      child.stdout.emit("data", Buffer.from("oversized"));
      child.stdout.emit("data", Buffer.from("more output"));
    }
    expect(child.signals).toEqual(["SIGTERM"]);
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(250);
    expect(child.signals).toContain("SIGKILL");
    await rejection;
    expect(settled).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("clears escalation when the process exits after SIGTERM", async () => {
    const child = new StubbornMediaProcess();
    vi.mocked(spawn).mockReturnValue(
      child as unknown as ReturnType<typeof spawn>,
    );
    const controller = new AbortController();
    const pending = runAudioTool("ffmpeg", [], controller.signal, 4);
    const rejection = expect(pending).rejects.toMatchObject({
      response: { code: "STT_CANCELLED" },
    });
    controller.abort();
    child.close(null, "SIGTERM");
    await rejection;
    await vi.advanceTimersByTimeAsync(7000);
    expect(child.signals).toEqual(["SIGTERM"]);
    expect(vi.getTimerCount()).toBe(0);
  });
});
