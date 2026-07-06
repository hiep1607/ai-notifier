// Bản MOBILE của useVoiceInput — ghi âm bằng expo-audio → gửi Edge Function "transcribe"
// (Gemini flash-lite chép lời tiếng Việt) → trả văn bản. Web dùng voiceInput.web.ts.
//
// CHỐNG SẬP TRÊN BINARY CŨ (màn trắng 2026-07-05): app cài trên máy (APK build TRƯỚC khi
// thêm expo-audio) nhận OTA JS mới nhưng binary KHÔNG có native module ExpoAudio —
// import tĩnh "expo-audio" gọi requireNativeModule('ExpoAudio') NGAY LÚC LOAD file →
// ném lỗi → cả màn tạo rule trắng xóa. Vì vậy ở đây:
//  - require LƯỜI trong try/catch: thiếu native module → supported=false (ẩn nút mic),
//    màn vẫn chạy bình thường; Expo Go / binary mới có module → mic hoạt động.
//  - KHÔNG dùng hook useAudioRecorder của expo-audio (hook phải gọi vô điều kiện →
//    lại phải import tĩnh) — tự tạo AudioRecorder và release khi rời màn.

import { useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import { requireOptionalNativeModule } from "expo-modules-core";
import { supabase } from "./supabase";

import type { VoiceInputState } from "./voiceInput.types";
export type { VoiceInputState } from "./voiceInput.types";

// Trần thời lượng 1 lượt nói — tự dừng để payload gọn + không ghi âm quên tắt.
const MAX_RECORD_MS = 60000;

type AudioMod = typeof import("expo-audio");
let audioMod: AudioMod | null | undefined; // undefined = chưa thử require

function getAudioMod(): AudioMod | null {
  if (audioMod === undefined) {
    // KHÔNG được require thẳng expo-audio để "thử": factory của nó gọi
    // requireNativeModule('ExpoAudio') — binary cũ thiếu module là THROW, và với
    // lazy-require thì metro guardedLoadModule KHÔNG ném lỗi lại cho try/catch bên
    // ngoài mà gọi thẳng ErrorUtils.reportFatalError → SẬP APP (dính 2026-07-06,
    // crash dialog trên máy user dù đã bọc try/catch). Phải DÒ TRƯỚC bằng
    // requireOptionalNativeModule (trả null, không throw) rồi mới require.
    if (!requireOptionalNativeModule("ExpoAudio")) {
      audioMod = null; // binary không có native module ExpoAudio → tắt đường mic
    } else {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        audioMod = require("expo-audio") as AudioMod;
      } catch {
        audioMod = null;
      }
    }
  }
  return audioMod;
}

// Map options ghi âm theo platform (bản sao createRecordingOptions nội bộ của expo-audio
// — hàm đó không được export; preset HIGH_QUALITY ra .m4a/AAC trên iOS + Android).
function recorderOptions(audio: AudioMod): Record<string, unknown> {
  // deno-lint không áp; any có chủ đích: preset có nhánh android/ios không cùng type.
  const p = audio.RecordingPresets.HIGH_QUALITY as Record<string, any>;
  return {
    extension: p.extension,
    sampleRate: p.sampleRate,
    numberOfChannels: p.numberOfChannels,
    bitRate: p.bitRate,
    isMeteringEnabled: p.isMeteringEnabled ?? false,
    ...(Platform.OS === "ios" ? p.ios : p.android),
  };
}

export function useVoiceInput(
  onText: (text: string) => void,
  onError: (message: string) => void,
): VoiceInputState {
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const recorderRef = useRef<any>(null); // AudioRecorder native (SharedObject)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stoppingRef = useRef(false);     // chống bấm dừng 2 lần

  const supported = getAudioMod() !== null;

  // Rời màn hình → dọn timer + giải phóng recorder native.
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      try { recorderRef.current?.release?.(); } catch { /* đã giải phóng */ }
    };
  }, []);

  const start = async () => {
    if (recording || busy) return;
    const audio = getAudioMod();
    if (!audio) {
      onError("Bản cài đặt này chưa hỗ trợ ghi âm (cần bản build mới của app). Bạn gõ tay giúp nhé.");
      return;
    }
    try {
      const perm = await audio.AudioModule.requestRecordingPermissionsAsync();
      if (!perm.granted) {
        onError("Bạn chưa cho phép dùng micro. Vào cài đặt hệ thống cấp quyền micro cho app rồi thử lại.");
        return;
      }
      // iOS: không bật allowsRecording thì record() im lặng không thu gì.
      await audio.setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      if (!recorderRef.current) {
        recorderRef.current = new (audio.AudioModule as any).AudioRecorder(recorderOptions(audio));
      }
      await recorderRef.current.prepareToRecordAsync();
      recorderRef.current.record();
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
      const audio = getAudioMod();
      await recorderRef.current?.stop();
      await audio?.setAudioModeAsync({ allowsRecording: false }); // trả loa về chế độ thường
      const uri: string | null = recorderRef.current?.uri ?? null;
      if (!uri) throw new Error("Không ghi âm được — thử lại nhé.");
      // expo-file-system cũng dò-trước rồi mới require lười (lý do như getAudioMod:
      // require module thiếu native = reportFatalError sập app, try/catch vô dụng).
      if (!requireOptionalNativeModule("ExponentFileSystem")) {
        throw new Error("Bản cài đặt này chưa hỗ trợ đọc file ghi âm (cần bản build mới của app).");
      }
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const FileSystem = require("expo-file-system/legacy");
      const audioB64: string = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      // Preset HIGH_QUALITY ra .m4a (AAC) trên iOS/Android — Gemini nhận audio/aac.
      const mime = uri.endsWith(".wav") ? "audio/wav" : "audio/aac";
      const res = await supabase.functions.invoke("transcribe", { body: { audio: audioB64, mime } });
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

  return { supported, recording, busy, start, stop };
}
