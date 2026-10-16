import "reflect-metadata";
import { before, test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { AudioInspector } from "../dist/speech/audio-inspector.js";
import { speechConfig } from "../dist/speech/speech-config.js";

const config = { ...speechConfig(), enabled: true, maxDurationMs: 2000 };
const inspector = new AudioInspector(() => config);
const signal = () => new AbortController().signal;
function wav(durationMs, silent = false) {
  const count = Math.floor((16000 * durationMs) / 1000);
  const buffer = Buffer.alloc(44 + count * 2);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(buffer.length - 8, 4);
  buffer.write("WAVEfmt ", 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(16000, 24);
  buffer.writeUInt32LE(32000, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(count * 2, 40);
  if (!silent)
    for (let i = 0; i < count; i++)
      buffer.writeInt16LE(Math.round(Math.sin(i * 0.1) * 1000), 44 + i * 2);
  return buffer;
}
const file = (buffer, mimetype) => ({ buffer, size: buffer.length, mimetype });
async function encode(format) {
  const args =
    format === "webm"
      ? ["-c:a", "libopus", "-f", "webm"]
      : ["-c:a", "aac", "-movflags", "frag_keyframe+empty_moov", "-f", "mp4"];
  return new Promise((resolve, reject) => {
    const child = spawn(
      config.ffmpeg,
      [
        "-nostdin",
        "-v",
        "error",
        "-f",
        "wav",
        "-i",
        "pipe:0",
        ...args,
        "pipe:1",
      ],
      { windowsHide: true },
    );
    const chunks = [];
    const timer = setTimeout(() => child.kill(), 7000);
    child.stdout.on("data", (chunk) => chunks.push(chunk));
    child.stderr.resume();
    child.stdin.on("error", () => {});
    child.on("error", reject);
    child.on("close", (code) => {
      clearTimeout(timer);
      code === 0
        ? resolve(Buffer.concat(chunks))
        : reject(Error("Fixture encoding failed"));
    });
    child.stdin.end(wav(1000));
  });
}
before(async () => {
  assert.equal(
    await inspector.available(),
    true,
    "Real media tests require ffmpeg and ffprobe on PATH or STT_FFMPEG_PATH/STT_FFPROBE_PATH. No cloud is used.",
  );
});
test("real WAV decoding verifies samples and returns canonical WAV", async () => {
  const result = await inspector.inspect(
    file(wav(1000), "audio/wav"),
    signal(),
  );
  assert.equal(result.durationMs, 1000);
  assert.equal(result.extension, "wav");
  assert.equal(result.buffer.readUInt32LE(40), 32000);
});
test("real streamed WebM has no required duration metadata and is normalized", async () => {
  const result = await inspector.inspect(
    file(await encode("webm"), "audio/webm;codecs=opus"),
    signal(),
  );
  assert.ok(result.durationMs >= 990 && result.durationMs < 1200);
  assert.equal(result.mimeType, "audio/wav");
});
test("real MP4/AAC recording is decoded and normalized", async () => {
  const result = await inspector.inspect(
    file(await encode("mp4"), "audio/mp4"),
    signal(),
  );
  assert.ok(result.durationMs >= 990 && result.durationMs < 1200);
  assert.equal(result.extension, "wav");
});
test("real duration above cap, digital silence and truncated audio fail closed", async () => {
  await assert.rejects(
    inspector.inspect(file(wav(2100), "audio/wav"), signal()),
    (error) => error.getResponse().code === "STT_AUDIO_TOO_LONG",
  );
  await assert.rejects(
    inspector.inspect(file(wav(1000, true), "audio/wav"), signal()),
    (error) => error.getResponse().code === "STT_NO_SPEECH",
  );
  await assert.rejects(
    inspector.inspect(file(wav(1000).subarray(0, 44), "audio/wav"), signal()),
    (error) => error.getStatus() === 422,
  );
});
test("cancelled media processing never returns audio", async () => {
  const controller = new AbortController();
  const pending = inspector.inspect(
    file(wav(1000), "audio/wav"),
    controller.signal,
  );
  controller.abort();
  await assert.rejects(
    pending,
    (error) => error.getResponse().code === "STT_CANCELLED",
  );
});
