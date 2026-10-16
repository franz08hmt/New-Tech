import { speechError } from "./speech.types.js";

/** Convert the inspector's canonical mono 16 kHz signed PCM WAV for Whisper. */
export function wavToFloat32(wav: Buffer) {
  if (
    wav.length < 44 ||
    wav.subarray(0, 4).toString("ascii") !== "RIFF" ||
    wav.subarray(8, 12).toString("ascii") !== "WAVE" ||
    wav.subarray(12, 16).toString("ascii") !== "fmt " ||
    wav.readUInt32LE(16) !== 16 ||
    wav.readUInt16LE(20) !== 1 ||
    wav.readUInt16LE(22) !== 1 ||
    wav.readUInt32LE(24) !== 16000 ||
    wav.readUInt16LE(32) !== 2 ||
    wav.readUInt16LE(34) !== 16 ||
    wav.subarray(36, 40).toString("ascii") !== "data" ||
    wav.readUInt32LE(40) !== wav.length - 44 ||
    (wav.length - 44) % 2 !== 0
  )
    speechError(
      422,
      "STT_INVALID_AUDIO",
      "Audio không đúng định dạng PCM chuẩn để nhận dạng.",
    );

  const count = (wav.length - 44) / 2;
  const samples = new Float32Array(count);
  for (let index = 0; index < count; index++)
    samples[index] = wav.readInt16LE(44 + index * 2) / 32768;
  return samples;
}
