import { Injectable } from "@nestjs/common";
import type { PilotPrincipal } from "@examate/contracts";
import type { SpeechConfig } from "./speech-config.js";
import { SpeechError } from "./speech.types.js";

/** One process only: bounded admission state, never a durable daily quota. */
@Injectable()
export class SpeechLimiter {
  private buckets = new Map<string, { count: number; until: number }>();
  private active = 0;

  acquire(principal: PilotPrincipal, config: SpeechConfig): () => void {
    const now = Date.now();
    for (const [key, value] of this.buckets)
      if (value.until <= now) this.buckets.delete(key);
    const keys = [
      [
        `u:${principal.workspaceId}:${principal.userId}`,
        config.requestsPerMinute,
      ],
      [`w:${principal.workspaceId}`, config.requestsPerMinute * 4],
    ] as const;
    const full = keys.some(
      ([key, max]) => (this.buckets.get(key)?.count ?? 0) >= max,
    );
    if (full || this.active >= config.concurrency || this.buckets.size > 4092)
      throw new SpeechError(
        429,
        "STT_RATE_LIMITED",
        "Đã đạt giới hạn ghi âm. Hãy thử lại sau một phút.",
        { retryAfterSeconds: 60 },
      );
    for (const [key] of keys) {
      const bucket = this.buckets.get(key) ?? { count: 0, until: now + 60000 };
      bucket.count++;
      this.buckets.set(key, bucket);
    }
    this.active++;
    let released = false;
    return () => {
      if (!released) this.active--;
      released = true;
    };
  }
}
