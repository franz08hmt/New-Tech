import { useCallback, useEffect, useRef, useState } from "react";
import type { SpeechLanguage, SpeechStatusResponse } from "@examate/contracts";
import { api } from "./api";

export type SpeechInputStatus =
  | "idle"
  | "requesting_permission"
  | "recording"
  | "stopping"
  | "transcribing"
  | "ready"
  | "error";
export function useSpeechInput(
  active: boolean,
  scope: string,
  language: SpeechLanguage = "auto",
) {
  const [status, setStatus] = useState<SpeechInputStatus>("idle");
  const [availability, setAvailability] = useState<SpeechStatusResponse | null>(
    null,
  );
  const [availabilityMessage, setAvailabilityMessage] = useState("");
  const [error, setError] = useState("");
  const [transcript, setTranscript] = useState("");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [revision, setRevision] = useState(0);
  const generation = useRef(0);
  const state = useRef<SpeechInputStatus>("idle");
  const text = useRef("");
  const resources = useRef<{
    stream?: MediaStream;
    recorder?: MediaRecorder;
    abort?: AbortController;
    interval?: ReturnType<typeof setInterval>;
    deadline?: ReturnType<typeof setTimeout>;
  }>({});
  const current = useRef({ active, scope, availability, language });
  current.current = { active, scope, availability, language };

  const transition = useCallback((next: SpeechInputStatus) => {
    state.current = next;
    setStatus(next);
  }, []);
  const dispose = useCallback(() => {
    const old = resources.current;
    resources.current = {};
    clearInterval(old.interval);
    clearTimeout(old.deadline);
    old.abort?.abort();
    if (old.recorder) {
      old.recorder.ondataavailable = null;
      old.recorder.onstop = null;
      old.recorder.onerror = null;
      if (old.recorder.state !== "inactive") {
        try {
          old.recorder.stop();
        } catch {
          /* Already stopped by browser. */
        }
      }
    }
    old.stream?.getTracks().forEach((track) => track.stop());
  }, []);
  const reset = useCallback(() => {
    generation.current++;
    dispose();
    state.current = "idle";
    text.current = "";
  }, [dispose]);
  const cancel = useCallback(() => {
    reset();
    setStatus("idle");
    setTranscript("");
    setError("");
    setElapsedMs(0);
  }, [reset]);

  useEffect(() => {
    cancel();
    return reset;
  }, [active, scope, cancel, reset]);

  useEffect(() => {
    setAvailability(null);
    if (!active) return;
    if (
      window.isSecureContext === false ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      setAvailabilityMessage(
        "Trình duyệt chưa hỗ trợ ghi âm ở trang này. Bạn vẫn có thể nhập câu hỏi bằng bàn phím.",
      );
      return;
    }
    const controller = new AbortController();
    let pollTimer: ReturnType<typeof setTimeout> | undefined;
    setAvailabilityMessage("Đang kiểm tra nhập bằng giọng nói…");
    const checkAvailability = () => {
      void api
        .speechStatus(controller.signal)
        .then((result) => {
          if (controller.signal.aborted) return;
          setAvailability(result);
          const message = {
            ready:
              "Model Whisper local đã sẵn sàng. Bạn kiểm tra bản chép trước khi gửi câu hỏi.",
            loading:
              "Đang nạp model Whisper local. Quá trình này chỉ cần chờ lần đầu…",
            model_missing:
              "Chưa có file model Whisper. Hãy chuẩn bị model local trước khi ghi âm.",
            model_error:
              "Không nạp được model Whisper local. Kiểm tra cài đặt rồi thử kiểm tra lại.",
            media_unavailable:
              "Thiếu ffmpeg hoặc ffprobe để xử lý audio trên máy chủ.",
            not_configured: "Nhập bằng giọng nói chưa được bật.",
          } as const;
          setAvailabilityMessage(message[result.status]);
          if (result.status === "loading")
            pollTimer = setTimeout(checkAvailability, 1000);
        })
        .catch(() => {
          if (!controller.signal.aborted)
            setAvailabilityMessage(
              "Chưa kết nối được dịch vụ ghi âm. Bạn vẫn có thể nhập câu hỏi bằng bàn phím.",
            );
        });
    };
    checkAvailability();
    return () => {
      controller.abort();
      clearTimeout(pollTimer);
    };
  }, [active, scope, revision]);

  const fail = useCallback(
    (message: string) => {
      generation.current++;
      dispose();
      text.current = "";
      setTranscript("");
      setError(message);
      transition("error");
    },
    [dispose, transition],
  );

  const stop = useCallback(() => {
    if (state.current !== "recording") return;
    transition("stopping");
    clearInterval(resources.current.interval);
    clearTimeout(resources.current.deadline);
    // A browser that never emits stop must not keep the microphone open.
    resources.current.deadline = setTimeout(
      () => fail("Chưa hoàn tất bản ghi. Hãy thử lại."),
      5000,
    );
    try {
      resources.current.recorder?.stop();
    } catch {
      fail("Không dừng được bản ghi. Hãy thử lại.");
    }
  }, [transition, fail]);

  const start = useCallback(async () => {
    const settings = current.current;
    if (
      !settings.active ||
      settings.availability?.status !== "ready" ||
      !["idle", "error", "ready"].includes(state.current)
    )
      return;
    cancel();
    const token = generation.current;
    const scopeAtStart = settings.scope;
    const selectedLanguage = settings.language;
    const valid = () =>
      generation.current === token &&
      current.current.active &&
      current.current.scope === scopeAtStart;
    transition("requesting_permission");
    resources.current.deadline = setTimeout(() => {
      if (valid())
        fail(
          "Chưa nhận được quyền microphone. Hãy kiểm tra quyền của trình duyệt và thử lại.",
        );
    }, 30000);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      if (!valid()) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      clearTimeout(resources.current.deadline);
      resources.current.stream = stream;
      const mimeType = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/mp4",
        "audio/wav",
      ].find(
        (mime) =>
          settings.availability!.supportedMimeTypes.includes(
            mime.split(";")[0],
          ) && MediaRecorder.isTypeSupported(mime),
      );
      if (!mimeType) {
        fail(
          "Trình duyệt không có định dạng ghi âm phù hợp. Bạn có thể nhập bằng bàn phím.",
        );
        return;
      }
      const recorder = new MediaRecorder(stream, {
        mimeType,
        audioBitsPerSecond: 64000,
      });
      resources.current.recorder = recorder;
      const chunks: Blob[] = [];
      let bytes = 0;
      let submitted = false;
      recorder.ondataavailable = (event) => {
        if (!valid()) return;
        bytes += event.data.size;
        if (bytes > settings.availability!.maxAudioBytes) {
          fail("Bản ghi quá lớn. Hãy ghi âm ngắn hơn.");
          return;
        }
        if (event.data.size) chunks.push(event.data);
      };
      recorder.onerror = () => {
        if (valid())
          fail("Microphone gặp lỗi. Hãy kiểm tra thiết bị và thử lại.");
      };
      recorder.onstop = () => {
        if (!valid() || submitted) return;
        // Unexpected device loss must not submit a partial recording.
        if (state.current !== "stopping") {
          fail("Ghi âm bị gián đoạn. Hãy thử lại.");
          return;
        }
        submitted = true;
        clearInterval(resources.current.interval);
        clearTimeout(resources.current.deadline);
        stream.getTracks().forEach((track) => track.stop());
        resources.current.stream = undefined;
        recorder.ondataavailable = null;
        recorder.onstop = null;
        recorder.onerror = null;
        resources.current.recorder = undefined;
        const audio = new Blob(chunks, {
          type: recorder.mimeType || mimeType,
        });
        chunks.length = 0;
        if (!audio.size) {
          fail("Bản ghi rỗng. Hãy nói và ghi âm lại.");
          return;
        }
        const controller = new AbortController();
        resources.current.abort = controller;
        transition("transcribing");
        void api
          .transcribeSpeech(audio, controller.signal, selectedLanguage)
          .then((result) => {
            if (!valid()) return;
            if (
              typeof result.text !== "string" ||
              !result.text.trim() ||
              result.text.length > 16000
            ) {
              fail("Chưa nhận được bản chép hợp lệ. Hãy thử lại.");
              return;
            }
            text.current = result.text.trim();
            setTranscript(text.current);
            resources.current.abort = undefined;
            transition("ready");
          })
          .catch((reason: unknown) => {
            if (valid() && !controller.signal.aborted)
              fail(
                reason instanceof Error
                  ? reason.message
                  : "Chưa chuyển được audio thành chữ. Hãy thử lại.",
              );
          });
      };
      const started = Date.now();
      transition("recording");
      recorder.start(250);
      resources.current.interval = setInterval(() => {
        if (!valid()) return;
        const elapsed = Date.now() - started;
        setElapsedMs(Math.min(elapsed, settings.availability!.maxDurationMs));
        if (elapsed >= settings.availability!.maxDurationMs) stop();
      }, 200);
      // Stop slightly before the server cap to allow encoder frame padding.
      resources.current.deadline = setTimeout(
        stop,
        Math.max(1, settings.availability.maxDurationMs - 500),
      );
    } catch (reason) {
      if (!valid()) return;
      const name = reason instanceof DOMException ? reason.name : "";
      fail(
        name === "NotAllowedError"
          ? "Quyền microphone bị từ chối. Hãy cấp quyền trong trình duyệt để ghi âm."
          : name === "NotFoundError"
            ? "Không tìm thấy microphone. Hãy kiểm tra thiết bị."
            : name === "NotReadableError"
              ? "Microphone đang bận hoặc không truy cập được."
              : "Không bắt đầu được ghi âm. Hãy thử lại.",
      );
    }
  }, [cancel, transition, fail, stop]);

  const editTranscript = useCallback((value: string) => {
    if (state.current === "ready") {
      text.current = value;
      setTranscript(value);
    }
  }, []);
  const takeTranscript = useCallback(() => {
    if (state.current !== "ready" || !text.current.trim()) return "";
    const value = text.current.trim();
    cancel();
    return value;
  }, [cancel]);

  return {
    status,
    availability,
    availabilityMessage,
    error,
    transcript,
    elapsedMs,
    start,
    stop,
    cancel,
    editTranscript,
    takeTranscript,
    retryAvailability: () => setRevision((value) => value + 1),
  };
}
