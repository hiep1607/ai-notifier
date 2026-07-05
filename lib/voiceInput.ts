// Bản MOBILE của useVoiceInput — ghi âm bằng expo-audio → gửi Edge Function "transcribe"
// (Gemini flash-lite chép lời tiếng Việt) → trả văn bản. Cần mạng + đăng nhập.
//
// LƯU Ý: file này KHÔNG được import trên web — Metro tự chọn voiceInput.web.ts cho web
// (import expo-audio trên web làm sập bundle: AudioRecorderWeb kế thừa
// globalThis.expo.SharedObject ngay lúc import — "lỗi nội bộ" 2026-07-05).
//
// Dùng: const voice = useVoiceInput(setInput, (msg) => alertMessage("Giọng nói", msg));
//       nút mic gọi voice.start() / voice.stop(); voice.recording & voice.busy để vẽ UI.

import { useEffect, useRef, useState } from "react";
import { AudioModule, RecordingPresets, setAudioModeAsync, useAudioRecorder } from "expo-audio";
import * as FileSystem from "expo-file-system/legacy";
import { supabase } from "./supabase";

import type { VoiceInputState } from "./voiceInput.types";
export type { VoiceInputState } from "./voiceInput.types";

// Trần thời lượng 1 lượt nói — tự dừng để payload gọn + không ghi âm quên tắt.
const MAX_RECORD_MS = 60000;

export function useVoiceInput(
  onText: (text: string) => void,
  onError: (message: string) => void,
): VoiceInputState {
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stoppingRef = useRef(false); // chống bấm dừng 2 lần

  // Rời màn hình khi đang ghi → dọn timer (recorder tự giải phóng theo hook).
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const start = async () => {
    if (recording || busy) return;
    try {
      const perm = await AudioModule.requestRecordingPermissionsAsync();
      if (!perm.granted) {
        onError("Bạn chưa cho phép dùng micro. Vào cài đặt hệ thống cấp quyền micro cho app rồi thử lại.");
        return;
      }
      // iOS: không bật allowsRecording thì record() im lặng không thu gì.
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      stoppingRef.current = false;
      setRecording(true);
      timerRef.current = setTimeout(() => { void stop(); }, MAX_RECORD_MS);
    } catch (e) {
      setRecording(false);
      onError((e as Error).message);
    }
  };

  const stop = async () => {
    if (!recording || stoppingRef.current) return;
    stoppingRef.current = true;
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    setRecording(false);
    setBusy(true);
    try {
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false }); // trả loa về chế độ thường
      const uri = recorder.uri;
      if (!uri) throw new Error("Không ghi âm được — thử lại nhé.");
      const audio = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      // Preset HIGH_QUALITY ra .m4a (AAC) trên iOS/Android — Gemini nhận audio/aac.
      const mime = uri.endsWith(".wav") ? "audio/wav" : "audio/aac";
      const res = await supabase.functions.invoke("transcribe", { body: { audio, mime } });
      const errMsg = res.data?.error ?? (res.error ? "Không chuyển được giọng nói thành chữ. Thử lại nhé." : null);
      if (errMsg) throw new Error(errMsg);
      const text = String(res.data?.text ?? "").trim();
      if (!text) onError("Không nghe rõ lời nói — bạn thử nói lại gần micro hơn nhé.");
      else onText(text);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return { supported: true, recording, busy, start, stop };
}
